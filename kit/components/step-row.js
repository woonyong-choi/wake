/*
 * One step line. Two forms:
 *   icon form (message-list, the AI's work in a step group): icon in a 24 cell on the left (16 muted, or a 6 dot), 1px line to the next step,
 *     text on the right (one line, ellipsis). While running a spinner replaces the icon.
 *   state form (progress lists: what the AI reads, the steps of an action being run): state picks the lead mark, the status icon of that state
 *     (run: busy spinner, done: ok check, fail: error, wait: idle empty circle, blocked: perm lock, off: idle). The row is compact: one line,
 *     28 high, no gap under it and no line joining it to the next.
 *     meta: a result or a live line, at the end of the row (muted, 12, tabular, one line with an ellipsis); it takes the free room and is right-aligned.
 *     live: meta is a live log line, in the mono face. In a short row the meta gives way first (ellipsis, the whole meta as its tooltip), then the
 *     text, which keeps at least 40% of the row (the meta at most 60%); the row never runs past its pane.
 * text stays on one line with an ellipsis in both forms.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import * as statusIcon from './status-icon.js';

export const name = 'step-row';

export const css = `
.sr { position: relative; display: flex; align-items: flex-start; gap: var(--space-1_5); padding-bottom: var(--space-2); font-size: var(--text-sm); }
.sr-mark { position: relative; display: flex; justify-content: center; width: var(--sr-mark); min-height: var(--sr-mark); flex-shrink: 0; align-self: stretch; }
.sr-mark::after { content: ""; position: absolute; top: var(--sr-mark); left: 50%; width: var(--line); height: calc(100% - var(--space-4)); min-height: var(--space-2); transform: translateX(-50%); background: var(--border); }
.sr:not(:has(+ .sr)) .sr-mark::after { display: none; }
.sr-ico { position: relative; z-index: 1; width: var(--sr-mark); height: var(--sr-mark); display: grid; place-items: center; color: var(--muted-foreground); }
.sr-dot { width: var(--sr-dot); height: var(--sr-dot); border-radius: var(--r-round); background: var(--muted-foreground-35); }
.sr-text { flex: 1; min-width: 0; line-height: var(--sr-mark); color: var(--muted-foreground); }
.sr-text code { font-family: inherit; font-size: var(--text-xs); color: var(--primary); }
.sr.running .sr-ico .wi { animation: spin var(--dur-spin) linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.sr.st { width: 100%; min-width: 0; max-width: 100%; align-items: center; min-height: var(--control-h-sm); padding-bottom: 0; gap: var(--space-2); }
.sr.st .sr-mark { align-self: center; min-height: 0; }
.sr.st .sr-mark::after { display: none; } /* a progress list is rows of state, not a path: nothing joins them */
.sr.st .sr-text { flex: 1 1 var(--sr-text-min); min-width: 0; contain: inline-size; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* the text keeps at least 40% of the row (the meta takes at most 60%) and the text has no min-content width of its own (contain: inline-size), so a pane that sizes to its content never widens the row */
.sr-meta { flex: 0 1000 auto; min-width: min(var(--space-12), 25%); max-width: 60%; font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; text-align: end; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* it takes the free room and keeps whole until the text is at its floor, then it is cut */
.sr-meta.live { font-family: var(--font-mono); }
`;

/* a step's state -> the status icon kind of its lead mark */
const KIND = { run: 'busy', done: 'ok', fail: 'error', wait: 'idle', blocked: 'perm', off: 'idle' };

/**
 * @param {{icon?: string, text: any, running?: boolean, state?: 'run'|'done'|'fail'|'wait'|'blocked'|'off', meta?: any, live?: boolean}} p
 *   text and meta are strings or html fragments; state selects the compact state form (icon and running are not used then)
 */
export function render(p) {
  if (p.state) {
    return html`<div class="sr st" data-c="step-row" data-state="${p.state}">
    <span class="sr-mark"><span class="sr-ico">${statusIcon.render({ kind: KIND[p.state] || 'idle' })}</span></span>
    <span class="sr-text trunc">${p.text}</span>${p.meta != null && p.meta !== '' ? html`<span class="${cx('sr-meta', p.live && 'live')}"${attrs({ 'data-tip': typeof p.meta === 'string' ? p.meta : null, 'data-tip-overflow': typeof p.meta === 'string' })}>${p.meta}</span>` : ''}
  </div>`;
  }
  return html`<div class="${cx('sr', p.running && 'running')}" data-c="step-row">
    <span class="sr-mark"><span class="sr-ico">${p.running ? icon('loader') : p.icon ? icon(p.icon) : html`<span class="sr-dot"></span>`}</span></span>
    <span class="sr-text trunc">${p.text}</span>
  </div>`;
}
