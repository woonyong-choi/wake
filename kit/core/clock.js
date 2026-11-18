/*
 * Clock: how an instant (seconds since the epoch) is written for a reader in a time zone, and how a time a reader typed is read back.
 * A time zone is 'system' (the reader's own), 'utc' or an IANA name ('Asia/Seoul'). The kit stores the choice as the setting kit.timeZone.
 * Charts, their event lists and range inputs all go through here, so one choice of zone changes every time on the screen at once.
 */
export const SYSTEM_ZONE = 'system';
export const UTC_ZONE = 'utc';

/** The zone as Intl wants it: undefined is the system's own. */
const intlZone = zone => (zone === UTC_ZONE ? 'UTC' : zone && zone !== SYSTEM_ZONE ? zone : undefined);

/** Whether a zone setting names a zone that exists (system, utc, or an IANA name this runtime knows). */
export function validZone(zone) {
  if (zone === SYSTEM_ZONE || zone === UTC_ZONE) return true;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return typeof zone === 'string' && zone.length > 0; } catch { return false; }
}

const parts = (ms, zone) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: intlZone(zone), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));

/**
 * An instant as text: the time of day (with seconds when the window it belongs to is short), with the date in front when the window is longer than a day and a half.
 * @param {number} seconds @param {{timeZone?: string, span?: number}} [o] span: the length in seconds of the window the label sits in
 * @returns {string}
 */
export function formatInstant(seconds, { timeZone = SYSTEM_ZONE, span = 0 } = {}) {
  const t = parts(seconds * 1000, timeZone), day = `${t.hour}:${t.minute}`;
  if (span > 36 * 3600) return `${t.year}-${t.month}-${t.day} ${day}`; /* a date is never shown without its year */
  return span > 0 && span < 600 ? `${day}:${t.second}` : day;
}

/** A full date and time, for a field the reader edits: 'YYYY-MM-DD HH:MM'. */
export function formatDateTime(seconds, timeZone = SYSTEM_ZONE) {
  const t = parts(seconds * 1000, timeZone);
  return `${t.year}-${t.month}-${t.day} ${t.hour}:${t.minute}`;
}

/** When something happened, for a list or a message (RULE-TIME): 'HH:MM' on the reader's today, 'YYYY-MM-DD HH:MM' on another day. */
export function formatWhen(seconds, nowSeconds, timeZone = SYSTEM_ZONE) {
  const t = parts(seconds * 1000, timeZone), n = parts(nowSeconds * 1000, timeZone);
  return t.year === n.year && t.month === n.month && t.day === n.day ? `${t.hour}:${t.minute}` : formatDateTime(seconds, timeZone);
}

/** The day of an instant: 'YYYY-MM-DD' (a day boundary on a time axis, a date in a list). */
export function formatDay(seconds, timeZone = SYSTEM_ZONE) {
  const t = parts(seconds * 1000, timeZone);
  return `${t.year}-${t.month}-${t.day}`;
}

/** An instant in full, to the second: 'YYYY-MM-DD HH:MM:SS' (a reading under the pointer, a tooltip). */
export function formatFull(seconds, timeZone = SYSTEM_ZONE) {
  const t = parts(seconds * 1000, timeZone);
  return `${t.year}-${t.month}-${t.day} ${t.hour}:${t.minute}:${t.second}`;
}

/** How far the zone is ahead of UTC at an instant, in milliseconds. */
function offsetAt(ms, zone) {
  const t = parts(ms, zone);
  return Date.UTC(+t.year, +t.month - 1, +t.day, +t.hour, +t.minute, +t.second) - Math.floor(ms / 1000) * 1000;
}

/**
 * Text the reader typed ('YYYY-MM-DD HH:MM' or with seconds, a space or a T) read as a time in the zone; NaN when it is not that form or not a real date.
 * A time that happens twice (the clock going back) is read as its first time, one that does not happen (the clock going forward) as the time after the gap.
 */
export function parseDateTime(text, timeZone = SYSTEM_ZONE) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(text).trim());
  if (!m) return NaN;
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)], asUtc = Date.UTC(y, mo - 1, d, h, mi, s), check = new Date(asUtc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return NaN;
  /* the offsets a day before and a day after the typed time bracket any change of the clock; a candidate stands when the zone really has the offset it was made with */
  const DAY = 24 * 3600 * 1000, before = offsetAt(asUtc - DAY, timeZone), after = offsetAt(asUtc + DAY, timeZone);
  const candidates = [asUtc - before, asUtc - after].filter((ms, i) => offsetAt(ms, timeZone) === [before, after][i]);
  const ms = candidates.length ? Math.min(...candidates) : asUtc - before; /* repeated: the first; skipped: the time after the gap */
  return ms / 1000;
}

/** The zone's short name for a reader ('UTC', 'GMT+9', 'KST'), at an instant (zones change their offset through the year). */
export function zoneLabel(timeZone = SYSTEM_ZONE, seconds = Date.now() / 1000, locale = undefined) {
  if (timeZone === UTC_ZONE) return 'UTC';
  const name = new Intl.DateTimeFormat(locale, { timeZone: intlZone(timeZone), timeZoneName: 'short' }).formatToParts(new Date(seconds * 1000)).find(p => p.type === 'timeZoneName');
  return name ? name.value : String(timeZone);
}
