/*
 * Row under the composer (outside the card): left buttons, spacer, right buttons, trailing extra (usage indicator and so on).
 */
import { html, cx } from '../core/html.js';

export const name = 'composer-toolbar';

export const css = `
.ctb { height: var(--ctb-h); display: flex; align-items: center; gap: var(--ctb-gap); margin-top: var(--ctb-mt); padding: 0 var(--ctb-pad-end) 0 var(--ctb-pad-start); min-width: 0; }
.ctb .gap { flex: 1; margin-left: calc(-1 * var(--ctb-gap)); }
.ctb .pair { display: flex; align-items: center; min-width: 0; gap: var(--ctb-pair-gap); }
/* in a narrow composer the model name gives way first (ellipsis), the icon and effort stay whole */
.ctb .pair .tbb.model { flex-shrink: 1; overflow: hidden; }
.ctb .pair .tbb.model .fit { flex-shrink: 1; min-width: 0; }
.ctb > .tbb { flex-shrink: 1; overflow: hidden; }
/* narrow (reference at a 900 window): the left buttons keep only their icon and chevron */
.ctb-host { container-type: inline-size; }
@container (max-width: 360px) { .ctb > .tbb { flex-shrink: 0; } .ctb > .tbb .v { display: none; } } /* quality:literal: a container or media query cannot read a token */
.ctb.wide { padding: 0 var(--ctb-wide-pad-end) 0 var(--ctb-wide-pad-start); margin-top: var(--space-1_5); }
`;

/** @param {{left: any[], right: any[], end?: any, wide?: boolean}} p  right is a joined pair (model + effort) */
export function render(p) {
  return html`<div class="ctb-host"><div class="${cx('ctb', p.wide && 'wide')}" data-c="composer-toolbar">${p.left}<span class="gap"></span><span class="pair">${p.right}</span>${p.end || ''}</div></div>`;
}
