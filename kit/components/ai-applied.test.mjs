import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './ai-applied.js';

test('the row is a label, one removable round chip a value and an end link; no chips draws nothing', () => {
  const m = render({ label: 'applied', chips: [{ key: 'q', label: 'search "oom"' }, { key: 'range', label: '1h <x>' }], end: 'END', action: 'kit.screen.ai-reset' }).s;
  assert.match(m, /^<div class="aia" data-c="ai-applied"><span class="aia-l">applied<\/span>/);
  assert.equal((m.match(/btn secondary sm/g) || []).length, 2);
  assert.match(m, /data-action="kit.screen.ai-reset" data-arg="&quot;q&quot;"/);
  assert.match(m, /1h &lt;x&gt;/);
  assert.match(m, /<span class="aia-end">END<\/span><\/div>$/);
  assert.equal(render({ label: 'x', chips: [], action: 'a' }), '');
});
