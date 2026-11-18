/*
 * Value text: a read-only value on one line (14/500 muted; size 'xs' 12 for times; compact values for images and paths; tabular digits).
 */
import { html, cx, attrs } from '../core/html.js';

export const name = 'value';

export const css = `
.val { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; font-variant-numeric: tabular-nums; }
.val.xs { font-size: var(--text-xs); font-weight: var(--weight-regular); }
.val.mono { font-size: var(--text-code); }
.val.time { min-width: var(--space-8); text-align: right; }
`;

/** @param {{text: string, size?: 'xs', mono?: boolean, time?: boolean, reveal?: boolean}} p */
export function render(p) {
  return html`<span class="${cx('val', p.size === 'xs' && 'xs', p.mono && 'mono', p.time && 'time')}" data-c="value"${attrs({ title: p.reveal ? null : p.text, 'data-tip': p.reveal ? p.text : null, 'data-tip-overflow': p.reveal ? '' : null })}>${p.text}</span>`;
}
