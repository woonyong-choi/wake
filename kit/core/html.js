/* HTML string helpers. Every value is escaped; only fragments built with html`` are inserted as is */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
export const raw = s => new Safe(String(s ?? ''));

function value(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(value).join('');
  if (v instanceof Safe) return v.s;
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += value(vals[i]) + strings[i + 1];
  return new Safe(out);
}

/* Class names: drops falsy values and joins with spaces */
export const cx = (...a) => a.flat(Infinity).filter(Boolean).join(' ');

/* Attributes: drops null and false, true writes the bare name, objects become JSON */
export function attrs(obj = {}) {
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === false) continue;
    if (v === true) { out += ` ${k}`; continue; }
    out += ` ${k}="${esc(typeof v === 'object' || k.endsWith('-arg') ? JSON.stringify(v) : v)}"`;
  }
  return raw(out);
}

/* Action attributes: data-action and its argument */
export const act = (name, arg) => attrs({ 'data-action': name, 'data-arg': arg === undefined ? null : arg });
