import test from 'node:test';
import assert from 'node:assert/strict';
import { unfoldFrames, render } from './chart-layer.js';

const labels = { name: 'N', last: 'L', min: 'Mi', avg: 'A', p95: 'P', max: 'Ma', close: 'C', basis: 'B', delta: 'D', toggle: n => `T ${n}`, solo: 'S', more: (n, what) => `+${n}${what[0]}`, overLimit: 'OL', overRequest: 'OR', noEvents: 'NE' };
const chart = { kind: 'area', height: 100, min: 0, max: 10, ticks: [0, 10], series: [{ name: 'a', color: '--series-1', values: [1, 3, 2] }, { name: 'b', color: '--series-2', observations: [{ at: 1, value: 5 }, { at: 2, value: null }, { at: 3, value: 9 }] }], x: ['1', '2', '3'] };

test('a layer lists every line with its last, lowest, mean and highest value, the lines in the table order', () => {
  const m = render({ title: 'T', chart, labels, format: n => n.toFixed(1), close: 'x.close', sortAction: 'x.sort' }).s;
  assert.ok(m.indexOf('</i>b</button>') < m.indexOf('</i>a</button>'), 'sorted by the last value, highest first');
  assert.match(m, /<td class="num val"[^>]*>9\.0<\/td><td class="num val"[^>]*>5\.0<\/td><td class="num val"[^>]*>7\.0<\/td><td class="num val"[^>]*>9\.0<\/td>/);
  assert.match(m, /data-close="x.close"/);
  assert.match(m, /aria-label="C"/);
});

test('a line with no reading leaves its cells empty and a name sort runs ascending', () => {
  const m = render({ title: 'T', chart: { ...chart, series: [{ name: 'z', color: '--series-1', values: [] }, { name: 'a', color: '--series-2', values: [2] }] }, labels, format: String, close: 'c', sort: { id: 'name', dir: 'asc' } }).s;
  assert.ok(m.indexOf('</i>a</button>') < m.indexOf('</i>z</button>'));
  assert.match(m, /<td class="num val"[^>]*><\/td>/);
});

test('a layer shows whether it is live with the button that pauses it, lists the marked events as a table and holds a page panel under the bar', () => {
  const words = { ...labels, events: 'E', eventTime: 'ET', eventKind: 'EK', eventName: 'EN' };
  const base = { title: 'T', chart, labels: words, format: String, close: 'c', formatTime: at => 't' + at, formatAgo: at => 'ago' + at, events: [{ at: 7, kind: 'restart', label: 'why', tone: 'danger' }] };
  const live = render({ ...base, status: { live: true, label: 'L', action: 'x.pause', toggleLabel: 'P' } }).s;
  assert.match(live, /class="cl-status" data-live="true"[^>]*><i><\/i><span[^>]*>L<\/span><button[^>]*data-action="x.pause"[^>]*>[\s\S]*?<\/button><\/span>/); /* the button is inside the pill */
  assert.match(live, /<td[^>]*>t7<\/td><td[^>]*><span class="dt-lead"><i class="dt-dot" style="--dt-dot:var\(--destructive\)"><\/i><span class="dt-lead-t">restart<\/span><\/span><\/td><td[^>]*>why<\/td>/); /* the event's state colour is the table's own leading dot */
  assert.match(live, /ET[\s\S]*EK[\s\S]*EN/);
  assert.match(render({ ...base, status: { live: false, label: 'L', action: 'x.pause', toggleLabel: 'P' } }).s, /data-live="false"/);
  assert.match(render({ ...base, drawer: 'PANEL' }).s, /<div class="cl-drawer" data-cl-drawer>PANEL<\/div>/);
});

test('the closed table names the top of the table as it is sorted, what is left, and what is over a limit', () => {
  const series = ['a', 'b', 'c', 'd', 'e'].map((name, i) => ({ name, color: '--series-1', values: [(i + 1) * 10] }));
  const refs = [{ value: 25, tone: 'limit' }, { value: 5, tone: 'request' }];
  const bar = render({ title: 'T', chart: { ...chart, series, refs }, labels, format: n => n + 'u', close: 'c' }).s.split('<details')[1];
  const head = bar.slice(0, bar.indexOf('</summary>'));
  assert.match(head, /<span class="sbar-n">B<\/span><b>L<\/b>/);
  assert.match(head, /<i class="sbar-dot"[^>]*--series-1[^>]*><\/i><span class="sbar-n">e<\/span><b>50u<\/b>[\s\S]*<span class="sbar-n">d<\/span><b>40u<\/b>[\s\S]*<span class="sbar-n">c<\/span><b>30u<\/b>/);
  assert.doesNotMatch(head, />b<\/span><b>/);
  assert.match(head, /\+2t/);
  assert.match(head, /OL<\/span><b>3<\/b>/);
  const asc = render({ title: 'T', chart: { ...chart, series }, labels, format: String, close: 'c', sort: { id: 'min', dir: 'asc' } }).s.split('<details')[1];
  assert.match(asc.slice(0, asc.indexOf('</summary>')), /B<\/span><b>Mi<\/b>[\s\S]*a<\/span><b>10<\/b>[\s\S]*b<\/span><b>20<\/b>/);
});

test('the closed event list names the newest event with its colour and age, how many more there are, or that there are none; the page keeps what is open', () => {
  const words = { ...labels, events: 'E', eventTime: 'ET', eventKind: 'EK', eventName: 'EN' };
  const base = { title: 'T', chart, labels: words, format: String, close: 'c', formatTime: String, formatAgo: at => 'ago' + at, sections: { open: { table: false, events: true }, action: 'x.sec' } };
  const events = [{ at: 1, kind: 'old', label: 'o', tone: 'info' }, { at: 9, kind: 'new', label: 'n', tone: 'danger' }, { at: 5, kind: 'mid', label: 'm' }];
  const m = render({ ...base, events }).s, bars = m.split('<details').slice(1);
  const head = bars[1].slice(0, bars[1].indexOf('</summary>'));
  assert.match(head, /--destructive[^>]*><\/i><span class="sbar-n">new<\/span><b>n<\/b><small>ago9<\/small>/);
  assert.match(head, /\+2e/);
  const open = bar => bar.slice(0, bar.indexOf('>'));
  assert.match(open(bars[1]), /\bopen=""[^>]*data-sbar-toggle="x.sec"[^>]*data-sbar-arg="&quot;events&quot;"/);
  assert.doesNotMatch(open(bars[0]), /\bopen\b/);
  assert.match(open(bars[0]), /data-sbar-arg="&quot;table&quot;"/);
  const none = render({ ...base, events: [] }).s;
  assert.match(none, /NE/);
  assert.equal(none.split('<details').length, 2); /* no event: a bar that says so and does not open */
  assert.match(none, /<div class="sbar-h"><div class="sbar-items"><span[^>]*><span class="sbar-n">NE<\/span><b><\/b>/);
  assert.equal(render({ ...base, events: undefined }).s.split('<details').length, 2); /* a chart without events has no event bar */
});

test('every line carries a 95th percentile next to its last, lowest, mean and highest value', () => {
  const m = render({ title: 'T', chart: { ...chart, series: [{ name: 'a', color: '--series-1', values: Array.from({ length: 20 }, (_, i) => i + 1) }] }, labels, format: String, close: 'c' }).s;
  assert.match(m, /<td class="num val"[^>]*>20<\/td><td class="num val"[^>]*>1<\/td><td class="num val"[^>]*>10.5<\/td><td class="num val"[^>]*>19<\/td><td class="num val"[^>]*>20<\/td>/);
});

test('the event table sorts by its heads: newest first until a head is pressed, then the order of that column', () => {
  const words = { ...labels, events: 'E', eventTime: 'ET', eventKind: 'EK', eventName: 'EN' };
  const events = [{ at: 5, kind: 'b', label: 'x' }, { at: 9, kind: 'c', label: 'y' }, { at: 1, kind: 'a', label: 'z' }];
  const base = { title: 'T', chart, labels: words, format: String, close: 'c', formatTime: at => 't' + at, formatAgo: String, events, eventSortAction: 'x.esort' };
  const order = m => [...m.split('<table class="dt">')[2].matchAll(/<td class="mono">(t\d+)</g)].map(x => x[1]);
  assert.deepEqual(order(render(base).s), ['t9', 't5', 't1']);
  assert.deepEqual(order(render({ ...base, eventSort: { id: 'at', dir: 'asc' } }).s), ['t1', 't5', 't9']);
  assert.deepEqual(order(render({ ...base, eventSort: { id: 'kind', dir: 'asc' } }).s), ['t1', 't5', 't9']);
  assert.deepEqual(order(render({ ...base, eventSort: { id: 'label', dir: 'desc' } }).s), ['t1', 't9', 't5']);
  const head = render(base).s.split('<table class="dt">')[2];
  assert.equal((head.match(/data-action="x.esort"/g) || []).length, 3);
  assert.match(head, /aria-sort="descending"/);
});

test('a table row is its line\'s switch: pressed state, its key and the page\'s action, and a solo button per row', () => {
  const series = ['a', 'b'].map((name, i) => ({ key: 'k' + name, name, color: '--series-' + (i + 1), values: [i + 1] }));
  const m = render({ title: 'T', chart: { ...chart, series }, labels, format: String, close: 'c', series: { hidden: ['ka'], action: 'x.toggle', soloAction: 'x.solo' } }).s;
  assert.match(m, /<button type="button" class="cl-row" data-sidx="0"[^>]*aria-pressed="false"[^>]*aria-label="T a"[^>]*data-action="x.toggle"[^>]*data-arg="&quot;ka&quot;"/);
  assert.match(m, /data-sidx="1"[^>]*aria-pressed="true"/);
  assert.equal((m.match(/data-action="x.solo"/g) || []).length, 2);
  assert.match(m, /&quot;hidden&quot;:\[&quot;ka&quot;\]/);
  assert.doesNotMatch(m.split('<details')[1].split('</summary>')[0], /--series-1[^>]*><\/i>a/, 'a line that is off is not at the top of the closed table');
});

test('a layer with a state draws the plate\'s reason and none of the table and event bars; a stale status carries its tone', () => {
  const words = { ...labels, events: 'E', eventTime: 'ET', eventKind: 'EK', eventName: 'EN' };
  const m = render({ title: 'T', chart, labels: words, format: String, close: 'c', formatTime: String, formatAgo: String, events: [], state: { kind: 'error', title: 'bad' }, status: { live: false, tone: 'warn', label: 'old', action: 'x.p', toggleLabel: 'P' } }).s;
  assert.match(m, /chart-state" data-state="error"/);
  assert.doesNotMatch(m, /<details|sbar/);
  assert.match(m, /class="cl-status" data-live="false" data-tone="warn"/);
});

test('the layer is a labelled modal dialog whose drawer names the action Escape runs first', () => {
  const m = render({ title: 'T', chart, labels, format: String, close: 'c', drawer: 'D', drawerClose: 'x.drawer' }).s;
  assert.match(m, /role="dialog" aria-modal="true" aria-label="T"/);
  assert.match(m, /<div class="cl-drawer" data-cl-drawer data-drawer-close="x.drawer">D<\/div>/);
});

test('an earlier period is a ghost twin: the table gets a change column against it, keeps the ghost under its line, and the closed bar names only real lines', () => {
  const mk = (key, name, values, ghost) => ({ key, name, color: '--series-1', values, ...(ghost ? { ghost: true } : {}) });
  const series = [mk('a', 'a', [10, 10]), mk('a~prev', 'a · old', [8, 8], true), mk('b', 'b', [30, 30]), mk('b~prev', 'b · old', [60, 60], true)];
  const m = render({ title: 'T', chart: { ...chart, series }, labels, format: n => n + 'u', close: 'c' }).s;
  assert.match(m, /<th[^>]*>[\s\S]*>D</);
  assert.match(m, /data-sign="1">\+25%</);
  assert.match(m, /data-sign="-1">−50%</);
  const order = [...m.matchAll(/class="cl-row" data-sidx="(\d)"/g)].map(x => x[1]);
  assert.deepEqual(order, ['2', '3', '0', '1'], 'sorted by the last value, each ghost under its line');
  const head = m.split('<details')[1].split('</summary>')[0];
  assert.doesNotMatch(head, /old/);
  assert.doesNotMatch(render({ title: 'T', chart, labels, format: String, close: 'c' }).s, /cl-delta/);
});

test('only a line that is off has a dimmed dot: no rule dims every dot', async () => {
  const { css } = await import('./chart-layer.js');
  assert.doesNotMatch(css, /(^|\n)\.dt-dot \{ opacity/);
  assert.match(css, /\.cl-row\[aria-pressed="false"\] \.dt-dot \{ opacity/);
  assert.doesNotMatch(css, /\.cl-panel \.dt/); /* the table's figures are its own value columns: the layer does not restyle the table */
});

test('a sort by the change column falls back to the default once there is no comparison, and the change column sits right after the current one so it is the last to be hidden', () => {
  const mk = (key, values, ghost) => ({ key, name: key, color: '--series-1', values, ...(ghost ? { ghost: true } : {}) });
  const plain = render({ title: 'T', chart: { ...chart, series: [mk('a', [1]), mk('b', [5])] }, labels, format: n => n + 'u', close: 'c', sort: { id: 'delta', dir: 'desc' } }).s;
  const head = plain.split('<details')[1].split('</summary>')[0];
  assert.match(head, /<span class="sbar-n">B<\/span><b>L<\/b>/, 'the basis is the current value, not the change');
  assert.match(head, /b<\/span><b>5u<\/b>/, 'and the values are values');
  const withTwin = render({ title: 'T', chart: { ...chart, series: [mk('a', [10]), mk('a~prev', [8], true)] }, labels, format: String, close: 'c' }).s;
  const heads = [...withTwin.split('<table class="dt">')[1].split('</thead>')[0].matchAll(/<th[^>]*>(?:<button[^>]*>)?([A-Za-z]+)/g)].map(x => x[1]);
  assert.deepEqual(heads.slice(0, 3), ['N', 'L', 'D']);
});

test('the layer grows out of the side where its card stands: a card at the left end opens to the right, one at the right end to the left, one in the middle from the middle', () => {
  const panel = { left: 200, top: 100, width: 880, height: 600 }, plate = { left: 216, top: 240, width: 848, height: 340 }, size = { top: 420, width: 300, height: 190 };
  const inset = r => { const m = unfoldFrames(panel, plate, { ...size, ...r }, 'var(--ra)').small.clipPath.match(/inset\(([-\d.]+)px ([-\d.]+)px ([-\d.]+)px ([-\d.]+)px/); return { left: parseFloat(m[4]), right: parseFloat(m[2]) }; };
  const left = inset({ left: 160 }), right = inset({ left: 820 }), middle = inset({ left: 490 });
  assert.ok(left.left < left.right, 'the left card keeps the plate\'s left and opens toward the right');
  assert.ok(right.left > right.right, 'the right card keeps the plate\'s right and opens toward the left');
  assert.ok(Math.abs(middle.left - middle.right) < 1, 'the middle card opens evenly');
  assert.equal(unfoldFrames(panel, plate, { left: 160, ...size }, 'var(--ra)').small.transform.startsWith('translate('), true);
  assert.equal(unfoldFrames(panel, plate, { left: 160, ...size }, 'var(--ra)').full.clipPath.startsWith('inset(0 0 0 0'), true, 'it ends whole');
});
