/*
 * Elapsed time: the seconds since a moment ("3s", "1m 5s"), counting up once a second while it is on screen (a running step, waiting
 * for an answer). The count is written into the element in place, so a redraw never resets or jumps it.
 */
import { html } from '../core/html.js';
import { formatSeconds } from './step-group.js';

export const name = 'elapsed';
export const hook = 'data-since';

export const css = `
.elp { font-variant-numeric: tabular-nums; }
`;

const secs = since => Math.max(0, Math.floor((Date.now() - since) / 1000));

/** @param {{since: number}} p  since: start time (ms) */
export function render(p) {
  return html`<span class="elp" data-c="elapsed" data-since="${p.since}">${formatSeconds(secs(p.since))}</span>`;
}

export function attach(root) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  if (!win || win.__kitElapsed) return;
  win.__kitElapsed = win.setInterval(() => {
    for (const el of doc.querySelectorAll('[data-since]')) { const s = formatSeconds(secs(+el.dataset.since)); if (el.textContent !== s) el.textContent = s; }
  }, 1000);
}
