import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { render as renderFirstRun } from '../components/first-run.js';

const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
const flow = source.slice(source.indexOf('  let firstRun = null'), source.indexOf('  function renderFirstRun()'));

function harness(steps, saved = {}) {
  const timers = new Map();
  let serial = 0, renders = 0;
  const settings = { get: key => saved[key], set: (key, value) => { saved[key] = value; } };
  const api = runInNewContext(`${flow}\n({ openFirstRun, stepFirstRun, closeFirstRun, startChecks, stopChecks, refresh: () => typeof refreshFirstRun === 'function' ? refreshFirstRun() : renderFirstRun(), current: () => firstRun })`, {
    config: { firstRun: { steps } }, settings, state: {}, api: {}, host: {},
    doc: { defaultView: { matchMedia: () => ({ matches: true }) }, documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: () => '1' }),
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
    setInterval: () => 0, clearInterval: () => {}, renderFirstRun: () => { renders++; },
    placeDock: () => {}, render: () => {}, runAction: () => {}, t: value => value,
  });
  return { ...api, saved, timers, renders: () => renders };
}

const steps = [{ id: 'welcome', kind: 'welcome' }, { id: 'clusters', kind: 'checks', items: [], groups: [{ id: 'ok' }, { id: 'failed' }] }, { id: 'done', kind: 'done' }];

/* R4-15: on the AI step every connection row warned "missing locale key: <its button's words>": the shell put the row's button label in words and
   the connection row (which takes a key, as settings gives it) looked those words up again. The row's own button goes to it as the key */
test('firstRun_connection_row_button_label_reaches_the_row_as_a_key_and_is_put_in_words_once', async () => {
  const { render: row } = await import('../components/connection-row.js');
  const warned = [], warn = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try { row({ id: 'r', title: 'x', action: { label: 'firstRun.stopped', action: 'a' } }); } finally { console.warn = warn; }
  assert.deepEqual(warned, [], 'a key label is looked up without a warning');
  const at = source.indexOf('function renderFirstRun()'), shell = source.slice(at, source.indexOf('const btnOf', at));
  assert.match(shell, /conn: r\.conn && \{[^}]*action: r\.conn\.action[,\s]/, 'the shell passes the row button label as it is (a key) to the connection row');
});

test('firstRun_disabled_switch_cannot_be_activated', () => {
  const output = String(renderFirstRun({ step: { id: 'done', kind: 'done', options: [{ key: 'unavailable', label: 'firstRun.stopped', disabled: true }] }, values: {} }));
  assert.match(output, /<button[^>]*disabled[^>]*role="switch"|<button[^>]*role="switch"[^>]*disabled/);
});

test('firstRun_interrupted_step_resumes_and_completed_replay_starts_at_welcome', () => {
  const first = harness(steps);
  first.openFirstRun();
  first.stepFirstRun(1, true);
  const reopened = harness(steps, first.saved);
  reopened.openFirstRun();
  assert.equal(reopened.current().index, 1);
  reopened.closeFirstRun();
  reopened.openFirstRun();
  assert.equal(reopened.current().index, 0);
  assert.equal(reopened.saved['kit.firstRun.done'], true);
});

test('firstRun_previous_session_response_cannot_start_more_checks_or_render', async () => {
  const pending = [];
  const checking = { ...steps[1], items: Array.from({ length: 5 }, (_, id) => ({ id: String(id) })), check: id => new Promise(resolve => pending.push({ id, resolve })) };
  const h = harness([steps[0], checking, steps[2]]);
  h.openFirstRun(); h.stepFirstRun(1, true);
  const previous = h.current();
  h.closeFirstRun(); h.openFirstRun(); h.stepFirstRun(1, true);
  const renders = h.renders();
  pending[0].resolve({ group: 'ok' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(previous.checks.clusters.results['0'], null);
  assert.equal(h.renders(), renders);
  assert.equal(pending.length, 8);
});

test('firstRun_same_session_step_change_keeps_result_with_original_step_and_stop_ignores_late_result', async () => {
  let resolve;
  const checking = { ...steps[1], items: [{ id: 'one' }], check: () => new Promise(done => { resolve = done; }) };
  const h = harness([steps[0], checking, steps[2]]);
  h.openFirstRun(); h.stepFirstRun(1, true); h.stepFirstRun(1, true);
  resolve({ group: 'ok' });
  await new Promise(done => setImmediate(done));
  assert.equal(h.current().checks.clusters.results.one.group, 'ok');
  assert.equal(h.current().checks.done, undefined);
  h.stepFirstRun(-1, false); h.startChecks(checking, 'one'); h.stopChecks();
  resolve({ group: 'ok' });
  await new Promise(done => setImmediate(done));
  assert.equal(h.current().checks.clusters.results.one.kind, 'idle');
});


test('firstRun_cancelled_check_uses_configured_failure_group_instead_of_permission_group', () => {
  const checking = { ...steps[1], failureGroup: 'check', groups: [{ id: 'ok' }, { id: 'check' }, { id: 'perm' }], items: [{ id: 'one' }], check: () => new Promise(() => {}) };
  const h = harness([steps[0], checking, steps[2]]);
  h.openFirstRun(); h.stepFirstRun(1, true); h.stopChecks();
  assert.equal(h.current().checks.clusters.results.one.group, 'check');
  assert.equal(h.current().checks.clusters.results.one.kind, 'idle');
});


test('firstRun_resumed_checks_start_items_discovered_after_the_step_opens', async () => {
  let items = [], calls = 0;
  const checking = { ...steps[1], items: () => items, check: async () => { calls++; return { group: 'ok' }; } };
  const h = harness([steps[0], checking, steps[2]], { 'kit.firstRun.step': 'clusters' });
  h.openFirstRun();
  items = [{ id: 'late' }]; h.refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(h.current().checks.clusters.results.late.group, 'ok');
  h.refresh();
  assert.equal(calls, 1);
});

test('firstRun_stop_invalidates_queued_checks_before_they_start', async () => {
  const pending = [];
  const checking = { ...steps[1], items: Array.from({ length: 5 }, (_, id) => ({ id: String(id) })), check: id => new Promise(resolve => pending.push({ id, resolve })) };
  const h = harness([steps[0], checking, steps[2]]);
  h.openFirstRun(); h.stepFirstRun(1, true); h.stopChecks();
  pending[0].resolve({ group: 'ok' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 4);
  assert.equal(h.current().checks.clusters.results['4'].kind, 'idle');
});

/* B-15: the last (done) step had only its centered start button: no way back to the step before it and no step dots, unlike every step
   before it. It keeps the same foot as the others: Back on the left, the dots, and its primary button (finish) on the right */
test('firstRun_done_step_has_back_and_the_step_dots_like_the_steps_before_it', () => {
  const output = String(renderFirstRun({ step: { id: 'done', kind: 'done', title: 'fixture.done', primary: 'fixture.start', options: [] }, values: {}, back: 'Back', dots: { count: 4, index: 3 } }));
  const foot = output.slice(output.indexOf('fr-foot'), output.indexOf('fr-dock'));
  assert.match(foot, /data-action="kit.firstRun.back"/, 'a way back');
  assert.equal((foot.match(/class="fr-dot\b/g) || []).length, 4, 'the dots, in the foot');
  assert.match(foot, /<span class="fr-dot on">/);
  assert.match(foot, /data-action="kit.firstRun.finish"/);
});

/* B2-19: in the light theme the step dots (muted on white) and the done step's settings card (a borderless face on the white first-run screen)
   could not be seen. The dots that are not the current step and that card's edge take a visible neutral in light */
test('first_run_dots_and_done_step_card_are_visible_in_light', async () => {
  const { css } = await import('../components/first-run.js');
  assert.match(css, /:root\[data-theme="light"\] \.fr-dot:not\(\.on\) \{ background: [^}]*muted-foreground/);
  assert.match(css, /:root\[data-theme="light"\] \.fr-body \.sg-card \{ border-color: var\(--border\); \}/);
});

/* B3-12: a first-run select was named by its row only ("Theme"), while the same select in settings says its value too ("Theme, Dark") */
test('firstRun_select_is_named_by_its_row_and_its_value_like_settings', () => {
  const output = String(renderFirstRun({ step: { id: 'done', kind: 'done', options: [{ key: 'theme', label: 'theme', choices: [{ id: 'dark', label: 'dark' }, { id: 'light', label: 'light' }] }] }, values: { theme: 'dark' } }));
  assert.match(output, /data-c="select"[^>]*aria-label="theme, dark"/);
});

/* First run simplified (decision 2026-11-18): steps were merged and removed. A stored step id from before (an interrupted first run) resumes at the step
   that took it over (aliases), not at the first step */
test('firstRun_a_stored_step_id_from_before_resumes_at_the_step_that_took_it_over', () => {
  const merged = [{ id: 'clusters', kind: 'checks', aliases: ['welcome'], items: [], groups: [{ id: 'ok' }, { id: 'failed' }] }, { id: 'ai', kind: 'connect' }, { id: 'setup', kind: 'done', aliases: ['permission', 'done'] }];
  for (const [old, index] of [['permission', 2], ['done', 2], ['welcome', 0], ['ai', 1]]) {
    const h = harness(merged, { 'kit.firstRun.step': old });
    h.openFirstRun();
    assert.equal(h.current().index, index, `${old} resumes at ${merged[index].id}`);
    assert.equal(h.saved['kit.firstRun.step'], merged[index].id, 'the new id is stored');
  }
});

/* R4-08: the three first-run steps put their cards at three widths (checks 556, connect 420, done 446px), sat right under the header with two
   thirds of the window empty under them, had Back and the primary button in the window corners away from the cards, and the header grew a
   line (47px) when a step's description arrived. Every list step is one column of the same width; the header and the column are centred in
   the room above the foot (a short step keeps a reserved height, so rows coming in do not move the header); the foot's buttons stand on the
   column's edges; the description line is reserved */
test('first_run_steps_share_one_column_centred_with_the_buttons_on_its_edges_and_a_reserved_description_line', async t => {
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url);
  let chromium; try { ({ chromium } = require('playwright-core')); } catch { t.skip('playwright-core unavailable'); return; }
  const { createServer } = await import('node:http'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><div id="box"></div>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const seen = await page.evaluate(async () => {
      const { addAllStyles, components } = await import('/kit/components/index.js');
      addAllStyles(document);
      const fr = components.firstRun || Object.values(components).find(c => c.name === 'first-run');
      const row = (id, label) => ({ id, label: { raw: label } });
      const steps = {
        checks: { id: 'clusters', kind: 'checks', title: 'fixture.v', description: 'fixture.v', back: false, buttons: [{ label: 'fixture.v', action: 'kit.firstRun.next' }],
          items: [row('a', 'lab')], groups: [{ id: 'ok', label: 'fixture.v' }], checks: { order: ['a'], results: { a: { group: 'ok', kind: 'ok', desc: 'v1.36' } }, fresh: [], grouped: true }, stopLabel: 'Stop', recheckLabel: 'Check again',
          add: { label: 'fixture.v', rows: [{ id: 'f', label: 'fixture.v', fields: [] }, { id: 'g', label: 'fixture.v', fields: [] }, { id: 'h', label: 'fixture.v', fields: [] }] } },
        connect: { id: 'ai', kind: 'connect', title: 'fixture.v', description: null, primary: 'fixture.v', groups: [{ label: 'fixture.v', rows: [{ id: 'x', label: 'fixture.v', fields: [] }, { id: 'y', label: 'fixture.v', fields: [] }] }] },
        connected: { id: 'ai', kind: 'connect', title: 'fixture.v', description: 'fixture.v', primary: 'fixture.v', groups: [{ label: 'fixture.v', rows: [{ id: 'x', label: 'fixture.v', fields: [] }, { id: 'y', label: 'fixture.v', fields: [] }] }] },
        done: { id: 'setup', kind: 'done', title: 'fixture.v', description: 'fixture.v', primary: 'fixture.v', options: [{ key: 'k', label: 'fixture.v', choices: [{ id: 'd', label: 'fixture.v' }] }] },
      };
      const box = document.getElementById('box'), out = {};
      for (const [k, step] of Object.entries(steps)) {
        box.innerHTML = String(fr.render({ step, values: { k: 'd' }, mark: 'globe', back: 'Back', skip: 'Skip', dots: { count: 3, index: 1 } }));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const r = s => box.querySelector(s)?.getBoundingClientRect();
        const card = r('.sg-card'), head = r('.fr-head'), title = r('.fr-title'), foot = r('.fr-foot'), col = r('.fr-col');
        const next = r('.fr-next .btn'), back = r('[data-action="kit.firstRun.back"]');
        out[k] = { cardLeft: Math.round(card.left), cardWidth: Math.round(card.width), titleTop: Math.round(title.top), headH: Math.round(head.height),
          above: Math.round(title.top), below: Math.round(foot.top - col.bottom), colLeft: Math.round(col.left), colRight: Math.round(col.right),
          nextRight: Math.round(next.right), backLeft: back ? Math.round(back.left) : null };
      }
      /* R4-09: a form with a command preview put its buttons after an empty status (a gap's width in from the form's left edge); they end
         on the form's right edge like the buttons at the end of a field line */
      const cloud = { id: 'clusters', kind: 'connect', title: 'fixture.v', description: 'fixture.v', primary: 'fixture.v', open: ['c'], fields: {}, errors: {},
        groups: [{ label: 'fixture.v', rows: [{ id: 'c', label: 'fixture.v', fields: [[{ key: 'name', label: 'fixture.v', placeholder: '' }]], preview: { lang: 'shell', text: 'aws eks update-kubeconfig' }, copy: { label: 'fixture.v', ready: true }, submit: { label: 'fixture.v' } }] }] };
      box.innerHTML = String(fr.render({ step: cloud, values: {}, mark: 'globe', back: 'Back', skip: 'Skip' }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const form = box.querySelector('[data-fr-row="c"]'), btns = [...form.querySelectorAll(':scope > .fr-line:last-of-type .btn')];
      out.cloudForm = { formRight: Math.round(form.getBoundingClientRect().right), buttonsRight: Math.round(btns.at(-1).getBoundingClientRect().right) };
      return out;
    });
    const cloudForm = seen.cloudForm; delete seen.cloudForm;
    assert.equal(cloudForm.buttonsRight, cloudForm.formRight, 'the preview line\'s buttons end on the form\'s right edge');
    const { checks, connect, connected, done } = seen;
    assert.deepEqual([connect.cardWidth, done.cardWidth, connect.cardLeft, done.cardLeft], [checks.cardWidth, checks.cardWidth, checks.cardLeft, checks.cardLeft], `one card width and edge: ${JSON.stringify(seen)}`);
    for (const [k, s] of Object.entries(seen)) {
      assert.ok(Math.abs(s.above - s.below) <= 60, `${k}: the header and column sit in the middle (above ${s.above}, below ${s.below})`);
      assert.equal(s.nextRight, s.colRight, `${k}: the primary button stands on the column's right edge`);
      if (s.backLeft != null) assert.equal(s.backLeft, s.colLeft, `${k}: Back stands on the column's left edge`);
    }
    assert.equal(connected.titleTop, connect.titleTop, 'a description arriving does not move the header');
    assert.equal(connected.headH, connect.headH);
  } finally { await browser?.close(); server.close(); }
});
