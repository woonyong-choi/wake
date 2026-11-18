const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { create, remoteTarget } = require('./terminal.cjs');

const FIXTURE_NOW = Date.parse('2026-11-06T01:00:00Z');
function config() {
  return { version: 1, targets: [{ contextId: 'fixture-subject', transport: 'aws-ssm', accountId: '111122223333',
    region: 'ap-southeast-2', instanceId: 'i-0123456789abcdef0', profile: 'fixture-profile', session: { kind: 'default-shell' },
    scope: 'fixture-scope', remoteKubeconfigPath: '/fixture/remote/kubeconfig', remoteContext: 'fixture-remote', remoteUser: 'ssm-user',
    identityVerified: true, interactiveVerified: true, remoteContextVerified: true,
    expiresAt: new Date(FIXTURE_NOW + 120000).toISOString(), authExpiresAt: new Date(FIXTURE_NOW + 90000).toISOString(),
    maxDurationMs: 60000, idleTimeoutMs: 10000 }] };
}
function fixture(t, { cfg = config(), spawnError = false, linger = false, groupValid = true, loaderAvailable = true, accountId = '111122223333', accountError = false, deferAccount = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-remote-unit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let nowMs = FIXTURE_NOW, sequence = 0;
  const timers = new Map(), calls = [], events = [], signals = [], procs = [], accountCalls = [];
  let resolveAccount, rejectAccount;
  const owner = {}, other = {};
  const groups = {
    capture(pid) { if (!groupValid) throw new Error('fixture group identity unavailable'); return { groupId: pid }; },
    signal(group, signal) { signals.push([group.groupId, signal]); if (signal === 'SIGKILL' || !linger) procs.find(p => p.pid === group.groupId).alive = false; return groupValid; },
    empty(group) { return !procs.find(p => p.pid === group.groupId).alive; },
  };
  const pty = { spawn(file, argv, options) {
    calls.push({ file, argv, options }); if (spawnError) throw new Error('fixture spawn failure');
    const proc = { pid: 10000 + calls.length, alive: true, writes: [], sizes: [],
      onData(fn) { this.data = fn; }, onExit(fn) { this.exit = fn; }, write(value) { this.writes.push(value); },
      resize(cols, rows) { this.sizes.push([cols, rows]); }, kill() { this.alive = false; this.exit?.({ exitCode: 129 }); } };
    procs.push(proc); return proc;
  } };
  const terminal = create({ userData: root, remoteConfig: cfg, groups, now: () => nowMs,
    ptyLoader: () => loaderAvailable ? pty : null,
    executableResolver: () => ({ aws: '/opt/homebrew/Cellar/awscli/2.35.15/libexec/bin/aws', plugin: path.join(os.homedir(), '.local/share/aws-session-manager-plugin/bin/session-manager-plugin') }),
    accountClient(target, executables, env, timeoutMs) { accountCalls.push({ target, executables, env, timeoutMs }); const result = new Promise((resolve, reject) => { resolveAccount = resolve; rejectAccount = reject; if (!deferAccount) { if (accountError) reject(new Error('fixture identity failure')); else resolve(accountId); } }); return { result, cancel() { rejectAccount(new Error('fixture cancelled')); } }; },
    setTimer(fn, delay) { const id = ++sequence; timers.set(id, { fn, due: nowMs + delay }); return id; },
    clearTimer(id) { timers.delete(id); }, send(...event) { events.push(event); } });
  const advance = ms => { nowMs += ms; for (;;) { const next = [...timers].find(([, timer]) => timer.due <= nowMs); if (!next) break; timers.delete(next[0]); next[1].fn(); } };
  return { terminal, owner, other, calls, procs, events, signals, timers, groups, advance, accountCalls, resolveAccount: value => resolveAccount(value),
    open: (extra = {}, who = owner) => terminal.open({ id: 'remote-1', mode: 'remote', contextId: 'fixture-subject', ...extra }, who) };
}

test('remote_open_requires_complete_native_config_before_loading_or_spawning', async t => {
  const mutations = [null, {}, { version: 2, targets: [] }, { version: 1, targets: [] }];
  for (const key of ['accountId', 'region', 'instanceId', 'profile', 'session', 'scope', 'remoteContext', 'remoteKubeconfigPath', 'remoteUser',
    'identityVerified', 'interactiveVerified', 'remoteContextVerified', 'authExpiresAt', 'expiresAt', 'maxDurationMs', 'idleTimeoutMs']) {
    const value = config(); delete value.targets[0][key]; mutations.push(value);
  }
  const duplicate = config(); duplicate.targets.push({ ...duplicate.targets[0] }); mutations.push(duplicate);
  for (const cfg of mutations) { const f = fixture(t, { cfg }); assert.equal((await f.open()).code, 'REMOTE_UNCONFIGURED'); assert.equal(f.calls.length, 0); }
  const expired = config(); expired.targets[0].authExpiresAt = new Date(FIXTURE_NOW).toISOString();
  const f = fixture(t, { cfg: expired }); assert.equal((await f.open()).code, 'REMOTE_EXPIRED'); assert.equal(f.calls.length, 0);
});

test('remote_open_rejects_renderer_transport_and_command_overrides_without_local_fallback', async t => {
  const f = fixture(t);
  for (const extra of [{ host: 'elsewhere' }, { profile: 'other' }, { argv: ['other'] }, { command: 'echo fixture' },
    { env: { SHELL: '/fixture-shell' } }, { cwd: '/fixture' }, { target: config().targets[0] }, { cols: -1 }, { rows: '24' }, { cols: 1001 }]) {
    assert.equal((await f.open(extra)).code, 'REMOTE_ARGUMENTS_REJECTED');
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await f.open({ mode: undefined })).code, 'TERMINAL_MODE_REQUIRED');
  assert.equal(f.terminal.run({ id: 'r', mode: 'remote', command: 'fixture' }, f.owner).code, 'TERMINAL_MODE_REQUIRED');
  assert.equal(f.calls.length, 0);
});

test('remote_open_spawns_only_fixed_aws_argv_and_reports_connecting_without_claiming_remote_verification', async t => {
  const f = fixture(t); const result = (await f.open());
  assert.equal(result.state, 'connecting'); assert.equal(result.user, undefined);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].file, '/opt/homebrew/Cellar/awscli/2.35.15/libexec/bin/aws');
  assert.deepEqual(f.calls[0].argv, ['--profile', 'fixture-profile', '--region', 'ap-southeast-2', 'ssm', 'start-session',
    '--target', 'i-0123456789abcdef0']);
  f.procs[0].data('\x1b]633;E;Zml4dHVyZQ==\x07\x1b]633;D;0\x07');
  assert.equal(f.events.some(event => event[1] === 'pty-command'), false);
  assert.equal(f.events.some(event => event[4]?.state === 'remote_target_verified'), false);
  f.terminal.close('remote-1', f.owner); f.advance(2000); assert.equal(f.timers.size, 0);
});

test('remote_owner_cannot_be_rebound_and_controls_are_owner_scoped', async t => {
  const f = fixture(t); (await f.open());
  assert.equal((await f.open({}, f.other)).code, 'TERMINAL_SESSION_CONFLICT');
  assert.equal(f.terminal.write('remote-1', 'fixture', f.other), false);
  assert.equal(f.terminal.resize('remote-1', 90, 30, f.other), false);
  assert.equal(f.terminal.close('remote-1', f.other), false);
  assert.equal(f.terminal.run({ id: 'remote-1', mode: 'local', command: 'fixture' }, f.owner).code, 'TERMINAL_SESSION_CONFLICT');
  assert.equal(f.terminal.write('remote-1', 'fixture', f.owner), true);
  assert.equal(f.terminal.resize('remote-1', 90, 30, f.owner), true);
  assert.deepEqual(f.procs[0].writes, ['fixture']); assert.deepEqual(f.procs[0].sizes, [[90, 30]]);
  f.terminal.closeAll(f.other); assert.equal(f.signals.length, 0);
  f.terminal.close('remote-1', f.owner); assert.equal(f.terminal.write('remote-1', 'late', f.owner), false);
  f.advance(2000); assert.deepEqual(f.signals, [[10001, 'SIGTERM']]);
});

test('remote_idle_and_absolute_deadlines_do_not_reconnect_or_spawn_local', async t => {
  for (const trigger of ['idle', 'max', 'auth']) {
    const cfg = config(); if (trigger === 'auth') cfg.targets[0].authExpiresAt = new Date(FIXTURE_NOW + 5000).toISOString();
    const f = fixture(t, { cfg }); (await f.open());
    if (trigger === 'max') for (let i = 0; i < 7; i++) { f.terminal.write('remote-1', 'x', f.owner); f.advance(9000); }
    else f.advance(trigger === 'auth' ? 5000 : 10000);
    f.advance(2000);
    assert.equal(f.calls.length, 1); assert.equal(f.timers.size, 0);
    assert.ok(f.events.some(event => event[4]?.state === 'expired'));
  }
});

test('remote_exit_and_cancel_escalate_only_owned_group_and_retain_unconfirmed_cleanup', async t => {
  const f = fixture(t, { linger: true }); (await f.open()); f.procs[0].exit({ exitCode: 255 }); f.advance(2000);
  assert.deepEqual(f.signals, [[10001, 'SIGTERM'], [10001, 'SIGKILL']]);
  assert.ok(f.events.some(event => event[4]?.state === 'disconnected')); assert.equal(f.calls.length, 1);
  const failed = fixture(t); (await failed.open()); failed.terminal.close('remote-1', failed.owner);
  failed.advance(2000); assert.equal(failed.timers.size, 0);
});

test('remote_missing_pty_spawn_failure_or_group_identity_failure_never_launches_shell', async t => {
  for (const options of [{ loaderAvailable: false }, { spawnError: true }, { groupValid: false }]) {
    const f = fixture(t, options); const result = (await f.open()); assert.ok(result.error);
    if (options.groupValid === false) { assert.equal(result.cleanup, 'unconfirmed'); assert.equal((await f.open()).code, 'TERMINAL_SESSION_CONFLICT'); }
    assert.equal(f.calls.length, options.loaderAvailable === false ? 0 : 1);
    assert.ok(f.calls.every(call => call.file === '/opt/homebrew/Cellar/awscli/2.35.15/libexec/bin/aws'));
    assert.equal(f.timers.size, 0); assert.ok(f.procs.every(proc => !proc.alive));
  }
});

test('remote_native_config_snapshot_and_concurrency_limit_prevent_late_retargeting', async t => {
  const cfg = config(), f = fixture(t, { cfg }); cfg.targets[0].instanceId = 'i-fffffffffffffffff';
  (await f.open()); assert.equal(f.calls[0].argv[7], 'i-0123456789abcdef0');
  for (let i = 2; i <= 4; i++) assert.ok(!(await f.open({ id: 'remote-' + i })).error);
  assert.equal((await f.open({ id: 'remote-5' })).code, 'REMOTE_SESSION_LIMIT');
  f.terminal.closeAll(); f.advance(2000); assert.ok(f.signals.every(([, signal]) => signal === 'SIGTERM'));
  assert.equal(f.timers.size, 0);
});

test('explicit_local_preserves_shell_and_integration_while_absent_mode_does_not_open', async t => {
  const f = fixture(t); assert.equal(f.terminal.open({ id: 'local' }, f.owner).code, 'TERMINAL_MODE_REQUIRED');
  const result = f.terminal.open({ id: 'local', mode: 'local', env: { SUBJECT_FIXTURE: 'local' } }, f.owner);
  assert.equal(result.mode, 'local'); assert.match(f.calls[0].file, /\/(zsh|bash)$/);
  assert.equal(f.calls[0].options.env.SUBJECT_FIXTURE, 'local');
  assert.equal((await f.open({ id: 'local' })).code, 'TERMINAL_SESSION_CONFLICT');
  f.terminal.close('local', f.owner);
});

test('public_entry_resolver_does_not_load_main_or_electron_and_start_forwards_exact_arguments', () => {
  const entry = require('./index.cjs');
  assert.equal(entry.remoteTarget, remoteTarget);
  assert.equal(entry.remoteTarget(config(), 'fixture-subject', FIXTURE_NOW).scope, 'fixture-scope');
  const source = fs.readFileSync(path.join(__dirname, 'index.cjs'), 'utf8');
  let loads = 0; const args = [{ setting: 'fixture' }, { root: 'fixture' }], sentinel = {};
  const box = { module: { exports: {} }, require(id) {
    if (id === './terminal.cjs') return { remoteTarget };
    assert.equal(id, './main.cjs'); loads++;
    return { start(...received) { assert.deepEqual(received, args); return sentinel; } };
  } };
  vm.runInNewContext(source, box);
  assert.equal(loads, 0); assert.equal(box.module.exports.remoteTarget, remoteTarget);
  assert.equal(box.module.exports.start(...args), sentinel); assert.equal(loads, 1);
});

test('main_extracted_existing_pty_channels_reject_subframes_and_pass_exact_owner', () => {
  const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const handle = source.match(/  function handle\(channel, fn\) \{[^\n]+\}/)[0];
  const block = source.slice(source.indexOf('  const termOf ='), source.indexOf('\n', source.indexOf("  handle('pty:close'")));
  const handlers = new Map(), owner = {}, calls = [];
  const mainFrame = {};
  vm.runInNewContext(handle + '\n' + block, { ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, shellOf: e => e.sender.allowed ? owner : null,
    terminals: { create: () => Object.fromEntries(['open', 'run', 'write', 'resize', 'close'].map(method => [method, (...args) => calls.push([method, ...args])])) },
    term: null, app: { getPath: () => '/fixture' }, remoteTerminalConfig: config(), windows: new Set(), send() {} });
  const event = { sender: { allowed: true, mainFrame }, senderFrame: mainFrame };
  handlers.get('kit:pty:write')(event, 'id', 'x'); assert.equal(calls[0].at(-1), owner);
  for (const channel of ['open', 'run', 'write', 'resize', 'close']) assert.throws(() => handlers.get('kit:pty:' + channel)({ ...event, senderFrame: {} }), /sender not allowed/);
});

test('remote_identity_change_refuses_signal_and_keeps_session_tombstone', async t => {
  const f = fixture(t); (await f.open()); f.groups.signal = () => false;
  const result = await f.terminal.closeAll(f.owner);
  assert.equal(result[0].state, 'cleanup_failed');
  assert.equal((await f.open()).code, 'TERMINAL_SESSION_CONFLICT');
  assert.equal(f.signals.length, 0); assert.equal(f.calls.length, 1);
});

test('remote_shutdown_waits_for_bounded_cleanup_without_scheduling_new_session', async t => {
  const f = fixture(t, { linger: true }); (await f.open()); let completed = false;
  const pending = f.terminal.closeAll().then(result => { completed = true; return result; });
  await Promise.resolve(); assert.equal(completed, false);
  f.advance(2000); const result = await pending;
  assert.equal(result[0].state, 'disconnected'); assert.equal(f.timers.size, 0); assert.equal(f.calls.length, 1);
});

test('native_group_cleanup_tracks_plugin_members_and_refuses_reused_pid_signature', async t => {
  const source = fs.readFileSync(path.join(__dirname, 'terminal.cjs'), 'utf8');
  for (const reused of [false, true]) {
    let snapshot = '21001 21001 Fri Nov 6 10:00:00 2026\n', sequence = 0;
    const signals = [], timers = new Map(), events = [], module = { exports: {} };
    const requireStub = name => name === 'node:child_process' ? { execFileSync(file, argv) {
      assert.equal(file, '/bin/ps'); assert.deepEqual(Array.from(argv), ['-axo', 'pid=,pgid=,lstart=']); return snapshot;
    } } : require(name);
    vm.runInNewContext(source, { module, exports: module.exports, require: requireStub, structuredClone, Buffer,
      process: { pid: 999, env: {}, kill(pid, signal) { signals.push([pid, signal]); snapshot = signal === 'SIGTERM' ? '21002 21001 Fri Nov 6 10:00:01 2026\n' : ''; } },
      setTimeout, clearTimeout });
    const proc = { pid: 21001, onData() {}, onExit() {}, kill() { throw new Error('unexpected unverified kill'); } };
    const terminal = module.exports.create({ userData: '/unused', remoteConfig: config(), now: () => FIXTURE_NOW,
      ptyLoader: () => ({ spawn: () => proc }),
      executableResolver: () => ({ aws: '/fixture/aws', plugin: '/fixture/plugin/session-manager-plugin' }),
      accountClient: () => ({ result: Promise.resolve('111122223333'), cancel() {} }), setTimer(fn) { const id = ++sequence; timers.set(id, fn); return id; },
      clearTimer(id) { timers.delete(id); }, send(...event) { events.push(event); } });
    const owner = {}; assert.equal((await terminal.open({ id: 'owned', mode: 'remote', contextId: 'fixture-subject' }, owner)).state, 'connecting');
    snapshot = reused ? '21001 21001 Fri Nov 6 10:01:00 2026\n' : '21001 21001 Fri Nov 6 10:00:00 2026\n21002 21001 Fri Nov 6 10:00:01 2026\n';
    terminal.close('owned', owner);
    while (timers.size) { const [id, fn] = [...timers][0]; timers.delete(id); fn(); }
    if (reused) { assert.deepEqual(signals, []); assert.equal(events.at(-1)[4].state, 'cleanup_failed'); }
    else { assert.deepEqual(signals, [[-21001, 'SIGTERM'], [-21001, 'SIGKILL']]); assert.equal(events.at(-1)[4].state, 'cancelled'); }
  }
});

test('main_shutdown_extracted_hook_waits_once_for_owned_cleanup', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const block = source.slice(source.indexOf('    let terminalsClosing ='), source.indexOf('    // quitting asks'));
  let handler, complete, calls = 0, quits = 0, prevented = 0;
  const pending = new Promise(resolve => { complete = resolve; });
  vm.runInNewContext(block, { quitting: false, term: { closeAll() { calls++; return pending; } }, app: { on(_event, fn) { handler = fn; }, quit() { quits++; } } });
  const event = { preventDefault() { prevented++; } };
  handler(event); handler(event); assert.equal(calls, 1); assert.equal(quits, 0); assert.equal(prevented, 2);
  complete([]); await Promise.resolve(); await Promise.resolve(); assert.equal(quits, 1);
  handler(event); assert.equal(prevented, 2);
});

test('remote_process_environment_ignores_host_endpoint_override_without_accepting_renderer_env', async t => {
  const previous = process.env.AWS_ENDPOINT_URL_SSM;
  process.env.AWS_ENDPOINT_URL_SSM = 'https://fixture.invalid';
  t.after(() => { if (previous === undefined) delete process.env.AWS_ENDPOINT_URL_SSM; else process.env.AWS_ENDPOINT_URL_SSM = previous; });
  const f = fixture(t); (await f.open());
  assert.equal(f.calls[0].options.env.AWS_ENDPOINT_URL_SSM, undefined);
  assert.equal(f.calls[0].options.env.AWS_CLI_AUTO_PROMPT, 'off');
  f.terminal.closeAll(); f.advance(2000);
});

test('remote_native_mapping_rejects_malformed_target_and_limit_values', async t => {
  for (const [key, value] of [['accountId', 'not-an-account'], ['region', 'region;fixture'], ['instanceId', 'other'],
    ['profile', 'profile;fixture'], ['document', 'AWS-RunShellScript'], ['scope', 'invalid.'],
    ['remoteContext', 'context\nother'], ['remoteKubeconfigPath', 'relative/path'], ['remoteUser', 'root;fixture'],
    ['maxDurationMs', 3600001], ['maxDurationMs', 999], ['idleTimeoutMs', 999], ['idleTimeoutMs', 60001]]) {
    const cfg = config(); cfg.targets[0][key] = value; const f = fixture(t, { cfg });
    assert.equal((await f.open()).code, 'REMOTE_UNCONFIGURED', key); assert.equal(f.calls.length, 0);
  }
});

test('account_mismatch_failure_and_pending_cancellation_never_spawn_pty', async t => {
  for (const options of [{ accountId: '999900001111' }, { accountError: true }]) {
    const f = fixture(t, options); const result = await f.open();
    assert.equal(result.code, options.accountError ? 'REMOTE_IDENTITY_FAILED' : 'REMOTE_ACCOUNT_MISMATCH');
    assert.equal(f.calls.length, 0); assert.equal(f.accountCalls.length, 1); assert.equal(f.timers.size, 0);
    assert.equal(f.accountCalls[0].target.profile, 'fixture-profile'); assert.equal(f.accountCalls[0].target.accountId, '111122223333');
  }
  const pending = fixture(t, { deferAccount: true }); const opened = pending.open();
  assert.equal(pending.accountCalls.length, 1); assert.equal(pending.terminal.write('remote-1', 'x', pending.owner), false);
  assert.equal(pending.terminal.close('remote-1', pending.other), false);
  assert.equal(pending.terminal.close('remote-1', pending.owner), true);
  assert.equal((await opened).code, 'REMOTE_PREFLIGHT_CANCELLED'); assert.equal(pending.calls.length, 0);
  const expired = fixture(t, { deferAccount: true }); const expiring = expired.open(); expired.advance(10000);
  assert.equal((await expiring).code, 'REMOTE_EXPIRED'); assert.equal(expired.calls.length, 0);
});

test('native_default_sts_client_uses_same_profile_discovered_paths_and_environment_whitelist', async t => {
  const source = fs.readFileSync(path.join(__dirname, 'terminal.cjs'), 'utf8');
  for (const output of ['111122223333\n', '999900001111\n', 'not-an-account', null, 'pending']) {
    const module = { exports: {} }, reads = [], sts = [], launches = [], timers = new Map(); let sequence = 0;
    const fakeHome = '/fixture/native-home';
    const requireStub = name => {
      if (name === 'node:os') return { ...os, homedir: () => '/fixture/untrusted-home', userInfo: () => ({ homedir: fakeHome }) };
      if (name === 'node:fs') return { ...fs, realpathSync(file) { reads.push(file); if (!file.startsWith('/fixture/bin/')) throw new Error('ENOENT'); return file; }, statSync: () => ({ isFile: () => true, uid: 0, mode: 0o755 }), accessSync() {} };
      if (name === 'node:child_process') return { execFile(file, argv, options, cb) { sts.push({ file, argv: Array.from(argv), options }); if (output !== 'pending') Promise.resolve().then(() => cb(output === null ? new Error('fixture auth failure') : null, output)); return { kill(signal) { assert.equal(signal, 'SIGTERM'); cb(new Error('fixture cancelled')); }, stdin: { end() {} } }; }, execFileSync() { throw new Error('unexpected process read'); } };
      return require(name);
    };
    vm.runInNewContext(source, { module, exports: module.exports, require: requireStub, structuredClone, Buffer,
      process: { pid: 999, env: { HOME: '/fixture/unsafe-home', AWS_ACCESS_KEY_ID: 'fixture-not-a-real-key', AWS_ENDPOINT_URL: 'https://fixture.invalid', PATH: 'relative/unsafe:/fixture/bin', NODE_OPTIONS: 'fixture', GOOGLE_APPLICATION_CREDENTIALS: '/fixture/credential' } }, setTimeout, clearTimeout });
    const proc = { pid: 31001, onData() {}, onExit() {}, kill() {} };
    const terminal = module.exports.create({ userData: '/unused', remoteConfig: config(), now: () => FIXTURE_NOW,
      ptyLoader: () => ({ spawn(file, argv, options) { launches.push({ file, argv: Array.from(argv), options }); return proc; } }),
      groups: { capture: pid => ({ groupId: pid }), signal: () => true, empty: () => true },
      setTimer(fn) { const id = ++sequence; timers.set(id, fn); return id; }, clearTimer(id) { timers.delete(id); }, send() {} });
    const owner = {}; const opened = terminal.open({ id: 'verified', mode: 'remote', contextId: 'fixture-subject' }, owner);
    if (output === 'pending') terminal.close('verified', owner);
    const result = await opened;
    assert.equal(sts.length, 1); assert.equal(sts[0].file, '/fixture/bin/aws', 'found on PATH, relative PATH entries ignored');
    assert.deepEqual(sts[0].argv, ['--profile', 'fixture-profile', '--region', 'ap-southeast-2', 'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text']);
    assert.equal(sts[0].options.timeout, 10000); assert.equal(sts[0].options.maxBuffer, 1024);
    const env = sts[0].options.env;
    assert.equal(env.PATH, '/fixture/bin', 'only the plugin folder');
    assert.equal(env.HOME, fakeHome); assert.equal(env.AWS_CONFIG_FILE, fakeHome + '/.aws/config');
    assert.deepEqual(Object.keys(env).sort(), ['HOME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM', 'COLORTERM', 'AWS_PAGER', 'AWS_CLI_AUTO_PROMPT', 'AWS_EC2_METADATA_DISABLED', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE'].sort());
    assert.ok(reads.includes('/fixture/bin/session-manager-plugin'));
    assert.ok(!reads.some(r => r.startsWith('relative')));
    if (output === '111122223333\n') {
      assert.equal(result.accountVerified, true); assert.equal(result.state, 'connecting'); assert.equal(launches.length, 1);
      assert.equal(launches[0].file, sts[0].file); assert.deepEqual(launches[0].argv.slice(0, 4), sts[0].argv.slice(0, 4));
      assert.equal(launches[0].options.env, env); terminal.close('verified', owner);
      while (timers.size) { const [id, fn] = [...timers][0]; timers.delete(id); fn(); }
    } else { assert.ok(result.error); assert.equal(launches.length, 0); assert.equal(timers.size, 0); }
  }
});

test('missing_pinned_executable_and_changed_path_after_sts_prevent_ssm_spawn', async t => {
  const f = fixture(t);
  // The exposed dependency is native-only; renderer overrides are rejected in earlier tests.
  const terminal = create({ userData: '/unused', remoteConfig: config(), now: () => FIXTURE_NOW,
    executableResolver() { throw new Error('fixture missing executable'); }, ptyLoader: () => ({ spawn() { assert.fail('must not spawn'); } }),
    accountClient() { assert.fail('must not call STS before pinned files exist'); }, send() {} });
  assert.equal((await terminal.open({ id: 'missing', mode: 'remote', contextId: 'fixture-subject' }, f.owner)).code, 'REMOTE_EXECUTABLE_UNAVAILABLE');
  let lookups = 0;
  const changed = create({ userData: '/unused', remoteConfig: config(), now: () => FIXTURE_NOW,
    executableResolver() { return { aws: ++lookups === 1 ? '/fixture/aws' : '/fixture/changed', plugin: '/fixture/plugin/session-manager-plugin' }; },
    accountClient: () => ({ result: Promise.resolve('111122223333'), cancel() {} }),
    ptyLoader: () => ({ spawn() { assert.fail('changed path must not spawn'); } }), setTimer: () => 1, clearTimer() {}, send() {} });
  assert.equal((await changed.open({ id: 'changed', mode: 'remote', contextId: 'fixture-subject' }, f.owner)).code, 'REMOTE_START_FAILED');
  assert.equal(lookups, 2);
});


test('default_shell_requires_exact_native_discriminant_and_never_accepts_document_parameters', async t => {
  for (const session of [null, [], 'default-shell', {}, { kind: 'named-standard-shell' },
    { kind: 'default-shell', documentName: 'SSM-SessionManagerRunShell' },
    { kind: 'default-shell', parameters: {} }]) {
    const cfg = config(); cfg.targets[0].session = session;
    const f = fixture(t, { cfg }); assert.equal((await f.open()).code, 'REMOTE_UNCONFIGURED');
    assert.equal(f.accountCalls.length, 0); assert.equal(f.calls.length, 0);
  }
  for (const extra of [{ document: 'SSM-SessionManagerRunShell' }, { parameters: {} }]) {
    const cfg = config(); Object.assign(cfg.targets[0], extra);
    const f = fixture(t, { cfg }); assert.equal((await f.open()).code, 'REMOTE_UNCONFIGURED');
    assert.equal(f.accountCalls.length, 0); assert.equal(f.calls.length, 0);
  }
  const f = fixture(t);
  for (const extra of [{ session: { kind: 'default-shell' } }, { document: 'AWS-StartInteractiveCommand' }, { parameters: {} }]) {
    assert.equal((await f.open(extra)).code, 'REMOTE_ARGUMENTS_REJECTED');
  }
  assert.equal(f.calls.length, 0);
});

test('default_shell_interactive_evidence_does_not_replace_remote_context_verification', async t => {
  const cfg = config(); cfg.targets[0].remoteContextVerified = false;
  const f = fixture(t, { cfg }); assert.equal((await f.open()).code, 'REMOTE_UNCONFIGURED');
  assert.equal(f.accountCalls.length, 0); assert.equal(f.calls.length, 0);
});

test('default_shell_exit254_preserves_exit_code_and_never_retries_or_falls_back', async t => {
  const f = fixture(t); const result = await f.open();
  assert.deepEqual(result.target.session, { kind: 'default-shell' });
  assert.equal(result.target.document, undefined); assert.equal(result.state, 'connecting');
  assert.equal(f.calls[0].argv.includes('--document-name'), false);
  assert.equal(f.calls[0].argv.includes('--parameters'), false);
  f.procs[0].data('InvalidDocument: fixture missing document');
  f.procs[0].exit({ exitCode: 254 }); f.advance(2000);
  assert.equal(f.calls.length, 1); assert.equal(f.accountCalls.length, 1);
  const exit = f.events.find(event => event[1] === 'pty-exit');
  assert.equal(exit[3], 254); assert.equal(exit[4].state, 'disconnected');
  assert.equal(f.timers.size, 0);
});

test('native_descriptor_requires_generic_scope_before_spawn', async t => {
  const cfg = config(); delete cfg.targets[0].scope;
  const f = fixture(t, { cfg }); assert.equal((await f.open()).code, 'REMOTE_UNCONFIGURED');
  assert.equal(f.calls.length, 0);
  const result = remoteTarget(config(), 'fixture-subject', FIXTURE_NOW);
  assert.equal(result.scope, 'fixture-scope');
});

/* K-08: the AWS CLI and the Session Manager plugin are found on PATH (or a path the remote config names) and validated, never a
   developer's fixed install path. A candidate must resolve to a regular executable file owned by root or the user and not writable
   by group or others; the resolved (real) path is what runs */
test('remote_executables_are_discovered_on_path_or_config_and_validated', () => {
  const { findExecutables } = require('./terminal.cjs');
  const me = 501;
  const files = {
    '/opt/homebrew/bin/aws': { real: '/opt/homebrew/Cellar/awscli/9.9.9/libexec/bin/aws', uid: me, mode: 0o755 },
    '/usr/local/bin/session-manager-plugin': { real: '/usr/local/sessionmanagerplugin/bin/session-manager-plugin', uid: 0, mode: 0o755 },
    '/tmp/evil/aws': { real: '/tmp/evil/aws', uid: me, mode: 0o777 },
    '/Users/other/bin/aws': { real: '/Users/other/bin/aws', uid: 777, mode: 0o755 },
  };
  const real = Object.fromEntries(Object.values(files).map(f => [f.real, f]));
  const fsImpl = {
    realpathSync: p => { if (files[p]) return files[p].real; if (real[p]) return p; throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    statSync: p => { const f = real[p] || { uid: 0, mode: 0o40755, dir: true }; return { isFile: () => !f.dir, uid: f.uid, mode: f.mode }; },
    accessSync: () => {},
  };
  const found = findExecutables({ env: { PATH: '/tmp/evil:relative/bin:/Users/other/bin:/opt/homebrew/bin' }, home: '/Users/me', uid: me, fsImpl });
  assert.deepEqual(found, { aws: '/opt/homebrew/Cellar/awscli/9.9.9/libexec/bin/aws', plugin: '/usr/local/sessionmanagerplugin/bin/session-manager-plugin' },
    'world-writable and foreign-owned candidates are skipped; the standard folders are searched after PATH');
  assert.deepEqual(findExecutables({ env: { PATH: '' }, config: { executables: { aws: '/opt/homebrew/bin/aws', sessionManagerPlugin: '/usr/local/bin/session-manager-plugin' } }, home: '/Users/me', uid: me, fsImpl }), found);
  assert.throws(() => findExecutables({ env: { PATH: '' }, config: { executables: { aws: '/tmp/evil/aws' } }, home: '/Users/me', uid: me, fsImpl }), /aws/, 'a configured path that fails validation is refused, not replaced');
  assert.throws(() => findExecutables({ env: { PATH: '/tmp/evil' }, home: '/Users/me', uid: me, fsImpl: { ...fsImpl, realpathSync: p => (p === '/tmp/evil/aws' ? p : (() => { throw new Error('ENOENT'); })()) } }), /aws/);
  const src = fs.readFileSync(path.join(__dirname, 'terminal.cjs'), 'utf8');
  assert.doesNotMatch(src, /Cellar\/awscli\/\d/, 'no developer install path in the source');
});
