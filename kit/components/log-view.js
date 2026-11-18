/*
 * Log view: log lines in mono, one grid row each: the source line number (as given, never renumbered), the time, the level and the text.
 * A matched line (hits: the numbers given; else, with a query, every line whose text holds it) keeps a quiet tint and a mark on its edge, and
 * the query is marked in its text; a hovered line is a light wash. An error level reads in the error colour, a warning in the warning colour
 * (the level words are the data's own: error, err, fatal, crit… and warn…). With gaps, a run of left out lines between two shown lines
 * (their numbers are not consecutive) is one quiet row "⋯ N lines left out". times: false hides the time column; wrap: false keeps every
 * line on one line and scrolls sideways. The list scrolls inside its own height.
 * labels.skipped overrides the gap words ({n} is the count).
 */
import { html, attrs } from '../core/html.js';
import { t, formatNumber } from '../core/i18n.js';

export const name = 'log-view';

export const css = `
.lgv-list { display: grid; align-content: start; font-family: var(--font-mono); font-size: var(--text-xs); line-height: var(--leading-sm); max-height: calc(var(--space-40) * 3); overflow: auto; }
.lgv-l { display: grid; grid-template-columns: calc(var(--space-8) + var(--space-1)) calc(var(--space-16) + var(--space-1)) calc(var(--space-10) + var(--space-1)) minmax(0, 1fr); gap: var(--space-2); padding-inline: var(--space-1); border-radius: var(--r-mark); transition: background var(--dur-fast) var(--ease-standard); }
.lgv-l:hover { background: var(--ghost-hover); }
.lgv-l[data-hit] { background: color-mix(in oklab, var(--primary) 7%, transparent); box-shadow: inset var(--space-0_5) 0 0 var(--primary); } /* a matched row keeps its own fill and a mark on its edge, never a warning colour */
.lgv-list mark { background: color-mix(in oklab, var(--primary) 20%, transparent); color: inherit; border-radius: var(--r-mark); text-decoration: none; }
.lgv-l[data-tone="error"] .lgv-lv { color: var(--destructive-content); } .lgv-l[data-tone="warn"] .lgv-lv { color: var(--warning-content); }
.lgv-n, .lgv-at { color: var(--muted-foreground); text-align: end; font-variant-numeric: tabular-nums; } .lgv-at { text-align: start; }
.lgv-tx { white-space: pre-wrap; overflow-wrap: anywhere; }
.lgv-gap { padding: var(--space-0_5) var(--space-1); color: var(--muted-foreground); font-family: var(--font-sans); }
.lgv[data-nots] .lgv-at { display: none; } .lgv[data-nots] .lgv-l { grid-template-columns: calc(var(--space-8) + var(--space-1)) calc(var(--space-10) + var(--space-1)) minmax(0, 1fr); }
.lgv[data-nowrap] .lgv-tx { white-space: pre; overflow-wrap: normal; } .lgv[data-nowrap] .lgv-list { overflow-x: auto; }
@media (prefers-reduced-motion: reduce) { .lgv-l { transition: none; } }
`;

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** the tone a level word reads in */
export const toneOf = level => (/^(err|fatal|crit|panic|emerg|alert)/i.test(level || '') ? 'error' : /^warn/i.test(level || '') ? 'warn' : null);

/**
 * @param {{lines: {n: number, at?: string, level?: string, text: string}[], hits?: number[], gaps?: boolean, query?: string, wrap?: boolean, times?: boolean,
 *   labels?: {skipped?: string}}} p
 */
export function render(p) {
  const q = (p.query || '').trim(), re = q ? new RegExp(escapeRe(q), 'i') : null, hits = p.hits ? new Set(p.hits.map(Number)) : null;
  const mark = text => { const s = String(text ?? ''), m = re?.exec(s); return m ? html`${s.slice(0, m.index)}<mark>${m[0]}</mark>${s.slice(m.index + m[0].length)}` : s; };
  const gap = n => html`<div class="lgv-gap" role="separator">${p.labels?.skipped ? p.labels.skipped.replace('{n}', formatNumber(n)) : t('log.skipped', { n: formatNumber(n) })}</div>`;
  const rows = [];
  let last = null;
  for (const l of p.lines || []) {
    if (p.gaps && last != null && Number(l.n) > last + 1) rows.push(gap(Number(l.n) - last - 1));
    const hit = hits ? hits.has(Number(l.n)) : !!re?.test(String(l.text ?? ''));
    rows.push(html`<div class="lgv-l"${attrs({ 'data-n': l.n, 'data-level': l.level || null, 'data-tone': toneOf(l.level), 'data-hit': hit })}><span class="lgv-n">${l.n}</span><time class="lgv-at">${l.at ?? ''}</time><span class="lgv-lv">${l.level ?? ''}</span><span class="lgv-tx">${mark(l.text)}</span></div>`);
    last = Number(l.n);
  }
  return html`<div class="lgv" data-c="log-view"${attrs({ 'data-nots': p.times === false, 'data-nowrap': p.wrap === false })}><div class="lgv-list" data-scroll="y">${rows}</div></div>`;
}
