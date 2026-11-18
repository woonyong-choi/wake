# 리소스 원본 값과 공통 변환

<a id="cmp-value-01"></a>

<a id="CMP-VALUE-01"></a>

## CMP-VALUE-01 — API 값 변환

- 목표: Kubernetes 목록에는 Node pods=0을 넣고 usage 서비스만 forbidden으로 응답한다 → 각 종류 표의 row 변환 함수가 JSON 필드 출처다. 생성/변경 시각은 metadata, 상태는 status, 요청·한도는 spec에서 읽는다. usage는 별도 Prometheus 출처이며 목록 API 성공만으로 사용량까지 정상으로 표시하지 않는다. Pod CPU는 millicore, 컨테이너 차트 CPU는 cores로 단위가 다르다. Pod·Deployment Memory는 bytes→Math.round(bytes/1048576)Mi다. Node CPU·Memory와 PVC usedPct는 백분율이다. Node 사용량은 서비스에서 Math.round한 백분율에 %를 붙이며 cores·bytes로 다시 변환하지 않는다. → 실제 0을 빈 셀로 바꾸거나 usage 실패를 정상 사용량 또는 조용한 열 삭제로 숨기면 실패.
- 추가 조건: 입력 같은 지표·역할의 값이 단위 경계 전후로 바뀌는 카드들 → 기대 같은 비교 집합의 단위 변환/소수점 정책을 공통 적용 → 실패 같은 의미를 서로 다른 단위 정책으로 표시하거나 갱신마다 의미 없이 단위 전환.
- 현재: resource-list.related는 Node의 Pod 수 0을 빈 문자열로 만들고 usage 실패는 usage=null로 처리한다(`apps/wake/pages/resource-list.js:110,43`).
- 차이: 실제 Node Pod 수 0이 사라지고 사용량 실패 사유 대신 열이 숨는다.
- 고정 장치: 고정 없음 → TASK-CMP-VALUES
- 출처: D00447, D00450, D00728, D00776, D00953, D01027, D01033, D01034, D01051; D00344
- 점검 항목: 동일 조회 시각 원본 JSON→row→cell을 대조해 이름·UID·상태·정수는 완전 일치. 표시 반올림은 산식 그대로, 누락은 null 보존.

## 공통 변환의 현재 계산식

종류별 ROW 식은 각 리소스 표에만 둔다. 이 표의 식은 현재 코드의 추적 정보이며 누락·상태의 목표와 다르면 차이로 고친다.

| 함수·값 | 코드 위치 | 현재 계산식 |
|---|---|---|
| LIVE | `apps/wake/data/kinds.js:9` | `` new Set(['Progressing', 'Terminating', 'ContainerCreating', 'PodInitializing', 'Pending', 'Running', 'Syncing']) `` |
| isLive | `apps/wake/data/kinds.js:11` | `` (tone, text) => tone !== 'ok' && tone !== 'danger' && LIVE.has(text) `` |
| st | `apps/wake/data/kinds.js:12` | `` (tone, text) => (tone === 'ok' ? [tone, text] : [tone, text, isLive(tone, text)]) `` |
| age | `apps/wake/data/kinds.js:14` | `` function age(t, now = Date.now()) { if (!t) return 'Unknown'; const elapsedMs = now - Date.parse(t); if (!Number.isFinite(elapsedMs) \|\| elapsedMs < 0) return 'Unknown'; const s = elapsedMs / 1000; return s < 120 ? `${Math.round(s)}s` : s < 7200 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; } `` |
| restartsText | `apps/wake/data/kinds.js:24` | `` (r, now = Date.now()) => { const n = r?.restarts ?? 0; if (!n) return '0'; const ago = r.lastRestartAt ? age(r.lastRestartAt, now) : ''; return ago && ago !== 'Unknown' ? `${n} (${ago} ago)` : String(n); } `` |
| restartsColumn | `apps/wake/data/kinds.js:25` | `` (extra = {}) => ({ id: 'restarts', label: 'Restarts', kind: 'number', fit: true, ...extra, cell: r => restartsText(r), tone: r => ((r?.restarts ?? 0) > 0 ? 'warn' : null), tip: r => (r?.lastExit ? [`Last State: ${r.lastExit}`, r.lastRestartAt ? `Finished: ${r.lastRestartAt}` : ''].filter(Boolean).join(' · ') : '') }) `` |
| cpuM | `apps/wake/data/kinds.js:30` | `` v => /m$/.test(v) ? parseFloat(v) : /n$/.test(v) ? parseFloat(v) / 1e6 : parseFloat(v) * 1000 `` |
| memMi | `apps/wake/data/kinds.js:31` | `` v => { const n = parseFloat(v); return /Ki$/.test(v) ? n / 1024 : /Mi$/.test(v) ? n : /Gi$/.test(v) ? n * 1024 : n / 1048576; } `` |
| requestsOf | `apps/wake/data/kinds.js:33` | `` specs => ({ cpu: specs.reduce((a, c) => a + (c.resources?.requests?.cpu ? cpuM(c.resources.requests.cpu) : 0), 0), memory: specs.reduce((a, c) => a + (c.resources?.requests?.memory ? memMi(c.resources.requests.memory) : 0), 0) }) `` |
| sidecarsOf | `apps/wake/data/kinds.js:35` | `` pod => (pod.spec?.initContainers \|\| []).filter(container => container.restartPolicy === 'Always') `` |
| podStatus | `apps/wake/data/kinds.js:38` | `` function podStatus(p) { const s = p.status \|\| {}, init = s.initContainerStatuses \|\| [], cs = s.containerStatuses \|\| []; const end = t => t.reason \|\| (t.signal ? `Signal:${t.signal}` : `ExitCode:${t.exitCode}`); const phase = s.reason \|\| s.phase \|\| 'Pending'; let reason = phase, initializing = false; const sidecars = new Set(sidecarsOf(p).map(container => container.name)); const initialized = s.conditions?.some(condition => condition.type === 'Initialized' && condition.status === 'True'); for (const c of init) { const w = c.state?.waiting, t = c.state?.terminated; if (t?.exitCode === 0 \|\| sidecars.has(c.name) && c.started === true) continue; initializing = true; reason = t ? `Init:${end(t)}` : w?.reason && w.reason !== 'PodInitializing' ? `Init:${w.reason}` : 'PodInitializing'; break; } if (!initializing \|\| initialized) { reason = phase; let running = false; for (const c of [...cs].reverse()) { const w = c.state?.waiting, t = c.state?.terminated; if (w?.reason) reason = w.reason; else if (t) reason = end(t); else if (c.state?.running && c.ready) running = true; } if (reason === 'Completed' && running) reason = (s.conditions \|\| []).some(x => x.type === 'Ready' && x.status === 'True') ? 'Running' : 'NotReady'; } if (p.metadata?.deletionTimestamp) reason = s.reason === 'NodeLost' ? 'Unknown' : 'Terminating'; if (reason === 'Succeeded' \|\| (reason === 'Completed' && s.phase === 'Succeeded')) return st('neutral', 'Completed'); if (reason === 'Running') { const sidecarsReady = [...sidecars].every(name => init.some(container => container.name === name && container.started === true && container.ready)); const podNotReady = s.conditions?.some(condition => condition.type === 'Ready' && condition.status !== 'True'); return cs.every(container => container.ready) && sidecarsReady && !podNotReady ? st('ok', 'Running') : st('warn', 'Running'); } if (['Pending', 'ContainerCreating', 'PodInitializing', 'Terminating', 'NotReady'].includes(reason)) return st('warn', reason); return st(['Running', 'Completed'].includes(reason) ? 'ok' : 'danger', reason); } `` |
| timestampState | `apps/wake/data/kinds.js:72` | `` function timestampState(at, now) { if (!at) return 'missing'; if (!Number.isFinite(Date.parse(at))) return 'invalid'; if (!Number.isFinite(now)) return 'invalid-reference'; return Date.parse(at) > now ? 'future' : 'valid'; } `` |
| meta | `apps/wake/data/kinds.js:79` | `` (o, now) => ({ createdAt: o.metadata?.creationTimestamp ?? null, ageState: timestampState(o.metadata?.creationTimestamp, now), name: o.metadata?.name \|\| '', ns: o.metadata?.namespace \|\| '', age: age(o.metadata?.creationTimestamp, now), labels: o.metadata?.labels \|\| {}, annotations: o.metadata?.annotations \|\| {}, uid: o.metadata?.uid ?? null, apiVersion: o.apiVersion ?? null, kind: o.kind ?? null, ownerReferences: o.metadata && (o.metadata.ownerReferences == null \|\| Array.isArray(o.metadata.ownerReferences)) ? (o.metadata.ownerReferences \|\| []).map(ref => ({ ...ref })) : null, owner: (o.metadata?.ownerReferences \|\| [])[0] ? { ...o.metadata.ownerReferences[0] } : null }) `` |
| image | `apps/wake/data/kinds.js:83` | `` spec => (spec?.containers \|\| []).map(c => c.image).join(', ') `` |
| imageShort | `apps/wake/data/kinds.js:85` | `` spec => (spec?.containers \|\| []).map(c => String(c.image \|\| '').split('/').pop()).join(', ') `` |
| pairs | `apps/wake/data/kinds.js:86` | `` o => Object.entries(o \|\| {}).map(([k, v]) => `${k}=${v}`).join(', ') `` |
| trackedApp | `apps/wake/data/kinds.js:88` | `` o => { const app = /^([^:]+):/.exec(o.metadata?.annotations?.['argocd.argoproj.io/tracking-id'] \|\| '')?.[1] \|\| o.metadata?.labels?.['argocd.argoproj.io/instance'] \|\| ''; return app.includes('_') ? app.slice(app.indexOf('_') + 1) : app; } `` |
| NODE_GROUP | `apps/wake/data/kinds.js:89` | `` ['eks.amazonaws.com/nodegroup', 'cloud.google.com/gke-nodepool', 'kubernetes.azure.com/agentpool', 'karpenter.sh/nodepool', 'node.kubernetes.io/nodegroup'] `` |
| conds | `apps/wake/data/kinds.js:90` | `` o => (o.status?.conditions \|\| []).map(c => ({ type: c.type, status: c.status, reason: c.reason \|\| '', message: c.message \|\| '' })) `` |
| workload | `apps/wake/data/kinds.js:91` | `` (o, want, ready, avail, upd) => { const tone = avail >= want ? 'ok' : avail === 0 && want > 0 ? 'danger' : 'warn'; return st(tone, tone === 'ok' ? 'Available' : tone === 'danger' ? 'Unavailable' : 'Progressing'); } `` |

## 사용량 출처의 현재 계산식

Kubernetes 목록 성공과 Prometheus 사용량 성공은 별개다. Deployment 사용량은 Pod → ReplicaSet → Deployment의 같은 namespace 소유 관계로 합친다. Pod CPU는 m, container CPU는 cores, Memory는 bytes, Node CPU/Memory와 PVC 사용량은 %다. null은 합산 성공이나 0으로 바꾸지 않는다.

| 함수·질의 | 코드 위치 | 현재 계산식 |
|---|---|---|
| USAGE.podCpu | `apps/wake/desktop/reads/metrics.cjs:66` | `` '1000 * sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!=""}[5m]))' `` |
| USAGE.podMem | `apps/wake/desktop/reads/metrics.cjs:66` | `` 'sum by (namespace, pod) (container_memory_working_set_bytes{container!=""})' `` |
| USAGE.podRestarts | `apps/wake/desktop/reads/metrics.cjs:66` | `` 'sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total[1h]))' `` |
| USAGE.podOwner | `apps/wake/desktop/reads/metrics.cjs:66` | `` 'max by (namespace, pod, owner_name) (kube_pod_owner{owner_kind="ReplicaSet"})' `` |
| USAGE.rsOwner | `apps/wake/desktop/reads/metrics.cjs:66` | `` 'max by (namespace, replicaset, owner_name) (kube_replicaset_owner{owner_kind="Deployment"})' `` |
| USAGE.nodeCpu | `apps/wake/desktop/reads/metrics.cjs:66` | `` `100 * (1 - avg by (nodename) (${BY_NODE('rate(node_cpu_seconds_total{mode="idle"}[5m])')}))` `` |
| USAGE.nodeMem | `apps/wake/desktop/reads/metrics.cjs:66` | `` `100 * (1 - sum by (nodename) (${BY_NODE('node_memory_MemAvailable_bytes')}) / sum by (nodename) (${BY_NODE('node_memory_MemTotal_bytes')}))` `` |
| USAGE.pvcUsed | `apps/wake/desktop/reads/metrics.cjs:66` | `` 'max by (namespace, persistentvolumeclaim) (kubelet_volume_stats_used_bytes)' `` |
| USAGE.pvcCapacity | `apps/wake/desktop/reads/metrics.cjs:66` | `` 'max by (namespace, persistentvolumeclaim) (kubelet_volume_stats_capacity_bytes)' `` |
| USAGE_OF | `apps/wake/desktop/reads/metrics.cjs:77` | `` { pods: ['podCpu', 'podMem', 'podRestarts'], deployments: ['podCpu', 'podMem', 'podRestarts', 'podOwner', 'rsOwner'], nodes: ['nodeCpu', 'nodeMem'], persistentvolumeclaims: ['pvcUsed', 'pvcCapacity'] } `` |
| valueOf | `apps/wake/desktop/reads/metrics.cjs:78` | `` item => { const n = Number(item?.value?.[1]); return Number.isFinite(n) ? n : null; } `` |
| round | `apps/wake/desktop/reads/metrics.cjs:79` | `` v => (v == null ? null : Math.round(v)) `` |
| usageRows | `apps/wake/desktop/reads/metrics.cjs:82` | `` function usageRows(kind, vectors) { const rows = {}, put = (key, field, value) => { if (value == null) return; (rows[key] ??= {})[field] = value; }; const pod = m => `${m.namespace}/${m.pod}`; if (kind === 'pods') { for (const v of vectors.podCpu ?? []) put(pod(v.metric), 'cpu', round(valueOf(v))); for (const v of vectors.podMem ?? []) put(pod(v.metric), 'memory', valueOf(v)); for (const v of vectors.podRestarts ?? []) put(pod(v.metric), 'restarts1h', round(valueOf(v))); } else if (kind === 'deployments') { const rs = new Map((vectors.rsOwner ?? []).map(v => [`${v.metric.namespace}/${v.metric.replicaset}`, v.metric.owner_name])); const owner = new Map((vectors.podOwner ?? []).flatMap(v => { const d = rs.get(`${v.metric.namespace}/${v.metric.owner_name}`); return d ? [[pod(v.metric), `${v.metric.namespace}/${d}`]] : []; })); for (const [field, list, round] of [['cpu', vectors.podCpu, true], ['memory', vectors.podMem, false], ['restarts1h', vectors.podRestarts, true]]) { const sums = new Map(); for (const v of list ?? []) { const d = owner.get(pod(v.metric)), n = valueOf(v); if (d && n != null) sums.set(d, (sums.get(d) ?? 0) + n); } for (const [d, n] of sums) put(d, field, round ? Math.round(n) : n); } } else if (kind === 'nodes') { for (const v of vectors.nodeCpu ?? []) put(v.metric.nodename, 'cpu', round(valueOf(v))); for (const v of vectors.nodeMem ?? []) put(v.metric.nodename, 'memory', round(valueOf(v))); } else if (kind === 'persistentvolumeclaims') { const cap = new Map((vectors.pvcCapacity ?? []).map(v => [`${v.metric.namespace}/${v.metric.persistentvolumeclaim}`, valueOf(v)])); for (const v of vectors.pvcUsed ?? []) { const key = `${v.metric.namespace}/${v.metric.persistentvolumeclaim}`, used = valueOf(v), c = cap.get(key); put(key, 'used', used); if (used != null && c > 0) put(key, 'usedPct', Math.round(100 * used / c)); } } return rows; } `` |

<a id="cmp-value-02"></a>

## CMP-VALUE-02 — Restarts

- 목표: restartCount와 lastState.terminated.finishedAt, 마지막 종료 reason을 같은 Pod UID에서 읽는다. 값·톤·툴팁·실패 판정은 [RULE-RESTARTS](../rules.md#RULE-RESTARTS), 과거 기준시각은 [RULE-TIME](../rules.md#RULE-TIME)을 따른다.
- 현재: restartsText는 0과 상대 종료 시각을 조합하고 restartsColumn은 number·fit 및 양수 warn을 지정한다(`apps/wake/data/kinds.js:24–25`).
- 차이: restartsColumn의 cell이 restartsText(r)만 호출하므로 과거 snapshot 기준시각을 전달하지 않는다.
- 고정 장치: 고정 없음 → TASK-CMP-RESTARTS
- 출처: D01033, D01034, D01051
- 점검 항목: 0/1/9/1000, 종료 시각 있음/없음/과거 at를 760·1280·1680에서 확인. 모든 문자 표시, 아이콘 0.

## CMP-VALUE-RESTARTS 재시작 표시

<a id="CMP-VALUE-RESTARTS"></a>

현재 `apps/wake/data/kinds.js:24–25`의 restartsText·restartsColumn이 변환과 열 의미를 소유한다. 위 계산식과 함께 `0`, `9 (3m ago)`, 시각 없음의 `9`를 대조한다. 숫자 열·0 중립·양수 warn 톤이며 상태 아이콘은 넣지 않는다. SRE-R-06은 화면 폭과 잘림만 검수하고 변환식을 복제하지 않는다.
