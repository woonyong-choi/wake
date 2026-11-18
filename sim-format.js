/*
 * 시뮬레이션의 시각과 시간 표기 하나: 모든 시각은 T0(지금 시나리오의 감지 시각) 기준 초 숫자이고, 글자는 여기서만 만든다.
 * 시나리오마다 감지 날짜와 시각이 다르다(sim-data의 DETECT). 시나리오를 고르면 setDetection이 T0를 바꾸고, 모든 표기가 그 시계를 따른다.
 * 화면은 KST로 읽는다(견본 클러스터와 같은 시간대).
 */
import { t as L } from './sim-locale.js';

export const H = 3600, D = 86400;
const KST = 9 * H;
/** the detection moment of the scenario in play (epoch seconds); a live binding: every importer reads the clock now set */
export let T0 = Date.UTC(2026, 10, 12, 5, 2, 0) / 1000;
/** set the detection moment (epoch seconds); true when it changed */
export const setDetection = epoch => { if (epoch === T0) return false; T0 = epoch; return true; };
/** seconds since midnight KST of a moment relative to T0 */
export const wallSec = at => (((T0 + KST + at) % D) + D) % D;
/** the weekday (0 Sunday … 6 Saturday, KST) of a moment relative to T0 */
export const weekday = at => (Math.floor((T0 + KST + at) / D) + 4) % 7;
const pad = n => String(n).padStart(2, '0');
const wall = at => new Date((T0 + at + KST) * 1000);

/** 14:02 */
export const hm = at => { const d = wall(at); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
/** 14:02:16 */
export const hms = at => `${hm(at)}:${pad(wall(at).getUTCSeconds())}`;
/** 2026-11-12 */
export const ymd = at => { const d = wall(at); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
/** 2026-11-12 14:02 */
export const day = at => `${ymd(at)} ${hm(at)}`;
/** a time carries its date when it is not on the same day as `now` */
export const when = (at, now = 0) => (ymd(at) === ymd(now) ? hm(at) : day(at));
/** the seconds from T0 of a wall-clock time on the detection day (14:02 → 0) */
export const wallToRel = (h, m, s = 0) => h * H + m * 60 + s - wallSec(0);
/** what an evidence read covers: a moment (`at`) as "14:02:16 시점", a window (`from`–`to`) as "13:59:48 – 14:01:41" (seconds only when they are not zero) */
export const rangeText = ({ at, from, to }) => at != null ? L('sim.fmt.at', { time: at % 60 ? hms(at) : hm(at) }) : from != null ? (ymd(from) !== ymd(to) ? `${day(from)} – ${day(to)}` : from % 60 || to % 60 ? `${hms(from)} – ${hms(to)}` : `${hm(from)} – ${hm(to)}`) : '';

/** 1분 05초 · 40초 (rounded, never negative) */
export const dur = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m ? L('sim.fmt.minSec', { m, s: pad(s % 60) }) : L('sim.fmt.sec', { s }); };
/** 1분 5초 · 40초 (whole seconds as given) */
export const durLoose = s => (s >= 60 ? L('sim.fmt.minSec', { m: Math.floor(s / 60), s: s % 60 }) : L('sim.fmt.sec', { s }));
/** an AGE column as kubectl prints it: 45s · 13m · 5h · 144d */
export const kubeAge = s => { s = Math.max(0, Math.floor(s)); return s < 60 ? `${s}s` : s < H ? `${Math.floor(s / 60)}m` : s < D ? `${Math.floor(s / H)}h` : `${Math.floor(s / D)}d`; };
/** how long something has lasted, in its largest unit: 20초 · 3분 · 2시간 · 4일 */
export const span = s => { s = Math.max(0, s); return s < 60 ? L('sim.fmt.spanSec', { n: Math.round(s) }) : s < H ? L('sim.fmt.spanMin', { n: Math.floor(s / 60) }) : s < D ? L('sim.fmt.spanHour', { n: Math.floor(s / H) }) : L('sim.fmt.spanDay', { n: Math.floor(s / D) }); };
