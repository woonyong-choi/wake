# 인시던트 판단 부품과 판정 기준

판정은 결정적 데이터 규칙으로 한다. AI가 장애 발생·복구를 임의로 확정하거나 승인 버튼을 대신 누르지 않는다. 아래 현재 산식과 미충족 요구를 분리한다.

<a id="cmp-inc-01"></a>

## CMP-INC-01 — 감지 입력·신호

- 목표: events involvedObject에 PVC UID=p와 node 라벨을 함께 넣고 ImagePullBackOff Pod를 감지한다 → Event·Pod·Alertmanager의 관측을 대상 UID·namespace·시각·출처와 함께 읽고 같은 신호 ID는 갱신한다. PVC 신호를 Node 신호로 바꾸지 않는다. (기본값 채택, 번복 가능) OOM·CrashLoop·ImagePull·스케줄·Node·Job·Application 실패를 서로 다른 reason으로 분류하고 모르는 reason은 원문으로 남긴다. 현재 SIGNALS 목록을 목표의 지원 상한으로 사용하지 않는다. → PVC를 Node로 바꾸거나 ImagePull을 crash-loop로 분류하거나 관측 UID를 잃으면 실패.
- 현재: SIGNALS에는 OOM·CrashLoop·BackOff·스케줄·Node·Job이 있고 keyOf는 이름 기반이다(`apps/wake/data/incident-detect.js:13–22,96`).
- 차이: ImagePull·Application 규칙이 없고 PVC 라벨을 Node보다 우선하는 대상 선택이 없다.
- 고정 장치: 고정 없음 → TASK-CMP-INC-P1
- 출처: D-USR-2026-11-16-7; D00091, D00092, D00658
- 점검 항목: OOM·Event·Pod·Alert 중복, 늦은 도착, 정상 Event, 알 수 없는 reason, PVC와 node 라벨 동시 입력, ImagePull, Application을 각각 대조한다. 대상과 원인 분류가 하나라도 다르면 실패다.

```js
export const SIGNALS = Object.freeze({
  OOMKilled: { severity: 'critical', rule: 'oom-limit' },
  OOMKilling: { severity: 'critical', rule: 'oom-limit' },
  CrashLoopBackOff: { severity: 'critical', rule: 'crash-loop' },
  BackOff: { severity: 'warning', rule: 'crash-loop' },
  FailedScheduling: { severity: 'warning', rule: 'unschedulable' },
  NodeNotReady: { severity: 'critical', rule: 'node-not-ready' },
  BackoffLimitExceeded: { severity: 'warning', rule: 'job-failed' },
  DeadlineExceeded: { severity: 'warning', rule: 'job-failed' },
});
/** 알림 이름 → 신호 이유(wake-lab 규칙과 흔한 kube-prometheus 이름). 모르는 알림은 그 이름 그대로 신호가 되고 severity 라벨을 쓴다 */
const ALERT_REASON = { ContainerOOMKilled: 'OOMKilled', KubeContainerOOMKilled: 'OOMKilled', PodCrashLoopBackOff: 'CrashLoopBackOff', KubePodCrashLooping: 'CrashLoopBackOff',
  NodeNotReady: 'NodeNotReady', KubeNodeNotReady: 'NodeNotReady', CronJobRunFailed: 'BackoffLimitExceeded', KubeJobFailed: 'BackoffLimitExceeded' };

/** 묶는 구간: 신호가 이만큼 끊기면 같은 소유자라도 새 인시던트, 알림이 풀린 뒤 이만큼 조용하면 완화 */
export const DETECT = Object.freeze({ lookback: 60 * MIN, active: 10 * MIN, quiet: 5 * MIN, gap: 30 * MIN, maxSignals: 200 });
```

<a id="cmp-inc-02"></a>

## CMP-INC-02 — 묶기·심각도·재발

- 목표: 동일 namespace/name의 UID=a를 삭제하고 UID=b의 새 신호와 해결된 a의 옛 신호를 다시 받는다 → 동일 이름이라도 UID가 바뀌면 다른 객체 생애로 묶는다. 기존 감사와 근거를 유지하고 critical 심각도를 낮추지 않는다. 해결된 옛 신호의 재수신은 새 사건으로 만들지 않고 새로운 신호의 재발만 다시 연다. (기본값 채택, 번복 가능) 소유자 탐색 최대 4단계·lookback 60분·active 10분·gap 30분·최대 200개 신호를 경계 시험의 초기값으로 사용한다. 이름 기반 과거 자료는 이름 기준임을 명시한다. → 객체 생애가 합쳐지거나 옛 신호로 새 사건이 열리거나 critical이 내려가면 실패.
- 현재: keyOf는 cluster/kind/namespace/name을 이어 붙이며 UID를 포함하지 않는다(`apps/wake/data/incident-detect.js:96`).
- 차이: 동명 객체가 재생성돼도 묶음 키가 같아 이전 UID의 사건과 섞일 수 있다.
- 고정 장치: 고정 없음 → TASK-CMP-INC-IDENTITY
- 출처: D-USR-2026-11-16-7; D00091, D00093, D00094
- 점검 항목: 같은 owner의 두 Pod, 다른 namespace의 같은 이름, 삭제 후 UID 교체, 해결 전후의 같은 신호와 새 신호를 대조한다. 중복 사건과 새 대상 혼합은 허용하지 않는다.

<a id="cmp-inc-03"></a>

## CMP-INC-03 — 확인 창과 해결 판정

- 목표: → [RULE-RECOVERY](../rules.md#RULE-RECOVERY).
- 현재: verifyVerdict는 전체 경과에서 miss 수×cadence를 빼고 ok 총수를 센다(`apps/wake/data/incident-model.js:183–196`).
- 차이: 중간 miss 전후 정상 시간을 합산한다. 실패·누락 뒤 연속 5분을 다시 세는 확정 결정과 다르며 전체 deadline으로도 inconclusive가 된다.
- 고정 장치: 고정 없음 → TASK-CMP-INC-VERIFY
- 출처: D-USR-2026-11-16-3; D00092, D00658
- 점검 항목: → [RULE-RECOVERY](../rules.md#RULE-RECOVERY).

<a id="cmp-inc-04"></a>

## CMP-INC-04 — 범위·원인·조치·확인 단계

- 목표: incident.workspace의 scope,cause,action,verify를 차례로 열고 impact·evidence·approval 필드를 읽는다 → 범위에는 대상 UID·namespace·사용자 영향·기간·5xx/지연/요청량·SLO/소진율·파급 범위를 출처와 함께 둔다. 원인은 증상·변경·로그/지표 근거를 같은 시간축에서 대조하고 시간 근접만으로 확정하지 않는다. 조치는 선택지·위험·예상 영향·되돌릴 revision·실제 diff·승인 주체를 보인다. 확인에는 CMP-INC-03의 관찰창·조건별 현재 값·출처 상태·실패/미확인을 보인다. 단계 머리에 큰 1~4 장식 숫자를 두지 않는다. 수동 메모를 감사 대신 쓰지 않고 실제 행동을 자동 기록한다. → 시간 근접만으로 원인을 확정하거나 근거 없는 영향 0·건강을 표시하거나 단계 머리에 장식 숫자를 붙이면 실패.
- 현재: userImpact는 HTTP·배치 영향을 구분하고 causeStatus·verifyCounts가 단계별 값을 만든다(`apps/wake/data/incident-model.js:98,161,168`).
- 차이: 복구 단계는 CMP-INC-03의 누락 누적 산식을 소비하므로 중간 누락 뒤 연속 정상 시간을 잘못 표시한다.
- 고정 장치: 고정 없음 → TASK-CMP-INC-STEPS
- 출처: D00092, D00658, D00869, D01004
- 점검 항목: 각 단계에서 증상·발생 시각·대상·원인·승인할 변경·복구 근거를 찾는다. 출처 없는 영향 0이나 건강 표시는 실패다. 일곱 읽기 상태를 각각 확인한다.

<a id="cmp-inc-05"></a>

## CMP-INC-05 — 조치 제안과 승인

- 목표: plan.route=pr인 조치에 승인·중복 승인·거절을 보내고 GitHub 응답은 받지 않는다 → 등록된 규칙과 실제 대상·근거가 있을 때만 구체 조치안을 제시한다. 실행 대상 UID·현재 revision·변경 diff·위험·복구 수단이 확인되지 않으면 승인 후 실행 가능한 것처럼 보이지 않는다; [RULE-AI](../rules.md#RULE-AI). 승인 취소·거절·대상 교체·중복 요청을 구분하고 중복 실행을 막아 감사에 남긴다. Draft PR은 실제 원격 생성 응답과 URL이 있어야 생성됨으로 표시한다; 승인만으로 PR 생성됨을 보이거나 동일 승인으로 두 번 실행하거나 대상 UID 교체 뒤 실행하면 실패.
- 현재: decide는 사람 결정을 저장하고 PR 경로는 pending 또는 github-unconnected 문자열만 기록한다(`apps/wake/desktop/approvals.cjs:43–56`).
- 차이: 실제 GitHub PR 생성 API와 URL 저장이 없어 승인 뒤 PR 생성 완료를 판정할 수 없다.
- 고정 장치: 고정 없음 → TASK-CMP-INC-APPROVAL
- 출처: D00660, D00884
- 점검 항목: 사람 승인 전 쓰기, 동일 승인 중복 실행, 대상 교체 뒤 실행은 모두 거부해야 한다. 실제 PR 응답 없이 완료를 표시하면 실패다.
