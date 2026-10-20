# 설계 근거 — 왜 이 구조를 골랐고, 무엇을 버렸나

이 문서는 "무엇을 만들었나"가 아니라 **왜 그렇게 만들었고 무엇을 버렸는지**를 적는다.
구현 목록은 [README](../README.md), 안전 계약의 조문은
[Golden Path 안전 계약](GOLDEN-PATH.md)에 있다.

이 저장소가 붙잡은 문제는 하나다.

> 장애 대응 자동화에서 가장 위험한 것은 **못 고치는 것이 아니라 잘못 고치는 것**이다.
> 그래서 판단을 넓히는 대신, **이 도구가 절대 하지 않는 일**을 코드로 강제한다.

![파이프라인 흐름도: 증거 수집 → 사건 동일성 → versioned rule RCA. 규칙 밖이면 실패 단계와 reason code를 남기고 멈추고, 규칙과 맞으면 allowlist 제한 패치 → base SHA 재확인 → Draft PR → 사람 승인 → 배포 후 회복 검증으로 이어진다](https://raw.githubusercontent.com/woonyong-choi/k8s-clue/main/docs/figure.png)

위 그림에서 위쪽 갈래(규칙 밖 → 실패 단계·reason code 보존)가 이 저장소가 지키려는 fail-closed 경로다. 아래 갈래만 PR로 나간다.

세 개의 경계가 그 문장을 코드로 옮긴 것이다 — 원인 판정의 경계, 변경의 경계,
관측의 경계. 아래는 각 경계에서 고른 자료구조와 버린 대안이다.

---

## 1. 변경의 경계 — 왜 YAML 을 다시 쓰지 않고 byte span 만 갈아끼우는가

`domains/gitops/source_patch.py:766` (`_materialize_scalar_replacements`)

PR 로 나가는 것은 **사람이 읽고 승인할 diff** 다. diff 에 의도하지 않은 줄이
한 줄이라도 섞이면 리뷰어는 그 PR 전체를 믿을 수 없게 된다. 그래서 목표를
"원하는 값으로 바꾼다"가 아니라 **"그 밖의 어떤 byte 도 움직이지 않는다"** 로 잡았다.

구현은 이렇게 한다.

1. 승인된 원문을 `yaml.compose_all` 로 **node 트리**로 파싱한다(값이 아니라 위치를 얻기 위해).
2. field path(`spec.template.spec.containers[name=api].image`)를 따라 대상 `ScalarNode` 를 찾고,
   그 node 의 `start_mark.index ~ end_mark.index` 구간만 문자열 치환한다.
3. 치환된 문서를 **다시 파싱해 기대 객체와 정확히 같은지 사후 검증**한다.
   다르면 패치를 버린다 — 성공 경로에도 사후 조건이 있다.

`tests/test_source_patch_splice_properties.py` 가 이것을 속성으로 고정한다:
들여쓰기·선행 주석·인용 방식을 바꿔 가며 ① 정확히 한 줄만 움직이고 ② 주석 수가
보존되고 ③ rollback 이 원문을 **byte 단위로** 복원하는지 검사한다.

### 버린 대안 1 — `ruamel.yaml` round-trip 덤프

포맷을 어느 정도 보존하는 round-trip 덤퍼가 있고 훨씬 적은 코드로 끝난다.
버린 이유: **보존이 "어느 정도"다.** 인용 방식, 빈 줄, flow/block 스타일, 긴 줄 접힘이
덤퍼 설정에 따라 달라진다. 어느 줄이 왜 움직였는지를 리뷰어에게 설명할 수 없고,
"이 diff 에는 승인한 것 외에 아무것도 없다"를 테스트로 말할 수 없다.
span 치환은 그 문장이 정의상 참이 된다 — 건드린 구간이 명시적이기 때문이다.

### 버린 대안 2 — kustomize edit / strategic merge patch 로 변경을 표현

`kustomize edit set image` 나 overlay patch 를 만들어 얹는 방법.
버린 이유: **권한 경계가 흐려진다.** overlay 를 추가하면 그 파일은 앞으로 모든
필드를 덮어쓸 수 있는 자리가 되고, "Deployment 의 허용된 scalar 만" 이라는 제약이
파일 구조가 아니라 사람의 규율에 의존하게 된다. 지금은 허용 목록이
`action_allows_replacement()` 한 함수에 있고(`source_patch.py:359`),
그 밖의 경로는 `ManifestSourcePatchError` 로 닫힌다.
대신 kustomize 로 관리되는 저장소를 **읽는** 경로는 남겼다
(`domains/gitops/kustomize_edit_source.py` — 어느 파일이 그 필드의 소유자인지 찾고,
overlay 가 같은 필드를 이미 소유하면 base 편집을 거부한다).

### 알려진 한계

- anchor/alias 가 있는 문서는 아예 거부한다(`source_patch.py:779`).
  alias 를 통한 치환은 한 곳을 바꾸면 여러 곳이 바뀌어 "한 줄만 움직인다"가 깨진다.
- 한 PR 에서 바꿀 수 있는 scalar 는 최대 4개, action type 은 6종이다.
  늘리려면 허용 규칙을 먼저 쓰게 되어 있다.

---

## 2. 원인 판정의 경계 — 왜 LLM 이 아니라 versioned rule 인가

`services/ai/agent/causes/` (엔진) + `causes/catalog/*.yaml` (룰 데이터)

원인 판정이 비결정적이면 같은 증거에 어제와 오늘 다른 답이 나온다.
그러면 "왜 이 PR 이 생겼는가"를 사후에 재구성할 수 없고, 리뷰어가 검증할 대상도 사라진다.
그래서 판정은 **버전이 붙은 규칙**만 한다. 규칙 밖이면 그럴듯한 추측을 내놓는 대신
실패 단계·reason code·원본 evidence reference 를 남기고 멈춘다.

자료구조는 단순하다: 증상 → 후보 목록, 후보마다 `expected_evidence`(어떤 소스가
필요한가)와 `signals`(어떤 내용이 관측돼야 하는가). 점수는
`(충족 소스 + 충족 신호 그룹) / (필요 소스 + 신호 그룹)`.

여기서 실제로 고생한 지점이 두 개 있고, 둘 다 코드에 방어선이 남아 있다.

- **소스 존재만으로 1.0 이 되는 오판.** 처음엔 `expected_evidence` 만 셌다.
  그러면 `registry_unavailable` 처럼 추가 소스를 요구하지 않는 후보가 증거 내용과
  무관하게 항상 만점을 받는다. 그래서 **판별 신호**(이벤트·로그 내용 매칭)를 분모에 넣고,
  신호 그룹이 하나라도 미충족이면 완결(`rca.completed`)이 아니라 blocked 로 흐르게 했다
  (`causes/engine.py:150-165`).
  회귀 테스트: `test_no_discriminating_event_cannot_finalize_a_cause`.
- **좁은 신호가 넓은 신호의 부분 문자열일 때 선언 순서로 승패가 갈리는 문제.**
  점수 동률이면 **판별 신호를 더 많이 충족한(더 구체적인) 후보**를 고르도록
  tie-break 를 넣었다(`causes/engine.py:313`).
  이것이 깨지지 않았는지는 `make rca-eval` 이 87개 candidate 전부에 대해 확인한다
  (혼동 사례 0 = 가려진 후보 없음).

### 버린 대안 1 — LLM 에게 원인을 묻고 근거를 붙이게 한다

버린 이유: 재현되지 않는 판정은 **승인 절차의 입력이 될 수 없다.**
같은 증거에 다른 답이 나오면 "이 PR 이 왜 생겼는가"에 답할 수 없다.
LLM 경로를 완전히 지운 것은 아니고, 후보의 출처를 `source="ai_fallback"` 로 구분할
자리는 남겨 두었다(`CauseCandidate.source`). 다만 현재 판정 경로는 규칙만 쓴다.

### 버린 대안 2 — 룰을 파이썬 코드로만 작성

초기 구현이 그랬다(`causes/image_pull.py` 등). 버린 이유: 장애 시나리오 하나를
추가할 때마다 코드 리뷰가 필요하고, 룰 전체를 한눈에 비교할 수 없었다.
지금은 카탈로그 디렉터리의 `*.yaml` 한 개가 곧 시나리오 하나이고, 잘못된 파일이나
중복 id 는 **기동 시점에 즉시 실패**한다(`causes/catalog/__init__.py`).
코드 룰(`@rca.cause`) 경로는 호환을 위해 남겼다.

### 알려진 한계

실제 장애 증거에 대한 정확도는 측정하지 않았다. `evals/` 의 골든셋은 카탈로그 YAML 을
역산해 만든 합성 데이터라, accuracy 100% 는 "정확하다"가 아니라
**"어떤 후보도 가려져 있지 않다"** 는 뜻이다. 근거는 [evals/results.md](../evals/results.md)
첫 절에 적어 두었다. 라벨이 붙은 실제 사건 기록이 생기기 전까지 이 한계는 남는다.

---

## 3. 관측의 경계 — 왜 "이번에 안 보였다"가 "지워졌다"가 아닌가

`domains/inventory/coverage.py`

에이전트는 전체 클러스터를 증명하지 않고 namespace 단위 cut 만 수집할 수 있다.
수집이 잘렸거나(`truncated`) label selector 로 좁혀졌다면, 스냅샷에 없는 리소스는
지워진 것이 아니라 **애초에 보지 않은 것**이다. 이 둘을 섞으면 살아 있는 리소스가
대량으로 deleted 로 표시되는 쪽으로 틀린다 — 되돌리기 가장 어려운 실패다.

그래서 삭제 권한을 **범위 단위로** 발급한다. `inventory_deletion_scopes()` 는
`observed ∧ complete ∧ delete_safe ∧ ¬truncated ∧ label selector 없음 ∧ reason code 없음`
인 collection 에서만 `(resource_type, namespace)` 범위를 내준다.
Event 는 보존 기간이 지나면 사라지므로 어떤 조건에서도 삭제 권한을 얻지 못한다
(`DELETE_SAFE_COLLECTIONS` 에서 제외).

`tests/test_inventory_delete_scope_properties.py` 가 이것을 속성으로 고정한다 —
반환된 모든 범위에 대해 그것을 정당화하는 완전 관측 항목이 존재해야 하고,
항목이 하나라도 잘리거나 좁혀졌으면 범위는 사라져야 한다.

### 버린 대안 — 수집이 완전할 때만 삭제하고, 아니면 아무것도 하지 않는다

가장 단순하고 지금도 fallback 으로 남아 있는 방식(`resources_complete` 경로).
버린 이유는 아니고 **범위 삭제를 그 위에 얹은** 것이다. 큰 클러스터에서 전체 수집이
매번 완전하기를 기대할 수 없다. 전체 수집이 완료될 때까지 삭제를 미루면 inventory에 오래된 행이 계속 남을 수 있다.
namespace 하나를 끝까지 봤다면 그 namespace 안에서는 삭제를 말할 수 있다는 것이 절충이다.

### 알려진 한계 (지금 열려 있는 구멍)

현재 에이전트는 Pod namespace별 `collection_coverage`를 만든다. [수집기](../src/services/target/cluster-agent/providers/kubernetes_providers.py)의 `pod_collection_coverage()`가 필터·잘림·수집 실패·식별자 누락을 검사하고, [사건 이력 수신](../src/domains/rca/history_ingest.py)이 이 증명을 snapshot summary에 전달한다. [인벤토리 저장소](../src/domains/inventory/repository.py)는 전달된 증명으로 삭제 가능 범위를 판단한다.

지원 범위는 완전성이 증명된 Pod namespace뿐이다. Workload·Service 등 다른 collection은 이 경로로 삭제 권한을 받지 않는다. Pod 목록이나 payload가 잘려 어느 namespace에서 항목이 빠졌는지 알 수 없으면 해당 payload의 모든 Pod 증명을 폐기한다. 증명 없는 부재를 삭제로 처리하지 않으며 Event도 삭제 범위에서 제외한다. namespace 일부의 증명이 클러스터 전체 수집의 완전성을 뜻하지는 않는다.

[수집 연결 회귀 시험](../tests/test_incident_history_collection.py)의 `test_a_proven_namespace_records_replacement_and_deletion`은 provider 출력부터 인증된 수신·DB·이력 조회까지 이 경로를 검사한다. 이 시험은 격리된 PostgreSQL과 Redis가 필요하며, 로컬 단위 시험만으로 해당 통합 검증을 대신하지 않는다.

---

## 다음 병목 (이 순서로 본다)

1. 실제 kind 클러스터에서 장애 주입 → Draft PR 발행까지 E2E 를 한 번 통과시킨다.
   현재 보장 범위는 계약 테스트까지다.
2. 위의 Pod namespace 증명과 삭제 연결을 격리된 PostgreSQL·Redis 통합 시험으로 확인한다. 다른 리소스 종류의 삭제 지원으로 확대 해석하지 않는다.
3. 두 번째 Golden Path(CrashLoopBackOff 또는 OOMKilled)를 같은 안전 계약 위에 올린다.
   룰은 이미 카탈로그에 있고, 막히는 곳은 패치 allowlist 와 회복 검증 쪽이다.
