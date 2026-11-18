/* macOS: window glass or vibrancy is always available; the desktop picture comes from the native helper (NSWorkspace) */
module.exports = {
  capabilities: () => ({ translucent: true }),
  wallpaper: async ({ native }) => { try { return native?.desktopImagePath?.() || null; } catch { return null; } },
};
