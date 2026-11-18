import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTabs } from './tabs.js';
import { accept, envelope } from '../core/bridge-protocol.js';

function withList() {
  const tabs = createTabs(null);
  const list = tabs.open('app://list');
  return { tabs, list };
}

test('overlay: found like a tab, presented over its active source, and never listed or saved', () => {
  const { tabs, list } = withList();
  const overlay = tabs.openOverlay(list.id, 'app://detail/one');
  assert.equal(tabs.find(overlay.id), overlay);
  assert.equal(tabs.presented(), overlay);
  assert.equal(tabs.active(), list);
  assert.equal(tabs.state.active, list.id);
  assert.deepEqual(tabs.state.tabs, [list]);
  assert.equal(JSON.stringify(tabs.serialize()).includes('detail/one'), false);
  const other = tabs.open('app://other');
  assert.equal(tabs.presented(), other); // another tab is open: its own overlay (none) decides
});

test('overlay: another row replaces the root entry, history steps stay inside the overlay and back at the root is allowed', () => {
  const { tabs, list } = withList();
  const overlay = tabs.openOverlay(list.id, 'app://detail/one');
  assert.equal(tabs.canBack(overlay), true); // back at the root closes the overlay
  assert.equal(tabs.ownStep(overlay, -1), false);
  tabs.push(overlay.id, 'app://detail/one/events');
  assert.equal(tabs.ownStep(overlay, -1), true);
  assert.equal(tabs.go(overlay.id, -1), 'app://detail/one');
  assert.equal(tabs.openOverlay(list.id, 'app://detail/two'), overlay);
  assert.deepEqual(overlay.entries.map(e => e.address), ['app://detail/two']);
  assert.equal(tabs.state.overlays.length, 1);
  assert.deepEqual(list.entries.map(e => e.address), ['app://list']); // the list's own history is untouched
});

test('overlay: only a page tab can have one, and closing it leaves the list as the presented tab', () => {
  const { tabs, list } = withList();
  const tool = tabs.open('https://tool.example', { kind: 'tool' });
  assert.equal(tabs.openOverlay(tool.id, 'app://detail/one'), null);
  assert.equal(tabs.openOverlay('missing', 'app://detail/one'), null);
  tabs.state.active = list.id;
  const overlay = tabs.openOverlay(list.id, 'app://detail/one');
  assert.equal(tabs.closeOverlay(overlay.id), overlay);
  assert.equal(tabs.find(overlay.id), undefined);
  assert.equal(tabs.presented(), list);
  assert.equal(tabs.closeOverlay(overlay.id), null);
});

test('bridge: detail presentation, overlay commands and the overlay state are the only new messages', () => {
  assert.ok(accept(envelope('page:navigate', { address: 'app://x', presentation: 'detail' })));
  assert.equal(accept(envelope('page:navigate', { address: 'app://x', presentation: 'popup' })), null);
  for (const op of ['back', 'close', 'expand', 'collapse']) assert.ok(accept(envelope('page:detail', { op })));
  assert.equal(accept(envelope('page:detail', { op: 'open' })), null);
  assert.ok(accept(envelope('shell:detail', { state: 'open', expanded: false })));
  assert.ok(accept(envelope('shell:detail', { state: 'closed' })));
  assert.equal(accept(envelope('shell:detail', { state: 'moving' })), null);
  assert.ok(accept(envelope('shell:ask-context', { context: { icon: 'globe' } })));
  assert.ok(accept(envelope('shell:ask-context', { context: null })));
  assert.equal(accept(envelope('shell:ask-context', { context: 'globe' })), null);
});

test('overlay: a detail inserted under the conversation sits between the body and it; closing it lets the conversation sit on the body again', () => {
  const { tabs, list } = withList();
  const ai = tabs.openOverlay(list.id, 'app://chat/new');
  assert.equal(tabs.presented(), ai);
  const detail = tabs.openOverlay(list.id, 'app://detail/one', { insert: true });
  assert.notEqual(detail, ai);
  assert.equal(ai.source, detail.id);
  assert.equal(tabs.overlayOf(list.id), detail);
  assert.equal(tabs.presented(), ai); // the conversation is still the last card
  assert.equal(tabs.closeOverlay(detail.id), detail);
  assert.equal(ai.source, list.id);
  assert.equal(tabs.presented(), ai);
});

test('overlay: the conversation may sit on a tool tab (asked from a tool page it opens beside it), a detail never does', () => {
  const { tabs } = withList();
  const tool = tabs.open('https://tool.example', { kind: 'tool' });
  assert.equal(tabs.openOverlay(tool.id, 'app://detail/one'), null);
  const ai = tabs.openOverlay(tool.id, 'app://chat/new', { onTool: true });
  assert.ok(ai);
  assert.equal(ai.source, tool.id);
  assert.equal(tabs.presented(), ai);
  assert.equal(tabs.active(), tool, 'the tool stays the open tab: the conversation is a card beside it');
  assert.equal(tabs.closeOverlay(ai.id), ai);
  assert.equal(tabs.presented(), tool);
});

/* B-28: a closed tab came back at the end of the list, not where it was (⌘⇧T after closing the second of four tabs put it fourth) */
test('reopened_tab_returns_to_the_place_it_was_closed_from', () => {
  const t = createTabs();
  const [a, b, c, d] = ['w://a', 'w://b', 'w://c', 'w://d'].map(x => t.open(x));
  t.close(b.id);
  assert.deepEqual(t.state.tabs.map(x => x.id), [a.id, c.id, d.id]);
  t.reopen();
  assert.deepEqual(t.state.tabs.map(x => x.id), [a.id, b.id, c.id, d.id], 'back in its own place');
  t.close(d.id); t.close(a.id); t.reopen();
  assert.equal(t.state.tabs[0].id, a.id, 'the first tab comes back first');
});
