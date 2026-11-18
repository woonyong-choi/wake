/*
 * A review run behind the person's own work (KIT_BACKGROUND=1, set only when a checker launches the app):
 * the app never takes the front or the focus, has no Dock icon, and its windows stay fully transparent and let clicks
 * through, while the pages keep drawing (launch with --disable-backgrounding-occluded-windows) so a checker reads and
 * captures them through the DevTools protocol. Without the variable every call is the normal one.
 */
const on = (env = process.env) => env.KIT_BACKGROUND === '1';

/** before any window: an accessory app on macOS (no Dock icon, never activated) */
function prepare(app, env) {
  if (on(env) && process.platform === 'darwin') app.setActivationPolicy?.('accessory');
}

/** show a window: in a background run it shows without taking the front or the focus, invisible and click-through */
function present(win, { focus = false } = {}, env) {
  if (on(env)) {
    win.setOpacity?.(0);
    win.setIgnoreMouseEvents?.(true);
    win.showInactive();
    return;
  }
  win.setOpacity?.(1);
  win.show();
  if (focus) win.focus();
}

module.exports = { on, prepare, present };
