# 클러스터 연결 흐름

시작은 첫 실행 클러스터 단계 또는 설정의 연결 추가, 종료는 선택한 context의 읽기 검증·등록 또는 원인이 보이는 취소/실패다. [공통 7상태](../product.md)를 적용한다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

## FLOW-CLU-001: 진입·입력·발견

- 목표: 입력: 첫 실행과 설정에서 context가 두 개인 시험 kubeconfig 파일을 선택하고 하나만 연결한다 → 기대: 첫 실행과 설정은 CLUSTER_ADD의 파일/붙여넣기, 서버주소+토큰, 클라우드 명령 세 방법을 공유한다. 클라우드는 AWS(name,region), GCP(name,region,project), Azure(name,group), kind(name)다. 실제 context를 열거하고 선택한 것만 probe한다. 표시 이름과 등록 ID는 별개로 보존한다. 파일을 읽었다고 연결 성공으로 표시하지 않는다. → 실패: 선택하지 않은 context를 probe하거나 파일 읽기만으로 연결됨이 나타나면 실패
- 현재: `apps/wake/app.config.js:230`의 CLUSTER_ADD와 :233의 CLOUDS를 :234에서 connectPages에 전달한다.
- 차이: 파일 입력 뒤 `connect-flow.js:364`는 added[0]을 선택하므로 다중 context 중 사용자 선택을 probe에 연결하는 단계가 없다. → TASK-A3-CLU-001
- 고정 장치: 고정 없음 → TASK-A3-CLU-001
- 출처: D00078 D00445 D00456 D00499 D00994 D01003; R-010,R-058; 1차 ).

## FLOW-CLU-002: 단계·대기·취소·재시도

- 목표: 입력: conn.step이 exit=0을 반환하지만 kubeconfig가 그대로이고, 다음 요청은 15초간 출력이 없는 상태에서 취소한다 → 기대: cloud는 도구 확인→로그인→kubeconfig→도달→인증→권한, file/token은 input→kubeconfig→도달→인증→권한을 실행한다. AWS aws eks update-kubeconfig, GCP gcloud container clusters get-credentials, Azure az aks get-credentials 등 실제 명령을 사용한다. exit0도 kubeconfig 변화와 probe 없이는 성공이 아니다. 15초 무출력은 응답 기다리는 중, 취소 유지. 임의 10초 제한으로 실패시키지 않고 실제 한도를 쓴다. retry는 실패 단계부터, 중복 클릭은 1흐름, 취소 후 늦은 답으로 완료하지 않는다. → 실패: 파일 변화·probe 없이 성공하거나 취소 뒤 늦은 응답으로 완료되면 실패
- 현재: `apps/wake/data/connect-flow.js:373`는 명령 종료 뒤 fingerprint를 비교하고 unchanged면 실패 처리한다.
- 차이: 없음(확인: apps/wake/data/connect-flow.js:373; 같은 파일 :492 재확인과 세대 검사)
- 고정 장치: `apps/wake/data/connect-flow.test.mjs`, 시험 `종료 0인데 kubeconfig가 그대로면 실패(입력값 확인)`
- 출처: D00011 D00012 D00013 D00032 D00036 D00428 D00429; 옛 결정 문서 연결 흐름; R-058.

## FLOW-CLU-003: 등록·복원·권한·해제

- 목표: 입력: kube.probe가 pods list 403을 반환한 뒤 권한을 복구하고 등록·재시작·해제를 차례로 누른다 → 기대: 성공은 선택 context의 도달·인증·Pod 읽기 권한 확인 뒤 등록한다. 403은 실제 user/verb/resource/namespace를 보여 준다. metadata와 credential 참조만 저장하고 비밀은 보안 저장소에 둔다. 재시작에 프로세스 전용 bindingId를 영속 자격으로 믿지 않는다. 해제는 Wake 연결과 런타임 자원만 정리하며 사용자 클러스터·namespace·kubeconfig를 지우지 않는다. 기본 AI 권한 read, secretRead false다. → 실패: 403의 user/verb/resource/namespace가 빠지거나 해제가 사용자 kubeconfig·클러스터를 지우면 실패
- 현재: `apps/wake/data/connect-flow.js:151`의 connectionRecord는 기본 read·secretRead=false를 만들지만 :153은 입력 secretRead를 그대로 boolean으로 받는다.
- 차이: secretRead=true 입력을 policyProblems가 거부하지 않는다. 기본값과 Secret 읽기 금지 정책의 강제가 다르다. → TASK-A3-CLU-003
- 고정 장치: `apps/wake/data/connect-flow.test.mjs`, 시험 `정책: 기본은 나만·각자 로그인·읽기 전용·Secret 꺼짐`
- 출처: D00016 D00033 D00048 D00115 D00428 D00449 D00994; R-010,R-011,R-058.
