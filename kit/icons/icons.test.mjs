import assert from 'node:assert/strict';
import { test } from 'node:test';

const RENAMED_SLOTS = Object.freeze([
  ['pencil-2', 'new-chat'],
  ['key-2', 'credentials'],
  ['sparkles-two-2', 'ai'],
  ['sparkles-two-2-fill', 'ai-active'],
  ['checkmark-2-medium', 'check'],
  ['dot-grid-1-x-3-horizontal-tight', 'more'],
  ['settings-gear', 'settings'],
  ['settings-gear-fill', 'settings-active'],
  ['magnifying-glass', 'search'],
  ['magnifying-glass-plus', 'zoom-in'],
  ['shield-check-3', 'shield-check'],
]);

test('icon_legacy_slots_render_current_glyphs_and_attributes', async () => {
  const { icon, favicon, hasIcon } = await import('./icons.js?legacy-parity');

  for (const [legacy, current] of RENAMED_SLOTS) {
    assert.equal(hasIcon(legacy), true, legacy);
    assert.equal(hasIcon(current), true, current);
    for (const size of ['xs', 'sm', 'md', 'lg', 'xl']) {
      const rendered = icon(legacy, size, 'custom').s;
      assert.equal(rendered, icon(current, size, 'custom').s, legacy);
      assert.ok(rendered.includes(`data-icon="${current}"`), legacy);
    }
    const tile = favicon(legacy, 'xl').s;
    assert.equal(tile, favicon(current, 'xl').s, legacy);
    assert.ok(tile.includes(`data-fav="${current}"`), legacy);
  }
});

test('extendIcons_direct_app_entries_override_legacy_alias_fallback', async () => {
  const { icon, favicon, hasIcon, extendGlyphs, extendIcons } = await import('./icons.js?app-overrides');
  extendGlyphs({
    'custom-search': { viewBox: '0 0 16 16', svg: '<path d="M1 1h6v6H1z"/>' },
    'custom-legacy': { viewBox: '0 0 12 12', svg: '<path d="M2 2h4v4H2z"/>' },
  });
  extendIcons({ search: ['custom-search', 0] });
  const current = icon('search').s;
  assert.equal(icon('magnifying-glass').s, current);

  extendIcons({ 'magnifying-glass': ['custom-legacy', 0] });

  const legacy = icon('magnifying-glass').s;
  assert.ok(legacy.includes('viewBox="0 0 12 12"'));
  assert.ok(legacy.includes('<path d="M2 2h4v4H2z"/>'));
  assert.ok(legacy.includes('data-icon="search"'));
  assert.ok(favicon('magnifying-glass').s.includes('data-fav="search"'));
  assert.equal(hasIcon('magnifying-glass'), true);
  assert.equal(icon('search').s, current);
});

test('icon_unknown_slots_throw_and_hasIcon_rejects_inherited_names', async () => {
  const { icon, favicon, hasIcon } = await import('./icons.js?unknown-slots');

  for (const name of ['missing-slot', '', 'toString', 'constructor', '__proto__']) {
    assert.equal(hasIcon(name), false, name);
    assert.throws(() => icon(name), { message: `unknown icon slot: ${name}` });
    assert.throws(() => favicon(name), { message: `unknown icon slot: ${name}` });
  }
});

test('icon_terminal_renders_the_preserved_borderless_prompt_at_every_size', async () => {
  const { icon } = await import('./icons.js?terminal-restoration');

  for (const size of ['xs', 'sm', 'md', 'lg', 'xl']) {
    const rendered = icon('terminal', size).s;
    assert.ok(rendered.includes('<polyline points="4 17 10 11 4 5"/>'));
    assert.ok(rendered.includes('<line x1="12" x2="20" y1="19" y2="19"/>'));
    assert.ok(rendered.includes('stroke-width="1.5"'));
    assert.equal(rendered.includes('<rect'), false);
  }
});

test('a drawing that names its own parts is drawn as a picture of itself, so every copy is whole; others stay inline', async () => {
  const { extendGlyphs, extendIcons, icon } = await import('./icons.js');
  extendGlyphs({ 'own-grad': { viewBox: '0 0 10 10', svg: '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="10" height="10" fill="url(#g1)"/>' },
    'own-flat': { viewBox: '0 0 10 10', svg: '<rect width="10" height="10" fill="green"/>' } });
  extendIcons({ 'own-grad': ['own-grad', 0], 'own-flat': ['own-flat', 0] });
  const a = icon('own-grad', 'lg').s, b = icon('own-grad', 'lg').s;
  assert.match(a, /^<img class="wi wi-lg" src="data:image\/svg\+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22[^"]*" alt="" aria-hidden="true" data-icon="own-grad">$/);
  assert.equal(a, b, 'the same picture every time (a redraw changes nothing)');
  assert.ok(decodeURIComponent(a.match(/src="([^"]*)"/)[1].slice('data:image/svg+xml,'.length)).includes('fill="url(#g1)"'), 'the drawing is unchanged');
  assert.match(icon('own-flat').s, /^<svg class="wi" viewBox="0 0 10 10"/);
});
