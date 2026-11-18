/*
 * Settings row: surface-secondary background, min height 52, padding 10, gap 12.
 * Optional icon or tile on the left, text (title 14/500 primary, description 12/500 muted, 4 on each side), control on the right (max 160, right aligned).
 * clickable rows get an accent background on hover; variant 'add' is the "+ add" row at the end of a group.
 * trail 'chevron' (opens a page) or 'external' (opens elsewhere) draws a muted 16 mark at the end of a clickable row.
 * extra sits under the description (small buttons, a help link); stack is a line under the whole row, 12 below, its parts at their own width
 * from the left (Preview and Change buttons under a sound switch, measured) or one part filling it (a usage bar).
 * This is the one row primitive: list rows, connection rows and the first-run rows are this row with their own lead, text and end parts.
 * body: an expandable part under the row (steps, a form) that opens by height and fade (enter motion) and closes by the exit motion;
 * fresh rows come in one after another (stagger) the first time they appear.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'settings-row';

export const css = `
.sr-row { min-height: var(--srow-min-h); padding: var(--srow-padding, var(--space-2_5)); display: flex; align-items: center; gap: var(--srow-gap, var(--space-3)); background: var(--surface-secondary); text-align: left; width: 100%; }
.sr-row.click { transition: background var(--dur-fast) var(--ease-standard); }
.sr-row.click:hover { background: var(--accent); }
:root[data-theme="light"] .sr-row.click:hover { background: var(--row-hover); }
.sr-txt { flex: var(--srow-text-flex, 1 1 auto); min-width: 0; padding: 0 var(--space-1); }
.sr-help { display: inline-grid; place-items: center; vertical-align: middle; margin-inline-start: var(--space-2); color: var(--muted-foreground); transition: color var(--dur-fast) var(--ease-standard); cursor: help; } /* the round help mark after a title: its text shows as a tip */
.sr-help:hover, .sr-help:focus-visible { color: var(--foreground); }
.sr-help:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-0_5); border-radius: var(--r-pill); }
.sr-title { font-size: var(--text-sm); font-weight: var(--weight-medium); line-height: var(--leading-sm); color: var(--primary); }
.sr-desc { font-size: var(--text-xs); font-weight: var(--weight-medium); line-height: var(--leading-xs); color: var(--muted-foreground); }
.sr-ctl { display: flex; align-items: center; justify-content: flex-end; gap: var(--srow-control-gap, var(--space-3)); max-width: var(--control-max-w); flex-shrink: 0; }
.sr-ctl.wide { flex-wrap: var(--srow-control-wrap, nowrap); max-width: none; min-width: 0; flex-shrink: 1; }
.sr-lead { width: var(--icon-xl); display: grid; place-items: center; flex-shrink: 0; color: var(--muted-foreground); margin-left: var(--srow-lead-ml); }
.sr-lead .wi { width: var(--icon-xl); height: var(--icon-xl); }
.sr-lead + .sr-txt { padding-left: 0; margin-left: var(--srow-lead-txt-ml); }
.sr-row.add { color: var(--muted-foreground); font-weight: var(--weight-medium); gap: var(--srow-add-gap); padding-left: var(--space-3); }
.sr-row.add .sr-title { color: var(--muted-foreground); }
.sr-tile { width: var(--tile); height: var(--tile); border-radius: var(--r-control); corner-shape: var(--corner); display: grid; place-items: center; background: var(--secondary); flex-shrink: 0; color: var(--foreground); }
.sr-tile .wi { width: var(--icon-lg); height: var(--icon-lg); }
.sr-tile + .sr-txt { padding: 0; }
.sr-indent { flex-shrink: 0; width: calc(var(--indent) * var(--space-5)); }
.sr-trail { display: grid; color: var(--muted-foreground); flex-shrink: 0; padding-right: var(--space-1); }
.sr-trail.turn .wi { transition: transform var(--motion-exit-dur) var(--motion-exit-ease); }
.sr-row[aria-expanded="true"] .sr-trail.turn .wi { transform: rotate(180deg); transition-duration: var(--motion-enter-dur); transition-timing-function: var(--motion-enter-ease); }
.sr-extra { display: flex; align-items: center; gap: var(--space-1); margin-top: var(--space-2); }
.sr-row.stacked { flex-direction: column; align-items: stretch; gap: var(--space-3); }
.sr-line { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.sr-stack { display: flex; align-items: center; gap: var(--space-1); }
.sr-item.in { animation: sr-in var(--motion-enter-dur) var(--motion-enter-ease) both; animation-delay: calc(var(--i, 0) * var(--motion-stagger)); }
@keyframes sr-in { from { opacity: 0; transform: translateY(var(--motion-enter-y)); } }
.sr-body { display: grid; grid-template-rows: 0fr; opacity: 0; background: var(--surface-secondary); transition: grid-template-rows var(--motion-exit-dur) var(--motion-exit-ease), opacity var(--motion-exit-dur) var(--motion-exit-ease); }
.sr-body.open { grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows var(--motion-enter-dur) var(--motion-enter-ease), opacity var(--motion-enter-dur) var(--motion-enter-ease); }
.sr-body > div { overflow: hidden; min-height: 0; }
.sr-body-in { padding: 0 var(--space-3) var(--space-3); display: flex; flex-direction: column; gap: var(--space-3); }
@media (prefers-reduced-motion: reduce) { .sr-item.in { animation: none; } }
`;

/**
 * @param {{title: string, help?: string, description?: string, revealText?: boolean, control?: any, icon?: string, tile?: string, lead?: any, action?: string, arg?: any, variant?: 'add', wideControl?: boolean, menu?: string, dialog?: string, trail?: 'chevron'|'external', extra?: any, stack?: any, indent?: number,
 *          body?: any, open?: boolean, expand?: boolean, aria?: object, fresh?: boolean, i?: number, id?: string, c?: string, key?: string}} p  indent: tree level (20 each); body/open: the expandable part; c: the composing component's name
 */
export function render(p) {
  if (p.body !== undefined || p.fresh || p.c) {
    const shown = !!p.open && !!p.body;
    return html`<div class="${cx('sr-item reveal-host', p.fresh && 'in')}" data-c="${p.c || 'settings-row'}"${attrs({ 'data-key': p.key, style: p.fresh ? `--i:${p.i || 0}` : null })}>${row({ ...p, c: null })}${p.body !== undefined ? html`<div class="${cx('sr-body', shown && 'open')}"${attrs({ inert: shown ? null : '' })}><div><div class="sr-body-in">${p.body || ''}</div></div></div>` : ''}</div>`;
  }
  return row(p);
}
function row(p) {
  const clickable = p.action || p.variant === 'add' || p.menu || p.dialog;
  if (p.variant === 'add') return html`<button class="sr-row click add" data-c="settings-row"${attrs({ 'data-action': p.action, 'data-arg': p.arg, 'data-menu': p.menu, 'data-dialog': p.dialog, 'data-dialog-arg': p.dialog ? p.arg : null })}>${icon('plus-medium')}<span class="sr-title">${p.title}</span></button>`;
  const lead = p.tile ? html`<span class="sr-tile">${icon(p.tile)}</span>` : p.icon ? html`<span class="sr-lead">${icon(p.icon)}</span>` : p.lead ? html`<span class="sr-lead">${p.lead}</span>` : '';
  const line = html`${p.indent ? html`<span class="sr-indent" style="--indent:${p.indent}"></span>` : ''}${lead}<div class="sr-txt"><div class="sr-title trunc"${attrs({ 'data-tip': p.revealText ? p.title : null, 'data-tip-overflow': p.revealText ? '' : null })}>${p.title}${p.help ? html`<span class="sr-help" data-tip="${p.help}" tabindex="0" role="img" aria-label="${p.help}">${icon('circle-question', 'sm')}</span>` : ''}</div>${p.description ? html`<div class="sr-desc trunc"${attrs({ 'data-tip': p.revealText ? p.description : null, 'data-tip-overflow': p.revealText ? '' : null })}>${p.description}</div>` : ''}${p.extra ? html`<div class="sr-extra">${p.extra}</div>` : ''}</div>
    ${p.control ? html`<div class="${cx('sr-ctl', p.wideControl && 'wide')}">${p.control}</div>` : ''}${p.trail || p.expand ? html`<span class="${cx('sr-trail', p.expand && 'turn')}">${icon(p.expand ? 'chevron-down-small' : p.trail === 'external' ? 'arrow-up-right' : 'chevron-right-small')}</span>` : ''}`;
  return html`<div class="${cx('sr-row', clickable && 'click', p.stack && 'stacked')}" data-c="settings-row"${attrs({ role: clickable ? 'button' : null, tabindex: clickable ? '0' : null, 'data-action': p.action, 'data-arg': p.arg, 'data-menu': p.menu, 'data-dialog': p.dialog, 'data-dialog-arg': p.dialog ? p.arg : null, 'aria-expanded': p.expand ? String(!!p.open) : null, ...(p.aria || {}) })}>
    ${p.stack ? html`<div class="sr-line">${line}</div><div class="sr-stack">${p.stack}</div>` : line}
  </div>`;
}
