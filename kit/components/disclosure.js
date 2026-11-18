/*
 * Disclosure: a muted 14 text button with a chevron ("Advanced") that opens a region under it.
 * The chevron turns (right -> down for 'caret', down -> up for 'chevron') and the region opens by height over the collapse duration.
 */
import { html, cx } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'disclosure';

export const css = `
.dsc-btn { display: inline-flex; align-items: center; gap: var(--space-1); height: var(--control-h-sm); padding: 0 var(--space-1); margin-left: calc(-1 * var(--space-1)); border-radius: var(--r-control-sm); font-size: var(--text-sm); color: var(--muted-foreground); transition: color var(--dur-fast) var(--ease-standard); }
.dsc-btn:hover, .dsc-btn[aria-expanded="true"] { color: var(--foreground); }
.dsc-btn .wi { transition: transform var(--dur-collapse) var(--ease-out); }
.dsc.chevron .dsc-btn { flex-direction: row-reverse; }
.dsc.caret .dsc-btn[aria-expanded="true"] .wi { transform: rotate(90deg); }
.dsc.chevron .dsc-btn[aria-expanded="true"] .wi { transform: rotate(180deg); }
/* afterimage: closing, the content fades where it stands and the height follows after it; opening, the height grows at once and the content fades in behind it */
.dsc-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-collapse) var(--ease-out) var(--dur-ghost-out); }
.dsc-body > div { overflow: hidden; min-height: 0; opacity: 0; transition: opacity var(--dur-ghost-out) var(--ease-standard); }
.dsc-btn[aria-expanded="true"] + .dsc-body, .dsc:has(.dsc-head[aria-expanded="true"]) > .dsc-body { grid-template-rows: 1fr; transition-delay: 0s; }
.dsc-btn[aria-expanded="true"] + .dsc-body > div, .dsc:has(.dsc-head[aria-expanded="true"]) > .dsc-body > div { opacity: 1; transition-duration: var(--dur-ghost-in); transition-delay: var(--dur-ghost-delay); }
.dsc-inner { padding-top: var(--space-3); }
/* card: the head is the row of a rounded card (icon, title, a pill at the end); opening grows the card in place */
.dsc.dsc-card { border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--surface-secondary); border: var(--line) solid var(--border-surface); box-shadow: var(--shadow-md); overflow: hidden; transition: background var(--dur-fast) var(--ease-standard); }
.dsc.dsc-card:hover { background: var(--surface-primary); }
.dsc-head { display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: var(--widget-row-h); padding: 0 var(--space-4); font-size: var(--text-native-sm); text-align: start; }
.dsc-head .dsc-t { flex: 1; font-weight: var(--weight-medium); } .dsc-head .dsc-end { padding: var(--space-1) var(--space-3); border-radius: var(--r-pill); background: var(--secondary); font-size: var(--text-xs); font-weight: var(--weight-semibold); } /* the secondary face: the same as the raised face in the dark theme, and still seen on the white card in the light one */
.dsc-head:hover .dsc-end { background: var(--accent); }
.dsc-head:active { opacity: var(--press-opacity); }
.dsc-head .on-open { display: none; } .dsc-head[aria-expanded="true"] .on-open { display: inline; } .dsc-head[aria-expanded="true"] .on-closed { display: none; }
.dsc.dsc-card .dsc-inner { padding: 0 var(--space-4) var(--space-4); }
`;

export const hook = 'data-dsc';

/** @param {{label: string, children: any, open?: boolean, style?: 'caret'|'chevron'|'card', action?: string, icon?: string, activeLabel?: string, end?: string, activeEnd?: string}} p  card: label is the closed title, activeLabel the open one; end and activeEnd are the pill at the end of the head */
export function render(p) {
  if (p.style === 'card') return html`<div class="dsc dsc-card" data-c="disclosure"><button type="button" class="dsc-head" data-dsc${p.action ? html` data-action="${p.action}"` : ''} aria-expanded="${String(!!p.open)}">${p.icon ? icon(p.icon, 'lg') : ''}<span class="dsc-t"><span class="on-closed">${p.label}</span><span class="on-open">${p.activeLabel ?? p.label}</span></span><span class="dsc-end"><span class="on-closed">${p.end ?? ''}</span><span class="on-open">${p.activeEnd ?? p.end ?? ''}</span></span></button><div class="dsc-body"><div><div class="dsc-inner">${p.children}</div></div></div></div>`;
  const caret = p.style === 'caret';
  return html`<div class="${cx('dsc', caret ? 'caret' : 'chevron')}" data-c="disclosure"><button type="button" class="dsc-btn" data-dsc${p.action ? html` data-action="${p.action}"` : ''} aria-expanded="${String(!!p.open)}">${icon(caret ? 'chevron-right-small' : 'chevron-down-small', 'sm')}<span>${p.label}</span></button><div class="dsc-body"><div><div class="dsc-inner">${p.children}</div></div></div></div>`;
}

export function attach(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-dsc]'); if (!b || b.hasAttribute?.('data-action')) return; /* with an action the page owns the state and renders it */
    b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true'));
  });
}
