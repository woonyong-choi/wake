/*
 * Terminal panel: the bottom split panel of the center card (app-frame dock slot): it spans the card width, flush with its edges (no rounded
 * corners); the sidebar and the AI panel keep the full window height. Its head is the AI panel head's row (height, side padding, 13/500 title,
 * a 14 muted icon, a small tertiary close button); the body is the terminal with the panel's inner padding and the app's mono type.
 * When expanded, the header uses the center card's native top bar typography, controls and insets.
 * The panel uses the center card fill and the AI panel's motion. The top edge is a drag strip (--dock-grip, row-resize)
 * that sets the height (--dock-h). The body belongs to the terminal (data-own-children): one host per session, only the current one shown.
 */
import { html } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { t } from '../core/i18n.js';
import * as iconButton from './icon-button.js';

export const name = 'terminal-panel';

export const css = `
.frame-dock { flex: none; height: 0; overflow: hidden; visibility: hidden; transition: height var(--motion-panel-close-dur) var(--motion-panel-close-ease), visibility 0s linear var(--motion-panel-close-dur); }
.frame-dock.open { height: var(--dock-h); visibility: visible; transition: height var(--motion-panel-open-dur) var(--motion-panel-open-ease), visibility 0s; }
.frame-dock.open.expanded { height: 100%; border-radius: var(--frame-l, 0) var(--frame-r, 0) var(--frame-r, 0) var(--frame-l, 0); corner-shape: var(--corner-round); }
.frame-main:has(> .frame-dock.open.expanded) > .frame-panes { overflow: clip; }
.frame-dock.dragging { transition: none; }
.frame-dock.expanded .tpn-grip { display: none; } /* quality:instant: the maximized panel cannot be dragged */
.tpn-expand > [hidden] { display: none; } /* quality:instant: only the current size action is available */
@media (prefers-reduced-motion: reduce) { .frame-dock, .frame-dock.open { transition: none; } }
.tpn { position: relative; height: 100%; display: flex; flex-direction: column; background: var(--content); border-top: var(--line) solid var(--border); }
.tpn-grip { position: absolute; left: 0; right: 0; top: calc(var(--dock-grip) / -2); height: var(--dock-grip); cursor: row-resize; z-index: 1; -webkit-app-region: no-drag; }
.tpn-head { height: var(--topbar-h); flex: none; display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--pn-head-pad-end) 0 var(--pn-head-pad-start); border-bottom: var(--line) solid var(--border); }
.tpn:has(.tpn-host.on) .tpn-head { background: var(--term-session-bg, var(--term-bg)); border-bottom-color: color-mix(in srgb, var(--term-session-fg, var(--foreground)) 18%, transparent); }
.tpn-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-1_5); font-size: var(--text-native-sm); font-weight: var(--weight-medium); color: var(--foreground); }
.tpn-title .wi { flex: none; width: var(--icon-sm); height: var(--icon-sm); color: var(--muted-foreground); }
.frame-dock.expanded .tpn { border-top: 0; }
.frame-dock.expanded .tpn-head { gap: 0; padding: 0 var(--tb-pad-end) 0 calc(var(--tb-pad-start) + var(--tb-ident-pad-start)); font-family: var(--font-native); -webkit-app-region: drag; }
.frame-dock.expanded .tpn-head .ib { width: var(--tb-btn-w); -webkit-app-region: no-drag; }
.frame-dock.expanded .tpn-head .ib .wi { width: var(--tb-icon); height: var(--tb-icon); }
.frame-dock.expanded .tpn-title { gap: var(--tb-ident-gap); font-size: var(--text-native-ident); font-weight: var(--weight-semibold); color: var(--n-label); }
.frame-dock.expanded .tpn-title .wi { width: var(--tb-ident-icon); height: var(--tb-ident-icon); color: var(--n-secondary); }
.tpn:has(.tpn-host.on) .tpn-title { color: var(--term-session-fg, var(--foreground)); }
.tpn:has(.tpn-host.on) .tpn-head .wi { color: color-mix(in srgb, var(--term-session-fg, var(--foreground)) 74%, transparent); }
.tpn-body { flex: 1; min-height: 0; position: relative; background: var(--term-bg); }
.tpn-body:has(> .tpn-host.on) { background: var(--term-session-bg, var(--term-bg)); }
.tpn-host { position: absolute; inset: var(--space-2) var(--pn-head-pad-start); display: none; } /* quality:instant: switching sessions, like switching tabs */
.frame-dock.expanded .tpn-host { inset-inline: calc(var(--tb-pad-start) + var(--tb-ident-pad-start)); }
.tpn-host.on { display: block; }
.tpn-host.on:has(> .tpn-screen) { display: flex; flex-direction: column; }
.tpn-note { flex: none; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--font-mono); font-size: var(--term-text); line-height: var(--term-leading); color: var(--term-session-fg, var(--term-fg)); } /* the app's own lines above the screen: prose in the page's text flow, not in terminal cells */
.tpn-note[hidden] { display: none; } /* quality:instant: no line, no room */
.tpn-screen { flex: 1; min-height: 0; }
.tpn-host .xterm { height: 100%; }
.tpn-host .xterm-viewport { background: transparent !important; }
`;

/** @param {{title: string, close: string, expand?: string}} p  close: the action that hides the panel */
export function render(p) {
  return html`<section class="tpn" data-c="terminal-panel" aria-label="${p.title}">
    <div class="tpn-grip" data-tpn-grip aria-hidden="true"></div>
    <div class="tpn-head"><span class="tpn-title">${icon('terminal')}<span class="trunc">${p.title}</span></span>${p.expand ? html`<span class="tpn-expand" data-tpn-expand><span data-tpn-expanded="false">${iconButton.render({ icon: 'chevron-up-small', tip: t('terminal.expand'), size: 'sm', variant: 'tertiary', action: p.expand })}</span><span data-tpn-expanded="true" hidden>${iconButton.render({ icon: 'chevron-down-small', tip: t('terminal.restoreSize'), size: 'sm', variant: 'tertiary', action: p.expand })}</span></span>` : ''}${iconButton.render({ icon: 'cross-small', tip: t('terminal.hide'), size: 'sm', variant: 'tertiary', action: p.close })}</div>
    <div class="tpn-body" data-tpn-body data-own-children></div>
  </section>`;
}
