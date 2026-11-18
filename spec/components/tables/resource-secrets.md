# Secret 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-SECRETS-01

- 목표: kind=secrets 목록 주소와 Secret 이름 검색을 요청한다 → Secret을 조회하지 않고 값·키·개수를 노출하지 않는다. 검색·행 생성·상세 이동·정렬도 비활성이다. 제품 제약이 잔존 열 선언보다 우선한다; [RULE-SECRET](../../rules.md#RULE-SECRET).
- 현재: ROW.secrets가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:170`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: Secret 열·mapper가 남아 있으므로 미노출·미조회 목표와 다르다.
- 고정 장치: 고정 없음 → TASK-CMP-K-SECRETS
- 출처: D-01; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 금지 상태에서 남아 있는 열 선언

아래 식·폭은 잔존 선언의 추적 정보다. 모든 열의 목표는 렌더·정렬·툴팁·행동 없음이며 이 표를 읽기 허용으로 해석하지 않는다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-secrets-c001"></a>CMP-K-SECRETS-C001 | Name | text | 잔존 식: `metadata.name` | 렌더 없음 | 원문↑ | 렌더 없음 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | Secret 목록 표의 Name 값을 요구한다 → Secret 목록·열·검색 결과를 생성하지 않는다; 표시: 원문 열 렌더 없음; 단위·반올림·톤 적용 없음 →Name 원문이나 Secret 요청이 생기면 실패. 비밀 조회나 숨은 셀에 원문을 남기지 않음. | ROW.secrets의 metadata.name 매핑 잔존(`apps/wake/data/kinds.js:170`) | Name 열 선언 잔존(apps/wake/data/kinds.js:170) | 고정 없음 → TASK-CMP-K-SECRETS | D-01 |
| <a id="cmp-k-secrets-c002"></a>CMP-K-SECRETS-C002 | Namespace | text | 잔존 식: `metadata.namespace` | 렌더 없음 | 원문↑ | 렌더 없음 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2) ``; muted | Secret 목록 표의 Namespace 값을 요구한다 → Secret 목록·열·검색 결과를 생성하지 않는다; 표시: 원문 열 렌더 없음; 단위·반올림·톤 적용 없음 →Namespace 원문이나 Secret 요청이 생기면 실패. 비밀 조회나 숨은 셀에 원문을 남기지 않음. | ROW.secrets의 metadata.namespace 매핑 잔존(`apps/wake/data/kinds.js:170`) | Namespace 열 선언 잔존(apps/wake/data/kinds.js:170) | 고정 없음 → TASK-CMP-K-SECRETS | D-01 |
| <a id="cmp-k-secrets-c003"></a>CMP-K-SECRETS-C003 | Type | text | 잔존 식: `x.type` | 렌더 없음 | 원문↑ | 렌더 없음 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2.6) ``; muted | Secret 목록 표의 Type 값을 요구한다 → Secret 목록·열·검색 결과를 생성하지 않는다; 표시: 원문 열 렌더 없음; 단위·반올림·톤 적용 없음 →Type 원문이나 Secret 요청이 생기면 실패. 비밀 조회나 숨은 셀에 원문을 남기지 않음. | ROW.secrets의 x.type 매핑 잔존(`apps/wake/data/kinds.js:170`) | Type 열 선언 잔존(apps/wake/data/kinds.js:170) | 고정 없음 → TASK-CMP-K-SECRETS | D-01 |
| <a id="cmp-k-secrets-c004"></a>CMP-K-SECRETS-C004 | Data | number | 잔존 식: `Object.keys(x.data).length` | 렌더 없음 | 원시 수치↓ | 렌더 없음 | CMP-TABLE-04 | 유지; `` var(--space-16) `` | Secret 목록 표의 Data 값을 요구한다 → Secret 목록·열·검색 결과를 생성하지 않는다; 표시: 원문 열 렌더 없음; 단위·반올림·톤 적용 없음 →Data 원문이나 Secret 요청이 생기면 실패. 비밀 조회나 숨은 셀에 원문을 남기지 않음. | ROW.secrets의 Object.keys(x.data).length 매핑 잔존(`apps/wake/data/kinds.js:170`) | Data 열 선언 잔존(apps/wake/data/kinds.js:170) | 고정 없음 → TASK-CMP-K-SECRETS | D-01 |
| <a id="cmp-k-secrets-c005"></a>CMP-K-SECRETS-C005 | Age | time | 잔존 식: `age(metadata.creationTimestamp,now)` | 렌더 없음 | 생성시각↓ | 렌더 없음 | CMP-TABLE-04 | 1; `` var(--space-16) `` | Secret 목록 표의 Age 값을 요구한다 → Secret 목록·열·검색 결과를 생성하지 않는다; 표시: 원문 열 렌더 없음; 단위·반올림·톤 적용 없음 →Age 원문이나 Secret 요청이 생기면 실패. 비밀 조회나 숨은 셀에 원문을 남기지 않음. | ROW.secrets의 age(metadata.creationTimestamp,now) 매핑 잔존(`apps/wake/data/kinds.js:170`) | Age 열 선언 잔존(apps/wake/data/kinds.js:170) | 고정 없음 → TASK-CMP-K-SECRETS | D-01 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| status | `` null `` |
| keyNames | `` Object.keys(x.data \|\| {}) `` |
