import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRAND_GLYPHS } from './brand-glyphs.js';

/* the drawing elements of a mark, in order: the owner's file has these and nothing more (NOTICE.md) */
const shapes = svg => [...svg.matchAll(/<(path|circle|rect|ellipse|polygon|image)\b/g)].map(m => m[1]);

test('github_and_prometheus_marks_are_the_official_drawing_without_an_added_backing_shape', () => {
  assert.deepEqual({ github: shapes(BRAND_GLYPHS['brand-github'].svg), prometheus: shapes(BRAND_GLYPHS['brand-prometheus'].svg) },
    { github: ['path'], prometheus: ['path'] }, 'the official marks have no shape added under them');
  assert.doesNotMatch(Object.values(BRAND_GLYPHS).map(g => g.svg).join(''), /--brand-hole/, 'no mark takes a backing colour from the app');
});
