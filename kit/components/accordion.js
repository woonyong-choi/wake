/*
 * Accordion (questions and answers) inside a settings group: each item is a row whose trigger is 14/500 with a 16 chevron on the right.
 * Opening rotates the chevron 180 degrees and opens the answer (14, muted) by height over the collapse duration (ease-out); closing reverses it.
 * Several items may be open at once. Focus shows the focus ring.
 */
import { html, cx } from '../core/html.js';
import { icon } from '../icons/icons.js';
import * as group from './settings-group.js';

export const name = 'accordion';

export const css = `
.acc-item { background: var(--surface-secondary); padding: 0 var(--space-2_5) 0 var(--space-3_5); }
.acc-trigger { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: var(--srow-min-h); padding: var(--space-2_5) 0; text-align: left; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--primary); border-radius: var(--r-control); outline: none; }
.acc-trigger:hover .wi { color: var(--foreground); }
.acc-trigger:focus-visible { box-shadow: 0 0 0 var(--focus-w) var(--focus); }

.acc-trigger .wi { color: var(--muted-foreground); flex-shrink: 0; transition: transform var(--dur-collapse) var(--ease-out); }
.acc-item.open .acc-trigger .wi { transform: rotate(180deg); }
.acc-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-collapse) var(--ease-out); }
.acc-item.open .acc-body { grid-template-rows: 1fr; }
.acc-body > div { overflow: hidden; min-height: 0; }
.acc-text { padding: 0 0 var(--space-2_5); font-size: var(--text-sm); color: var(--muted-foreground); }
.acc-text p { margin: 0 0 var(--space-4); }
.acc-text p:last-child { margin: 0; }
`;

export const hook = 'data-acc';

/** @param {{id: string, items: {id: string, title: string, body: any, open?: boolean}[]}} p */
export function render(p) {
  return group.render({ children: p.items.map(it => html`<div class="${cx('acc-item', it.open && 'open')}" data-c="accordion" data-acc="${p.id}"><button class="acc-trigger" aria-expanded="${String(!!it.open)}" aria-controls="acc-${p.id}-${it.id}"><span>${it.title}</span>${icon('chevron-down-small')}</button><div class="acc-body" id="acc-${p.id}-${it.id}" role="region"><div><div class="acc-text">${it.body}</div></div></div></div>`) });
}

export function attach(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('.acc-trigger'); if (!b) return;
    const it = b.closest('.acc-item'), open = !it.classList.contains('open');
    it.classList.toggle('open', open);
    b.setAttribute('aria-expanded', String(open));
  });
}
