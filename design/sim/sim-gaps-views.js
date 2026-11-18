/*
 * 리소스 종류 보강의 화면: 같은 틀(머리 · 상태 막대 · 종류 막대 · 탭 요약·이벤트·YAML·관련)로 Service·PVC·Job·Secret·Certificate·Helm 릴리스를 그린다.
 * 워크로드 안의 HPA·PDB·조건, Pod 컨테이너 표, 네트워크·파일시스템 막대, 조치 제안 단추도 여기서 만든다. 화면 요소는 kit 구성 요소만 쓴다.
 */
import { services, svcStatus, endpointsOf, pvcs, pvOf, STORAGE_CLASSES, jobs, secrets, certificates, helmReleases, hpaOf, pdbOf, conditionsOf, containersOf, actionsFor, expiresIn, podVolume } from './sim-gaps.js';
import { hash } from './sim-world.js';
import { T0, D, ymd, kubeAge } from './sim-format.js';
import { t as L } from './sim-locale.js';

export const EXTRA_KINDS = [['Service', 'Service'], ['PersistentVolumeClaim', 'PVC'], ['Job', 'Job'], ['Secret', 'Secret'], ['Certificate', 'Certificate']];
export const EXTRA_ICON = { Service: 'k8s-service', PersistentVolumeClaim: 'k8s-pvc', Job: 'k8s-job', Secret: 'k8s-secret', Certificate: 'k8s-secret', HelmRelease: 'k8s-application' };
/* what a read-only agent with the limited role may not watch: the kind's tab shows no count and its list says so */
export const deniedKinds = conn => (conn === 'limited' ? ['Secret', 'Certificate'] : []);

export function createGapViews({ C, html, get, bar, sumBar, statusCell, when, num, chart, cols, eventsOf, eventsTab, head }) {
  const { W1, W15, W2, W25, nameCol, nsCol, ageCol, stCol } = cols; /* the list columns every kind shares (sim-views.js) */
  /* a PVC's STATUS is its phase alone (the use is the Used column's): Bound is healthy, anything else keeps the object's state */
  const pvcPhase = r => [r.status[0], r.status[1].split(' · ')[0]]; /* the phase word, in the claim's own state colour (a Bound claim at 91% is a warning) */
  /* a duration as kubectl prints it (45s, 2m2s, 1h5m) */
  const kdur = sec => { sec = Math.max(0, Math.round(sec)); return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m${sec % 60}s` : `${Math.floor(sec / 3600)}h${Math.floor(sec % 3600 / 60)}m`; };
  const open = (kind, ns, name) => C.button.render({ label: name, variant: 'link', action: 'sim.openRow', arg: { id: `${ns || '_'}/${kind}/${name}` } });

  function rows(kind) {
    const { w, t } = get();
    if (kind === 'Service') return services(w).map(s => ({ ...s, status: svcStatus(w, s) }));
    if (kind === 'PersistentVolumeClaim') return pvcs(w);
    if (kind === 'Job') return jobs(w, t);
    if (kind === 'Secret') return secrets(w);
    if (kind === 'Certificate') return certificates(w);
    return null;
  }
  function columns(kind) {
    if (kind === 'Service') return [nameCol, nsCol, stCol(W25), { id: 'type', label: 'Type', muted: true, width: W2 }, { id: 'clusterIP', label: 'Cluster-IP', muted: true, optional: true, width: W2 }, { id: 'ports', label: 'Port(s)', muted: true, optional: true, width: W25 }, { id: 'selector', label: 'Selector', muted: true, optional: true, width: W25 }, ageCol];
    if (kind === 'PersistentVolumeClaim') return [nameCol, nsCol, { ...stCol(W2), cell: r => statusCell(pvcPhase(r)) }, { id: 'used', label: 'Used', value: true, width: W15, cell: r => r.used >= 85 ? statusCell([r.status[0], `${r.used}%`]) : `${r.used}%` }, { id: 'size', label: 'Capacity', value: true, width: W1, cell: r => `${r.size}Gi` }, { id: 'sc', label: 'StorageClass', muted: true, optional: true, width: W2 }, { id: 'pod', label: 'Used By', muted: true, optional: true, cell: r => r.pod ?? '' }, ageCol];
    if (kind === 'Job') return [nameCol, nsCol, stCol(W2), { id: 'done', label: 'Succeeded', value: true, width: W15, cell: r => num(r.completions) }, { id: 'want', label: 'Completions', value: true, optional: true, width: W15, cell: r => num(r.want) }, { id: 'took', label: 'Duration', value: true, optional: true, width: W2, cell: r => r.status[0] === 'busy' ? '' : kdur(r.took) }, ...(rows('Job').some(r => r.why) ? [{ id: 'why', label: 'Reason', muted: true, optional: true, cell: r => r.why || '' }] : []), { id: 'start', label: 'Start Time', time: true, optional: true, width: W2, cell: r => when(r.start) }];
    if (kind === 'Secret') return [nameCol, nsCol, { id: 'type', label: 'Type', muted: true, width: 'calc(var(--space-16) * 2.6)' }, { id: 'keys', label: 'Data', muted: true, cell: r => r.keys.join(' · ') }, { id: 'exp', label: 'Not After', optional: true, width: W25, cell: r => r.expires == null ? '' : r.status[0] === 'warn' ? statusCell(['warn', ymd(r.expires)]) : ymd(r.expires) }, ageCol];
    if (kind === 'Certificate') return [nameCol, nsCol, { id: 'ready', label: 'Ready', width: W15, fit: true, cell: r => statusCell([r.ready === 'True' ? 'ok' : 'warn', r.ready]) }, { id: 'secret', label: 'Secret', muted: true, width: W2 }, { id: 'issuer', label: 'Issuer', muted: true, optional: true, width: 'calc(var(--space-16) * 3)' }, { id: 'na', label: 'Not After', time: true, optional: true, width: W2, cell: r => ymd(r.notAfter) }, ageCol];
    return null;
  }
  function find(kind, ns, name) {
    const { w } = get();
    if (kind === 'HelmRelease') return helmReleases(w).find(x => x.name === name);
    return rows(kind)?.find(x => x.name === name && (ns === '_' || x.ns === ns)) ?? null;
  }

  /* ---------- 상세: 같은 틀 ---------- */
  const yamlOf = r => {
    const meta = [`metadata:`, `  name: ${r.name}`, ...(r.ns ? [`  namespace: ${r.ns}`] : []), ...(r.finalizers ? ['  finalizers:', ...r.finalizers.map(f => `  - ${f}`)] : []), ...(r.deleting != null ? [`  deletionTimestamp: "${ymd(r.deleting)}T${new Date((T0 + r.deleting) * 1000).toISOString().slice(11, 19)}Z"`] : [])];
    if (r.kind === 'Service') return ['apiVersion: v1', 'kind: Service', ...meta, 'spec:', `  type: ${r.type}`, `  clusterIP: ${r.clusterIP}`, '  selector:', `    app: ${r.target.name}`, '  ports:', `  - port: ${r.ports.split(' ')[1].split('→')[0]}`, `    targetPort: ${r.ports.split('→')[1].split('/')[0]}`].join('\n');
    if (r.kind === 'PersistentVolumeClaim') return ['apiVersion: v1', 'kind: PersistentVolumeClaim', ...meta, 'spec:', '  accessModes: [ReadWriteOnce]', `  storageClassName: ${r.sc}`, '  resources:', '    requests:', `      storage: ${r.size}Gi`, `  volumeName: ${r.volume}`, 'status:', `  phase: Bound`, `  capacity: { storage: ${r.size}Gi }`].join('\n');
    if (r.kind === 'Job') return ['apiVersion: batch/v1', 'kind: Job', ...meta, 'spec:', '  backoffLimit: 4', '  completions: 1', 'status:', `  succeeded: ${r.completions}`, `  failed: ${r.failed}`, ...(r.why ? ['  conditions:', '  - type: Failed', `    reason: ${r.why.split(' ')[0]}`] : [])].join('\n');
    if (r.kind === 'Secret') return ['apiVersion: v1', 'kind: Secret', ...meta, `type: ${r.type}`, 'data:', ...r.keys.map(k => `  ${k}: "${L('sim.g.yaml.unread')}"`)].join('\n');
    if (r.kind === 'Certificate') return ['apiVersion: cert-manager.io/v1', 'kind: Certificate', ...meta, 'spec:', `  secretName: ${r.secret}`, '  issuerRef:', '    kind: ClusterIssuer', '    name: letsencrypt-prod', 'status:', '  conditions:', '  - type: Ready', `    status: "${r.ready}"`, `    message: ${r.reason}`, `  notAfter: "${ymd(r.notAfter)}"`].join('\n');
    if (r.kind === 'HelmRelease') return [`# helm get values ${r.name} -n ${r.ns} (revision ${r.rev})`, ...r.diff.split('\n').filter(l => !l.startsWith('-')).map(l => l.slice(1))].join('\n');
    return '';
  };
  const yamlBar = r => bar('g-yaml', r.kind === 'HelmRelease' ? 'values' : 'YAML', [{ id: 'k', label: '', value: r.kind === 'HelmRelease' ? `revision ${r.rev}` : r.kind }], C.codeBlock.render({ path: r.kind === 'HelmRelease' ? `${r.ns}/${r.name}/values.yaml` : `${r.ns ? r.ns + '/' : ''}${r.kind}/${r.name}.yaml`, syntax: 'yaml', text: yamlOf(r), file: r.kind === 'HelmRelease' ? `${r.name}-values.yaml` : `${r.name}.yaml` }), true);
  const relBar = list => list.length ? bar('g-rel', L('sim.g.rel.title'), [{ id: 'n', label: '', value: String(list.length) }], C.dataTable.render({ clip: true, rowKey: 'id', rows: list.map((x, i) => ({ ...x, id: 'r' + i })), reveal: true, columns: [{ id: 'kind', label: L('sim.g.rel.kind'), width: 'calc(var(--space-16) * 1.8)' }, { id: 'name', label: L('sim.g.name'), cell: x => (x.open ? open(x.kind, x.ns, x.name) : x.name) }, { id: 'why', label: L('sim.g.rel.why'), muted: true, optional: true }] }), true) : '';

  /* a filling volume: days until full at the week's rate (the chart's own slope) */
  const FILL_RATE = 3.1, fillDays = r => (r.used >= 85 ? Math.max(1, Math.round((100 - r.used) / FILL_RATE)) : null);
  const warnLine = text => html`<div class="v-stale">${C.statusIcon.render({ kind: 'warn', text })}</div>`; /* a sub-warning that belongs to one card (HPA at its maximum, PDB that blocks evictions) */
  function detail(r, lines = '') {
    const { S, w, t, sid, cid } = get();
    const head = C.pageHeader.render({ icon: r.icon ?? EXTRA_ICON[r.kind], title: r.name, context: [r.kind, r.ns || null, w.cluster.name].filter(Boolean).join(' · '), size: 'sm', after: r.kind === 'Secret' ? '' : statusCell(r.kind === 'PersistentVolumeClaim' ? pvcPhase(r) : r.status), end: actionButton(r) }); /* the head's state is the list's STATUS column (a Secret has none) */
    let facts = [], sec = '', rel = [];
    if (r.kind === 'Service') {
      const eps = endpointsOf(w, r), nr = eps.filter(e => !e.ready);
      facts = [{ id: 'y', label: 'Type', value: r.type }, { id: 'i', label: 'Cluster IP', value: r.clusterIP }, { id: 'p', label: 'Port', value: r.ports }, ...(r.external ? [{ id: 'e', label: 'External', value: r.external }] : [])];
      sec = bar('g-ep', 'Endpoints', [{ id: 'r', label: 'Ready', value: num(eps.length - nr.length) }, { id: 'n', label: 'NotReady', value: num(nr.length), ...(nr.length ? { tone: 'warn' } : {}) }, { id: 's', label: 'selector', value: r.selector }],
        html`${C.dataTable.render({ clip: true, rowKey: 'id', rows: eps.map(e => ({ ...e, id: `${r.ns}/Pod/${e.pod}` })), rowAction: 'sim.openRow', reveal: true, columns: [{ id: 'pod', label: 'Pod' }, { id: 'ready', label: 'Ready', width: W2, fit: true, cell: e => statusCell(e.ready ? ['ok', 'ready'] : ['warn', 'notReady']) }, { id: 'ip', label: 'IP:Port', muted: true, optional: true, width: W25, cell: e => `${e.ip}:${e.port}` }, { id: 'why', label: 'Reason', muted: true, optional: true, cell: e => e.why || '' }] })}`, true);
      rel = [{ kind: r.target.kind, name: r.target.name, ns: r.ns, why: `selector ${r.selector}`, open: true }, ...(r.external ? [{ kind: 'Ingress', name: r.name, ns: r.ns, why: 'LoadBalancer · ingress-nginx' }] : []), { kind: 'NetworkPolicy', name: `${r.ns}-default-deny`, ns: r.ns, why: L('sim.g.svc.netpol', { ns: r.ns }) }];
    } else if (r.kind === 'PersistentVolumeClaim') {
      const pv = pvOf(r), sc = STORAGE_CLASSES.find(x => x.name === r.sc);
      const useTone = r.used >= 85 ? { tone: r.status[0] === 'error' ? 'danger' : 'warn' } : {}; /* the use wears the object's own state colour, the same in the head and in every card */
      facts = [{ id: 'u', label: L('sim.g.use'), value: `${r.used}%`, ...useTone }, { id: 's', label: 'Capacity', value: `${r.size}Gi` }, { id: 'c', label: 'StorageClass', value: r.sc }, { id: 'm', label: 'Access Modes', value: r.mode }];
      const fill = at => Math.min(99.5, r.used - (r.used >= 85 ? (-at / D) * FILL_RATE : (-at / D) * .4) + .4 * Math.sin(at / 3000));
      const g = chart({ title: L('sim.g.pvc.usage', { name: r.name }), q: `100 * kubelet_volume_stats_used_bytes{persistentvolumeclaim="${r.name}"} / kubelet_volume_stats_capacity_bytes{persistentvolumeclaim="${r.name}"}`, fn: fill, from: t - 7 * D, to: t, unit: '%', refs: [{ value: 85, label: L('sim.g.pvc.limit85'), tone: 'limit' }], fmt: v => v.toFixed(1) + '%', height: 160 });
      const daysLeft = fillDays(r);
      sec = html`${bar('g-use', L('sim.g.pvc.disk'), [{ id: 'u', label: L('sim.g.use'), value: `${r.used}% · ${Math.round(r.size * r.used / 100)}Gi`, ...useTone }, ...(daysLeft ? [{ id: 'f', label: L('sim.g.pvc.fullAt'), value: L('sim.g.pvc.fullIn', { n: daysLeft }) }] : [])], html`${g}`, r.used >= 85)}
        ${bar('g-pv', 'PersistentVolume', [{ id: 'n', label: '', value: pv.name }, { id: 'r', label: 'reclaim', value: pv.reclaim }], C.propertyGrid.render({ items: [{ id: 'c', label: 'Capacity', value: pv.capacity }, { id: 'l', label: 'Claim', value: pv.claim }, { id: 's', label: 'Source', value: pv.source }, { id: 'z', label: 'Zone', value: pv.zone }] }), false)}
        ${bar('g-sc', 'StorageClass', [{ id: 'n', label: '', value: sc.name }, { id: 'p', label: 'provisioner', value: sc.provisioner }], C.propertyGrid.render({ items: [{ id: 'r', label: 'reclaim', value: sc.reclaim }, { id: 'b', label: 'binding', value: sc.binding }, { id: 'e', label: L('sim.g.sc.expand'), value: sc.expand ? 'allowVolumeExpansion true' : L('sim.g.sc.noExpand') }, { id: 'd', label: L('sim.g.sc.default'), value: sc.def ? L('sim.g.sc.isDefault') : L('sim.g.sc.notDefault') }, { id: 'p', label: 'parameters', value: sc.params }] }), false)}`;
      rel = [...(r.pod ? [{ kind: 'Pod', name: r.pod, ns: r.ns, why: L('sim.g.pvc.mountedBy'), open: true }] : []), { kind: r.owner.kind, name: r.owner.name, ns: r.ns, why: r.owner.kind === 'StatefulSet' ? 'volumeClaimTemplates' : 'volume', open: true }, { kind: 'PersistentVolume', name: pv.name, ns: '', why: 'Bound' }, { kind: 'StorageClass', name: r.sc, ns: '', why: 'storageClassName' }];
    } else if (r.kind === 'Job') {
      const bad = r.status[0] === 'error', comp = r.completions ?? (bad ? 0 : 1), fl = r.failed ?? (bad ? 1 : 0), st0 = r.start ?? -(r.age ?? 180), took = r.took ?? null; /* a hook Job from a scenario row carries no counters: read them from its state */
      const done = r.status[0] !== 'busy' && took != null; /* kubectl describe job: the counts by their own names; Duration and Completed At only once it has ended */
      facts = [{ id: 'c', label: 'Succeeded', value: num(comp) }, { id: 'w', label: 'Completions', value: num(r.want ?? 1) }, { id: 'f', label: 'Failed', value: num(fl), ...(fl ? { tone: 'danger' } : {}) }, { id: 's', label: 'Start Time', value: when(st0) }, ...(done ? [{ id: 'd', label: 'Duration', value: kdur(took) }, { id: 'e', label: 'Completed At', value: when(st0 + took) }] : []), ...(r.owner ? [{ id: 'o', label: 'CronJob', value: r.owner.name }] : [])];
      rel = [...(r.owner ? [{ kind: 'CronJob', name: r.owner.name, ns: r.ns, why: 'ownerReferences', open: true }] : []), { kind: 'Pod', name: `${r.name}-${hash(r.name).toString(36).slice(0, 5)}`, ns: r.ns, why: r.status[0] === 'ok' ? 'Completed' : r.status[1] }];
    } else if (r.kind === 'Secret') {
      facts = [{ id: 'y', label: 'Type', value: r.type }, { id: 'k', label: L('sim.g.sec.keys'), value: String(r.keys.length) }, { id: 'a', label: 'Age', value: kubeAge(r.age) }];
      sec = html`${bar('g-keys', L('sim.g.sec.keys'), [{ id: 'n', label: '', value: r.keys.join(' · ') }], C.dataTable.render({ clip: true, rowKey: 'k', rows: r.keys.map(k => ({ k, src: r.type === 'kubernetes.io/tls' ? L('sim.g.sec.tlsKeys') : L('sim.g.sec.fromPod', { app: r.name.replace(/-db$/, '') }) })), columns: [{ id: 'k', label: L('sim.g.sec.keys'), width: 'calc(var(--space-16) * 1.6)' }, { id: 'src', label: L('sim.g.sec.keySource'), muted: true }] }), false)}
        ${r.expires != null ? bar('g-cert', L('sim.g.cert.title'), [{ id: 'e', label: L('sim.g.cert.expires'), value: expiresIn(r.expires), ...(r.status[0] === 'warn' ? { tone: 'warn' } : {}) }, { id: 'c', label: 'CN', value: r.cn }], C.propertyGrid.render({ items: [{ id: 'i', label: L('sim.g.cert.issuer'), value: r.issuer }, { id: 'n', label: 'notAfter', value: ymd(r.expires) }, { id: 'c', label: 'CN', value: r.cn }] }), r.status[0] === 'warn') : ''}`;
      rel = [...(r.type === 'kubernetes.io/tls' ? [{ kind: 'Certificate', name: r.name.replace(/-tls$/, ''), ns: r.ns, why: 'secretName', open: true }, { kind: 'Ingress', name: r.cn.split('.')[0], ns: r.ns, why: 'tls.secretName' }] : [{ kind: 'Deployment', name: r.name.replace(/-db$/, ''), ns: r.ns, why: 'env secretKeyRef', open: !!w.workloads.find(x => x.name === r.name.replace(/-db$/, '') && x.ns === r.ns) }])];
    } else if (r.kind === 'Certificate') {
      facts = [{ id: 'r', label: 'Ready', value: r.ready, ...(r.ready === 'False' ? { tone: 'warn' } : {}) }, { id: 'n', label: L('sim.g.cert.expires'), value: ymd(r.notAfter) }, { id: 'w', label: L('sim.g.cert.renew'), value: ymd(r.renew) }];
      sec = html`${bar('g-pc', 'Certificate', [{ id: 'g', label: '', value: 'certificates.cert-manager.io/v1' }], C.dataTable.render({ clip: true, rowKey: 'name', rows: [{ name: r.name, ready: r.ready, secret: r.secret, issuer: r.issuer, st: r.reason, age: kubeAge(r.age) }], columns: [{ id: 'ready', label: 'Ready', width: W1, fit: true, cell: x => statusCell([x.ready === 'True' ? 'ok' : 'warn', x.ready]) }, { id: 'secret', label: 'Secret', muted: true, width: W2 }, { id: 'issuer', label: 'Issuer', muted: true, optional: true, width: W2 }, { id: 'st', label: 'Status', muted: true }, { id: 'age', label: 'Age', muted: true, width: W1 }] }), true)}`; /* kubectl get certificate -o wide, as it prints */
      rel = [{ kind: 'Secret', name: r.secret, ns: r.ns, why: 'spec.secretName', open: true }, { kind: 'ClusterIssuer', name: 'letsencrypt-prod', ns: '', why: 'issuerRef' }];
    } else if (r.kind === 'HelmRelease') {
      facts = [{ id: 'c', label: 'Chart', value: r.chart }, { id: 'a', label: 'App', value: r.app }, { id: 'r', label: 'Revision', value: String(r.rev) }, { id: 'u', label: L('sim.g.helm.updated'), value: when(r.updated) }];
      sec = html`${bar('g-hist', L('sim.g.helm.hist'), [{ id: 'n', label: '', value: num(r.hist.length) }], C.dataTable.render({ clip: true, rowKey: 'id', rows: r.hist, reveal: true, columns: [{ id: 'rev', label: 'Revision', value: true, width: W15 }, { id: 'chart', label: 'Chart', width: W25, fit: true }, { id: 'status', label: 'Status', width: W2, fit: true, cell: x => statusCell([x.status === 'deployed' ? 'ok' : 'idle', x.status]) }, { id: 'at', label: 'Updated', time: true, optional: true, width: W2, cell: x => when(x.at) }, { id: 'desc', label: 'Description', muted: true }] }), true)}
        ${bar('g-diff', L('sim.g.helm.diff'), [{ id: 'r', label: 'Revision', value: `${r.rev - 1} → ${r.rev}` }], C.codeBlock.render({ path: `values.yaml · rev ${r.rev - 1} → rev ${r.rev}`, text: r.diff, diff: true }), true)}`;
      rel = [{ kind: 'Namespace', name: r.ns, ns: '', why: L('sim.g.helm.installedIn') }, { kind: 'Secret', name: `sh.helm.release.v1.${r.name}.v${r.rev}`, ns: r.ns, why: L('sim.g.helm.record') }];
    }
    const status = sumBar({ label: L('sim.g.status'), open: !['ok', 'idle'].includes(r.status[0]), items: [{ id: 'st', label: '', value: html`<span class="wsc-t">${statusCell(r.kind === 'PersistentVolumeClaim' ? pvcPhase(r) : r.status)}</span>` }, ...facts] });
    const evs = r.kind === 'HelmRelease' ? [] : eventsOf(r);
    const tabs = [['overview', L('sim.g.tab.overview')], ['events', L('sim.view.events')], ['yaml', r.kind === 'HelmRelease' ? 'values' : 'YAML'], ['related', L('sim.g.tab.related')]];
    const tab = tabs.some(([id]) => id === S.dtab) ? S.dtab : 'overview';
    const body = tab === 'overview' ? html`${status}${sec}` : tab === 'events' ? eventsTab(r, evs) : tab === 'yaml' ? yamlBar(r) : relBar(rel);
    return html`${head}${lines}<div class="v-kinds">${C.pillTabs.render({ id: 'sim-dtab', label: L('sim.g.tabs'), value: tab, tabs: tabs.map(([id, label]) => ({ id, label })), action: 'sim.dtab' })}</div>${body}`;
  }

  /* ---------- 워크로드 안: 조건, 그리고 종류별 속성(HPA · PDB) ---------- */
  function conditionBars(r) {
    const { w } = get(), cond = r.kind === 'Deployment' ? conditionsOf(r, w) : null;
    return html`${cond ? bar('g-cond', L('sim.g.cond.title'), cond.map(c => ({ id: c.type, label: c.type, value: c.status, ...(c.status === 'False' ? { tone: 'warn' } : {}) })), C.dataTable.render({ clip: true, rowKey: 'type', rows: cond, reveal: true, columns: [{ id: 'type', label: 'Type', width: W2 }, { id: 'status', label: 'Status', width: W15, fit: true, cell: c => statusCell([c.status === 'True' ? 'ok' : 'warn', c.status]) }, { id: 'reason', label: 'reason', muted: true }, { id: 'at', label: L('sim.g.cond.last'), muted: true, optional: true, width: W2, cell: c => when(c.at) }] }), cond.some(c => c.status === 'False')) : ''}`;
  }
  function propBars(r) {
    const { w, t } = get(); if (!['Deployment', 'StatefulSet'].includes(r.kind)) return '';
    const hpa = hpaOf(r, w, t), pdb = pdbOf(r, w);
    return html`${hpa ? bar('g-hpa', 'HPA', [{ id: 'c', label: 'CPU', value: L('sim.g.hpa.cpu', { cpu: hpa.cpu, target: hpa.target }), ...(hpa.cpu > hpa.target ? { tone: 'warn' } : {}) }, { id: 'r', label: 'replica', value: L('sim.g.hpa.replicas', { n: hpa.replicas, min: hpa.min, max: hpa.max }), ...(hpa.atMax ? { tone: 'warn' } : {}) }], html`${C.propertyGrid.render({ items: [{ id: 'm', label: 'metric', value: L('sim.g.hpa.metric', { target: hpa.target }) }, { id: 's', label: L('sim.g.hpa.last'), value: when(hpa.last) }, { id: 'b', label: 'behavior', value: 'scaleDown stabilization 300s' }] })}${hpa.atMax ? warnLine(L('sim.g.hpa.atMax', { max: hpa.max, cpu: hpa.cpu, target: hpa.target })) : ''}`, hpa.atMax) : ''}
      ${pdb ? bar('g-pdb', 'PDB', [{ id: 'a', label: 'Allowed disruptions', value: String(pdb.allowed), ...(pdb.allowed === 0 ? { tone: 'warn' } : {}) }, { id: 'h', label: L('sim.g.pdb.healthy'), value: L('sim.g.pdb.healthyOf', { n: pdb.healthy, need: pdb.desired }) }], html`${C.propertyGrid.render({ items: [{ id: 'n', label: L('sim.g.name'), value: pdb.name }, { id: 'm', label: 'minAvailable', value: String(pdb.minAvailable) }, { id: 'e', label: L('sim.g.pdb.expected'), value: String(pdb.expected) }] })}${pdb.allowed === 0 ? warnLine(L('sim.g.pdb.blocked')) : ''}`, pdb.allowed === 0) : ''}`;
  }

  /* ---------- Pod 컨테이너: init 먼저, 줄을 펼치면 probe 셋 · env 출처 · mount ---------- */
  function containersBar(p) {
    const { S } = get(), cs = containersOf(p), sel = S.cOpen ?? null;
    const row = c => ({ id: c.name, name: c.init ? `${c.name} (init)` : c.name, st: c.state, restarts: String(c.restarts), last: c.last, image: c.image.split('/').pop() });
    const one = cs.find(c => c.name === sel);
    const more = one ? html`<div class="v-cdet">${C.propertyGrid.render({ items: [...(one.probes.length ? one.probes.map(x => ({ id: x.kind, label: x.kind, value: x.text })) : [{ id: 'p', label: 'probe', value: L('sim.g.none') }]), { id: 'env', label: 'env', value: one.env.map(e => `${e.name} ← ${e.from}`).join(' · ') }, { id: 'mnt', label: 'mount', value: one.mounts.join(' · ') || L('sim.g.none') }] })}
      <div class="dt-acts">${C.button.render({ label: L('sim.g.c.copy'), icon: 'copy', variant: 'ghost', size: 'sm', round: true, menu: 'sim.copyCmd', arg: { pod: `${p.ns}/${p.name}`, c: one.name } })}</div></div>` : '';
    return bar('d-c', L('sim.g.c.title'), [{ id: 'n', label: '', value: `${cs.filter(c => !c.init).length}${cs.some(c => c.init) ? ' · init 1' : ''}` }, { id: 'r', label: L('sim.g.c.restarts'), value: String(p.restarts ?? 0) }, { id: 'q', label: 'QoS', value: p.qos ?? 'Burstable' }],
      html`${C.dataTable.render({ clip: true, rowKey: 'id', rows: cs.map(row), rowAction: 'sim.cOpen', activeKey: sel, reveal: true, columns: [{ id: 'name', label: 'Name' }, { id: 'st', label: 'State', width: W25, fit: true, cell: x => statusCell(x.st) }, { id: 'restarts', label: 'Restarts', value: true, width: W1 }, { id: 'last', label: 'Last State', muted: true, optional: true }, { id: 'image', label: 'Image', muted: true, optional: true }] })}${more}`);
  }

  /* ---------- 네트워크 · 파일시스템 막대(요약의 지표 막대와 같은 틀) ---------- */
  function ioBars(r, pods, from, to) {
    const ps = r.kind === 'Pod' ? [r] : pods; if (!ps.length || r.kind === 'Node') return [];
    const k = ps.length, seed = hash(r.name) % 7, rx = at => k * (0.6 + .4 * Math.sin(at / 1800 + seed) + .15 * Math.sin(at / 300)) * (/api|gateway/.test(r.name) ? 3 : 1), tx = at => rx(at) * 1.6;
    const eph = at => Math.min(95, 12 + seed * 3 + (at - from) / (to - from) * 4);
    const net = chart({ title: L('sim.g.io.netTitle'), q: `sum(rate(container_network_receive_bytes_total{pod=~"${r.kind === 'Pod' ? r.name : r.name + '-.*'}"}[5m]))`, series: [{ key: 'rx', name: L('sim.g.io.rx'), color: '--series-1', fn: rx }, { key: 'tx', name: L('sim.g.io.tx'), color: '--series-2', fn: tx }], from, to, unit: 'MiB/s', fmt: v => v.toFixed(2) + 'MiB/s', height: 160, sync: 'detailRange' });
    const fs = chart({ title: L('sim.g.io.fsTitle'), q: `container_fs_usage_bytes{pod=~"${r.kind === 'Pod' ? r.name : r.name + '-.*'}"} / ephemeral 한도`, fn: eph, from, to, unit: '%', refs: [{ value: 85, label: L('sim.g.io.evict85'), tone: 'limit' }], fmt: v => v.toFixed(1) + '%', height: 160, sync: 'detailRange' });
    /* the heads read the charts' own series over the same window: network in, out, the window's peak and drops; disk use, its amount, the room and how it grew */
    const peak = head.peakIn(rx, from, to), cap = 10, used = eph(to), grew = eph(to) - eph(from), gone = head.down('prometheus');
    if (gone) return [bar('d-mn', L('sim.g.io.net'), [gone], net, false), bar('d-mf', L('sim.g.io.fs'), [gone], fs, false)]; /* a source that is down shows no current value */
    /* a pod with a data volume reads that volume as its claim does (the PVC list's own figure): never a second, different use */
    const vol = ps.length === 1 ? podVolume(get().w, ps[0]) : null;
    if (vol) return [bar('d-mn', L('sim.g.io.net'), [{ id: 'r', label: L('sim.g.io.rx'), value: `${rx(to).toFixed(2)}MiB/s` }, { id: 't', label: L('sim.g.io.tx'), value: `${tx(to).toFixed(2)}MiB/s` }, { id: 'd', label: L('sim.g.io.drop'), value: '0' }], net, false),
      bar('d-mf', 'PVC', [{ id: 'u', label: '', value: `${vol.used}%`, ...(vol.used >= 85 ? { tone: 'warn' } : {}) }, { id: 'a', label: L('sim.g.io.used'), value: `${vol.usedGi}Gi` }, { id: 'c', label: 'Capacity', value: `${vol.size}Gi` }, { id: 'n', label: '', value: vol.claim }],
        C.propertyGrid.render({ items: [{ id: 'c', label: 'Claim', value: open('PersistentVolumeClaim', ps[0].ns, vol.claim) }, { id: 'm', label: 'mountPath', value: vol.mount }] }), vol.used >= 85)];
    return [bar('d-mn', L('sim.g.io.net'), [{ id: 'r', label: L('sim.g.io.rx'), value: `${rx(to).toFixed(2)} MiB/s`, priority: 3 }, { id: 't', label: L('sim.g.io.tx'), value: `${tx(to).toFixed(2)} MiB/s`, priority: 3 }, ...(peak ? [{ id: 'p', label: L('sim.g.io.rxPeak'), value: `${peak.value.toFixed(2)} MiB/s · ${head.atText(peak.at)}` }] : []), { id: 'd', label: L('sim.g.io.drop'), value: '0' }, { ...head.state(false, false), priority: 2 }], net, false),
      bar('d-mf', L('sim.g.io.fs'), [{ id: 'u', label: '', priority: 5, value: `${used.toFixed(0)}%`, ...(used >= 85 ? { tone: 'danger' } : used >= 70 ? { tone: 'warn' } : {}) }, { id: 'a', label: L('sim.g.io.used'), value: `${(cap * used / 100).toFixed(1)}Gi` }, { id: 'c', label: 'Capacity', value: `${cap}Gi`, priority: 3 }, { id: 'g', label: L('sim.g.io.grew'), value: `${grew >= 0 ? '+' : ''}${grew.toFixed(1)}%p` }, head.state(used >= 85, used >= 70, used >= 85 ? L('sim.g.io.evict85') : null)], fs, false)];
  }

  /* ---------- 조치 제안: 명령 계획으로만 ---------- */
  function actionButton(r) {
    const { w } = get(); if (r.status?.[0] === 'idle' && r.kind === 'Node' || !actionsFor(r, w).length) return ''; /* a deleted node has nothing to act on */
    return C.button.render({ label: L('sim.g.act'), icon: 'group-check', variant: 'secondary', size: 'sm', round: true, menu: 'sim.actMenu', arg: `${r.ns || '_'}/${r.kind}/${r.name}` });
  }

  /* why a kind of these is in trouble, and what Wake cannot read about it: lines of the head card under the head, one place for every kind */
  function whyOf(r) {
    const { w } = get();
    if (r.kind === 'Service') { const nr = endpointsOf(w, r).filter(e => !e.ready); return nr.length ? nr.map(e => `Endpoint ${e.pod}${e.why ? ` · ${e.why}` : ''}`).join(', ') : null; } /* the endpoints that are not ready, by their pod and why: not the head's state again */
    if (r.kind === 'PersistentVolumeClaim') return r.status[1] === 'Terminating' ? L('sim.g.term', { since: when(r.deleting), fin: r.finalizers.join(', '), pod: r.pod ?? L('sim.g.none') }) : fillDays(r) ? L('sim.g.pvc.growing', { n: fillDays(r), rate: FILL_RATE }) : null;
    if (r.kind === 'Job') return r.why || null;
    if (r.kind === 'Certificate') return r.ready === 'False' ? r.reason : null;
    return null;
  }
  const notesOf = () => [];
  const css = `.v-cdet { display: grid; gap: var(--space-2); padding-block-start: var(--space-2); }`;
  return { rows, columns, find, detail, whyOf, notesOf, conditionBars, propBars, containersBar, ioBars, actionButton, css };
}
