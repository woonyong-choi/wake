/*
 * Data table (shadcn data-table look): header 40 muted 14/500, rows 40 single line, light rules between rows, hover background.
 * Every column aligns left (as the command line prints a table). A column has one kind and a cell one meaning (kind):
 *   'text' (default) words; 'number' a figure only: tabular digits, bold, a warning figure takes a tone colour (tone(row)) and never an icon;
 *   'status' a state: its status icon, tone and the original word; 'time' a time or an age: muted, tabular; 'mono' an original value (hash, ID)
 *   in the code face, its header in the same face as every other header. A figure and a state that both matter are two columns (Ready | Status).
 *   value / time / mono: true are the older names of 'number' / 'time' / 'mono'. Cells are one line with ellipsis.
 * A name leads with its kind icon (lead) in regular weight. A page puts a table inside a summary-bar card whose head is its counts.
 * Sortable headers (sortable), row selection cells (selectable), row press (action). Columns without a width share the rest; when they
 * would get narrower than --dt-flex-min, optional columns hide from the right, and only then the table scrolls sideways. A clipped table (clip) does
 * not scroll for that: once the optional columns are hidden, a short text column gives back its widening and the flexible columns narrow (ellipsis,
 * full text on hover) down to --space-10; it scrolls only when its sized columns alone are wider than its room.
 * The first column (the row's identity) and a column with a cell that carries a state that is not ok never hide.
 * A short column (fit: a state, a time, a figure; figures and times are short by default) never cuts its header or a value: it widens to its widest content
 * before anything else gives way, so the long text columns (names, images, messages) are the ones that shrink.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import * as checkbox from './checkbox.js';
import * as iconButton from './icon-button.js';

export const name = 'data-table';

export const css = `
.dt-wrap { overflow-x: auto; margin-inline: calc(-1 * var(--space-2)); } /* the table reaches past the content line by its end cells' padding (inside the scroll box), so the first and last words sit on the content line; the head, the rules and a lit row's ground start and end on that line too */
table.dt { width: 100%; min-width: var(--dt-min, 0px); border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: var(--text-sm); } /* each cell draws its own rule, so the end cells can keep theirs on the content line */
.dt th { height: var(--dt-row-h); text-align: left; font-weight: var(--weight-medium); color: var(--muted-foreground); padding: 0 var(--space-2); border-bottom: var(--line) solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dt td { height: var(--dt-row-h); padding: 0 var(--space-2); border-bottom: var(--line) solid var(--border-half); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dt-grid .dt td { color: var(--foreground); }
.dt-grid .dt td.muted { color: var(--muted-foreground); }
.dt-grid .dt tbody tr:last-child td { border-bottom: 0; }
.dt :is(th, td):first-child { border-image: linear-gradient(to right, transparent var(--space-2), var(--dt-rule) 0) 1; } /* the first column's words start on the card's content line (the page head and the sections start there too), and so does its rule */
.dt :is(th, td):is(:last-child, [data-end]) { border-image: linear-gradient(to left, transparent var(--space-2), var(--dt-rule) 0) 1; } /* [data-end]: the last shown cell when the columns after it are folded (fit marks it), so the rule ends on the content line like the card's head rule */
.dt th { --dt-rule: var(--border); } .dt td { --dt-rule: var(--border-half); }
.dt td.num { font-variant-numeric: tabular-nums; }
.dt td.num[data-tone="warn"] { color: var(--warning-content); } .dt td.num[data-tone="error"] { color: var(--destructive-content); } /* a figure that is itself the warning: its tone, no icon */
.dt td.mono { font-size: var(--text-code); }
.dt .muted { color: var(--muted-foreground); }
.dt .strong { font-weight: var(--weight-medium); }
.dt td.val { font-weight: var(--weight-reading); color: var(--foreground); } /* a figure: tabular, bold, in the words' colour */
.dt td.tm { color: var(--muted-foreground); font-variant-numeric: tabular-nums; } /* a time or an age: quiet, its digits in one column */
.dt-lead { display: flex; align-items: center; gap: var(--space-2); min-width: 0; } .dt-lead > * { flex: none; } .dt-lead > .dt-lead-t { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dt-lead > .wi { color: var(--muted-foreground); }
.dt-dot { flex: none; width: var(--space-2); height: var(--space-2); border-radius: var(--r-pill); background: var(--dt-dot); }
.dt td .sti-text { font-size: inherit; vertical-align: middle; } /* a state in a cell is the cell's size, on the line of the words beside it */
.dt tbody td { background-color: var(--dt-row-bg, transparent); background-clip: padding-box; transition: background-color var(--dur-fast) var(--ease-standard); } /* a lit row's ground stops above its own rule (the rule stays one line on the row's edge) */
.dt tbody td:first-child { background-color: transparent; background-image: linear-gradient(to right, transparent var(--space-2), var(--dt-row-bg, transparent) 0); }
.dt tbody td:is(:last-child, [data-end]) { background-color: transparent; background-image: linear-gradient(to left, transparent var(--space-2), var(--dt-row-bg, transparent) 0); }
.dt tbody td:first-child:is(:last-child, [data-end]) { background-image: linear-gradient(to right, transparent var(--space-2), var(--dt-row-bg, transparent) var(--space-2) calc(100% - var(--space-2)), transparent 0); } /* the ground starts and ends where the head and the rules do: on the content line, not in the room past it */
.dt tbody tr:hover, .dt tbody tr:focus-within { --dt-row-bg: var(--surface-tertiary); }
:root[data-theme="light"] .dt tbody tr:hover, :root[data-theme="light"] .dt tbody tr:focus-within { --dt-row-bg: var(--row-hover); }
.dt tbody tr[aria-selected="true"] { --dt-row-bg: var(--secondary); }
.dt tbody tr[data-action] { cursor: default; }
.dt tbody tr[data-action]:active { --dt-row-bg: var(--secondary); }
.dt td.dt-act { width: var(--dt-action-w); padding-inline: 0; text-align: end; overflow: visible; } .dt td.dt-act:last-child { padding-inline-end: var(--space-2); }
.dt td.dt-act > .reveal { display: inline-flex; vertical-align: middle; margin-block: calc(-1 * var(--space-0_5)); } /* the button sits in the row's height: a row with it is as tall as one without */
.dt-two .dt td { height: var(--dt-row-sub-h); } /* a table with a second line keeps every row the same height, with or without it */
.dt .dt-sub { display: block; font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; }
.dt-open { all: unset; display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; border-radius: var(--r-mark); }
.dt-open:hover { color: var(--foreground); }
.dt-open:active { color: var(--muted-foreground); }
.dt-open:disabled { opacity: .5; }
.dt-open:focus-visible { box-shadow: 0 0 0 var(--focus-w) var(--focus); }
.dt td[tabindex]:focus-visible { box-shadow: inset 0 0 0 var(--focus-w) var(--focus); }
.dt .sel-col { width: var(--dt-check-col); } .dt col.sel-col { width: calc(var(--dt-check-col) + var(--space-2)); } /* the first column: its room past the content line */
.dt-sort { display: inline-flex; align-items: center; gap: var(--space-1); transition: color var(--dur-fast) var(--ease-standard); }
.dt-sort:hover { color: var(--foreground); }
.dt-filter { justify-content: space-between; width: 100%; min-width: 0; text-align: inherit; }
.dt-filter .wi { flex-shrink: 0; }
.dt-filter.active { color: var(--foreground); }
.dt col[data-opt="1"] { display: var(--dt-o1, table-column); } .dt :is(th, td)[data-opt="1"] { display: var(--dt-o1, table-cell); }
.dt col[data-opt="2"] { display: var(--dt-o2, table-column); } .dt :is(th, td)[data-opt="2"] { display: var(--dt-o2, table-cell); }
.dt col[data-opt="3"] { display: var(--dt-o3, table-column); } .dt :is(th, td)[data-opt="3"] { display: var(--dt-o3, table-cell); }
.dt col[data-opt="4"] { display: var(--dt-o4, table-column); } .dt :is(th, td)[data-opt="4"] { display: var(--dt-o4, table-cell); }
.dt col[data-opt="5"] { display: var(--dt-o5, table-column); } .dt :is(th, td)[data-opt="5"] { display: var(--dt-o5, table-cell); }
.dt col[data-opt="6"] { display: var(--dt-o6, table-column); } .dt :is(th, td)[data-opt="6"] { display: var(--dt-o6, table-cell); }
.dt col[data-opt="7"] { display: var(--dt-o7, table-column); } .dt :is(th, td)[data-opt="7"] { display: var(--dt-o7, table-cell); }
.dt col[data-opt="8"] { display: var(--dt-o8, table-column); } .dt :is(th, td)[data-opt="8"] { display: var(--dt-o8, table-cell); }
`;

/**
 * @param {{columns: {id: string, label: string, align?: 'left'|'center'|'right', width?: string, mono?: boolean, muted?: boolean, strong?: boolean, value?: boolean (a figure: right, tabular, bold), time?: boolean (a time or an age: muted, tabular), lead?: (row) => {dot?: string, icon?: string} (a name's leading mark: a colour token's dot or a kind icon), optional?: boolean | number (a number folds in that order, 1 first, ahead of the plain optional columns), sortable?: boolean, filter?: {menu: string, active?: boolean}, cell?: (row) => any}[],
 *          (column also: link?: (row) => address for the first cell's press, tip?: (row) => full text shown when the cell is clipped, fit?: boolean (a short column that widens to its content; default for value and time columns; a status column also narrows to it: an icon-only state takes an icon's width), trim?: 'middle' (a long generated name keeps its start and its end in its room), hint?: (row) => words shown on hover always),
 *          rows: object[], rowKey: string, activeKey?: the key of the row whose detail is open beside the table (it stays marked), (a column may carry sub(row): a muted second line under its value, or rowButton { icon, tip, action }: a row's own icon button, shown on hover), gridLines?: boolean, reveal?: boolean (plain text cells show their full text when clipped), missing?: string, minWidth?: string (css length, the table's floor before it scrolls), clip?: boolean (never scrolls sideways: once the optional columns are hidden the flexible columns narrow and cut their text, which reveal shows on hover), selectable?: boolean, selected?: string[], rowAction?: string, sort?: {id: string, dir: 'asc'|'desc'}, sortAction?: string,
 *          selection?: {label: string, rowLabel: (row) => string, allArg?: any, disabled?: boolean, action?: string|null, allAction?: string|null (null: no action, the page's own code reads the press), arg?: (key) => any},
 *          selectionSide?: 'start'|'end' (the check column first, the default, or last), rowClass?: (row) => string (classes a row carries: its marks)}} p
 */
const RANKS = 8; /* how many optional columns can give way, from the right */
export function render(p) {
  const selection = p.selection === undefined ? null : selectionState(p);
  /* selectionSide 'end': the check column is the last one (a list where the check is a choice made after reading the row) */
  const end = p.selectionSide === 'end';
  const headCheck = html`<th class="sel-col">${checkbox.render(selection ? { interactive: true, checked: selection.checked, indeterminate: selection.indeterminate, disabled: selection.disabled, label: p.selection.label, action: 'allAction' in p.selection ? p.selection.allAction : 'kit.table.select-all', arg: p.selection.allArg } : { action: 'kit.table.select-all' })}</th>`;
  const rowCheck = (key, sel, rowIndex) => html`<td class="sel-col">${checkbox.render(selection ? { interactive: true, checked: !!sel, label: selection.labels[rowIndex], disabled: !!p.selection.disabled, action: 'action' in p.selection ? p.selection.action : 'kit.table.select', arg: p.selection.arg ? p.selection.arg(key) : key } : { checked: sel, action: 'kit.table.select', arg: key })}</td>`;
  /* the first column is the row's identity (its name): it never hides, whatever its column says */
  /* optional columns fold from the right; a numbered one (optional: 1, 2, …) folds in that order ahead of the plain ones */
  const order = c => (typeof c.optional === 'number' ? c.optional : Infinity);
  const opt = p.columns.filter((c, i) => c.optional && i > 0).reverse().sort((a, b) => (order(a) - order(b)) || 0).slice(0, RANKS), rank = c => opt.includes(c) ? opt.indexOf(c) + 1 : null;
  /* a column's kind (older value / time / mono flags name the same kinds); the header only takes the kind's width, never its face */
  const kindOf = c => c.kind || (c.value ? 'number' : c.time ? 'time' : c.mono ? 'mono' : 'text');
  const cls = (c, cell = true) => { const k = kindOf(c); return cx(cell && k === 'number' && 'num val', cell && k === 'time' && 'tm', cell && k === 'mono' && 'mono', cell && c.muted && 'muted', cell && c.strong && 'strong'); };
  return html`<div class="${cx('dt-host', p.clip && 'dt-clip', p.gridLines && 'dt-grid', p.columns.some(c => c.sub) && 'dt-two')}" data-c="data-table"><div class="dt-wrap" data-scroll="x"><table class="dt"${attrs({ style: p.minWidth ? `--dt-min:${p.minWidth}` : null })}>
    <colgroup>${p.selectable && !end ? html`<col class="sel-col">` : ''}${p.columns.map((c, i) => html`<col${attrs({ style: c.width ? `width:${(i === 0 && (!p.selectable || end)) || (i === p.columns.length - 1 && !end) ? `calc(${c.width} + var(--space-2))` : c.width}` : 'width:auto', 'data-opt': rank(c), 'data-flex': c.width ? null : '' })}>`)}${p.selectable && end ? html`<col class="sel-col">` : ''}</colgroup>
    <thead><tr>${p.selectable && !end ? headCheck : ''}${p.columns.map(c => html`<th class="${cls(c, false)}"${attrs({ 'data-opt': rank(c), 'data-flex': c.width ? null : '', 'data-fit': c.width && (c.fit ?? ['number', 'time', 'status'].includes(kindOf(c))) ? kindOf(c) : null, 'aria-sort': c.sortable && p.sort?.id === c.id ? (p.sort.dir === 'asc' ? 'ascending' : 'descending') : null })}>${c.filter ? html`<button type="button" class="${cx('dt-sort dt-filter', c.filter.active && 'active')}" ${attrs({ 'data-menu': c.filter.menu, 'data-menu-arg': c.id })} aria-haspopup="menu" aria-expanded="false">${c.label}${icon(c.filter.active ? 'filter' : 'chevron-down-small', 'xs')}</button>` : c.sortable ? html`<button class="dt-sort"${attrs({ 'data-action': p.sortAction, 'data-arg': c.id })}>${c.label}${icon(p.sort?.id === c.id ? (p.sort.dir === 'asc' ? 'chevron-up-small' : 'chevron-down-small') : 'chevrons-up-down', 'xs')}</button>` : c.label}</th>`)}${p.selectable && end ? headCheck : ''}</tr></thead>
    <tbody>${p.rows.map((r, rowIndex) => {
      const key = r[p.rowKey];
      const sel = p.selected?.includes(key);
      return html`<tr${attrs({ class: cx(p.columns.some(c => c.rowButton) && 'reveal-host', p.rowClass?.(r)) || null, 'data-action': p.rowAction, 'data-arg': p.rowAction ? key : null, 'aria-selected': p.selectable ? String(!!sel) : p.activeKey != null ? String(key === p.activeKey) : null, 'data-key': selection ? JSON.stringify(['table-row', key]) : null })}>${p.selectable && !end ? rowCheck(key, sel, rowIndex) : ''}${p.columns.map((c, i) => { let v = c.cell ? c.cell(r) : r[c.id];
        /* missing values (null, undefined, '') show p.missing; 0, false and any other value are kept as they are */
        const empty = p.missing != null && (v == null || v === ''); if (empty) v = p.missing;
        /* c.sub(row): a muted second line under the value (a name's scope, a status's count) */
        const sub = !empty && c.sub ? c.sub(r) : ''; if (sub) v = html`${v}<small class="dt-sub">${sub}</small>`;
        /* c.rowButton: an icon button that shows while the row is pointed at or holds focus (a row's own action; the row press stays the open) */
        if (c.rowButton) return html`<td class="dt-act">${html`<span class="reveal">${iconButton.render({ icon: c.rowButton.icon, size: 'sm', tip: c.rowButton.tip, action: c.rowButton.action, arg: key })}</span>`}</td>`;
        /* plain text values reveal the whole text when clipped (tooltip overflow path); c.tip gives the text for rich cells */
        const tip = empty ? '' : c.tip ? c.tip(r) : p.reveal && (typeof v === 'string' || typeof v === 'number') ? String(v) : '';
        let tipAttrs = !empty && c.hint ? { 'data-tip': c.hint(r) } : tip ? { 'data-tip': tip, 'data-tip-overflow': '' } : {}; /* c.hint(row): words shown on hover whether the cell is cut or not (a second time folded with its column) */
        /* c.lead(row): a name's leading mark; the words after it are what is cut, so they carry the full text */
        const mark = !empty && c.lead ? lead(c.lead(r)) : '';
        /* c.trim 'middle': a generated name too long for its column keeps its start and its end (checkout-api-58…-pgbhx): fit() cuts its middle to the room */
        const trim = !empty && c.trim === 'middle' && (typeof v === 'string' || typeof v === 'number') ? { 'data-trim': '' } : {};
        if (mark) { v = html`<span class="dt-lead">${mark}<span class="dt-lead-t"${attrs({ ...tipAttrs, ...trim })}>${v}</span></span>`; tipAttrs = {}; }
        else if (trim['data-trim'] !== undefined) v = html`<span class="dt-trim" data-trim>${v}</span>`;
        /* the first cell of a pressable row is its button: keyboard focus and the accessible press (the whole row stays pressable).
           c.link(row) gives its address (kit.navigate), so the press is bound to the row's own address */
        const address = i === 0 && c.link ? c.link(r) : '';
        const button = i === 0 && (p.rowAction || address);
        return html`<td class="${cx(cls(c), empty && 'muted')}"${attrs({ 'data-opt': rank(c), 'data-tone': !empty && kindOf(c) === 'number' && c.tone ? c.tone(r) || null : null, ...(button ? {} : tipAttrs) })}>${button ? html`<button type="button" class="dt-open"${attrs({ ...(address ? { 'data-action': 'kit.navigate', 'data-arg': { address } } : { 'data-action': p.rowAction, 'data-arg': key }), ...tipAttrs })}>${v}</button>` : v}</td>`; })}${p.selectable && end ? rowCheck(key, sel, rowIndex) : ''}</tr>`;
    })}${!p.rows.length && p.keepEmptyRow ? (p.emptyText ? html`<tr data-c="data-table-empty"><td class="muted" role="status" colspan="${p.columns.length + Number(!!p.selectable)}">${p.emptyText}</td></tr>` : html`<tr aria-hidden="true"><td colspan="${p.columns.length + Number(!!p.selectable)}">&nbsp;</td></tr>`) : ''}</tbody>
  </table></div></div>`;
}

/** A name's leading mark: { dot: a colour token } is a small round mark, { icon } a kind icon (muted). Also for a cell that draws its own button around a name. */
export const lead = m => m?.dot ? html`<i class="dt-dot" style="--dt-dot:var(${m.dot})"></i>` : m?.icon ? icon(m.icon) : '';

function selectionState(p) {
  const selection = p.selection;
  if (!p.selectable || !selection || typeof selection.label !== 'string' || !selection.label.trim() || typeof selection.rowLabel !== 'function' || (selection.disabled !== undefined && typeof selection.disabled !== 'boolean')) throw new TypeError('invalid table selection');
  if (p.selected !== undefined && !Array.isArray(p.selected)) throw new TypeError('invalid selected rows');
  const keys = new Set(), selected = new Set(p.selected || []), labels = [];
  let count = 0;
  for (const row of p.rows) {
    const key = row[p.rowKey];
    if (!((typeof key === 'string' && key.length) || (typeof key === 'number' && Number.isFinite(key)))) throw new TypeError('invalid table row key');
    if (keys.has(key)) throw new RangeError('duplicate table row key');
    keys.add(key);
    const label = selection.rowLabel(row);
    if (typeof label !== 'string' || !label.trim()) throw new TypeError('table selection requires row labels');
    labels.push(label); if (selected.has(key)) count++;
  }
  return { labels, checked: p.rows.length > 0 && count === p.rows.length, indeterminate: count > 0 && count < p.rows.length, disabled: !p.rows.length || !!selection.disabled };
}

/* a length a custom property holds, in pixels: a var() is already resolved in its computed value, a calc() is not, so that one is measured on a probe */
function lengthOf(host, name) {
  const raw = getComputedStyle(host).getPropertyValue(name).trim();
  if (/^-?[\d.]+px$/.test(raw)) return parseFloat(raw);
  if (!raw) return 0;
  if (measured.has(raw)) return measured.get(raw); /* a token sum measures the same every time: one probe (a forced layout) per value */
  const probe = document.createElement('i');
  probe.dataset.dtProbe = ''; /* the table's own watcher passes over it: measuring is not a change that asks for another fit (that ran on every frame) */
  probe.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`;
  host.append(probe); const w = probe.getBoundingClientRect().width; probe.remove();
  measured.set(raw, w);
  return w;
}
const measured = new Map();

/* fit: keep the flexible columns at least --dt-flex-min wide by hiding optional columns from the right, then let the table scroll (a clipped table never scrolls).
   One layout: it clears its own earlier choices, reads every width once, works the folds out from those numbers (a fixed table gives the flexible
   columns an equal share of what the sized columns leave), then writes everything. Reads and writes never interleave (each write-then-read is a
   forced layout of the whole page). Returns the host's width it fitted (the resize watcher skips a resize that did not change it). */
function fit(host) {
  const table = host.querySelector('table.dt'); if (!table) return null;
  const min = lengthOf(host, '--dt-flex-min'), clip = host.classList.contains('dt-clip');
  const heads = [...(table.tHead?.rows[0]?.cells ?? [])], cols = [...table.querySelectorAll('colgroup > col')], rows = [...(table.tBodies[0]?.rows ?? [])];
  /* write: clear the folds and the floor of the last fit */
  for (let i = 1; i <= RANKS; i++) host.style.removeProperty(`--dt-o${i}`);
  table.style.minWidth = '';
  /* read (one layout): hidden headers (display none, not optional) have no boxes; a real zero width still counts */
  /* the room the table has is its scroll box's (the table itself may stand wider than that while its columns overflow it) */
  const hostWidth = host.getBoundingClientRect().width, tableWidth = table.parentElement.clientWidth;
  if (!tableWidth || !table.offsetWidth) return hostWidth; /* not laid out (a hidden pane): nothing to measure */
  const col = heads.map(th => ({ th, k: th.cellIndex, shown: th.getClientRects().length > 0, w: th.offsetWidth, flex: th.hasAttribute('data-flex'), opt: Number(th.dataset.opt) || 0, fit: th.dataset.fit ?? null }));
  /* a short column takes the width of its widest header or value (what an inner box cuts counts too): it is never the one that is cut.
     The width the cell's words take when nothing cuts them: the laid-out run of its contents plus its own padding */
  const range = table.ownerDocument.createRange();
  const cut = el => { range.selectNodeContents(el); const cs = getComputedStyle(el); return range.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); };
  const width = new Map();
  for (const c of col) {
    if (c.fit == null || !c.shown || !cols[c.k]) continue;
    if (cols[c.k].dataset.w0 === undefined) c.w0 = c.w; else c.w0 = Number(cols[c.k].dataset.w0); /* the declared width, which a clipped table gives back to */
    const need = Math.max(cut(c.th), ...rows.map(tr => tr.cells[c.k] && tr.cells[c.k].colSpan === 1 ? cut(tr.cells[c.k]) : 0));
    /* a pixel more than the run: the last glyph is never cut. A state column is as wide as its widest state (an icon alone takes an icon's room) */
    const state = c.fit === 'status' || (rows.some(tr => tr.cells[c.k]?.firstElementChild?.dataset.c === 'status-icon') && rows.every(tr => { const td = tr.cells[c.k]; return !td || td.colSpan !== 1 || (td.childElementCount === 0 ? !td.textContent.trim() : td.childElementCount === 1 && td.firstElementChild.dataset.c === 'status-icon'); }));
    if (need > c.w - .5 || (state && need + 1 < c.w - .5)) { c.w = Math.ceil(need) + 1; width.set(c.k, c.w); }
  }
  /* the names cut in their middle: their whole text, where their words start in the cell and what the cell keeps after them, and their font */
  const trims = [...table.querySelectorAll('tbody [data-trim]')].map(el => {
    const td = el.closest('td'), full = el.dataset.trimmed !== undefined && el.textContent === el.dataset.trimmed ? el.dataset.full : el.textContent;
    const box = td.getBoundingClientRect(), cs = getComputedStyle(td), open = el.closest('.dt-open');
    return { el, k: td.cellIndex, full, at: el.getBoundingClientRect().left - box.left, end: parseFloat(cs.paddingRight) + (open ? parseFloat(getComputedStyle(open).paddingRight) : 0), ...fontOf(getComputedStyle(el)) };
  });
  const tail = trims.length ? Math.max(1, Math.round(parseFloat(getComputedStyle(table.ownerDocument.documentElement).getPropertyValue('--trim-tail')) || 6)) : 0;
  /* work the folds out: the flexible columns share what the sized ones leave */
  let room = tableWidth - col.filter(c => c.shown && !c.flex).reduce((n, c) => n + c.w, 0), flexN = col.filter(c => c.shown && c.flex).length;
  const flex = () => (flexN ? room / flexN : Infinity), hidden = new Set();
  /* a column whose cells carry a state that is not ok (a warn/danger tone, a warn/error status) never hides: the plain optional columns go first */
  const holdsState = i => !!table.querySelector(`td[data-opt="${i}"]:is([data-tone="warn"], [data-tone="danger"], [data-tone="error"], :has(:is(.sti, .sti-text):is(.warn, .fix, .error)))`);
  for (let i = 1; i <= RANKS && flex() < min; i++) {
    const fold = col.filter(c => c.opt === i && c.shown);
    if (!fold.length || holdsState(i)) continue;
    hidden.add(i);
    for (const c of fold) { c.shown = false; if (c.flex) flexN--; else room += c.w; }
  }
  /* a clipped table never scrolls sideways: with every optional column folded and the flexible columns still short, a short text column
     (a reason) gives back the room it widened by (its words end in an ellipsis and show whole on hover), and then the flexible columns narrow */
  const giveBack = new Set();
  if (clip) for (const c of col) {
    if (flex() >= min) break;
    if (c.fit === 'text' && c.shown && c.w > c.w0) { room += c.w - c.w0; giveBack.add(c.k); }
  }
  /* write: widths, folds, the floor, the empty row's span and the end cell */
  for (const c of col) if (c.w0 !== undefined && cols[c.k]) {
    if (cols[c.k].dataset.w0 === undefined) cols[c.k].dataset.w0 = String(c.w0);
    if (giveBack.has(c.k)) cols[c.k].style.width = `${c.w0}px`; else if (width.has(c.k)) cols[c.k].style.width = `${width.get(c.k)}px`;
  }
  for (const i of hidden) host.style.setProperty(`--dt-o${i}`, 'none');
  /* a table that may scroll keeps the flexible columns at their floor; when even with every optional column hidden the
     name column would fall below it (a narrow pane), it scrolls sideways as the last resort rather than lose the name.
     A clipped table lets them narrow further, down to a last floor (--space-10: a few letters and the ellipsis), and only below that
     (the sized columns alone are wider than the room) scrolls, giving the name its whole floor back */
  const floor = clip ? Math.min(min, lengthOf(host, '--space-10')) : min, short = min - flex();
  if (floor - flex() > 0 && Number.isFinite(short)) table.style.minWidth = `${tableWidth + short * flexN}px`;
  /* a full-width empty row spans only the visible columns, or the hidden ones are rebuilt as extra grid columns */
  const n = col.filter(c => c.shown).length;
  for (const td of table.querySelectorAll('tbody td[colspan]')) if (n && td.getAttribute('colspan') !== String(n)) td.setAttribute('colspan', String(n));
  /* the last shown column ends its rule and its lit ground on the content line, also when the columns after it are folded */
  const end = col.findLast(c => c.shown)?.k ?? -1;
  for (const tr of table.rows) for (const cell of tr.cells) cell.toggleAttribute('data-end', cell.cellIndex === end && end < tr.cells.length - 1 && cell.colSpan === 1);
  /* a name longer than its room keeps its start and its last letters (what tells generated copies apart), measured with its own font: no layout */
  if (trims.length) {
    const colW = c => (c.flex ? (floor - flex() > 0 ? min : flex()) : giveBack.has(c.k) ? c.w0 : c.w), ctx = (measureCtx ||= table.ownerDocument.createElement('canvas').getContext('2d'));
    for (const t of trims) {
      const c = col[t.k]; if (!c) continue;
      const room = colW(c) - t.at - t.end - 1; ctx.font = t.font; ctx.letterSpacing = t.spacing;
      let text = t.full;
      if (ctx.measureText(text).width > room && t.full.length > tail + 2) {
        const end = t.full.slice(-tail); let lo = 0, hi = t.full.length - tail - 1;
        while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (ctx.measureText(t.full.slice(0, m) + '…' + end).width <= room) lo = m; else hi = m - 1; }
        if (lo > 0) text = t.full.slice(0, lo) + '…' + end;
      }
      if (t.el.textContent !== text) t.el.textContent = text;
      if (text !== t.full) { t.el.dataset.full = t.full; t.el.dataset.trimmed = text; if (!t.el.hasAttribute('data-tip')) t.el.setAttribute('data-tip', t.full); t.el.removeAttribute('data-tip-overflow'); }
      else { delete t.el.dataset.full; delete t.el.dataset.trimmed; }
    }
  }
  return hostWidth;
}
let measureCtx = null;
/* the canvas font of a cell's words: the shorthand reads empty when the cell sets a part it cannot hold (numeric figures), so it is built from its parts */
const fontOf = cs => ({ font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, spacing: cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing });

export function attach(root) {
  const doc = root.ownerDocument || root, win = doc.defaultView, hosts = new Map();
  const options = { characterData: true, childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-end'] };
  const refit = host => {
    const entry = hosts.get(host);
    if (!entry || !host.isConnected) return;
    // fit writes column widths itself; those mutations must not schedule another measurement.
    entry.observer.disconnect();
    try { entry.width = fit(host); } finally { entry.observer.observe(host, options); }
  };
  /* width: the host's new width from the resize watcher; a resize that left it as the last fit found it asks for nothing (the first
     report after observe, a height change) */
  const later = (host, width) => {
    const entry = hosts.get(host);
    if (!entry || entry.pending || (width != null && entry.width != null && Math.abs(width - entry.width) < .5)) return;
    entry.pending = true;
    win.queueMicrotask(() => {
      if (hosts.get(host) !== entry) return;
      entry.pending = false;
      refit(host);
    });
  };
  const ro = new win.ResizeObserver(entries => { for (const entry of entries) later(entry.target, entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width); });
  const scan = () => {
    for (const [host, entry] of hosts) if (!host.isConnected) {
      ro.unobserve(host); entry.observer.disconnect(); hosts.delete(host);
    }
    for (const host of doc.querySelectorAll('.dt-host')) if (!hosts.has(host)) {
      const observer = new win.MutationObserver(records => {
        if (records.some(record => record.type === 'characterData' || (record.type === 'childList' && ![...record.addedNodes, ...record.removedNodes].every(node => node.dataset?.dtProbe !== undefined)) || record.target.tagName === 'COL' || record.attributeName === 'data-end')) later(host);
      });
      hosts.set(host, { observer, pending: false, width: null });
      ro.observe(host); refit(host);
    }
  };
  doc.fonts?.addEventListener?.('loadingdone', () => { for (const host of hosts.keys()) later(host); });
  new win.MutationObserver(scan).observe(doc.body || doc.documentElement, { childList: true, subtree: true }); scan();
}
