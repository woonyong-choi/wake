# wake-agent 설치와 수집 확인

설치 완료는 명령 종료가 아니라 실제 배포·heartbeat·수집 확인이다. 옛 관리형 설치 요구의 목적을 현재 데스크톱 허브 구조로 옮긴다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

<a id="FLOW-AGT-001"></a>

## FLOW-AGT-001: 설치 준비·명령·권한

- 목표: 입력: 선택 context의 DaemonSet 배포 권한과 chart·image digest를 확인하고 agent 설치를 누른다 → 기대: 설정/첫 실행에서 선택 context의 DaemonSet 배포권한과 도구를 검사한다. 실제 chart를 resolve한 뒤 wake-system의 wake-agent를 Helm upgrade --install한다. cluster identity와 image repository/digest를 명시하고 누락이면 실패시킨다. 설치계정과 읽기계정은 구분하며 설치권한을 AI에 주지 않는다. 시스템 신뢰로 읽히는 클러스터에 불필요한 명시 CA를 요구해 막는 과거 회귀를 방지한다. → 실패: digest 누락인데 설치 성공으로 보이거나 desired=0·부분 ready가 완료로 보이면 실패.
- 추가 조건: 입력 필수 권한과 대상·설치 입력이 확정된 상태에서 설치 클릭 → 기대 별도의 중복 확인 없이 해당 대상 설치 요청을 한 번 보냄 → 실패 같은 선택을 다시 확인해야 시작하거나 클릭 한 번에 요청을 중복 발행함
- 현재: `apps/wake/data/connect-flow.js:92`의 agent 명령은 chart와 identity.clusterId를 넣고 :382는 rolloutReady를 검사한다.
- 차이: 명령에서 image digest를 명시하지 않아 계획의 이미지 고정 조건을 충족하지 않는다. → TASK-A3-AGT-001
- 고정 장치: `apps/wake/data/connect-flow.test.mjs`, 시험 `agent install checks DaemonSet permission and runs Helm with the chart the desktop app resolves`; 추가 조건 고정 없음
- 출처: D00018 D00021 D00023 D00024 D00974 D00985 D00987; R-006,R-057.

## FLOW-AGT-002: 배포 뒤 heartbeat·watch·cache

- 목표: 입력: wake-system Lease.spec.renewTime 갱신을 멈추고 leaseDurationSeconds 경계를 지난 뒤 agent 화면을 연다 → 기대: 같은 cluster의 DaemonSet/Pod imageID, wake-system Lease, Node별 heartbeat, watch/cache 실제 수집을 각각 확인한다. 폐기한 관리서비스 API를 되살리지 않는다. heartbeat 중단은 stale/missing, 버전·지연·watch종류·cache는 관측값만 보인다. agent 없이 직접 API 읽기를 agent 검수로 대신하지 않는다. → 실패: 만료된 Lease를 정상으로 보이거나 없는 Node·watch 값을 0으로 채우면 실패
- 현재: `apps/wake/desktop/agent-heartbeat.cjs:24`의 nodeOf는 renewTime·leaseDurationSeconds와 annotation의 watch·objects를 읽는다.
- 차이: Lease 기간이 없으면 :26에서 15초를 넣고 갱신 시각이 없으면 missing 대신 stale로 합친다. → TASK-A3-AGT-002
- 고정 장치: `apps/wake/desktop/agent-heartbeat.test.cjs`, 시험 `heartbeat_marks_each_node_ok_stale_or_missing`
- 출처: D00320 D00327 D00021 D00024 D00649 D00972 D00974 D00985 D00987; R-056,R-057.
