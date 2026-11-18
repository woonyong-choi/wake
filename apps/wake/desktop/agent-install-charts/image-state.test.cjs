/* K-15: a chart that names no published image (empty repository or digest, or a tag) is refused before Helm with that reason instead of
   running Helm into a schema error; the bundled chart names the published image by digest. node --test apps/wake/desktop/agent-install-charts/image-state.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { agentImageState } = require('./image-state.cjs');

/* D-USR-2026-11-18-32·34: the bundled chart names the pushed, public multi-arch image (amd64, arm64) by its index digest, so it is installable */
const PUBLISHED = 'ghcr.io/woonyong-choi/wake-agent@sha256:5c55e3101bff9502bd801b2d64fa5c4de4221dd6bf0ab71bc08fa5575aa7562b';
test('bundled_agent_chart_names_the_published_image_by_digest_and_is_installable', () => {
  assert.deepEqual(agentImageState(path.join(__dirname, 'wake-agent-only')), { published: true, image: PUBLISHED });
});

test('a_chart_with_a_repository_and_sha256_digest_is_installable_and_a_tag_is_not', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-chart-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = image => fs.writeFileSync(path.join(dir, 'values.yaml'), JSON.stringify({ image }));
  write({ repository: 'ghcr.io/example/wake-agent', digest: 'sha256:' + 'a'.repeat(64) });
  assert.deepEqual(agentImageState(dir), { published: true, image: `ghcr.io/example/wake-agent@sha256:${'a'.repeat(64)}` });
  write({ repository: 'ghcr.io/example/wake-agent', digest: 'latest' });
  assert.deepEqual(agentImageState(dir), { published: false, reason: 'agent_image_unpublished' });
  fs.writeFileSync(path.join(dir, 'values.yaml'), 'image: [');
  assert.deepEqual(agentImageState(dir), { published: false, reason: 'agent_values_unreadable' });
});

/* B2-01: the screen was the only thing standing between an unpublished chart and Helm. The main process refuses the declared install command
   itself (services sets it as the terminal's commandGuard) for a chart whose image is not published; other commands pass */
test('the_main_process_refuses_the_agent_install_command_for_a_chart_without_a_published_image', t => {
  const { agentInstallGuard } = require('./image-state.cjs');
  assert.equal(agentInstallGuard('agent.install', { chart: '/nonexistent/chart', cluster: 'fixture' }), 'AGENT_IMAGE_UNPUBLISHED');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-chart-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'values.yaml'), JSON.stringify({ image: { repository: 'ghcr.io/example/wake-agent', digest: '' } }));
  assert.equal(agentInstallGuard('agent.install', { chart: dir, cluster: 'fixture' }), 'AGENT_IMAGE_UNPUBLISHED');
  fs.writeFileSync(path.join(dir, 'values.yaml'), JSON.stringify({ image: { repository: 'ghcr.io/example/wake-agent', digest: 'sha256:' + 'a'.repeat(64) } }));
  assert.equal(agentInstallGuard('agent.install', { chart: dir, cluster: 'fixture' }), null);
  assert.equal(agentInstallGuard('install.helm', {}), null);
  const services = fs.readFileSync(path.join(__dirname, '..', 'services.cjs'), 'utf8');
  assert.match(services, /hooks\.commandGuard = require\('\.\/agent-install-charts\/image-state\.cjs'\)\.agentInstallGuard/, 'the desktop services set it as the terminal guard');
});
