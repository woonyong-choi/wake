/* Wake 데스크톱 창 정의(순수 데이터) */
module.exports = {
  appId: 'wake',
  /* 패키지의 앱 ID(macOS 번들 ID, 역DNS, 결정 D-USR-2026-11-18-30: 첫 출시 전에는 바꿀 수 있음). 비우면 패키징 점검(node kit/tools/package.mjs)이 실패한다.
     appId(위)는 세션 파티션·캐시 폴더 이름이라 이 값과 따로다 */
  bundleId: 'io.github.woonyong-choi.wake',
  /* 패키지에서 압축 파일(app.asar) 밖에 두는 파일: 다른 프로그램이 경로로 읽는 것(Helm이 읽는 에이전트 차트, 외부 MCP 클라이언트가 node로 실행하는 stdio 다리) */
  packageUnpack: ['desktop/agent-install-charts/**', 'desktop/mcp-stdio.cjs', 'desktop/hub-server.cjs'],
  name: 'Wake',
  scheme: 'wake',
  /* 앱 아이콘: Apple 앱 아이콘 템플릿(1024 캔버스, 824 둥근 사각형, 그림자) 위 흰 바탕 파란 로고. 개발 실행의 Dock·창 아이콘은 icon,
     패키징(electron-builder mac.icon / packager icon)은 packageIcon. 원본은 assets/icon/wake-logo-light.svg·png */
  icon: 'assets/icon/icon.png',
  packageIcon: 'assets/icon/icon.icns',
  /* 창 스타일(설정 kit.windowStyle): 테마마다 유리 배경 위 색 층, 또는 불투명 창 색. 흰색·검정·빨강 배경과 바탕 화면 위 같은 위치에서 기준 앱을 측정해 맞춘 값
     (투명: 시스템 유리 + 회색 층, 유리가 없는 시스템은 창 재질로 대신함 / 색조: 배경과 관계없는 불투명 색) */
  window: { width: 1440, height: 900, translucent: true, styles: {
    tinted: { background: { dark: 'rgb(46 46 56)', light: 'rgb(242 242 242)' } },
    transparent: { glass: { dark: { style: 0 }, light: { style: 0 } }, material: { dark: 'menu', light: 'popover' }, tint: { dark: 'rgb(98 98 98 / .18)', light: 'rgb(224 224 224 / .4)' } },
  } },
  /* 메인 프로세스 서비스: kubeconfig 읽기, 연결 확인, 키체인, AI 연결 확인(desktop/services.cjs) */
  services: 'desktop/services.cjs',
  /* 터미널이 사람을 위해 실행하는 명령: id · 템플릿 · 인자 모양 · 넘기는 환경 이름(kit/desktop/main.cjs buildCommand). 화면은 data/commands.js로 같은 표를 읽는다 */
  commands: require('./commands.json'),
  /* 인자만으로 답하는 읽기: 같은 인자로 이미 도는 호출이 있으면 그 결과를 나눠 받는다(셸과 페이지가 같은 목록을 동시에 읽음) */
  coalesce: ['kube.list', 'incident.list', 'ai.conversations', 'observability.catalog', 'aiserver.state', 'audit.query'],
};
