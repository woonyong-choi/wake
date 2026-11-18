import test from 'node:test';
import assert from 'node:assert/strict';
import { createReport, applyOp, createState, itemsOf, foldLines, toggle, selectedItems, deleteSelectedOp, toMarkdown, toDocument, keyOf, numbers, excerpt } from './report.js';

const table = { id: 'rows', kind: 'table', title: 'rows-title', snapshot: { source: 'api', query: 'list items', at: 1794500000 },
  data: { columns: [{ id: 'name', label: 'Name' }, { id: 'state', label: 'state-col' }], rows: [{ id: 'a', name: 'alpha', state: 'ok' }, { id: 'b', name: 'beta', state: 'fail' }, { id: 'c', name: 'gamma', state: 'ok' }, { id: 'd', name: 'delta', state: 'ok' }] } };
const log = { id: 'log', kind: 'log', title: 'log-title', data: { lines: Array.from({ length: 12 }, (_, i) => ({ id: `l${i + 1}`, n: i + 1, text: i === 6 ? 'ERROR boom' : `line ${i + 1}` })) } };
const chart = { id: 'ch', kind: 'chart', title: 'chart-title', data: { card: { title: 'use-title', chart: { series: [{ key: 's1', name: 'one' }, { key: 's2', name: 'two' }] } } } };
const text = { id: 'p', kind: 'text', data: { text: 'A short finding.' } };

test('ops: add, filter (rows leave, series dim), highlight, collapse, annotate, remove', () => {
  let s = createState([table]);
  s = applyOp(s, { op: 'add', block: log });
  s = applyOp(s, { op: 'add', block: chart, at: 0 });
  assert.deepEqual(s.blocks.map(b => b.id), ['ch', 'rows', 'log']);
  s = applyOp(s, { op: 'filter', block: 'rows', keep: ['b', 'c'] });
  assert.deepEqual(itemsOf(s.blocks[1]).map(x => x.id), ['b', 'c']);
  s = applyOp(s, { op: 'filter', block: 'ch', keep: ['s1'] });
  assert.deepEqual(s.blocks[0].view.dim, ['s2'], 'a chart quiets the series it does not keep');
  assert.equal(itemsOf(s.blocks[0]).length, 2, 'they stay in the chart');
  s = applyOp(s, { op: 'highlight', block: 'rows', ids: ['b'] });
  s = applyOp(s, { op: 'collapse', block: 'log', around: ['l7'], context: 1 });
  assert.deepEqual(itemsOf(s.blocks[2]).map(x => x.id), ['l6', 'l7', 'l8']);
  s = applyOp(s, { op: 'annotate', block: 'rows', id: 'b', text: 'the cause' });
  assert.equal(s.blocks[1].view.notes.b, 'the cause');
  s = applyOp(s, { op: 'move', block: 'log', to: 0 });
  assert.deepEqual(s.blocks.map(b => b.id), ['log', 'ch', 'rows']);
  s = applyOp(s, { op: 'move', block: 'log', to: 2 });
  s = applyOp(s, { op: 'remove', block: 'ch' });
  assert.deepEqual(s.blocks.map(b => b.id), ['rows', 'log']);
  assert.throws(() => applyOp(s, { op: 'nope' }), TypeError);
  assert.throws(() => applyOp(s, { op: 'add', block: { id: 'rows', kind: 'table', data: {} } }), RangeError);
});

test('a folded log keeps the lines round its matches and says how many are left out', () => {
  const lines = log.data.lines.map(l => ({ id: l.id }));
  const f = foldLines(lines, { ids: ['l7'], context: 2 });
  assert.deepEqual(f.map(x => x.fold ?? x.line.id), [4, 'l5', 'l6', 'l7', 'l8', 'l9', 3]);
});

test('undo goes back one op at a time and keeps what is still selected', () => {
  const r = createReport([table]);
  r.select(s => toggle(s, keyOf('rows', 'a')));
  r.apply({ op: 'filter', block: 'rows', drop: ['c'] });
  r.apply({ op: 'highlight', block: 'rows', ids: ['a'] });
  assert.equal(r.canUndo, true);
  r.undo();
  assert.deepEqual(r.state.blocks[0].view.mark, []);
  assert.deepEqual(r.state.selected, ['rows/a'], 'the selection is the reader’s, not part of the op');
  r.undo();
  assert.deepEqual(itemsOf(r.state.blocks[0]).map(x => x.id), ['a', 'b', 'c', 'd']);
  assert.equal(r.canUndo, false);
});

test('selection: toggle; it survives narrowing while the item stays; delete takes whole blocks and items', () => {
  let s = createState([table, text]);
  for (const k of ['a', 'b', 'c']) s = toggle(s, keyOf('rows', k));
  s = applyOp(s, { op: 'filter', block: 'rows', drop: ['c'] });
  assert.deepEqual(s.selected, ['rows/a', 'rows/b'], 'an item that left leaves the selection; the others stay');
  s = toggle(s, keyOf('rows', 'd')); s = toggle(s, 'p');
  assert.deepEqual(selectedItems(s).map(x => [x.block, x.id, x.kind, x.label]), [['rows', 'a', 'table', 'alpha'], ['rows', 'b', 'table', 'beta'], ['rows', 'd', 'table', 'delta'], ['p', null, 'text', 'p']]);
  const del = deleteSelectedOp(s);
  assert.deepEqual(del, { op: 'remove', blocks: ['p'], items: [{ block: 'rows', id: 'a' }, { block: 'rows', id: 'b' }, { block: 'rows', id: 'd' }] });
  s = applyOp(s, del);
  assert.deepEqual(s.blocks.map(b => b.id), ['rows']);
  assert.deepEqual(itemsOf(s.blocks[0]), []);
  assert.deepEqual(s.selected, []);
});

test('numbers follow the order: a sub block is a part of the section before it', () => {
  const s = createState([text, { ...table, sub: true }, log, { ...chart, sub: true }, { id: 'q', kind: 'statements', data: { items: [{ id: 'x', text: 'seen', refs: [2] }] } }]);
  assert.deepEqual([...numbers(s).values()], ['1', '1.1', '2', '2.1', '3']);
  assert.deepEqual(itemsOf(s.blocks[4]).map(x => x.id), ['x']);
});

test('markdown: the head, numbered headings with footnoted sources, tables (pointed rows strong), logs with line numbers, captions, statements with their references', () => {
  let s = createState([text, { ...table, caption: 'cap-words' }, log, chart, { id: 'q', kind: 'statements', title: 'q-title', data: { items: [{ id: 'x', label: 'seen', text: 'it broke', refs: [1, 2] }] } }]);
  s = applyOp(s, { op: 'filter', block: 'rows', keep: ['a', 'b'] });
  s = applyOp(s, { op: 'highlight', block: 'rows', ids: ['b'] });
  s = applyOp(s, { op: 'collapse', block: 'log', around: ['l7'], context: 0 });
  s = applyOp(s, { op: 'highlight', block: 'log', ids: ['l7'] });
  s = applyOp(s, { op: 'filter', block: 'ch', keep: ['s2'] });
  const md = toMarkdown(s, { title: 'report-title', head: [{ label: 'k', value: 'v' }], format: at => `T${at}`, hidden: n => `(${n} out)` });
  assert.match(md, /^# report-title\n\n\| \| \|\n\| --- \| --- \|\n\| k \| v \|\n\nA short finding\.\n\n## 2 rows-title\[\^1\]\n\n\| Name \| state-col \|\n\| --- \| --- \|\n\| alpha \| ok \|\n\| \*\*beta\*\* \| fail \|\n\n\*cap-words\*/);
  assert.match(md, /```log\n\(6 out\)\n 7 > ERROR boom\n\(5 out\)\n```/);
  assert.match(md, /## 4 chart-title\n\n## 5 q-title\n\n- seen: it broke \[1\]\[2\]\n/, 'a figure is its heading, caption and source; statements carry their evidence numbers');
  assert.match(md, /\[\^1\]: api · list items · T1794500000\n$/);
  assert.equal(toDocument(s).sources.length, 1);
});

test('a table keeps one-line cells: an excerpt column is no cell but lines under the table, each led by its row key', () => {
  const t = { id: 'ev', kind: 'table', title: 'ev-title', data: { columns: [{ id: 'reason', label: 'reason-col' }, { id: 'n', label: 'count-col' }, { id: 'msg', label: 'msg-col', excerpt: ['reason'] }],
    rows: [{ id: 'a', reason: 'back-off', n: '3', msg: 'restart-failed' }, { id: 'b', reason: 'pulled', n: '1', msg: '' }] } };
  assert.deepEqual(excerpt(t.data.columns, t.data.rows), [{ id: 'a', text: 'back-off  restart-failed' }], 'a row with no long text has no line');
  const md = toMarkdown(createState([{ ...t, caption: ['first-cap', 'second-cap'] }]));
  assert.match(md, /```\n\n\*first-cap\*\n\n\*second-cap\*/, 'a caption of several lines is several italic lines');
  assert.match(md, /\| reason-col \| count-col \|\n\| --- \| --- \|\n\| back-off \| 3 \|\n\| pulled \| 1 \|\n\n```text\nback-off  restart-failed\n```/);
  const two = [{ id: 'no', label: 'no-col' }, { id: 'r', label: 'result-col', excerpt: ['no'] }, { id: 'q', label: 'query-col', excerpt: ['no'] }];
  assert.deepEqual(excerpt(two, [{ id: 'x', no: '[1]', r: 'rest', q: 'GET /x' }]).map(x => x.text), ['[1]  result-col  rest', '[1]  query-col  GET /x'], 'several excerpt columns: a row’s lines together, each named');
});
