import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright-core')); } catch {}

test('live_charts_keep_history_nodes_selection_and_bounded_window', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><main></main>'); return; }
    const file = resolve(repo, '.' + path);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      window.liveObservers = new Set();
      for (const key of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver']) {
        const Observer = window[key];
        window[key] = class extends Observer {
          observe(...args) { window.liveObservers.add(this); return super.observe(...args); }
          disconnect() { window.liveObservers.delete(this); return super.disconnect(); }
        };
      }
    });
    const result = await page.evaluate(async () => {
      const card = await import('/kit/components/chart-card.js');
      const { morph } = await import('/kit/core/morph.js');
      const tick = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const style = document.createElement('style'); style.textContent = card.css; document.head.append(style);
      const main = document.querySelector('main');
      const c = { kind: 'area', height: 180, x: Array.from({ length: 60 }, (_, i) => String(i)), max: 100, ticks: [0, 100], series: [{ name: 'A', color: '--series-1', values: Array.from({ length: 60 }, (_, i) => i) }, { name: 'B', color: '--series-2', values: Array(60).fill(30) }] };
      const title = 'Metric';
      const render = () => morph(main, card.render({ title, legend: c.series.map(s => ({ label: s.name, color: s.color })), chart: c }));
      render(); const detach = card.attach(main); await tick();
      const el = main.querySelector('.chart'), svg = el.querySelector('svg'), series = el.querySelector('[data-series]'), line = el.querySelector('.ln'), tip = el.querySelector('.chart-tip');
      main.querySelector('[data-chart-series="1"]').click();
      el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      const original = JSON.stringify(c.series[0].values);
      let stable = true, selection = true, grows = 0;
      for (let i = 60; i < 70; i++) {
        c.x.push(String(i)); c.series.forEach((s, k) => s.values.push(k ? 30 : i)); render(); await tick();
        stable &&= main.querySelector('.chart') === el && el.querySelector('svg') === svg && el.querySelector('[data-series]') === series && el.querySelector('.ln') === line && el.querySelector('.chart-tip') === tip;
        selection &&= document.activeElement === el && el._chart.c.x[el._point] === '59' && el._hiddenSeries.has(1) && el.classList.contains('hover');
        grows += el.getAnimations({ subtree: true }).filter(a => a.animationName === 'chart-grow').length;
      }
      const prefix = original === JSON.stringify(c.series[0].values.slice(0, 60));
      c.series[0].values[69] = 90; render(); await tick();
      const correction = el._chart.c.series[0].values[69] === 90;
      c.x.splice(0, 10); c.series.forEach(s => s.values.splice(0, 10)); render(); await tick();
      const window = el._chart.n === 60 && el._chart.c.x[el._point] === '59';
      const own = document.createElement('div'); main.append(own);
      morph(own, '<div data-own-children data-value="a"><b>old</b></div>'); const opaque = own.firstChild;
      morph(own, '<div data-own-children data-value="b"><b>new</b></div>');
      const legacy = own.firstChild !== opaque && own.textContent === 'new';
      morph(own, '<div data-own-children data-own-attrs="data-value" data-value="a" title="same"><b>owned</b></div>');
      const owned = own.firstChild;
      morph(own, '<div data-own-children data-own-attrs="data-value" data-value="b" title="same"><b>ignored</b></div>');
      const dynamic = own.firstChild === owned && owned.dataset.value === 'b' && own.textContent === 'owned';
      morph(own, '<div data-own-children data-own-attrs="data-value" data-value="b" title="changed"><b>replaced</b></div>');
      const boundary = dynamic && own.firstChild !== owned && own.textContent === 'replaced';
      render(); await tick();
      const nochange = !el.getAnimations({ subtree: true }).some(a => a.animationName === 'chart-grow');
      c.x.push('69'); c.series.forEach(s => s.values.push(10)); render(); await tick();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      c.x.push('71'); c.series.forEach(s => s.values.push(11)); render(); await tick();
      const duplicate = el._point === 60 && el._chart.c.x[el._point] === '69';
      c.series.reverse(); render(); await tick();
      const reordered = el._hiddenSeries.has(0) && !el._hiddenSeries.has(1);
      const flow = await import('/kit/components/flow-graph.js');
      const host = document.createElement('section'); main.append(host);
      const graph = { width: 300, height: 100, columns: [0, 150], nodes: [{ id: 'a', col: 0, y: 10, h: 30, label: 'A', state: 'ok', action: 'open' }, { id: 'b', col: 1, y: 10, h: 30, label: 'B', state: 'ok' }], links: [{ from: 'a', to: 'b', fromOffset: 0, toOffset: 0, size: 10, state: 'ok', active: true }] };
      morph(host, flow.render(graph)); const detachFlow = flow.attach(host); await tick();
      const flowEl = host.querySelector('.flow'), flowSvg = flowEl.querySelector('svg'), hit = flowEl.querySelector('.fl-hit'), band = flowEl.querySelector('.fl-band'), run = flowEl.querySelector('.fl-run');
      hit.focus(); graph.nodes[0].sub = 'Running'; morph(host, flow.render(graph)); await tick();
      const flowStable = flowEl === host.querySelector('.flow') && flowSvg === flowEl.querySelector('svg') && hit === document.activeElement && band === flowEl.querySelector('.fl-band') && run === flowEl.querySelector('.fl-run');
      detachFlow();
      detach(); const detached = !el.classList.contains('hover') && el._point === undefined;
      c.x.push('70'); render(); await tick();
      return { stable, selection, grows, prefix, correction, window, legacy, boundary, detached, nochange, duplicate, reordered, flowStable };
    });
    assert.deepEqual(result, { stable: true, selection: true, grows: 0, prefix: true, correction: true, window: true, legacy: true, boundary: true, detached: true, nochange: true, duplicate: true, reordered: true, flowStable: true });
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion });
      const bars = await page.evaluate(async () => {
        const card = await import('/kit/components/chart-card.js');
        const { morph } = await import('/kit/core/morph.js');
        const tick = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const main = document.querySelector('main'), title = 'Metric';
        const c = { kind: 'bar', height: 180, x: Array.from({ length: 60 }, (_, i) => String(i)), max: 100, ticks: [0, 100], series: [{ name: 'A', color: '--series-1', values: Array(60).fill(20) }] };
        const render = () => morph(main, card.render({ title, chart: c }));
        main.replaceChildren(); render(); const detach = card.attach(main); await tick();
        const el = main.querySelector('.chart'), original = [...el.querySelectorAll('[data-sample]')];
        c.x.shift(); c.x.push('60'); c.series[0].values.shift(); c.series[0].values.push(21); render(); await tick();
        const current = [...el.querySelectorAll('[data-sample]')];
        const stable = current.length === 60 && current.slice(0, 59).every((node, i) => node === original[i + 1]) && !original[0].isConnected;
        const active = el.getAnimations({ subtree: true });
        const latestOnly = active.every(a => a.effect.target === current.at(-1));
        const animationCount = active.length;
        await new Promise(done => setTimeout(done, 800));
        const settled = el.getAnimations({ subtree: true }).length === 0;
        const same = el.innerHTML; render(); await tick();
        const nochange = same === el.innerHTML;
        const source = el._source;
        detach(); c.x.push('61'); c.series[0].values.push(22); render(); await tick();
        const stopped = el._source === source;
        return { stable, latestOnly, animationCount, settled, nochange, stopped };
      });
      assert.deepEqual(bars, { stable: true, latestOnly: true, animationCount: reducedMotion === 'reduce' ? 0 : 1, settled: true, nochange: true, stopped: true });
    }
    assert.equal(await page.evaluate(() => window.liveObservers.size), 0);
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

test('chart_selection_repair_duplicate_eviction_and_focused_legend', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.end('<!doctype html><link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main></main>'); return; }
    const file = resolve(repo, '.' + path);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(8175, '127.0.0.1', done));
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    for (const width of [860, 1440]) for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height: 600 }, reducedMotion: 'reduce' });
      await page.goto('http://127.0.0.1:8175/');
      await page.evaluate(async theme => {
        document.documentElement.dataset.theme = theme;
        const card = await import('/kit/components/chart-card.js');
        const { morph } = await import('/kit/core/morph.js');
        const style = document.createElement('style'); style.textContent = card.css; document.head.append(style);
        const title = 'Metric';
        window.chartData = { kind: 'line', height: 180, x: ['a', 'dup', 'dup', 'z'], max: 100, ticks: [0, 100], series: [{ name: 'one', color: '--series-1', values: [10, 20, 30, 40] }, { name: 'two', color: '--series-2', values: [1, 2, 3, 4] }] };
        window.renderChart = () => morph(document.querySelector('main'), card.render({ title, legend: chartData.series.map(s => ({ label: s.name, color: s.color })), chart: chartData }));
        renderChart(); window.detachChart = card.attach(document.querySelector('main'));
      }, theme);
      const settle = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const capture = async name => { if (process.env.CHART_REPAIR_CAPTURE) await page.screenshot({ path: `${process.env.CHART_REPAIR_CAPTURE}/${width}-${theme}-${name}.png` }); };
      await settle();
      await page.locator('.chart').focus();
      await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      await capture('selected-before');
      await page.evaluate(() => { chartData.x = ['dup', 'z', 'next']; chartData.series[0].values = [30, 40, 50]; chartData.series[1].values = [3, 4, 5]; renderChart(); });
      await settle(); await capture('selected-after');
      const duplicate = await page.locator('.chart').evaluate(el => el.classList.contains('hover') && el.querySelector('.chart-tip b').textContent === '30');
      await page.getByRole('button', { name: 'one', exact: true }).focus();
      await capture('focus-before');
      await page.evaluate(() => { chartData.series.reverse(); renderChart(); }); await settle();
      await capture('focus-after');
      const focused = await page.evaluate(() => document.activeElement.textContent === 'one');
      await page.keyboard.press('Space');
      const space = await page.getByRole('button', { name: 'one', exact: true }).getAttribute('aria-pressed') === 'false' && await page.getByRole('button', { name: 'two', exact: true }).getAttribute('aria-pressed') === 'true';
      await page.keyboard.press('Enter');
      await page.evaluate(() => { chartData.series.reverse(); renderChart(); }); await settle();
      const movedFocus = await page.evaluate(() => document.activeElement.textContent === 'one');
      const enter = await page.getByRole('button', { name: 'one', exact: true }).getAttribute('aria-pressed') === 'true';
      await page.evaluate(() => { chartData.series = chartData.series.filter(s => s.name !== 'one'); renderChart(); }); await settle();
      const removed = await page.evaluate(() => !document.activeElement.matches('[data-chart-series]'));
      await page.getByRole('button', { name: 'two', exact: true }).focus();
      await page.evaluate(() => { chartData.series.push({ ...chartData.series[0] }); renderChart(); }); await settle();
      const ambiguousSeries = await page.evaluate(() => !document.activeElement.matches('[data-chart-series]'));
      await page.evaluate(() => { chartData.series = [{ name: 'replacement', color: '--series-1', values: [30, 40, 50] }]; renderChart(); }); await settle();
      const replacement = await page.getByRole('button', { name: 'replacement', exact: true }).getAttribute('aria-pressed') === 'true';
      await page.evaluate(() => { chartData.x = ['dup', 'dup', 'z']; chartData.series[0].values = [30, 30, 40]; renderChart(); }); await settle();
      await page.locator('.chart').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
      await page.evaluate(() => { chartData.x = ['dup', 'z', 'next']; chartData.series[0].values = [30, 40, 50]; renderChart(); }); await settle();
      const ambiguousSample = await page.locator('.chart').evaluate(el => !el.classList.contains('hover') && !el.querySelector('.chart-tip').textContent);
      results.push({ width, theme, duplicate, focused, space, enter, movedFocus, removed, ambiguousSeries, replacement, ambiguousSample });
      await page.evaluate(() => detachChart()); await page.close();
    }
    console.log(JSON.stringify(results));
    for (const result of results) for (const [key, value] of Object.entries(result)) if (!['width', 'theme'].includes(key)) assert.equal(value, true, `${result.width}/${result.theme}/${key}`);
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
