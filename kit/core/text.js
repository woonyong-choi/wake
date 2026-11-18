/*
 * Text values in definitions, read in the locale in use at render time:
 *   'key' (dictionary key) | { raw: 'literal' } (data value) | { key, vars } (key with placeholders, vars.count picks a plural form)
 *   | { date: Date|ISO string|ms, format?: Intl.DateTimeFormatOptions } | { number, format?: Intl.NumberFormatOptions } | () => Text
 * A var of { key, vars } may itself be a Text value (read in the same locale).
 */
import { t, formatDate, formatNumber } from './i18n.js';
import { Safe } from './html.js';

/** A Text value written as an object or function (not a plain string or markup) */
export const isText = v => !!v && typeof v === 'object' && ['raw', 'key', 'date', 'number'].some(k => k in v);

export function text(v, vars) {
  if (v == null) return '';
  if (typeof v === 'function') return text(v(), vars);
  if (typeof v === 'object') {
    if ('raw' in v) return String(v.raw);
    if ('key' in v) return t(v.key, { ...Object.fromEntries(Object.entries(v.vars || {}).map(([k, x]) => [k, isText(x) || typeof x === 'function' ? text(x) : x])), ...vars });
    if ('date' in v) return formatDate(v.date, v.format);
    if ('number' in v) return formatNumber(v.number, v.format);
  }
  return t(String(v), vars);
}

/* Text values of a menu definition: labels, descriptions, row end button tips, submenu buttons and submenus */
export function localizeMenu(def) {
  if (!def) return def;
  return { ...def, items: def.items.filter(Boolean).map(i => i.type ? {
    ...i, label: i.label != null ? text(i.label) : i.label,
    ...(i.placeholder != null ? { placeholder: text(i.placeholder) } : {}),
  } : {
    ...i, label: text(i.label), desc: i.desc ? text(i.desc) : i.desc, end: isText(i.end) ? text(i.end) : i.end,
    actions: i.actions?.map(x => ({ ...x, tip: text(x.tip) })), subButton: i.subButton ? text(i.subButton) : i.subButton,
    submenu: i.submenu && typeof i.submenu === 'object' ? localizeMenu(i.submenu) : i.submenu,
  }) };
}

/* Page menus contain resolved strings; only explicit Text values are read again. */
export function normalizePageMenu(def) {
  if (!def) return def;
  return { ...def, items: def.items.filter(Boolean).map(item => {
    const result = { ...item };
    for (const key of ['label', 'desc', 'end', 'tip', 'placeholder', 'subButton']) {
      if (Object.hasOwn(item, key)) result[key] = pageMenuText(item[key]);
    }
    if (item.actions) result.actions = item.actions.map(action => Object.hasOwn(action, 'tip') ? { ...action, tip: pageMenuText(action.tip) } : action);
    if (item.type === 'choices') result.items = item.items.map(choice => Object.hasOwn(choice, 'label') ? { ...choice, label: pageMenuText(choice.label) } : choice);
    if (typeof item.submenu === 'function') {
      result.submenu = function (...args) { return normalizePageMenu(item.submenu.apply(this, args)); };
    } else if (item.submenu) result.submenu = normalizePageMenu(item.submenu);
    return result;
  }) };
}

function pageMenuText(value) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || value instanceof Safe) return value;
  if (typeof value === 'function') {
    const result = value();
    return typeof result === 'string' ? text(result) : pageMenuText(result);
  }
  if (isText(value)) return text(value);
  throw new TypeError('invalid page menu text');
}
