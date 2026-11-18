/*
 * Stale line: one line that says the values below are not current (a source is down, the data is from before) and, optionally, where to
 * see why: a status mark with its words (kind: warn by default, idle with a clock for a value from before) and a link button after it.
 */
import { html } from '../core/html.js';
import * as statusIcon from './status-icon.js';
import * as button from './button.js';

export const name = 'stale-line';

export const css = `
.stl { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; }
.stl > [data-c="status-icon"] { white-space: normal; overflow-wrap: anywhere; }
`;

/** @param {{text: string, kind?: 'warn'|'error'|'idle'|'perm', icon?: string, action?: {label: string, action: string, arg?: any}}} p */
export function render(p) {
  return html`<div class="stl" data-c="stale-line">${statusIcon.render({ kind: p.kind || 'warn', icon: p.icon, text: p.text })}${p.action ? button.render({ label: p.action.label, variant: 'link', action: p.action.action, arg: p.action.arg }) : ''}</div>`;
}
