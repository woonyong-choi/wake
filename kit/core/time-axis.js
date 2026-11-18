/*
 * Time axis: the marks under a time chart or a timeline, and the window a reader zooms and pans. Times are seconds since the epoch.
 *   ticks(from, to, width, o): majors at day boundaries in the zone, named by the whole date with its year (2026-11-09); minors between them at a step
 *     chosen for the width (15s and 30s for short windows, 1m, 5m, 15m, 1h, 6h, 1d, 1w; at least four marks in a window of ten minutes or less) and named by the time of day (14:00, 14:00:30).
 *     A window with no day boundary names its first mark with the date too, so the year is always on the axis.
 *   reading(at, zone): the whole date and time to the second, for the reading under the pointer.
 *   zoom(range, at, factor, o) / pan(range, delta, o): the window after a wheel turn around a time, or a drag by some seconds, held inside the
 *     bounds (the data the page gave) and never narrower than o.min seconds.
 *   niceScale(lo, hi, count): a value scale for what is visible (rounded steps of 1, 2, 2.5, 5 x 10^n).
 */
import { formatDay, formatFull, formatInstant, SYSTEM_ZONE } from './clock.js';

export const STEPS = Object.freeze([15, 30, 60, 300, 900, 3600, 21600, 86400, 604800]); /* 15s 30s (short windows only) 1m 5m 15m 1h 6h 1d 1w: the steps the dashboards people read use */
const DAY = 86400;

/* how far the zone is ahead of UTC at an instant, in seconds (read back from the zone's own wall clock) */
function offset(at, zone) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(formatFull(Math.floor(at), zone));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 - Math.floor(at) : 0;
}

/** The step (seconds) whose marks stand at least minPx apart across width pixels for a window of span seconds. */
export function pickStep(span, width, minPx = 64) {
  if (!(span > 0) || !(width > 0)) return STEPS.at(-1);
  const step = STEPS.find(step => width * step / span >= minPx) ?? STEPS.at(-1);
  /* a short window (ten minutes or less) still gets at least four marks (its labels then take turns where they would touch) */
  if (span / step >= 4 || span > 600) return step;
  return [...STEPS].reverse().find(s => span / s >= 4) ?? STEPS[0];
}

/**
 * Marks for a window. o.zone: the time zone ('system', 'utc' or an IANA name); o.minPx: the least room between two marks.
 * @returns {{at: number, label: string, major: boolean, context?: true}[]} in time order (context: the first mark of a window inside one day, named with its date)
 */
export function ticks(from, to, width, { zone = SYSTEM_ZONE, minPx = 64 } = {}) {
  if (!(to > from)) return [];
  const span = to - from, step = pickStep(span, width, minPx), out = [];
  const daily = step >= DAY, unit = daily ? DAY : step;
  /* walk the zone's wall clock: a mark is a multiple of the step there (a day boundary is midnight in the zone, not in UTC) */
  const off = offset(from, zone);
  let wall = Math.ceil((from + off) / unit) * unit;
  for (let guard = 0; guard < 2000; guard++, wall += unit) {
    const at = wall - offset(wall - off, zone);
    if (at > to) break;
    if (at < from) continue;
    const local = at + offset(at, zone), major = local % DAY === 0;
    if (daily) { if (Math.round(local / DAY) % (step / DAY) === 0) out.push({ at, label: formatDay(at, zone), major: true }); continue; }
    out.push({ at, label: major ? formatDay(at, zone) : formatInstant(at, { timeZone: zone, span: step < 60 ? 1 : 0 }), major });
  }
  /* no day boundary in the window: the first mark also says which day (and year) it is */
  if (out.length && !out.some(t => t.major)) out[0] = { ...out[0], label: `${formatDay(out[0].at, zone)} ${out[0].label}`, major: true, context: true }; /* named like a day, but no day boundary: no rule across the plot */
  return out;
}

/** The reading under the pointer: 'YYYY-MM-DD HH:MM:SS' in the zone. */
export const reading = (at, zone = SYSTEM_ZONE) => formatFull(at, zone);

/** A marked span rounded out to the step of the marks its width would have (whole minutes, quarter hours, hours ...), held inside the bounds. */
export function snap(range, width, { minPx = 64, bounds } = {}) {
  const step = pickStep(range.to - range.from, width, minPx), from = Math.floor(range.from / step) * step, to = Math.max(from + step, Math.ceil(range.to / step) * step);
  return bounds ? { from: Math.max(bounds.from, from), to: Math.min(bounds.to, to) } : { from, to };
}

/** A moment named for a span of that length: the time of day (with seconds under ten minutes), with the date when the span is longer than a day and a half. */
export const short = (at, span, zone = SYSTEM_ZONE) => formatInstant(at, { timeZone: zone, span });

/** Keep a window inside the bounds, at its own length (or the bounds' when it is longer). */
function hold(from, to, bounds) {
  if (!bounds) return { from, to };
  const span = Math.min(to - from, bounds.to - bounds.from);
  if (from < bounds.from) return { from: bounds.from, to: bounds.from + span };
  if (to > bounds.to) return { from: bounds.to - span, to: bounds.to };
  return { from, to };
}

/**
 * The window after zooming by factor (< 1 nearer, > 1 farther) around the time at, which stays under the pointer.
 * @param {{from: number, to: number}} range @param {number} at @param {number} factor
 * @param {{min?: number, bounds?: {from: number, to: number}}} [o] min: the narrowest window in seconds (default 60)
 */
export function zoom(range, at, factor, { min = 60, bounds } = {}) {
  const span = range.to - range.from;
  if (!(span > 0) || !(factor > 0)) return { ...range };
  let next = Math.max(min, span * factor);
  if (bounds) next = Math.min(next, bounds.to - bounds.from);
  const f = Math.max(0, Math.min(1, (at - range.from) / span)), from = at - f * next;
  return hold(from, from + next, bounds);
}

/** The window moved by delta seconds (later when positive), held inside the bounds. */
export const pan = (range, delta, { bounds } = {}) => hold(range.from + delta, range.to + delta, bounds);

/** Whether a window is the whole of its bounds (nothing zoomed). */
export const whole = (range, bounds) => !range || !bounds || (range.from <= bounds.from && range.to >= bounds.to);

/** A value scale from lo to at least hi with about count steps: { min, max, ticks }. */
export function niceScale(lo, hi, count = 4) {
  if (!(hi > lo)) hi = lo + 1;
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step, out = [];
  for (let v = min; v <= max + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return { min, max: out.at(-1), ticks: out };
}
