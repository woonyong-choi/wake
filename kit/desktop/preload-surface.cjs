/*
 * Floating surface document preload (main.cjs openSurface). Exposes only window.kitSurface: the menu definition it shows, and the
 * messages it may send back (size, choice, side submenu, close).
 */
const { contextBridge, ipcRenderer } = require('electron');

const SEND = new Set(['ready', 'size', 'choose', 'sub', 'close-sub', 'close']);

contextBridge.exposeInMainWorld('kitSurface', {
  send: (event, payload) => { if (SEND.has(event)) ipcRenderer.send('kit:surface', event, payload); },
  onDef: cb => ipcRenderer.on('kit:surface-def', (_e, p) => cb(p)),
});
