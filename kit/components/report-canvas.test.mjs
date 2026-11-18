import test from 'node:test';
import assert from 'node:assert/strict';
import { render, handle, toolbar, css } from './report-canvas.js';
import { createReport } from '../core/report.js';

const blocks = () => [
  { id: 'rows', kind: 'table', title: 'rows-title', caption: 'rows-caption', snapshot: { source: 'api', query: 'list', at: 1794500000 }, data: { columns: [{ id: 'name', label: 'Name', w: '10ch' }], rows: [{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }] } },
  { id: 'log', kind: 'log', sub: true, title: 'log-title', data: { lines: [{ id: 'l1', n: 1, text: 'one' }, { id: 'l2', n: 2, text: 'ERROR two' }, { id: 'l3', n: 3, text: 'three' }] } },
  { id: 'p', kind: 'text', title: 'p-title', data: { text: 'A finding.' } },
  { id: 'st', kind: 'statements', title: 'st-title', data: { items: [{ id: 's1', label: 'seen', text: 'It broke.', refs: [1, 3] }] } },
  { id: 'fig', kind: 'chart', sub: true, title: 'fig-title', data: { card: { title: 'mem', widget: true, value: '480Mi', legend: [{ label: 'mem', color: '--series-1' }, { label: 'limit-512', color: '--chart-limit', dash: true }], chart: { kind: 'area', height: 150, unit: 'Mi', refs: [{ value: 512, label: 'limit-512', tone: 'limit' }], series: [{ key: 'm', name: 'mem', observations: [{ at: 1794500000, value: 100 }, { at: 1794500060, value: 480 }] }] } } } },
];

test('one sheet: sections numbered by order with no card face and no checkbox; selectable things carry their key; a figure is the kit chart with no head or frame', () => {
  const r = createReport(blocks());
  const m = render({ id: 'rc', report: r.state, action: 'x.rc', head: { title: 'head-title', rows: [{ label: 'k', value: 'v' }] } }).s;
  assert.match(m, /data-c="report-canvas" data-rc="rc" data-rc-action="x.rc" data-rc-count="0"/);
  assert.doesNotMatch(m, /role="checkbox"|class="cbx/, 'no checkboxes');
  assert.match(m, /<h1>head-title<\/h1><dl class="rc-kv"><div><dt>k<\/dt><dd title="v">v<\/dd><\/div>/);
  assert.match(m, /<span class="rc-n">1<\/span><span class="rc-t">rows-title<\/span>/);
  assert.match(m, /<span class="rc-n">1\.1<\/span><span class="rc-t">log-title<\/span>/, 'a sub block is a part of the section before it');
  assert.match(m, /<span class="rc-n">3<\/span><span class="rc-t">st-title<\/span>/);
  assert.match(m, /<tr class="" data-rc-key="rows\/a">/);
  assert.match(m, /<col style="width:10ch">/);
  assert.match(m, /<div class="rc-cap">rows-caption<\/div><div class="rc-src">/);
  assert.match(m, /class="rc-ln" data-rc-key="log\/l2"><span class="rc-no">2<\/span>/);
  assert.match(m, /<span class="rc-refs">\[1\]\[3\]<\/span>/);
  assert.doesNotMatch(m, /class="sbar|summary-bar/, 'no card around a section');
  assert.match(m, /<div class="rc-chart"[^>]*><div class="card widget static"/, 'the kit chart card with no face');
  assert.doesNotMatch(m, /card-h|card-big|480Mi/, 'no chart head or big value');
  assert.match(m, /class="legend"[^]*limit-512/, 'its legend below names the threshold');
  assert.match(m, /class="chart axes"/, 'the axes always shown');
  assert.doesNotMatch(m, /Delete selected/, 'no delete control while nothing is selected');
});

test('handle: set, add, clear, move, delete and undo; refer hands over stable ids', () => {
  const r = createReport(blocks());
  handle(r, { type: 'set', keys: ['rows/a', 'log/l2'] });
  assert.deepEqual(r.state.selected, ['rows/a', 'log/l2']);
  handle(r, { type: 'add', keys: ['rows/a', 'p'] });
  assert.deepEqual(r.state.selected, ['log/l2', 'p'], 'add turns a selected one off and a new one on');
  const m = render({ id: 'rc', report: r.state, action: 'x.rc', canUndo: r.canUndo }).s;
  assert.match(m, /data-rc-count="2"/);
  assert.match(m, /Delete selected/, 'the delete control stands while something is selected');
  assert.doesNotMatch(render({ id: 'rc', report: r.state, action: 'x.rc', bar: false }).s, /role="toolbar"/, 'a page may place the bar itself');
  assert.match(toolbar({ report: r.state, action: 'x.rc', tools: 'page-tools', end: 'pane-close' }).s, /2 selected.*Delete selected.*Refer to AI.*Undo.*pane-close/s);
  assert.match(m, /data-rc-key="p" data-sel/);
  const { refer } = handle(r, { arg: { type: 'refer' } });
  assert.deepEqual(refer.map(x => `${x.block}:${x.id}`), ['log:l2', 'p:null']);
  handle(r, { type: 'delete' });
  assert.deepEqual(r.state.blocks.map(b => b.id), ['rows', 'log', 'st', 'fig']);
  handle(r, { type: 'move', block: 'st', to: 0 });
  assert.deepEqual(r.state.blocks.map(b => b.id), ['st', 'rows', 'log', 'fig']);
  handle(r, { type: 'undo' }); handle(r, { type: 'undo' });
  assert.deepEqual(r.state.blocks.map(b => b.id), ['rows', 'log', 'p', 'st', 'fig']);
  handle(r, { type: 'clear' });
  assert.deepEqual(r.state.selected, []);
  assert.equal(handle(r, { type: 'delete' }).op, undefined, 'nothing selected, nothing deleted');
  const marked = render({ id: 'rc', report: r.apply({ op: 'highlight', block: 'rows', ids: ['b'] }), action: 'x.rc' }).s;
  assert.match(marked, /<tr class="rc-mark" data-rc-key="rows\/b">/);
});

test('print: a cell keeps one line; long raw text stands under the table; a small section is marked to stay on one page', () => {
  const r = createReport([{ id: 't', kind: 'table', title: 't-title', data: { columns: [{ id: 'k', label: 'key-col' }, { id: 'raw', label: 'raw-col', excerpt: ['k'] }], rows: [{ id: 'a', k: 'back-off', raw: 'long-message' }] } }]);
  const m = render({ id: 'rc', report: r.apply({ op: 'highlight', block: 't', ids: ['a'] }), action: 'x.rc' }).s;
  assert.match(m, /<th class="">key-col<\/th><\/tr>/, 'the excerpt column has no head cell');
  assert.match(m, /<\/table><div class="rc-ex"><div class="rc-mark">back-off\s+long-message/);
  assert.match(m, /data-rc-block="t" data-depth="1"[^>]*data-small/);
  assert.doesNotMatch(css, /\.rc-tbl :is\(td, th\) \{ white-space: normal/, 'no forced wrapping of every table cell in print');
  const prose = render({ id: 'rc', report: createReport([{ id: 'f', kind: 'table', title: 'f-title', data: { columns: [{ id: 'todo', label: 'todo-col', wrap: true }, { id: 'who', label: 'who-col' }], rows: [{ id: 'a', todo: 'long-todo', who: 'team-a' }] } }]).state, action: 'x.rc' }).s;
  assert.match(prose, /<td class="wrap" title="long-todo">long-todo<\/td><td class="" title="team-a">/, 'a prose column wraps inside its cell; the others keep one line');
});
