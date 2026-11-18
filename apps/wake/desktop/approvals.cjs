/*
 * 승인 요청(spec/rules.md#RULE-APPROVAL): propose_action이 만드는 대기 요청과 사람의 결정. 허브는 클러스터에 쓰지 않는다.
 *   propose(args, caller) -> { approval, plan, state: 'waiting' }  계획은 ownership.js planFor(소유 관계가 길을 정함)
 *   decide(id, choice, { by, reason? }) -> Decision  데스크톱 사람만. 첫 결정을 지키고 다시 오면 replayed
 *     허용: Draft PR 길은 GitHub 연결이 없으면 승인만 남기고 PR 실패(github-unconnected)를 기록, helm·명령 길은 승인만 기록(실행은 사람이 밖에서)
 *   pending() -> 대기 요청 목록(데스크톱 승인 칸)
 * 결정마다 감사 기록 한 행(요청자, 결정한 사람, 경로).
 */
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const T = (key, vars = {}) => ({ $t: key, vars });
/** 승인 창에 보이는 바뀌는 값 전부(diff 글) 또는 명령 */
const diffOf = plan => (plan.values?.length ? plan.values.map(v => `- ${v.path}: ${v.before ?? ''}\n+ ${v.path}: ${v.after}`).join('\n') : plan.command ?? '');

function createApprovals({ store, hub, sources, audit, emit = () => {}, github = () => null, now = Date.now }) {
  const docs = store.docs('approvals');
  const lib = Promise.all([import(pathToFileURL(path.join(__dirname, '../data/ownership.js')).href)]).then(([o]) => o);

  async function propose(a, caller) {
    const L = await lib, tg = a.target;
    let plan, title, incident = a.incident ?? null;
    if (incident && a.option) {
      const inc = hub.get(incident); if (!inc) throw Object.assign(new Error('missing'), { kind: 'missing' });
      const w = await hub.workspace({ cluster: inc.cluster, id: incident });
      const o = w.options.find(x => x.id === a.option); if (!o) throw Object.assign(new Error('unknown option'), { kind: 'invalid_request' });
      plan = o.plan; title = o.title;
    } else {
      if (!a.change) throw Object.assign(new Error('change required'), { kind: 'invalid_request' });
      const resource = await sources.get(tg.cluster, tg.kind, tg.namespace ?? '', tg.name);
      if (!resource) throw Object.assign(new Error('missing'), { kind: 'missing' });
      const apps = await sources.list(tg.cluster, 'applications').catch(() => []);
      plan = L.planFor({ resource, change: { id: 'proposal', title: a.change.title, values: a.change.values ?? [] }, owner: L.ownerOf(resource, { applications: apps }) });
      title = a.change.title;
    }
    const id = `apr-${randomUUID()}`;
    const saved = docs.put(id, { at: now(), state: 'waiting', incident, cluster: tg.cluster, target: tg, title, plan, requester: caller.requester, client: caller.client ?? null, transport: caller.transport, model: caller.model ?? null });
    emit('approval', { id, incident, transport: caller.transport });
    return { approval: id, plan: saved.plan, state: 'waiting' };
  }

  function decide(id, choice, { by, reason = null }) {
    const a = docs.get(id);
    if (!a) throw Object.assign(new Error('missing'), { kind: 'missing' });
    if (a.state !== 'waiting') return { state: a.state, by: a.decidedBy, time: a.decidedAt, replayed: true, ...(a.prResult ? { pr: a.prResult } : {}) };
    const t = now(), allow = choice === 'allow' && !reason;
    let state = allow ? 'approved' : 'denied', prResult = null;
    if (allow && a.plan.route === 'pr') prResult = github() ? 'pending' : 'github-unconnected';
    const saved = docs.put(id, { ...a, state, decidedBy: by, decidedAt: t, reason, prResult });
    if (allow && a.incident) hub.choose(a.incident, { id: a.plan.id, title: a.title });
    audit({ at: t, incident: a.incident ?? undefined, action: allow ? 'approve' : 'deny', requester: { kind: 'human', name: by }, transport: 'desktop', scope: [a.cluster, a.target.namespace].filter(Boolean).join('/'),
      executor: by, permission: 'ask', target: `${a.target.namespace ?? ''}/${a.target.kind}/${a.target.name}`, result: allow ? 'ok' : 'denied', approval: id,
      summary: T(allow ? (prResult === 'github-unconnected' ? 'wake.audit.approve.prUnconnected' : a.plan.route === 'pr' ? 'wake.audit.approve.pr' : 'wake.audit.approve.manual') : 'wake.audit.deny', { title: a.title }) });
    return { state: saved.state, by, time: t, ...(prResult ? { pr: prResult } : {}) };
  }

  const pending = () => docs.all().filter(a => a.state === 'waiting').sort((x, y) => x.at - y.at);
  return { propose, decide, pending };
}

module.exports = { createApprovals, diffOf };
