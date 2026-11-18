/*
 * 연결 단계 확인(메인 프로세스): 화면의 연결 흐름(data/connect-flow.js)이 op 방법의 단계마다 부르는 확인 하나.
 *   save   {method, target, values}  비밀 값(API 키, 웹후크 주소)을 키체인에 두고 참조만 연결 파일에 남김(값은 돌려주지 않음)
 *   step   {method, target, step}    그 단계가 충족됐는지: { ok } 또는 { cause, error?, install?, login?, admin? }
 *   verify {method, target}          저장한 연결이 지금도 통하는지(앞 단계부터 차례로): { ok } 또는 { at, cause, ... }
 *   forget {method, target}          키체인 항목과 참조를 지움(구독 CLI는 연결 기록 aiCli)
 * 방법: ai-cli(공식 CLI: 명령이 있는지, 설정 폴더로 로그인 여부. 통하면 연결 파일 aiCli에 기록해 내장 AI가 그 CLI로 대화함), ai-key(공급자 모델 목록 읽기),
 *       notify(Slack 웹후크: 빈 본문을 보내 400 no_text면 주소가 살아 있음 — 메시지는 올라가지 않음 / PagerDuty: 읽기 API),
 *       gitops(내 kubeconfig로 컨트롤러 Deployment와 Application·Kustomization 목록을 읽을 수 있는지).
 * 화면이 보내는 것은 방법·대상·단계 이름뿐이라 임의 명령이나 주소는 실행·요청되지 않음.
 * gitops 대상은 '<클러스터 id>/<argocd|flux|any>'이고 마지막 '/'로 나눈다(클러스터 id에 '/'가 들 수 있음, 예: EKS ARN).
 * 감사(audit): Slack으로 보낸 글 하나마다 행 하나(notify.send, 결과·글자 수만. 웹후크 주소와 글은 남기지 않음).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findCommand, execPath } = require('./k8s.cjs');
const ai = require('./ai.cjs');

/* 공식 CLI: 명령, 로그인하면 생기는 설정 폴더, 설치 명령(Wake가 실행하지 않고 복사만), 로그인 명령(터미널에서 실행) */
const CLI = {
  'codex-cli': { command: 'codex', dir: '.codex', install: 'npm install -g @openai/codex', login: 'codex login' },
  'claude-cli': { command: 'claude', dir: '.claude', install: 'npm install -g @anthropic-ai/claude-code', login: 'claude /login' },
  'gemini-cli': { command: 'gemini', dir: '.gemini', install: 'npm install -g @google/gemini-cli', login: 'gemini' },
};
const KEYED = { 'ai-key': ['anthropic', 'openai', 'google'], notify: ['slack', 'pagerduty'], github: ['token'] };
/* GitOps 컨트롤러: 그 컨트롤러 Deployment와 읽을 목록 */
const GITOPS = {
  argocd: { deploy: '/apis/apps/v1/namespaces/argocd/deployments/argocd-server', list: '/apis/argoproj.io/v1alpha1/applications?limit=1', resource: 'applications.argoproj.io' },
  flux: { deploy: '/apis/apps/v1/namespaces/flux-system/deployments/kustomize-controller', list: '/apis/kustomize.toolkit.fluxcd.io/v1/kustomizations?limit=1', resource: 'kustomizations.kustomize.toolkit.fluxcd.io' },
};

async function fetchStatus(url, init = {}, ms = 8000) {
  try { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) }); return { status: r.status, text: await r.text().catch(() => '') }; }
  catch (e) { return { status: 0, error: e.name === 'TimeoutError' ? 'timed out' : String(e.cause?.code || e.message) }; }
}
async function notifyCheck(target, secret) {
  if (target === 'slack') {
    if (!/^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(secret || '')) return { at: 'input', cause: 'input' };
    const r = await fetchStatus(secret, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!r.status) return { at: 'reach', cause: 'network', error: r.error };
    if (r.status === 400 && /no_text|missing_text/.test(r.text)) return { ok: true };
    if ([403, 404, 410].includes(r.status)) return { at: 'authn', cause: 'unauthorized', error: `${r.status} ${r.text.slice(0, 120)}` };
    return { at: 'authn', cause: 'unknown', error: `${r.status} ${r.text.slice(0, 120)}` };
  }
  const r = await fetchStatus('https://api.pagerduty.com/abilities', { headers: { authorization: `Token token=${secret}`, accept: 'application/json' } });
  if (!r.status) return { at: 'reach', cause: 'network', error: r.error };
  if (r.status === 200) return { ok: true };
  if (r.status === 401 || r.status === 403) return { at: 'authn', cause: 'unauthorized', error: String(r.status) };
  return { at: 'authn', cause: 'unknown', error: `${r.status} ${r.text.slice(0, 120)}` };
}
const AI_CAUSE = { unreachable: ['reach', 'network'], keyError: ['authn', 'unauthorized'], quota: ['authn', 'quota'], unknown: ['authn', 'unknown'], keychain: ['input', 'input'] };

/** @param {{ keychain, conns(), saveConns(c), client(context), audit?(row) }} deps  audit: 허브 감사 기록에 한 행(hub.cjs record) */
function createConnOps({ keychain, conns, saveConns, client, audit = () => {} }) {
  const refKey = (method, target) => `${method}:${target}`;
  const secretOf = (method, target) => { const ref = conns().secrets?.[refKey(method, target)]; return ref ? keychain.get(ref) : null; };
  /* 한 번의 확인 결과를 잠깐 다시 씀(접속·인증 단계가 같은 요청 하나로 판정될 때) */
  const memo = new Map();
  const once = async (k, fn) => { const m = memo.get(k); if (m && Date.now() - m.at < 5000) return m.p; const p = fn(); memo.set(k, { at: Date.now(), p }); return p; };

  /* 방법·대상의 확인 전체: { ok } 또는 { at(멈춘 단계), cause, ... } */
  async function check(method, target) {
    if (method === 'ai-cli') {
      const c = CLI[target]; if (!c) return { at: 'tool', cause: 'unknown', error: 'unknown cli' };
      if (!findCommand(c.command, { ...process.env, PATH: execPath() })) return { at: 'tool', cause: 'notInstalled', missing: c.command, install: c.install, error: `${c.command}: command not found` };
      if (!fs.existsSync(path.join(os.homedir(), c.dir))) return { at: 'login', cause: 'loginNeeded', login: c.login, error: `~/${c.dir} not found` };
      const conn = conns(); if (!conn.aiCli?.[target]) { conn.aiCli = { ...conn.aiCli, [target]: true }; saveConns(conn); }
      return { ok: true };
    }
    if (method === 'ai-key') {
      if (!KEYED['ai-key'].includes(target)) return { at: 'input', cause: 'unknown' };
      const key = secretOf(method, target); if (!key) return { at: 'input', cause: 'input' };
      const r = await once(refKey(method, target), () => ai.verifyKey(target, key));
      if (r.state === 'ok') return { ok: true };
      const [at, cause] = AI_CAUSE[r.state] || AI_CAUSE.unknown; return { at, cause, error: r.error || r.state };
    }
    if (method === 'notify') {
      if (!KEYED.notify.includes(target)) return { at: 'input', cause: 'unknown' };
      const s = secretOf(method, target); if (!s) return { at: 'input', cause: 'input' };
      return once(refKey(method, target), () => notifyCheck(target, s));
    }
    /* GitHub 토큰(Draft PR 길이 읽는 secret github:token): 그 토큰으로 GitHub API의 나(GET /user)를 읽을 수 있는가 */
    if (method === 'github') {
      if (!KEYED.github.includes(target)) return { at: 'input', cause: 'unknown' };
      const token = secretOf(method, target); if (!token) return { at: 'input', cause: 'input' };
      return once(refKey(method, target), async () => {
        const r = await fetchStatus('https://api.github.com/user', { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } });
        if (!r.status) return { at: 'reach', cause: 'network', error: r.error };
        if (r.status === 200) return { ok: true };
        if (r.status === 401 || r.status === 403) return { at: 'authn', cause: 'unauthorized', error: String(r.status) };
        return { at: 'authn', cause: 'unknown', error: `${r.status} ${r.text.slice(0, 120)}` };
      });
    }
    if (method === 'gitops') {
      const t = String(target), cut = t.lastIndexOf('/'), cluster = t.slice(0, cut), kind = t.slice(cut + 1);
      if (cut <= 0 || !kind) return { at: 'reach', cause: 'unknown', error: 'invalid target' };
      const c = client(cluster), kinds = kind === 'any' ? Object.keys(GITOPS) : [kind];
      let seen = null;
      for (const k of kinds) {
        const g = GITOPS[k]; if (!g) continue;
        const d = await c.request('GET', g.deploy).then(() => 'ok', e => e.kind || 'unknown');
        if (d === 'unreachable') return { at: 'reach', cause: 'network', error: 'unreachable' };
        const l = await c.request('GET', g.list).then(() => 'ok', e => ({ kind: e.kind || 'unknown', msg: e.message }));
        if (d !== 'ok' && l !== 'ok' && l.kind === 'notFound') continue; // 이 컨트롤러는 없음
        seen = k;
        if (l === 'ok') return { ok: true, identity: null };
        if (l.kind === 'forbidden') return { at: 'perm', cause: 'forbidden', error: l.msg };
        return { at: 'perm', cause: 'unknown', error: l.msg };
      }
      return { at: 'reach', cause: seen ? 'unknown' : 'absent', error: 'no GitOps controller' };
    }
    return { at: 'input', cause: 'unknown', error: 'unknown method' };
  }
  /* 단계 하나: 확인 전체에서 그 단계가 멈춘 곳보다 앞이면 통과 */
  const ORDER = { 'ai-cli': ['tool', 'login'], 'ai-key': ['input', 'reach', 'authn'], notify: ['input', 'reach', 'authn'], github: ['input', 'reach', 'authn'], gitops: ['reach', 'perm'] };
  async function step({ method, target, step: s }) {
    const r = await check(method, target), order = ORDER[method] || [];
    if (r.ok || order.indexOf(r.at) > order.indexOf(s)) return { ok: true };
    const { at, ...rest } = r; return at === s ? rest : { ok: true };
  }
  return {
    save: ({ method, target, values }) => {
      if (!KEYED[method]?.includes(target)) return { cause: 'unknown' };
      const v = String(values?.key || values?.url || '').trim(); if (!v) return { cause: 'input' };
      if (method === 'notify' && target === 'slack' && !/^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(v)) return { cause: 'input', error: 'not a Slack incoming webhook address' };
      let ref; try { ref = keychain.set(v, method === 'notify' ? 'notify' : method === 'github' ? 'github' : 'ai-key'); } catch { return { cause: 'input', error: 'keychain' }; }
      const c = conns(), k = refKey(method, target), old = c.secrets?.[k]; c.secrets = { ...c.secrets, [k]: ref }; saveConns(c); if (old) keychain.delete(old);
      memo.delete(k); return { ok: true };
    },
    step,
    /* 연결한 Slack 웹후크로 글 하나(사람이 누를 때만). 그 밖의 대상은 보내지 않음 */
    send: async ({ target, text }) => {
      if (target !== 'slack') return { error: 'unsupported' };
      const url = secretOf('notify', 'slack'); if (!url) return { error: 'not connected' };
      const body = String(text || '').slice(0, 3000);
      const r = await fetchStatus(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: body }) });
      const ok = r.status === 200;
      try { audit({ action: 'notify.send', transport: 'desktop', requester: { kind: 'human', name: os.userInfo().username }, permission: 'write', target: 'slack', scope: '',
        result: ok ? 'ok' : 'failed', size: { n: body.length, unit: 'chars' }, ...(ok ? {} : { error: String(r.status || r.error) }) }); } catch { /* 감사 실패가 보낸 결과를 바꾸지 않음 */ }
      return ok ? { ok: true } : { error: String(r.status || r.error) };
    },
    verify: async ({ method, target }) => { memo.delete(refKey(method, target)); return check(method, target); },
    forget: ({ method, target }) => { const c = conns(), k = refKey(method, target); let changed = false;
      if (c.secrets?.[k]) { keychain.delete(c.secrets[k]); delete c.secrets[k]; changed = true; }
      if (method === 'ai-cli' && c.aiCli?.[target]) { delete c.aiCli[target]; changed = true; }
      if (changed) saveConns(c); memo.delete(k); return { ok: true, deleted: true }; },
  };
}
module.exports = { createConnOps };
