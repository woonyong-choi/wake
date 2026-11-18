import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright-core')); } catch { /* Browser checks require playwright-core. */ }
const repo = resolve(import.meta.dirname, '../../..');

test('home_bootPage_first_drawing_obeys_the_fold_window', { skip: !chromium && 'playwright-core unavailable' }, async t => {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    for (const delay of [50, 150, 'blocked']) await t.test(`home_boot_lifecycle_metric_arriving_at_${delay}ms_keeps_the_first_fold_decision`, async () => {
      const p = await browser.newPage();
      await p.route('**/apps/wake/pages/cluster-home.js', route => route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(repo, 'apps/wake/pages/cluster-home.js'), 'utf8').replace('bootPage(config,', 'window.captureHome(config,') }));
      await p.addInitScript(() => { window.captureHome = (config, create) => { window.homeConfig = config; window.createHome = create; }; });
      await p.goto(base + '/apps/wake/pages/cluster-home.html?a=wake://cluster/fixture');
      await p.waitForFunction(() => window.createHome);
      await p.evaluate(async delay => {
        const { bootPage } = await import('/kit/page/index.js');
        let blocked = false;
        window.arrivals = [];
        const wait = async () => {
          await new Promise(resolve => setTimeout(() => {
            if (delay === 'blocked' && !blocked) {
              blocked = true;
              const until = performance.now() + 110;
              while (performance.now() < until) {}
            }
            resolve();
          }, delay === 'blocked' ? 50 : delay));
          arrivals.push(performance.now() - started);
        };
        const data = { get: async (key, params) => {
          if (key === 'metricSeries') { await wait(); return { series: params.series, query: 'q', unit: '%', step: 30, range: { from: Date.now() - 3600000, to: Date.now() }, result: [{ metric: {}, values: [[Date.now() / 1000, params.series === 'cluster.err' ? '2.5' : '7']] }] }; }
          if (key === 'incidents') { await wait(); return []; }
          if (key === 'cluster') return { id: 'fixture', state: 'ok' };
          if (['summary', 'sourceStates', 'agent'].includes(key)) return {};
          return [];
        } };
        window.draws = []; window.started = performance.now();
        window.initializing = true;
        window.home = await bootPage({ ...homeConfig, data }, ctx => {
          const page = createHome(ctx), after = page.afterRender;
          page.afterRender = root => { after(root); const bar = [...root.querySelectorAll('details')].find(el => el.dataset.sbarArg === JSON.stringify('m-err')); window.draws.push({ at: performance.now() - started, incidentOpen: [...root.querySelectorAll('details')].find(el => el.dataset.sbarArg === JSON.stringify('h-inc'))?.open, open: bar?.open, text: bar?.textContent }); };
          return page;
        });
      }, delay);
      await p.waitForFunction(() => draws.length > 0);
      const first = await p.evaluate(() => draws[0]);
      assert.ok(first, 'bootPage must render after init');
      if (delay === 150) assert.ok(first.at >= 100, JSON.stringify(first));
      assert.equal(first.open, delay === 50, JSON.stringify(first));
      assert.equal(first.incidentOpen, false, `no open incident: the card stays closed (A3-12) ${JSON.stringify(first)}`);
      if (delay === 'blocked') assert.ok((await p.evaluate(() => arrivals)).every(at => at > 100));
      await p.waitForFunction(() => draws.at(-1)?.text?.includes('2.50%')); /* 5xx reads with two decimals (A2-11) */
      const last = await p.evaluate(() => draws.at(-1));
      assert.equal(last.open, delay === 50, 'late values never change the first decision');
      assert.match(last.text, /2\.50%/);
      await p.close();
    });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
