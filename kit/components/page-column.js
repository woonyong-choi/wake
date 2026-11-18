/*
 * Page column: the centered column a page's content sits in, with the page padding.
 * The card's inner rules are one set of tokens: --pane-pad-top, --pane-pad-inline, --pane-pad-bottom and --pane-max-w (an app sets them in one block).
 * The side padding never goes below --scroll-clear (the scroll bar's 16 wide track: the thumb sits in it), so the thumb never meets content; the bottom padding never goes
 * below the card's corner radius, so scrolled content ends inside the curve.
 *   width 'home' 680 (a home page under its title and composer), 'list' 1040 (lists, gallery), 'chat' 820 (detail and conversation body).
 *   40 above (home 56, chat 20) and 64 below; narrow pages keep 16 on each side.
 */
import { html, cx } from '../core/html.js';

export const name = 'page-column';

export const css = `
.pcol-scroll { flex: 1; min-height: 0; overflow: hidden auto; isolation: isolate; }
.pcol { width: 100%; margin: 0 auto; padding: var(--pane-pad-top, var(--space-10)) max(var(--pane-pad-inline, var(--space-8)), var(--scroll-clear)) max(var(--pane-pad-bottom, var(--space-16)), var(--r-window)); min-width: 0; }
.pcol.home { max-width: var(--pane-max-w, calc(var(--home-col-w) + 2 * var(--space-8))); padding-top: var(--pane-pad-top, calc(var(--space-10) + var(--space-4))); }
.pcol.list { max-width: var(--pane-max-w, var(--list-col-w)); }
.pcol.chat { max-width: var(--pane-max-w, calc(var(--chat-col-w) + 2 * var(--space-8))); padding-top: var(--pane-pad-top, var(--space-5)); }
.pcol.pcol-header { flex-shrink: 0; padding-bottom: 0; }
.pcol-header + .pcol-scroll > .pcol { padding-top: var(--pane-section-gap, var(--space-3)); }
@container page (max-width: 760px) { .pcol { padding-left: max(var(--space-4), var(--scroll-clear)); padding-right: max(var(--space-4), var(--scroll-clear)); } } /* quality:literal: a container query cannot read a token */
`;

/** @param {{width: 'home'|'list'|'chat', children: any, scroll?: boolean, header?: boolean}} p */
export function render(p) {
  const column = html`<div class="${cx('pcol', p.width, p.header && 'pcol-header')}" data-c="page-column">${p.children}</div>`;
  return p.scroll ? html`<div class="pcol-scroll" data-scroll="content">${column}</div>` : column;
}
