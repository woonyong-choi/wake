/*
 * Sidebar section: header (section-header) + lead rows (stay when collapsed) + content. A full-width rule only above the tabs section
 * (kind tabs), which separates it from the sections above it; the sections above it follow each other without a rule (measured).
 * Collapse and expand animate the content height (grid rows 0fr <-> 1fr) and turn the header chevron; the state is reported for storage (attach).
 */
import { html, cx } from '../core/html.js';
import * as header from './section-header.js';

export const name = 'section';

export const css = `
.sb-sec { padding: 0 0 var(--sb-sec-pad-bottom); }
.sb-sec + .sb-sec { padding-top: var(--line); }
.sb-sec + .sb-sec[data-kind="tabs"] { box-shadow: inset 0 var(--hairline) 0 var(--n-divider); }
.sb-sec-body { display: grid; grid-template-rows: 1fr; transition: grid-template-rows var(--motion-section-open-dur) var(--motion-section-open-ease); }
.sb-sec-body.collapsed { grid-template-rows: 0fr; transition: grid-template-rows var(--motion-section-close-dur) var(--motion-section-close-ease); }
.sb-sec-inner { min-height: 0; overflow: hidden; }
.sb-sec-head + .sb-sec-lead > .sb-row:first-child, .sb-sec-head + .sb-sec-body > .sb-sec-inner > .sb-row:first-child { margin-top: var(--sb-first-row-gap); }
/* Collection (bookmark-style) section: its rows sit slightly lower */
.sb-sec[data-variant="collection"] .sb-sec-head + .sb-sec-body > .sb-sec-inner > .sb-row:first-child { margin-top: calc(var(--sb-first-row-gap) + var(--sb-collection-shift)); }
.sb-sec[data-variant="collection"] { padding-bottom: calc(var(--sb-sec-pad-bottom) - var(--sb-collection-shift)); }
`;

/**
 * @param {{id: string, label: string, tip?: string, collapsed?: boolean, kind?: 'tabs', variant?: 'collection', context?: string, lead?, body}} p  lead: rows that stay visible when collapsed; context: header right-click menu
 */
export function render(p) {
  return html`<section class="sb-sec" data-c="section" data-section="${p.id}"${p.kind ? html` data-kind="${p.kind}"` : ''}${p.variant ? html` data-variant="${p.variant}"` : ''}>
    ${header.render({ id: p.id, label: p.label, tip: p.tip, collapsed: p.collapsed, context: p.context })}
    ${p.lead && p.lead.length ? html`<div class="sb-sec-lead">${p.lead}</div>` : ''}
    <div class="${cx('sb-sec-body', p.collapsed && 'collapsed')}" id="sec-${p.id}"><div class="sb-sec-inner">${p.body}</div></div>
  </section>`;
}

/* Collapse behavior: pressing the header toggles the content rows (CSS animates the height and the chevron), then reports the state */
export function attach(root, ctx) {
  root.addEventListener('click', e => {
    const head = e.target.closest('.sb-sec-head');
    if (!head) return;
    const body = head.parentElement.querySelector('.sb-sec-body');
    const collapsing = !body.classList.contains('collapsed');
    body.classList.toggle('collapsed', collapsing);
    head.setAttribute('aria-expanded', String(!collapsing));
    ctx.emit('section-toggle', { id: head.dataset.id, collapsed: collapsing }, { render: false });
  });
}
