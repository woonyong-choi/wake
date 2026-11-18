# Pod 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-PODS-01

- 목표: → [RULE-RESTARTS](../../rules.md#RULE-RESTARTS). 재시작·마지막 종료·준비 여부로 조사할 Pod를 고른다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 우선: CrashLoopBackOff·OOMKilled·ImagePullBackOff·준비 안 됨. 검색 Name; 필터 namespace·문제 상태; Pod만 Status·Node·Controlled By 추가. 동일 cluster/ns/kind/UID/at 상세로 이동한다; 
- 현재: ROW.pods가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:98`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-PODS
- 출처: D00081 D01033 D01034; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const sidecars = sidecarsOf(p), names = new Set(sidecars.map(container => container.name)); ``
- `` const runningSidecars = (p.status?.initContainerStatuses \|\| []).filter(container => names.has(container.name)); ``
- `` const cs = [...(p.status?.containerStatuses \|\| []), ...runningSidecars]; ``
- `` const specs = [...(p.spec?.containers \|\| []), ...sidecars]; ``
- `` const last = cs.map(container => container.lastState?.terminated?.reason).find(Boolean); ``
- `` const lastAt = cs.map(container => container.lastState?.terminated?.finishedAt).filter(Boolean).sort().at(-1) \|\| null; ``

### 열 목표와 현재 차이

정렬 방향은 열 머리를 처음 선택한 방향이며 반대 방향도 지원한다(D00447). 동점은 표 계약의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 제거하는 순서다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-pods-c001"></a>CMP-K-PODS-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | Pod 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-pods-c002"></a>CMP-K-PODS-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 9; `` calc(var(--space-16) * 2) ``; muted | Pod 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-pods-c003"></a>CMP-K-PODS-C003 | Status | status | `` podStatus(p) `` | 원문 상태·상태 아이콘 | 상태 우선 | 원본 tone | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2.5) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` podStatus(p) `` 적용(apps/wake/data/kinds.js:98) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `Pod 상태는 kubectl과 같은 판정, 진행 중인 상태만 점` | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-pods-c004"></a>CMP-K-PODS-C004 | Ready | status | `` specs.length > 0 && cs.filter(container => container.ready).length >= specs.length ? 'True' : 'False' `` | 원문 상태·상태 아이콘 | 상태 우선 | 원본 tone | CMP-TABLE-04 | 8; `` calc(var(--space-16) * 1.5) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` specs.length > 0 && cs.filter(container => container.ready).length >= specs.length ? 'True' : 'False' `` 적용(apps/wake/data/kinds.js:98) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-pods-c005"></a>CMP-K-PODS-C005 | Restarts | number | `` cs.reduce((n, c) => n + (c.restartCount \|\| 0), 0) `` | 정수·반올림 없음 | 원시 수치↓ | >0 warn | Last State·Finished 절대시각 | 유지; `` calc(var(--space-16) * 2) `` | → [RULE-TONE](../../rules.md#RULE-TONE); [RULE-RESTARTS](../../rules.md#RULE-RESTARTS). 재시작 사유는 숫자 대신 쓰지 않고 원문 툴팁에 보존. | restartsColumn은 restartsText(r)를 호출해 Date.now() 기준 사용(`apps/wake/data/kinds.js:24–26`; `apps/wake/pages/resource-list.js:114`) | 관측 referenceAt 미전달; 과거 종료 경과가 현재 시각으로 늘어남. 열 정렬 없음 | 고정 없음 → TASK-CMP-K-PODS | D00081; D00450; D01033; D01034 |
| <a id="cmp-k-pods-c006"></a>CMP-K-PODS-C006 | CPU | number | `` usage[namespace/name 또는 Node name].cpu `` | CPU m·원본 정밀도 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 7; `` calc(var(--space-16) * 1.5) `` | Pod 목록 표의 usage.cpu=250을 넣는다 → CPU 칸에 250m을 표시한다(usage.cpu); 표시: CPU millicore(m), 원본 cores×1000 또는 n/1000000; 표시 정밀도는 원본 변환식 유지·중립 고정폭  →250을 core로 쓰거나 조회 실패를 0m으로 바꾸면 실패. cores 값을 변환 없이 m에 붙이지 않음. | usageOf·CELL에서 `` usage[namespace/name 또는 Node name].cpu `` 표시(`apps/wake/pages/resource-list.js:98–109`) | 정렬·실패 시 열 숨김(CMP-TABLE-02/05) | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1 |
| <a id="cmp-k-pods-c007"></a>CMP-K-PODS-C007 | Memory | number | `` usage[namespace/name 또는 Node name].memory `` | Mi·정수 반올림 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 6; `` calc(var(--space-16) * 2) `` | Pod 목록 표의 usage.memory=104857600바이트를 넣는다 → Memory 칸에 100Mi를 표시한다; 표시: bytes/1048576를 Math.round한 Mi; 중립 고정폭 →바이트 원시값을 Mi 수치로 붙이거나 읽기 실패를 0Mi로 채우면 실패. Mi와 원시 bytes를 혼용하지 않음. | usageOf·CELL에서 `` usage[namespace/name 또는 Node name].memory `` 표시(`apps/wake/pages/resource-list.js:98–109`) | 정렬·실패 시 열 숨김(CMP-TABLE-02/05) | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1 |
| <a id="cmp-k-pods-c008"></a>CMP-K-PODS-C008 | Node | text | `` p.spec?.nodeName \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 5; `` calc(var(--space-16) * 2.5) ``; muted | Pod 목록 표: spec.nodeName=worker-1 입력 → Node 칸에 worker-1 표시; 표시: Node 이름 원문·중립 보조 톤; 단위 없음 →selector와 일치하는 임의 Node를 붙이면 실패. 주소를 이름으로 추정하거나 다른 Node UID로 이동하지 않음. | `` p.spec?.nodeName \|\| '' `` 적용(apps/wake/data/kinds.js:98) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-pods-c009"></a>CMP-K-PODS-C009 | IP | text | `` p.status?.podIP \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 4; `` calc(var(--space-16) * 2) ``; muted | Pod 목록 표: status.podIP=10.1.0.2 입력 → IP 칸에 10.1.0.2 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →hostIP로 대체하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` p.status?.podIP \|\| '' `` 적용(apps/wake/data/kinds.js:98) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-pods-c010"></a>CMP-K-PODS-C010 | QoS | text | `` p.status?.qosClass \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 1.5) ``; muted | Pod 목록 표: status.qosClass=Burstable 입력 → QoS 칸에 Burstable 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →요청량만으로 Guaranteed를 추정하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` p.status?.qosClass \|\| '' `` 적용(apps/wake/data/kinds.js:98) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-pods-c011"></a>CMP-K-PODS-C011 | Controlled By | text | `` (p.metadata?.ownerReferences \|\| [])[0] ? `${p.metadata.ownerReferences[0].kind}/${p.metadata.ownerReferences[0].name}` : '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2.5) ``; muted | Pod metadata.ownerReferences 첫 항목이 ReplicaSet/web-rs인 행 입력 → Controlled By에 ReplicaSet/web-rs 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →Pod 이름으로 소유자를 추측하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` (p.metadata?.ownerReferences \|\| [])[0] ? `${p.metadata.ownerReferences[0].kind}/${p.metadata.ownerReferences[0].name}` : '' `` 적용(apps/wake/data/kinds.js:98) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-pods-c012"></a>CMP-K-PODS-C012 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성시각↓ | 시간: muted | CMP-TABLE-04 | 1; `` var(--space-16) `` | Pod 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PODS | D00081; D01033; D01034; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| phase | `` p.status?.phase ?? null `` |
| ready | `` cs.filter(container => container.ready && (!names.has(container.name) \|\| container.started === true)).length `` |
| containers | `` specs.length `` |
| requests | `` requestsOf(specs) `` |
| claims | `` (p.spec?.volumes \|\| []).map(volume => volume.persistentVolumeClaim?.claimName).filter(text => typeof text === 'string' && text) `` |
| lastExit | `` last \|\| '' `` |
| lastRestartAt | `` lastAt `` |
| image | `` image(p.spec) `` |
| conditions | `` conds(p) `` |
| containerList | `` specs.map(c => { const s = cs.find(x => x.name === c.name) \|\| {}; const w = s.state?.waiting, t = s.state?.terminated; const end = s.lastState?.terminated; const state = w ? w.reason \|\| 'Waiting' : t ? t.reason \|\| (t.exitCode === 0 ? 'Completed' : 'Terminated') : s.state?.running ? 'Running' : 'Waiting'; const failed = t ? t.exitCode != null && t.exitCode !== 0 \|\| t.reason === 'Error' \|\| t.reason === 'OOMKilled' : w && ['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerError', 'CreateContainerConfigError', 'RunContainerError', 'ContainerStatusUnknown'].includes(state); const status = st(failed ? 'danger' : s.ready \|\| t?.exitCode === 0 ? 'ok' : t ? 'neutral' : 'warn', state); return { name: c.name, image: s.image \|\| c.image, state, status, ready: !!s.ready, restarts: s.restartCount \|\| 0, last: end?.reason \|\| '', lastFinishedAt: end?.finishedAt, lastExitCode: end?.exitCode }; }) `` |
