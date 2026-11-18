import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './action-compare.js';
import { t } from '../core/i18n.js';

const options = [
  { id: 'up', title: 'raise-limit', kind: 'gitops', grade: { label: 'founded', kind: 'ok', icon: 'shield-check' }, change: 'memory 256Mi → 384Mi', reach: 'one-service', route: ['pr', 'merge', 'sync'] },
  { id: 'back', title: 'rollback <v2>', grade: { label: 'inferred', kind: 'warn' }, change: 'image v2 → v1', reach: 'all-users', note: 'loses-a-fix', disabled: true },
];

test('each option is a hairline row with its title, kind word, grade mark and pick button', () => {
  const m = render({ options, action: 'x.pick' }).s;
  assert.equal((m.match(/class="acm-o"/g) || []).length, 2);
  assert.match(m, /<b>raise-limit<\/b><span class="acm-k">gitops<\/span><span class="sti-text ok"/);
  assert.match(m, /<b>rollback &lt;v2&gt;<\/b><span class="sti-text warn"/);
  assert.match(m, /data-action="x.pick" data-arg="&quot;up&quot;"/);
});

test('the first option is recommended unless one is selected; a disabled option cannot be picked', () => {
  const first = render({ options, action: 'x.pick' }).s.split('class="acm-o"');
  assert.match(first[1], /btn default/); assert.match(first[2], /btn secondary/); assert.match(first[2], /disabled/);
  const sel = render({ options, action: 'x.pick', selected: 'back' }).s.split('class="acm-o"');
  assert.match(sel[1], /btn secondary/); assert.match(sel[2], /data-selected=""[\s\S]*btn default/);
});

test('change, reach, note and route are a name and value list with the route joined by arrows; empty ones are left out', () => {
  const m = render({ options, action: 'x.pick', labels: { reach: 'touches' } }).s;
  const dt = k => `<dt>${t('compare.' + k)}</dt>`;
  assert.ok(m.includes(`${dt('change')}<dd>memory 256Mi → 384Mi</dd><dt>touches</dt><dd>one-service</dd>${dt('route')}<dd><span class="acm-path"><span>pr</span><i>→</i><span>merge</span><i>→</i><span>sync</span></span></dd>`));
  assert.ok(m.includes(`${dt('note')}<dd>loses-a-fix</dd>`));
  assert.equal(m.split(dt('route')).length - 1, 1);
});

test('an option names its own rows where its value is not a change (a read-only check command)', () => {
  const m = render({ options: [{ ...options[0], labels: { change: 'check-command' } }, options[1]], action: 'x.pick' }).s.split('class="acm-o"');
  assert.match(m[1], /<dt>check-command<\/dt><dd>memory 256Mi → 384Mi<\/dd>/);
  assert.ok(m[2].includes(`<dt>${t('compare.change')}</dt><dd>image v2 → v1</dd>`), 'the other options keep the shared word');
});
