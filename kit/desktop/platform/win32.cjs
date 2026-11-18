/*
 * Windows: Windows 11 (build 22000 and later) draws a system material behind the window (BrowserWindow backgroundMaterial); Windows 10
 * has none, so only opaque window styles. The desktop picture is the WallPaper value in HKCU\Control Panel\Desktop (what
 * SystemParametersInfo SPI_GETDESKWALLPAPER reads), else the transcoded copy Windows keeps under %APPDATA%\Microsoft\Windows\Themes.
 */
const path = require('node:path');
const os = require('node:os');

const build = release => Number(String(release || '').split('.')[2]) || 0;

module.exports = {
  capabilities: ({ release = os.release() } = {}) => build(release) >= 22000 ? { translucent: true, material: 'acrylic' } : { translucent: false, reason: 'windows10' },
  wallpaper: async ({ exec, exists, env = {} }) => {
    try {
      const out = await exec('reg', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper']);
      const m = String(out).match(/WallPaper\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      const p = m && m[1].trim().replace(/%([^%]+)%/g, (_, k) => env[k] ?? '');
      if (p && await exists(p)) return p;
    } catch { /* no registry value */ }
    if (!env.APPDATA) return null;
    const t = path.win32.join(env.APPDATA, 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
    return (await exists(t)) ? t : null;
  },
};
