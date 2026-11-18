import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import { accept, envelope } from './bridge-protocol.js';
import { createBridgeClient } from '../page/bridge-client.js';

test('accept_shell_desktop_info_or_null_preserves_envelope', () => {
  const infos = [
    { capabilities: { translucent: true, material: 'acrylic' }, wallpaper: 'data:image/jpeg;base64,AA==', dev: true, user: 'sample' },
    { capabilities: { translucent: false, reason: 'linux' }, wallpaper: null, dev: false, user: 'sample' },
    null,
  ];

  for (const info of infos) {
    const msg = envelope('shell:desktop', { info });

    assert.equal(accept(msg), msg);
  }
});

test('accept_shell_desktop_invalid_payload_returns_null', () => {
  const payloads = [undefined, null, [], 'desktop', 1, true, {},
    { info: undefined }, { info: [] }, { info: 'desktop' }, { info: 1 }, { info: false }];

  for (const payload of payloads) {
    const msg = { ...envelope('shell:desktop'), payload };

    assert.equal(accept(msg), null, JSON.stringify(payload));
  }
});

test('accept_shell_desktop_invalid_version_or_type_returns_null', () => {
  const msg = envelope('shell:desktop', { info: null });
  const invalid = [{ ...msg, v: 0 }, { ...msg, v: 2 }, { ...msg, v: '1' },
    { ...msg, v: undefined }, { ...msg, type: 'shell:unknown' }, { ...msg, type: null }];

  for (const value of invalid) assert.equal(accept(value), null);
});

test('desktop_bridge_delivers_valid_updates_and_preload_blocks_reverse_direction', () => {
  const exposed = {}, handlers = {}, sent = [], received = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } },
    ipcRenderer: {
      on: (name, handler) => { handlers[name] = handler; },
      send: (...args) => sent.push(args),
    },
  };
  runInNewContext(readFileSync(new URL('../desktop/preload-page.cjs', import.meta.url), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return electron; },
  });
  const bridge = createBridgeClient({ kitBridge: exposed.kitBridge });
  bridge.on(msg => received.push(msg));
  const update = envelope('shell:desktop', { info: { capabilities: { translucent: true }, wallpaper: null, dev: false, user: 'sample' } });
  const clear = envelope('shell:desktop', { info: null });

  handlers['kit:shell']({}, update);
  handlers['kit:shell']({}, envelope('shell:desktop', { info: [] }));
  handlers['kit:shell']({}, clear);
  bridge.send('shell:desktop', update.payload);
  bridge.send('page:ready', {});

  assert.deepEqual(received, [update, clear]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'kit:page');
  assert.equal(sent[0][1].type, 'page:ready');
});

test('browser_bridge_delivers_desktop_updates_only_from_same_origin_parent', () => {
  const received = [];
  let receive;
  const parent = {};
  const origin = 'https://sample.invalid';
  const bridge = createBridgeClient({ parent, location: { origin },
    addEventListener: (name, handler) => { assert.equal(name, 'message'); receive = handler; },
  });
  bridge.on(msg => received.push(msg));
  const update = envelope('shell:desktop', { info: null });

  receive({ source: {}, origin, data: update });
  receive({ source: parent, origin: 'https://other.invalid', data: update });
  receive({ source: parent, origin, data: envelope('shell:desktop', { info: true }) });
  receive({ source: parent, origin, data: update });

  assert.deepEqual(received, [update]);
});
