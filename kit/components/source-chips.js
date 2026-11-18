/*
 * Source chips: the data sources a screen reads through, as one wrapping row of small pills (a toolbar chip, --r-pill). Each chip is the
 * source's own mark (lg) and its name; a state other than connected follows as its status mark and words in the state colour (connected is the
 * name alone). The whole chip is a button that emits action with the item's arg (or its id); its title gives name · state · detail · last.
 *   state: 'ok'|'limited'|'perm'|'idle'|'error'|'busy' (limited reads as a warning, perm as the lock, busy spins)
 * labels.states overrides the state words: { ok, limited, perm, idle, error, busy }
 * screens: other screens of the same subject as the same chip after the sources, its mark and name alone (no state); each emits screenAction with its arg (or id)
 */
import { html, attrs } from '../core/html.js';
import { t } from '../core/i18n.js';
import { icon } from '../icons/icons.js';
import * as statusIcon from './status-icon.js';

export const name = 'source-chips';

export const css = `
.srcc { display: flex; flex-wrap: wrap; gap: var(--space-1_5); min-width: 0; }
.srcc-chip { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: var(--space-1_5); max-width: 100%; height: var(--control-h-sm); padding: 0 var(--space-2_5) 0 var(--space-1); border-radius: var(--r-pill); background: var(--secondary); font-size: var(--text-xs); color: var(--foreground); cursor: pointer; transition: background var(--dur-fast) var(--ease-standard); }
.srcc-chip:hover { background: var(--accent); }
.srcc-chip:focus-visible { box-shadow: 0 0 0 var(--focus-w) var(--focus); }
.srcc-chip > span:not([data-c]) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .srcc-chip { transition: none; } }
`;

export const KIND = Object.freeze({ ok: 'ok', limited: 'warn', perm: 'perm', idle: 'idle', error: 'error', busy: 'busy' });

/** @param {{items: {id: string, name: string, icon: string, state: keyof KIND, detail?: string, last?: string, arg?: any}[], action: string, labels?: {states?: object}, screens?: {id: string, name: string, icon: string, arg?: any}[], screenAction?: string}} p */
export function render(p) {
  const word = s => p.labels?.states?.[s] ?? t('source.' + (KIND[s] ? s : 'idle'));
  return html`<div class="srcc" data-c="source-chips">${(p.items || []).map(x => {
    const state = KIND[x.state] ? x.state : 'idle';
    return html`<button type="button" class="srcc-chip"${attrs({ 'data-state': state, 'data-action': p.action || null, 'data-arg': p.action ? x.arg ?? x.id : null, title: [x.name, word(state), x.detail, x.last].filter(Boolean).join(' · ') })}>${x.icon ? icon(x.icon, 'lg') : ''}<span>${x.name}</span>${state === 'ok' ? '' : statusIcon.render({ kind: KIND[state], text: word(state), reveal: true })}</button>`;
  })}${(p.screens || []).map(x => html`<button type="button" class="srcc-chip"${attrs({ 'data-action': p.screenAction || null, 'data-arg': p.screenAction ? x.arg ?? x.id : null, title: x.name })}>${x.icon ? icon(x.icon, 'lg') : ''}<span>${x.name}</span></button>`)}</div>`;
}
