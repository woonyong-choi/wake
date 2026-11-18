/*
 * Action compare: the candidate actions one under another, divided by hairlines (content with no face: the bar or stage around it owns it).
 * Each option: its title, a quiet kind word, its grade as a status mark with words, and its pick button at the line end (the selected one,
 * else the first, is the one recommended: default; the rest secondary); under it the change, what it reaches, a note and the route it takes
 * (steps joined by arrows) as a name and value list.
 *   grade: { label, kind: 'ok'|'warn'|'idle'|'error', icon? }  (label: the words the page wants next to the mark)
 * labels overrides any word: { pick, change, reach, note, route }; an option's own labels override it for that option (a check command is not a change)
 */
import { html, attrs } from '../core/html.js';
import { t } from '../core/i18n.js';
import * as button from './button.js';
import * as statusIcon from './status-icon.js';

export const name = 'action-compare';

export const css = `
.acm { display: grid; word-break: keep-all; overflow-wrap: anywhere; }
.acm-o { display: grid; gap: var(--space-2); min-width: 0; padding-block: var(--space-3); border-block-start: var(--line) solid var(--border-surface); }
.acm-o:first-child { border-block-start: 0; padding-block-start: 0; }
.acm-h { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.acm-h b { font-size: var(--text-sm); font-weight: var(--weight-semibold); } .acm-k { font-size: var(--text-xs); color: var(--muted-foreground); } /* a kind is a quiet word, never a filled badge */
.acm-h > :last-child { margin-inline-start: auto; }
.acm-kv { display: grid; grid-template-columns: calc(var(--space-16) + var(--space-2)) minmax(0, 1fr); gap: var(--space-1) var(--space-3); margin: 0; font-size: var(--text-sm); }
.acm-kv dt { color: var(--muted-foreground); font-size: var(--text-xs); line-height: var(--leading-sm); } .acm-kv dd { margin: 0; color: var(--foreground); min-width: 0; }
.acm-path { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; color: var(--muted-foreground); }
.acm-path i { font-style: normal; }
`;

/**
 * @param {{options: {id: string, title: string, kind?: string, grade?: {label: string, kind: string, icon?: string}, change: any, reach?: any,
 *   route?: string[], note?: any, disabled?: boolean, labels?: object}[], selected?: string, action: string, labels?: object}} p
 */
export function render(p) {
  const L = p.labels || {}, word = (k, o) => o?.labels?.[k] ?? L[k] ?? t('compare.' + k), opts = p.options || [];
  const chosen = opts.some(o => o.id === p.selected) ? p.selected : opts[0]?.id;
  const pair = (k, v, o) => (v == null || v === '' ? '' : html`<dt>${word(k, o)}</dt><dd>${v}</dd>`);
  return html`<div class="acm" data-c="action-compare">${opts.map(o => html`<div class="acm-o"${attrs({ 'data-option': o.id, 'data-selected': o.id === p.selected ? '' : null })}>
    <div class="acm-h"><b>${o.title}</b>${o.kind ? html`<span class="acm-k">${o.kind}</span>` : ''}${o.grade ? statusIcon.render({ kind: o.grade.kind, icon: o.grade.icon, subject: o.grade.label }) : ''}<span>${button.render({ label: word('pick', o), variant: o.id === chosen ? 'default' : 'secondary', size: 'sm', round: true, action: p.action, arg: o.id, disabled: !!o.disabled })}</span></div>
    <dl class="acm-kv">${pair('change', o.change, o)}${pair('reach', o.reach, o)}${pair('note', o.note, o)}${o.route?.length ? html`<dt>${word('route', o)}</dt><dd><span class="acm-path">${o.route.map((s, j) => html`${j ? html`<i>→</i>` : ''}<span>${s}</span>`)}</span></dd>` : ''}</dl>
  </div>`)}</div>`;
}
