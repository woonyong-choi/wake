/*
 * Layout grid: cards side by side (2 columns, 8 apart, 8 above), one column in a narrow page. Explicit three-column grids fit cards at a readable minimum width.
 * bleed: the grid sits in a settings column and is widened 14 outward, so its cards line up with the settings groups around it.
 */
import { html, cx } from '../core/html.js';

export const name = 'layout-grid';

export const css = `
.lgrid { display: grid; grid-template-columns: repeat(var(--lgrid-cols, 2), minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-2); }
.lgrid.one { --lgrid-cols: 1; }
.lgrid.bleed { margin-inline: calc(-1 * var(--space-3_5)); }
@container page (max-width: 760px) { .lgrid { --lgrid-cols: 1; } } /* quality:literal: a container or media query cannot read a token */
.lgrid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.lgrid.joined { gap: var(--line); padding: var(--line); background: var(--border); }
@container page (max-width: 680px) { .lgrid.four { grid-template-columns: repeat(2, minmax(0, 1fr)); } } /* quality:literal: container queries cannot read tokens */
@container page (max-width: 400px) { .lgrid.four { grid-template-columns: minmax(0, 1fr); } } /* quality:literal: container queries cannot read tokens */
.lgrid.fit { grid-template-columns: repeat(auto-fit, minmax(min(100%, max(var(--page-split-min), calc((100% - var(--space-2)) / 2))), 1fr)); }
.lgrid.fit > .ss + .ss { margin-top: 0; }
/* Three time-axis labels remain distinct at 256 CSS pixels; cap the explicit grid at three columns. */
.lgrid.three { grid-template-columns: repeat(auto-fit, minmax(min(100%, max(calc(var(--space-40) + var(--space-16) + var(--space-8)), calc((100% - 2 * var(--space-2)) / 3))), 1fr)); }
`;

/** @param {{columns?: 1|2|3|4, joined?: boolean, bleed?: boolean, fit?: boolean, children}} p */
export function render(p) {
  return html`<div class="${cx('lgrid', p.columns === 1 && 'one', p.columns === 3 && 'three', p.columns === 4 && 'four', p.joined && 'joined', p.bleed && 'bleed', p.fit && 'fit')}" data-c="layout-grid">${p.children}</div>`;
}
