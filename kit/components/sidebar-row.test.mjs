import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from './sidebar-row.js';

/* B3-13: every open tab's close button was named "Close tab", so a list of tabs had as many buttons with one name. Each names its tab */
test('a_tab_close_button_names_the_tab_it_closes', () => {
  const one = String(render({ label: 'events', closable: true, arg: 't1' }));
  assert.match(one, /class="x"[^>]*aria-label="Close tab, events"/);
  const halves = String(render({ halves: [{ label: 'pods', closable: true, arg: 'a' }, { label: 'logs', closable: true, arg: 'b' }] }));
  assert.deepEqual([...halves.matchAll(/class="x"[^>]*aria-label="([^"]*)"/g)].map(m => m[1]), ['Close tab, pods', 'Close tab, logs']);
  assert.match(String(render({ label: 'events', closable: true })), /data-tip="Close tab"/, 'the tooltip stays short');
});
