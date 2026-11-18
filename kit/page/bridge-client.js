/*
 * Page side of the bridge. Desktop: window.kitBridge from the preload; browser: postMessage with the parent window (same origin only).
 */
import { envelope, accept } from '../core/bridge-protocol.js';

export function createBridgeClient(win = window) {
  const subs = new Set();
  const pending = new Map();
  const deliver = msg => {
    if (!msg) return;
    if (msg.replyTo && pending.has(msg.replyTo)) { pending.get(msg.replyTo)(msg.payload); pending.delete(msg.replyTo); return; }
    subs.forEach(f => f(msg));
  };
  let post;
  if (win.kitBridge) {
    win.kitBridge.on(m => deliver(accept(m)));
    post = env => win.kitBridge.send(env);
  } else if (win.parent && win.parent !== win) {
    const o = win.location.origin;
    const loose = o === 'null' || !!win.__KIT_ADDRESS; // inside a srcdoc bundle the origin can be missing
    win.addEventListener('message', e => { if (e.source === win.parent && (loose || e.origin === o)) deliver(accept(e.data)); });
    post = env => win.parent.postMessage(env, loose ? '*' : o);
  } else {
    post = () => {}; // page opened on its own (for checks)
  }
  return {
    send(type, payload) { const env = envelope(type, payload); post(env); return env.id; },
    request(type, payload) { return new Promise(res => { const id = this.send(type, payload); pending.set(id, res); }); },
    on(f) { subs.add(f); return () => subs.delete(f); },
    standalone: !win.kitBridge && (!win.parent || win.parent === win),
  };
}
