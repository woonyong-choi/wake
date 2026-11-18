/*
 * Sidebar: top row (traffic-light area + hide sidebar), pinned tiles (stay in place), section list (scrolls), bottom row (account, search).
 * Section content is built with the section component and passed in sections; tiles come from the pinned-tiles component.
 */
import { t } from '../core/i18n.js';
import { html, attrs } from '../core/html.js';

import * as iconButton from './icon-button.js';
import * as statusIcon from './status-icon.js';

export const name = 'sidebar';

export const css = `
.sidebar { display: flex; flex-direction: column; min-width: 0; height: 100%; font-family: var(--font-native); font-size: var(--text-native); line-height: var(--leading-native); color: var(--n-label); user-select: none; -webkit-user-select: none; }
.sidebar .pt-tile .fav[data-fav^="brand-"] { background: transparent; color: var(--n-icon); }
.sidebar-top { height: var(--topbar-h); display: flex; align-items: center; justify-content: flex-end; padding: 0 var(--sb-pad-end) 0 var(--traffic-light-w); flex-shrink: 0; -webkit-app-region: drag; }
.sidebar-top > * { -webkit-app-region: no-drag; }
/* the list ends with room above the bottom row once it scrolls (measured) */
.sidebar-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-bottom: var(--sb-scroll-end); }
.sidebar-bottom { height: var(--sb-bottom-h); display: flex; align-items: center; justify-content: space-between; padding: 0 var(--sb-pad-end) 0 var(--sb-bottom-pad-start); flex-shrink: 0; }
.sidebar-update { position: relative; width: var(--control-h-sm); height: var(--control-h-sm); border-radius: var(--r-pill); margin: var(--space-1) var(--sb-pad-end) var(--space-1) var(--sb-bottom-pad-start); flex-shrink: 0; }
.sidebar-update .ib { border-radius: var(--r-pill); }
.sidebar-update-ring { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; fill: none; stroke: currentColor; stroke-width: var(--line); color: var(--n-label); transform: rotate(-90deg); }
.sidebar-update-busy { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.sidebar-update-busy .sti { width: 100%; height: 100%; }
.sidebar-update-busy .wi { width: 100%; height: 100%; }
@media (prefers-reduced-motion: reduce) { .sidebar-update-busy .wi { animation: none; } }
`;

/**
 * @param {{top, tiles?, sections, bottom, update?}} p  top and bottom are button fragments, tiles a pinned-tiles fragment, sections a list of section fragments
 */
export function render(p) {
  return html`<nav class="sidebar" data-c="sidebar" data-surface="material" aria-label="${t('shell.sidebar.label')}">
    <div class="sidebar-top">${p.top}</div>
    ${p.tiles || ''}
    <div class="sidebar-scroll" data-scroll="sidebar">${p.sections}</div>
    ${p.update ? updateHtml(p.update) : ''}
    <div class="sidebar-bottom">${p.bottom}</div>
  </nav>`;
}

function updateHtml(p) {
  const label = t(p.label);
  return html`<div class="sidebar-update"${attrs({ role: p.disabled ? 'group' : null, tabindex: p.disabled ? 0 : null, 'aria-label': p.disabled ? label : null, 'data-tip': p.disabled ? label : null })}>
    ${iconButton.render({ icon: p.icon || 'download', tip: label, label, size: 'sm', variant: 'native', action: p.action ? 'kit.update.' + p.action : undefined, disabled: p.disabled })}
    ${p.progress === null ? '' : html`<svg class="sidebar-update-ring" viewBox="0 0 32 32" role="progressbar" aria-label="${t(p.status)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.progress}"><!-- quality:drawing: byte progress ring --><circle cx="16" cy="16" r="15" pathLength="100" stroke-dasharray="${p.progress} 100"></circle></svg>`}
    ${p.busy ? html`<span class="sidebar-update-busy"${attrs({ role: 'status', 'aria-label': t(p.status || p.label) })}>${statusIcon.render({ kind: 'busy' })}</span>` : ''}
  </div>`;
}
