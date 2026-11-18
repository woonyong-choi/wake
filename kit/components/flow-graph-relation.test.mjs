import test from 'node:test';
import assert from 'node:assert/strict';
import { render, spaceLabels, widen, thinnest, stackEnds, layout, sankeyLayout, drawable, shares, stateShares, readingOf } from './flow-graph.js';

const graph = {
  mode: 'relation', label: 'relations', width: 300, height: 120, columns: [0, 110], bar: 56,
  nodes: [
    { id: 'a', col: 0, y: 0, h: 56, label: 'one', sub: 'source', state: 'idle', icon: 'globe' },
    { id: 'b', col: 1, y: 0, h: 56, label: 'two', sub: 'item', state: 'fail', icon: 'globe' },
  ],
  links: [{ from: 'a', to: 'b', fromOffset: 0, toOffset: 0, size: 28, state: 'fail', label: 'owner', value: 'Error' }],
};

test('a relation graph draws tiles with icons, a band whose color flows from tile to tile, its value and the names under the tiles', () => {
  const host = render(graph).s;
  const data = JSON.parse(host.match(/data-flow="([^"]+)"/)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  assert.equal(data.mode, 'relation');
  assert.ok(data.nodes.every(node => node.icon), 'every tile carries its icon');
  assert.match(host, /class="flow relation vs-filledOutline stm-clock"/);
});

test('the inner drawing of a relation graph has tiles, a gradient band, the band value and under-tile names', async () => {
  const { attach } = await import('./flow-graph.js');
  assert.equal(typeof attach, 'function');
  const markup = render(graph).s;
  assert.match(markup, /fl-tile fail/);
  assert.match(markup, /fl-ico fail/);
  assert.match(markup, /linearGradient/);
  assert.match(markup, /fl-val[^>]*>Error</);
  assert.match(markup, /fl-label under/);
});

const fork = {
  mode: 'relation', visual: 'outline', bandR: 8, gap: 8, radii: { outer: 28, inner: 8 }, stack: true, stretch: true, width: 400, height: 200, columns: [0, 340], bar: 56,
  nodes: [
    { id: 'a', col: 0, y: 40, h: 120, label: '', icon: 'globe', tone: 'ac' },
    { id: 'b', col: 1, y: 20, h: 60, label: '', icon: 'globe', tone: 'soc' },
    { id: 'c', col: 1, y: 120, h: 60, label: '', icon: 'globe', tone: 'other', hidden: true },
  ],
  links: [
    { from: 'a', to: 'b', fromOffset: 0, toOffset: 0, size: 60, state: 'ok' },
    { from: 'a', to: 'c', fromOffset: 60, toOffset: 0, size: 60, state: 'ok', hidden: true },
  ],
};

test('bands leaving one tile are drawn as one union with one outline and a layer per band inside it', () => {
  const markup = render(fork).s;
  assert.equal((markup.match(/class="fl-union/g) || []).length, 1, 'one outline for the pair');
  assert.equal((markup.match(/class="fl-band[ "]/g) || []).length, 1, 'a colour layer for each band that carries anything (the hidden one is at nothing)');
  assert.match(markup, /clip-path="url\(#[^)]+\)"/, 'the layers are clipped to the union');
  assert.match(markup, /vs-outline/, 'the visual style is a class on the graph');
});

test('a hidden node and its band stay in the drawing, marked hidden, so showing them again animates', () => {
  const markup = render(fork).s;
  assert.match(markup, /fl-tile[^"]*hidden/);
  assert.match(markup, /fl-ico[^"]*hidden/);
});

test('a node tone resolves to a palette token for its icon and its colour wash', () => {
  const markup = render({ ...fork, wash: '1' }).s;
  assert.match(markup, /--sk-ac/);
  assert.match(markup, /--sk-soc/);
  assert.match(markup, /fl-wash/);
});

test('a drawing given as fractions of its height keeps its proportions (norm and aspect)', () => {
  const norm = { ...fork, norm: true, aspect: .5, nodes: fork.nodes.map(n => ({ ...n, y: n.y / 200, h: n.h / 200 })), links: fork.links.map(l => ({ ...l, fromOffset: l.fromOffset / 200, size: l.size / 200, toOffset: 0 })) };
  const markup = render(norm).s;
  assert.match(markup, /viewBox="0 0 400 200"/, 'height = aspect x width');
});

test('the glass style draws tile faces as html layers, a node label inside a tile only when asked', () => {
  const glass = render({ ...fork, visual: 'glass' }).s;
  assert.match(glass, /class="fl-glass/);
  const inside = render({ ...fork, nodes: fork.nodes.map((n, i) => i ? n : { ...n, label: '40 W', inside: true }) }).s;
  assert.match(inside, /fl-label under inside/);
  assert.doesNotMatch(render(graph).s, /under inside/);
});

test('at rest a washed graph paints no colour on a healthy node: its icon is plain whatever its tone; a node in a state wears it', () => {
  const markup = render({ ...fork, wash: '1', nodes: fork.nodes.map((n, i) => ({ ...n, hidden: false, state: ['ok', 'warn', 'fail'][i] })) }).s;
  assert.match(markup, /class="fl-union calm/, 'the bands rest in the neutral face');
  assert.match(markup, /data-key="icoa" class="fl-ico lit/, 'a toned node rests plain and brightens as the flow passes');
  assert.doesNotMatch(markup, /data-key="icoa"[^>]*--hue/, 'an icon takes no colour but its state');
  assert.match(markup, /data-key="icob" class="fl-ico warn stm-pulse/);
  assert.doesNotMatch(markup, /scale\(/, 'nothing grows or shrinks');
});

test('a column gap is at least its widest word: gaps with room to spare give it, else the drawing widens', () => {
  const p = { mode: 'relation', width: 400, height: 100, columns: [0, 100, 344], bar: 56, nodes: [{ id: 'a', col: 0 }, { id: 'b', col: 1 }, { id: 'c', col: 2 }], links: [] };
  const q = widen(p, { a: 150, b: 40, c: 40 }, 6);
  assert.ok(q.columns[1] - q.columns[0] >= 156, 'the first gap holds its longest word and the room before the next column');
  assert.equal(q.columns[2], 344, 'taken from the gap that had room to spare: the drawing keeps its width');
  const r = widen(p, { a: 300, b: 300, c: 40 }, 6);
  assert.ok(r.width > 400 && r.columns[1] >= 306 && r.columns[2] - r.columns[1] >= 306, 'no room to spare: the drawing widens');
  assert.equal(widen(p, { a: 10, b: 10, c: 10 }, 6), p, 'names that fit change nothing');
});

test('names are laid out, never cut: a node moves down below the name of the node above it, and the drawing holds the lowest name', () => {
  const p = { mode: 'relation', width: 300, height: 100, columns: [0, 200], bar: 40,
    nodes: [{ id: 'a', col: 0, y: 0, h: 40 }, { id: 'b', col: 0, y: 50, h: 40 }, { id: 'c', col: 1, y: 0, h: 40 }], links: [] };
  const q = spaceLabels(p, { a: 32, b: 16, c: 16 }, 6);
  const [a, b, c] = q.nodes;
  assert.ok(b.y >= a.y + a.h + 6 + 32 + 6, 'b sits below the two-line name of a');
  assert.equal(c.y, 0, 'another column is left alone');
  assert.ok(q.height >= b.y + b.h + 6 + 16, 'the drawing holds the name under the lowest tile');
  const extents = [a, b].map(n => [n.y, n.y + n.h + 6 + ({ a: 32, b: 16 })[n.id]]);
  assert.ok(extents[0][1] <= extents[1][0], 'no name runs into the next tile');
  const weighted = spaceLabels({ ...p, mode: 'weighted', columns: [0, 100, 200], nodes: [{ id: 'a', col: 1, y: 0, h: 20 }, { id: 'b', col: 1, y: 25, h: 20 }] }, { a: 16, b: 32 }, 4);
  assert.ok(weighted.nodes[1].y - 32 >= weighted.nodes[0].y + 20 + 4, 'a name above its bar keeps clear of the bar above');
  assert.equal(spaceLabels(p, {}, 6), p, 'nothing measured, nothing moved');
});

test('a name is drawn whole and wraps; a short name of the caller keeps the whole one as its title', () => {
  const m = render({ ...fork, nodes: fork.nodes.map((n, i) => ({ ...n, hidden: false, label: i === 1 ? 'alpha-7c9f6-x2k4-a-very-long-name' : 'one' })) }).s;
  assert.match(m, /<b><span class="fl-w">alpha-<wbr>7c9f6-<wbr>x2k4-<wbr>a-<wbr>very-<wbr>long-<wbr>name<\/span><\/b>/, 'a resource name may wrap after a hyphen, between its words, never inside one');
  assert.match(render({ ...fork, nodes: fork.nodes.map(n => ({ ...n, label: 'x1 y2' })) }).s, /<span class="fl-w">x1<\/span> <span class="fl-w">y2<\/span>/, 'a name wraps only at its spaces');
  assert.doesNotMatch(m, /…/);
});

test('live: every band keeps flowing, its colour runs from the state of the node it leaves to the state of the node it reaches, and a node in a state wears it on one clock', () => {
  const nodes = [{ id: 'a', col: 0, y: 0, h: 60, label: '', icon: 'globe', state: 'fail' }, { id: 'b', col: 1, y: 0, h: 60, label: '', icon: 'globe', state: 'fail' }, { id: 'c', col: 2, y: 0, h: 60, label: '', icon: 'globe', state: 'ok', tone: 'soc' }];
  const g = { gid: 'flg', mode: 'relation', stack: true, live: true, width: 500, height: 100, columns: [0, 200, 440], bar: 56, nodes,
    links: [{ from: 'a', to: 'b', fromOffset: 0, toOffset: 0, size: 60, state: 'fail' }, { from: 'b', to: 'c', fromOffset: 0, toOffset: 0, size: 60, state: 'ok' }] };
  const m = render(g).s;
  assert.match(m, /class="flow relation vs-filledOutline live stm-clock"/, 'one clock for the whole drawing');
  assert.equal((m.match(/class="fl-wash"/g) || []).length, 2, 'both bands flow, the failing one too');
  assert.doesNotMatch(m, /stopped/);
  assert.equal((m.match(/class="fl-band steady"/g) || []).length, 2, 'bands at a node in a state keep its colour at rest, under the flow');
  const grad = id => m.match(new RegExp(`id="flgw${id}"[^]*?</linearGradient>`))[0];
  assert.match(grad(0), /class="fl-stop fail" style="stop-color:var\(--destructive\)"[^]*offset="1" class="fl-stop fail" style="stop-color:var\(--destructive\)"/, 'a chain of failing nodes is one red flow');
  assert.match(grad(1), /offset="0" class="fl-stop fail" style="stop-color:var\(--destructive\)"[^]*offset="1" class="fl-stop ok" style="stop-color:var\(--sk-soc\)"/, 'a recovery runs from red into the colour of the node it reaches');
  assert.match(m, /<g data-key="stma" class="stm" data-motion="fail"><path class="stm-halo"/);
  assert.match(m, /class="fl-ico fail stm-pulse/, 'the icon breathes on the same clock');
  assert.match(m, /class="fl-tile fail"/, 'the face takes a tint of its state');
  assert.doesNotMatch(m, /data-key="stmc"/, 'an ok node is still');
  const w = render({ width: 300, height: 100, live: true, columns: [0, 150], nodes: [{ id: 'a', col: 0, y: 10, h: 30, label: 'A', state: 'ok' }, { id: 'b', col: 1, y: 10, h: 30, label: 'B', state: 'warn' }], links: [{ from: 'a', to: 'b', fromOffset: 0, toOffset: 0, size: 10, state: 'warn' }] }).s;
  assert.match(w, /class="fl-run[ "]/, 'weighted: every band runs while live, whatever its state');
  assert.match(w, /data-motion="wait"><rect class="stm-halo"/);
});

test('the reading: a band tells its share of the source and of the target and why; a node its states', () => {
  const p = { mode: 'relation', nodes: [{ id: 'a', label: 'ingress', value: '120 req/s' }, { id: 'b', label: 'web' }, { id: 'c', label: 'api', reasons: [{ label: 'stalled', count: 1 }, { label: 'queued', count: 2 }], state: 'fail' }],
    links: [{ from: 'a', to: 'b', size: 30, state: 'ok' }, { from: 'a', to: 'c', size: 10, state: 'fail', reasons: [{ label: 'stalled', count: 1 }] }] };
  assert.deepEqual(shares(p, 1), { source: .25, target: 1 });
  assert.deepEqual(stateShares(p, 'a'), [{ state: 'fail', share: .25 }, { state: 'ok', share: .75 }]);
  const band = readingOf(p, { link: 1 });
  assert.match(band, /ingress → api/);
  assert.match(band, /25%/); assert.match(band, /100%/);
  assert.match(band, /stalled 1/);
  const node = readingOf(p, { node: 'c' });
  assert.match(node, /stalled 1 · queued 2/);
  assert.match(readingOf(p, { node: 'a' }), /120 req\/s/);
});

test('a band carrying a value can be pointed at; a figure is written only on a band that holds it whole', () => {
  const m = render({ ...fork, links: [{ ...fork.links[0], value: '9 W' }, { ...fork.links[1], hidden: false, size: .5, value: '1 W' }], nodes: fork.nodes.map(n => ({ ...n, hidden: false })) }).s;
  assert.equal((m.match(/class="fl-bhit"/g) || []).length, 2);
  assert.match(m, /--val-grow:1;[^>]*>9 W</);
  assert.match(m, /--val-grow:0;[^>]*>1 W</);
});

test('a short name of the caller is drawn with the whole name as its title, a name under a tile at the edge ends at the edge, and a drawing in fractions keeps room for names under it', () => {
  const named = render({ ...fork, width: 396, norm: true, aspect: .5, nodes: fork.nodes.map((n, i) => ({ ...n, y: n.y / 200, h: n.h / 200, ...(i === 1 ? { label: 'payments-7c9f6-x2k4', short: 'x2k4' } : {}) })), links: fork.links.map(l => ({ ...l, fromOffset: l.fromOffset / 200, size: l.size / 200 })) }).s;
  assert.match(named, /<b title="payments-7c9f6-x2k4"><span class="fl-w">x2k4<\/span><\/b>/);
  assert.match(named, /class="flow relation vs-outline under-room stm-clock"/);
  assert.equal(Number(named.match(/data-key="labelb" class="fl-label under edge ready"[^>]*left:([\d.]+)/)?.[1]), 396, 'the name ends at the edge of the drawing');
  assert.doesNotMatch(render(fork).s, /under-room/);
});

test('a band that carries anything is never thinner than bandMin; one that carries nothing stays at nothing', () => {
  const p = thinnest({ bandMin: 3, links: [{ size: 1 }, { size: 0 }, { size: 8 }, { size: 1, hidden: true }] });
  assert.deepEqual(p.links.map(l => l.size), [3, 0, 8, 1]);
});

test('without stack, the bands of a tile lie side by side along its edge, as one block in its middle, in the order of their other ends', () => {
  const p = stackEnds({ mode: 'relation', width: 300, height: 200, columns: [0, 200], bar: 6,
    nodes: [{ id: 'a', col: 0, y: 0, h: 120 }, { id: 'b', col: 1, y: 100, h: 40 }, { id: 'c', col: 1, y: 0, h: 40 }, { id: 'd', col: 1, y: 160, h: 10 }],
    links: [{ from: 'a', to: 'b', size: 40 }, { from: 'a', to: 'c', size: 40 }, { from: 'a', to: 'd', size: 80 }] });
  const [ab, ac, ad] = p.links;
  assert.equal(p.stack, true);
  assert.deepEqual([ac.fromOffset, ab.fromOffset], [0, 30], 'the band to the higher tile is on top (the block of 160 is narrowed to the tile of 120)');
  assert.equal(ad.fromOffset + ad.size, 120, 'a block taller than its tile is narrowed to fit it');
  assert.equal(ad.size1, 10, 'and at the small tile it fits that one');
  assert.equal(ac.toOffset, 0); assert.equal(ac.size1, 40);
});

test('the reading names the states in the page\'s words when it gives them (stateLabels), else in the kit\'s', () => {
  const p = { mode: 'relation', stateLabels: { idle: 'x-idle', fail: 'x-fail' }, nodes: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }],
    links: [{ from: 'a', to: 'b', size: 1, state: 'idle' }, { from: 'a', to: 'b', size: 3, state: 'fail' }] };
  const m = readingOf(p, { node: 'a' });
  assert.match(m, /x-fail/); assert.match(m, /x-idle/);
  assert.match(readingOf({ ...p, stateLabels: undefined }, { node: 'a' }), /Idle/);
});

test('two graphs on one page never share the ids of their masks and clips; a redraw of one keeps its ids', () => {
  const ids = g => [...render(g).s.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  const other = { ...fork, nodes: fork.nodes.map(n => ({ ...n, id: n.id + '2' })), links: fork.links.map(l => ({ ...l, from: l.from + '2', to: l.to + '2' })) };
  const a = ids(fork), b = ids(other);
  assert.ok(a.length && b.length);
  assert.equal(a.filter(x => b.includes(x)).length, 0);
  assert.deepEqual(ids(fork), a);
});


/* a flow like a home overview: group → owner → phase, a few tiny flows of 1 to 15 items next to one aggregate of 2,496 items and one node that holds
   25 small groups. Values only: where the caller put its nodes is a hint for the order, the layout decides the rest */
const homeFlow = () => {
  const V = { alpha: 146, beta: 102, gamma: 122, delta: 151, epsilon: 144, rest: 1860 };
  const ns = Object.entries(V).map(([id, v], i) => ({ id: 'g-' + id, col: 0, y: i, h: v, icon: 'globe', tone: 'soc', state: 'ok', label: id === 'rest' ? 'other groups 25' : id, ...(id === 'rest' ? { rest: true, count: 25 } : {}) }));
  const wl = [['alpha-replicator', 15], ['beta-notifier', 4], ['gamma-feature-flags', 10]].map(([id, v], i) => ({ id: 'w-' + id, col: 1, y: i, h: v, icon: 'globe', state: 'warn', label: id }));
  const st = [['Up', 2522, 'ok'], ['Waiting', 3, 'warn'], ['Down', 0, 'fail']].map(([id, v, state], i) => ({ id: 's-' + id, col: 2, y: i, h: v, icon: 'globe', state, label: id, hidden: !v }));
  const link = (from, to, v, state = 'ok') => ({ from, to, size: v, fromOffset: 0, toOffset: 0, state, value: v.toLocaleString(), hidden: !v });
  return {
    mode: 'relation', stack: true, live: true, wash: '', width: 920, height: 462, columns: [0, 380, 804], bar: 56, gap: 8, bandR: 8, tileMin: 40, bandMin: 8, endGap: 0, tileSpace: 24, labelGap: 6, labelApart: 12,
    nodes: [...ns, ...wl, { id: 'w-ok', col: 1, y: 9, h: 2496, icon: 'globe', tone: 'other', state: 'ok', label: 'owners-ok', rest: true }, ...st],
    links: [link('g-rest', 'w-ok', 1860), link('w-ok', 's-Up', 2496), link('g-alpha', 'w-ok', 131), link('g-alpha', 'w-alpha-replicator', 15), link('w-alpha-replicator', 's-Waiting', 1, 'warn'),
      link('w-alpha-replicator', 's-Up', 14), link('g-delta', 'w-ok', 151), link('g-epsilon', 'w-ok', 144), link('g-beta', 'w-beta-notifier', 4), link('w-beta-notifier', 's-Waiting', 1, 'warn'),
      link('w-beta-notifier', 's-Up', 3), link('g-beta', 'w-ok', 98), link('g-gamma', 'w-gamma-feature-flags', 10), link('w-gamma-feature-flags', 's-Waiting', 1, 'warn'),
      link('w-gamma-feature-flags', 's-Up', 9), link('g-gamma', 'w-ok', 112), link('w-ok', 's-Down', 0, 'fail')],
  };
};
/* names as the browser draws them: one line, about 7.5 px a letter */
const measured = p => { const w = Object.fromEntries(p.nodes.map(n => [n.id, Math.ceil(n.label.length * 7.5)])); return { ...p, labelW: w, labelDW: w, labelH: Object.fromEntries(p.nodes.map(n => [n.id, 18])) }; };

/* the drawn geometry of a laid-out drawing: tiles, band outlines (sampled) and name boxes */
function geometry(q) {
  const N = Object.fromEntries(q.nodes.map(n => [n.id, n])), bw = q.bar, x = n => q.columns[n.col];
  const tiles = q.nodes.filter(n => !n.hidden).map(n => ({ id: n.id, x0: x(n), x1: x(n) + bw, y0: n.y, y1: n.y + n.h }));
  const names = q.nodes.filter(n => !n.hidden).map(n => ({ id: n.id, x0: n.lend ? x(n) + bw - q.labelDW[n.id] : x(n), x1: n.lend ? x(n) + bw : x(n) + q.labelDW[n.id], y0: n.ly, y1: n.ly + q.labelH[n.id] }));
  const bands = q.links.filter(l => !l.hidden && l.size > 0).map(l => {
    const A = N[l.from], B = N[l.to], bx0 = x(A) + bw + q.gap, bx1 = x(B) - q.gap, y0 = A.y + l.fromOffset, y1 = B.y + l.toOffset;
    return { id: l.from + '>' + l.to, at: Array.from({ length: 97 }, (_, k) => { const s = k / 96; const f = 3 * s * s - 2 * s ** 3; return { x: bx0 + (bx1 - bx0) * (1.5 * s * (1 - s) + s ** 3), y: y0 + (y1 - y0) * f, t: l.size + (l.size1 - l.size) * f }; }) };
  });
  return { tiles, names, bands };
}
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('drawable range: a range too wide for one scale is drawn around its problems, the healthy rest of each column one summary node with no band', () => {
  const p = { ...measured(homeFlow()), summary: { 0: { label: 'groups-{k}' }, 2: { label: 'up-{n}', action: 'go.up', arg: 'up' } } }, d = drawable(p), N = Object.fromEntries(d.nodes.map(n => [n.id, n]));
  assert.equal(d.view, 'focus');
  const trouble = id => ['warn', 'fail', 'busy'].includes(N[id]?.state) && !N[id].summary;
  assert.ok(d.links.length && d.links.every(l => trouble(l.from) || trouble(l.to)), 'only the flows that touch a node in a state');
  const sums = d.nodes.filter(n => n.summary);
  assert.ok(sums.every(n => !d.links.some(l => l.from === n.id || l.to === n.id)), 'a summary node has no band');
  assert.equal(N['~rest0'].label, 'groups-27', 'groups without a problem are one count (the node of many groups counts as its count)');
  assert.equal(N['~rest2'].label, `up-${(2496 + 14 + 3 + 9 - 14 - 3 - 9).toLocaleString()}`, 'the healthy remainder of the phase column, with its real amount');
  assert.equal(N['~rest2'].action, 'go.up');
  const q = sankeyLayout(d);
  assert.ok(q.links.every(l => l.size >= 8 && l.size1 >= 8 && !l.compressed), 'no hairline, nothing compressed');
  assert.doesNotMatch(render(p).s, /fl-break|dashed/, 'no break marks in any view');
  assert.equal(shares(d, 0).source > 0, true, 'the reading keeps the amounts');
});

test('drawable range: a small graph in range is drawn whole; a margin keeps a drawing in focus from flipping back at the threshold', () => {
  const small = { mode: 'relation', stack: true, width: 900, height: 480, columns: [0, 400, 800], bar: 56, tileMin: 40, tileSpace: 24, labelGap: 6,
    nodes: [{ id: 'a', col: 0, label: 'a', state: 'ok' }, { id: 'b', col: 0, label: 'b', state: 'ok' }, { id: 'w', col: 1, label: 'w', state: 'warn' }, { id: 'v', col: 1, label: 'v', state: 'ok' }, { id: 'up', col: 2, label: 'up', state: 'ok' }, { id: 'down', col: 2, label: 'down', state: 'fail' }],
    links: [{ from: 'a', to: 'w', size: 3 }, { from: 'a', to: 'v', size: 17 }, { from: 'b', to: 'v', size: 20 }, { from: 'w', to: 'down', size: 3 }, { from: 'v', to: 'up', size: 37 }] };
  const d = drawable(small);
  assert.equal(d.view, 'full'); assert.equal(d.links.length, 5);
  const edge = f => ({ ...small, links: small.links.map(l => l.from === 'w' ? { ...l, size: f } : l.to === 'w' ? { ...l, size: f } : l) });
  /* the fullest column (37 + f) over the least flow f against 480 / 4 = 120: f = 0.3 is out of range, 0.35 in range but within the margin (0.8 of it) */
  assert.equal(drawable(edge(.3)).view, 'focus');
  assert.equal(drawable({ ...edge(.35), lastView: 'focus' }).view, 'focus', 'in range by a little: stays in focus');
  assert.equal(drawable({ ...edge(.35), lastView: 'full' }).view, 'full');
  assert.equal(drawable({ ...edge(1), lastView: 'focus' }).view, 'full', 'well in range: back to whole');
});

test('drawable range: too many problem nodes in a column keep the six largest and fold the rest into one, in the state of its worst member', () => {
  const nodes = [], links = [];
  for (let i = 0; i < 15; i++) nodes.push({ id: 'g' + i, col: 0, label: 'g' + i, state: 'ok' });
  for (let i = 0; i < 40; i++) { nodes.push({ id: 'w' + i, col: 1, label: 'w' + i, state: i === 39 ? 'fail' : 'warn' }); links.push({ from: 'g' + (i % 15), to: 'w' + i, size: 1 + (i % 4) }); }
  for (const [id, state] of [['s-up', 'ok'], ['s-a', 'warn'], ['s-b', 'fail']]) nodes.push({ id, col: 2, label: id, state });
  for (let i = 0; i < 40; i++) links.push({ from: 'w' + i, to: i % 3 ? 's-a' : 's-b', size: 1 + (i % 4) });
  const p = { mode: 'relation', stack: true, width: 900, height: 480, columns: [0, 400, 800], bar: 56, tileMin: 40, tileSpace: 24, labelGap: 6, fold: { label: 'other-{k}', more: 'more-{k}' }, nodes, links };
  const d = drawable(p), q = sankeyLayout(d);
  assert.equal(d.view, 'focus');
  for (const c of [0, 1, 2]) assert.ok(d.nodes.filter(n => n.col === c && !n.hidden).length <= 7, `column ${c} has at most seven nodes`);
  const f = d.nodes.find(n => n.id === '~fold1');
  assert.equal(f.label, 'other-34'); assert.equal(f.state, 'fail', 'the fold wears its worst member');
  assert.equal(f.reasons.length, 11); assert.match(f.reasons.at(-1).label, /^more-24$/, 'ten members, then how many more');
  assert.equal(sum(d.links.map(l => l.amount)), sum(p.links.map(l => l.size)), 'folding merges bands and keeps every amount');
  assert.ok(q.links.every(l => l.size >= 8 && l.size1 >= 8));
});
const sum = list => list.reduce((t, x) => t + x, 0);

test('sankey geometry: the ends on a node edge fill it, flush, split by value; a band tapers from one node\'s share to the other\'s, never a hairline', () => {
  const p = measured(homeFlow()), q = sankeyLayout(p), V = p.links.map(l => l.size);
  for (const n of q.nodes.filter(m => !m.hidden)) for (const [end, off, sz] of [['from', 'fromOffset', 'size'], ['to', 'toOffset', 'size1']]) {
    const ends = q.links.map((l, i) => ({ l, v: V[i] })).filter(({ l }) => l[end] === n.id && !l.hidden).map(({ l, v }) => ({ a: l[off], b: l[off] + l[sz], v })).sort((x, y) => x.a - y.a);
    if (!ends.length) continue;
    assert.equal(ends[0].a, 0, `${n.id}: the first end starts at the top of the edge`);
    assert.equal(ends.at(-1).b, n.h, `${n.id}: the last end ends at the bottom of the edge`);
    ends.slice(1).forEach((e, i) => assert.equal(e.a - ends[i].b, 0, `${n.id}: two ends touch, with no gap`));
    for (const x of ends) for (const y of ends) if (x.v > y.v) assert.ok(x.b - x.a >= y.b - y.a - .5, `${n.id}: on one edge a larger value is never the thinner end`);
  }
  assert.ok(q.links.filter(l => !l.hidden).every(l => l.size >= 8 && l.size1 >= 8), 'no hairline');
});

test('a band shows its amount inside itself where it fits, else on hover only', () => {
  const m = render({ ...measured(homeFlow()), auto: false }).s;
  const vals = [...m.matchAll(/class="fl-val( at-end)?" style="--val-grow:(\d)/g)];
  assert.ok(vals.some(v => v[1]), 'a figure at the end of a thin band');
  const q = render(measured(homeFlow())).s;
  const figs = [...q.matchAll(/class="fl-val( at-end)?" style="--val-grow:(\d)/g)];
  assert.ok(figs.some(v => v[2] === '0'), 'a band too thin for its figure names it on hover only');
});

test('sankey geometry: names clear of every node, band and other name; troubled nodes on top, the aggregate at the bottom', () => {
  const q = sankeyLayout(measured(homeFlow())), g = geometry(q);
  for (const a of g.names) {
    for (const b of g.names) if (a !== b) assert.ok(!overlap(a, b), `names ${a.id} and ${b.id} overlap`);
    for (const t of g.tiles) assert.ok(!overlap(a, t), `name ${a.id} runs into tile ${t.id}`);
    for (const b of g.bands) assert.ok(!b.at.some(pt => pt.x > a.x0 && pt.x < a.x1 && pt.y < a.y1 && pt.y + pt.t > a.y0), `name ${a.id} lies on band ${b.id}`);
    assert.ok(a.y1 <= q.height + 1e-6, `name ${a.id} is inside the drawing`);
  }
  for (const a of g.tiles) for (const b of g.tiles) if (a !== b) assert.ok(!overlap(a, b), `tiles ${a.id} and ${b.id} overlap`);
  for (const n of q.nodes.filter(m => !m.hidden)) assert.ok(n.ly - (n.y + n.h + 6) <= 24, `the name of ${n.id} stays under its tile (${n.ly - n.y - n.h})`);
  assert.ok(q.nodes.filter(n => !n.hidden && n.col === 1 && n.id !== 'w-gamma-feature-flags').every(n => n.ly === n.y + n.h + 6), 'a band from a node above moves the node down, never the name off its tile');
  const order = c => q.nodes.filter(n => n.col === c && !n.hidden).sort((a, b) => a.y - b.y).map(n => n.id);
  assert.equal(order(0).at(-1), 'g-rest', 'the node of many small groups at the bottom');
  assert.equal(order(1).at(-1), 'w-ok', 'the aggregate at the bottom');
  assert.deepEqual(order(2), ['s-Waiting', 's-Up'], 'the troubled phase on top');
  assert.deepEqual(order(1).slice(0, 3).sort(), ['w-alpha-replicator', 'w-beta-notifier', 'w-gamma-feature-flags'], 'the troubled owners together on top');
  const ns = order(0).filter(id => ['alpha', 'beta', 'gamma'].some(k => id === 'g-' + k)).map(id => id.slice(2));
  assert.deepEqual(order(1).slice(0, 3).map(id => id.slice(2).replace(/-(replicator|notifier|feature-flags)$/, '')), ns, 'each group sits in the order of its owner: no band crosses another that it need not');
});

test('sankey layout is still: the same values give the same pixels, a new value keeps the order and moves only by its share', () => {
  const p = measured(homeFlow()), a = sankeyLayout(p), b = sankeyLayout(p);
  assert.deepEqual(b.nodes.map(n => [n.y, n.h]), a.nodes.map(n => [n.y, n.h]));
  for (const n of a.nodes) assert.equal(n.y * 2 % 1, 0, `${n.id} sits on a half pixel`);
  const next = { ...p, keepOrder: a.order, links: p.links.map(l => l.from === 'g-alpha' && l.to === 'w-ok' ? { ...l, size: 133 } : l) }, c = sankeyLayout(next);
  assert.deepEqual(c.order, a.order, 'a new value never reorders');
  const far = Math.max(...c.nodes.map((n, i) => Math.abs(n.y - a.nodes[i].y)));
  assert.ok(far < 3, `two items more move the drawing by ${far}px at most`);
});

test('bands on one node edge are one stack: flush, square where they touch, round only at the outer corners, one outline round them (leaving and entering)', () => {
  const p = { gid: 'g', mode: 'relation', stack: true, width: 400, height: 200, columns: [0, 340], bar: 56, gap: 8, bandR: 8, bandMin: 8, endGap: 0,
    nodes: [{ id: 'a', col: 0, y: 0, h: 1, label: '' }, { id: 'b', col: 1, y: 0, h: 1, label: '' }, { id: 'c', col: 1, y: 1, h: 1, label: '' }, { id: 'd', col: 1, y: 2, h: 1, label: '' }, { id: 'e', col: 0, y: 3, h: 1, label: '' }],
    links: [{ from: 'a', to: 'b', size: 100, state: 'ok' }, { from: 'a', to: 'c', size: 20, state: 'ok' }, { from: 'a', to: 'd', size: 60, state: 'ok' }, { from: 'e', to: 'd', size: 30, state: 'ok' }] };
  const m = render(p).s, q = sankeyLayout(p), [ab, ac, ad, ed] = q.links;
  assert.ok(ac.fromOffset === ab.fromOffset + ab.size && ad.fromOffset === ac.fromOffset + ac.size, 'leaving: the ends are flush');
  assert.ok(ed.toOffset === ad.toOffset + ad.size1 || ad.toOffset === ed.toOffset + ed.size1, 'entering: the ends are flush');
  const top = q.nodes[0].y + ab.fromOffset, mid = q.nodes[0].y + ac.fromOffset;
  assert.match(m, new RegExp(`M64,${top + 8} Q64,${top} 72,${top}`), 'the outer top corner of the stack is round');
  assert.match(m, new RegExp(`M64,${mid} Q64,${mid} 64,${mid}`), 'a corner between two ends is square');
  const mask = m.match(/<mask[^>]*id="ge1"[^]*?<\/mask>/)[0];
  assert.ok((mask.match(/ Z/g) || []).length >= 3, 'the outline of a band is cut by the bands it touches, so one outline runs round the stack');
});


test('every band keeps the same room to the tiles it joins (gap)', () => {
  const q = layout({ mode: 'relation', stack: true, gap: 8, width: 400, height: 200, columns: [0, 340], bar: 56, nodes: [{ id: 'a', col: 0, y: 0, h: 1 }, { id: 'b', col: 1, y: 0, h: 1 }], links: [{ from: 'a', to: 'b', size: 5 }] });
  const m = render(q).s, d = m.match(/data-key="bhit[^"]*"[^>]*d="M([\d.]+),[^C]*C[^C]*?([\d.]+),[\d.]+ Q/);
  assert.equal(Number(d[1]), 64, 'leaves 8 after the tile that ends at 56');
});


/* a narrow card (a resource flow and a state flow at a 548 px window): names wider than the room between two columns. Laid out as attach does it:
   names measured, laid out again, up to four times (a name about 6.4 px a letter, 17 px a line, wrapped to its room) */
const narrow = (nodes, links) => ({ mode: 'relation', stack: true, width: 426, height: 300, columns: [0, 175, 370], bar: 56, gap: 8, bandR: 8, tileMin: 40, tileSpace: 24, bandMin: 8, endGap: 0, labelGap: 6, labelApart: 12, labelWrap: 220,
  nodes: nodes.map(([id, col, label], i) => ({ id, col, y: i, h: 0, label, icon: 'globe', state: 'ok' })), links: links.map(([from, to, size]) => ({ from, to, size, amount: size, value: String(size), fromOffset: 0, toOffset: 0, state: 'ok' })) });
function measuredLayout(p) {
  const pieces = n => n.label.split(' ').flatMap((w, i) => w.split(/(?<=-)/).map((s, j) => [s.length * 6.4, i && !j ? 4 : 0]));
  const lines = (n, room) => { let k = 1, at = 0; for (const [w, sp] of pieces(n)) { if (at && at + sp + w > room) { k++; at = w; } else at += (at ? sp : 0) + w; } return k; };
  const fw = Object.fromEntries(p.nodes.map(n => [n.id, pieces(n).reduce((t, [w, sp]) => t + w + sp, 0)]));
  let q = layout({ ...p });
  for (let i = 0; i < 4; i++) {
    const room = n => n.lw ?? Math.min(fw[n.id], p.labelWrap);
    q = layout({ ...p, labelFW: fw, labelFH: Object.fromEntries(p.nodes.map(n => [n.id, 17])), labelFP: Object.fromEntries(p.nodes.map(n => [n.id, pieces(n)])),
      labelW: Object.fromEntries(p.nodes.map(n => [n.id, Math.max(...pieces(n).map(([w]) => w))])),
      labelH: Object.fromEntries(q.nodes.map(n => [n.id, 17 * lines(n, room(n))])), labelDW: Object.fromEntries(q.nodes.map(n => [n.id, Math.min(fw[n.id], room(n))])) });
  }
  return { q, lines: n => lines(n, n.lw ?? fw[n.id]) };
}
test('a name a band would cross in a narrow card wraps to two lines under its own tile: no band runs through a name, none sits above its tile', () => {
  const gitops = narrow([['app', 0, 'payments'], ['w-a', 1, 'Collection checkout-api'], ['w-b', 1, 'Collection session-gateway'], ['w-c', 1, 'StatefulSet redis'], ['s-run', 2, 'Running']],
    [['app', 'w-a', 2], ['app', 'w-b', 2], ['app', 'w-c', 1], ['w-a', 's-run', 2], ['w-b', 's-run', 2], ['w-c', 's-run', 1]]);
  const home = { ...narrow([['ns', 0, 'orders'], ['w1', 1, 'inventory-worker'], ['w2', 1, 'ledger-reconcile-29915845'], ['w3', 1, 'ledger-reconcile-29915850'], ['w4', 1, 'ledger-reconcile-29915855'], ['s-run', 2, 'Running'], ['s-done', 2, 'Completed']],
    [['ns', 'w1', 1], ['ns', 'w2', 1], ['ns', 'w3', 1], ['ns', 'w4', 1], ['w1', 's-run', 1], ['w2', 's-done', 1], ['w3', 's-done', 1], ['w4', 's-done', 1]]), height: 460 };
  for (const p of [gitops, home]) {
    const { q, lines } = measuredLayout(p), N = Object.fromEntries(q.nodes.map(n => [n.id, n])), x = n => q.columns[n.col], bw = q.bar;
    for (const n of q.nodes.filter(m => m.col === 1)) {
      const w = n.lw ?? q.labelFW[n.id], box = { x0: n.lend ? x(n) + bw - w : x(n), x1: n.lend ? x(n) + bw : x(n) + w, y0: n.ly, y1: n.ly + q.labelH[n.id] };
      assert.ok(n.ly >= n.y + n.h, `${n.id}: its name is under its tile`);
      assert.ok(lines(n) <= 2, `${n.id}: two lines at most`);
      for (const l of q.links) {
        const A = N[l.from], B = N[l.to], bx0 = x(A) + bw + q.gap, bx1 = x(B) - q.gap;
        for (let k = 0; k <= 96; k++) {
          const s = k / 96, f = 3 * s * s - 2 * s ** 3, bx = bx0 + (bx1 - bx0) * (1.5 * s * (1 - s) + s ** 3), by = A.y + l.fromOffset + (B.y + l.toOffset - A.y - l.fromOffset) * f, bt = l.size + (l.size1 - l.size) * f;
          assert.ok(!(bx > box.x0 && bx < box.x1 && by < box.y1 && by + bt > box.y0), `${n.id}: band ${l.from}>${l.to} runs through its name`);
        }
      }
    }
  }
});

test('a very long name is cut in its middle to two lines, the whole name its title; an ordinary name never is', () => {
  const long = 'x'.repeat(30) + '-' + 'y'.repeat(40), m = render({ ...fork, nodes: fork.nodes.map((n, i) => ({ ...n, hidden: false, label: i === 1 ? long : 'ordinary-name-of-forty-four-characters-abcde' })) }).s;
  assert.match(m, new RegExp(`<b title="${long}">`), 'the whole name is the title');
  assert.match(m, /x+…<\/span>|x+-<wbr>y*…y+|…y+/, 'cut in its middle');
  assert.match(m, /<b><span class="fl-w">ordinary-<wbr>/, 'an ordinary name is whole');
});

test('the reading of a node that stands for others lists them as rows, ten at most, then how many more', () => {
  const reasons = Array.from({ length: 10 }, (_, i) => ({ label: 'member-' + i, count: 30 }));
  const m = readingOf({ mode: 'relation', fold: { label: 'other-{k}', more: 'more-{k}' }, nodes: [{ id: 's', label: 'rest', summary: true, members: 14, reasons }], links: [] }, { node: 's' });
  assert.equal((m.match(/<div class="r">/g) || []).length, 10, 'one row each');
  assert.match(m, /more-4/); assert.doesNotMatch(m, /·/, 'never one long line');
});

test('the breathing clock runs on the nodes and the icons only, the outlines on a layer of their own', () => {
  const m = render({ ...measured(homeFlow()) }).s;
  assert.match(m, /<g data-key="nodes" class="stm-clock">/);
  assert.match(m, /class="fl-icos stm-clock"/);
  assert.match(m, /<svg data-key="over" class="fl-over"[^>]*><g data-key="edges" class="fl-edges">/);
});

/* ---------- the reading's place, in the browser (playwright-core via NODE_PATH; skipped without it) ---------- */
let chromium = null;
try { ({ chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright-core')); } catch { /* no browser */ }

test('a_band_reading_stands_at_the_pointer_or_the_band_centre_never_at_the_top_of_its_box', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main style="width:calc(var(--space-40) * 4.25);padding:var(--space-10)"></main>'); return; }
    const file = resolve(repo, '.' + path);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    /* one long diagonal band: from a tile at the bottom left to a tile at the top right */
    const band = await page.evaluate(async () => {
      const flow = await import('/kit/components/flow-graph.js'), { morph } = await import('/kit/core/morph.js');
      const style = document.createElement('style'); style.textContent = flow.css; document.head.append(style);
      const main = document.querySelector('main');
      morph(main, flow.render({ mode: 'relation', width: 600, height: 400, columns: [0, 540], bar: 56,
        nodes: [{ id: 'a', col: 0, y: 330, h: 60, label: 'left', state: 'ok' }, { id: 'b', col: 1, y: 0, h: 60, label: 'right', state: 'ok' }],
        links: [{ from: 'a', to: 'b', fromOffset: 0, toOffset: 0, size: 24, state: 'ok', value: '24' }] }));
      flow.attach(main);
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const el = main.querySelector('.fl-bhit'), r = el.getBoundingClientRect();
      /* points on the band: where the pointer meets it at a quarter and at two thirds of its width */
      const on = f => { const x = r.left + r.width * f; for (let y = r.top; y < r.bottom; y++) if (document.elementFromPoint(x, y) === el) return { x, y: y + 4 }; return null; };
      const c = [...el.getAttribute('d').matchAll(/C\s*([-\d.e]+)[ ,]([-\d.e]+)\s+([-\d.e]+)[ ,]([-\d.e]+)/g)].map(m => m.slice(1).map(Number));
      const mid = new DOMPoint(c[0][0], (c[0][1] + c[0][3] + c[1][1] + c[1][3]) / 4).matrixTransform(el.getScreenCTM());
      return { box: { top: r.top, height: r.height }, a: on(.25), b: on(.66), path: Array.from({ length: 14 }, (_, i) => on(.28 + i * .03)), mid: { x: mid.x, y: mid.y } };
    });
    assert.ok(band.box.height > 200 && band.a && band.b && band.path.every(Boolean), 'the band is a long diagonal the pointer can meet');
    const tip = () => page.evaluate(() => { const t = document.querySelector('.fl-tip'); if (!t) return null; t.dataset.seen ||= String(Math.random()); const r = t.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, id: t.dataset.seen }; });
    await page.mouse.move(band.a.x, band.a.y);
    const first = await tip();
    assert.ok(first, 'pointing at the band shows its reading');
    assert.ok(first.left >= band.a.x && first.left - band.a.x <= 24 && first.bottom <= band.a.y && band.a.y - first.bottom <= 24,
      `the reading stands just above and right of the pointer (${band.a.x},${band.a.y}), not at the top of the band's box: ${JSON.stringify(first)}`);
    for (const at of [...band.path, band.b]) await page.mouse.move(at.x, at.y); /* along the band, never off it */
    const moved = await tip();
    assert.equal(moved.id, first.id, 'moving over the same band keeps the one reading: nothing is closed and opened again');
    assert.ok(moved.left - band.b.x <= 24 && moved.left >= band.b.x && band.b.y - moved.bottom <= 24 && moved.bottom <= band.b.y, `the reading follows the pointer: ${JSON.stringify(moved)}`);
    await page.mouse.move(1, 1);
    assert.equal(await tip(), null, 'leaving the band closes its reading');
    /* the keyboard has no pointer: the reading stands over the band's own centre */
    await page.evaluate(() => document.querySelector('.fl-bhit').dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    const focused = await tip();
    assert.ok(Math.abs((focused.left + focused.right) / 2 - band.mid.x) <= 4 && focused.bottom <= band.mid.y && band.mid.y - focused.bottom <= 16,
      `a focused band's reading stands over its centre (${band.mid.x},${band.mid.y}): ${JSON.stringify(focused)}`);
    await page.evaluate(() => document.querySelector('.fl-bhit').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    /* a node's reading keeps its place over its tile */
    const tile = await page.evaluate(() => { const r = document.querySelector('.fl-tile[data-node="b"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
    await page.mouse.move(tile.x, tile.y);
    const node = await tip();
    assert.ok(node.left < tile.right && node.right > tile.left && ((node.bottom <= tile.top && tile.top - node.bottom <= 8) || (node.top >= tile.bottom && node.top - tile.bottom <= 8)),
      `a node's reading stands against its tile (above it, or below when the top has no room), not at the pointer: ${JSON.stringify({ node, tile })}`);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

/* R4-13: the running front of a live band on a light card, frozen in the middle of a long band and read as a row of pixels: the colour arrives as a slope,
   not as a step that reads as a seam in the band (the dark card keeps its accepted front: there it is a glow, here it darkens the band) */
test('a_live_band_front_on_a_light_card_arrives_as_a_slope_not_a_seam', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html data-theme="light"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><body style="background:var(--card)"><main style="width:calc(var(--space-40) * 6);padding:var(--space-10)"></main></body></html>'); return; }
    const file = resolve(repo, '.' + path);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 600 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const row = await page.evaluate(async () => {
      const flow = await import('/kit/components/flow-graph.js'), { morph } = await import('/kit/core/morph.js');
      const style = document.createElement('style'); style.textContent = flow.css; document.head.append(style);
      const main = document.querySelector('main');
      /* the network card's shape: an ingress of its own colour feeding a failing service and a healthy one */
      morph(main, flow.render({ mode: 'relation', visual: 'filledOutline', stack: true, stretch: true, fade: true, live: true, gid: 'seam', width: 920, height: 320, columns: [0, 804], bar: 56,
        nodes: [{ id: 'i', col: 0, y: 0, h: 0, label: 'Ingress', icon: 'globe', state: 'ok', tone: 'soc' }, { id: 'f', col: 1, y: 0, h: 0, label: 'checkout', icon: 'globe', state: 'fail', hue: '--destructive' }, { id: 'o', col: 1, y: 1, h: 0, label: 'ledger', icon: 'globe', state: 'ok', tone: 'other' }],
        links: [{ from: 'i', to: 'f', fromOffset: 0, toOffset: 0, size: 9, state: 'fail' }, { from: 'i', to: 'o', fromOffset: 0, toOffset: 0, size: 6, state: 'ok' }] }));
      flow.attach(main);
      await new Promise(done => setTimeout(done, 400));
      /* every drawing-in has ended; the running front stands near the middle of the band */
      for (const a of document.getAnimations()) { if (a.effect.getComputedTiming().iterations === Infinity) { a.pause(); a.currentTime = a.effect.getComputedTiming().duration * .4; } else a.finish(); }
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const band = main.querySelector('.fl-band.steady').getBoundingClientRect();
      return { x0: Math.ceil(band.left) + 4, x1: Math.floor(band.right) - 4, y: Math.round(band.top + band.height * .5) };
    });
    const png = await page.screenshot({ clip: { x: row.x0, y: row.y, width: row.x1 - row.x0, height: 1 } });
    const px = await page.evaluate(async b64 => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, 1), g = c.getContext('2d'); g.drawImage(img, 0, 0);
      return Array.from(g.getImageData(0, 0, img.width, 1).data);
    }, png.toString('base64'));
    /* the steepest change over eight pixels against the whole change across the front (over a hundred and sixty): a step does most of it at once, a slope a small part */
    const at = i => px.slice(i * 4, i * 4 + 3), dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), n = px.length / 4;
    const steepest = w => { let m = 0; for (let i = 0; i + w < n; i++) m = Math.max(m, dist(at(i), at(i + w))); return m; };
    const share = steepest(8) / steepest(160);
    assert.ok(share <= .12, `the front is a seam on the light card: ${Math.round(share * 100)}% of its change happens within eight pixels (steepest ${steepest(8).toFixed(1)}, across the front ${steepest(160).toFixed(1)})`);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
