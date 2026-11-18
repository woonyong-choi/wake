/*
 * Status icon: one shape per state (with its color and a short text next to it, never color alone). The shapes come from the icon role table
 * (status-*), so a different icon set changes them in one place.
 *   ok       circle check, success color          (connected, working)
 *   warn     triangle with exclamation, amber     (something to look at: a warning, a pending or partial state, a count that should be zero)
 *   fix      triangle with exclamation, orange    (the person acts: install, sign in, type a value)
 *   error    circle with exclamation, red         (something failed on this side: network, a command, an unexpected answer)
 *   perm     lock, neutral                        (a permission the person's credential lacks; nothing is wrong, it waits for a grant)
 *   unknown  circle question, muted               (an answer nobody expected)
 *   idle     empty circle, muted                  (nothing to do: not connected yet, or stopped by the person)
 *   busy     spinner, muted grey                  (being checked: what is going on now; its words stay muted)
 * Size and stroke as a row icon (16). label is read by assistive tech. attention: a problem waiting for the person keeps a soft ring
 * spreading out (busy spins): nothing that waits or works is ever still.
 * icon: a shape that names what the state is about (for example an action that is allowed or denied); the color still comes from kind.
 * text: the short words shown next to the shape (12, 6 apart): muted, or in the state color for error, warn and fix ("CrashLoopBackOff" red);
 * a list or row end that names a state ("Pending" with the spinning ring).
 * statusIcon.group(kind) is the heading mark of a group of such items: group-ok (check), group-check (wrench), group-perm (lock).
 */
import { html } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'status-icon';

export const css = `
.sti { display: inline-grid; place-items: center; flex-shrink: 0; width: var(--space-4); height: var(--space-4); }
.sti .wi { width: var(--space-4); height: var(--space-4); }
.sti.ok { color: var(--success-content); } /* the mark and its words take one tone token per state (the -content tone, readable as words on the ground) */
.sti.warn { color: var(--warning-content); }
.sti.fix { color: var(--serious); }
.sti.error { color: var(--destructive-content); }
.sti.perm { color: var(--muted-foreground); }
.sti.unknown, .sti.idle { color: var(--muted-foreground); }
.sti.busy { color: var(--muted-foreground); }
.sti.busy .wi { animation: spin var(--dur-spin) linear infinite; }
.sti.attn { position: relative; border-radius: var(--r-round); }
.sti.attn::after { content: ""; position: absolute; inset: 0; border-radius: inherit; animation: ripple var(--dur-ripple) var(--ease-standard) infinite; }
@keyframes ripple { from { box-shadow: 0 0 0 0 color-mix(in oklab, currentColor 45%, transparent); } to { box-shadow: 0 0 0 var(--ripple) transparent; } }
@media (prefers-reduced-motion: reduce) { .sti.attn::after { animation: none; } }
@keyframes spin { to { transform: rotate(360deg); } }
.sti-text { display: inline-flex; align-items: center; gap: var(--space-1_5); min-width: 0; font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; }
.sti-text:has(.sti-label) { max-width: 100%; vertical-align: middle; }
.sti-label { overflow: hidden; text-overflow: ellipsis; }
.sti-text.error { color: var(--destructive-content); } .sti-text.warn { color: var(--warning-content); } .sti-text.fix { color: var(--serious); }
.sti-group { display: inline-grid; place-items: center; color: var(--muted-foreground); }
.sti-group .wi { width: var(--icon-sm); height: var(--icon-sm); }
`;

const KINDS = ['ok', 'warn', 'fix', 'error', 'perm', 'unknown', 'busy', 'idle'];

/** @param {{kind: 'ok'|'warn'|'fix'|'error'|'perm'|'unknown'|'busy'|'idle', label?: string, icon?: string, attention?: boolean, text?: string, subject?: string, reveal?: boolean}} p */
export function render(p) {
  const kind = KINDS.includes(p.kind) ? p.kind : 'unknown';
  if (p.subject) return html`<span class="sti-text ${kind}" data-c="status-icon" data-status-subject>${render({ ...p, subject: undefined, text: undefined, label: undefined })}${p.subject}</span>`;
  if (kind === 'ok' && p.text) return render({ ...p, text: undefined, label: p.label || p.text });
  if (p.text) return html`<span class="sti-text ${kind}" data-c="status-icon">${render({ ...p, text: undefined, label: undefined })}${p.reveal ? html`<span class="sti-label" data-tip="${p.text}" data-tip-overflow>${p.text}</span>` : p.text}</span>`;
  return html`<span class="sti ${kind}${p.attention ? ' attn' : ''}" data-c="status-icon"${p.label ? html` role="img" aria-label="${p.label}"` : html` aria-hidden="true"`}>${icon(p.icon || 'status-' + kind)}</span>`;
}
/** heading mark of a group: 'ok' | 'check' | 'perm' */
export const group = kind => html`<span class="sti-group" aria-hidden="true">${icon('group-' + kind)}</span>`;
