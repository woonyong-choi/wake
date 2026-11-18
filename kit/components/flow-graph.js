/*
 * Flow graph (Sankey): thin vertical bar nodes + symmetric S-shaped band links.
 * Names sit left-aligned above the bars, only the last column to the right of its bar. Color carries state only (ok, warn, fail, idle) on the bars and bands; the words under a name stay muted.
 * Names are never cut and words never broken (keep-all): a column gap is at least its widest word (widen), each name wraps between words in the room up to the next column.
 * A sankey (relation, stack) is laid out from its values (sankeyLayout): one px-per-value scale for the whole drawing, bands value x scale thick (never thinner than
 * bandMin), nodes as tall as their ends or their floor (tileMin), ends stacked whole within their node, nodes ordered to cross least, names clear of nodes and bands.
 * The bands have one outline round all of them (no seam where bands part from or meet at a tile, no cap on an end that touches another); a free corner is round.
 * Motion: every relation band keeps flowing (one colour front on one clock, never restarted by a redraw); a tile's icon is drawn in its band's colour (the node's hue) and
 * comes to full colour as the front passes it. A band runs
 * from the colour of the node it leaves (neutral when that node is ok and has no colour of its own) to the colour of the node it reaches, so a chain of failing nodes
 * is one red flow and a recovery blends red into green. The node carries the state: warn and fail tint its face (--fl-state-tint) and its outline halo and icon breathe
 * on the graph's one clock (state-motion.js stm-clock); fail shakes once. New values move the drawing in one short tween (--dur-flow-tween); a change under half a
 * pixel moves nothing, and the order of the nodes stays while the structure does. Reduced motion: nothing flows, breathes or tweens; colours and outlines stay.
 * Drawable range (drawable): a sankey that cannot be drawn whole at one readable scale is drawn around its problems, the healthy rest of each column one summary
 * node, crowded columns folded; hysteresis keeps a live drawing from flipping between the two.
 * Pointing at a node or a band shows its reading on the chart reading's face: the name, the value, the share of the source and of the target (a band), the share of its bands
 * in each state (a node) and why (reasons: { label, count }[], e.g. "stalled 1 · queued 2"). Nodes with an action can be pressed.
 * quality:drawing (a data graph, not an icon).
 */
import { html, raw, esc } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { place } from '../core/position.js';
import { morph } from '../core/morph.js';
import { render as statusIcon } from './status-icon.js';
import { motionOf } from './state-motion.js';
import { t, formatPercent } from '../core/i18n.js';

export const name = 'flow-graph';

export const css = `
.flow-host { padding-top: var(--space-10); overflow-x: auto; overflow-y: hidden; }
.flow { position: relative; }
.flow svg { display: block; overflow: visible; }
.fl-band { opacity: .2; animation: fl-reveal var(--dur-flow-reveal) var(--ease-standard) both; }
.fl-band.ok { fill: var(--success); } .fl-band.idle { fill: var(--muted-foreground); opacity: .1; }
.fl-band.warn { fill: var(--warning); opacity: .3; }
.fl-band.fail { fill: var(--destructive); opacity: .45; animation: fl-reveal var(--dur-flow-reveal) var(--ease-standard) both; }
.fl-run { fill: none; stroke: var(--success); stroke-opacity: .2; stroke-dasharray: 10 50; animation: fl-run var(--dur-flow-run) linear both; } .fl-run.warn { stroke: var(--warning); } .fl-run.fail { stroke: var(--destructive); } .fl-run.idle { stroke: var(--muted-foreground); }
.fl-node { animation: fl-fade var(--dur-fast) var(--ease-standard) both; }
.fl-node.ok { fill: var(--success); } .fl-node.warn { fill: var(--warning); } .fl-node.idle { fill: var(--muted-foreground); opacity: .4; }
.fl-node.fail { fill: var(--destructive); animation: fl-fade var(--dur-fast) var(--ease-standard) both; }
.fl-hit { fill: transparent; cursor: pointer; }
.fl-hit:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-1); }
.flow.relation { --fl-col-min: var(--fl-rel-col-min); }
/* bands and tiles draw in from the left, one column after the other; under the pointer the related ones brighten and the rest dim */
.flow.relation .fl-band { opacity: 1; fill-opacity: var(--fl-band-o); stroke: none; animation: fl-reveal var(--dur-flow-reveal) var(--ease-standard) both; animation-delay: calc(var(--c, 0) * var(--fl-stagger) + var(--fl-stagger)); transition: fill-opacity var(--dur-fast) var(--ease-standard), opacity var(--dur-fast) var(--ease-standard); }
.flow.relation .fl-band.is-related { fill-opacity: var(--fl-band-o-hot); }
.flow.settled .flow.relation svg { overflow: visible; } .flow-host:has(.flow.relation) { padding-inline: var(--space-px); } /* an outline on the outer edge is half outside its box: it is not cut */
.fl-tile { opacity: var(--grow, 1); fill: var(--fl-tile-bg); stroke: var(--fl-outline); stroke-opacity: 1; stroke-width: var(--line); transform-box: fill-box; transform-origin: center; animation: fl-pop var(--dur-flow-reveal) var(--ease-standard) both; animation-delay: calc(var(--c, 0) * var(--fl-stagger));  }
@keyframes fl-pop { from { opacity: 0; } } /* a tile appears by fading in, never by growing: size moves only when a value changes */
.flow.relation:not(.fitted) { opacity: 0; } /* the first drawing is at its nominal width: it is shown once it has been fitted to the room, so nothing is seen moving into place */
.flow.relation.fitted { transition: opacity var(--dur-flow-reveal) var(--ease-standard); }
@property --wf { syntax: '<length>'; inherits: false; initial-value: -9999px; } @property --wt { syntax: '<length>'; inherits: false; initial-value: -9999px; }
/* one front for the whole graph: every band paints from the same moving edge, so the color runs on through the tiles without a pause; a trailing edge follows and lets it go */
.flow.relation.vs-outline :is(.fl-tile, .fl-union.calm) { fill: none; } .flow.relation.vs-filled :is(.fl-tile, .fl-union) { stroke: none; } /* visual styles of the reference: filledOutline (default), outline, filled */
.fl-glass { position: absolute; box-sizing: border-box; pointer-events: none; opacity: var(--grow, 1); background: var(--fl-glass-face); -webkit-backdrop-filter: blur(var(--fl-glass-blur)) saturate(var(--fl-glass-sat)); backdrop-filter: blur(var(--fl-glass-blur)) saturate(var(--fl-glass-sat)); box-shadow: inset 0 0 0 var(--line) var(--glass-ring-inner), inset 0 var(--line) 0 var(--fl-glass-sheen), var(--shadow-md);  }
.flow.relation.vs-glass :is(.fl-tile) { display: none; } /* liquid glass: the faces are the .fl-glass layer */
.fl-union { fill: none; stroke: none; pointer-events: none; } .fl-union.calm { fill: var(--fl-band-face); } /* a thin face: where bands cross, the one below still shows */
.fl-edge { fill: none; stroke: var(--fl-outline); stroke-width: calc(var(--line) * 2); pointer-events: none; } /* twice the line, masked by the inside of the band and of the bands that share a tile with it: the outer half is the one outline round all of them */
/* the one clock of the breathing marks runs on the nodes and on the icons only: an animated inherited value restyles everything under it every frame */
.flow.stm-clock { animation: none; } /* the drawing is named a clock, but its phase runs on the nodes and the icons below */ .fl-icos { position: absolute; left: 0; top: 0; pointer-events: none; } .flow.is-offscreen .stm-clock { animation-play-state: paused; }
.flow svg.fl-over { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; } /* the outlines on a layer of their own: the flow repaints under them every frame, their masks are drawn once */
.fl-cut-open { fill: var(--mask-full); } .fl-cut { fill: var(--mask-on); }
.flow.relation.vs-filled .fl-edges { display: none; }
.flow.relation .fl-union.thin, .flow.relation.vs-outline .fl-union.calm.thin { fill: var(--fl-outline); fill-opacity: var(--fl-thin-o); } /* a thin ribbon is filled in the outline's colour: one calm line of its width */
.flow.relation .fl-tile:not(.hidden) { pointer-events: all; } /* a tile is pointed at for its reading, filled or not */
.fl-washes { pointer-events: none; opacity: var(--fl-wash-o); mask-repeat: no-repeat; mask-size: 100% 100%; mask-origin: fill-box; mask-clip: fill-box;
  mask-image: linear-gradient(90deg, transparent calc(var(--wt) - var(--x0) - var(--fl-wash-trailw)), var(--mask-on) calc(var(--wt) - var(--x0)), var(--mask-on) calc(var(--wf) - var(--x0) - var(--fl-wash-lead)), transparent calc(var(--wf) - var(--x0)));
  animation: fl-live var(--wash-trail) linear infinite; }
/* the layers inside one group are opaque (each strokes its own edge, so two neighbours leave no hairline) and the opacity is applied once to the group */
.fl-wash { pointer-events: none; stroke-width: var(--line); }
/* the flow never stops and never starts again on a redraw: one front runs round and round at a speed that follows the width, its trailing edge a fixed distance
   behind it; a tile's icon takes its colour as the front passes it, on the same clock */
@keyframes fl-live { from { --wf: calc(var(--fl-wash-lead) * -1); --wt: calc(var(--fl-wash-lead) * -1 - var(--fl-wash-trailw)); } to { --wf: calc(var(--fw) + var(--fl-wash-trailw) * 2); --wt: calc(var(--fw) + var(--fl-wash-trailw)); } }
.flow.relation .fl-ico.lit, .flow.relation.settled .fl-ico.lit { --fl-ico-rest: color-mix(in oklab, var(--fl-ico-hue, var(--foreground)) 55%, var(--muted-foreground)); color: var(--fl-ico-rest); animation: fl-ico-lit var(--wash-trail) linear infinite; animation-delay: calc((var(--wfrac, 0) - 1) * var(--wash-trail)); }
@keyframes fl-ico-lit { 0% { color: var(--fl-ico-rest); } 4%, 26% { color: var(--fl-ico-hue, var(--foreground)); } 46%, 100% { color: var(--fl-ico-rest); } } /* the icon takes the colour of the band at its tile (the node's hue): softer between fronts, full as the front passes it, on the band's clock */
.flow.relation .fl-ico.plain { color: var(--fl-ico-hue, var(--muted-foreground)); } /* without a flowing front the icon keeps its band's colour */
.flow.live .fl-run { animation-iteration-count: infinite; }
.flow.relation .fl-tile:is(.warn, .fail) { fill: color-mix(in oklab, var(--fl-st) var(--fl-state-tint), var(--fl-tile-bg)); } .fl-tile.warn, .fl-ico.warn { --fl-st: var(--warning); --stm-c: var(--warning); } .fl-tile.fail, .fl-ico.fail { --fl-st: var(--destructive); --stm-c: var(--destructive); } /* a node in a state wears it: a tint of its colour on its face, so the band that ends there meets it in the same hue */
@media (prefers-reduced-motion: reduce) { .fl-wash, .fl-washes, .fl-run, .fl-ico.lit { animation: none !important; } }
.flow.relation .fl-union, .flow.relation .fl-band, .flow.relation .fl-wash { transition: opacity var(--dur-flow-reshape) var(--ease-standard); } /* geometry is tweened by one clock in script (see blend), so every shape, icon and number moves together */
.flow.relation :is(.fl-union, .fl-band, .fl-wash, .fl-washes, .fl-bands).hidden { opacity: 0; pointer-events: none; animation: none; } /* a node or band that is not in this state fades while it shrinks to nothing, and grows back the same way */
.flow.relation :is(.fl-ico, .fl-label) { opacity: 0; transition: opacity var(--dur-ico-in) var(--ease-standard); } .flow.relation :is(.fl-ico, .fl-label).ready { opacity: 1; } /* a node's icon and figure switch on, from clear to solid, the moment the node is whole */
.flow.relation .fl-val { opacity: var(--val-grow, 1); } /* an icon, a name and a figure show only once the tile or band they sit in is big enough to hold them: they follow its size, never run ahead of it */
.fl-stop { stop-color: var(--muted-foreground); }
.fl-stop.fade { stop-opacity: var(--fl-fade-end); } /* p.fade: a band thins out into the tile it ends at */
.fl-stop.ok { stop-color: var(--success); } .fl-stop.warn { stop-color: var(--warning); } .fl-stop.fail { stop-color: var(--destructive); }
.flow.relation .fl-ico, .flow.relation .fl-val, .flow.relation .fl-label { animation: fl-fade var(--dur-flow-reveal) var(--ease-standard) both; animation-delay: calc(var(--c, 0) * var(--fl-stagger) + var(--fl-stagger)); }
.fl-ico { position: absolute; display: grid; place-items: center; transform: translate(-50%, -50%); color: var(--muted-foreground); pointer-events: none; }
.fl-ico.ok { color: var(--success); } /* a node with a colour of its own (tone) shows its icon plain: the icon takes a colour only for a state */ .fl-ico.warn { color: var(--warning); } .fl-ico.fail { color: var(--destructive); }
.fl-ico .wi { width: var(--icon-lg); height: var(--icon-lg); }
.fl-val { position: absolute; transform: translate(-50%, -50%); font-size: var(--text-sm); font-weight: var(--weight-semibold); text-shadow: var(--fl-val-glow); color: var(--foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.fl-val.at-end { transform: translate(-50%, -50%); } /* a figure near the end of its band, inside it */
.fl-label.under { transform: none; padding: 0; align-items: flex-start; width: max-content; } /* its room is up to the next column (set where it is drawn) */
.fl-label.under b, .fl-label.under small { max-width: 100%; }
.fl-label.under.edge { transform: translateX(-100%); width: max-content; align-items: flex-end; text-align: end; } /* under a tile that ends at the drawing's edge the name ends there too, instead of running out of the drawing */
.flow.relation.under-room:not(.fitted) { padding-bottom: var(--fl-under-room); } /* once fitted, the drawing itself holds the names under its lowest tiles */ /* a drawing given in fractions of its height cannot keep room for the names under its lowest tiles: the graph keeps it */
.fl-bhit { fill: transparent; stroke: none; } /* where a band can be pointed at for its reading: drawn under the tiles, it paints nothing */
/* the reading of a node or a band: the chart's reading, over the page */
.chart-tip.fl-tip { position: fixed; z-index: var(--z-tooltip); display: block; opacity: 1; pointer-events: none; max-width: min(var(--tooltip-max-w), calc(100vw - var(--space-4))); padding: var(--space-1_5) var(--space-2); text-shadow: none; } /* its face is the chart reading's: the one floating face; it never takes the pointer, which it follows along a band */ .fl-tip > div { min-width: 0; overflow-wrap: anywhere; line-height: var(--leading-xs); }
.fl-tip-t { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--foreground); } .fl-tip-k { font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.fl-tip-list .r { display: flex; justify-content: space-between; gap: var(--space-3); min-width: 0; } .fl-tip-list .r span { min-width: 0; overflow-wrap: anywhere; } .fl-tip-list .r b { flex-shrink: 0; font-variant-numeric: tabular-nums; } /* the members of a summary or a fold, one row each */
.fl-tip-s { display: flex; margin-block: var(--space-0_5); } .fl-tip-s .sti-text { max-width: 100%; }
/* a tile's own figure sits inside it, under the icon, centered on the tile: it moves with the tile */
.fl-label.under.inside { transform: translateX(-50%); margin-top: var(--fl-lab-dy); width: auto; align-items: center; text-align: center; }
.fl-label.under.inside b { color: var(--muted-foreground); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; }
.fl-ico.has-label { margin-top: calc(var(--fl-ico-dy) * -1); }
.flow-host:has(.flow.relation) { padding-top: var(--space-2); }
.flow .fl-label.is-related b { text-decoration: underline; }
.flow:has(.fl-hit:is(:hover, :focus-visible)) .fl-band:not(.is-related), .flow:has(.fl-hit:is(:hover, :focus-visible)) .fl-node:not(.is-related) { opacity: .15; }
/* a later re-fit (container width change) keeps the drawn graph: no second reveal */
.flow.settled .fl-band, .flow.settled .fl-node, .flow.settled .fl-tile, .flow.settled .fl-ico, .flow.settled .fl-val, .flow.settled .fl-label { animation: none; } /* once drawn, a tile, its icon and label stay in place: only values, sizes and colors change */
.flow[data-flow-events="true"] .fl-node.fail { animation: fl-event var(--dur-flow-blink) var(--ease-blink) both; }
.flow.is-offscreen .fl-washes, .flow.is-offscreen .fl-ico.lit, .flow.is-offscreen[data-flow-events] .fl-run,.flow.is-offscreen[data-flow-events] .fl-node, .flow.is-offscreen[data-flow-events] .fl-node.fail, .flow.is-offscreen[data-flow-events] .fl-band { animation-play-state: paused; }
@keyframes fl-event { from { opacity: 0; } to { opacity: 1; } }
@keyframes fl-run { to { stroke-dashoffset: -60; } }
@keyframes fl-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes fl-fade { from { opacity: 0; } }
.fl-label { position: absolute; display: flex; flex-direction: column; width: max-content; transform: translateY(-100%); padding-bottom: var(--space-1); max-width: var(--fl-label-max); } /* as wide as its words up to its room, wherever it stands */
.fl-label b { font-size: var(--text-native-sm); font-weight: var(--weight-medium); white-space: normal; word-break: keep-all; overflow-wrap: normal; } /* a name is never cut, nor a word in it: it wraps in its room, and the nodes of its column make room for it (spaceLabels) */
.fl-w { white-space: nowrap; }
.fl-label small { font-size: var(--text-xs); color: var(--muted-foreground); line-height: var(--leading-xs); white-space: normal; word-break: keep-all; overflow-wrap: normal; }
.fl-label.end { transform: translateY(-50%); padding: 0; flex-direction: column; align-items: baseline; gap: 0; max-width: var(--fl-label-end-max); }
.fl-label.start { transform: translate(-100%, -50%); padding: 0 var(--space-1) 0 0; flex-direction: row-reverse; gap: var(--space-1); }
.fl-label.start small { flex-shrink: 0; }
@media (prefers-reduced-motion: reduce) { .fl-run, .fl-band, .fl-node, .fl-band.fail, .fl-node.fail, .flow.settled .fl-band, .flow.settled .fl-node, .flow.settled .fl-band.fail, .flow.settled .fl-node.fail { animation: none; } }
`;

/**
 * Narrower than its nominal width, the graph lays out again for the space it has (attach watches its size): the columns move
 * closer together (never closer than --fl-col-min) while the room right of the last column (its labels), the bar width and the label offsets stay;
 * it never stretches wider. Still too narrow, the graph scrolls sideways inside its host (names above the bars have 40 of room on top).
 * mode defaults to weighted bands; relation draws icon tiles joined by bands whose color flows from one tile's state to the next (value: text inside a band).
 * hidden: a node or a link marked hidden stays in the drawing at zero size and zero opacity, so showing it again animates (a node that comes and goes with the state).
  * visual: 'filledOutline' (default) | 'outline' | 'filled' | 'glass'. node.tone: 'ac' | 'battery' | 'system' | 'other' | 'soc' | 'out'.
 * norm: nodes, offsets and sizes are fractions of the height and aspect = height / width, so the drawing keeps its proportions in any room.
 * stretch: widen the columns to the room available (the last tile ends at the right edge).
 * wash: a token that changes with each new value; every change washes node colors (node.hue: a token name) along the bands. Nodes may carry an icon (relation draws it in the tile). gap: the space between a tile and its band; radii: { outer, inner } the corner radii of a tile (px, from tokens).
 * stack (relation): a sankey; link.size is the value it carries and the layout is the kit's (sankeyLayout: tileMin, tileSpace, bandMin, scaleFloor, node.rest keeps
 * a node of many small ones at the bottom, order: false keeps the caller's order). Without stack a relation graph keeps the caller's places (tileMin still applies).
 * Names (relation): node.label is the whole name; node.short, when given, is what is drawn (the whole name is its title). labelGap: room between a tile and its name (--fl-label-gap); labelApart: the least room between names of two columns (--fl-label-apart).
 * node.value: what the node carries (its reading; else node.sub). node.reasons / link.reasons: { label, count }[] why it is not ok.
 * node.tip / link.tip: { kind, title, text, time } the caller's words added to the reading.
 * stateLabels: { ok, warn, fail, idle } the page's words for the states in the reading (else the kit's graph.state.*).
 * live: the graph shows a live system: every band keeps flowing (weighted: the running light). bandMin (relation, --fl-band-min): no band that carries anything is thinner;
 * thinBand (--fl-thin-band): a band this thin is a line with no outline of its own.
 * endGap (--fl-end-gap): room between two band ends on one node edge. labelWrap (--fl-label-wrap): a name under a tile wraps at this width (never narrower than its longest word).
 * @param {{mode?: 'relation'|'weighted', label?: string, width: number, height: number, columns: number[], bar?: number, sideLabels?: boolean, live?: boolean, stateLabels?: {ok?: string, warn?: string, fail?: string, idle?: string}, labelGap?: number, labelApart?: number,
 *   nodes: {id: string, col: number, y: number, h: number, label: string, short?: string, ariaLabel?: string, sub?: string, value?: string, state: 'ok'|'warn'|'fail'|'idle', reasons?: {label: string, count: number}[], tip?: object, action?: string, arg?: any}[],
 *   links: {from: string, to: string, fromOffset: number, toOffset: number, size: number, size1?: number, state: 'ok'|'warn'|'fail'|'idle', reasons?: {label: string, count: number}[], tip?: object, value?: string, label?: string, active?: boolean}[]}} p
 */
export function render(p) {
  return html`<div class="flow-host" data-scroll="x"><div class="${(p.mode === 'relation' ? 'flow relation vs-' + (p.visual || 'filledOutline') + (p.norm && p.nodes.some(n => n.label && !n.inside) ? ' under-room' : '') : 'flow') + (p.live ? ' live' : '') + ' stm-clock'}" aria-label="${p.label || ''}" data-c="flow-graph" data-own-children data-own-attrs="data-flow data-flow-events" data-flow-events="${p.links.some(link => link.active) ? 'true' : 'false'}" data-flow="${JSON.stringify(p)}" style="max-width:${p.width}px">${raw(inner(p))}</div></div>`;
}

/* The bands of a relation graph. Every band is its own S-shaped ribbon, as thick as its value at both ends. The bands leaving one tile are one group: one face,
 * one clip, and their colour layers are opaque inside the group (each also strokes its own edge, which closes the hairline between two neighbours) while the
 * group carries the opacity, so nothing is drawn twice where they part. The outline is drawn over all the fills: each band's edge, twice as wide, masked by its
 * own inside and by the inside of every band that shares a tile with it, so only the outer half shows and bands stacked at a tile have one outline round
 * them all, with no seam between them and no cap on an end that touches another. A band's corner is round only where no other band touches it.
 * A band thinner than thinBand is a line in the outline's colour with no outline of its own. */
const r2 = v => Math.round(v * 100) / 100;
function bands(p, geo, gid) {
  const f = (a, b) => `${r2(a)},${r2(b)}`, br = p.bandR || 0, u = p.forkU ?? .2, thinT = p.thinBand ?? 4, wash = p.wash !== undefined;
  const shown = geo.filter(g => !g.gone && g.t > .01), near = (a, b) => Math.abs(a - b) < .75;
  const touch = (g, end, edge) => shown.some(h => h !== g && (end === 0 ? h.l.from === g.l.from && near(edge ? h.c0 : h.c0 + h.t0, edge ? g.c0 + g.t0 : g.c0) : h.l.to === g.l.to && near(edge ? h.c1 : h.c1 + h.t1, edge ? g.c1 + g.t1 : g.c1)));
  for (const g of geo) {
    const r = (end, edge) => touch(g, end, edge) ? 0 : Math.min(br, (end ? g.t1 : g.t0) / 2);
    const a = r(0, 0), b = r(0, 1), c = r(1, 0), d = r(1, 1);
    g.d = `M${f(g.bx0, g.c0 + a)} Q${f(g.bx0, g.c0)} ${f(g.bx0 + a, g.c0)} C${f(g.bmx, g.c0)} ${f(g.bmx, g.c1)} ${f(g.bx1 - c, g.c1)} Q${f(g.bx1, g.c1)} ${f(g.bx1, g.c1 + c)}`
      + ` L${f(g.bx1, g.c1 + g.t1 - d)} Q${f(g.bx1, g.c1 + g.t1)} ${f(g.bx1 - d, g.c1 + g.t1)} C${f(g.bmx, g.c1 + g.t1)} ${f(g.bmx, g.c0 + g.t0)} ${f(g.bx0 + b, g.c0 + g.t0)} Q${f(g.bx0, g.c0 + g.t0)} ${f(g.bx0, g.c0 + g.t0 - b)} Z`;
    g.thin = g.t <= thinT;
  }
  let defs = '', gi = 0;
  const pieces = [], bySource = {};
  geo.filter(g => g.t > .01).forEach(g => (bySource[g.l.from] ||= []).push(g));
  for (const [from, list] of Object.entries(bySource)) {
    gi++;
    const cid = `${gid}u${gi}`, n = list.length, sk = esc(from);
    defs += `<clipPath data-key="clip${sk}" id="${cid}"><path d="${list.map(g => g.d).join(' ')}"/></clipPath>`;
    const full = list.filter(g => !g.thin), allGone = list.every(g => g.gone);
    let out = full.length ? `<path data-key="face${sk}" class="${wash ? 'fl-union calm' : 'fl-union'}${full.every(g => g.gone) ? ' hidden' : ''}" d="${full.map(g => g.d).join(' ')}"/>` : '';
    out += list.filter(g => g.thin).map(g => `<path data-key="thin${g.key}" class="fl-union thin${g.gone}" d="${g.d}"/>`).join('');
    let layer = '', steady = '';
    /* bands that leave one tile together keep the tile's own colour along the run they share and part colours from the fork point on */
    const hold = stop => n > 1 ? stop : '';
    const hue = nn => nn.hue ? `style="stop-color:var(${esc(nn.hue)})"` : '';
    /* a band starts in the colour of the node it leaves (neutral when that node is ok and has no colour of its own) and ends in the colour of the node it reaches:
       a chain of failing nodes reads as one red flow, a recovery blends red into green */
    const fromCls = nn => nn.state === 'ok' && !nn.hue ? '' : esc(nn.state);
    for (const g of list) {
      const A = g.A, B = g.B;
      if (!wash) {
        defs += `<linearGradient data-key="grad${g.key}" id="${gid}g${g.i}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" class="fl-stop ${fromCls(A)}"/>${hold(`<stop offset="${u}" class="fl-stop ${fromCls(A)}"/>`)}<stop offset="1" class="fl-stop ${esc(B.state)}${p.fade ? ' fade' : ''}"/></linearGradient>`;
        layer += (`<path data-key="band${g.key}" class="fl-band${g.gone}" data-link="${g.i}" style="--c:${A.col}" fill="url(#${gid}g${g.i})" d="${g.d}">${g.l.label ? `<title>${esc(g.l.label)}</title>` : ''}</path>`);
        continue;
      }
      /* a band that leaves or reaches a node in a state keeps that colour at rest too (faint, under the flow): the state reads between two passes */
      if (!g.gone && (WORST[A.state] || WORST[B.state])) {
        defs += `<linearGradient data-key="sg${g.key}" id="${gid}s${g.i}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" class="fl-stop ${fromCls(A)}" ${hue(A)}/><stop offset="1" class="fl-stop ${esc(B.state)}" ${hue(B)}/></linearGradient>`;
        steady += (`<path data-key="steady${g.key}" class="fl-band steady" data-link="${g.i}" fill="url(#${gid}s${g.i})" d="${g.d}"/>`);
      }
      defs += `<linearGradient data-key="wg${g.key}" id="${gid}w${g.i}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" class="fl-stop ${fromCls(A)}" ${hue(A)}/>${hold(`<stop offset="${u}" class="fl-stop ${fromCls(A)}" ${hue(A)}/>`)}<stop offset="1" class="fl-stop ${esc(B.state)}" ${hue(B)}/></linearGradient>`;
      layer += (`<path data-key="wash${g.key}" class="fl-wash${g.gone}" data-link="${g.i}" fill="url(#${gid}w${g.i})" stroke="url(#${gid}w${g.i})" d="${g.d}"/>`);
    }
    if (steady) out += `<g data-key="steady${sk}" class="fl-bands" clip-path="url(#${cid})">${steady}</g>`;
    out += `<g data-key="layer${sk}" class="${wash ? 'fl-washes' : 'fl-bands'}${allGone ? ' hidden' : ''}"${wash ? ` style="--x0:${r2(list[0].bx0)}px;--fw:${p.width}px"` : ''} clip-path="url(#${cid})">${layer}</g>`;
    pieces.push({ out, size: list.reduce((t, g) => t + g.t, 0) });
  }
  /* the outline: each band's edge masked by its own inside and the inside of the bands that share a tile with it */
  const pad = 4 * (p.bar || 6), box = `x="${-pad}" y="${-pad}" width="${p.width + 2 * pad}" height="${p.height + 2 * pad}"`;
  let edges = '';
  for (const g of shown) {
    if (g.thin) continue;
    const sibs = geo.filter(h => h !== g && h.t > .01 && !h.gone && (h.l.from === g.l.from || h.l.to === g.l.to));
    defs += `<mask data-key="edgemask${g.key}" id="${gid}e${g.i}" maskUnits="userSpaceOnUse" ${box}><rect class="fl-cut-open" ${box}/><path class="fl-cut" d="${[g, ...sibs].map(h => h.d).join(' ')}"/></mask>`;
    edges += (`<path data-key="edge${g.key}" class="fl-edge" mask="url(#${gid}e${g.i})" d="${g.d}"/>`);
  }
  /* the largest groups first, so a small band is never hidden under a large one */
  return { defs, out: pieces.sort((a, b) => b.size - a.size).map(x => x.out).join(''), edges: edges ? `<g data-key="edges" class="fl-edges">${edges}</g>` : '' };
}

/* the ids of a drawing's clips, masks and gradients: the caller's gid, else one made from what the drawing is (its name and its nodes); attach adds a number
   of its own to every drawing it draws, so two graphs on a page never point at each other's masks, even with the same data */
const idOf = p => { let h = 5381; for (const c of `${p.label || ''}|${p.mode || ''}|${p.nodes.map(n => n.id).join(',')}`) h = (h * 33 ^ c.charCodeAt(0)) >>> 0; return 'flg' + h.toString(36); };

/* a node carries its own state: warn and fail move with the shared state motion; every band keeps flowing whatever its state */
const WORST = { fail: 2, warn: 1 };
const TROUBLE = { fail: 3, warn: 2, busy: 1 };
const nodeMotion = n => n.hidden ? null : motionOf(n.state);
const STATE_HUE = { warn: '--warning', fail: '--destructive' };
const flowing = (p, l) => !l.hidden && (l.active || p.live);

/** Where everything is: a sankey (relation with stack) is laid out from its values (sankeyLayout); any other relation graph keeps the caller's places, with its
 *  band ends stacked inside their tiles; a weighted graph keeps them too. Names get their room. A drawing laid out already (laid) is returned as it is. */
export function layout(p) {
  if (p.laid) return p;
  p = denorm(p);
  if (p.mode === 'relation' && p.stack) return sankeyLayout(widen(drawable(p), p.labelW, p.labelApart ?? 12));
  if (p.mode === 'relation') p = stackEnds(floorTiles(thinnest(p)));
  return { ...spaceLabels(widen(p, p.labelW, p.labelApart ?? 12), p.labelH, p.labelGap ?? 6), laid: true };
}

/** A name under a tile that ends at the drawing's edge, or that is wider than the room right of the last column, ends at the drawing's edge and reaches back
 *  from there, so it never runs out of the drawing */
const edgeName = (p, n) => p.mode === 'relation' && !n.inside && (p.width - p.columns[n.col] <= (p.bar || 6) + 1 || (n.col === p.columns.length - 1 && (p.labelW?.[n.id] || 0) > p.width - p.columns[n.col]));

/* the words of a summary or a fold node: the page's template with {n} (the amount it stands for) and {k} (how many items) */
const fill = (tpl, n, k) => String(tpl).replaceAll('{n}', Number(n).toLocaleString()).replaceAll('{k}', Number(k).toLocaleString());

/**
 * The drawable range of a sankey (relation, stack, unless auto: false). A sankey is drawn whole when every band would be at least drawMin (4) thick at one linear
 * scale (the fullest column over the smallest flow is at most the height over drawMin), no column has more than maxNodes (7) nodes, and every column's tiles and
 * names fit the height. Otherwise it is drawn around its problems (view 'focus'): only the flows that touch a node in a state (warn, fail, busy), at one linear scale
 * among themselves; what is left of each column is one summary node with no band at its end (summary: { [column]: { label, action?, arg?, icon? } }, label with
 * {n} the amount and {k} how many: 'Running {n}'). If that is still out of range, each column keeps its keepTop (6) largest problem nodes and folds the rest into
 * one node (fold: { label, more }, e.g. '+{k}') in the state of its worst member, whose reading lists the members (ten, then more). Mode changes keep a margin:
 * a drawing in focus goes back to whole only when it fits with hysteresis (0.8) of the room (lastView: the view drawn before). Every band keeps its amount
 * (link.amount) for the reading.
 */
export function drawable(p) {
  const view = q => ({ ...q, links: q.links.map(l => ({ ...l, amount: l.amount ?? l.size })) });
  if (p.mode !== 'relation' || !p.stack || p.auto === false) return { ...view(p), view: 'full' };
  const H = Math.max(1, p.height || 1), drawMin = p.drawMin ?? 4, maxNodes = p.maxNodes ?? 7, keepTop = p.keepTop ?? 6, tmin = p.tileMin ?? 0, space = p.tileSpace ?? 0, lgap = p.labelGap ?? 6;
  const room = p.lastView === 'focus' ? p.hysteresis ?? .8 : 1;
  const sum = (list, f) => list.reduce((t, x) => t + f(x), 0);
  const graph = q => {
    const N = Object.fromEntries(q.nodes.map(n => [n.id, n])), on = l => !l.hidden && l.size > 0 && N[l.from] && N[l.to] && !N[l.from].hidden && !N[l.to].hidden;
    return { N, on, val: totals(q, on, l => l.size) };
  };
  const fits = q => {
    const { on, val } = graph(q), shown = q.links.filter(on), cols = [...new Set(q.nodes.map(n => n.col))];
    const roomy = cols.every(c => { const list = q.nodes.filter(n => n.col === c && !n.hidden); if (list.length > maxNodes) return false;
      return sum(list, n => Math.max(tmin, 1) + Math.max(space, (p.labelH?.[n.id] ?? 18) + 2 * lgap)) <= H * room; });
    if (!roomy || !shown.length) return roomy;
    const least = Math.min(...shown.map(l => l.size)), fullest = Math.max(...cols.map(c => sum(q.nodes.filter(n => n.col === c), val)));
    return fullest / least <= H / drawMin * room;
  };
  if (fits(p)) return { ...view(p), view: 'full' };
  const { N, on, val } = graph(p), troubled = n => !!TROUBLE[n?.state];
  /* the amounts a summary names are the caller's (link.amount); a drawing given in fractions of its height has none, and its summaries name no amount */
  const real = p.links.every(l => l.amount != null) || !p.scaled, amt = l => l.amount ?? l.size;
  const valA = totals(p, on, amt);
  let q = p;
  if (p.nodes.some(n => !n.hidden && troubled(n))) { /* nothing in a state: the whole graph, grouped below if it has too many nodes */
    const kept = p.links.filter(l => on(l) && (troubled(N[l.from]) || troubled(N[l.to])));
    const ids = new Set(kept.flatMap(l => [l.from, l.to])), keptVal = n => Math.max(sum(kept.filter(l => l.to === n.id), l => l.size), sum(kept.filter(l => l.from === n.id), l => l.size));
    const nodes = p.nodes.filter(n => ids.has(n.id));
    for (const c of [...new Set(p.nodes.map(n => n.col))]) {
      const list = p.nodes.filter(n => n.col === c && !n.hidden), gone = list.filter(n => !ids.has(n.id)), part = list.filter(n => ids.has(n.id) && val(n) > keptVal(n));
      const amount = sum(list, n => val(n) - (ids.has(n.id) ? keptVal(n) : 0)); if (!(amount > 0)) continue;
      const k = sum(gone, n => n.count ?? 1), top = [...gone, ...part].sort((a, b) => val(b) - val(a))[0], tpl = p.summary?.[c] ?? {};
      if (!k && String(tpl.label ?? '').includes('{k}')) continue; /* what is left is only the healthy part of nodes that are drawn: no node of zero items */
      const keptA = n => Math.max(sum(kept.filter(l => l.to === n.id), amt), sum(kept.filter(l => l.from === n.id), amt));
      const total = real ? sum(list, n => valA(n) - (ids.has(n.id) ? keptA(n) : 0)) : null;
      const label = tpl.label && (total != null || !tpl.label.includes('{n}')) ? fill(tpl.label, total ?? 0, k) : gone.length ? `${top.label}${k > 1 ? ` +${k - 1}` : ''}` : total != null ? `${top.label} ${total.toLocaleString()}` : top.label;
      /* a summary is plain unless what it stands for is a state that is ok by itself (a healthy phase): it carries no colour of its own */
      nodes.push({ id: '~rest' + c, col: c, label, ...(total != null ? { value: total.toLocaleString() } : {}), icon: tpl.icon ?? top.icon, state: top.state === 'ok' && !top.tone && !top.hue ? 'ok' : 'idle', rest: true, summary: true,
        y: Infinity, h: 0, ...(tpl.action ? { action: tpl.action, arg: tpl.arg } : {}),
        members: gone.length + part.length,
        ...(real ? { reasons: [...gone, ...part].sort((a, b) => val(b) - val(a)).slice(0, 10).map(n => ({ label: n.label, count: valA(n) - (ids.has(n.id) ? keptA(n) : 0) })) } : {}) });
    }
    q = { ...p, nodes, links: kept };
  }
  if (!fits(q)) q = fold(q, graph(q), keepTop, maxNodes, real);
  return { ...view(q), view: q === p ? 'full' : 'focus' };
}

/** A column with more problem nodes than fit keeps its largest ones and folds the rest into one node in the state of its worst member; its bands are merged */
function fold(q, { N, on, val }, keepTop, maxNodes, real) {
  const amt = l => l.amount ?? l.size, valA = totals(q, on, amt);
  const into = {}, nodes = [], worst = list => list.reduce((w, n) => (TROUBLE[n.state] || 0) > (TROUBLE[w] || 0) ? n.state : w, 'ok');
  for (const c of [...new Set(q.nodes.map(n => n.col))]) {
    const list = q.nodes.filter(n => n.col === c && !n.hidden), own = list.filter(n => !n.summary).sort((a, b) => val(b) - val(a));
    const room = Math.min(keepTop, maxNodes - 1 - (list.length - own.length));
    if (own.length <= room + 1) { nodes.push(...q.nodes.filter(n => n.col === c)); continue; }
    const keep = own.slice(0, room), rest = own.slice(room), id = '~fold' + c, more = rest.slice(10);
    nodes.push(...q.nodes.filter(n => n.col === c && (!own.includes(n) || keep.includes(n))));
    nodes.push({ id, col: c, label: fill(q.fold?.label ?? '+{k}', sum0(rest, valA), rest.length), ...(real ? { value: sum0(rest, valA).toLocaleString() } : {}), icon: rest[0].icon, ...(rest[0].tone ? { tone: rest[0].tone } : {}),
      state: worst(rest), y: Infinity, h: 0, folded: rest.length, rest: true,
      reasons: real ? [...rest.slice(0, 10).map(n => ({ label: n.label, count: valA(n) })), ...(more.length ? [{ label: fill(q.fold?.more ?? '+{k}', sum0(more, valA), more.length), count: sum0(more, valA) }] : [])]
        : [...rest.slice(0, 10).map(n => ({ label: n.label, count: '' })), ...(more.length ? [{ label: fill(q.fold?.more ?? '+{k}', 0, more.length), count: '' }] : [])] });
    for (const n of rest) into[n.id] = id;
  }
  const merged = new Map();
  for (const l of q.links.filter(on)) {
    const from = into[l.from] ?? l.from, to = into[l.to] ?? l.to, key = from + '>' + to, m = merged.get(key);
    if (!m) { merged.set(key, { ...l, from, to, amount: l.amount ?? l.size }); continue; }
    m.size += l.size; m.amount += l.amount ?? l.size; if (real) m.value = m.amount.toLocaleString();
    if ((TROUBLE[l.state] || 0) > (TROUBLE[m.state] || 0)) m.state = l.state;
  }
  return { ...q, nodes, links: [...merged.values()] };
}
const sum0 = (list, f) => list.reduce((t, x) => t + f(x), 0);
/** What each node carries (the larger of what reaches it and what leaves it), counted once for the whole graph: a graph of hundreds of nodes is read in one pass */
function totals(q, on, f) {
  const into = new Map(), out = new Map();
  for (const l of q.links) if (on(l)) { into.set(l.to, (into.get(l.to) || 0) + f(l)); out.set(l.from, (out.get(l.from) || 0) + f(l)); }
  return n => n.hidden ? 0 : Math.max(into.get(n.id) || 0, out.get(n.id) || 0);
}

/* the S curve of a band edge from (x0, y0) to (x1, y1), control points at the middle x: where it is at parameter s */
const curveX = s => 1.5 * s * (1 - s) + s * s * s, curveY = s => 3 * s * s - 2 * s * s * s;

/**
 * The sankey layout (relation, stack). link.size is the value a band carries (any unit, one unit for the whole drawing).
 *  - one scale for the whole drawing: the largest scale (px per unit) at which every column fits the height, with its gaps and names; never less than a share
 *    of what the fullest column alone would get (the drawing grows taller instead). A band is value x scale thick, never thinner than bandMin.
 *  - a node is as tall as the larger of its two blocks of band ends, never shorter than tileMin when it has an icon; a node grown to its floor holds its
 *    ends as one block in its middle: the bands keep their thickness.
 *  - the nodes of a column are in the order that crosses least (barycentre sweeps), troubled nodes first, rest (node.rest) last; keepOrder (id: rank)
 *    keeps an order given before, so a new value never reorders the drawing. order: false keeps the caller's order (its y).
 *  - the nodes then move towards the bands they are joined to, never closer than tileSpace and the name under the one above.
 *  - the ends of a node's bands lie side by side along its edge in the order of the nodes at their other ends, none over another, all within the node.
 *  - a name under a tile that a band runs through is moved down below that band (labelDW: the drawn width of each name), and the next node makes room.
 *  - a name that a band would cross on one line (labelFW, labelFH: its one-line width and height; labelFP: its pieces as drawn) wraps to two lines under its
 *    own tile in the room the bands leave it, from its tile's left edge or back from its right edge; the nodes below it move down to hold the two lines.
 * Positions are rounded to half pixels, so a drawing at rest is drawn at the same pixels.
 */
export function sankeyLayout(p) {
  const bw = p.bar || 6, H0 = Math.max(1, p.height || 1), bmin = p.bandMin ?? 0, egap = p.endGap ?? 0, apartX = p.labelApart ?? 12, tmin = p.tileMin ?? 0, space = p.tileSpace ?? 0, lgap = p.labelGap ?? 6, gap = p.gap || 0;
  const nodes = p.nodes.map((n, k) => ({ ...n, k })), N = Object.fromEntries(nodes.map(n => [n.id, n]));
  const links = p.links.map((l, i) => ({ ...l, i, v: Math.max(0, Number(l.size) || 0) }));
  const on = l => !l.hidden && l.v > 0 && N[l.from] && N[l.to] && !N[l.from].hidden && !N[l.to].hidden;
  const cols = [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b);
  const inOf = Object.fromEntries(nodes.map(n => [n.id, links.filter(l => l.to === n.id)])), outOf = Object.fromEntries(nodes.map(n => [n.id, links.filter(l => l.from === n.id)]));
  const sum = (list, f) => list.reduce((t, x) => t + f(x), 0);
  const val = n => n.hidden ? 0 : Math.max(sum(inOf[n.id].filter(on), l => l.v), sum(outOf[n.id].filter(on), l => l.v));
  /* order */
  const rank = {};
  const same = p.keepOrder && nodes.every(n => p.keepOrder[n.id] !== undefined);
  for (const c of cols) nodes.filter(n => n.col === c).sort((a, b) => same ? p.keepOrder[a.id] - p.keepOrder[b.id] : (a.y ?? 0) - (b.y ?? 0) || a.k - b.k).forEach((n, r) => { rank[n.id] = r; });
  if (!same && p.order !== false) {
    const colOf = c => nodes.filter(n => n.col === c).sort((a, b) => rank[a.id] - rank[b.id]);
    /* a node's place in its column as a share of the column's value (its middle), so a big node counts as big */
    const pos = c => { const list = colOf(c), tot = sum(list, n => val(n) || 1e-6); let at = 0; const o = {}; for (const n of list) { const v = val(n) || 1e-6; o[n.id] = (at + v / 2) / tot; at += v; } return o; };
    const group = n => n.rest ? 2 : TROUBLE[n.state] ? 0 : 1;
    const sweep = (c, side) => {
      const other = pos(side < 0 ? c - 1 : c + 1);
      const bary = n => { const ls = (side < 0 ? inOf[n.id] : outOf[n.id]).filter(l => other[side < 0 ? l.from : l.to] !== undefined); const w = sum(ls, l => l.v || 1e-6);
        return w ? sum(ls, l => (l.v || 1e-6) * other[side < 0 ? l.from : l.to]) / w : null; };
      const list = colOf(c), own = pos(c);
      list.map(n => ({ n, g: group(n), b: bary(n) ?? own[n.id], r: rank[n.id] })).sort((a, b) => a.g - b.g || a.b - b.b || a.r - b.r).forEach((x, r) => { rank[x.n.id] = r; });
    };
    for (let round = 0; round < 3; round++) { for (const c of cols.slice(1)) sweep(c, -1); for (const c of cols.slice(0, -1).reverse()) sweep(c, 1); }
    /* then two neighbours of one group change places while that crosses fewer bands (every crossing counts, a thin band's as much as a thick one's) */
    const live = links.filter(on), crossings = c => { let k = 0; for (const a of live) for (const b of live) if (a.i < b.i && (N[a.from].col === c || N[a.to].col === c) && N[a.from].col === N[b.from].col && N[a.to].col === N[b.to].col)
      k += (rank[a.from] - rank[b.from]) * (rank[a.to] - rank[b.to]) < 0 ? 1 : 0; return k; };
    for (let round = 0, better = true; round < 6 && better; round++) {
      better = false;
      for (const c of cols) {
        const list = colOf(c);
        for (let i = 0; i + 1 < list.length; i++) {
          const a = list[i], b = list[i + 1]; if (group(a) !== group(b)) continue;
          const before = crossings(c); [rank[a.id], rank[b.id]] = [rank[b.id], rank[a.id]];
          if (crossings(c) < before) { better = true; list[i] = b; list[i + 1] = a; } else [rank[a.id], rank[b.id]] = [rank[b.id], rank[a.id]];
        }
      }
    }
  }
  const order = c => nodes.filter(n => n.col === c && !n.hidden).sort((a, b) => rank[a.id] - rank[b.id]);
  const wrapH = {}, labH = n => n.inside ? 0 : Math.max(p.labelH?.[n.id] || 0, wrapH[n.id] || 0); /* wrapH: a name wrapped to two lines holds their height from the pass it wraps in */
  const drop = {}, push = {}, under = {}; /* push: more room above a node, so a band from the node above passes over its name */
  /* below a node: its name (moved down past a band when one runs through it) and the room to the next node */
  const below = n => labH(n) && !n.labove ? lgap + (drop[n.id] || 0) + labH(n) : 0, gapAfter = n => Math.max(space, below(n) + lgap + (drop[n.id] || 0) + (under[n.id] || 0)); /* a name moved down keeps closer to its own tile than to the next */
  /* a band's own thickness: its value at the scale, never thinner than bandMin */
  const vals = links.filter(on).map(l => l.v);
  const thick = (l, s) => on(l) ? Math.max(l.v * s, bmin) : 0;
  /* the ends on one edge lie endGap apart, so several flows into one node read as separate ribbons */
  const side = (list, s) => { const shown = list.filter(on); return sum(shown, l => thick(l, s)) + egap * Math.max(0, shown.length - 1); };
  const hOf = (n, s) => n.hidden ? 0 : Math.max(side(inOf[n.id], s), side(outOf[n.id], s), n.icon ? tmin : 0, bmin, 1);
  const need = (c, s) => { const list = order(c); return list.length ? sum(list, n => hOf(n, s)) + sum(list.slice(0, -1), gapAfter) + sum(list, n => push[n.id] || 0) + below(list.at(-1)) : 0; };
  let s = 0, H = H0, laid;
  const x = n => p.columns[n.col];
  for (let pass = 0; pass < 16; pass++) {
    /* the scale: the largest at which every column fits */
    const full = Math.max(1e-9, ...cols.map(c => sum(order(c), val))), hi = H0 / full;
    let lo = 0, up = H0 / Math.max(1e-9, Math.min(...vals, full));
    for (let k = 0; k < 40; k++) { const mid = (lo + up) / 2; if (cols.every(c => need(c, mid) <= H0)) lo = mid; else up = mid; }
    s = Math.max(lo, hi * (p.scaleFloor ?? .4));
    H = links.some(on) ? Math.max(H0, ...cols.map(c => need(c, s))) : Math.max(1, ...cols.map(c => need(c, s))); /* nothing flows: the drawing is only as tall as its nodes and names */
    for (const n of nodes) n.h = hOf(n, s);
    /* stacked and centred, then moved towards the bands they are joined to, keeping their order and their room */
    const settle = c => {
      const list = order(c);
      list.forEach((n, i) => { const lo2 = (i ? list[i - 1].y + list[i - 1].h + gapAfter(list[i - 1]) : 0) + (push[n.id] || 0); if (!(n.y >= lo2)) n.y = lo2; });
      for (let i = list.length - 1; i >= 0; i--) { const n = list[i], hi2 = i < list.length - 1 ? list[i + 1].y - gapAfter(n) - (push[list[i + 1].id] || 0) - n.h : H - below(n) - n.h; if (n.y > hi2) n.y = hi2; }
      list.forEach((n, i) => { const lo2 = (i ? list[i - 1].y + list[i - 1].h + gapAfter(list[i - 1]) : 0) + (push[n.id] || 0); if (n.y < lo2) n.y = lo2; });
    };
    for (const c of cols) { const top = (H - need(c, s)) / 2; let y = top; order(c).forEach(n => { y += push[n.id] || 0; n.y = y; y += n.h + gapAfter(n); }); }
    const mid = n => n.y + n.h / 2;
    for (let it = 0, alpha = 1; it < 8; it++, alpha *= .8) {
      const pull = (c, side) => {
        for (const n of order(c)) {
          const ls = (side < 0 ? inOf[n.id] : outOf[n.id]).filter(on), w = sum(ls, l => thick(l, s));
          if (w) n.y += (sum(ls, l => thick(l, s) * mid(N[side < 0 ? l.from : l.to])) / w - mid(n)) * alpha;
        }
        settle(c);
      };
      for (const c of cols.slice(1)) pull(c, -1);
      for (const c of cols.slice(0, -1).reverse()) pull(c, 1);
    }
    /* a node that is hidden waits at its place in the order, at nothing, so it grows back where it belongs */
    for (const c of cols) {
      const all = nodes.filter(n => n.col === c).sort((a, b) => rank[a.id] - rank[b.id]);
      all.forEach((n, i) => { if (!n.hidden) return; const prev = all.slice(0, i).reverse().find(m => !m.hidden), next = all.slice(i + 1).find(m => !m.hidden);
        n.h = 0; n.y = prev ? prev.y + prev.h + gapAfter(prev) / 2 : next ? Math.max(0, next.y - space / 2) : H / 2; });
    }
    const half = v => Math.round(v * 2) / 2;
    for (const n of nodes) { n.y = half(n.y); n.h = half(n.h); }
    /* the ends: side by side in the order of the other ends, endGap apart, and together they fill the node's edge: a node grown to its floor widens the ends
       of its bands by one factor, so a band is as thick as its share of the nodes it joins and tapers from one to the other */
    for (const n of nodes) for (const [list, other, off, sz] of [[outOf[n.id], 'to', 'fromOffset', 'size'], [inOf[n.id], 'from', 'toOffset', 'size1']]) {
      const sorted = [...list].sort((a, b) => mid(N[a[other]]) - mid(N[b[other]]) || rank[a[other]] - rank[b[other]] || a.i - b.i), shown = sorted.filter(on);
      /* the ends of a node's bands fill its edge: they split it by value, endGap apart, so a band is never thinner than its share of the nodes it joins (a node
         grown to its floor widens its ends) and tapers from one end to the other */
      const room = Math.max(0, n.h - egap * Math.max(0, shown.length - 1)), own = sum(shown, l => thick(l, s)), k = own > 0 ? room / own : 1;
      let at = 0, first = true;
      for (const l of sorted) {
        if (on(l) && !first) at += egap;
        const t = on(l) ? thick(l, s) * k : 0;
        l[off] = half(at); l[sz] = half(at + t) - half(at); at += t; if (on(l)) first = false;
      }
    }
    /* a name sits under its tile, starting at the tile's left edge. Where a band runs through it there, it ends at the tile's right edge instead (reaching back
       over the bands that arrive at the tile), when that place is clear of bands and of the names of the column before. Still crossed: by a band from a node
       above, the node and its name move down together (more room above it); by any other band (its own falling band: moving the node moves its targets too),
       the name moves down at most its own height. The layout then runs again */
    const hit = (n, x0, x1, top, skipBelow) => {
      let low = -Infinity, above = false, mixed = false;
      for (const l of links) {
        if (!on(l)) continue;
        const A = N[l.from], B = N[l.to], bx0 = x(A) + bw + gap, bx1 = x(B) - gap, y0 = A.y + l.fromOffset, y1 = B.y + l.toOffset;
        if (bx1 <= x0 || bx0 >= x1) continue;
        if (skipBelow && ((A.col === n.col && A.y > n.y) || (B.col === n.col && B.y > n.y))) continue; /* a node below moves down to make room: its bands with it */
        for (let q = 0; q <= 96; q++) {
          const t = q / 96, bx = bx0 + (bx1 - bx0) * curveX(t); if (bx < x0 || bx > x1) continue;
          const by = y0 + (y1 - y0) * curveY(t), bt = l.size + (l.size1 - l.size) * curveY(t);
          if (by < top + labH(n) + 1 && by + bt > top - 1) { low = Math.max(low, by + bt); if (A.col === n.col && A.y < n.y && A !== n) above = true; else mixed = true; }
        }
      }
      return { low, above, mixed };
    };
    let moved = false;
    const boxes = [], clear = (b, n) => !boxes.some(o => o.id !== n.id && o.x0 < b.x1 + apartX && b.x0 < o.x1 + apartX && o.y0 < b.y1 && b.y0 < o.y1);
    /* how far right of its tile's left edge a name of height hh at top is clear of every band (the nodes below it in its column moved down by extra, to hold it) */
    const clearTo = (n, top, hh, xr, extra = 0) => {
      for (const l of links) {
        if (!on(l)) continue;
        const A = N[l.from], B = N[l.to], bx0 = x(A) + bw + gap, bx1 = x(B) - gap, y0 = A.y + l.fromOffset + (A.col === n.col && A.y > n.y ? extra : 0), y1 = B.y + l.toOffset;
        if (bx1 <= x(n) || bx0 >= xr) continue;
        for (let q = 0; q <= 96; q++) {
          const t = q / 96, bx = bx0 + (bx1 - bx0) * curveX(t); if (bx < x(n) || bx > xr) continue;
          const by = y0 + (y1 - y0) * curveY(t), bt = l.size + (l.size1 - l.size) * curveY(t);
          if (by < top + hh + 1 && by + bt > top - 1) { xr = bx; break; }
        }
      }
      return xr - x(n);
    };
    /* the same, for a name that ends at its tile's right edge and reaches back left over the bands that arrive at its column */
    const clearBack = (n, top, hh, xl, extra = 0) => {
      const xe = x(n) + bw;
      for (const l of links) {
        if (!on(l)) continue;
        const A = N[l.from], B = N[l.to], bx0 = x(A) + bw + gap, bx1 = x(B) - gap, y0 = A.y + l.fromOffset, y1 = B.y + l.toOffset + (B.col === n.col && B.y > n.y ? extra : 0);
        if (bx1 <= xl || bx0 >= xe) continue;
        for (let q = 96; q >= 0; q--) {
          const t = q / 96, bx = bx0 + (bx1 - bx0) * curveX(t); if (bx < xl || bx > xe) continue;
          const by = y0 + (y1 - y0) * curveY(t), bt = l.size + (l.size1 - l.size) * curveY(t);
          if (by < top + hh + 1 && by + bt > top - 1) { xl = bx; break; }
        }
      }
      return xe - xl;
    };
    for (const n of [...nodes].sort((a, b) => a.col - b.col || a.y - b.y)) {
      delete n.lend; delete n.lw;
      if (n.hidden || !labH(n)) continue;
      const w = p.labelDW?.[n.id] ?? p.labelW?.[n.id] ?? 0; if (!w) continue;
      const edge = edgeName(p, n), x0 = edge ? p.width - w : x(n), x1 = edge ? p.width : x(n) + w, home = n.y + n.h + lgap;
      /* a name that a band would cross on one line wraps to two lines (between its words) in the room the bands leave it under its own tile: every name keeps to
         its tile, under it, and no band runs through it */
      const fw = p.labelFW?.[n.id], fh = p.labelFH?.[n.id], least = p.labelW?.[n.id] ?? 0;
      if (!edge && fw && fh && !n.inside && !n.noWrap && clearTo(n, home, fh, x(n) + fw) < fw && !(x(n) + bw - fw >= 0 && clearBack(n, home, fh, x(n) + bw - fw) >= fw)) {
        /* the nodes below it move down as far as it takes (up to two more lines): a band that rises from them then leaves the name its room */
        const fits = r => r >= Math.max(least, bw) && linesIn(n.short || n.label, fw, r, p.labelFP?.[n.id]) <= 2, has = under[n.id] || 0;
        /* a band of its own that falls away under the tile: the name moves down below it, never further than one line from its tile */
        const was = drop[n.id] || 0;
        let more = 0, room = 0, d = 0, back = false;
        /* it starts at its tile's left edge, else it ends at its tile's right edge and reaches back over the bands that arrive there */
        search: for (d = 0; d <= 2 * fh; d += 2) for (more = 0; more <= 4 * fh; more += 4) {
          const extra = Math.max(0, 2 * fh + d - was - labH(n)) + more - has;
          room = Math.floor(clearTo(n, home + d, 2 * fh, x(n) + fw, extra) - apartX / 2); if (fits(room)) { back = false; break search; }
          room = Math.floor(clearBack(n, home + d, 2 * fh, Math.max(0, x(n) + bw - fw), extra) - apartX / 2); if (fits(room) && x(n) + bw - room >= 0) { back = true; break search; }
        }
        const box = { id: n.id, x0: back ? x(n) + bw - room : x(n), x1: back ? x(n) + bw : x(n) + room, y0: home + d, y1: home + d + 2 * fh };
        if (fits(room) && clear(box, n)) {
          if (n.labove) { delete n.labove; moved = true; } /* the room it was given above stays: the tile keeps its place */
          if (Math.abs(d - was) > .5) { drop[n.id] = d; moved = true; }
          if (more > has + .5) { under[n.id] = more; moved = true; }
          if ((wrapH[n.id] || 0) < 2 * fh) { wrapH[n.id] = 2 * fh; moved = true; }
          n.lw = room; n.ly = home + d; if (back) n.lend = true; boxes.push(box); continue; }
        /* no room for two lines: never tried again in this layout (so the choice settles), and the room it took is given back */
        n.noWrap = true; if (under[n.id] || drop[n.id] || wrapH[n.id]) { under[n.id] = 0; drop[n.id] = 0; wrapH[n.id] = 0; moved = true; }
      }
      if (!edge && hit(n, x0, x1, home).low > -Infinity) {
        const alt = { id: n.id, x0: x(n) + bw - w, x1: x(n) + bw, y0: home, y1: home + labH(n) };
        if (alt.x0 >= 0 && hit(n, alt.x0, alt.x1, home).low === -Infinity && clear(alt, n)) { delete n.labove; n.lend = true; n.ly = home; boxes.push(alt); continue; }
        /* or above its tile, where the bands have not yet left it: the node moves down to give it the room (more room above it) */
        /* a band from a node above that runs through that place makes the node move further down, until the name is under the band */
        const up = n.y - lgap - labH(n), box = { id: n.id, x0, x1, y0: up, y1: n.y - lgap }, h = hit(n, x0, x1, up);
        if (!n.noAbove && !h.mixed && (!n.labove || clear(box, n) || h.above)) {
          if (!n.labove) { n.labove = true; drop[n.id] = 0; moved = true; }
          const need = labH(n) + 2 * lgap + (h.above ? h.low + lgap - up : 0);
          if (need > (push[n.id] || 0) + .5 && (push[n.id] || 0) < 6 * (labH(n) + lgap)) { push[n.id] = Math.min(need + (push[n.id] || 0) * (h.above ? 1 : 0), 6 * (labH(n) + lgap)); moved = true; }
          n.ly = up; boxes.push(box); continue;
        }
      }
      if (n.labove) { delete n.labove; n.noAbove = true; push[n.id] = 0; moved = true; } /* tried once: never again in this layout, so the choice settles */
      let top = home, above = false;
      for (let k = 0; k < 6; k++) { const h = hit(n, x0, x1, top, true); if (h.low === -Infinity) break; above ||= h.above; top = h.low + lgap; }
      const over = Math.max(0, top - home);
      if (above && over > .5) {
        const more = Math.min(over, 4 * (labH(n) + lgap) - (push[n.id] || 0));
        if (more > .5) { push[n.id] = (push[n.id] || 0) + more; moved = true; }
        n.ly = home;
      } else {
        const want = Math.min(over, labH(n) + lgap);
        if (want > (drop[n.id] || 0) + .5) { drop[n.id] = want; moved = true; }
        n.ly = home + want;
      }
      boxes.push({ id: n.id, x0, x1, y0: n.ly, y1: n.ly + labH(n) });
    }
    laid = { ...p, height: Math.ceil(H), nodes, links, laid: true, stack: true, order: rank };
    if (!moved) break;
  }
  for (const n of laid.nodes) if (n.ly === undefined || n.hidden) n.ly = n.y + n.h + lgap;
  for (const l of laid.links) { delete l.v; delete l.i; }
  for (const n of laid.nodes) { delete n.k; delete n.noAbove; delete n.noWrap; }
  return laid;
}

function inner(p) {
  p = layout(p);
  if (p.mode === 'relation' && p.live && p.wash === undefined) p = { ...p, wash: '' }; /* a live graph keeps its flow running: the wash layers are there to loop */
  p = { ...p, nodes: p.nodes.map(n => STATE_HUE[n.state] ? { ...n, hue: STATE_HUE[n.state], stateHue: true } : n.tone && !n.hue ? { ...n, hue: TONES[n.tone] } : n) }; /* a node in a state has that state's colour, over its own */
  /* the time the front takes to cross the drawing follows its width at a fixed speed; every layer that is told it (the svg and the icons, which sit outside it) gets the same values */
  const speed = p.washSpeed || 480, wash = `--wash-front:${Math.round((p.width + (p.washLead || 36)) / speed * 1000)}ms;--wash-trail:${Math.round((p.width + (p.washTrail || 240)) / speed * 1000)}ms`;
  const bw = p.bar || 6, last = p.columns.length - 1, lgap = p.labelGap ?? 6, apart = p.labelApart ?? 12;
  const icoGrow = n => Math.max(0, Math.min(1, (n.h / bw - .3) / .4)).toFixed(3), valGrow = size => size >= bw * .36 ? 1 : 0; /* a figure is written only on a band that holds it whole; a thinner band names its amount on hover */
  const N = Object.fromEntries(p.nodes.map(n => [n.id, n]));
  const x = n => p.columns[n.col];
  const relation = p.mode === 'relation', gid = p.gid || idOf(p);
  /* the room of a name (relation, under its tile): up to the next column; a name at the drawing's edge ends there and reaches back to the middle of the band before it,
     so the names of the column before stop at that middle. Names wrap in that room; none is cut */
  const edgeOf = n => edgeName(p, n);
  const edgeCol = c => p.nodes.some(n => n.col === c && !n.hidden && edgeOf(n));
  const need = c => Math.max(0, ...p.nodes.filter(n => n.col === c && !n.hidden && !n.inside).map(n => p.labelW?.[n.id] || 0));
  /* where the names of an edge column and those of the column before part: the middle of the band between them, moved so each side has its widest word */
  const mid = c => { const m = (p.columns[c - 1] + bw + p.columns[c]) / 2, lo = p.columns[c - 1] + need(c - 1) + apart, hi = p.width - need(c); return lo <= hi ? Math.min(Math.max(m, lo), hi) : m; };
  const roomOf = n => edgeOf(n) ? p.width - mid(n.col) : n.col < last ? (edgeCol(n.col + 1) ? mid(n.col + 1) : p.columns[n.col + 1]) - x(n) - apart : p.width - x(n); /* names of two columns stay labelApart apart */
  let bandsOut = '', edgesOut = '', icos = '', runs = '', bars = '', labels = '', defs = '';
  const geo = [], figures = []; let defsExtra = '', glass = '';
  p.links.forEach((l, i) => {
    const key = esc(JSON.stringify([l.from, l.to, p.links.slice(0, i).filter(link => link.from === l.from && link.to === l.to).length]));
    const A = N[l.from], B = N[l.to];
    const x0 = x(A) + bw, x1 = x(B), mx = (x0 + x1) / 2, y0 = A.y + l.fromOffset, y1 = B.y + l.toOffset, t = l.size, t1 = l.size1 ?? t;
    const d = `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + t1} C${mx},${y1 + t1} ${mx},${y0 + t} ${x0},${y0 + t} Z`;
    if (relation) {
      const gap = p.gap || 0, bx0 = x0 + gap, bx1 = x1 - gap, bmx = (bx0 + bx1) / 2;
      /* a band from tile to tile: as thick as the link at each end (a grown tile widens its end). Its shape is gathered with the others leaving the same tile and drawn below as one union */
      const c0 = p.stack ? A.y + l.fromOffset : A.y + A.h / 2 - t / 2, c1 = p.stack ? B.y + l.toOffset : B.y + B.h / 2 - t1 / 2;
      geo.push({ i, l, A, B, key, c0, c1, t0: t, t1, t: Math.max(t, t1), bx0, bx1, bmx, gone: l.hidden || A.hidden || B.hidden ? ' hidden' : '' });
      if (l.value) figures.push({ g: geo.at(-1), html: (grow, at) => at ? `<div data-key="val${key}" class="fl-val at-end" style="--val-grow:${grow};--c:${A.col};left:${at.x}px;top:${at.y}px">${esc(l.value)}</div>`
        : `<div data-key="val${key}" class="fl-val" style="--val-grow:${grow};--c:${A.col};left:${bmx}px;top:${(c0 + t / 2 + c1 + t1 / 2) / 2}px;max-width:${Math.max(0, bx1 - bx0 - 8)}px">${esc(l.value)}</div>` });
      return;
    }
    bandsOut += `<path data-key="band${key}" data-link="${i}" class="fl-band ${l.state}" d="${d}" style="animation-delay:${i * 50}ms"/>`;
    if (flowing(p, l)) {
      const c0 = y0 + t / 2, c1 = y1 + t1 / 2;
      runs += `<clipPath data-key="clip${key}" id="${gid}c${i}"><path d="${d}"/></clipPath><path data-key="run${key}" class="fl-run ${esc(l.state || 'ok')}" clip-path="url(#${gid}c${i})" d="M${x0},${c0} C${mx},${c0} ${mx},${c1} ${x1},${c1}" stroke-width="${Math.max(t, t1)}" style="animation-delay:-${(i * .37).toFixed(2)}s"/>`;
    }
  });
  if (relation) {
    const drawn = bands(p, geo, gid); defsExtra += drawn.defs; bandsOut += drawn.out; edgesOut = drawn.edges;
    /* a band's figure is written where it is whole and alone: on a band thick enough to hold it, clear of every other band (a crossing) and of the figures
       of thicker bands; any other band names its amount on hover */
    const span = (g, at) => { let lo = 0, hi = 1; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (g.bx0 + (g.bx1 - g.bx0) * curveX(m) < at) lo = m; else hi = m; } const f = curveY(lo), top = g.c0 + (g.c1 - g.c0) * f; return [top, top + g.t0 + (g.t1 - g.t0) * f]; };
    const placed = [];
    for (const fig of figures.sort((a, b) => Math.min(b.g.t0, b.g.t1) - Math.min(a.g.t0, a.g.t1))) {
      const g = fig.g, w = Math.min(g.bx1 - g.bx0 - 8, String(g.l.value).length * 8 + 8), cy = (g.c0 + g.t0 / 2 + g.c1 + g.t1 / 2) / 2, box = { x0: g.bmx - w / 2, x1: g.bmx + w / 2, y0: cy - 9, y1: cy + 9 };
      let ok = !g.gone && valGrow(Math.min(g.t0, g.t1)) === 1 && !placed.some(o => o.x0 < box.x1 && box.x0 < o.x1 && o.y0 < box.y1 && box.y0 < o.y1);
      /* its own band holds the figure across its width: on a steep stretch the band's edge would run through the figure */
      const inside = b => [0, .25, .5, .75, 1].every(k => { const [a, z] = span(g, b.x0 + (b.x1 - b.x0) * k); return a <= b.y0 + 3 && z >= b.y1 - 3; });
      if (ok && !inside(box)) ok = false;
      if (ok) for (const h of geo) { if (h === g || h.gone || !(h.t > .01) || h.bx1 <= box.x0 || h.bx0 >= box.x1) continue; for (let k = 0; k <= 8; k++) { const at = box.x0 + (box.x1 - box.x0) * k / 8; const [a, b] = span(h, at); if (a < box.y1 && b > box.y0) { ok = false; break; } } if (!ok) break; }
      if (ok) { placed.push(box); labels += fig.html(1); continue; }
      /* else inside the band near its wider end, where it holds the figure and nothing crosses it; a band too thin for its figure names it on hover only */
      const near = [g.t1 >= g.t0 ? { x: g.bx1 - 6 - w / 2, y: g.c1 + g.t1 / 2, t: g.t1 } : null, { x: g.bx0 + 6 + w / 2, y: g.c0 + g.t0 / 2, t: g.t0 }, g.t1 < g.t0 ? { x: g.bx1 - 6 - w / 2, y: g.c1 + g.t1 / 2, t: g.t1 } : null].filter(Boolean)
        .map(e => ({ ...e, x0: e.x - w / 2, x1: e.x + w / 2, y0: e.y - 9, y1: e.y + 9 }))
        .find(e => e.t >= 18 && !g.gone && inside(e) && !placed.some(o => o.x0 < e.x1 && e.x0 < o.x1 && o.y0 < e.y1 && e.y0 < o.y1)
          && !geo.some(h => h !== g && !h.gone && h.t > .01 && h.bx1 > e.x0 && h.bx0 < e.x1 && [0, .5, 1].some(k => { const at = Math.min(Math.max(e.x0 + (e.x1 - e.x0) * k, h.bx0), h.bx1), [a, z] = span(h, at); return a < e.y1 && z > e.y0; })));
      if (near) { placed.push(near); labels += fig.html(1, near); } else labels += fig.html(0);
    }
    /* every band can be pointed at for its reading: a shape that paints nothing, under the tiles */
    for (const g of geo) if (!g.gone && g.t > .01) bandsOut += `<path data-key="bhit${g.key}" class="fl-bhit" data-link="${g.i}" d="${g.d}"/>`;
  }
  for (const n of p.nodes) {
    /* a tile is round on the side that faces the outside and less round where a band joins it: the inner corner is the outer corner less the gap between them */
    const tilePath = (px, py, w, h, rl, rr) => { const cap = Math.min(w / 2, h * .36), a = Math.min(rl, cap), b = Math.min(rr, cap); /* a squarish tile is not rounded into a ball */ return `M${px + a},${py} H${px + w - b} A${b},${b} 0 0 1 ${px + w},${py + b} V${py + h - b} A${b},${b} 0 0 1 ${px + w - b},${py + h} H${px + a} A${a},${a} 0 0 1 ${px},${py + h - a} V${py + a} A${a},${a} 0 0 1 ${px + a},${py} Z`; };
    const outer = p.radii?.outer ?? 0, inner = p.radii?.inner ?? 0, hasIn = p.links.some(l => l.to === n.id), hasOut = p.links.some(l => l.from === n.id);
    const motion = nodeMotion(n), stm = shape => motion ? `<g data-key="stm${esc(n.id)}" class="stm" data-motion="${motion}">${shape}</g>` : shape;
    if (relation && p.visual === 'glass') {
      /* liquid glass: the tile's face is an HTML layer, so it can blur and brighten what is behind it (an SVG shape cannot) */
      const cap = Math.min(bw / 2, n.h * .36), rl = Math.min(hasIn ? inner : outer, cap), rr = Math.min(hasOut ? inner : outer, cap);
      glass += `<div data-key="gnode${esc(n.id)}" class="fl-glass${n.hidden ? ' hidden' : ''}" data-node="${esc(n.id)}" style="left:${x(n)}px;top:${n.y}px;width:${bw}px;height:${n.h}px;border-radius:${rl}px ${rr}px ${rr}px ${rl}px;--grow:${Math.min(1, n.h / (bw / 2)).toFixed(3)}"></div>`;
      if (motion) bars += stm(`<path class="stm-halo" d="${tilePath(x(n), n.y, bw, n.h, hasIn ? inner : outer, hasOut ? inner : outer)}"/>`);
    } else if (relation) {
      const d = tilePath(x(n), n.y, bw, n.h, hasIn ? inner : outer, hasOut ? inner : outer);
      bars += stm(`${motion ? `<path class="stm-halo" d="${d}"/>` : ''}<path data-key="node${esc(n.id)}" class="fl-tile ${n.state}${n.hidden ? ' hidden' : ''}" data-node="${esc(n.id)}" style="--c:${n.col};--grow:${Math.min(1, n.h / (bw / 2)).toFixed(3)}" d="${d}"/>`);
    } else bars += stm(`${motion ? `<rect class="stm-halo" x="${x(n)}" y="${n.y}" width="${bw}" height="${n.h}" rx="2"/>` : ''}<rect data-key="node${esc(n.id)}" class="fl-node ${n.state}" data-node="${esc(n.id)}" x="${x(n)}" y="${n.y}" width="${bw}" height="${n.h}" rx="2" style="animation-delay:${n.col * 80}ms"/>`);
    if (relation && n.icon) icos += `<div data-key="ico${esc(n.id)}" class="fl-ico ${n.stateHue ? n.state + ' stm-pulse' : n.hue ? (p.wash !== undefined ? 'lit' : 'plain') : n.state}${n.hidden ? ' hidden' : ''}${n.inside && n.label ? ' has-label' : ''}${(n.prog ?? 1) >= .999 && !n.hidden ? ' ready' : ''}" style="${wash};${n.hue && !n.stateHue ? `--fl-ico-hue:var(${esc(n.hue)});` : ''}--ico-grow:${icoGrow(n)};--c:${n.col};--wfrac:${((x(n) + bw / 2 + (p.washLead ?? 36)) / (p.width + 2 * (p.washTrail ?? 240) + (p.washLead ?? 36))).toFixed(4)};left:${x(n) + bw / 2}px;top:${n.y + n.h / 2}px">${icon(n.icon, 'lg').s}</div>`;
    if (n.action) bars += `<rect data-key="hit${esc(n.id)}" class="fl-hit" data-node="${esc(n.id)}" aria-label="${esc([n.ariaLabel || n.label, n.sub].filter(Boolean).join(' · '))}" role="button" tabindex="0" data-action="${esc(n.action)}" data-arg='${esc(JSON.stringify(n.arg ?? n.id))}' x="${x(n) - 4}" y="${n.y}" width="${bw + 8}" height="${n.h}"/>`;
    const activate = n.action ? ` role="button" tabindex="0" data-action="${esc(n.action)}" data-arg='${esc(JSON.stringify(n.arg ?? n.id))}' aria-label="${esc(n.ariaLabel || n.label)}"` : '';
    if (relation) {
      const edge = edgeOf(n), end = !edge && n.lend; /* the tile ends at the drawing's edge: its name ends there; end: the name ends at its tile's right edge */
      labels += `<div data-key="label${esc(n.id)}" class="fl-label under${n.inside ? ' inside' : ''}${edge || end ? ' edge' : ''}${n.action ? ' fl-hit' : ''}${n.hidden ? ' hidden' : ''}${(n.prog ?? 1) >= .999 && !n.hidden ? ' ready' : ''}"${activate} data-node="${esc(n.id)}" style="--ico-grow:${icoGrow(n)};--c:${n.col};left:${n.inside ? x(n) + bw / 2 : edge ? p.width : end ? x(n) + bw : x(n)}px;top:${n.inside ? n.y + n.h / 2 : n.ly ?? n.y + n.h + lgap}px${n.inside ? '' : n.lw && !edge ? `;max-width:${n.lw}px` : end ? `;max-width:${Math.max(bw, p.labelDW?.[n.id] ?? 0, p.labelW?.[n.id] ?? 0)}px` : !edge && n.col === last ? `;max-width:max(var(--fl-label-under-max), ${Math.max(bw, Math.min(Math.floor(roomOf(n)), Math.max(p.labelWrap ?? 220, p.labelW?.[n.id] ?? 0)))}px)` : `;max-width:${Math.max(bw, Math.min(Math.floor(roomOf(n)), Math.max(p.labelWrap ?? 220, p.labelW?.[n.id] ?? 0)))}px`}">${nameOf(n, p)}${n.sub ? `<small>${words(n.sub)}</small>` : ''}</div>`;
      continue;
    }
    labels += p.sideLabels && n.col === 0
      ? `<div data-key="label${esc(n.id)}" class="fl-label start" data-node="${esc(n.id)}" style="left:${x(n)}px;top:${n.y + n.h / 2}px;max-width:${x(n)}px"><small>${words(n.sub || '')}</small><b>${words(n.label)}</b></div>`
      : n.col === last
      ? `<div data-key="label${esc(n.id)}" class="fl-label end${n.action ? ' fl-hit' : ''}"${activate} data-node="${esc(n.id)}" style="left:${x(n) + bw + 12}px;top:${n.y + n.h / 2}px"><b>${words(n.label)}</b>${n.sub ? `<small>${words(n.sub)}</small>` : ''}</div>`
      : `<div data-key="label${esc(n.id)}" class="fl-label${n.action ? ' fl-hit' : ''}"${activate} data-node="${esc(n.id)}" style="left:${x(n)}px;top:${n.y}px;max-width:min(var(--fl-label-max), ${Math.max(0, (p.columns[n.col + 1] ?? p.width) - x(n) - 8)}px)"><b>${words(n.label)}</b>${n.sub ? `<small>${words(n.sub)}</small>` : ''}</div>`;
  }
  return `<svg viewBox="0 0 ${p.width} ${p.height}" width="${p.width}" height="${p.height}" style="${wash}" role="img">${defs + defsExtra ? `<defs>${defs}${defsExtra}</defs>` : ''}${bandsOut + runs}<g data-key="nodes" class="stm-clock">${bars}</g></svg>${edgesOut ? `<svg data-key="over" class="fl-over" viewBox="0 0 ${p.width} ${p.height}" width="${p.width}" height="${p.height}" aria-hidden="true">${edgesOut}</svg>` : ''}${glass}${icos ? `<div data-key="icos" class="fl-icos stm-clock">${icos}</div>` : ''}${labels}`;
}

/* norm: a drawing given in fractions of its height (nodes, offsets and sizes), with aspect = height / width: it keeps its proportions whatever room it has */
/* node.tone names a color of the reference's sankey palette: the wash and the icon take it (node.hue still names any token) */
const TONES = { ac: '--sk-ac', battery: '--sk-bat', system: '--sk-sys', other: '--sk-other', soc: '--sk-soc', out: '--sk-out' };

/* how many lines a name of one-line width fw takes in a room: it breaks where words() lets it (spaces, after a hyphen), each piece about as wide as its letters */
function linesIn(text, fw, room, measured) {
  const width = s => [...s].reduce((t, c) => t + (WIDE.test(c) ? 1.8 : 1), 0), all = width(String(text ?? '').replaceAll(' ', '')) + String(text ?? '').split(' ').length - 1 || 1;
  /* [piece width, width of the space before it]: as the browser drew them, else from the letters */
  const pieces = measured?.length ? measured : String(text ?? '').split(' ').flatMap((w, i) => w.split(/(?<=-)/).map((s, j) => [width(s) / all * fw, i && !j ? fw / all : 0]));
  let lines = 1, at = 0;
  for (const [w, sp] of pieces) { if (at && at + sp + w > room + .5) { lines++; at = w; } else at += (at ? sp : 0) + w; }
  return lines;
}

/** A name's words, each kept whole: a name wraps at its spaces and after a hyphen (between the words of a resource name), never inside a word or at a dot */
const words = text => String(text).split(' ').map(w => `<span class="fl-w">${esc(w).replaceAll('-', '-<wbr>')}</span>`).join(' ');

/** A tile's name: the short one the caller gave (the whole name is its title), else the whole name. A name is never cut: it wraps in the room it has. */
function nameOf(n, p = {}) {
  if (n.short && n.short !== n.label) return `<b title="${esc(n.label)}">${words(n.short)}</b>`;
  const short = elide(n.label, p);
  return short !== n.label ? `<b title="${esc(n.label)}">${words(short)}</b>` : `<b>${words(n.label)}</b>`;
}

/* A very long name (over elideOver characters, 45) that would take more than two lines at labelWrap is cut in its middle, keeping its start and its end; the whole
   name is its title. A wide letter (Hangul, CJK) counts about twice a narrow one. Ordinary names are never cut */
const UNIT = 7.5, WIDE = /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;
function elide(text, p) {
  text = String(text ?? '');
  const width = c => WIDE.test(c) ? 1.8 : 1, chars = [...text], room = 2 * (p.labelWrap ?? 220) / UNIT - 4;
  if (chars.length <= (p.elideOver ?? 45) || chars.reduce((t, c) => t + width(c), 0) <= room) return text;
  let head = [], tail = [], used = 1;
  for (let i = 0, j = chars.length - 1; i <= j;) {
    const take = head.length <= tail.length ? chars[i] : chars[j]; if (used + width(take) > room) break;
    used += width(take); if (take === chars[i] && head.length <= tail.length) { head.push(take); i++; } else { tail.unshift(take); j--; }
  }
  return head.join('') + '…' + tail.join('');
}

/* tileMin (relation): a tile that holds an icon is never smaller than the icon and its room, whatever its value. It grows around its middle; the bands that join it
   keep their own thickness (their value) and their ends are spread along its edge with even gaps, the first at its top and the last at its bottom (one band sits in its
   middle), so the ends still span the edge they join. The tiles under it in its column move down so that tileSpace stays between them */
export function floorTiles(p) {
  const min = p.tileMin || 0;
  if (p.mode !== 'relation') return p;
  const grow = {}, nodes = p.nodes.map(n => ({ ...n }));
  /* a tile also holds the ends of its bands: where the thinnest bands were made thicker (bandMin), their block may be taller than the tile's value */
  const ends = (id, end, sz) => p.links.filter(l => l[end] === id && !l.hidden).reduce((t, l) => t + ((sz === 'size1' ? l.size1 ?? l.size : l.size) || 0), 0);
  for (const n of nodes) {
    if (n.hidden || !(n.h > 0)) continue;
    const want = Math.max(n.icon ? min : 0, ends(n.id, 'from', 'size'), ends(n.id, 'to', 'size1'));
    if (want > n.h + 1e-9) { grow[n.id] = (want - n.h) / 2; n.y -= grow[n.id]; n.h = want; }
  }
  if (!Object.keys(grow).length) return p;
  const space = p.tileSpace || 0;
  for (const col of new Set(nodes.map(n => n.col))) {
    let floor = -Infinity;
    for (const n of nodes.filter(m => m.col === col && !m.hidden && m.h > 0).sort((a, b) => a.y - b.y)) { if (n.y < floor) n.y = floor; floor = n.y + n.h + space; }
  }
  /* a tile grown at the top of the drawing does not stand out of it: the drawing moves down to hold it */
  const top = Math.min(0, ...nodes.filter(n => !n.hidden && n.h > 0).map(n => n.y));
  if (top < 0) for (const n of nodes) n.y -= top;
  const height = Math.max(p.height - top, ...nodes.filter(n => !n.hidden).map(n => n.y + n.h));
  const links = p.links.map(l => ({ ...l }));
  return { ...p, height: Math.ceil(height), nodes, links };
}

/**
 * The ends of the bands at every tile (relation): the bands leaving a tile, and those reaching one, lie side by side along its edge with no two at the same height, in
 * the order of the tiles at their other end, as one block centred on the tile (a tile grown to its floor holds its small block in its middle). Each keeps its thickness
 * (one scale for the whole drawing); a block taller than its tile is narrowed at that end to fit it. Every end lies within its tile's height.
 */
export function stackEnds(p) {
  if (p.mode !== 'relation') return p;
  const N = Object.fromEntries(p.nodes.map(n => [n.id, n])), links = p.links.map(l => ({ ...l, size1: l.size1 ?? l.size }));
  const mid = id => (N[id]?.y ?? 0) + (N[id]?.h ?? 0) / 2;
  for (const n of p.nodes) for (const [end, other, offset, size] of [['from', 'to', 'fromOffset', 'size'], ['to', 'from', 'toOffset', 'size1']]) {
    /* a band that is hidden or empty keeps its place in the order (at its size), so it grows back where it belongs */
    const list = links.filter(l => l[end] === n.id).sort((a, b) => mid(a[other]) - mid(b[other]));
    const sum = list.reduce((t, l) => t + (l[size] || 0), 0), k = sum > n.h && sum > 0 ? n.h / sum : 1;
    let at = (n.h - sum * k) / 2;
    for (const l of list) { l[size] = (l[size] || 0) * k; l[offset] = at; at += l[size]; }
  }
  return { ...p, stack: true, links };
}

/** bandMin: a band that carries anything is never thinner than this (px), so one item among thousands is still seen; a band with nothing (size 0, hidden) stays at 0 */
export function thinnest(p) {
  const min = p.bandMin || 0;
  if (!min || !p.links.some(l => !l.hidden && l.size > 0 && l.size < min)) return p;
  return { ...p, links: p.links.map(l => !l.hidden && l.size > 0 && l.size < min ? { ...l, size: min, ...(l.size1 != null ? { size1: Math.max(l.size1, min) } : {}) } : l) };
}

/**
 * Room for each column's names: a column's gap is at least its widest unbreakable name (labelW: the least width of each node's name, its longest word) and the room
 * between a tile and its name; a name at the drawing's edge reaches back from the edge. Gaps with room to spare give it up first (each down to its own need); what is still
 * missing widens the drawing (its host scrolls). Columns keep their order and their alignment.
 */
export function widen(p, labelW, gap = 0) {
  if (!labelW || !Object.keys(labelW).length || p.columns.length < 2) return p;
  const bw = p.bar || 6, last = p.columns.length - 1, cols = [...p.columns], relation = p.mode === 'relation';
  const need = c => Math.max(0, ...p.nodes.filter(n => n.col === c && !n.hidden && !n.inside).map(n => labelW[n.id] || 0));
  const back = Math.max(0, ...p.nodes.filter(n => n.col === last && !n.hidden && edgeName({ ...p, labelW }, n)).map(n => labelW[n.id] - bw));
  /* what each gap needs: the names of its left column, and in front of an edge column the names that reach back into it too */
  const req = cols.slice(0, -1).map((_, c) => (p.sideLabels && c === 0 && !relation ? 0 : need(c) + gap) + (c === last - 1 ? back : 0)); /* gap: the room between two columns' names */
  const have = cols.slice(1).map((x, c) => x - cols[c]), short = have.map((h, c) => Math.max(0, req[c] - h));
  let missing = short.reduce((t, v) => t + v, 0);
  if (!missing) return p;
  const spare = have.map((h, c) => Math.max(0, h - req[c])), spareSum = spare.reduce((t, v) => t + v, 0), take = Math.min(missing, spareSum);
  const next = have.map((h, c) => h + short[c] - (spareSum ? spare[c] * take / spareSum : 0));
  missing -= take;
  const out = [cols[0]]; next.forEach(d => out.push(out.at(-1) + d));
  return { ...p, columns: out.map(x => Math.round(x)), width: Math.round(p.width + (out.at(-1) - cols[last])) };
}

/**
 * Room for the names: every node keeps its name clear of the next node of its column (labelH: the measured height of each node's name, gap: the room between them).
 * A name under a tile (relation) takes [y, y + h + gap + name]; a name above a bar (weighted) [y - name, y + h]; a name beside the last column's bar is centred on it.
 * Nodes that would overlap are moved down in their column (their bands follow: offsets are inside the node); the drawing grows to hold the lowest name.
 */
export function spaceLabels(p, labelH, gap = 0) {
  if (!labelH || !Object.keys(labelH).length) return p;
  const relation = p.mode === 'relation', last = p.columns.length - 1, nodes = p.nodes.map(n => ({ ...n }));
  const extent = n => {
    const lh = labelH[n.id] || 0;
    if (!lh || n.inside) return [n.y, n.y + n.h];
    if (relation) return [n.y, n.y + n.h + gap + lh];
    if (n.col === last || (p.sideLabels && n.col === 0)) { const c = n.y + n.h / 2; return [Math.min(n.y, c - lh / 2), Math.max(n.y + n.h, c + lh / 2)]; }
    return [n.y - lh, n.y + n.h];
  };
  let bottom = p.height;
  for (const col of new Set(nodes.map(n => n.col))) {
    let floor = -Infinity;
    for (const n of nodes.filter(m => m.col === col && !m.hidden && m.h > 0).sort((a, b) => a.y - b.y)) {
      const [top] = extent(n);
      if (top < floor) n.y += floor - top;
      const [, end] = extent(n);
      floor = end + gap; bottom = Math.max(bottom, end);
    }
  }
  return { ...p, nodes, height: Math.ceil(bottom) };
}

function denorm(p) {
  if (!p.norm) return p;
  const H = Math.round(p.width * (p.aspect || .3)), px = v => v * H;
  return { ...p, norm: false, scaled: true, height: H, nodes: p.nodes.map(n => ({ ...n, y: px(n.y), h: px(n.h) })), links: p.links.map(l => ({ ...l, fromOffset: px(l.fromOffset), toOffset: px(l.toOffset), size: px(l.size) })) };
}

const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const linkId = l => l.from + '>' + l.to;

/** The drawing between two laid-out drawings: every tile, band end, name and figure moves on the same eased step, so nothing lags; both ends of a band and both its
 *  tiles move together, so a band always meets its tiles. A node or band that did not exist grows from nothing at its place. */
function blend(a, b, t) {
  t = easeInOut(Math.max(0, Math.min(1, t)));
  const A = Object.fromEntries(a.nodes.map(n => [n.id, n])), L = Object.fromEntries(a.links.map(l => [linkId(l), l]));
  const mix = (u, v) => u + (v - u) * t;
  const nodes = b.nodes.map(n => { const had = A[n.id], o0 = had || { y: n.y + n.h / 2, h: 0, ly: n.ly }; return { ...n, y: mix(o0.y, n.y), h: mix(o0.h, n.h), ly: mix(o0.ly ?? n.ly, n.ly), prog: !had || had.h < 1 ? t : 1 }; }); /* prog: how far a node that is appearing has grown */
  const now = Object.fromEntries(nodes.map(n => [n.id, n])), next = Object.fromEntries(b.nodes.map(n => [n.id, n]));
  return {
    ...b,
    nodes,
    links: b.links.map(l => {
      const pl = L[linkId(l)], An = next[l.from], Bn = next[l.to], ap = A[l.from] || An, bp = A[l.to] || Bn;
      const c0n = An.y + l.fromOffset, c1n = Bn.y + l.toOffset, c0p = pl ? ap.y + pl.fromOffset : c0n + l.size / 2, c1p = pl ? bp.y + pl.toOffset : c1n + (l.size1 ?? l.size) / 2;
      return { ...l, fromOffset: mix(c0p, c0n) - now[l.from].y, toOffset: mix(c1p, c1n) - now[l.to].y, size: mix(pl ? pl.size : 0, l.size), size1: mix(pl ? pl.size1 ?? pl.size : 0, l.size1 ?? l.size) };
    }),
  };
}

/** How far two laid-out drawings are apart (px): the largest move of any tile, band end or name */
function moved(a, b) {
  if (!a || a.width !== b.width || a.nodes.length !== b.nodes.length || a.links.length !== b.links.length) return Infinity;
  let d = 0;
  a.nodes.forEach((n, i) => { const m = b.nodes[i]; d = m.id !== n.id || !!m.hidden !== !!n.hidden ? Infinity : Math.max(d, Math.abs(n.y - m.y), Math.abs(n.h - m.h), Math.abs((n.ly ?? 0) - (m.ly ?? 0))); });
  a.links.forEach((l, i) => { const m = b.links[i]; d = linkId(m) !== linkId(l) || !!m.hidden !== !!l.hidden ? Infinity : Math.max(d, Math.abs(l.fromOffset - m.fromOffset), Math.abs(l.toOffset - m.toOffset), Math.abs(l.size - m.size)); });
  return d;
}

/** Columns for a narrower width: the room for the last column's labels (room) stays, the rest scales */
function fit(p, w, room, minGap) {
  const lastX = p.columns[p.columns.length - 1];
  if (!(w > 0) || (w >= lastX + room && !p.stretch)) return p; /* stretch: the graph fills the room it has instead of stopping at its nominal width */
  const step = Math.min(...p.columns.slice(1).map((c, i) => c - p.columns[i]));
  const k = Math.max(minGap / Math.max(1, step), Math.max(0, w - room) / Math.max(1, lastX));
  return { ...p, width: Math.round(Math.max(0, w - room) + (p.width - lastX)), columns: p.columns.map(c => Math.round(c * k)) };
}

export const hook = 'data-flow';

/** The share of a band in what leaves its source and in what reaches its target (by size: sizes are what the bands are drawn in proportion to) */
export function shares(p, i) {
  const l = p.links[i], live = p.links.filter(x => !x.hidden), amt = x => x.amount ?? x.size ?? 0, sum = list => list.reduce((t, x) => t + amt(x), 0);
  const out = sum(live.filter(x => x.from === l.from)), inn = sum(live.filter(x => x.to === l.to));
  return { source: out ? amt(l) / out : 0, target: inn ? amt(l) / inn : 0 };
}

/** How a node's flow stands, by state: the share of its bands (those that leave it, else those that reach it) in each state, worst first */
export function stateShares(p, id) {
  const live = p.links.filter(l => !l.hidden), own = live.filter(l => l.from === id), list = own.length ? own : live.filter(l => l.to === id), total = list.reduce((t, l) => t + (l.amount ?? l.size ?? 0), 0);
  const by = {};
  for (const l of list) by[l.state || 'ok'] = (by[l.state || 'ok'] || 0) + (l.amount ?? l.size ?? 0);
  return Object.entries(by).sort((a, b) => (WORST[b[0]] || 0) - (WORST[a[0]] || 0)).map(([state, size]) => ({ state, share: total ? size / total : 0 }));
}

const KIND = { ok: 'ok', warn: 'warn', fail: 'error', idle: 'idle', busy: 'busy' };
const reasonsText = list => (list || []).map(r => `${r.label} ${r.count}`).join(' · ');

/** The reading of a node or a band, as markup on the chart reading's face: the name, the value, the shares, the states and why */
export function readingOf(p, target) {
  const word = st => p.stateLabels?.[st] ?? t('graph.state.' + st); /* the page's words for the states, else the kit's */
  const name = id => { const n = p.nodes.find(m => m.id === id); return n?.label || n?.short || id; };
  const row = (label, value) => `<div class="r"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const state = (st, text) => `<div class="fl-tip-s">${statusIcon({ kind: KIND[st] || 'unknown', text }).s}</div>`;
  if (target.link !== undefined) {
    const l = p.links[target.link]; if (!l || l.hidden) return '';
    const sh = shares(p, target.link), tip = l.tip || {}, why = reasonsText(l.reasons);
    return `<div class="fl-tip-t">${esc(tip.title ?? `${name(l.from)} → ${name(l.to)}`)}</div>${l.value || tip.kind ? `<div class="fl-tip-k">${esc(l.value || tip.kind)}</div>` : ''}`
      + row(t('graph.ofSource', { name: name(l.from) }), formatPercent(sh.source)) + row(t('graph.ofTarget', { name: name(l.to) }), formatPercent(sh.target))
      + ((l.state && l.state !== 'ok') || why || tip.text ? state(l.state || 'ok', why || tip.text || word(l.state || 'ok')) : '') + (tip.time ? `<div class="fl-tip-k">${esc(tip.time)}</div>` : '');
  }
  const n = p.nodes.find(m => m.id === target.node); if (!n || n.hidden) return '';
  const tip = n.tip || {}, value = n.value ?? n.sub;
  /* a node that stands for others (a summary, a fold) lists them as rows, name and amount, ten at most and then how many more */
  if (n.summary || n.folded) {
    const list = n.reasons || [], more = n.members ?? 0, shown = list.slice(0, 10);
    return `<div class="fl-tip-t">${esc(n.label ?? n.id)}</div>${value ? `<div class="fl-tip-k">${esc(value)}</div>` : ''}<div class="fl-tip-list">${shown.map(r => row(r.label, r.count === '' ? '' : Number(r.count).toLocaleString())).join('')}</div>`
      + (list.length > 10 ? `<div class="fl-tip-k">${esc(list[10].label)}</div>` : more > shown.length && p.fold?.more ? `<div class="fl-tip-k">${esc(fill(p.fold.more, 0, more - shown.length))}</div>` : '');
  }
  const why = reasonsText(n.reasons);
  return `<div class="fl-tip-t">${esc(tip.title ?? n.label ?? n.id)}</div>${value || tip.kind ? `<div class="fl-tip-k">${esc([value, tip.kind].filter(Boolean).join(' · '))}</div>` : ''}`
    + stateShares(p, n.id).map(x => row(word(x.state), formatPercent(x.share))).join('')
    + (why || tip.text ? state(n.state || 'ok', why || tip.text) : '') + (tip.time ? `<div class="fl-tip-k">${esc(tip.time)}</div>` : '');
}

export function attach(root) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  if (!win.ResizeObserver) return;
  const controller = new win.AbortController(), options = { signal: controller.signal };
  /* the names are measured as drawn (they wrap in the room they have): their heights, their drawn widths, and their least widths (the longest word, as words are
     never broken, read with the name set to its least width for the reading). The drawing is laid out again with them, at once, until they hold */
  const names = el => [...el.querySelectorAll('.fl-label[data-node]:not(.inside)')];
  const heights = el => Object.fromEntries(names(el).map(l => [l.dataset.node, Math.ceil(l.offsetHeight)]));
  const drawnWidths = el => Object.fromEntries(names(el).map(l => [l.dataset.node, Math.ceil(l.getBoundingClientRect().width)]));
  const widths = el => Object.fromEntries(names(el).map(l => {
    const w = l.style.width, m = l.style.maxWidth; l.style.width = 'min-content'; l.style.maxWidth = 'none';
    const v = Math.ceil(l.getBoundingClientRect().width); l.style.width = w; l.style.maxWidth = m; return [l.dataset.node, v];
  }));
  /* each name on one line: its width and height (a name that a band would cross on one line wraps to two in the room the bands leave it) */
  const oneLine = el => { const fw = {}, fh = {}, fp = {}, range = doc.createRange(); for (const l of names(el)) {
    const w = l.style.width, m = l.style.maxWidth; l.style.width = 'max-content'; l.style.maxWidth = 'none';
    const r = l.getBoundingClientRect(); fw[l.dataset.node] = Math.ceil(r.width); fh[l.dataset.node] = Math.ceil(r.height);
    /* the pieces a name breaks into (its words, split after a hyphen) and the space before each: as drawn */
    const walk = doc.createTreeWalker(l.querySelector('b') || l, win.NodeFilter.SHOW_TEXT), list = []; let sp = 0;
    for (let t = walk.nextNode(); t; t = walk.nextNode()) { range.selectNodeContents(t); const tw = range.getBoundingClientRect().width; if (!t.data.trim()) sp += tw; else { list.push([Math.ceil(tw * 10) / 10, Math.ceil(sp * 10) / 10]); sp = 0; } }
    fp[l.dataset.node] = list; l.style.width = w; l.style.maxWidth = m; } return { fw, fh, fp }; };
  const same = (a, b) => !!a && !!b && Object.keys(b).every(k => Math.abs((a[k] || 0) - b[k]) < 1) && Object.keys(a).length === Object.keys(b).length; /* nothing measured yet (null) is never the same */
  /* what decides the order of a drawing: its nodes, their columns and which are shown. While it stays, a new value never reorders the nodes */
  const structure = p => JSON.stringify([p.nodes.map(n => [n.id, n.col, !!n.hidden, n.state]), p.links.map(l => [l.from, l.to, !!l.hidden])]);
  const draw = (el, raw) => {
    let laid = layout(raw);
    morph(el, inner(laid));
    for (let i = 0; i < 4; i++) {
      const w = widths(el), h = heights(el), dw = drawnWidths(el), one = oneLine(el);
      if (same(raw.labelW, w) && same(raw.labelH, h) && same(raw.labelDW, dw) && same(raw.labelFW, one.fw)) break;
      raw.labelW = el._labelW = w; raw.labelH = el._labelH = h; raw.labelDW = el._labelDW = dw; raw.labelFW = el._labelFW = one.fw; raw.labelFH = el._labelFH = one.fh; raw.labelFP = el._labelFP = one.fp;
      laid = layout(raw); morph(el, inner(laid));
    }
    el._cur = laid; el._order = laid.order; el._shape = structure(raw); el._view = laid.view;
  };
  const refit = host => {
      const el = host.querySelector('.flow[data-flow]'); if (!el) return;
      const hostStyle = getComputedStyle(host), p = JSON.parse(el.dataset.flow), w = Math.floor(host.clientWidth - parseFloat(hostStyle.paddingLeft) - parseFloat(hostStyle.paddingRight));
      const key = w + el.dataset.flow;
      if (fitted.get(el) === key) return;
      if (fitted.has(el)) el.classList.add('settled');
      fitted.set(el, key);
      // room for the last column's labels: measured once on the nominal layout
      if (!rooms.has(el)) rooms.set(el, p.mode === 'relation' ? p.width - p.columns[p.columns.length - 1] : Math.max(0, ...[...el.querySelectorAll('.fl-label.end')].map(l => l.offsetLeft + l.offsetWidth)) - p.columns[p.columns.length - 1]); // relation: the room is the tile and half a label
      const cs = getComputedStyle(el), minGap = parseFloat(cs.getPropertyValue('--fl-col-min'));
      const tok = name => parseFloat(cs.getPropertyValue(name));
      const withTokens = p.mode === 'relation' ? { ...p, gap: p.gap ?? tok('--fl-tile-gap'), radii: p.radii ?? { outer: tok('--fl-tile-r-outer'), inner: tok('--fl-tile-r-inner') }, bandR: p.bandR ?? tok('--fl-band-r'), forkU: p.forkU ?? tok('--fl-fork-u'), washLead: p.washLead ?? tok('--fl-wash-lead'), washTrail: p.washTrail ?? tok('--fl-wash-trailw'), washSpeed: p.washSpeed ?? tok('--fl-wash-speed'), tileMin: p.tileMin ?? tok('--fl-tile-min'), tileSpace: p.tileSpace ?? tok('--fl-tile-space'), bandMin: p.bandMin ?? tok('--fl-band-min'), endGap: p.endGap ?? tok('--fl-end-gap'), labelWrap: p.labelWrap ?? tok('--fl-label-wrap'), thinBand: p.thinBand ?? tok('--fl-thin-band') } : { ...p };
      withTokens.labelGap = p.labelGap ?? tok('--fl-label-gap'); withTokens.labelApart = p.labelApart ?? tok('--fl-label-apart');
      el._gid ||= (p.gid || idOf(p)) + '-' + (++drawings); /* a number of its own: two drawings on one page never share an id */
      withTokens.gid = el._gid;
      const raw = denorm(fit(withTokens, w, rooms.get(el), minGap)), prev = el._cur;
      if (el._w === w) { raw.labelH = el._labelH; raw.labelDW = el._labelDW; } /* names keep their sizes while the width stays: a new value moves no name */
      if (el._labelW) { raw.labelW = el._labelW; raw.labelFW = el._labelFW; raw.labelFH = el._labelFH; raw.labelFP = el._labelFP; }
      if (el._order && el._shape === structure(raw)) raw.keepOrder = el._order;
      if (el._view) raw.lastView = el._view; /* the view drawn before: a drawing in focus goes back to whole only with a margin */
      el._w = w;
      win.cancelAnimationFrame(el._raf);
      const ms = name => { const v = cs.getPropertyValue(name).trim(); return parseFloat(v) * (v.endsWith('ms') ? 1 : 1000); };
      const next = layout(raw), shift = moved(prev, next); el._view = next.view;
      /* shapes are tweened only when they moved enough to see and someone can see it: a value that moves nothing by half a pixel keeps the drawing where it is
         (only the words change), and a graph out of view, a hidden document and reduced motion get the new drawing in one step */
      const unseen = doc.hidden || el.classList.contains('is-offscreen') || win.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (shift < .5) { const keep = { ...next, nodes: next.nodes.map((n, i) => ({ ...n, y: prev.nodes[i].y, h: prev.nodes[i].h, ly: prev.nodes[i].ly })), links: next.links.map((l, i) => ({ ...l, fromOffset: prev.links[i].fromOffset, toOffset: prev.links[i].toOffset, size: prev.links[i].size, size1: prev.links[i].size1 })) };
        el._cur = keep; morph(el, inner(keep)); }
      else if (p.mode === 'relation' && prev && prev.width === next.width && !unseen) {
        const base = ms('--dur-flow-tween'), t0 = win.performance.now();
        const frame = now => {
          const t = (now - t0) / base;
          if (t >= 1) { draw(el, raw); return; }
          el._cur = blend(prev, next, t); morph(el, inner(el._cur)); el._raf = win.requestAnimationFrame(frame);
        };
        el._raf = win.requestAnimationFrame(frame);
      } else draw(el, raw);
      el.classList.add('fitted');
  };
  /* declared before anything that can run them (the first scan draws and may close a reading) */
  let readingTip, readingOf_ = null, readingEl = null;
  const closeReading = () => { readingTip?.remove(); readingTip = null; readingOf_ = null; readingEl = null; };
  /* the reading lives on the page's body: it goes with the graph (a redraw that removes what it stands for, the window losing the pointer or the focus) */
  const orphan = () => { if (readingTip && !readingEl?.isConnected) closeReading(); };
  const visibility = win.IntersectionObserver ? new win.IntersectionObserver(entries => entries.forEach(e => e.target.classList.toggle('is-offscreen', !e.isIntersecting))) : null;
  /* a size change is drawn once per frame, however many come in it */
  const due = new Set(); let dueRaf = 0;
  const ro = new win.ResizeObserver(entries => { entries.forEach(e => due.add(e.target)); if (!dueRaf) dueRaf = win.requestAnimationFrame(() => { dueRaf = 0; const hosts = [...due]; due.clear(); hosts.forEach(refit); }); });
  const seen = new Set(), fitted = new WeakMap(), rooms = new WeakMap();
  let drawings = 0;
  // the host's width is the room the graph has (the graph itself is capped at its nominal width)
  const scan = () => {
    for (const host of seen) if (!root.contains(host)) { ro.unobserve(host); visibility?.unobserve(host.querySelector('.flow')); seen.delete(host); }
    root.querySelectorAll('.flow-host').forEach(host => { if (!seen.has(host)) { seen.add(host); ro.observe(host); visibility?.observe(host.querySelector('.flow')); } refit(host); });
  };
  scan();
  doc.fonts?.ready?.then(() => root.querySelectorAll('.flow[data-flow]').forEach(el => { fitted.delete(el); el._labelH = null; el._labelW = null; el._labelDW = null; el._w = null; refit(el.closest('.flow-host')); })); /* names measured before the font arrived are measured again */
  const mutations = new win.MutationObserver(() => { scan(); orphan(); });
  win.addEventListener('blur', () => closeReading(), options);
  doc.documentElement.addEventListener('pointerleave', () => closeReading(), options);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) closeReading(); }, options);
  mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-flow'] });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') closeReading(); }, options);
  const highlight = (hit, on) => {
    const flow = hit.closest('.flow'), p = JSON.parse(flow.dataset.flow), id = hit.dataset.node;
    flow.querySelectorAll('[data-node]').forEach(el => el.classList.toggle('is-related', on && el.dataset.node === id));
    flow.querySelectorAll('[data-link]').forEach(el => { const l = p.links[Number(el.dataset.link)]; el.classList.toggle('is-related', on && (l.from === id || l.to === id)); });
  };
  /* the reading of a node or a band, shown as a chart's reading: its name, its value, its share of where it leaves and where it arrives, its states and why (readingOf).
     at is the pointer that points at it (client coordinates), none for the keyboard */
  const showReading = (el, at) => {
    const flow = el.closest('.flow'); if (!flow) return false;
    const p = flow._cur || JSON.parse(flow.dataset.flow), target = el.dataset.link !== undefined ? { link: Number(el.dataset.link) } : { node: el.dataset.node };
    const key = JSON.stringify(target); if (readingOf_ === key && readingTip) { placeReading(at); return true; }
    const markup = readingOf(p, target); closeReading(); if (!markup) return false;
    readingTip = doc.createElement('div'); readingTip.className = 'chart-tip fl-tip'; readingTip.setAttribute('role', 'tooltip'); readingOf_ = key; readingEl = el;
    readingTip.innerHTML = markup;
    doc.body.append(readingTip);
    placeReading(at);
    return true;
  };
  /* a node's reading stands over its tile. A band's stands just above and right of the pointer and follows it along the band (its box spans the whole curve:
     its top is far from a long diagonal band); for the keyboard, over the band's own centre: the middle of its centre line, halfway between the control points
     of its two edges (both band shapes are two cubics through the middle x) */
  const placeReading = at => {
    const el = readingEl; if (!readingTip || !el) return;
    let pos;
    if (el.dataset.node) pos = place(readingTip, (el.closest('.flow').querySelector(`:is(.fl-tile, .fl-glass, .fl-node)[data-node="${win.CSS.escape(el.dataset.node)}"]`) ?? el).getBoundingClientRect(), { side: 'top', align: 'center', sideOffset: 6 });
    else if (at) pos = place(readingTip, new win.DOMRect(at.x, at.y, 0, 0), { side: 'top', align: 'start', sideOffset: 8, alignOffset: 8 });
    else {
      const c = [...el.getAttribute('d').matchAll(/C\s*([-\d.e]+)[ ,]([-\d.e]+)\s+([-\d.e]+)[ ,]([-\d.e]+)/g)].map(m => m.slice(1).map(Number)), ctm = el.getScreenCTM();
      const mid = c.length === 2 && ctm ? new win.DOMPoint(c[0][0], (c[0][1] + c[0][3] + c[1][1] + c[1][3]) / 4).matrixTransform(ctm) : null;
      pos = place(readingTip, mid ? new win.DOMRect(mid.x, mid.y, 0, 0) : el.getBoundingClientRect(), { side: 'top', align: 'center', sideOffset: 6 });
    }
    /* kept inside the card the graph is drawn in: pushed back in from its sides */
    const card = (el.closest('.sbar, .card, .flow-host') ?? el).getBoundingClientRect(), w = readingTip.offsetWidth;
    readingTip.style.left = Math.max(4, Math.min(win.innerWidth - w - 4, Math.max(card.left, Math.min(card.right - w, pos.x)))) + 'px'; readingTip.style.top = Math.max(4, Math.min(win.innerHeight - readingTip.offsetHeight - 4, pos.y)) + 'px'; /* and inside the window */
  };
  const READABLE = '.fl-bhit[data-link], .flow:not(.relation) .fl-band[data-link], .fl-hit[data-node], .fl-tile[data-node], .fl-node[data-node], .fl-label[data-node]';
  for (const [event, on] of [['pointerover', true], ['pointerout', false], ['focusin', true], ['focusout', false]]) root.addEventListener(event, e => {
    const el = e.target.closest?.(READABLE);
    if (!el || !el.closest('.flow')) return;
    if (!on && e.relatedTarget && el.contains(e.relatedTarget)) return;
    const hit = el.closest('.fl-hit');
    if (hit) highlight(hit, on);
    if (event === 'focusin' && hit) hit.closest('.flow').querySelector(`.fl-label[data-node="${win.CSS.escape(hit.dataset.node)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (on) showReading(el, event === 'pointerover' ? { x: e.clientX, y: e.clientY } : null); else closeReading();
  }, options);
  /* a band's reading follows the pointer while it stays on that band: the same reading moves, it is not opened again */
  root.addEventListener('pointermove', e => { if (readingTip && readingEl?.dataset.link !== undefined && e.target.closest?.(READABLE) === readingEl) placeReading({ x: e.clientX, y: e.clientY }); }, options);
  root.addEventListener('keydown', e => {
    if (!e.target.matches?.('.fl-hit') || !['Enter', ' '].includes(e.key)) return;
    e.preventDefault(); e.target.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }, options);
  const detach = () => { closeReading(); controller.abort(); win.cancelAnimationFrame(dueRaf); root.querySelectorAll('.flow').forEach(el => win.cancelAnimationFrame(el._raf)); ro.disconnect(); visibility?.disconnect(); mutations.disconnect(); seen.clear(); };
  win.addEventListener('pagehide', detach, { once: true, ...options });
  return detach;
}
