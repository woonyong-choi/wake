import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rawValues } from './raw-values.mjs';

test('raw_values_report_literal_lengths_and_colors', () => {
  assert.deepEqual(rawValues('width: 320px; color: #fff; background: rgb(1, 2, 3);'), ['320px', '#fff', 'rgb(']);
  assert.deepEqual(rawValues("el.style.color = 'oklch(0.7 0.2 20)'"), ['oklch(']);
  assert.deepEqual(rawValues('border: 1px solid; margin: 0px'), [], '0px and 1px are not raw');
  assert.deepEqual(rawValues('@media (max-width: 720px) {'), [], 'breakpoints cannot use custom properties');
  assert.deepEqual(rawValues('a &#x2014; b'), [], 'an HTML character reference');
});

test('raw_values_report_a_color_function_even_when_written_from_interpolations', () => {
  // an interpolation can hold a literal or a hard-coded constant: the rule does not look inside it, an excused line is listed by its text
  for (const line of ['return `rgb(${r}, ${g}, ${b})`;', '`rgb(${255}, ${0}, ${0})`', "`rgb(${'255'}, ${'0'}, ${'0'})`", '`oklch(${0.7} ${0.2} ${20})`',
    '`rgb(${a ? 255 : 0}, ${0}, ${0})`', '`rgb(${"255, 0, 0"})`', '`rgb(${BRAND[0]}, ${BRAND[1]}, ${BRAND[2]})`']) assert.deepEqual(rawValues(line), [line.includes('oklch') ? 'oklch(' : 'rgb('], line);
  assert.deepEqual(rawValues('`#${hex}` + "#000"'), ['#000']);
  assert.deepEqual(rawValues('`${n}px` + "12px"'), ['12px']);
});

test('raw_allow_entries_each_name_one_raw_line_that_writes_a_computed_color', () => {
  const allow = JSON.parse(readFileSync(new URL('./raw-allow.json', import.meta.url), 'utf8'));
  assert.deepEqual(allow.map(a => a.file), ['kit/core/temporal-chart.js', 'kit/core/temporal-chart.js', 'kit/core/temporal-chart.test.mjs'], 'a new excused line is a reviewed change to this list');
  for (const a of allow) {
    const lines = readFileSync(new URL(`../../${a.file}`, import.meta.url), 'utf8').split('\n').filter(l => l.trim() === a.line);
    assert.equal(lines.length, 1, a.line);
    assert.ok(rawValues(lines[0]).length, `the entry is needed: ${a.line}`);
    assert.doesNotMatch(a.line, /\$\{\s*['"\d]|\b[A-Z_]{2,}\b/, `no literal or constant inside the interpolations: ${a.line}`);
    assert.ok(a.why, 'each entry says why');
  }
});
