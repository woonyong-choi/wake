/*
 * Terminal sessions in the shell document (desktop only): one xterm per session key (the app's key, for example one per page of a connected item),
 * each joined to its own pseudo terminal in the main process (desktop/terminal.cjs). Switching to a page of another key shows that
 * key's session; a key without one starts it with the environment the app gives (config.terminal.open). Each command the shell
 * integration reports goes to config.terminal.record with the user name and time; output is never kept.
 * run(key, { id, args, line }): a command the app declared and runs for the person (desktop/terminal.cjs run) shown as that key's session: its output streams
 * into the panel, onOutput sees each chunk (kept only in memory for the caller, for example to read a known error), and the promise
 * resolves with the process exit code (null when it was ended: cancel). A run session is not interactive afterwards.
 * xterm.js 6.0.0 and its fit addon (MIT, kit/vendor/xterm) load on first use.
 */
import { t } from '../core/i18n.js';
import { shortcutOf } from '../core/keys.js';
import { text } from '../core/text.js';
import { validateTerminalAppearance } from '../core/terminal-appearance.js';

/** Local read-only output ownership; tickets never cross the page bridge. */
export function createTerminalOutputs({ hasTab, activeTab, contextOf = () => null, onChange = () => {}, onRelease = () => {} }) {
  const owners = new WeakMap(), tickets = new WeakMap(), latest = new Map(), generations = new Map();
  let sequence = 0;
  const validText = value => typeof value === 'string' && !!value.trim();
  const lookup = ticket => ticket && typeof ticket === 'object' ? tickets.get(ticket) : null;
  const prune = () => { for (const [key, record] of latest) if (!hasTab(record.ownerTabId)) latest.delete(key); };
  const matchesContext = record => contextOf(record.ownerTabId) === record.ownerContext;
  const current = () => {
    prune();
    return [...latest.values()].find(record => record.open && record.ownerTabId === activeTab() && matchesContext(record)) || null;
  };
  const closeActive = () => {
    const record = current(); if (!record) return false;
    record.open = false; onChange(); return true;
  };
  return {
    bindAction(payload, sourceTabId) {
      const owner = hasTab(sourceTabId) ? Object.freeze({}) : null;
      if (owner) owners.set(owner, { tabId: sourceTabId, generation: generations.get(sourceTabId) || 0 });
      return { ...payload, sourceTabId, outputOwner: owner };
    },
    begin({ owner, scope, tool, flow, attempt } = {}) {
      const origin = owner && typeof owner === 'object' ? owners.get(owner) : null, ownerTabId = origin?.tabId;
      if (!ownerTabId || origin.generation !== (generations.get(ownerTabId) || 0) || !hasTab(ownerTabId) || ![scope, tool, flow].every(validText) || !Number.isSafeInteger(attempt) || attempt <= 0) return null;
      const ownerContext = contextOf(ownerTabId);
      if (!validText(ownerContext)) return null;
      const scopeKey = JSON.stringify([ownerTabId, scope, tool, flow]), prior = latest.get(scopeKey);
      if (prior && attempt <= prior.attempt) return attempt === prior.attempt && prior.ownerContext === ownerContext ? prior.ticket : null;
      const ticket = Object.freeze({}), record = { ticket, scopeKey, ownerTabId, ownerContext, scope, tool, flow, attempt, key: `output-${++sequence}`, open: false };
      tickets.set(ticket, record); latest.set(scopeKey, record); onChange();
      return ticket;
    },
    show(ticket, output = {}) {
      const record = lookup(ticket);
      if (!record) return { ok: false, shown: false, reason: 'invalid-ticket' };
      if (!hasTab(record.ownerTabId)) return { ok: false, shown: false, reason: 'closed-owner' };
      if (latest.get(record.scopeKey) !== record) return { ok: false, shown: false, reason: 'stale-attempt' };
      if (!matchesContext(record)) return { ok: false, shown: false, reason: 'owner-target-changed' };
      if (record.ownerTabId !== activeTab()) return { ok: false, shown: false, reason: 'inactive-owner' };
      if (!['http', 'connection-check'].includes(output.source) || typeof output.truncated !== 'boolean' ||
          ![output.title, output.rawText, output.sourceLabel, output.readOnlyLabel].every(validText) || (output.truncated && !validText(output.limitLabel))) return { ok: false, shown: false, reason: 'invalid-output' };
      for (const other of latest.values()) if (other.ownerTabId === record.ownerTabId) other.open = false;
      Object.assign(record, { title: output.title, rawText: output.rawText, source: output.source, sourceLabel: output.sourceLabel,
        readOnlyLabel: output.readOnlyLabel, truncated: output.truncated, limitLabel: output.truncated ? output.limitLabel : '', open: true });
      onChange(); return { ok: true, shown: true };
    },
    close(ticket) {
      const record = lookup(ticket);
      if (!record || latest.get(record.scopeKey) !== record || !hasTab(record.ownerTabId)) return { ok: false };
      record.open = false; onChange(); return { ok: true };
    },
    current, closeActive,
    release(tabId) {
      generations.set(tabId, (generations.get(tabId) || 0) + 1);
      for (const [key, record] of latest) if (record.ownerTabId === tabId) latest.delete(key);
      onRelease(tabId);
    },
    keys() { prune(); return new Set([...latest.values()].map(record => record.key)); },
  };
}

function outputText(value) {
  return value.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** Read-only DOM views share the existing dock, without access to the PTY bridge. */
export function createTerminalOutputViews({ doc, sessions, deactivate = () => {} }) {
  const outputs = new Map();
  let body = null, current = null;
  return {
    mount(el) { if (body && body !== el) for (const host of outputs.values()) el.appendChild(host); body = el; },
    retain(keys) { for (const [key, host] of outputs) if (!keys.has(key)) { host.remove(); outputs.delete(key); } },
    show(record) {
      if (!body) return;
      deactivate();
      for (const s of sessions.values()) s.host.classList.remove('on');
      for (const host of outputs.values()) host.classList.remove('on');
      let host = outputs.get(record.key);
      if (!host) {
        host = doc.createElement('div'); host.className = 'tpn-host cb-body'; host.setAttribute('data-scroll', 'content');
        host.setAttribute('tabindex', '0'); host.setAttribute('role', 'region');
        const provenance = doc.createElement('div'), content = doc.createElement('div');
        provenance.className = 'cb-line tk-c'; content.className = 'cb-line';
        host.append(provenance, content); body.appendChild(host); outputs.set(record.key, host);
      }
      host.setAttribute('aria-label', outputText(record.title));
      host.firstElementChild.textContent = outputText([record.sourceLabel, record.readOnlyLabel, record.limitLabel].filter(Boolean).join(' · '));
      const content = outputText(record.rawText);
      if (host.lastElementChild.textContent !== content) host.lastElementChild.textContent = content;
      host.classList.add('on');
      if (current !== record.key) host.focus({ preventScroll: true });
      current = record.key;
    },
    hide() { current = null; for (const host of outputs.values()) host.classList.remove('on'); },
  };
}

export function createTerminals({ doc, desktop, config, api, onExit, onState, ownerOf = () => null, appearanceSettings = () => ({}) }) {
  const sessions = new Map();
  const byId = new Map();
  const pending = new Map(), aliases = new Map(), physical = new Map(), locals = new Map(), generations = new Map();
  let selected = null;
  const prefix = Math.random().toString(36).slice(2, 8); // ids are unique to this window
  let lib = null, loading = null, body = null, current = null, seq = 0;
  const outputs = createTerminalOutputViews({ doc, sessions, deactivate: () => { current = null; selected = null; } });
  const cssVar = n => getComputedStyle(doc.documentElement).getPropertyValue(n).trim();
  /* a token resolved to the hex form xterm reads (tokens may be oklch or color-mix): the computed color drawn once on a 1px canvas */
  const hexOf = token => {
    const probe = doc.createElement('span'); probe.style.color = `var(${token})`; doc.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color; probe.remove();
    const c = doc.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d');
    g.fillStyle = resolved; g.fillRect(0, 0, 1, 1);
    return '#' + [...g.getImageData(0, 0, 1, 1).data].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const clear = () => '#' + '0'.repeat(8); // fully transparent: the panel fill (--content) shows through
  /* the app's colors in each theme: text, cursor, selection and the 16 ANSI colors from the terminal tokens (tokens.css --term-*) */
  const ANSI = { black: '--term-black', red: '--term-red', green: '--term-green', yellow: '--term-yellow', blue: '--term-blue', magenta: '--term-magenta', cyan: '--term-cyan', white: '--term-white' };
  /* colors: the app's light or dark, or a preset of kit.terminal.theme (the term-* tokens; a transparent background lets the panel fill show) */
  const baseTheme = () => ({ background: cssVar('--term-bg') === 'transparent' ? clear() : hexOf('--term-bg'), foreground: hexOf('--term-fg'), cursor: hexOf('--term-fg'), cursorAccent: hexOf('--content'), selectionBackground: hexOf('--term-selection'),
    ...Object.fromEntries(Object.entries(ANSI).flatMap(([c, tok]) => [[c, hexOf(tok)], ['bright' + c[0].toUpperCase() + c.slice(1), hexOf(tok)]])) });
  function imported(selection, registry) {
    if (typeof selection !== 'string' || !selection.startsWith('imported:')) return null;
    const snapshot = Array.isArray(registry) ? registry.find(item => item?.id === selection.slice('imported:'.length)) : null;
    const result = validateTerminalAppearance(snapshot);
    return result.snapshot || null;
  }
  function appearance() {
    const values = appearanceSettings(), selection = values['kit.terminal.theme'] || 'app', fontSelection = values['kit.terminal.font'] || 'app';
    const registry = values['kit.terminal.appearances'], colors = imported(selection, registry), font = imported(fontSelection, registry);
    const family = font?.font.family, fallback = cssVar('--font-mono');
    const known = ['app', 'midnight', 'paper', 'solarized'].includes(selection);
    return { colors: { ...baseTheme(), ...colors?.colors }, family: family ? `"${family}", ${fallback}` : fallback,
      status: { selection, fontSelection, themeStatus: colors ? 'imported' : known ? selection : 'fallback',
        fontStatus: family ? 'requested-unverified' : fontSelection === 'app' ? 'app' : 'fallback',
        fallbackFields: colors ? colors.missingFields.filter(field => field !== 'font.family') : [],
        fontFallback: family ? 'browser-fallback-unverified' : fontSelection === 'app' ? null : 'missing-font',
        reason: !known && !colors ? 'invalid-snapshot' : null } };
  }
  async function load() {
    if (lib) return lib;
    if (!doc.querySelector('link[data-xterm]')) { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.dataset.xterm = ''; l.href = new URL('../vendor/xterm/xterm.css', import.meta.url).href; doc.head.appendChild(l); }
    if (loading) return loading;
    loading = initialize();
    return loading;
  }
  async function initialize() {
    const [{ Terminal }, { FitAddon }] = await Promise.all([import('../vendor/xterm/xterm.mjs'), import('../vendor/xterm/addon-fit.mjs')]);
    lib = { Terminal, FitAddon };
    desktop.on('pty-data', (id, data) => { const s = byId.get(id); if (!s || s.revoked || s.dead) return; s.term.write(data); s.onOutput?.(data); });
    desktop.on('pty-command', (id, c) => { const s = byId.get(id); if (s?.mode === 'local') config.terminal.record?.({ session: s.key, command: c.command, exit: c.exit, user: s.user, at: new Date().toISOString() }, api); });
    desktop.on('pty-exit', (id, code, metadata) => {
      const s = byId.get(id); if (!s) return;
      s.dead = true; s.term.options.disableStdin = true; byId.delete(id);
      if (s.mode === 'remote') {
        const failures = { identity_failed: 'REMOTE_IDENTITY_FAILED', account_mismatch: 'REMOTE_ACCOUNT_MISMATCH',
          unavailable: 'REMOTE_PTY_UNAVAILABLE', start_failed: 'REMOTE_START_FAILED' };
        const isFailure = metadata?.mode === 'remote' && Object.hasOwn(failures, metadata.state);
        const states = ['cancelled', 'expired', 'disconnected', 'cleanup_failed'];
        s.state = metadata?.mode === 'remote' && (states.includes(metadata.state) || isFailure) ? metadata.state : 'failed';
        const derivedCode = isFailure ? failures[s.state] : s.state === 'failed' ? 'REMOTE_EXIT_UNCONFIRMED' : `REMOTE_${s.state.toUpperCase()}`;
        s.cleanup = ['failed', 'cleanup_failed'].includes(s.state) ? 'unconfirmed' : null; s.exitConfirmed = true;
        s.errorCode = s.openErrorCode || (isFailure ? derivedCode : s.errorCode);
        s.code = s.openErrorCode && !s.cleanup ? s.openErrorCode : derivedCode;
        if (s.collision) { finishCollision(s, metadata); return; }
        notify(s); return;
      }
      if (s.done) { s.done(code); return; }
      say(s, t('terminal.exited')); forget(s); if (s.mode === 'attached') { s.term.dispose(); s.host.remove(); } onExit?.(s.key, s.owner?.tabId);
    });
    return lib;
  }
  const toggleKeys = () => config.terminal?.keysOf?.() || [];
  async function view(key, owner, alias, replace = false) {
    const { Terminal, FitAddon } = await load();
    const old = replace ? lookup(key) : null;
    if (old) { if (!old.dead) desktop.invoke('pty:close', old.id); old.done?.(null); forget(old); old.term.dispose(); old.host.remove(); }
    const host = doc.createElement('div'); host.className = 'tpn-host'; body.appendChild(host);
    /* the app's own lines (where the session goes, why it did not open, the Enter to run) sit above the screen as text: a terminal draws a
       wide glyph (Hangul) in two cells of the Latin mono font and spreads it apart, so prose never goes through the terminal */
    const note = doc.createElement('div'); note.className = 'tpn-note'; note.hidden = true;
    const screen = doc.createElement('div'); screen.className = 'tpn-screen';
    host.append(note, screen);
    const size = parseFloat(cssVar('--term-text')) || 12;
    const selectedAppearance = appearance();
    stylePanel(selectedAppearance.colors);
    const term = new Terminal({ fontFamily: selectedAppearance.family, fontSize: size, lineHeight: (parseFloat(cssVar('--term-leading')) || size * 1.5) / size, cursorBlink: true, cursorStyle: 'bar', cursorWidth: 2, allowTransparency: true, theme: selectedAppearance.colors, scrollback: 5000 });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(screen);
    // the toggle key goes to the shell, not to the terminal
    term.attachCustomKeyEventHandler(e => !(e.type === 'keydown' && toggleKeys().includes(shortcutOf(e))));
    const slot = `session-${++seq}`, s = { key, slot, alias, owner, id: `${prefix}-${seq}`, term, fit, host, note, user: '', state: 'opening' };
    sessions.set(slot, s); aliases.set(alias, slot); byId.set(s.id, s);
    if (selected === alias) current = slot;
    for (const x of sessions.values()) x.host.classList.toggle('on', x.slot === current);
    try { fit.fit(); } catch { /* hidden */ }
    return s;
  }
  function captureOwner(key) {
    const value = ownerOf(key);
    return value?.tabId && typeof value.address === 'string' ? { tabId: value.tabId, address: value.address, generation: generations.get(value.tabId) || 0 } : null;
  }
  function aliasOf(key, owner = captureOwner(key)) {
    return JSON.stringify([owner?.tabId ?? null, owner?.address ?? null, owner?.generation ?? null, key]);
  }
  function lookup(key) {
    const s = sessions.get(aliases.get(aliasOf(key))) || sessions.get(locals.get(key));
    return s && !s.revoked ? s : null;
  }
  function matchesOwner(s) {
    const owner = captureOwner(s.key);
    return !s.revoked && !!s.owner && owner?.tabId === s.owner.tabId && owner.address === s.owner.address && owner.generation === s.owner.generation;
  }
  function forget(s) {
    sessions.delete(s.slot); byId.delete(s.id);
    for (const [key, slot] of aliases) if (slot === s.slot) aliases.delete(key);
    if (locals.get(s.key) === s.slot) locals.delete(s.key);
    if (physical.get(s.physicalKey) === s.slot) physical.delete(s.physicalKey);
  }
  function stopAttached(s) {
    s.dead = true; forget(s); s.term.dispose(); s.host.remove();
    void desktop.invoke('pty:close', s.id).catch(() => {});
  }
  function stylePanel(colors) {
    const panel = body?.parentElement;
    (panel || body)?.style.setProperty?.('--term-session-bg', colors.background);
    panel?.style.setProperty?.('--term-session-fg', colors.foreground);
  }
  /* an app line above the session's screen (never written into the terminal); the screen refits to the room left */
  function say(s, message) {
    const line = String(message || '').trim(); if (!line) return;
    s.note.textContent = s.note.textContent ? s.note.textContent + '\n' + line : line; s.note.hidden = false;
    if (s.slot === current) try { s.fit.fit(); } catch { /* hidden */ }
  }
  function statusOf(s, key = s?.key) {
    return s ? { key, mode: s.mode, state: s.state, code: s.code || null,
      cleanup: s.cleanup || null, errorCode: s.errorCode || null, contextId: s.contextId || null, target: s.target ? { ...s.target, ...(s.target.session ? { session: { ...s.target.session } } : {}) } : null, user: s.mode === 'local' ? s.user : null } : null;
  }
  function present(s, alias) {
    if (selected !== alias || !s || (s.mode === 'remote' && !matchesOwner(s)) || (s.mode === 'attached' && (s.dead || !matchesOwner(s)))) return;
    current = s.slot;
    for (const view of sessions.values()) view.host.classList.toggle('on', view.slot === current);
    fitNow(); s.term.focus();
  }
  function physicalKey(s, target = s.target) {
    const identity = Object.entries(target).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return JSON.stringify(['remote', s.owner.tabId, s.owner.address, s.owner.generation, identity]);
  }
  function finishCollision(s, metadata) {
    const existing = sessions.get(s.collision), returnedTarget = remoteTarget(metadata?.target, s.contextId);
    const confirmed = metadata?.mode === 'remote' && metadata.state === 'cancelled' && returnedTarget && physicalKey(s, returnedTarget) === s.physicalKey;
    if (confirmed && existing && !existing.dead && !existing.closing && !existing.revoked && matchesOwner(s)) {
      const alias = s.alias; forget(s); s.term.dispose(); s.host.remove();
      aliases.set(alias, existing.slot); s.adopted = existing;
      notify(existing); present(existing, alias); return;
    }
    s.cleanup = confirmed ? null : 'unconfirmed';
    if (confirmed) { s.state = 'failed'; s.code = 'REMOTE_SESSION_CONFLICT'; }
    else { s.state = metadata?.state === 'cleanup_failed' ? 'cleanup_failed' : 'cleanup_unconfirmed'; s.code = 'REMOTE_CLEANUP_UNCONFIRMED'; }
    notify(s);
  }
  async function bindPhysical(s) {
    s.physicalKey = physicalKey(s);
    const existing = sessions.get(physical.get(s.physicalKey));
    if (!existing) { physical.set(s.physicalKey, s.slot); return s; }
    s.collision = existing.slot; s.dead = true; s.closing = true;
    s.state = 'cleanup_unconfirmed'; s.cleanup = 'unconfirmed'; s.code = 'REMOTE_DUPLICATE_CLEANUP_UNCONFIRMED';
    s.term.options.disableStdin = true; notify(s);
    try {
      const result = await desktop.invoke('pty:close', s.id);
      if (s.adopted) return s.adopted;
      if (result?.cleanup === 'unconfirmed') { s.state = 'cleanup_unconfirmed'; s.code = 'REMOTE_CLEANUP_UNCONFIRMED'; notify(s); }
      else if (result === false || result?.error) { s.state = 'cleanup_failed'; s.code = 'REMOTE_CLEANUP_FAILED'; notify(s); }
    } catch { s.state = 'cleanup_failed'; s.code = 'REMOTE_CLEANUP_FAILED'; notify(s); }
    return s.adopted || s;
  }
  function notify(s) {
    const status = statusOf(s);
    let notice;
    try { notice = config.terminal.describe?.(status, api)?.notice; } catch { notice = null; }
    /* the app names the state in words; a bare code is never shown (the code stays in the status for the app) */
    const message = notice ? outputText(text(notice).replace(/\r/g, '')) : '';
    if (message && message !== s.lastNotice) { say(s, message); s.lastNotice = message; }
    onState?.(status);
  }
  function fail(s, code, cleanup) {
    s.dead = true; s.state = cleanup === 'unconfirmed' ? 'cleanup_unconfirmed' : 'failed';
    s.errorCode = typeof code === 'string' && /^[A-Z_]{1,64}$/.test(code) ? code : 'TERMINAL_UNAVAILABLE';
    s.cleanup = cleanup === 'unconfirmed' ? cleanup : null; s.code = s.cleanup ? 'REMOTE_CLEANUP_UNCONFIRMED' : s.errorCode;
    s.term.options.disableStdin = true; byId.delete(s.id);
    say(s, t(s.errorCode === 'TERMINAL_CONTEXT_CHANGED' ? 'terminal.contextChanged' : 'terminal.openFailed')); notify(s); return s;
  }
  function recordOpenFailure(s, response) {
    const code = typeof response?.code === 'string' && /^[A-Z_]{1,64}$/.test(response.code) ? response.code : 'TERMINAL_UNAVAILABLE';
    s.openErrorCode = code; s.errorCode = code; s.dead = true; s.term.options.disableStdin = true;
    if (!s.exitConfirmed) { s.state = 'failed'; s.cleanup = null; }
    if (response?.cleanup === 'unconfirmed') { s.state = 'cleanup_unconfirmed'; s.cleanup = 'unconfirmed'; s.code = 'REMOTE_CLEANUP_UNCONFIRMED'; }
    else if (!['cleanup_failed', 'cleanup_unconfirmed'].includes(s.state)) s.code = code;
    notify(s); return s;
  }
  function remoteTarget(value, contextId) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const properties = Object.getOwnPropertyDescriptors(value), entries = Object.entries(properties);
    if (properties.contextId?.value !== contextId || entries.length > 32) return null;
    if (['document', 'parameters', 'params'].some(name => Object.hasOwn(properties, name))) return null;
    const target = {};
    for (const [name, property] of entries) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(name) || ['constructor', 'prototype'].includes(name) || !Object.hasOwn(property, 'value')) return null;
      const field = property.value;
      if (name === 'session') {
        if (!field || typeof field !== 'object' || Array.isArray(field)) return null;
        const nested = Object.getOwnPropertyDescriptors(field);
        if (Reflect.ownKeys(nested).length !== 1 || !Object.hasOwn(nested, 'kind') || nested.kind.value !== 'default-shell') return null;
        target.session = Object.freeze({ kind: 'default-shell' }); continue;
      }
      if (typeof field === 'string') {
        if (field.length > 1024 || /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(field)) return null;
      } else if (typeof field !== 'boolean' && !(Number.isSafeInteger(field) && field >= 0)) return null;
      target[name] = field;
    }
    return target;
  }
  async function discardRemote(s) {
    if (s.closing) return s;
    s.closing = true; s.dead = true; s.state = 'cleanup_unconfirmed'; s.cleanup = 'unconfirmed'; s.code = 'REMOTE_CLEANUP_UNCONFIRMED';
    s.term.options.disableStdin = true; notify(s);
    try {
      const result = await desktop.invoke('pty:close', s.id);
      if (s.exitConfirmed) return s;
      if (result?.cleanup === 'unconfirmed') { s.code = 'REMOTE_CLEANUP_UNCONFIRMED'; }
      else if (result === false || result?.error) { s.state = 'cleanup_failed'; s.code = 'REMOTE_CLEANUP_FAILED'; }
    } catch { if (!s.exitConfirmed) { s.state = 'cleanup_failed'; s.code = 'REMOTE_CLEANUP_FAILED'; } }
    notify(s); return s;
  }
  async function start(key, owner, alias) {
    const s = await view(key, owner, alias), term = s.term;
    try {
      if (owner && !matchesOwner(s)) return fail(s, 'TERMINAL_CONTEXT_CHANGED');
      const env = await config.terminal.open(key, api);
      if (!env || env.error) return fail(s, env?.code);
      if (!['local', 'remote', 'attached'].includes(env.mode)) return fail(s, 'TERMINAL_MODE_REQUIRED');
      s.mode = env.mode;
      if (owner && !matchesOwner(s)) return fail(s, 'TERMINAL_CONTEXT_CHANGED');
      if (env.preview && s.mode === 'local') {
        term.options.disableStdin = true; say(s, outputText(text(env.preview).replace(/\r/g, '')));
        s.dead = true; s.state = 'preview'; byId.delete(s.id); return s;
      }
      let payload = { id: s.id, mode: s.mode, cols: term.cols, rows: term.rows };
      if (s.mode === 'remote') {
        if (!matchesOwner(s)) return fail(s, 'TERMINAL_CONTEXT_CHANGED');
        if (['env', 'cwd', 'host', 'profile', 'argv', 'command', 'preview', 'session', 'document', 'parameters', 'params'].some(name => Object.hasOwn(env, name))) return fail(s, 'REMOTE_ARGUMENTS_REJECTED');
        if (typeof env.contextId !== 'string' || !env.contextId.trim() || env.contextId.length > 256 || /[\x00-\x1f\x7f]/.test(env.contextId)) return fail(s, 'REMOTE_ARGUMENTS_REJECTED');
        s.contextId = env.contextId; payload.contextId = s.contextId;
        s.state = 'connecting'; s.code = 'REMOTE_CONNECTING'; notify(s);
      } else if (s.mode === 'attached') {
        if (!matchesOwner(s) || selected !== alias || typeof env.ticket !== 'string') return fail(s, 'TERMINAL_CONTEXT_CHANGED');
        payload.ticket = env.ticket;
      } else payload = { ...payload, env: env.env || {}, cwd: env.cwd };
      if (env.notice) say(s, outputText(text(env.notice).replace(/\r/g, '')));
      s.openPending = true;
      const r = await desktop.invoke('pty:open', payload);
      s.openPending = false;
      if (!r || r.error) return s.mode === 'remote' ? recordOpenFailure(s, r) : fail(s, r?.code, r?.cleanup);
      if (s.mode === 'remote' && !matchesOwner(s)) return discardRemote(s);
      if (s.mode === 'attached' && (!matchesOwner(s) || selected !== alias)) { stopAttached(s); return s; }
      if (s.dead) return s;
      if (s.mode === 'remote') {
        s.target = remoteTarget(r.target, s.contextId);
        if (r.id !== s.id || r.mode !== 'remote' || r.state !== 'connecting' || !s.target) {
          await discardRemote(s);
          return ['cleanup_failed', 'cleanup_unconfirmed'].includes(s.state) ? s : fail(s, 'REMOTE_RESPONSE_REJECTED');
        }
      } else {
        if (r.mode !== s.mode || r.id !== s.id) return fail(s, 'TERMINAL_RESPONSE_REJECTED');
        s.user = r.user || ''; s.state = 'open';
        if (s.mode === 'local') locals.set(key, s.slot);
        if (s.mode === 'attached') for (const previous of sessions.values()) {
          if (previous !== s && previous.mode === 'attached' && previous.owner?.tabId === s.owner.tabId) stopAttached(previous);
        }
      }
      if (s.mode === 'remote') { const bound = await bindPhysical(s); if (bound !== s || s.collision) return bound; }
      notify(s);
      term.onData(d => { if (!s.dead && current === s.slot && (s.mode === 'local' || matchesOwner(s))) desktop.invoke('pty:write', s.id, d); });
      term.onResize(({ cols, rows }) => { if (!s.dead) desktop.invoke('pty:resize', s.id, cols, rows); });
      return s;
    } catch { s.openPending = false; if (s.exitConfirmed) return s; return fail(s, 'TERMINAL_UNAVAILABLE'); }
  }
  function fitNow() { const s = sessions.get(current); if (s) try { s.fit.fit(); } catch { /* hidden */ } }
  return {
    /** the panel body element (kept across redraws; a later mount moves the open sessions there) */
    mount(el) { if (body && body !== el) for (const x of sessions.values()) el.appendChild(x.host); body = el; outputs.mount(el); },
    async show(key, { restartFailed = false } = {}) {
      if (!body) return;
      const owner = captureOwner(key), alias = aliasOf(key, owner);
      outputs.hide(); selected = alias;
      let s = lookup(key);
      if (restartFailed && s?.dead) { forget(s); s.term.dispose(); s.host.remove(); s = null; }
      current = s?.slot || null;
      for (const view of sessions.values()) view.host.classList.toggle('on', view.slot === current);
      let opening = pending.get(alias);
      if (!opening && !s) {
        opening = start(key, owner, alias).finally(() => pending.delete(alias));
        pending.set(alias, opening);
      }
      s = opening ? await opening : s;
      present(s, alias);
    },
    /** Reveals an existing alias without opening a new native session. */
    reveal(key, { fit = true } = {}) {
      if (!body) return;
      const s = lookup(key);
      if (!s || (s.mode === 'remote' && !matchesOwner(s))) { this.hide(); return; }
      selected = aliasOf(key); current = s.slot; outputs.hide();
      for (const view of sessions.values()) view.host.classList.toggle('on', view.slot === current);
      if (fit) fitNow();
    },
    retainOutputs: keys => outputs.retain(keys),
    showOutput: record => outputs.show(record),
    hide() { current = null; selected = null; for (const s of sessions.values()) s.host.classList.remove('on'); outputs.hide(); },
    /** run a command as its own process in the key's session; resolves with { exit } (exit null: ended by cancel) */
    /* spec: { id, args, line }: the desktop runs only a command id the app declared, built from its arguments. A command the app marks confirm
       starts only after the person answers the desktop's own dialog (cancel: error TERMINAL_COMMAND_CANCELLED); onInput sees what the person types */
    async run(key, spec, { env = {}, onOutput, onInput } = {}) {
      if (!body) return { exit: null, error: 'unavailable' };
      if (lookup(key)?.mode === 'remote') return { exit: null, error: 'TERMINAL_SESSION_CONFLICT' };
      const owner = captureOwner(key), alias = aliasOf(key, owner); selected = alias;
      await load();
      const s = await view(key, owner, alias, true);
      s.mode = 'local'; s.state = 'open'; s.onOutput = onOutput; locals.set(key, s.slot);
      s.term.write(`\x1b[2m$ ${String(spec?.line ?? '').replace(/\n/g, ' ')}\x1b[0m\r\n`);
      const exit = new Promise(res => { s.done = res; });
      s.term.onData(d => { onInput?.(d); desktop.invoke('pty:write', s.id, d); });
      s.term.onResize(({ cols, rows }) => desktop.invoke('pty:resize', s.id, cols, rows));
      const r = await desktop.invoke('pty:run', { id: s.id, mode: 'local', command: spec.id, args: spec.args, env, cols: s.term.cols, rows: s.term.rows });
      if (r?.error) { say(s, t('terminal.openFailed')); return { exit: null, error: r.error, code: r.code || null }; }
      s.user = r.user || '';
      return { exit: await exit };
    },
    /** end a running command (its run resolves with exit null) */
    cancel(key) { const s = lookup(key); if (!s || s.dead) return; if (s.mode === 'remote') void discardRemote(s); else desktop.invoke('pty:close', s.id).then(() => s.done?.(null)); },
    fit: fitNow,
    theme() {
      const selected = appearance(); let fit = false;
      stylePanel(selected.colors);
      for (const s of sessions.values()) {
        s.term.options.theme = selected.colors;
        if (s.term.options.fontFamily !== selected.family) { s.term.options.fontFamily = selected.family; if (s.slot === current) fit = true; }
      }
      if (fit) fitNow();
      return selected.status;
    },
    appearanceStatus: () => appearance().status,
    has: key => !!lookup(key),
    status: key => { const s = lookup(key); return s?.mode === 'remote' && !matchesOwner(s) ? null : statusOf(s, key); },
    releaseOwner(tabId) {
      generations.set(tabId, (generations.get(tabId) || 0) + 1);
      for (const s of sessions.values()) {
        if (s.mode === 'local' || s.owner?.tabId !== tabId) continue;
        if (s.mode === 'attached') { stopAttached(s); continue; }
        s.revoked = true; s.dead = true; s.state = 'cancelled'; s.code = 'REMOTE_OWNER_CLOSED'; s.term.options.disableStdin = true;
        if (s.mode === 'remote') void discardRemote(s); else notify(s);
      }
    },
    closeAll() { for (const s of sessions.values()) desktop.invoke('pty:close', s.id); },
  };
}
