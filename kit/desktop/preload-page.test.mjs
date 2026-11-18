/* The tab page preload lets through exactly the page -> shell messages of the bridge protocol (a missing one is dropped silently) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MESSAGES } from '../core/bridge-protocol.js';

test('preload page types match the protocol', () => {
  const src = readFileSync(new URL('./preload-page.cjs', import.meta.url), 'utf8');
  const list = JSON.parse(/const PAGE_TYPES = (\[[^\]]*\])/.exec(src)[1].replace(/'/g, '"'));
  assert.deepEqual([...list].sort(), Object.keys(MESSAGES).filter(k => k.startsWith('page:')).sort());
});
