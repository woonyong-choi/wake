/*
 * Settings storage. Desktop shell: a JSON file in the main process (host.settings); browser: localStorage (keys prefixed with the app id).
 * Subscribers are notified on change. Reserved kit keys: kit.theme, kit.locale, kit.windowStyle, kit.session, kit.collapsed and the
 * behavior keys below (KIT_DEFAULTS); an app's settings defaults override them.
 */
export const KIT_DEFAULTS = {
  'kit.theme': 'dark',
  'kit.locale': 'system',         // the UI language: 'system' (the system's preferred languages) or a locale code the app has
  'kit.terminal.theme': 'app',
  'kit.terminal.font': 'app',
  'kit.terminal.appearances': [],
  'kit.chartLayer.sections': { table: false, events: false }, // which bars of a chart's large view are open (the table of lines, the event list); closed, each names what is at its top
  'kit.timeZone': 'system',         // the zone every time is written in: 'system' (the reader's own), 'utc' or an IANA name
  'kit.zoom': '1',                 // page zoom level of every tab (a ZOOM_STEPS value as text)
  'kit.tab.position': 'top',       // where a new tab goes in the tab list: 'top' | 'bottom'
  'kit.tab.switchOrder': 'recent', // ⌃⇥ order: 'recent' (most recently used) | 'sidebar'
  'kit.shortcuts': {},             // shortcut id -> keys ('mod+shift+e') or null (removed)
  'kit.ai.followUp': 'queue',      // a message sent while the AI works: 'queue' | 'steer'
  'kit.ai.notify': ['attention', 'done'], // system notifications while the window is in the background
  'kit.ai.sound': true,            // completion sound
  'kit.spellcheck': true,          // spell check in text fields (desktop)
  'kit.startup': 'restore',        // what a new window opens with: 'restore' (the last tabs, when the app keeps sessions) | 'new' (the start address)
  'kit.openAtLogin': false,        // open the app when the user logs in (desktop, packaged app)
};
export function createSettingsStore(appId, defaults = {}, backend) {
  const key = `${appId}:settings`;
  let values = { ...KIT_DEFAULTS, ...defaults };
  const subs = new Set();
  const load = () => {
    try {
      const raw = backend ? backend.load() : localStorage.getItem(key);
      if (raw) values = { ...values, ...(typeof raw === 'string' ? JSON.parse(raw) : raw) };
    } catch { /* storage unavailable: use defaults */ }
  };
  const save = () => {
    try { if (backend) backend.save(values); else localStorage.setItem(key, JSON.stringify(values)); } catch { /* a failed save does not affect the screen */ }
  };
  load();
  return {
    get: k => values[k],
    all: () => ({ ...values }),
    set(k, v) { if (values[k] === v) return; values = { ...values, [k]: v }; save(); subs.forEach(f => f(k, v, values)); },
    setMany(patch) {
      if (Object.entries(patch).every(([key, value]) => values[key] === value)) return false;
      values = { ...values, ...patch }; save(); subs.forEach(f => f(null, null, values)); return true;
    },
    replace(all) { values = { ...values, ...all }; subs.forEach(f => f(null, null, values)); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}
