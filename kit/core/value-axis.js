/*
 * Value axis: the scale of a chart's values, fitted to what is shown, in the unit the values are in.
 *   scale(lo, hi, { unit, count, zeroFloor }) -> { min, max, ticks, label(v), value(v) }
 *     The scale fits the data at both ends with about 10% of room (headroom); it starts at 0 only for a percentage ('%') or when the data reaches down to
 *     within 20% of its top from 0 (zeroFloor, the default, allows this). Steps are 1, 2 or 5 x 10^n of the unit it is read in (a percentage also 25);
 *     count is how many steps the room allows (the chart gives it from the plot's height). Bytes are read in binary units (Ki, Mi, Gi, Ti: 1Gi 2Gi 3Gi, never 4000Mi), CPU millicores ('m') in
 *     m below a core and in cores above, milliseconds ('ms') in s from one second up; other units ('%', 'req/s', ...) are kept and only the steps are rounded.
 *     zero: true starts the scale at 0 whatever the data (an area's height is its size); integer: true steps by whole numbers only (counts: no 2.5).
 *   span(min, max, { unit, count, integer }) -> the same shape for a range the reader set: the ends stay exactly min and max, the marks inside on round steps.
 *   label(v): a tick's words (the unit it is read in, at most three significant digits); value(v): a reading's words, the same way.
 */
const BINARY = ['', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi'];
const NICE = [1, 2, 5, 10], NICE_PCT = [1, 2, 2.5, 5, 10]; /* a percentage also steps by 25 */

/* a byte unit as written ('Mi', 'MiB', 'B', 'GiB'): its power of 1024 and whether it carries the 'B' */
function bytes(unit) {
  const m = /^(Ki|Mi|Gi|Ti|Pi)?(B)?$/.exec(unit || '');
  if (!m || (!m[1] && !m[2])) return null;
  return { power: m[1] ? BINARY.indexOf(m[1]) : 0, b: !!m[2] };
}

const sig = (v, digits = 3) => {
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '0';
  const s = Number(v.toPrecision(digits));
  return String(Math.abs(s) >= 1e15 ? s.toExponential(2) : s);
};

/** A step of 1, 2 or 5 x 10^n that gives about count steps from 0 to span. */
export function niceStep(span, count = 4, steps = NICE) {
  if (!(span > 0)) return 1;
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  return steps.map(m => m * mag).find(s => s >= raw * .999) ?? 10 * mag;
}

/* how values are read: the factor from the data's unit to the reading's unit and the reading's unit name */
function reader(unit, top) {
  const by = bytes(unit);
  if (by) {
    const base = top * 1024 ** by.power;
    let p = 0; while (p < BINARY.length - 1 && base >= 1024 ** (p + 1)) p++;
    return { factor: 1024 ** (by.power - p), name: (BINARY[p] || '') + (by.b || !BINARY[p] ? 'B' : '') };
  }
  if (unit === 'm' && top >= 1000) return { factor: 1 / 1000, name: ' cores' };
  if (unit === 'ms' && top >= 1000) return { factor: 1 / 1000, name: 's' };
  return { factor: 1, name: unit || '' };
}

/**
 * The scale for values from lo to hi.
 * @param {number} lo @param {number} hi @param {{unit?: string, count?: number, zeroFloor?: boolean, headroom?: number}} [o]
 */
export function scale(lo, hi, { unit = '', count = 4, zeroFloor = true, headroom = .1, zero = false, integer = false } = {}) {
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = lo + 1;
  if (hi === lo) hi = lo + (Math.abs(lo) || 1);
  /* the low end fits the data too (a soft minimum, as the dashboards do): it is 0 only for a percentage of capacity, or when the data reaches down near 0 */
  const pct = unit === '%', span = hi - lo, bottom = zeroFloor && lo >= 0 && (pct || zero || lo <= hi * .2) ? 0 : lo - span * headroom;
  const top = hi + (hi - Math.min(lo, bottom)) * headroom, r = reader(unit, Math.max(Math.abs(top), Math.abs(bottom)));
  lo = bottom;
  const a = lo * r.factor, z = top * r.factor, step0 = niceStep(z - a, count, pct ? NICE_PCT : NICE), step = integer && r.factor === 1 ? Math.max(1, Math.round(step0)) : step0;
  const min = Math.floor(a / step) * step, max = Math.ceil(z / step) * step, ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number((v / r.factor).toPrecision(12)));
  const word = v => words(v * r.factor, r.name);
  return { min: Number((min / r.factor).toPrecision(12)), max: ticks.at(-1), ticks, label: word, value: word };
}

/**
 * The scale of a value range the reader set (a drag along the value axis): its ends are exactly min and max, the marks inside it on round steps in the unit read.
 * @param {number} min @param {number} max @param {{unit?: string, count?: number, integer?: boolean}} [o]
 */
export function span(min, max, { unit = '', count = 4, integer = false } = {}) {
  if (!(max > min)) max = min + (Math.abs(min) || 1);
  const r = reader(unit, Math.max(Math.abs(min), Math.abs(max))), a = min * r.factor, z = max * r.factor;
  const step0 = niceStep(z - a, count, unit === '%' ? NICE_PCT : NICE), step = integer && r.factor === 1 ? Math.max(1, Math.round(step0)) : step0, ticks = [];
  for (let v = Math.ceil(a / step - 1e-9) * step; v <= z + step * 1e-9; v += step) ticks.push(Number((v / r.factor).toPrecision(12)));
  const word = v => words(v * r.factor, r.name);
  return { min, max, ticks, label: word, value: word };
}

/* a number with its unit: one core, two cores */
const words = (n, name) => sig(n) + (name === ' cores' && Number(sig(n)) === 1 ? ' core' : name.includes('/') && !name.startsWith('/') ? ' ' + name : name); /* a named rate (MiB/s, req/s) is written with a space; a quantity (512Mi, 300m, 80%) and a bare rate (0.5/s, as a page's head writes it) are not */

/** A reading's words for one value in its unit, on the same rule as the scale's (3 significant digits, binary byte units, cores above 1000m). */
export function formatValue(v, unit = '') {
  const r = reader(unit, Math.abs(v));
  return words(v * r.factor, r.name);
}
