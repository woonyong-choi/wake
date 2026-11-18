/*
 * Reasoning chain: how a conclusion was reached, as one head line and the rows under it. It draws no face of its own: it sits in a
 * stage, a summary bar's body or a panel block (the container owns the face, kit/CONTRACTS.md Faces).
 *   head   the lead mark (who reached it reads in the words beside it), the conclusion (the whole first line, broken evenly), and a quiet
 *          line under it: the grade as a word in its colour, the source, and the count of each counted cell
 *   rows   one row a cell (observation, basis, interpretation, how to verify, what is not confirmed …): the cell's name in a fixed column,
 *          its items one under another, each item followed by its evidence references (ref.js: refLabel(n) names each one); rows are divided by hairlines
 * With toggle the chain is a summary bar: closed it is one line (head?, else the grade and the conclusion, at most two lines), open it shows
 * the head and the rows under the bar's rule.
 *   grade: { label, kind: 'ok'|'warn'|'idle', icon? }  source: the words for who reached it (and its version)
 *   cells: { id, label, count?: true, items: { text, refs?: number[] }[] }[]  (a cell without items is left out)
 */
import { html, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import * as summaryBar from './summary-bar.js';
import * as ref from './ref.js';

export const name = 'reasoning-chain';

export const css = `
.rch { display: grid; gap: var(--space-3); min-width: 0; word-break: keep-all; overflow-wrap: anywhere; }
.rch-h { display: flex; align-items: flex-start; gap: var(--space-2); min-width: 0; white-space: normal; text-align: start; }
.rch-lead { flex: none; display: grid; place-items: center; height: var(--leading-sm); color: var(--muted-foreground); }
.rch-t { display: grid; gap: var(--space-1); flex: 1; min-width: 0; }
.rch-t b { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--foreground); text-wrap: pretty; } /* the conclusion is the whole first line; when it runs to a second line it breaks evenly, not on one stray word */
.rch-m { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.rch-g { font-weight: var(--weight-medium); } .rch-g[data-kind="warn"] { color: var(--warning-content); } .rch-g[data-kind="ok"] { color: var(--success-content); }
.rch-src { display: inline-flex; align-items: center; gap: var(--space-1); }
.rch-b { display: grid; }
.rch-row { display: grid; grid-template-columns: calc(var(--space-16) + var(--space-2)) minmax(0, 1fr); gap: var(--space-3); padding-block: var(--space-2); border-block-start: var(--line) solid var(--border-surface); font-size: var(--text-sm); line-height: var(--leading-sm); }
.rch-row > span { color: var(--muted-foreground); font-size: var(--text-xs); line-height: var(--leading-sm); }
.rch-row ul { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-1); }
.rch-row li { color: var(--foreground); }
.sbar-body .rch-b .rch-row:first-child { border-block-start: 0; padding-block-start: 0; } /* under a bar's head the head draws the rule: the first row adds none of its own */
`;

const head = p => {
  const g = p.grade || {}, counted = (p.cells || []).filter(c => c.count && c.items?.length);
  return html`<div class="rch-h"><span class="rch-lead">${icon(p.icon || 'search', 'sm')}</span>
    <div class="rch-t"><b>${p.conclusion}</b><span class="rch-m">${g.label ? html`<span class="rch-g"${attrs({ 'data-kind': g.kind || 'idle' })}>${g.label}</span>` : ''}${p.source ? html`<span class="rch-src">${p.source}</span>` : ''}${counted.map(c => html`<span>${c.label} ${c.items.length}</span>`)}</span></div></div>`;
};
const rows = p => html`<div class="rch-b">${(p.cells || []).filter(c => c.items?.length).map(c => html`<div class="rch-row"${attrs({ 'data-cell': c.id })}><span>${c.label}</span><ul>${c.items.map(it => html`<li>${it.text}${ref.list(it.refs, p.refAction, p.refLabel)}</li>`)}</ul></div>`)}</div>`;

/**
 * @param {{grade: {label: string, kind: 'ok'|'warn'|'idle', icon?: string}, source?: string, conclusion: string, icon?: string,
 *   cells: {id: string, label: string, count?: boolean, items: {text: string, refs?: number[]}[]}[], refAction?: string, refLabel?: (n) => {label: string, tip?: string},
 *   open?: boolean, toggle?: {action: string, arg?: any}, head?: string}} p
 */
export function render(p) {
  const chain = html`<section class="rch" data-c="reasoning-chain">${head(p)}${rows(p)}</section>`;
  if (!p.toggle) return chain;
  const g = p.grade || {};
  return summaryBar.render({ label: p.conclusion, open: !!p.open, toggle: p.toggle, items: [{ id: 'h', label: '', wrap: true, value: p.head ?? [g.label, p.conclusion].filter(Boolean).join(' · ') }], body: chain });
}
