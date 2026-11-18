const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const { create } = require('./services.cjs');
const { loadKubeconfig, yaml } = require('./kubeconfig.cjs');

const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from('fixture:' + value), decryptString: bytes => bytes.toString().slice(8) };
/* 임시 userData와 KUBECONFIG(파일 하나): 시험이 끝나면 지우고 되돌린다 */
function home(t, doc) {
  t.mock.method(fs, 'watch', () => ({ close() {} }));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-safety-'));
  const file = path.join(userData, 'fixture-config');
  if (doc) fs.writeFileSync(file, yaml.dump(doc));
  const previous = process.env.KUBECONFIG; process.env.KUBECONFIG = file;
  t.after(() => { if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous; fs.rmSync(userData, { recursive: true, force: true }); });
  return { userData, file };
}
const baseDoc = (user = {}) => ({ apiVersion: 'v1', kind: 'Config', 'current-context': 'lab',
  contexts: [{ name: 'lab', context: { cluster: 'lab', user: 'lab-user' } }], clusters: [{ name: 'lab', cluster: { server: 'https://lab.invalid' } }], users: [{ name: 'lab-user', user }] });

test('services_start_with_an_unreadable_connections_file_and_report_it_with_a_repair_code_instead_of_crashing', t => {
  const { userData } = home(t, baseDoc());
  fs.writeFileSync(path.join(userData, 'connections.json'), '{"files":[]}', { mode: 0o640 });
  fs.chmodSync(path.join(userData, 'connections.json'), 0o640);
  let services;
  assert.doesNotThrow(() => { services = create({ app: { isPackaged: true }, emit() {}, userData }); }, 'services creation survives a bad connections file');
  const read = services['kube.read']();
  assert.deepEqual(read.connections, { state: 'error', code: 'CONNECTIONS_FILE_INVALID', repair: 'CONNECTIONS_REPAIR_PERMISSIONS' });
  assert.deepEqual(read.contexts.map(c => c.id), ['lab'], 'the environment kubeconfig still reads');
  const saved = services['kube.addPaste']({ text: yaml.dump(baseDoc()) });
  assert.equal(saved.kind, 'connections');
  assert.equal(saved.code, 'CONNECTIONS_FILE_INVALID');
  assert.equal(saved.repair, 'CONNECTIONS_REPAIR_PERMISSIONS');
});

test('connections_file_repair_sets_0600_and_a_private_folder_only_on_an_explicit_shell_request_and_never_touches_content', t => {
  const { userData } = home(t, baseDoc());
  const file = path.join(userData, 'connections.json');
  fs.writeFileSync(file, '{"files":[]}'); fs.chmodSync(file, 0o640); fs.chmodSync(userData, 0o777);
  const services = create({ app: { isPackaged: true }, emit() {}, userData });
  const repair = services['kube.connectionsRepair'];
  assert.equal(typeof repair, 'function', 'a repair service');
  assert.deepEqual(repair({ confirm: true }, { shell: false, mainFrame: true }), { error: 'not_allowed' }, 'a page cannot repair');
  assert.deepEqual(repair({}, { shell: true, mainFrame: true }), { error: 'invalid_request' }, 'nothing changes without the confirmation');
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  const done = repair({ confirm: true }, { shell: true, mainFrame: true });
  assert.deepEqual(done, { state: 'repaired', fixed: ['folder', 'file'], connections: { state: 'ready' } });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(userData).mode & 0o022, 0, 'the folder is no longer writable by others');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"files":[]}', 'the content stays as it was');
  assert.deepEqual(services['kube.read']().connections, { state: 'ready' });
  /* content and links are not a permission repair: refused with the code, the file left alone */
  fs.writeFileSync(file, '{broken'); fs.chmodSync(file, 0o600);
  assert.deepEqual(repair({ confirm: true }, { shell: true, mainFrame: true }), { error: 'not_repairable', code: 'CONNECTIONS_JSON_INVALID', connections: { state: 'error', code: 'CONNECTIONS_JSON_INVALID', repair: 'CONNECTIONS_REPAIR_CONTENT' } });
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  fs.rmSync(file); const target = path.join(userData, 'elsewhere.json'); fs.writeFileSync(target, '{"files":[]}', { mode: 0o640 }); fs.symlinkSync(target, file);
  assert.equal(repair({ confirm: true }, { shell: true, mainFrame: true }).error, 'not_repairable');
  assert.equal(fs.statSync(target).mode & 0o777, 0o640, 'a link is never followed');
});

test('kube_open_file_opens_only_a_listed_kubeconfig_file_and_never_an_executable_or_bundle', async t => {
  const { userData, file } = home(t, baseDoc());
  const opened = [];
  const services = create({ app: { isPackaged: true }, emit() {}, userData, openPath: async p => { opened.push(p); return ''; } });
  const script = path.join(userData, 'run.command'); fs.writeFileSync(script, 'echo hi', { mode: 0o755 });
  for (const p of [script, '/Applications/Calculator.app', '/bin/sh', path.join(userData, 'connections.json'), 'relative/config', 42, null]) {
    const result = await services['kube.openFile']({ path: p });
    assert.equal(typeof result?.error, 'string', `refused ${p}`);
  }
  assert.deepEqual(opened, [], 'nothing outside the kubeconfig list was opened');
  assert.equal(await services['kube.openFile']({ path: file }), '');
  assert.deepEqual(opened, [fs.realpathSync(file)]);
  /* 목록에 있어도 실행 권한이 있거나 실행 확장자면 열지 않는다 */
  fs.chmodSync(file, 0o755);
  assert.equal(typeof (await services['kube.openFile']({ path: file })).error, 'string');
  assert.equal(opened.length, 1);
});

test('exec_context_shows_its_command_until_the_person_consents_from_the_shell_and_the_consent_persists', async t => {
  const command = path.join(os.tmpdir(), 'wake-consent-helper-' + process.pid);
  fs.writeFileSync(command, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  t.after(() => fs.rmSync(command, { force: true }));
  const { userData } = home(t, baseDoc({ exec: { apiVersion: 'client.authentication.k8s.io/v1beta1', command, args: ['token', '--cluster', 'lab'] } }));
  const services = create({ app: { isPackaged: true }, emit() {}, userData });
  const row = () => services['kube.read']().contexts.find(c => c.id === 'lab');
  assert.deepEqual(row().execConsent, { state: 'needed', command, args: ['token', '--cluster', 'lab'], env: [] });
  const probe = await services['kube.probe']({ id: 'lab' });
  assert.equal(probe.state, 'needs_consent');
  assert.equal((await services['kube.execConsent']({ id: 'lab', allow: true }, { shell: false, mainFrame: true })).error, 'not_allowed', 'a page cannot consent');
  assert.equal((await services['kube.execConsent']({ id: 'lab' }, { shell: true, mainFrame: true })).error, 'invalid_request');
  assert.deepEqual(await services['kube.execConsent']({ id: 'lab', allow: true }, { shell: true, mainFrame: true }), { state: 'granted', command, args: ['token', '--cluster', 'lab'], env: [] });
  assert.equal(row().execConsent.state, 'granted');
  const store = fs.readdirSync(userData).find(name => name.startsWith('exec-consent'));
  assert.ok(store);
  assert.equal(fs.statSync(path.join(userData, store)).mode & 0o777, 0o600);
  const again = create({ app: { isPackaged: true }, emit() {}, userData });
  assert.equal(again['kube.read']().contexts.find(c => c.id === 'lab').execConsent.state, 'granted', 'consent survives a restart');
});

test('terminal_kubeconfig_hands_a_keychain_token_through_an_exec_credential_helper_instead_of_an_unreadable_token_ref', async t => {
  const { userData } = home(t);
  const { createKeychain } = require('./keychain.cjs');
  const ref = createKeychain({ safeStorage, userData }).set('synthetic-terminal-token', 'k8s-token');
  const file = path.join(userData, 'fixture-config');
  fs.writeFileSync(file, yaml.dump(baseDoc({ tokenRef: ref })));
  const services = create({ app: { isPackaged: true }, emit() {}, userData, safeStorage });
  const result = services['term.env']({ id: 'lab' });
  const terminalFile = result.env.KUBECONFIG.split(path.delimiter)[0];
  const text = fs.readFileSync(terminalFile, 'utf8');
  assert.doesNotMatch(text, /synthetic-terminal-token/, 'the token itself is not written to disk');
  const merged = loadKubeconfig(result.env.KUBECONFIG.split(path.delimiter));
  const user = merged.users.get(merged.contexts.get('lab').user);
  assert.ok(user.exec, 'the terminal user authenticates through an exec helper');
  assert.equal(user.tokenRef, undefined);
  const env = Object.fromEntries((user.exec.env || []).map(x => [x.name, x.value]));
  const out = await new Promise((resolve, reject) => require('node:child_process').execFile(user.exec.command, user.exec.args, { env: { ...env, PATH: process.env.PATH } },
    (error, stdout) => (error ? reject(error) : resolve(stdout))));
  const credential = JSON.parse(out);
  assert.equal(credential.kind, 'ExecCredential');
  assert.equal(credential.apiVersion, user.exec.apiVersion);
  assert.equal(credential.status.token, 'synthetic-terminal-token');
  /* 다른 표(위조한 ticket)로는 아무것도 받지 못한다 */
  const forged = [...user.exec.args.slice(0, -1), 'forged-ticket'];
  assert.throws(() => execFileSync(user.exec.command, forged, { env: { ...env, PATH: process.env.PATH }, stdio: 'pipe' }));
});

/* review 5: approval.decide from any in-app page was recorded as the local person's approval. The desktop service allows only after the
   main process confirmation (kit confirm: an OS dialog the page cannot answer) shown for that approval id and plan hash */
test('approval_decide_allows_only_after_the_main_process_confirmation_for_that_approval_and_plan', async t => {
  const { userData } = home(t, baseDoc());
  const { createHubStore } = require('./hub-store.cjs'), { createApprovals } = require('./approvals.cjs');
  const base = 'spec.template.spec.containers[1]';
  const plan = { id: 'raise-memory', route: 'command', target: { kind: 'Deployment', namespace: 'shop', name: 'api' }, guards: [{ path: `${base}.name`, value: 'app' }],
    values: [{ path: `${base}.resources.limits.memory`, before: '64Mi', after: '128Mi' }, { path: 'spec.replicas', before: '1', after: '2' }], command: 'kubectl patch' };
  const incidents = { get: () => ({ cluster: 'lab', target: plan.target }), workspace: async () => ({ options: [{ id: 'raise-memory', title: 'raise memory', plan }] }), choose() {} };
  const proposer = createApprovals({ store: createHubStore({ userData, maskText: s => ({ text: String(s), n: 0 }) }), hub: incidents, sources: {}, audit() {} });
  const { approval } = await proposer.propose({ incident: 'i1', option: 'raise-memory', target: { cluster: 'lab', namespace: 'shop', kind: 'Deployment', name: 'api' } },
    { transport: 'mcp', requester: { kind: 'external', name: 'cli' } });
  const asked = [];
  let answer = false;
  const services = create({ app: { isPackaged: true }, emit() {}, userData, confirm: async shown => { asked.push(shown); return answer; } });
  await assert.rejects(services['approval.decide']({ id: approval, choice: 'allow' }), error => error.kind === 'not_confirmed', 'a page alone cannot allow');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].message, 'wake.approval.confirm.message');
  assert.equal(asked[0].action, 'wake.approval.confirm.allow');
  assert.equal(asked[0].vars.id, approval);
  assert.equal(asked[0].vars.cluster, 'lab');
  assert.deepEqual(asked[0].vars.route, { $t: 'wake.inc.route.command' }, 'the route is words, not the raw route id');
  assert.deepEqual(asked[0].vars.changes, [{ $t: 'wake.approval.confirm.containerChange', vars: { field: 'limits.memory', container: 'app', before: '64Mi', after: '128Mi' } },
    { $t: 'wake.approval.confirm.change', vars: { path: 'spec.replicas', before: '1', after: '2' } }]);
  assert.doesNotMatch(JSON.stringify(asked[0]), /[0-9a-f]{64}|hash/, 'the plan hash is bound inside, not shown');
  const ko = (await import('../locale/ko.js')).default;
  assert.equal(ko['wake.approval.confirm.containerChange'].replace(/\{(\w+)\}/g, (_, k) => asked[0].vars.changes[0].vars[k]), 'limits.memory (컨테이너 app): 64Mi -> 128Mi');
  answer = true;
  assert.equal((await services['approval.decide']({ id: approval, choice: 'allow' })).state, 'approved');
});

/* review 6: the shell document chose the chart, the cluster and the kubeconfig of the agent install (cluster-wide RBAC). The main process now
   resolves them itself: only a registered context, only the bundled chart or one the person picked in the main-process folder dialog, and the
   KUBECONFIG of the files Wake reads, whatever the page sent */
test('the_agent_install_runs_only_for_a_registered_context_and_an_approved_chart_with_the_kubeconfig_the_main_process_reads', async t => {
  const { userData, file } = home(t, baseDoc({ token: 'synthetic' }));
  const hooks = {}, picked = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-picked-chart-'));
  t.after(() => fs.rmSync(picked, { recursive: true, force: true }));
  fs.writeFileSync(path.join(picked, 'values.yaml'), JSON.stringify({ image: { repository: 'ghcr.io/example/wake-agent', digest: 'sha256:' + 'b'.repeat(64) } }));
  const services = create({ app: { isPackaged: true }, emit() {}, userData, hooks, pickFolder: async () => ({ canceled: false, filePaths: [picked] }), helmPath: () => '/fixture/bin/helm' });
  const bundled = services['agent.prep']({}).chart, prepared = answer => { assert.equal(typeof answer?.env?.KUBECONFIG, 'string', JSON.stringify(answer)); answer.cleanup(); return true; };
  assert.ok(prepared(hooks.commandGuard('agent.install', { chart: bundled, cluster: 'lab' })));
  assert.equal(hooks.commandGuard('agent.install', { chart: bundled, cluster: 'not-registered' }), 'COMMAND_CONTEXT_UNREGISTERED');
  assert.equal(hooks.commandGuard('agent.install', { chart: picked, cluster: 'lab' }), 'AGENT_CHART_UNAPPROVED', 'a published chart the person never picked');
  assert.deepEqual(await services['agent.pickChart'](), { path: picked });
  assert.ok(prepared(hooks.commandGuard('agent.install', { chart: picked, cluster: 'lab' })));
  assert.equal(hooks.commandGuard('agent.install', { chart: '/nonexistent/chart', cluster: 'lab' }), 'AGENT_IMAGE_UNPUBLISHED');
  assert.equal(hooks.commandGuard('perm.grant.namespace', { name: 'wake-read-x', resource: 'pods', namespace: 'shop', context: 'elsewhere', binding: 'wake-read-x', user: 'u' }), 'COMMAND_CONTEXT_UNREGISTERED');
  assert.deepEqual(hooks.commandGuard('perm.grant.namespace', { name: 'wake-read-x', resource: 'pods', namespace: 'shop', context: 'lab', binding: 'wake-read-x', user: 'u' }), { env: { KUBECONFIG: file } });
  assert.equal(hooks.commandGuard('install.helm', {}), null, 'a command that changes only this computer passes');
});

/* review 7 and 8: a consent survived an edited exec.env, and inline credentials in exec arguments reached the page (kube.read, the probe's
   needs_consent, the consent answer) and the consent file. The page sees hidden argument values and environment names only; an edited
   environment asks again */
test('exec_consent_rows_hide_inline_credentials_and_an_edited_kubeconfig_environment_asks_again', async t => {
  const command = path.join(os.tmpdir(), 'wake-consent-env-' + process.pid);
  fs.writeFileSync(command, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  t.after(() => fs.rmSync(command, { force: true }));
  const exec = env => ({ exec: { apiVersion: 'client.authentication.k8s.io/v1beta1', command, args: ['token', '--token', 'synthetic-inline-arg'], env } });
  const { userData, file } = home(t, baseDoc(exec([{ name: 'AUTH_MODE', value: 'synthetic-env-one' }])));
  const services = create({ app: { isPackaged: true }, emit() {}, userData });
  const row = () => services['kube.read']().contexts.find(c => c.id === 'lab');
  assert.deepEqual(row().execConsent, { state: 'needed', command, args: ['token', '--token', '••••'], env: ['AUTH_MODE'] });
  const probe = await services['kube.probe']({ id: 'lab' });
  assert.equal(probe.state, 'needs_consent');
  const granted = await services['kube.execConsent']({ id: 'lab', allow: true }, { shell: true, mainFrame: true });
  const shown = JSON.stringify([row(), probe, granted, fs.readFileSync(path.join(userData, 'exec-consent.json'), 'utf8')]);
  assert.doesNotMatch(shown, /synthetic-inline-arg|synthetic-env-one/, 'no credential or environment value reaches a page or the consent file');
  assert.equal(row().execConsent.state, 'granted');
  fs.writeFileSync(file, yaml.dump(baseDoc(exec([{ name: 'AUTH_MODE', value: 'synthetic-env-two' }]))));
  assert.equal(row().execConsent.state, 'needed', 'the same command and arguments with another environment ask again');
  assert.equal((await services['kube.probe']({ id: 'lab' })).state, 'needs_consent');
});

/* recheck 2: the confirmation named paths while Helm read them later: an edited kubeconfig could point the same context at another server and a
   picked chart could change after the dialog. The main process now runs Helm on what it showed: a snapshot of the chart (content digest), a
   kubeconfig holding only the confirmed context, cluster and user (0600, private folder, removed after the run) and Helm by its absolute path */
test('the_agent_install_runs_helm_on_a_chart_snapshot_and_a_one_context_kubeconfig_the_main_process_wrote', async t => {
  const doc = baseDoc({ token: 'synthetic-token' });
  doc.contexts.push({ name: 'other', context: { cluster: 'other', user: 'other-user' } });
  doc.clusters.push({ name: 'other', cluster: { server: 'https://other.invalid' } }); doc.users.push({ name: 'other-user', user: { token: 'other-token' } });
  const { userData, file } = home(t, doc);
  const hooks = {}, picked = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-picked-chart-'));
  t.after(() => fs.rmSync(picked, { recursive: true, force: true }));
  fs.writeFileSync(path.join(picked, 'Chart.yaml'), 'name: wake-agent\n');
  fs.writeFileSync(path.join(picked, 'values.yaml'), JSON.stringify({ image: { repository: 'ghcr.io/example/wake-agent', digest: 'sha256:' + 'b'.repeat(64) } }));
  const services = create({ app: { isPackaged: true }, emit() {}, userData, hooks, pickFolder: async () => ({ canceled: false, filePaths: [picked] }), helmPath: () => '/fixture/bin/helm' });
  await services['agent.pickChart']();
  const answer = hooks.commandGuard('agent.install', { chart: picked, cluster: 'lab' });
  const config = answer.env.KUBECONFIG, snapshot = answer.args.chart;
  assert.equal(answer.program, '/fixture/bin/helm', 'Helm by its resolved absolute path');
  assert.notEqual(snapshot, picked);
  assert.equal(fs.statSync(config).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(config)).mode & 0o777, 0o700);
  const written = yaml.load(fs.readFileSync(config, 'utf8'));
  assert.deepEqual(written.contexts.map(c => c.name), ['lab'], 'only the confirmed context');
  assert.deepEqual(written.clusters.map(c => c.cluster.server), ['https://lab.invalid']);
  assert.equal(written['current-context'], 'lab');
  assert.doesNotMatch(JSON.stringify(written), /other/);
  assert.match(JSON.stringify(answer.detail), /https:\/\/lab\.invalid/, 'the dialog names the server');
  assert.match(JSON.stringify(answer.detail), /[0-9a-f]{64}/, 'and the chart content digest');
  /* the originals change while the dialog is open: what runs is what was shown */
  fs.writeFileSync(path.join(picked, 'values.yaml'), JSON.stringify({ image: { repository: 'ghcr.io/attacker/agent', digest: 'sha256:' + 'c'.repeat(64) } }));
  doc.clusters[0].cluster.server = 'https://attacker.invalid'; fs.writeFileSync(file, yaml.dump(doc));
  assert.match(fs.readFileSync(path.join(snapshot, 'values.yaml'), 'utf8'), /ghcr\.io\/example/);
  assert.match(fs.readFileSync(config, 'utf8'), /lab\.invalid/);
  answer.cleanup();
  assert.equal(fs.existsSync(config), false); assert.equal(fs.existsSync(snapshot), false);
  /* a link inside a chart is refused rather than followed */
  fs.symlinkSync('/etc/hosts', path.join(picked, 'linked.yaml'));
  fs.writeFileSync(path.join(picked, 'values.yaml'), JSON.stringify({ image: { repository: 'ghcr.io/example/wake-agent', digest: 'sha256:' + 'b'.repeat(64) } }));
  assert.equal(hooks.commandGuard('agent.install', { chart: picked, cluster: 'lab' }), 'AGENT_CHART_UNAPPROVED');
});

/* round 3 finding 1: the snapshot kubeconfig passed the exec plugin through to Helm, outside Wake's executable consent, and Helm ran with the
   login shell's HELM_* and KUBE* overrides. The install now resolves an exec user through the consented plugin into a static token, refuses
   without consent, and runs Helm with an allowlisted environment */
test('the_agent_install_resolves_exec_credentials_through_consent_and_runs_helm_isolated', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-install-exec-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const command = path.join(dir, 'auth-helper');
  fs.writeFileSync(command, '#!/bin/sh\necho \'{"apiVersion":"client.authentication.k8s.io/v1beta1","kind":"ExecCredential","status":{"token":"synthetic-exec-token"}}\'\n', { mode: 0o755 });
  const { userData } = home(t, baseDoc({ exec: { apiVersion: 'client.authentication.k8s.io/v1beta1', command, args: ['token'] } }));
  const hooks = {};
  const services = create({ app: { isPackaged: true }, emit() {}, userData, hooks, helmPath: () => '/fixture/bin/helm' });
  const bundled = services['agent.prep']({}).chart;
  assert.equal(hooks.commandGuard('agent.install', { chart: bundled, cluster: 'lab' }), 'EXEC_CONSENT_REQUIRED');
  await services['kube.execConsent']({ id: 'lab', allow: true }, { shell: true, mainFrame: true });
  const answer = hooks.commandGuard('agent.install', { chart: bundled, cluster: 'lab' });
  assert.equal(answer.isolate, true, 'Helm sees only an allowlisted environment');
  const written = yaml.load(fs.readFileSync(answer.env.KUBECONFIG, 'utf8'));
  assert.equal(written.users[0].user.token, 'synthetic-exec-token');
  assert.equal(written.users[0].user.exec, undefined, 'no exec plugin reaches Helm');
  answer.cleanup();
});
