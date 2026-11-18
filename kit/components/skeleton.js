/* Skeleton: gray bars in the row shape, a shimmer passes over 1.5 s linear */
import { html } from '../core/html.js';

export const name = 'skeleton';

export const css = `
.skel { display: block; border-radius: var(--r-control-sm); corner-shape: var(--corner); background: linear-gradient(to right, var(--secondary) 25%, var(--muted), var(--secondary) 75%); background-size: 200% 100%; animation: skel var(--dur-skeleton) linear infinite; }
@keyframes skel { from { background-position: 200% 0; } to { background-position: -200% 0; } }
`;

/** @param {{width?: string, height?: string}} p */
export function render(p = {}) {
  return html`<span class="skel" data-c="skeleton" style="width:${p.width || '100%'};height:${p.height || 'var(--leading-sm)'}"></span>`;
}
