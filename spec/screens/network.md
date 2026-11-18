# 네트워크

<a id="SCR-NETWORK"></a> 진입: `wake://cluster/:cluster/network`. 목적(SRE 판단): 서비스 구성 관계와 관측된 통신 문제를 구분한다.
구성: 검색·namespace·기간 → 수신/송신 차트 → 서비스 관계 흐름 → 서비스 표.
현재: [apps/wake/pages/network.js](../../apps/wake/pages/network.js); [apps/wake/data/network.js](../../apps/wake/data/network.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 수신·송신·오류·재전송·연결, 서비스 관계, 기간·페이지; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-FLOW-01](../components/flow-graph.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-NETWORK-01](../components/tables/network.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-NETWORK-01](../components/tables/network.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: network 서비스의 snap.range·at와 rx/tx/conns/err/retrans 계열, Kubernetes Service와 Ingress가 원본이다. 실측 트래픽과 이름·namespace에 근거한 추정 연결을 구분한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-NETWORK-01"></a> `SCR-NETWORK-01` | network.read가 성공한 클러스터의 네트워크 화면을 연다 → namespace/검색/기간 아래 수신·송신 차트, 서비스 흐름, 서비스 표가 보인다 → 다른 클러스터 출처나 표 위아래 순서 역전이면 실패 | body가 tools·traffic·flow·top 순서로 조립한다(`apps/wake/pages/network.js:82`). | 없음(확인: apps/wake/pages/network.js:82) | 고정 없음 → TASK-SCREEN-NETWORK | D00196; D00883 |
| <a id="SCR-NETWORK-V01"></a> `SCR-NETWORK-V01` | network.read에서 rx/tx만 공급하고 conns/retrans는 비워 둔다 → 대역폭은 KiB/s·MiB/s와 snap.range로, 나머지는 미계측으로 보인다 → 결측을 0 연결/0%로 표시하면 실패 | rate/pct는 null을 비우지만 top은 전부 결측인 열을 제거한다(`apps/wake/pages/network.js:20`, `apps/wake/pages/network.js:78`). | 미계측 열을 숨겨 측정 불가 이유를 읽을 수 없다. | 고정 없음 → TASK-SCREEN-NETWORK | D00883; D-USR-2026-11-16-7 |
| <a id="SCR-NETWORK-V02"></a> `SCR-NETWORK-V02` | Ingress 요청률과 같은 namespace의 Redis Service만 제공한다 → Ingress→Service는 관측, Service→Redis는 추정이라고 표시한다 → Redis 연결을 실측 호출로 안내하면 실패 | serviceFlow는 동일 namespace 저장소 링크에 estimated=true를 붙인다(`apps/wake/data/network.js:71`). | 없음(확인: apps/wake/data/network.js:71) | `apps/wake/data/network.test.mjs` — `ingress_bands_are_observed_and_store_bands_are_marked_estimated` | D00883; D-USR-2026-11-16-7 |
| <a id="SCR-NETWORK-V03"></a> `SCR-NETWORK-V03` | namespace=prod, q=api, 절대 10:00~11:00을 선택한다 → 차트·표·흐름 모두 이 범위의 network.read 자료만 보인다 → 다른 서비스나 기간이 흐름에 남으면 실패 | 차트/표 input은 keep으로 거르지만 flow의 ingress·services는 namespace만 거른다(`apps/wake/pages/network.js:61`, `apps/wake/pages/network.js:91`). | 서비스 검색어가 흐름에 적용되지 않고 load의 응답 세대 비교도 없다. | 고정 없음 → TASK-SCREEN-NETWORK | D00066; D-USR-2026-11-16-7 |
| <a id="SCR-NETWORK-A01"></a> `SCR-NETWORK-A01` | 현재 구간에서 지난 24시간 구간으로 전환한다 → 과거 구간에서는 최신 상태 머리 값 대신 선택 범위 값임을 표시한다 → 지난 범위 값을 현재 상태로 표시하면 실패 | traffic은 snap.range 축을 쓰지만 머리 rx/tx는 마지막 값이고 선택 구간 표식이 없다(`apps/wake/pages/network.js:50`, `apps/wake/pages/network.js:57`). | 과거 구간 머리 값에 과거 수집 범위 안내가 없다. | 고정 없음 → TASK-SCREEN-NETWORK | D00451 |
| <a id="SCR-NETWORK-A02"></a> `SCR-NETWORK-A02` | 네트워크 수집을 중단하고 마지막 성공 자료를 유지한다 → 출처가 오래되면 현재 행 값·흐름 건강을 단정하지 않고 과거 차트와 수집시각을 남긴다 → 오래된 흐름을 현재 건강으로 표시하면 실패 | stale이면 차트만 남기고 표 행과 flow를 숨긴다(`apps/wake/pages/network.js:93`). | sources.of의 기준 now가 snap.at에 고정되어 시간이 지나도 오래됨 판단이 늦을 수 있다. | 고정 없음 → TASK-SCREEN-NETWORK | D00451 |
| <a id="SCR-NETWORK-G01"></a> `SCR-NETWORK-G01` | 트래픽 계측이 없는 클러스터를 연다 → active connections·retrans를 미계측으로 표시한다 → 리소스 소유 관계를 서비스 트래픽으로 표시하거나 빈 값을 0으로 만들면 실패 | top은 결측 conns/retrans 열을 제거하고 serviceFlow는 저장소 연결을 추정한다(`apps/wake/pages/network.js:78`, `apps/wake/data/network.js:77`). | 미계측 이유를 표시하지 않으며 추정 링크에 실측 요청률을 그대로 배정한다. | 고정 없음 → TASK-SCREEN-NETWORK | D00883; D-USR-2026-11-16-7 |
| <a id="SCR-NETWORK-G02"></a> `SCR-NETWORK-G02` | wake://cluster/A/network를 연 뒤 홈 화면으로 잘못 이동한 캡처를 비교한다 → 네트워크 제목·route·data-wake-view=network가 일치할 때만 네트워크 증거로 인정한다 → 홈 캡처를 파일명만으로 인정하면 실패 | afterRender가 data-wake-view=network를 지정하고 meta는 네트워크 제목을 쓴다(`apps/wake/pages/network.js:101`). | 캡처의 route·제목·wakeView 일치를 강제하는 전용 점검 항목이 없다. | 고정 없음 → TASK-SCREEN-NETWORK | D00455; D00456; D-USR-2026-11-16-7 (route 식별자) |

## 표별 판단 계약

열의 원본식·단위·톤·툴팁·숨김 순서는 머리의 구성 요소 계약을 참조한다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-NETWORK-TABLE"></a> `SCR-NETWORK-TABLE` | → [RULE-SORT](../rules.md#RULE-SORT). | apps/wake/data/network.js:40 serviceRows()는 rx+tx 내림차순→id로 정렬한다 | 상태 위험/주의 정렬과 namespace/name/UID 동점 키가 없다. 미계측은 V01의 숨김 문제가 남는다 | 고정 없음 → TASK-SCREEN-NETWORK | D-USR-2026-11-16-2, D-USR-2026-11-16-7, D00883 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-NETWORK-TRUTH"></a> `SCR-NETWORK-TRUTH` | 수신·송신 실측만 있고 연결·재전송은 없는 응답을 연다 → snap.queries/range/step과 단위, 미계측 이유를 표시하며 구성 연결은 추정으로 구분한다 → 관계선에 근거 없는 실측량을 붙이면 실패 | traffic은 query/step/구간을 공개하고 flow는 estimated 링크를 표기한다(`apps/wake/pages/network.js:55`, `apps/wake/pages/network.js:68`). | 표는 미계측 열을 제거하고 추정 저장소 링크에는 서비스 요청률 전체를 복사한다. | 고정 없음 → TASK-SCREEN-NETWORK | D00066; D00883 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-NETWORK-REQ-R-045"></a> `SCR-NETWORK-REQ-R-045` | Service 객체만 있고 통신 시리즈는 없는 응답을 준다 → 활성 연결·재전송은 미계측, 흐름은 통신 근거 없음으로 보인다 → Service 개수를 연결 수로 바꾸면 실패 | serviceRows는 필드를 null로 시작하고 serviceFlow는 요청률이 없으면 빈 그래프를 반환한다(`apps/wake/data/network.js:31`, `apps/wake/data/network.js:62`). | 값은 만들지 않지만 빈 그래프와 미계측 원인을 설명하는 문구가 없다. | 고정 없음 → TASK-SCREEN-NETWORK | D00883; D-USR-2026-11-16-7 |
| <a id="SCR-NETWORK-LAB-P4"></a> `SCR-NETWORK-LAB-P4` | 동일 namespace의 웹·DB Service와 Ingress 요청률만 공급한다 → 관측 Ingress 링크와 추정 DB 링크를 구분하고 conns/retrans는 이유 있는 빈 값으로 둔다 → namespace 일치만으로 실제 DB 호출로 표시하면 실패 | serviceFlow는 namespace가 같은 모든 저장소에 estimated 링크를 만든다(`apps/wake/data/network.js:73`). | 추정의 근거가 이름·namespace뿐이며 연결·재전송 미계측 설명은 없다. | 고정 없음 → TASK-SCREEN-NETWORK | D00883; D-USR-2026-11-16-7 |
