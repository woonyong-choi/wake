/*
 * Application menu bar (macOS). The same structure for every app; the app name and the strings come from the definitions.
 *   buildAppMenu({ name, t, run, act, state, quitConfirm, has, debugItems }) -> Menu
 *     name: desktop.config name; t(key, vars): app dictionary lookup; run(keys): sends a shell shortcut (kit shortcut list keys);
 *     act(name, arg): runs a kit action (items without a key act on the open tab); has: { bookmark, pin } from the app sidebar definition;
 *     debugItems: View menu items of a development run (debug.cjs), absent in a release;
 *     state: what the shell last reported (menu:state): history { canBack, canForward, closed: [{ id, label }], recent: [{ address, label }] }, the open tab's zoom,
 *       keys (changed shortcuts: default keys -> { keys, action }) and recording (a settings page records a shortcut: no key equivalents);
 *     newWindow(): opens a new window (File menu, ⌘N); quitConfirm: { checked, set(on) } for the app menu checkbox.
 * History menu (measured on the reference): Home, Back, Forward, then the recently closed tabs and the recently visited pages under their headers.
 * View menu zoom items: Actual Size (off at 100%), Zoom In, Zoom Out.
 * Items that act on tabs, the sidebar, the AI panel or settings carry the shell shortcut, so the menu and the keyboard run one action.
 * The full screen item sits before the zoom items (as on the reference); the system adds the help search itself.
 */
const { Menu } = require('electron');

const NAMED = { mod: 'CmdOrCtrl', ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', tab: 'Tab' };
const accel = keys => keys.split('+').map(k => NAMED[k] || (k.length === 1 ? k.toUpperCase() : k)).join('+');

function buildAppMenu({ name, t, run, act, state = {}, newWindow, quitConfirm, has = {}, debugItems }) {
  // a shortcut the user changed (state.keys: default keys -> { keys, action }) shows its new keys; a removed one runs its action without keys
  const cmd = (label, keys, o = {}) => {
    const c = state.keys?.[keys];
    if (state.recording) return { label, enabled: o.enabled !== false, click: () => run(c ? c.keys : keys) }; // no key equivalents while a shortcut is recorded
    if (!c) return { label, accelerator: o.accel || accel(keys), enabled: o.enabled !== false, click: () => run(keys) };
    return { label, accelerator: c.keys ? accel(c.keys) : undefined, enabled: o.enabled !== false, click: () => (c.keys ? run(c.keys) : act(c.action)) };
  };
  const h = state.history || {};
  const tab = (label, action) => ({ label, click: () => act(action) });
  const sep = { type: 'separator' };
  const tpl = [
    { label: name, submenu: [
      { role: 'about', label: t('desktop.menu.about', { name }) }, sep,
      cmd(t('desktop.menu.settings'), 'mod+,'), sep,
      { role: 'services', label: t('desktop.menu.services') }, sep,
      { role: 'hide', label: t('desktop.menu.hide', { name }) },
      { role: 'hideOthers', label: t('desktop.menu.hideOthers') },
      { role: 'unhide', label: t('desktop.menu.showAll') }, sep,
      ...(quitConfirm ? [{ label: t('desktop.menu.quitConfirm'), type: 'checkbox', checked: quitConfirm.checked, click: i => quitConfirm.set(i.checked) }, sep] : []),
      { role: 'quit', label: t('desktop.menu.quit', { name }) },
    ] },
    { label: t('desktop.menu.file'), submenu: [
      cmd(t('tab.new'), 'mod+t'),
      ...(newWindow ? [{ label: t('desktop.menu.newWindow'), accelerator: 'CmdOrCtrl+N', click: () => newWindow() }] : []),
      cmd(t('desktop.menu.reopenTab'), 'mod+shift+t'), sep,
      cmd(t('tab.close'), 'mod+w'),
      { role: 'close', label: t('desktop.menu.closeWindow'), accelerator: 'CmdOrCtrl+Shift+W' },
    ] },
    { label: t('desktop.menu.edit'), submenu: [
      { role: 'undo', label: t('desktop.menu.undo') },
      { role: 'redo', label: t('desktop.menu.redo') }, sep,
      { role: 'cut', label: t('desktop.menu.cut') },
      { role: 'copy', label: t('desktop.menu.copy') },
      { role: 'paste', label: t('desktop.menu.paste') },
      { role: 'pasteAndMatchStyle', label: t('desktop.menu.pasteMatch') },
      { role: 'delete', label: t('desktop.menu.delete') },
      { role: 'selectAll', label: t('desktop.menu.selectAll') },
    ] },
    { label: t('desktop.menu.view'), submenu: [
      cmd(t('shell.ask'), 'mod+e'),
      cmd(t('desktop.menu.sidebar'), 'mod+s'), sep,
      cmd(t('shell.reload'), 'mod+r'), sep,
      { role: 'togglefullscreen', label: t('desktop.menu.fullScreen') },
      cmd(t('desktop.menu.actualSize'), 'mod+0', { enabled: (state.zoom ?? 1) !== 1 }),
      cmd(t('desktop.menu.zoomIn'), 'mod+=', { accel: 'CmdOrCtrl+Plus' }),
      cmd(t('desktop.menu.zoomOut'), 'mod+-'),
      ...(debugItems?.length ? [sep, ...debugItems] : []),
    ] },
    { label: t('desktop.menu.history'), submenu: [
      cmd(t('desktop.menu.home'), 'mod+shift+h'),
      cmd(t('shell.back'), 'mod+[', { enabled: !!h.canBack }),
      cmd(t('shell.forward'), 'mod+]', { enabled: !!h.canForward }),
      ...(h.closed?.length ? [sep, { type: 'header', label: t('desktop.menu.recentlyClosed') }, ...h.closed.map(c => ({ label: c.label, click: () => act('kit.tab.reopen', c.id) }))] : []),
      ...(h.recent?.length ? [sep, { type: 'header', label: t('desktop.menu.recentlyVisited') }, ...h.recent.map(c => ({ label: c.label, click: () => act('kit.navigate', { address: c.address }) }))] : []),
    ] },
    ...(has.bookmark ? [{ label: t('desktop.menu.bookmarks'), submenu: [cmd(t('desktop.menu.bookmarkTab'), 'mod+d')] }] : []),
    { label: t('desktop.menu.tab'), submenu: [
      tab(t('tab.newBelow'), 'kit.tab.new-below'),
      cmd(t('desktop.menu.nextTab'), 'ctrl+tab'),
      cmd(t('desktop.menu.prevTab'), 'ctrl+shift+tab'),
      tab(t('desktop.menu.duplicateTab'), 'kit.tab.duplicate'),
      ...(has.pin ? [tab(t('desktop.menu.pinTab'), 'kit.tab.pin')] : []),
      tab(t('tab.closeOthers'), 'kit.tab.close-others'),
      tab(t('tab.closeBelow'), 'kit.tab.close-below'),
      cmd(t('desktop.menu.searchTabs'), 'mod+shift+a'),
    ] },
    { role: 'window', label: t('desktop.menu.window'), submenu: [
      { role: 'minimize', label: t('desktop.menu.minimize') },
      { role: 'zoom', label: t('desktop.menu.zoom') }, sep,
      { role: 'front', label: t('desktop.menu.front') },
    ] },
  ];
  return Menu.buildFromTemplate(tpl);
}

module.exports = { buildAppMenu };
