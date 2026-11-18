/*
 * Intro card at the top of a settings page: a group card holding one row (4 inside) with the text on the left
 * (14 x 12 inside, title 16, description 14 muted, optional actions under it) and a 288 x 160 picture (radius lg) on the right.
 * The picture is any fragment the app draws (built from components); it never takes pointer events.
 */
import { html } from '../core/html.js';
import * as group from './settings-group.js';

export const name = 'intro-card';

export const css = `
.intro { display: flex; align-items: stretch; gap: var(--space-2_5); padding: var(--space-1); background: var(--surface-secondary); }
.intro-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: var(--space-3) var(--space-3_5); }
.intro-title { font-size: var(--intro-title-size, var(--text-base)); font-weight: var(--weight-medium); color: var(--primary); }
.intro-desc { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); }
.intro-acts { margin-top: auto; padding-top: var(--space-4); display: flex; align-items: center; gap: var(--space-2); }
.intro-pic { width: var(--intro-pic-w); height: var(--intro-pic-h); flex-shrink: 0; border-radius: var(--r-control); corner-shape: var(--corner); overflow: hidden; pointer-events: none; user-select: none; background: var(--muted); display: grid; place-items: center; }
`;

/** @param {{title: string, description?: string, actions?: any, picture?: any}} p */
export function render(p) {
  return group.render({ children: html`<div class="intro" data-c="intro-card"><div class="intro-txt"><div class="intro-title">${p.title}</div>${p.description ? html`<div class="intro-desc">${p.description}</div>` : ''}${p.actions ? html`<div class="intro-acts">${p.actions}</div>` : ''}</div><div class="intro-pic" aria-hidden="true">${p.picture || ''}</div></div>` });
}
