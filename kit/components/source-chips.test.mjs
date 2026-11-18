import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './source-chips.js';

const items = [
  { id: 'metrics', name: 'Metrics', icon: 'search', state: 'ok', detail: 'v2.5', last: '09:42' },
  { id: 'logs', name: 'Logs <x>', icon: 'search', state: 'error', detail: 'timeout' },
  { id: 'git', name: 'Git', icon: 'search', state: 'limited', arg: { page: 'tools' } },
  { id: 'p', name: 'P', icon: 'search', state: 'perm' }, { id: 'i', name: 'I', icon: 'search', state: 'idle' }, { id: 'b', name: 'B', icon: 'search', state: 'busy' },
];

test('each source is a pill button with its mark and name; connected shows no state, the rest the status mark and words', () => {
  const m = render({ items, action: 'x.go' }).s;
  assert.equal((m.match(/<button type="button" class="srcc-chip"/g) || []).length, 6);
  const chips = m.split('<button').slice(1);
  assert.doesNotMatch(chips[0], /status-icon/);
  assert.match(chips[1], /sti-text error[\s\S]*Disconnected/);
  assert.match(chips[2], /sti-text warn[\s\S]*Limited/);
  assert.match(chips[3], /sti-text perm/); assert.match(chips[4], /sti-text idle/); assert.match(chips[5], /sti-text busy/);
});

test('the chip emits its arg or id and its title names name, state, detail and last; text is escaped', () => {
  const m = render({ items, action: 'x.go' }).s;
  assert.match(m, /data-action="x.go" data-arg="&quot;metrics&quot;" title="Metrics · Connected · v2.5 · 09:42"/);
  assert.match(m, /data-arg="\{&quot;page&quot;:&quot;tools&quot;\}"/);
  assert.match(m, /<span>Logs &lt;x&gt;<\/span>/);
  assert.match(render({ items: items.slice(1, 2), action: 'x', labels: { states: { error: 'Down' } } }).s, /Down/);
});
