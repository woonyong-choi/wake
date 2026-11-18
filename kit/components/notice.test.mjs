import test from 'node:test';
import assert from 'node:assert/strict';
import { render, age, noticeText, actionOf } from './notice.js';
import { t } from '../core/i18n.js';

const since = Date.UTC(2026, 10, 9, 14, 1, 5);
const base = { id: 'a1', tone: 'danger', severity: 'w-crit', title: 'n-title', fact: 'f-1', target: 'tg-1', since, now: since + 180e3,
  action: { label: 'a-open', action: 'x.open', arg: 1 }, menu: { id: 'x.mute', arg: 1 } };

test('two lines: the title and how long, then the severity word, one fact and the target; the whole card is its one action', () => {
  const m = render(base).s;
  assert.match(m, /class="ntc" data-c="notice" tabindex="0" data-id="a1" data-tone="danger" role="alert" aria-labelledby="ntc-t-a1" aria-describedby="ntc-a-a1"/);
  assert.match(m, /class="sti error"[\s\S]*<h3 class="ntc-t" id="ntc-t-a1"[^>]*>n-title<\/h3><span class="ntc-age"><time[^>]*data-tip="2026-11-09 \d\d:01:05">3 min<\/time>/, 'row 1: the title, then how long, with the start in full as its tooltip');
  assert.match(m, /<p class="ntc-m"><b class="ntc-sev" data-tone="danger">w-crit<\/b><i class="ntc-dot" aria-hidden="true"><\/i><span class="ntc-f">f-1<\/span><i class="ntc-dot" aria-hidden="true"><\/i><code data-tip="tg-1" data-tip-overflow>tg-1<\/code><\/p>/, 'row 2: severity in its colour, no ground; the target cut short with its name as the tooltip');
  assert.match(m, /<span class="ntc-go" aria-hidden="true" data-tip="a-open">[\s\S]*<span class="ntc-sr" id="ntc-a-a1">a-open<\/span>/, 'the action is the chevron\'s tooltip and the card\'s description');
  assert.match(m, /<span class="ntc-more"><button[^>]*data-menu="x.mute"/, 'the app\'s menu shares the time\'s place');
  assert.match(m, /<span class="ntc-x"><button[^>]*>/, 'close');
  assert.doesNotMatch(m, /badge|ntc-lb|ntc-p|class="btn/, 'no label chips, no buttons, no line that runs out');
});

test('older calls still draw: label is the severity, summary the fact, the last subtitle the target, primary the action', () => {
  const old = { id: 'o', tone: 'warn', label: 'warning', title: 'n-old', subtitle: ['site-a', 'ns-a', 'item-a'], summary: 'sum-1', at: since, now: since + 120e3, labels: [{ key: 'k', value: 'v' }], primary: { label: 'p-open', action: 'x.p' }, secondary: { label: 'p-2', action: 'x.s' } };
  const m = render(old).s;
  assert.match(m, /<b class="ntc-sev" data-tone="warn">warning<\/b>[\s\S]*<span class="ntc-f">sum-1<\/span>[\s\S]*<code data-tip="site-a · ns-a · item-a" data-tip-overflow>item-a<\/code>/);
  assert.match(m, /data-tip="n-old · site-a · ns-a · item-a · k=v"/, 'what the lines leave out is the title\'s tooltip');
  assert.equal(actionOf(old).action, 'x.p');
  assert.equal(actionOf({ link: { label: 'l', action: 'x.l' } }).action, 'x.l');
  assert.match(render({ ...old, summary: undefined, count: 3 }).s, new RegExp(`<span class="ntc-f">${t('notice.count', { count: 3 })}</span>`));
  assert.doesNotMatch(render({ id: 'n', title: 't' }).s, /ntc-go|ntc-m|aria-describedby/, 'no action, no chevron; nothing for row 2, no row 2');
});

test('resolved: the same card shows when it was resolved, the severity word as it came', () => {
  const m = render({ ...base, tone: 'ok', severity: 'resolved', resolvedAt: since + 600e3, now: since + 700e3 }).s;
  assert.match(m, /data-tone="ok" role="status"/);
  assert.match(m, /<time[^>]*>\d\d:11<\/time>/, 'the time it was resolved, not an age');
  assert.match(m, /<b class="ntc-sev" data-tone="ok">resolved<\/b>/);
});

test('tones: danger and warn are alerts, ok and info are quiet; an unknown tone is info', () => {
  assert.match(render({ ...base, tone: 'warn' }).s, /data-tone="warn" role="alert"/);
  assert.match(render({ ...base, tone: 'x' }).s, /data-tone="info" role="status"/);
});

test('how long: just now, then minutes, hours and days', () => {
  const now = Date.UTC(2026, 10, 9, 12);
  assert.equal(age(now - 10e3, now), t('notice.now'));
  assert.equal(age(now - 120e3, now), t('notice.forMinutes', { count: 2 }));
  assert.equal(age(now - 3 * 3600e3, now), t('notice.forHours', { count: 3 }));
  assert.equal(age(new Date(now - 2 * 86400e3), now), t('notice.forDays', { count: 2 }));
});

test('Text values of a notice are read in the locale; data passes through', () => {
  const r = noticeText({ title: 'k.t', fact: 'k.f', target: { raw: 'x' }, subtitle: [{ raw: 'a' }, 'k.s'], action: { label: 'k.a', action: 'x' }, since: 5, persist: true }, v => typeof v === 'string' ? 'T(' + v + ')' : v.raw);
  assert.deepEqual(r, { title: 'T(k.t)', fact: 'T(k.f)', target: 'x', subtitle: ['a', 'T(k.s)'], action: { label: 'T(k.a)', action: 'x' }, since: 5, persist: true });
});

test('the folded stack is one chip: the worst tone, the newest name and how many more', async () => {
  const { chipMarkup } = await import('./notice.js');
  const m = chipMarkup('danger', 'n-1', 2).s;
  assert.match(m, /^<button class="ntc-chip" type="button" data-tone="danger" aria-label="n-1 \+2" aria-expanded="false"><span class="sti error"/);
  assert.match(m, /<span class="ntc-chip-t">n-1<\/span><b>\+2<\/b><\/button>$/);
  assert.doesNotMatch(chipMarkup('ok', 'n-2', 0).s, /<b>/);
});

test('the stack: closed, the front card whole and two behind it a step lower and smaller, cut to its height; open, a column with gaps', async () => {
  const { stackLayout } = await import('./notice.js');
  const closed = stackLayout([100, 60, 80, 40], { open: false, max: 3, gap: 8, peek: 8, step: 0.05 });
  assert.deepEqual(closed.cards.map(c => [Math.round(c.y), c.scale, c.clip, c.behind, c.hidden]), [[0, 1, null, false, false], [13, 0.95, 100, true, false], [26, 0.9, 100, true, false], [26, 0.9, 100, true, true]]);
  for (const c of closed.cards.slice(1, 3)) assert.ok(c.y + c.scale * 100 > 100, 'a card behind shows below the front card');
  assert.equal(closed.height, 116);
  const open = stackLayout([100, 60, 80], { open: true, max: 3, gap: 8, peek: 8 });
  assert.deepEqual(open.cards.map(c => c.y), [0, 108, 176]);
  assert.equal(open.height, 256);
  assert.equal(stackLayout([], { open: false }).height, 0);
});

test('the age is read against the notice clock: a number, a function (a simulated clock), else the wall', async () => {
  const { nowOf } = await import('./notice.js');
  const at = Date.UTC(2026, 10, 12, 14, 0, 0);
  assert.equal(nowOf({ now: at + 5 }), at + 5);
  assert.equal(nowOf({ now: () => at + 7 }), at + 7);
  assert.ok(Math.abs(nowOf({}) - Date.now()) < 1000);
  assert.match(render({ ...base, since: at, now: () => at + 3 * 3600e3 }).s, new RegExp(`>${t('notice.forHours', { count: 3 })}</time>`));
});

test('a critical notice holds the stack open and does not run out; the others fold and run out as before', async () => {
  const { holdsOpen, runsOut } = await import('./notice.js');
  assert.equal(holdsOpen(['warn', 'danger']), true);
  assert.equal(holdsOpen(['warn', 'info', 'ok', 'unknown']), false);
  assert.equal(runsOut({ tone: 'danger' }), false);
  assert.equal(runsOut({ tone: 'warn' }), true);
  assert.equal(runsOut({ tone: 'warn', persist: true }), false);
});

test('a notice the person closed comes back under its id only when it is worse', async () => {
  const { comesBack } = await import('./notice.js');
  const warn = 2; /* the rank a warn notice had when it was closed */
  assert.equal(comesBack(warn, 'warn'), false);
  assert.equal(comesBack(warn, 'info'), false);
  assert.equal(comesBack(warn, 'danger'), true);
});
