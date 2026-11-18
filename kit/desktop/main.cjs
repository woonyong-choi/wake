/*
 * Desktop shell (Electron main process). The part common to every app definition.
 *   const { start } = require('<kit>/desktop/index.cjs');
 *   start(require('./desktop.config.js'), { appRoot: __dirname, repoRoot: <folder holding kit and apps> });
 *
 * Windows: each window is the shell document over its window background with its own tabs. The background is one of the window styles
 * of the desktop config (window.styles, chosen with the kit.windowStyle setting, default from the app settings defaults): per theme a
 * glass view (macOS 26 glass, the system material when the system has none), a window material (vibrancy), a color layer over it (drawn
 * natively under the document, so the document stays transparent there) and an opaque window color, fitted to the
 * measured reference colors over the same wallpaper and over white, black and red backgrounds. The color layer is set again whenever
 * macOS may rebuild the background layers (resize, focus, show, theme and style changes), so it stays on top of them. The saved app theme is applied before the first window and menu exist (applied only when the shell had
 * loaded, the window and the first native menu could still start in the system appearance). Each tab is a
 * WebContentsView placed on its content pane (two panes in a split view). A new window (window:new, ⌘N) opens with
 * its own tabs, optionally starting with the tabs moved to it ({ addresses, group }); the menu bar acts on the focused window.
 * A new window takes the size of the window it came from, 10 lower and to the right, or the top left of the screen's work area when that
 * would leave the screen (measured).
 * Addresses: '<scheme>://app/<path in repo>' serves files; any other '<scheme>://<path>' is resolved to a page file through the route table.
 * Menu bar: menu.cjs, named from the config and rebuilt when the shell reports history, zoom or tab state (menu:state); a development run is relaunched from a copy of the runtime bundle carrying the app name (named-bundle.cjs),
 *       because macOS shows the bundle name, not app.setName, as the first menu title.
 * App icon: cfg.icon (a PNG relative to the app folder, drawn on the platform icon template) is the window icon and, on macOS, the Dock icon
 *       of a development run (app.dock.setIcon); a packaged app takes cfg.packageIcon (.icns) from the packager instead.
 * Quit: with quitConfirm (desktop config, on by default; the app menu checkbox keeps the choice) quitting asks the shell to show its
 *       confirmation; quitting again while it is shown (the same ⌘Q) quits.
 * Zoom: tabs:zoom sets a tab page's zoom factor chosen by the shell (per origin, as in the browser) and returns it (an initial request sets it once per internal host and process, see below); tabs:mute mutes a tab's sound.
 * Tint: an external tool tab reports its page tint (the favicon's main color lightened halfway to white) for its pinned tile and context chip.
 * App services: cfg.services (a module path relative to the app folder) exports create({ app, emit, emitTo, safeStorage, userData, hooks, confirm }) -> { name: async (args, from, owner) }.
 *       hooks: main-only functions the module may set (toolHeaders(toolId): headers for a tool tab's own origin, tool-auth.cjs;
 *       commandGuard(id, args): a code string refuses a declared terminal command, { env } sets declared environment names, null lets it run).
 *       confirm({ message, action, detail, vars, text }) -> Promise<bool>: the main process's own OS confirmation (dictionary keys, text as given), for a human gate no page can answer.
 *       The shell and in-app tab pages call them (service:call; never external tool tabs); emit(event, payload) reaches the shell and every
 *       in-app tab (service-event); emitTo(owner, event, payload) reaches only the page document that made the call. The module runs with Node in the main process, so it holds whatever must not live in a page (files, keychain).
 * Security: every view is sandboxed with contextIsolation and no nodeIntegration, preloads expose allowed messages only, permission requests are denied,
 *       external tool tabs use a separate session (partition) without preload, and addresses outside the allow list open in the system browser.
 */
const { attachToolAuth } = require('./tool-auth.cjs');
const { app, BaseWindow, BrowserWindow, WebContentsView, ipcMain, protocol, Menu, session, screen, shell: osShell, nativeTheme, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { buildAppMenu } = require('./menu.cjs');
const { relaunchNamed } = require('./named-bundle.cjs');
const { loadNative } = require('./native.cjs');
const background = require('./background-run.cjs');
const platform = require('./platform/index.cjs');
const terminals = require('./terminal.cjs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { createUpdater, UPDATE_METHODS } = require('./updater.cjs');
const { randomUUID } = require('node:crypto');
const { parseTerminalAppearance, parseTerminalPreferences, MAX_SOURCE_BYTES } = require('./terminal-appearance.cjs');

/* key event -> shortcut text, the same rule as core/keys.js shortcutOf: on macOS ⌘ is mod and ⌃ is ctrl, elsewhere Ctrl is mod;
   a letter, digit or punctuation key typed with another script's input source or layout is named by its physical key */
const MAC = process.platform === 'darwin';
const PUNCT = { Backslash: '\\', IntlBackslash: '\\', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`' };
const keyName = (key, code) => (/^[\x20-\x7e]$/.test(key || '') ? key : /^(Key[A-Z]|Digit\d)$/.test(code || '') ? code.slice(-1) : PUNCT[code] ?? (key || '')).toLowerCase();
const shortcutOf = i => [(MAC ? i.meta : i.meta || i.control) && 'mod', MAC && i.control && 'ctrl', i.alt && 'alt', i.shift && 'shift', keyName(i.key, i.code)].filter(Boolean).join('+');

/** Owns read-only source capabilities per shell window; no renderer path or settings writes are accepted. */
function createTerminalAppearanceBroker({ dialog, home, applicationRoots = ['/Applications', path.join(home, 'Applications')],
  systemApplications = '/System/Applications/Utilities', fileSystem = fs }) {
  const owners = new WeakMap(), pickers = new WeakSet(), formats = ['ghostty', 'itermcolors', 'terminal'];
  const failure = reason => ({ status: 'error', reason });
  const alive = owner => owner?.win && !owner.win.isDestroyed();
  const current = (owner, state) => alive(owner) && owners.get(owner) === state;
  function reasonOf(error) {
    const reasons = { ENOENT: 'not-found', EACCES: 'permission-denied', EPERM: 'permission-denied', ELOOP: 'symlink-rejected' };
    return Object.hasOwn(reasons, error?.code) ? reasons[error.code] : 'read-failed';
  }
  const apps = [
    { appId: 'com.mitchellh.ghostty', label: 'Ghostty', bundle: 'Ghostty.app' },
    { appId: 'com.apple.Terminal', label: 'Terminal', bundle: 'Terminal.app' },
    { appId: 'com.googlecode.iterm2', label: 'iTerm2', bundle: 'iTerm.app' },
  ];
  function validArgs(args, fields) {
    if (args == null) return fields.length === 0;
    if (typeof args !== 'object' || Array.isArray(args)) return false;
    const entries = Object.entries(Object.getOwnPropertyDescriptors(args));
    return entries.length === fields.length && entries.every(([key, property]) => fields.includes(key) && Object.hasOwn(property, 'value'));
  }
  function stateOf(owner) {
    let state = owners.get(owner);
    if (!state) { state = { sources: new Map() }; owners.set(owner, state); }
    return state;
  }
  async function inspect(file) {
    let cursor = path.parse(file).root;
    const parts = path.relative(cursor, file).split(path.sep);
    let stat;
    for (const [index, part] of parts.entries()) {
      cursor = path.join(cursor, part); stat = await fileSystem.promises.lstat(cursor);
      if (stat.isSymbolicLink()) return { error: 'symlink-rejected' };
      if (index < parts.length - 1 && !stat.isDirectory()) return { error: 'not-file' };
    }
    return { stat };
  }
  async function readBounded(file) {
    let handle;
    try {
      const inspected = await inspect(file);
      if (inspected.error) return failure(inspected.error);
      if (!inspected.stat.isFile()) return failure('not-file');
      if (inspected.stat.size > MAX_SOURCE_BYTES) return failure('too-large');
      if (fileSystem.constants.O_NOFOLLOW === undefined) return failure('unsupported-platform');
      handle = await fileSystem.promises.open(file, fileSystem.constants.O_RDONLY | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_NONBLOCK);
      const initial = await handle.stat();
      if (!initial.isFile() || initial.dev !== inspected.stat.dev || initial.ino !== inspected.stat.ino) return failure('source-changed');
      if (initial.size > MAX_SOURCE_BYTES) return failure('too-large');
      const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1); let used = 0;
      while (used < buffer.length) {
        const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used);
        if (!bytesRead) break;
        used += bytesRead;
      }
      if (used > MAX_SOURCE_BYTES) return failure('too-large');
      const final = await handle.stat();
      if (initial.size !== final.size || initial.mtimeMs !== final.mtimeMs || initial.ctimeMs !== final.ctimeMs) return failure('source-changed');
      return { bytes: buffer.subarray(0, used) };
    } catch (error) { return failure(reasonOf(error)); }
    finally { if (handle) try { await handle.close(); } catch { return failure('read-failed'); } }
  }
  async function readSource(owner, state, source) {
    const result = await readBounded(source.file);
    if (!current(owner, state)) return failure('stale-source');
    if (!result.bytes) return result;
    const metadata = {
      id: source.appId === 'imported-file' ? `appearance-${randomUUID()}` : source.appId, label: source.appLabel || source.label,
      source: { appId: source.appId, appVersion: 'unknown', profileLabel: source.label, importedAt: new Date().toISOString() },
    };
    const parsed = source.preferences ? await parseTerminalPreferences(result.bytes, metadata)
      : await parseTerminalAppearance({ format: source.format, bytes: result.bytes, metadata });
    return current(owner, state) ? parsed : failure('stale-source');
  }
  async function list(owner) {
    const state = { sources: new Map() }; owners.set(owner, state);
    const applications = [], sources = [], bundles = new Map();
    for (const app of apps) {
      let installed = false, reason = null;
      const roots = app.appId === 'com.apple.Terminal' ? [...applicationRoots, systemApplications] : applicationRoots;
      for (const root of roots) {
        const bundle = path.join(root, app.bundle);
        try { const info = await inspect(bundle); if (info.stat?.isDirectory()) { installed = true; bundles.set(app.appId, bundle); break; } else if (info.error) reason = info.error; }
        catch (error) { if (error.code !== 'ENOENT') reason = reasonOf(error); }
      }
      applications.push({ appId: app.appId, label: app.label, installed, version: null, reason });
    }
    const candidates = [
      ...['config.ghostty', 'config'].flatMap(name => [
        { file: path.join(home, '.config', 'ghostty', name), format: 'ghostty', appId: 'com.mitchellh.ghostty', location: 'standard-xdg' },
        { file: path.join(home, 'Library', 'Application Support', 'com.mitchellh.ghostty', name), format: 'ghostty', appId: 'com.mitchellh.ghostty', location: 'standard-macos' },
      ]),
      { file: path.join(home, 'Library', 'Preferences', 'com.apple.Terminal.plist'), format: 'terminal', appId: 'com.apple.Terminal', location: 'standard-macos', preferences: true },
    ];
    const ghostty = bundles.get('com.mitchellh.ghostty');
    if (ghostty) candidates.push({ file: path.join(ghostty, 'Contents', 'Resources', 'ghostty', 'themes', 'Ghostty Default Style Dark'),
      format: 'ghostty', appId: 'com.mitchellh.ghostty', location: 'bundled' });
    for (const source of candidates) {
      try {
        const info = await inspect(source.file);
        if (info.error || !info.stat.isFile()) { sources.push({ appId: source.appId, format: source.format, reason: info.error || 'not-file' }); continue; }
        const id = randomUUID(), label = path.basename(source.file);
        const appLabel = apps.find(app => app.appId === source.appId).label;
        state.sources.set(id, { ...source, label, appLabel });
        sources.push({ id, label, format: source.format, appId: source.appId, location: source.location });
      } catch (error) { if (error.code !== 'ENOENT') sources.push({ appId: source.appId, format: source.format, reason: reasonOf(error) }); }
    }
    return current(owner, state) ? { status: 'listed', applications, sources, discovery: 'standard-locations' } : failure('stale-source');
  }
  async function chooseFile(owner, state, format) {
    if (pickers.has(owner)) return failure('busy');
    pickers.add(owner);
    try {
      const selected = await dialog.showOpenDialog(owner.win, { properties: ['openFile'], filters: [{ name: format, extensions: format === 'ghostty' ? ['*'] : [format] }] });
      if (!current(owner, state)) return failure('stale-source');
      if (selected.canceled) return { status: 'cancelled' };
      if (selected.filePaths?.length !== 1 || !path.isAbsolute(selected.filePaths[0])) return failure('invalid-selection');
      const file = selected.filePaths[0];
      return await readSource(owner, state, { file, format, appId: 'imported-file', label: path.basename(file) });
    } catch { return failure('dialog-failed'); }
    finally { pickers.delete(owner); }
  }
  return {
    async call(owner, name, args) {
      if (!alive(owner)) return failure('owner-closed');
      if (name === 'kit.terminal.appearance.list') return validArgs(args, []) ? list(owner) : failure('invalid-arguments');
      if (name === 'kit.terminal.appearance.import') {
        if (!validArgs(args, ['sourceId']) || typeof args.sourceId !== 'string') return failure('invalid-arguments');
        const state = stateOf(owner), source = state.sources.get(args.sourceId);
        return source ? readSource(owner, state, source) : failure('invalid-source');
      }
      if (name === 'kit.terminal.appearance.chooseFile') {
        if (!validArgs(args, ['format']) || !formats.includes(args.format)) return failure('invalid-arguments');
        return chooseFile(owner, stateOf(owner), args.format);
      }
      return failure('unknown-method');
    },
  };
}

function matchesToolUrl(url, allowedUrl) {
  try {
    const target = new URL(url);
    const allowed = new URL(allowedUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.origin !== allowed.origin) return false;
    const basePath = allowed.pathname;
    return target.pathname === basePath || target.pathname.startsWith(basePath.endsWith('/') ? basePath : basePath + '/');
  } catch {
    return false; // Invalid or relative URLs do not define an allowed origin.
  }
}

/* the app scheme serves the app and kit folders only: the rest of the repository (spec, local lists, git data) is never readable by a page */
const SERVED_ROOTS = ['kit', 'apps'];
function servedFile(repoRoot, rel) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { return null; }
  const abs = path.resolve(repoRoot, '.' + decoded);
  return SERVED_ROOTS.some(root => abs.startsWith(path.resolve(repoRoot, root) + path.sep)) ? abs : null;
}
/* module scripts and fonts of an app page (scheme://<page host>) are cross-origin requests to scheme://app: only those origins get an answer */
function corsOrigin(scheme, origin) {
  return typeof origin === 'string' && new RegExp(`^${scheme.replace(/[^\w]/g, '\\$&')}://[a-z0-9-]+$`).test(origin) ? origin : null;
}
/* a command the terminal runs for the person: only an id the app declares (cfg.commands: { id: { template, args: { name: pattern }, env: [names] } }),
   every argument present, matching its whole pattern and single-quoted into the template; only declared environment names pass.
   guard(id, args) (the app's main-process hook commandGuard) may refuse a well-formed command for what it would do now (a code string): the
   main process refuses it whatever the page decided, { refused: code }. It may instead answer what the main process resolved for this run:
   { env?, args?, program?, detail?, cleanup? } — values for declared environment names and arguments (they replace what the page sent; an
   argument still has to match its pattern), the program's absolute path (it replaces the template's first word), words the confirmation shows
   ({ $t, vars }), isolate: true (the command runs under env -i with a fixed PATH and HOME and the declared names only) and a function to call
   once the command ends, is cancelled or is refused. A command the app marks confirm comes back with
   confirm: true (pty:run asks the person in a native dialog before it starts) */
function buildCommand(commands, input, guard) {
  const def = commands && typeof input?.command === 'string' && Object.hasOwn(commands, input.command) ? commands[input.command] : null;
  if (!def) return null;
  const given = input.args && typeof input.args === 'object' && !Array.isArray(input.args) ? input.args : {}, names = Object.keys(def.args || {});
  const valid = args => !Object.keys(args).some(key => !names.includes(key)) && names.every(key => typeof args[key] === 'string' && new RegExp(`^(?:${def.args[key]})$`).test(args[key]));
  if (!valid(given)) return null;
  let answer = null;
  try { answer = guard?.(input.command, { ...given }) || null; } catch { answer = 'COMMAND_GUARD_FAILED'; }
  if (answer && typeof answer !== 'object') return { refused: typeof answer === 'string' && /^[A-Z_]{1,64}$/.test(answer) ? answer : 'COMMAND_REFUSED' };
  const plain = v => v && typeof v === 'object' && !Array.isArray(v);
  const cleanup = typeof answer?.cleanup === 'function' ? answer.cleanup : null;
  const drop = () => { try { cleanup?.(); } catch { /* best effort */ } return null; };
  if (answer && (!plain(answer) || ['env', 'args'].some(k => k in answer && !plain(answer[k])) || ('program' in answer && (typeof answer.program !== 'string' || !path.isAbsolute(answer.program))))) return drop();
  const args = { ...given, ...(answer?.args ?? {}) };
  if (!valid(args)) return drop();
  const env = { ...(plain(input.env) ? input.env : {}), ...(answer?.env ?? {}) };
  if (Object.keys(env).some(key => !(def.env || []).includes(key) || typeof env[key] !== 'string')) return drop();
  const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
  let command = def.template.replace(/\{(\w+)\}/g, (_, key) => quote(args[key]));
  if (answer?.program) { const [first] = def.template.split(' '); if (first !== path.basename(answer.program)) return drop(); command = quote(answer.program) + command.slice(first.length); }
  /* isolate: the command sees only a fixed PATH and HOME and the declared names (env -i), nothing the person's startup files exported */
  if (answer?.isolate === true) command = `/usr/bin/env -i ${[`PATH=/usr/bin:/bin`, `HOME=${os.homedir()}`, ...Object.entries(env).map(([k, v]) => `${k}=${v}`)].map(quote).join(' ')} ${command}`;
  const extra = { ...(answer?.detail ? { detail: answer.detail } : {}), ...(cleanup ? { cleanup } : {}) };
  return def.confirm === true ? { command, env, confirm: true, ...extra } : { command, env, ...extra };
}
/* the environment lines a confirmation shows (NAME=value, one per line) */
const envLines = env => Object.entries(env || {}).map(([k, v]) => `${k}=${v}`).join('\n');
/* no page or tool in a session gets a device, notification or clipboard-read permission: requests are refused and checks answer no. The one
   check that stays yes is writing plain text to the clipboard (a copy button; Chromium still requires the person's click for it) */
function lockPermissions(s) {
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  s.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write');
}
/* how long a person's click or key in a tool page lets that page open one outside link (Chromium's transient user activation) */
const USER_ACTIVATION_MS = 5000;

const THEME_KEY = 'kit.theme'; // the shell's theme setting (shell.js applyTheme)
const LOCALE_KEY = 'kit.locale'; // the shell's language setting
const STYLE_KEY = 'kit.windowStyle'; // the shell's window style setting (shell.js applyTheme)
const thumbOf = img => (img.isEmpty() ? null : img.resize({ width: 560 }).toDataURL());
/* page tint from a favicon: the mean of its colored opaque pixels, lightened halfway to white; grey icons have none */
function tintOf(img) {
  if (img.isEmpty()) return null;
  const bmp = img.resize({ width: 16, height: 16 }).toBitmap();
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < bmp.length; i += 4) {
    const B = bmp[i], G = bmp[i + 1], R = bmp[i + 2], A = bmp[i + 3];
    if (A < 200 || Math.max(R, G, B) - Math.min(R, G, B) < 40) continue;
    r += R; g += G; b += B; n++;
  }
  if (n < 6) return null;
  const half = c => Math.round(c / n / 2 + 127.5);
  return `rgb(${half(r)} ${half(g)} ${half(b)})`;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain' };
/* a settings file is replaced whole (a temporary file renamed over it), so a crash mid-write never leaves half a file */
function writeFileAtomic(file, text) {
  const temporary = file + '.' + process.pid + '-' + Date.now() + '.tmp';
  try { fs.writeFileSync(temporary, text, { mode: 0o600 }); fs.renameSync(temporary, file); }
  catch (error) { try { fs.unlinkSync(temporary); } catch { /* nothing written */ } throw error; }
}
/* a settings file that is not JSON is moved aside (file.corrupt-<time>) so the next save does not overwrite what a person could still
   recover, and the app starts from defaults. -> { text, value } | null (missing or unreadable) */
function readJsonFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  try { return { text, value: JSON.parse(text) }; }
  catch { try { fs.renameSync(file, file + '.corrupt-' + Date.now()); } catch { /* left in place */ } return null; }
}

/* a service's message for one document (the changes of a subscription it opened): only the in-app tab page whose web contents made the
   call gets it, never a tool tab, another page or window, or a closed page. -> whether it was sent */
function serviceSendTo(windows) {
  return (owner, event, payload) => {
    for (const X of windows) for (const t of X.tabs.values()) {
      const wc = t.view.webContents;
      if (!t.tool && wc.id === owner?.senderWebContentsId && !wc.isDestroyed()) { wc.send('kit:service-event', event, payload); return true; }
    }
    return false;
  };
}


function createServiceOwnerTracker() {
  const documents = new WeakMap(), windows = new WeakMap();
  function signal(record) { for (const callback of [...record.listeners]) callback(); }
  function track(contents) {
    if (!contents || documents.has(contents)) return documents.get(contents);
    const record = { generation: 0, alive: true, listeners: new Set() };
    documents.set(contents, record);
    contents.on?.('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) { record.generation++; record.alive = true; signal(record); } });
    contents.on?.('render-process-gone', () => { record.generation++; record.alive = false; signal(record); });
    contents.on?.('destroyed', () => { record.generation++; record.alive = false; signal(record); });
    return record;
  }
  function windowRecord(W) {
    if (windows.has(W)) return windows.get(W);
    const record = { alive: true, listeners: new Set() };
    windows.set(W, record);
    W.win.on?.('closed', () => { record.alive = false; signal(record); });
    return record;
  }
  function capture(event, W, shell, tabId) {
    if (!W || !event.sender || event.senderFrame !== event.sender.mainFrame) return null;
    if (shell && W.shellView.webContents !== event.sender) return null;
    const sourceTabId = shell ? W.active : tabId, tab = W.tabs.get(sourceTabId);
    if (!tab || tab.tool) return null;
    const sender = event.sender, source = tab.view.webContents, senderFrame = sender.mainFrame, sourceFrame = source.mainFrame;
    if (!shell && source !== sender) return null;
    const frames = [senderFrame, sourceFrame];
    if (frames.some(frame => !frame || !Number.isInteger(frame.processId) || !Number.isInteger(frame.routingId))) return null;
    const senderRecord = track(sender), sourceRecord = track(source), winRecord = windowRecord(W);
    const senderGeneration = senderRecord.generation, sourceGeneration = sourceRecord.generation;
    const senderProcess = senderFrame.processId, senderRouting = senderFrame.routingId, sourceProcess = sourceFrame.processId, sourceRouting = sourceFrame.routingId;
    /* a page is current while it is shown: the open tab, or a card placed beside it (the body under the conversation card reads its services
       the same whichever card has the keyboard, B2-06) */
    const shownNow = () => W.active === sourceTabId || (!!W.detail && W.detail.id === W.active && W.detail.under.includes(sourceTabId) && W.tabs.has(W.detail.id));
    const current = () => winRecord.alive && !W.win.isDestroyed?.() && senderRecord.alive && sourceRecord.alive
      && !sender.isDestroyed?.() && !source.isDestroyed?.() && shownNow()
      && W.tabs.get(sourceTabId)?.view.webContents === source && sender.mainFrame === senderFrame && source.mainFrame === sourceFrame
      && senderRecord.generation === senderGeneration && sourceRecord.generation === sourceGeneration
      && senderFrame.processId === senderProcess && senderFrame.routingId === senderRouting
      && sourceFrame.processId === sourceProcess && sourceFrame.routingId === sourceRouting;
    const subscribe = callback => {
      const records = new Set([senderRecord, sourceRecord, winRecord]);
      let stopped = false;
      const stop = () => { stopped = true; for (const record of records) record.listeners.delete(check); };
      const check = () => { if (!stopped && !current()) { stop(); callback(); } };
      for (const record of records) record.listeners.add(check);
      check();
      return stop;
    };
    return Object.freeze({ kind: shell ? 'shell-relay' : 'page', windowId: W.win.id, senderWebContentsId: sender.id,
      senderFrameProcessId: senderProcess, senderFrameRoutingId: senderRouting, senderDocumentGeneration: senderGeneration,
      sourceTabId, sourceAddress: source.getURL?.(), sourceWebContentsId: source.id, sourceFrameProcessId: sourceProcess, sourceFrameRoutingId: sourceRouting,
      sourceDocumentGeneration: sourceGeneration, isCurrent: current, subscribe, getWindow: () => current() ? W.win : null });
  }
  return { track, capture, activeChanged: W => { const record = windows.get(W); if (record) signal(record); } };
}

function start(cfg, { appRoot, repoRoot }) {
  const serviceOwners = createServiceOwnerTracker();
  const scheme = cfg.scheme;
  protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);
  app.setName(cfg.name);
  const relaunched = relaunchNamed(cfg.name);
  /* --user-data-dir keeps a test or verification run away from the person's own data; without it the app's own folder */
  app.setPath('userData', app.commandLine?.getSwitchValue?.('user-data-dir') || path.join(app.getPath('appData'), cfg.appId));
  const appRel = path.relative(repoRoot, appRoot).split(path.sep).join('/');
  const remoteTerminalConfig = cfg.remoteTerminal ? structuredClone(cfg.remoteTerminal) : null;
  const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
  /* the settings text: kept in memory and written to the file once a burst of saves is over (a tab switch saves the session several times
     in a row); a quit writes what is still pending before the process ends */
  let settingsNow = null, settingsPending = false, settingsTimer = null;
  const settingsText = () => { if (settingsNow === null) { const read = readJsonFile(settingsFile()); if (!read) return null; settingsNow = read.text; } return settingsNow; };
  function saveSettings(values) {
    settingsNow = JSON.stringify(values, null, 1); settingsPending = true;
    clearTimeout(settingsTimer); settingsTimer = setTimeout(flushSettings, 200);
  }
  const flushSettings = () => { clearTimeout(settingsTimer); if (!settingsPending) return; settingsPending = false; try { writeFileAtomic(settingsFile(), settingsNow); } catch { /* the next start reads the last written file */ } };
  let routes = [];
  const windows = new Set();     // W: { win, shellView, tabs: Map(tabId -> { view, tool }), panes: [{ id, rect }], active, radius, shortcuts, menuState, quitAsked }
  const byContents = new Map();  // tab webContents.id -> { W, tabId }
  const prefsFile = () => path.join(app.getPath('userData'), 'desktop.json');
  const prefs = { quitConfirm: cfg.quitConfirm !== false };
  { const read = readJsonFile(prefsFile()); if (read?.value && typeof read.value === 'object' && !Array.isArray(read.value)) Object.assign(prefs, read.value); }
  const savePrefs = () => writeFileAtomic(prefsFile(), JSON.stringify(prefs));
  let localeCode = 'en'; // the locale in use for the menu bar and floating surfaces (set when the app definition is read)
  const appIcon = cfg.icon ? nativeImage.createFromPath(path.join(appRoot, cfg.icon)) : null;
  let quitting = false, quitAsked = null, setMenu = () => {}, focused = null, spellcheck = true;

  const csp = [`default-src ${scheme}: 'self'`, `script-src ${scheme}: 'self'`, `style-src ${scheme}: 'self' 'unsafe-inline'`, `img-src ${scheme}: data: blob:`, `font-src ${scheme}: data:`, `connect-src ${scheme}: ${(cfg.connect || []).join(' ')}`, ...(cfg.csp || [])].join('; ');

  /* repository files are read off the main thread and kept while unchanged (size and modification time): every tab document loads the
     same few hundred modules, and a synchronous read per request held the main process (and with it view placement and IPC) */
  const kept = new Map(); // absolute path -> { mtimeMs, size, data }
  async function readKept(abs) {
    const st = await fs.promises.stat(abs).catch(() => null);
    if (!st || st.isDirectory()) return null;
    const k = kept.get(abs);
    if (k && k.mtimeMs === st.mtimeMs && k.size === st.size) return k.data;
    const data = await fs.promises.readFile(abs);
    kept.set(abs, { mtimeMs: st.mtimeMs, size: st.size, data });
    return data;
  }
  /* the module graph a document starts (its module script and every static import under it, found once per entry file and kept for the
     run): announced as <link rel="modulepreload"> so the whole graph is fetched at once instead of one import depth after another. A module imported
     with a type (JSON) is not a script and is left out: preloaded as one it fails the page's strict MIME check */
  const graphs = new Map(); // entry absolute path -> [repository-relative paths]
  const IMPORT = /(?:^|[\n;])\s*(?:import|export)\s[^'"`;]*?from\s*['"](\.{1,2}\/[^'"]+)['"](?!\s*(?:with|assert)\s*\{)|(?:^|[\n;])\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  async function moduleGraph(entry) {
    if (graphs.has(entry)) return graphs.get(entry);
    const seen = new Set(), queue = [entry];
    while (queue.length) {
      const f = queue.shift();
      if (seen.has(f) || !f.startsWith(path.resolve(repoRoot) + path.sep)) continue;
      const data = await readKept(f); if (!data) continue;
      seen.add(f);
      for (const m of String(data).matchAll(IMPORT)) queue.push(path.resolve(path.dirname(f), m[1] || m[2]));
    }
    const list = [...seen].map(f => path.relative(repoRoot, f).split(path.sep).join('/'));
    graphs.set(entry, list);
    return list;
  }
  async function withPreloads(html, dir) {
    const src = /<script type="module" src="([^"]+)"><\/script>/i.exec(html)?.[1];
    if (!src) return html;
    const list = await moduleGraph(path.resolve(dir, src));
    return html.replace(/<\/head>/i, list.map(p => `<link rel="modulepreload" href="${scheme}://app/${p}">`).join('') + '</head>');
  }
  async function fileResponse(rel, origin) {
    const abs = servedFile(repoRoot, rel);
    if (!abs) return new Response('forbidden', { status: 403 });
    let data = await readKept(abs);
    if (!data) return new Response('not found', { status: 404 });
    if (path.extname(abs) === '.html') data = await withPreloads(String(data), path.dirname(abs));
    const allow = corsOrigin(scheme, origin);
    return new Response(data, { headers: { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream', ...(allow ? { 'access-control-allow-origin': allow } : {}), vary: 'Origin', 'content-security-policy': csp, 'cache-control': 'no-cache' } });
  }
  function routePage(address) {
    const p = address.replace(new RegExp(`^${scheme}://`), '').split('?')[0].replace(/\/+$/, '');
    const segs = p.split('/');
    for (const r of routes) {
      const parts = r.pattern.split('/');
      if (parts.length === segs.length && parts.every((x, i) => x.startsWith(':') || x === segs[i])) return r.page;
    }
    return cfg.notFound || null;
  }
  async function pageResponse(address) {
    const page = routePage(address);
    if (!page) return new Response('not found', { status: 404 });
    const file = path.join(appRoot, 'pages', page + '.html');
    const html = await readKept(file);
    if (!html) return new Response('not found', { status: 404 });
    const base = `<base href="${scheme}://app/${appRel}/pages/">`;
    const body = (await withPreloads(String(html), path.dirname(file))).replace(/<head>/i, `<head>${base}`);
    return new Response(body, { headers: { 'content-type': 'text/html', 'content-security-policy': csp, 'cache-control': 'no-cache' } });
  }

  const send = (W, event, ...args) => W && !W.shellView.webContents.isDestroyed() && W.shellView.webContents.send('kit:' + event, ...args);
  const tabState = (W, tabId, extra = {}) => {
    const t = W.tabs.get(tabId); if (!t) return;
    const wc = t.view.webContents, h = wc.navigationHistory;
    send(W, 'tab-state', tabId, { loading: wc.isLoading(), canBack: h.canGoBack(), canForward: h.canGoForward(), ...(t.tool ? { title: wc.getTitle(), toolDocument: t.toolDocument } : {}), ...extra });
  };
  /* every pane shows its tab (one pane, or two in a split view); other tabs are hidden */
  /* a window shows once its shell has placed its views and the in-app pages it placed have drawn their first document (page:ready says so,
     or the shell's init reached a page that waits for it): before, an empty glass window and then an empty content card showed while the
     shell and the first page loaded. Until then the window is on screen at no opacity (macOS, Windows), so its documents load and paint at
     full pace (a hidden window's documents get no frames and run slowly) */
  const REVEAL_TAB_MS = 1500, REVEAL_WINDOW_MS = 1500, REVEAL_WINDOW_MAX_MS = 5000;
  /* a pane whose new tab has not drawn yet keeps showing the tab it showed before (a new tab, a tab opened from the sidebar, the settings):
     an empty card never shows between them. The waiting tab loads hidden at full pace and takes the pane once it has drawn */
  function layout(W) {
    const shown = new Map(); // tab id -> the rect it is shown at
    W.panes.forEach((p, i) => {
      const t = W.tabs.get(p.id);
      const held = t?.drawn === false && W.shownIn?.[i] !== p.id ? W.tabs.get(W.shownIn?.[i]) : null;
      const holder = held && held.drawn !== false && !held.frozen && !W.panes.some(q => q.id === W.shownIn[i]) ? W.shownIn[i] : null;
      shown.set(holder || p.id, p.rect);
      if (t) t.waiting = !!holder;
    });
    for (const [id, t] of W.tabs) {
      const rect = shown.get(id) || W.panes.find(p => p.id === id)?.rect;
      if (rect && !sameRect(t.rect, rect)) { t.view.setBounds(rect); t.rect = rect; }
      t.view.setVisible(shown.has(id) && !t.frozen && !t.toolDocument);
      if (t.drawn === false) t.view.webContents.setBackgroundThrottling?.(!t.waiting); // a page waiting hidden for its first drawing runs at full pace
    }
    // the tab a pane held stays under the new one a moment after the swap, until the new view's first frame is on screen
    if (W.lingering && Date.now() < W.lingering.until && !shown.has(W.lingering.id)) W.tabs.get(W.lingering.id)?.view.setVisible(true);
    W.shownIn = W.panes.map(p => [...shown.keys()].find(id => shown.get(id) === p.rect));
    revealWindow(W);
  }
  const sameRect = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  function tabDrawn(W, tabId) {
    const t = W.tabs.get(tabId);
    if (!t || t.drawn !== false) return;
    t.drawn = true; clearTimeout(t.drawnTimer);
    t.view.webContents.setBackgroundThrottling?.(true);
    if (!t.waiting) { revealWindow(W); return; }
    const i = W.panes.findIndex(p => p.id === tabId), held = W.shownIn?.[i];
    if (held && held !== tabId) { W.lingering = { id: held, until: Date.now() + 120 }; setTimeout(() => { W.lingering = null; layout(W); }, 130); }
    t.waiting = false;
    layout(W);
  }
  function revealWindow(W) {
    const r = W.reveal;
    if (!r || r.done || !r.placed) return;
    if (W.panes.some(p => W.tabs.get(p.id)?.drawn === false) && Date.now() - r.placed < REVEAL_WINDOW_MS) return;
    r.done = true; clearTimeout(r.timer);
    background.present(W.win);
  }
  function createTab(W, tabId, url, { tool, history }) {
    // a tool from the app definition (by id) or one the shell found at run time ({ id, origin, partition }: an http(s) origin, its own partition)
    const live = tool && typeof tool === 'object' && /^https?:\/\//.test(String(tool.origin)) ? { id: String(tool.id).replace(/[^\w.-]+/g, '-'), origin: String(tool.origin), partition: tool.partition ? `persist:${cfg.appId}-tool-${String(tool.partition).replace(/[^\w.-]+/g, '-')}` : undefined } : null;
    const toolCfg = live || (tool ? (cfg.tools || []).find(x => x.id === tool) : null);
    if (!toolCfg && !String(url).startsWith(scheme + '://')) return; // an outside address only ever loads as a tool (no preload, its own partition)
    const view = new WebContentsView({ webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, spellcheck: !toolCfg,
      partition: toolCfg ? (toolCfg.partition || `persist:${cfg.appId}-${toolCfg.id}`) : `persist:${cfg.appId}`,
      preload: toolCfg ? undefined : path.join(__dirname, 'preload-page.cjs'),
    } });
    if (!toolCfg) view.webContents.session.setSpellCheckerEnabled(spellcheck);
    view.setBackgroundColor('#00000000');
    // every view takes the pane corner (a tool's page too: its card follows the same corner rule as the app's panes, user report 2026-11-16)
    view.setBorderRadius?.(W.radius);
    const wc = view.webContents;
    const tab = { view, tool: toolCfg, toolDocument: toolCfg ? 'loading' : null, startUrl: url, drawn: toolCfg ? undefined : false };
    W.tabs.set(tabId, tab);
    if (!toolCfg) tab.drawnTimer = setTimeout(() => tabDrawn(W, tabId), REVEAL_TAB_MS); // a page that never says it drew (an error page) counts as drawn
    if (toolCfg) lockPermissions(view.webContents.session); // a tool's own partition: the same refusals as the app's session
    if (toolCfg && hooks.toolHeaders) attachToolAuth(view.webContents.session, toolCfg.origin, () => hooks.toolHeaders(toolCfg.id, toolCfg.origin)); // a token for this tool, to its own origin only
    byContents.set(wc.id, { W, tabId });
    serviceOwners.track(wc);
    W.win.contentView.addChildView(view);
    view.setVisible(false);
    for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) wc.on(ev, () => tabState(W, tabId));
    wc.on('page-favicon-updated', async (_e, urls) => {
      if (!toolCfg || !urls?.length) return;
      try { const res = await wc.session.fetch(urls[0]); const tint = tintOf(nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()))); if (tint) send(W, 'tab-state', tabId, { tint }); } catch { /* no favicon: neutral tint */ }
    });
    const toolDocument = state => { tab.toolDocument = state; tabState(W, tabId); layout(W); };
    if (toolCfg) wc.on('did-finish-load', () => { if (tab.toolDocument === 'loading') toolDocument(null); });
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (!isMain || code === -3) return;
      if (tab.toolDocument === 'loading') toolDocument('error');
      tabDrawn(W, tabId);
      send(W, 'tab-message', tabId, { v: 1, type: 'page:error', payload: { message: `${desc} (${code})` } });
    });
    wc.on('render-process-gone', (_e, d) => {
      if (toolCfg) toolDocument('error');
      tabDrawn(W, tabId);
      send(W, 'tab-message', tabId, { v: 1, type: 'page:error', payload: { message: `renderer ${d.reason}` } });
    });
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const k = shortcutOf(input);
      if (!W.recording && W.shortcuts.includes(k)) { e.preventDefault(); send(W, 'shortcut', k); }
    });
    wc.on('focus', () => send(W, 'tab-focus', tabId));
    /* a tool page opens an outside link only right after a person clicked or typed in it (a script alone opens nothing) */
    let actedAt = -Infinity;
    if (toolCfg) wc.on('input-event', (_e, input) => { if (['mouseDown', 'keyDown', 'rawKeyDown', 'touchStart'].includes(input?.type)) actedAt = Date.now(); });
    wc.setWindowOpenHandler(({ url: u }) => {
      if (/^https?:/.test(u) && (!toolCfg || Date.now() - actedAt <= USER_ACTIVATION_MS)) { actedAt = -Infinity; osShell.openExternal(u); }
      return { action: 'deny' };
    });
    const allowedHere = u => (u.startsWith(scheme + '://') ? !toolCfg
      : !!toolCfg && (matchesToolUrl(u, toolCfg.origin) || (toolCfg.allowNavigate || []).some(o => matchesToolUrl(u, o))));
    wc.on('will-navigate', (e, u) => {
      if (allowedHere(u)) return;
      e.preventDefault(); if (/^https?:/.test(u)) osShell.openExternal(u);
    });
    /* a server redirect of the main document passes the same check as a navigation; it is the server's choice, so it never opens outside */
    wc.on('will-redirect', (e, u, _inPlace, isMainFrame) => { if ((e.isMainFrame ?? isMainFrame) !== false && !allowedHere(e.url ?? u)) e.preventDefault(); });
    /* a reopened app tab comes back with its history (B2-05): back and forward step through the pages it had, the current one loads */
    const entries = !toolCfg && Array.isArray(history?.entries) && history.entries.length <= 50 && history.entries.every(u => typeof u === 'string' && u.startsWith(scheme + '://')) ? history.entries : null;
    const index = entries && Number.isInteger(history.index) && history.index >= 0 && history.index < entries.length && entries[history.index] === url ? history.index : -1;
    if (entries && index >= 0 && entries.length > 1 && wc.navigationHistory?.restore) wc.navigationHistory.restore({ index, entries: entries.map(u => ({ url: u, title: '' })) }).catch(() => wc.loadURL(url).catch(() => {}));
    else wc.loadURL(url).catch(() => {});
  }
  function closeTab(W, tabId) {
    const t = W.tabs.get(tabId); if (!t) return;
    clearTimeout(t.drawnTimer);
    forgetContents(t.view.webContents);
    if (W.detail && (W.detail.id === tabId || W.detail.under.includes(tabId))) W.detail = null;
    W.win.contentView.removeChildView(t.view);
    t.view.webContents.close();
    W.tabs.delete(tabId);
  }
  /* a closed page still unloads after its tab is gone (its hide handler releases its watches): it stays known, as closing, until its
     contents are destroyed, so those calls get an answer instead of a refusal. What it held is released by the service owner (destroyed) */
  function forgetContents(wc) {
    const at = byContents.get(wc.id);
    if (!at) return;
    at.closing = true;
    if (wc.isDestroyed?.()) byContents.delete(wc.id);
    else wc.once('destroyed', () => { if (byContents.get(wc.id) === at) byContents.delete(wc.id); });
  }
  const shellOf = e => [...windows].find(W => e.sender === W.shellView.webContents) || null;

  function handle(channel, fn) { ipcMain.handle('kit:' + channel, (e, ...a) => { const W = shellOf(e); if (!W || (channel.startsWith('pty:') && e.senderFrame !== e.sender.mainFrame)) throw new Error('sender not allowed'); return fn(W, ...a); }); }
  handle('tabs:create', (W, id, url, o = {}) => createTab(W, id, url, o));
  handle('tabs:navigate', (W, id, url, o = {}) => {
    const t = W.tabs.get(id); if (!t || typeof url !== 'string') return;
    /* an app tab only ever loads app addresses; a tool tab stays inside its own tool (as its will-navigate does) */
    if (t.tool ? !(matchesToolUrl(url, t.tool.origin) || (t.tool.allowNavigate || []).some(o => matchesToolUrl(url, o))) : !url.startsWith(scheme + '://')) return;
    const h = t.view.webContents.navigationHistory;
    const before = h.getActiveIndex();
    t.view.webContents.loadURL(url).then(() => { if (o.replace && h.removeEntryAtIndex && before >= 0) h.removeEntryAtIndex(before); tabState(W, id); }).catch(() => {});
  });
  handle('tabs:back', (W, id) => W.tabs.get(id)?.view.webContents.navigationHistory.goBack());
  handle('tabs:forward', (W, id) => W.tabs.get(id)?.view.webContents.navigationHistory.goForward());
  handle('tabs:reload', (W, id) => {
    const tab = W.tabs.get(id);
    if (!tab) return;
    const wc = tab.view.webContents;
    if (tab.toolDocument !== 'error') return wc.reload();
    tab.toolDocument = 'loading';
    tabState(W, id);
    wc.loadURL(tab.startUrl).catch(() => {});
  });
  handle('tabs:show', (W, id, o = {}) => {
    const prev = W.tabs.get(W.active);
    if (prev && W.active !== id) prev.view.webContents.capturePage().then(img => { prev.thumb = thumbOf(img); }).catch(() => {});
    const activeChanged = W.active !== id;
    W.active = id;
    // a detail overlay presented over a list: the list may be frozen with it; any other show clears the marker
    const under = (Array.isArray(o?.under) ? o.under : typeof o?.under === 'string' ? [o.under] : []).filter(u => u !== id && W.tabs.has(u));
    W.detail = under.length ? { id, under } : null;
    if (activeChanged) serviceOwners.activeChanged(W);
    const t = W.tabs.get(id), content = W.win.contentView;
    // A freshly created tool is already on top. Detaching it during its first paint can lose its surface.
    if (t && content.children?.at(-1) !== t.view) {
      content.removeChildView(t.view);
      content.addChildView(t.view);
    }
    layout(W);
  });
  handle('tabs:close', (W, id) => closeTab(W, id));
  // the keyboard goes to a page view (the list under a closed detail overlay gets it back)
  handle('tabs:focus', (W, id) => { const t = W.tabs.get(id); if (t && !t.tool && !t.view.webContents.isDestroyed()) t.view.webContents.focus(); });
  handle('tabs:send', (W, id, env) => {
    const t = W.tabs.get(id); if (!t || t.tool) return;
    t.view.webContents.send('kit:shell', env);
    if (env?.type === 'shell:init' && t.drawn === false) setTimeout(() => tabDrawn(W, id), 16); // a page that waited for the shell draws as the init arrives
  });
  handle('tabs:broadcast', (W, env) => { for (const X of windows) for (const t of X.tabs.values()) if (!t.tool) t.view.webContents.send('kit:shell', env); });
  // the shell reports where each visible tab sits (one pane, or two in a split view) and the corner radius
  handle('tabs:layout', (W, panes, rad) => {
    if (W.reveal && !W.reveal.placed) { W.reveal.placed = Date.now(); W.reveal.timer = setTimeout(() => revealWindow(W), REVEAL_WINDOW_MS + 10); }
    W.panes = Array.isArray(panes) ? panes : [];
    if (rad !== W.radius) {
      W.radius = rad;
      for (const t of W.tabs.values()) t.view.setBorderRadius?.(W.radius);
    }
    layout(W);
  });
  // an overlay (menu, palette) over the tab view takes the keyboard from the page, so Escape and the arrow keys reach it; a preview card does not
  /* an overlay over the tab view: the view is hidden whatever happens; its picture stands in when it can be taken in time (a window
     brought forward from behind, as for the quit question, may not give one: then the content card shows empty under the overlay) */
  handle('tabs:freeze', async (W, id, focus = true) => {
    const t = W.tabs.get(id); if (!t) return null;
    t.freezeRequest?.dispose();
    const wc = t.view.webContents;
    const request = t.freezeRequest = rememberPageFocus(W, wc, !focus);
    if (W.nativeMenus?.size) await waitForNativeMenus(W);
    // the open tab, or a view the shell has placed in a pane (a detail overlay and the list under it)
    // the open tab, or the list under the detail overlay the shell presented (W.detail is set only by the shell's tabs:show, and only counts while that overlay is still active)
    const shown = () => W.active === id || (!!W.detail && W.detail.id === W.active && W.detail.under.includes(id) && W.tabs.has(W.detail.id));
    if (t.freezeRequest !== request || W.win.isDestroyed() || W.tabs.get(id) !== t || wc.isDestroyed() || !shown()) {
      request.dispose(); if (t.freezeRequest === request) t.freezeRequest = null; return null;
    }
    const img = await Promise.race([wc.capturePage(), new Promise(r => setTimeout(() => r(null), 400))]).catch(() => null);
    if (W.nativeMenus?.size) await waitForNativeMenus(W);
    if (t.freezeRequest !== request) return null;
    if (W.win.isDestroyed() || W.tabs.get(id) !== t || wc.isDestroyed() || !shown()) {
      request.dispose(); t.freezeRequest = null; return null;
    }
    request.shouldRestore &&= wc.isFocused();
    t.frozen = true; layout(W); if (focus) W.shellView.webContents.focus();
    if (DIAG) diagLog({ freeze: id, picture: !!img && !img.isEmpty(), visible: t.view.getVisible?.() });
    if (!img || img.isEmpty()) return '';
    t.thumb = thumbOf(img); return img.toDataURL();
  });
  function rememberPageFocus(W, wc, passive) {
    const request = { shouldRestore: passive && W.win.isFocused() && !W.win.isMinimized() && wc.isFocused(), dispose: () => {} };
    if (!request.shouldRestore) return request;
    const listeners = [];
    const listen = (target, event) => { target.on(event, cancel); listeners.push([target, event]); };
    function cancel() { request.shouldRestore = false; request.dispose(); }
    request.dispose = () => { for (const [target, event] of listeners.splice(0)) target.removeListener(event, cancel); };
    for (const event of ['blur', 'minimize', 'closed']) listen(W.win, event);
    listen(wc, 'destroyed');
    listen(W.shellView.webContents, 'focus');
    for (const tab of W.tabs.values()) if (tab.view.webContents !== wc) listen(tab.view.webContents, 'focus');
    return request;
  }
  // tab preview card: the page picture (taken now for the open tab, else when it was last left) and the memory of its renderer process
  handle('tabs:preview', async (W, id) => {
    const t = W.tabs.get(id); if (!t) return null;
    if (W.panes.some(p => p.id === id) && !t.frozen) t.thumb = thumbOf(await t.view.webContents.capturePage());
    const pid = t.view.webContents.getOSProcessId(), m = app.getAppMetrics().find(x => x.pid === pid);
    return { image: t.thumb || null, memory: m?.memory?.workingSetSize || null };
  });
  // Chromium keeps a page's zoom level per host in the profile (Preferences), so a level saved by an earlier run would override the zoom setting.
  // An initial request (the shell's page:ready) therefore sets the level once per internal host in this process (all windows share it);
  // after that the keyboard level stays for the session. Tool pages (their own origin and session) are never initialized.
  const zoomInitialized = new Set();
  handle('tabs:zoom', (W, id, factor, o) => {
    const t = W.tabs.get(id), wc = t?.view.webContents; if (!wc || wc.isDestroyed()) return 1;
    if (o?.initial) {
      let host = ''; try { host = new URL(wc.getURL()).host; } catch { /* no address yet */ }
      if (t.tool || !host || zoomInitialized.has(host)) factor = null; else zoomInitialized.add(host);
    }
    if (typeof factor === 'number' && factor > 0) wc.setZoomFactor(factor);
    const f = wc.getZoomFactor(); if (W.menuState.zoom !== f) { W.menuState.zoom = f; setMenu(); } return f;
  });
  handle('tabs:mute', (W, id, on) => { W.tabs.get(id)?.view.webContents.setAudioMuted(!!on); });
  handle('tabs:thaw', async (W, id) => {
    const t = W.tabs.get(id); if (!t) return;
    const request = t.freezeRequest; t.freezeRequest = null;
    request?.dispose();
    if (W.nativeMenus?.size) await waitForNativeMenus(W);
    if (W.win.isDestroyed() || W.tabs.get(id) !== t || t.freezeRequest) return;
    const wasFrozen = t.frozen;
    t.frozen = false; layout(W);
    if (DIAG) diagLog({ thaw: id });
    if (!wasFrozen || !request?.shouldRestore || W.active !== id) return;
    if (W.win.isDestroyed() || !W.win.isFocused() || W.win.isMinimized()) return;
    const wc = t.view.webContents;
    const anotherFocused = [W.shellView.webContents, ...[...W.tabs.values()].map(tab => tab.view.webContents)]
      .some(other => other !== wc && !other.isDestroyed() && other.isFocused());
    if (!wc.isDestroyed() && t.view.getVisible() && !anotherFocused) wc.focus();
  });
  handle('menu:state', (W, st) => { Object.assign(W.menuState, st); setMenu(); });
  handle('window:new', (W, o = {}) => { createWindow({ open: o.open || null, from: W }); });
  handle('app:quit', () => { quitting = true; app.quit(); });
  handle('app:quit-cancel', () => { quitAsked = null; });
  // a menu item icon arrives as a PNG drawn by the shell at its screen scale; as a template image the OS colors it like the item text
  const imageOf = ic => {
    if (!ic?.png) return undefined;
    const img = nativeImage.createFromBuffer(Buffer.from(ic.png.split(',')[1], 'base64'), { scaleFactor: ic.scale || 1 });
    img.setTemplateImage(true);
    return img;
  };
  async function waitForNativeMenus(W) {
    while (W.nativeMenus?.size) await Promise.all([...W.nativeMenus]);
  }
  handle('menu:popup', (W, items, pos) => new Promise((resolve, reject) => {
    let chosen = null, finish;
    const pending = new Promise(done => { finish = done; });
    (W.nativeMenus ||= new Set()).add(pending);
    for (const tab of W.tabs.values()) if (tab.freezeRequest) tab.freezeRequest.shouldRestore = false;
    const release = () => { W.nativeMenus.delete(pending); W.win.removeListener('closed', closed); finish(); };
    const closed = () => { release(); resolve(null); };
    W.win.on('closed', closed);
    const tplOf = list => list.map(i => i.type === 'separator' ? { type: 'separator' } : i.type === 'header' ? { type: 'header', label: i.label }
      : i.submenu ? { label: i.label, enabled: i.enabled !== false, icon: imageOf(i.icon), submenu: tplOf(i.submenu) }
      : { label: i.label, enabled: i.enabled !== false, icon: imageOf(i.icon), type: i.checked != null ? 'checkbox' : 'normal', checked: !!i.checked, click: () => { chosen = i.id; } });
    try {
      loadNative()?.useAppAppearance(); // the menu is built in the app theme, not the system one (native/window.m)
      Menu.buildFromTemplate(tplOf(items)).popup({ window: W.win, x: Math.round(pos?.x ?? 0), y: Math.round(pos?.y ?? 0), callback: () => setImmediate(() => { release(); resolve(chosen); }) });
    } catch (error) { release(); reject(error); }
  }));
  handle('settings:save', (W, values) => saveSettings(values));
  // keyboard focus back to the shell document (a tab view may hold it), for a box the shell starts editing on its own
  handle('shell:focus', W => W.shellView.webContents.focus());
  // spell check in the app's pages (setting kit.spellcheck): the app session's checker, on for the shell's text fields too
  handle('spellcheck:set', (W, on) => { spellcheck = !!on; session.fromPartition(`persist:${cfg.appId}`).setSpellCheckerEnabled(spellcheck); });
  /* a confirmation the main process shows itself (an OS dialog, never a page): no document can answer, skip or word it. message, detail and
     action are dictionary keys (kit and app locale, filled with vars), text is shown as given below the detail (a command line). Cancel is
     the first button and the default (Return, Escape and the focused key all cancel: a keystroke meant for another app never allows), so
     true only when the person presses the action itself. The app's services get it as create({ confirm }) for their own human gates.
     A var may itself be words ({ $t, vars }) or a list of them (one per line).
     A review run of a development build (KIT_BACKGROUND=1 with KIT_CONFIRM_LOG=<file>) never puts the dialog in front of the person: it appends
     what the dialog would show to that file and answers what <file>.answer says (run: the action; anything else or no file: cancel) */
  let translate = (key, vars) => String(key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '');
  const words = v => (Array.isArray(v) ? v.map(words).join('\n') : v && typeof v === 'object' && typeof v.$t === 'string'
    ? translate(v.$t, Object.fromEntries(Object.entries(v.vars ?? {}).map(([k, x]) => [k, words(x)]))) : v);
  async function confirmNative({ message, action, detail, vars: given, text } = {}, W = focused || [...windows][0]) {
    const vars = Object.fromEntries(Object.entries(given ?? {}).map(([k, v]) => [k, words(v)]));
    const shown = [detail ? translate(String(detail), vars) : '', typeof text === 'string' ? text : ''].filter(Boolean).join('\n\n');
    const options = { type: 'warning', message: translate(String(message ?? ''), vars), detail: shown,
      buttons: [translate('confirm.cancel'), translate(String(action ?? ''), vars)], defaultId: 0, cancelId: 0, noLink: true };
    const log = process.env.KIT_CONFIRM_LOG;
    if (log && !app.isPackaged && background.on()) {
      fs.appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), message: options.message, detail: options.detail, buttons: options.buttons }) + '\n', { mode: 0o600 });
      let answer = '';
      try { answer = fs.readFileSync(log + '.answer', 'utf8').trim(); } catch { /* no answer file: cancel */ }
      return answer === 'run';
    }
    const parent = W?.win && !W.win.isDestroyed?.() && !background.on() ? W.win : null;
    const { response } = await (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options));
    return response === 1;
  }
  // terminal sessions (bottom panel): the shell's own shell process per session, output and command records go back to that window
  let term = null;
  const termOf = () => (term ||= terminals.create({ userData: app.getPath('userData'), remoteConfig: remoteTerminalConfig,
    terminalProgram: (ticket, W, cols, rows) => hooks.terminalProgram?.(ticket, W, cols, rows),
    send: (W, ev, ...a) => windows.has(W) && send(W, ev, ...a) }));
  handle('pty:open', async (W, o) => await termOf().open(o || {}, W));
  /* the shell names a command the app declared (cfg.commands) and its arguments; a command line written by a document never runs. A confirm
     command (it changes something outside this computer) starts only after the person presses run in the main process's own dialog, which
     shows the exact line and environment as they will run; cancel ends it as TERMINAL_COMMAND_CANCELLED and nothing runs */
  handle('pty:run', (W, o) => {
    const built = buildCommand(cfg.commands, o, hooks.commandGuard);
    if (!built) return { error: 'command not allowed', code: 'TERMINAL_COMMAND_REJECTED' };
    if (built.refused) return { error: 'command refused', code: built.refused };
    const run = () => {
      const r = termOf().run({ id: o.id, mode: o.mode, cols: o.cols, rows: o.rows, cwd: o.cwd, command: built.command, env: built.env, onExit: built.cleanup }, W);
      if (r?.error) built.cleanup?.();
      return r;
    };
    if (!built.confirm) return run();
    const text = [built.detail ? words(built.detail) : '', built.command, envLines(built.env)].filter(Boolean).join('\n\n');
    return confirmNative({ message: 'terminal.confirm.message', action: 'terminal.confirm.run', text }, W)
      .then(yes => { if (yes) return run(); built.cleanup?.(); return { error: 'command cancelled', code: 'TERMINAL_COMMAND_CANCELLED' }; });
  });
  handle('pty:write', (W, id, data) => termOf().write(id, data, W));
  handle('pty:resize', (W, id, cols, rows) => termOf().resize(id, cols, rows, W));
  handle('pty:close', (W, id) => termOf().close(id, W));
  // open at login (setting kit.openAtLogin): a packaged app only, so a development run never adds the runtime to the login items
  handle('login:set', (W, on) => { if (app.isPackaged && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: !!on }); return app.isPackaged; });
  handle('shortcuts:set', (W, list) => { W.shortcuts = Array.isArray(list) ? list : []; });
  // while a settings page records a new shortcut its keys go to the page, not to the app (menu key equivalents included)
  handle('shortcuts:suspend', (W, on) => { W.recording = !!on; W.menuState.recording = !!on; setMenu(); });
  /* Window style: the look of the window background follows the app theme and the chosen style (kit.windowStyle) */
  const translucent = cfg.window?.translucent !== false;
  const styles = cfg.window?.styles || {};
  let windowStyle = null; // set from the saved setting when the app is ready
  const themeName = () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  const perTheme = v => (v && typeof v === 'object' && !Array.isArray(v) && ('dark' in v || 'light' in v) ? v[themeName()] : v);
  const look = (over = {}) => { const st = styles[windowStyle] || {}; return Object.fromEntries(['glass', 'material', 'tint', 'background'].map(k => [k, k in over ? over[k] : perTheme(st[k])])); };
  // a CSS color 'rgb(r g b / a)' becomes [r, g, b, a] from 0 to 1, anything else none
  const rgbaOf = css => { const n = (String(css || '').match(/[\d.]+/g) || []).map(Number); return n.length >= 3 ? [n[0] / 255, n[1] / 255, n[2] / 255, n[3] ?? 1] : null; };
  // the opaque window color in the form Electron reads (an 8 digit hex is #AARRGGBB there, so rgba() instead); none: transparent
  const windowColorOf = css => { const c = rgbaOf(css); return c ? `rgba(${c.slice(0, 3).map(x => Math.round(x * 255)).join(',')},${c[3]})` : '#00000000'; };
  // the color layer again (macOS rebuilds the glass and material layers, and a rebuilt layer can cover it); none in the style: removed
  const repaint = W => {
    const native = loadNative(); if (!native || W.win.isDestroyed()) return;
    const h = W.win.getNativeWindowHandle(), on = W.tint ? native.setTint(h, ...W.tint) : native.setTint(h);
    if (DIAG) diagLog({ repaint: W.tint, on });
  };
  const repaintSoon = W => { repaint(W); setTimeout(() => repaint(W), 120); };
  /* what this system can draw behind a window (platform adapter): without translucency a style with glass or material falls back to the
     first opaque style, and the settings page shows the translucent choices as unavailable with the reason */
  const caps = platform.capabilities();
  const needsGlass = name => { const st = styles[name] || {}; return !!(st.glass || st.material || st.tint); };
  const usable = name => !!styles[name] && (caps.translucent || !needsGlass(name));
  const fallbackStyle = () => Object.keys(styles).find(usable) || null;
  function applyLook(W, over) {
    if (!translucent) return;
    const L = look(over);
    if (process.platform === 'win32') { W.win.setBackgroundMaterial(caps.translucent && needsGlass(windowStyle) ? (styles[windowStyle].windows?.material || caps.material) : 'none'); W.win.setBackgroundColor(windowColorOf(L.background)); return; }
    if (process.platform !== 'darwin') { W.win.setBackgroundColor(windowColorOf(L.background)); return; }
    const native = loadNative(), h = W.win.getNativeWindowHandle();
    const glass = !!(L.glass && native && native.setGlass(h, JSON.stringify({ ...L.glass, tint: rgbaOf(L.glass.tint) })));
    if (!glass && native) native.setGlass(h);
    W.win.setVibrancy(glass ? null : L.material || null);
    W.win.setBackgroundColor(windowColorOf(L.background));
    W.tint = rgbaOf(L.tint);
    repaintSoon(W);
    if (DIAG) diagLog({ look: L, style: windowStyle, theme: themeName(), glass });
  }
  /* the desktop picture for window style pictures: read through the platform adapter, made small (a JPEG data URL) and sent again when it
     changed (checked when a window gains focus and when the theme changes); none: the kit draws its own artwork */
  const sys = { exec: (f, a) => new Promise((res, rej) => execFile(f, a, { timeout: 3000 }, (e, out) => (e ? rej(e) : res(out)))),
    exists: p => fs.promises.access(p).then(() => true, () => false), readFile: p => fs.promises.readFile(p, 'utf8'), env: process.env, home: os.homedir() };
  let desktopInfo = null, wallpaperKey = null;
  async function readDesktop() {
    const file = await platform.wallpaper({ ...sys, dark: nativeTheme.shouldUseDarkColors, native: process.platform === 'darwin' ? loadNative() : null }).catch(() => null);
    let stamp = ''; try { stamp = file ? String(fs.statSync(file).mtimeMs) : ''; } catch { /* gone */ }
    const key = `${file}|${stamp}`;
    if (desktopInfo && key === wallpaperKey) return desktopInfo;
    wallpaperKey = key;
    let url = null;
    if (file) {
      let img = null;
      try { img = await nativeImage.createThumbnailFromPath(file, { width: 640, height: 400 }); } catch { /* no system thumbnailer (Linux) */ }
      if (!img || img.isEmpty()) img = nativeImage.createFromPath(file);
      if (img && !img.isEmpty()) url = 'data:image/jpeg;base64,' + (img.getSize().width > 640 ? img.resize({ width: 640, quality: 'good' }) : img).toJPEG(82).toString('base64');
    }
    desktopInfo = { capabilities: caps, wallpaper: url, dev: !app.isPackaged, user: os.userInfo().username }; // dev: a development run (not a packaged app); user: the signed-in system user
    return desktopInfo;
  }
  const refreshDesktop = () => { const before = desktopInfo?.wallpaper; readDesktop().then(info => { if (info.wallpaper !== before) for (const W of windows) send(W, 'desktop', info); }); };
  handle('desktop:info', () => readDesktop());
  /* dictation: the system dictation starts in the focused text field (macOS; elsewhere there is none) */
  handle('dictation:start', () => { if (process.platform !== 'darwin') return false; Menu.sendActionToFirstResponder('startDictation:'); return true; });
  handle('theme:set', (W, mode) => { nativeTheme.themeSource = ['system', 'light', 'dark'].includes(mode) ? mode : 'system'; return themeName(); });
  handle('window:style', (W, name) => { if (usable(name) && name !== windowStyle) { windowStyle = name; for (const X of windows) applyLook(X); } return windowStyle; });
  /* kit file service: a text the person asked to save (a code block, an export), through the save dialog */
  async function saveFile({ name, text }) {
    const { dialog, BrowserWindow } = require('electron');
    const r = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), { defaultPath: path.join(app.getPath('downloads'), path.basename(String(name || 'file.txt'))) });
    if (r.canceled || !r.filePath) return { cancelled: true };
    try { fs.writeFileSync(r.filePath, String(text ?? '')); return { saved: true }; } catch (e) { return { error: String(e.message || e).slice(0, 300) }; }
  }
  /* app services (cfg.services): called from the shell document and in-app tab pages only */
  let services = null;
  /* a read the app lists in cfg.coalesce (answers only from its arguments) asked again while the same one is running shares that call: the
     shell and a page opening at the same time read the same list once */
  const coalesceGate = require('../core/live.js').createRequestGate({ limit: Infinity });
  const coalesced = (name, f) => (args, ...rest) => coalesceGate.run(JSON.stringify([name, args ?? null]), name, () => f(args, ...rest));
  const updater = createUpdater({ config: cfg.update, currentVersion: app.getVersion(), isPackaged: app.isPackaged, cacheRoot: path.join(app.getPath('cache'), cfg.appId, 'updates') });
  const appearanceBroker = createTerminalAppearanceBroker({ dialog, home: os.userInfo().homedir });
  const hooks = {}; // main-process hooks the services module fills (never callable from a page): toolHeaders(toolId) -> headers | null
  const emitService = (event, payload) => { for (const X of windows) { send(X, 'service-event', event, payload); for (const t of X.tabs.values()) if (!t.tool && !t.view.webContents.isDestroyed()) t.view.webContents.send('kit:service-event', event, payload); } };
  ipcMain.handle('kit:service:call', async (e, name, args) => {
    const at = byContents.get(e.sender.id), owner = shellOf(e), fromShell = !!owner;
    if (!fromShell && (!at || at.W.tabs.get(at.tabId)?.tool)) throw new Error('sender not allowed');
    if (!fromShell && at.closing) return { error: 'closed' }; // a closed tab's document finishing its unload: nothing runs for it
    if (typeof name === 'string' && name.startsWith('kit.update.')) {
      if (!fromShell || e.senderFrame !== e.sender.mainFrame) throw new Error('sender not allowed');
      if (!UPDATE_METHODS.includes(name)) throw new Error('unknown update service');
      if (args != null && (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length)) throw new Error('update arguments not allowed');
      return updater.methods[name]();
    }
    if (typeof name === 'string' && name.startsWith('kit.terminal.appearance.')) {
      if (!fromShell || e.senderFrame !== e.sender.mainFrame) throw new Error('sender not allowed');
      return appearanceBroker.call(owner, name, args);
    }
    if (name === 'kit.file.save') return saveFile(args);
    if (!services) throw new Error('no services');
    const f = Object.hasOwn(services, name) ? services[name] : null;
    if (typeof f !== 'function') throw new Error(`unknown service: ${name}`);
    const trustedOwnerContext = serviceOwners.capture(e, owner || at?.W, fromShell, at?.tabId);
    return f(args, { shell: fromShell, mainFrame: e.senderFrame === e.sender.mainFrame }, trustedOwnerContext);
  });
  ipcMain.on('kit:settings:load', e => { e.returnValue = shellOf(e) ? settingsText() : null; });
  /* what an in-app page needs for its first drawing, answered at once so it draws without waiting for the shell's init (D3): the app id,
     its tab id, the theme in use, the language and the stored settings. The shell's init still follows and is the page's authority */
  ipcMain.on('kit:page:boot', e => {
    const at = byContents.get(e.sender.id), t = at && at.W.tabs.get(at.tabId);
    if (!t || t.tool || e.senderFrame !== e.sender.mainFrame) { e.returnValue = null; return; }
    let stored = {};
    try { stored = JSON.parse(settingsText() || '{}'); } catch { /* unreadable settings: defaults */ }
    e.returnValue = { appId: cfg.appId, tabId: at.tabId, theme: themeName(), locale: localeCode, settings: stored };
  });
  ipcMain.on('kit:page', (e, env) => {
    const at = byContents.get(e.sender.id);
    const t = at && at.W.tabs.get(at.tabId);
    if (!t || t.tool || e.senderFrame !== e.sender.mainFrame) return;
    if (env?.type === 'page:ready' && env.payload?.drawn) tabDrawn(at.W, at.tabId);
    send(at.W, 'tab-message', at.tabId, env);
  });

  /* Debug-only aids (diagnostic log, calibration backdrop, debug menu items) live in debug.cjs, loaded only by a development run
     (unpackaged; KIT_DEBUG=0 previews the release without them). A release never loads it (kit/tools/check-release.mjs) */
  const debug = app.isPackaged || process.env.KIT_DEBUG === '0' ? null : require('./debug.cjs').createDebug({ windows, applyLook, loadNative });
  const DIAG = !!debug?.diag;
  const diagLog = o => debug?.log(o);

  /* Floating surfaces: a menu the OS menu cannot draw (color swatches, an icon grid) opens as its own borderless window over the macOS menu
     material, as the reference draws it, instead of a web menu inside the window. One window per menu level (a side submenu is another
     surface next to its row). The surface document (surface.html) renders the menu with the kit menu component and reports its size; the
     window is shaped to the menu corner by the native helper. A choice goes to the shell (surface-choice); the chain closes on a choice that
     closes the menu, Escape, or when the keyboard focus leaves every surface of the chain. */
  const SURFACE_EVENTS = new Set(['ready', 'size', 'choose', 'sub', 'close-sub', 'close']);
  const surfaces = new Map(); // webContents id -> { win, W, chain, level, def, pos }
  function closeChain(chain, from = 0) {
    for (const S of chain.list.splice(from)) { surfaces.delete(S.id); if (!S.win.isDestroyed()) S.win.destroy(); }
    if (!chain.list.length) send(chain.W, 'surface-closed');
  }
  function openSurface(W, chain, def, screenPos, level) {
    closeChain(chain, level);
    const dark = nativeTheme.shouldUseDarkColors, area = screen.getDisplayNearestPoint(screenPos).workArea;
    // laid out hidden at the screen size first (the menu takes its natural size), then sized to the menu
    const win = new BrowserWindow({
      parent: W.win, show: false, frame: false, transparent: true, hasShadow: true, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, acceptFirstMouse: true, width: area.width, height: area.height, x: area.x, y: area.y,
      vibrancy: cfg.window?.surfaceMaterial?.[dark ? 'dark' : 'light'] || 'menu', visualEffectState: 'active', backgroundColor: '#00000000',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload-surface.cjs'), partition: `persist:${cfg.appId}` },
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    const S = { id: win.webContents.id, win, W, chain, level, def, pos: screenPos, theme: dark ? 'dark' : 'light' };
    surfaces.set(S.id, S); chain.list[level] = S;
    win.on('blur', () => setTimeout(() => {
      if (!chain.list.length) return;
      const f = BrowserWindow.getFocusedWindow();
      if (!chain.list.some(x => x.win === f)) closeChain(chain);
    }, 0));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.on('console-message', e => diagLog({ surface: e.message }));
    win.webContents.on('did-fail-load', (_e, code, desc) => diagLog({ surfaceLoad: code, desc }));
    win.loadURL(`${scheme}://app/kit/desktop/surface.html?app=${encodeURIComponent(appRel)}&locale=${encodeURIComponent(localeCode)}`);
    return S;
  }
  ipcMain.on('kit:surface', (e, event, p = {}) => {
    const S = surfaces.get(e.sender.id);
    diagLog({ surfaceEvent: event, known: !!S });
    if (!S || !SURFACE_EVENTS.has(event)) return;
    const { chain, W } = S;
    if (event === 'ready') e.sender.send('kit:surface-def', { def: S.def, theme: S.theme, level: S.level });
    if (event === 'size') {
      const area = screen.getDisplayNearestPoint(S.pos).workArea, w = Math.ceil(p.width), h = Math.ceil(p.height);
      let { x, y } = S.pos;
      if (x + w > area.x + area.width) x = S.level ? S.pos.flipX - w : area.x + area.width - w;
      if (y + h > area.y + area.height) y = Math.max(area.y, area.y + area.height - h);
      S.win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
      if (!S.win.isVisible()) {
        const native = loadNative(); if (native && p.radius) native.setSurfaceShape(S.win.getNativeWindowHandle(), p.radius);
        if (S.level) S.win.showInactive(); else background.present(S.win, { focus: true });
      }
      diagLog({ surfaceBounds: S.win.getBounds(), visible: S.win.isVisible(), size: p });
    }
    if (event === 'choose') { send(W, 'surface-choice', { action: p.action, arg: p.arg }); if (!p.keep) closeChain(chain); }
    if (event === 'sub') {
      const b = S.win.getBounds();
      openSurface(W, chain, p.def, { x: b.x + p.rect.right, y: b.y + p.rect.top, flipX: b.x + p.rect.left }, S.level + 1);
    }
    if (event === 'close-sub') closeChain(chain, S.level + 1);
    if (event === 'close') { closeChain(chain); W.shellView.webContents.focus(); }
  });
  handle('surface:open', (W, def, pos) => {
    diagLog({ surfaceOpen: pos, items: def?.items?.length });
    W.surfaceChain && closeChain(W.surfaceChain);
    const chain = W.surfaceChain = { W, list: [] };
    const c = W.win.getContentBounds();
    openSurface(W, chain, def, { x: c.x + pos.x, y: c.y + pos.y }, 0);
  });

  /* Window corner: the desktop config's window.cornerRadius (measured on the reference) through the native helper; without it the system shape */
  function shapeWindow(win) {
    const native = loadNative(), h = native && win.getNativeWindowHandle();
    const before = DIAG ? debug.nativeInfo(h) : null;
    if (native && cfg.window?.cornerRadius) native.setCornerRadius(h, cfg.window.cornerRadius);
    if (DIAG) diagLog({ native: !!native, error: loadNative.error, before, after: debug.nativeInfo(h) });
  }

  /* A window: its shell document (query: window index, and the address to open first) and its own tabs */
  let windowSeq = 0;
  function createWindow({ open = null, from = null } = {}) {
    const n = windowSeq++;
    let at = from ? from.win.getBounds() : null;
    if (at) {
      const area = screen.getDisplayMatching(at).workArea, next = { ...at, x: at.x + 10, y: at.y + 10 };
      at = next.x + next.width <= area.x + area.width && next.y + next.height <= area.y + area.height ? next : { ...at, x: area.x, y: area.y };
    }
    const win = new BaseWindow({
      width: at?.width || cfg.window?.width || 1440, height: at?.height || cfg.window?.height || 900, minWidth: 634, minHeight: 480, title: cfg.name,
      ...(appIcon && !appIcon.isEmpty() ? { icon: appIcon } : {}),
      ...(at ? { x: at.x, y: at.y } : {}),
      titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 14 },
      vibrancy: translucent ? look().material || undefined : undefined, visualEffectState: 'active', backgroundColor: '#00000000', transparent: process.platform === 'darwin',
      show: false, // made visible at no opacity below, then shown once its views have drawn (revealWindow)
    });
    const shellView = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload-shell.cjs'), partition: `persist:${cfg.appId}` } });
    shellView.setBackgroundColor('#00000000');
    win.contentView.addChildView(shellView);
    const W = { win, shellView, tabs: new Map(), panes: [], active: null, radius: 0, shortcuts: [], menuState: {}, reveal: { placed: 0, done: false, timer: null } };
    windows.add(W);
    applyLook(W);
    const fit = () => { const [w, h] = win.getContentSize(); shellView.setBounds({ x: 0, y: 0, width: w, height: h }); };
    fit(); win.on('resize', () => { fit(); repaintSoon(W); });
    for (const ev of ['blur', 'show', 'restore', 'enter-full-screen', 'leave-full-screen', 'resized']) win.on(ev, () => repaintSoon(W));
    win.on('focus', () => { focused = W; setMenu(); repaintSoon(W); refreshDesktop(); });
    win.on('closed', () => { term?.closeAll(W); for (const id of [...W.tabs.keys()]) forgetContents(W.tabs.get(id).view.webContents); windows.delete(W); if (focused === W) focused = [...windows][0] || null; });
    serviceOwners.track(shellView.webContents);
    shellView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    if (DIAG) shellView.webContents.on('console-message', e => { if (e.level === 'warning' || e.level === 'error') diagLog({ shell: e.message }); });
    shellView.webContents.on('will-navigate', e => e.preventDefault());
    const q = new URLSearchParams({ ...(n ? { window: String(n) } : {}), ...(open ? { open: JSON.stringify(open) } : {}) }).toString();
    shellView.webContents.loadURL(`${scheme}://app/${appRel}/index.html${q ? '?' + q : ''}`);
    shapeWindow(win); // the native corner helper loads (a synchronous library load) while the shell document loads, before the window shows
    if (process.platform === 'darwin' || process.platform === 'win32') { win.setOpacity(0); win.showInactive(); } else { W.reveal.done = true; background.present(win); } // no window opacity elsewhere: shown at once
    setTimeout(() => { if (!W.reveal.done) { W.reveal.done = true; background.present(win); } }, REVEAL_WINDOW_MAX_MS); // a shell that never places its views still shows its window
    focused = W;
    return W;
  }

  app.whenReady().then(async () => {
    background.prepare(app);
    if (await relaunched) return app.exit(0);
    /* one instance per user data folder (Electron keys the lock on it, so a run with its own --user-data-dir is its own instance); taken after
       the named relaunch, whose child is the instance. A second launch exits and brings the first window forward */
    if (!app.requestSingleInstanceLock()) return app.exit(0);
    app.on('second-instance', () => {
      const W = focused || [...windows][0];
      if (!W || W.win.isDestroyed?.()) return;
      if (W.win.isMinimized?.()) W.win.restore();
      background.present(W.win, { focus: true });
    });
    routes = (await import(pathToFileURL(path.join(appRoot, 'routes.js')).href)).ROUTES;
    if (cfg.services) services = require(path.join(appRoot, cfg.services)).create({ app, emit: emitService, emitTo: serviceSendTo(windows), safeStorage: require('electron').safeStorage, userData: app.getPath('userData'), hooks, remoteTerminalConfig, confirm: options => confirmNative(options) });
    if (services) for (const name of cfg.coalesce || []) if (typeof services[name] === 'function') services[name] = coalesced(name, services[name]);
    const appDef = (await import(pathToFileURL(path.join(appRoot, 'app.config.js')).href)).default;
    /* menu bar words: the app dictionary of the locale in use (kit.locale: 'system' = the first preferred system language the app has);
       the shell reports a change (locale:set) and the menu is rebuilt in place */
    const kitEn = (await import(pathToFileURL(path.join(__dirname, '../locale/en.js')).href)).default;
    const pickLocale = pref => {
      const have = Object.keys(appDef.locales || {});
      if (pref && pref !== 'system' && have.includes(pref)) return pref;
      const sys = app.getPreferredSystemLanguages().map(l => l.toLowerCase().split('-')[0]).find(l => have.includes(l));
      return sys || (have.includes(appDef.defaultLocale) ? appDef.defaultLocale : 'en');
    };
    let dict = {};
    const setLocaleCode = code => { localeCode = code; dict = { ...kitEn, ...(appDef.locales?.[code] || {}) }; };
    setLocaleCode(pickLocale((() => { try { return JSON.parse(settingsText())[LOCALE_KEY]; } catch { return undefined; } })()));
    const t = (key, vars) => (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '');
    translate = t;
    handle('locale:set', (W, code) => { if (appDef.locales?.[code] && code !== localeCode) { setLocaleCode(code); setMenu(); } return localeCode; });
    if (MAC && appIcon && !appIcon.isEmpty() && !app.isPackaged) app.dock.setIcon(appIcon);
    app.setAboutPanelOptions({ applicationName: cfg.name, ...(appIcon && !appIcon.isEmpty() ? { iconPath: path.join(appRoot, cfg.icon) } : {}) });
    const saved = (() => { try { return JSON.parse(settingsText())[THEME_KEY]; } catch { return undefined; } })(); // first run: no file
    const mode = saved ?? appDef.settings?.defaults?.[THEME_KEY];
    if (['system', 'light', 'dark'].includes(mode)) nativeTheme.themeSource = mode;
    const savedStyle = (() => { try { return JSON.parse(settingsText())[STYLE_KEY]; } catch { return undefined; } })();
    windowStyle = [savedStyle, appDef.settings?.defaults?.[STYLE_KEY], fallbackStyle()].find(usable) || null;
    setMenu = () => Menu.setApplicationMenu(buildAppMenu({
      name: cfg.name, t, run: keys => send(focused, 'shortcut', keys), act: (name, arg) => send(focused, 'action', name, arg), state: focused?.menuState || {},
      newWindow: () => createWindow({ from: focused }),
      quitConfirm: { checked: prefs.quitConfirm, set: on => { prefs.quitConfirm = on; savePrefs(); setMenu(); } },
      has: { bookmark: !!appDef.sidebar?.bookmark, pin: !!appDef.sidebar?.pinnedTabs }, debugItems: debug?.menu({ t, act: (name, arg) => send(focused, 'action', name, arg), firstRun: !!appDef.firstRun }),
    }));
    setMenu();
    app.on('will-quit', flushSettings); // the settings still waiting to be written
    let terminalsClosing = false, terminalsClosed = false;
    app.on('will-quit', event => {
      if (!term || terminalsClosed) return;
      event.preventDefault();
      if (terminalsClosing) return;
      terminalsClosing = true;
      term.closeAll().finally(() => { terminalsClosed = true; quitting = true; app.quit(); });
    });
    // quitting asks the focused window first; the same quit again while the question is shown goes through
    app.on('before-quit', e => {
      const W = focused || [...windows][0];
      if (quitting || !prefs.quitConfirm || !W || W.shellView.webContents.isDestroyed()) return;
      if (quitAsked) { quitting = true; return; }
      e.preventDefault(); quitAsked = W; W.win.show(); send(W, 'quit-request');
    });
    // a termination signal (a restart from a script, a log-out) quits without the question: nobody is there to answer it, and the question would keep the old process alive
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { quitting = true; app.quit(); });
    const serve = req => {
      const u = new URL(req.url);
      if (u.host === 'app') return fileResponse(u.pathname, req.headers?.get?.('origin'));
      return pageResponse(req.url);
    };
    // the scheme is served in the app partition used by the shell and tab views (protocol handlers are per session)
    for (const s of [session.defaultSession, session.fromPartition(`persist:${cfg.appId}`)]) { s.protocol.handle(scheme, serve); lockPermissions(s); }
    nativeTheme.on('updated', () => { for (const W of windows) { applyLook(W); send(W, 'theme', themeName()); } refreshDesktop(); });
    /* every route page's document and module graph read ahead once the first window is up: the first visit to a section then answers
       from what is kept instead of walking a few hundred imports while the person waits (250–480ms measured on a first visit) */
    const warmPages = async () => {
      for (const page of new Set(routes.map(r => r.page))) {
        const file = path.join(appRoot, 'pages', page + '.html');
        const html = await readKept(file).catch(() => null);
        if (html) await withPreloads(String(html), path.dirname(file)).catch(() => {});
      }
    };
    createWindow();
    setTimeout(warmPages, 3000);
  });
  app.on('window-all-closed', () => app.quit());
}

module.exports = { start };
