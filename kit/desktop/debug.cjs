/*
 * Debug-only aids for development runs. main.cjs loads this module only when the app is not packaged (KIT_DEBUG=0 leaves it out to preview
 * the release); nothing else may reach these aids, and a release package leaves this file out (kit/tools/check-release.mjs checks both).
 *   createDebug({ windows, applyLook, loadNative }) -> { diag, log(o), nativeInfo(handle), menu({ t, act, firstRun }) }
 *   KIT_DESKTOP_DIAG=<file>: appends window shape and floating surface events to that file, for measuring on the screen.
 *   KIT_DESKTOP_BACKDROP=<file> (with KIT_DESKTOP_DIAG): a calibration backdrop behind the windows (below), with the native material probes.
 *   menu(): View menu items — Developer Tools, Emulate Reduced Motion (Chromium media emulation for every document, the system setting
 *           stays as it is) and, when the app has a first-run flow, Show First Run Again (kit.firstRun.open).
 */
const { app, BrowserWindow, screen, webContents } = require('electron');
const fs = require('node:fs');

function createDebug({ windows, applyLook, loadNative }) {
  const diag = process.env.KIT_DESKTOP_DIAG || '';
  const log = o => { if (diag) try { fs.appendFileSync(diag, JSON.stringify(o) + '\n'); } catch { /* measurement only */ } };

  /* KIT_DESKTOP_BACKDROP=<file> (with KIT_DESKTOP_DIAG): a plain window of the color written in that file (empty: none;
     several backgrounds separated by '|': horizontal bands) behind
     the app windows, to measure how the window material responds to a known background (white, black, a saturated color). Optional
     'material=<vibrancy>' and 'tint=<css color without spaces>' words try another window material and color layer for the fit */
  if (diag && process.env.KIT_DESKTOP_BACKDROP) {
    let backdrop = null;
    const file = process.env.KIT_DESKTOP_BACKDROP;
    const apply = async () => {
      let words = []; try { words = fs.readFileSync(file, 'utf8').trim().split(/\s+/).filter(Boolean); } catch { /* no file: none */ }
      const opt = k => words.find(w => w.startsWith(k + '='))?.slice(k.length + 1);
      const color = words.find(w => !w.includes('=')) || '';
      // 'glass=<json>', 'material=', 'tint=', 'background=' (none: '-') replace the style's values while measuring
      const over = {};
      for (const k of ['material', 'tint', 'background']) if (opt(k)) over[k] = opt(k) === '-' ? null : opt(k);
      if (opt('glass')) over.glass = opt('glass') === '-' ? null : JSON.parse(opt('glass'));
      for (const W of windows) {
        applyLook(W, over);
        const native = loadNative();
        if (native && opt('tune')) log({ tuned: native.tuneMaterial(W.win.getNativeWindowHandle(), opt('tune')) });
        if (native && words.includes('info')) log({ material: JSON.parse(native.materialInfo(W.win.getNativeWindowHandle())) });
      }
      log({ calibrate: words });
      if (!color) { backdrop?.destroy(); backdrop = null; return; }
      // several backgrounds (white|black|red, any CSS background without spaces): horizontal bands of equal height, measured in one capture
      const bands = color.split('|');
      if (!backdrop || backdrop.isDestroyed()) {
        const area = screen.getPrimaryDisplay().workArea;
        backdrop = new BrowserWindow({ ...area, frame: false, focusable: false, hasShadow: false, resizable: false, movable: false, skipTaskbar: true, show: false, backgroundColor: '#000' });
        backdrop.showInactive();
      } else backdrop.moveTop();
      backdrop.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;height:100vh;display:flex;flex-direction:column">${bands.map(c => `<div style="flex:1;background:${c}"></div>`).join('')}`));
      for (const W of windows) W.win.moveTop();
    };
    app.whenReady().then(() => { fs.watchFile(file, { interval: 300 }, apply); setTimeout(apply, 1500); });
  }


  let reduced = false;
  const emulateReduced = () => {
    for (const wc of webContents.getAllWebContents()) {
      try { if (!wc.debugger.isAttached()) wc.debugger.attach('1.3'); wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : '' }] }).catch(() => {}); }
      catch { /* a document with the developer tools open keeps its own emulation */ }
    }
  };
  /* tab documents opened later follow the same emulation */
  app.on('web-contents-created', (_e, wc) => wc.once('dom-ready', () => { if (reduced) emulateReduced(); }));
  return {
    diag: !!diag,
    log,
    nativeInfo: h => loadNative()?.info(h) ?? null,
    menu: ({ t, act, firstRun }) => [
      { label: t('desktop.menu.devtools'), accelerator: 'Alt+CmdOrCtrl+I', click: () => webContents.getFocusedWebContents()?.toggleDevTools() },
      /* reduced motion without touching the system setting: every window and tab document is told prefers-reduced-motion: reduce (Chromium media emulation) */
      { label: t('desktop.menu.reducedMotion'), type: 'checkbox', checked: reduced, click: item => { reduced = item.checked; emulateReduced(); } },
      ...(firstRun ? [{ label: t('desktop.menu.firstRun'), click: () => act('kit.firstRun.open') }] : []),
    ],
  };
}

module.exports = { createDebug };
