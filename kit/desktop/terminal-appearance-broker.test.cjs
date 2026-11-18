const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const { parseTerminalAppearance, parseTerminalPreferences, MAX_SOURCE_BYTES } = require('./terminal-appearance.cjs');

const SOURCE = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
const FACTORY = SOURCE.slice(SOURCE.indexOf('function createTerminalAppearanceBroker('), SOURCE.indexOf('function matchesToolUrl('));
const PREFIX = 'kit.terminal.appearance.';
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture(t, { fileSystem = fs, showOpenDialog } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-appearance-broker-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), applications = path.join(root, 'Apps'), systemApplications = path.join(root, 'SystemApps');
  const config = path.join(home, '.config', 'ghostty', 'config.ghostty');
  fs.mkdirSync(path.dirname(config), { recursive: true }); fs.mkdirSync(applications); fs.mkdirSync(systemApplications);
  fs.mkdirSync(path.join(applications, 'Ghostty.app')); fs.mkdirSync(path.join(systemApplications, 'Terminal.app'));
  const dialogs = []; let selected = { canceled: true, filePaths: [] };
  const create = runInNewContext(FACTORY + '\ncreateTerminalAppearanceBroker', { fs, path, randomUUID,
    parseTerminalAppearance: args => parseTerminalAppearance(structuredClone(args)),
    parseTerminalPreferences: (bytes, metadata) => parseTerminalPreferences(bytes, structuredClone(metadata)), MAX_SOURCE_BYTES, Buffer });
  const broker = create({ home, applicationRoots: [applications], systemApplications, fileSystem,
    dialog: { showOpenDialog: (win, options) => { dialogs.push({ win, options }); return showOpenDialog ? showOpenDialog(win, options) : Promise.resolve(selected); } } });
  const owner = () => { let closed = false; return { win: { isDestroyed: () => closed }, close: () => { closed = true; }, settings: { 'kit.terminal.theme': 'paper', draft: 'preserved' } }; };
  const a = owner(), b = owner();
  return { root, home, config, broker, dialogs, a, b, select: file => { selected = { canceled: false, filePaths: [file] }; },
    choose: (owner = a, format = 'ghostty') => broker.call(owner, PREFIX + 'chooseFile', { format }),
    list: (owner = a) => broker.call(owner, PREFIX + 'list', {}),
    import: (id, owner = a) => broker.call(owner, PREFIX + 'import', { sourceId: id }) };
}
function plistColor() {
  return '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Foreground Color</key><dict><key>Red Component</key><real>0</real><key>Green Component</key><real>0.5</real><key>Blue Component</key><real>1</real></dict></dict></plist>';
}

test('appearance_broker_list_exposes_metadata_and_opaque_ids_without_reading_profiles', async t => {
  let opens = 0;
  const fileSystem = { ...fs, promises: { ...fs.promises, open: async (...args) => { opens++; return fs.promises.open(...args); } } };
  const f = fixture(t, { fileSystem }); fs.writeFileSync(f.config, 'command=private-token\nforeground=112233');
  const result = await f.list();
  assert.equal(result.status, 'listed'); assert.equal(opens, 0);
  assert.equal(result.applications.find(app => app.label === 'Ghostty').installed, true);
  assert.equal(result.applications.find(app => app.label === 'Terminal').installed, true);
  assert.equal(result.applications.find(app => app.label === 'iTerm2').installed, false);
  assert.equal(result.sources.length, 1); assert.equal(typeof result.sources[0].id, 'string');
  assert.equal(result.applications[0].version, null);
  assert.equal(JSON.stringify(result).includes(f.root), false);
  assert.equal(JSON.stringify(result).includes('private-token'), false);
});

test('appearance_broker_owned_ids_reject_cross_window_stale_and_forged_requests', async t => {
  const f = fixture(t); fs.writeFileSync(f.config, 'foreground=112233');
  const first = (await f.list()).sources[0].id;
  assert.equal((await f.import(first, f.b)).reason, 'invalid-source');
  assert.equal((await f.import('forged', f.a)).reason, 'invalid-source');
  await f.list(); assert.equal((await f.import(first)).reason, 'invalid-source');
  const result = await f.broker.call(f.a, PREFIX + 'import', { sourceId: first, path: f.config, env: { private: 'value' } });
  assert.equal(result.reason, 'invalid-arguments');
  const accessor = {}; Object.defineProperty(accessor, 'format', { enumerable: true, get() { throw new Error('must not run'); } });
  assert.equal((await f.broker.call(f.a, PREFIX + 'chooseFile', accessor)).reason, 'invalid-arguments');
});

test('appearance_broker_no_data_and_unsupported_terminal_do_not_create_snapshot_or_change_settings', async t => {
  const f = fixture(t), before = JSON.stringify(f.a.settings);
  fs.writeFileSync(f.config, '# no explicit appearance\ncommand=private-token\n');
  const id = (await f.list()).sources[0].id, absent = await f.import(id);
  assert.equal(absent.status, 'no-data'); assert.equal(Object.hasOwn(absent, 'snapshot'), false);
  const binary = path.join(f.root, 'profile.terminal'); fs.writeFileSync(binary, 'bplist00fixture'); f.select(binary);
  assert.equal((await f.choose(f.a, 'terminal')).reason, 'unsupported-format');
  const archive = path.join(f.root, 'archive.terminal');
  fs.writeFileSync(archive, '<plist version="1.0"><dict><key>BackgroundColor</key><data>cHJpdmF0ZQ==</data></dict></plist>'); f.select(archive);
  const unsupported = await f.choose(f.a, 'terminal');
  assert.equal(unsupported.status, 'no-data'); assert.ok(unsupported.unsupportedFields.includes('color-archive'));
  assert.equal(JSON.stringify(f.a.settings), before);
});

test('appearance_broker_explicit_supported_files_use_real_parser_and_return_only_normalized_snapshot', async t => {
  const f = fixture(t), before = JSON.stringify(f.a.settings);
  const ghostty = path.join(f.root, 'selected.ghostty');
  fs.writeFileSync(ghostty, 'foreground=ABCDEF\nfont-family=Example Mono\nconfig-file=/private/credentials\ncommand=private-token\n');
  f.select(ghostty); const result = await f.choose();
  assert.equal(result.status, 'partial'); assert.equal(result.snapshot.colors.foreground, '#abcdef');
  assert.equal(result.snapshot.font.family, 'Example Mono');
  assert.equal(result.snapshot.source.appId, 'imported-file'); assert.equal(result.snapshot.source.appVersion, 'unknown');
  assert.ok(result.snapshot.unsupportedFields.includes('references'));
  assert.ok(result.snapshot.missingFields.includes('background'));
  assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(JSON.stringify(result).includes(f.root), false);
  const preset = path.join(f.root, 'selected.itermcolors'); fs.writeFileSync(preset, plistColor()); f.select(preset);
  const colors = await f.choose(f.a, 'itermcolors');
  assert.equal(colors.status, 'partial'); assert.equal(colors.snapshot.colors.foreground, '#0080ff');
  assert.equal(f.dialogs[0].win, f.a.win); assert.equal(f.dialogs[1].win, f.a.win);
  assert.equal(JSON.stringify(f.a.settings), before);
});

test('appearance_broker_cancel_wrong_format_closed_owner_and_dialog_failure_preserve_settings', async t => {
  const f = fixture(t), before = JSON.stringify(f.a.settings);
  assert.equal((await f.choose()).status, 'cancelled');
  assert.equal((await f.choose(f.a, 'other')).reason, 'invalid-arguments');
  assert.equal((await f.broker.call(f.a, PREFIX + 'constructor', {})).reason, 'unknown-method');
  f.a.close(); assert.equal((await f.choose()).reason, 'owner-closed');
  assert.equal(JSON.stringify(f.a.settings), before);
  const broken = fixture(t, { showOpenDialog: async () => { throw new Error('/private/dialog failure'); } });
  const failure = await broken.choose(); assert.equal(failure.reason, 'dialog-failed');
  assert.equal(JSON.stringify(failure).includes('private'), false);
});

test('appearance_broker_rejects_final_and_parent_symlinks_and_non_regular_files_before_open', async t => {
  let opens = 0;
  const fileSystem = { ...fs, promises: { ...fs.promises, open: async (...args) => { opens++; return fs.promises.open(...args); } } };
  const f = fixture(t, { fileSystem }); fs.writeFileSync(f.config, 'foreground=112233');
  const direct = path.join(f.root, 'link.ghostty'); fs.symlinkSync(f.config, direct); f.select(direct);
  assert.equal((await f.choose()).reason, 'symlink-rejected');
  const parent = path.join(f.root, 'linked-parent'); fs.symlinkSync(path.dirname(f.config), parent); f.select(path.join(parent, 'config.ghostty'));
  assert.equal((await f.choose()).reason, 'symlink-rejected');
  f.select(f.root); assert.equal((await f.choose()).reason, 'not-file'); assert.equal(opens, 0);
});

test('appearance_broker_bounded_read_accepts_exact_limit_and_rejects_growth', async t => {
  let grow = false, maxRequested = 0;
  const fileSystem = { ...fs, promises: { ...fs.promises, open: async (...args) => {
    const handle = await fs.promises.open(...args);
    return { stat: () => handle.stat(), close: () => handle.close(), async read(buffer, offset, length, position) {
      maxRequested = Math.max(maxRequested, length);
      if (grow) { grow = false; fs.writeFileSync(args[0], Buffer.alloc(MAX_SOURCE_BYTES + 1)); }
      return handle.read(buffer, offset, length, position);
    } };
  } } };
  const f = fixture(t, { fileSystem }); f.select(f.config);
  fs.writeFileSync(f.config, '#' + ' '.repeat(MAX_SOURCE_BYTES - 1)); assert.equal((await f.choose()).status, 'no-data');
  fs.writeFileSync(f.config, 'x'.repeat(MAX_SOURCE_BYTES + 1)); assert.equal((await f.choose()).reason, 'too-large');
  fs.writeFileSync(f.config, 'foreground=112233'); grow = true; assert.equal((await f.choose()).reason, 'too-large');
  assert.ok(maxRequested <= MAX_SOURCE_BYTES + 1);
  fs.writeFileSync(f.config, 'foreground=112233'); assert.equal((await f.choose()).status, 'partial');
});

test('appearance_broker_read_failure_and_disappeared_source_are_safe_and_recoverable', async t => {
  let deny = true;
  const fileSystem = { ...fs, promises: { ...fs.promises, open: async (...args) => {
    if (deny) throw Object.assign(new Error('/private/credentials'), { code: 'EACCES' });
    return fs.promises.open(...args);
  } } };
  const f = fixture(t, { fileSystem }); fs.writeFileSync(f.config, 'foreground=112233');
  const id = (await f.list()).sources[0].id;
  const failure = await f.import(id); assert.equal(failure.reason, 'permission-denied'); assert.equal(JSON.stringify(failure).includes('private'), false);
  deny = false; assert.equal((await f.import(id)).status, 'partial');
  fs.unlinkSync(f.config); assert.equal((await f.import(id)).reason, 'not-found');
});

test('appearance_broker_dialog_result_cannot_cross_owner_close_or_list_generation', async t => {
  for (const change of ['close', 'list']) {
    const selected = deferred(), f = fixture(t, { showOpenDialog: () => selected.promise });
    fs.writeFileSync(f.config, 'foreground=112233');
    const pending = f.choose();
    assert.equal((await f.choose()).reason, 'busy');
    if (change === 'close') f.a.close(); else { await f.list(); assert.equal((await f.choose()).reason, 'busy'); }
    selected.resolve({ canceled: false, filePaths: [f.config] });
    const result = await pending; assert.equal(result.reason, 'stale-source'); assert.equal(Object.hasOwn(result, 'snapshot'), false);
  }
});

test('appearance_broker_reads_only_the_default_terminal_profile_from_local_preferences', { skip: process.platform !== 'darwin' }, async t => {
  const f = fixture(t);
  const preferences = path.join(f.home, 'Library', 'Preferences');
  fs.mkdirSync(preferences, { recursive: true });
  const rgb = '<dict><key>Red Component</key><real>0</real><key>Green Component</key><real>0.5</real><key>Blue Component</key><real>1</real></dict>';
  fs.writeFileSync(path.join(preferences, 'com.apple.Terminal.plist'), '<plist version="1.0"><dict><key>Default Window Settings</key><string>Chosen</string><key>Window Settings</key><dict><key>Other</key><dict></dict><key>Chosen</key><dict><key>TextColor</key>' + rgb + '</dict></dict></dict></plist>');
  const source = (await f.list()).sources.find(item => item.appId === 'com.apple.Terminal');
  const result = await f.import(source.id);
  assert.equal(result.snapshot.id, 'com.apple.Terminal');
  assert.equal(result.snapshot.colors.foreground, '#0080ff');
});

test('appearance_broker_service_boundary_only_accepts_owner_shell_main_frame', async () => {
  const start = SOURCE.indexOf("  ipcMain.handle('kit:service:call'");
  const block = SOURCE.slice(start, SOURCE.indexOf("  ipcMain.on('kit:settings:load'", start));
  let handler; const calls = [], frame = {}, owner = { win: {} };
  runInNewContext(block, { ipcMain: { handle: (_name, callback) => { handler = callback; } },
    byContents: new Map([[2, { W: { tabs: new Map([['page', { tool: false }]]) }, tabId: 'page' }], [3, { W: { tabs: new Map([['tool', { tool: true }]]) }, tabId: 'tool' }]]),
    shellOf: event => event.sender.id === 1 ? owner : null, appearanceBroker: { call: (...args) => { calls.push(args); return { status: 'listed' }; } },
    UPDATE_METHODS: [], updater: { methods: {} }, services: { 'example.service': args => args }, serviceOwners: { capture() {} }, saveFile() {} });
  const event = id => ({ sender: { id, mainFrame: frame }, senderFrame: frame });
  assert.equal((await handler(event(1), PREFIX + 'list', {})).status, 'listed');
  assert.equal(calls[0][0], owner);
  await assert.rejects(handler({ ...event(1), senderFrame: {} }, PREFIX + 'list', {}), /sender not allowed/);
  for (const id of [2, 3, 4]) await assert.rejects(handler(event(id), PREFIX + 'list', {}), /sender not allowed/);
  assert.equal(calls.length, 1);
  assert.equal(await handler(event(2), 'example.service', 'unchanged'), 'unchanged');
});

test('appearance_broker_changed_inode_or_metadata_is_rejected_and_handle_is_closed', async t => {
  for (const change of ['inode', 'metadata', 'close-error']) {
    let closes = 0;
    const fileSystem = { ...fs, promises: { ...fs.promises, open: async (...args) => {
      const handle = await fs.promises.open(...args); let stats = 0;
      return { read: (...input) => handle.read(...input), async stat() {
        const info = await handle.stat(); stats++;
        if (change === 'inode' && stats === 1) info.ino++;
        if (change === 'metadata' && stats === 2) info.mtimeMs++;
        return info;
      }, async close() { closes++; await handle.close(); if (change === 'close-error') throw new Error('/private/close failure'); } };
    } } };
    const f = fixture(t, { fileSystem }); fs.writeFileSync(f.config, 'foreground=112233'); f.select(f.config);
    const result = await f.choose();
    assert.equal(result.reason, change === 'close-error' ? 'read-failed' : 'source-changed');
    assert.equal(Object.hasOwn(result, 'snapshot'), false);
    assert.equal(closes, 1); assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(fs.readFileSync(f.config, 'utf8'), 'foreground=112233');
  }
});

test('appearance_broker_inflight_list_cannot_publish_ids_after_newer_list', async t => {
  const entered = deferred(), release = deferred(); let block = true, configured;
  const fileSystem = { ...fs, promises: { ...fs.promises, lstat: async file => {
    if (block && file === configured) { block = false; entered.resolve(); await release.promise; }
    return fs.promises.lstat(file);
  } } };
  const f = fixture(t, { fileSystem }); configured = f.config; fs.writeFileSync(f.config, 'foreground=112233');
  const older = f.list(); await entered.promise;
  const newer = await f.list(); release.resolve();
  assert.equal((await older).reason, 'stale-source');
  assert.equal((await f.import(newer.sources[0].id)).status, 'partial');
});

test('appearance_broker_owner_close_during_read_cannot_return_snapshot', async t => {
  const entered = deferred(), release = deferred(); let closes = 0;
  const fileSystem = { ...fs, promises: { ...fs.promises, open: async (...args) => {
    const handle = await fs.promises.open(...args);
    return { stat: () => handle.stat(), async read(...input) { entered.resolve(); await release.promise; return handle.read(...input); },
      async close() { closes++; await handle.close(); } };
  } } };
  const f = fixture(t, { fileSystem }); fs.writeFileSync(f.config, 'foreground=112233'); f.select(f.config);
  const pending = f.choose(); await entered.promise; f.a.close(); release.resolve();
  const result = await pending; assert.equal(result.reason, 'stale-source');
  assert.equal(Object.hasOwn(result, 'snapshot'), false); assert.equal(closes, 1);
});
