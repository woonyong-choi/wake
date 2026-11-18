import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';
import { render } from './data-table.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }
const tableLabel = 'Select displayed items';
const displayLabels = { appearance: 'Style', heading: 'Shared selection' };
const props = () => ({ columns: [{ id: 'name', label: 'Name' }], rowKey: 'id', rows: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], selectable: true, selection: { label: tableLabel, rowLabel: row => row.name, allArg: { groupId: '<group>', viewRevision: 4 } } });

test('table_selection_derives_visible_header_and_preserves_opaque_arguments', () => {
  for (const [selected, expected] of [[[], 'false'], [['hidden'], 'false'], [['a'], 'mixed'], [['a', 'b', 'hidden'], 'true']]) {
    const result = String(render({ ...props(), selected }));
    assert.match(result, new RegExp(`aria-checked="${expected}"`));
    assert.match(result, /data-action="kit.table.select-all"/); assert.match(result, /&lt;group&gt;/);
    assert.match(result, /aria-label="Alpha"/); assert.match(result, /data-key="\[&quot;table-row&quot;/);
  }
  const empty = String(render({ ...props(), rows: [], selected: ['a'] }));
  assert.match(empty, /aria-checked="false".*disabled/);
  const invalid = props(); invalid.rows.push({ id: 'a', name: 'Duplicate' }); assert.throws(() => render(invalid), RangeError);
  assert.throws(() => render({ ...props(), selection: { label: tableLabel, rowLabel: () => '' } }), TypeError);
  assert.doesNotMatch(String(render({ ...props(), selection: undefined })), /cbx interactive|data-key=/);
});

test('table_selection_native_actions_morph_and_shared_appearances', { skip: !chromium && 'playwright-core unavailable' }, async () => {
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
    const page = await browser.newPage({ viewport: { width: 860, height: 1100 }, reducedMotion: 'reduce' });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async ({ label, displayLabels }) => {
      const table = await import('/kit/components/data-table.js'), checkbox = await import('/kit/components/checkbox.js'), chart = await import('/kit/components/chart-card.js');
      const { html } = await import('/kit/core/html.js'), { morph } = await import('/kit/core/morph.js');
      const style = document.createElement('style'); style.textContent = table.css + checkbox.css + chart.css; document.head.append(style);
      window.items = Array.from({ length: 6 }, (_, slot) => ({ id: JSON.stringify(['group', slot]), name: `resource-observability-compute-group-instance-00000000-000${slot}`, appearance: chart.seriesAppearance(slot), value: slot + 1 }));
      window.visible = window.items.slice(0, 3); window.selected = new Set([window.items[0].id, window.items[5].id]); window.events = [];
      window.allArg = { groupId: '<opaque-group>', viewRevision: 7 };
      window.draw = () => {
        const rows = window.visible;
        const series = window.items.filter(row => window.selected.has(row.id)).map(row => ({ name: row.name, ...row.appearance, values: [row.value, row.value + 1] }));
        morph(document.querySelector('main'), html`${table.render({ rowKey: 'id', rows, selected: [...window.selected], selectable: true,
          selection: { label, rowLabel: row => row.name, allArg: window.allArg }, rowAction: 'open',
          columns: [{ id: 'name', label: 'Name', width: 'calc(var(--space-40) * 4)' }, { id: 'style', label: displayLabels.appearance, width: 'var(--space-10)', cell: row => chart.seriesSwatch(row.appearance) }] })}${chart.render({ title: displayLabels.heading, chart: { kind: 'line', height: 180, x: ['09:15', '09:30'], max: 8, ticks: [0, 4, 8], series } })}`);
      };
      document.addEventListener('click', event => {
        const el = event.target.closest('[data-action]'); if (!el) return;
        const action = el.dataset.action, arg = JSON.parse(el.dataset.arg); window.events.push({ action, arg });
        if (action === 'kit.table.select') { if (window.selected.has(arg)) window.selected.delete(arg); else window.selected.add(arg); }
        if (action === 'kit.table.select-all') { const all = window.visible.every(row => window.selected.has(row.id)); for (const row of window.visible) { if (all) window.selected.delete(row.id); else window.selected.add(row.id); } }
        window.draw();
      });
      window.draw(); window.detachTable = table.attach(document); window.detachChart = chart.attach(document); await document.fonts.ready;
    }, { label: tableLabel, displayLabels });
    const header = page.getByRole('checkbox', { name: tableLabel });
    assert.equal(await header.getAttribute('aria-checked'), 'mixed');
    const first = page.locator('tbody button[role="checkbox"]').first(), handle = await first.elementHandle();
    await first.focus(); await page.keyboard.press('Space'); assert.equal(await header.getAttribute('aria-checked'), 'false');
    assert.equal(await page.evaluate(() => window.selected.has(window.items[5].id)), true);
    assert.equal(await handle.evaluate(el => el.isConnected && el === document.activeElement), true);
    await header.focus(); await page.keyboard.press('Enter'); assert.equal(await header.getAttribute('aria-checked'), 'true');
    const event = await page.evaluate(() => window.events.at(-1)); assert.deepEqual(event, { action: 'kit.table.select-all', arg: { groupId: '<opaque-group>', viewRevision: 7 } });
    assert.equal(await page.evaluate(() => window.events.length), 2);
    await page.evaluate(() => { window.visible.reverse(); window.draw(); });
    assert.equal(await header.getAttribute('aria-checked'), 'true');
    const results = [];
    for (const width of [860, 1440]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 1100 });
      const result = await page.evaluate(async ({ theme, availableWidth }) => {
        document.querySelector('main').style.width = availableWidth + 'px';
        document.documentElement.dataset.theme = theme; await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const cells = [...document.querySelectorAll('tbody td:first-child + td')];
        const swatches = [...document.querySelectorAll('.chart-series-swatch path')];
        const lineGroups = [...document.querySelectorAll('.chart [data-series]')];
        return { theme, cellsFit: cells.every(cell => cell.scrollWidth <= cell.clientWidth),
          decorative: [...document.querySelectorAll('.chart-series-swatch')].every(el => el.getAttribute('aria-hidden') === 'true'),
          swatchSizes: [...document.querySelectorAll('.chart-series-swatch')].map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, expectedWidth: parseFloat(getComputedStyle(el).getPropertyValue('--space-4')), expectedHeight: parseFloat(getComputedStyle(el).getPropertyValue('--space-1')) })),
          appearances: window.visible.map(row => row.appearance),
          swatches: swatches.map(path => ({ color: path.getAttribute('stroke'), dash: path.getAttribute('stroke-dasharray') })),
          chart: lineGroups.map(group => ({ name: window.items.filter(row => window.selected.has(row.id))[Number(group.dataset.series)].name, dash: group.querySelector('path')?.getAttribute('stroke-dasharray'), color: group.querySelector('path')?.getAttribute('stroke') })) };
      }, { theme, availableWidth: width === 860 ? 280 : 900 });
      results.push({ width, ...result }); assert.equal(result.cellsFit, true); assert.equal(result.decorative, true);
      for (const size of result.swatchSizes) { assert.equal(size.width, size.expectedWidth); assert.equal(size.height, size.expectedHeight); }
      result.appearances.forEach((a, i) => assert.deepEqual(result.swatches[i], { color: `var(${a.color})`, dash: a.dash }));
      const expected = await page.evaluate(() => window.items.filter(row => window.selected.has(row.id)).map(row => ({ name: row.name, dash: row.appearance.dash, color: `var(${row.appearance.color})` })));
      assert.deepEqual(result.chart, expected);
      if (process.env.GROUP_SELECTION_EVIDENCE) { mkdirSync(process.env.GROUP_SELECTION_EVIDENCE, { recursive: true }); await page.locator('main').screenshot({ path: resolve(process.env.GROUP_SELECTION_EVIDENCE, `table-${theme}-${width}.png`) }); }
    }
    await page.evaluate(() => { window.visible = []; window.draw(); });
    assert.equal(await header.getAttribute('aria-checked'), 'false'); assert.equal(await header.isDisabled(), true);
    await header.evaluate(el => el.click()); assert.equal(await page.evaluate(() => window.events.length), 2);
    await page.evaluate(() => { window.detachChart(); });
    if (process.env.GROUP_SELECTION_EVIDENCE) writeFileSync(resolve(process.env.GROUP_SELECTION_EVIDENCE, 'table-results.json'), JSON.stringify(results, null, 2));
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

/* A-06: at 820px a table hid its identity (the first column) and a column that carried a state (a warn count) by width. The first column is
   never optional, and a column with a cell that is not ok (a warn/danger tone, a warn/error status) never hides: plain optional columns go first */
const NARROW = 420; /* the measured page width that forces folding */
test('narrow_table_never_hides_its_first_column_or_a_column_carrying_state', async () => {
  const columns = [{ id: 'name', label: 'Name', optional: true, width: 'var(--space-16)' }, { id: 'msg', label: 'Message' },
    { id: 'count', label: 'Count', kind: 'number', optional: true, width: 'calc(var(--space-16) * 3)', tone: r => r.count > 1 ? 'warn' : null },
    { id: 'source', label: 'Source', optional: true, width: 'calc(var(--space-16) * 3)' }];
  const p = { clip: true, rowKey: 'id', columns, rows: [{ id: 'a', name: 'row-a', msg: 'Readiness probe failed', count: 4, source: 'kubelet' }] };
  assert.doesNotMatch(render(p).s.match(/<th[^>]*>Name<\/th>/)[0], /data-opt/, 'the identity column has no rank to hide by');
  if (!chromium) return;
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main style="width:${NARROW}px"></main>`); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const shown = await page.evaluate(async p => {
      const table = await import('/kit/components/data-table.js');
      p.columns[2].tone = r => r.count > 1 ? 'warn' : null;
      const style = document.createElement('style'); style.textContent = table.css; document.head.append(style);
      document.querySelector('main').innerHTML = table.render(p).s; table.attach(document);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return [...document.querySelectorAll('thead th')].filter(th => th.getClientRects().length).map(th => th.textContent);
    }, { ...p, columns: columns.map(({ tone, ...c }) => c) });
    assert.ok(shown.includes('Name'), `identity stays: ${shown}`);
    assert.ok(shown.includes('Count'), `the warn count stays: ${shown}`);
    assert.ok(!shown.includes('Source'), `the plain optional column folds first: ${shown}`);
  } finally { await browser?.close(); server.close(); }
});

/* optional: a number names the fold order (1 folds first) ahead of the plain right-to-left order: a page keeps a wide text column (a message)
   and folds a short source before it, without moving columns */
test('optional_number_names_the_fold_order_before_the_right_to_left_order', async () => {
  const { render } = await import('./data-table.js');
  const s = String(render({ rowKey: 'id', rows: [{ id: 'a' }], columns: [{ id: 'at', label: 'At' }, { id: 'src', label: 'Source', optional: 1, width: 'var(--space-16)' }, { id: 'kind', label: 'Kind', optional: true, width: 'var(--space-16)' }, { id: 'msg', label: 'Message', optional: 2 }] }));
  const ranks = Object.fromEntries([...s.matchAll(/<th class="[^"]*"([^>]*)>([^<]*)</g)].map(m => [m[2], /data-opt="(\d+)"/.exec(m[1])?.[1] ?? null]));
  assert.deepEqual(ranks, { At: null, Source: '1', Kind: '3', Message: '2' });
});

/* A-30: with the columns after it folded, the last shown column's rule ends on the content line like the card's head rule (8px inside the
   table's reach), not 8px past it. A2-05: a clipped table never scrolls sideways; a short text column gives back its widening first.
   A2-07: a fit is one layout (reads, then writes), and a resize report that leaves the width as it was fits nothing again */
const CARD_820 = 482; /* the events card body of an 820px window with the sidebar open, measured in the app */
test('folded_table_ends_its_rule_on_the_content_line_never_scrolls_when_clipped_and_fits_in_one_layout', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main style="width:${CARD_820}px"></main>`); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const layouts = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'LayoutCount').value;
    await page.evaluate(async () => {
      const table = await import('/kit/components/data-table.js');
      const style = document.createElement('style'); style.textContent = table.css; document.head.append(style);
      window.table = table;
      document.querySelector('main').innerHTML = table.render({ clip: true, rowKey: 'id', reveal: true, rows: [{ id: 'a', at: '05:24', reason: 'FailedComputeMetricsReplicas', name: 'checkout-api-58cbf4fb5f-pgbhx', n: 204, first: '2026-11-15 18:12', msg: 'Readiness probe failed' }],
        columns: [{ id: 'at', label: 'Last Seen', time: true, width: 'var(--space-16)' }, { id: 'reason', label: 'Reason', fit: true, width: 'calc(var(--space-16) * 2)' }, { id: 'name', label: 'Object' },
          { id: 'n', label: 'Count', kind: 'number', width: 'var(--space-16)' }, { id: 'first', label: 'First Seen', time: true, width: 'var(--space-16)' }, { id: 'msg', label: 'Message', optional: 1 }] }).s;
      await document.fonts.ready;
    });
    const before = await layouts();
    await page.evaluate(async () => { window.table.attach(document); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    const attached = await layouts() - before;
    const got = await page.evaluate(() => {
      const wrap = document.querySelector('.dt-wrap'), shown = [...document.querySelectorAll('thead th')].filter(th => th.getClientRects().length);
      const last = shown.at(-1), cs = getComputedStyle(last);
      return { scroll: wrap.scrollWidth - wrap.clientWidth, shown: shown.map(th => th.textContent), lastEnds: cs.borderImageSource.startsWith('linear-gradient') && last.hasAttribute('data-end') };
    });
    const fails = [];
    if (got.scroll !== 0) fails.push(`a clipped table does not scroll: ${JSON.stringify(got)}`);
    if (got.shown.includes('Message')) fails.push(`the optional column folds: ${got.shown}`);
    if (!got.lastEnds) fails.push('the last shown cell (First Seen) ends its rule on the content line');
    if (attached > 3) fails.push(`attaching fits in one layout (plus the page's own): ${attached} layouts`);
    /* the host grows taller (a stylesheet rule: no change inside the table), its width stays: the resize report fits nothing */
    const settled = await layouts();
    await page.evaluate(async () => { const s = document.createElement('style'); s.textContent = '.dt-host { min-height: calc(var(--space-40) * 2) }'; document.head.append(s); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    const resized = await layouts() - settled;
    if (resized > 1) fails.push(`a resize that leaves the width does not fit again: ${resized} layouts`);
    /* a list whose sized columns overflow it at first (a resource list: eight optional columns): the folds are worked out from the room the
       table has, not from the overflowing table's own width, so every optional column folds and the name keeps its floor */
    const wide = await page.evaluate(async width => {
      const main = document.querySelector('main'); main.style.width = width + 'px';
      const col = (id, w, optional) => ({ id, label: id, kind: 'number', width: `calc(var(--space-16) * ${w})`, ...(optional ? { optional } : {}) });
      main.innerHTML = window.table.render({ clip: true, rowKey: 'id', rows: [{ id: 'a', name: 'checkout-api' }], columns: [{ id: 'name', label: 'Name' }, col('ns', 2), col('status', 2.5), col('ready', 1), col('cpu', 2.5), col('mem', 2.5),
        ...[8, 7, 6, 5, 4, 3, 2, 1].map(n => col('o' + n, 1.5, n))] }).s;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const wrap = document.querySelector('.dt-wrap');
      return { scroll: wrap.scrollWidth - wrap.clientWidth, name: document.querySelector('thead th').offsetWidth, shown: [...document.querySelectorAll('thead th')].filter(th => th.getClientRects().length).length };
    }, CARD_820 * 2);
    if (wide.scroll !== 0 || wide.name < 160 || wide.shown !== 6) fails.push(`a list that overflowed at first folds every optional column and keeps its name: ${JSON.stringify(wide)}`);
    assert.deepEqual(fails, []);
  } finally { await browser?.close(); server.close(); }
});

/* A3-03: a Status column that shows only icons takes an icon's room, not its declared 160px, and the names get it; a generated name still too long
   keeps its start and its end (the generated suffix that tells two copies apart), cut in its middle, its whole text on hover */
test('an_icon_only_status_column_takes_its_content_width_and_long_names_keep_their_distinguishing_end', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main style="width:calc(var(--space-16) * 5.625)"></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const got = await page.evaluate(async () => {
      const table = await import('/kit/components/data-table.js'), sti = await import('/kit/components/status-icon.js');
      const style = document.createElement('style'); style.textContent = table.css + sti.css + '.wi { width: var(--icon-md); height: var(--icon-md); }'; document.head.append(style);
      document.querySelector('main').innerHTML = table.render({ clip: true, rowKey: 'id', reveal: true, rowAction: 'open', rows: [{ id: 'a', name: 'checkout-api-58cbf4fb5f-pgbhx', node: 'lab-worker' }, { id: 'b', name: 'checkout-api-58cbf4fb5f-x7k2q', node: 'lab-worker2' }],
        columns: [{ id: 'name', label: 'Name', trim: 'middle', lead: () => ({ dot: '--success' }) }, { id: 'status', label: 'Status', width: 'calc(var(--space-16) * 2.5)', fit: true, cell: () => sti.render({ kind: 'ok', label: 'Running' }) },
          { id: 'node', label: 'Node', muted: true, width: 'calc(var(--space-16) * 2)' }] }).s;
      await document.fonts.ready; table.attach(document);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const th = [...document.querySelectorAll('thead th')], names = [...document.querySelectorAll('.dt-lead-t')];
      return { status: th[1].offsetWidth, names: names.map(n => n.textContent), clipped: names.map(n => n.scrollWidth > n.clientWidth && [n.scrollWidth, n.clientWidth, n.textContent, n.closest('td').offsetWidth, n.getBoundingClientRect().left - n.closest('td').getBoundingClientRect().left]), tips: names.map(n => n.getAttribute('data-tip')) };
    });
    const fails = [];
    if (got.status > 90) fails.push(`the icon-only Status column takes its content width: ${got.status}px`);
    if (!got.names.every(n => /-(pgbhx|x7k2q)$/.test(n)) || new Set(got.names).size !== 2) fails.push(`each name keeps its distinguishing end: ${got.names}`);
    if (got.clipped.some(Boolean)) fails.push(`a name is cut in its middle, not at its end: ${got.clipped}`);
    if (!got.names.every(n => n.includes('…')) || !got.tips.every(t => t?.startsWith('checkout-api-58cbf4fb5f-'))) fails.push(`a cut name shows its whole text on hover: ${got.tips}`);
    assert.deepEqual(fails, []);
  } finally { await browser?.close(); server.close(); }
});
