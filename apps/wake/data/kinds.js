/*
 * 리소스 종류 표(데이터): 실제 클러스터(메인 프로세스가 읽은 원본 객체)가 이 표로 목록 행·상세 값이 된다.
 * 종류마다: API 경로, 아이콘, 묶음, 목록 열(kubectl 원문 머리글), 원본 -> 행, 상세 탭 순서, 관계(소유자·선택자).
 * 분수(2/3) 대신 개수를 따로 둔다(Ready 2 · Desired 3). Secret은 읽지 않는다(Secret 읽기 꺼짐).
 * 논리 검사: kinds.test.mjs
 */

/* 상태 [색조, 원문, 진행 중]: 진행 중인 상태는 도는 고리 + 흐린 글자(정상은 아이콘만, 이름이 의미 있는 상태는 글자 배지) */
const LIVE = new Set(['Progressing', 'Terminating', 'ContainerCreating', 'PodInitializing', 'Pending', 'Running', 'Syncing']);
/* 진행 중인지는 이름으로 정함: 어디서 만든 짝이든 같은 표시 */
export const isLive = (tone, text) => tone !== 'ok' && tone !== 'danger' && LIVE.has(text);
export const st = (tone, text) => (tone === 'ok' ? [tone, text] : [tone, text, isLive(tone, text)]);

export function age(t, now = Date.now()) {
  if (!t) return 'Unknown';
  const elapsedMs = now - Date.parse(t);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'Unknown';
  /* kubectl get의 Age(apimachinery duration.HumanDuration): 내림, 짧은 구간은 두 단위(2m30s · 5h40m · 2d15h · 2y1d) */
  const s = Math.floor(elapsedMs / 1000), m = Math.floor(s / 60), h = Math.floor(s / 3600), d = Math.floor(h / 24);
  const two = (a, ua, b, ub) => (b ? `${a}${ua}${b}${ub}` : `${a}${ua}`);
  return s < 120 ? `${s}s` : m < 10 ? two(m, 'm', s % 60, 's') : m < 180 ? `${m}m` : h < 8 ? two(h, 'h', m % 60, 'm') : h < 48 ? `${h}h`
    : h < 192 ? two(d, 'd', h % 24, 'h') : h < 24 * 365 * 2 ? `${d}d` : h < 24 * 365 * 8 ? two(Math.floor(d / 365), 'y', d % 365, 'd') : `${Math.floor(d / 365)}y`;
}

/* Restarts 열(kubectl get pods 원문 형식): '1 (5m ago)'. 한 셀 = 한 의미: 숫자와 마지막 재시작 경과만, 0보다 크면 숫자에 주의 톤(아이콘 없음).
   마지막 종료 사유(Completed · OOMKilled · Error)는 툴팁과 Pod 상세의 Last State에만 */
export const restartsText = (r, now = Date.now()) => { const n = r?.restarts ?? 0; if (!n) return '0'; const ago = r.lastRestartAt ? age(r.lastRestartAt, now) : ''; return ago && ago !== 'Unknown' ? `${n} (${ago} ago)` : String(n); };
export const restartsColumn = (extra = {}) => ({ id: 'restarts', label: 'Restarts', kind: 'number', fit: true, ...extra,
  cell: r => restartsText(r), tone: r => ((r?.restarts ?? 0) > 0 ? 'warn' : null),
  tip: r => (r?.lastExit ? [`Last State: ${r.lastExit}`, r.lastRestartAt ? `Finished: ${r.lastRestartAt}` : ''].filter(Boolean).join(' · ') : '') });

/* 수량 읽기: CPU는 millicore, 메모리는 Mi */
export const cpuM = v => /m$/.test(v) ? parseFloat(v) : /n$/.test(v) ? parseFloat(v) / 1e6 : parseFloat(v) * 1000;
export const memMi = v => { const n = parseFloat(v); return /Ki$/.test(v) ? n / 1024 : /Mi$/.test(v) ? n : /Gi$/.test(v) ? n * 1024 : n / 1048576; };
/* Pod의 requests 합(컨테이너 spec): { cpu: m, memory: Mi }, 값이 없는 컨테이너는 0 */
const requestsOf = specs => ({ cpu: specs.reduce((a, c) => a + (c.resources?.requests?.cpu ? cpuM(c.resources.requests.cpu) : 0), 0), memory: specs.reduce((a, c) => a + (c.resources?.requests?.memory ? memMi(c.resources.requests.memory) : 0), 0) });

const sidecarsOf = pod => (pod.spec?.initContainers || []).filter(container => container.restartPolicy === 'Always');

/* Pod STATUS: kubectl get pods와 같은 판정. 컨테이너의 대기·종료 사유가 phase보다 앞섬, 초기화 중이면 Init:… */
export function podStatus(p) {
  const s = p.status || {}, init = s.initContainerStatuses || [], cs = s.containerStatuses || [];
  const end = t => t.reason || (t.signal ? `Signal:${t.signal}` : `ExitCode:${t.exitCode}`);
  const phase = s.reason || s.phase || 'Pending';
  let reason = phase, initializing = false;
  const sidecars = new Set(sidecarsOf(p).map(container => container.name));
  const initialized = s.conditions?.some(condition => condition.type === 'Initialized' && condition.status === 'True');
  for (const c of init) {
    const w = c.state?.waiting, t = c.state?.terminated;
    if (t?.exitCode === 0 || sidecars.has(c.name) && c.started === true) continue;
    initializing = true;
    reason = t ? `Init:${end(t)}` : w?.reason && w.reason !== 'PodInitializing' ? `Init:${w.reason}` : 'PodInitializing';
    break;
  }
  if (!initializing || initialized) {
    reason = phase;
    let running = false;
    for (const c of [...cs].reverse()) {
      const w = c.state?.waiting, t = c.state?.terminated;
      if (w?.reason) reason = w.reason; else if (t) reason = end(t); else if (c.state?.running && c.ready) running = true;
    }
    if (reason === 'Completed' && running) reason = (s.conditions || []).some(x => x.type === 'Ready' && x.status === 'True') ? 'Running' : 'NotReady';
  }
  if (p.metadata?.deletionTimestamp) reason = s.reason === 'NodeLost' ? 'Unknown' : 'Terminating';
  if (reason === 'Succeeded' || (reason === 'Completed' && s.phase === 'Succeeded')) return st('neutral', 'Completed');
  if (reason === 'Running') {
    const sidecarsReady = [...sidecars].every(name => init.some(container => container.name === name && container.started === true && container.ready));
    const podNotReady = s.conditions?.some(condition => condition.type === 'Ready' && condition.status !== 'True');
    return cs.every(container => container.ready) && sidecarsReady && !podNotReady ? st('ok', 'Running') : st('warn', 'Running');
  }
  if (['Pending', 'ContainerCreating', 'PodInitializing', 'Terminating', 'NotReady'].includes(reason)) return st('warn', reason);
  return st(['Running', 'Completed'].includes(reason) ? 'ok' : 'danger', reason);
}

export function timestampState(at, now) {
  if (!at) return 'missing';
  if (!Number.isFinite(Date.parse(at))) return 'invalid';
  if (!Number.isFinite(now)) return 'invalid-reference';
  return Date.parse(at) > now ? 'future' : 'valid';
}

const meta = (o, now) => ({ createdAt: o.metadata?.creationTimestamp ?? null, ageState: timestampState(o.metadata?.creationTimestamp, now), name: o.metadata?.name || '', ns: o.metadata?.namespace || '', age: age(o.metadata?.creationTimestamp, now), labels: o.metadata?.labels || {}, annotations: o.metadata?.annotations || {},
  uid: o.metadata?.uid ?? null, apiVersion: o.apiVersion ?? null, kind: o.kind ?? null,
  ownerReferences: o.metadata && (o.metadata.ownerReferences == null || Array.isArray(o.metadata.ownerReferences)) ? (o.metadata.ownerReferences || []).map(ref => ({ ...ref })) : null,
  owner: (o.metadata?.ownerReferences || [])[0] ? { ...o.metadata.ownerReferences[0] } : null });
const image = spec => (spec?.containers || []).map(c => c.image).join(', ');
/* 이미지 이름의 마지막 칸(레지스트리 경로를 뺀 이름:태그): 목록의 Image 열 */
const imageShort = spec => (spec?.containers || []).map(c => String(c.image || '').split('/').pop()).join(', ');
const pairs = o => Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join(', ');
/* Argo CD가 추적하는 리소스의 Application(추적 주석 <app>:<group>/<kind>:<ns>/<name>, 앱 이름이 <ns>_<name>이면 이름만) */
const trackedApp = o => { const app = /^([^:]+):/.exec(o.metadata?.annotations?.['argocd.argoproj.io/tracking-id'] || '')?.[1] || o.metadata?.labels?.['argocd.argoproj.io/instance'] || ''; return app.includes('_') ? app.slice(app.indexOf('_') + 1) : app; };
const NODE_GROUP = ['eks.amazonaws.com/nodegroup', 'cloud.google.com/gke-nodepool', 'kubernetes.azure.com/agentpool', 'karpenter.sh/nodepool', 'node.kubernetes.io/nodegroup'];
const conds = o => (o.status?.conditions || []).map(c => ({ type: c.type, status: c.status, reason: c.reason || '', message: c.message || '' }));
const workload = (o, want, ready, avail, upd) => {
  const tone = avail >= want ? 'ok' : avail === 0 && want > 0 ? 'danger' : 'warn';
  return st(tone, tone === 'ok' ? 'Available' : tone === 'danger' ? 'Unavailable' : 'Progressing');
};

/* 원본 -> 행. 모든 행: name, ns, age, status [색조, 원문, 진행 중], 그 밖은 종류마다 */
const ROW = {
  pods: (p, now) => {
    const sidecars = sidecarsOf(p), names = new Set(sidecars.map(container => container.name));
    const runningSidecars = (p.status?.initContainerStatuses || []).filter(container => names.has(container.name));
    const cs = [...(p.status?.containerStatuses || []), ...runningSidecars];
    const specs = [...(p.spec?.containers || []), ...sidecars];
    const last = cs.map(container => container.lastState?.terminated?.reason).find(Boolean);
    const lastAt = cs.map(container => container.lastState?.terminated?.finishedAt).filter(Boolean).sort().at(-1) || null;
    return { ...meta(p, now), status: podStatus(p), phase: p.status?.phase ?? null, ready: cs.filter(container => container.ready && (!names.has(container.name) || container.started === true)).length,
      containers: specs.length, requests: requestsOf(specs), restarts: cs.reduce((n, c) => n + (c.restartCount || 0), 0),
      readyBool: specs.length > 0 && cs.filter(container => container.ready).length >= specs.length ? 'True' : 'False', qos: p.status?.qosClass || '',
      controlledBy: (p.metadata?.ownerReferences || [])[0] ? `${p.metadata.ownerReferences[0].kind}/${p.metadata.ownerReferences[0].name}` : '',
      node: p.spec?.nodeName || '', claims: (p.spec?.volumes || []).map(volume => volume.persistentVolumeClaim?.claimName).filter(text => typeof text === 'string' && text), ip: p.status?.podIP || '', lastExit: last || '', lastRestartAt: lastAt, image: image(p.spec), conditions: conds(p),
      containerList: specs.map(c => { const s = cs.find(x => x.name === c.name) || {}; const w = s.state?.waiting, t = s.state?.terminated;
        const end = s.lastState?.terminated;
        const state = w ? w.reason || 'Waiting' : t ? t.reason || (t.exitCode === 0 ? 'Completed' : 'Terminated') : s.state?.running ? 'Running' : 'Waiting';
        const failed = t ? t.exitCode != null && t.exitCode !== 0 || t.reason === 'Error' || t.reason === 'OOMKilled'
          : w && ['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerError', 'CreateContainerConfigError', 'RunContainerError', 'ContainerStatusUnknown'].includes(state);
        const status = st(failed ? 'danger' : s.ready || t?.exitCode === 0 ? 'ok' : t ? 'neutral' : 'warn', state);
        return { name: c.name, image: s.image || c.image, state, status,
          ready: !!s.ready, restarts: s.restartCount || 0, last: end?.reason || '', lastFinishedAt: end?.finishedAt, lastExitCode: end?.exitCode }; }) };
  },
  deployments: (d, now) => { const want = d.spec?.replicas ?? 1, s = d.status || {};
    return { ...meta(d, now), status: workload(d, want, s.readyReplicas || 0, s.availableReplicas || 0), ready: s.readyReplicas || 0, desired: want, upToDate: s.updatedReplicas || 0, available: s.availableReplicas || 0,
      image: image(d.spec?.template?.spec), imageShort: imageShort(d.spec?.template?.spec), strategy: d.spec?.strategy?.type || '', selector: d.spec?.selector?.matchLabels || {},
      revision: d.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? '', application: trackedApp(d), conditions: conds(d) }; },
  statefulsets: (d, now) => { const want = d.spec?.replicas ?? 1, s = d.status || {};
    const claims = d.spec?.volumeClaimTemplates || [];
    return { ...meta(d, now), status: workload(d, want, s.readyReplicas || 0, s.readyReplicas || 0), ready: s.readyReplicas || 0, desired: want, upToDate: s.updatedReplicas || 0,
      service: d.spec?.serviceName || '', pvc: claims.length ? [claims.length, claims[0].spec?.resources?.requests?.storage].filter(Boolean).join(' · ') : '', updateStrategy: d.spec?.updateStrategy?.type || '',
      image: image(d.spec?.template?.spec), imageShort: imageShort(d.spec?.template?.spec), selector: d.spec?.selector?.matchLabels || {}, application: trackedApp(d), conditions: conds(d) }; },
  daemonsets: (d, now) => { const s = d.status || {}, want = s.desiredNumberScheduled || 0;
    return { ...meta(d, now), status: workload(d, want, s.numberReady || 0, s.numberAvailable || 0), desired: want, current: s.currentNumberScheduled || 0, ready: s.numberReady || 0, upToDate: s.updatedNumberScheduled || 0, available: s.numberAvailable || 0,
      nodeSelector: pairs(d.spec?.template?.spec?.nodeSelector), image: image(d.spec?.template?.spec), selector: d.spec?.selector?.matchLabels || {}, conditions: conds(d) }; },
  jobs: (j, now) => { const s = j.status || {}, want = j.spec?.completions ?? 1, failed = (s.conditions || []).some(c => c.type === 'Failed' && c.status === 'True'), done = (s.conditions || []).some(c => c.type === 'Complete' && c.status === 'True');
    const dur = s.startTime ? Math.round(((s.completionTime ? Date.parse(s.completionTime) : now) - Date.parse(s.startTime)) / 1000) : null;
    const suspended = j.spec?.suspend === true || (s.conditions || []).some(c => c.type === 'Suspended' && c.status === 'True');
    return { ...meta(j, now), status: failed ? st('danger', 'Failed') : done ? st('ok', 'Complete') : suspended ? st('neutral', 'Suspended') : st('warn', 'Running'), startTime: s.startTime || '', completionTime: s.completionTime || '', succeeded: s.succeeded || 0, completions: want, failedPods: s.failed || 0,
      duration: !Number.isFinite(dur) || dur < 0 ? '' : dur < 120 ? `${dur}s` : `${Math.round(dur / 60)}m`, failedReason: (s.conditions || []).find(c => c.type === 'Failed' && c.status === 'True')?.reason || '', image: image(j.spec?.template?.spec), selector: j.spec?.selector?.matchLabels || {}, conditions: conds(j) }; },
  replicasets: (r, now) => { const s = r.status || {}, num = v => Number.isFinite(v) ? v : null, desired = num(r.spec?.replicas), current = num(s.replicas);
    /* readyReplicas·availableReplicas는 0이면 API가 생략: 관측된 status(replicas 있음)일 때만 생략을 0으로 읽는다 */
    const ready = current == null ? null : num(s.readyReplicas) ?? 0, available = current == null ? null : num(s.availableReplicas) ?? 0;
    const failed = (s.conditions || []).some(c => c.type === 'ReplicaFailure' && c.status === 'True');
    const status = failed ? st('danger', 'ReplicaFailure') : desired == null || current == null ? st('neutral', 'Unknown') : desired === 0 && current === 0 ? st('neutral', 'Scaled to 0')
      : ready >= desired && available >= desired ? st('ok', 'Available') : ready === 0 && desired > 0 ? st('danger', 'Unavailable') : st('warn', 'Progressing');
    const owner = (r.metadata?.ownerReferences || []).find(ref => ref?.controller === true);
    return { ...meta(r, now), status, desired, current, ready, available, owner: owner ? `${owner.kind}/${owner.name}` : '', revision: r.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? '',
      image: image(r.spec?.template?.spec), selector: r.spec?.selector?.matchLabels || {}, conditions: conds(r) }; },
  cronjobs: (c, now) => { const s = c.status || {}, suspend = typeof c.spec?.suspend === 'boolean' ? c.spec.suspend : null, active = (s.active || []).length;
    const status = suspend === true ? st('neutral', 'Suspended') : !c.spec?.schedule ? st('neutral', 'Unknown') : active > 0 ? st('warn', 'Running') : s.lastScheduleTime ? st('ok', 'Scheduled') : st('neutral', 'Never scheduled');
    return { ...meta(c, now), status, schedule: c.spec?.schedule || '', timeZone: c.spec?.timeZone || '', suspend, active, activeJobs: (s.active || []).map(ref => ref.name).filter(Boolean).join(', '),
      lastSchedule: s.lastScheduleTime ? age(s.lastScheduleTime, now) : '', lastSuccess: s.lastSuccessfulTime ? age(s.lastSuccessfulTime, now) : '',
      lastScheduleAt: s.lastScheduleTime || '', lastSuccessAt: s.lastSuccessfulTime || '', suspendText: suspend == null ? '' : suspend ? 'True' : 'False', concurrency: c.spec?.concurrencyPolicy || '', image: image(c.spec?.jobTemplate?.spec?.template?.spec), conditions: conds(c) }; },
  horizontalpodautoscalers: (h, now) => { const s = h.status || {}, num = v => Number.isFinite(v) ? v : null, cs = h.status?.conditions || [], flag = type => cs.find(c => c.type === type)?.status;
    const target = m => m?.target?.averageUtilization != null ? `${m.target.averageUtilization}%` : m?.target?.averageValue ?? m?.target?.value ?? '';
    const metricName = m => m.type === 'Resource' ? m.resource?.name : m.type === 'ContainerResource' ? `${m.containerResource?.name}/${m.containerResource?.container}` : m.type === 'Pods' ? m.pods?.metric?.name : m.type === 'Object' ? m.object?.metric?.name : m.type === 'External' ? m.external?.metric?.name : m.type;
    const spec = (h.spec?.metrics || []).map(m => ({ name: metricName(m), target: target(m[{ Resource: 'resource', ContainerResource: 'containerResource', Pods: 'pods', Object: 'object', External: 'external' }[m.type]]) }));
    const cur = (s.currentMetrics || []).map(m => ({ name: metricName(m), value: (v => v?.current?.averageUtilization != null ? `${v.current.averageUtilization}%` : v?.current?.averageValue ?? v?.current?.value ?? '')(m[{ Resource: 'resource', ContainerResource: 'containerResource', Pods: 'pods', Object: 'object', External: 'external' }[m.type]]) }));
    /* 현재 값은 status.currentMetrics에 있는 것만(없으면 unknown, 추정 없음) */
    const targets = spec.filter(m => m.name).map(m => `${m.name}: ${cur.find(c => c.name === m.name)?.value || 'unknown'}/${m.target || 'unknown'}`).join(', ');
    /* ScalingLimited=True·TooFewReplicas는 minReplicas에 머문 정상 상태(부하가 적음). 경고는 maxReplicas 등 다른 제한일 때만 */
    const limited = cs.find(c => c.type === 'ScalingLimited' && c.status === 'True' && c.reason !== 'TooFewReplicas');
    const status = flag('ScalingActive') === 'False' || flag('AbleToScale') === 'False' ? st('danger', flag('AbleToScale') === 'False' ? 'Unable to scale' : 'Not active') : !cs.length ? st('neutral', 'Unknown')
      : limited ? st('warn', 'Limited') : flag('ScalingActive') === 'True' && flag('AbleToScale') === 'True' ? st('ok', 'Active') : st('neutral', 'Unknown');
    const ref = h.spec?.scaleTargetRef;
    return { ...meta(h, now), status, reference: ref?.kind && ref?.name ? `${ref.kind}/${ref.name}` : '', targets, min: num(h.spec?.minReplicas), max: num(h.spec?.maxReplicas), current: num(s.currentReplicas), desired: num(s.desiredReplicas), conditions: conds(h) }; },
  persistentvolumeclaims: (v, now) => { const phase = v.status?.phase || '';
    const status = v.metadata?.deletionTimestamp ? st('warn', 'Terminating') : phase === 'Bound' ? st('ok', 'Bound') : phase === 'Pending' ? st('warn', 'Pending') : phase === 'Lost' ? st('danger', 'Lost') : st('neutral', phase || 'Unknown');
    return { ...meta(v, now), status, phase, class: v.spec?.storageClassName ?? '', requested: v.spec?.resources?.requests?.storage || '', capacity: v.status?.capacity?.storage || '', volume: v.spec?.volumeName || '', accessModes: (v.status?.accessModes || v.spec?.accessModes || []).join(', '), conditions: conds(v) }; },
  services: (v, now) => ({ ...meta(v, now), status: st('ok', 'Active'), type: v.spec?.type || 'ClusterIP', clusterIP: v.spec?.clusterIP || '', externalIP: (v.status?.loadBalancer?.ingress || []).map(i => i.ip || i.hostname).join(', '),
    ports: (v.spec?.ports || []).map(p => `${p.port}${p.nodePort ? ':' + p.nodePort : ''}/${p.protocol || 'TCP'}`).join(', '), selector: v.spec?.selector || {}, selectorText: pairs(v.spec?.selector) }),
  ingresses: (i, now) => ({ ...meta(i, now), status: (i.status?.loadBalancer?.ingress || []).length ? st('ok', 'Active') : st('warn', 'Pending'), class: i.spec?.ingressClassName || '', hosts: (i.spec?.rules || []).map(r => r.host).filter(Boolean).join(', '),
    address: (i.status?.loadBalancer?.ingress || []).map(x => x.ip || x.hostname).join(', '), backends: (i.spec?.rules || []).flatMap(r => (r.http?.paths || []).map(p => ({ host: r.host || '*', path: p.path || '/', service: p.backend?.service?.name || '', port: p.backend?.service?.port?.number || p.backend?.service?.port?.name || '' }))) }),
  configmaps: (c, now) => ({ ...meta(c, now), status: st('ok', 'Active'), keys: Object.keys(c.data || {}).length + Object.keys(c.binaryData || {}).length, data: c.data || {} }),
  /* Secret: 메타데이터와 type, 키 이름만(값은 허브가 지우고 화면에 오지 않는다). 상태가 없는 종류 */
  secrets: (x, now) => ({ ...meta(x, now), status: null, type: x.type || '', keys: Object.keys(x.data || {}).length, keyNames: Object.keys(x.data || {}) }),
  nodes: (n, now) => { const ready = (n.status?.conditions || []).find(c => c.type === 'Ready'), roles = Object.keys(n.metadata?.labels || {}).filter(k => k.startsWith('node-role.kubernetes.io/')).map(k => k.split('/')[1]).join(', ');
    return { ...meta(n, now), status: ready?.status === 'True' ? (n.spec?.unschedulable ? st('warn', 'SchedulingDisabled') : st('ok', 'Ready')) : st('danger', 'NotReady'), roles, version: n.status?.nodeInfo?.kubeletVersion || '',
      internalIP: (n.status?.addresses || []).find(a => a.type === 'InternalIP')?.address || '', cpu: n.status?.allocatable?.cpu || '', memory: n.status?.allocatable?.memory || '',
      taints: (n.spec?.taints || []).map(t => `${t.key}=${t.value || ''}:${t.effect}`), taintsText: (n.spec?.taints || []).map(t => `${t.key}=${t.value || ''}:${t.effect}`).join(', '),
      nodeGroup: NODE_GROUP.map(k => n.metadata?.labels?.[k]).find(Boolean) || '', zone: n.metadata?.labels?.['topology.kubernetes.io/zone'] || '', instanceType: n.metadata?.labels?.['node.kubernetes.io/instance-type'] || '',
      podCapacity: n.status?.capacity?.pods ?? '', pressure: (n.status?.conditions || []).filter(c => /Pressure$/.test(c.type) && c.status === 'True').map(c => c.type).join(' · '), conditions: conds(n) }; },
  events: (e, now) => {
    const firstAt = e.firstTimestamp || e.eventTime || e.metadata?.creationTimestamp;
    const at = e.series?.lastObservedTime || e.lastTimestamp || firstAt;
    const o = e.involvedObject || e.regarding || {};
    return { ...meta(e, now), status: e.type === 'Warning' ? st('warn', 'Warning') : st('neutral', 'Normal'), type: e.type || 'Normal', reason: e.reason || '', message: e.message || e.note || '', count: [e.series?.count, e.count].find(n => Number.isFinite(n)),
      object: { kind: o.kind || '', name: o.name || '', ns: o.namespace || '', uid: o.uid, apiVersion: o.apiVersion, fieldPath: o.fieldPath },
      source: e.reportingController || e.reportingComponent || e.source?.component || '', firstAt, last: age(at, now), at, atState: timestampState(at, now) };
  },
};

/* 목록 열(종류마다 한 정의, 시뮬레이션 kindColumns): kubectl get -o wide 원문 머리글. 화면은 이 정의 하나로 표를 그린다.
   열: id(행 값), label, as(칸 모양: status 상태 · readyBool True/False · restarts 횟수와 마지막 종료 · age kubectl 나이 · when 시각), value(숫자 오른쪽 굵게),
   time(흐린 고정폭), muted, optional(좁으면 오른쪽부터 숨김), width(토큰 길이). 행 전체에 값이 없는 열은 화면에서 빠진다(출처 없음).
   사용량 열(cpuUse · memUse · restarts1h · usedPct, 칸 모양 cpu m · mem Mi · pct %)은 허브 metrics.usage(클러스터 안 Prometheus) 값이 행에 붙을 때만 보인다 */
const W1 = 'var(--space-16)', W15 = 'calc(var(--space-16) * 1.5)', W2 = 'calc(var(--space-16) * 2)', W25 = 'calc(var(--space-16) * 2.5)', W3 = 'calc(var(--space-16) * 3)', WT = 'calc(var(--space-40) * .9)';
const C = (id, label, extra = {}) => ({ id, label, ...extra });
const NAME = C('name', 'Name', { trim: 'middle' }), NS = C('ns', 'Namespace', { muted: true, optional: true, width: W2 }), AGE = C('age', 'Age', { as: 'age', time: true, optional: true, width: W1 });
const STATUS = (width = W25) => C('status', 'Status', { as: 'status', width, fit: true });
const N = (id, label, width = W15, extra = {}) => C(id, label, { kind: 'number', width, ...extra });
const M = (id, label, width = W2, extra = {}) => C(id, label, { muted: true, optional: true, width, ...extra });
const CPU = (width = W15) => N('cpuUse', 'CPU', width, { as: 'cpu', optional: true }), MEM = (width = W2) => N('memUse', 'Memory', width, { as: 'mem', optional: true });
export const KIND_LIST = [
  { plural: 'pods', kind: 'Pod', group: 'Workloads', icon: 'k8s-pod', api: 'v1', path: ns => ns ? `/api/v1/namespaces/${ns}/pods` : '/api/v1/pods',
    columns: [NAME, NS, STATUS(), C('readyBool', 'Ready', { as: 'readyBool', optional: true, width: W15, fit: true }), N('restarts', 'Restarts', W2, { as: 'restarts' }), CPU(), MEM(), M('node', 'Node', W25), M('ip', 'IP'), M('qos', 'QoS', W15), M('controlledBy', 'Controlled By', W25), AGE],
    tabs: ['summary', 'events', 'logs', 'yaml', 'relations'], facts: ['ready', 'containers', 'restarts', 'lastExit', 'node', 'ip', 'age'] },
  { plural: 'deployments', kind: 'Deployment', group: 'Workloads', icon: 'k8s-deployment', api: 'apps/v1', path: ns => ns ? `/apis/apps/v1/namespaces/${ns}/deployments` : '/apis/apps/v1/deployments',
    columns: [NAME, NS, STATUS(), N('ready', 'Ready', W1), N('desired', 'Desired'), CPU(W25), MEM(W25), N('available', 'Available', W15, { optional: true }), N('restarts1h', 'Restarts 1h', W15, { optional: true }), N('revision', 'Revision', W15, { optional: true }), N('upToDate', 'Up-to-date', W15, { optional: true }),
      M('imageShort', 'Image', W3), M('strategy', 'Strategy'), M('application', 'Application'), AGE],
    tabs: ['summary', 'events', 'logs', 'rollout', 'yaml', 'relations'], facts: ['ready', 'desired', 'upToDate', 'available', 'age'], spec: ['image', 'strategy', 'selector'] },
  { plural: 'statefulsets', kind: 'StatefulSet', group: 'Workloads', icon: 'k8s-statefulset', api: 'apps/v1', path: ns => ns ? `/apis/apps/v1/namespaces/${ns}/statefulsets` : '/apis/apps/v1/statefulsets',
    columns: [NAME, NS, STATUS(), N('ready', 'Ready', W1), N('desired', 'Desired'), M('service', 'Service', W25), N('pvc', 'PVC', W2, { optional: true }), M('imageShort', 'Image', W3), M('updateStrategy', 'Update Strategy', W25), AGE],
    tabs: ['summary', 'events', 'logs', 'yaml', 'relations'], facts: ['ready', 'desired', 'upToDate', 'age'], spec: ['image', 'selector'] },
  { plural: 'daemonsets', kind: 'DaemonSet', group: 'Workloads', icon: 'k8s-daemonset', api: 'apps/v1', path: ns => ns ? `/apis/apps/v1/namespaces/${ns}/daemonsets` : '/apis/apps/v1/daemonsets',
    columns: [NAME, NS, STATUS(), N('desired', 'Desired'), N('current', 'Current', W15, { optional: true }), N('ready', 'Ready', W1), N('upToDate', 'Up-to-date', W15, { optional: true }), N('available', 'Available', W15, { optional: true }), M('nodeSelector', 'Node Selector', W25), AGE],
    tabs: ['summary', 'events', 'logs', 'yaml', 'relations'], facts: ['desired', 'current', 'ready', 'available', 'age'], spec: ['image', 'selector'] },
  { plural: 'cronjobs', kind: 'CronJob', group: 'Workloads', icon: 'k8s-cronjob', api: 'batch/v1', path: ns => ns ? `/apis/batch/v1/namespaces/${ns}/cronjobs` : '/apis/batch/v1/cronjobs',
    columns: [NAME, NS, STATUS(), C('schedule', 'Schedule', { width: W25 }), M('suspendText', 'Suspend', W15), N('active', 'Active', W1, { optional: true }), C('lastScheduleAt', 'Last Schedule', { as: 'when', time: true, width: W2 }),
      C('lastSuccessAt', 'Last Success', { as: 'when', time: true, optional: true, width: WT }), M('concurrency', 'Concurrency Policy', W15), AGE],
    tabs: ['summary', 'events', 'runs', 'yaml'], facts: ['schedule', 'timeZone', 'suspend', 'active', 'activeJobs', 'lastSchedule', 'lastSuccess', 'age'], spec: ['image'] },
  { plural: 'services', kind: 'Service', group: 'Network', icon: 'k8s-service', api: 'v1', path: ns => ns ? `/api/v1/namespaces/${ns}/services` : '/api/v1/services',
    columns: [NAME, NS, C('type', 'Type', { muted: true, width: W2 }), M('clusterIP', 'Cluster-IP'), M('externalIP', 'External-IP'), M('ports', 'Port(s)', W25), M('selectorText', 'Selector', W25), AGE],
    tabs: ['summary', 'events', 'yaml', 'relations'], facts: ['type', 'clusterIP', 'externalIP', 'ports', 'age'], spec: ['selector'] },
  { plural: 'persistentvolumeclaims', kind: 'PersistentVolumeClaim', short: 'PVC', group: 'Storage', icon: 'k8s-pvc', api: 'v1', path: ns => ns ? `/api/v1/namespaces/${ns}/persistentvolumeclaims` : '/api/v1/persistentvolumeclaims',
    columns: [NAME, NS, STATUS(W2), N('capacity', 'Capacity', W1), N('usedPct', 'Used', W1, { as: 'pct', optional: true }), M('class', 'StorageClass'), M('usedBy', 'Used By', W25), M('volume', 'Volume', W25), AGE],
    tabs: ['summary', 'events', 'yaml'], facts: ['requested', 'capacity', 'age'] },
  { plural: 'jobs', kind: 'Job', group: 'Workloads', icon: 'k8s-job', api: 'batch/v1', path: ns => ns ? `/apis/batch/v1/namespaces/${ns}/jobs` : '/apis/batch/v1/jobs',
    columns: [NAME, NS, STATUS(W2), N('succeeded', 'Succeeded'), N('completions', 'Completions', W15, { optional: true }), N('duration', 'Duration', W2, { optional: true }), M('failedReason', 'Reason', W25), C('startTime', 'Start Time', { as: 'when', time: true, optional: true, width: W2 })],
    tabs: ['summary', 'events', 'logs', 'yaml'], facts: ['succeeded', 'completions', 'failedPods', 'duration', 'age'], spec: ['image'] },
  { plural: 'replicasets', kind: 'ReplicaSet', group: 'Workloads', icon: 'k8s-replicaset', api: 'apps/v1', path: ns => ns ? `/apis/apps/v1/namespaces/${ns}/replicasets` : '/apis/apps/v1/replicasets',
    columns: [NAME, NS, STATUS(), N('desired', 'Desired'), N('current', 'Current', W15, { optional: true }), N('ready', 'Ready', W1), N('available', 'Available', W15, { optional: true }), M('owner', 'Controlled By', W25), AGE],
    tabs: ['summary', 'events', 'logs', 'yaml'], facts: ['desired', 'current', 'ready', 'available', 'revision', 'age'], spec: ['image', 'selector'] },
  { plural: 'horizontalpodautoscalers', kind: 'HorizontalPodAutoscaler', short: 'HPA', group: 'Workloads', icon: 'k8s-hpa', api: 'autoscaling/v2', path: ns => ns ? `/apis/autoscaling/v2/namespaces/${ns}/horizontalpodautoscalers` : '/apis/autoscaling/v2/horizontalpodautoscalers',
    columns: [NAME, NS, STATUS(), M('reference', 'Reference', W25), C('targets', 'Targets', { width: W3 }), N('min', 'Min', W1), N('max', 'Max', W1), N('current', 'Replicas', W15), AGE],
    tabs: ['summary', 'events', 'yaml'], facts: ['min', 'max', 'current', 'desired', 'age'] },
  { plural: 'ingresses', kind: 'Ingress', group: 'Network', icon: 'k8s-ingress', api: 'networking.k8s.io/v1', path: ns => ns ? `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses` : '/apis/networking.k8s.io/v1/ingresses',
    columns: [NAME, NS, STATUS(W2), C('class', 'Class', { muted: true, width: W15 }), C('hosts', 'Hosts', { width: W3 }), M('address', 'Address'), AGE], tabs: ['summary', 'events', 'yaml', 'relations'], facts: ['class', 'hosts', 'address', 'age'] },
  { plural: 'secrets', kind: 'Secret', group: 'Config', icon: 'k8s-secret', api: 'v1', path: ns => ns ? `/api/v1/namespaces/${ns}/secrets` : '/api/v1/secrets',
    columns: [NAME, NS, C('type', 'Type', { muted: true, width: 'calc(var(--space-16) * 2.6)' }), N('keys', 'Data', W1), AGE], tabs: ['summary', 'events'], facts: ['type', 'keys', 'age'] },
  { plural: 'configmaps', kind: 'ConfigMap', group: 'Config', icon: 'k8s-configmap', api: 'v1', path: ns => ns ? `/api/v1/namespaces/${ns}/configmaps` : '/api/v1/configmaps',
    columns: [NAME, NS, N('keys', 'Data', W1), AGE], tabs: ['summary', 'yaml'], facts: ['keys', 'age'] },
  { plural: 'nodes', kind: 'Node', group: 'Cluster', icon: 'k8s-node', api: 'v1', cluster: true, path: () => '/api/v1/nodes',
    columns: [NAME, STATUS(), M('nodeGroup', 'NodeGroup', W15), N('cpuUse', 'CPU', W15, { as: 'pct' }), N('memUse', 'Memory', W15, { as: 'pct' }), N('pods', 'Pods', W1, { optional: true }), N('podCapacity', 'Pod Capacity', W15, { optional: true }), M('pressure', 'Pressure', W15), M('taintsText', 'Taints', W25),
      M('zone', 'Zone'), M('instanceType', 'Instance Type'), M('version', 'Version', W25), M('internalIP', 'Internal-IP'), AGE],
    tabs: ['summary', 'events', 'yaml', 'relations'], facts: ['roles', 'version', 'internalIP', 'cpu', 'memory', 'age'] },
  { plural: 'events', kind: 'Event', group: 'Cluster', icon: 'k8s-event', api: 'v1', path: ns => ns ? `/api/v1/namespaces/${ns}/events` : '/api/v1/events', list: 'events', tabs: ['summary', 'yaml'] },
];
/* 종류 고르기의 순서(시뮬레이션 KINDS 다음에 실제 앱에만 있는 종류) */
export const KIND_ORDER = ['nodes', 'deployments', 'statefulsets', 'daemonsets', 'cronjobs', 'pods', 'services', 'persistentvolumeclaims', 'jobs', 'secrets', 'replicasets', 'horizontalpodautoscalers', 'ingresses', 'configmaps'];
export const KIND_OF = Object.fromEntries(KIND_LIST.map(k => [k.plural, k]));
/* 목록 제목의 복수형(kubectl 원문 종류 이름): Pods, Ingresses, Events. 표에 없는 종류는 받은 이름 그대로 */
export const titleOf = plural => { const k = KIND_OF[plural]?.kind; return k ? k + (/(s|x|ch|sh)$/.test(k) ? 'es' : 's') : plural; };
export const rowOf = (plural, o, now = Date.now()) => ROW[plural](o, now);

/* 문제 있는 행(목록의 문제 알약, 홈 요약) */
export const isProblem = r => r.status && r.status[0] !== 'ok' && r.status[1] !== 'Completed' && r.status[1] !== 'Normal';

/** 목록 카드 머리의 개수(시뮬레이션 listFacts): 그 종류에서 당번이 먼저 보는 개수를 표의 행에서 센다. 0은 빼고, 실패 → 경고 → 보통 순으로 접힌다.
 *  label은 Kubernetes 원문 또는 화면 사전 키(wake.*). [{ id, label, value, tone?, priority }] */
export function listFacts(plural, rows) {
  const c = f => rows.filter(f).length, st = r => r.status?.[1] ?? '', out = [];
  const add = (id, label, n, tone) => { if (n) out.push({ id, label, value: n, priority: tone === 'danger' ? 3 : tone === 'warn' ? 2 : 1, ...(tone ? { tone } : {}) }); };
  add('b', 'wake.rv.bad', c(r => ['warn', 'danger'].includes(r.status?.[0])), 'warn');
  if (plural === 'nodes') {
    add('nr', 'NotReady', c(r => st(r) === 'NotReady'), 'danger'); add('sd', 'SchedulingDisabled', c(r => st(r) === 'SchedulingDisabled'), 'warn'); add('pr', 'Pressure', c(r => !!r.pressure), 'warn');
    const versions = [...new Set(rows.map(r => r.version).filter(Boolean))].sort();
    if (versions.length > 1) out.push({ id: 'v', label: 'wake.rv.versions', value: versions.join(' · '), tone: 'warn', priority: 2 });
  } else if (plural === 'pods') {
    add('pe', 'Pending', c(r => st(r) === 'Pending'), 'warn'); add('cl', 'CrashLoopBackOff', c(r => st(r) === 'CrashLoopBackOff'), 'danger');
    add('f', 'Failed', c(r => /Failed|Error|Evicted|ImagePull/.test(st(r))), 'danger'); add('o', 'Last State OOMKilled', c(r => r.lastExit === 'OOMKilled'), 'danger');
    add('rs', 'Restarts', rows.reduce((a, r) => a + (r.restarts ?? 0), 0));
  } else if (plural === 'deployments' || plural === 'statefulsets') {
    add('ua', 'Unavailable', c(r => r.ready < r.desired), 'warn'); add('rp', 'Desired', rows.reduce((a, r) => a + (r.desired ?? 0), 0));
    if (plural === 'deployments') add('ro', 'wake.rv.rollingOut', c(r => r.upToDate < r.desired), 'warn');
  } else if (plural === 'daemonsets') add('ua', 'Unavailable', c(r => r.ready < r.desired), 'warn');
  else if (plural === 'cronjobs') { add('ac', 'Active', c(r => r.active > 0)); add('su', 'Suspend', c(r => r.suspend === true)); }
  else if (plural === 'jobs') { add('f', 'Failed', c(r => st(r) === 'Failed'), 'danger'); add('ru', 'wake.rv.running', c(r => st(r) === 'Running')); }
  else if (plural === 'services') add('lb', 'LoadBalancer', c(r => r.type === 'LoadBalancer'));
  else if (plural === 'persistentvolumeclaims') { add('pe', 'Pending', c(r => st(r) === 'Pending'), 'warn'); add('tm', 'Terminating', c(r => st(r) === 'Terminating'), 'warn'); add('lo', 'Lost', c(r => st(r) === 'Lost'), 'danger'); }
  return out;
}

/* 홈 요약: Pod 단계별 개수(Running, Pending, Failed), Node 준비 수, 최근 경고 이벤트 수 */
export function summaryOf({ pods = [], nodes = [], events = [] }, now = Date.now()) {
  const rows = pods.map(p => ROW.pods(p, now));
  return { pods: { total: pods.length, problems: rows.filter(isProblem).length },
    nodes: { total: nodes.length, notReady: nodes.filter(n => ROW.nodes(n, now).status[1] === 'NotReady').length },
    warnings: events.filter(e => e.type === 'Warning' && inRecentHour(ROW.events(e, now).at, now)).length };
}

function inRecentHour(at, now = Date.now()) {
  const elapsedMs = now - Date.parse(at);
  return Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < 3600e3;
}

/* 관계: 직접 controller UID 결속, Node 배치와 Service 선택자 참조. ReplicaSet 중간 관계는 미지원. */
const matches = (sel, labels) => Object.keys(sel || {}).length > 0 && Object.entries(sel).every(([k, v]) => labels?.[k] === v);

function podSourceIdentity(row) {
  const raw = row.raw, metadata = raw?.metadata;
  return raw ? { consistent: row.name === metadata?.name && row.ns === metadata?.namespace && (row.uid == null || row.uid === metadata?.uid) && (row.kind == null || row.kind === raw.kind) && (row.apiVersion == null || row.apiVersion === raw.apiVersion), name: metadata?.name, ns: metadata?.namespace, uid: metadata?.uid, kind: raw.kind, apiVersion: raw.apiVersion,
    refs: metadata && metadata.ownerReferences == null ? [] : metadata?.ownerReferences }
    : { consistent: true, name: row.name, ns: row.ns, uid: row.uid, kind: row.kind, apiVersion: row.apiVersion, refs: row.ownerReferences ?? (row.owner ? [row.owner] : null) };
}
const identityValue = value => typeof value === 'string' && value.length > 0;
export function podMembership(kind, row, pods, deploymentRelations) {
  if (kind === 'nodes') return { items: pods.filter(p => p.node === row.name), coverage: 'complete', relation: 'node' };
  if (kind === 'services') return { items: pods.filter(p => matches(row.selector, p.labels)), coverage: 'complete', relation: 'selector' };
  if (!['deployments', 'statefulsets', 'daemonsets', 'jobs', 'replicasets'].includes(kind)) return { items: [], coverage: 'complete', relation: null };
  const parent = podSourceIdentity(row), definition = KIND_LIST.find(item => item.plural === kind);
  if (!parent.consistent || ![parent.uid, parent.ns, parent.name].every(identityValue) || parent.kind !== definition.kind || parent.apiVersion !== definition.api)
    return { items: [], coverage: 'unknown', reason: 'incomplete', relation: 'owner' };
  const missingReplicas = kind === 'deployments' && !Array.isArray(deploymentRelations?.items);
  const partialReplicas = kind === 'deployments' && deploymentRelations?.partial === true;
  const result = { items: [], coverage: missingReplicas ? 'unsupported' : partialReplicas ? 'unknown' : 'complete', reason: missingReplicas ? 'replicaset' : partialReplicas ? 'incomplete' : null, relation: 'owner' };
  const replicaRefs = kind === 'deployments' ? new Map((deploymentRelations?.items || []).flatMap(item => {
    const meta = item.metadata;
    const controllers = Array.isArray(meta?.ownerReferences) ? meta.ownerReferences.filter(ref => ref?.controller === true) : [];
    const ref = controllers[0];
    return item.kind === 'ReplicaSet' && item.apiVersion === 'apps/v1' && meta?.namespace === parent.ns && identityValue(meta.uid) && identityValue(meta.name) &&
      controllers.length === 1 && ref.uid === parent.uid && ref.name === parent.name && ref.kind === parent.kind && ref.apiVersion === parent.apiVersion
      ? [[meta.uid, meta.name]] : [];
  })) : null;
  const unknown = () => { if (result.coverage === 'complete') { result.coverage = 'unknown'; result.reason = 'incomplete'; } };
  for (const pod of pods) {
    const child = podSourceIdentity(pod);
    if (identityValue(child.ns) && child.ns !== parent.ns) continue;
    if (!child.consistent || ![child.uid, child.ns, child.name].every(identityValue) || child.kind !== 'Pod' || child.apiVersion !== 'v1' || !Array.isArray(child.refs)) { unknown(); continue; }
    const malformed = child.refs.some(ref => !ref || typeof ref !== 'object' || Array.isArray(ref) || ![ref.uid, ref.name, ref.kind, ref.apiVersion].every(identityValue) || (ref.controller !== undefined && typeof ref.controller !== 'boolean'));
    if (malformed) { unknown(); continue; }
    const controllers = child.refs.filter(ref => ref.controller === true);
    if (controllers.length !== 1) { if (child.refs.length) unknown(); continue; }
    const matchesParent = ref => ref.uid === parent.uid && ref.name === parent.name && ref.kind === parent.kind && ref.apiVersion === parent.apiVersion;
    const controller = controllers[0];
    if (matchesParent(controller) || controller.kind === 'ReplicaSet' && controller.apiVersion === 'apps/v1' && replicaRefs?.get(controller.uid) === controller.name) result.items.push(pod);
    else if (child.refs.some(matchesParent)) unknown();
  }
  return result;
}

/* 원본 객체 -> YAML(읽기 전용 보기). managedFields는 기본으로 숨김 */
export function toYaml(o, { managedFields = false } = {}) {
  const clean = managedFields || !o.metadata ? o : { ...o, metadata: Object.fromEntries(Object.entries(o.metadata).filter(([k]) => k !== 'managedFields')) };
  const scalar = v => v === null ? 'null' : typeof v === 'string' ? (v === '' || /^[\s-?:,[\]{}#&*!|>'"%@`]|: |\s#|^(true|false|null|yes|no|on|off|~|[-+]?\d[\d.e+-]*)$/i.test(v) || /\n/.test(v) ? JSON.stringify(v) : v) : String(v);
  const lines = [];
  const deep = x => x && typeof x === 'object' && (Array.isArray(x) ? x.length : Object.keys(x).length);
  const key = k => /^[\w./-]+$/.test(k) ? k : JSON.stringify(k);
  /* a key at column `at`: its value on the same line, or under it (a map 2 deeper, a list at the same column) */
  const pair = (k, x, at, prefix = ' '.repeat(at)) => walk(x, Array.isArray(x) ? at : at + 2, `${prefix}${key(k)}:${deep(x) ? '' : ' '}`);
  const walk = (v, ind, lead) => {
    if (Array.isArray(v)) { if (!v.length) { lines.push(`${lead}[]`); return; } if (lead.trim()) lines.push(lead.trimEnd());
      for (const x of v) { if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length) { const [k0, ...rest] = Object.keys(x); pair(k0, x[k0], ind + 2, `${' '.repeat(ind)}- `); for (const k of rest) pair(k, x[k], ind + 2); } else walk(x, ind + 2, `${' '.repeat(ind)}- `); }
      return; }
    if (v && typeof v === 'object') { const ks = Object.keys(v); if (!ks.length) { lines.push(`${lead}{}`); return; } if (lead.trim()) lines.push(lead.trimEnd()); for (const k of ks) pair(k, v[k], ind); return; }
    lines.push(lead + scalar(v));
  };
  walk(clean, 0, '');
  return lines.join('\n');
}
