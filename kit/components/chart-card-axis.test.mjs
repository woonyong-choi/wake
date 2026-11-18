import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }

/* a time chart on the kit's own tokens, attached with a ctx that records what the page is told */
async function open(run) {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.stack));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
const draw = (page, props) => page.evaluate(async props => {
  const card = await import('/kit/components/chart-card.js');
  if (!document.querySelector('style[data-chart]')) { const style = document.createElement('style'); style.dataset.chart = ''; style.textContent = card.css; document.head.append(style); }
  const start = 1700000000, obs = Array.from({ length: 61 }, (_, i) => ({ at: start + i * 60, value: 20 + 10 * Math.sin(i / 6), joinPrevious: i > 0 }));
  const p = { title: 'CPU', ...props, chart: { kind: 'area', height: 220, unit: '%', timeAxis: { from: start, to: start + 3600, maxGapSeconds: 90 }, series: [{ key: 'a', name: 'CPU', color: '--series-1', observations: obs }], ...props.chart } };
  window.told = [];
  document.querySelector('main').innerHTML = String(card.render(p));
  window.detach?.(); window.detach = card.attach(document, { emit: (action, arg) => window.told.push({ action, ...arg }) });
  await document.fonts.ready;
}, props);

test('a page height over --chart-h-max does not make the chart taller than --chart-h-max', { skip: !chromium && 'playwright-core unavailable' }, () => open(async page => {
  await draw(page, { widget: true, density: 'compact', chart: { height: 880, bleed: true, axes: true, interactive: 'full', rangeAction: 'go', id: 'c' } });
  await page.waitForSelector('.chart svg');
  const { height, max } = await page.evaluate(() => ({ height: document.querySelector('.chart').getBoundingClientRect().height, max: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chart-h-max')) }));
  assert.ok(max > 0); assert.ok(height <= max, `chart ${height}px over --chart-h-max ${max}px`);
}));

/* the drawn value scale (its top label) and the shown window, as the page sees them */
/* a window that eases (a double click, a key) gets there over animation frames: two frames end it under reduced motion */
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const scaleOf = page => page.evaluate(() => { const el = document.querySelector('.chart'); return { min: el._chart.time.min, max: el._chart.time.max, from: el._chart.time.from, to: el._chart.time.to }; });
async function axisBox(page, axis) {
  const box = await page.locator(`.chart [data-axis="${axis}"]`).boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${axis} axis takes the pointer`);
  return box;
}
for (const variant of [{ name: 'a widget plate', props: { widget: true, density: 'compact', chart: { bleed: true, axes: true, interactive: 'full', rangeAction: 'go', id: 'c' } } },
  { name: 'a framed card', props: { chart: { rangeAction: 'go', id: 'c' } } }]) {
  test(`${variant.name}: a drag along the time marks stretches the window, along the values scales them, a double click goes back, and the plot still marks a span`, { skip: !chromium && 'playwright-core unavailable' }, () => open(async page => {
    await draw(page, variant.props);
    await page.waitForSelector('.chart svg');
    const start = await scaleOf(page);
    const x = await axisBox(page, 'x'), y = await axisBox(page, 'y');
    assert.equal(await page.locator('.chart [data-axis="x"]').evaluate(n => getComputedStyle(n).cursor), 'ew-resize');
    assert.equal(await page.locator('.chart [data-axis="y"]').evaluate(n => getComputedStyle(n).cursor), 'ns-resize');

    /* the time marks: to the right narrows the window around its middle; the reading names the window while it is held */
    const cx = x.x + x.width / 2, cy = x.y + x.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy, { steps: 4 }); await page.mouse.move(cx + x.width / 4, cy, { steps: 4 });
    assert.match(await page.locator('.chart .chart-scale .cz-t').innerText(), /\d{2}:\d{2}.*–.*\d{2}:\d{2}/);
    await page.mouse.up();
    const narrow = await scaleOf(page);
    assert.ok(narrow.to - narrow.from < start.to - start.from, 'narrower window');
    assert.ok(Math.abs((narrow.from + narrow.to) / 2 - (start.from + start.to) / 2) < 60, 'around the middle');
    const told = await page.evaluate(() => window.told.at(-1));
    assert.equal(told.action, 'go'); assert.equal(told.id, 'c'); assert.equal(told.source, 'scale');
    assert.equal(await page.locator('.chart .chart-scale').count(), 0, 'the reading goes when the drag ends');
    /* a double click on the time marks: back to the window before the drag */
    await page.mouse.dblclick(cx, cy); await settle(page);
    const back = await scaleOf(page);
    assert.deepEqual([back.from, back.to], [start.from, start.to]);
    assert.equal((await page.evaluate(() => window.told.at(-1))).source, 'scale');

    /* the values: upward narrows the value range (the line takes more of the plot), downward widens it; the low end stays */
    const vx = y.x + y.width / 2, vy = y.y + y.height / 2;
    await page.mouse.move(vx, vy); await page.mouse.down(); await page.mouse.move(vx, vy - y.height / 4, { steps: 6 });
    assert.match(await page.locator('.chart .chart-scale .cz-t').innerText(), /%.*–.*%/);
    await page.mouse.up();
    const tall = await scaleOf(page);
    assert.ok(tall.max < start.max, `value range narrows (${tall.max} < ${start.max})`); assert.equal(tall.min, start.min);
    const toldBefore = await page.evaluate(() => window.told.length);
    await page.mouse.move(vx, vy); await page.mouse.down(); await page.mouse.move(vx, vy + y.height / 2, { steps: 6 }); await page.mouse.up();
    assert.ok((await scaleOf(page)).max > tall.max, 'value range widens');
    assert.equal(await page.evaluate(() => window.told.length), toldBefore, 'the value range is the chart\'s own: nothing is told to the page');
    await page.mouse.dblclick(vx, vy);
    assert.equal((await scaleOf(page)).max, start.max, 'a double click fits the values again');

    /* the plot keeps marking a span */
    const plot = await page.locator('.chart [data-hit]').boundingBox();
    const px = x.x + x.width * .3, py = plot.y + plot.height / 2;
    await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px + x.width * .3, py, { steps: 6 }); await page.mouse.up(); await settle(page);
    assert.equal((await page.evaluate(() => window.told.at(-1))).source, 'select');

    /* the keyboard does the same on the focused chart: - and + the window, Shift with the arrows the values, 0 both back */
    await page.locator('.chart').evaluate(el => { el.focus(); });
    const before = await scaleOf(page);
    await page.keyboard.press('Minus'); await settle(page);
    const wider = await scaleOf(page); assert.ok(wider.to - wider.from >= before.to - before.from);
    await page.keyboard.press('Equal'); await settle(page);
    assert.ok((await scaleOf(page)).to - (await scaleOf(page)).from < wider.to - wider.from);
    await page.keyboard.press('Shift+ArrowUp');
    assert.ok((await scaleOf(page)).max < before.max);
    await page.keyboard.press('Digit0'); await settle(page);
    assert.equal((await scaleOf(page)).max, before.max);
  }));
}

test('a chart that only reads has no axis to drag', { skip: !chromium && 'playwright-core unavailable' }, () => open(async page => {
  await draw(page, { widget: true, density: 'compact', chart: { bleed: true, axes: true } });
  await page.waitForSelector('.chart svg');
  assert.equal(await page.locator('.chart [data-axis]').count(), 0);
}));
