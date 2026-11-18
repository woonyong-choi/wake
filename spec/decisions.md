# 스펙 결정

2026-11-16 소유자 결정 「스펙 정본 3차: 결정 반영과 기본값 채택」을 출처로 삼는다. 아래 결정은 목표이며 제품 구현·시험·실제 화면의 완료를 뜻하지 않는다. 작업별 편집 범위는 [H-000](tasks.md#h-000-작업-소유와-실행-환경)에서 정한다.

## 사용자 확정 결정

### D-USR-2026-11-16-1 숫자 열 정렬


- 목표: → [RULE-SORT](rules.md#RULE-SORT).
- 현재: `kit/components/data-table.js:24`는 th를 왼쪽 정렬하고 :32는 숫자 셀에 tabular-nums를 지정한다.
- 차이: 없음(확인: `kit/components/data-table.js:98–119`, `kit/components/data-table-extras.test.mjs:28–35`). costs.js:138의 align:right는 렌더러가 소비하지 않는 속성이며 오른쪽 표시의 근거가 아니다.
- 고정 장치: `kit/components/data-table-extras.test.mjs` — `a name column leads with a dot or a kind icon, a figure column is a left tabular figure, a time column is quiet`
- 출처: D-USR-2026-11-16-1

적용: [표 공통 계약](components/table-contract.md)의 CMP-TABLE-01, [디자인](design.md)의 B-016, [화면 공통](screens/common.md)의 SCR-TABLE-CELLS, [회귀](regression.md)의 왼쪽 정렬 검사.

### D-USR-2026-11-16-2 표 기본 정렬


- 목표: → [RULE-SORT](rules.md#RULE-SORT).
- 현재: `apps/wake/pages/resource-list.js:143`은 rows.map(derived).filter(pass) 뒤 :147에서 잘라 표시한다.
- 차이: 리소스 목록에 danger/warn·namespace/name/UID 기본 비교기가 없다.
- 고정 장치: 고정 없음 → TASK-CMP-K-PODS
- 출처: D-USR-2026-11-16-2

적용: CMP-TABLE-05, B-045, F-BE-TABLE, FLOW-LIST-001~008, SRE-T-ALERT/SCOPE/AUDIT 및 해당 화면·부품 표. 리소스 상태 기준은 기존 상태 톤을 사용하며 새 장애 임계값을 만들지 않는다. 검색 관련성·비용 집계·Reason 집계·보고서 서술 순서는 아래 통일 목록으로 범위를 구분한다.

### D-USR-2026-11-16-3 복구 판정



- 목표: → [RULE-RECOVERY](rules.md#RULE-RECOVERY).
- 현재: `apps/wake/data/incident-model.js:188`은 전체 경과에서 misses를 차감하고 :192는 누적 misses로 inconclusive를 정한다.
- 차이: 누락 뒤 정상 시간을 처음부터 세지 않고 누락 시간을 뺀 전체 구간을 합산한다.
- 고정 장치: 고정 없음 → TASK-RECOVERY-OBS
- 출처: D-USR-2026-11-16-3

적용: CMP-INC-03, FLOW-INC-005, SRE-Q-12, SCR-INCIDENT-VERIFY 및 복구 검수. 장기 원인 검증의 7일 관찰은 서비스 복구 판정과 별도로 유지한다.

### D-USR-2026-11-16-4 자료 보관



- 목표: → [RULE-RETENTION](rules.md#RULE-RETENTION).
- 현재: `apps/wake/desktop/hub-store.cjs:42`의 cutoff는 모든 log/docs에 같은 retentionDays를 사용하고 :87의 prune이 전 파일에 적용한다.
- 차이: 대화365일·Event7일·기본90일을 나누는 종류별 TTL이 없다.
- 고정 장치: 고정 없음 → TASK-RETENTION-SPLIT
- 출처: D-USR-2026-11-16-4

적용: CON-006/009/017, F-BE-014, PERF-008/030, FLOW-SET-003, 보관 설정 화면.

### D-USR-2026-11-16-5 화면 속도


- 목표: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE).
- 현재: `kit/page/boot.js:212`는 그린 뒤 두 requestAnimationFrame을 기다리지만 화면 첫 그림·완성·layout-shift를 측정하지 않는다.
- 차이: 150ms/1초/0.01의 관측값과 빈 창·칸 0을 판정하는 통합 성능 장치가 없다.
- 고정 장치: 고정 없음 → T-PERF-01
- 출처: D-USR-2026-11-16-5

적용: PERF-001~004/016/017, B-013/015, 화면 공통 성능·펼침 규칙. 판단 창과 첫 그림 목표는 각각 → [RULE-FOLD](rules.md#RULE-FOLD), [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE).

### D-USR-2026-11-16-6 동시 작업

Electron 2자리, 무거운 점검 1개, 독립 검증 1개다. 자기 PID·포트·프로필과 전용 시험 kubeconfig를 사용한다. 이 상한은 제품 내부의 읽기 요청 동시성 상한과 구분한다.

- 목표: Electron 두 자리와 heavy·독립 검증 각 한 자리를 점유한 뒤 같은 종류의 실행을 추가 요청한다 → 추가 실행은 대기하고 기존 PID·포트·프로필·시험 kubeconfig 소유를 유지한다(실행 슬롯·프로세스 소유 기록) → 세 번째 Electron 또는 두 번째 heavy·독립 검증을 실행하거나 사용자 kubeconfig를 사용하면 실패.
- 현재: `kit/tools/check-tests.mjs:35`은 spawnSync로 시험을 실행하며 프로세스 간 슬롯을 획득하지 않는다.
- 차이: 실행 진입점에 Electron2·heavy1·검증1 상한을 강제하는 공통 가드가 없다.
- 고정 장치: 고정 없음 → G-T-10
- 출처: D-USR-2026-11-16-6

적용: C-010, PERF-010, C-010. 동시 구현자 수는 아래 기본값으로 통일한다.

### D-USR-2026-11-17-1~5 범위 검색 상자

2026-11-17 사용자가 견본의 범위 검색 상자(클러스터 화면 여덟의 머리 아래 kit composer 하나)를 받아들이며 정한 다섯 가지다. 화면 계약은 [SCR-SEARCH-SCOPE](screens/common.md#SCR-SEARCH-SCOPE), 실행은 [H-009 범위 검색 상자](tasks.md#H-009-scope).

- D-USR-2026-11-17-1(대체됨 → [D-USR-2026-11-17-7](#d-usr-2026-11-17-610-범위-검색-상자-v3)): 기간 고르기는 상자 아래 줄 오른쪽, 실행 단추 바로 왼쪽. 여덟 화면의 상자 밑 기간 줄은 없어진다. 폭이 모자라면 kit 알약이 접히듯 접히고 넘치지 않는다.
- D-USR-2026-11-17-2: 종류와 namespace는 여덟 화면이 함께 쓰는 하나의 범위이고, 글은 화면마다 따로다(화면을 옮겨도 글이 따라가지 않음).
- D-USR-2026-11-17-3: 종류는 어디서나 소유한 것까지 맞춘다. Deployment를 고르면 이벤트 탭에 그 Pod의 이벤트가 들어온다(홈 카드와 같은 관계).
- D-USR-2026-11-17-4: 종류를 고르지 않은 리소스 화면은 모든 종류를 한 목록(Name·Kind·Namespace·Status·Age), 문제 먼저로 보인다(유지).
- D-USR-2026-11-17-5(줄마다 "클러스터 전체" 칸은 대체됨 → [D-USR-2026-11-17-10](#d-usr-2026-11-17-610-범위-검색-상자-v3)): 범위가 있을 때 홈 지표 줄은 클러스터 값과 "클러스터 전체" 칸을 보이고, namespace 라벨이 없는 알림은 늘 보인다(유지).
- 출처: 2026-11-17 사용자 승인(범위 검색 상자 견본)

### D-USR-2026-11-17-6~10 범위 검색 상자 v3

2026-11-17 사용자가 견본의 범위 검색 상자 v3(design/sim/sim-views.js scopeBox · scopeHead · pickMenu)를 받아들이며 정한 다섯 가지다. 화면 계약은 [SCR-SEARCH-SCOPE](screens/common.md#SCR-SEARCH-SCOPE), 실행은 [H-009 범위 검색 상자 v3 이식](tasks.md#H-009-scope-v3).

- D-USR-2026-11-17-6: 상자는 한 줄이다(kit composer wide): [리소스 종류 ▾][namespace ▾] 글(화면마다 자리 표시 글) … 실행. 글이 여러 줄일 때만 커진다.
- D-USR-2026-11-17-7: 기간은 상자 밖, 상자 바로 아래 제 줄의 오른쪽 끝이다(처음 승인은 왼쪽, 같은 날 사용자가 오른쪽으로 바꿈; 견본 .v-when도 같음). 홈·네트워크·GitOps·이벤트·로그·알림·인시던트에만 있고 리소스에는 없다. kit composer의 `end` 칸은 지운다(D-USR-2026-11-17-1 대체).
- D-USR-2026-11-17-8: 두 고르기는 같은 다중 선택 메뉴다(검색, 세 상태 "전체", 체크 · 아이콘 · 이름 · 수). 종류도 여럿 고르고 관계는 합집합이다. 수는 객체 수: 종류는 고른 namespace 안의 그 종류 객체, namespace는 고른 종류(없으면 읽을 수 있는 모든 종류)의 그 namespace 객체. 실제 읽기에서만 세고, 메뉴를 열 때 읽으며 올 때까지 읽는 중을 보인다. 읽을 수 없는 종류는 자물쇠와 "권한 없음", "문제 n" 표시는 없다. 두 단추는 같고 이름은 전체·없음이면 "리소스 종류"/"namespace", 하나면 그 이름, 여럿이면 "{이름} 외 {n}". 아무것도 고르지 않음은 거르지 않음.
- D-USR-2026-11-17-9: 리소스에서 종류를 둘 이상 고르면 Kind 열이 있는 한 목록(문제 먼저)이고 막대 이름은 고른 종류들이다.
- D-USR-2026-11-17-10: 홈 지표 줄의 줄마다 "클러스터 전체" 칸은 지운다(1060px 아래에서 임계값 칸을 밀어냈다). 줄은 받아들인 모양(값 | {기간} 최고 | 임계값)으로 돌리고, 범위가 있을 때 지표 묶음 위에 한 번 "클러스터 전체 값, 범위와 상관없음"(D-USR-2026-11-17-5의 칸 대체).
- 출처: 2026-11-17 사용자 승인(범위 검색 상자 v3 견본)

### D-USR-2026-11-17-11~15 AI 공급자: 구독 CLI 실행, Ollama 삭제

2026-11-17 사용자 결정. 실행은 [H-009 AI 공급자](tasks.md#H-009-ai-cli).

- D-USR-2026-11-17-11: Ollama를 앱에서 지운다(공급자 행, ai-local 방법, ai.cjs의 Ollama 읽기, ai-run 분기, 연결 확인, 설정·첫 실행의 "내 컴퓨터" 묶음, 문구 키, brand-ollama 그림, 시험, 스펙 언급). 컴퓨터에 설치된 것은 지우지 않는다.
- D-USR-2026-11-17-12: 연결한 구독 CLI(Claude, ChatGPT·Codex, Gemini)가 실제로 대화한다. CLI를 비대화로 한 번 띄우고(stream-json·--json), Wake 도구만 이 실행 전용 MCP 설정으로 건넨다(CLI 자체 도구 끔, 빈 임시 작업 폴더, 세션 기록 안 남김, 사용자·프로젝트 설정·메모리 파일 안 읽음). 도구 호출은 API 키 길과 같은 도구 층·승인·감사를 지나고 마스킹은 보내기 전에 한다.
- D-USR-2026-11-17-13: 모델 목록은 CLI가 알려 주면 그것(codex debug models), 아니면 CLI의 모델 별칭(Claude haiku·sonnet·opus, Gemini flash-lite·flash·pro). 실패는 원인대로(설치 안 됨, 로그인 필요, 사용 한도, 시간 초과, 취소, 알 수 없음 + CLI 원문) 보이고, 멈춤은 CLI 프로세스를 끝낸다.
- D-USR-2026-11-17-14: 단계는 읽는 것과 대상을 사람 말로(도구마다 ko·en 문구), 진행 중·끝남·실패와 걸린 시간을 한 줄로 보이고, 모델이 쓰는 글은 일하는 동안 흘려 보인다. 답은 질문의 언어로, 도구 이름·출처 id·내부 상태 단어 없이.
- D-USR-2026-11-17-15: 실제 시험은 사용자 구독으로 한다(가장 싼 모델, 질문 6개 이하).
- 출처: 2026-11-17 사용자 지시(구독 CLI 실행, Ollama 삭제, 실제 앱 검수 지적)

### D-USR-2026-11-18-1~7 출시 직전 화면 다듬기

2026-11-18 사용자 결정. 실행은 [출시 직전 화면 다듬기](tasks.md#release-polish). 새 요소는 견본(sim)에 먼저 만들고 앱에 옮긴 뒤 두 그림으로 승인을 받는다.

- D-USR-2026-11-18-1(AI-2): 대화 답은 안전한 마크다운 일부를 그린다: 문단, 줄바꿈, 글머리·번호 목록, 굵게, 인라인 코드, 코드 블록, 표(기존 kit 표 모양). 그 밖은 글자로 이스케이프한다(HTML을 그대로 넣지 않음, 링크를 만들지 않고 http(s) 주소는 글로). 시스템 지시의 임시 "표·코드 없이" 문장은 지운다.
- D-USR-2026-11-18-2(A-11): Deployment·StatefulSet·DaemonSet·Node 상세에 Pod 상세와 같은 CPU·메모리 지표 줄(지금 | {기간} 최고 | requests | limits | limits 대비, Node는 limits 자리에 allocatable)과 기간 고르기를 둔다. Node는 Pod 수도(allocatable 대비). Node 목록의 "사용" 열을 채운다.
- D-USR-2026-11-18-3(A-12): Node 상세 머리는 이름 옆에 Ready와 스케줄 가능 여부(cordon)를 RULE-TONE대로 한 번 보인다(정상이 아닌 말은 글로).
- D-USR-2026-11-18-4(A-18): PVC 상세는 kubelet 볼륨 통계(Prometheus kubelet_volume_stats_*)로 사용량(사용·용량·%)을 보이고, 읽지 못하면 원인과 함께 뺀다.
- D-USR-2026-11-18-5(B-01, 추천안): 비용·에이전트는 클러스터 도구 목록에 들어간다: 클러스터 홈 출처 칩 줄, 사이드바 클러스터 메뉴, ⌘K 팔레트 검색. 구역 탭은 그대로다.
- D-USR-2026-11-18-6(B-18): "복사됨" 토스트는 머리 글자를 가리지 않는다. 다른 토스트와 같은 자리를 쓰고, 그 자리가 머리를 가리면 아래로 옮긴다(전후 그림으로 승인).
- D-USR-2026-11-18-7: 사용자에게 보이는 모든 말은 완성된 상용 제품의 말이다(자리 표시 같은 글, 개발 용어 없음, ko·en 일치). 라이선스(상용)는 다른 작업 몫이다.
- 출처: 2026-11-18 사용자 결정(출시 검수 남은 승인 항목)

### D-USR-2026-11-18-20~23 첫 실행 단순화와 시작 화면 삭제

2026-11-18 사용자 결정. 실행은 [첫 실행 단순화와 시작 화면 삭제](tasks.md#first-run-simplify). 다른 작업의 같은 날 번호와 겹치지 않게 20부터 쓴다.

- D-USR-2026-11-18-20: 첫 실행은 세 단계다. ① 클러스터 연결(시작 화면 없이 kubeconfig context를 찾아 하나씩 확인하고 진행·실패 원인을 보임, 하나도 없으면 그 자리에서 kubeconfig 붙여넣기 · 서버+토큰 · 클라우드 명령으로 연결) ② AI 연결(구독 CLI · API 키, "AI 없이 계속" 유지) ③ 기본 설정(한 화면에서 AI 권한 기본값 읽기만 · 언어 · 테마를 바로 바꿈, 예전 권한 단계와 준비 완료 단계를 합침). "시작"은 연결된 클러스터 홈으로 바로 간다.
- D-USR-2026-11-18-21: 시작(welcome) 단계(빈 오른쪽 칸, "context 1", 시작하기)와 따로 있던 권한·준비 완료 단계를 지운다. 중단한 첫 실행은 저장된 예전 단계 값을 새 단계로 옮겨 이어 하고(welcome → 클러스터 연결, permission·done → 기본 설정), 점 세 개와 뒤로·다음은 그대로다.
- D-USR-2026-11-18-22: 새 탭 시작 화면(검색·묻기와 대화·인시던트 카드)을 지운다. 새 탭과 앱 시작은 마지막으로 본 클러스터의 홈을 열고, 연결된 클러스터가 없으면 설정 › 클러스터(연결)를 연다. 시작 화면만 쓰던 코드·문구·시험·스펙도 같은 변경에서 지운다.
- D-USR-2026-11-18-23: 설정 "시작할 때"는 "지난 탭 다시 열기 / 클러스터 홈" 둘이다. 예전에 저장한 "새 탭" 값은 클러스터 홈으로 읽고 그렇게 보인다.
- 출처: 2026-11-18 사용자 결정

### D-USR-2026-11-18-30~32 앱 ID·패키지·라이선스

2026-11-18 사용자 승인. 실행은 [패키징 실행과 에이전트 이미지](tasks.md#package-run). 다른 작업의 같은 날 번호와 겹치지 않게 30부터 쓴다.

- D-USR-2026-11-18-30: 앱 ID(macOS 번들 ID)는 `io.github.woonyong-choi.wake`, 제품 이름은 "Wake"다. 정의는 `apps/wake/desktop.config.cjs` bundleId 한 곳이다. 앱 ID는 첫 출시 전에는 바꿀 수 있다. 출시 뒤에 바꾸면 macOS가 다른 앱으로 보므로 키체인 항목과 사용자 설정을 옮겨야 한다.
- D-USR-2026-11-18-31: 패키징 도구 electron-builder 26.0.12를 `kit/package.json` devDependencies에 정확한 버전으로 설치하고, 서명 자격이 없는 이 컴퓨터에서는 서명하지 않은 검수용 패키지(`--unsigned`)를 만들어 확인한다. 고객용 패키지는 `--release`(Developer ID 서명·공증)로만 만든다.
- D-USR-2026-11-18-32: LICENSE는 한국어·영어 상용 EULA 초안으로 완성하되 "법률 검토 전 초안 — 판매 전 변호사 검토 필요" 표시를 유지한다. 라이선스 제공자는 `apps/wake/package.json` author(choi woo-nyong), 준거법은 [대한민국 법](확인 필요)이다. 에이전트 이미지는 로컬에서 빌드·확인하고, 공개(push)와 digest 기록은 사용자가 write:packages 권한을 준 뒤에 한다.
- 출처: 2026-11-18 사용자 승인(패키징 도구 설치, 앱 ID 결정, 패키지 빌드, 라이선스 초안 완성, 에이전트 이미지 빌드)
- D-USR-2026-11-18-33: LICENSE 검토는 작업자가 하고(사용자 지시), 검토 반영본으로 "초안" 표시와 [확인 필요]를 뺀다. 남는 빈칸은 판매 전에 채울 사업자 정보(상호·사업자등록번호·통신판매업 신고번호·연락처) 하나다. 기본 조건: 사용권 하나는 지정 사용자 1명·기기 3대, 30일 품질 보증(고치거나 환불), 구매 7일 안 이유 없는 전액 환불, 책임 한도 직전 12개월 사용료(고의·중과실·생명·신체 제외), 대한민국 법, 소비자는 민사소송법상 관할·사업자는 서울중앙지방법원. DMG는 열기 전에 이 계약을 보이고 동의를 받는다. Apple 서명·공증은 뒤로 미룬다(D-USR-2026-11-18-31의 `--release`는 그때 한다).
- D-USR-2026-11-18-34: 에이전트 이미지의 실행 단은 scratch 위에 node 실행 파일과 그 라이브러리(musl, libstdc++, libgcc)만 둔다. 셸·패키지 관리자와 GPL-2.0 전용 구성 요소(busybox, apk-tools)를 싣지 않고, 남은 구성 요소의 라이선스 원문과 GCC 런타임 소스 제공 안내는 이미지의 /licenses에 둔다.
- 출처: 2026-11-18 소유자 결정(법률 검토 초안은 작업 안에서 작성, 애플 개발자 서명은 뒤로 미룸)
- D-USR-2026-11-19-1: Wake는 판매하지 않고 오픈소스로 공개한다. 라이선스는 Apache-2.0이며 D-USR-2026-11-18-32·33의 상용 EULA와 DMG 동의 화면을 대신한다. 루트에 Apache-2.0 공식 원문 `LICENSE`와 `NOTICE`(저작권자 choi woo-nyong, 제3자 고지 위치)를 두고, `apps/wake/package.json` license는 `Apache-2.0`, 패키지 점검(`kit/desktop/release.cjs` packageProblems)은 package.json license가 LICENSE 원문의 SPDX와 같은지와 Apache-2.0일 때 NOTICE가 있는지를 본다. 에이전트 이미지는 /licenses에 같은 LICENSE와 NOTICE를 싣고 OCI 라벨 licenses=Apache-2.0, source=공개 저장소 주소(`https://github.com/woonyong-choi/wake`)를 단다. 현재 공개 이미지는 `0.1.1`, digest `sha256:2878f430d5049a0a9b29c7aafb7ec542b334f94862ac52c9a32658a86c2ebe2c`다(이전 0.1.0의 5c55e310…와 0cf810c8…는 대체됨). 앱에는 가입·계정·사용권 확인이 없다(만들지 않는다).
- 출처: 2026-11-19 소유자 결정(판매하지 않고 공개, 라이선스 Apache-2.0)

## 기본값 채택

### D-USR-2026-11-16-7 나머지 추천안

영역별 열린 질문 862개(12개 영역)의 추천안을 모두 채택 완료로 처리한다. 1~6과 겹치는 부분은 확정 결정을 적용하고, 나머지 추천안은 (기본값 채택, 번복 가능)으로 목표에 반영한다. 측정 후 방식을 선택하라는 추천은 그 비교·측정 절차를 채택한 것이며 측정 결과를 만들지 않는다.

채택한 목표의 정본은 해당 영역 규칙이며, 규칙에 `OPEN-…`·`P-B-…` 같은 질문 ID나 "(기본값 채택, 번복 가능)" 표시로 남는다. 기본값을 바꾸면 이 결정과 해당 규칙을 함께 갱신한다.

## 영역 간 추천 통일 목록

아래는 결정 간 충돌을 해소한 연결 색인이다. 입력·실패 판정과 현재 코드·고정 장치는 연결된 규칙이 소유한다.

| 질문·관련 규칙 | 적용 기준 | 선택 이유·범위 |
|---|---|---|
| P-B-003, B-016, CMP-TABLE-01, SCR-TABLE-CELLS | → [RULE-SORT](rules.md#RULE-SORT). | D-USR-2026-11-16-1이 D00454 대체 |
| P-B-004, CMP-K-*, FLOW-LIST-001/004, F-BE-TABLE-RESOURCE/GITOPS, SRE-T-SCOPE | → [RULE-SORT](rules.md#RULE-SORT). | 재시작 수·복제본 차이·개별 상태명·최근 실행 시각을 기본 동점 키에서 제거 |
| FLOW-LIST-002, F-BE-TABLE-EVENT/ALERT/AUDIT, CMP-T-EVENTS-VIEW/ALERTS/AILOG, SRE-T-ALERT/AUDIT | → [RULE-SORT](rules.md#RULE-SORT). | 알림 상태 우선·동시각 Warning 우선·감사 오름차순을 확정 결정으로 대체 |
| OPEN-PF-003, CMP-INC-03, SRE-Q-12 | → [RULE-RECOVERY](rules.md#RULE-RECOVERY). | 성공 시간 합산·누락만큼 20분까지 연장·전체 10분 기한을 복구 목표에서 제거. CON-014는 승인 경합 규칙이며 복구 규칙이 아님 |
| OPEN-CON-006, OPEN-PF-005, PERF-008, F-BE-014 | → [RULE-RETENTION](rules.md#RULE-RETENTION). | source-checks 7일 추천은 기본 90일로 통일. 활성 사건·참조 보호와 대화 사용자 설정은 유지 |
| P-B-001, PERF-001/003/004 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). | 첫 그림·데이터 완료·내부 100ms 처리 예산의 구분 |
| P-B-002, B-015, PERF-017 | → [RULE-FOLD](rules.md#RULE-FOLD). | 두 조건을 함께 만족해야 하며 이후에는 머리 상태만 갱신. 사람의 펼침 상태 우선 |
| C-010, C-010, PERF-010 | D-USR-2026-11-16-6: Electron 2자리·heavy 1개·독립 검증 1개. 동시 구현 2명만 D-USR-2026-11-16-7 기본값 | 화면 원천의 구현 3명 추천을 소유 경계가 명확한 C-010의 2명으로 통일 |
| CMP-TABLE-05, F-BE-TABLE | → [RULE-SORT](rules.md#RULE-SORT). | locale 숫자 인지 비교를 제거해 화면·서비스의 순서를 일치시킴. 숫자·시각 열은 원시 수치·epoch 사용 |
| CON-011, FLOW-INC-005, SRE-Q-08 | → [RULE-RECOVERY](rules.md#RULE-RECOVERY). | 모든 재발을 새 ID로 만드는 추천과 통일. 옛 신호 재수신은 재발 아님 |
| CMP-T-CLUSTER-SEARCH, F-BE-TABLE-SEARCH, FLOW-LIST-005, SCR-SEARCH-TABLE | → [RULE-SORT](rules.md#RULE-SORT). | 검색 결과는 관련성이 우선이며 상태 우선의 적용 범위를 같은 일치 등급으로 제한 |
| CMP-T-INCIDENT-PARTS, F-BE-TABLE-INCIDENT, FLOW-LIST-003, SCR-INCIDENTS-TABLE | → [RULE-SORT](rules.md#RULE-SORT). | 현재 대응 목록은 이력 표와 구분. 완료 기록만 보는 표는 최신순 |
| CMP-T-COSTS, F-BE-TABLE-COST, FLOW-LIST-006, SCR-COSTS-TABLE | → [RULE-SORT](rules.md#RULE-SORT). | 집계 대상 이름·namespace/workload/UID와 불변 allocation ID의 동점 차이를 통일 |
| Event 목록과 Reason 집계, 보고서 | 개별 이력은 D-USR-2026-11-16-2 최신순. → [RULE-SORT](rules.md#RULE-SORT). | 집계·서술 순서와 개별 이력 표의 기본 정렬을 구분 |
| FLOW-INV-003, PERF-029, SRE-Q-18, 로그 화면·부품 | 기간 프리셋·초기값은 [RULE-RANGE](rules.md#RULE-RANGE). 로그 최초 100줄, 1회 최대 24시간, 더 긴 선택 구간은 창 분할 (기본값 채택, 번복 가능) | D00826의 공통 통일과 time-range.js의 DEFAULT_PRESETS를 적용하며 20줄 렌더 페이지·100줄 요청·1,000줄/2MiB 보관 한도는 서로 다른 단위 |
| FLOW-INV-007, SCR-EVENTS-V03, 상세 이벤트 | 전체 이벤트 목록 기본 50행, 상세 공통 페이저 20행 (기본값 채택, 번복 가능) | 현재 전체 목록의 30행을 목표로 승격하지 않고 전체 목록·상세의 범위를 구분 |
| J-003, Q-006/009, PERF-011, CMP-TABLE-08 | 다크·라이트의 1280·1440·1680 전체 창과 원천의 1024/760 상세·240높이 등 추가 경계 합집합 (기본값 채택, 번복 가능) | 한 영역의 폭으로 다른 영역의 경계 검사를 지우지 않음. 기본 높이는 900 |
| CON-016, OPEN-PF-011 | incident ID·상태 전이 ID·repeat 회차·채널로 영속 중복 방지 (기본값 채택, 번복 가능) | 재발 전송을 새 전이로 보존하며 재시작 중복·재활성 시 과거 일괄 전송 금지 |
| FLOW-AI-003, D00748 | → [RULE-AI](rules.md#RULE-AI) | wake-ui-decisions의 2026-11-12 확정 기록과 10차 지시로 문체 미결 서술 대체 |
| SCR-COST-AGGREGATE, SRE-Q-20, D00108 | → [RULE-RANGE](rules.md#RULE-RANGE) | D00826이 D00108의 비용 전용 목록을 대체. 비용만의 후속 예외 결정은 확인되지 않음. 초기값은 유지 |
| B-002, 심각도 역할 | → [RULE-TONE](rules.md#RULE-TONE) | 옛 화면 규칙이 4절의 심각도 색보다 최신 |
| SCR-INCIDENT-TIME-COUNT, D00325, D00452 | → [RULE-TONE](rules.md#RULE-TONE), [RULE-TIME](rules.md#RULE-TIME) | 옛 화면 규칙의 최신 반복 분류 표시가 과거 배지·곱셈형 금지를 대체. 한 줄 배치·시각·횟수 위치는 유지 |
| CMP-K-NODES-C004/C005 | → [CMP-VALUE-01](components/resource-values.md#CMP-VALUE-01) | D00450·D00451은 종류별 실제 자료와 단위 의미 구분을 요구. Node를 m·Mi로 바꾸라는 결정은 확인되지 않음. metrics.cjs:72–73,98–99·kinds.js:238·resource-list.js:106의 백분율 계약과 일치시키고 Pod 변환 복사를 제거 |
| SCR-COSTS-V04, D00110 | → [RULE-STATE](rules.md#RULE-STATE) | D00110은 연결 신원·이름 집계의 한계이며 같은 대상의 후속 권한 오류에서 성공값을 폐기하라는 결정이 아님 |
| CMP-CHIP-LOGOS, D00776, D00780 | → [RULE-CHIPS](rules.md#RULE-CHIPS) | D00809가 요약 로고의 겹침 제안을 대체. 장식·배치 조건을 정본으로 이동 |
| SRE-T-SCOPE 변경 시각 | → [SRE-T-SCOPE](sre.md#sre-t-scope-영향-대상-표) | 별도 열과 숨김 순서는 10차 문서 정리의 기본값(번복 가능). 셀 의미 분리 규칙만으로 개별 화면 승인을 추정하지 않음 |
