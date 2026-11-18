/*
 * Picture choices (one of a few looks): each option is a 72 x 45 picture (radius md, inside a 1px transparent border) with a 12 label 2px
 * further under it. The chosen option gets a 3px ring in the brand color at 30% and a semibold foreground label; others are medium and
 * muted. Hover lifts the label color. Pictures are fragments the app draws (built from components).
 */
import { html } from '../core/html.js';

export const name = 'choice-cards';

export const css = `
.chc { display: flex; align-items: flex-start; gap: var(--space-4); }
.chc-o { display: flex; flex-direction: column; align-items: center; gap: var(--space-1_5); font-size: var(--text-xs); font-weight: var(--weight-medium); line-height: 1; color: var(--muted-foreground); transition: color var(--dur-fast) var(--ease-standard); }
.chc-o:hover { color: var(--foreground); }
.chc-pic { width: var(--choice-w); height: var(--choice-h); border: var(--space-px) solid transparent; border-radius: var(--r-control-sm); corner-shape: var(--corner); overflow: hidden; display: grid; place-items: center; transition: box-shadow var(--dur-fast) var(--ease-standard); }
.chc-pic > * { grid-area: 1 / 1; }
.chc-l { margin-top: var(--space-0_5); }
.chc-o[aria-checked="true"] { color: var(--foreground); font-weight: var(--weight-semibold); }
.chc-o[aria-checked="true"] .chc-pic { box-shadow: 0 0 0 var(--choice-ring) var(--choice-ring-color); }
.chc-o:focus-visible { outline: none; }
.chc-o:disabled { opacity: .5; pointer-events: none; }
.chc-o:focus-visible .chc-pic { box-shadow: 0 0 0 var(--focus-w) var(--focus); }
`;

/** @param {{options: {id: string, label: string, picture?: any, disabled?: boolean}[], value: string, action: string, key?: string, label?: string}} p  a disabled option is dimmed and cannot be chosen */
export function render(p) {
  return html`<div class="chc" role="radiogroup" data-c="choice-cards"${p.label ? html` aria-label="${p.label}"` : ''}>${p.options.map(o => html`<button class="chc-o" role="radio" aria-checked="${String(o.id === p.value)}"${o.disabled ? html` disabled` : ''} data-action="${p.action}" data-arg="${JSON.stringify(p.key ? { key: p.key, value: o.id } : o.id)}"><span class="chc-pic" aria-hidden="true">${o.picture || ''}</span><span class="chc-l">${o.label}</span></button>`)}</div>`;
}
