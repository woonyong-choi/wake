/*
 * Top bar (path bar): back, forward, reload, identity (icon + name), vertical rule, path, right-side buttons.
 * The path never repeats the identity; with no path left the rule is not drawn. The identity icon (the app's brand mark included) takes the chip's text color.
 * Without an identity (ident null: an app that shows none) the path starts right after the navigation buttons.
 * An identity with a menu is a chip that opens its popover (popover.js); right-side buttons with a menu open theirs.
 * Tooltips of the top bar open below it, as on the reference.
 * Narrow (as on the reference at a 900 window): the right-side buttons and the ask pill fold into a » button whose menu lists them, and a disabled forward button hides.
 * When the sidebar is hidden the traffic-light area and a show-sidebar button move in on the left.
 * zoom: while the zoom bubble shows, a zoom button (highlighted) sits before the right-side buttons; the bubble hangs from it.
 */
import { t } from '../core/i18n.js';
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import * as iconButton from './icon-button.js';

export const name = 'topbar';

export const css = `
.topbar { container-type: inline-size; height: var(--topbar-h); display: flex; align-items: center; padding: 0 var(--tb-pad-end) 0 var(--tb-pad-start); flex-shrink: 0; min-width: 0; font-family: var(--font-native); font-size: var(--text-native-sm); -webkit-app-region: drag; }
.topbar button, .topbar [role="button"] { -webkit-app-region: no-drag; }
.topbar.sidebar-hidden { padding-left: calc(var(--traffic-light-w) - var(--window-gap)); } /* the card starts a gap in from the window: the lights' room is measured from the window edge */
.topbar .nav-btn { width: var(--tb-btn-w); height: var(--control-h-sm); color: var(--n-secondary); border-radius: var(--r-control); display: grid; place-items: center; flex-shrink: 0; }
.topbar .nav-btn:hover { background: var(--n-bar-hover); color: var(--n-label); }
.topbar .nav-btn:disabled, .topbar .nav-btn[aria-disabled="true"] { opacity: .45; } .topbar .nav-btn[aria-disabled="true"]:hover { background: none; }
.topbar .nav-btn[aria-pressed="true"] { color: var(--foreground); background: var(--ghost-hover); }
.topbar .nav-btn .wi { width: var(--tb-icon); height: var(--tb-icon); }
.topbar .nav-btn.first { margin-right: var(--space-0_5); }
.ident { display: flex; align-items: center; gap: var(--tb-ident-gap); padding: 0 var(--tb-ident-pad-end) 0 var(--tb-ident-pad-start); font-weight: var(--weight-semibold); font-size: var(--text-native-ident); color: var(--n-label); flex-shrink: 0; white-space: nowrap; }
.ident .wi { width: var(--tb-ident-icon); height: var(--tb-ident-icon); }
button.ident { height: var(--ident-chip-h); padding: 0 var(--ident-chip-px); margin: 0 calc(var(--tb-ident-pad-end) - var(--ident-chip-px)) 0 calc(var(--tb-ident-pad-start) - var(--ident-chip-px)); border-radius: var(--r-chip); transition: background-color var(--dur-fast) var(--ease-standard); }
button.ident:hover { background: var(--n-bar-hover); }
button.ident[data-popup-open] { background: var(--n-pill); transition: none; }
.vdiv { width: var(--line); height: var(--tb-vdiv-h); background: var(--n-vdiv); flex-shrink: 0; }
.tb-right { display: flex; align-items: center; margin-left: auto; padding-left: var(--space-2); flex-shrink: 0; gap: 0; }
.ask-pill { height: var(--control-h-sm); padding: 0 var(--space-2_5); display: flex; align-items: center; border-radius: var(--r-pill); background: var(--n-pill); color: var(--n-label); font-size: var(--text-native-sm); font-weight: var(--weight-medium); margin-left: var(--space-1); white-space: nowrap; }
.ask-pill:hover { background: var(--n-pill-hover); }
.ask-pill { gap: var(--space-1); } .ask-pill .wi { width: var(--icon-sm); height: var(--icon-sm); } /* the AI mark leads every ask, as on the page ask buttons */
.topbar .tb-more { display: none; }
.topbar .tb-zoom { width: var(--control-h-xs); height: var(--control-h-xs); margin-right: var(--space-5); display: grid; place-items: center; border-radius: var(--r-control-sm); corner-shape: var(--corner); background: var(--n-pill); color: var(--n-label); flex-shrink: 0; }
.topbar .tb-zoom:hover { background: var(--ghost-hover); }
.topbar .tb-zoom .wi { width: var(--icon); height: var(--icon); }
/* narrow (reference at a 900 window): forward and every right button but the last move into the more menu; at the minimum width no button is left */
@container (max-width: 420px) { /* quality:literal: a container or media query cannot read a token */
  .tb-right > .nav-btn:not(.tb-more, .tb-keep), .topbar .nav-btn[data-action="kit.history.forward"], .topbar .ask-pill { display: none; }
  .topbar .tb-more { display: grid; }
}
@container (max-width: 260px) { .topbar .nav-btn { display: none !important; } } /* quality:literal: a container or media query cannot read a token */
`;

const navBtn = (ic, tip, action, disabled, first) => html`<button class="${cx('nav-btn', first && 'first')}" data-action="${action}" data-tip="${tip}" data-tip-side="bottom" aria-label="${tip}" ${disabled ? html`disabled` : ''}>${icon(ic)}</button>`;

/**
 * @param {{sidebarHidden?: boolean, canBack?: boolean, canForward?: boolean, ident: {icon: string, label: string, hideLabel?: boolean, menu?: string, arg?: any}, path,
 *   buttons?: {icon: string, tip: string, menu?: string, action?: string, arg?: any, disabled?: boolean, why?: string, on?: boolean}[], right?, askLabel?: string, zoom?: string}} p  on: a toggle that is on (pressed)  why: the reason a disabled button cannot run (it stays hoverable: aria-disabled, no action, the tip says it)  zoom: the level label while the zoom bubble shows
 */
export function render(p) {
  const identContent = p.ident ? html`${icon(p.ident.icon)}${p.ident.hideLabel ? '' : html`<span>${p.ident.label}</span>`}` : '';
  return html`<header class="${cx('topbar', p.sidebarHidden && 'sidebar-hidden')}" data-c="topbar">
    ${p.sidebarHidden ? iconButton.render({ icon: 'sidebar', tip: t('shell.sidebar.show'), variant: 'tertiary', size: 'sm', action: 'kit.sidebar.toggle' }) : ''}
    ${navBtn('chevron-left-medium', t('shell.back'), 'kit.history.back', !p.canBack, true)}
    ${navBtn('chevron-right-medium', t('shell.forward'), 'kit.history.forward', !p.canForward)}
    ${navBtn('arrow-rotate-clockwise', t('shell.reload'), 'kit.history.reload')}
    ${!p.ident ? '' : p.ident.menu ? html`<button class="ident" aria-label="${p.ident.label}" aria-haspopup="menu"${attrs({ 'data-menu': p.ident.menu, 'data-menu-arg': p.ident.arg })}>${identContent}</button>` : html`<div class="ident"${attrs({ 'aria-label': p.ident.hideLabel ? p.ident.label : null, role: p.ident.hideLabel ? 'img' : null })}>${identContent}</div>`}${p.path && p.ident ? html`<span class="vdiv"></span>` : ''}
    ${p.path}
    <div class="tb-right">${p.zoom ? html`<button class="tb-zoom" data-action="kit.zoom.show" aria-label="${p.zoom}">${icon('zoom-in')}</button>` : ''}${(p.buttons || []).map((b, i, all) => { const said = b.disabled && b.why, tip = said ? `${b.tip} · ${b.why}` : b.tip; return html`<button class="${cx('nav-btn', i === all.length - 1 && 'tb-keep')}" data-tip="${tip}" data-tip-side="bottom" aria-label="${tip}"${attrs({ 'data-menu': said ? null : b.menu, 'data-menu-arg': b.menu && !said ? b.arg : null, 'data-action': b.menu || said ? null : b.action, 'data-arg': b.menu || said ? null : b.arg, 'aria-haspopup': b.menu && !said ? 'menu' : null, 'aria-pressed': b.on == null ? null : String(!!b.on), 'aria-disabled': said ? 'true' : null, disabled: b.disabled && !said })}>${icon(b.icon)}</button>`; })}<button class="nav-btn tb-more" data-menu="kit.topbar.more" data-tip="${t('shell.more')}" data-tip-side="bottom" aria-label="${t('shell.more')}" aria-haspopup="menu">${icon('chevrons-right')}</button>${p.right || ''}${p.askLabel ? html`<button class="ask-pill" data-action="kit.panel.toggle">${icon('ai')}${p.askLabel}</button>` : ''}</div>
  </header>`;
}
