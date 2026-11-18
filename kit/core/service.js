/*
 * App services: functions the app runs in the desktop main process (desktop config `services`), reached from the shell document
 * (window.kitShell) and from tab pages (window.kitService). In a browser there is no main process: hasService() is false and the
 * app shows that its sources are not connected.
 *   service(name, args) -> Promise<result>   onService(cb(event, payload))   hasService()
 */
const bridge = () => globalThis.kitService || (globalThis.kitShell ? { call: (n, a) => globalThis.kitShell.invoke('service:call', n, a), on: cb => globalThis.kitShell.on('service-event', cb) } : null);

export const hasService = () => !!bridge();
export function service(name, args) {
  const b = bridge();
  return b ? b.call(name, args) : Promise.reject(new Error('no service host'));
}
const listeners = new Set();
let wired = false;
export function onService(cb) {
  const b = bridge(); if (!b) return () => {};
  if (!wired) { wired = true; b.on((event, payload) => { for (const f of listeners) f(event, payload); }); }
  listeners.add(cb);
  return () => listeners.delete(cb);
}
