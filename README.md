<p align="center">
  <img src="apps/wake/assets/icon/icon.png" alt="Wake 로고" height="80">
</p>

<h1 align="center">Wake</h1>

<p align="center">
  Kubernetes incident workbench for on-call SREs (Electron desktop app)<br>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a><br>
  한국어 | <a href="README.en.md">English</a>
</p>

> [!NOTE]
> 개발 중입니다. 배포판은 없고 소스를 직접 실행합니다.

## 빠른 시작

Git, Node.js(`npx` 포함), 클러스터를 읽을 수 있는 kubeconfig가 필요합니다. 아래 명령은 macOS와 Node.js 26에서 확인했습니다.

```sh
git clone https://github.com/woonyong-choi/wake.git
cd wake/apps/wake
KUBECONFIG=/path/to/kubeconfig npx -y electron@44.7.2 .
```

첫 실행 화면은 세 단계입니다.

1. 클러스터 연결 단계에서 kubeconfig의 context를 읽고 연결을 확인합니다. 시험 클러스터 `wake-lab`에서는 `wake-lab 연결됨`과 `v1.36 · Node 3`이 표시됐습니다.
2. AI 연결 단계에서 구독 CLI나 API 키를 연결합니다. AI 없이 쓰려면 `AI 없이 계속`을 누르세요.
3. 기본 설정 단계에서 AI 권한 기본값(`읽기만`), 언어, 테마를 고르고 `시작`을 누르세요.

시작하면 클러스터 홈이 열립니다. 홈은 Node 수, 문제 Pod, 최근 1시간 경고 이벤트, 열린 인시던트, CPU·메모리 사용률, Pod 상태 흐름을 보여 주고 리소스, 네트워크, GitOps, 이벤트, 로그, 알림, 인시던트 화면으로 이어집니다. 지표, 로그, 알림은 클러스터에 Prometheus, Loki, Alertmanager 같은 도구가 있을 때만 채워지고, 닿지 않는 출처는 `연결 안 됨`으로 표시합니다.

앱을 닫고 같은 명령으로 다시 열면 첫 실행 화면 없이 저장한 클러스터의 홈이 바로 열립니다.

## 해결하는 문제

당번 SRE는 알림을 받으면 kubectl, Prometheus, Loki, Alertmanager, Argo CD 화면을 오가며 같은 대상과 시각을 손으로 맞춰 원인을 찾습니다. Wake는 이 도구들의 API를 읽어 한 데스크톱 앱 안에서 같은 리소스와 시간 범위로 화면을 이어 주고, 이상 발견부터 조사, 조치 제안, 사람의 승인 결정까지를 인시던트 하나에 기록합니다.

같은 자료는 kubectl과 각 도구의 웹 화면에서도 볼 수 있습니다. Wake는 별도 수집 서버를 두지 않고 기존 도구의 API를 읽기만 하므로, 도구에 없는 자료를 새로 만들지 않습니다. Wake가 더하는 것은 화면 사이의 왕복, 인시던트와 근거 기록, AI가 읽은 범위와 결과의 감사 기록입니다.

## 작동 방식

1. 사용자의 kubeconfig로 클러스터에 연결하고, 도달·인증·Pod 읽기 권한을 확인한 뒤 등록합니다. 토큰과 키 같은 자격 원문은 Electron safeStorage로 암호화해 두고 설정에는 참조만 남깁니다.
2. Kubernetes API와 연결한 관측 도구(Prometheus, Alertmanager, Loki, Argo CD, OpenCost)를 읽기 요청으로 조회합니다. Secret 값은 저장하지 않고 AI에도 넘기지 않습니다.
3. 원하면 앱 안에서 Helm으로 `wake-system` namespace에 wake-agent를 설치합니다. wake-agent는 Node와 Pod를 watch하고 Node마다 Lease로 heartbeat를 남기는 DaemonSet입니다. 이미지는 `ghcr.io/woonyong-choi/wake-agent:0.1.1`(amd64, arm64)이고 차트는 `apps/wake/desktop/agent-install-charts/wake-agent-only`에 들어 있습니다.
4. 앱 안의 허브가 인시던트, 근거 스냅샷, 감사, 승인 결정, AI 대화를 사용자 컴퓨터의 앱 데이터 폴더에 보관합니다. 기본 보관 기간은 인시던트(해결 뒤), 근거, 감사, 승인 결정이 90일, 대화가 365일, Event가 7일입니다.
5. AI를 연결하면 AI는 같은 도구 층을 거쳐 허용된 범위만 읽고 분석과 조치 제안만 합니다. 변경 제안은 사람이 승인 패널에서 허용하거나 거절하며, 허용은 앱 화면이 아니라 운영체제 확인 창에서 사람이 누를 때만 기록되며, AI나 외부 클라이언트가 승인을 대신하지 못합니다.

Wake에는 가입이나 Wake 계정이 없고, 사용 통계를 보내는 코드가 없으며, 자동 업데이트 확인도 꺼져 있습니다. AI 공급자를 연결하면 질문과 허용된 도구 결과를 가린 뒤 그 공급자에게 보냅니다. 외부 AI 클라이언트용 MCP·HTTP 서버는 기본으로 꺼져 있고, 켜면 `127.0.0.1`에서만 받습니다.

전체 설계는 [아키텍처](spec/architecture.md)에 있고, 저장 등급과 보관 정책은 [저장 정책](spec/data-policy.md), 권한 경계는 [보안과 권한](spec/security.md)에 있습니다.

## 상태

지금 쓸 수 있는 것은 클러스터 홈, 리소스, 네트워크, GitOps, 이벤트, 로그, 알림, 인시던트, 도구별 화면(Prometheus, Alertmanager, Argo CD, Loki), 에이전트, 비용, AI 칸, 터미널, 보고서입니다. AI 대화는 Claude API 키와 구독 CLI(`claude`, `codex`, `gemini`)로 실행합니다. OpenAI와 Gemini API 키는 키 확인만 하고 대화에는 쓰지 않습니다.

인시던트는 규칙으로 감지합니다. OOM 종료, 반복 재시작, 이미지 받기 실패, 설정 누락, probe 실패, 스케줄 실패, 볼륨 연결 실패, 축출·노드 압박, Node NotReady, Job 실패, 롤아웃 멈춤, 생성 거절(quota·admission), 준비된 endpoint 없는 Service 13종이며, 원인 등급과 확인 명령·조치 후보를 함께 보이고 실제 시각 5분 연속 정상일 때 복구로 닫습니다.

- 승인한 조치를 실제로 실행하거나 Draft PR을 만드는 기능은 없습니다. 지금은 승인 결정만 기록합니다.
- 서명·공증한 배포판이 없습니다. `node kit/tools/package.mjs --app wake --unsigned`로 서명 없는 DMG를 만들 수 있지만, 다른 Mac에서는 Gatekeeper가 실행을 막습니다.
- 소스 실행은 macOS에서만 확인했습니다. Windows와 Linux는 확인하지 않았습니다.
- 터미널은 `kit`의 선택 의존성 `node-pty`가 설치돼 있을 때만 열립니다.

남은 작업은 [작업 목록](spec/tasks.md)에 있습니다. 1.0 전에는 설정과 저장 형식이 예고 없이 바뀔 수 있습니다.

## 문서

- [스펙](spec/README.md)
  - [제품 흐름](spec/product.md)
  - [아키텍처](spec/architecture.md)
  - [보안과 권한](spec/security.md)
  - [저장 정책](spec/data-policy.md)
  - [작업 목록](spec/tasks.md)
- [kit](kit/README.md)

[전체 문서](spec/README.md#목차)

## 개발

```sh
npm --prefix kit ci
node kit/tools/build-native.mjs
node kit/tools/package.mjs --app wake --unsigned
node kit/tools/check-tests.mjs
node kit/tools/check-deps.mjs
node kit/tools/unused-check.mjs
```

나머지 검사와 커밋 형식은 [기여 안내](.github/CONTRIBUTING.md)에 있습니다.

## 라이선스

[Apache-2.0](LICENSE)
