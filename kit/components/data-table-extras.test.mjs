import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './data-table.js';

const columns = [{ id: 'name', label: 'n', sub: row => row.ns }, { id: 'ask', label: '', rowButton: { icon: 'sparkles-two-2', tip: 'tip', action: 'row.ask' } }];
const rows = [{ id: 'a/1', name: 'one', ns: 'ns-one' }, { id: 'a/2', name: 'two', ns: '' }];

test('a column with a sub line draws it under the value and every row keeps one height class', () => {
  const markup = render({ columns, rows, rowKey: 'id' }).s;
  assert.match(markup, /dt-host dt-two/);
  assert.match(markup, /<small class="dt-sub">ns-one<\/small>/);
  assert.equal((markup.match(/dt-sub/g) || []).length, 1, 'an empty sub line draws nothing');
});

test('a row button shows on hover, carries the row key and leaves the row press alone', () => {
  const markup = render({ columns, rows, rowKey: 'id', rowAction: 'row.open' }).s;
  assert.equal((markup.match(/class="reveal-host"/g) || []).length, 2);
  assert.match(markup, /class="dt-act"><span class="reveal">/);
  assert.match(markup, /data-action="row.ask" data-arg="&quot;a\/1&quot;"/);
});

test('the open row stays marked through activeKey', () => {
  const markup = render({ columns: [columns[0]], rows, rowKey: 'id', activeKey: 'a/2' }).s;
  assert.match(markup, /aria-selected="false"/);
  assert.match(markup, /aria-selected="true"/);
});

test('a name column leads with a dot or a kind icon, a figure column is a left tabular figure, a time column is quiet', () => {
  const cols = [{ id: 'name', label: 'n', lead: r => (r.icon ? { icon: r.icon } : { dot: '--series-1' }) }, { id: 'n', label: 'N', value: true, align: 'center' }, { id: 'age', label: 'A', time: true }];
  const markup = render({ columns: cols, rows: [{ id: 'a', name: 'one', icon: 'clock', n: 3, age: '3m' }, { id: 'b', name: 'two', n: 0, age: '1m' }], rowKey: 'id', reveal: true }).s;
  assert.match(markup, /<span class="dt-lead"><svg[^>]*data-icon="clock"[\s\S]*?<\/svg><span class="dt-lead-t" data-tip="one" data-tip-overflow="">one<\/span><\/span>/, 'the clipped words carry the whole name');
  assert.match(markup, /<i class="dt-dot" style="--dt-dot:var\(--series-1\)"><\/i><span class="dt-lead-t"[^>]*>two<\/span>/);
  assert.match(markup, /<th class=""[^>]*>N<\/th>/, 'every header is plain: no alignment and no face of its own, whatever align says');
  assert.match(markup, /<td class="num val"[^>]*>3<\/td>/);
  assert.doesNotMatch(markup, /class="[^"]*\b(r|c)\b/, 'no column aligns right or centre');
  assert.match(markup, /<td class="tm"[^>]*>3m<\/td>/);
});

test('a name with a lead in a pressable row keeps the press on the cell button and the full text on the clipped words', () => {
  const markup = render({ columns: [{ id: 'name', label: 'n', lead: () => ({ icon: 'clock' }) }], rows: [{ id: 'a', name: 'one' }], rowKey: 'id', rowAction: 'row.open', reveal: true }).s;
  assert.match(markup, /<button type="button" class="dt-open" data-action="row.open" data-arg="&quot;a&quot;"><span class="dt-lead">/);
  assert.doesNotMatch(markup, /class="dt-open"[^>]*data-tip/);
});

test('a lit row\'s ground starts and ends where the head and the rules do (the content line) and stops above its rule', async () => {
  const { css } = await import('./data-table.js');
  assert.match(css, /\.dt-wrap \{ overflow-x: auto; margin-inline: calc\(-1 \* var\(--space-2\)\); \}/, 'the table (and the ground of a lit row) reaches the same room past both ends');
  assert.doesNotMatch(css, /\.dt tbody tr \{ background:/, 'the row itself paints no ground across the room past the content line');
  assert.match(css, /\.dt tbody td \{ background-color: var\(--dt-row-bg, transparent\); background-clip: padding-box;/, 'a cell\'s ground stops above its own rule');
  assert.match(css, /\.dt tbody td:first-child \{ background-color: transparent; background-image: linear-gradient\(to right, transparent var\(--space-2\), var\(--dt-row-bg, transparent\) 0\); \}/, 'the ground starts on the content line, with the head and the rule');
  assert.match(css, /\.dt tbody td:is\(:last-child, \[data-end\]\) \{ background-color: transparent; background-image: linear-gradient\(to left, transparent var\(--space-2\), var\(--dt-row-bg, transparent\) 0\); \}/, 'and ends there');
  assert.match(css, /\.dt :is\(th, td\):first-child \{ border-image: linear-gradient\(to right, transparent var\(--space-2\), var\(--dt-rule\) 0\) 1; \}/, 'the rule keeps the content line');
  assert.doesNotMatch(css, /padding-inline-start: 0; \}/, 'the first words are a cell padding in, on the content line');
  assert.doesNotMatch(css, /:has\(tbody tr\[data-action\]\)/);
  assert.match(css, /\.dt td \.sti-text \{ font-size: inherit; vertical-align: middle; \}/);
});

test('a figure column takes a tone, never an icon; a mono column keeps the header in the common face', () => {
  const markup = render({ columns: [{ id: 'name', label: 'Name' }, { id: 'n', label: 'Restarts', kind: 'number', tone: r => (r.n > 0 ? 'warn' : null) }, { id: 'rev', label: 'Revision', kind: 'mono' }],
    rows: [{ id: 'a', name: 'a', n: 2, rev: 'abc123' }, { id: 'b', name: 'b', n: 0, rev: 'def456' }], rowKey: 'id' }).s;
  assert.match(markup, /<td class="num val" data-tone="warn"[^>]*>2<\/td>/);
  assert.match(markup, /<td class="num val"[^>]*>0<\/td>/);
  assert.doesNotMatch(markup, /<td class="num val" data-tone="[^"]*"[^>]*>0</);
  assert.match(markup, /<th class=""[^>]*>Revision<\/th>/);
  assert.match(markup, /<td class="mono"[^>]*>abc123<\/td>/);
});
