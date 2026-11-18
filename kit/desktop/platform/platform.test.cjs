/* Platform adapter tests with every system call replaced: node --test kit/desktop/platform/platform.test.cjs */
const test = require('node:test');
const assert = require('node:assert');
const win = require('./win32.cjs'), linux = require('./linux.cjs'), mac = require('./darwin.cjs');

const sys = (files, out = {}) => ({
  exec: async (f, a) => { const k = [f, ...a].join(' '); if (!(k in out)) throw new Error('no command'); return out[k]; },
  exists: async p => files.includes(p),
  readFile: async p => { if (!(p in out)) throw new Error('no file'); return out[p]; },
  env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, home: '/home/a',
});

test('windows 11 has a material, windows 10 does not', () => {
  assert.deepStrictEqual(win.capabilities({ release: '10.0.22631' }), { translucent: true, material: 'acrylic' });
  assert.deepStrictEqual(win.capabilities({ release: '10.0.19045' }), { translucent: false, reason: 'windows10' });
});
test('windows wallpaper from the registry', async () => {
  const p = 'C:\\Users\\a\\Pictures\\sea.jpg';
  const s = sys([p], { 'reg query HKCU\\Control Panel\\Desktop /v WallPaper': `\r\nHKEY_CURRENT_USER\\Control Panel\\Desktop\r\n    WallPaper    REG_SZ    ${p}\r\n` });
  assert.strictEqual(await win.wallpaper(s), p);
});
test('windows wallpaper falls back to the transcoded copy', async () => {
  const t = 'C:\\Users\\a\\AppData\\Roaming\\Microsoft\\Windows\\Themes\\TranscodedWallpaper';
  assert.strictEqual(await win.wallpaper(sys([t], { 'reg query HKCU\\Control Panel\\Desktop /v WallPaper': '    WallPaper    REG_SZ    \r\n' })), t);
  assert.strictEqual(await win.wallpaper(sys([])), null);
});
test('linux is opaque only', () => assert.deepStrictEqual(linux.capabilities(), { translucent: false, reason: 'linux' }));
test('gnome picture-uri, dark first in a dark theme', async () => {
  const out = { 'gsettings get org.gnome.desktop.background picture-uri': "'file:///usr/share/backgrounds/light%20one.png'\n", 'gsettings get org.gnome.desktop.background picture-uri-dark': "'file:///usr/share/backgrounds/dark.png'\n" };
  const files = ['/usr/share/backgrounds/light one.png', '/usr/share/backgrounds/dark.png'];
  assert.strictEqual(await linux.wallpaper({ ...sys(files, out), dark: false }), '/usr/share/backgrounds/light one.png');
  assert.strictEqual(await linux.wallpaper({ ...sys(files, out), dark: true }), '/usr/share/backgrounds/dark.png');
});
test('kde applets config, then none', async () => {
  const cfg = '[Containments][1][Wallpaper][org.kde.image][General]\nImage=file:///home/a/Pictures/hill.jpg\n';
  assert.strictEqual(await linux.wallpaper(sys(['/home/a/Pictures/hill.jpg'], { '/home/a/.config/plasma-org.kde.plasma.desktop-appletsrc': cfg })), '/home/a/Pictures/hill.jpg');
  assert.strictEqual(await linux.wallpaper(sys([])), null);
});
test('macos reads the native helper and survives its absence', async () => {
  assert.strictEqual(await mac.wallpaper({ native: { desktopImagePath: () => '/System/Library/Desktop Pictures/x.heic' } }), '/System/Library/Desktop Pictures/x.heic');
  assert.strictEqual(await mac.wallpaper({ native: { desktopImagePath: () => '' } }), null);
  assert.strictEqual(await mac.wallpaper({ native: null }), null);
});
