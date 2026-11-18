/*
 * Time range: the window a history view shows. The preset pills (pill-tabs: 15 min · 1 hour · 6 hours · 24 hours · 7 days by default) and, at the end,
 * "Custom", which opens a panel on the one floating surface (--float-*, the menu's surface and its open and close motion) to set any window:
 *   start and end as typed date-times (YYYY-MM-DD HH:MM in the time zone, read with core/clock.js) or picked from a small calendar (the day goes
 *   to the field that has the focus, the start first, then the end) and hour and minute inputs for that field (numbers, the arrow keys step,
 *   0-23 and 0-59, kept in step with the typed field); quick ranges (the last 15 min, 30 min, 3 h, 12 h, 2 days, 30 days);
 *   "Until now" for an open end (the window keeps moving); the zone named (Asia/Seoul · GMT+9) with the same window in UTC on a muted line;
 *   checks: the end after the start, nothing before the data the page keeps (retention, "kept for 30 days"), nothing in the future;
 *   Apply (Enter in a field) and Cancel (Escape). The panel keeps the focus while it is open and gives it back to the pill.
 * While a custom window is in use the Custom pill says it ("2026-11-12 13:20–14:05"; across days both dates whole, "2026-11-12 23:00 – 2026-11-13
 * 01:00"; "now" for an open end; the whole text is its tooltip) and a clear button inside the end of that pill goes back to the fallback preset (the pill
 * makes room for it only then: without a custom window every pill has the same padding on both sides).
 * Short of room (the control is measured in its container, as the summary bar fits its items) the pills fold into one field in the toolbar's
 * select shape that says the window in use (cut with an ellipsis, the whole text as its tooltip); pressing it opens the panel, which then
 * starts with the presets. Zoom out stays.
 * The page owns the window: value is { preset: id } or { from, to, live } (seconds); every choice is ctx.emit(action, { from, to, preset, live })
 * with preset the id or null. A window marked on a chart (chart-card rangeAction { from, to }) or a timeline (zoomAction) is a custom window:
 * the page passes it as value { from, to, live: false } and the pill shows it.
 *   presets?: { id, label: string, seconds }[] (default, the one set every page uses: 15m, 1h, 6h, 24h, 7d; a page chooses only its default
 *     through value); a preset longer than retention is disabled with a tip saying how long data is kept; fallback?: preset id the clear button returns to (default the first)
 *   retention?: seconds of data the page keeps; timeZone?: 'system' | 'utc' | IANA (the setting kit.timeZone); now?: seconds (tests); label?: the group's name
 *   zoneAction?: the page's own action for a zone change ({ timeZone }); without it the panel's zone switch (the reader's zone or UTC, the
 *     reference shown as 'UTC+09:00 Asia/Seoul') writes the setting kit.timeZone (kit.setting.set), which charts and lists read
 * Zoom out (zoomOut: true, for a page with charts; off by default): the ⊖ button after the pills, or Ctrl+Z / Command+Z outside a text field: the window in use twice as long around its centre,
 * moved back so it never runs past now nor before what is kept; it is emitted like a custom window ({ from, to, preset: null, live }).
 */
import { html, attrs, cx } from '../core/html.js';
import { t, formatDate } from '../core/i18n.js';
import { formatDateTime, parseDateTime, SYSTEM_ZONE } from '../core/clock.js';
import { keyText, matchCombo } from '../core/shortcuts.js';
import { place } from '../core/position.js';
import * as pillTabs from './pill-tabs.js';
import * as select from './select.js';
import * as button from './button.js';
import * as iconButton from './icon-button.js';
import * as checkbox from './checkbox.js';
import * as input from './text-input.js';

export const name = 'time-range';

export const css = `
.tr { display: inline-flex; align-items: center; gap: var(--space-1); max-width: 100%; min-width: 0; }
.tr .pill { font-variant-numeric: tabular-nums; }
.tr-pills { position: relative; display: inline-flex; min-width: 0; }
.tr-compact { position: relative; display: none; min-width: 0; } .tr-compact .slt { max-width: 100%; }
.tr.compact:not(.measuring) > .tr-pills { display: none; } .tr.compact:not(.measuring) > .tr-compact { display: inline-flex; } /* short of room the pills fold into one field that says the window in use */
/* the clear button sits inside the end of the Custom pill (and of the folded field) while a custom window is in use; otherwise the pill keeps the same room on both sides */
.tr.custom .pill:last-of-type { padding-inline-end: calc(var(--space-3) + var(--tr-x-room)); }
.tr.custom .tr-compact .slt { padding-inline-end: calc(var(--space-1_5) + var(--tr-x-room)); }
.tr-x { position: absolute; z-index: 2; top: 50%; transform: translateY(-50%); display: grid; }
.tr-pills > .tr-x { inset-inline-end: calc(var(--space-0_5) + var(--space-1)); }
.tr-compact > .tr-x { inset-inline-end: var(--space-1); } /* after the field's chevron, in the room the field keeps for it */
.tr-presets { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.tr-pop { position: fixed; z-index: var(--z-menu); width: var(--tr-pop-w); max-width: calc(100vw - 2 * var(--space-2)); display: grid; gap: var(--space-3); padding: var(--space-3); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--float-solid); -webkit-backdrop-filter: var(--float-filter); backdrop-filter: var(--float-filter); box-shadow: var(--float-edge), var(--float-shadow); color: var(--foreground); font-size: var(--text-sm); }
.tr-pop[data-state="open"] { animation: menu-in var(--dur-menu) var(--ease-enter) both; }
.tr-pop[data-state="closed"] { animation: menu-out var(--dur-menu) var(--ease-enter) both; pointer-events: none; }
.tr-pop[data-side="bottom"] { --enter-x: 0; --enter-y: calc(-1 * var(--enter-offset)); } .tr-pop[data-side="top"] { --enter-x: 0; --enter-y: var(--enter-offset); }
.tr-quick { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.tr-quick .btn { font-variant-numeric: tabular-nums; }
.tr-fields { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-2) var(--space-3); }
.tr-fields label { font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; }
.tr-fields .inp { font-variant-numeric: tabular-nums; }
.tr-live { grid-column: 2; display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--muted-foreground); cursor: pointer; user-select: none; }
.tr-cal { display: grid; gap: var(--space-1); }
.tr-cal-h { display: flex; align-items: center; justify-content: space-between; font-size: var(--text-xs); font-weight: var(--weight-medium); }
.tr-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--space-0_5); }
.tr-wd { height: var(--control-h-xs); display: grid; place-items: center; font-size: var(--text-2xs); color: var(--muted-foreground); }
.tr-day { display: grid; place-items: center; height: var(--control-h-xs); border-radius: var(--r-control-sm); font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: var(--foreground); transition: background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.tr-day:hover { background: var(--ghost-hover); } .tr-day:active { opacity: var(--press-opacity); }
.tr-day:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: calc(-1 * var(--focus-w)); }
.tr-day.out { color: var(--muted-foreground); }
.tr-day.in { background: var(--accent); }
.tr-day[aria-pressed="true"] { background: var(--primary); color: var(--primary-foreground); }
.tr-day:disabled { opacity: var(--disabled-opacity); pointer-events: none; }
.tr-time { display: flex; align-items: center; gap: var(--space-1_5); font-size: var(--text-xs); color: var(--muted-foreground); }
.tr-time label { margin-inline-end: auto; white-space: nowrap; }
.tr-time .inp { width: var(--space-12); text-align: center; font-variant-numeric: tabular-nums; }
.tr-zone { display: grid; gap: var(--space-0_5); font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.tr-zone b { font-weight: var(--weight-medium); color: var(--foreground); }
.tr-zone-h { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-width: 0; }
.tr-zone-h .pills { flex-shrink: 0; } .tr-zone .pill { height: var(--control-h-xs); font-size: var(--text-xs); } .tr-zone .pill-ind { height: var(--control-h-xs); }
.tr-err { min-height: var(--leading-xs); font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--destructive-content); }
.tr-foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-1_5); }
@media (prefers-reduced-motion: reduce) { .tr-pop[data-state] { animation: none; } }
`;

const MIN = 60, HOUR = 3600, DAY = 86400;
export const DEFAULT_PRESETS = [{ id: '15m', seconds: 15 * MIN }, { id: '1h', seconds: HOUR }, { id: '6h', seconds: 6 * HOUR }, { id: '24h', seconds: DAY }, { id: '7d', seconds: 7 * DAY }];
export const QUICK = [{ id: '15m', seconds: 15 * MIN }, { id: '30m', seconds: 30 * MIN }, { id: '3h', seconds: 3 * HOUR }, { id: '12h', seconds: 12 * HOUR }, { id: '2d', seconds: 2 * DAY }, { id: '30d', seconds: 30 * DAY }];
const CUSTOM = '__custom';
const nowSec = p => (p?.now ?? Date.now() / 1000);
const presetsOf = p => (p.presets?.length ? p.presets : DEFAULT_PRESETS).map(x => ({ ...x, label: x.label ?? t('timeRange.preset.' + x.id) }));

/** The window of a preset or a quick range: the last `seconds` up to now */
export const presetRange = (seconds, now) => ({ from: Math.round(now - seconds), to: Math.round(now) });

/** A custom window in a few characters: '2026-11-12 13:20 – 14:05', the second date only when the day differs, 'now' for an open end */
export function compact(range, { timeZone = SYSTEM_ZONE } = {}) {
  const a = formatDateTime(range.from, timeZone);
  if (range.live) return `${a} – ${t('timeRange.now')}`;
  const b = formatDateTime(range.to, timeZone);
  return a.slice(0, 10) === b.slice(0, 10) ? `${a}–${b.slice(11)}` : `${a} – ${b}`; /* a date always carries its year */
}

/** What is wrong with a window, as a locale key and its values (null when it is good). from/to in seconds; NaN is text that is not a date-time */
export function validate({ from, to, live }, { now, retention } = {}) {
  const end = live ? now : to;
  if (!Number.isFinite(from) || !Number.isFinite(end)) return { key: 'timeRange.badFormat' };
  if (end <= from) return { key: 'timeRange.order' };
  if (now != null && end > now + MIN) return { key: 'timeRange.future' };
  if (retention && now != null && from < now - retention - MIN) return { key: 'timeRange.retention', vars: { days: Math.round(retention / DAY) } };
  return null;
}

/** The days of a month as a 6 x 7 grid starting on Sunday: { y, m, d, out } (m is 1-12; out: the day belongs to the month before or after) */
export function monthGrid(y, m) {
  const first = new Date(Date.UTC(y, m - 1, 1)), start = Date.UTC(y, m - 1, 1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start + i * DAY * 1000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), out: d.getUTCMonth() !== m - 1 }; });
}

/* the field the calendar and the hour and minute inputs set: the end while it is open to typing and focused last, else the start */
const activeKey = s => (s.active === 'to' && !s.live ? 'toText' : 'fromText');
const timeOf = text => { const m = /^\d{4}-\d\d-\d\d (\d\d):(\d\d)$/.exec(text || ''); return m ? { h: m[1], m: m[2] } : { h: '', m: '' }; };
/** A text field's date-time with its hour or minute set (clamped to 0-23 and 0-59); the text stays as it is when it has no date-time */
export function withTime(text, part, value) {
  const n = Math.max(0, Math.min(part === 'h' ? 23 : 59, Math.round(Number(value)))), v = String(Number.isFinite(n) ? n : 0).padStart(2, '0');
  const m = /^(\d{4}-\d\d-\d\d) (\d\d):(\d\d)$/.exec(text || '');
  return m ? `${m[1]} ${part === 'h' ? v : m[2]}:${part === 'h' ? m[3] : v}` : text;
}

const isCustom = v => v && v.preset == null && Number.isFinite(v.from);

/** The window twice as long around its centre (zoom out); it never runs past now (it moves back instead) nor before what is kept */
export function zoomOut({ from, to }, { now, retention } = {}) {
  const span = Math.max(1, to - from), c = (from + to) / 2;
  let a = c - span, b = c + span;
  if (now != null && b > now) { a -= b - now; b = now; }
  if (retention && now != null) a = Math.max(a, now - retention);
  return { from: Math.round(a), to: Math.round(b), live: now != null && b >= now - 1 };
}

/** A zone's offset from UTC at an instant, as 'UTC+09:00' */
export function offsetText(zone, at) {
  const day = s => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)$/.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000; };
  const min = Math.round(day(formatDateTime(at, zone)) - day(formatDateTime(at, 'utc'))), a = Math.abs(min);
  return `UTC${min < 0 ? '−' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
/* the zone's own name: the reader's (system) zone as the browser names it */
const ianaOf = zone => (zone === SYSTEM_ZONE ? Intl.DateTimeFormat().resolvedOptions().timeZone : zone === 'utc' ? 'UTC' : zone);
/** The reference zone in words: 'UTC+09:00 Asia/Seoul' (UTC alone for UTC) */
export const zoneText = (zone, at) => (zone === 'utc' ? 'UTC' : `${offsetText(zone, at)} ${ianaOf(zone)}`);

/** @param {{id: string, value: {preset: string}|{from: number, to: number, live?: boolean}, action: string, zoomOut?: boolean, presets?: {id: string, label?: string, seconds: number}[], fallback?: string, retention?: number, timeZone?: string, now?: number, label?: string}} p */
export function render(p) {
  const presets = presetsOf(p), custom = isCustom(p.value), zone = p.timeZone || SYSTEM_ZONE;
  const beyond = x => p.retention && x.seconds > p.retention; /* a preset longer than the data kept cannot be chosen; its tip says why */
  const tabs = [...presets.map(x => ({ id: x.id, label: x.label, disabled: beyond(x) || undefined, tip: beyond(x) ? t('timeRange.beyond', { days: Math.round(p.retention / DAY) }) : undefined })), { id: CUSTOM, label: custom ? compact(p.value, { timeZone: zone }) : t('timeRange.custom'), tip: custom ? compact(p.value, { timeZone: zone }) : undefined }];
  const current = custom ? compact(p.value, { timeZone: zone }) : presets.find(x => x.id === p.value?.preset)?.label ?? t('timeRange.custom');
  const state = JSON.stringify({ presets: presets.map(({ id, seconds, label }) => ({ id, seconds, label, off: !!beyond({ seconds }) })), fallback: p.fallback || presets[0].id, retention: p.retention || 0, zone, zoneAction: p.zoneAction || null, value: p.value || null, now: p.now ?? null });
  const clear = () => (custom ? html`<span class="tr-x" data-tr-clear>${iconButton.render({ icon: 'cross-small', size: 'xs', tip: t('timeRange.clear') })}</span>` : '');
  return html`<span class="${cx('tr', custom && 'custom')}" data-c="time-range"${attrs({ 'data-tr': p.action, 'data-tr-state': state })}><span class="tr-pills">${pillTabs.render({ id: `tr-${p.id}`, tabs, value: custom ? CUSTOM : p.value?.preset, action: 'kit.timeRange', label: p.label || t('timeRange.label') })}${clear()}</span><span class="tr-compact" data-tr-compact data-tip="${current}" data-tip-overflow>${select.render({ value: current, label: `${p.label || t('timeRange.label')}: ${current}` })}${clear()}</span>${p.zoomOut ? html`<span data-tr-zoom>${iconButton.render({ icon: 'zoom-out', size: 'sm', tip: t('timeRange.zoomOut'), label: `${t('timeRange.zoomOut')} (${keyText('mod+z')})` })}</span>` : ''}</span>`;
}

/* the custom panel */
function panel(s) {
  const err = s.error ? t(s.error.key, s.error.vars) : '';
  const head = s.view, title = formatDate(Date.UTC(head.y, head.m - 1, 1), { month: 'long', timeZone: 'UTC' });
  const from = parseDateTime(s.fromText, s.zone), to = s.live ? s.now : parseDateTime(s.toText, s.zone);
  const dayOf = sec => (Number.isFinite(sec) ? formatDateTime(sec, s.zone).slice(0, 10) : null), fd = dayOf(from), td = dayOf(to), today = dayOf(s.now);
  const iso = c => `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
  const wd = Array.from({ length: 7 }, (_, i) => formatDate(Date.UTC(2023, 0, 1 + i), { weekday: 'narrow', timeZone: 'UTC' }));
  const oldest = s.retention ? dayOf(s.now - s.retention) : null;
    const utc = !s.error && Number.isFinite(from) && Number.isFinite(to) ? `UTC ${formatDateTime(from, 'utc')} – ${formatDateTime(to, 'utc')}` : '';
  return html`${s.presets ? html`<div class="tr-presets" role="group" aria-label="${t('timeRange.label')}">${s.presets.map(x => html`<span${attrs({ 'data-tr-preset': x.id })}>${button.render({ label: x.label, variant: x.id === s.preset ? 'default' : 'secondary', size: 'xs', round: true, disabled: x.off })}</span>`)}</div>` : ''}<div class="tr-quick" role="group" aria-label="${t('timeRange.quick')}">${QUICK.map(q => html`<span data-tr-quick="${q.seconds}">${button.render({ label: t('timeRange.last.' + q.id), variant: 'secondary', size: 'xs', round: true })}</span>`)}</div>
    <div class="tr-fields">
      <label for="tr-from">${t('timeRange.start')}</label>${input.render({ key: 'from', id: 'tr-from', value: s.fromText, placeholder: t('timeRange.format'), invalid: !!s.error && s.error.key !== 'timeRange.order' && !Number.isFinite(from) })}
      <label for="tr-to">${t('timeRange.end')}</label>${input.render({ key: 'to', id: 'tr-to', value: s.live ? '' : s.toText, placeholder: s.live ? t('timeRange.now') : t('timeRange.format'), disabled: s.live, invalid: !!s.error && !s.live && (s.error.key === 'timeRange.order' || !Number.isFinite(to)) })}
      <span class="tr-live" data-tr-live>${checkbox.render({ interactive: true, checked: s.live, label: t('timeRange.untilNow') })}<span aria-hidden="true">${t('timeRange.untilNow')}</span></span>
    </div>
    <div class="tr-cal">
      <div class="tr-cal-h">${iconButton.render({ icon: 'chevron-left-small', size: 'xs', tip: t('timeRange.prevMonth') })}<span aria-live="polite">${title}</span>${iconButton.render({ icon: 'chevron-right-small', size: 'xs', tip: t('timeRange.nextMonth') })}</div>
      <div class="tr-days" role="grid" aria-label="${title}">${wd.map(w => html`<span class="tr-wd" aria-hidden="true">${w}</span>`)}${monthGrid(head.y, head.m).map(c => { const day = iso(c), pressed = day === fd || day === td; return html`<button type="button"${attrs({ class: cx('tr-day', c.out && 'out', fd && td && day > fd && day < td && 'in'), 'data-day': day, 'aria-label': day, 'aria-pressed': String(pressed), 'aria-current': day === today ? 'date' : null, disabled: day > today || (oldest && day < oldest) })}>${c.d}</button>`; })}</div>
    </div>
    <div class="tr-time" role="group" aria-labelledby="tr-time-l"><label id="tr-time-l" for="tr-hh" data-tr-time-l>${t(activeKey(s) === 'toText' ? 'timeRange.endTime' : 'timeRange.startTime')}</label>${input.render({ key: 'hh', id: 'tr-hh', value: timeOf(s[activeKey(s)]).h, label: t('timeRange.hour') })}<span aria-hidden="true">:</span>${input.render({ key: 'mm', id: 'tr-mm', value: timeOf(s[activeKey(s)]).m, label: t('timeRange.minute') })}</div>
    <div class="tr-zone"><div class="tr-zone-h"><span id="tr-zone-l">${t('timeRange.zone')}</span>${pillTabs.render({ id: 'tr-zone', value: s.zone === 'utc' ? 'utc' : 'local', action: 'kit.timeRange.zone', label: t('timeRange.zone'), tabs: [{ id: 'local', label: t('timeRange.zoneLocal'), tip: zoneText(s.home === 'utc' ? SYSTEM_ZONE : s.home, s.now) }, { id: 'utc', label: 'UTC' }] })}</div><span><b>${zoneText(s.zone, s.now)}</b>${s.retention ? html` · ${t('timeRange.kept', { days: Math.round(s.retention / DAY) })}` : ''}</span>${s.zone === 'utc' ? '' : html`<span data-tr-utc>${utc}</span>`}</div>
    <div class="tr-err" role="alert" data-tr-err>${err}</div>
    <div class="tr-foot">${button.render({ label: t('timeRange.cancel'), variant: 'secondary', size: 'sm' })}${button.render({ label: t('timeRange.apply'), size: 'sm', disabled: !!s.error })}</div>`;
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  let pop = null, s = null, trigger = null, host = null;
  const read = el => JSON.parse(el.dataset.trState);
  const emit = (el, r) => ctx.emit(el.dataset.tr, r);
  const check = () => { const from = parseDateTime(s.fromText, s.zone), to = s.live ? s.now : parseDateTime(s.toText, s.zone); s.error = validate({ from, to, live: s.live }, { now: s.now, retention: s.retention }); return { from, to }; };

  const draw = focusKey => {
    check();
    pop.innerHTML = panel(s).s;
    for (const id of ['tr-hh', 'tr-mm']) { const el = pop.querySelector('#' + id); el.inputMode = 'numeric'; el.maxLength = 2; }
    const f = focusKey && pop.querySelector(focusKey);
    (f || pop.querySelector('#tr-from')).focus({ preventScroll: true });
  };
  /* only what typing changes is written while a field is typed in (the field itself is left alone: an input method keeps its composition) */
  const refresh = () => {
    const { from, to } = check();
    pop.querySelector('[data-tr-err]').textContent = s.error ? t(s.error.key, s.error.vars) : '';
    pop.querySelector('[data-tr-utc]').textContent = !s.error ? `UTC ${formatDateTime(from, 'utc')} – ${formatDateTime(to, 'utc')}` : '';
    const ok = pop.querySelectorAll('.tr-foot .btn')[1]; if (ok) ok.disabled = !!s.error;
  };

  /* the hour and minute inputs follow the focused field, and the field follows them; neither is written while it is being typed in */
  const syncTime = () => {
    const key = activeKey(s), tm = timeOf(s[key]);
    for (const [id, v] of [['tr-hh', tm.h], ['tr-mm', tm.m]]) { const el = pop.querySelector('#' + id); if (el !== doc.activeElement && el.value !== v) el.value = v; }
    pop.querySelector('[data-tr-time-l]').textContent = t(key === 'toText' ? 'timeRange.endTime' : 'timeRange.startTime');
  };
  const setTime = (part, value) => {
    const key = activeKey(s), next = withTime(s[key], part, value); if (next === s[key]) return;
    s[key] = next; const field = pop.querySelector(key === 'toText' ? '#tr-to' : '#tr-from'); if (field.value !== next) field.value = next;
    refresh();
  };

  /* the zone the window is read and written in: the fields keep the same instants in the new zone's words, and the choice is the page's
     setting (kit.timeZone through kit.setting.set, or the page's zoneAction with { timeZone }) so charts and lists follow it */
  function setZone(zone) {
    if (zone === s.zone) return;
    const conv = text => { const v = parseDateTime(text, s.zone); return Number.isFinite(v) ? formatDateTime(v, zone) : text; };
    s.fromText = conv(s.fromText); s.toText = conv(s.toText); s.zone = zone;
    const st = read(host);
    if (st.zoneAction) ctx.emit(st.zoneAction, { timeZone: zone }); else ctx.emit('kit.setting.set', { arg: { key: 'kit.timeZone', value: zone } });
    draw('[data-tabs="tr-zone"] [aria-selected="true"]');
  }

  function close(focusBack = true) {
    if (!pop) return;
    const el = pop; pop = null;
    el.dataset.state = 'closed';
    el.addEventListener('animationend', () => el.remove(), { once: true });
    win.setTimeout(() => el.remove(), (parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--dur-menu')) || 0) + 50);
    trigger?.setAttribute('aria-expanded', 'false');
    if (focusBack) trigger?.focus({ preventScroll: true });
    doc.removeEventListener('pointerdown', outside, true);
  }
  const outside = e => { if (pop && !pop.contains(e.target) && !trigger?.contains(e.target)) close(false); };
  function apply() {
    const { from, to } = check(); if (s.error) { refresh(); return; }
    emit(host, { from, to: s.live ? s.now : to, preset: null, live: s.live });
    close();
  }

  function openPanel(tr, pill, withPresets = false) {
    close(false);
    host = tr; trigger = pill;
    const st = read(tr), now = st.now ?? Date.now() / 1000, v = st.value;
    const range = isCustom(v) ? { from: v.from, to: v.live ? now : v.to, live: !!v.live } : { ...presetRange((st.presets.find(x => x.id === v?.preset) || st.presets[0]).seconds, now), live: true };
    const day = formatDateTime(range.from, st.zone);
    s = { presets: withPresets ? st.presets : null, preset: v?.preset ?? null, zone: st.zone, home: st.zone, now, retention: st.retention, fromText: day, toText: formatDateTime(range.to, st.zone), live: range.live, view: { y: +day.slice(0, 4), m: +day.slice(5, 7) }, active: 'from', error: null };
    pop = doc.createElement('div'); pop.className = 'tr-pop'; pop.dataset.c = 'time-range';
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-label', t('timeRange.custom'));
    doc.body.appendChild(pop);
    draw();
    const pos = place(pop, pill.getBoundingClientRect(), { side: 'bottom', align: 'end', sideOffset: parseFloat(win.getComputedStyle(pop).getPropertyValue('--space-1')) || 0 });
    pop.style.left = pos.x + 'px'; pop.style.top = pos.y + 'px'; pop.dataset.side = pos.side; pop.dataset.state = 'open';
    pill.setAttribute('aria-expanded', 'true');
    doc.addEventListener('pointerdown', outside, true);

    pop.addEventListener('focusin', e => { if (e.target.id === 'tr-from') s.active = 'from'; else if (e.target.id === 'tr-to') s.active = 'to'; else return; syncTime(); });
    pop.addEventListener('input', e => {
      const f = e.target.dataset?.field; if (!f) return;
      if (f === 'hh' || f === 'mm') { const v = e.target.value.replace(/\D/g, ''); if (v !== e.target.value) e.target.value = v; if (v !== '') setTime(f === 'hh' ? 'h' : 'm', v); return; }
      s[f === 'from' ? 'fromText' : 'toText'] = e.target.value; refresh(); syncTime();
    });
    pop.addEventListener('focusout', e => { const f = e.target.dataset?.field; if (f === 'hh' || f === 'mm') syncTime(); }); /* a cleared or out-of-range entry shows the value in use again */
    pop.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      const part = e.target.dataset?.field === 'hh' ? 'h' : e.target.dataset?.field === 'mm' ? 'm' : null;
      if (part && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const cur = Number(timeOf(s[activeKey(s)])[part] || 0); setTime(part, cur + (e.key === 'ArrowUp' ? 1 : -1)); e.target.value = timeOf(s[activeKey(s)])[part]; return; }
      if (e.key === 'Enter' && e.target.matches('input') && !e.isComposing) { e.preventDefault(); apply(); return; }
      if (e.key === 'Tab') { /* the focus stays in the panel */
        const all = [...pop.querySelectorAll('button:not(:disabled), input:not(:disabled)')], i = all.indexOf(doc.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); all.at(-1).focus(); } else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0].focus(); }
      }
    });
    pop.addEventListener('click', e => {
      const b = e.target.closest('button, [data-tr-live]'); if (!b) return;
      e.stopPropagation(); /* the panel's buttons are answered here */
      const pre = e.target.closest('[data-tr-preset]');
      if (pre) { const x = s.presets.find(y => y.id === pre.dataset.trPreset); if (x && !x.off) { emit(host, { ...presetRange(x.seconds, s.now), preset: x.id, live: true }); close(); } return; }
      const name = b.closest('[data-tabs="tr-zone"]') ? b.dataset.action : null;
      if (name === 'kit.timeRange.zone') { setZone(JSON.parse(b.dataset.arg) === 'utc' ? 'utc' : s.home === 'utc' ? SYSTEM_ZONE : s.home); return; }
      const q = e.target.closest('[data-tr-quick]');
      if (q) { const r = presetRange(+q.dataset.trQuick, s.now); s.fromText = formatDateTime(r.from, s.zone); s.toText = formatDateTime(r.to, s.zone); s.live = true; s.view = { y: +s.fromText.slice(0, 4), m: +s.fromText.slice(5, 7) }; draw('.tr-foot .btn:last-child'); return; }
      if (b.matches('[data-tr-live]') || b.closest('[data-tr-live]')) { s.live = !s.live; if (!s.live && !s.toText) s.toText = formatDateTime(s.now, s.zone); draw('[data-tr-live] .cbx'); return; }
      if (b.dataset.day) {
        const key = s.active === 'to' && !s.live ? 'toText' : 'fromText', time = (s[key].slice(11) || (key === 'fromText' ? '00:00' : '23:59'));
        s[key] = `${b.dataset.day} ${/^\d\d:\d\d$/.test(time) ? time : '00:00'}`;
        if (key === 'fromText' && !s.live) s.active = 'to';
        draw(`[data-day="${b.dataset.day}"]`); return;
      }
      const nav = [...pop.querySelectorAll('.tr-cal-h .ib')].indexOf(b);
      if (nav >= 0) { const d = new Date(Date.UTC(s.view.y, s.view.m - 1 + (nav ? 1 : -1), 1)); s.view = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; draw(`.tr-cal-h .ib:nth-of-type(${nav + 1})`); return; }
      const foot = [...pop.querySelectorAll('.tr-foot .btn')].indexOf(b);
      if (foot === 0) close(); else if (foot === 1) apply();
    });
  }

  /* the pills: a preset is chosen at once, Custom opens the panel; the clear button goes back to the fallback preset. The tabs' own action name is
     the kit's (kit.timeRange): it is answered here and goes no further */
  root.addEventListener('click', e => {
    const tr = e.target.closest?.('[data-tr]'); if (!tr) return;
    const pill = e.target.closest('.pill'), clear = e.target.closest('[data-tr-clear]'), zoom = e.target.closest('[data-tr-zoom]'), fold = e.target.closest('[data-tr-compact] .slt'), name = pill?.dataset.action;
    if (!(pill && name === 'kit.timeRange') && !clear && !zoom && !fold) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const st = read(tr), now = st.now ?? Date.now() / 1000;
    if (fold) { if (pop && trigger === fold) close(); else openPanel(tr, fold, true); return; }
    if (zoom) { zoomOutOf(tr); return; }
    if (clear) { const fb = st.presets.find(x => x.id === st.fallback) || st.presets[0]; emit(tr, { ...presetRange(fb.seconds, now), preset: fb.id, live: true }); return; }
    const id = JSON.parse(pill.dataset.arg);
    if (id === CUSTOM) { if (pop && trigger === pill) close(); else openPanel(tr, pill); return; }
    const x = st.presets.find(y => y.id === id); if (x) emit(tr, { ...presetRange(x.seconds, now), preset: x.id, live: true });
  }, true);
  /* fitting: every control is measured with its pills whole (the class shows them for the reading, nothing is painted in between); when they do
     not fit the room its container gives, the pills fold into the field */
  const fit = tr => {
    if (!tr.isConnected) return;
    tr.classList.add('measuring');
    const over = tr.scrollWidth > tr.clientWidth + 1;
    tr.classList.remove('measuring');
    if (tr.classList.contains('compact') !== over) tr.classList.toggle('compact', over);
  };
  if (win.ResizeObserver) {
    const seen = new WeakSet(), ro = new win.ResizeObserver(entries => { for (const en of entries) { const t2 = en.target.matches?.('[data-tr]') ? [en.target] : en.target.querySelectorAll?.(':scope > [data-tr], :scope > * > [data-tr]') || []; t2.forEach(fit); } });
    const scan = () => doc.querySelectorAll('[data-tr]').forEach(tr => { if (!seen.has(tr)) { seen.add(tr); ro.observe(tr); if (tr.parentElement) ro.observe(tr.parentElement); } fit(tr); });
    new win.MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('[data-tr]') || n.querySelector('[data-tr]'))))) scan(); }).observe(doc.body || doc.documentElement, { childList: true, subtree: true });
    scan();
  }

  /* zoom out: the window in use (a preset's moving window, or the custom one) twice as long around its centre; Ctrl+Z (Command+Z on macOS) does
     the same for the page's first time range when the focus is not in a text field */
  function zoomOutOf(tr) {
    const st = read(tr), now = st.now ?? Date.now() / 1000, v = st.value;
    const range = isCustom(v) ? { from: v.from, to: v.live ? now : v.to } : presetRange((st.presets.find(x => x.id === v?.preset) || st.presets[0]).seconds, now);
    emit(tr, { ...zoomOut(range, { now, retention: st.retention }), preset: null });
  }
  doc.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.isComposing || !matchCombo(e, 'mod+z')) return;
    const a = e.target, typing = a && (a.isContentEditable || /^(input|textarea|select)$/i.test(a.tagName || ''));
    const tr = doc.querySelector('[data-tr] [data-tr-zoom]')?.closest('[data-tr]');
    if (typing || !tr || pop) return;
    e.preventDefault(); zoomOutOf(tr);
  });
  win.addEventListener('pagehide', () => close(false), { once: true });
}
