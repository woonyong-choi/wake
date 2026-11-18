/*
 * Linux: no system material behind an Electron window, so only opaque window styles. The desktop picture: GNOME (gsettings
 * org.gnome.desktop.background picture-uri, picture-uri-dark first in a dark theme), else KDE Plasma (the last Image= of the desktop
 * applets config), else none.
 */
const path = require('node:path');

const fileOf = v => {
  const s = String(v || '').trim().replace(/^'(.*)'$/, '$1');
  if (s.startsWith('file://')) { try { return decodeURIComponent(new URL(s).pathname); } catch { return null; } }
  return s.startsWith('/') ? s : null;
};

module.exports = {
  fileOf,
  capabilities: () => ({ translucent: false, reason: 'linux' }),
  wallpaper: async ({ exec, exists, readFile, home, dark }) => {
    for (const key of dark ? ['picture-uri-dark', 'picture-uri'] : ['picture-uri']) {
      try { const p = fileOf(await exec('gsettings', ['get', 'org.gnome.desktop.background', key])); if (p && await exists(p)) return p; } catch { /* no GNOME settings */ }
    }
    try {
      const cfg = String(await readFile(path.posix.join(home || '', '.config', 'plasma-org.kde.plasma.desktop-appletsrc')));
      const last = [...cfg.matchAll(/^Image=(.+)$/gm)].pop();
      const p = last && fileOf(last[1]);
      if (p && await exists(p)) return p;
    } catch { /* no KDE config */ }
    return null;
  },
};
