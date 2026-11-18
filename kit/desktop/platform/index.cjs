/*
 * Platform adapter (Electron main process): one interface, one file per platform.
 *   capabilities({ release? }) -> { translucent: boolean, material?: string, reason?: string }
 *       translucent: the window background can show what is behind it (a window style with glass or material); reason when it cannot
 *       (a locale key suffix: desktop.unavailable.<reason>); material: the system material name where the platform needs one (Windows).
 *   wallpaper(sys) -> Promise<string | null>   the file of the current desktop picture, null when it cannot be read (the kit then draws its
 *       own artwork). sys: { exec(file, args) -> Promise<stdout>, exists(path), readFile(path), env, home, dark, native } so tests can
 *       replace every system call.
 */
const adapters = { darwin: './darwin.cjs', win32: './win32.cjs', linux: './linux.cjs' };
const forPlatform = platform => require(adapters[platform] || './linux.cjs');

module.exports = { forPlatform, ...forPlatform(process.platform) };
