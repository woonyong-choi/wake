/*
 * Popover: a native-style panel that opens under a top bar control (the identity chip, a top bar icon button).
 * It is a menu definition with variant 'popover', so opening, closing, focus return, keyboard and submenus are the menu's.
 *
 * Definition: { variant: 'popover', width?, sideOffset?, alignOffset?, items }
 *   { type: 'header', label }            muted first line (the identity name)
 *   { ..., tone: 'ok'|'warn'|'danger' }   status row, tinted by state, always shown highlighted
 *   { ..., desc }                         one muted line under the label
 *   { ..., switch, on, confirm }          small switch; confirm keeps the value and emits the action (the app asks first)
 *   { ..., chevron }                      trailing chevron for a row that opens a page
 *   { ..., fav, dot }                     page icon tile and a status dot after the label
 *   { ..., actions: [{ id, icon, tip, action, arg, on }] }  icon buttons at the row end (pin and so on)
 *   labels, separators, shortcuts, end text and submenus as in menu items.
 *
 * The surface, padding, row height and motion are the one floating surface every menu, submenu and tooltip uses (--float-*);
 * a popover only adds its rows (header, status rows, descriptions, switches, row end buttons). The closed trigger shows no background.
 */
import { html } from '../core/html.js';
import * as menu from './menu.js';

export const name = 'popover';

export const css = `
.menu.popover { width: var(--pop-w); background: var(--float-solid); }
.menu.popover .m-root { display: flex; flex-direction: column; }
.menu.popover .m-head { min-height: var(--float-label-h); padding: 0 var(--space-2_5); display: flex; align-items: center; font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; }
.menu.popover .mi-end { display: block; flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu.popover .mi-end:has(.mi-sc) { flex-shrink: 0; overflow: visible; } /* a shortcut is never cut; the label gives way */
.menu.popover .mi-desc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.menu.popover .mi.has-desc { align-items: flex-start; padding-top: var(--space-1_5); padding-bottom: var(--space-1_5); }
.menu.popover .mi.has-desc > .wi { margin-top: calc((var(--leading-sm) - var(--icon)) / 2); }
.menu.popover .mi.has-desc > .mi-switch, .menu.popover .mi.has-desc > .mi-sub, .menu.popover .mi.has-desc > .mi-end { height: var(--leading-sm); align-items: center; }
.menu.popover .mi.tone-ok { background: var(--success-soft); color: var(--success-content); }
.menu.popover .mi.tone-warn { background: var(--warning-soft); color: var(--warning-content); }
.menu.popover .mi.tone-danger { background: var(--destructive-soft); color: var(--destructive-content); }
.menu.popover .mi.tone-ok > .wi, .menu.popover .mi.tone-ok .mi-sub { color: var(--success-content); }
.menu.popover .mi.tone-warn > .wi, .menu.popover .mi.tone-warn .mi-sub { color: var(--warning-content); }
.menu.popover .mi.tone-danger > .wi, .menu.popover .mi.tone-danger .mi-sub { color: var(--destructive-content); }
.menu.popover .sw { --switch-w: var(--switch-sm-w); --switch-h: var(--switch-sm-h); --switch-pad: var(--switch-sm-pad); --switch-thumb-w: var(--switch-sm-thumb-w); --switch-thumb-h: var(--switch-sm-thumb-h); --switch-off-x: var(--switch-sm-pad); --switch-on-x: var(--switch-sm-on-x); }
.menu.popover .mi-dot { display: inline-grid; margin-left: var(--space-1_5); vertical-align: middle; }
.menu.popover .mi-acts { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
.menu.popover .mi-act { display: grid; place-items: center; color: var(--muted-foreground); transition: color var(--dur-fast) var(--ease-standard); }
.menu.popover .mi-act:hover { color: var(--foreground); }
.menu.popover .mi-act.on { color: var(--link); }
`;

/** Static popover box (component gallery) */
export function renderStatic(def) {
  return html`<div class="menu popover" role="menu" style="position:relative;animation:none;${def.width ? `width:${def.width}px` : ''}">${menu.render(def)}</div>`;
}
