/*
 * 승인 요청(spec/rules.md#RULE-APPROVAL): propose_action이 만드는 대기 요청과 사람의 결정. 허브는 클러스터에 쓰지 않는다.
 *   propose(args, caller) -> { approval, plan, state: 'waiting' }  계획은 ownership.js planFor(소유 관계가 길을 정함)
 *     인시던트 후보(incident + option)의 계획은 그 인시던트의 클러스터와 계획 대상(kind·namespace·name)이 요청 target과 같을 때만(다르면 invalid_request, 기록 없음)
 *     요청에는 불변 계획 해시(planHash: 클러스터·대상·계획)를 함께 저장한다
 *   decide(id, choice, { by, reason? }) -> Promise<Decision>  첫 결정을 지키고 다시 오면 replayed
 *     허용은 메인 프로세스 확인(confirm({ id, title, cluster, target, route, values, guards, command, diff, planHash }) -> true)이 그 승인 ID와 계획 해시에 대해 true일 때만.
 *       확인이 없거나 취소면 not_confirmed, 확인하는 동안 계획이 바뀌면 plan_changed(둘 다 기록 없음). 화면이 보낸 결정만으로는 허용되지 않는다
 *     허용: Draft PR 길은 GitHub 연결이 없으면 승인만 남기고 PR 실패(github-unconnected)를 기록, helm·명령 길은 승인만 기록(실행은 사람이 밖에서)
 *     거절은 밖을 바꾸지 않으므로 확인 없이 기록한다
 *   pending() -> 대기 요청 목록(데스크톱 승인 칸)
 * 결정마다 감사 기록 한 행(요청자, 결정한 사람, 경로, 확인한 계획 해시).
 */
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const T = (key, vars = {}) => ({ $t: key, vars });
/** 승인 창에 보이는 바뀌는 값 전부(diff 글) 또는 명령 */
const diffOf = plan => (plan.values?.length ? plan.values.map(v => `- ${v.path}: ${v.before ?? ''}\n+ ${v.path}: ${v.after}`).join('\n') : plan.command ?? '');
const fail = kind => Object.assign(new Error(kind), { kind });
/* 점 경로(spec.template.spec.containers[0].resources.limits.memory)의 원본 값 */
const valueAt = (o, p) => String(p).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((x, k) => (x == null ? undefined : x[k]), o);
/* 원본 필드의 형(숫자·불리언·글)대로 before·after를 바꾼다: JSON patch의 test·replace가 그 형으로 나간다. before가 지금 값과 다르거나,
   after가 그 형이 아니거나, 필드가 객체·목록이면 null(거절). 없는 필드는 before ''이고 after는 글 */
function typedValue(live, v) {
  const after = String(v.after ?? '');
  if (live === undefined || live === null) return v.before === '' ? { path: v.path, after } : null;
  if (typeof live === 'number') return String(live) === v.before && /^-?\d+(\.\d+)?$/.test(after) ? { path: v.path, before: live, after: Number(after) } : null;
  if (typeof live === 'boolean') return String(live) === v.before && /^(true|false)$/.test(after) ? { path: v.path, before: live, after: after === 'true' } : null;
  if (typeof live === 'string') return live === v.before ? { path: v.path, before: live, after } : null;
  return null;
}
/* 키 순서와 무관한 JSON(같은 계획은 같은 해시) */
const canonical = v => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v ?? null));
/** 승인 요청 하나의 불변 계획 해시: 클러스터, 대상, 인시던트, 계획 전체 */
const planHashOf = a => createHash('sha256').update(canonical({ cluster: a.cluster, target: a.target, incident: a.incident ?? null, plan: a.plan })).digest('hex');

function createApprovals({ store, hub, sources, audit, emit = () => {}, github = () => null, confirm = null, now = Date.now }) {
  const docs = store.docs('approvals');
  const lib = Promise.all([import(pathToFileURL(path.join(__dirname, '../data/ownership.js')).href), import(pathToFileURL(path.join(__dirname, '../data/kinds.js')).href)])
    .then(([o, k]) => ({ ...o, KIND_OF: k.KIND_OF }));
  /* 종류 이름(Deployment, deployments)을 kind 하나로 */
  const kindOf = (K, name) => Object.values(K).find(k => k.kind === name || k.plural === name)?.kind ?? name;

  async function propose(a, caller) {
    const L = await lib, tg = a.target;
    let plan, title, incident = a.incident ?? null;
    /* 인시던트는 그 후보(option)와 짝으로만: 일반 변경에 인시던트 id만 붙여 그 인시던트의 고른 조치로 기록되지 않게 */
    if (!incident !== !a.option) throw fail('invalid_request');
    const same = (x, y) => !!x && kindOf(L.KIND_OF, x.kind) === kindOf(L.KIND_OF, y.kind) && (x.namespace ?? '') === (y.namespace ?? '') && x.name === y.name;
    if (incident) {
      const inc = hub.get(incident); if (!inc) throw fail('missing');
      /* 범위 검사는 target으로 했다: 인시던트와 그 후보의 계획이 바로 그 클러스터·객체여야 한다 */
      if (inc.cluster !== tg.cluster || !same(inc.target, tg)) throw fail('invalid_request');
      const w = await hub.workspace({ cluster: inc.cluster, id: incident });
      const o = w.options.find(x => x.id === a.option); if (!o) throw fail('invalid_request');
      if (!same(o.plan?.target, tg)) throw fail('invalid_request');
      /* 인시던트가 아는 UID가 지금 그 이름의 객체여야 한다(지우고 같은 이름으로 다시 만든 객체에 옛 인시던트의 조치를 붙이지 않음) */
      if (inc.target.uid) { const live = await sources.get(tg.cluster, tg.kind, tg.namespace ?? '', tg.name); if (live?.metadata?.uid !== inc.target.uid) throw fail('invalid_request'); }
      plan = o.plan; title = o.title;
    } else {
      /* 일반 변경: 값마다 지금 값(before)이 있어야 하고 그것이 원본의 지금 값이어야 한다. 계획은 클러스터 context를 이름으로 단다 */
      const values = a.change?.values ?? [];
      if (!values.length || values.some(v => typeof v?.before !== 'string')) throw fail('invalid_request');
      const resource = await sources.get(tg.cluster, tg.kind, tg.namespace ?? '', tg.name);
      if (!resource) throw fail('missing');
      const typed = values.map(v => typedValue(valueAt(resource, v.path), v));
      if (typed.some(v => !v)) throw fail('invalid_request');
      const apps = await sources.list(tg.cluster, 'applications').catch(() => []);
      plan = L.planFor({ resource, context: tg.cluster, change: { id: 'proposal', title: a.change.title, values: typed }, owner: L.ownerOf(resource, { applications: apps }) });
      title = a.change.title;
    }
    const id = `apr-${randomUUID()}`;
    const stored = docs.put(id, { at: now(), state: 'waiting', incident, cluster: tg.cluster, target: tg, title, plan, requester: caller.requester, client: caller.client ?? null, transport: caller.transport, model: caller.model ?? null });
    /* 해시는 저장된(가린) 계획으로: 사람이 확인 창에서 보는 것과 같은 글 */
    const saved = docs.put(id, { ...stored, planHash: planHashOf(stored) });
    emit('approval', { id, incident, transport: caller.transport });
    return { approval: id, plan: saved.plan, state: 'waiting' };
  }

  const replay = a => ({ state: a.state, by: a.decidedBy, time: a.decidedAt, replayed: true, ...(a.prResult ? { pr: a.prResult } : {}) });
  async function decide(id, choice, { by, reason = null }) {
    let a = docs.get(id);
    if (!a) throw fail('missing');
    if (a.state !== 'waiting') return replay(a);
    const allow = choice === 'allow' && !reason;
    if (allow) {
      const planHash = planHashOf(a);
      if (planHash !== a.planHash) throw fail('plan_changed');
      const shown = { id, title: a.title, cluster: a.cluster, target: a.target, route: a.plan.route, values: a.plan.values ?? [], guards: a.plan.guards ?? [], command: a.plan.command ?? null, diff: diffOf(a.plan), planHash };
      if (typeof confirm !== 'function' || (await confirm(shown)) !== true) throw fail('not_confirmed');
      a = docs.get(id);
      if (!a) throw fail('missing');
      if (a.state !== 'waiting') return replay(a);
      if (planHashOf(a) !== planHash || a.planHash !== planHash) throw fail('plan_changed');
    }
    const t = now();
    let state = allow ? 'approved' : 'denied', prResult = null;
    if (allow && a.plan.route === 'pr') prResult = github() ? 'pending' : 'github-unconnected';
    const saved = docs.put(id, { ...a, state, decidedBy: by, decidedAt: t, reason, prResult });
    if (allow && a.incident) hub.choose(a.incident, { id: a.plan.id, title: a.title });
    audit({ at: t, incident: a.incident ?? undefined, action: allow ? 'approve' : 'deny', requester: { kind: 'human', name: by }, transport: 'desktop', scope: [a.cluster, a.target.namespace].filter(Boolean).join('/'),
      executor: by, permission: 'ask', target: `${a.target.namespace ?? ''}/${a.target.kind}/${a.target.name}`, result: allow ? 'ok' : 'denied', approval: id, ...(allow ? { planHash: a.planHash } : {}),
      summary: T(allow ? (prResult === 'github-unconnected' ? 'wake.audit.approve.prUnconnected' : a.plan.route === 'pr' ? 'wake.audit.approve.pr' : 'wake.audit.approve.manual') : 'wake.audit.deny', { title: a.title }) });
    return { state: saved.state, by, time: t, ...(prResult ? { pr: prResult } : {}) };
  }

  const pending = () => docs.all().filter(a => a.state === 'waiting').sort((x, y) => x.at - y.at);
  return { propose, decide, pending };
}

module.exports = { createApprovals, diffOf };
