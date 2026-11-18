/*
 * GitOps 컨트롤러 기록: 화면이 읽는 것만(data/gitops.js syncHistory · ownedWarnings).
 *  history: 동기화 기록(최근 먼저) [{ key, revision[], at, startedAt, state, by?, reason?, source, count? }]. by는 Argo CD initiatedBy(사용자 이름 또는 automated)
 *  resources.items: 관리 리소스 [{ name, namespace, group, kind, version, ... }]
 */
const RECORD_LIMIT = 30;
const RESOURCE_LIMIT = 100;
const ARGO_PHASES = Object.freeze({ Running: 'running', Terminating: 'running', Succeeded: 'succeeded', Failed: 'failed', Error: 'failed' });

function argoDeployment(object) {
  const spec = object.spec || {};
  const status = object.status || {};
  const state = status.operationState;
  const syncOperation = state?.operation?.sync;
  const sourceCount = spec.sources?.length || 1;
  const operation = syncOperation && argoRevision(state.syncResult, sourceCount).length
    ? argoRevision(state.syncResult, sourceCount) : argoRevision(syncOperation, sourceCount);
  const phase = Object.hasOwn(ARGO_PHASES, state?.phase) ? ARGO_PHASES[state.phase] : null;
  const started = timestamp(state?.startedAt);
  const finished = timestamp(state?.finishedAt);
  const history = array(status.history).flatMap(item => {
    const revision = argoRevision(item, sourceCount), at = timestamp(item.deployedAt);
    if (!revision.length || !at) return [];
    return [{ key: 'deploy:' + (Number.isSafeInteger(item.id) ? item.id : JSON.stringify([revision, at])),
      revision, at, startedAt: timestamp(item.deployStartedAt), state: 'succeeded', ...initiator(item.initiatedBy), source: 'status.history' }];
  }).sort(newest);
  const targeted = Boolean(syncOperation?.resources?.length);
  const dryRun = syncOperation?.dryRun === true;
  const attempt = started && operation.length && syncOperation && phase ? {
    key: 'operation:' + JSON.stringify([started, operation]), revision: operation,
    at: finished || started, startedAt: started,
    state: dryRun ? 'dryRun' : targeted && phase === 'succeeded' ? 'targeted' : phase,
    reason: text(state.phase), ...initiator(state.operation?.initiatedBy), source: 'status.operationState',
  } : null;
  const duplicate = attempt?.state === 'succeeded' && finished ? history.filter(record => sameRevision(record.revision, operation)
    && Date.parse(record.startedAt) === Date.parse(started) && Date.parse(record.at) === Date.parse(finished)) : [];
  const prior = duplicate.length === 1 ? history.filter(record => record !== duplicate[0]) : history;
  /* 기록된 배포가 끝나기 전(초 단위로 같은 시각 포함)에 시작한 같은 Revision의 선택 동기화(자동 치유)는 그 배포의 일부: 따로 세지 않음 */
  const tail = attempt?.state === 'targeted' && history[0] && sameRevision(history[0].revision, operation)
    && Date.parse(started) >= Date.parse(history[0].startedAt || history[0].at) && Date.parse(started) <= Date.parse(history[0].at);
  return {
    history: [...(attempt && !tail ? [attempt] : []), ...prior.slice(0, RECORD_LIMIT)].sort(newest).slice(0, RECORD_LIMIT),
    resources: argoResources(status.resources),
  };
}

function fluxDeployment(object) {
  const status = object.status || {};
  const history = array(status.history).flatMap(item => {
    const at = timestamp(item.lastReconciled), first = timestamp(item.firstReconciled);
    const revision = revisions(item.metadata?.revision);
    const reason = text(item.lastReconciledStatus);
    if (!at || !revision.length || !reason) return [];
    const result = reason === 'ReconciliationSucceeded' ? 'succeeded' : /Failed$/.test(reason) ? 'failed' : 'recorded';
    return [{ key: 'reconcile:' + JSON.stringify([revision, first || at, reason]), revision, at, startedAt: first,
      state: result, reason, source: 'status.history', count: Number.isSafeInteger(item.totalReconciliations) && item.totalReconciliations > 1 ? item.totalReconciliations : null }];
  }).sort(newest).slice(0, RECORD_LIMIT);
  return { history, resources: fluxResources(status.inventory?.entries) };
}

/* Argo CD initiatedBy: { username } 또는 { automated: true } -> { by } */
function initiator(value) {
  const by = text(value?.username) || (value?.automated === true ? 'automated' : null);
  return by ? { by } : {};
}

function argoRevision(value, sourceCount) {
  if (sourceCount === 1 && text(value?.revision)) return revisions(value.revision);
  if (!Array.isArray(value?.revisions) || value.revisions.length !== sourceCount) return [];
  return value.revisions.every(item => text(item)) ? value.revisions.map(text) : [];
}

function revisions(value) {
  const revision = text(value);
  return revision ? [revision] : [];
}

function sameRevision(a, b) {
  return a.length > 0 && a.length === b.length && a.every((item, index) => item === b[index]);
}

function argoResources(input) {
  return resources(input, item => {
    if (!text(item.name) || !text(item.kind)) return null;
    return { name: text(item.name), namespace: text(item.namespace), group: text(item.group), version: text(item.version),
      kind: text(item.kind), uid: text(item.uid), sync: text(item.status), health: text(item.health?.status) };
  });
}

function fluxResources(input) {
  return resources(input, item => {
    if (typeof item.id !== 'string') return null;
    const [namespace, name, group, kind, extra] = item.id.split('_');
    if (extra !== undefined || !text(name) || !text(kind)) return null;
    return { name, namespace: text(namespace), group: text(group), kind, version: text(item.v) };
  });
}

function resources(input, project) {
  if (!Array.isArray(input)) return { items: [] };
  return { items: input.slice(0, RESOURCE_LIMIT).flatMap(item => item && project(item) || []) };
}

function newest(a, b) {
  return Date.parse(b.at) - Date.parse(a.at);
}

function array(value) {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
}

module.exports = { argoDeployment, fluxDeployment };
