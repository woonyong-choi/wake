import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { render as renderFlow } from './flow-graph.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }

test('axis_gutter_measures_full_labels_and_reserves_unavailable_metrics', () => {
  const source = readFileSync(new URL('./chart-card.js', import.meta.url), 'utf8');
  const gutter = runInNewContext(source.slice(source.indexOf('function axisGutter('), source.indexOf('function draw(')) + '\naxisGutter');
  const tokens = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
  const fontSize = tokens.match(/--text-xs:\s*([^;]+);/)?.[1].trim();
  assert.match(fontSize || '', /^(?:\d+(?:\.\d+)?|\.\d+)px$/);
  const fontSizePx = Number.parseFloat(fontSize);
  assert.ok(Number.isFinite(fontSizePx) && fontSizePx > 0);
  let removed = 0, unavailable = false;
  const labels = ['0req/s', '0.544req/s', '1.09req/s', '1024MiB', '-0.000001MiB'];
  const widths = new Map(labels.map((label, i) => [label, 30 + i * 19]));
  const doc = { defaultView: { getComputedStyle: () => ({ fontSize }) }, createElementNS: namespaceURI => ({
    namespaceURI, style: {}, setAttribute() {}, append() {}, remove() { removed++; },
    getComputedTextLength() { if (unavailable) throw new Error('hidden SVG'); return widths.get(this.textContent); },
    getBBox() { return { x: -widths.get(this.textContent) - 2 }; },
  }) };
  const el = { ownerDocument: doc, append() {} };
  assert.equal(gutter(el, labels), 116);
  unavailable = true;
  assert.equal(gutter(el, labels), Math.max(56, Math.ceil(Math.max(...labels.map(label => Array.from(label).length)) * fontSizePx) + 8));
  unavailable = false;
  assert.equal(gutter(el, ['0req/s']), 56);
  assert.equal(removed, 3);
});

// Refs #54: uniform relationships must not replace the existing weighted contract.
test('flow_render_keeps_weighted_default_and_explicit_relation_labels', () => {
  const graph = {
    width: 300, height: 100, columns: [0, 150],
    nodes: [{ id: 'a', col: 0, y: 0, h: 80, label: 'A', state: 'ok' }, { id: 'b', col: 1, y: 10, h: 20, label: 'B', state: 'ok' }],
    links: [{ from: 'a', to: 'b', fromOffset: 20, toOffset: 0, size: 15, state: 'ok', label: 'selector' }],
  };

  const weighted = String(renderFlow(graph));
  const relation = String(renderFlow({ ...graph, mode: 'relation' }));

  assert.doesNotMatch(weighted, /class="fl-run[ "]/);
  assert.match(String(renderFlow({ ...graph, links: graph.links.map(link => ({ ...link, active: true })) })), /class="fl-run[ "]/);
  assert.match(weighted, /L150,25/);
  assert.match(relation, /class="flow relation vs-filledOutline stm-clock"/);
  assert.match(relation, /<title>selector<\/title>/);
  assert.doesNotMatch(relation, /class="fl-run[ "]/);
});

// Refs #54: keyboard values, hidden-series persistence, live data updates and cleanup.
test('chart_keyboard_legend_resize_data_update_and_detach', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><body><main></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 860, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const card = await import('/kit/components/chart-card.js');
      const style = document.createElement('style'); style.textContent = card.css; document.head.append(style);
      const chartTitle = 'Memory', referenceLabel = 'Limit';
      const chart = { kind: 'area', height: 180, x: ['09:15', '10:15'], max: 300, ticks: [0, 300], unit: 'Mi', ref: { value: 256, label: referenceLabel }, series: [{ name: 'A', color: '--series-1', values: [10, 20] }, { name: 'B', color: '--series-2', values: [30, 40] }] };
      document.querySelector('main').innerHTML = String(card.render({ title: chartTitle, legend: chart.series.map(s => ({ label: s.name, color: s.color })), chart }));
      window.detachChart = card.attach(document);
    });
    const chart = page.locator('.chart'), button = page.locator('[data-chart-series]').first();
    await page.waitForSelector('.chart svg');
    const axisCases = await page.evaluate(async () => {
      const el = document.querySelector('.chart'), initial = el.dataset.chart;
      const settle = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const results = [];
      for (const [unit, ticks] of [['req/s', [0, .544, 1.09]], ['MiB', [0, 512, 1024]], ['MiB', [-.000001, 0, .000001]]]) {
        for (const width of [260, 800]) {
          el.style.width = width + 'px';
          const c = JSON.parse(initial); c.unit = unit; c.ticks = ticks;
          el.dataset.chart = JSON.stringify(c); await settle();
          const svg = el.querySelector('svg'), grid = svg.querySelector('.gridl');
          const axis = [...svg.querySelectorAll('text.axis')].slice(0, ticks.length);
          const left = Number(grid.getAttribute('x1')), right = Number(grid.getAttribute('x2'));
          results.push({ unit, width, labels: axis.map(text => text.textContent),
            contained: axis.every(text => { const box = text.getBBox(); return box.x >= 0 && box.x + box.width <= left; }),
            aligned: [...svg.querySelectorAll('.gridl')].every(line => Number(line.getAttribute('x1')) === left && Number(line.getAttribute('x2')) === right)
              && el._chart.padL === left && el._chart.c.px(0) === left && el._chart.c.px(el._chart.n - 1) === right,
            plotWidth: el._chart.iw, gutter: left });
        }
      }
      const measure = SVGTextContentElement.prototype.getComputedTextLength;
      SVGTextContentElement.prototype.getComputedTextLength = () => 0;
      document.fonts.dispatchEvent(new Event('loadingdone')); await settle();
      const fallback = el._chart.padL, svg = el.querySelector('svg');
      SVGTextContentElement.prototype.getComputedTextLength = measure;
      document.fonts.dispatchEvent(new Event('loadingdone')); await settle();
      const remeasured = el._chart.padL < fallback && el.querySelector('svg') === svg;
      el.style.removeProperty('width'); el.dataset.chart = initial; await settle();
      return { results, remeasured };
    });
    for (const result of axisCases.results) {
      assert.equal(result.contained, true, JSON.stringify(result));
      assert.equal(result.aligned, true, JSON.stringify(result));
      assert.ok(result.plotWidth > 0, JSON.stringify(result));
      const ticks = result.unit === 'req/s' ? [0, .544, 1.09] : result.labels.some(label => label.startsWith('-')) ? [-.000001, 0, .000001] : [0, 512, 1024];
      assert.deepEqual(result.labels, ticks.map(tick => String(tick) + result.unit));
    }
    for (let i = 0; i < axisCases.results.length; i += 2) assert.equal(axisCases.results[i].gutter, axisCases.results[i + 1].gutter);
    assert.equal(axisCases.remeasured, true);
    await chart.focus(); await page.keyboard.press('End');
    assert.match(await chart.locator('.chart-tip').innerText(), /10:15\nA\n20Mi\nB\n40Mi/);
    await page.keyboard.press('Home');
    assert.match(await chart.locator('.chart-tip').innerText(), /09:15/);
    await button.click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await chart.focus(); await page.keyboard.press('End');
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.doesNotMatch(await chart.locator('.chart-tip').innerText(), /20Mi/);
    await button.click(); await chart.focus(); await page.keyboard.press('End');
    assert.match(await chart.locator('.chart-tip').innerText(), /20Mi/);
    await page.keyboard.press('Escape');
    assert.equal(await chart.evaluate(el => el.classList.contains('hover')), false);
    await chart.evaluate(el => { const c = JSON.parse(el.dataset.chart); c.series[0].values[1] = 25; el.dataset.chart = JSON.stringify(c); });
    await page.waitForTimeout(50); await chart.focus(); await page.keyboard.press('End');
    assert.match(await chart.locator('.chart-tip').innerText(), /25Mi/);
    await page.evaluate(() => window.detachChart());
    await page.keyboard.press('Home');
    assert.equal(await chart.evaluate(el => el.classList.contains('hover')), false);
    assert.equal(await chart.locator('.chart-tip').isVisible(), false);
    assert.equal(await chart.evaluate(el => el._point), undefined);
    await page.evaluate(() => window.detachChart());
    await chart.dispatchEvent('pointerout'); await chart.blur(); await chart.focus();
    assert.equal(await chart.locator('.chart-tip').isVisible(), false);
    await page.evaluate(async () => { const card = await import('/kit/components/chart-card.js'); window.detachChart = card.attach(document); });
    await chart.focus(); await page.keyboard.press('End');
    assert.match(await chart.locator('.chart-tip').innerText(), /25Mi/);
    await page.evaluate(async () => {
      const card = await import('/kit/components/chart-card.js');
      const source = document.querySelector('.card');
      const hosts = [document.createElement('section'), document.createElement('section')];
      for (const host of hosts) { host.append(source.cloneNode(true)); document.body.append(host); }
      const [first, neighbor] = hosts.map(host => host.querySelector('.chart'));
      const detach = card.attach(hosts[0]), detachNeighbor = card.attach(hosts[1]);
      const end = el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      hosts[0].querySelector('[data-chart-series]').click();
      end(first); end(neighbor);
      const hidden = [...first._hiddenSeries];
      detach(); detach();
      if (first.classList.contains('hover') || first._point !== undefined || first.querySelector('.chart-tip').textContent) throw new Error('detached selection remains');
      if (!neighbor.classList.contains('hover') || neighbor._point !== 1) throw new Error('neighbor changed');
      const detachAgain = card.attach(hosts[0]);
      end(first);
      if (!first.classList.contains('hover') || first._point !== 1 || JSON.stringify([...first._hiddenSeries]) !== JSON.stringify(hidden)) throw new Error('reattach lost state');
      hosts[0].querySelector('.card').remove();
      await new Promise(resolve => setTimeout(resolve, 0));
      detachAgain();
      if (first.classList.contains('hover') || first._point !== undefined) throw new Error('removed chart selection remains');
      detachNeighbor(); hosts.forEach(host => host.remove());
    });
    // Refs #54: absent observations stay absent; one observation has no history.
    for (const kind of ['line', 'area', 'bar']) {
      for (const [x, values] of [[[], []], [['one'], [4]], [['one'], []], [['one', 'two', 'three'], [4, null, 6]], [undefined, [4]], [['one', 'two'], undefined]]) {
        await chart.evaluate((el, input) => {
          const c = JSON.parse(el.dataset.chart);
          c.kind = input.kind; c.x = input.x; c.series = [{ name: 'A', color: '--series-1', values: input.values }];
          c.max = 0; el.dataset.chart = JSON.stringify(c);
        }, { kind, x, values });
        await page.waitForTimeout(30);
        await chart.focus(); await page.keyboard.press('Home');
        assert.doesNotMatch(await chart.locator('svg').innerHTML(), /NaN|Infinity|undefined/);
        const valid = Boolean(x?.length && Number.isFinite(values?.[0]));
        assert.equal(await chart.evaluate(el => el.classList.contains('hover')), valid);
        if (valid) assert.match(await chart.locator('.chart-tip').innerText(), /4Mi/);
        if (x?.length === 1 && valid && kind !== 'bar') {
          assert.equal(await chart.locator('circle').count(), 1);
          assert.equal(await chart.locator('.ln, path').count(), 0);
        }
        if (valid) {
          await button.click();
          assert.equal(await chart.evaluate(el => el.classList.contains('hover')), false);
          await button.click();
        }
        await chart.hover();
        await page.setViewportSize({ width: 860, height: 900 });
        await page.setViewportSize({ width: 1440, height: 900 });
      }
    }
    await chart.evaluate(el => { const c = JSON.parse(el.dataset.chart); c.x = []; c.series[0].values = []; el.dataset.chart = JSON.stringify(c); });
    await page.waitForTimeout(30);
    await page.evaluate(() => window.detachChart());
    await page.keyboard.press('Home');
    assert.equal(await chart.evaluate(el => el.classList.contains('hover')), false);
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});


// Compact keeps the chart's axis-inclusive height and the existing series/sample interactions.
test('chart_compact_keeps_height_axes_series_and_sample_selection', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><body><main></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 860, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const card = await import('/kit/components/chart-card.js');
      const style = document.createElement('style'); style.textContent = card.css; document.head.append(style);
      const props = { density: 'compact', title: 'Requests · checkout-api-with-a-long-resource-name', value: '1.09req/s',
        legend: [{ label: 'A', color: '--series-1' }, { label: 'B', color: '--series-2' }],
        chart: { kind: 'line', height: 64, aspect: false, x: ['09:15', '09:20', '09:25'], max: 1.09, ticks: [0, .544, 1.09], unit: 'req/s',
          series: [{ name: 'A', color: '--series-1', values: [.2, .4, .6] }, { name: 'B', color: '--series-2', values: [.3, .5, .7] }] } };
      document.querySelector('main').innerHTML = String(card.render(props)); window.detachCompact = card.attach(document);
    });
    await page.waitForSelector('.chart svg');
    for (const theme of ['dark', 'light']) for (const width of [260, 800]) {
      const geometry = await page.evaluate(async ({ theme, width }) => {
        document.documentElement.dataset.theme = theme;
        const card = document.querySelector('.card'); card.style.width = width + 'px';
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const el = card.querySelector('.chart'), svg = el.querySelector('svg');
        const labels = [...svg.querySelectorAll('text.axis')].slice(0, 3);
        return { height: svg.getBoundingClientRect().height, overflow: card.scrollWidth > card.clientWidth,
          labels: labels.map(t => t.textContent), contained: labels.every(t => t.getBBox().x >= 0),
          title: card.querySelector('.card-t').textContent, value: card.querySelector('.card-big').textContent,
          overlap: labels.some((t, i) => i && t.getBBox().y + t.getBBox().height > labels[i - 1].getBBox().y) };
      }, { theme, width });
      assert.equal(geometry.height, 64); assert.equal(geometry.overflow, false); assert.equal(geometry.contained, true);
      assert.equal(geometry.overlap, false); assert.deepEqual(geometry.labels, ['0req/s', '0.544req/s', '1.09req/s']);
      assert.match(geometry.title, /long-resource-name/); assert.equal(geometry.value, '1.09req/s');
    }
    const chart = page.locator('.chart'), first = page.locator('[data-chart-series]').first();
    await chart.focus(); await page.keyboard.press('End');
    assert.match(await chart.locator('.chart-tip').innerText(), /09:25\nA\n0.6req\/s\nB\n0.7req\/s/);
    await first.click(); await chart.focus(); await page.keyboard.press('End');
    assert.equal(await first.getAttribute('aria-pressed'), 'false');
    assert.doesNotMatch(await chart.locator('.chart-tip').innerText(), /0.6req\/s/);
    await chart.evaluate(el => { const c = JSON.parse(el.dataset.chart); c.x.push('09:30'); c.series[0].values.push(.8); c.series[1].values.push(.9); el.dataset.chart = JSON.stringify(c); });
    await page.waitForFunction(() => document.querySelector('.chart')._chart.n === 4);
    assert.equal(await first.getAttribute('aria-pressed'), 'false');
    assert.equal(await chart.evaluate(el => el._chart.c.x[el._point]), '09:25');
    await first.click(); await chart.focus(); await page.keyboard.press('Home');
    assert.match(await chart.locator('.chart-tip').innerText(), /09:15/);
    await chart.hover(); assert.equal(await chart.locator('.chart-tip').isVisible(), true);
    await chart.evaluate(el => { const referenceLabel = 'Limit'; const c = JSON.parse(el.dataset.chart); c.ref = { value: .8, label: referenceLabel }; el.dataset.chart = JSON.stringify(c); });
    await page.waitForFunction(() => document.querySelector('.chart svg').getBoundingClientRect().height > 64);
    for (const width of [260, 800]) {
      const geometry = await chart.evaluate(async (el, width) => {
        el.closest('.card').style.width = width + 'px';
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const svg = el.querySelector('svg'), labels = [...svg.querySelectorAll('text.axis')].slice(0, 3);
        const lineHeight = parseFloat(getComputedStyle(el).getPropertyValue('--leading-xs'));
        return { height: svg.getBoundingClientRect().height, lineHeight,
          overlap: labels.some((t, i) => i && t.getBBox().y + t.getBBox().height > labels[i - 1].getBBox().y),
          ref: el.querySelector('.ref-label').textContent };
      }, width);
      assert.equal(geometry.height, 54 + Math.ceil(geometry.lineHeight * 1.09 / .544));
      assert.equal(geometry.overlap, false); assert.equal(geometry.ref, 'Limit');
      await chart.focus(); await page.keyboard.press('End');
      assert.match(await chart.locator('.chart-tip').innerText(), /09:30\nA\n0.8req\/s\nB\n0.9req\/s/);
      await first.click(); await chart.focus(); await page.keyboard.press('Home');
      assert.equal(await first.getAttribute('aria-pressed'), 'false');
      await first.click(); await chart.hover();
      assert.equal(await chart.locator('.chart-tip').isVisible(), true);
    }
    await chart.evaluate(el => { const c = JSON.parse(el.dataset.chart); delete c.ref; el.dataset.chart = JSON.stringify(c); });
    await page.waitForFunction(() => document.querySelector('.chart svg').getBoundingClientRect().height === 64);
    await page.evaluate(() => window.detachCompact());
  } finally {
    await browser?.close(); await new Promise(done => server.close(done));
  }
});

// Long labels remain readable and independently selectable without changing chart samples.
test('chart_long_legend_wraps_complete_names_and_keeps_interactions', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const names = process.env.CHART_LEGEND_FIXTURE
    ? JSON.parse(readFileSync(process.env.CHART_LEGEND_FIXTURE, 'utf8')).labels
    : Array.from({ length: 6 }, (_, i) => `resource-observability-compute-group-instance-00000000-000${i}`);
  assert.equal(names.length, 6); assert.ok(names.every(name => typeof name === 'string' && name.length > 40));
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><body><main></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 860, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async names => {
      const card = await import('/kit/components/chart-card.js');
      const style = document.createElement('style'); style.textContent = card.css; document.head.append(style);
      const chartTitle = 'Label replay';
      const series = names.map((name, i) => ({ name, color: `--series-${i % 3 + 1}`, values: [i + 1, i + 2] }));
      document.querySelector('main').innerHTML = String(card.render({ density: 'compact', title: chartTitle, value: '6 series',
        legend: series.map(s => ({ label: s.name, color: s.color })),
        chart: { kind: 'line', height: 64, aspect: false, x: ['09:15', '09:30'], max: 8, ticks: [0, 4, 8], series } }));
      window.detachLongLegend = card.attach(document); await document.fonts.ready;
    }, names);
    await page.waitForSelector('.chart svg');
    const results = [];
    for (const [viewport, width] of [[860, 220], [1440, 280]]) {
      await page.setViewportSize({ width: viewport, height: 1000 });
      for (const theme of ['dark', 'light']) {
        const geometry = await page.evaluate(async ({ width, theme }) => {
          document.documentElement.dataset.theme = theme;
          const card = document.querySelector('.card'); card.style.width = width + 'px';
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          const buttons = [...card.querySelectorAll('.legend button')], legend = card.querySelector('.legend');
          return { width, theme, cardHeight: card.clientHeight, legendHeight: legend.clientHeight, cardOverflow: card.scrollWidth > card.clientWidth,
            legendOverflow: legend.scrollWidth > legend.clientWidth, labels: buttons.map(b => b.textContent.trim()),
            buttons: buttons.map(b => ({ width: b.clientWidth, height: b.clientHeight, overflow: b.scrollWidth > b.clientWidth, pressed: b.getAttribute('aria-pressed') })),
            chartHeight: card.querySelector('.chart svg').getBoundingClientRect().height };
        }, { width, theme });
        results.push(geometry);
        if (process.env.CHART_LEGEND_EVIDENCE) await page.locator('.card').screenshot({ path: resolve(process.env.CHART_LEGEND_EVIDENCE, `long-legend-${theme}-${width}.png`) });
      }
    }
    if (process.env.CHART_LEGEND_EVIDENCE) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(resolve(process.env.CHART_LEGEND_EVIDENCE, 'long-legend-results.json'), JSON.stringify(results, null, 2));
    }
    for (const result of results) {
      assert.deepEqual(result.labels, names);
      assert.equal(result.cardOverflow, false, JSON.stringify(result)); assert.equal(result.legendOverflow, false, JSON.stringify(result));
      assert.equal(result.chartHeight, 64); assert.equal(result.buttons.length, 6);
      assert.ok(result.buttons.every(b => !b.overflow && b.pressed === 'true'), JSON.stringify(result));
    }
    const chart = page.locator('.chart');
    for (const width of [220, 280]) {
      await chart.evaluate((el, width) => { el.closest('.card').style.width = width + 'px'; }, width);
      for (let i = 0; i < names.length; i++) {
        const button = page.getByRole('button', { name: names[i], exact: true });
        await button.focus(); await page.keyboard.press('Enter'); assert.equal(await button.getAttribute('aria-pressed'), 'false');
        await chart.focus(); await page.keyboard.press('End'); assert.equal((await chart.locator('.chart-tip').innerText()).includes(names[i]), false);
        await button.click(); assert.equal(await button.getAttribute('aria-pressed'), 'true');
        await chart.focus(); await page.keyboard.press('Home'); assert.ok((await chart.locator('.chart-tip').innerText()).includes(names[i]));
      }
      await chart.hover(); assert.equal(await chart.locator('.chart-tip').isVisible(), true);
    }
    await page.evaluate(() => window.detachLongLegend());
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});


// Public appearance descriptors are shared by the group table and every filtered chart.
test('series_appearance_and_swatch_keep_six_distinct_stable_styles', async () => {
  const { seriesAppearance, seriesSwatch } = await import('./chart-card.js');
  const appearances = Array.from({ length: 6 }, (_, slot) => seriesAppearance(slot));
  assert.equal(new Set(appearances.map(a => JSON.stringify([a.color, a.dash]))).size, 6);
  assert.ok(appearances.every(Object.isFrozen));
  for (const slot of [-1, .5, NaN, Infinity, '0']) assert.throws(() => seriesAppearance(slot), RangeError);
  assert.deepEqual(seriesAppearance(9), seriesAppearance(0));
  for (const a of appearances) {
    const swatch = String(seriesSwatch(a));
    assert.match(swatch, /aria-hidden="true" focusable="false"/);
    assert.ok(swatch.includes(`stroke="var(${a.color})"`));
    assert.ok(swatch.includes(`stroke-dasharray="${a.dash}"`));
  }
  assert.throws(() => seriesSwatch({ ...appearances[0], dash: '5 3' }), TypeError);
  assert.throws(() => seriesSwatch({ ...appearances[0], color: 'red' }), TypeError);
});


// Epoch geometry is opt-in; connectivity is explicit and bounded, never inferred from union slots.
test('temporal_render_rejects_invalid_identity_time_and_observations', async () => {
  const { render } = await import('./chart-card.js');
  const chart = { kind: 'line', height: 64, ticks: [0, 1], max: 1, timeAxis: { from: 0, to: 600, maxGapSeconds: 90 }, series: [{ key: 'a', name: 'Alpha', color: '--series-1', observations: [{ at: 0, value: 0 }] }] };
  const title = 'Observations';
  assert.match(String(render({ title, chart })), /data-chart=/);
  for (const mutate of [c => c.timeAxis.to = 0, c => c.timeAxis.maxGapSeconds = 0, c => c.kind = 'bar', c => c.series.push(c.series[0]), c => c.series[0].observations.push({ at: 0, value: 1 }), c => c.series[0].observations[0].at = 601, c => c.series[0].observations[0].value = '0', c => c.series[0].observations[0].gapBefore = null]) {
    const input = structuredClone(chart); mutate(input); assert.throws(() => render({ title, chart: input }), TypeError);
  }
});

test('temporal_epochs_gaps_public_snapshot_restore_and_categorical_compatibility', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><input aria-label="0"><main></main>'); return; }
    if (pathname.startsWith('/kit/vendor/echarts/')) { res.writeHead(404).end(); return; } // This test pins the SVG fallback contract.
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 860, height: 1000 }, reducedMotion: 'reduce' });
    const browserErrors = []; page.on('pageerror', error => browserErrors.push(error.stack));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const card = await import('/kit/components/chart-card.js'), { morph } = await import('/kit/core/morph.js');
      const style = document.createElement('style'); style.textContent = card.css; document.head.append(style);
      const start = 1700000000.123456;
      window.timeStart = start; window.cardApi = card;
      window.timeChart = { kind: 'line', height: 64, aspect: false, max: 12, ticks: [0, 6, 12],
        timeAxis: { from: start, to: start + 600, maxGapSeconds: 90 },
        series: [
          { key: 'a', name: 'Alpha', ...card.seriesAppearance(0), observations: [
            { at: start, value: 1 }, { at: start + 60.032, value: 2, joinPrevious: true },
            { at: start + 180.032, value: 3, joinPrevious: true }, { at: start + 240.032, value: null, joinPrevious: true },
            { at: start + 300.032, value: 4, joinPrevious: true }, { at: start + 360.032, value: 5, joinPrevious: true, gapBefore: true },
            { at: start + 420.032, value: 6, joinPrevious: false }, { at: start + 480.032, value: 7, joinPrevious: true },
          ] },
          { key: 'b', name: 'Beta', ...card.seriesAppearance(3), observations: [{ at: start + .25, value: 10 }, { at: start + 60.25, value: 11, joinPrevious: true }] },
        ] };
      const title = 'Epoch observations';
      window.drawTimeFixture = () => morph(document.querySelector('main'), card.render({ density: 'compact', title,
        legend: window.timeChart.series.map(series => ({ label: series.name, color: series.color })), chart: window.timeChart }));
      window.drawTimeFixture(); window.detachTime = card.attach(document); await document.fonts.ready;
    });
    const chart = page.locator('.chart'); await page.waitForSelector('.chart svg');
    assert.equal(await chart.locator('.ln').count(), 3); assert.equal(await chart.locator('circle').count(), 3);
    const geometry = [];
    for (const width of [260, 800]) for (const theme of ['dark', 'light']) {
      const result = await chart.evaluate(async (el, { width, theme }) => {
        document.documentElement.dataset.theme = theme; el.closest('.card').style.width = width + 'px';
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const hit = el.querySelector('[data-hit]'), lines = [...el.querySelectorAll('.ln')].map(path => path.getAttribute('d'));
        return { width, theme, height: el.querySelector('svg').getBoundingClientRect().height, left: Number(hit.getAttribute('x')), plot: Number(hit.getAttribute('width')), lines };
      }, { width, theme }); geometry.push(result);
      assert.equal(result.height, 64);
      const coords = result.lines[0].match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
      const elapsed = await page.evaluate(() => window.timeChart.series[0].observations[1].at - window.timeStart);
      assert.ok(Math.abs((coords[2] - coords[0]) / result.plot - elapsed / 600) < 1e-6);
    }
    await chart.focus(); await page.keyboard.press('Home');
    assert.deepEqual(await chart.evaluate(el => window.cardApi.sampleSnapshot(el)), { mode: 'temporal', seriesKey: 'a', at: await page.evaluate(() => window.timeStart) });
    assert.match(await chart.locator('.chart-tip').innerText(), /^2023-11-1[45] \d{2}:\d{2}:20$/m);
    await page.keyboard.press('ArrowRight');
    const saved = await chart.evaluate(el => window.cardApi.sampleSnapshot(el));
    assert.equal(saved.seriesKey, 'b'); assert.equal(saved.at, await page.evaluate(() => window.timeStart + .25));
    assert.doesNotMatch(await chart.locator('.chart-tip').innerText(), /Alpha/);
    await page.getByRole('textbox', { name: '0' }).focus();
    assert.equal(await chart.evaluate((el, saved) => window.cardApi.restoreSample(el, saved), saved), true);
    assert.equal(await page.getByRole('textbox', { name: '0' }).evaluate(el => el === document.activeElement), true);
    const immediate = await page.evaluate(saved => {
      const original = document.querySelector('.chart');
      window.timeChart.series.reverse(); window.timeChart.series[0].observations.push({ at: window.timeStart + 120.25, value: 12, joinPrevious: true }); window.drawTimeFixture();
      return { sameNode: original === document.querySelector('.chart'), restored: window.cardApi.restoreSample(document.querySelector('.chart'), saved) };
    }, saved);
    assert.deepEqual(immediate, { sameNode: true, restored: true });
    assert.deepEqual(await chart.evaluate(el => window.cardApi.sampleSnapshot(el)), saved);
    await chart.evaluate(el => { const c = JSON.parse(el.dataset.chart); c.timeAxis.maxGapSeconds = null; el.dataset.chart = JSON.stringify(c); });
    const unknownState = await chart.evaluate(async el => {
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      return { paths: el.querySelectorAll('.ln').length, input: JSON.parse(el.dataset.chart).timeAxis.maxGapSeconds, rendered: el._chart?.c.timeAxis?.maxGapSeconds, current: el._source === el.dataset.chart, connected: el.isConnected };
    });
    assert.equal(unknownState.paths, 0, JSON.stringify({ unknownState, browserErrors }));
    assert.equal(await chart.locator('circle').count(), 10);
    assert.equal(await chart.evaluate((el, saved) => window.cardApi.restoreSample(el, { ...saved, at: saved.at + .001 }), saved), false);
    assert.equal(await chart.evaluate(el => window.cardApi.sampleSnapshot(el)), null);
    assert.equal(await chart.evaluate((el, saved) => window.cardApi.restoreSample(el, saved), saved), true);
    assert.equal(await chart.evaluate(el => window.cardApi.restoreSample(el, null)), false);
    assert.equal(await chart.evaluate(el => window.cardApi.sampleSnapshot(el)), null);
    assert.equal(await chart.evaluate((el, saved) => window.cardApi.restoreSample(el, saved), saved), true);
    await page.getByRole('button', { name: 'Beta', exact: true }).click();
    assert.equal(await chart.evaluate((el, saved) => window.cardApi.restoreSample(el, saved), saved), false);
    await page.getByRole('button', { name: 'Beta', exact: true }).click();
    assert.equal(await chart.evaluate((el, saved) => window.cardApi.restoreSample(el, saved), saved), true);
    await chart.hover(); assert.equal(await chart.locator('.chart-tip').isVisible(), true);
    await page.evaluate(() => { window.timeChart.series = window.timeChart.series.filter(series => series.key !== 'b'); window.drawTimeFixture(); });
    assert.equal(await chart.evaluate((el, saved) => window.cardApi.restoreSample(el, saved), saved), false);
    await page.evaluate(() => {
      window.timeChart = { kind: 'line', height: 64, max: 3, ticks: [0, 3], x: ['same', 'same', 'tail'], series: [{ name: 'Category', color: '--series-1', values: [1, 2, 3] }] };
      window.drawTimeFixture();
    });
    assert.equal(await chart.evaluate(el => window.cardApi.restoreSample(el, { mode: 'categorical', label: 'same', occurrence: 1 })), true);
    assert.deepEqual(await chart.evaluate(el => window.cardApi.sampleSnapshot(el)), { mode: 'categorical', label: 'same', occurrence: 1 });
    assert.equal(await chart.evaluate(el => window.cardApi.restoreSample(el, { mode: 'categorical', label: 'same', occurrence: 2 })), false);
    assert.equal(await chart.evaluate((el, saved) => window.cardApi.restoreSample(el, saved), saved), false);
    assert.deepEqual(browserErrors, []);
    await page.evaluate(() => window.detachTime());
    if (process.env.TEMPORAL_EVIDENCE) {
      const { mkdirSync, writeFileSync } = await import('node:fs'); mkdirSync(process.env.TEMPORAL_EVIDENCE, { recursive: true });
      writeFileSync(resolve(process.env.TEMPORAL_EVIDENCE, 'epoch-geometry.json'), JSON.stringify(geometry, null, 2));
    }
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

test('temporal_tick_layout_keeps_index_anchors_and_stable_full_label_priority', () => {
  const source = readFileSync(new URL('./chart-card.js', import.meta.url), 'utf8');
  const layout = runInNewContext(source.slice(source.indexOf('function layoutTimeLabels('), source.indexOf('function refreshChart(')) + '\nlayoutTimeLabels');
  const axis = { from: 0, to: 100 }, px = at => at;
  const measure = (label, anchor) => { const width = label.length * 10; const left = anchor === 'start' ? 0 : anchor === 'end' ? -width : -width / 2; return { left, right: left + width }; };
  const project = result => JSON.parse(JSON.stringify(result.map(item => ({ at: item.tick.at, label: item.tick.label, anchor: item.anchor, index: item.index }))));
  const interior = Object.freeze([20, 50, 80].map(at => Object.freeze({ at, label: '0' })));
  assert.deepEqual(project(layout(interior, axis, px, 0, 100, 8, measure)).map(item => item.anchor), ['start', 'middle', 'end']);
  assert.deepEqual(interior.map(item => item.at), [20, 50, 80]);
  const duplicates = [{ at: 50, label: '0' }, { at: 50, label: '0' }, { at: 50, label: '1' }];
  assert.deepEqual(project(layout(duplicates, axis, px, 0, 100, 8, measure)), [{ at: 50, label: '0', anchor: 'start', index: 0 }]);
  assert.equal(layout([{ at: 0, label: '0' }, { at: 100, label: '0' }], axis, px, 0, 100, 8, measure).length, 2);
  const crowded = [{ at: 91, label: '000000' }, { at: 95, label: '111111' }, { at: 99.125, label: '222222' }];
  assert.deepEqual(project(layout(crowded, axis, px, 0, 100, 8, measure)), [{ at: 99.125, label: '222222', anchor: 'end', index: 2 }]);
  const boundary = [{ at: 100, label: '00000000' }, { at: 0, label: '11111111' }];
  assert.equal(layout(boundary, axis, px, 0, 100, 8, measure)[0].tick.at, 100);
  const afterBoundaries = [{ at: 0, label: '0' }, { at: 40, label: '111' }, { at: 60, label: '222' }, { at: 80, label: '333' }, { at: 100, label: '4' }];
  assert.deepEqual(project(layout(afterBoundaries, axis, px, 0, 100, 8, measure)).map(item => item.at), [0, 80, 100]);
  assert.equal(layout([{ at: 50, label: '0'.repeat(400) }], axis, px, 0, 100, 8, measure).length, 0);
  assert.equal(layout([], axis, px, 0, 100, 8, measure).length, 0);
  assert.equal(layout([{ at: 0, label: '0' }], axis, px, 0, 100, 8, measure)[0].anchor, 'start');
});

/* R4-11: the first time of a window inside one day is named with its date, twice as long as a time: it took the room of the next time only
   (2026-11-18 12:05 · 12:15 · 12:20 …), so the marks stood unevenly. When one has to go for it, every other one goes: the marks stay evenly spaced */
test('temporal_tick_layout_keeps_its_times_evenly_spaced_around_a_dated_first_time', () => {
  const source = readFileSync(new URL('./chart-card.js', import.meta.url), 'utf8');
  const layout = runInNewContext(source.slice(source.indexOf('function layoutTimeLabels('), source.indexOf('function refreshChart(')) + '\nlayoutTimeLabels');
  const axis = { from: 0, to: 760 }, px = at => at;
  const measure = (label, anchor) => { const width = label.length * 7; const left = anchor === 'start' ? 0 : anchor === 'end' ? -width : -width / 2; return { left, right: left + width }; };
  /* every 64px a time of day, the first one dated (the context mark) */
  const ticks = Array.from({ length: 11 }, (_, i) => ({ at: 40 + i * 64, label: i ? `12:${String(5 + i * 5).padStart(2, '0')}` : '2026-11-18 12:05', major: !i, ...(i ? {} : { context: true }) }));
  const placed = layout(ticks, axis, px, 0, 760, 8, measure).map(item => item.tick.at);
  assert.equal(placed[0], 40, 'the dated first time stays');
  const steps = placed.slice(1).map((at, i) => at - placed[i]);
  assert.ok(steps.length >= 3 && steps.every(step => step === steps[0]), `the times stand evenly: ${JSON.stringify(placed)}`);
});

test('temporal_tick_labels_fit_actual_fonts_preserve_geometry_and_full_description', { skip: !chromium && 'playwright-core unavailable' }, async context => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html data-theme="dark"><link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><body><main></main>'); return; }
    if (pathname.startsWith('/kit/vendor/echarts/')) { res.writeHead(404).end(); return; } // This test pins the SVG fallback contract.
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch();
    const evidence = [];
    for (const width of [860, 1440]) for (const theme of ['dark', 'light']) for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(async ({ theme, chartWidth }) => {
        document.documentElement.dataset.theme = theme;
        const card = await import('/kit/components/chart-card.js');
        const { addStyles } = await import('/kit/core/style.js');
        const { morph } = await import('/kit/core/morph.js');
        addStyles([card], document); window.tickCard = card;
        window.tickChart = { kind: 'area', height: 160, aspect: false, ticks: [0, 2000, 4000], max: 4000, unit: 'mCPU',
          timeAxis: { from: 1793921400, to: 1793923200, maxGapSeconds: null, ticks: [
            { at: 1793923050, label: '11-05 23:57:30.0' }, { at: 1793923110, label: '11-05 23:58:30.0' }, { at: 1793923170.125, label: '11-05 23:59:30.125' },
          ] }, series: [
            { key: 'a', name: 'A', color: '--series-1', observations: [3050, 3110, 3170].map((at, i) => ({ at: 1793920000 + at, value: (i + 1) * 1000, joinPrevious: false })) },
            { key: 'b', name: 'B', color: '--series-2', observations: [3050.125, 3110.125, 3170.125].map((at, i) => ({ at: 1793920000 + at, value: (i + 2) * 1000, joinPrevious: false })) },
          ] };
        window.drawTicks = () => morph(document.querySelector('main'), card.render({ title: '0', chart: window.tickChart }));
        document.querySelector('main').style.width = chartWidth + 'px'; window.drawTicks(); window.detachTicks = card.attach(document);
        await document.fonts.ready;
        window.tickRead = () => {
          const el = document.querySelector('.chart'), svg = el.querySelector('svg'), hit = svg.querySelector('[data-hit]');
          const labels = [...svg.querySelectorAll('text.axis')].filter(text => Number(text.getAttribute('y')) === window.tickChart.height - 4).map(text => {
            const box = text.getBBox(), x = Number(text.getAttribute('x')); return { label: text.textContent, x, left: box.x, right: box.x + box.width, anchor: text.getAttribute('text-anchor') };
          });
          return { labels, left: Number(hit.getAttribute('x')), right: Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')), gap: parseFloat(getComputedStyle(el).getPropertyValue('--space-2')),
            description: svg.querySelector('desc')?.textContent, titleCount: svg.querySelectorAll('title').length, aria: el.getAttribute('aria-label'), height: svg.viewBox.baseVal.height, data: el.dataset.chart,
            points: [...svg.querySelectorAll('circle')].map(node => [node.getAttribute('cx'), node.getAttribute('cy')]), paths: [...svg.querySelectorAll('path')].map(node => node.getAttribute('d')) };
        };
      }, { theme, chartWidth: width === 860 ? 796 : 820 });
      await page.waitForFunction(() => !!document.querySelector('svg desc'));
      const initial = await page.evaluate(() => window.tickRead());
      assert.equal(initial.labels.length, 1);
      assert.equal(initial.labels[0].label, '11-05 23:59:30.125');
      const check = state => {
        const sorted = [...state.labels].sort((a, b) => a.left - b.left);
        for (const label of sorted) assert.ok(label.left >= state.left && label.right <= state.right, JSON.stringify(state));
        for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].right + state.gap <= sorted[i].left, JSON.stringify(state));
        assert.equal(state.titleCount, 0); assert.equal(state.aria, '0');
      };
      check(initial);
      assert.equal(initial.height, 160);
      assert.equal(initial.points.length, 6);
      const serialized = await page.evaluate(() => JSON.stringify(window.tickChart));
      assert.equal(initial.data, serialized);
      assert.equal(initial.description, '11-05 23:57:30.0\n11-05 23:58:30.0\n11-05 23:59:30.125');
      const chart = page.locator('.chart');
      await chart.focus(); await page.keyboard.press('End');
      const sample = await chart.evaluate(el => window.tickCard.sampleSnapshot(el));
      assert.deepEqual(sample, { mode: 'temporal', seriesKey: 'b', at: 1793923170.125 });
      await page.evaluate(() => { document.fonts.dispatchEvent(new Event('loadingdone')); window.drawTicks(); });
      await page.waitForFunction(data => document.querySelector('.chart').dataset.chart === data, serialized);
      assert.deepEqual(await chart.evaluate(el => window.tickCard.sampleSnapshot(el)), sample);
      const refreshed = await page.evaluate(() => window.tickRead()); check(refreshed);
      assert.deepEqual(refreshed.points, initial.points); assert.deepEqual(refreshed.paths, initial.paths);
      await page.evaluate(() => { document.querySelector('main').style.width = 'var(--space-40)'; });
      await page.waitForFunction(() => window.tickRead().right < 160);
      check(await page.evaluate(() => window.tickRead()));
      await page.evaluate(() => { document.querySelector('main').style.width = 'calc(var(--space-40) * 5)'; });
      await page.waitForFunction(() => window.tickRead().right > 600);
      check(await page.evaluate(() => window.tickRead()));
      const duplicates = await page.evaluate(() => {
        window.tickChart.timeAxis.ticks = [{ at: 1793922300, label: '0' }, { at: 1793922300, label: '0' }, { at: 1793922300, label: '1' }, { at: 1793922500.125, label: '0' }];
        window.drawTicks(); window.tickCard.restoreSample(document.querySelector('.chart'), null);
        let rejected = false;
        try { window.tickCard.render({ title: '0', chart: { ...window.tickChart, timeAxis: { ...window.tickChart.timeAxis, ticks: [{ at: 1793921399, label: '0' }] } } }); } catch (error) { rejected = error instanceof TypeError; }
        return { state: window.tickRead(), rejected, fakeSample: window.tickCard.restoreSample(document.querySelector('.chart'), { mode: 'temporal', seriesKey: 'a', at: 1793922300 }) };
      });
      assert.equal(duplicates.state.labels.length, 2); check(duplicates.state);
      assert.equal(duplicates.state.description, '0\n0\n1\n0');
      assert.equal(duplicates.rejected, true); assert.equal(duplicates.fakeSample, false);
      const noFit = await page.evaluate(() => {
        const original = window.tickRead();
        const label = '<unsafe>&'.repeat(40).padEnd(400, '0');
        window.tickChart.timeAxis.ticks = [{ at: 1793923110, label }]; window.drawTicks();
        window.tickCard.restoreSample(document.querySelector('.chart'), window.tickCard.sampleSnapshot(document.querySelector('.chart')));
        return { label, original, state: window.tickRead() };
      });
      assert.equal(noFit.state.labels.length, 0);
      assert.equal(noFit.state.description, noFit.label);
      assert.deepEqual(noFit.state.points, noFit.original.points);
      assert.deepEqual(noFit.state.paths, noFit.original.paths);
      assert.equal(await page.locator('svg desc *').count(), 0);
      assert.equal(await page.locator('svg title').count(), 0);
      const many = await page.evaluate(() => {
        const label = '0'.repeat(400), ticks = Array.from({ length: 512 }, (_, i) => ({ at: 1793921400 + i, label }));
        const start = performance.now(); window.tickChart.timeAxis.ticks = ticks; window.drawTicks();
        window.tickCard.restoreSample(document.querySelector('.chart'), null);
        return { elapsedMs: performance.now() - start, length: window.tickRead().description.length, expected: ticks.map(tick => tick.label).join('\n').length, shown: window.tickRead().labels.length };
      });
      assert.equal(many.shown, 0); assert.equal(many.length, many.expected); assert.ok(many.elapsedMs < 5000);
      evidence.push({ width, theme, reducedMotion, initial, many });
      assert.deepEqual(errors, []); await page.evaluate(() => window.detachTicks()); await page.close();
    }
    context.diagnostic(JSON.stringify({ temporalLabelCases: evidence.length, manyTicks: evidence.map(item => item.many) }));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});

test('temporal_engine_paints_series_below_the_svg_layer_without_double_paint_and_disposes', { skip: !chromium && 'playwright-core unavailable' }, async () => {
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
    const page = await browser.newPage({ viewport: { width: 860, height: 1000 }, reducedMotion: 'reduce' });
    const browserErrors = []; page.on('pageerror', error => browserErrors.push(error.stack));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const card = await import('/kit/components/chart-card.js'), { morph } = await import('/kit/core/morph.js');
      const style = document.createElement('style'); style.textContent = card.css; document.head.append(style);
      const start = 1700000000.123456; window.cardApi = card;
      window.engineChart = { kind: 'line', height: 64, aspect: false, max: 12, ticks: [0, 6, 12], timeAxis: { from: start, to: start + 600, maxGapSeconds: 90 }, series: [
        { key: 'a', name: 'Alpha', ...card.seriesAppearance(0), observations: [{ at: start, value: 1 }, { at: start + 60, value: 2, joinPrevious: true }, { at: start + 300, value: 4, joinPrevious: true }, { at: start + 360, value: 0, joinPrevious: true }] },
        { key: 'b', name: 'Beta', ...card.seriesAppearance(3), observations: [{ at: start + .25, value: 10 }, { at: start + 60.25, value: 11, joinPrevious: true }] },
      ] };
      window.drawEngine = () => morph(document.querySelector('main'), card.render({ title: 'CPU', legend: window.engineChart.series.map(series => ({ label: series.name, color: series.color })), chart: window.engineChart }));
      window.drawEngine(); window.detachEngine = card.attach(document); await document.fonts.ready;
    });
    const chart = page.locator('.chart');
    await page.waitForSelector('.chart > .chart-engine svg');
    const state = () => chart.evaluate(el => {
      const option = JSON.parse(el._engine.json), hit = el.querySelector(':scope > svg [data-hit]');
      return { status: el._engine.status, drawn: el.querySelectorAll(':scope > svg .ln, :scope > svg circle').length, seriesGroups: el.querySelectorAll(':scope > svg [data-series]').length,
        runs: option.series.length, ids: option.series.map(s => s.id), grid: option.grid[0], hitX: Number(hit.getAttribute('x')), hitW: Number(hit.getAttribute('width')), json: el._engine.json,
        svgBelow: getComputedStyle(el.querySelector(':scope > svg')).zIndex, engineEvents: getComputedStyle(el.querySelector(':scope > .chart-engine')).pointerEvents, nested: el.querySelectorAll('svg').length };
    });
    const ready = await state();
    assert.equal(ready.status, 'ready'); assert.equal(ready.drawn, 0, 'no double paint'); assert.equal(ready.seriesGroups, 0);
    assert.equal(ready.runs, 3, 'Alpha splits at the gap, Beta is one run'); assert.equal(ready.engineEvents, 'none'); assert.equal(ready.svgBelow, '1');
    assert.equal(ready.grid.left, ready.hitX); assert.equal(ready.grid.width, ready.hitW);
    assert.match(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--series-1').trim()), /^oklch/, 'the series token is modern syntax');
    assert.doesNotMatch(ready.json, /oklch/); assert.match(ready.json, /rgb\(/);
    await chart.focus(); await page.keyboard.press('Home'); assert.match(await chart.locator('.chart-tip').innerText(), /^2023-11-1[45] \d{2}:\d{2}:20$/m);
    // A burst of animation frames must not repaint: the observer ignores the engine's own DOM writes.
    const stable = await chart.evaluate(async el => {
      const before = el._engine.instance; let sets = 0; const set = before.setOption.bind(before); before.setOption = (...args) => { sets++; return set(...args); };
      for (let i = 0; i < 5; i++) await new Promise(done => requestAnimationFrame(done));
      return { sets, same: el._engine.instance === before };
    });
    assert.deepEqual(stable, { sets: 0, same: true });
    await page.getByRole('button', { name: 'Beta', exact: true }).click();
    assert.equal((await state()).runs, 2); assert.equal((await state()).nested, 2, 'engine svg + chart svg');
    await page.getByRole('button', { name: 'Beta', exact: true }).click();
    assert.equal((await state()).runs, 3);
    await chart.evaluate(el => { el.closest('.card').style.width = '40%'; });
    await page.waitForFunction(width => JSON.parse(document.querySelector('.chart')._engine.json).grid[0].width < width, ready.grid.width);
    const narrow = await state(); assert.equal(narrow.grid.width, narrow.hitW); assert.equal(narrow.grid.left, narrow.hitX);
    await page.evaluate(() => { document.documentElement.style.setProperty('--series-1', 'var(--series-5)'); document.documentElement.dataset.theme = 'light'; });
    await page.waitForFunction(before => document.querySelector('.chart')._engine.json !== before, ready.json);
    assert.doesNotMatch((await state()).json, /oklch/);
    await page.evaluate(() => { window.engineChart.series[0].observations.push({ at: window.engineChart.timeAxis.from + 420, value: 5, joinPrevious: true }); window.drawEngine(); });
    await page.waitForFunction(() => document.querySelector('.chart')._engine.json.includes('[420,5]'));
    await chart.evaluate(el => { window.keptInstance = el._engine.instance; });
    await page.evaluate(() => { window.engineChart.series[0].observations.push({ at: window.engineChart.timeAxis.from + 480, value: 6, joinPrevious: true }); window.drawEngine(); });
    await page.waitForFunction(() => document.querySelector('.chart')._engine.json.includes('[480,6]'));
    assert.equal(await chart.evaluate(el => el._engine.instance === window.keptInstance), true, 'a data update keeps the same mounted chart');
    assert.deepEqual(browserErrors, []);
    await page.evaluate(() => { document.querySelector('main').replaceChildren(); });
    await page.waitForFunction(() => !document.querySelector('.chart-engine'));
    // Disposal is driven by the MutationObserver scan, so wait for the instance itself rather than for the DOM node to vanish.
    await page.waitForFunction(() => window.keptInstance.isDisposed());
    assert.equal(await page.evaluate(() => window.keptInstance.isDisposed()), true);
    await page.evaluate(() => window.detachEngine());
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

test('a limit line and its name are drawn only for a limit, and the name takes the shrunk drawing\'s position', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('./chart-card.js', import.meta.url), 'utf8');
  assert.match(src, /c\.limit\b/);
  assert.match(src, /limit-label/);
  assert.match(src, /averageLine\(c, py, padL, padL \+ iw, \{ vx, vy \}\)/);
});

test('a line has no value where it is not: before, after, in a gap, with one reading or none', async () => {
  const { lineValueAt } = await import('./chart-card.js');
  const joined = [{ at: 0, value: 10 }, { at: 10, value: 20, joinPrevious: true }, { at: 20, value: 30, joinPrevious: true }];
  assert.equal(lineValueAt(joined, 5), 15, 'between two joined readings it is interpolated');
  assert.equal(lineValueAt(joined, 20), 30, 'on a reading it is that reading');
  assert.equal(lineValueAt(joined, -1), null, 'before it starts');
  assert.equal(lineValueAt(joined, 21), null, 'after it ends');
  const gap = [{ at: 0, value: 10 }, { at: 10, value: 20, joinPrevious: false }];
  assert.equal(lineValueAt(gap, 5), null, 'across a gap');
  assert.equal(lineValueAt([{ at: 3, value: 7 }], 5), null, 'one reading is a point, not a line');
  assert.equal(lineValueAt([{ at: 3, value: 7 }], 3), 7);
  assert.equal(lineValueAt([], 1), null, 'no readings');
});

test('a widget plate grows its scale to hold the readings and the limit, and never has no height', async () => {
  const { widgetFit } = await import('./chart-card.js');
  const base = { bleed: true, min: 0, max: 100, ticks: [0, 50, 100] };
  assert.equal(widgetFit(base, [10, 90]), base, 'inside the scale it was given, nothing changes');
  assert.ok(widgetFit(base, [10, 160]).max >= 160, 'a reading beyond the top');
  assert.ok(widgetFit({ ...base, limit: 150 }, [10]).max >= 150, 'a limit beyond the top');
  assert.ok(widgetFit(base, [-30, 40]).min <= -30, 'a reading below the bottom');
  const flat = widgetFit({ bleed: true, min: 5, max: 5, ticks: [5, 5, 5] }, [5]);
  assert.ok(flat.max > flat.min, 'every value the same still has a height');
  const plain = { min: 0, max: 100, ticks: [0, 50, 100] };
  assert.equal(widgetFit(plain, [500]), plain, 'only a widget plate fits itself: other charts keep their scale');
});

test('the ten-line palette names ten distinct tokens, each defined in both themes', async () => {
  const { SERIES_PALETTE } = await import('./chart-card.js');
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
  assert.equal(new Set(SERIES_PALETTE).size, 10);
  for (const token of SERIES_PALETTE) assert.equal(css.split(`${token}:`).length - 1, 2, token);
});

test('an expandable card carries its button in a zero-height anchor above the plate, and an open one is marked lifted', async () => {
  const { render } = await import('./chart-card.js');
  const base = { title: 'T', widget: true, chart: { kind: 'line', height: 100, x: ['a'], series: [{ name: 's', color: '--series-1', values: [1] }], max: 2, ticks: [0, 2] } };
  const closed = render({ ...base, expand: { action: 'x.open', arg: 'id', label: base.title } }).s;
  assert.match(closed, /<div class="card-expand-anchor"><button[^>]*class="card-expand"[^>]*data-action="x.open"[^>]*data-arg="&quot;id&quot;"[^>]*aria-label="T"/);
  assert.ok(closed.indexOf('card-expand-anchor') < closed.indexOf('class="chart"'));
  assert.doesNotMatch(closed, /lifted/);
  assert.match(render({ ...base, expand: { action: 'x.open', label: base.title }, lifted: true }).s, /class="card widget lifted"|class="[^"]*\blifted\b/);
});

test('a plate with a state keeps its size and says why: loading is a busy status, empty and error use the empty-state words, error offers its one action', async () => {
  const { render } = await import('./chart-card.js');
  const height = 120, chart = { kind: 'line', height, x: ['a'], series: [{ name: 's', color: '--series-1', values: [1] }], max: 2, ticks: [0, 2] };
  const loading = render({ title: 'T', widget: true, chart, state: { kind: 'loading', title: 'wait' } }).s;
  assert.ok(loading.includes(`class="chart chart-state" data-state="loading" style="height:${height}px" role="status" aria-live="polite" aria-busy="true"`));
  assert.doesNotMatch(loading, /data-chart=/);
  const empty = render({ title: 'T', widget: true, chart, state: { kind: 'empty', title: 'none', hint: 'why' } }).s;
  assert.match(empty, /data-state="empty"[^>]*>[\s\S]*empty-title">none<[\s\S]*empty-desc">why</);
  assert.doesNotMatch(empty, /aria-busy/);
  const error = render({ title: 'T', widget: true, chart, state: { kind: 'error', title: 'bad', action: { label: 'again', action: 'x.retry' } } }).s;
  assert.match(error, /data-state="error"[\s\S]*data-action="x.retry"[\s\S]*again/);
  assert.match(render({ title: 'T', widget: true, chart }).s, /data-chart=/);
});

test('the button that opens the card large says it opens a dialog', async () => {
  const { render } = await import('./chart-card.js');
  const m = render({ title: 'T', widget: true, chart: { kind: 'line', height: 100, x: ['a'], series: [{ name: 's', color: '--series-1', values: [1] }], max: 2, ticks: [0, 2] }, expand: { action: 'x.open', label: 'T' } }).s;
  assert.match(m, /class="card-expand" aria-haspopup="dialog"/);
});

test('the card head sits over the open button (so the legend popup covers it) and the button over the plate, the legend shows only once fitted, and its popup opens upward unless told otherwise', async () => {
  const { css } = await import('./chart-card.js');
  assert.match(css, /\.card\.widget \.card-h \{ position: relative; z-index: calc\(var\(--z-sticky\) \+ 1\)/);
  assert.match(css, /\.card-expand-anchor \{ position: relative; height: 0; z-index: var\(--z-sticky\); \}/);
  assert.match(css, /\.card-h > \.legend:not\(\.fitted\) \{ visibility: hidden; \}/);
  assert.match(css, /\.legend-pop \{[^}]*inset-block-end: 100%/);
  assert.match(css, /\.legend-more\[data-side="down"\] \.legend-pop/);
});

test('a bar legend shows every series as a filled swatch in its colour, while later lines keep their dashed and dotted rules', async () => {
  const { render } = await import('./chart-card.js');
  const series = ['--series-1', '--series-2', '--series-3'].map((color, i) => ({ name: 's' + i, color, values: [1, 2] }));
  const legend = series.map(s => ({ label: s.name, color: s.color }));
  const chart = kind => ({ kind, height: 100, x: ['a', 'b'], series, max: 4, ticks: [0, 4] });
  const bars = render({ title: 'T', legend, chart: chart('bar') }).s;
  for (const s of series) assert.match(bars, new RegExp(`<i class=""[^>]*style="background:var\\(${s.color}\\)"`));
  assert.doesNotMatch(bars, /series-(dash|dot)/);
  const lines = render({ title: 'T', legend, chart: chart('line') }).s;
  assert.match(lines, /class="series-dash"[^>]*style="color:var\(--series-2\)"/);
  assert.match(lines, /class="series-dot"[^>]*style="color:var\(--series-3\)"/);
});
