import test from 'node:test';
import assert from 'node:assert/strict';
import { render, fold, items as itemsRow } from './summary-bar.js';

const items = [{ id: 'a', label: 'A', value: '1 W', icon: 'search', tone: 'warn' }, { id: 'b', label: 'B', value: null, action: 'kit.navigate', arg: { address: 'x' } }];

test('a summary bar with a body is a details element with a chevron and every item keeps its tone', () => {
  const m = render({ items, body: 'BODY', open: true }).s;
  assert.match(m, /<details class="sbar"[^>]* open=/);
  assert.match(m, /sbar-chev/);
  assert.match(m, /data-tone="warn"/);
  assert.match(m, /BODY/);
});

test('a summary bar without a body has no chevron, an empty value reads as a dash and an action item is a button', () => {
  const m = render({ items }).s;
  assert.doesNotMatch(m, /sbar-chev/);
  assert.match(m, /<b>—<\/b>/);
  assert.match(m, /sbar-item click"[^>]*data-action="kit.navigate"/);
});

test('an item can carry a colour dot and the open state can be the page\'s: the bar names its action and argument', () => {
  const m = render({ items: [{ id: 'a', label: 'A', value: '1', dot: '--series-2' }], body: 'BODY', open: false, toggle: { action: 'x.open', arg: 'one' } }).s;
  assert.match(m, /<i class="sbar-dot" style="--sbar-dot-c:var\(--series-2\)"><\/i><span class="sbar-n">A<\/span><b>1<\/b>/);
  assert.match(m, /data-sbar-toggle="x.open" data-sbar-arg="&quot;one&quot;"/);
  assert.doesNotMatch(m, / open=/);
});

test('a dot can move as the state it stands for does, and an item can name itself for a screen reader when it is only an icon', () => {
  const m = render({ items: [{ id: 'a', label: 'A', value: '1', dot: '--success', dotState: 'run' }, { id: 'b', label: '', value: '2', icon: 'search', ariaLabel: 'Tool two' }], body: 'X' }).s;
  assert.match(m, /<i class="sbar-dot" style="--sbar-dot-c:var\(--success\)" data-state="run"><\/i>/);
  assert.match(m, /aria-label="Tool two"/);
});

test('a name is its own box so only it gives way, an item without a name has none, and the line ends with the folded mark, which counts nothing yet (so it is not shown)', () => {
  const m = render({ items: [{ id: 'a', label: 'a-long-name', value: '12.5 u' }, { id: 'b', label: '', value: 'only value', icon: 'search' }] }).s;
  assert.match(m, /<span class="sbar-n">a-long-name<\/span><b>12.5 u<\/b>/);
  assert.equal((m.match(/class="sbar-n"/g) || []).length, 1);
  assert.match(m, /<span class="legend-more sbar-more" tabindex="0"[^>]*data-own-children[^>]*><span class="sbar-more-n" data-n="0"><\/span><span class="legend-pop"><span class="legend-pop-in"><\/span><\/span><\/span><\/div>/);
});

test('fold keeps every item while the least widths fit, and otherwise as many leading items as fit beside the mark', () => {
  assert.equal(fold([100, 100, 100], 320, 10, 30), 3, 'exactly fitting: 300 + 2 gaps');
  assert.equal(fold([100, 100, 100], 319, 10, 30), 2, 'two items, a gap and the mark: 240');
  assert.equal(fold([100, 100, 100], 239, 10, 30), 1);
  assert.equal(fold([100, 100, 100, 100], 330, 10, 80), 2, 'the mark needs its own room: three would fit without it');
  assert.equal(fold([100, 100, 100], 50, 10, 30), 1, 'the first item always stays');
  assert.equal(fold([], 100, 10, 30), 0);
  assert.equal(fold([500], 100, 10, 30), 1);
});

test('the open state is the caller\'s on every drawing: a closed bar is drawn closed again, and drawing the same thing twice gives the same markup (nothing to replay)', () => {
  const p = { items, body: 'BODY', open: false, toggle: { action: 'x.open', arg: 'one' } };
  const closed = render(p).s;
  assert.doesNotMatch(closed, / open=/);
  assert.equal(render({ ...p, items: items.map(it => ({ ...it })) }).s, closed);
  assert.match(render({ ...p, open: true }).s, /<details class="sbar"[^>]* open=""/);
});

test('the items row stands on its own with no face, and a bar draws the very same row inside its face', () => {
  const bare = itemsRow(items).s;
  assert.match(bare, /^<div class="sbar-items" data-c="summary-bar">/);
  assert.doesNotMatch(bare, /class="sbar"|sbar-chev/);
  assert.ok(render({ items }).s.includes(bare.replace(' data-c="summary-bar"', '')), 'the bar uses the same row');
});

test('a title item may wrap to two lines: it is marked so the fold does not pin its width', () => {
  const m = render({ items: [{ id: 't', label: '', value: 'a long title', wrap: true }, ...items], body: 'B' }).s;
  assert.match(m, /class="sbar-item wrap"/);
  assert.doesNotMatch(render({ items }).s, /\bwrap\b/);
});

test('a dot that waits or fails takes the shared state motion; a running or live one keeps its own', () => {
  const dot = dotState => render({ items: [{ id: 'a', label: 'A', value: 1, dot: '--series-1', dotState }] }).s;
  assert.match(dot('wait'), /class="sbar-dot stm"[^>]*data-motion="wait"/);
  assert.match(dot('event'), /data-motion="wait"/);
  assert.match(dot('fail'), /class="sbar-dot stm"[^>]*data-motion="fail"/);
  for (const s of ['run', 'live', undefined]) assert.doesNotMatch(dot(s), /data-motion|stm/);
});

test('in a narrow pane the items row can run on to more lines instead of folding', () => {
  assert.match(render({ items, wrap: 'lines' }).s, /<div class="sbar-items lines">/);
  assert.match(itemsRow(items, { wrap: 'lines' }).s, /<div class="sbar-items lines" data-c="summary-bar">/);
  assert.match(render({ items }).s, /<div class="sbar-items">/);
});

test('metrics draws the bars as one table of columns: each column width is set on the group and only from the first five', async () => {
  const { metrics } = await import('./summary-bar.js');
  const bar = id => ({ items: [{ id: 't', label: '', value: id }, { id: 'v', label: '', value: '42%' }] });
  const m = metrics([bar('CPU'), bar('Memory')], { columns: ['calc(var(--space-16) * 1.9)', 'var(--space-16)', '', 'a', 'b', 'ignored'] }).s;
  assert.match(m, /^<div class="sbm" data-cols="5" style="--sbm-1:calc\(var\(--space-16\) \* 1.9\);--sbm-2:var\(--space-16\);--sbm-4:a;--sbm-5:b">/);
  assert.equal((m.match(/data-c="summary-bar"/g) || []).length, 2);
  assert.doesNotMatch(m, /ignored/);
  assert.match(metrics([bar('x')]).s, /^<div class="sbm"><div class="sbar"/);
});

/* A3-04: the home's metric bars hid the threshold whole below an 880px card (blank room beside it at 820) and the peak and the threshold below 700
   (548), whatever their words needed; a long English name ran into its value. Now the columns are measured: a reading folds only when it truly does
   not fit (the threshold, which carries the state, after the peak), and the name is cut with its whole text in the title */
const require = (await import('node:module')).createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { /* browser checks need playwright-core */ }
test('metrics_fold_a_reading_only_when_it_does_not_fit_the_threshold_last_and_a_long_name_never_runs_into_its_value', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => { const sb = await import('/kit/components/summary-bar.js'), cc = await import('/kit/components/chart-card.js'); const st = document.createElement('style'); st.textContent = cc.css + sb.css; /* the +N list is the chart legend's */ document.head.append(st); window.sb = sb; await document.fonts.ready; });
    const at = width => page.evaluate(async width => {
      const bar = (name, v) => ({ body: 'x', items: [{ id: 't', label: '', value: name }, { id: 'v', label: '', value: v, priority: 3 }, { id: 'p', label: '1h peak', value: '31%', priority: 1 }, { id: 's', label: 'threshold', value: '80%', priority: 2 }] });
      const main = document.querySelector('main'); main.style.width = width + 'px';
      main.innerHTML = window.sb.metrics([bar('CPU use', '20%'), bar('Requests per second (Ingress)', '1.9/s')], { columns: ['calc(var(--space-16) * 1.9)', 'calc(var(--space-16) * 1.1)', 'calc(var(--space-16) * 3.4)', 'calc(var(--space-16) * 2.95)', 'calc(var(--space-16) * 2.55)'] }).s;
      window.sb.attach(main, { emit() {} });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return [...main.querySelectorAll('.sbar-items')].map(line => {
        const items = [...line.querySelectorAll(':scope > .sbar-item')], name = items[0].querySelector('b'), value = items[1].getBoundingClientRect();
        return { shown: items.filter(x => !x.hidden).map(x => x.dataset.key.match(/"(\w)"\]$/)[1]).join(''), folded: line.querySelector('.sbar-more-n').dataset.n,
          overlap: !items[1].hidden && name.getBoundingClientRect().right > value.left + 1, cut: name.scrollWidth > name.clientWidth, title: name.title };
      });
    }, width);
    const fails = [];
    const wide = await at(780);
    if (!wide.every(l => l.shown === 'tvps')) fails.push(`780: room for every reading, none folds: ${JSON.stringify(wide)}`);
    const narrow = await at(470);
    if (!narrow.every(l => l.shown.startsWith('tv') && (l.shown.includes('s') || !l.shown.includes('p')))) fails.push(`470: the value stays, the peak folds before the threshold: ${JSON.stringify(narrow)}`);
    const mid = await at(560);
    if (!mid.every(l => l.shown === 'tvps')) fails.push(`560: narrower than the fixed widths, the readings take their content width before anything folds: ${JSON.stringify(mid)}`);
    for (const l of [...wide, ...mid, ...narrow]) {
      if (l.overlap) fails.push(`a name never runs into its value: ${JSON.stringify(l)}`);
      if (l.cut && !l.title) fails.push(`a cut name has its whole text as its title: ${JSON.stringify(l)}`);
    }
    assert.deepEqual(fails, []);
  } finally { await browser?.close(); server.close(); }
});

/* R4-14: with the AI pane open (a 487px card) the home's CPU bar folded its threshold together with its peak ("24% +2") while the memory bar kept it:
   the threshold column is as wide as the widest reading in it (the 5xx bar's "threshold 1.00% exceeded"), so the plain threshold did not fit at that width.
   The threshold folds last: once the readings before it fold, the last reading that stays is drawn at its own width */
test('metrics_keep_the_threshold_at_its_own_width_when_the_column_is_set_by_a_longer_state', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => { const sb = await import('/kit/components/summary-bar.js'), cc = await import('/kit/components/chart-card.js'); const st = document.createElement('style'); st.textContent = cc.css + sb.css; document.head.append(st); window.sb = sb; await document.fonts.ready; });
    const lines = [];
    for (const width of [450, 470, 490]) lines.push(...await page.evaluate(async width => {
      const bar = (name, v, peak, s) => ({ body: 'x', items: [{ id: 't', label: '', value: name }, { id: 'v', label: '', value: v, priority: 3 }, { id: 'p', label: '1h peak', value: peak, priority: 1 }, s] });
      const main = document.querySelector('main'); main.style.width = width + 'px';
      main.innerHTML = window.sb.metrics([bar('CPU use', '24%', '98%', { id: 's', label: 'threshold', value: '80%', priority: 2 }), bar('Memory use', '73%', '74%', { id: 's', label: 'threshold', value: '85%', priority: 2 }),
        bar('5xx rate (Ingress)', '1.03%', '58.30%', { id: 's', label: '', value: '(!) threshold 1.00% exceeded', tone: 'danger' })], { columns: ['calc(var(--space-16) * 1.9)', 'calc(var(--space-16) * 1.1)', 'calc(var(--space-16) * 3.4)', 'calc(var(--space-16) * 2.95)', 'calc(var(--space-16) * 2.55)'] }).s;
      window.sb.attach(main, { emit() {} });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return [...main.querySelectorAll('.sbar-items')].slice(0, 2).map(line => {
        const items = [...line.querySelectorAll(':scope > .sbar-item')], shown = items.filter(x => !x.hidden), r = line.getBoundingClientRect();
        const more = line.querySelector(':scope > .sbar-more'), mr = more.getBoundingClientRect();
        return { width, shown: shown.map(x => x.dataset.key.match(/"(\w)"\]$/)[1]).join(''), inside: shown.every(x => x.getBoundingClientRect().right <= r.right + .5) && (!mr.width || mr.right <= r.right + .5) };
      });
    }, width));
    assert.ok(lines.every(l => l.shown.startsWith('tv') && l.shown.includes('s') && l.inside), `the value and the threshold stay, inside the line with "+N": ${JSON.stringify(lines)}`);
    /* the home as the AI pane leaves it (a 487px body) after a live redraw: the page's redraw (morph) wrote the table's style attribute back as rendered and took
       the fitted column widths with it, nothing refitted (no size change), so the threshold sat in its declared column and "+1" ran past the line and the chevron */
    const ko = [];
    for (const width of [440, 453, 470]) ko.push(...await page.evaluate(async width => {
      const { morph } = await import('/kit/core/morph.js');
      const table = () => window.sb.metrics([bar('CPU use', '20%', '48%', '80%'), bar('Memory use', '74%', '74%', '85%'), bar('5xx rate (Ingress)', '0.98%', '1.20%', '1.00%'), bar('Requests (Ingress)', '1.9/s', '1.9/s')],
        { columns: ['calc(var(--space-16) * 1.9)', 'calc(var(--space-16) * 1.1)', 'calc(var(--space-16) * 3.4)', 'calc(var(--space-16) * 2.95)', 'calc(var(--space-16) * 2.55)'] }).s;
      function bar(name, v, peak, s) { return { body: 'x', items: [{ id: 't', label: '', value: name }, { id: 'v', label: '', value: v, priority: 3 }, { id: 'p', label: '1h peak', value: peak, priority: 1 }, ...(s ? [{ id: 's', label: 'threshold', value: s, priority: 2 }] : [])] }; }
      const main = document.querySelector('main'); main.style.width = width + 'px';
      main.innerHTML = '<div></div>';
      morph(main.firstElementChild, table()); /* drawn as a page draws it: a bar whose markup did not change is not patched again */
      window.sb.attach(main, { emit() {} });
      const look = () => [...main.querySelectorAll('.sbar-items')].map(line => {
        const items = [...line.querySelectorAll(':scope > .sbar-item')], r = line.getBoundingClientRect(), mr = line.querySelector(':scope > .sbar-more').getBoundingClientRect();
        return { at: items.map(x => (x.hidden ? '-' : Math.round(x.getBoundingClientRect().width))).join(','), inside: items.every(x => x.hidden || x.getBoundingClientRect().right <= r.right + .5) && (!mr.width || mr.right <= r.right + .5) };
      });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      morph(main.firstElementChild, table()); /* the bars now know their markup (a new node takes it at its first patch) */
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const first = look();
      morph(main.firstElementChild, table()); /* the same drawing again, as a live tick redraws it */
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return [{ width, first, again: look() }];
    }, width));
    assert.ok(ko.every(l => JSON.stringify(l.first) === JSON.stringify(l.again) && l.again.every(x => x.inside)), `a redraw keeps the fitted line, every reading and "+N" inside it: ${JSON.stringify(ko)}`);
  } finally { await browser?.close(); server.close(); }
});

/* A-05: at 820px the home's 5xx bar lost its fourth column, "threshold 1.0% exceeded", to the narrow hiding, and a short line folded a warning
   value behind "+N" before a plain reading. A cell that carries a state that is not ok (a tone, a warn/error status) is never hidden by the
   width: the plain readings fold first */
test('narrow_width_never_hides_a_cell_carrying_a_non_ok_state', async () => {
  const { keepOf } = await import('./summary-bar.js');
  /* title | toned value (lowest priority) | plain reading | plain reading: the plain ones fold, the toned one stays */
  assert.deepEqual(keepOf([100, 100, 100, 100], [9, 0, 1, 2], 260, 10, 30, [false, true, false, false]), [true, true, false, false]);
  assert.deepEqual(keepOf([100, 100, 100], [9, 0, 1], 100, 10, 30, [false, true, true]), [true, true, true], 'nothing else to fold: state cells still stay');
});
