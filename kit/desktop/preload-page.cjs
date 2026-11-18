/*
 * Tab page preload (in-app pages only, never on external tool pages). Exposes only window.kitBridge.send/on/boot and window.kitService
 * (the app's main-process services: call(name, args), on(cb(event, payload))). boot() answers what the first drawing needs (the main
 * process's kit:page:boot: app id, tab id, theme, language, stored settings) so a page draws before the shell's init arrives.
 */
const { contextBridge, ipcRenderer } = require('electron');

/* the same page -> shell types as kit/core/bridge-protocol.js MESSAGES (an app action on a page button runs in the shell: page:action) */
const PAGE_TYPES = ['page:ready', 'page:meta', 'page:navigate', 'page:detail', 'page:open-panel', 'page:open-tool', 'page:toast', 'page:notify', 'page:context-menu', 'page:shortcut', 'page:shortcuts-suspend', 'page:dictate', 'page:action', 'page:setting-set', 'page:state', 'page:error', 'page:scrim'];

contextBridge.exposeInMainWorld('kitBridge', {
  send: env => { if (env && PAGE_TYPES.includes(env.type)) ipcRenderer.send('kit:page', env); },
  on: cb => ipcRenderer.on('kit:shell', (_e, env) => cb(env)),
  boot: () => ipcRenderer.sendSync('kit:page:boot'),
});

contextBridge.exposeInMainWorld('kitService', {
  call: (name, args) => ipcRenderer.invoke('kit:service:call', name, args),
  on: cb => ipcRenderer.on('kit:service-event', (_e, event, payload) => cb(event, payload)),
});
