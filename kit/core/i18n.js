/*
 * UI strings and locale formatting. Kit components never write text directly; they use t(key) only.
 * An app gives its dictionaries per locale (config.locales: { ko: {...}, en: {...} }, each spread over the kit dictionary of the same
 * locale); setLocales() registers them and useLocale() picks one. The kit's own dictionaries (en, ko) are always there, so a page that only calls
 * useLocale('ko') gets the kit strings in Korean. Missing keys fall back to the kit dictionary of the locale, then to English.
 * The kit.locale setting is 'system' (the first of the system's preferred languages the app has, else the app's defaultLocale) or a code.
 * Plurals: t(key, { count }) uses '<key>.<category>' (Intl.PluralRules: one, other, ...) when the dictionary has it, else the key.
 * Numbers and dates: formatNumber, formatPercent, formatDate and formatRelative use the current locale. A date always shows its year.
 */
import en from '../locale/en.js';
import ko from '../locale/ko.js';

/* the kit's own dictionaries: a page that only picks a language (useLocale) without registering app dictionaries still gets the kit's strings in it */
const KIT = { en, ko };

let dicts = { en }, current = 'en', dict = { ...en }, plural = new Intl.PluralRules('en');

/** Register the app dictionaries. @param {Record<string, Record<string, string>>} all  locale code -> dictionary */
export function setLocales(all) { dicts = { en, ...(all || {}) }; }

/** Switch to a locale code that was registered (unknown codes fall back to English). Returns the code in use */
export function useLocale(code) {
  current = dicts[code] || KIT[code] ? code : 'en';
  dict = { ...en, ...KIT[current], ...dicts[current] };
  plural = new Intl.PluralRules(current);
  return current;
}

export const locale = () => current;
export const locales = () => Object.keys(dicts);

/** The locale a kit.locale setting value means. system: the preferred languages (navigator.languages, or the list given) */
export function resolveLocale(pref, fallback, preferred = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []) {
  const have = Object.keys(dicts);
  if (pref && pref !== 'system' && have.includes(pref)) return pref;
  for (const l of preferred || []) { const base = String(l).toLowerCase().split('-')[0]; if (have.includes(base)) return base; }
  return have.includes(fallback) ? fallback : 'en';
}

/** String for a key. {name} placeholders are replaced from vars; vars.count picks a plural form when the dictionary has one */
export function t(key, vars) {
  let s = vars?.count != null ? dict[`${key}.${plural.select(Number(vars.count))}`] ?? dict[key] : dict[key];
  if (s == null) { console.warn(`missing locale key: ${key}`); s = key; }
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k === 'count' && typeof vars.count === 'number' ? formatNumber(vars.count) : vars[k] ?? '')) : s;
}

export const formatNumber = (n, o) => new Intl.NumberFormat(current, o).format(n);
export const formatPercent = (ratio, o) => new Intl.NumberFormat(current, { style: 'percent', ...o }).format(ratio);
/* a date is never shown without its year ('11/9' is not a date): options that name the month or the day get the year too */
const withYear = o => (o && !o.dateStyle && !o.year && (o.month || o.day) ? { ...o, year: 'numeric' } : o);
export const formatDate = (d, o) => new Intl.DateTimeFormat(current, withYear(o)).format(d instanceof Date ? d : new Date(d));
export const formatRelative = (value, unit, o) => new Intl.RelativeTimeFormat(current, { numeric: 'auto', ...o }).format(value, unit);

