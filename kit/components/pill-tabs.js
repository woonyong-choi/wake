/*
 * Pill tabs: inside a tertiary pill, the indicator (surface-primary, shadow, 0.5px ring) slides with a spring.
 * Choosing a tab calls ctx.emit(action, { arg: id }).
 * A tab may lead with an icon (icon) and carry a problem mark after its label and count (badge: { tone: 'warn'|'danger', value? }): the value
 * (a number is written with the locale's thousands, a string as given) in the tone's word colour, or without a value a status dot.
 */
import { html, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { formatNumber } from '../core/i18n.js';
import * as statusDot from './status-dot.js';
import { attachTabs } from '../core/indicator.js';
import { t } from '../core/i18n.js';

export const name = 'pill-tabs';

export const css = `
.pills { display: inline-flex; position: relative; padding: var(--space-0_5); border-radius: var(--r-pill); background: var(--surface-tertiary); }
.pill:disabled { opacity: var(--disabled-opacity); cursor: default; } /* a tab that cannot be chosen now says why on hover (tip, the native title) */
.pill { height: var(--control-h-sm); padding: 0 var(--space-3); white-space: nowrap; flex-shrink: 0; border-radius: var(--r-pill); font-size: var(--text-native-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); position: relative; z-index: 1; display: inline-flex; align-items: center; gap: var(--space-1_5); transition: color var(--dur-fast) var(--ease-standard); }
.pill:hover, .pill[aria-selected="true"] { color: var(--foreground); }
.pill .n { color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.pill > .wi { flex-shrink: 0; }
.pill .pill-b { font-variant-numeric: tabular-nums; font-weight: var(--weight-semibold); } .pill .pill-b[data-tone="warn"] { color: var(--warning-content); } .pill .pill-b[data-tone="danger"] { color: var(--destructive-content); }
.pill-ind { position: absolute; top: var(--space-0_5); height: var(--control-h-sm); border-radius: var(--r-pill); background: var(--surface-primary); box-shadow: var(--shadow-xs), 0 0 0 var(--hairline) var(--border-surface); transition: left var(--dur-spring-tab) var(--ease-spring-tab), width var(--dur-spring-tab) var(--ease-spring-tab); }
:root[data-theme="light"] .pill-ind { background: var(--background); }
:root[data-theme="light"] .pills { background: var(--tabs-list); } /* on a white page the light theme's see-through white track is not seen, and the white mark of the chosen pill stood alone as a ringed lump */
.pills-fold { display: flex; max-width: 100%; min-width: 0; margin: var(--pane-tabs-before, var(--space-6)) 0 var(--pane-tabs-after, var(--space-5)); } /* section tabs: the row takes the width of its tabs, never scrolls and never fades; when its room is too small the last tabs fold into "more" */
.pills-fold > .pills { max-width: 100%; min-width: 0; }
.pills-fold.flat { margin: 0; } /* a toolbar's folding filter pills: the toolbar sets the spacing */
.pills-fold .pill { min-width: 0; }
.pills-more { height: var(--control-h-sm); padding: 0 var(--space-2) 0 var(--space-3); white-space: nowrap; flex-shrink: 0; border-radius: var(--r-pill); font-size: var(--text-native-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); position: relative; z-index: 1; display: inline-flex; align-items: center; gap: var(--space-0_5); transition: color var(--dur-fast) var(--ease-standard); }
.pills-more:hover, .pills-more[aria-expanded="true"] { color: var(--foreground); }
.pills-more[hidden], .pills .pill[hidden] { display: none; } /* quality:instant: a tab folds into "more" (or comes back) at once, the row keeps its height */
`;

const mark = b => !b ? '' : b.value != null && b.value !== ''
  ? html`<span class="pill-b" data-tone="${b.tone === 'danger' ? 'danger' : 'warn'}">${typeof b.value === 'number' ? formatNumber(b.value) : b.value}</span>`
  : statusDot.render({ tone: b.tone === 'danger' ? 'critical' : 'warn' });

/** @param {{id: string, tabs: {id: string, label: string, icon?: string, count?: number|string, badge?: {tone: 'warn'|'danger', value?: number|string}, disabled?: boolean, tip?: string}[], value: string, action: string, spaced?: boolean, fold?: boolean}} p
 *  spaced: page section tabs (24 above, 20 below); fold: the tabs that do not fit fold into "more" (spaced tabs always fold) */
export function render(p) {
  const tabs = html`<div class="pills" role="tablist" data-c="pill-tabs" data-tabs="${p.id}"${attrs({ 'aria-label': p.label })}>${p.tabs.map(tb => html`<button class="pill" role="tab" aria-selected="${String(tb.id === p.value)}" data-action="${p.action}" data-arg="${JSON.stringify(tb.id)}"${attrs({ disabled: tb.disabled, title: tb.tip })}>${tb.icon ? icon(tb.icon, 'sm') : ''}${tb.label}${tb.count != null ? html`<span class="n">${tb.count}</span>` : ''}${mark(tb.badge)}</button>`)}<span class="pill-ind" aria-hidden="true"></span></div>`;
  if (!p.spaced && !p.fold) return tabs;
  /* section tabs: the same row with a "more" button at its end, shown only while some tabs are folded (attach measures the room).
     fold without spaced: a toolbar's filter pills folding the same way, with no section margins */
  const more = html`<button type="button" class="pills-more" data-pills-more hidden aria-haspopup="menu" aria-expanded="false">${t('settings.more')}${icon('chevron-down-small', 'sm')}</button>`;
  return html`<div class="${p.spaced ? 'pills-fold' : 'pills-fold flat'}" data-pills-fold>${html`<div class="pills" role="tablist" data-c="pill-tabs" data-tabs="${p.id}"${attrs({ 'aria-label': p.label })}>${p.tabs.map(tb => html`<button class="pill" role="tab" aria-selected="${String(tb.id === p.value)}" data-action="${p.action}" data-arg="${JSON.stringify(tb.id)}"${attrs({ disabled: tb.disabled, title: tb.tip })}>${tb.icon ? icon(tb.icon, 'sm') : ''}<span class="trunc">${tb.label}</span>${tb.count != null ? html`<span class="n">${tb.count}</span>` : ''}${mark(tb.badge)}</button>`)}${more}<span class="pill-ind" aria-hidden="true"></span></div>`}</div>`;
}

/* folding: each tab's own width is measured once it has been drawn whole; the row shows the leading tabs that fit with "more" after them (the
   chosen tab always stays: it takes the place of the last one that would fit). A row folds when its tabs need more than its room and unfolds
   only when they fit with a margin to spare, so a width at the edge does not flip it back and forth */
const SPARE = 12;
function fold(row) {
  const tabs = [...row.querySelectorAll('.pills > .pill')], more = row.querySelector('[data-pills-more]'), box = row.parentElement;
  if (!tabs.length || !more || !box) return;
  const track = row.firstElementChild, pad = track.offsetWidth - track.clientWidth + parseFloat(getComputedStyle(track).paddingLeft) + parseFloat(getComputedStyle(track).paddingRight);
  for (const tb of tabs) {
    tb.style.maxWidth = '';
    if (!tb._w) { tb.hidden = false; tb._w = tb.offsetWidth; }
  }
  const folded = !more.hidden;
  more.hidden = false;
  more._w = more.offsetWidth;
  /* the least room the row needs is the chosen tab whole and "more": the head lets the sub line give way to it (--pills-need) */
  const chosenTab = tabs.find(tb => tb.getAttribute('aria-selected') === 'true');
  box.style.setProperty('--pills-need', `${Math.ceil((chosenTab?._w ?? 0) + more._w + pad)}px`);
  const room = box.clientWidth;
  more._items = [];
  const need = tabs.reduce((a, tb) => a + tb._w, 0) + pad;
  if (need <= room - (folded ? SPARE : 0)) { tabs.forEach(tb => { tb.hidden = false; }); more.hidden = true; return; }
  const moreW = more._w || 64, chosen = chosenTab;
  let used = pad + moreW; const keep = new Set();
  for (const tb of tabs) { if (used + tb._w > room) break; keep.add(tb); used += tb._w; }
  if (chosen && !keep.has(chosen)) {
    while (keep.size && used + chosen._w > room) { const last = [...keep].pop(); keep.delete(last); used -= last._w; }
    keep.add(chosen);
  }
  tabs.forEach(tb => { tb.hidden = !keep.has(tb); });
  more._items = tabs.filter(tb => !keep.has(tb));
  more.hidden = more._items.length === 0;
  if (chosen) chosen.style.maxWidth = `${Math.max(0, room - pad - (more.hidden ? 0 : moreW))}px`;
}

export function attach(root, ctx) {
  attachTabs(root, '.pills', '.pill', '.pill-ind');
  const doc = root.ownerDocument || root;
  const rows = new Set();
  /* folding hides tabs and sets the head's --pills-need: done in the next frame for the rows whose box changed, never inside the observer
     callback (the head resized again in the same frame: "ResizeObserver loop completed with undelivered notifications", R5-07) */
  const due = new Set(); let frame = 0;
  const ro = new ResizeObserver(entries => {
    for (const e of entries) { const row = e.target.matches?.('[data-pills-fold]') ? e.target : e.target.querySelector?.(':scope > [data-pills-fold]'); if (row) due.add(row); }
    if (due.size && !frame) frame = requestAnimationFrame(() => { frame = 0; const list = [...due]; due.clear(); list.forEach(row => { if (row.isConnected) fold(row); }); });
  });
  const observers = new Map();
  const refresh = row => { row.querySelectorAll('.pill').forEach(tb => { tb._w = 0; }); fold(row); };
  const watch = row => {
    if (rows.has(row)) return;
    rows.add(row); ro.observe(row.parentElement || row); fold(row);
    /* a page that draws again puts back the tabs' and "more"'s hidden as drawn: that refolds too; the folding's own changes are dropped (takeRecords) */
    const observer = new MutationObserver(() => { refresh(row); observer.takeRecords(); });
    observer.observe(row, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'hidden'] });
    observers.set(row, { observer, box: row.parentElement || row });
  };
  root.addEventListener('click', e => {
    const more = e.target.closest?.('[data-pills-more]'); if (!more) return;
    const items = (more._items || []).map(tb => ({ id: 'more-' + tb.dataset.arg, label: tb.textContent, disabled: tb.disabled, checked: tb.getAttribute('aria-selected') === 'true', action: tb.dataset.action, arg: JSON.parse(tb.dataset.arg) }));
    if (items.length) ctx?.menu?.open?.(more, { items });
  });
  new MutationObserver(records => {
    for (const row of rows) if (!row.isConnected) {
      const { observer, box } = observers.get(row);
      observer.disconnect(); ro.unobserve(box); observers.delete(row); rows.delete(row);
    }
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches('[data-pills-fold]')) watch(node);
      node.querySelectorAll('[data-pills-fold]').forEach(watch);
    }
  }).observe(doc.body, { childList: true, subtree: true });
  doc.querySelectorAll('[data-pills-fold]').forEach(watch);
  doc.fonts?.addEventListener?.('loadingdone', () => rows.forEach(refresh));
}
