/*
 * One menu row, rendered from its definition (item).
 * item: { id, label, icon, fav, dot, desc, end, endIcon, shortcut, checked, checkbox, danger, disabled, submenu, subIcon, subButton, chevron, switch, on, confirm, tone, actions, rainbow }
 * checkbox is an item of a multi-select list (the menu stays open); both it and a checked single choice draw a trailing check, without a box (measured).
 * box: a checkbox item drawn with a leading kit checkbox instead (a long multi list where several are on at once: a scope filter).
 * A bulk row ({type:'bulk', label, state}) is the tri-state select-all row over a multi list: a menu checkbox row with the kit checkbox, checked when every row in sight
 * is on, mixed (a dash) when some are, empty when none (menu.js gives the state and applies it).
 * tip on a disabled checkbox item (an option that cannot be turned off) explains it in a tooltip on its left; the row still takes the pointer for it.
 * subButton (a tip text) draws the submenu opener as a row end button: the submenu opens on its click or the row's, not on hover.
 * shortcut is plain muted text after the label ('⌘,'). A checked item with a submenu shows the check before the submenu icon (subIcon, default chevron).
 * Header lines ({type:'header'}), group labels ({type:'label'}), separators ({type:'separator'}), search fields ({type:'search'}) and a choice
 * row ({type:'choices', shape: 'swatch'|'icon', items: [{ color, icon, label, checked, action, arg }]}: color swatches, color a color token name or
 * null for neutral, or an icon grid of --mc-cols columns) render here too.
 */
import { t } from '../core/i18n.js';
import { html, cx, attrs } from '../core/html.js';
import { icon, favicon } from '../icons/icons.js';
import * as kbd from './kbd.js';
import * as toggle from './switch.js';
import * as statusDot from './status-dot.js';
import * as checkbox from './checkbox.js';

export const name = 'menu-item';

/* the trailing check of a chosen item */
export const checkMark = () => html`<span class="mi-check">${icon('check')}</span>`;

export const css = `
.mi { min-height: var(--float-row-h); padding: var(--space-1) var(--space-2_5); display: flex; align-items: center; gap: var(--space-2); border-radius: var(--r-row); corner-shape: var(--corner); width: 100%; text-align: left; font-size: var(--text-sm); line-height: var(--leading-sm); white-space: nowrap; position: relative; cursor: default; user-select: none; color: inherit; outline: none; }
.mi[data-highlighted] { background: var(--accent); color: var(--accent-foreground); }
.mi:focus-visible { box-shadow: none; }
.mi > .wi { color: var(--muted-foreground); }
.mi .mi-text { flex: 1 1 auto; min-width: 0; }
.mi .mi-desc { display: block; font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--muted-foreground); white-space: normal; }
.mi .mi-end { margin-left: auto; min-width: 0; flex-shrink: 1000; color: var(--muted-foreground); display: flex; align-items: center; gap: var(--space-1); }
.mi .mi-end > .mi-endv { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.mi .mi-sub, .mi .mi-check, .mi .mi-switch, .mi .mi-acts, .mi > .wi { flex-shrink: 0; }
.mi .mi-sub { color: var(--muted-foreground); margin-right: calc(-1 * var(--space-1)); margin-left: auto; display: flex; align-items: center; gap: var(--space-1_5); }
.mi .mi-sub .mi-check { position: static; }
.mi .mi-sc { font-size: var(--text-sm); color: var(--muted-foreground); }
.mi.checkable { padding-right: var(--space-8); }
.mi .mi-check { position: absolute; right: var(--space-2); display: flex; color: var(--foreground); }
.mi.danger { color: var(--destructive); }
.mi.danger > .wi { color: var(--destructive); }
.mi.danger[data-highlighted] { background: var(--destructive-soft); color: var(--destructive); }
.mi[aria-disabled="true"] { opacity: .5; pointer-events: none; }
.mi[aria-disabled="true"][data-tip] { pointer-events: auto; cursor: default; background: transparent; }
.mi[aria-expanded="true"] { background: var(--accent); }
.mi .rainbow { opacity: var(--rainbow-alpha); }
.mi .rainbow > :nth-child(8n+1) { color: var(--rb-1); }
.mi .rainbow > :nth-child(8n+2) { color: var(--rb-2); }
.mi .rainbow > :nth-child(8n+3) { color: var(--rb-3); }
.mi .rainbow > :nth-child(8n+4) { color: var(--rb-4); }
.mi .rainbow > :nth-child(8n+5) { color: var(--rb-5); }
.mi .rainbow > :nth-child(8n+6) { color: var(--rb-6); }
.mi .rainbow > :nth-child(8n+7) { color: var(--rb-7); }
.mi .rainbow > :nth-child(8n+8) { color: var(--rb-8); }
.mi .mi-switch { margin-left: auto; display: flex; }
.m-choices { display: flex; align-items: center; gap: var(--sw-gap); padding: var(--space-1) var(--space-2_5); }
.m-choices.icon { display: grid; grid-template-columns: repeat(var(--mc-cols), var(--mc-cell)); grid-auto-rows: var(--mc-cell); gap: 0; padding: 0; }
.m-sw { width: var(--sw-size); height: var(--sw-size); border-radius: var(--r-pill); background: var(--sw, var(--sw-neutral)); box-shadow: 0 0 0 var(--hairline) var(--sw-ring); transition: transform var(--dur-fast) var(--ease-standard); }
.m-sw:hover { transform: scale(1.1); }
.m-sw[aria-pressed="true"] { box-shadow: 0 0 0 var(--hairline) var(--sw-ring), 0 0 0 var(--sw-sel-w) var(--sw-sel); }
.m-ic { display: grid; place-items: center; border-radius: var(--r-row); color: var(--n-secondary); transition: background var(--dur-fast) var(--ease-standard); }
.m-ic:hover, .m-ic[aria-pressed="true"] { background: var(--accent); color: var(--n-label-strong); }
.m-label { padding: var(--space-1) var(--space-2_5); font-size: var(--text-xs); line-height: var(--leading-xs); font-weight: var(--weight-medium); letter-spacing: var(--tracking-wide); color: var(--muted-foreground); user-select: none; }
.m-sep { margin: var(--space-1) calc(-1 * var(--space-1)); }
.m-sep > div { height: var(--hairline); background: var(--border); }
.m-search { display: flex; align-items: center; gap: var(--space-2); min-height: var(--control-h); margin: 0 calc(-1 * var(--float-pad)) var(--float-pad); padding: 0 calc(var(--space-2_5) + var(--float-pad)); border-bottom: var(--hairline) solid var(--border); color: var(--muted-foreground); } /* a line of the menu: the icon and the input on the menu's own face, one hairline across the menu under it (the separator's) */
.m-search input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; font-size: var(--text-sm); color: var(--foreground); }
.m-search input::placeholder { color: var(--muted-foreground); }
.mi.boxed { padding-right: var(--space-2_5); } .mi.boxed > .cbx { margin-inline-end: var(--space-0_5); } /* a boxed choice: the box leads, no trailing check */
.m-empty { padding: var(--space-2) var(--space-2_5); color: var(--muted-foreground); font-size: var(--text-sm); }
`;


/** Row end: muted value (ellipsized, full value in title), shortcut and end icon. Shared by the in-place submenu header row */
export function end(item) {
  if (!item.end && !item.endIcon && !item.shortcut) return '';
  return html`<span class="mi-end"${attrs({ title: typeof item.end === 'string' ? item.end : null })}>${item.end ? html`<span class="mi-endv">${item.end}</span>` : ''}${item.shortcut ? html`<span class="mi-sc">${item.shortcut.join('')}</span>` : ''}${item.endIcon ? icon(item.endIcon, 'sm') : ''}</span>`;
}

/** @param {object} item  @param {number} index item position (keyboard movement) */
export function render(item, index) {
  if (item.type === 'header') return html`<div class="m-head" role="presentation">${item.label}</div>`;
  if (item.type === 'label') return html`<div class="m-label" role="presentation">${item.label}</div>`;
  if (item.type === 'choices') return html`<div class="${cx('m-choices', item.shape)}" role="group">${item.items.map(c => html`<button class="${item.shape === 'icon' ? 'm-ic' : 'm-sw'}" data-choice aria-label="${c.label}"${attrs({ 'aria-pressed': String(!!c.checked), 'data-action': c.action, 'data-arg': c.arg, style: c.color ? `--sw:var(${c.color})` : null })}>${item.shape === 'icon' ? icon(c.icon) : ''}</button>`)}</div>`;
  if (item.type === 'separator') return html`<div class="m-sep" role="separator"><div></div></div>`;
  if (item.type === 'search') return html`<div class="m-search">${icon('search')}<input data-menu-search placeholder="${item.placeholder || ''}" aria-label="${item.placeholder || t('shell.search')}" autocomplete="off" spellcheck="false">${item.kbd ? kbd.render({ keys: item.kbd }) : ''}</div>`;
  if (item.type === 'bulk') return html`<div class="mi boxed m-all" role="menuitemcheckbox" tabindex="-1" data-c="menu-item" data-bulk data-index="${index}"${attrs({ 'aria-checked': item.state || 'false', 'data-label': item.label })}>${checkbox.render({ checked: item.state === 'true', indeterminate: item.state === 'mixed', decorative: true })}<span class="mi-text"><span>${item.label}</span></span></div>`;
  if (item.checkbox && item.box) return html`<div class="${cx('mi', 'boxed', item.desc && 'has-desc')}" role="menuitemcheckbox" tabindex="-1" data-c="menu-item" data-index="${index}"${attrs({ 'data-item': item.id, 'aria-checked': String(!!item.checked), 'aria-disabled': item.disabled ? 'true' : null, 'data-label': item.label, 'data-tip': item.tip, 'data-tip-side': item.tip ? 'left' : null })}>${checkbox.render({ checked: !!item.checked, decorative: true })}${item.icon ? icon(item.icon) : ''}<span class="mi-text"><span>${item.label}</span>${item.desc ? html`<span class="mi-desc">${item.desc}</span>` : ''}</span></div>`;
  if (item.checkbox) return html`<div class="${cx('mi', 'checkable', item.desc && 'has-desc')}" role="menuitemcheckbox" tabindex="-1" data-c="menu-item" data-index="${index}"${attrs({ 'data-item': item.id, 'aria-checked': String(!!item.checked), 'aria-disabled': item.disabled ? 'true' : null, 'data-label': item.label, 'data-tip': item.tip, 'data-tip-side': item.tip ? 'left' : null })}>${item.icon ? icon(item.icon) : ''}<span class="mi-text"><span>${item.label}</span>${item.desc ? html`<span class="mi-desc">${item.desc}</span>` : ''}</span>${item.checked ? checkMark() : ''}</div>`;
  const checkable = item.checked !== undefined;
  const inlineCheck = checkable && item.submenu;
  const role = item.switch ? 'menuitemcheckbox' : checkable ? 'menuitemradio' : 'menuitem';
  const lead = item.icon ? (item.fav ? favicon(item.icon) : icon(item.icon)) : '';
  return html`<div class="${cx('mi', checkable && !inlineCheck && 'checkable', item.danger && 'danger', item.desc && 'has-desc', item.tone && 'tone-' + item.tone)}" role="${role}" tabindex="-1" data-c="menu-item" data-index="${index}"${attrs({
    'data-item': item.id, 'aria-checked': item.switch ? String(!!item.on) : checkable ? String(!!item.checked) : null,
    'aria-disabled': item.disabled ? 'true' : null, 'aria-haspopup': item.submenu ? 'menu' : null, 'aria-expanded': item.submenu ? 'false' : null,
    'data-label': item.label, 'data-sub-click': item.submenu && item.subButton ? '' : null, 'data-confirm': item.switch && item.confirm ? '' : null,
  })}>
    ${lead}${item.lead || ''}
    <span class="mi-text">${item.rainbow ? html`<span class="rainbow" aria-label="${item.label}">${[...item.label].map(ch => html`<span aria-hidden="true">${ch}</span>`)}</span>` : html`<span>${item.label}</span>`}${item.dot ? html`<span class="mi-dot">${statusDot.render({ tone: item.dot })}</span>` : ''}${item.desc ? html`<span class="mi-desc">${item.desc}</span>` : ''}</span>
    ${end(item)}
    ${item.actions || item.subButton ? html`<span class="mi-acts">${(item.actions || []).map(a => html`<span class="${cx('mi-act', a.on && 'on')}" role="button" data-tip="${a.tip}" aria-label="${a.tip}"${attrs({ 'data-act': a.id, 'aria-pressed': a.on === undefined ? null : String(!!a.on) })}>${icon(a.icon)}</span>`)}${item.subButton ? html`<span class="mi-act" role="button" data-act="kit.submenu" data-tip="${item.subButton}" aria-label="${item.subButton}">${icon(item.subIcon || 'more')}</span>` : ''}</span>` : ''}
    ${item.switch ? html`<span class="mi-switch">${toggle.render({ on: item.on, as: 'span' })}</span>` : ''}
    ${(item.submenu && !item.subButton) || item.chevron ? html`<span class="mi-sub">${checkable && item.checked ? html`<span class="mi-check">${icon('check')}</span>` : ''}${icon(item.subIcon || 'chevron-right-small')}</span>` : ''}
    ${checkable && item.checked && !item.submenu ? html`<span class="mi-check">${icon('check')}</span>` : ''}
  </div>`;
}
