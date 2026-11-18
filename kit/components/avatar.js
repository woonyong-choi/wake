/*
 * Person mark: round cell with the initial on a secondary fill (or an image), followed by the name when given.
 * Sizes: md 20 (settings rows, lists), sm 16 (inline with text).
 */
import { html, cx } from '../core/html.js';

export const name = 'avatar';

export const css = `
.av { display: inline-flex; align-items: center; gap: var(--space-1_5); min-width: 0; }
.av-c { width: var(--avatar); height: var(--avatar); border-radius: var(--r-round); background: var(--secondary); color: var(--foreground); display: inline-grid; place-items: center; flex-shrink: 0; font-size: var(--text-2xs); font-weight: var(--weight-medium); line-height: 1; overflow: hidden; text-transform: uppercase; }
.av-c img { width: 100%; height: 100%; object-fit: cover; }
.av.sm .av-c { width: var(--avatar-sm); height: var(--avatar-sm); font-size: var(--text-3xs); }
.av-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/** @param {{name: string, src?: string, size?: 'md'|'sm', showName?: boolean}} p */
export function render(p) {
  const initial = [...(p.name || '?')][0];
  return html`<span class="${cx('av', p.size === 'sm' && 'sm')}" data-c="avatar"><span class="av-c" aria-hidden="${p.showName ? 'true' : 'false'}" title="${p.showName ? '' : p.name}">${p.src ? html`<img src="${p.src}" alt="">` : initial}</span>${p.showName ? html`<span class="av-n">${p.name}</span>` : ''}</span>`;
}
