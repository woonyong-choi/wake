/*
 * Summary bar: the few numbers that matter on one rounded pill at the top of a screen, and a body that opens under it.
 * Composition: a bar = a face + the items row (+ a body). The face's corner is --radius-face (half the closed bar's height, round), the same open and closed.
 * The items row stands on its own as well: items(list) draws the same row with no face (a page header, a detail head line); render uses it, so both stay one.
 * The body is the bar's content: a face inside it (a code view, a chart, a timeline, an info card) is drawn flat, the bar owns the face (kit/CONTRACTS.md, Faces).
 * Each item is an icon, a name and its value (an item may carry a small note and an action); hairlines divide them. The chevron at the end opens the body (a flow graph, a chart)
 * with a height animation; a bar without a body has no chevron. Values keep their width (tabular numbers), so a live update does not shift the row.
 *   items: { id, label, value, icon?, dot?, dotState?: 'run'|'wait'|'event'|'fail'|'live' (the dot moves as the state it stands for does: a ring runs round it, it breathes, it breathes in its colour and shakes once on failing; wait, event and fail are the shared state motion, state-motion.js), ariaLabel?, tone?: 'ok'|'warn'|'danger', meta?, action?, arg?, wrap? } (dot: a colour token, a small round mark before the name, for a thing that has its own colour on a chart)
 *   priority: a number (default 0): when the line is short, items fold from the lowest priority up (the last of equals first), so the value that matters stays; the order on the line does not change
 *   shrink: true lets the item's value give way instead of its name (down to --sbar-name-min, with an ellipsis): a long title that must not push the state behind "+N"
 *   wrap: true lets the item (a bar's title) take two lines when the room is short instead of an ellipsis on one: it is counted at its floor and never pinned to its one-line width; the chevron stays centred
 *   wrap: 'lines' (render and items(list, { wrap })): for a narrow pane, the row runs on to more lines instead of folding behind "+N"
 *   metrics(bars, { columns }): several bars (props or drawn bars) as one table of columns (fixed widths, tabular figures; narrower than the widths, the readings after the value take their content width, and what still does not fit folds behind "+N")
 *   toggle: { action, arg }: the bar's open state is the page's (it can keep it); a press on the bar asks the page with { arg, open }, and the page draws the bar the way it answered
 * The items stay on one line in any room: an item is shown whole (its name and its value) or it folds from the end behind "+N"; only the first item, which always stays,
 * lets its name give way (down to --sbar-name-min, with an ellipsis and the whole name as the title). Pointing at it, focusing it or pressing it lists them. The list is the chart legend's
 * (chart-card.js: .legend-more, .legend-pop, its side and --legend-pop-max); only what is counted and when differs.
 */
import { html, attrs, cx, Safe } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { motionOf } from './state-motion.js';

export const name = 'summary-bar';

export const css = `
.sbar { border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--surface-secondary); border: var(--line) solid var(--border-surface); min-width: 0; interpolate-size: allow-keywords; }
.sbar-h { display: flex; align-items: center; gap: var(--space-4); min-height: var(--sbar-h); padding: var(--space-2) var(--space-4); border-radius: inherit; } /* the bar without a body: the same row as the summary */
.sbar > summary { list-style: none; display: flex; align-items: center; gap: var(--space-4); min-height: var(--sbar-h); padding: var(--space-2) var(--space-4); cursor: default; border-radius: inherit; }
.sbar > summary::-webkit-details-marker { display: none; }
.sbar-items { flex: 1; display: flex; flex-wrap: nowrap; align-items: center; gap: var(--space-4); min-width: 0; }
.sbar-items.lines { flex-wrap: wrap; row-gap: var(--space-1_5); } .sbar-items.lines > .sbar-item { flex: 0 0 auto; max-width: 100%; } .sbar-items.lines > .sbar-item.ls { border-inline-start-color: transparent; } .sbar-items.lines { margin-inline-start: calc(-1 * var(--space-4)); } .sbar-items.lines > .sbar-item { padding-inline-start: var(--space-4); border-inline-start: var(--line) solid var(--border-surface); } .sbar-items.lines > .sbar-item:first-child { border-inline-start-color: transparent; } /* a narrow pane: the row runs on to more lines, a line starts with no rule: every item carries the same room and rule before it (the row is moved left by that room), so marking a line's first item never changes its width */
.sbar-item.wrap { flex: 0 1 auto; white-space: normal; } .sbar-item.wrap > :is(.sbar-n, b) { flex: 0 1 auto; min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; } /* a title that may take two lines: it shrinks with the row and is never pinned to its one-line width */
.sbar-item { display: flex; align-items: center; gap: var(--space-2); min-width: 0; font-size: var(--text-native-sm); color: var(--muted-foreground); white-space: nowrap; animation: sbar-rise var(--dur-flow-reveal) var(--ease-standard) both; animation-delay: calc(var(--i, 0) * var(--pg-stagger)); }
.sbar-item + .sbar-item { padding-inline-start: var(--space-4); border-inline-start: var(--line) solid var(--border-surface); }
.sbar-item .wi { width: var(--icon-lg); height: var(--icon-lg); color: var(--sbar-tone, var(--muted-foreground)); flex-shrink: 0; }
.sbar-item .sti .wi { width: var(--space-4); height: var(--space-4); color: inherit; } /* a status mark in an item keeps its own size and its state colour (the item's own icon is the large muted one) */
.sbar-dot { position: relative; width: var(--space-2); height: var(--space-2); border-radius: var(--r-pill); flex-shrink: 0; background: var(--sbar-dot-c); --stm-tone: var(--sbar-dot-c); --stm-halo: var(--space-0_5); --stm-shake: var(--space-px); }
/* the marks that never stop moving move by opacity and by turning only: the browser runs those without working the page's styles out again on every frame (a halo that grew its own shadow, or a ring that turned by its gradient's angle, did).
   waiting and failing move as every state mark does (state-motion.js: the breathing halo, and the one shake into a failure) */
.sbar-dot[data-state="run"]::before { content: ""; position: absolute; inset: calc(-1 * var(--space-0_5)); padding: var(--line-avg); border-radius: inherit; background: conic-gradient(transparent 0 55%, var(--sbar-dot-c) 100%); mask: linear-gradient(var(--mask-on) 0 0) content-box, linear-gradient(var(--mask-on) 0 0); mask-composite: exclude; animation: sbar-spin var(--dur-sbar-spin) linear infinite; }
@keyframes sbar-spin { to { transform: rotate(360deg); } }
.sbar-dot[data-state="live"] { animation: sbar-halo-live var(--dur-live-pulse) var(--ease-standard) infinite; }
@keyframes sbar-halo-live { 50% { opacity: var(--cl-pulse-min); } }
.sbar-item small { font-size: var(--text-xs); color: var(--muted-foreground); }
.sbar-items.measuring > .sbar-item { display: flex; flex: none; min-width: 0 !important; } .sbar-items.measuring > .sbar-more { display: block; } /* every item at its whole width and the mark, to be measured (not at the floor the last fit pinned on it) */
.sbar-item > * { flex: none; } .sbar-item > .sbar-n, .sbar-item[data-shrink] > b { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; } .sbar-item[data-shrink] > .sbar-n { flex: none; } /* only the name gives way; in a shrinking item the value gives way and its name stays */
.sbar-items [hidden], .sbar-more:has(> .sbar-more-n[data-n="0"]) { display: none; } /* the mark shows by what it counts, which is its own: a redraw of the page does not hide it (it may hold the focus) */
.sbar-more { position: relative; flex: none; font-size: var(--text-native-sm); color: var(--muted-foreground); font-variant-numeric: tabular-nums; white-space: nowrap; border-radius: var(--r-mark); cursor: default; transition: color var(--dur-fast) var(--ease-standard); }
.sbar-more:hover, .sbar-more:focus-within { color: var(--foreground); } .sbar-more:active { opacity: var(--press-opacity); }
.sbar-more:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-0_5); }
.sbar-more .sbar-item { animation: none; gap: var(--space-2); padding: var(--space-1) 0; border: 0; } .sbar-more .sbar-item > .sbar-n { flex: 1 0 auto; margin-inline-end: var(--space-4); }
.sbar-item.click { cursor: pointer; transition: opacity var(--dur-fast) var(--ease-standard); } .sbar-item.click:hover { color: var(--foreground); } .sbar-item.click:active { opacity: var(--press-opacity); }
.sbar-item b { font-weight: var(--weight-semibold); color: var(--foreground); font-variant-numeric: tabular-nums; }
.sbar-item[data-tone="ok"] { --sbar-tone: var(--success); } .sbar-item[data-tone="warn"] { --sbar-tone: var(--warning); } .sbar-item[data-tone="danger"] { --sbar-tone: var(--destructive); }
@keyframes sbar-rise { from { opacity: 0; transform: translateY(var(--space-1)); } }
.sbar-chev { display: grid; place-items: center; width: var(--control-h-xs); height: var(--control-h-xs); border-radius: var(--r-control-sm); color: var(--muted-foreground); transition: background var(--dur-fast) var(--ease-standard), transform var(--dur-collapse) var(--ease-standard); }
.sbar > summary:hover .sbar-chev { background: var(--ghost-hover); color: var(--foreground); }
.sbar > summary:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: calc(var(--focus-w) * -1); }
.sbar[open] > summary .sbar-chev { transform: rotate(180deg); } /* its own chevron only: a bar inside an open bar turns by its own state */
.sbar::details-content { block-size: 0; opacity: 0; overflow: clip; transition: block-size var(--dur-bar) var(--ease-standard), opacity var(--dur-fast) var(--ease-standard), content-visibility var(--dur-bar) allow-discrete; }
.sbar[open]::details-content { block-size: auto; opacity: 1; transition: block-size var(--dur-bar) var(--ease-standard), opacity var(--dur-bar) var(--ease-standard) var(--dur-fast), content-visibility var(--dur-bar) allow-discrete; } /* open and close glide over about 0.25 s with the standard curve (no jump at the start): opening, the height grows and the body fades in behind it; closing, the body fades first while the height follows */
.sbar-body .cb, .sfl-sec .cb { background: transparent; box-shadow: none; border-radius: 0; } .sbar-body .cb-head, .sfl-sec .cb-head { background: linear-gradient(var(--code-head), var(--code-head)), linear-gradient(var(--surface-secondary), var(--surface-secondary)), var(--background); box-shadow: 0 var(--hairline) 0 var(--border-surface-strong); } /* the code's head keeps its band laid over the card's own face, so the lines that scroll under the stuck head never show through */ /* code in a card is the card's own content: no second face (the container owns the face, kit/CONTRACTS.md Faces) */
/* metrics(bars, { columns }): bars as one table of columns (title, value, readings…): one width a column, tabular figures, the hairlines line up and
   never move; narrower, the bars drop whole readings from the end (the fifth, then the fourth, then the third) when those columns have a fixed width.
   A reading that carries a state that is not ok (a tone, a warn/error status) is never dropped: the plain readings go first */
.sbm { display: grid; gap: var(--space-4); container-type: inline-size; min-width: 0; }
.sbm .sbar-item { flex: 0 0 auto; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sbm .sbar-item:nth-child(1) { width: var(--sbm-fit-1, var(--sbm-1, auto)); } .sbm .sbar-item:nth-child(2) { width: var(--sbm-fit-2, var(--sbm-2, auto)); } .sbm .sbar-item:nth-child(3) { width: var(--sbm-fit-3, var(--sbm-3, auto)); } .sbm .sbar-item:nth-child(4) { width: var(--sbm-fit-4, var(--sbm-4, auto)); } .sbm .sbar-item:nth-child(5) { width: var(--sbm-fit-5, var(--sbm-5, auto)); }
.sbm .sbar-items:not(.measuring) > .sbar-item[data-own] { width: var(--sbar-own); } /* the reading that folds last, at its own width when its column is set by a longer one (fit): measured in its column again */
.sbm .sbar-item:nth-child(1) > b { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; } /* a bar's name never runs into its value: cut with an ellipsis, whole in its title */
/* the columns are measured (fitColumns): a name column wider than its width grows up to half again; when the fixed widths do not fit the line, the readings after
   the value take the width their widest bar needs, and only what still does not fit folds behind "+N" by its priority (a reading with a state stays) */
.sbar-body { --surface-radius: var(--r-panel); padding: 0 var(--space-4) var(--space-4); border-block-start: var(--line) solid var(--border-surface); padding-block-start: var(--space-3); margin-inline: var(--space-4); padding-inline: 0; }
@media (prefers-reduced-motion: reduce) { .sbar-item, .sbar-more, .sbar-chev, .sbar::details-content { animation: none; transition: none; } }
`;

export const hook = 'data-sbar-toggle';

/** One item of the row: an icon or a dot, a name, the value and a small note */
const item = (it, i) => html`<span class="${cx('sbar-item', it.action && 'click', it.wrap && 'wrap')}"${attrs({ style: `--i:${i}`, 'data-tone': it.tone, 'data-prio': it.priority ?? null, 'data-shrink': it.shrink ? '' : null, 'aria-label': it.ariaLabel || null, role: it.action ? 'button' : null, tabindex: it.action ? '0' : null, 'data-action': it.action || null, 'data-arg': it.action ? it.arg ?? null : null })} data-key="${JSON.stringify(['summary-bar', it.id])}">${it.icon ? icon(it.icon) : ''}${it.dot ? html`<i class="${cx('sbar-dot', motionOf(it.dotState) && 'stm')}" style="--sbar-dot-c:var(${it.dot})"${attrs({ 'data-state': it.dotState, 'data-motion': motionOf(it.dotState) })}></i>` : ''}${it.label ? html`<span class="sbar-n">${it.label}</span>` : ''}<b>${it.value ?? '—'}</b>${it.meta ? html`<small>${it.meta}</small>` : ''}</span>`;

/**
 * The items row on its own, with no face: the same row a bar draws (items, hairlines between them, the fold behind "+N"), for a page header or a detail head line.
 * @param {SummaryItem[]} list
 */
export const items = (list, o = {}) => row(list, true, o);

/* the row a bar and the bare row share; only the bare row names itself as the component (inside a bar the bar does) */
function row(list, own, o = {}) {
  const more = html`<span class="legend-more sbar-more" tabindex="0" aria-haspopup="true" data-own-children data-own-attrs="data-side aria-label"><span class="sbar-more-n" data-n="0"></span><span class="legend-pop"><span class="legend-pop-in"></span></span></span>`;
  return html`<div class="${o.wrap === 'lines' ? 'sbar-items lines' : 'sbar-items'}"${attrs({ 'data-c': own ? 'summary-bar' : null })}>${list.map(item)}${more}</div>`;
}

/**
 * @typedef {{id: string, label: string, value: string|number|Safe|null, icon?: string, dot?: string, dotState?: string, tone?: 'ok'|'warn'|'danger', meta?: string, action?: string, arg?: any, ariaLabel?: string, wrap?: boolean, priority?: number, shrink?: boolean}} SummaryItem
 * @param {{toggle?: {action: string, arg?: any}, items: SummaryItem[], body?: any, open?: boolean, label?: string}} p
 */
export function render(p) {
  const chev = p.body ? html`<span class="sbar-chev" aria-hidden="true">${icon('chevron-down-small')}</span>` : '';
  const head = html`${row(p.items, false, { wrap: p.wrap })}${chev}`;
  return p.body
    ? html`<details class="sbar" data-c="summary-bar"${attrs({ open: p.open ? '' : null, 'data-sbar-toggle': p.toggle?.action, 'data-sbar-arg': p.toggle ? p.toggle.arg ?? null : null })}><summary${attrs({ 'aria-label': p.label })}>${head}</summary><div class="sbar-body">${p.body}</div></details>`
    : html`<div class="sbar" data-c="summary-bar"><div class="sbar-h">${head}</div></div>`;
}

/**
 * Several bars as one table of columns: each item keeps the width of its column (columns: CSS lengths from tokens, the first five items),
 * so names, values and hairlines line up from bar to bar; narrower than the widths, the readings after the value take their content width (fitColumns), and what still does not fit folds by priority.
 * @param {object[]} bars  render props of each bar, or a bar already drawn with render() (a card a page draws itself keeps the column widths too); empty entries are left out
 * @param {{columns?: string[]}} o
 */
export function metrics(bars, o = {}) {
  const cols = (o.columns || []).slice(0, 5), style = cols.map((w, i) => (w ? `--sbm-${i + 1}:${w}` : '')).filter(Boolean).join(';');
  return html`<div class="sbm"${attrs({ 'data-cols': cols.length || null, style: style || null })}>${(bars || []).filter(Boolean).map(b => (b instanceof Safe ? b : render(b)))}</div>`;
}

/**
 * How many of the leading items stay on the line. mins: the least width of each item (its name cut to the floor, its value whole); room: the width of the line;
 * gap: the space between two items; more: the width of the "+N" mark, needed only when something folds. The first item always stays.
 */
export function fold(mins, room, gap, more) {
  return keepOf(mins, mins.map(() => 0), room, gap, more).filter(Boolean).length;
}
/** Which items stay: as fold, but the items with the lowest priority fold first (the last of equals first); the first item always stays,
 *  and so does an item that carries a state that is not ok (stays[i]): it is never folded behind "+N", the other items go first. */
export function keepOf(mins, prios, room, gap, more, stays = []) {
  const keep = mins.map(() => true), n = () => keep.filter(Boolean).length;
  const sum = () => mins.reduce((t, w, i) => t + (keep[i] ? w : 0), 0) + Math.max(0, n() - 1) * gap;
  if (sum() <= room) return keep;
  while (n() > 1 && sum() + gap + more > room) {
    let out = -1; for (let i = 1; i < mins.length; i++) if (keep[i] && !stays[i] && (out < 0 || prios[i] <= prios[out])) out = i;
    if (out < 0) break;
    keep[out] = false;
  }
  return keep;
}

/* one line in the room there is: measured with every item at its whole width (the class shows them all for the reading, nothing is written for it), then the names get
   their floors, the rest folds and the list behind "+N" is filled with what folded. Only what differs is written, so a line that already fits is left alone:
   the mark keeps the focus it has, and a redraw that changes nothing costs one reading */
function fit(line) {
  const more = line.querySelector(':scope > .sbar-more');
  if (!more || !line.clientWidth) return;
  if (line.classList.contains('lines')) { lines(line, more); return; }
  const items = [...line.children].filter(x => x !== more), count = more.querySelector('.sbar-more-n'), pop = more.querySelector('.legend-pop-in'), cs = getComputedStyle(line);
  const floor = parseFloat(cs.getPropertyValue('--sbar-name-min')) || 0, gap = parseFloat(cs.columnGap) || 0, nameOf = x => x.querySelector(':scope > .sbar-n'), width = x => x.getBoundingClientRect().width;
  const widest = `+${items.length}`, set = (el, key, value) => { if (el[key] !== value) el[key] = value; };
  if (count.textContent.length !== widest.length) count.textContent = widest;
  line.classList.add('measuring');
  /* a wrapping item (wrap) gives its words way down to the floor too, onto a second line: it is counted at that least width and never pinned */
  const wraps = items.map(x => x.classList.contains('wrap')), shrinks = items.map(x => x.hasAttribute('data-shrink')), texts = x => [...x.querySelectorAll(':scope > :is(.sbar-n, b)')].reduce((t, el) => t + width(el), 0);
  const valueOf = x => x.querySelector(':scope > b'), prios = items.map(x => +x.dataset.prio || 0);
  const moreW = width(more), room = line.clientWidth, whole = items.map((x, i) => { const w = width(x); if (wraps[i]) { const t = texts(x); return Math.round((w - t + Math.min(t, floor)) * 100) / 100; } if (shrinks[i]) { const b = valueOf(x), bw = b ? width(b) : 0; return Math.round((w - bw + Math.min(bw, floor)) * 100) / 100; } return Math.round(w * 100) / 100; }), mins = items.map((x, i) => { const n = nameOf(x), w = n ? width(n) : 0; return shrinks[i] ? whole[i] : i || wraps[i] ? whole[i] : Math.round((width(x) - w + Math.min(w, floor)) * 100) / 100; }); /* what stays is counted whole; the first item may still give its name way when it is all there is room for, and a shrinking item its value */ /* the least width as it is (a whole pixel more would move the items after it) */
  /* a reading's own width (its words, not its column): a column is as wide as its widest reading in the table, which can be a longer state of another bar */
  const own = items.map(x => { const st = getComputedStyle(x), kids = [...x.children]; return Math.ceil(parseFloat(st.paddingInlineStart) + parseFloat(st.borderInlineStartWidth) + kids.reduce((t, k) => t + width(k), 0) + Math.max(0, kids.length - 1) * (parseFloat(st.columnGap) || 0)) + 1; });
  line.classList.remove('measuring');
  const stays = items.map(x => (x.dataset.tone && x.dataset.tone !== 'ok') || !!x.querySelector(':scope > b :is(.sti, .sti-text):is(.warn, .fix, .error)'));
  const kept = keepOf(whole.map(Math.ceil), prios, room, gap, moreW, stays);
  /* the reading that folds last (the highest priority that folded, after every reading that stays) comes back at its own width when that fits: the threshold folds last (R4-14) */
  let tight = -1;
  { const lastKept = kept.lastIndexOf(true), back = items.map((_, i) => i).filter(i => !kept[i] && i > lastKept).sort((a, b) => prios[b] - prios[a] || a - b)[0];
    if (back !== undefined && line.closest('.sbm')) {
      const used = whole.reduce((t, w, i) => t + (kept[i] ? Math.ceil(w) : 0), 0) + (kept.filter(Boolean).length) * gap + own[back], rest = kept.filter(Boolean).length + 1 < items.length;
      if (used + (rest ? gap + moreW : 0) <= room) { kept[back] = true; tight = back; }
    } }
  const keep = kept.filter(Boolean).length;
  items.forEach((x, i) => { set(x, 'hidden', !kept[i]); const min = wraps[i] ? '' : (i === tight ? own[i] : mins[i]) + 'px'; if (x.style.minWidth !== min) x.style.minWidth = min; const w = i === tight ? own[i] + 'px' : ''; if (x.style.getPropertyValue('--sbar-own') !== w) { if (w) x.style.setProperty('--sbar-own', w); else x.style.removeProperty('--sbar-own'); } if ((x.dataset.own != null) !== (i === tight)) x.toggleAttribute('data-own', i === tight); });
  set(count, 'textContent', keep === items.length ? widest : `+${items.length - keep}`); if (count.dataset.n !== String(items.length - keep)) count.dataset.n = items.length - keep;
  if (more._side && more.dataset.side !== more._side) more.dataset.side = more._side; /* a redraw takes the side the list opened to: it is put back */
  const folded = items.filter((x, i) => !kept[i]), sign = folded.map(x => x.outerHTML).join('');
  if (pop._sign !== sign) { pop._sign = sign; pop.replaceChildren(...folded.map(x => { const copy = x.cloneNode(true); copy.hidden = false; copy.style.minWidth = ''; return copy; })); }
  /* the mark's own name says what it stands for, one folded item a line (its words, in order), so it is never a number without its things */
  const named = folded.length ? [`+${folded.length}`, ...folded.map(x => [...x.children].map(c => c.textContent.trim()).filter(Boolean).join(' '))].join('\n') : null;
  if (named === null) { if (more.hasAttribute('aria-label')) more.removeAttribute('aria-label'); } else set(more, 'ariaLabel', named);
  for (const x of items.filter((x, i) => kept[i])) { const n = nameOf(x) ?? (x === items[0] && line.parentElement?.closest('.sbm') ? valueOf(x) : null); if (!n) continue; if (n.scrollWidth > n.clientWidth) set(n, 'title', n.textContent); else if (n.title) n.removeAttribute('title'); } /* the whole name, only where it is cut */
}

/* the columns of a metrics table, measured: the name column grows to its widest name up to half again its width (the rest is cut, whole in the title); when a
   bar's line is shorter than the columns' widths, the readings after the value take the width the widest of them needs, so a reading folds behind "+N" only when
   it truly does not fit. One reading of every line, then the widths are written once; returns whether they changed */
function fitColumns(sbm) {
  const cols = Math.min(5, Number(sbm.dataset.cols) || 0), lines = [...sbm.querySelectorAll(':scope > .sbar .sbar-items')].filter(l => !l.classList.contains('lines'));
  if (!cols || !lines.length) return false;
  /* the fitted widths are written on each line, not on the table: a page's redraw writes the table's style attribute back as rendered (its declared columns) and would
     take them with it, while a line has no style of its own and keeps them (R4-14) */
  const all = [...sbm.querySelectorAll(':scope > .sbar .sbar-items')], before = [1, 2, 3, 4, 5].map(i => all[0].style.getPropertyValue(`--sbm-fit-${i}`));
  for (const l of all) for (let i = 1; i <= 5; i++) l.style.removeProperty(`--sbm-fit-${i}`);
  const range = sbm.ownerDocument.createRange(), run = el => { range.selectNodeContents(el); return range.getBoundingClientRect().width; };
  lines.forEach(l => l.classList.add('measuring'));
  const room = Math.min(...lines.map(l => l.clientWidth)), gap = parseFloat(getComputedStyle(lines[0]).columnGap) || 0;
  const rows = lines.map(l => [...l.children].filter(x => x.classList.contains('sbar-item')).map(x => {
    const cs = getComputedStyle(x), kids = [...x.children];
    return { set: x.getBoundingClientRect().width, need: Math.ceil(parseFloat(cs.paddingInlineStart) + parseFloat(cs.borderInlineStartWidth) + kids.reduce((t, k) => t + run(k), 0) + Math.max(0, kids.length - 1) * (parseFloat(cs.columnGap) || 0)) + 1 };
  }));
  lines.forEach(l => l.classList.remove('measuring'));
  const widest = i => Math.max(0, ...rows.map(r => r[i]?.need ?? 0)), declared = i => rows.find(r => r[i])?.[i].set ?? 0;
  const fit = {}, width = (x, i) => fit[i + 1] ?? x.set, lineW = r => r.reduce((t, x, i) => t + width(x, i), 0) + Math.max(0, r.length - 1) * gap;
  if (rows.some(r => lineW(r) > room + .5)) for (let i = 2; i < cols; i++) if (widest(i) && widest(i) < declared(i) - .5) fit[i + 1] = widest(i);
  /* the name column grows into the room the widest line leaves, never past half again its width */
  const spare = room - Math.max(...rows.map(r => lineW(r) + r.length + 1)); /* each item counted at its whole pixels by the line fit */
  if (widest(0) > declared(0) + .5 && spare > .5) fit[1] = Math.min(widest(0), declared(0) * 1.5, declared(0) + spare);
  for (const l of all) for (const [i, w] of Object.entries(fit)) l.style.setProperty(`--sbm-fit-${i}`, `${Math.ceil(w)}px`);
  return [1, 2, 3, 4, 5].some((i, k) => all[0].style.getPropertyValue(`--sbm-fit-${i}`) !== before[k]);
}

/* wrap: 'lines' (a narrow pane): every item stays in sight and the row runs on to a second line instead of folding behind "+N"; an item that
   starts a line has no rule before it */
function lines(line, more) {
  const items = [...line.children].filter(x => x !== more), count = more.querySelector('.sbar-more-n');
  items.forEach(x => { if (x.hidden) x.hidden = false; if (x.style.minWidth) x.style.minWidth = ''; });
  if (count.dataset.n !== '0') count.dataset.n = '0';
  let top = null;
  items.forEach(x => { const t = Math.round(x.getBoundingClientRect().top), starts = top !== null && t > top + 2; x.classList.toggle('ls', starts); if (top === null || starts) top = t; });
  /* the words' own font can arrive later and move an item to another line without the row changing its size: look again then */
  if (!line._linesFonts) { line._linesFonts = true; line.ownerDocument.fonts?.ready?.then(() => line.isConnected && lines(line, more)); }
}

/* the page keeps the open state: a press on the bar (the native toggle) is told to it, and a bar the reader opened comes into view once its body has grown */
export function attach(root, ctx) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  if (win.ResizeObserver) {
    /* fitting writes to the line (hidden, the names' floors, the list): what it changes must not start the scan that asked for it again */
    /* a line in a metrics table: its table's columns are measured first (once in a task), and a change of a column refits every line of it */
    const fitQuietly = line => {
      const sbm = line.parentElement?.closest('.sbm');
      if (sbm && !sbm._columnsFitted) {
        sbm._columnsFitted = true; win.queueMicrotask(() => { sbm._columnsFitted = false; });
        if (fitColumns(sbm)) { for (const other of sbm.querySelectorAll(':scope > .sbar .sbar-items')) if (other !== line) fit(other); }
      }
      fit(line); mutations.takeRecords();
    };
    const seen = new Set();
    const resize = new win.ResizeObserver(entries => entries.forEach(e => fitQuietly(e.target)));
    const scan = () => {
      for (const line of seen) if (!root.contains(line)) { resize.unobserve(line); seen.delete(line); }
      root.querySelectorAll('.sbar-items').forEach(line => { if (!seen.has(line)) { seen.add(line); resize.observe(line); watch(line); } fitQuietly(line); });
    };
    /* a redraw of the page gives the line its items back as they were rendered, and a new value can be wider: the line is fitted again before it is painted */
    /* each line is watched by itself, so what the rest of the page does (a graph redrawn on every frame) starts nothing here; the page is watched only for lines that come */
    const mutations = new win.MutationObserver(records => { for (const line of new Set(records.map(r => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest?.('.sbar-items')))) if (line?.isConnected) fitQuietly(line); });
    const watch = line => mutations.observe(line, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'style', 'title'] });
    const arrivals = new win.MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('.sbar-items') || n.querySelector('.sbar-items'))))) scan(); });
    arrivals.observe(root, { childList: true, subtree: true });
    scan();
    win.addEventListener('pagehide', () => { resize.disconnect(); mutations.disconnect(); arrivals.disconnect(); seen.clear(); }, { once: true });
  }
  /* the side the list opens to is found by the legend's own code as the pointer or the focus arrives (chart-card.js); it is remembered here so a redraw keeps it */
  for (const type of ['pointerover', 'focusin']) root.addEventListener(type, e => { const more = e.target.closest?.('.sbar-more'); if (more) more._side = more.dataset.side; });
  /* a press on "+N" shows the list (it takes the focus); it is not a press on the bar */
  let opened = null; /* the bar whose own line was just pressed (a click, or the keyboard's click on the line) */
  root.addEventListener('click', e => { if (e.target.closest?.('.sbar-more')) e.preventDefault(); else opened = e.target.closest?.('.sbar > summary')?.parentElement ?? null; });
  root.addEventListener('toggle', e => {
    const bar = e.target;
    if (!bar.matches?.('details[data-sbar-toggle]')) return;
    ctx.emit(bar.dataset.sbarToggle, { arg: JSON.parse(bar.dataset.sbarArg || 'null'), open: bar.open });
    /* only a bar the reader opened comes into view: one that is drawn open (at load, or again by a redraw) leaves the scroll position alone */
    const pressed = bar === opened; opened = null;
    if (bar.open && pressed) win.setTimeout(() => bar.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--dur-bar')) || 0);
  }, true);
}
