/*
 * Verify card: whether a recovery holds, as content with no face (the summary bar or stage around it owns the face).
 *   The time figures (stable for, left to pass) belong in the head of the stage around the card, as named values; the card draws none.
 *   conditions  one row each, divided by hairlines: the state mark and the condition's name, then the state word (and the value) at the end.
 *               pass is the healthy mark, watch spins, fail is the error mark, unknown and unjudged are the empty muted mark; optional says so
 *   windows     the collection windows as named counts under the rows (collected, missed), never a fraction; min names how many are needed
 * labels overrides any word: { windows, missed, min, optional, states: { pass, watch, fail, unknown, unjudged } }
 */
import { html, attrs } from '../core/html.js';
import { t } from '../core/i18n.js';
import * as statusIcon from './status-icon.js';

export const name = 'verify-card';

export const css = `
.vfc { display: grid; gap: var(--space-3); min-width: 0; word-break: keep-all; overflow-wrap: anywhere; }
.vfc-rows { display: grid; }
.vfc-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); min-height: var(--control-h); border-block-start: var(--line) solid var(--border-surface); font-size: var(--text-sm); }
.vfc-row em { font-style: normal; font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.vfc-cap { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
`;

const KIND = { pass: 'ok', watch: 'busy', fail: 'error', unknown: 'idle', unjudged: 'idle' };
/* a label given by the page may name the count as {n} */
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/**
 * @param {{conditions: {id: string, label: string, state: 'pass'|'watch'|'fail'|'unknown'|'unjudged', value?: string, optional?: boolean}[],
 *   windows?: ('ok'|'miss'|'bad'|'none')[], min?: number, labels?: object}} p
 */
export function render(p) {
  const L = p.labels || {}, word = (k, vars = {}) => (L[k] != null ? fill(L[k], vars) : t('verify.' + k, vars)), state = s => L.states?.[s] ?? t('verify.state.' + s);
  const w = p.windows || [], count = (...k) => w.filter(x => k.includes(x)).length;
  const cap = w.length || p.min != null ? [
    w.length ? word('windows', { n: count('ok', 'bad') }) : '',
    w.length ? word('missed', { n: count('miss') }) : '',
    p.min != null ? word('min', { n: p.min }) : '',
  ].filter(Boolean) : [];
  return html`<div class="vfc" data-c="verify-card">
    <div class="vfc-rows">${(p.conditions || []).map(c => html`<div class="vfc-row"${attrs({ 'data-state': c.state })}>${statusIcon.render({ kind: KIND[c.state] ?? 'idle', subject: c.label })}<em>${[state(c.state), c.value, c.optional ? word('optional') : ''].filter(Boolean).join(' · ')}</em></div>`)}</div>
    ${cap.length ? html`<div class="vfc-cap">${cap.map(x => html`<span>${x}</span>`)}</div>` : ''}
  </div>`;
}
