# 기여 안내

버그 신고와 기능 제안은 GitHub 이슈로, 코드와 문서 변경은 PR로 받는다.

## 시작 전에

- 코드를 바꾸는 일(기능, 수정, 리팩터링, 화면 개선)은 PR 전에 이슈를 먼저 열고 완료 조건을 적는다. 오타 같은 작은 문서 수정은 이슈 없이 PR만 열어도 된다.
- 버그 이슈에는 재현 절차, 기대한 동작, 실제 동작, Wake 커밋과 운영체제를 적는다. kubeconfig, 토큰, Secret 값, 실제 클러스터 주소는 붙이지 않는다.
- 새 화면 요소(구성 요소, 변형, 배치, 움직임, 문구 묶음)를 더하는 변경은 이슈에서 그 요소의 전후 그림과 영향받는 화면 그림으로 먼저 합의한다. 버그 수정, git 이력에 있던 모습의 복원, 기존 kit 구성 요소 재사용, 쓰지 않는 코드 삭제는 합의 없이 PR로 보내도 된다.
- 변경은 [스펙](../spec/README.md)의 항목 하나 단위로 하고, 같은 PR에서 그 항목의 상태와 고정 시험을 함께 갱신한다.

## 개발 환경

Git, Node.js(`npx` 포함), 시험용 kubeconfig가 필요하다. 스펙 검사에는 Python 3와 `uv`, 화면 검사에는 `playwright-core`와 Chromium, macOS 창 도우미 빌드에는 Xcode Command Line Tools가 필요하다.

```sh
git clone https://github.com/woonyong-choi/wake.git
cd wake
npm --prefix kit ci
node kit/tools/build-native.mjs
cd apps/wake
KUBECONFIG=/path/to/test-kubeconfig npx -y electron@44.7.2 .
```

- 개발 실행에는 일상 업무용 kubeconfig 대신 시험 클러스터 전용 kubeconfig를 쓴다.
- 서명 없는 macOS 패키지는 저장소 루트에서 `node kit/tools/package.mjs --app wake --unsigned`로 만든다. 이 패키지는 만든 컴퓨터에서 시험하는 용도다.

## 검사

PR을 열기 전에 저장소 루트에서 아래 검사가 모두 통과해야 한다.

```sh
node kit/tools/check-deps.mjs
node kit/tools/unused-check.mjs
node kit/tools/check-reuse.mjs
node kit/tools/check-locale.mjs
node kit/tools/check-tests.mjs
python3 spec/check-canonical.py
uvx pytest -q spec/test_check_canonical.py
node kit/tools/check-release.mjs
node kit/tools/check-ipc.mjs
```

화면 검사는 `NODE_PATH`를 `playwright-core`가 설치된 `node_modules`로 잡은 뒤 실행한다. 예를 들어 `npm i -g playwright-core` 뒤 `npm root -g`가 출력한 경로를 쓴다. 브라우저는 `CHROMIUM_PATH` 또는 playwright 기본 위치에서 찾는다.

```sh
node kit/tools/check-states.mjs --app wake
node kit/tools/check-glass.mjs --app wake
node kit/tools/check-brand.mjs --app wake
node kit/tools/check.mjs --app wake
node kit/tools/check-layout.mjs --app wake
node kit/tools/check-visual.mjs
```

- `pytest`가 이미 설치돼 있으면 `uvx pytest` 대신 `python3 -m pytest`를 쓴다.
- `check-visual.mjs`의 기준 그림(`kit/tools/visual-baseline/`)은 Linux Chromium에서 만든다. 모양을 바꾸려는 변경만 기준 그림을 갱신하고, 바뀐 그림과 이유를 커밋 본문에 적는다. 구조 정리에서는 그림이 하나도 바뀌지 않아야 한다.
- 검사 통과와 별개로, 바꾼 화면은 실제 앱을 띄워 다크와 라이트 모두에서 확인한다.

## 커밋과 PR

브랜치 이름은 `type/이슈번호-scope-설명`이다. 설명은 영어 소문자 kebab-case 2~5단어로 쓴다(`fix/{번호}-wake-kubeconfig-error-masking`).

커밋 메시지 첫 줄은 `type(scope): 한글 설명`이다.

- type은 `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert` 중 하나다.
- scope는 모듈 이름 `kit`, `wake`, `sample`이나, 모듈 밖 변경의 `repo`, `deps`, `readme`, `docs`, `release` 중 하나다.
- 설명은 72자 이내로 쓰고 마침표를 붙이지 않는다. 끝말은 `추가`, `제거`, `수정`, `변경`, `개선`, `분리`, `통합`, `이동`, `정리`, `갱신`, `적용`, `도입`, `되돌림` 중 하나다.
- 본문은 빈 줄 다음에 바꾼 이유, 고르지 않은 방법, 실행한 확인과 결과를 명사로 끝나는 항목으로 적는다.
- 쓰지 않게 된 코드, CSS, 토큰, 문구 키, 아이콘, 문서는 그것을 쓰지 않게 만든 같은 커밋에서 지운다.
- 작성자는 본인의 git 설정을 그대로 쓰고 `--no-verify`로 훅을 건너뛰지 않는다.

```text
fix(wake): kubeconfig 오류 메시지의 토큰 원문 노출 수정

- API 오류 본문의 토큰 원문 화면 노출
- 화면만 가리는 방법은 감사 기록에 원문이 남아 제외
- node kit/tools/check-tests.mjs 통과

Closes #{번호}
```

- PR 제목은 커밋 첫 줄과 같은 형식으로 쓰고 번호를 넣지 않는다.
- PR이 이슈의 완료 조건을 모두 채우면 PR 본문과 커밋에 `Closes #번호`를, 일부만 채우거나 관련 작업이면 `Refs #번호`를 쓴다.
- PR은 squash 머지만 한다.
