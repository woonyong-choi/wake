/*
 * Center content frame.
 * variant 'scroll': scroll area filling the space under the top bar (default).
 * variant 'inset': a left nav on the window ground and the body as the one content card beside it (settings, as the reference app lays it out).
 * The shell draws no card of its own around such a page (.frame-main.bare), so there is never a card inside a card; the body card takes the
 * content card's corner and edge. The card does not scroll; the area inside it does, so its outline never scrolls away.
 */
import { html, cx } from '../core/html.js';

export const name = 'content-card';

export const css = `
.cc { flex: 1; min-height: 0; overflow: auto; position: relative; }
.cc-split { flex: 1; min-height: 0; display: flex; }
.cc-card { flex: 1; min-width: 0; margin-left: var(--window-gap); display: flex; background: var(--content); border-radius: var(--r-window); corner-shape: var(--corner-round); box-shadow: var(--shadow-frame); }
.cc.inset { border-radius: inherit; }
`;

/** @param {{variant?: 'scroll'|'inset', nav?, children}} p  nav is the navigation placed on the left when inset */
export function render(p) {
  if (p.variant === 'inset') return html`<div class="cc-split" data-c="content-card">${p.nav}<div class="cc-card"><div class="cc inset" data-scroll="content">${p.children}</div></div></div>`;
  return html`<div class="${cx('cc')}" data-c="content-card" data-scroll="content">${p.children}</div>`;
}
