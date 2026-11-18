/*
 * Change timeline: what happened when, as lanes on one time axis (the same axis a chart has: the page's span choice, its ticks, a crosshair, the reading as a tooltip).
 * A lane has a head (an icon, a name, how many marks are in the window; in a narrow body the icon alone when every lane has one, the name as its tooltip) and a track. Two shapes, and the shape is the meaning:
 *   a point  (a small round dot, the same mark a chart's reading has): something that happened at one moment;
 *   a span   (a bar with round ends): something with a start and an end. A span that is still running ends at the "now" line and grows with it.
 * Colour is state only: neutral, warn, danger, and run (the app's own colour, for what is in progress). A mark that has just arrived sends out a ring once.
 * Points that would sit on top of each other in a lane become one dot with a small count in it; its tooltip lists them and a press steps through them. Near is a distance on the
 * screen (a joined dot's width and a little room): the points are joined for a few widths of the track and the track shows the joining made for its own width.
 * Nothing is known before a lane's gap ends: that part of the track is hatched and named (the caller's words), and its edge is a dashed rule.
 *   from, to: the window (seconds); now: where the "now" rule stands (drawn when inside the window)
 *   lanes: { id, label, icon?, tone?: 'warn'|'danger', gapUntil?: seconds }      gapLabel: the name of the hatched part (shown once, in the first lane that has one)
 *   marks: { id, lane, at, end?: seconds, running?: boolean, tone?: 'neutral'|'warn'|'danger'|'run', fresh?: boolean, tip: { time, kind, title?, text? } }
 *   ticks?: { at, label }[] (the page's own marks; without them the axis is the time charts': majors at day boundaries named by the date with its year, minors by the
 *     time of day, as dense as the track's width allows, in timeZone?: 'system'|'utc'|IANA)      selected: a mark's id
 *   selectAction (runs with { arg: id }: a press, or the left and right arrow keys for the mark before and after),
 *   zoomAction (runs with { from, to }: a drag across the track marks a span, a double click asks for twice the window around its middle; on the band of times
 *     under the track a wheel turn zooms around the pointer, and Shift with a wheel or a drag moves the window; elsewhere the wheel scrolls the page). panAction and home are no longer used
 *   marks[].dim: true draws a mark quietly (a page's filter leaves it out) and keeps it pressable; the lane's count leaves it out too
 *   The leftmost time shown on the axis carries its date, as every day boundary does, so the day stays in view while zooming and moving
 *   A dot, a joined dot or a span shows its changes on hover (time, kind, what, the line about it); a press on a joined dot lists them all, each a button that chooses it.
 *   near: the least share of the window two dots keep apart at any width (optional; the screen distance above applies anyway)
 * quality:drawing (a data drawing, not an icon).
 */
import { html, attrs, esc } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { ticks as timeTicks, short as shortTime, zoom as zoomRange } from '../core/time-axis.js';
import { formatDay } from '../core/clock.js';
import { place, lift, drop } from '../core/position.js';

export const name = 'change-timeline';

export const css = `
.ctl { position: relative; display: flex; flex-direction: column; padding: var(--space-2) var(--space-4) var(--space-3); border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--surface-secondary); border: var(--line) solid var(--border-surface); user-select: none; -webkit-user-select: none; --ctl-head-w: calc(var(--space-16) * 2 + var(--space-4)); --ctl-lane-h: var(--space-12); --ctl-pt: var(--space-6); --ctl-row-h: calc(var(--ctl-pt) + var(--space-1)); }
.sbar-body .ctl, .sfl-sec .ctl, .qp-detail .ctl { padding-inline: 0; border: 0; border-radius: 0; background: none; } /* inside a container the container owns the face: the timeline is its content, flat */
.ctl:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: calc(var(--focus-w) * -1); }
.ctl-lane { display: flex; align-items: center; min-height: var(--ctl-lane-h); }
.ctl-lane + .ctl-lane { border-top: var(--line) solid var(--border-half); }
.ctl-h { flex: none; display: flex; align-items: center; gap: var(--space-2); width: var(--ctl-head-w); min-width: 0; padding-inline-end: var(--space-3); font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--foreground); }
.ctl-h > .wi { flex: none; color: var(--muted-foreground); } .ctl-h[data-tone="warn"] > .wi { color: var(--warning); } .ctl-h[data-tone="danger"] > .wi { color: var(--destructive); } /* a lane of one state carries that state's colour on its icon */ .ctl-h > span { min-width: 0; overflow-wrap: normal; word-break: keep-all; line-height: var(--leading-xs); } /* a long name breaks between words onto a second line, never mid-word and never cut short */
.ctl-h > b { margin-inline-start: auto; font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.ctl-track { position: relative; flex: 1; min-width: 0; height: var(--ctl-lane-h); cursor: grab; touch-action: pan-y; container-type: inline-size; }
.ctl-set { display: none; } .ctl-set[data-w="0"] { display: contents; } /* the points joined for the track's width (below): one set shows */
@container (min-width: 320px) { .ctl-set[data-w="0"] { display: none; } .ctl-set[data-w="320"] { display: contents; } } /* quality:literal: a container query cannot read a token */
@container (min-width: 480px) { .ctl-set[data-w="320"] { display: none; } .ctl-set[data-w="480"] { display: contents; } } /* quality:literal: a container query cannot read a token */
@container (min-width: 640px) { .ctl-set[data-w="480"] { display: none; } .ctl-set[data-w="640"] { display: contents; } } /* quality:literal: a container query cannot read a token */
@container (min-width: 800px) { .ctl-set[data-w="640"] { display: none; } .ctl-set[data-w="800"] { display: contents; } } /* quality:literal: a container query cannot read a token */
@container (min-width: 1040px) { .ctl-set[data-w="800"] { display: none; } .ctl-set[data-w="1040"] { display: contents; } } /* quality:literal: a container query cannot read a token; the widths are WIDTHS below */
.ctl-lane.rows .ctl-track { height: calc(var(--ctl-row-h) * var(--ctl-rows) + var(--space-3)); } /* a lane with points and spans, or spans that overlap, gives each its own row: points on top, spans under them */
.ctl-lane.rows :is(.ctl-pt, .ctl-span) { top: calc(var(--ctl-row-h) * (var(--ctl-r) + .5) + var(--space-1_5)); }
.ctl.dragging .ctl-track { cursor: grabbing; }
.ctl-move { position: absolute; inset-block: 0; inset-inline: calc(var(--ctl-pt) / 2); transform: translateX(var(--ctl-shift, 0px)); }
.ctl-clip { position: absolute; inset-block: 0; inset-inline: calc(var(--ctl-pt) / -2); overflow: clip; } /* half a mark of room at both ends: a mark at the window's edge is whole */
.ctl-gap { position: absolute; inset-block: 0; inset-inline-start: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; border-inline-end: var(--line) dashed var(--muted-foreground); background: repeating-linear-gradient(135deg, transparent 0 var(--space-1_5), var(--border-half) var(--space-1_5) calc(var(--space-1_5) + var(--line))); }
.ctl-gap > span { min-width: 0; padding: 0 var(--space-1_5); border-radius: var(--r-chip); background: var(--surface-secondary); font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctl-pt, .ctl-span { --ctl-tone: var(--muted-foreground); position: absolute; top: 50%; padding: 0; cursor: pointer; }
:is(.ctl-pt, .ctl-span)[data-tone="warn"] { --ctl-tone: var(--warning); } :is(.ctl-pt, .ctl-span)[data-tone="danger"] { --ctl-tone: var(--destructive); } :is(.ctl-pt, .ctl-span)[data-tone="run"] { --ctl-tone: var(--brand-content); }
.ctl-pt { --ctl-dot: var(--space-2_5); display: grid; place-items: center; width: var(--ctl-pt); height: var(--ctl-pt); transform: translate(-50%, -50%); border-radius: var(--r-pill); background: none; } /* the button is the room to press; what is drawn is the dot in it */
.ctl-pt::before { content: ""; width: var(--ctl-dot); height: var(--ctl-dot); border-radius: var(--r-pill); background: var(--ctl-tone); transition: box-shadow var(--dur-fast) var(--ease-standard); }
.ctl-pt:hover::before { box-shadow: 0 0 0 var(--space-0_5) color-mix(in oklab, var(--ctl-tone) 30%, transparent); }
.ctl-pt[aria-pressed="true"]::before { box-shadow: 0 0 0 var(--line-avg) var(--surface-secondary), 0 0 0 calc(var(--line-avg) * 2) var(--foreground); }
.ctl-pt.many { --ctl-dot: var(--space-4); } /* a dot that stands for several marks is a little larger and carries their number inside it: nothing beside it to run into the next dot or the now line */
.ctl-n { position: absolute; inset: 0; display: grid; place-items: center; color: var(--background); font-size: var(--text-2xs); font-weight: var(--weight-semibold); line-height: 1; font-variant-numeric: tabular-nums; pointer-events: none; }
.ctl-span { height: var(--space-2_5); min-width: var(--space-2_5); transform: translateY(-50%); border-radius: var(--r-pill); background: color-mix(in oklab, var(--ctl-tone) 80%, transparent); transition: background var(--dur-fast) var(--ease-standard); }
.ctl-span.cut-start { border-start-start-radius: 0; border-end-start-radius: 0; } .ctl-span.cut-end { border-start-end-radius: 0; border-end-end-radius: 0; }
.ctl-span:hover, .ctl-span.on { background: var(--ctl-tone); }
.ctl-span.running { background: color-mix(in oklab, var(--ctl-tone) 80%, transparent); } .ctl-span.running::after { content: ""; position: absolute; inset-block: 0; inset-inline-end: 0; width: var(--space-2_5); border-radius: var(--r-pill); background: var(--ctl-tone); animation: ctl-live var(--dur-live-pulse) var(--ease-standard) infinite; } /* one colour; what is still going on breathes at its growing end */
@keyframes ctl-live { 50% { opacity: var(--cl-pulse-min); } }
@media (prefers-reduced-motion: reduce) { .ctl-span.running::after { animation: none; } }
.ctl-span[aria-pressed="true"] { outline: var(--line-avg) solid var(--foreground); outline-offset: var(--space-0_5); }
:is(.ctl-pt, .ctl-span):focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-0_5); }
.ctl-ripple { position: absolute; inset: calc((var(--ctl-pt) - var(--ctl-dot)) / 2); border-radius: var(--r-pill); pointer-events: none; }
.ctl-ripple::before, .ctl-ripple::after { content: ""; position: absolute; inset: 0; border-radius: inherit; border: var(--line-avg) solid var(--ctl-tone); opacity: 0; animation: ctl-ripple var(--dur-sfl-ripple) var(--ease-out-expo) both; }
.ctl-ripple::after { animation-delay: var(--dur-sfl-ripple-gap); }
@keyframes ctl-ripple { from { opacity: var(--sfl-ripple-o); transform: scale(1); } to { opacity: 0; transform: scale(var(--sfl-ripple-scale)); } }
@media (prefers-reduced-motion: reduce) { .ctl-ripple::before, .ctl-ripple::after { animation: none; } }
.ctl-over { position: absolute; inset-block: var(--space-2) 0; inset-inline: calc(var(--space-4) + var(--ctl-head-w)) var(--space-4); pointer-events: none; }
.ctl-now { position: absolute; inset-block: 0 var(--ctl-axis-h, var(--space-8)); width: 0; border-inline-start: var(--line-avg) solid var(--brand-content); transform: translateX(var(--ctl-shift, 0px)); }
.ctl-xh { position: absolute; inset-block: 0 var(--ctl-axis-h, var(--space-8)); width: 0; border-inline-start: var(--line) solid var(--muted-foreground); opacity: 0; transition: opacity var(--dur-axis) var(--ease-standard); }
.ctl.hover .ctl-xh { opacity: .35; }
.ctl .chart-tip { transition: opacity var(--dur-axis) var(--ease-standard); max-width: min(calc(100vw - var(--space-4)), calc(var(--space-40) * 2 + var(--space-16))); max-height: calc(100vh - var(--space-4)); overflow-y: auto; overscroll-behavior: contain; } /* in the top layer it is bounded by the viewport, and a long reading scrolls inside it */ .ctl .chart-tip.on:has(.rv) { opacity: 1; padding: var(--space-1_5) var(--space-2); border-radius: var(--r-control); corner-shape: var(--corner); background: linear-gradient(var(--surface-secondary), var(--surface-secondary)), var(--background); box-shadow: 0 0 0 var(--line) var(--border-surface); text-shadow: none; } /* a chart's reading stands on its plate; here it stands over other marks, so it has a ground of the plate's own colour */
.ctl .chart-tip .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctl-axis { container-type: inline-size; } .ctl-tick.major { font-weight: var(--weight-semibold); color: var(--foreground); } /* the axis picks its set of times by its own width, as the track picks its dots */
.ctl .chart-tip.pinned { pointer-events: auto; }
:is(.ctl-pt, .ctl-span).dim { opacity: var(--chart-dim-o); transition: opacity var(--dur-fast) var(--ease-standard); } .ctl-pt.dim:hover::before { box-shadow: none; } /* a change the page's filter leaves out: quiet, still there to press */
.ctl-axis { cursor: ew-resize; } /* the band of times: a wheel turn zooms around the pointer, Shift and a wheel or a drag moves the window */
/* the list a joined dot opens can be pressed */
.ctl-list { display: grid; gap: var(--space-0_5); margin-block-start: var(--space-1_5); max-height: var(--legend-pop-max); overflow-y: auto; text-shadow: none; }
.ctl-li { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: var(--space-2); align-items: baseline; padding: var(--space-1) var(--space-1_5); border-radius: var(--r-control-sm); corner-shape: var(--corner); text-align: start; font-size: var(--text-xs); color: var(--foreground); transition: background var(--dur-fast) var(--ease-standard); }
.ctl-li:hover { background: var(--ghost-hover); } .ctl-li:active { opacity: var(--press-opacity); } .ctl-li:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: calc(var(--focus-w) * -1); }
.ctl-li > span { color: var(--muted-foreground); font-variant-numeric: tabular-nums; } .ctl-li > b { font-weight: var(--weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl-li > small { grid-column: 2; color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl-li > b::before { content: ""; display: inline-block; width: var(--space-1_5); height: var(--space-1_5); margin-inline-end: var(--space-1_5); border-radius: var(--r-pill); background: var(--muted-foreground); vertical-align: middle; }
.ctl-li[data-tone="danger"] > b::before { background: var(--destructive); } .ctl-li[data-tone="warn"] > b::before { background: var(--warning); } .ctl-li[data-tone="run"] > b::before { background: var(--brand-content); } /* the state's colour on the mark only: the words stay in the text colour */
.ctl-axis { position: relative; height: var(--space-8); margin-inline-start: var(--ctl-head-w); border-top: var(--line) solid var(--border); overflow: clip; }
.ctl-axis > div { position: absolute; inset: 0; transform: translateX(var(--ctl-shift, 0px)); }
.ctl-tick { position: absolute; top: 0; display: flex; flex-direction: column; align-items: center; gap: var(--space-0_5); transform: translateX(calc(-50% + var(--ctl-dx, 0px))); font-size: var(--chart-axis-size); font-weight: var(--chart-axis-weight-x); color: color-mix(in oklab, var(--foreground) 92%, transparent); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ctl-tick.end { align-items: flex-end; transform: translateX(-100%); } .ctl-tick.start { align-items: flex-start; transform: none; } /* a time at the window's edge is kept whole inside it: its mark stays at its moment, its words turn inward */
.ctl-tick.off { visibility: hidden; } /* a time with no room left beside its neighbours (a day boundary keeps its place first) */
.ctl-tick::before { content: ""; transform: translateX(calc(-1 * var(--ctl-dx, 0px))); width: 0; height: var(--space-1_5); border-inline-start: var(--line) solid color-mix(in oklab, var(--muted-foreground) 60%, transparent); }
@container (max-width: 640px) { .ctl-h > b { display: none; } .ctl.icons { --ctl-head-w: calc(var(--icon) + var(--space-3)); } .ctl.icons .ctl-h > span { display: none; } } /* quality:literal: a container query cannot read a token */ /* narrow: when every lane has an icon the heads are the icons alone (the name is the head's tooltip); otherwise the head keeps its width so the names stay whole */
`;

const TONES = ['neutral', 'warn', 'danger', 'run'], RANK = { neutral: 0, run: 1, warn: 2, danger: 3 };
/* the track widths a joining is made for (each set is used from its width up, so a dot keeps its distance at the narrowest track that shows it), and that distance:
   a joined dot's width (--space-4) and a little room on the screen, in px */
const WIDTHS = [0, 320, 480, 640, 800, 1040], APART = 20, NARROWEST = 240;
/* the zone the times are written in: the timeline's own (timeZone), else the page's (the kit.timeZone setting, on the document as data-time-zone) */
/* wheel over the band of times: how fast a turn zooms, per pixel of delta */
const WHEEL_ZOOM = .002;
const zoneOf = p => p.timeZone ?? globalThis.document?.documentElement?.dataset.timeZone ?? 'system';
const pct = v => `${(v * 100).toFixed(3)}%`;
/* the room a time mark is given when a set of times is made (a time of day, or a date): each set is made for the widest track that shows it (up to the next
   width), and the axis fit (fitAxis) leaves out a time that would touch its neighbour, so a narrow axis still reads as dates or quarter hours, not one time */
const TICK_ROOM = 56;
const setWidth = w => { const next = WIDTHS.find(x => x > w); return next ? next - 1 : Math.round(w * 1.25); };
/* each time carries its day and its own words: the leftmost one shown is given the date too (fitAxis), so the day is never off the axis */
const axisTicks = (list, from, span, zone) => list.filter(t => t.at >= from && t.at <= from + span).map(t => { const plain = t.context ? t.label.split(' ').slice(1).join(' ') : t.label, major = t.major && !t.context; return html`<span class="${tickClass((t.at - from) / span) + (major ? ' major' : '')}" style="left:${pct((t.at - from) / span)}" data-day="${formatDay(t.at, zone)}" data-label="${plain}">${plain}</span>`; });
const tickClass = x => ['ctl-tick', x > .96 && 'end', x < .04 && 'start'].filter(Boolean).join(' '); /* a time at the window's edge turns its words inward */

/** The marks of one lane inside the window: spans cut to it, and points that stand too near each other joined into one (kept in time order, the worst tone leading).
 *  near is a share of the window; a point joins a group while it is nearer than that to the group's own place (the middle of its marks), so two dots that stay apart are at least near apart. */
export function layout(marks, from, to, now, near = .035) {
  const span = to - from, spans = [], points = [];
  for (const m of marks) {
    if (m.end !== undefined || m.running) {
      const end = m.running ? (now ?? to) : m.end;
      if (end < from || m.at > to) continue;
      spans.push({ mark: m, x0: Math.max(0, (m.at - from) / span), x1: Math.min(1, (end - from) / span), cutStart: m.at < from, cutEnd: end > to });
    } else if (m.at >= from && m.at <= to) points.push(m);
  }
  /* spans that overlap in time take rows of their own inside the lane, so each one can be seen and pressed */
  spans.sort((a, b) => a.x0 - b.x0); const ends = [];
  for (const s of spans) { let row = ends.findIndex(end => end <= s.x0); if (row < 0) row = ends.length; ends[row] = s.x1; s.row = row; }
  points.sort((a, b) => a.at - b.at);
  const groups = [];
  for (const m of points) { const g = groups.at(-1); if (g && (m.at - g.sum / g.marks.length) / span < near) { g.marks.push(m); g.sum += m.at; } /* measured from where the group's dot stands; the dot moves on less than its marks do, so a run of near marks is still several groups */ else groups.push({ marks: [m], sum: m.at }); }
  for (const g of groups) { g.x = (g.sum / g.marks.length - from) / span; delete g.sum; g.tone = g.marks.reduce((t, m) => (RANK[m.tone] ?? 0) > (RANK[t] ?? 0) ? m.tone : t, g.marks[0].tone ?? 'neutral'); }
  return { spans, groups, rows: ends.length };
}

export function render(p) {
  const tone = t => TONES.includes(t) ? t : 'neutral', span = p.to - p.from, nearAt = w => Math.max(p.near ?? 0, APART / Math.max(w, NARROWEST));
  const order = [...p.marks].filter(m => (m.running ? p.now ?? p.to : m.end ?? m.at) >= p.from && m.at <= p.to).sort((a, b) => a.at - b.at).map(m => m.id);
  let named = false;
  const lanes = p.lanes.map(lane => {
    const mine = p.marks.filter(m => m.lane === lane.id), { spans, groups, rows } = layout(mine, p.from, p.to, p.now, nearAt(WIDTHS.at(-1))), sets = WIDTHS.map(w => ({ w, groups: layout(mine, p.from, p.to, p.now, nearAt(w)).groups })), lead = groups.length ? 1 : 0, stacked = lead + rows > 1, count = spans.filter(s => !s.mark.dim).length + groups.reduce((t, g) => t + g.marks.filter(m => !m.dim).length, 0); /* a dimmed mark (the page's filter leaves it out) is drawn but not counted */
    const gap = Number.isFinite(lane.gapUntil) && lane.gapUntil > p.from ? Math.min(1, (lane.gapUntil - p.from) / span) : 0, label = gap && !named && p.gapLabel ? (named = true, p.gapLabel) : '';
    return html`<div class="${stacked ? 'ctl-lane rows' : 'ctl-lane'}" data-lane="${lane.id}"${attrs({ style: stacked ? `--ctl-rows:${lead + rows}` : null })}><div class="ctl-h" data-tip="${lane.label}"${attrs({ 'data-tone': lane.tone })}>${lane.icon ? icon(lane.icon) : ''}<span>${lane.label}</span><b>${count}</b></div>
      <div class="ctl-track" data-ctl-track><div class="ctl-clip"><div class="ctl-move">
        ${gap ? html`<span class="ctl-gap" style="width:${pct(gap)}"${attrs({ title: p.gapLabel || null })}>${label ? html`<span>${label}</span>` : ''}</span>` : ''}
        ${spans.map(s => html`<button type="button" class="${['ctl-span', s.mark.running && 'running', s.cutStart && 'cut-start', (s.cutEnd || s.mark.running) && 'cut-end', s.mark.dim && 'dim'].filter(Boolean).join(' ')}" data-tone="${tone(s.mark.tone)}" style="left:${pct(s.x0)};width:${pct(Math.max(0, s.x1 - s.x0))};--ctl-r:${lead + s.row}" data-key="${JSON.stringify(['ctl', s.mark.id])}" data-ctl-id="${s.mark.id}" data-ctl-tip="${JSON.stringify([{ ...s.mark.tip, tone: tone(s.mark.tone) }])}" aria-pressed="${String(p.selected === s.mark.id)}"${attrs({ 'data-action': p.selectAction, 'data-arg': p.selectAction ? s.mark.id : null, 'aria-label': [s.mark.tip?.kind, s.mark.tip?.title].filter(Boolean).join(' · ') })}></button>`)}
        ${sets.map(set => html`<div class="ctl-set" data-w="${set.w}" data-key="${JSON.stringify(['ctl-set', set.w])}">${set.groups.map(g => { const ids = g.marks.map(m => m.id), at = ids.indexOf(p.selected), first = g.marks[Math.max(0, at)], next = ids[(at + 1) % ids.length], many = g.marks.length > 1;
          return html`<button type="button" class="${['ctl-pt', many && 'many', g.marks.every(m => m.dim) && 'dim'].filter(Boolean).join(' ')}" data-tone="${tone(many ? g.tone : first.tone)}" style="left:${pct(g.x)};--ctl-r:0" data-key="${JSON.stringify(['ctl', set.w, ids[0]])}" data-ctl-id="${first.id}" data-ctl-tip="${JSON.stringify(g.marks.map(m => ({ ...m.tip, tone: tone(m.tone) })))}" aria-pressed="${String(at >= 0)}"${attrs({ 'data-action': many ? null : p.selectAction, 'data-arg': p.selectAction && !many ? next : null, 'data-ctl-list': many ? '' : null, 'data-ctl-ids': many ? ids : null, 'aria-label': [first.tip?.kind, first.tip?.title].filter(Boolean).join(' · ') })}>${g.marks.some(m => m.fresh) ? html`<i class="ctl-ripple" data-key="${JSON.stringify(['ctl-ripple', g.marks.filter(m => m.fresh).map(m => m.id).join()])}" aria-hidden="true"></i>` : ''}${many ? html`<b class="ctl-n">${g.marks.length}</b>` : ''}</button>`; })}</div>`)}
      </div></div></div></div>`;
  });
  /* the now rule is drawn first (under the lanes' marks): a mark of the latest minute stands on it whole, its number not crossed by the rule (A2-14) */
  const now = Number.isFinite(p.now) && p.now >= p.from && p.now <= p.to ? html`<i class="ctl-now" style="left:${pct((p.now - p.from) / span)}"></i>` : '';
  return html`<div class="${p.lanes.every(lane => lane.icon) ? 'ctl icons' : 'ctl'}" data-c="change-timeline" tabindex="0" role="group"${attrs({ 'aria-label': p.label, 'data-ctl': JSON.stringify({ from: p.from, to: p.to, order, selected: p.selected ?? null, select: p.selectAction ?? null, pan: p.panAction ?? null, zoom: p.zoomAction ?? null, home: p.home ?? null, zone: zoneOf(p) }) })}>
    <div class="ctl-over">${now}</div>${lanes}
    <div class="ctl-axis"><div>${p.ticks ? axisTicks(p.ticks, p.from, span, zoneOf(p)) : WIDTHS.map(w => html`<div class="ctl-set ctl-tset" data-w="${w}" data-key="${JSON.stringify(['ctl-axis', w])}">${axisTicks(timeTicks(p.from, p.to, setWidth(Math.max(w, NARROWEST)), { zone: zoneOf(p), minPx: TICK_ROOM }), p.from, span, zoneOf(p))}</div>`)}</div></div>
    <div class="ctl-over" data-ctl-over data-own-children><i class="ctl-xh"></i><div class="chart-tip" role="status" aria-live="polite"></div></div>
  </div>`;
}

/** The reading of a mark, in the words and shape a chart's reading has: a large first line (the kind, in its tone), small lines under it (what, the one line about it, when). Several marks list the first few. */
export function tipMarkup(items, limit = 6) {
  const line = text => text ? `<div class="t">${esc(text)}</div>` : '';
  if (items.length === 1) { const m = items[0]; return `<div class="rv"${m.tone && m.tone !== 'neutral' ? ` data-tone="${m.tone === 'warn' ? 'warning' : esc(m.tone)}"` : ''}>${esc(m.kind ?? '')}</div>${line(m.title)}${line(m.text)}${line(m.time)}`; }
  const head = items[0], rest = items.length - limit, kinds = [...new Set(items.map(m => m.kind).filter(Boolean))], name = kinds.length === 1 ? `${kinds[0]} ${items.length}` : kinds.slice(0, 2).join(' · ') + (kinds.length > 2 ? ` +${kinds.length - 2}` : ''); /* marks of one kind are counted; of several, the kinds are named */
  return `<div class="rv"${head.tone && head.tone !== 'neutral' ? ` data-tone="${head.tone === 'warn' ? 'warning' : esc(head.tone)}"` : ''}>${esc(name)}</div>` + items.slice(0, limit).map(m => line([m.time, kinds.length > 1 ? m.kind : '', m.title, m.text].filter(Boolean).join(' · '))).join('') + (rest > 0 ? line(`+${rest}`) : '');
}

/** The list a press on a joined dot opens: every change in it, each a button that chooses it (select: the page's action; ids in the order of the items). */
export function listMarkup(items, ids, select) {
  const kinds = new Set(items.map(m => m.kind).filter(Boolean));
  return tipMarkup(items, 0).replace(/<div class="t">\+\d+<\/div>$/, '') + `<div class="ctl-list" role="listbox">${items.map((m, i) => `<button type="button" class="ctl-li" role="option"${m.tone && m.tone !== 'neutral' ? ` data-tone="${esc(m.tone)}"` : ''}${select ? ` data-action="${esc(select)}" data-arg="${esc(JSON.stringify(ids[i]))}"` : ''}><span>${esc(m.time ?? '')}</span><b>${esc([kinds.size > 1 ? m.kind : '', m.title].filter(Boolean).join(' · '))}</b>${m.text ? `<small>${esc(m.text)}</small>` : ''}</button>`).join('')}</div>`;
}

/* the times under the track stay whole inside it: a centred label that would run past an edge is moved in (its mark stays at its moment), and one that then lies on a
   neighbour is left out, day boundaries kept first. Fitted again when the axis is drawn again or changes width */
function fitAxis(axis) {
  const W = axis.clientWidth; if (!W) return;
  const ticks = [...axis.querySelectorAll('.ctl-tick')].filter(t => t.offsetParent), gap = parseFloat(getComputedStyle(axis).getPropertyValue('--space-2')) || 0;
  /* fitted already and nothing changed since (the same width and times, and the axis still as it was left): nothing is written, so a second watcher of the
     same axis (the kit attached twice on one page) is not stirred by this one's writes, and the two cannot keep stirring each other */
  const state = () => ticks.map(t => `${t.className}|${t.textContent}|${t.style.getPropertyValue('--ctl-dx')}`).join(';');
  const sig = W + ';' + ticks.map(t => `${t.dataset.label}@${t.style.left}`).join(';');
  if (axis._fitSig === sig && axis._fitOut === state()) return;
  ticks.forEach(t => { if (t.dataset.label != null && t.textContent !== t.dataset.label) t.textContent = t.dataset.label; });
  const fit = (skip = null) => {
    const boxes = ticks.filter(t => { t.classList.remove('start', 'end', 'off'); t.style.removeProperty('--ctl-dx'); if (skip?.has(t)) { t.classList.add('off'); return false; } return true; }).map(t => {
      const x = parseFloat(t.style.left) / 100 * W, w = t.offsetWidth, l = x - w / 2, dx = l < 0 ? -l : l + w > W ? W - (l + w) : 0;
      if (dx) t.style.setProperty('--ctl-dx', dx + 'px');
      return { t, l: l + dx, r: l + dx + w, major: t.classList.contains('major') };
    });
    const kept = [];
    for (const b of [...boxes.filter(b => b.major), ...boxes.filter(b => !b.major)]) {
      if (kept.some(k => k.l < b.r + gap && k.r > b.l - gap)) b.t.classList.add('off'); else kept.push(b);
    }
    return kept;
  };
  /* the leftmost time shown says its day too (a day boundary already is one), and the times are fitted again around its longer words */
  const first = fit().sort((a, b) => a.l - b.l)[0];
  if (first && !first.major && first.t.dataset.day) {
    first.t.textContent = `${first.t.dataset.day} ${first.t.dataset.label}`; fit();
    /* its longer words must not push out only the time beside it: then every other time goes (every third, …), so the times stay evenly spaced (R4-11) */
    const at = ticks.indexOf(first.t), minor = t => !t.classList.contains('major');
    let skip = new Set();
    const crowded = () => ticks.some((t, i) => i > at && minor(t) && !skip.has(t) && t.classList.contains('off'));
    for (let k = 2; k <= 4 && crowded(); k++) { skip = new Set(ticks.filter((t, i) => minor(t) && i !== at && (i < at || (i - at) % k !== 0))); fit(skip); }
    if (crowded()) { skip = new Set(); fit(); }
  }
  axis._fitSig = sig; axis._fitOut = state();
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  if (win.ResizeObserver) {
    /* each axis is watched by itself (a redraw of the page patches its times); the page only for axes that come. Fitting writes to the axis: what it writes is dropped */
    const quiet = axis => { fitAxis(axis); redraws.takeRecords(); }, seen = new WeakSet();
    const sizes = new win.ResizeObserver(entries => entries.forEach(e => quiet(e.target)));
    const redraws = new win.MutationObserver(records => new Set(records.map(r => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest?.('.ctl-axis')).filter(Boolean)).forEach(quiet));
    const scan = () => root.querySelectorAll('.ctl-axis').forEach(axis => { if (seen.has(axis)) return; seen.add(axis); sizes.observe(axis); redraws.observe(axis, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] }); quiet(axis); });
    new win.MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('.ctl, .ctl-axis') || n.querySelector('.ctl-axis'))))) scan(); }).observe(root, { childList: true, subtree: true });
    scan();
  }
  const host = e => e.target.closest?.('.ctl[data-ctl]'), data = el => JSON.parse(el.dataset.ctl);
  const over = el => el.querySelector(':scope > [data-ctl-over]'), slop = 4;
  let drag = null, swallow = false;
  const hideTip = el => { const tip = over(el)?.querySelector('.chart-tip'); if (!tip) return; tip.classList.remove('on'); drop(tip); };
  /* the reading of a mark is lifted into the top layer (core/position.js): no card, bar or pane edge cuts it; it sits above the mark, below it
     when there is no room above, and is kept inside the viewport; a long list scrolls inside it */
  const showTip = (el, mark, keep = false) => {
    const box = over(el), tip = box.querySelector('.chart-tip'), b = box.getBoundingClientRect(), r = mark.getBoundingClientRect();
    if (!keep) tip.innerHTML = tipMarkup(JSON.parse(mark.dataset.ctlTip));
    tip.classList.add('on'); /* kept on the tooltip itself: a redraw of the page never touches what is inside the overlay */
    if (lift(tip)) { const p = place(tip, r, { side: 'top', align: 'center', sideOffset: 6, padding: 8 }); Object.assign(tip.style, { left: p.x + 'px', top: p.y + 'px' }); return; }
    const x = r.left + r.width / 2 - b.left, w = tip.offsetWidth, h = tip.offsetHeight, above = r.top - b.top - h - 6;
    Object.assign(tip.style, { left: Math.max(0, Math.min(b.width - w, x + 10 + w > b.width ? x - 10 - w : x + 10)) + 'px', top: (above >= 0 ? above : r.bottom - b.top + 6) + 'px' });
  };
  /* a press on a joined dot opens the list of its changes in the reading's place; it stays until a press elsewhere or Escape */
  const unpin = el => { if (!el?._pinned) return; el._pinned = null; const tip = over(el)?.querySelector('.chart-tip'); tip?.classList.remove('pinned'); hideTip(el); };
  root.addEventListener('click', e => {
    const mark = e.target.closest?.('[data-ctl-list]'), el = host(e);
    for (const other of root.querySelectorAll('.ctl')) if (other !== el || mark && other._pinned !== mark) { if (!(other === el && e.target.closest?.('.chart-tip.pinned'))) unpin(other); }
    if (!mark || !el || swallow) return;
    const d = data(el), tip = over(el).querySelector('.chart-tip');
    showTip(el, mark); tip.innerHTML = listMarkup(JSON.parse(mark.dataset.ctlTip), JSON.parse(mark.dataset.ctlIds), d.select); tip.classList.add('pinned'); el._pinned = mark; showTip(el, mark, true);
    tip.querySelector('.ctl-li')?.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { const el = e.target.closest?.('.ctl'); if (el?._pinned) { e.preventDefault(); const mark = el._pinned; unpin(el); mark.focus?.({ preventScroll: true }); } } });
  root.addEventListener('pointermove', e => {
    if (drag) { moveDrag(e); return; }
    const el = host(e); if (!el || el._pinned) return;
    const box = over(el), b = box.getBoundingClientRect(), x = e.clientX - b.left, inside = x >= 0 && x <= b.width && !!e.target.closest('[data-ctl-track]');
    el.classList.toggle('hover', inside);
    if (inside) box.querySelector('.ctl-xh').style.left = x + 'px';
    const mark = e.target.closest('[data-ctl-tip]');
    if (mark) showTip(el, mark); else hideTip(el);
  });
  root.addEventListener('pointerleave', e => { if (e.target.matches?.('.ctl')) { e.target.classList.remove('hover'); if (!e.target._pinned) hideTip(e.target); } }, true);
  root.addEventListener('focusin', e => { const mark = e.target.closest?.('[data-ctl-tip]'), el = mark && mark.closest('.ctl'); if (el && !el._pinned && mark.matches(':focus-visible')) showTip(el, mark); });
  root.addEventListener('focusout', e => { const el = e.target.closest?.('.ctl'); if (el && !el._pinned) hideTip(el); });
  /* a drag across the track marks a span to look at, as a drag does on a time chart (nothing pans; the page is asked once, on release) */
  root.addEventListener('pointerdown', e => {
    const el = host(e), track = e.target.closest?.('[data-ctl-track]'), band = e.target.closest?.('.ctl-axis');
    if (!el || !(track || band) || e.button !== 0) return;
    const d = data(el); if (!d.zoom) return;
    drag = { el, d, x0: e.clientX, id: e.pointerId, zoom: !band, moved: false, veil: null, box: over(el).getBoundingClientRect() }; /* on the band of times a drag moves the window */
  });
  const moveDrag = e => {
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < slop) return;
    if (!drag.moved) { drag.moved = true; drag.el.setPointerCapture?.(drag.id); drag.el.classList.add('dragging'); drag.el.classList.remove('hover'); hideTip(drag.el); }
    if (drag.zoom) {
      if (!drag.veil) { drag.veil = over(drag.el).appendChild(Object.assign(doc.createElement('div'), { className: 'chart-zoom' })); drag.veil.innerHTML = '<span class="cz-t a"></span><span class="cz-t b"></span>'; }
      const l = Math.max(0, Math.min(drag.x0, e.clientX) - drag.box.left), r = Math.min(drag.box.width, Math.max(drag.x0, e.clientX) - drag.box.left);
      Object.assign(drag.veil.style, { left: l + 'px', width: Math.max(0, r - l) + 'px', top: '0px', bottom: 'var(--ctl-axis-h, var(--space-8))' });
      /* the same marked span as a time chart's: a band with handles, and where it starts and ends */
      const span = drag.d.to - drag.d.from, at = x => drag.d.from + x / drag.box.width * span, a = at(l), b = at(r);
      drag.veil.children[0].textContent = shortTime(a, b - a, drag.d.zone); drag.veil.children[1].textContent = shortTime(b, b - a, drag.d.zone);
    } else drag.el.style.setProperty('--ctl-shift', dx + 'px');
  };
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { el, d, veil, zoom, moved, box, x0 } = drag; drag = null;
    el.releasePointerCapture?.(e.pointerId); el.classList.remove('dragging'); veil?.remove();
    if (!moved) return;
    swallow = true; win.setTimeout(() => { swallow = false; }, 0); /* the release of a drag is not a press on the mark under it */
    const span = d.to - d.from, at = x => d.from + Math.max(0, Math.min(1, (x - box.left) / box.width)) * span;
    if (e.type !== 'pointercancel') {
      if (zoom) { const a = at(Math.min(x0, e.clientX)), z = at(Math.max(x0, e.clientX)); if (z - a >= 1) ctx.emit(d.zoom, { from: Math.round(a), to: Math.round(z) }); }
      else { const dt = -(e.clientX - x0) / box.width * span; ctx.emit(d.zoom, { from: Math.round(d.from + dt), to: Math.round(d.to + dt) }); }
    }
    win.requestAnimationFrame(() => el.style.removeProperty('--ctl-shift'));
  };
  root.addEventListener('pointerup', endDrag); root.addEventListener('pointercancel', endDrag);
  root.addEventListener('click', e => { if (swallow && e.target.closest?.('.ctl')) { e.stopPropagation(); e.preventDefault(); } }, true);
  /* the band of times: a wheel turn zooms around the pointer, Shift and a wheel (or a sideways wheel) moves the window; the turns of one frame are one request.
     Everywhere else on the timeline the wheel scrolls the page */
  let wheel = null;
  root.addEventListener('wheel', e => {
    const band = e.target.closest?.('.ctl-axis'), el = band && host(e); if (!el) return;
    const d = data(el); if (!d.zoom) return;
    e.preventDefault();
    const b = band.getBoundingClientRect(), pan = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY), delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : 1);
    if (wheel && wheel.el === el && wheel.pan === pan) { if (pan) wheel.dx += delta; else wheel.k *= Math.exp(delta * WHEEL_ZOOM); return; }
    wheel = { el, pan, dx: pan ? delta : 0, k: pan ? 1 : Math.exp(delta * WHEEL_ZOOM), at: d.from + Math.max(0, Math.min(1, (e.clientX - b.left) / (b.width || 1))) * (d.to - d.from), w: b.width || 1 };
    win.requestAnimationFrame(() => {
      const step = wheel; wheel = null; const span = d.to - d.from;
      const r = step.pan ? { from: d.from + step.dx / step.w * span, to: d.to + step.dx / step.w * span } : zoomRange(d, step.at, step.k, { min: 60 });
      if (Math.round(r.from) !== d.from || Math.round(r.to) !== d.to) ctx.emit(d.zoom, { from: Math.round(r.from), to: Math.round(r.to) });
    });
  }, { passive: false });
  /* a double click on the track asks for twice the window around its middle (the time charts' zoom out) */
  root.addEventListener('dblclick', e => {
    const el = host(e); if (!el || !e.target.closest('[data-ctl-track]') || e.target.closest('[data-ctl-tip]')) return;
    const d = data(el); if (!d.zoom) return;
    const mid = (d.from + d.to) / 2, span = d.to - d.from;
    ctx.emit(d.zoom, { from: Math.round(mid - span), to: Math.round(mid + span) });
  });
  /* left and right: the mark before and after the chosen one, in time order (the first or the last when none is chosen) */
  root.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const el = host(e); if (!el) return;
    const d = data(el); if (!d.select || !d.order.length) return;
    const i = d.order.indexOf(d.selected), next = e.key === 'ArrowRight' ? (i < 0 ? 0 : Math.min(d.order.length - 1, i + 1)) : (i < 0 ? d.order.length - 1 : Math.max(0, i - 1));
    e.preventDefault();
    if (d.order[next] !== d.selected) ctx.emit(d.select, { arg: d.order[next] });
  });
}
