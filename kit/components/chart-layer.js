/*
 * Chart layer: a chart card opened large over its pane, with the numbers of every line in a table under it. The card is the glance, the layer is the look, the page it leads
 * to (a list, a table of the resource) is the work: the layer only reads (sort, scroll), it never edits.
 * The page owns the state (which card is open, the table's sort); the layer unfolds from the rect of the card that opened it (its clip grows, the content is never scaled)
 * and folds back into it. Escape, the close button and a press on the scrim close it. It fills the nearest positioned ancestor (the pane), not the window.
 *   status: { live, label, action, toggleLabel, tone?: 'warn'|'danger' } (whether the chart follows the data, when it last did, and the button that pauses or resumes it); events: { at, kind, label }[] with formatTime(at) and the labels.event* words (the marks on the chart, listed under the table as a table of their own); drawer: a panel the page opens under the bar (a custom time range);
 *   compare: a line drawn from an earlier period is a ghost line (series.ghost) whose key is its line's key + '~prev'; the table then has a column of the change against it, and the ghost lines have rows of their own;
 *   series: { hidden: string[] (the keys of the lines that are off), action (runs with a key: turn that line on or off), soloAction? (runs with a key: only that line) }: the table's rows are the lines' switches, and a row pointed at puts its line in front of the others;
 *   sections: { open: { table, events }, action }: the table and the event list are bars that open (closed, they name the top of the table and the newest event); the page keeps which are open, and the action is told { arg: 'table'|'events', open };
 *   state: { kind: 'loading'|'empty'|'error'|'permission'|'unavailable', title, hint?, action? }: the plate says why it has nothing to draw (the table and the event list have nothing to name, so they are not drawn);
 *   drawerClose: the action that closes the drawer (Escape closes it before it closes the layer);
 *   keyboard: the layer takes focus when it opens and keeps it (Tab goes round inside), the rest of the page is inert while it is open, and the focus goes back to the button that opened it;
 *   chart: the chart object of the card (the layer sets its own height and holds the latest reading at rest); toolbar: the page's own controls (a range choice) shown beside the close button; labels: { name, last, min, avg, p95, max, close, events, eventTime, eventKind, eventName } (the caller's words);
 *   format: (number) => string; close: the action that closes; sort / sortAction: the table's sort (id of a column, dir) and the action a header press runs
 */
import { html, attrs } from '../core/html.js';
import * as chartCard from './chart-card.js';
import * as iconButton from './icon-button.js';
import * as dataTable from './data-table.js';
import * as summaryBar from './summary-bar.js';
import { focusSeries } from './chart-card.js';

export const name = 'chart-layer';

export const css = `
.cl { position: absolute; inset: 0; z-index: var(--z-dialog); display: flex; justify-content: center; align-items: flex-start; padding: var(--space-6) var(--space-4); }
.cl-scrim { position: absolute; inset: 0; background: var(--scrim); animation: cl-in var(--dur-unfold) var(--ease-out-expo) both; }
.cl-panel { isolation: isolate; position: sticky; top: var(--space-6); width: min(100%, var(--cl-max)); display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); max-height: calc(var(--cl-host-h) - 2 * var(--space-6)); overflow: clip; border-radius: var(--r-dialog); corner-shape: var(--corner); box-shadow: var(--shadow-xl); }
.cl-face { position: absolute; inset: 0; z-index: -1; pointer-events: none; border-radius: inherit; corner-shape: inherit; background: linear-gradient(var(--surface-secondary), var(--surface-secondary)), var(--background); } /* a solid face: no alpha, only the scrim around it lets the page show; it fades in as the panel opens, since the card it comes from has no face of its own */
.cl-bars { display: grid; gap: var(--space-3); }
.cl-panel .card { padding: 0; background: none; }
.cl-head { position: relative; z-index: calc(var(--z-sticky) + 2); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: var(--space-3); padding: var(--space-4) var(--space-6) var(--space-3); } /* the title and the controls stay put while the rest scrolls */
.cl-scroll { display: grid; align-content: start; gap: var(--space-3); min-height: 0; overflow-y: auto; padding: 0 var(--space-6) var(--space-4); } /* the kit's overlay bar runs in the side room the padding leaves */
.cl-bar-wrap { margin-inline-start: auto; }
.cl-tools { flex-basis: 100%; }
.cl-tools-in { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); width: fit-content; max-width: 100%; } /* the page's own controls under the title; the drawer opens under their trailing end (the control that opens it is the last one) */
.cl-bar { display: flex; align-items: center; gap: var(--space-2); }
.cl-status { display: inline-flex; align-items: center; justify-content: center; min-width: var(--cl-status-w); font-variant-numeric: tabular-nums; gap: var(--space-1_5); height: var(--control-h-sm); padding-inline: var(--space-3); border-radius: var(--r-pill); font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--muted-foreground); background: var(--secondary); white-space: nowrap; } /* the secondary face: the raised face in the dark theme, and still a pill on a white page in the light one */
.cl-status > .ib { margin-inline: auto calc(var(--space-1) - var(--space-3)); border-radius: var(--r-pill); } /* the button that pauses or resumes sits inside the pill, at its end */
.cl-status i { width: var(--space-1_5); height: var(--space-1_5); border-radius: var(--r-pill); background: var(--muted-foreground); }
.cl-status[data-tone="warn"] { color: var(--warning-content); }
.cl-status[data-tone="warn"] i { background: var(--warning); }
.cl-status[data-tone="danger"] { color: var(--destructive-content); }
.cl-status[data-tone="danger"] i { background: var(--destructive); }
.cl-status[data-live="true"] i { background: var(--brand-content); animation: cl-pulse var(--dur-live-pulse) var(--ease-standard) infinite; }
.cl-drawer { position: absolute; inset-block-start: calc(100% + var(--space-2)); inset-inline-end: 0; z-index: var(--z-sticky); width: var(--cl-drawer-w); max-width: 100%; display: grid; gap: var(--space-3); padding: var(--space-3); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--float-solid); -webkit-backdrop-filter: var(--float-filter); backdrop-filter: var(--float-filter); box-shadow: var(--float-edge), var(--float-shadow); }
.cl-drawer > :last-child { justify-self: end; display: flex; gap: var(--space-2); }
@keyframes cl-pulse { 50% { opacity: var(--cl-pulse-min); } }
.cl-row { display: flex; align-items: center; gap: var(--space-2); max-width: 100%; padding: 0; font: inherit; color: inherit; text-align: start; border-radius: var(--r-mark); }
.cl-row:hover { color: var(--foreground); }
.cl-row[aria-pressed="false"] { color: var(--muted-foreground); text-decoration: line-through; }
.cl-row[aria-pressed="false"] .dt-dot { opacity: var(--chart-dim-o); }
.cl-hint { font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; }
.cl-delta { font-variant-numeric: tabular-nums; color: var(--muted-foreground); }
.cl-delta[data-sign="1"], .cl-delta[data-sign="-1"] { color: var(--foreground); }
.cl-row:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-0_5); }
@keyframes cl-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .cl-scrim, .cl-status i { animation: none; } }
`;

export const hook = 'data-cl';

const TONE_DOT = { danger: '--destructive', warning: '--warning', ok: '--success', info: '--muted-foreground', run: '--brand-content' }; /* an event's state, as the colour it is drawn in (one that only informs is neutral: a series colour is never an event's) */
const SUMMARY_TOP = 3; /* how many of the table's lines the closed bar names */
const FADE_SPLIT = .45; /* the share of the motion the face takes to come in, and the content waits for */
const GHOST_SUFFIX = '~prev'; /* a ghost line's key is its line's key and this */
const P95 = .95; /* the percentile the table's p95 column names */
const stat = values => { const v = values.filter(Number.isFinite); if (!v.length) return null; const sorted = [...v].sort((a, b) => a - b); return { last: v.at(-1), min: sorted[0], avg: v.reduce((a, b) => a + b, 0) / v.length, p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * P95) - 1)], max: sorted.at(-1) }; };

/* the closed table: the lines at the top of the table as it is sorted now (by the column the reader chose), then the count left, then what is over its limit or its request */
function tableSummary(p, all, sort) {
  const off = new Set(p.series?.hidden ?? []), rows = all.filter(r => !off.has(r.key)), column = sort.id === 'name' ? 'last' : sort.id, top = rows.slice(0, SUMMARY_TOP); /* a line that is turned off is not at the top of anything */
  const items = [{ id: 'basis', label: p.labels.basis, value: p.labels[column] }, ...top.map(r => ({ id: 'top-' + r.name, label: r.name, value: p.format(r[column]), dot: r.color }))];
  if (rows.length > top.length) items.push({ id: 'more', label: p.labels.more(rows.length - top.length, 'table'), value: '' });
  const over = tone => (p.chart.refs || []).filter(r => r.tone === tone).reduce((n, r) => Math.max(n, rows.filter(x => x.last > r.value).length), 0);
  if (over('limit')) items.push({ id: 'over-limit', label: p.labels.overLimit, value: over('limit'), tone: 'danger' });
  else if (over('request')) items.push({ id: 'over-request', label: p.labels.overRequest, value: over('request'), tone: 'warn' });
  return items;
}
/* the closed event list: the newest event (its state colour, its kind, its name, how long ago), then how many more are in the window; no event says so */
function eventSummary(p) {
  const list = [...p.events].sort((a, b) => b.at - a.at), last = list[0];
  if (!last) return [{ id: 'none', label: p.labels.noEvents, value: '' }];
  const items = [{ id: 'latest', label: last.kind ?? last.label, value: last.kind ? last.label : '', meta: p.formatAgo(last.at), ...(TONE_DOT[last.tone] ? { dot: TONE_DOT[last.tone] } : {}) }];
  if (list.length > 1) items.push({ id: 'more', label: p.labels.more(list.length - 1, 'events'), value: '' });
  return items;
}

/** @param {{state?: object, sections?: {open: {table?: boolean, events?: boolean}, action: string}, formatAgo?: (at: number) => string, title: string, value?: string, chart: object, labels: {delta?: string, name: string, last: string, min: string, avg: string, p95: string, max: string, close: string, basis: string, more: (n: number, what: 'table'|'events') => string, toggle: (name: string) => string, solo?: string, overLimit: string, overRequest: string, noEvents: string, events?: string, eventTime?: string, eventKind?: string, eventName?: string}, format: (n: number) => string, close: string, sort?: {id: string, dir: 'asc'|'desc'}, sortAction?: string, eventSort?: {id: 'at'|'kind'|'label', dir: 'asc'|'desc'}, eventSortAction?: string, height?: number}} p */
/** Whether a time view follows the data, when it last did, and the button that pauses or resumes it: the same mark wherever a view has a time axis (a chart opened large, a timeline). */
export const status = s => html`<span class="cl-status" data-live="${String(!!s.live)}"${attrs({ 'data-tone': s.tone })}><i></i><span class="cl-status-t" role="status">${s.label}</span>${iconButton.render({ icon: s.live ? 'stop' : 'play', size: 'xs', action: s.action, label: s.toggleLabel })}</span>`;

export function render(p) {
  const off = new Set(p.series?.hidden ?? []);
  const rows0 = p.chart.series.map((s, index) => ({ key: s.key ?? s.name, index, ghost: s.ghost === true, name: s.name, color: s.color, ...(stat(s.observations ? s.observations.map(o => o.value) : s.values ?? []) ?? { last: NaN, min: NaN, avg: NaN, p95: NaN, max: NaN }) }));
  /* a line with an earlier twin (key + the ghost suffix): the change of its mean against the twin's, as a share of the twin's */
  const twins = new Map(rows0.filter(r => r.ghost).map(r => [r.key, r]));
  const rows = rows0.map(r => { const twin = twins.get(r.key + GHOST_SUFFIX); return twin && twin.avg ? { ...r, delta: (r.avg - twin.avg) / twin.avg } : r; });
  const compared = twins.size > 0;
  const lines = rows.filter(r => !r.ghost); /* the table sorts the lines; a ghost line stays under its own line */
  const sort = p.sort && (p.sort.id !== 'delta' || compared) ? p.sort : { id: 'last', dir: 'desc' }, sign = sort.dir === 'asc' ? 1 : -1; /* a sort by the change column means nothing once the comparison is gone */
  lines.sort((a, b) => sort.id === 'name' ? sign * a.name.localeCompare(b.name) : sign * ((a[sort.id] || 0) - (b[sort.id] || 0)));
  const ordered = lines.flatMap(r => [r, ...rows.filter(g => g.ghost && g.key === r.key + GHOST_SUFFIX)]);
  const esort = p.eventSort ?? { id: 'at', dir: 'desc' }, esign = esort.dir === 'asc' ? 1 : -1; /* the event table sorts the same way: a press on a head, then the other way; newest first until then */
  const events = p.events && [...p.events].sort((a, b) => esort.id === 'at' ? esign * (a.at - b.at) : esign * String(a[esort.id] ?? '').localeCompare(String(b[esort.id] ?? '')));
  const num = (id, optional = true) => ({ id, label: p.labels[id], kind: 'number', width: 'var(--cl-num-w)', sortable: true, optional, /* in a narrow panel the figures nearest the right end go first, the current one stays */ cell: r => Number.isFinite(r[id]) ? p.format(r[id]) : '' });
  return html`<div class="cl" data-c="chart-layer" data-cl data-close="${p.close}" role="dialog" aria-modal="true" aria-label="${p.title}"><div class="cl-scrim" data-cl-scrim></div>
    <div class="cl-panel" data-cl-panel>
      <div class="cl-face" data-cl-fade="face"></div>
      <div class="cl-head" data-cl-fade="content"><div class="card widget compact"><div class="card-h"><div><div class="card-t">${p.title}</div>${p.value ? html`<div class="card-big">${p.value}</div>` : ''}</div></div></div>
        <div class="cl-bar-wrap"><div class="cl-bar">${p.status ? status(p.status) : ''}<span data-cl-close>${iconButton.render({ icon: 'cross-medium', size: 'sm', label: p.labels.close })}</span></div></div>
        ${p.toolbar || p.drawer ? html`<div class="cl-tools"><div class="cl-tools-in">${p.toolbar ?? ''}${p.drawer ? html`<div class="cl-drawer" data-cl-drawer${attrs({ 'data-drawer-close': p.drawerClose })}>${p.drawer}</div>` : ''}</div></div>` : ''}</div>
      <div class="cl-scroll" data-scroll="panel">
      ${chartCard.render({ title: p.title, bare: true, widget: true, density: 'compact', chart: { ...p.chart, height: p.height ?? 340, rest: 'last', interactive: 'full' /* the large view is where a chart is zoomed and panned */, ...(p.series ? { hidden: p.series.hidden } : {}) }, ...(p.state ? { state: p.state } : {}) })}
      ${p.state ? '' : html`<div class="cl-bars" data-cl-fade="content">
        ${summaryBar.render({ label: p.labels.name, open: !!p.sections?.open.table, toggle: p.sections && { action: p.sections.action, arg: 'table' }, items: tableSummary(p, lines, sort), body: dataTable.render({ gridLines: true, rowKey: 'key', rows: ordered, sort, sortAction: p.sortAction, columns: [{ id: 'name', label: p.labels.name, sortable: true, cell: r => html`<button type="button" class="cl-row" data-sidx="${r.index}"${attrs({ 'aria-pressed': String(!off.has(r.key)), 'aria-label': p.labels.toggle(r.name), 'data-action': p.series?.action, 'data-arg': r.key })}>${dataTable.lead({ dot: r.color })}${r.name}</button>` }, num('last', false), ...(compared ? [{ id: 'delta', label: p.labels.delta, kind: 'number', width: 'var(--cl-num-w)', sortable: true, optional: true, cell: r => (Number.isFinite(r.delta) ? html`<span class="cl-delta" data-sign="${Math.sign(r.delta)}">${(r.delta > 0 ? '+' : r.delta < 0 ? '−' : '') + Math.abs(Math.round(r.delta * 100))}%</span>` : '') }] : []), num('min'), num('avg'), num('p95'), num('max'), ...(p.series?.soloAction ? [{ id: 'solo', label: '', width: 'var(--control-h-sm)', rowButton: { icon: 'eye', tip: p.labels.solo, action: p.series.soloAction } }] : [])] }) })}
        ${p.events ? summaryBar.render({ label: p.labels.events, open: !!p.sections?.open.events, toggle: p.sections && { action: p.sections.action, arg: 'events' }, items: eventSummary(p), body: p.events.length ? dataTable.render({ gridLines: true, rowKey: 'at', rows: events, sort: esort, sortAction: p.eventSortAction, columns: [{ id: 'at', label: p.labels.eventTime, width: 'var(--cl-num-w)', kind: 'mono', sortable: true, cell: e => p.formatTime(e.at) }, { id: 'kind', label: p.labels.eventKind, width: 'var(--cl-kind-w)', sortable: true, lead: e => ({ dot: TONE_DOT[e.tone] ?? '--muted-foreground' }), cell: e => e.kind }, { id: 'label', label: p.labels.eventName, muted: true, sortable: true }] }) : undefined }) : ''}
      </div>`}
      </div>
    </div></div>`;
}

/** The keyframes that put the panel's own plate over the card's plate: the panel moved so the two plates meet, cut to the card plate's size and corner, nothing scaled.
 *  The two meet where the card stands: a card at the left end of the layer takes the left of the plate (the layer grows to the right), one at the right end the right (it grows to the left), one in the middle the middle.
 *  b: the panel's rect, pp: its plate's rect, r: the card plate's rect (each { left, top, width, height }). */
export function unfoldFrames(b, pp, r, radius) {
  const x = pp.left - b.left, y = pp.top - b.top;
  const across = (centre, start, size) => (size > 0 ? Math.min(1, Math.max(0, (centre - start) / size)) : .5);
  const sx = across(r.left + r.width / 2, b.left, b.width) * Math.max(0, pp.width - r.width), sy = across(r.top + r.height / 2, b.top, b.height) * Math.max(0, pp.height - r.height);
  const right = Math.max(0, b.width - x - sx - r.width), bottom = Math.max(0, b.height - y - sy - r.height);
  return { small: { transform: `translate(${r.left - pp.left - sx}px, ${r.top - pp.top - sy}px)`, clipPath: `inset(${y + sy}px ${right}px ${bottom}px ${x + sx}px round ${radius})` }, full: { transform: 'none', clipPath: 'inset(0 0 0 0 round var(--r-dialog))' } };
}

/* the card that opens a layer is remembered; the panel moves out of that card's rect to its place (one move and one growing cut, the same on the way back) and the card stays hidden
   while it is open, so the card itself seems to become the layer. Escape, the close button and a press on the scrim fold it back before the page is asked to close */
export function attach(root, ctx) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  let card = null, last = null;
  /* the motion is the page's tokens: how long it takes and how it eases */
  const motion = (dur, ease) => { const css = win.getComputedStyle(doc.documentElement); return { duration: parseFloat(css.getPropertyValue(dur)) || 0, easing: css.getPropertyValue(ease).trim() || 'linear' }; };
  const reduced = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const plateOf = () => card?.querySelector('.chart');
  const note = e => { const b = e.target.closest?.('[data-expand]'); if (b) { card = b.closest('.card'); last = { rect: plateOf().getBoundingClientRect(), radius: win.getComputedStyle(plateOf()).borderTopLeftRadius }; } };
  doc.addEventListener('pointerdown', note, true);
  doc.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') note(e); }, true);
  /* what the layer comes out of is the card's plate (the shape that is seen); the title and the numbers over it have no body of their own to grow from */
  const source = () => (card?.isConnected && plateOf() ? { rect: plateOf().getBoundingClientRect(), radius: win.getComputedStyle(plateOf()).borderTopLeftRadius } : last);
  const frames = (panel, from) => unfoldFrames(panel.getBoundingClientRect(), panel.querySelector('.chart').getBoundingClientRect(), from.rect, from.radius);
  /* how the parts come and go: the face is whole by the time the cut is half grown, the content only starts to show then (and goes first on the way back) */
  const fade = (el, out) => { const face = el.dataset.clFade === 'face', frames = face ? [{ opacity: 0 }, { opacity: 1, offset: FADE_SPLIT }, { opacity: 1 }] : [{ opacity: 0 }, { opacity: 0, offset: FADE_SPLIT }, { opacity: 1 }]; return out ? frames.map(f => ({ ...f, offset: f.offset === undefined ? undefined : 1 - f.offset })).reverse() : frames; };
  const unfold = layer => {
    const panel = layer.querySelector('[data-cl-panel]'), r = source();
    if (!panel || panel._unfolded) return;
    panel._unfolded = true;
    if (r && !reduced()) {
      const f = frames(panel, r), t = motion('--dur-layer-open', '--ease-out-expo');
      panel.animate([f.small, f.full], t);
      panel.querySelectorAll('[data-cl-fade]').forEach(el => el.animate(fade(el, false), t)); /* the face comes in first, the title and the controls once the cut has grown */
    }
  };
  /* the page behind a layer is out of reach while it is open (focus, keys, the screen reader); the layer's siblings are marked again on every scan, because the page's own redraws clear marks they do not know */
  const held = new Set();
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  const hold = layer => {
    for (const sibling of layer.parentElement?.children ?? []) if (sibling !== layer && !sibling.inert) { sibling.inert = true; held.add(sibling); }
  };
  const release = () => { held.forEach(el => { el.inert = false; }); held.clear(); };
  const take = layer => {
    const panel = layer.querySelector('[data-cl-panel]');
    if (!panel || panel._taken) return;
    panel._taken = true;
    opener = doc.activeElement?.closest?.('[data-expand]') ?? card?.querySelector('[data-expand]') ?? null;
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
  };
  let opener = null;
  const scan = () => {
    const layers = root.querySelectorAll('[data-cl]');
    layers.forEach(layer => { unfold(layer); take(layer); hold(layer); });
    if (!layers.length) release();
  };
  new win.MutationObserver(scan).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] });
  scan();
  const fold = layer => {
    if (layer._folding) return;
    layer._folding = true;
    const panel = layer.querySelector('[data-cl-panel]'), r = source();
    /* the card comes back in the look the panel ends in (its scale and time marks showing) and keeps it until the pointer moves, so the end of the fold is not a change of drawing */
    const done = () => { const plate = card?.querySelector('.chart'); if (plate) { plate.classList.add('hover'); doc.addEventListener('pointermove', () => { if (!plate.matches(':hover') && doc.activeElement !== plate) plate.classList.remove('hover'); }, { once: true, capture: true }); } ctx.emit(layer.dataset.close, {}); release(); const back = opener?.isConnected ? opener : card?.querySelector('[data-expand]'); opener = null; back?.focus({ preventScroll: true }); };
    if (!r || reduced() || !panel) { done(); return; }
    const f = frames(panel, r);
    const t = { ...motion('--dur-layer-close', '--ease-standard'), fill: 'forwards' };
    panel.animate([f.full, f.small], t).finished.then(done, done);
    panel.querySelectorAll('[data-cl-fade]').forEach(el => el.animate(fade(el, true), t));
    layer.querySelector('[data-cl-scrim]').animate([{ opacity: 1 }, { opacity: 0 }], { ...motion('--dur-layer-close', '--ease-standard'), fill: 'forwards' });
  };
  /* a row pointed at (or focused) is its line in front of the others; leaving it puts them back */
  const plateIn = row => row.closest('[data-cl]')?.querySelector('.chart[data-chart]');
  const front = (row, on) => focusSeries(plateIn(row), on ? Number(row.dataset.sidx) : null);
  root.addEventListener('pointerover', e => { const row = e.target.closest?.('.cl-row'); if (row && !row.contains(e.relatedTarget)) front(row, true); });
  root.addEventListener('pointerout', e => { const row = e.target.closest?.('.cl-row'); if (row && !row.contains(e.relatedTarget)) front(row, false); });
  root.addEventListener('focusin', e => { const row = e.target.closest?.('.cl-row'); if (row) front(row, true); });
  root.addEventListener('focusout', e => { const row = e.target.closest?.('.cl-row'); if (row) front(row, false); });
  root.addEventListener('click', e => { const layer = e.target.closest?.('[data-cl]'); if (layer && (e.target.closest('[data-cl-close]') || e.target.matches('[data-cl-scrim]'))) { e.stopPropagation(); fold(layer); } }, true);
  doc.addEventListener('keydown', e => {
    const layer = root.querySelector('[data-cl]');
    if (!layer) return;
    if (e.key === 'Escape') {
      const drawer = layer.querySelector('[data-drawer-close]');
      e.stopPropagation();
      if (drawer) ctx.emit(drawer.dataset.drawerClose, {}); else fold(layer);
      return;
    }
    if (e.key !== 'Tab') return;
    /* Tab goes round inside the layer */
    const reachable = el => { const bar = el.closest('details'); return !bar || bar.open || (el.tagName === 'SUMMARY' && el.parentElement === bar); }; /* what is inside a closed bar cannot be reached */
    const inside = [...layer.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' && reachable(el));
    if (!inside.length) return;
    const first = inside[0], last = inside.at(-1), at = doc.activeElement;
    if (e.shiftKey && (at === first || at === layer.querySelector('[data-cl-panel]'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    else if (!layer.contains(at)) { e.preventDefault(); first.focus(); }
  }, true);
}
