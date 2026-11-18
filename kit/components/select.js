/*
 * Select field: trigger height 32, radius lg, 1px input border, input 30% background (hover 50%), 14/500, up/down chevrons on the right.
 * Pressing opens the list with the chosen item over the trigger (no animation). The list is a kit menu in every part: its surface, radius and
 * shadow, menu rows (--float-row-h, the menu's padding, the check at the row end), group names as menu section labels. A list longer than --select-rows shows that many rows and scrolls, with the chosen row in sight; it then opens under
 * the trigger with a search field on top (a line of the menu: icon and input over a hairline; search: true|false overrides): typing filters, the arrows move through what is left, Enter picks,
 * Escape clears the query first and closes next, and nothing left says "No results".
 * In a list toolbar (list-toolbar.js) the field is a pill of the toolbar's height, like the search field and the pill tabs beside it.
 * placeholder shows the value muted (nothing chosen); disabled dims it to 50%. variant 'ghost' has no border or fill (property rows) and a single down chevron;
 * block fills its container (forms). multi lists the chosen labels joined by commas with a down chevron, and its list uses checkboxes and stays open.
 * menuDef() builds the menu definition (opened by the menu component).
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { t } from '../core/i18n.js';

/* rows a select list shows before it scrolls (the same number as --select-rows) */
const SELECT_ROWS = 10;

export const name = 'select';

export const css = `
.slt { height: var(--page-control-h, var(--control-h)); padding: 0 var(--space-2_5); display: inline-flex; align-items: center; justify-content: space-between; gap: var(--space-1_5); border-radius: var(--r-control); corner-shape: var(--corner); border: var(--line) solid var(--input); background: var(--input-30); font-size: var(--text-sm); font-weight: var(--weight-medium); white-space: nowrap; max-width: var(--control-max-w); min-width: 0; transition: background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.slt:hover, .slt[aria-expanded="true"] { background: var(--input-50); }
:root[data-theme="light"] .slt { background: transparent; }
.slt .v { overflow: hidden; text-overflow: ellipsis; min-width: 0; display: flex; align-items: center; gap: var(--space-1_5); }
.slt .ud { color: var(--muted-foreground); display: grid; }
.slt.slt-ph .v { color: var(--muted-foreground); }
.slt:disabled { opacity: .5; pointer-events: none; }
.slt.block { width: 100%; max-width: none; }
.sr-ctl.wide .slt { max-width: none; }
.slt.ghost { border-color: transparent; background: transparent; padding-right: var(--space-1_5); }
.slt.ghost:hover, .slt.ghost[aria-expanded="true"] { background: var(--ghost-hover); }
.menu.select { max-height: min(calc(var(--float-row-h) * var(--select-rows) + 2 * var(--float-pad)), calc(100vh - 2 * var(--space-2))); overflow-y: auto; overscroll-behavior: contain; } /* the menu's own radius; a long list shows --select-rows rows and scrolls */
.menu.select:has(.m-search) { max-height: min(calc(var(--float-row-h) * (var(--select-rows) + 1) + 3 * var(--float-pad)), calc(100vh - 2 * var(--space-2))); }
.menu.select:has(.m-search):has(.m-all) { max-height: min(calc(var(--float-row-h) * (var(--select-rows) + 2) + 3 * var(--float-pad)), calc(100vh - 2 * var(--space-2))); } /* the select-all row over a multi list is a row of its own: the rows still show --select-rows */
`;

/** @param {{value: string, icon?: string, menu: string, arg?: any, width?: string, label?: string, chevron?: 'down', placeholder?: boolean, disabled?: boolean, variant?: 'ghost', block?: boolean, multi?: boolean}} p  chevron 'down' for a select joined to a split button */
export function render(p) {
  const down = p.chevron === 'down' || p.variant === 'ghost' || p.multi;
  return html`<button type="button" class="${cx('slt', p.placeholder && 'slt-ph', p.variant === 'ghost' && 'ghost', p.block && 'block')}" data-c="select" aria-haspopup="menu" aria-expanded="false"${attrs({ 'data-menu': p.menu, 'data-menu-arg': p.arg, 'aria-label': p.label, style: p.width ? `width:${p.width};max-width:none` : null, disabled: p.disabled })}><span class="v">${p.icon ? icon(p.icon) : ''}<span class="trunc">${p.value}</span></span><span class="ud">${icon(down ? 'chevron-down-small' : 'chevrons-up-down')}</span></button>`;
}

/**
 * Menu definition for a select list.
 * @param {{options: {id: string, label: string, icon?: string, group?: string, fixed?: boolean, tip?: string}[], value: string|string[], action: string, key?: string, multi?: boolean, boxes?: boolean, bulk?: boolean, search?: boolean}} p
 * search: a search field on top (default: on when there are more options than --select-rows shows)
 * A fixed option of a multi list is always on: checked, disabled and explained by its tip.
 * boxes (multi): each row leads with a checkbox instead of the trailing check (a scope filter where several are on at once);
 * bulk (multi): the tri-state "All" row over the rows (menu.js); choosing it, the action gets { arg: { key, values } } once.
 */
export function menuDef(p) {
  if (p.multi) {
    const items = p.options.map(o => ({ id: o.id, label: o.label, icon: o.icon, checkbox: true, box: !!p.boxes, desc: o.desc, checked: o.fixed || p.value.includes(o.id), disabled: o.fixed, tip: o.fixed ? o.tip : undefined, action: p.action, arg: { key: p.key, value: o.id } }));
    const long = p.search ?? p.options.length > SELECT_ROWS;
    return { items: [...(long ? [{ type: 'search', placeholder: t('shell.search') }] : []), ...(p.bulk ? [{ type: 'bulk', label: t('select.all') }] : []), ...items], variant: 'select', matchTrigger: true };
  }
  const items = [];
  let group = null;
  for (const o of p.options) {
    if (o.group && o.group !== group) { group = o.group; items.push({ type: 'label', label: o.group }); }
    items.push({ id: o.id, label: o.label, icon: o.icon, checked: o.id === p.value, action: p.action, arg: { key: p.key, value: o.id } });
  }
  const long = p.search ?? p.options.length > SELECT_ROWS;
  if (long) items.unshift({ type: 'search', placeholder: t('shell.search') });
  return { items, variant: 'select', alignItem: !long, matchTrigger: true };
}
