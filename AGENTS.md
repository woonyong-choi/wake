# Wake 작업 규칙

Wake(Kubernetes 장애 작업대, Electron 데스크톱 앱)의 화면과 그 화면을 만드는 공통 틀(kit). 이 문서는 새로 참여하는 작업자(사람·에이전트)가 처음 읽는 곳이다.

## 구조

- `kit/`: 제품과 무관한 공통 틀(토큰, 구성 요소, 셸, 페이지 실행, 데스크톱 호스트, 점검 도구). Wake·Kubernetes 용어와 한국어 문구(kit/locale 밖)를 두지 않는다.
- `apps/wake/`: Wake 정의와 데이터만(app.config.js, settings-pages.js, data/, pages/, locale/, desktop/). 화면은 kit 구성 요소 호출과 정의 데이터로만 만든다.
- `apps/sample/`: kit 견본 앱(`kit/tools/create-app.mjs`의 원본).
- `design/`: 앱 밖의 디자인 기준·검수 화면(패키지에 들어가지 않음). `design/index.html`은 앱·구성 요소·배치 화면으로 가는 개발용 첫 화면이다.
  - `design/gallery/`: `components.html`, `layouts.html`: kit 구성 요소 모음과 배치 바꾸기(시각 기준·점검 도구가 이 화면을 찍음).
  - `design/sim/`: 디자인 기준 시뮬레이션(`sim.html`, `sim.js`, `sim-*.js`).
  - `design/sankey/`: 샌키 승인 비교 화면(`sankey-review.html`).

## 먼저 읽을 것(결정이 있는 곳)

- [spec/README.md](spec/README.md): 정본의 읽는 순서와 작업할 때 읽을 최소 파일.

변경은 스펙 항목 하나 단위로 하고 고정 장치와 스펙 상태를 함께 갱신한다. 자세한 절차는 [spec/loop.md](spec/loop.md#L-004)를 따른다.

## 승인 규칙

- 새 화면 요소(구성 요소, 변형, 배치, 움직임, 문구 묶음)는 관리자 승인 없이 만들지 않는다. 필요하면 그 요소만 전후 그림과 영향 받는 화면 그림으로 승인을 받는다.
- 승인 없이 할 수 있는 일: 버그 수정, 이전 모습 복원(git 이력에서), 기존 kit 구성 요소 재사용, 안 쓰는 것 삭제.
- 관리자가 받아들인 배치·동작은 다른 문제를 고치려고 옮기지 않는다.

## 실행

- 브라우저: 이 폴더를 HTTP로 열고(`npx -y http-server -p 8080 .` 등) `apps/wake/index.html`. 앱에는 견본 자료가 없다: 서비스 호스트가 없는 브라우저 실행은 클러스터가 없고 각 화면은 빠진 출처의 "연결 안 됨"을 보인다. 화면 검수는 데스크톱에서 실제 클러스터로 한다. 디자인 기준은 앱 밖의 시뮬레이션(`design/sim/sim.html`)이다.
- 데스크톱: `cd apps/wake && KUBECONFIG=<테스트 kubeconfig> npx -y electron@44.7.2 .`. `~/.kube/config`는 쓰지 않는다. 실제 비밀 값을 넣지 않는다.
- 검수 실행(사람이 보는 화면을 가리지 않게): `KIT_BACKGROUND=1`과 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding`을 함께 주면 창이 앞으로 오지 않고(포커스·Dock 없음) 투명·클릭 통과로 뜨며, 화면은 DevTools 프로토콜(`--remote-debugging-port`)로 읽고 찍는다(`kit/desktop/background-run.cjs`).
- 첫 실행 다시 보기: 데스크톱 개발 실행의 보기 메뉴, 브라우저에서는 설정 저장소(`wake:settings`)의 `kit.firstRun.done`을 지움.

## 점검(커밋 전 모두 통과)

```
node kit/tools/check-deps.mjs
node kit/tools/unused-check.mjs
node kit/tools/check-reuse.mjs
node kit/tools/check-locale.mjs
node kit/tools/check-tests.mjs
python3 spec/check-canonical.py
uvx pytest -q spec/test_check_canonical.py   # pytest가 설치돼 있으면 python3 -m pytest
node kit/tools/check-release.mjs
node kit/tools/check-ipc.mjs
export NODE_PATH=<playwright-core가 있는 node_modules>   # 예: npm i -g playwright-core 뒤 $(npm root -g); 브라우저는 CHROMIUM_PATH 또는 playwright 기본 위치
node kit/tools/check-states.mjs --app wake
node kit/tools/check-glass.mjs --app wake
node kit/tools/check-brand.mjs --app wake
node kit/tools/check.mjs --app wake
node kit/tools/check-layout.mjs --app wake
node kit/tools/check-visual.mjs
```

- 시각 기준 그림은 Linux Chromium에서 찍은 것이다. Mac에서는 `check-visual.mjs`를 건너뛰고, 머지 전에 Linux에서 비교한다. 임시 기준 그림은 커밋하지 않는다.
- 시각 기준(`kit/tools/visual-baseline/`): 모양을 바꾸려는 변경만 Linux Chromium에서 `check-visual.mjs --update`로 갱신해 같은 커밋에 넣고, 바뀐 그림과 이유를 커밋 본문에 적는다. 구조 정리는 그림이 하나도 바뀌지 않아야 한다(바뀌면 정리 실수).
- 점검 통과는 끝이 아니다. 바꾼 화면은 실제 앱을 띄워 직접 보고 판단한다(다크·라이트 모두).

## 커밋

- 메시지: `type(scope): 한글 설명`, 본문은 명사로 끝나는 항목(`- … 구현`, `- … 삭제`).
- 푸시 전 `node kit/tools/check-commits.mjs`(기본 범위 `@{upstream}..HEAD`). 금지 이름 목록이 필요하면 `.local/banned-names.txt`(저장소에 올리지 않음, 한 줄에 하나)에 둔다.
- 작성자·커미터는 기여자 본인의 git 계정. `--no-verify` 금지.
- 쓰지 않게 된 코드·CSS·토큰·문구 키·아이콘·문서는 그것을 쓰지 않게 만든 같은 커밋에서 지운다.
