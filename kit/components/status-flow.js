/*
 * Status flow: a GitOps controller's work as one line that moves, on a bar that opens.
 * The line is: an event is received, the job it starts goes through its steps (approve, apply, check), and a result is left. Where an event came from does not matter here, so the drawing says
 * only that one arrived and what kind it is, as a keyword (several that arrive together are one event with a count). Every change is seen as it happens: an event reaching the line sends rings out of its mark,
 * a band fills toward the step that is next and a light runs along it while the step works, a step that finishes is ticked, a step that waits for a person breathes, one that fails
 * shakes once and the band stops in front of it. When the job waits or stops on something only a person can decide, the decision opens under the line with its buttons.
 * One card is one GitOps: closed, the bar says which one it is, which Git source it follows, what it is doing now and how things stand.
 * The page owns the state (open, selected unit, what each unit reports, what a button does); this draws what it is given and invents nothing: a step nobody reports on is 'idle', never 'done'.
 *   unit: { id, name, tool, headline: {tone, text, meta?}, event: { id, kind, keyword, icon? (instead of the mark of the kind of event), more?, at?, active } | null, toolIcon? (the tool's own mark, for the closed bar), resultIcon?,
 *           steps: { id, label, icon? (without one the mark says the state: a tick, a cross, a clock), glyph? (a few characters in the mark instead), state: 'done'|'run'|'wait'|'fail'|'idle'|'live', text, meta? }[],
 *           results: { id, label, tone, text }[] (what came of it: does the running state match Git, is it healthy),
 *           actions?: { id, label, icon?, action, arg }[] (what can be done to the whole run at any time, as in the heads of the pipelines people read: run again, hold; one the decision also offers is shown in the decision only),
 *           decision?: { tone, title?, text, actions: { id, label, icon?, variant?, action, arg }[] } (a flat row of the card; without a title it is the text alone, when the head already names the state),
 *           sections?: { id, label, icon?, items: { id, label, value, dot? }[] (said when closed), open, nodes?: string[] (the nodes that open it), body?: Safe, events?: { items: { id, tone, label, detail?, tool? (the tool that did it, a button to its own page: toolAction, toolArg), by?, at? }[], summary?: { id, label, value, tone }[], more?: string, empty }, points?: { label, items: { id, rev, pr, title, at, stat?, result, current?, recommended? }[], selected, preview?: { title, note?, body },
 *             select: action, scope?: { label, value, tabs, action }, note?, actions: { id, label, icon?, variant?, action, arg }[], labels: { current, recommended, fail, degraded } } }[] }
 *   unit.links?: { id, label, icon?, action, arg }[] (to the places where the whole record is kept: it is not drawn here, only what a person needs to decide the next step is)
 *   unit.node?: the node whose detail is shown when detail is 'select' (the page keeps it; without it, the node that needs a person or is working)
 *   detail: 'stack' (the default: closed items under the line, each opening to its content) | 'select' (a press on a node shows that node's detail under the line)
 *   unit: the one GitOps this card is about; source?: { repo, ref, rev } (the Git source it follows)
 *   header: false (inside a disclosure whose head already names it, its source and its state): the open card draws no title row of its own (name,
 *     tool chip, state); the run's actions stay. The default draws it.
 *   compact: true (opt-in): the line stays across however narrow the card is (no turn to a column under 640): the steps draw closer and the lines under a step's name end in an ellipsis,
 *     their whole words in a tooltip shown only when cut. Without it the line turns into a column on a narrow card.
 *   open, toggle: { action, arg }, node: action name (a press on a node: arg { unit, node }), section: action name (a section's open state is the page's: arg { arg: { unit, id }, open }), labels: { listening, event, result, source }
 * Sections are rows of the card, not cards: a rule between them and none under the last; what a section holds is flat (the card owns the face). A section that is added slides in once.
 * A mark that waits (or an event that has just arrived) breathes, a failed one breathes in the error colour and shakes once as it fails: the shared state motion (state-motion.js).
 * The nodes are small cards (a status mark and the name, what it says, a short line) because that is how the pipelines people already read draw their steps.
 * quality:drawing (the bands are a data drawing, not an icon).
 */
import { html, attrs, cx } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { motionOf } from './state-motion.js';
import * as summaryBar from './summary-bar.js';
import * as badge from './badge.js';
import * as button from './button.js';
import * as pillTabs from './pill-tabs.js';

export const name = 'status-flow';

/** A state's tone, as the colour token it is drawn in. 'idle' is the quiet one: nothing reported, or nothing to do. */
export const TONE = Object.freeze({ ok: '--success', busy: '--brand-content', idle: '--muted-foreground', warn: '--warning', error: '--destructive' });
/* the same tone as words: a state colour in letters is its darker word colour (the same colour in the dark theme) */
const WORD = Object.freeze({ ok: '--success-content', busy: '--brand-content', idle: '--muted-foreground', warn: '--warning-content', error: '--destructive-content' });
/** What kind of event arrived, as the icon in its mark; what came of the run, as the icon in the last mark. */
export const EVENT_ICON = Object.freeze({ git: 'branch', manual: 'play', drift: 'arrow-rotate-clockwise', image: 'upload', webhook: 'bolt', schedule: 'clock', parent: 'group-check', dependency: 'hourglass' });
/** What a mark says when the page gives it no icon of its own: the state itself, as the pipelines people read mark their steps (a tick, a cross, a clock for waiting); a step that has not started has no mark, and a running one is drawn by its ring. */
const STATE_ICON = Object.freeze({ done: 'check', live: 'check', fail: 'cross-medium', wait: 'clock' });
/** A step's state, as the tone it has. 'live' is a step that never ends (the comparing): steady, not running. 'event' is the mark of an event that has just arrived. */
export const STATE_TONE = Object.freeze({ done: 'ok', live: 'ok', run: 'busy', wait: 'warn', fail: 'error', idle: 'idle', event: 'busy' });
const WEIGHT = Object.freeze({ error: 4, warn: 3, busy: 2, ok: 1, idle: 0 });
const RESULT_STATE = Object.freeze({ error: 'fail', warn: 'wait', busy: 'run', ok: 'done', idle: 'idle' });

export const css = `
@property --sfl-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.sfl { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-5); padding-block: var(--space-2); min-width: 0; }
.sfl-detail { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); min-width: 0; container-type: inline-size; }
.sfl-dh { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2) var(--space-3); min-width: 0; }
.sfl-dh h3 { margin: 0; font-size: var(--text-base); font-weight: var(--weight-semibold); color: var(--foreground); }
.sfl-dh-s { margin-inline-start: auto; display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--sfl-tone); }
.sfl-dh-s small { font-size: var(--text-xs); font-weight: var(--weight-regular); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.sfl-scroll { min-width: 0; padding-block: var(--space-2); }
.sfl-rail { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
.sfl-node { position: relative; display: grid; justify-items: center; align-content: start; gap: var(--space-1); min-width: 0; padding-inline: var(--space-1); text-align: center; --sfl-tone: var(--muted-foreground); }
.sfl-node[data-tone="ok"] { --sfl-tone: var(--success); --sfl-word: var(--success-content); } .sfl-node[data-tone="busy"] { --sfl-tone: var(--brand-content); } .sfl-node[data-tone="warn"] { --sfl-tone: var(--warning); --sfl-word: var(--warning-content); } .sfl-node[data-tone="error"] { --sfl-tone: var(--destructive); --sfl-word: var(--destructive-content); }
.sfl-bd { position: absolute; inset-block-start: calc(var(--sfl-dot) / 2 - var(--sfl-band) / 2); height: var(--sfl-band); inset-inline-end: calc(50% + var(--sfl-dot) / 2 + var(--space-1_5)); width: calc(100% - var(--sfl-dot) - 2 * var(--space-1_5)); overflow: hidden; border-radius: var(--r-pill); background: color-mix(in oklab, var(--muted-foreground) var(--sfl-track-mix), transparent); pointer-events: none; }
.sfl-bd i { position: absolute; inset: 0; background: var(--sfl-tone); opacity: var(--sfl-fill-o); transform: scaleX(var(--p)); transform-origin: left; transition: transform var(--dur-sfl-fill) var(--ease-out-expo); }
.sfl-node[data-state="run"] .sfl-bd i { background: linear-gradient(90deg, var(--sfl-from), var(--sfl-tone)); } /* what is arriving takes on the colour of what it arrives at */
.sfl-node[data-state="run"] .sfl-bd::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--sfl-tone), transparent); background-size: var(--sfl-shine) 100%; background-repeat: no-repeat; animation: sfl-shine var(--dur-sfl-run) linear infinite; }
@keyframes sfl-shine { from { background-position: -40% 0; } to { background-position: 140% 0; } }
.sfl-tile { position: relative; display: grid; place-items: center; width: var(--sfl-dot); height: var(--sfl-dot); border-radius: var(--r-pill); background: var(--sfl-tone); color: var(--brand-fg); transition: background var(--dur-sfl-fill) var(--ease-standard), box-shadow var(--dur-sfl-fill) var(--ease-standard), color var(--dur-sfl-fill) var(--ease-standard); }
.sfl-tile > .wi { width: var(--sfl-icon); height: var(--sfl-icon); }
.sfl-node[data-kind="event"] .sfl-tile > .wi { width: var(--sfl-brand-mark); height: var(--sfl-brand-mark); } /* the provider's own mark is drawn larger than a plain icon (what is listening is filled like the rest: a mark that is white needs the colour behind it) */
.sfl-gl { font-size: var(--text-base); font-weight: var(--weight-semibold); line-height: 1; font-variant-numeric: tabular-nums; }
.sfl-node[data-state="idle"] .sfl-tile { background: transparent; color: var(--muted-foreground); box-shadow: inset 0 0 0 var(--line-avg) var(--border-surface-strong); }
.sfl-tile { --stm-tone: var(--sfl-tone); --stm-shake: var(--sfl-shake); } /* waiting and failing marks move as every state mark does (state-motion.js: the breathing halo, the one shake into a failure) */
.sfl-node[data-state="run"] .sfl-tile { animation: sfl-halo var(--dur-sfl-pulse) var(--ease-standard) infinite; }
@keyframes sfl-halo { 50% { box-shadow: 0 0 0 var(--space-1) color-mix(in oklab, var(--sfl-tone) var(--sfl-ring-mix), transparent); } }
.sfl-node[data-state="run"] .sfl-tile::before { content: ""; position: absolute; inset: calc(-1 * var(--space-1)); padding: var(--sfl-ring-w); border-radius: inherit; background: conic-gradient(from var(--sfl-angle), transparent 0 55%, var(--sfl-tone) 100%); mask: linear-gradient(var(--mask-on) 0 0) content-box, linear-gradient(var(--mask-on) 0 0); mask-composite: exclude; animation: sfl-spin var(--dur-sfl-spin) linear infinite; }
@keyframes sfl-spin { to { --sfl-angle: 360deg; } }
.sfl-node[data-state="run"] .sfl-tile::after { content: ""; width: var(--space-1_5); height: var(--space-1_5); border-radius: var(--r-pill); background: var(--brand-fg); }
.sfl-ripple { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; } .sfl-node[data-tone="ok"] .sfl-ripple { display: none; } /* a step that ended well is quiet: no ring spreads from it */
.sfl-ripple::before, .sfl-ripple::after { content: ""; position: absolute; inset: 0; border-radius: inherit; border: var(--line-avg) solid var(--sfl-tone); opacity: 0; animation: sfl-ripple var(--dur-sfl-ripple) var(--ease-out-expo) both; }
.sfl-ripple::after { animation-delay: var(--dur-sfl-ripple-gap); }
@keyframes sfl-ripple { from { opacity: var(--sfl-ripple-o); transform: scale(1); } to { opacity: 0; transform: scale(var(--sfl-ripple-scale)); } }
button.sfl-tile { cursor: pointer; }
button.sfl-tile:hover { box-shadow: 0 0 0 var(--space-1) color-mix(in oklab, var(--sfl-tone) var(--sfl-ring-mix), transparent); }
button.sfl-tile:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-0_5); }
.sfl-node[data-selected] .sfl-tile { outline: var(--line-avg) solid var(--foreground); outline-offset: var(--space-1); } /* the node whose detail is shown below */
.sfl-node[data-state="idle"] > :not(.sfl-tile):not(.sfl-bd) { color: var(--muted-foreground); } /* a step not reached yet is in the quiet words (4.5), not faded below them */
.sfl-lb { margin-block-start: var(--space-1_5); font-size: var(--text-xs); color: var(--foreground); } /* a step reached names itself in the foreground; one not reached yet is quiet (above) */
.sfl-tx { display: inline-flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--space-1_5) var(--space-2); font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--sfl-word, var(--sfl-tone)); }
.sfl-node[data-state="done"] .sfl-tx, .sfl-node[data-state="live"] .sfl-tx { color: var(--foreground); }
.sfl-ln { display: flex; align-items: center; justify-content: center; gap: var(--space-1_5); font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--foreground); }
.sfl-ln i { flex: none; width: var(--space-1_5); height: var(--space-1_5); border-radius: var(--r-pill); background: var(--sfl-r); }
.sfl-m { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--space-1_5) var(--space-2); font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.sfl-acts { display: inline-flex; flex-wrap: wrap; gap: var(--space-1_5); }
.sfl-pane { display: grid; gap: var(--space-5); padding-block-start: var(--space-4); border-block-start: var(--line) solid var(--border-surface); }
.sfl-ps { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
.sfl-ps-h { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-1) var(--space-3); font-size: var(--text-xs); color: var(--muted-foreground); }
.sfl-ps-h b { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--foreground); }
.sfl-ps-h b .wi { width: var(--icon-lg); height: var(--icon-lg); color: var(--muted-foreground); }
.sfl-ps-h span { font-variant-numeric: tabular-nums; } .sfl-ps-h span em { font-style: normal; color: var(--foreground); font-weight: var(--weight-medium); }
.sfl-links { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); }
.sfl-ev-sum { display: flex; flex-wrap: wrap; gap: var(--space-1_5) var(--space-4); margin-block-end: var(--space-3); font-size: var(--text-xs); color: var(--muted-foreground); }
.sfl-ev-sum span { display: inline-flex; align-items: center; gap: var(--space-1_5); } .sfl-ev-sum i { width: var(--space-1_5); height: var(--space-1_5); border-radius: var(--r-pill); background: var(--sfl-tone); } .sfl-ev-sum b { font-weight: var(--weight-semibold); color: var(--foreground); font-variant-numeric: tabular-nums; }
.sfl-ev { margin: 0; padding: 0; list-style: none; display: grid; }
.sfl-ev li { position: relative; display: grid; grid-template-columns: var(--space-3) minmax(0, 1fr) auto; align-items: start; gap: var(--space-3); padding-block-end: var(--space-3); animation: sfl-rise var(--dur-flow-reveal) var(--ease-standard) both; }
.sfl-ev li::before { content: ""; position: absolute; inset-block: var(--space-3) 0; inset-inline-start: calc(var(--space-3) / 2 - var(--line) / 2); border-inline-start: var(--line) solid var(--border-surface-strong); }
.sfl-ev li:last-child { padding-block-end: 0; } .sfl-ev li:last-child::before, .sfl-ev li.more::before { display: none; }
.sfl-ev i { position: relative; width: var(--space-3); height: var(--space-3); margin-block-start: var(--space-0_5); border-radius: var(--r-pill); box-shadow: inset 0 0 0 var(--line-avg) var(--sfl-tone); }
.sfl-ev i::after { content: ""; position: absolute; inset: var(--space-1); border-radius: inherit; background: var(--sfl-tone); }
.sfl-ev .t { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-3); min-width: 0; font-size: var(--text-sm); color: var(--foreground); }
.sfl-ev .t b { font-weight: var(--weight-medium); } .sfl-ev .t small, .sfl-ev .w small { font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.sfl-ev .w { display: flex; align-items: center; gap: var(--space-2); white-space: nowrap; font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.sfl-ev .none, .sfl-ev .more { grid-template-columns: minmax(0, 1fr); color: var(--muted-foreground); font-size: var(--text-xs); }
.sfl-secs { border-block-start: var(--line) solid var(--border-surface); }
.sfl-sec .sbar { border: 0; border-radius: 0; background: transparent; border-block-end: var(--line) solid var(--border-surface); }
.sfl-sec:last-child .sbar { border-block-end: 0; } /* the last section ends with the card: no rule under it */
.sfl-sec { animation: sfl-sec-in var(--dur-flow-reveal) var(--ease-standard) backwards; } /* a section slides in when it is added: the page redraws by patching, so a section that stays keeps its node and does not play it again */
@keyframes sfl-sec-in { from { opacity: 0; transform: translateY(var(--space-2)); } }
.sfl-sec .sbar > summary, .sfl-sec .sbar-h { padding-inline: 0; }
.sfl-sec .sbar-body { margin-inline: 0; padding-inline: 0; border-block-start: 0; padding-block: var(--space-1) var(--space-4); }
.sfl-sec .cb + .cb, .sfl-ps .cb + .cb { margin-top: var(--space-4); }
.sfl-sec .sbar-h, .sfl-sec .sbar > summary { min-height: var(--sfl-sec-h); }
.sfl-sec .sbar-item:first-child b { font-size: var(--text-sm); }
.sfl-pts { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
.sfl-pts-l { display: grid; gap: var(--space-1); }
.sfl-pt { display: grid; grid-template-columns: var(--space-4) minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-2) var(--space-3); border-radius: var(--r-panel); corner-shape: var(--corner); text-align: start; color: var(--foreground); transition: background var(--dur-fast) var(--ease-standard); }
.sfl-pt:hover { background: var(--ghost-hover); }
.sfl-pt[aria-checked="true"] { background: var(--surface-secondary); box-shadow: inset 0 0 0 var(--line) var(--border-surface-strong); }
.sfl-pt-r { width: var(--space-4); height: var(--space-4); border-radius: var(--r-pill); box-shadow: inset 0 0 0 var(--line-avg) var(--border-surface-strong); }
.sfl-pt[aria-checked="true"] .sfl-pt-r { background: var(--action); box-shadow: inset 0 0 0 var(--space-1) var(--surface-secondary), 0 0 0 var(--line-avg) var(--action); }
.sfl-pt-t { display: grid; min-width: 0; }
.sfl-pt-t b { font-size: var(--text-sm); font-weight: var(--weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sfl-pt-t small { font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.sfl-pt-g { display: flex; align-items: center; gap: var(--space-2); }
.sfl-pt-s { font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: var(--muted-foreground); }
.sfl-pv { display: grid; gap: var(--space-2); }
.sfl-pv-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); }
.sfl-pv-h b { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--foreground); }
.sfl-pv-h span { font-size: var(--text-xs); color: var(--muted-foreground); }
.sfl-pts-f { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
.sfl-pts-n { flex: 1; min-width: var(--sfl-decide-min); font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sfl-pts-a { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-inline-start: auto; }
.sfl-decide { display: flex; align-items: center; flex-wrap: nowrap; gap: var(--space-3); min-width: 0; padding-block: var(--space-2); border-block: var(--line) solid var(--border-surface); --sfl-tone: var(--warning); } /* a flat row of the card (the card owns the face): what waits for a person and the one action for it */
.sfl-decide[data-tone="error"] { --sfl-tone: var(--destructive); } .sfl-decide[data-tone="busy"] { --sfl-tone: var(--brand-content); } .sfl-decide[data-tone="idle"] { --sfl-tone: var(--muted-foreground); } .sfl-decide[data-tone="ok"] { --sfl-tone: var(--success); }
.sfl-decide > .wi { flex: none; color: var(--sfl-tone); }
.sfl-decide-t { flex: 1; display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; white-space: nowrap; }
.sfl-decide-t > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; } .sfl-decide-t b { flex: none; max-width: 50%; } /* one line: what is cut keeps its whole words as its title */
.sfl-decide-t b { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--foreground); }
.sfl-decide-t span { font-size: var(--text-sm); color: var(--foreground); }
.sfl-decide-a { flex: none; display: flex; gap: var(--space-2); }
@keyframes sfl-rise { from { opacity: 0; transform: translateY(var(--space-1)); } }
@container (max-width: 640px) { .sfl:not([data-compact]) .sfl-rail { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); padding-inline: var(--space-2); } .sfl:not([data-compact]) .sfl-node { grid-template-columns: var(--sfl-dot) minmax(0, 1fr); justify-items: start; column-gap: var(--space-3); text-align: start; padding-inline: 0; } .sfl:not([data-compact]) .sfl-node > .sfl-tile { grid-row: 1 / span 4; } .sfl:not([data-compact]) .sfl-node > :not(.sfl-tile):not(.sfl-bd) { grid-column: 2; margin: 0; justify-content: flex-start; } .sfl:not([data-compact]) .sfl-bd { inset-block: auto calc(100% + var(--space-1)); inset-inline: calc(var(--sfl-dot) / 2 - var(--sfl-band) / 2) auto; width: var(--sfl-band); height: calc(var(--space-4) - 2 * var(--space-1)); } .sfl:not([data-compact]) .sfl-bd i { transform: scaleY(var(--p)); transform-origin: top; } /* quality:literal: a container or media query cannot read a token */
  /* compact (opt-in): the line stays across at every width; the steps draw closer, a step's name stays whole and the lines under it end in an ellipsis (whole words in their tooltip) */
  .sfl[data-compact] .sfl-node { padding-inline: var(--space-1); } /* neighbours never touch: each line ends in its own column */ .sfl[data-compact] .sfl-node > :is(.sfl-tx, .sfl-ln, .sfl-m) { display: block; max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .sfl[data-compact] .sfl-ln i { display: inline-block; margin-inline-end: var(--space-1_5); vertical-align: middle; } }
@media (prefers-reduced-motion: reduce) { .sfl *, .sfl *::before, .sfl *::after { animation: none !important; transition: none !important; } }
`;

export const hook = 'data-sfl';

const toneOf = tone => (Object.hasOwn(TONE, tone) ? tone : 'idle');
const stateOf = state => (Object.hasOwn(STATE_TONE, state) ? state : 'idle');
const tokenOf = tone => `var(${TONE[toneOf(tone)]})`;
const worst = results => results.map(r => toneOf(r.tone)).sort((a, b) => WEIGHT[b] - WEIGHT[a])[0] ?? 'idle';

/* the state of the last mark: what came of the run once its job has ended, otherwise it is still to come */
function endOf(u) {
  const steps = u.steps ?? [], results = u.results ?? [], tone = worst(results);
  const ended = steps.length > 0 && !steps.some(s => s.state === 'run' || s.state === 'wait' || s.state === 'idle');
  return { tone, state: ended ? RESULT_STATE[tone] : 'idle' };
}

const eventWords = (e, L) => (e?.active ? e.keyword : L.listening);

/** The closed bar says which GitOps this is, which Git source it follows, what it is doing now and how things stand: one unit, never a count of others (what to show when there are several is the page's: one card each). */
export function summaryItems(p) {
  const u = p.unit;
  if (!u) return [];
  const L = p.labels, dot = tone => TONE[toneOf(tone)], steps = u.steps ?? [], results = u.results ?? [], end = endOf(u);
  const step = steps.find(s => s.state === 'run' || s.state === 'wait' || s.state === 'fail') ?? steps.at(-1);
  /* the tool is its own mark when the page has one (its name then only for a screen reader); the dots are the marks of the line in small, and move as they do */
  const items = [{ id: 'lead', label: u.toolIcon ? '' : u.tool, value: u.name, shrink: true, ...(u.toolIcon ? { icon: u.toolIcon, ariaLabel: `${u.tool} ${u.name}` } : {}) }];
  if (u.source) items.push({ id: 'source', label: L.source, value: [u.source.repo, u.source.ref].filter(Boolean).join(' · ') });
  if (step) items.push({ id: 'job', label: step.label, value: step.text, priority: 2, dot: dot(STATE_TONE[stateOf(step.state)]), dotState: stateOf(step.state) });
  if (results.length) items.push({ id: 'result', label: L.result, priority: 1, value: results.map(r => r.text).join(' · '), ...(end.state === 'idle' && end.tone === 'error' ? { dot: dot('error'), dotState: 'fail' } : { dot: dot(STATE_TONE[end.state]), dotState: end.state }) }); /* a failed result is drawn in the failure tone even while a step still waits (a failed check stands before the next choice) */
  return items;
}

/* one node of the line, a round mark joined to the one before by a band (filled once the node is reached) with the name, what it says and a short line under it, as the pipelines that draw one run as a line do it.
   When the page lets a node be pressed the mark is a button: it opens what belongs to the node below. A new state brings a new ripple, so each change is seen once. */
/* a compact line's sub lines carry their whole words for a tooltip shown only when they are cut */
/* a word cut to fit its column keeps its whole value as the tip, whether it came as plain words or drawn markup (an event keyword, a result with its mark) */
const plain = v => (typeof v === 'string' ? v : typeof v?.s === 'string' ? v.s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim() : '');
const tipOf = (p, text) => (p.compact && plain(text) ? html` data-tip="${plain(text)}" data-tip-overflow=""` : '');
function node({ id, key, kind, state, ic, glyph, label, text, lead, lines, meta, ripple }, before, first, u, p, selected, pressable) {
  const tone = STATE_TONE[state], from = first ? tone : STATE_TONE[before];
  const mark = html`${ripple ? html`<i class="sfl-ripple" data-key="${JSON.stringify(['sfl-ripple', ...key, ripple])}" aria-hidden="true"></i>` : ''}${glyph ? html`<b class="sfl-gl" aria-hidden="true">${glyph}</b>` : ic ? icon(ic, 'xl') : ''}`;
  const foot = meta ? html`<span class="sfl-m"${tipOf(p, meta)}><small>${meta}</small></span>` : '';
  return html`<li class="sfl-node" data-key="${JSON.stringify(['sfl-node', ...key])}" data-kind="${kind}" data-state="${state}" data-tone="${tone}"${attrs({ 'aria-current': state === 'run' || state === 'wait' ? 'step' : null, 'data-selected': selected ? '' : null })} style="--sfl-from:var(${TONE[from]})">
    ${first ? '' : html`<b class="sfl-bd" aria-hidden="true"><i style="--p:${state === 'idle' ? 0 : 1}"></i></b>`}
    ${p.node && pressable ? html`<button type="button" class="${cx('sfl-tile', motionOf(state) && 'stm')}"${attrs({ 'data-motion': motionOf(state), 'data-action': p.node, 'data-arg': { unit: u.id, node: id }, 'aria-label': `${label}: ${text ?? lines.map(l => l.text).join(' · ')}`, 'aria-pressed': selected ? 'true' : 'false' })}>${mark}</button>` : html`<span class="${cx('sfl-tile', motionOf(state) && 'stm')}"${attrs({ 'data-motion': motionOf(state) })}>${mark}</span>`}
    <span class="sfl-lb">${label}</span>${lines ? lines.map(l => html`<span class="sfl-ln" style="--sfl-r:${tokenOf(l.tone)}"${tipOf(p, l.text)}><i></i>${l.text}</span>`) : html`<b class="sfl-tx"${tipOf(p, text)}>${text}${lead ?? ''}</b>`}${foot}</li>`;
}

/* the node whose detail is shown when the page does not say: the one that needs a person or is working, else the result */
const attentionNode = (u, nodes) => nodes.find(n => n.state === 'fail' || n.state === 'wait')?.id ?? nodes.find(n => n.state === 'run')?.id ?? 'end';

function nodesOf(u, p) {
  const L = p.labels, e = u.event, steps = u.steps ?? [], results = u.results ?? [];
  const { tone: endTone, state: end } = endOf(u);
  return [
    { id: 'event', key: ['event'], kind: 'event', ic: e?.icon ?? EVENT_ICON[e?.kind] ?? 'bolt', state: e?.active ? 'event' : 'live', ripple: e?.active ? 'e' + e.id : null, label: L.event, text: eventWords(e, L), lead: e?.active && e.more ? badge.count({ value: '+' + e.more }) : '', meta: e?.at },
    ...steps.map(s => ({ id: s.id, key: ['step', s.id], kind: 'step', ic: s.icon ?? STATE_ICON[stateOf(s.state)], glyph: s.glyph, state: stateOf(s.state), label: s.label, text: s.text, meta: s.meta, ripple: stateOf(s.state) === 'idle' ? null : stateOf(s.state) })),
    { id: 'end', key: ['end'], kind: 'end', ic: u.resultIcon ?? STATE_ICON[end], state: end, label: L.result, lines: results.map(r => ({ tone: r.tone, text: r.text })), ripple: end === 'idle' ? null : end + endTone },
  ];
}

function line(u, p, nodes, selectedId) {
  const covered = new Set((u.sections ?? []).flatMap(s => s.nodes ?? []));
  return html`<div class="sfl-scroll"><ol class="sfl-rail" style="--n:${nodes.length}">${nodes.map((n, i) => node(n, i ? nodes[i - 1].state : null, !i, u, p, n.id === selectedId, covered.has(n.id)))}</ol></div>`;
}

/* the detail of the selected node, in the room under the line (what the pipelines that show one stage at a time do): what belongs to the node, open, with no item to open first */
function pane(u, p, nodeId) {
  const secs = (u.sections ?? []).filter(s => (s.nodes ?? []).includes(nodeId));
  return secs.length ? html`<div class="sfl-pane" data-key="${JSON.stringify(['sfl-pane', u.id, nodeId])}">${secs.map(s => html`<section class="sfl-ps" data-sfl-sec="${s.id}"><div class="sfl-ps-h"><b>${s.icon ? icon(s.icon, 'lg') : ''}${s.label}</b>${s.items.map(i => html`<span>${i.label} <em>${i.value}</em></span>`)}</div>${s.points ? points(s.points, u) : s.events ? eventList(s.events, u) : s.body}</section>`)}</div>` : '';
}

/* the places a person can choose to go back to: the entries of what was applied, the one that is advised marked, and what each way of going back would do */
function points(pt, u) {
  const L = pt.labels, tag = x => (x.current ? badge.render({ tone: 'brand', label: L.current, size: 'sm' }) : x.result === 'fail' ? badge.render({ tone: 'danger', label: L.fail, size: 'sm' }) : x.result === 'degraded' ? badge.render({ tone: 'warn', label: L.degraded, size: 'sm' }) : '');
  return html`<div class="sfl-pts" data-key="${JSON.stringify(['sfl-points', u.id])}">
    <div class="sfl-pts-l" role="radiogroup" aria-label="${pt.label}">${pt.items.map(x => html`<button type="button" class="sfl-pt" role="radio" data-key="${JSON.stringify(['sfl-pt', u.id, x.id])}"${attrs({ 'aria-checked': x.id === pt.selected ? 'true' : 'false', 'data-action': pt.select, 'data-arg': { unit: u.id, point: x.id } })}>
      <i class="sfl-pt-r" aria-hidden="true"></i><span class="sfl-pt-t"><b>${x.title}</b><small>${x.rev} · PR #${x.pr} · ${x.at}</small></span>
      <span class="sfl-pt-g">${x.stat ? html`<span class="sfl-pt-s">${x.stat}</span>` : ''}${x.recommended ? badge.render({ tone: 'ok', label: L.recommended, size: 'sm' }) : ''}${tag(x)}</span></button>`)}</div>
    ${pt.preview ? html`<div class="sfl-pv"><div class="sfl-pv-h"><b>${pt.preview.title}</b>${pt.preview.note ? html`<span>${pt.preview.note}</span>` : ''}</div>${pt.preview.body}</div>` : ''}
    <div class="sfl-pts-f">${pt.scope ? html`<span class="sfl-pts-s">${pillTabs.render({ id: 'sfl-scope-' + u.id, label: pt.scope.label, value: pt.scope.value, tabs: pt.scope.tabs, action: pt.scope.action })}</span>` : ''}${pt.note ? html`<span class="sfl-pts-n" title="${pt.note}">${pt.note}</span>` : ''}<span class="sfl-pts-a">${pt.actions.map(a => html`<span data-key="${JSON.stringify(['sfl-pact', u.id, a.id])}">${button.render({ label: a.label, icon: a.icon, variant: a.variant ?? 'secondary', round: true, action: a.action, arg: a.arg })}</span>`)}</span></div></div>`;
}

/* the latest turning points of a unit, newest first, as a timeline: what it was, who did it and when, and how the jobs have gone. The whole record is kept elsewhere, so only the last few are here, and how many more there are */
function eventList(ev, u) {
  const sum = ev.summary?.length ? html`<div class="sfl-ev-sum">${ev.summary.map(x => html`<span data-key="${JSON.stringify(['sfl-sum', u.id, x.id])}" style="--sfl-tone:${tokenOf(x.tone)}"><i></i>${x.label}<b>${x.value}</b></span>`)}</div>` : '';
  return html`${sum}<ol class="sfl-ev">${ev.items.length ? ev.items.map(e => html`<li data-key="${JSON.stringify(['sfl-ev', u.id, e.id])}" style="--sfl-tone:${tokenOf(e.tone)}"><i></i><span class="t"><b>${e.label}</b>${e.detail ? html`<small>${e.detail}</small>` : ''}</span><span class="w">${e.tool ? button.render({ label: e.tool, variant: 'secondary', size: 'xs', round: true, iconEnd: 'arrow-up-right', action: e.toolAction, arg: e.toolArg }) : ''}${e.by ? html`<small>${e.by}</small>` : ''}${e.at ? html`<time>${e.at}</time>` : ''}</span></li>`) : html`<li class="none">${ev.empty}</li>`}${ev.more ? html`<li class="more"><span class="t"><small>${ev.more}</small></span></li>` : ''}</ol>`;
}

/* what lies under the line: closed items, one for each thing a person may need (the change, the log, where to go back to, what happened), each saying its gist when closed and opening to its content */
function sections(u, p) {
  if (!u.sections?.length) return '';
  return html`<div class="sfl-secs">${u.sections.map(s => html`<div class="sfl-sec" data-key="${JSON.stringify(['sfl-sec', u.id, s.id])}" data-sfl-sec="${s.id}">${summaryBar.render({ label: s.label, open: !!s.open, toggle: { action: p.section, arg: { unit: u.id, id: s.id } }, items: [{ id: 'title', label: '', value: s.label, ...(s.icon ? { icon: s.icon } : {}) }, ...s.items], body: s.points ? points(s.points, u) : s.events ? eventList(s.events, u) : s.body })}</div>`)}</div>`;
}

/* the whole record (every log line, every event) has its own place; here are only the ways to it */
function links(u) {
  return u.links?.length ? html`<div class="sfl-links">${u.links.map(l => html`<span data-key="${JSON.stringify(['sfl-link', u.id, l.id])}">${button.render({ label: l.label, icon: l.icon, variant: 'link', action: l.action, arg: l.arg })}</span>`)}</div>` : '';
}

function detail(u, p) {
  const decide = u.decision ? html`<div class="sfl-decide" role="group" aria-label="${u.decision.title || u.decision.text}" data-tone="${toneOf(u.decision.tone)}">${icon(u.decision.tone === 'error' ? 'exclamation-triangle' : 'circle-info', 'md')}<div class="sfl-decide-t">${u.decision.title ? html`<b title="${u.decision.title}">${u.decision.title}</b>` : ''}<span title="${u.decision.text}">${u.decision.text}</span></div><div class="sfl-decide-a">${u.decision.actions.map(a => html`<span data-key="${JSON.stringify(['sfl-act', u.id, a.id])}">${button.render({ label: a.label, icon: a.icon, variant: a.variant ?? 'secondary', round: true, action: a.action, arg: a.arg })}</span>`)}</div></div>` : '';
  /* an action the decision offers is there only: the head keeps what is not in it (one action, one place, one look) */
  const heads = (u.actions ?? []).filter(a => !u.decision?.actions?.some(d => d.id === a.id));
  const acts = heads.length ? html`<span class="sfl-acts">${heads.map(a => html`<span data-key="${JSON.stringify(['sfl-run', u.id, a.id])}">${button.render({ label: a.label, icon: a.icon, variant: 'ghost', size: 'sm', round: true, action: a.action, arg: a.arg })}</span>`)}</span>` : '';
  const nodes = nodesOf(u, p), select = p.detail === 'select', selectedId = select ? (nodes.some(n => n.id === u.node) ? u.node : attentionNode(u, nodes)) : null;
  return html`<div class="sfl-detail" data-key="${JSON.stringify(['sfl-detail', u.id])}">
    ${p.header === false ? (acts ? html`<div class="sfl-dh">${acts}</div>` : '') : html`<div class="sfl-dh"><h3>${u.name}</h3>${badge.render({ tone: 'neutral', label: u.tool, size: 'sm' })}${acts}<span class="sfl-dh-s" style="--sfl-tone:var(${WORD[toneOf(u.headline.tone)]})">${u.headline.text}${u.headline.meta ? html`<small>${u.headline.meta}</small>` : ''}</span></div>`}
    ${line(u, p, nodes, selectedId)}${decide}${select ? pane(u, p, selectedId) : sections(u, p)}${links(u)}</div>`;
}

/** @param {object} p see the head of the file */
export function render(p) {
  const u = p.unit;
  const body = html`<div class="sfl" data-sfl${p.compact ? html` data-compact` : ''}>${u ? detail(u, p) : ''}</div>`;
  return summaryBar.render({ label: p.label, open: !!p.open, toggle: p.toggle, items: summaryItems(p), body });
}
