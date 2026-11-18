/*
 * 내장 AI의 구독 CLI 실행(spec/architecture.md#F-ARC-007): 사람이 연결한 공식 CLI(Claude, ChatGPT·Codex, Gemini)를 대화 한 번마다 한 번 띄운다.
 *   providers(connected) -> [{ id, label, icon, models: [{ id, label }] }]  연결한 CLI만. 모델 목록은 CLI가 알려 주면 그것(codex debug models), 아니면 CLI의 모델 별칭
 *   complete({ provider, model, system, prompt, list, call, signal, onText }) -> { text, usage }  실패는 { kind, cause, detail }을 단 오류.
 *     onText(조각): 모델이 쓰는 대로 글 조각(Claude는 부분 메시지, Gemini는 delta, Codex는 메시지 하나씩). 메시지가 바뀌면 빈 줄 하나를 앞에 붙인다
 * 실행 모양(세 CLI 같음):
 *   - 비대화 한 번(print/exec/headless), 출력은 줄마다 JSON 사건 하나(stream-json, --json). 프롬프트는 표준 입력으로(명령 줄에 질문이 남지 않음)
 *   - 작업 폴더는 비어 있는 임시 폴더, 설정 파일은 그 옆 임시 폴더(0700)에. 끝나면 둘 다 지운다. 세션 기록을 남기지 않는 CLI 옵션을 켠다
 *   - CLI 자체 도구(셸, 파일 읽기·쓰기, 웹)는 모두 끈다. 쓸 수 있는 도구는 Wake 도구뿐: 이 실행에만 여는 127.0.0.1 MCP 끝점(무작위 토큰)을
 *     CLI의 HTTP MCP(Streamable HTTP, Authorization: Bearer)로 건넨다. Electron을 Node로 띄우는 다리는 쓰지 않는다(RunAsNode 퓨즈 꺼짐).
 *     토큰은 명령 줄에 두지 않는다: Claude는 --mcp-config 파일(0600), Gemini는 작업 폴더 설정(0600), Codex는 bearer_token_env_var 환경 변수.
 *     도구 호출은 call(name, args)로 와서 API 키 길과 같은 도구 층·승인·감사를 지난다
 *   - 띄우기 전에 그 CLI를 확인한다(probe): 지원 버전(SUPPORTED)과 Wake가 기대는 격리 옵션이 그 CLI의 --help에 모두 있는지, Codex는 끄는 기능이
 *     features list에 모두 있는지. 하나라도 없으면 실행하지 않고 그 이유로 실패한다(실행 파일·수정 시각마다 한 번 확인)
 *   - CLI에는 허용 목록의 환경 변수만 넘긴다(ENV_ALLOW: 홈·로캘·터미널·프록시·인증서와 그 CLI의 로그인 변수). KUBECONFIG·NODE_OPTIONS·클라우드 자격은 넘기지 않는다
 *   - 앱 종료: stopAllRuns()가 돌고 있는 모든 CLI 프로세스 묶음을 끝낸다(프로세스 'exit'에도 걸어 둠)
 *   - 사용자·프로젝트 설정, 메모리 파일(CLAUDE.md, GEMINI.md), 다른 MCP 서버는 읽지 않게 한다(CLI가 허용하는 만큼)
 *   - 취소(signal)와 시간 초과는 CLI 프로세스 묶음을 끝낸다(SIGTERM, 2초 뒤 SIGKILL)
 * 오류 원인: notInstalled(명령 없음), loginNeeded(로그인 안 됨), quota(사용 한도), timeout, cancelled, unknown. detail은 CLI가 말한 원문(가리기 전)
 */
const { spawn: spawnChild, execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const readline = require('node:readline');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { mcpMessage, readBody, HOST } = require('./hub-server.cjs');
const { findCommand, execPath } = require('./k8s.cjs');

const TIMEOUT = 300_000;
const TOOL_CALLS = 24; /* 한 번의 실행에서 Wake 도구를 부르는 최대 횟수(API 키 길의 최대 8회 반복과 같은 크기) */
const QUESTION = 'Answer the request given on standard input.';

/* CLI 자체 도구를 끄는 Codex 기능 이름(codex features list): 셸, 패치, 웹·브라우저, 화면, 하위 에이전트, 메모리, 플러그인 */
const CODEX_OFF = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'multi_agent', 'view_image', 'image_generation', 'browser_use', 'computer_use', 'memories', 'hooks', 'goals', 'sleep_tool', 'tool_suggest', 'skill_search', 'in_app_browser'];
const toml = v => JSON.stringify(v); /* JSON 글자열·배열은 TOML 값으로도 같은 뜻 */
/* Gemini 기본 도구 이름(0.61.0 번들의 *_TOOL_NAME): tools.exclude로도 끈다 */
const GEMINI_BUILT_IN = ['run_shell_command', 'read_file', 'read_many_files', 'write_file', 'replace', 'glob', 'grep_search', 'list_directory', 'web_fetch', 'google_web_search',
  'save_memory', 'activate_skill', 'invoke_agent', 'ask_user', 'write_todos', 'enter_plan_mode', 'exit_plan_mode', 'update_topic', 'read_mcp_resource', 'list_mcp_resources',
  'list_background_processes', 'read_background_output', 'get_internal_docs', 'complete_task', 'take_snapshot',
  'tracker_create_task', 'tracker_update_task', 'tracker_get_task', 'tracker_list_tasks', 'tracker_add_dependency', 'tracker_visualize'];
/* 지원 버전(확인한 버전부터 다음 주 버전 전까지). 확인한 CLI: claude 2.1.323, codex-cli 0.166.0, gemini 0.61.0(2026-11-18, 이 Mac의 --help와 번들) */
const SUPPORTED = { claude: ['2.1.300', '3.0.0'], codex: ['0.166.0', '1.0.0'], gemini: ['0.61.0', '1.0.0'] };
/* 모든 CLI에 넘기는 환경 변수(그 CLI의 로그인 변수는 CLIS[id].env). LC_*는 앞부분으로 */
const ENV_ALLOW = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TERM', 'TZ', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'ALL_PROXY', 'all_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR'];

const CLIS = {
  'claude-cli': {
    command: 'claude', label: 'Claude', icon: 'brand-claude',
    models: [{ id: 'haiku', label: 'Haiku' }, { id: 'sonnet', label: 'Sonnet' }, { id: 'opus', label: 'Opus' }], /* CLI의 모델 별칭(claude --model) */
    launch: ({ model, system, server, conf }) => {
      const config = path.join(conf, 'mcp.json');
      write(config, JSON.stringify({ mcpServers: { wake: { type: 'http', url: server.url, headers: { Authorization: `Bearer ${server.token}` } } } }));
      return { args: ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', model, '--system-prompt', system, '--tools', '', '--mcp-config', config, '--strict-mcp-config',
        '--allowedTools', 'mcp__wake', '--setting-sources', '', '--no-session-persistence', '--disable-slash-commands'],
      env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } };
    },
    help: [['--help']],
    flags: ['--print', '--output-format', '--verbose', '--include-partial-messages', '--model', '--system-prompt', '--tools', '--mcp-config', '--strict-mcp-config', '--allowedTools', '--setting-sources', '--no-session-persistence', '--disable-slash-commands'],
    env: ['CLAUDE_CONFIG_DIR', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
    /* system(init) → stream_event(message_start, text_delta …) → assistant(그 메시지 전체) → user(tool_result) → result. 글은 조각으로 보내고 전체 메시지는 조각이 없을 때만 */
    read(ev, st) {
      if (ev.type === 'system' && ev.subtype === 'init') { const w = (ev.mcp_servers ?? []).find(s => s.name === 'wake'); if (w && w.status !== 'connected') st.error ??= `wake tools: ${w.status}`; }
      if (ev.type === 'stream_event' && ev.event?.type === 'message_start') { st.begin(); st.streamed = false; }
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta' && ev.event.delta.text) { st.streamed = true; st.say(ev.event.delta.text); }
      if (ev.type === 'assistant') { if (!st.streamed) { st.begin(); for (const c of ev.message?.content ?? []) if (c.type === 'text' && c.text) st.say(c.text); } st.streamed = false; }
      if (ev.type === 'result') {
        st.usage = (ev.usage?.input_tokens ?? 0) + (ev.usage?.output_tokens ?? 0) + (ev.usage?.cache_read_input_tokens ?? 0) + (ev.usage?.cache_creation_input_tokens ?? 0);
        if (ev.is_error || ev.subtype !== 'success') st.error = String(ev.result || ev.errors?.join?.('; ') || ev.subtype || 'error');
        st.done = true;
      }
    },
  },
  'codex-cli': {
    command: 'codex', label: 'ChatGPT · Codex', icon: 'brand-openai',
    /* 모델 목록은 CLI가 아는 것 중 목록에 보이는 것(codex debug models) */
    list: (bin, env) => new Promise(resolve => execFile(bin, ['debug', 'models'], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024, env }, (error, out) => {
      try { resolve(error ? [] : (JSON.parse(out).models ?? []).filter(m => m.visibility === 'list' && typeof m.slug === 'string').map(m => ({ id: m.slug, label: String(m.display_name || m.slug) }))); } catch { resolve([]); }
    })),
    launch: ({ model, system, server, work }) => ({
      args: ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--sandbox', 'read-only', '--cd', work, '--model', model,
        '-c', 'approval_policy="never"', '-c', 'web_search="disabled"', '-c', `developer_instructions=${toml(system)}`,
        ...CODEX_OFF.flatMap(f => ['--disable', f]),
        '-c', `mcp_servers.wake.url=${toml(server.url)}`, '-c', 'mcp_servers.wake.bearer_token_env_var="WAKE_MCP_TOKEN"',
        '-c', 'mcp_servers.wake.default_tools_approval_mode="approve"', '-'],
      env: { WAKE_MCP_TOKEN: server.token } }),
    help: [['exec', '--help']],
    flags: ['--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--sandbox', '--cd', '--model', '--disable', '--config'],
    features: CODEX_OFF,
    env: ['CODEX_HOME', 'OPENAI_API_KEY', 'OPENAI_BASE_URL'],
    /* thread.started → item.completed(agent_message, mcp_tool_call) → turn.completed(usage) | turn.failed | error */
    read(ev, st) {
      if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) { st.begin(); st.say(ev.item.text); }
      if (ev.type === 'item.completed' && ev.item?.type === 'error' && ev.item.message) st.note = ev.item.message;
      if (ev.type === 'turn.completed') { st.usage += (ev.usage?.input_tokens ?? 0) + (ev.usage?.output_tokens ?? 0); st.done = true; }
      if (ev.type === 'turn.failed') { st.error = String(ev.error?.message ?? 'turn failed'); st.done = true; }
      if (ev.type === 'error') st.error = String(ev.message ?? 'error');
    },
  },
  'gemini-cli': {
    command: 'gemini', label: 'Gemini', icon: 'brand-googlegemini',
    models: [{ id: 'flash-lite', label: 'Flash-Lite' }, { id: 'flash', label: 'Flash' }, { id: 'pro', label: 'Pro' }], /* CLI의 모델 별칭(gemini -m) */
    launch: ({ model, system, server, work, conf }) => {
      /* 작업 폴더 설정(.gemini/settings.json, 사용자 설정보다 우선. 시스템 설정 파일은 root 소유가 아니면 CLI가 읽지 않음): 기본 도구 없음
         (tools.core 빈 목록: 0.61.0은 빈 목록이면 기본 도구를 하나도 등록하지 않음. 뜻이 바뀌어도 막히게 기본 도구 이름 전부를 exclude에도),
         Wake MCP 하나(HTTP, 신뢰: 비대화 실행에서 확인을 묻지 않음), 메모리 파일 이름은 없는 이름. 작업 폴더에는 이 설정 폴더 하나만 있다 */
      const dir = path.join(work, '.gemini'), settings = path.join(dir, 'settings.json'), prompt = path.join(conf, 'system.md');
      fs.mkdirSync(dir, { mode: 0o700 });
      write(settings, JSON.stringify({ tools: { core: [], exclude: GEMINI_BUILT_IN }, mcpServers: { wake: { httpUrl: server.url, headers: { Authorization: `Bearer ${server.token}` }, trust: true } },
        context: { fileName: 'WAKE-NO-MEMORY.md' }, general: { checkpointing: { enabled: false } } }));
      write(prompt, system);
      return { args: ['-p', QUESTION, '--output-format', 'stream-json', '--model', model, '--skip-trust', '--allowed-mcp-server-names', 'wake', '--extensions', 'none'],
        env: { GEMINI_SYSTEM_MD: prompt } };
    },
    help: [['--help']],
    flags: ['--prompt', '--output-format', '--model', '--skip-trust', '--allowed-mcp-server-names', '--extensions'],
    env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_GENAI_USE_VERTEXAI', 'GOOGLE_APPLICATION_CREDENTIALS', 'GEMINI_CLI_HOME'],
    /* init → message(assistant, delta) → tool_use → tool_result → result(status, stats) | error */
    read(ev, st) {
      if (ev.type === 'message' && ev.role === 'assistant' && ev.content) st.say(ev.content);
      if (ev.type === 'tool_use') st.begin();
      if (ev.type === 'error' && ev.severity !== 'warning') st.note = String(ev.message ?? '');
      if (ev.type === 'result') {
        st.usage = (ev.stats?.input_tokens ?? 0) + (ev.stats?.output_tokens ?? 0) || (ev.stats?.total_tokens ?? 0);
        if (ev.status !== 'success') st.error = String(ev.error?.message ?? st.note ?? 'error');
        st.done = true;
      }
    },
  },
};

function write(file, text) { fs.writeFileSync(file, text, { mode: 0o600 }); }

/* CLI가 말한 원문 -> 원인 */
const CAUSES = [
  [/usage limit|hit your limit|limit reached|rate.?limit|quota|RESOURCE_EXHAUSTED|\b429\b|too many requests|credit balance/i, 'quota'],
  [/not logged in|please run \/login|\/login|log ?in again|login required|not authenticated|unauthori[sz]ed|\b401\b|invalid api key|auth method|OAuth|credentials/i, 'loginNeeded'],
];
const failure = (cause, detail) => Object.assign(new Error(String(detail || cause)), { cli: true, cause, detail: String(detail || '').slice(0, 2000) });
const classify = detail => failure(CAUSES.find(([re]) => re.test(detail))?.[1] ?? 'unknown', detail);

/** 이 실행에만 여는 MCP 끝점(127.0.0.1, 임의 포트, 무작위 토큰). 도구 목록은 list(), 호출은 call(name, args) */
async function openBridge({ list, call }) {
  const token = randomBytes(24).toString('base64url'), want = Buffer.from(`Bearer ${token}`);
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const server = http.createServer((req, res) => {
    const got = Buffer.from(String(req.headers.authorization ?? ''));
    if (req.headers.origin || req.url !== '/mcp') return send(res, 404, { error: 'not_found' });
    if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); } /* Streamable HTTP: 서버가 여는 SSE 흐름 없음 */
    if (got.length !== want.length || !timingSafeEqual(got, want)) return send(res, 401, { error: 'unauthorized' });
    readBody(req).then(async body => {
      const out = Array.isArray(body) ? (await Promise.all(body.map(m => mcpMessage(m, { list, call })))).filter(Boolean) : await mcpMessage(body, { list, call });
      return out && (!Array.isArray(out) || out.length) ? send(res, 200, out) : send(res, 202);
    }).catch(error => send(res, error.status ?? 500, { error: 'failed' }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, HOST, resolve); });
  return { url: `http://${HOST}:${server.address().port}/mcp`, token, close: () => { server.close(); server.closeAllConnections?.(); } };
}

/* 돌고 있는 CLI 실행(모든 실행기): 앱 종료 때 stopAllRuns()가 끝낸다 */
const live = new Set();
/** 돌고 있는 모든 CLI 프로세스 묶음을 끝낸다(SIGKILL, 분리된 묶음이라 자식까지). 끝낸 수 */
function stopAllRuns() {
  let n = 0;
  for (const run of live) { run.stop('cancelled', 'SIGKILL'); n++; }
  live.clear();
  return n;
}
process.once('exit', stopAllRuns);

const semver = text => { const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(text)); return m ? m.slice(1).map(Number) : null; };
const below = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const hasFlag = (help, flag) => new RegExp(`(^|[\\s,])${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,=<\\[]|$)`, 'm').test(help);

/** @param {{ find?(command) -> path|null, env?, passEnv?: string[], tmp?, spawn?, run?(bin, args, env) -> Promise<string>, timeout? }} deps
 *  passEnv: 허용 목록 밖에서 더 넘길 변수 이름(시험용) */
function createCliRunner({ find = command => findCommand(command, { ...process.env, PATH: execPath() }), env = process.env, passEnv = [], tmp = os.tmpdir(), spawn = spawnChild, timeout = TIMEOUT,
  run = (bin, args, childEnv) => new Promise((resolve, reject) => execFile(bin, args, { timeout: 10_000, maxBuffer: 4 * 1024 * 1024, env: childEnv }, (error, out) => (error ? reject(error) : resolve(String(out))))) } = {}) {
  const owns = provider => Object.hasOwn(CLIS, provider);
  /* 그 CLI에 넘길 환경: 허용 목록 + LC_* + 그 CLI의 로그인 변수 + PATH */
  const envFor = def => {
    const keep = new Set([...ENV_ALLOW, ...(def.env ?? []), ...passEnv]);
    const out = Object.fromEntries(Object.entries(env).filter(([k, v]) => typeof v === 'string' && (keep.has(k) || k.startsWith('LC_'))));
    out.PATH = execPath(env);
    return out;
  };
  /* 띄우기 전 확인: 지원 버전·격리 옵션·끄는 기능. 문제가 없으면 null, 있으면 { cause: cliVersion(지원 범위 밖·버전 모름) | cliIncompatible(격리 옵션·끄는 기능 없음), detail }(실행 파일·수정 시각마다 한 번) */
  const version = detail => ({ cause: 'cliVersion', detail }), flags = detail => ({ cause: 'cliIncompatible', detail });
  const probes = new Map();
  function probe(def, bin) {
    let stamp = 0; try { stamp = fs.statSync(bin).mtimeMs; } catch { /* 없음: 아래에서 실패 */ }
    const key = `${bin}:${stamp}`;
    if (!probes.has(key)) probes.set(key, (async () => {
      const childEnv = envFor(def), [min, max] = SUPPORTED[def.command];
      const v = semver(await run(bin, ['--version'], childEnv).catch(() => ''));
      if (!v) return version(`${def.command} version unknown (Wake supports ${def.command} >= ${min} < ${max})`);
      const shown = v.join('.');
      if (below(v, semver(min)) || !below(v, semver(max))) return version(`${def.command} ${shown} is not supported (Wake supports ${def.command} >= ${min} < ${max})`);
      for (const args of def.help) {
        const help = await run(bin, args, childEnv).catch(() => null);
        if (help === null) return flags(`${def.command} ${shown}: could not read \`${def.command} ${args.join(' ')}\``);
        const missing = def.flags.find(f => !hasFlag(help, f));
        if (missing) return flags(`${def.command} ${shown}: required flag ${missing} is missing from \`${def.command} ${args.join(' ')}\``);
      }
      if (def.features) {
        const list = await run(bin, ['features', 'list'], childEnv).catch(() => '');
        const names = new Set(list.split('\n').map(l => l.trim().split(/\s+/)[0]).filter(Boolean));
        const gone = def.features.find(f => !names.has(f));
        if (gone) return flags(`${def.command} ${shown}: built-in feature ${gone} that Wake turns off is missing from \`codex features list\``);
      }
      return null;
    })());
    return probes.get(key);
  }
  const listed = new Map(); /* CLI가 알려 준 모델 목록(1분) */
  async function models(id) {
    const def = CLIS[id];
    if (def.models) return def.models;
    const bin = find(def.command);
    if (!bin) return [];
    const hit = listed.get(id);
    if (hit && Date.now() - hit.at < 60_000) return hit.models;
    const got = await def.list(bin, envFor(def));
    listed.set(id, { at: Date.now(), models: got });
    return got;
  }
  /** connected(id) -> 사람이 연결한 CLI인가(연결 기록). 명령이 없거나 모델이 없으면 목록에 넣지 않는다 */
  async function providers(connected) {
    const out = [];
    for (const [id, def] of Object.entries(CLIS)) {
      if (!connected(id) || !find(def.command)) continue;
      const list = await models(id).catch(() => []);
      if (list.length) out.push({ id, label: def.label, icon: def.icon, models: list });
    }
    return out;
  }

  async function complete({ provider, model, system, prompt, list, call, signal, onText = () => {} }) {
    const def = CLIS[provider];
    if (!def) throw failure('unknown', `unknown provider ${provider}`);
    const bin = find(def.command);
    if (!bin) throw failure('notInstalled', `${def.command}: command not found`);
    if (signal?.aborted) throw failure('cancelled', 'cancelled');
    const refused = await probe(def, bin);
    if (refused) throw failure(refused.cause, refused.detail);
    if (signal?.aborted) throw failure('cancelled', 'cancelled');
    const base = fs.mkdtempSync(path.join(tmp, 'wake-ai-')), work = path.join(base, 'work'), conf = path.join(base, 'conf');
    fs.mkdirSync(work, { mode: 0o700 }); fs.mkdirSync(conf, { mode: 0o700 });
    let calls = 0;
    const bridge = await openBridge({ list, call: (name, args) => (++calls > TOOL_CALLS ? { error: 'invalid_request', message: 'tool call budget exhausted' } : call(name, args)) });
    try {
      const server = { url: bridge.url, token: bridge.token };
      const launched = def.launch({ model, system, server, work, conf });
      const childEnv = { ...envFor(def), ...launched.env };
      return await new Promise((resolve, reject) => {
        const child = spawn(bin, launched.args, { cwd: work, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
        let stopped = null, stderr = '', answer = '', gap = false;
        /* begin(): 새 메시지(다음 조각 앞에 빈 줄), say(조각): 쓴 대로 바로 */
        const st = { usage: 0, error: null, note: null, done: false, streamed: false,
          begin: () => { gap = answer.length > 0; }, say: t => { if (gap) { t = '\n\n' + t; gap = false; } answer += t; onText(t); } };
        const kill = sig => { try { if (child.pid) process.kill(process.platform === 'win32' ? child.pid : -child.pid, sig); } catch { try { child.kill(sig); } catch { /* 이미 끝남 */ } } };
        const stop = (cause, sig = 'SIGTERM') => { if (stopped && sig === 'SIGTERM') return; stopped ??= cause; kill(sig); if (sig === 'SIGTERM') setTimeout(() => kill('SIGKILL'), 2000).unref(); };
        const entry = { stop };
        live.add(entry);
        const onAbort = () => stop('cancelled');
        signal?.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => stop('timeout'), timeout); timer.unref?.();
        readline.createInterface({ input: child.stdout }).on('line', line => {
          let ev; try { ev = JSON.parse(line); } catch { return; }
          try { def.read(ev, st); } catch { /* 모르는 사건 모양: 건너뜀 */ }
        });
        child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
        child.on('error', error => { live.delete(entry); stopped ??= 'spawn'; clearTimeout(timer); reject(error.code === 'ENOENT' ? failure('notInstalled', `${def.command}: ${error.message}`) : classify(error.message)); });
        child.on('close', code => {
          live.delete(entry);
          clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
          if (stopped === 'spawn') return;
          const text = answer;
          if (stopped) return reject(Object.assign(failure(stopped, ''), { text })); /* 멈춤·시간 초과는 원인 글만(CLI 원문 없음) */
          const detail = st.error ?? (code !== 0 || !st.done ? st.note || stderr.trim() || `exit ${code}` : null);
          if (detail) return reject(Object.assign(classify(detail), { text }));
          resolve({ text, usage: st.usage });
        });
        child.stdin.on('error', () => {});
        child.stdin.end(prompt);
      });
    } finally {
      bridge.close();
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
  return { owns, providers, complete };
}

module.exports = { createCliRunner, openBridge, stopAllRuns, SUPPORTED };
