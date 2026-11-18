/*
 * Report canvas: a report (core/report.js) drawn as one document sheet, not as a copy of the screens. No card around a section: sections follow each
 * other on the same surface, separated only by their numbered heads (a top-level section opens with a rule) — on screen in the theme's tokens, in print on paper.
 * Each block's report form:
 *   chart      the kit's own chart (chart-card, the same axes, area, threshold and legend as the screens) with no frame, no head and no interactive
 *              chrome (bare, static: the kit's still picture with its axes always shown), its legend below; then the caption with the key numbers
 *   table      a compact report table (no hover, no row action, no checks); a cell keeps one line on screen and in print (ellipsis, the whole value as
 *              its title), except a prose column (wrap) that wraps inside its cell; a column of raw text (excerpt: log lines, queries, system messages)
 *              stands under the table as a monospace excerpt, each row's whole value on its own line, led by the row's key values
 *   summary    key and value rows; a value is document prose and wraps inside its cell
 *   log        a monospace excerpt with line numbers; pointed lines tinted, the lines left out between them as one muted row ("N lines left out")
 *   statements statements with the numbers of the evidence they rest on ([1][3]); an item with no label continues the label above
 *   timeline   time rows (time · kind · title)
 *   text       a paragraph
 * A snapshot's source line (source · query · collected, to the second) stands under the body, as a figure's source does in a document.
 * The head is the document's title and one line of name and value pairs (a value never wraps: an ellipsis, the whole value as its title).
 * Selection (no checkboxes): a drag that starts on the body or on empty room draws a marquee; the rows, lines and statements it touches are selected,
 * and a section it touches with nothing selectable under the marquee (a figure, a paragraph) or whose head it crosses is selected whole. A press
 * selects one thing; Shift or Cmd/Ctrl adds to the selection or takes away from it; a press on empty room, or Escape, clears it. A drag that starts on
 * a section's head moves the section (the others step aside as it passes); it never selects. While something is selected, "Delete selected" and
 * "Refer to AI" take the place of the page's tools in the bar (the bar keeps its height, nothing below moves); Delete or Backspace deletes.
 * Selected things take the selected-row tint (--secondary); pointed ones --row-mark.
 *   render({ id, report: state, canUndo?, action, head?: { title, rows: { label, value }[] }, tools?, end?, bar?: false })
 *     bar false leaves the bar out: the page places toolbar(p) where its pane head is
 *   toolbar({ report, canUndo?, action, tools?, end? }): one quiet row: the page's tools (or the selection's actions), undo, then end (the pane's close)
 *     every press emits ctx.emit(action, { type, ... }); handle(report, payload) does what it asks and returns { state, refer?, op? }
 *     types: set { keys } | add { keys } (each one on if off, off if on) | clear | move { block, to } | delete | refer | undo
 *   play(root, state, op): the motion before an op is applied (await it, then apply the op and draw); runOps(root, report, ops, { delay, draw })
 * print(doc, { title, layout }): the light theme and the paper's width, the page sheet (pageSheet: A4, the title on every page, the page number), then the dialog.
 * Print (a PDF): the same sheet; the bar drops; tables repeat their head and never split a row, nor leave one row alone on a page (the first two
 * and the last two rows stay together); a small section (a figure, a paragraph, a list or a table of a few rows) stays on one page whole, so
 * the small groups at the end share a page; a section head stays with what follows. The page's own print sheet adds the page size, the running
 * header and the page number.
 */
import { html, attrs, cx } from '../core/html.js';
import { t } from '../core/i18n.js';
import { formatFull } from '../core/clock.js';
import { itemsOf, foldLines, keyOf, toggle, selectedItems, deleteSelectedOp, numbers, excerpt } from '../core/report.js';
import * as flowGraph from './flow-graph.js';
import * as chartCard from './chart-card.js';
import * as button from './button.js';

export const name = 'report-canvas';

export const css = `
.rc { display: grid; min-width: 0; }
.rc.dragging { user-select: none; -webkit-user-select: none; }
.rc-doc { display: grid; gap: var(--space-2); min-width: 0; padding-block-end: var(--space-3); }
.rc-doc h1 { margin: 0; font-size: var(--text-lg); font-weight: var(--weight-semibold); line-height: var(--leading-lg); }
.rc-kv { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-40) * 1.75), 1fr)); gap: var(--space-1) var(--space-6); margin: 0; font-size: var(--text-sm); }
.rc-kv > div { display: grid; grid-template-columns: calc(var(--space-16) * 1.15) minmax(0, 1fr); gap: var(--space-2); min-width: 0; }
.rc-kv dt { color: var(--muted-foreground); white-space: nowrap; } .rc-kv dd { margin: 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.rc-bar { display: flex; flex-wrap: nowrap; align-items: center; gap: var(--space-1_5); min-width: 0; width: 100%; }
.rc-bar > .rc-end { margin-inline-start: auto; display: flex; align-items: center; gap: var(--space-1); }
.rc-bar .rc-count { font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rc-sec { min-width: 0; padding-block: var(--space-4) var(--space-2); }
.rc-sec[data-depth="1"] { border-block-start: var(--line) solid var(--border-surface); }
.rc-sec[data-depth="2"] { padding-block-start: var(--space-3); }
.rc-head { display: flex; align-items: baseline; gap: var(--space-2); margin-block-end: var(--space-2_5); font-size: var(--text-base); font-weight: var(--weight-semibold); cursor: grab; touch-action: none; }
.rc-sec[data-depth="2"] > .rc-head { font-size: var(--text-sm); }
.rc-head > .rc-n { flex: none; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.rc-head > .rc-t { min-width: 0; overflow-wrap: anywhere; }
.rc-sec[data-sel] { background: var(--secondary); }
.rc-sec.rc-moving { position: relative; z-index: 1; background: var(--background); cursor: grabbing; }
.rc-sec.rc-shift { transition: transform var(--dur-collapse) var(--ease-standard); }
.rc-text { margin: 0; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--foreground); }
.rc-src { margin-block-start: var(--space-1_5); font-size: var(--text-xs); color: var(--muted-foreground); overflow-wrap: anywhere; }
.rc-src code { font-family: var(--font-mono); }
.rc-cap { margin-block-start: var(--space-2); font-size: var(--text-xs); color: var(--foreground); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.rc-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.rc-tbl th { text-align: start; font-weight: var(--weight-medium); color: var(--muted-foreground); font-size: var(--text-xs); padding: 0 var(--space-3) var(--space-1_5) 0; border-block-end: var(--line) solid var(--border-surface); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rc-tbl td { padding: var(--space-1_5) var(--space-3) var(--space-1_5) 0; border-block-end: var(--line) solid var(--border-surface); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: top; }
.rc-tbl :is(th, td):last-child { padding-inline-end: 0; }
.rc-tbl tr:last-child > td { border-block-end: 0; }
.rc-tbl td.wrap, .rc-kvt td:last-child { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
.rc-tbl td.end, .rc-tbl th.end { text-align: end; } .rc-tbl td.mono { font-family: var(--font-mono); font-size: var(--text-xs); } .rc-tbl td.muted { color: var(--muted-foreground); }
.rc-kvt td:first-child { color: var(--muted-foreground); }
.rc-tbl tr.rc-mark > td, .rc-log .rc-ln.rc-mark { background: var(--row-mark); color: var(--foreground); font-weight: var(--weight-medium); }
.rc [data-rc-key][data-sel], .rc .rc-tbl tr[data-sel] > td { background: var(--secondary); }
.rc-log { font-family: var(--font-mono); font-size: var(--text-xs); line-height: var(--leading-xs); display: grid; min-width: 0; }
.rc-ln { display: grid; grid-template-columns: var(--rc-ln-w, 4ch) minmax(0, 1fr); gap: var(--space-3); padding-block: var(--space-0_5); }
.rc-ln > .rc-no { color: var(--muted-foreground); text-align: end; user-select: none; }
.rc-ln > .rc-lt { white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
.rc-ex { margin-block-start: var(--space-2); display: grid; gap: var(--space-0_5); font-family: var(--font-mono); font-size: var(--text-xs); line-height: var(--leading-xs); }
.rc-ex > div { white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
.rc-ex > .rc-mark { background: var(--row-mark); font-weight: var(--weight-medium); }
.rc-ln.rc-fold > .rc-lt { color: var(--muted-foreground); font-family: var(--font-sans, inherit); }
.rc-st { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-1_5); font-size: var(--text-sm); line-height: var(--leading-sm); }
.rc-st > li { display: grid; grid-template-columns: calc(var(--space-16) * 1.75) minmax(0, 1fr); gap: var(--space-3); }
.rc-st > li > .rc-sl { color: var(--muted-foreground); } .rc-st .rc-refs { color: var(--muted-foreground); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rc-chart { min-width: 0; }
.rc-marquee { position: fixed; z-index: var(--z-sticky, 50); pointer-events: none; border: var(--line) solid var(--focus); background: color-mix(in oklab, var(--focus) 10%, transparent); }
.rc-sec.rc-leave { opacity: 0; transition: opacity var(--dur-collapse) var(--ease-out); }
.rc .rc-tbl tr.rc-leave > td, .rc .rc-ln.rc-leave { opacity: 0; transition: opacity var(--dur-collapse) var(--ease-out); }
@media (prefers-reduced-motion: reduce) { .rc-sec.rc-shift, .rc-sec.rc-leave, .rc .rc-tbl tr.rc-leave > td, .rc .rc-ln.rc-leave { transition: none; } }
@media print {
  .rc-bar, .rc-marquee { display: none !important; }
  .rc [data-sel] { background: none !important; }
  .rc-head { cursor: auto; break-after: avoid; }
  .rc-sec[data-depth="1"] { border-block-start-color: var(--border-surface-strong); }
  .rc-tbl thead { display: table-header-group; } .rc-tbl tr { break-inside: avoid; }
  .rc-tbl tbody > tr:nth-child(2), .rc-tbl tbody > tr:last-child { break-before: avoid; } /* no row alone under a head or at a page's top */
  .rc-chart, .rc-cap, .rc-ln, .rc-st > li, .rc-kv, .rc-ex > div { break-inside: avoid; }
  .rc-cap, .rc-src, .rc-ex { break-before: avoid; }
  .rc-sec { padding-block: var(--space-3) var(--space-1_5); } .rc-tbl td { padding-block: var(--space-1); }
  .rc-sec[data-small] { break-inside: avoid; } /* a small section, a figure among them, keeps its head, body, caption and source on one page */
}
/* print(): the page is laid out at the paper's text width before the dialog opens, so the charts are drawn at that width; light, whatever the theme */
html.rc-printing, html.rc-printing body { background: var(--background); }
html.rc-printing, html.rc-printing.rc-printing body[data-kind], html.rc-printing.rc-printing body[data-kind] > main { height: auto; overflow: visible; display: block; } /* the whole document, not the page's scrolling box (a detail page's too) */
html.rc-printing .detail-bar { display: none; }
html.rc-printing .pcol { max-width: none; padding: 0; }
html.rc-printing .rc { width: var(--rc-paper-w); max-width: none; margin-inline: auto; }
`;

const sel = (state, key) => state.selected.includes(key);
const selAttr = (state, key) => attrs({ 'data-rc-key': key, 'data-sel': sel(state, key) || null });

/* a chart block: the kit chart from the props the page froze, without its frame, head or interactive chrome; a new window is a new drawing */
function chart(b) {
  const card = b.data?.card; if (!card?.chart) return '';
  const dim = new Set(b.view.dim), series = card.chart.series.map(s => (dim.has(s.key) ? { ...s, color: '--border-surface-strong' } : s)), ax = card.chart.timeAxis ?? {};
  return html`<div class="rc-chart" data-key="${JSON.stringify(['rc-chart', b.id, ax.from ?? 0, ax.to ?? 0])}">${chartCard.render({ ...card, bare: true, static: true, legendBelow: true, expand: undefined, info: undefined, chart: { ...card.chart, series, interactive: 'none' } })}</div>`;
}

/* a block's report form, from its frozen data and what the ops did to it */
function body(b, state, zone) {
  const v = b.view, d = b.data || {}, mark = new Set(v.mark), dim = new Set(v.dim), shown = new Set(itemsOf(b).map(x => x.id)), key = id => keyOf(b.id, id);
  const table = (all, rows) => { const columns = all.filter(c => !c.excerpt), ex = excerpt(all, rows); return html`<table class="rc-tbl"><colgroup>${columns.map(c => html`<col${attrs({ style: c.w ? `width:${c.w}` : null })}>`)}</colgroup><thead><tr>${columns.map(c => html`<th class="${cx(c.end && 'end')}">${c.label}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr class="${cx(mark.has(r.id) && 'rc-mark')}"${selAttr(state, key(r.id))}>${columns.map(c => { const val = r[c.id] ?? ''; return html`<td class="${cx(c.end && 'end', c.mono && 'mono', c.muted && 'muted', c.wrap && 'wrap')}"${attrs({ title: typeof val === 'object' ? null : String(val) || null })}>${val}</td>`; })}</tr>`)}</tbody></table>${ex.length ? html`<div class="rc-ex">${ex.map(x => html`<div class="${cx(mark.has(x.id) && 'rc-mark')}">${x.text}</div>`)}</div>` : ''}`; };
  if (b.kind === 'text') return html`<p class="rc-text">${d.text}</p>`;
  if (b.kind === 'statements') return html`<ul class="rc-st">${(d.items || []).filter(i => shown.has(i.id)).map(i => html`<li class="${cx(mark.has(i.id) && 'rc-mark')}"${selAttr(state, key(i.id))}><span class="rc-sl">${i.label ?? ''}</span><span>${i.text}${i.refs?.length ? html` <span class="rc-refs">${i.refs.map(r => (r && typeof r === 'object' ? ` (${r.label})` : `[${r}]`)).join('').trim()}</span>` : ''}</span></li>`)}</ul>`;
  if (b.kind === 'table') return table(d.columns, d.rows.filter(r => shown.has(r.id)));
  if (b.kind === 'summary') return html`<table class="rc-tbl rc-kvt"><colgroup><col style="width:30%"><col></colgroup><tbody>${(d.items || []).filter(i => shown.has(i.id)).map(i => html`<tr class="${cx(mark.has(i.id) && 'rc-mark')}"${selAttr(state, key(i.id))}><td>${i.label}</td><td${attrs({ title: typeof i.value === 'object' ? null : String(i.value ?? '') || null })}>${i.value ?? ''}</td></tr>`)}</tbody></table>`;
  if (b.kind === 'timeline') return table([{ id: 'at', label: t('report.at'), w: '19ch' }, { id: 'kind', label: t('report.kind'), muted: true, w: '20%' }, { id: 'title', label: t('report.title') }], (d.marks || []).filter(m => !dim.has(m.id)).map(m => ({ id: m.id, at: formatFull(m.at, zone || undefined), kind: m.tip?.kind ?? '', title: m.tip?.title ?? '' })));
  if (b.kind === 'log') {
    const lines = d.lines.filter(l => !v.out.includes(l.id)), w = String(lines.at(-1)?.n ?? 1).length + 1;
    return html`<div class="rc-log" style="--rc-ln-w:${w}ch">${foldLines(lines, v.around).map(x => (x.fold ? html`<div class="rc-ln rc-fold"><span class="rc-no">⋯</span><span class="rc-lt">${t('report.hidden', { count: x.fold.toLocaleString() })}</span></div>` : html`<div class="${cx('rc-ln', mark.has(x.line.id) && 'rc-mark')}"${selAttr(state, key(x.line.id))}><span class="rc-no">${x.line.n}</span><span class="rc-lt">${x.line.text}</span></div>`))}</div>`;
  }
  if (b.kind === 'chart') return chart(b);
  if (b.kind === 'flow') return flowGraph.render(d.graph);
  return '';
}

/* a section that fits well inside a page: printed whole (a figure always, with its caption and source) */
const SMALL = 12;
const small = b => b.kind === 'chart' || b.kind === 'text' || b.kind === 'flow' || itemsOf(b).length <= SMALL;

function section(b, state, p, n) {
  const s = b.snapshot, notes = Object.entries(b.view.notes || {}).filter(([, text]) => text);
  const src = s ? html`<div class="rc-src">${t('report.source')} ${s.source}${s.query ? html` · <code>${s.query}</code>` : ''}${s.at != null ? ` · ${t('report.collected')} ${formatFull(s.at, p.zone || undefined)}` : ''}</div>` : '';
  const caption = [...[b.caption ?? []].flat(), ...notes.map(([, text]) => text)].filter(Boolean);
  return html`<section class="rc-sec" data-rc-block="${b.id}" data-depth="${b.sub ? 2 : 1}" data-key="${JSON.stringify(['rc-block', b.id])}"${attrs({ 'data-small': small(b) || null })}${selAttr(state, b.id)}><div class="rc-head"><span class="rc-n">${n}</span><span class="rc-t">${b.title || b.id}</span></div>${body(b, state, p.zone)}${caption.map(c => html`<div class="rc-cap">${c}</div>`)}${src}</section>`;
}

/** The bar: the page's tools, or while something is selected its count and actions; undo; then the page's end (a pane's close). One row, one height. */
export function toolbar(p) {
  const state = p.report, n = state.selected.length;
  const acts = n ? html`<span class="rc-count">${t('report.selected', { count: n })}</span>${button.render({ label: t('report.delete'), icon: 'trash', variant: 'ghost', size: 'sm', round: true, action: p.action, arg: { type: 'delete' } })}${button.render({ label: t('report.refer'), icon: 'ai', variant: 'ghost', size: 'sm', round: true, action: p.action, arg: { type: 'refer' } })}` : '';
  return html`<div class="rc-bar" role="toolbar"${attrs({ 'aria-label': t('report.tools') })}>${n ? acts : p.tools ?? ''}<span class="rc-end">${button.render({ label: t('report.undo'), icon: 'arrow-undo-up', variant: 'ghost', size: 'sm', round: true, disabled: !p.canUndo, action: p.action, arg: { type: 'undo' } })}${p.end ?? ''}</span></div>`;
}

/** @param {{id: string, report: object, canUndo?: boolean, action: string, head?: {title: string, rows: {label: string, value: any}[]}, tools?: any, end?: any, bar?: boolean, zone?: string}} p */
export function render(p) {
  const state = p.report, n = state.selected.length;
  const head = p.head ? html`<header class="rc-doc"><h1>${p.head.title}</h1><dl class="rc-kv">${p.head.rows.map(r => html`<div><dt>${r.label}</dt><dd${attrs({ title: typeof r.value === 'object' ? null : String(r.value ?? '') })}>${r.value}</dd></div>`)}</dl></header>` : '';
  return html`<section class="rc" data-c="report-canvas" data-rc="${p.id}"${attrs({ 'data-rc-action': p.action, 'data-rc-count': n })}>${p.bar === false ? '' : toolbar(p)}${head}${(nums => state.blocks.map(b => section(b, state, p, nums.get(b.id))))(numbers(state))}</section>`;
}

/** Does what a press on the canvas asks: payload is the emitted { type, ... } (or { arg }). Returns { state, refer?, op? } */
export function handle(report, payload) {
  const a = payload?.arg?.type ? payload.arg : payload, s = report.state;
  if (a?.type === 'set') return { state: report.select(st => ({ ...st, selected: [...new Set(a.keys || [])] })) };
  if (a?.type === 'add') return { state: report.select(st => (a.keys || []).reduce((x, k) => toggle(x, k), st)) };
  if (a?.type === 'clear') return { state: report.select(st => ({ ...st, selected: [] })) };
  if (a?.type === 'refer') return { state: s, refer: selectedItems(s) };
  if (a?.type === 'undo') return { state: report.undo() };
  if (a?.type === 'move') { const op = { op: 'move', block: a.block, to: a.to }; return { state: report.apply(op), op }; }
  if (a?.type === 'delete') { if (!s.selected.length) return { state: s }; const op = deleteSelectedOp(s); return { state: report.apply(op), op }; }
  return { state: s };
}

/** The print sheet of a report: A4, the document's title as the running head and the page number at the foot of every page */
export const pageSheet = title => `@page { size: A4; margin: 18mm 16mm; @top-left { content: ${JSON.stringify(String(title ?? ''))}; font-size: 8pt; } @bottom-right { content: counter(page); font-size: 8pt; } }`;

/**
 * Prints the report as a document (a PDF): the light theme and the paper's width first (layout() lets the page redraw its charts at that width),
 * then the print dialog; afterwards the theme and the layout come back. Returns the function that puts them back (also run after printing).
 */
export function print(doc, { title, layout, delay = 900 } = {}) {
  const win = doc.defaultView, root = doc.documentElement, theme = root.dataset.theme, sheet = doc.createElement('style');
  sheet.textContent = pageSheet(title); doc.head.appendChild(sheet);
  root.dataset.theme = 'light'; root.classList.add('rc-printing'); layout?.();
  const done = () => { root.classList.remove('rc-printing'); if (theme) root.dataset.theme = theme; else delete root.dataset.theme; sheet.remove(); win.removeEventListener('afterprint', done); layout?.(); };
  win.addEventListener('afterprint', done);
  win.setTimeout(() => win.print(), delay);
  return done;
}

const reduced = win => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const msOf = (win, name) => parseFloat(win.getComputedStyle(win.document.documentElement).getPropertyValue(name)) || 0;
const sleep = (win, ms) => new Promise(r => win.setTimeout(r, ms));

/* the elements an op takes away: rows and lines that leave, or whole sections */
function leaving(root, state, op) {
  const sec = id => root.querySelector(`[data-rc-block="${CSS.escape(id)}"]`);
  const items = (block, ids) => ids.map(id => sec(block)?.querySelector(`[data-rc-key="${CSS.escape(keyOf(block, id))}"]`)).filter(Boolean);
  if (op.op === 'filter') { const b = state.blocks.find(x => x.id === op.block); if (!b || b.kind === 'chart' || b.kind === 'timeline') return []; const ids = itemsOf(b).map(x => x.id); return items(op.block, op.keep ? ids.filter(id => !op.keep.includes(id)) : op.drop || []); }
  if (op.op === 'remove') return [...[op.block, ...(op.blocks || [])].filter(x => x != null).map(sec).filter(Boolean), ...(op.items || []).flatMap(x => items(x.block, [x.id]))];
  return [];
}

/** The motion before an op: a row, line or section that leaves fades; the redraw after the op closes the room. Resolves when it is done */
export async function play(root, state, op) {
  const win = root.ownerDocument.defaultView, els = leaving(root, state, op);
  if (!els.length || reduced(win)) return;
  els.forEach(el => el.classList.add('rc-leave'));
  await sleep(win, msOf(win, '--dur-collapse'));
}

/** Ops applied one by one, each with its motion and a short pause (a streamed report): draw() redraws the page after each */
export async function runOps(root, report, ops, { delay = 300, draw } = {}) {
  const win = root.ownerDocument.defaultView;
  for (const op of ops) { await play(root, report.state, op); report.apply(op); draw?.(); await sleep(win, reduced(win) ? 0 : delay); }
}

const hits = (a, r) => a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top;
/** The keys a marquee rectangle takes in a canvas: the items it touches; a section whose head it crosses, or with nothing selectable under it, whole */
export function marqueeKeys(rc, r) {
  const keys = [];
  for (const sec of rc.querySelectorAll(':scope > .rc-sec')) {
    if (!hits(sec.getBoundingClientRect(), r)) continue;
    const head = sec.querySelector(':scope > .rc-head'), items = [...sec.querySelectorAll('[data-rc-key]')].filter(el => hits(el.getBoundingClientRect(), r));
    if ((head && hits(head.getBoundingClientRect(), r)) || !items.length) keys.push(sec.dataset.rcKey);
    else keys.push(...items.map(el => el.dataset.rcKey));
  }
  return keys;
}

/* marquee selection, press selection and moving a section by its head; Escape clears, Delete or Backspace deletes */
export function attach(root, ctx) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  let drag = null;
  const rcOf = el => el?.closest?.('.rc[data-rc-action]');
  const emit = (rc, arg) => ctx.emit(rc.dataset.rcAction, arg);
  const paint = (rc, keys) => { const on = new Set(keys); for (const el of rc.querySelectorAll('[data-rc-key]')) el.toggleAttribute('data-sel', on.has(el.dataset.rcKey)); };
  const secs = rc => [...rc.querySelectorAll(':scope > .rc-sec')];
  root.addEventListener('pointerdown', e => {
    const rc = rcOf(e.target); if (!rc || e.button !== 0 || e.target.closest('button, a, input, textarea, .rc-bar')) return;
    const head = e.target.closest('.rc-head'), sec = e.target.closest('.rc-sec');
    drag = { rc, x: e.clientX, y: e.clientY, head: head && sec, sec, add: e.shiftKey || e.metaKey || e.ctrlKey, moved: false, base: [...rc.querySelectorAll('[data-rc-key][data-sel]')].map(el => el.dataset.rcKey) };
    if (drag.add) e.preventDefault(); /* Shift extends the selection of things, not of words */
  }, true);
  win.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; drag.rc.classList.add('dragging'); win.getSelection?.()?.removeAllRanges(); }
    if (drag.head) {
      /* moving a section: it follows the pointer; the sections it passes step aside by its height */
      const list = secs(drag.rc), from = list.indexOf(drag.head), h = drag.head.getBoundingClientRect().height + parseFloat(win.getComputedStyle(drag.rc).rowGap || 0);
      drag.head.classList.add('rc-moving'); drag.head.style.transform = `translateY(${dy}px)`;
      const mid = e.clientY; /* the pointer, not the card's middle: a tall section goes where it is pointed */
      let to = from; list.forEach((s, i) => { if (s === drag.head) return; const r = s.getBoundingClientRect(), c = r.top + r.height / 2 - (s.style.transform ? parseFloat(/-?[\d.]+/.exec(s.style.transform)?.[0] || 0) : 0); if (i < from && mid < c) to = Math.min(to, i); if (i > from && mid > c) to = Math.max(to, i); });
      list.forEach((s, i) => { if (s === drag.head) return; s.classList.add('rc-shift'); s.style.transform = i >= to && i < from ? `translateY(${h}px)` : i <= to && i > from ? `translateY(${-h}px)` : ''; });
      drag.to = to; drag.from = from; return;
    }
    const r = { left: Math.min(drag.x, e.clientX), right: Math.max(drag.x, e.clientX), top: Math.min(drag.y, e.clientY), bottom: Math.max(drag.y, e.clientY) };
    if (!drag.box) { drag.box = doc.createElement('div'); drag.box.className = 'rc-marquee'; doc.body.appendChild(drag.box); }
    Object.assign(drag.box.style, { left: r.left + 'px', top: r.top + 'px', width: r.right - r.left + 'px', height: r.bottom - r.top + 'px' });
    const got = marqueeKeys(drag.rc, r); drag.keys = drag.add ? [...new Set([...drag.base, ...got])] : got; paint(drag.rc, drag.keys);
    e.preventDefault();
  }, { passive: false });
  win.addEventListener('pointerup', e => {
    const d = drag; drag = null; if (!d) return;
    d.rc.classList.remove('dragging'); d.box?.remove();
    if (d.head && d.moved) { for (const s of secs(d.rc)) { s.style.transform = ''; s.classList.remove('rc-moving', 'rc-shift'); } if (d.to != null && d.to !== d.from) emit(d.rc, { type: 'move', block: d.head.dataset.rcBlock, to: d.to }); return; }
    if (d.moved) { emit(d.rc, { type: 'set', keys: d.keys || [] }); return; }
    if (!d.add && win.getSelection?.()?.toString()) return; /* a press that selected words to copy keeps them */
    const item = e.target.closest?.('.rc [data-rc-key]'), key = item?.dataset.rcKey;
    if (!key) { if (d.base.length) emit(d.rc, { type: 'clear' }); return; }
    emit(d.rc, d.add ? { type: 'add', keys: [key] } : { type: 'set', keys: [key] });
  });
  doc.addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, [contenteditable="true"]') || doc.querySelector('.dlg-layer, .menu')) return;
    const rc = [...doc.querySelectorAll('.rc[data-rc-action]')].find(x => Number(x.dataset.rcCount) > 0); if (!rc) return;
    if (e.key === 'Escape') { e.preventDefault(); emit(rc, { type: 'clear' }); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); emit(rc, { type: 'delete' }); }
  });
}
