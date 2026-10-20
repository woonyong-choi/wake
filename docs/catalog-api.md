[← k8s-clue 로 돌아가기](../README.md) · [← 품질 검사 SQL](sql-quality-checks.md)

# 카탈로그 조회 API

> **자료 목록 관리** · 팀 프로젝트 종료 후 개인 작업. `k8s-ops-min` 에서 옮겨 왔다.

"이 자산의 스키마가 언제 바뀌었나"는 사람이 물어도, 도구가 물어도 같은 질문이다.
---

## API

```
GET  /v1/catalog/sources                     등록된 원천 시스템
GET  /v1/catalog/assets                      자산 검색
GET  /v1/catalog/assets/{id}                 자산 상세 + 현재 스키마 버전
GET  /v1/catalog/assets/{id}/schema          계약 이력 + 변경 요약
GET  /v1/catalog/assets/{id}/lineage         upstream 역추적 경로
GET  /v1/catalog/resources/state             리소스별 마지막 관측 상태
GET  /v1/catalog/quality/issues              미해결 품질 이슈
GET  /v1/catalog/runs                        실행 이력 + 소스별 지표
```

→ [`src/domains/datacatalog/router.py`](../src/domains/datacatalog/router.py)

경로에 `/v1`을 둡니다. [수집 완전성 계약](collection-contract.md)에서 응답 계약에 버전이 없다고 적었는데, 그 구멍은 자산 스키마 버전이 아니라 **API 버전**으로 메워야 하는 것이었습니다. 자산의 `schema_version`은 데이터의 계약이지 응답의 계약이 아닙니다.

### 응답 envelope

정상 조회는 `data`, `page`, `evidence`로 구성한 envelope를 쓴다. 아래는 형식을 설명하는 합성 데이터의 축약 예시다. 오류 응답은 이 envelope를 쓰지 않는다.

```jsonc
{
  "data": [ /* ... */ ],
  "page": {
    "limit": 50,
    "next_cursor": "eyJvZmZzZXQiOjUwfQ==",
    "total_estimated": 214,
    "truncated": true
  },
  "evidence": {
    "run_id": "catalog_reconciliation_daily__2026-07-29__1",
    "logical_date": "2026-07-29",
    "run_status": "PARTIAL",
    "checked_at": "2026-07-30T02:14:11Z",
    "reason_codes": [
      { "code": "SOURCE_FAILED", "source": "loki" }
    ]
  }
}
```

세 가지를 지켰습니다.

**`evidence`가 항상 붙습니다.** `run_status`가 `PARTIAL`이면 **이 조회 결과 자체가 부분 데이터**라는 뜻입니다. 카탈로그가 "이슈 0건"이라고 답해도, 그 검사가 일부 원천을 못 봤다면 0건의 의미가 다릅니다. [수집 완전성 계약](collection-contract.md)의 원칙이 한 단계 위로 올라갑니다. 수집 결과의 완전성뿐 아니라 **검사 결과의 완전성**도 전달합니다.

**`reason_codes`가 구조체입니다.** 처음에는 `"SOURCE_FAILED:loki"` 같은 문자열이었습니다. 소비자가 전부 `split(":")`을 쓰게 되고, 그 문자열은 LLM이 읽는 제어 필드이기도 합니다. 코드와 대상을 분리했습니다. 코드 목록은 [`contracts/catalog/reason_codes.py`](../src/packages/contracts/catalog/reason_codes.py)에 닫힌 열거로 둡니다.

`page.next_cursor`가 있어 상한 너머 데이터에도 접근할 수 있다. 수집 한도 설계(`collection-limits.md`)는 잘림을 숨기지 않는다는 원칙의 참조다. 해당 공개 원문을 이 저장소에서 확인할 수 없다. 잘림을 알리는 것과 다음 페이지에 도달할 수 있게 하는 것은 다르다.

### 상태 코드

기본 앱의 인증 검사는 비어 있지 않은 Bearer 토큰의 존재만 확인한다. 서명·만료·대상·read scope는 검사하지 않는다. 서비스 호스트가 [create_app](../src/domains/datacatalog/app.py)의 `verify_token` 의존성을 주입해 검증해야 한다. 라우터의 `require_read_scope`라는 함수 이름만으로 scope 검증을 보장하지 않는다.

현재 [라우터](../src/domains/datacatalog/router.py)와 기본 FastAPI 오류 처리의 응답은 아래와 같다.

| 상황 | 코드 | 본문 |
|---|---|---|
| 정상 | `200` | `data` + `evidence` |
| Bearer 토큰 없음·잘못된 형식·빈 값 | `401` | `detail.code = missing_token` |
| 주입한 검증기가 권한을 거부한 경우 | `403` | 검증기가 정한 응답. 시험의 예는 `detail.code = forbidden` |
| 자산 또는 스키마 이력 없음 | `404` | `detail.code = not_found` |
| 잘못된 cursor | `422` | `detail.code = invalid_parameter`, `detail.field = cursor` |
| 날짜·limit 등 요청 형식 위반 | `422` | FastAPI의 `detail` 오류 목록 |
| 처리하지 않은 내부 오류 | `500` | 기본 앱의 텍스트 `Internal Server Error` |

기존 설계의 `error.code = unauthenticated`, `error.code = forbidden`, `error.code = not_found`, `error.code = invalid_parameter`와 `error.field`는 현재 기본 응답 형식이 아니다. `429`·`503`과 `Retry-After`, 내부 오류에 `error.correlation_id`만 노출하는 처리도 아직 구현하지 않은 계약이다. 만료 토큰의 거부 여부와 권한 오류 형식은 호스트가 주입한 검증기에 달려 있다.

자산은 있는데 아직 검사되지 않은 경우는 `200`입니다. `evidence.run_status`가 `NEVER_RUN`이 됩니다. 이 값은 [카탈로그 상태 열거](metadata-catalog.md#실행-단위와-상태)에 정의돼 있습니다.

**"아직 검사 안 됨"과 "검사했는데 이슈 없음"을 같은 응답으로 내보내지 않습니다.**

오류 본문에 상관관계 ID만 노출하려는 설계 의도는 DB 접속 문자열이나 내부 호스트명이 스택 트레이스를 통해 새는 것을 막는 것이다. 현재 기본 앱에 그 변환기가 있는 것은 아니다.

---

## 검증

계약을 말로만 두지 않고 테스트로 고정한다. `PYTHONPATH=src uv run pytest tests/catalog -q` 로 재현한다.

| 주장 | 테스트 |
|---|---|
| 앱이 조립된다 | `test_catalog_api.py::test_앱이_뜬다` |
| 모든 응답이 같은 envelope 로 온다 | `test_catalog_api.py::test_소스_목록이_봉투_형태로_온다` |
| 상한 너머 데이터에 커서로 도달할 수 있다 | `test_catalog_api.py::test_커서로_다음_쪽을_받는다` |
| 한도를 넘는 요청은 거부한다 | `test_catalog_api.py::test_한도를_넘는_요청은_거부한다` |
| 미해결 이슈는 최신 실행 기준으로만 센다 | `test_catalog_api.py::test_미해결_이슈는_최신_실행_것만_센다` |
| 잘못된 파라미터는 422 로 거부한다 | `test_catalog_api.py::test_잘못된_날짜_형식은_거부한다` |
| 없는 자산은 404 다 | `test_catalog_api.py::test_없는_자산은_404` |
| 리소스 상태 조회는 클러스터를 반드시 받는다 | `test_catalog_api.py::test_리소스_상태는_클러스터를_반드시_받는다` |
| 토큰이 없으면 거부한다 | `test_catalog_api.py::test_토큰_없이는_거부한다` |
| Bearer 형식이 아니면 거부한다 | `test_catalog_api.py::test_bearer_형식이_아니면_거부한다` |
| 원천 실패가 사유 코드로 그대로 전달된다 | `test_catalog_api.py::test_원천_결과가_사유_코드로_그대로_옮겨진다` |

DB가 필요한 시험은 `CATALOG_DATABASE_URL` 또는 기본 로컬 접속 주소를 사용하고, 연결할 수 없으면 건너뛴다. 시험 fixture는 연결된 DB의 카탈로그 테이블을 재생성하므로 반드시 격리된 시험 DB를 지정해야 한다. 건너뛴 수까지 확인하고 시험 수를 인용한다.

### 구현하지 않은 것

- **읽기 전용 MCP 서버.** `k8s-ops-min` 에 시제품이 있었으나 실제 STS·MCP 클라이언트 연동을 검증하지 못해 이 저장소로 옮기지 않았다. 토큰 교환·감사·응답 절단 경계를 실제 클라이언트로 확인한 뒤 다시 가져온다.
- 토큰 기반 세밀 인가는 기본 앱에 없다. Bearer 형식과 빈 값만 검사하며, 서명·만료·scope 검증은 호스트의 `verify_token` 주입 책임이다.
- 관측 데이터 보존 정책은 미구현이다. 조회 API가 Secret 값을 반환하지 않아도 snapshot·로컬 보관 원본에는 값이 남을 수 있다.
