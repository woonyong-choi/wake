/* 전체 인스펙터 4종(ReplicaSet, CronJob, HPA, PVC)의 관계 자료와 구역 그리기.
   관계는 같은 namespace의 UID 직접 결속만 쓰고, 목록은 INSPECTOR_LIMIT까지만 그린다. 없는 값은 만들지 않는다. */
import { compareResources, compareHistory } from '../data/table-order.js';
import { KIND_LIST, restartsColumn } from '../data/kinds.js';

const INSPECTOR_LIMIT = 50;
export const INSPECTOR_READ = { replicasets: 'pods', persistentvolumeclaims: 'pods', cronjobs: 'jobs' };

const short = 'var(--space-16)', medium = 'calc(var(--space-16) + var(--space-12))';
const text = value => typeof value === 'string' && value.length > 0;
const bounded = (items, limit = INSPECTOR_LIMIT) => ({ items: items.slice(0, limit), total: items.length });
const sameScope = (row, item) => text(row.uid) && text(row.ns) && item.ns === row.ns;
const controllerOf = item => {
  const refs = (Array.isArray(item.ownerReferences) ? item.ownerReferences : []).filter(ref => ref?.controller === true);
  return refs.length === 1 ? refs[0] : null;
};

/* 컨트롤러 소유자(controller=true인 참조 하나) */
export const controllerOwner = row => controllerOf(row);

/* ReplicaSet의 Pod: 직접 controller UID가 같은 Pod */
export const replicaSetPods = (row, pods) => bounded(pods.filter(pod => sameScope(row, pod) && controllerOf(pod)?.uid === row.uid && controllerOf(pod).kind === 'ReplicaSet' && controllerOf(pod).apiVersion === 'apps/v1' && controllerOf(pod).name === row.name).sort(compareResources));

/* CronJob의 Job: 직접 controller UID가 같은 Job, 시작 시각 최신순 */
export const cronJobRuns = (row, jobs) => bounded(jobs
  .filter(job => sameScope(row, job) && controllerOf(job)?.uid === row.uid && controllerOf(job).kind === 'CronJob' && controllerOf(job).apiVersion === 'batch/v1' && controllerOf(job).name === row.name)
  .sort((a, b) => compareHistory(a, b, job => job.startTime || job.createdAt)));

/* PVC를 마운트한 Pod: Pod spec.volumes의 claimName(행 정규화의 claims) */
export const claimConsumers = (row, pods) => bounded(pods.filter(pod => text(row.ns) && pod.ns === row.ns && Array.isArray(pod.claims) && pod.claims.includes(row.name)).sort(compareResources));

const SOURCE = { Resource: 'resource', ContainerResource: 'containerResource', Pods: 'pods', Object: 'object', External: 'external' };
const metricOf = m => {
  const body = m?.[SOURCE[m?.type]];
  const name = m?.type === 'Resource' ? body?.name : m?.type === 'ContainerResource' ? body?.name : body?.metric?.name;
  return { key: [m?.type, name, m?.type === 'ContainerResource' ? body?.container : ''].join('|'), label: m?.type === 'ContainerResource' ? `${name}/${body?.container}` : name || m?.type || '', body };
};
const amount = (value, kind) => value?.[kind]?.averageUtilization != null ? `${value[kind].averageUtilization}%` : value?.[kind]?.averageValue ?? value?.[kind]?.value ?? null;

/* spec.metrics(Target)와 status.currentMetrics(Current)를 종류·이름(·컨테이너)으로 맞춘 표 */
export function hpaMetricRows(raw) {
  const current = new Map((raw?.status?.currentMetrics || []).map(m => [metricOf(m).key, amount(metricOf(m).body, 'current')]));
  return (raw?.spec?.metrics || []).map(m => { const { key, label, body } = metricOf(m);
    return { id: key, metric: label, type: m.type, current: current.get(key) ?? null, target: amount(body, 'target') }; });
}

/* scaleTargetRef -> 열 수 있는 종류의 주소 조각. 모르는 종류는 글자만 */
export function scaleTarget(raw) {
  const ref = raw?.spec?.scaleTargetRef;
  if (!text(ref?.kind) || !text(ref?.name)) return null;
  const kind = KIND_LIST.find(item => item.kind === ref.kind && ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(item.kind) && (!ref.apiVersion || ref.apiVersion === item.api));
  return { kind: ref.kind, name: ref.name, plural: kind?.plural || null };
}

/* 종류별 속성 카드(시뮬레이션 상세의 카드 하나씩: 머리 값과 구분선 행 본문). env: { C, html, t, status, r, state, address, card }
   — state: { read: 'ready'|'loading'|'forbidden'|'error', rows }, card(key, label, items, body, open): 상세의 접히는 카드 */
export function inspectorSections(kind, env) {
  const { C, html, t, status, r, state, address, card } = env;
  const link = (label, plural, name, uid) => C.button.render({ label, variant: 'link', action: 'kit.navigate', arg: { address: address(plural, name, uid) } });
  const line = text => C.emptyState.render({ title: text, variant: 'line' });
  const note = (read, empty) => read === 'forbidden' ? C.statusIcon.render({ kind: 'perm', text: t('wake.inspector.forbidden') }) : read === 'error' ? C.statusIcon.render({ kind: 'error', text: t('wake.inspector.error') })
    : read === 'loading' ? C.statusIcon.render({ kind: 'busy', text: t('wake.res.loading') }) : line(empty);
  const more = list => list.total > list.items.length ? C.statusIcon.render({ kind: 'idle', text: t('wake.inspector.bounded', { n: list.total, m: list.items.length }) }) : '';
  const podTable = (key, list, title, empty) => card(key, title, [{ id: 'n', label: '', value: String(list.total) }, { id: 'b', label: t('wake.rv.bad'), value: String(list.items.filter(p => ['warn', 'danger'].includes(p.status?.[0])).length) }],
    state.read !== 'ready' || !list.items.length ? note(state.read, empty) : html`${C.dataTable.render({ clip: true, rowKey: 'name', rows: list.items, reveal: true, columns: [
      { id: 'name', label: 'Name', lead: () => ({ icon: 'k8s-pod' }), cell: p => link(p.name, 'pods', p.name, p.uid) },
      { id: 'status', label: 'Status', width: medium, fit: true, cell: p => status(p.status) }, { id: 'ready', label: 'Ready', width: short, kind: 'number' },
      restartsColumn({ width: short }),
    ] })}${more(list)}`);
  if (kind === 'replicasets') {
    const owner = controllerOwner(r), plural = owner && KIND_LIST.find(item => item.kind === owner.kind && item.api === owner.apiVersion)?.plural;
    return html`${podTable('i-pods', state.rows || { items: [], total: 0 }, 'Pod', t('wake.inspector.emptyPods'))}${owner ? card('i-owner', 'Controlled By', [{ id: 'k', label: '', value: owner.kind }],
      C.propertyGrid.render({ items: [{ id: 'name', label: owner.kind, value: plural ? link(owner.name, plural, owner.name, owner.uid) : owner.name }, { id: 'uid', label: 'UID', value: owner.uid || '' }].filter(x => x.value) })) : ''}`;
  }
  if (kind === 'horizontalpodautoscalers') {
    const rows = hpaMetricRows(r.raw), target = scaleTarget(r.raw);
    return html`${card('i-metrics', t('wake.inspector.metrics'), [{ id: 'n', label: '', value: String(rows.length) }], rows.length ? C.dataTable.render({ clip: true, rowKey: 'id', rows, columns: [
      { id: 'metric', label: t('wake.inspector.metric') }, { id: 'type', label: 'Type', muted: true, width: medium },
      { id: 'current', label: t('wake.inspector.current'), kind: 'number', width: medium, cell: m => m.current ?? '' }, { id: 'target', label: t('wake.inspector.targetValue'), kind: 'number', width: medium, cell: m => m.target ?? '' },
    ] }) : line(t('wake.inspector.noMetrics')))}${target ? card('i-target', t('wake.inspector.target'), [{ id: 'k', label: '', value: target.kind }],
      C.propertyGrid.render({ items: [{ id: 'name', label: target.kind, value: target.plural ? link(target.name, target.plural, target.name) : target.name }] })) : ''}`;
  }
  if (kind === 'persistentvolumeclaims') {
    const spec = r.raw?.spec || {}, observed = r.raw?.status || {};
    const items = [
      { id: 'volume', label: t('wake.inspector.volumeName'), value: spec.volumeName }, { id: 'class', label: 'StorageClass', value: spec.storageClassName },
      { id: 'capacity', label: t('wake.inspector.boundCapacity'), value: observed.capacity?.storage }, { id: 'modes', label: t('wake.inspector.accessModes'), value: (observed.accessModes || spec.accessModes || []).join(', ') },
      { id: 'mode', label: t('wake.inspector.volumeMode'), value: spec.volumeMode },
    ].filter(x => x.value);
    return html`${card('i-pv', 'PersistentVolume', spec.volumeName ? [{ id: 'n', label: '', value: spec.volumeName }] : [{ id: 'u', label: '', value: t('wake.inspector.unbound') }], items.length ? C.propertyGrid.render({ items }) : line(t('wake.inspector.unbound')), false)}${podTable('i-consumers', state.rows || { items: [], total: 0 }, t('wake.inspector.consumers'), t('wake.inspector.emptyConsumers'))}`;
  }
  return '';
}

/* 구성(spec의 운영 값): 종류별 속성의 카드 하나. 값이 없는 줄은 빠진다 */
export function inspectorConfiguration(kind, { C, t, raw, card }) {
  const spec = raw?.spec || {};
  const configs = {
    replicasets: { replicas: spec.replicas, minReadySeconds: spec.minReadySeconds, image: spec.template?.spec?.containers?.map(c => c.image).filter(Boolean).join(', ') },
    cronjobs: { schedule: spec.schedule, timeZone: spec.timeZone, suspend: spec.suspend, concurrencyPolicy: spec.concurrencyPolicy,
      startingDeadlineSeconds: spec.startingDeadlineSeconds, successfulJobsHistoryLimit: spec.successfulJobsHistoryLimit, failedJobsHistoryLimit: spec.failedJobsHistoryLimit },
    horizontalpodautoscalers: { minReplicas: spec.minReplicas, maxReplicas: spec.maxReplicas, scaleUpStabilization: spec.behavior?.scaleUp?.stabilizationWindowSeconds,
      scaleDownStabilization: spec.behavior?.scaleDown?.stabilizationWindowSeconds },
    persistentvolumeclaims: { storageClass: spec.storageClassName, request: spec.resources?.requests?.storage, volumeMode: spec.volumeMode, accessModes: spec.accessModes?.join(', ') },
  };
  /* 참·거짓은 요약 막대·목록과 같은 kubectl get 표기(True/False, A3-11) */
  const items = Object.entries(configs[kind] || {}).filter(([, value]) => value != null && value !== '').map(([id, value]) => ({
    id, label: t('wake.inspector.config.' + id), value: typeof value === 'boolean' ? (value ? 'True' : 'False') : value,
  }));
  /* 닫힌 카드 머리: 그 종류에서 먼저 볼 설정 값(요약 막대에 이미 있는 Schedule·Suspend는 빼고), 좁으면 뒤에서부터 접힘 */
  const head = items.filter(i => (CONFIG_HEAD[kind] || []).includes(i.id)).map((i, k, all) => ({ id: i.id, label: i.label, value: i.value, priority: all.length - k }));
  return items.length ? card('i-config', t('wake.detail.configuration'), head, C.propertyGrid.render({ items }), false) : '';
}
const CONFIG_HEAD = { replicasets: ['replicas', 'minReadySeconds'], cronjobs: ['concurrencyPolicy', 'successfulJobsHistoryLimit', 'failedJobsHistoryLimit'], horizontalpodautoscalers: ['minReplicas', 'maxReplicas'], persistentvolumeclaims: ['storageClass', 'request'] };
