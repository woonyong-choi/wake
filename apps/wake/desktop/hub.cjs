/*
 * 데스크톱 허브(spec/architecture.md#F-ARC-001)의 인시던트·AI 쪽을 한곳에서 엮는다: 로컬 저장소(hub-store), 출처(reads/cluster.cjs: 화면 읽기와 같은 도구 질의·출처 상태), 인시던트(incident-hub),
 * 승인(approvals), 도구 층(hub-tools), 외부 AI 서버(hub-server: MCP·HTTP API), 내장 AI(ai-run). services.cjs는 이 객체의 함수를 이름만 붙여 등록한다.
 * 화면의 읽기(incident.list, incident.workspace, audit.query)는 같은 도구 함수를 부르되 감사 기록을 남기지 않는다(사람이 화면을 연 것은 도구 호출이 아님).
 * 화면 상태 도구(get/set_screen_state)는 ai-screen 이벤트로 열린 페이지에 묻고 screen.reply로 받는다(2초 안에 답이 없으면 화면 없음).
 * 보관 정책(spec/data-policy.md#DP-LIFE): forgetSource(도구 연결 해제), forgetCluster(클러스터 삭제), exportData·deleteData(내 자료). 자동 해석은 설정 wake.ai.autoInterpret(기본 꺼짐).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createHubStore } = require('./hub-store.cjs');
const { createIncidentHub } = require('./incident-hub.cjs');
const { createApprovals, diffOf } = require('./approvals.cjs');
const { createToolLayer } = require('./hub-tools.cjs');
const { createHubServer } = require('./hub-server.cjs');
const { createAiRunner } = require('./ai-run.cjs');

const esm = rel => import(pathToFileURL(path.join(__dirname, '..', rel)).href);
const DAY = 86_400_000;
const SCAN_EVERY = 30_000, WATCH_FOR = 3_600_000;

/** { $t: key, vars } 글 값을 사전으로 바꾼 사본(보고서를 메인 프로세스에서 만들 때) */
function localize(value, t) {
  if (Array.isArray(value)) return value.map(v => localize(v, t));
  if (value && typeof value === 'object') {
    if (typeof value.$t === 'string') return t(value.$t, Object.fromEntries(Object.entries(value.vars ?? {}).map(([k, v]) => [k, localize(v, t)])));
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v, t)]));
  }
  return value;
}

/**
 * deps: { userData, emit(event, payload), sources (reads/cluster.cjs, 화면 읽기 서비스와 같은 인스턴스), contexts() -> ids, secret(method, target) -> value|null,
 *         cliConnected(id) -> 사람이 연결한 구독 CLI인가(연결 파일의 aiCli 기록), version }
 */
async function createHub({ userData, emit, sources, contexts, secret, cliConnected = () => false, version }) {
  const { maskText } = await esm('data/mask.js');
  const store = createHubStore({ userData, maskText });
  store.prune();
  const user = () => os.userInfo().username;
  const auditLog = store.log('audit');
  const audit = row => auditLog.append({ executor: 'Wake', permission: 'read', target: '', scope: '', ...row });
  let runner = null;
  const interpreting = new Set();
  const hub = createIncidentHub({ store, sources, user, audit, interpret: async inc => {
    if (interpreting.has(inc.id) || !runner) return;
    interpreting.add(inc.id);
    try { const v = await runner.interpret(inc, localize(inc.observe, await dictionary())); if (v) hub.setInterpretation(inc.id, v); } finally { interpreting.delete(inc.id); }
  } });
  const approvals = createApprovals({ store, hub, sources, audit, emit, github: () => secret('github', 'token') });

  /* 화면 상태: 열린 페이지에 묻기 */
  const waits = new Map();
  const ask = (op, payload) => new Promise(resolve => {
    const request = randomUUID(), timer = setTimeout(() => { waits.delete(request); resolve(null); }, 2000);
    waits.set(request, value => { clearTimeout(timer); waits.delete(request); resolve(value); });
    emit('ai-screen', { request, op, ...payload });
  });
  const screen = {
    get: async tab => (await ask('get', { tab })) ?? { view: null, state: {} },
    set: async (tab, patch, open) => (await ask('set', { tab, patch, open })) ?? { applied: [], chips: [], open: null },
  };
  /* 메인 프로세스에서 쓰는 글(보고서, AI에 보내는 관측): 화면과 같은 사전(기본 한국어) */
  const dictionary = () => esm('locale/ko.js').then(({ default: ko }) => (k, v = {}) => String(ko[k] ?? k).replace(/\{(\w+)\}/g, (m, n) => (n in v ? String(v[n]) : m)));
  /* 보고서(build_report): 화면과 같은 문서 함수 */
  async function report(workspace, { kind, format = 'md' }) {
    const [{ incidentReport, finished, markdownOf }, t] = await Promise.all([esm('pages/incident-report-doc.js'), dictionary()]);
    const inc = localize(workspace, t), doc = incidentReport(t, inc);
    if (kind !== doc.kind) throw Object.assign(new Error(`incident is ${doc.kind}`), { kind: 'invalid_request' });
    return { kind: doc.kind, text: format === 'channel' ? doc.channel : markdownOf(t, finished(doc), doc.head), sources: inc.evidence.map(e => ({ n: e.n, source: e.source, query: e.query, collectedAt: e.collectedAt, hash: e.hash })) };
  }
  const tools = createToolLayer({ sources, hub, store, screen, approvals, contexts, report });
  /* 자동 해석: 사람이 설정에서 켠 때만(부를 때마다 settings.json을 다시 읽음, 읽지 못하면 꺼짐) */
  const autoInterpret = () => { try { return JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'))?.['wake.ai.autoInterpret'] === true; } catch { return false; } };
  /* 답 글에 새어 나온 도구 id를 바꾸는 말(질문의 언어로): 화면과 같은 사전 */
  const toolDicts = { ko: (await esm('locale/ko.js')).default, en: (await esm('locale/en.js')).default };
  const toolWord = (name, lang) => (toolDicts[lang] ?? toolDicts.en)[`wake.ai.toolWord.${name}`] ?? null;
  runner = createAiRunner({ store, tools, secret, audit, maskText, contexts, cliConnected, autoInterpret, toolWord, /* 질문 대상(target)은 등록된 context만 */
    evidence: id => { const inc = hub.get(id); return inc ? { cluster: inc.cluster, pieces: hub.pieces(id) } : null; } }); /* 답이 인용한 근거 번호의 원본 */
  const server = createHubServer({ store, tools, version });
  await server.apply().catch(() => null);

  /* 감지: 화면이 읽은 클러스터와 열린 인시던트가 있는 클러스터를 30초마다(앱이 켜져 있는 동안), 보관 정리는 하루 한 번 */
  const watched = new Map();
  const touch = id => watched.set(id, Date.now());
  const tick = setInterval(() => {
    const open = new Set(hub.rows({ state: 'open' }).map(r => r.cluster));
    for (const id of new Set([...watched.keys(), ...open])) if (open.has(id) || Date.now() - watched.get(id) < WATCH_FOR) hub.scan(id).then(r => { if (r?.changed) emit('incident', { cluster: id }); }, () => null);
  }, SCAN_EVERY);
  tick.unref?.();
  const pruner = setInterval(() => store.prune(), DAY); pruner.unref?.();

  const screenCaller = { transport: 'desktop', requester: { kind: 'human', name: user() }, screen: true };
  const value = r => { if (r.error) throw Object.assign(new Error(r.error), { kind: r.error === 'missing' ? 'missing' : r.error }); return r.result; };
  return {
    /* 메인 프로세스의 다른 서비스(도구 연결·관리자 Secret 읽기·Slack 보내기)가 남기는 감사 행 하나(services.cjs가 넘김) */
    record: row => audit(row),
    incidents: async ({ cluster } = {}) => { if (cluster) touch(cluster); return value(await tools.call('list_incidents', cluster ? { cluster } : {}, screenCaller)); },
    workspace: async ({ cluster, id }) => { touch(cluster); return value(await tools.call('get_incident', { id }, screenCaller)); },
    audit: ({ cluster }) => ({ at: new Date().toISOString(), rows: auditLog.list(r => !cluster || !r.scope || r.scope === cluster || String(r.scope).startsWith(cluster + '/')).sort((a, b) => b.at - a.at) }),
    providers: () => runner.providers(),
    /* 실행이 끝나면(멈춤·실패 포함) 그 대화가 저장소에 있다: 모든 문서(사이드바·⌘K·새 탭 카드)가 목록을 다시 읽도록 ai-chat saved */
    run: async args => {
      const run = String(args?.run ?? '');
      try { return await runner.run(args ?? {}, ev => emit('ai-event', { run, ev })); }
      finally { if (typeof args?.conversation === 'string' && args.conversation) emit('ai-chat', { op: 'saved', id: args.conversation }); }
    },
    /* 화면에서 멈춤: 그 실행의 API 요청을 끊거나 CLI 프로세스를 끝낸다 */
    cancel: args => ({ cancelled: runner.cancel({ run: String(args?.run ?? '') }) }),
    /* 외부 AI(MCP·API)가 만든 승인 요청은 대화 하나로 모여 데스크톱 승인 칸(질문 패널)에 뜬다 */
    conversations: ({ id, includeArchived = false } = {}) => {
      const ext = approvals.pending().filter(a => a.transport !== 'desktop');
      const box = ext.length ? [{ id: 'approvals', title: { $t: 'wake.ai.approvals' }, cluster: ext[0].cluster, time: new Date(ext.at(-1).at).toISOString(), when: 'today', last: '',
        messages: [{ role: 'assistant', id: 'm-approvals', steps: [], time: null, parts: ext.map(a => ({ type: 'approval', id: a.id, title: a.title, icon: 'git-pull-request', head: null, state: 'pending', selected: 0, diff: diffOf(a.plan),
          target: [a.client ?? a.requester?.name, a.transport.toUpperCase(), a.target.namespace, `${a.target.kind} ${a.target.name}`].filter(Boolean).join(' · ') })) }] }] : [];
      return [...box, ...runner.list({ includeArchived })].filter(c => !id || c.id === id);
    },
    chat: ({ op, id }) => {
      const changed = op === 'archive' ? runner.archive(id) : op === 'restore' ? runner.restore(id) : op === 'delete' ? runner.remove(id) : false;
      if (changed) emit('ai-chat', { op, id });
      return changed;
    },
    decide: ({ id, choice, reason }) => approvals.decide(id, choice, { by: user(), reason: reason ?? null }),
    pending: () => approvals.pending(),
    serverState: () => ({ ...server.state(), clients: server.listClients() }),
    serverSet: async patch => ({ ...(await server.set(patch ?? {})), clients: server.listClients() }),
    client: ({ op, id, name, transport, scope }) => (op === 'add' ? server.addClient({ name, transport, scope }) : op === 'remove' ? { removed: server.removeClient(id) }
      : op === 'rotate' ? server.rotateClient(id) ?? { error: 'missing' } : { error: 'op' }),
    /* 보관 정책: 도구 연결 해제·클러스터 삭제는 cache·reference만 지우고 archive(인시던트·근거·감사)는 남긴다 */
    forgetSource: ({ cluster, source } = {}) => (typeof cluster === 'string' && cluster && typeof source === 'string' && source ? { removed: store.forgetSource(cluster, source) } : { error: 'invalid_request' }),
    forgetCluster: ({ cluster } = {}) => (typeof cluster === 'string' && cluster ? { removed: store.forgetCluster(cluster) } : { error: 'invalid_request' }),
    /* 내 자료: 내보내기는 archive·config(가린 값), 지우기는 confirm: true일 때만 허브 폴더 전부 */
    exportData: () => store.exportAll(),
    deleteData: ({ confirm } = {}) => (confirm === true ? { removed: store.deleteAll() } : { error: 'confirm' }),
    screenReply: ({ request, value: v }) => { waits.get(request)?.(v); return { ok: true }; },
  };
}

module.exports = { createHub };
