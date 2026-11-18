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
  assert.deepEqual(row().execConsent, { state: 'needed', command, args: ['token', '--cluster', 'lab'] });
  const probe = await services['kube.probe']({ id: 'lab' });
  assert.equal(probe.state, 'needs_consent');
  assert.equal((await services['kube.execConsent']({ id: 'lab', allow: true }, { shell: false, mainFrame: true })).error, 'not_allowed', 'a page cannot consent');
  assert.equal((await services['kube.execConsent']({ id: 'lab' }, { shell: true, mainFrame: true })).error, 'invalid_request');
  assert.deepEqual(await services['kube.execConsent']({ id: 'lab', allow: true }, { shell: true, mainFrame: true }), { state: 'granted', command, args: ['token', '--cluster', 'lab'] });
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
