import { compareResources, compareHistory } from './table-order.js';
/*
 * GitOps 관계(8-14): 저장소 -> 컨트롤러 -> 클러스터. 사용자가 입력하지 않고 Application·Kustomization에서 읽어 이음.
 * 자료 모양은 GitOps 계약 이름을 따름: domains/gitops GitRepository(repository_id, provider, repo_ref, default_branch),
 * Application(application_id, repository_id, name, manifest_path, status), DeploymentBinding(cluster_id, namespace, app_name, manifest_path),
 * Application마다 바뀐 파일(diffs): Git(원하는 상태)과 클러스터의 실제 객체를 파일 단위로. 화면은 − 클러스터, + Git(동기화하면 이렇게 바뀜).
 */
const GITOPS_TRANSIENT_MESSAGES = Object.freeze([
  'GitOps API request failed',
  "Error invoking remote method 'kit:service:call': Error: GitOps API request failed",
]);
/** 저장소 목록(클러스터에서 읽은 Application) -> 계약 모양 */
export function contract(repos = []) {
  const repositories = repos.map(r => ({ repository_id: r.id, provider: r.multiSource ? null : r.provider || null, repo_ref: r.name || '', default_branch: r.multiSource ? null : r.branch || null, commit: r.commit || null, multiSource: !!r.multiSource }));
  const applications = repos.flatMap(r => (r.apps || []).map(a => ({ application_id: `${a.cluster}/${a.name}`, repository_id: r.id, name: a.name, kind: a.kind, controller: a.controller, manifest_path: a.path || '', status: a.sync,
    sync: a.sync, health: nullableText(a.health), revision: nullableText(a.revision), targetRevision: nullableText(a.targetRevision), multiSource: !!a.multiSource,
    sourceIdentity: a.sourceIdentity ?? null, observedAt: nullableText(a.observedAt), reconciledAt: nullableText(a.reconciledAt), receivedAt: nullableText(a.receivedAt),
    deployment: a.deployment ?? null, auto: typeof a.auto === 'boolean' ? a.auto : null, repoURL: a.repoURL ?? r.url ?? null,
    diffState: a.diffState || 'not_queried', diffFiles: a.diffFiles ?? null,
    binding: { cluster_id: a.cluster, namespace: a.ns, app_name: a.name, manifest_path: a.path } })));
  return { repositories, applications };
}

export function applicationIdentity(app) {
  const s = app?.sourceIdentity;
  return s ? JSON.stringify([s.clusterId, s.namespace, s.name, s.uid]) : app?.application_id || null;
}

export function createGitopsPolling({ read, identity, accept, onError, setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = 0, canPollPartial = () => false, resumeNow = () => false }) {
  let active = false, visible = true, disposed = false, epoch = 0, timer, pending, settled = false, failures = 0, blocked = false;
  const deadlines = new Set();
  const clearDeadlines = () => { for (const id of deadlines) clearTimer(id); deadlines.clear(); };
  const key = () => JSON.stringify(identity());
  const cancel = () => { clearTimer(timer); timer = undefined; };
  const schedule = () => {
    cancel();
    if (!active || !visible || disposed || blocked || pending || !settled || failures > 2) return;
    timer = setTimer(() => { timer = undefined; void run().catch(() => {}); }, GITOPS_POLL_MS);
    timer?.unref?.();
  };
  /* coming back to a page whose last read is already stale reads now instead of showing it for another poll period */
  const resume = () => {
    if (active && visible && !disposed && !blocked && !pending && settled && failures <= 2 && resumeNow()) void run().catch(() => {});
    else schedule();
  };
  async function run(manual = false) {
    if (disposed) return;
    if (manual) { failures = 0; blocked = false; }
    if (pending) return pending;
    cancel();
    const generation = epoch, target = key();
    let expired = false, deadline;
    const current = () => !expired && !disposed && generation === epoch && target === key();
    pending = Promise.resolve().then(read).then(value => {
      if (!current()) return;
      accept(value);
      const partial = value?.access === 'partial' || Object.values(value?.controllers || {}).flat().some(c => c.access === 'forbidden');
      blocked = value?.access === 'forbidden' || partial && !canPollPartial(value);
      failures = blocked && partial ? failures + 1 : 0;
      return value;
    }).catch(error => {
      if (current()) {
        failures++;
        blocked = error?.status === 403 || /forbidden|403/i.test(String(error?.kind || error?.message || error)) || !isTransient(error);
        onError(error);
      }
      throw error;
    }).finally(() => { pending = undefined; settled = true; schedule(); });
    if (!timeoutMs) return pending;
    const response = Promise.race([pending, new Promise((_, reject) => {
      deadline = setTimer(() => {
        const error = Object.assign(new Error('gitops response deadline exceeded'), { kind: 'timeout' });
        if (current()) { failures++; onError(error); }
        expired = true; reject(error);
      }, timeoutMs);
      deadlines.add(deadline);
    })]);
    return response.finally(() => { clearTimer(deadline); deadlines.delete(deadline); });
  }
  return {
    read: () => run(), refresh: () => run(true),
    setActive(value) { if (active === value || disposed) return; active = value; if (!active) { epoch++; cancel(); } else resume(); },
    setVisible(value) { if (visible === value || disposed) return; visible = value; if (visible) resume(); else cancel(); },
    invalidate() { epoch++; cancel(); schedule(); },
    dispose() { disposed = true; epoch++; cancel(); clearDeadlines(); },
  };
}

function nullableText(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function isTransient(error) {
  return GITOPS_TRANSIENT_MESSAGES.includes(error?.message) || ['unreachable', 'timeout', 'network'].includes(error?.kind) || ['GITOPS_READ_FAILED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(error?.code);
}

const GITOPS_POLL_MS = 15_000;
/** A snapshot older than two polls is the last successful one, not a current read (the same threshold the watch state uses). */
export const gitopsSnapshotStale = (receivedAt, now = Date.now()) => Number.isFinite(receivedAt) && now - receivedAt >= 2 * GITOPS_POLL_MS;

/* ---------- GitOps 화면(시뮬레이션 gitopsPage · appDetail): 행, 동기화 이력, 소유 리소스 대조(N3) ---------- */
const at = value => { const n = Date.parse(value ?? ''); return Number.isFinite(n) ? n : null; };
const SYNC_RESULT = { succeeded: ['ok', 'Succeeded'], failed: ['error', 'Failed'], running: ['busy', 'Running'], targeted: ['warn', 'Succeeded · selected'], dryRun: ['idle', 'DryRun'] };
/** Application의 동기화 이력(최근 먼저): [{ id, at(ms), revision, result: [tone, 원문], by }]. 컨트롤러의 status.history와 operationState에서 */
export function syncHistory(app) {
  return (app?.deployment?.history ?? []).map(r => ({ id: r.key, at: at(r.at), revision: (r.revision ?? []).join(' · '), result: SYNC_RESULT[r.state] ?? ['idle', r.state ?? ''], by: r.by ?? '' }))
    .filter(r => r.at != null).sort(compareHistory);
}
/** 짧은 revision(커밋은 7자, 태그·브랜치는 그대로) */
export const shortRev = rev => String(rev ?? '').split(' · ').map(x => (/^[0-9a-f]{12,}$/.test(x) ? x.slice(0, 7) : x)).join(' · ');
/** 문제 있는 Application: Synced가 아니거나 Healthy가 아니거나 소유 리소스가 준비되지 않음 */
export const appBad = row => row.sync !== 'Synced' && row.sync !== 'Ready' || (row.health && row.health !== 'Healthy') || row.warn?.length > 0;

/**
 * 소유 리소스 대조(N3): Argo 원문 Health가 Healthy여도 소유 워크로드가 준비되지 않았으면 경고를 붙인다.
 *  app: contract Application, workloads: 종류 행(deployments · statefulsets · daemonsets, kind 붙임)
 *  반환 [{ kind, ns, name, reason, ready, desired }]: Deployment는 Available False(reason), StatefulSet·DaemonSet은 ready가 desired보다 적음
 */
export function ownedWarnings(app, workloads = []) {
  const listed = app?.deployment?.resources?.items ?? [];
  const mine = listed.length ? workloads.filter(w => listed.some(x => x.kind === w.kind && x.name === w.name && (x.namespace ?? '') === (w.ns ?? '')))
    : workloads.filter(w => w.application && w.application === app?.name && (!app.binding?.namespace || w.ns === app.binding.namespace));
  return mine.flatMap(w => {
    const available = (w.conditions ?? []).find(c => c.type === 'Available');
    if (w.kind === 'Deployment' && available?.status === 'False') return [{ kind: w.kind, ns: w.ns, name: w.name, reason: available.reason || 'Available False', ready: w.ready ?? 0, desired: w.desired ?? 0 }];
    if (w.kind !== 'Deployment' && Number.isFinite(w.desired) && (w.ready ?? 0) < w.desired) return [{ kind: w.kind, ns: w.ns, name: w.name, reason: 'NotReady', ready: w.ready ?? 0, desired: w.desired }];
    return [];
  });
}

/**
 * GitOps 표 행: [{ id, name, ns, controller, sync, health, revision, last(ms), syncs, auto, warn, app }]. 문제 있는 것 먼저, 그다음 이름.
 *  range: { from, to } ms — syncs는 그 구간의 동기화 수
 */
export function appRows(apps = [], { from = -Infinity, to = Infinity } = {}, workloads = []) {
  return apps.map(a => {
    const hist = syncHistory(a);
    return { id: applicationIdentity(a), name: a.name, ns: a.binding?.namespace ?? '', controller: a.controller, kind: a.kind ?? 'Application', sync: a.sync ?? '', health: a.health ?? '', revision: shortRev(a.revision),
      last: hist[0]?.at ?? at(a.reconciledAt), syncs: hist.filter(h => h.at >= from && h.at <= to).length, auto: a.auto ?? null, warn: ownedWarnings(a, workloads), app: a };
  }).sort((a, b) => compareResources(a, b, row => ['Degraded', 'Failed', 'NotReady'].includes(row.health) || ['Failed', 'NotReady'].includes(row.sync) ? 'danger' : row.sync === 'OutOfSync' || row.health === 'Missing' || row.warn?.length ? 'warn' : null));
}

