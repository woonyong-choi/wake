/*
 * Shell document preload. Exposes only window.kitShell (allowed channels only).
 */
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set(['dictation:start', 'tabs:create', 'tabs:navigate', 'tabs:back', 'tabs:forward', 'tabs:reload', 'tabs:show', 'tabs:focus', 'tabs:close', 'tabs:send', 'tabs:broadcast', 'tabs:layout', 'window:new', 'tabs:freeze', 'tabs:thaw', 'tabs:preview', 'menu:popup', 'settings:save', 'shortcuts:set', 'theme:set', 'window:style', 'tabs:zoom', 'tabs:mute', 'menu:state', 'app:quit', 'app:quit-cancel', 'shell:focus', 'surface:open', 'shortcuts:suspend', 'spellcheck:set', 'login:set', 'pty:open', 'pty:run', 'pty:write', 'pty:resize', 'pty:close', 'locale:set', 'desktop:info', 'service:call']);
const EVENTS = new Set(['tab-message', 'tab-state', 'tab-focus', 'shortcut', 'action', 'theme', 'quit-request', 'surface-choice', 'surface-closed', 'desktop', 'service-event', 'pty-data', 'pty-command', 'pty-exit']);

contextBridge.exposeInMainWorld('kitShell', {
  invoke: (channel, ...args) => INVOKE.has(channel) ? ipcRenderer.invoke('kit:' + channel, ...args) : Promise.reject(new Error('channel not allowed')),
  on: (event, cb) => { if (EVENTS.has(event)) ipcRenderer.on('kit:' + event, (_e, ...args) => cb(...args)); },
  settingsBackend: {
    load: () => ipcRenderer.sendSync('kit:settings:load'),
    save: values => ipcRenderer.invoke('kit:settings:save', values),
  },
});
