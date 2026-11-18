/*
 * 에이전트 차트의 이미지 상태(K-15): values.yaml의 image.repository와 image.digest(sha256)가 둘 다 있어야 설치할 수 있다.
 * 앱에 든 차트(wake-agent-only)는 저장소(ghcr.io/woonyong-choi/wake-agent)만 있고 digest는 이미지를 공개(push)한 뒤에 채운다.
 * 설치 흐름은 Helm을 부르기 전에 이것을 물어 'agent_image_unpublished'면 그 이유로 멈춘다(차트 스키마도 빈 digest를 거절한다).
 *   agentImageState(chartDir) -> { published: true, image } | { published: false, reason: 'agent_image_unpublished' | 'agent_values_unreadable' }
 */
const fs = require('node:fs');
const path = require('node:path');
const { yaml } = require('../kubeconfig.cjs');

const REPOSITORY = /^[a-z0-9.-]+(?::[0-9]+)?\/[A-Za-z0-9._/-]+$/, DIGEST = /^sha256:[0-9a-f]{64}$/; /* values.schema.json과 같은 규칙 */

function agentImageState(chartDir) {
  let values;
  try { values = yaml.load(fs.readFileSync(path.join(chartDir, 'values.yaml'), 'utf8')); } catch { return { published: false, reason: 'agent_values_unreadable' }; }
  const { repository, digest } = values?.image || {};
  if (!REPOSITORY.test(repository || '') || !DIGEST.test(digest || '')) return { published: false, reason: 'agent_image_unpublished' };
  return { published: true, image: `${repository}@${digest}` };
}

/* 터미널 명령 문지기(kit main hooks.commandGuard): 선언 명령 agent.install은 그 차트의 이미지가 공개됐을 때만 실행한다. 화면의 판단과 무관하게 메인 프로세스가 거절 */
function agentInstallGuard(id, args) {
  if (id !== 'agent.install') return null;
  return typeof args?.chart === 'string' && agentImageState(args.chart).published === true ? null : 'AGENT_IMAGE_UNPUBLISHED';
}

module.exports = { agentImageState, agentInstallGuard };
