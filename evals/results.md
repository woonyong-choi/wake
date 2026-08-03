# RCA 규칙 엔진 평가 결과

합성 골든셋(카탈로그 YAML 역산)으로 plan_causes → evaluate_causes → analyze_root_cause 전체 경로를 실측한 결과.

## 골든셋
- rule: 29개 / candidate: 87개
- positive 시나리오: 87개 (candidate 당 1개, 모든 signal 그룹의 any_of 첫 매처 충족)
- healthy 시나리오: 29개 (rule 당 1개, 신호 없음)

## 지표
| 지표 | 값 | 정의 |
|---|---|---|
| accuracy | 100.0% (87/87) | positive에서 root cause == 골든 라벨 |
| coverage | 100.0% (116/116) | plan_causes 가 rule_missing 없이 후보 생성 |
| false positive | 0.0% (0/29) | healthy에서 특정 원인 확정 (unknown/insufficient 는 정상) |

## 혼동 사례 (골든 → 판정)
- 없음

## healthy 오탐 사례
- 없음
