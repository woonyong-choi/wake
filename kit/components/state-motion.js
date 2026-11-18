/*
 * State motion: the one way a mark moves for the state it stands for, shared by the status flow's node marks, the summary bar's dots and the
 * relation graph's nodes, so the three never drift apart. Only the states that need a person move:
 *   wait (waiting, a warning)  a soft halo round the mark's outline breathes
 *   fail (failed, an error)    the halo breathes in the error colour, and the mark shakes once as it enters the state
 *   anything else              still (idle and unknown are muted by their own colour; ok is quiet)
 * HTML mark: class "stm" and data-motion="wait|fail" (its ::after is the halo, so the mark is positioned and keeps ::after free).
 * SVG mark: the group is class "stm" with data-motion (it shakes), and the component draws the halo itself as an outline shape with class
 * "stm-halo" (stroke in --stm-tone) that breathes the same way.
 * The halo breathes by opacity only and the shake by transform only (the browser runs both without working the page's styles out again).
 * Variables a mark may set: --stm-tone (the halo colour; default the warning or the error colour), --stm-halo (its spread, default 4),
 * --stm-shake (how far the shake goes, default 2). Times and mix: --dur-state-pulse, --dur-state-shake, --state-halo-mix.
 * One clock: a drawing that holds several marks (the relation graph) is class "stm-clock"; inside it the halos and the "stm-pulse" marks (an icon in its state
 * colour, --stm-c) all follow one animated phase (--stm-phase), so a node's outline and its icon breathe on the same beat whenever each was drawn.
 * Reduced motion: nothing breathes or shakes; the halo stays drawn, so the colour and the outline still say the state.
 */
export const name = 'state-motion';

export const css = `
.stm[data-motion="wait"] { --stm-c: var(--stm-tone, var(--warning)); }
.stm[data-motion="fail"] { --stm-c: var(--stm-tone, var(--destructive)); animation: stm-shake var(--dur-state-shake) var(--ease-standard) both; }
.stm:is([data-motion="wait"], [data-motion="fail"])::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: 0 0 0 var(--stm-halo, var(--space-1)) color-mix(in oklab, var(--stm-c) var(--state-halo-mix), transparent); opacity: 0; animation: stm-breathe var(--dur-state-pulse) var(--ease-standard) infinite; }
.stm-halo { fill: none; stroke: color-mix(in oklab, var(--stm-c, var(--stm-tone, var(--warning))) var(--state-halo-mix), transparent); stroke-width: var(--stm-halo, var(--space-1)); opacity: 0; pointer-events: none; animation: stm-breathe var(--dur-state-pulse) var(--ease-standard) infinite; }
svg .stm[data-motion="fail"] { transform-box: fill-box; }
@keyframes stm-breathe { 50% { opacity: 1; } }
@keyframes stm-shake { 20%, 60% { transform: translateX(calc(-1 * var(--stm-shake, var(--space-0_5)))); } 40%, 80% { transform: translateX(var(--stm-shake, var(--space-0_5))); } }
/* one clock: inside a .stm-clock (a drawing with several marks, the relation graph), every halo and every .stm-pulse mark (an icon) follows one phase that the clock
   animates, so they breathe together whenever each was drawn. A pulse mark takes --stm-c from its own state; its colour breathes from muted to that colour */
@property --stm-phase { syntax: '<number>'; inherits: true; initial-value: 1; }
.stm-clock { animation: stm-clock var(--dur-state-pulse) var(--ease-standard) infinite; }
.stm-clock.is-offscreen { animation-play-state: paused; }
@keyframes stm-clock { 0%, 100% { --stm-phase: 0; } 50% { --stm-phase: 1; } }
.stm-clock .stm-halo { animation: none; opacity: var(--stm-phase); }
.stm-clock .stm-pulse { color: color-mix(in oklab, var(--stm-c) calc(55% + 45% * var(--stm-phase)), var(--muted-foreground)); }
@media (prefers-reduced-motion: reduce) { .stm, .stm::after, .stm-halo, .stm-clock { animation: none !important; } .stm:is([data-motion="wait"], [data-motion="fail"])::after, .stm-halo { opacity: 1; } }
`;

/** The motion of a state: 'wait' for waiting and warning states, 'fail' for failed and error states, null for every still one */
export function motionOf(state) {
  if (state === 'wait' || state === 'warn' || state === 'event') return 'wait';
  if (state === 'fail' || state === 'error') return 'fail';
  return null;
}
