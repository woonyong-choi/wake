import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { render, layout, tipMarkup } from './change-timeline.js';

const tip = kind => ({ time: '10:00', kind, title: 'thing', text: 'a -> b' });
const lanes = [{ id: 'a', label: 'A', icon: 'search' }, { id: 'b', label: 'B', gapUntil: 250 }];
const marks = [
  { id: 'p1', lane: 'a', at: 100, tone: 'danger', tip: tip('restart') },
  { id: 'p2', lane: 'a', at: 101, tone: 'neutral', tip: tip('restart') },
  { id: 'p3', lane: 'a', at: 600, fresh: true, tip: tip('scale') },
  { id: 's1', lane: 'b', at: 50, end: 300, tone: 'warn', tip: tip('drain') },
  { id: 's2', lane: 'b', at: 800, running: true, tone: 'run', tip: tip('rollout') },
  { id: 'out', lane: 'a', at: 5000, tip: tip('later') },
];

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* the browser check needs playwright-core */ }

test('points that stand within the near share join into one mark, in time order, with the worst tone; spans are cut to the window', () => {
  const a = layout(marks.filter(m => m.lane === 'a'), 100, 1100, 1000);
  assert.deepEqual(a.groups.map(g => g.marks.map(m => m.id)), [['p1', 'p2'], ['p3']]);
  assert.equal(a.groups[0].tone, 'danger');
  const b = layout(marks.filter(m => m.lane === 'b'), 100, 1100, 1000);
  assert.equal(b.spans[0].cutStart, true); assert.equal(b.spans[0].x0, 0); assert.equal(b.spans[0].x1, .2);
  assert.equal(b.spans[1].x1, .9, 'a running span ends at now');
});

test('a lane head carries its count, a group its number, a fresh mark a ring, a running span its class, a gap the hatch and its name once', () => {
  const m = render({ from: 100, to: 1100, now: 1000, lanes, marks, gapLabel: 'no record', selected: 'p2', selectAction: 'x.pick', panAction: 'x.pan', ticks: [{ at: 600, label: '10:10' }, { at: 9000, label: 'far' }] }).s;
  assert.match(m, /<b>3<\/b>/); assert.match(m, /<b>2<\/b>/);
  assert.match(m, /class="ctl-n">2</);
  assert.match(m, /ctl-ripple/);
  assert.match(m, /class="ctl-span running cut-end" data-tone="run"/);
  assert.equal(m.split('ctl-gap').length - 1, 1); assert.match(m, />no record</);
  assert.match(m, /class="ctl-now" style="left:90.000%"/);
  assert.doesNotMatch(m, /far|later/);
  assert.match(m, /class="ctl-pt many"[^>]*aria-pressed="true" data-ctl-list="" data-ctl-ids="\[&quot;p1&quot;,&quot;p2&quot;\]"/, 'a press on the group lists its marks');
  assert.doesNotMatch(m, /class="ctl-pt many"[^>]*data-action=/, 'a joined dot does not choose by itself');
  assert.match(m, /&quot;order&quot;:\[&quot;s1&quot;,&quot;p1&quot;,&quot;p2&quot;,&quot;p3&quot;,&quot;s2&quot;\]/);
});

test('the reading of one mark is a chart reading (kind, then small lines); several marks are listed and folded', () => {
  assert.equal(tipMarkup([{ ...tip('restart'), tone: 'danger' }]), '<div class="rv" data-tone="danger">restart</div><div class="t">thing</div><div class="t">a -&gt; b</div><div class="t">10:00</div>');
  const many = tipMarkup(Array.from({ length: 8 }, () => ({ ...tip('restart'), tone: 'warn' })));
  assert.match(many, /data-tone="warning">restart 8</); assert.match(many, /\+2/);
});

test('dots keep a screen distance apart at every track width a set is made for: the narrower the track, the more points join', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, lane: 'a', at: 100 + i * 7 + (i % 3) * 2, tip: tip('restart') }));
  const m = render({ from: 100, to: 400, lanes: [lanes[0]], marks: many }).s;
  const sets = [...m.matchAll(/<div class="ctl-set" data-w="(\d+)"[^>]*>(.*?)<\/div>/gs)].map(x => ({ w: Number(x[1]), xs: [...x[2].matchAll(/left:([\d.]+)%/g)].map(y => Number(y[1]) / 100) }));
  assert.equal(sets.length, 6);
  for (const s of sets) { const w = Math.max(s.w, 240); for (let i = 1; i < s.xs.length; i++) assert.ok((s.xs[i] - s.xs[i - 1]) * w >= 20 - 1e-6, `${s.w}: ${(s.xs[i] - s.xs[i - 1]) * w}`); }
  assert.ok(sets[0].xs.length < sets.at(-1).xs.length);
});

test('without ticks of its own the axis has the time charts\' marks, one set per track width, the day boundary named with its year', async () => {
  const { render } = await import('./change-timeline.js');
  const from = Date.UTC(2026, 10, 9, 18) / 1000, to = from + 12 * 3600;
  const m = render({ from, to, lanes: [{ id: 'a', label: 'A' }], marks: [], timeZone: 'utc' }).s;
  const sets = [...m.matchAll(/class="ctl-set ctl-tset" data-w="(\d+)"[^>]*>(.*?)<\/div>/gs)];
  assert.equal(sets.length, 6);
  assert.match(m, /class="ctl-tick( start| end)? major"[^>]*>2026-11-10</);
  const counts = sets.map(x => (x[2].match(/ctl-tick/g) || []).length);
  assert.ok(counts.every((n, i) => !i || n >= counts[i - 1]), 'a wider track has as many marks or more');
});

test('a joined dot lists every change in it, each a button that chooses it', async () => {
  const { listMarkup } = await import('./change-timeline.js');
  const html = listMarkup([{ time: '10:00', kind: 'restart', title: 'a', tone: 'danger' }, { time: '10:01', kind: 'scale', title: 'b', text: 'x' }], ['p1', 'p2'], 'x.pick');
  assert.equal((html.match(/class="ctl-li"/g) || []).length, 2);
  assert.match(html, /data-action="x.pick" data-arg="&quot;p2&quot;"/);
  assert.match(html, /restart · a/);
});

test('a dimmed mark is drawn quietly and stays pressable; a joined dot is dim only when all its marks are', async () => {
  const { render } = await import('./change-timeline.js');
  const lanes = [{ id: 'a', label: 'A' }], tip = { kind: 'k', title: 't' };
  const m = render({ from: 0, to: 1000, lanes, selectAction: 'x.pick', marks: [{ id: 'p1', lane: 'a', at: 100, dim: true, tip }, { id: 's1', lane: 'a', at: 400, end: 600, dim: true, tip }, { id: 'p2', lane: 'a', at: 900, tip }] }).s;
  assert.match(m, /class="ctl-pt dim"[^>]*data-action="x.pick"/);
  assert.match(m, /class="ctl-span dim"/);
  assert.match(m, /class="ctl-pt"[^>]*data-ctl-id="p2"/);
});

test('every time on the axis carries its day and its plain words, so the leftmost shown can name the date', async () => {
  const { render } = await import('./change-timeline.js');
  const from = Date.UTC(2026, 10, 9, 10) / 1000;
  const m = render({ from, to: from + 3600, lanes: [{ id: 'a', label: 'A' }], marks: [], timeZone: 'utc' }).s;
  assert.match(m, /data-day="2026-11-09" data-label="10:00">10:00</);
  assert.doesNotMatch(m, /data-label="2026-11-09 /);
});

test('the axis fitting settles when the timeline is attached twice on one page (two watchers never keep stirring each other)', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main style="width:calc(var(--space-40) * 5)"></main>'); return; }
    const file = resolve(repo, '.' + path);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const settled = page.evaluate(async () => {
      const K = await import('/kit/components/index.js'), TL = await import('/kit/components/change-timeline.js');
      K.addAllStyles(document);
      const now = 1794460000;
      document.querySelector('main').innerHTML = String(TL.render({ label: 'x', from: now - 3600, to: now, lanes: [{ id: 'a', label: 'A' }], marks: [{ id: 'p', lane: 'a', at: now - 1800, tip: { kind: 'k' } }] }));
      TL.attach(document, { emit() {} }); TL.attach(document, { emit() {} });
      await new Promise(done => setTimeout(done, 300));
      return [...document.querySelectorAll('.ctl-axis .ctl-tick')].some(t => t.offsetParent && /^\d{4}-\d{2}-\d{2} /.test(t.textContent));
    });
    const result = await Promise.race([settled, new Promise(done => setTimeout(() => done('hung'), 10000))]);
    assert.equal(result, true, 'the page answers, and the leftmost time names its date');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

/* R4-11: the leftmost time is given its date, and its longer words took the room of the next time only (2026-11-18 12:00 · 12:30 · 12:45):
   the times stood unevenly. When one has to go for it, every other one goes, so the shown times stay evenly spaced */
test('the_dated_first_time_never_pushes_out_only_its_neighbour_the_times_stay_evenly_spaced', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main></main>'); return; }
    const file = resolve(repo, '.' + path);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const uneven = await page.evaluate(async () => {
      const K = await import('/kit/components/index.js'), TL = await import('/kit/components/change-timeline.js');
      K.addAllStyles(document); await document.fonts.ready;
      const to = Date.parse('2026-11-18T12:58:20Z') / 1000, out = [];
      /* an hour (a detail pane's timeline) and a day, at the widths a detail and a narrow window give the track */
      for (const [span, width] of [[3600, 600], [3600, 700], [3600, 760], [86400, 600], [3 * 86400, 640]]) {
        const main = document.querySelector('main'); main.style.width = width + 'px';
        main.innerHTML = String(TL.render({ label: 'x', from: to - span, to, now: to, timeZone: 'utc', lanes: [{ id: 'a', label: 'Warning' }], marks: [] }));
        TL.attach(document, { emit() {} });
        await new Promise(done => setTimeout(done, 250));
        const shown = [...document.querySelectorAll('.ctl-axis .ctl-tick')].filter(t => t.offsetParent && !t.classList.contains('off')).map(t => ({ x: parseFloat(t.style.left), text: t.textContent }));
        const steps = shown.slice(1).map((t, i) => Math.round((t.x - shown[i].x) * 100) / 100);
        if (steps.some(s => Math.abs(s - steps[0]) > .05)) out.push({ span, width, shown: shown.map(t => t.text) });
      }
      return out;
    });
    assert.deepEqual(uneven, [], 'the shown times stand evenly');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

test('a lane count leaves out the dimmed marks a page filter leaves out', () => {
  const m = render({ from: 100, to: 1100, now: 1000, lanes: [{ id: 'a', label: 'A' }], marks: [{ id: 'x', lane: 'a', at: 200, tone: 'warn', tip: {} }, { id: 'y', lane: 'a', at: 700, tone: 'warn', dim: true, tip: {} }] }).s;
  assert.match(m, /<span>A<\/span><b>1<\/b>/, 'one mark kept by the filter, one dimmed');
});

/* A2-14: a mark at the latest minute stands on the now rule: the rule is drawn under the marks (before the lanes), so the dot and its number stay whole over it */
test('the_now_rule_is_drawn_under_the_marks_so_the_last_dot_is_not_crossed_by_it', () => {
  const m = render({ from: 100, to: 1100, now: 1040, lanes: [{ id: 'a', label: 'A' }], marks: [{ id: 'x', lane: 'a', at: 1000, tone: 'warn', tip: {} }, { id: 'y', lane: 'a', at: 1010, tone: 'warn', tip: {} }] }).s;
  assert.ok(m.indexOf('ctl-now') >= 0 && m.indexOf('ctl-now') < m.indexOf('ctl-lane'), 'the now rule comes before the lanes (painted under the marks)');
});

/* A3-16: a GitOps sync history of seven days in a 460px card had one time under it (a week step), and an hour of events at 548px one: each set of times
   is made for the widest track that shows it, and times that would touch are left out by the axis fit, so a narrow axis still reads as dates */
test('a_narrow_axis_still_marks_its_days_or_quarter_hours_not_one_time', () => {
  const to = Date.parse('2026-11-18T06:40:00Z') / 1000, count = (from, w) => { const s = render({ label: 'x', from, to, now: to, lanes: [{ id: 'a', label: 'A' }], marks: [], timeZone: 'utc' }).s;
    const set = s.slice(s.indexOf(`data-key="[&quot;ctl-axis&quot;,${w}]"`)); return (set.slice(0, set.indexOf('</div>')).match(/class="ctl-tick/g) || []).length; };
  assert.ok(count(to - 7 * 86400, 320) >= 5, `seven days on a 320-479px axis: ${count(to - 7 * 86400, 320)} times`);
  assert.ok(count(to - 3600, 0) >= 3, `an hour on the narrowest axis: ${count(to - 3600, 0)} times`);
});
