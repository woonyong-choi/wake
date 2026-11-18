import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from './status-icon.js';

test('render_ok_text_keeps_accessible_name_without_visible_words', () => {
  const markup = render({ kind: 'ok', text: 'Healthy' }).s;
  assert.doesNotMatch(markup, /sti-text|>Healthy</);
  assert.match(markup, /role="img" aria-label="Healthy"/);
  assert.match(render({ kind: 'warn', text: 'Pending' }).s, /sti-text warn/);
  assert.match(render({ kind: 'ok', subject: 'error-rate' }).s, />error-rate<\/span>/);
});

test('the busy ring is drawn in the neutral muted tone, not the brand blue', async () => {
  const { css } = await import('./status-icon.js');
  const rule = css.match(/\.sti\.busy\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /color:\s*var\(--muted-foreground\)/);
  assert.doesNotMatch(rule, /brand/);
});
