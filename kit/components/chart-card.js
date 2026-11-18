/*
 * Chart card (shadcn charts look): title 14/500, big value (display 24/450), badge beside the title and wrapping series controls below, SVG chart below.
 * Kinds line / area / bar. Drawing happens in attach (it needs the measured width). Hover shows a vertical rule and a value popover.
 * First draw grows from the bottom (600ms). quality:drawing (a data chart, not an icon).
 * Temporal charts (timeAxis) paint their series with a lazily loaded ECharts instance (see kit/core/temporal-chart.js) mounted under the SVG layer;
 * the SVG keeps axes, grid, crosshair, tooltip and pointer/keyboard, and draws the series itself only until the engine is ready or if it fails.
 * Time charts (timeAxis):
 *   marks: without timeAxis.ticks (or once zoomed) the axis has majors at day boundaries named by the date with its year (2026-11-09, a rule across the plot) and minors
 *     named by the time of day, as dense as the width allows (core/time-axis.js); timeAxis.timeZone ('system' | 'utc' | IANA) is the zone they and the reading are in.
 *     The reading under the pointer names its moment in full, to the second (2026-11-09 14:02:05).
 *   chart.interactive: 'full' | 'none' (default 'none' for a widget, 'full' otherwise; the large view (chart-layer) is always 'full'): 'none' keeps the
 *     reading under the pointer but takes no drag or double click.
 *   window ('full'; kit/CONTRACTS.md, Charts): a drag anywhere on the plot marks a span (a band with its start and end times) and zooms to it, rounded out to the
 *     axis step; a double click zooms out to twice the window around its middle. The wheel always scrolls the page; nothing pans.
 *   axes ('full'): a drag along the time marks stretches the window around its middle (right narrower, left wider; told as source 'scale', or 'zoomout' past the data),
 *     a drag along the value scale stretches the values from their low end (up narrower, down wider; the chart's own, nothing told); a double click on an axis takes it back.
 *     While held the axis's range is read out in the plot. Keyboard on the focused chart: - and + the window, Shift+Up/Down the values, 0 both back.
 *     chart.range { from, to }: the window the page wants (charts kept in step); chart.rangeAction: told { id: chart.id, from, to, source: 'select'|'zoomout'|'scale' };
 *     chart.zoomAction (older, without rangeAction): told { from, to }, the page owns the window.
 *   values (chart.ticks and chart.max are optional unless yScale is 'page'): chart.yScale 'auto' (default for a time chart: fitted at both ends with ~10% room, 0 only for % or data near 0, round steps in the unit read,
 *     as many as the plot's height allows; core/value-axis.js) | 'page'.
 *   zone: timeAxis.timeZone, else the page's kit.timeZone (data-time-zone on the document).
 *   height: never a thin strip, the height follows the width (--chart-aspect, between --chart-h-min and --chart-h-max; chart.height raises it within that band, never past --chart-h-max); chart.aspect false keeps chart.height.
 *   events: in full (a rule and a numbered dot) from --chart-events-full wide, as one row of small dots at the foot of the plot below that, none under --chart-events-min.
 * static (opt-in): a still picture of the same chart for a report or print: no frame, no hover, reading, drag, zoom, info or expand, the axes always shown and nothing
 *   animating; the axes, the year-bearing first time, the line and area, the levels and their names, the legend and the tokens are those of the screen. Default output is unchanged.
 * legend: a widget without p.legend (false: none) that has more than one line or a named level (chart.refs) gets one: its lines with their colour mark, its levels as dashed rules
 *   (other cards show the legend the page gives: their pages decide when a legend would only repeat the title).
 */
import { html, attrs, esc } from '../core/html.js';
import { morph } from '../core/morph.js';
import { icon } from '../icons/icons.js';
import * as emptyState from './empty-state.js';
import * as button from './button.js';
import * as skeleton from './skeleton.js';
import * as codeBlock from './code-block.js';
import { t } from '../core/i18n.js';
import { place as placeLayer, lift, drop } from '../core/position.js';
import { EDGE } from './menu.js';
import { loadEcharts, temporalSegments, seriesDash, resolveTokenColor, buildTemporalOption, paintTemporal, disposeTemporal } from '../core/temporal-chart.js';
import { ticks as timeTicks, reading as timeReading, pan as panRange, whole as wholeRange, snap as snapRange, short as shortTime } from '../core/time-axis.js';
import { scale as valueScale, span as valueSpan, formatValue } from '../core/value-axis.js';

export const name = 'chart-card';

export const css = `
.card { border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--surface-secondary); padding: var(--space-3); min-width: 0; }
.card.bleed { margin-inline: var(--page-group-inset, calc(-1 * var(--space-3_5))); } /* the same inset as the settings groups: both line up with the page's content line */
.card.chart-aligned { display: grid; grid-row: span 3; grid-template-rows: subgrid; row-gap: 0; }
.card.chart-aligned > .chart { grid-row: 3; }
:root[data-theme="light"] .card { background: var(--surface-secondary); box-shadow: 0 0 0 var(--line) var(--border), var(--shadow-xs); }
.card-h { display: flex; align-items: baseline; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
.card-t { font-size: var(--text-sm); font-weight: var(--weight-medium); }
.card-big { font-family: var(--font-native); font-size: var(--text-2xl); line-height: var(--leading-2xl); font-weight: var(--weight-display); font-variant-numeric: tabular-nums; margin-top: var(--space-1); }
.card.widget, :root[data-theme="light"] .card.widget { background: none; border: 0; border-radius: 0; box-shadow: none; } .card.widget { padding: 0; } /* the same room in both themes (a compact widget takes its own, below) */
.card.widget .card-h { position: relative; z-index: calc(var(--z-sticky) + 1); /* over the open button: the legend's popup can cover it */ margin-bottom: var(--space-2); align-items: center; padding-inline: var(--widget-head-inset); } /* the head keeps the same inset on both sides of the plate */
/* a widget's legend sits in its head, at the end of the value row, as dots with the names: it belongs to this plate, and the plates stay level */
/* the button that opens the card large: in the plate's top-right corner (a zero-height anchor sits where the plate starts), shown while the card is pointed at or holds focus (always where there is no hover) */
.card.widget { position: relative; }
.card.lifted > :not(.card-h) { visibility: hidden; } /* the card is the open layer while it is open: its plate is the layer's, and its words fade out with the layer fading in over them */
.card-h { transition: opacity var(--dur-fast) var(--ease-standard); }
.card.lifted .card-h { opacity: 0; }
.card-expand-anchor { position: relative; height: 0; z-index: var(--z-sticky); }
.card-expand { position: absolute; inset-block-start: var(--widget-expand-inset); inset-inline-end: var(--widget-expand-inset); display: grid; place-items: center; width: var(--control-h-sm); height: var(--control-h-sm); border-radius: var(--r-control); corner-shape: var(--corner); color: var(--muted-foreground); opacity: 0; transition: opacity var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.card:hover .card-expand, .card-expand:focus-visible { opacity: 1; }
.card-expand:hover { background: var(--ghost-hover); color: var(--foreground); }
.card-expand:active { opacity: var(--press-opacity); }
.card-expand:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: calc(var(--focus-w) * -1); }
@media (hover: none) { .card-expand { opacity: 1; } }
.card.widget .card-h > :first-child { flex: none; }
.card.widget .card-h > .legend { flex: 1 1 0; align-self: flex-end; flex-wrap: nowrap; margin-inline-start: auto; justify-content: flex-end; gap: var(--space-1) var(--space-3); font-size: var(--text-native-sm); font-weight: var(--weight-medium); }
.card.widget .legend > * { flex: none; white-space: nowrap; }
.card.widget .card-h > .legend:not(.fitted) { visibility: hidden; }
.card.widget .card-h > .legend { flex: 1 0 100%; align-self: auto; margin-inline-start: 0; justify-content: flex-start; } /* every head is the same: the name, the value, then the legend on its own line under the value */
.card.widget .card-h > .legend.wraps { flex-wrap: wrap; row-gap: var(--space-0_5); } /* the legend shows once it has been fitted to its room: never as the one long row of every entry */
.card.widget .legend [hidden] { display: none; }
/* what the legend has no room for is behind "+N": pointing at it (or focusing it) opens the rest, each as the same press-to-hide entry the legend has */
.card.widget .legend .legend-more { position: relative; color: var(--muted-foreground); font-variant-numeric: tabular-nums; border-radius: var(--r-mark); cursor: default; }
.card.widget .legend .legend-more:hover, .card.widget .legend .legend-more:focus-within { color: var(--foreground); }
.card.widget .legend .legend-more:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-0_5); }
.legend-pop { display: none; width: max-content; position: absolute; inset-block-end: 100%; inset-inline-end: 0; z-index: var(--z-sticky); padding-block-end: var(--space-1); }
.legend-more[data-side="down"] .legend-pop { inset-block: 100% auto; padding-block: var(--space-1) 0; } /* up is the way to the graph's own room being kept clear; down only where there is no room above */
.legend-more:is(:hover, :focus-within) .legend-pop { display: block; }
.legend-pop-in { display: grid; gap: var(--space-0_5); padding: var(--space-2) var(--space-3); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--float-solid); -webkit-backdrop-filter: var(--float-filter); backdrop-filter: var(--float-filter); box-shadow: var(--float-edge), var(--float-shadow); max-height: var(--legend-pop-max); overflow-y: auto; }
.card.widget .legend-pop-in button { display: flex; align-items: center; justify-content: flex-start; gap: var(--space-2); white-space: nowrap; color: var(--foreground); }
.card.widget .legend-pop-in button i { flex: none; margin-right: 0; }
.card.widget .legend-pop-in button[aria-pressed="false"] { color: var(--muted-foreground); }
.card.widget .legend i, .card.widget .legend i.series-dash, .card.widget .legend i.series-dot { width: var(--space-2); height: var(--space-2); border: 0; border-radius: var(--r-pill); margin-right: var(--space-1_5); background: currentColor; }
.card.widget .card-t { font-size: var(--text-native-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); }
.card.widget.compact .card-big, .card.widget.compact.emphasis .card-big { font-size: var(--widget-value-size); line-height: var(--widget-value-leading); font-weight: var(--weight-reading); } /* the reading: big and bold */
.card.widget .card-h > div:first-child { flex-direction: column; align-items: flex-start; gap: var(--space-1); }
.chart-state { display: grid; place-items: center; position: relative; overflow: hidden; background-image: repeating-linear-gradient(to bottom, transparent 0 calc(var(--chart-state-step) - var(--line)), var(--border) calc(var(--chart-state-step) - var(--line)) var(--chart-state-step)); }
.chart-state .empty { padding: var(--space-4); }
.chart-state[data-state="error"] .empty-ico { color: var(--destructive); }
.chart-state-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); }
.chart-state[data-state="loading"]::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to right, transparent, color-mix(in oklab, var(--foreground) var(--chart-sweep-mix), transparent), transparent); transform: translateX(-100%); animation: chart-sweep var(--dur-state-sweep) var(--ease-standard) infinite; }
@keyframes chart-sweep { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .chart-state[data-state="loading"]::after { animation: none; } }
.card.widget .chart { border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--surface-secondary); border: var(--line) solid var(--border-surface); overflow: hidden; transition: background var(--dur-fast) var(--ease-standard); }
.card.widget .chart:hover { background: var(--surface-primary); }
.sbar-body .card, .sfl-sec .card, .qp-detail .card, :root[data-theme="light"] .sbar-body .card, :root[data-theme="light"] .sfl-sec .card, :root[data-theme="light"] .qp-detail .card, .sbar-body .card.widget .chart, .sfl-sec .card.widget .chart, .qp-detail .card.widget .chart, .sbar-body .card.widget .chart:hover, .sfl-sec .card.widget .chart:hover, .qp-detail .card.widget .chart:hover { padding-inline: 0; border: 0; border-radius: 0; background: none; box-shadow: none; } .sbar-body .card.widget .card-h, .sfl-sec .card.widget .card-h, .qp-detail .card.widget .card-h { padding-inline: 0; } /* inside a container the container owns the face: the chart is its content, flat */
.card.widget .chart .axis { opacity: 0; transition: opacity var(--dur-axis) var(--ease-standard); font-size: var(--chart-axis-size); font-weight: var(--chart-axis-weight); fill: color-mix(in oklab, var(--foreground) 78%, transparent); }
.card.widget .chart .axis.xl { font-weight: var(--chart-axis-weight-x); fill: color-mix(in oklab, var(--foreground) 92%, transparent); } /* the times read stronger than the value scale */
.card.widget .chart .evm { transition: transform var(--dur-axis) var(--ease-standard); } /* a change mark's dot moves with the scale and the times as they come in: one reveal */
.card.widget :is(.chart:is(:hover, :focus-visible, .hover, .axes), .card-expand-anchor:hover + .chart) .axis { opacity: 1; } /* values and times show while the pointer is on the plate */
.card.widget :is(.chart:is(:hover, :focus-visible, .hover, .axes), .card-expand-anchor:hover + .chart) .evm { transform: translate(var(--ev-dx), var(--ev-dy)); }
.card.widget .chart .gridl { stroke-opacity: .6; }
.card.widget .chart .axis.limit-label { fill: var(--chart-limit); paint-order: stroke; stroke: var(--surface-secondary); stroke-width: var(--space-1); stroke-linejoin: round; } /* a halo of the plate's ground: an event rule crossing the name does not cut it */ .card.widget .chart .axis.dodged.limit-label, .card.widget :is(.chart:is(:hover, :focus-visible, .hover, .axes), .card-expand-anchor:hover + .chart) .axis.dodged.limit-label { opacity: 0; } /* a level's name under the reading steps aside */ /* the limit's name takes the limit line's colour */
.card.widget .chart :is(.ln, [data-key^="area"]) { transition: d var(--dur-plot) var(--ease-out-expo); }
.card.widget .chart :is(.ln, .gridl, .avgl, .evl) { vector-effect: non-scaling-stroke; }
.chart .slide.run { animation: chart-slide var(--slide-ms) var(--ease-slide) both; } /* a new reading moves the drawing one step, quickly and then it rests: the line goes from where the last point was to where the new one is */
@keyframes chart-slide { from { transform: translateX(var(--slide)); } }
@media (prefers-reduced-motion: reduce) { .chart .slide.run { animation: none; } }
.card.widget .chart .chart-engine { transform-origin: 0 0; transition: transform var(--dur-plot) var(--ease-out-expo); } /* the engine's drawing shrinks with the svg one, to the same place */
.card.widget :is(.chart:is(:hover, .hover, .axes), .card-expand-anchor:hover + .chart) .chart-engine { transform: translate(var(--tx), var(--ty)) scale(var(--sx), var(--sy)); }
.card.widget .chart :is([data-series], .gridl, .avgl, .evl) { transform-box: view-box; transform-origin: 0 0; transition: transform var(--dur-plot) var(--ease-out-expo); }
.card.widget :is(.chart:is(:hover, .hover, .axes), .card-expand-anchor:hover + .chart) :is([data-series], .gridl, .avgl, .evl) { transform: translate(var(--tx), var(--ty)) scale(var(--sx), var(--sy)); }
.chart .xtick { stroke: var(--muted-foreground); stroke-opacity: .6; opacity: 0; transition: opacity var(--dur-axis) var(--ease-standard); }
.card.widget :is(.chart:is(:hover, :focus-visible, .hover, .axes), .card-expand-anchor:hover + .chart) .xtick { opacity: 1; }
.card.widget .chart .ln { stroke-width: var(--chart-line-w-lg); }
.card.compact { padding: var(--space-2); }
.card.compact .card-h { gap: var(--space-1) var(--space-2); margin-bottom: var(--space-2); }
.card.compact .card-h > div:first-child { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-2); min-width: 0; }
.card.compact .card-t, .card.compact .card-big { overflow-wrap: anywhere; min-width: 0; }
.card.compact .card-big { margin-top: 0; font-size: var(--text-lg); line-height: var(--leading-base); }
.card.compact .chart-context { margin-bottom: var(--space-2); }
.card.emphasis .card-h { position: relative; }
.card.emphasis .card-h > div:first-child { display: grid; gap: var(--space-1); }
.card.emphasis .card-h > button { position: absolute; inset-block-start: 0; inset-inline-end: 0; }
.card.emphasis .card-h:has(> button) .card-t { padding-inline-end: var(--space-7); }
.card.emphasis .card-big { font-size: calc(var(--text-2xl) + var(--space-1)); line-height: var(--leading-2xl); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; white-space: nowrap; }
.card.compact.emphasis .card-big { font-size: var(--text-lg); line-height: var(--leading-base); white-space: normal; overflow-wrap: anywhere; }
.card.value-lg .card-big { font-size: var(--text-lg); line-height: var(--leading-base); overflow-wrap: anywhere; }
.card.value-lg.emphasis .card-big { white-space: normal; }
.card.emphasis.accent .card-big { color: var(--series-1); }
.card.emphasis.success .card-big { color: var(--success-content); }
.card.emphasis.warning .card-big { color: var(--warning-content); }
.card.emphasis .pg { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-1) var(--space-2); }
.card.emphasis .pg.ranked { grid-template-columns: minmax(0, 1fr); }
.card.emphasis .pg-label { font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; }
.card.emphasis .prg-inline { display: grid; gap: var(--space-0_5); }
.card.emphasis .prg-inline .prg { width: 100%; }
.card.emphasis .pg.ranked .pg-item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: var(--space-2); }
.card.emphasis .pg.ranked .pg-label { white-space: nowrap; margin: 0; }
.card.emphasis .pg.ranked .prg-inline { grid-template-columns: minmax(0, 1fr) auto; align-items: center; font-size: var(--text-xs); }
.card.emphasis .pg.ranked .prg { grid-column: 1; grid-row: 1; }
.chart-series-swatch { display: inline-block; flex-shrink: 0; width: var(--space-4); height: var(--space-1); vertical-align: middle; }
.legend { display: flex; flex-basis: 100%; flex-wrap: wrap; gap: var(--space-1) var(--space-3); font-size: var(--text-xs); color: var(--muted-foreground); align-items: center; justify-content: flex-start; min-width: 0; white-space: normal; }
.card > .legend { margin-top: var(--space-2); }
.legend > * { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.legend i { display: inline-block; width: var(--legend-w); height: var(--legend-h); border-radius: var(--r-mark); margin-right: var(--space-1_5); vertical-align: middle; }
.legend i.series-dash { height: 0; border-top: var(--line) dashed currentColor; }
.legend i.series-dot { height: 0; border-top: var(--line) dotted currentColor; }
.legend i.dash { height: 0; border-top: var(--line) dashed var(--muted-foreground); background: none; }
.card.widget .legend i.dash { width: var(--space-3); height: 0; border-radius: 0; border-top: var(--line-avg) dashed var(--muted-foreground); background: none; } /* a level in a widget's legend is a short dashed rule in its tone, not a dot */
.legend button { padding: var(--space-1) 0; font: inherit; color: inherit; white-space: normal; background: transparent; border: 0; border-radius: var(--r-mark); transition: color var(--dur-fast) var(--ease-standard); cursor: pointer; }
.legend button:hover { color: var(--foreground); }
.legend button:active { color: var(--muted-foreground); }
.legend button[aria-pressed="false"] { text-decoration: line-through; }
.legend button:focus-visible, .chart:focus-visible { outline: var(--line) solid var(--primary); outline-offset: var(--space-0_5); }
.chart-context { margin-bottom: var(--space-3); font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--muted-foreground); }
.chart { position: relative; }
.chart svg { display: block; width: 100%; overflow: visible; }
.chart-engine { position: absolute; inset-block-start: 0; inset-inline-start: 0; width: 100%; z-index: 0; pointer-events: none; }
.chart:has(> .chart-engine) > svg { position: relative; z-index: 1; }
.chart:has(> .chart-engine) .ref-label { z-index: 2; }
.chart .axis { font-size: var(--text-xs); fill: var(--muted-foreground); font-family: var(--font-sans); }
.chart .gridl { stroke: var(--border); stroke-width: 1; }
.chart .gridl.xgrid { stroke-opacity: var(--chart-xgrid-o); }
.card.widget .chart.holds :is([data-series], .gridl, .avgl, .evl) { transition: none; } /* a chart that holds its reading is in the hover look from its first paint: nothing moves into it */
.chart .grow { transform-box: fill-box; transform-origin: bottom; animation: chart-grow var(--dur-chart) var(--ease-out-expo) both; }
@keyframes chart-grow { from { transform: scaleY(0); } }
.chart .ln { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.chart .xh { stroke: var(--muted-foreground); stroke-opacity: 0; }
.chart.hover .xh { stroke-opacity: .5; }
.chart-tip { position: absolute; pointer-events: none; padding: var(--space-1_5) var(--space-2); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--float-solid); -webkit-backdrop-filter: var(--float-filter); backdrop-filter: var(--float-filter); box-shadow: var(--float-edge), var(--float-shadow); font-size: var(--text-xs); white-space: nowrap; z-index: var(--z-sticky); display: none; } /* the one floating face (--float-*), as a menu and a tooltip */
.chart.hover .chart-tip { display: block; }
.chart .evl { stroke: var(--muted-foreground); stroke-opacity: var(--chart-event-o); stroke-width: var(--line-avg); stroke-dasharray: var(--avg-dash); transition: stroke-opacity var(--dur-fast) var(--ease-standard); }
.chart .evg.on .evl { stroke-opacity: 1; }
.chart .evg.row .evd.many { stroke: var(--background); stroke-width: var(--line-avg); } /* a joined dot of the row: a size larger, ringed */
.chart .gridl.xmajor { stroke-opacity: 1; } .chart .axis.major { font-weight: var(--weight-semibold); } /* a day boundary is a rule and names its date */
.chart .evd { fill: var(--muted-foreground); } .chart .evn { fill: var(--background); font-size: var(--text-2xs); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; pointer-events: none; } /* a joined mark's dot and its number (the change timeline's joined dot) */
.chart .evg[data-tone="danger"] .evd { fill: var(--destructive); } .chart .evg[data-tone="warning"] .evd { fill: var(--warning); } .chart .evg[data-tone="ok"] .evd { fill: var(--success); } .chart .evg[data-tone="run"] .evd { fill: var(--brand-content); }
.chart .evg[data-tone="danger"] .evl, .chart-tip .rv[data-tone="danger"] { stroke: var(--destructive); color: var(--destructive-content); }
.chart .evg[data-tone="warning"] .evl, .chart-tip .rv[data-tone="warning"] { stroke: var(--warning); color: var(--warning-content); }
.chart .evg[data-tone="ok"] .evl, .chart-tip .rv[data-tone="ok"] { stroke: var(--success); color: var(--success-content); }
.chart .evg[data-tone="info"] .evl, .chart-tip .rv[data-tone="info"] { stroke: var(--muted-foreground); color: var(--muted-foreground); }
.chart .evg[data-tone="run"] .evl, .chart-tip .rv[data-tone="run"] { stroke: var(--brand-content); color: var(--brand-content); } /* an event's colour is its state: failing, changing, healthy, in progress (the app's colour); one that only informs is neutral (a series colour is never an event's) */
.chart-tip .rv[data-tone] { color: var(--foreground); } .chart-tip .rv[data-tone]::before { content: ""; display: inline-block; width: var(--space-2); height: var(--space-2); margin-inline-end: var(--space-1_5); border-radius: var(--r-pill); background: var(--chart-rv-tone); vertical-align: middle; }
.chart-tip .rv[data-tone="danger"] { --chart-rv-tone: var(--destructive); } .chart-tip .rv[data-tone="warning"] { --chart-rv-tone: var(--warning); } .chart-tip .rv[data-tone="ok"] { --chart-rv-tone: var(--success); } .chart-tip .rv[data-tone="info"] { --chart-rv-tone: var(--muted-foreground); } .chart-tip .rv[data-tone="run"] { --chart-rv-tone: var(--brand-content); } /* a reading's heading stays in the text colour; its state colours only the mark before it */
.chart.hover.evt-on :is(.xh, .xdot) { opacity: 0; stroke-opacity: 0; } /* the reading is the event's: the line's own crosshair and dots step aside */
.chart .avgl.request { stroke: var(--muted-foreground); stroke-opacity: var(--chart-request-o); }
.card.widget .chart .axis.limit-label.request { fill: var(--muted-foreground); }
.chart .axis.limit-label.level-off { display: none; }
.chart .axis.limit-label { transition: opacity var(--dur-axis) var(--ease-standard); } .chart .axis.limit-label.dodged { opacity: 0; } /* under the reading a name fades rather than moves */ /* no free place beside its line: the legend names the level */
.chart[data-chart] { user-select: none; -webkit-user-select: none; } /* a drag across the plate marks a span, never selects the labels */
.chart-zoom { position: absolute; z-index: var(--z-sticky); pointer-events: none; background: color-mix(in oklab, var(--brand-content) var(--chart-zoom-mix), transparent); border-inline: var(--line-avg) solid var(--brand-content); animation: chart-zoom-in var(--dur-fast) var(--ease-standard) both; }
.chart-zoom::before, .chart-zoom::after { content: ""; position: absolute; inset-block-start: 50%; width: var(--space-1); height: var(--space-4); border-radius: var(--r-pill); background: var(--brand-content); box-shadow: 0 0 0 var(--line) var(--background); transform: translate(-50%, -50%); } /* the edges are handles: what the drag holds */
.chart-zoom::before { inset-inline-start: calc(var(--line-avg) / -2); } .chart-zoom::after { inset-inline-end: calc(var(--line-avg) / -2); transform: translate(50%, -50%); }
.chart-scale { position: absolute; z-index: var(--z-sticky); pointer-events: none; } /* the reading of an axis while it is dragged: the range it now shows */
:is(.chart-zoom, .chart-scale) .cz-t { position: absolute; padding: 0 var(--space-1); border-radius: var(--r-chip); background: var(--float-solid); box-shadow: var(--float-edge); font-size: var(--text-2xs); line-height: var(--leading-xs); font-variant-numeric: tabular-nums; color: var(--foreground); white-space: nowrap; }
.chart-zoom .cz-t.a { inset-block-start: var(--space-1); inset-inline-start: var(--space-1_5); } .chart-zoom .cz-t.b { inset-block-end: var(--space-1); inset-inline-end: var(--space-1_5); } /* where the span starts and ends, while it is marked */
@keyframes chart-zoom-in { from { opacity: 0; } }
.card-info { position: relative; display: inline-flex; vertical-align: middle; margin-inline-start: var(--space-1); }
.card-info-btn { display: grid; place-items: center; width: var(--control-h-xs); height: var(--control-h-xs); border-radius: var(--r-pill); color: var(--muted-foreground); transition: color var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard); }
.card-info-btn:hover, .card-info-btn[aria-expanded="true"] { color: var(--foreground); background: var(--ghost-hover); } .card-info-btn:active { opacity: var(--press-opacity); }
.card-info-btn:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-px); }
.card-info-pop { position: fixed; inset-block-start: 0; inset-inline-start: 0; z-index: var(--z-menu); display: grid; gap: var(--space-2); width: max-content; min-width: var(--pop-w); max-width: min(calc(var(--pop-w) * 2), calc(100vw - var(--space-8))); padding: var(--float-pad) var(--space-3) var(--space-3); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--float-solid); -webkit-backdrop-filter: var(--float-filter); backdrop-filter: var(--float-filter); box-shadow: var(--float-edge), var(--float-shadow); font-size: var(--text-xs); font-weight: var(--weight-regular); color: var(--foreground); text-align: start; white-space: normal; animation: chart-zoom-in var(--motion-enter-dur) var(--motion-enter-ease) both; }
.card-info-pop[hidden] { display: none; } .card-info-pop:focus-visible { outline: none; }
.card-info-pop .cip-t { padding-block-start: var(--space-1); font-weight: var(--weight-semibold); }
.cip-rows { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-1) var(--space-3); margin: 0; } .cip-rows > div { display: contents; }
.cip-rows dt { color: var(--muted-foreground); } .cip-rows dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.card-info-pop .cb { background: transparent; box-shadow: none; border-radius: 0; } .card-info-pop .cb-head { background: transparent; box-shadow: 0 var(--hairline) 0 var(--border-surface-strong); } /* the query lies flat in the panel: the panel owns the face */
@media (prefers-reduced-motion: reduce) { .card-info-pop { animation: none; } }
.chart.selecting :is(.chart-tip, .xh, .xdot, .axis.limit-label) { visibility: hidden; } /* while a span is marked, the reading under the pointer steps aside for the span's own times */
@media (prefers-reduced-motion: reduce) { .chart-zoom { animation: none; } }
.chart:is([data-interactive="full"], :not([data-interactive])) [data-hit] { cursor: crosshair; } /* the plot is where a span is marked */
.chart [data-axis="x"] { cursor: ew-resize; } .chart [data-axis="y"] { cursor: ns-resize; } /* the axes are where the window and the values are stretched */
.chart .avgl { stroke: var(--chart-limit); stroke-opacity: .7; stroke-width: var(--line-avg); stroke-dasharray: var(--avg-dash); }
.cf-top { stop-color: var(--mask-full); stop-opacity: var(--chart-fade-top); } .cf-bottom { stop-color: var(--mask-full); stop-opacity: var(--chart-fade-bottom); }
.chart.hover .chart-tip:has(.rv) { opacity: 1; }
.chart .xh { transition: stroke-opacity var(--dur-axis) var(--ease-standard); }
.chart .xdot { fill: var(--primary); stroke: var(--card-edge, transparent); opacity: 0; transition: opacity var(--dur-fast) var(--ease-standard); pointer-events: none; }
.chart.hover .xdot { opacity: 1; }
.chart.hover .xh { stroke-opacity: .35; }
.chart-tip:has(.rm) { opacity: 0; transition: opacity var(--dur-axis) var(--ease-standard), left var(--dur-fast) var(--ease-standard); padding: 0; background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; text-shadow: var(--fl-val-glow); }
.chart.hover .chart-tip:has(.rm) { opacity: 1; display: grid; grid-template-columns: auto auto auto; column-gap: .5em; row-gap: .15em; align-items: center; }
/* the readings are a grid: a dot, a name and a value per line. The name column is as wide as the longest name and the value column as wide as the longest value (so the space between them follows the text, not a number), and the time starts under the first letter of the names */
.chart-tip .rm { display: contents; font-size: var(--text-xs); font-weight: var(--weight-reading); color: var(--foreground); line-height: var(--leading-xs); }
.chart-tip .rm i { width: var(--space-2); height: var(--space-2); border-radius: var(--r-pill); }
.chart-tip .rm span { max-width: var(--chart-name-max); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } /* a long name is cut short, its value is never cut */
.chart-tip .rm.more span { grid-column: 2 / -1; color: var(--muted-foreground); max-width: none; }
.chart-tip .rm b { justify-self: end; margin-inline-start: .5em; /* name to value is one character in all (the column gap and this), dot to name half a character: measures of the text, not lengths */ font-variant-numeric: tabular-nums; white-space: nowrap; }
.chart-tip:has(.rm) .t { grid-column: 2 / -1; font-size: var(--chart-reading-sub); font-weight: var(--weight-reading); color: var(--foreground); margin: .35em 0 0; }
.chart-tip:has(.rv) { display: block; opacity: 0; transition: opacity var(--dur-axis) var(--ease-standard); padding: 0; background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; text-shadow: var(--fl-val-glow); transition: opacity var(--dur-axis) var(--ease-standard), left var(--dur-fast) var(--ease-standard); }
.chart-tip .rv { font-size: var(--chart-reading-size); line-height: var(--chart-reading-leading); font-weight: var(--weight-reading); color: var(--foreground); font-variant-numeric: tabular-nums; }
.chart-tip:has(.rv) .t { font-size: var(--chart-reading-sub); font-weight: var(--weight-reading); color: var(--foreground); margin: 0; }
.chart-tip .t { color: var(--muted-foreground); margin-bottom: var(--space-0_5); }
.chart-tip .r { display: flex; gap: var(--space-2); align-items: center; }
.chart-tip .r i { width: var(--space-2); height: var(--space-2); border-radius: var(--r-mark); display: inline-block; }
.chart-tip .r b { margin-left: auto; padding-left: var(--space-2); font-weight: var(--weight-medium); }
.chart .ref-label { position: absolute; width: var(--line); height: var(--line); overflow: hidden; clip-path: inset(50%); white-space: nowrap; } /* the name is drawn beside its line (svg .ref-name); this keeps it for assistive tech */
.chart .axis.ref-name { fill: var(--destructive-content); font-weight: var(--weight-medium); }
@media (forced-colors: active) { .chart .axis { fill: CanvasText; } }
@media (prefers-reduced-motion: reduce) { .chart .grow { animation: none; } .legend button { transition: none; } }
/* static: the same drawing (axes, the dated first time, the line and its area, levels and their names, the legend) as a still picture for a report or print: no frame, no hover, reading,
   drag, info or expand, the axes always shown, nothing moving */
.card.static, :root[data-theme="light"] .card.static, .card.static .chart, .card.static .chart:hover { padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; }
.card.static .card-h { padding-inline: 0; } .card.static .chart { pointer-events: none; }
.card.static :is(*, *::before, *::after) { animation: none !important; transition: none !important; }
`;

/**
 * body replaces the chart with another drawing (a flow graph) under the same head.
 * valueSize 'lg': opt-in 18px value on a card that is not compact (a compact card is already 18px); other cards keep the display size.
 * bleed: the card sits in a settings column and is widened 14 outward, so its edges line up with the settings groups around it.
 * @param {{title: string, widget?: boolean, density?: 'compact', valueSize?: 'lg', emphasis?: 'neutral'|'accent'|'success'|'warning', bleed?: boolean, align?: boolean, value?: string, caption?: string, badge?: any, body?: any, legend?: false|{label: string, color: string, dash?: boolean, title?: string}[], expand?: {action: string, arg?: any, label: string}, lifted?: boolean, bare?: boolean, state?: {kind: 'loading'|'empty'|'error'|'permission'|'unavailable', title: string, hint?: string, action?: {label: string, action: string, arg?: any, icon?: string}}, legendBelow?: boolean,
 *   chart: {kind: 'line'|'area'|'bar', height: number, xGrid?: boolean, refs?: {value: number, label?: string, tone?: 'limit'|'request'}[], events?: {at: number, label: string, kind?: string, time?: string, tone?: 'danger'|'warning'|'ok'|'info'|'run'}[], zoomAction?: string, rangeAction?: string, range?: {from: number, to: number}, id?: string, aspect?: boolean, rest?: 'last', x?: string[], timeAxis?: {from: number, to: number, maxGapSeconds: number|null, timeZone?: string, ticks?: {at: number, label: string}[]}, series: {name: string, color: string, values?: number[], dash?: string, key?: string, observations?: {at: number, value: number|null, label?: string, joinPrevious?: boolean, gapBefore?: boolean}[]}[], max: number, ticks: number[], unit?: string, axisUnit?: boolean, xRange?: [string,string], groupedValues?: boolean, ref?: {value: number, label?: string}, xTicks?: number[]}}} p
 *   hideTitle: the head keeps its info mark and legend but not the title words (a chart inside a card whose own head already names it).
 *   chart.axes (widget): the value and time axes always show, as on a full chart, on a chart that does not zoom.
 *   chart.liveLatestSegment (temporal only, strict true): the run that ends at a series' final observation animates when it changes, unless reduced motion is on. Absent or false: nothing animates.
 *   color is a token name (for example '--series-1'). Compact summary charts can omit repeated units on the axis and label both edges of a bucket range.
 */
/* a plate with nothing to draw: it keeps the plate's size and shape so the cards beside it stay level, and says why in the kit's own empty-state words (icon, title, line, one action) */
/* 'permission': the reader's credential lacks a grant (a lock, neutral: nothing is wrong); 'unavailable': the source that would hold the readings is not connected yet */
const STATE_ICON = { error: 'exclamation-triangle', permission: 'lock', unavailable: 'unplug' };
function statePlate(state, height) {
  const loading = state.kind === 'loading';
  return html`<div class="chart chart-state" data-state="${state.kind}" style="height:${height}px" role="status" aria-live="polite"${attrs({ 'aria-busy': loading ? 'true' : null })}>${loading ? html`<span class="chart-state-title">${state.title}</span>` : emptyState.render({ icon: STATE_ICON[state.kind] || 'circle-info', plainIcon: true, title: state.title, description: state.hint, action: state.action ? button.render({ label: state.action.label, icon: state.action.icon, variant: 'secondary', size: 'sm', round: true, action: state.action.action, arg: state.action.arg }) : '' })}</div>`;
}

export function render(p) {
  if (p.chart?.timeAxis !== undefined) validateTimeChart(p.chart);
  const entries = p.legend ?? (p.widget ? autoLegend(p.chart) : null);
  const legend = entries ? html`<div class="legend">${entries.map((l, i) => {
    const series = p.chart?.series[i], interactive = series && !l.dash && !p.static;
    /* bars are filled whatever their line pattern: their legend shows each series' colour as a filled swatch, never a dashed rule */
    const patterned = interactive && p.chart.kind !== 'bar' && (series.pattern ? series.pattern !== 'solid' : i > 0);
    const pattern = series?.pattern || (i === 1 ? 'dash' : 'dot');
    const swatch = html`<i class="${l.dash ? 'dash' : patterned ? 'series-' + pattern : ''}"${attrs({ style: l.dash ? (l.color ? `border-top-color:var(${l.color})` : null) : patterned ? `color:var(${l.color})` : `background:var(${l.color})` })}></i>${l.label}`;
    return interactive ? html`<button type="button"${attrs({ title: l.title, 'aria-label': l.title })} data-key="${JSON.stringify(p.chart.timeAxis !== undefined ? ['temporal-series', series.key] : p.chart.series.filter(s => s.name === series.name).length === 1 ? [series.name] : [series.name, i, series])}" data-chart-series="${i}" aria-pressed="true">${swatch}</button>` : html`<span>${swatch}</span>`;
  })}${p.widget && !p.static ? html`<span class="legend-more" hidden tabindex="0" aria-haspopup="true" data-own-children data-own-attrs="hidden title"><span class="legend-more-n"></span><span class="legend-pop"><span class="legend-pop-in"></span></span></span>` : ''}</div>` : '';
  return html`<div class="${(p.bleed ? 'card bleed' : 'card') + (p.align ? ' chart-aligned' : '') + (p.density === 'compact' ? ' compact' : '') + (p.widget ? ' widget' : '') + (p.lifted ? ' lifted' : '') + (p.emphasis ? ' emphasis ' + p.emphasis : '') + (p.valueSize === 'lg' && p.density !== 'compact' ? ' value-lg' : '') + (p.static ? ' static' : '')}" data-c="chart-card">
    ${p.bare ? '' : html`<div class="card-h"><div><div class="card-t">${p.hideTitle ? '' : p.title}${p.static ? '' : infoMark(p.info ?? p.chart?.info, p.title)}</div>${p.value ? html`<div class="card-big">${p.value}</div>` : p.state?.kind === 'loading' ? html`<div class="card-big" aria-hidden="true">${skeleton.render({ width: 'calc(var(--space-16) + var(--space-4))', height: 'var(--leading-sm)' })}</div>` : ''}</div>
      ${p.badge || ''}${p.legendBelow ? '' : legend}</div>`}
    ${p.caption ? html`<div class="chart-context">${p.caption}</div>` : ''}
    ${p.expand && !p.static ? html`<div class="card-expand-anchor"><button type="button" class="card-expand" aria-haspopup="dialog" data-expand data-action="${p.expand.action}"${attrs({ 'data-arg': p.expand.arg, 'aria-label': p.expand.label, 'data-tip': p.expand.label, 'data-tip-side': 'left' })}>${icon('arrows-expand', 'sm')}</button></div>` : ''}
    ${p.chart && p.state ? statePlate(p.state, p.chart.height) : p.chart ? (p.static ? html`<div class="chart axes" role="img" aria-label="${p.title}" data-own-children data-own-attrs="data-chart style" data-chart="${JSON.stringify({ ...p.chart, interactive: 'none', rangeAction: undefined, zoomAction: undefined, rest: undefined, liveLatestSegment: false })}" data-interactive="none" style="height:${p.chart.height}px"></div>` : html`<div class="${(p.chart.rest ? 'chart hover holds' : 'chart') + (p.widget && (p.chart.interactive === 'full' || p.chart.axes) ? ' axes' : '')}" tabindex="0" aria-label="${p.title}" data-own-children data-own-attrs="data-chart style" data-chart="${JSON.stringify(p.chart)}"${attrs({ 'data-interactive': (p.chart.interactive ?? (p.widget ? 'none' : 'full')) === 'none' ? 'none' : null })} style="height:${p.chart.height}px"></div>`) : p.body}
    ${p.legendBelow ? legend : ''}
  </div>`;
}

/* the legend a widget has when the page names none (legend undefined; false has none): its lines by name with their colour mark, and its named levels (chart.refs) as dashed
   marks in their tone, whenever there is more than one line or a level to tell apart; a single line is named by the title already, so only its levels are listed */
function autoLegend(chart) {
  if (!chart || !Array.isArray(chart.series)) return null;
  const lines = chart.series.filter(series => series.name && !series.ghost), levels = (chart.refs || []).filter(r => r.label);
  if (lines.length < 2 && !levels.length) return null;
  return [...(lines.length > 1 ? chart.series.map(series => ({ label: series.name, color: series.color })) : []), ...levels.map(r => ({ label: r.label, color: r.tone === 'request' ? '--muted-foreground' : '--chart-limit', dash: true }))];
}

/* chart info (p.info or chart.info: { title?, rows: { label, value }[], code?: { lang, text } }): an ⓘ beside the title opens a small panel on the floating surface
   (--float-*) under it, with the name-value rows and the query as a code view laid flat in it; Escape or a press elsewhere closes it and the focus goes back to the ⓘ */
/* the panel's id comes from what it says, so a redraw of the same chart writes the same markup (a counter made every redraw a change) */
const infoId = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return 'card-info-' + (h >>> 0).toString(36); };
function infoMark(info, title) {
  if (!info || !(info.rows?.length || info.code)) return '';
  const id = infoId(JSON.stringify([title, info])), label = info.title || t('chart.info');
  return html`<span class="card-info"><button type="button" class="card-info-btn" data-card-info aria-haspopup="dialog" aria-expanded="false"${attrs({ 'aria-controls': id, 'aria-label': label, 'data-tip': label })}>${icon('circle-info', 'sm')}</button><span class="card-info-pop" id="${id}" role="dialog" tabindex="-1" hidden${attrs({ 'aria-label': label })}>${info.title ? html`<b class="cip-t">${info.title}</b>` : ''}${info.rows?.length ? html`<dl class="cip-rows">${info.rows.map(r => html`<div><dt>${r.label}</dt><dd>${r.value}</dd></div>`)}</dl>` : ''}${info.code ? codeBlock.render({ lang: info.code.lang, text: info.code.text, wrap: true, compact: true }) : ''}</span></span>`;
}

/** Colors for a chart with more lines than seriesAppearance covers: ten distinct hues, one per line, no dashes (the caller takes SERIES_PALETTE[slot]). */
export const SERIES_PALETTE = Object.freeze(['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8', '--series-9', '--series-10']);

/**
 * Stable series appearance for a caller-owned slot; the finite palette repeats after nine slots.
 * @param {number} slot
 * @returns {Readonly<{color: string, pattern: string, dash: string}>}
 * @throws {RangeError} A slot is not a nonnegative safe integer.
 */
export function seriesAppearance(slot) {
  if (!Number.isSafeInteger(slot) || slot < 0) throw new RangeError('invalid series slot');
  const pattern = ['solid', 'dash', 'dot'][Math.floor(slot / 3) % 3];
  return Object.freeze({ color: ['--series-1', '--series-2', '--series-3'][slot % 3], pattern, dash: pattern === 'solid' ? 'none' : pattern === 'dash' ? '5 3' : '2 3' });
}

/**
 * Decorative series marker, using exactly the color and dash passed to chart.series.
 * @param {{color: string, pattern: string, dash: string}} appearance
 * @returns {import('../core/html.js').Safe}
 * @throws {TypeError} An appearance does not match the public palette and dash contract.
 */
export function seriesSwatch(appearance) {
  if (!appearance) throw new TypeError('invalid series appearance');
  const { color, pattern, dash } = appearance;
  if (!['--series-1', '--series-2', '--series-3'].includes(color) || !['solid', 'dash', 'dot'].includes(pattern) || dash !== (pattern === 'solid' ? 'none' : pattern === 'dash' ? '5 3' : '2 3')) throw new TypeError('invalid series appearance');
  return html`<svg class="chart-series-swatch" viewBox="0 0 16 4" aria-hidden="true" focusable="false"><path d="M1 2H15" fill="none" stroke="var(${color})" stroke-linecap="round" stroke-width="2" stroke-dasharray="${dash}"/></svg>`;
}

/** Snapshot of the currently displayed sample. Context/source identity remains caller-owned. */
export function sampleSnapshot(el) {
  if (!el?.isConnected) return null;
  if (el?._chart) refreshChart(el, false, false);
  if (!el?._chart || !el.classList.contains('hover') || !Number.isSafeInteger(el._point)) return null;
  if (el._chart.time) {
    const record = timeRecords(el)[el._point];
    return record ? { mode: 'temporal', seriesKey: record.key, at: record.at } : null;
  }
  const label = el._chart.c.x[el._point];
  if (typeof label !== 'string') return null;
  return { mode: 'categorical', label, occurrence: el._chart.c.x.slice(0, el._point).filter(value => value === label).length };
}

/** Restore an exact visible sample without moving focus; a mismatch clears the sample. */
export function restoreSample(el, snapshot) {
  if (!el?.isConnected || !el.matches?.('.chart[data-chart]')) { if (el?._chart) clearPoint(el); return false; }
  refreshChart(el, false, false);
  let index = -1;
  if (el._chart.time && snapshot?.mode === 'temporal' && typeof snapshot.seriesKey === 'string' && Number.isFinite(snapshot.at)) index = timeRecords(el).findIndex(record => record.key === snapshot.seriesKey && record.at === snapshot.at);
  if (!el._chart.time && snapshot?.mode === 'categorical' && typeof snapshot.label === 'string' && Number.isSafeInteger(snapshot.occurrence) && snapshot.occurrence >= 0) index = el._chart.c.x.flatMap((label, i) => label === snapshot.label ? [i] : [])[snapshot.occurrence] ?? -1;
  if (index < 0) { clearPoint(el); return false; }
  showPoint(el, index);
  if (!el.classList.contains('hover')) { clearPoint(el); return false; }
  return true;
}

function validateTimeChart(c) {
  const axis = c.timeAxis;
  if (!axis || !Number.isFinite(c.height) || c.height <= 0 || (c.ticks === undefined ? c.yScale === 'page' : !Array.isArray(c.ticks) || c.ticks.some(tick => !Number.isFinite(tick))) || !['line', 'area'].includes(c.kind) || !Number.isFinite(axis.from) || !Number.isFinite(axis.to) || axis.from >= axis.to || !Number.isFinite(new Date(axis.from * 1000).getTime()) || !Number.isFinite(new Date(axis.to * 1000).getTime()) || !(axis.maxGapSeconds === null || (Number.isFinite(axis.maxGapSeconds) && axis.maxGapSeconds > 0)) || !Array.isArray(c.series) || (c.liveLatestSegment !== undefined && typeof c.liveLatestSegment !== 'boolean')) throw new TypeError('invalid temporal chart');
  if (axis.timeZone !== undefined && typeof axis.timeZone !== 'string' || c.range != null && !(Number.isFinite(c.range.from) && Number.isFinite(c.range.to) && c.range.to > c.range.from)) throw new TypeError('invalid temporal window');
  if (axis.ticks !== undefined && (!Array.isArray(axis.ticks) || axis.ticks.some(tick => !Number.isFinite(tick.at) || tick.at < axis.from || tick.at > axis.to || typeof tick.label !== 'string'))) throw new TypeError('invalid temporal ticks');
  const keys = new Set();
  for (const series of c.series) {
    if (typeof series.key !== 'string' || !series.key || typeof series.name !== 'string' || !series.name.trim() || keys.has(series.key) || !Array.isArray(series.observations)) throw new TypeError('invalid temporal series key');
    keys.add(series.key);
    let previous = -Infinity;
    for (const point of series.observations) {
      if (!point || !Number.isFinite(point.at) || point.at <= previous || point.at < axis.from || point.at > axis.to || !(point.value === null || Number.isFinite(point.value)) || (point.label !== undefined && typeof point.label !== 'string') || ['joinPrevious', 'gapBefore'].some(key => point[key] !== undefined && typeof point[key] !== 'boolean')) throw new TypeError('invalid temporal observation');
      previous = point.at;
    }
  }
}

/* the reading names its moment in full, to the second, in the chart's zone (timeAxis.timeZone): 2026-11-09 14:02:05 */
function observationLabel(point, zone) {
  return timeReading(point.at, zone);
}

function timeRecords(el) {
  const { from, to } = el._chart.time;
  return el._chart.time.records.filter(record => !el._hiddenSeries?.has(record.series) && record.at >= from && record.at <= to);
}

function restoreTimePoint(el) {
  if (!el._chart?.time) return;
  const records = timeRecords(el); el._chart.n = records.length;
  if (!el._timePoint) return;
  const index = records.findIndex(record => record.key === el._timePoint.key && record.at === el._timePoint.at);
  if (index < 0) clearPoint(el); else el._point = index;
}

function showTimePoint(el, index, followAt) {
  el.classList.remove('evt-on'); el.querySelectorAll('.evg.on').forEach(g => g.classList.remove('on'));
  const records = timeRecords(el);
  if (!records.length) { clearPoint(el); return; }
  const i = Math.max(0, Math.min(records.length - 1, index)), record = records[i], { c, W, time } = el._chart;
  el._point = i; el._timePoint = { key: record.key, at: record.at };
  /* a reading chart's line and dot follow the pointer along the drawn line; the figure and time are the nearest sample's */
  let atc = record.at, yValue = record.value;
  if (c.reading && followAt !== undefined) {
    atc = Math.max(time.from, Math.min(time.to, followAt));
    const same = records.filter(point => point.series === record.series), after = same.findIndex(point => point.at >= atc), a = same[after <= 0 ? 0 : after - 1], b = same[after < 0 ? same.length - 1 : after];
    yValue = a && b && b.at > a.at ? a.value + (b.value - a.value) * (atc - a.at) / (b.at - a.at) : (b ?? a).value;
  }
  const x = time.px(atc), rule = el.querySelector('.xh'), v = el._chart.view, X = v ? v.l + v.sx * x : x;
  rule.setAttribute('x1', X); rule.setAttribute('x2', X);
  if (v) { rule.setAttribute('y1', v.t); rule.setAttribute('y2', time.height - v.b); }
  const rows = records.filter(point => point.at === record.at), tip = el.querySelector('.chart-tip');
  tip.innerHTML = `<div class="t">${esc(observationLabel(record, c.timeAxis.timeZone))}</div>` + rows.map(point => `<div class="r"><i style="background:var(${esc(c.series[point.series].color)})"></i><span>${esc(c.series[point.series].name)}</span><b>${esc(chartValue(point.value, c))}</b></div>`).join('');
  el.classList.add('hover');
  if (c.reading && c.series.length > 1) {
    const at = followAt === undefined ? record.at : atc, lines = [];
    c.series.forEach((series, k) => {
      if (el._hiddenSeries?.has(k)) return; /* a line the reader turned off has no row; every other line has one, even where it has nothing to say */
      const same = records.filter(point => point.series === k), at = followAt === undefined ? record.at : atc;
      const value = lineValueAt(same, at);
      const py = value === null ? null : time.py(value);
      lines.push({ k, color: series.color, name: series.name, value: value === null ? '—' : chartValue(readable(value), c), y: py === null ? null : v ? v.t + v.sy * py : py });
    });
    placeRows(el, tip, X, W, observationLabel(record, c.timeAxis.timeZone), lines); return;
  }
  if (c.reading) { placeReading(el, tip, X, v ? v.t + v.sy * el._chart.time.py(yValue) : el._chart.time.py(yValue), W, c.series[record.series].color, chartValue(readable(record.value), c), observationLabel(record, c.timeAxis.timeZone)); return; }
  tip.style.left = Math.max(0, Math.min(x / W * el.clientWidth + 12, el.clientWidth - tip.offsetWidth)) + 'px'; tip.style.top = '0';
}

/* chart.fade: the area under a line thins out toward the axis (one shared mask); chart.average: a dashed level across the plot; chart.reading: the hovered value reads as a large figure beside a dot */
const fadeDefs = c => c.fade ? '<defs data-key="fadedefs"><linearGradient id="chart-fade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="cf-top"/><stop offset="1" class="cf-bottom"/></linearGradient><mask id="chart-fade-mask" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#chart-fade)"/></mask></defs>' : '';
/* a reading chart's line and area carry their shape as a CSS path too, so a new range or new values reshape the drawing instead of replacing it */
const morphD = (c, d) => c.reading && !c.slide ? ` style="d:path('${d}')"` : '';
const fadeAttr = c => c.fade ? ' mask="url(#chart-fade-mask)"' : '';
/* chart.average / chart.limit: a dashed level across the plot (the mean of the readings, or a limit the readings are held against); chart.limitLabel names it, shown with the scale */
/* a level's name never lies on the readings: it takes the first free place beside its line (under it at the right end, over it, then the same at the left end), free meaning
   no line, area or bar under the name's box and no other name there; with no free place it is left out of the plot (the legend still names the level).
   lines: each visible series as [x, y] points in the names' space (the shrunk drawing of a plate); fill: the series covers down to the foot of the plot (an area, bars) */
function placeLevels(el, lines, fill, box, rules = []) {
  const names = [...el.querySelectorAll(':scope > svg text.limit-label')];
  if (!names.length) return;
  const under = (xa, xb) => {
    let lo = Infinity, hi = -Infinity;
    const take = y => { lo = Math.min(lo, y); hi = Math.max(hi, y); };
    for (const pts of lines) for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[k + 1] || p;
      if (q[0] < xa || p[0] > xb) continue;
      const at = x => q[0] === p[0] ? p[1] : p[1] + (q[1] - p[1]) * (Math.max(p[0], Math.min(q[0], x)) - p[0]) / (q[0] - p[0]);
      take(at(Math.max(xa, p[0]))); take(at(Math.min(xb, q[0])));
    }
    return hi < lo ? null : [lo, fill ? box.bottom : hi];
  };
  const gap = 3, clear = cssNumber(el, '--space-1_5') || gap; /* the name keeps --space-1_5 of room from any reading */
  /* what else a name must not lie on: the other levels' lines and the change marks' rules (rules: their x in the names' space) */
  const fixed = [...names.map(n => ({ l: +n.dataset.x0, r: +n.dataset.x1, t: +n.dataset.y, b: +n.dataset.y, own: n })), ...rules.map(x => ({ l: x, r: x, t: box.top, b: box.bottom }))], taken = [];
  for (const n of names) {
    const ly = +n.dataset.y, x0 = +n.dataset.x0, x1 = +n.dataset.x1;
    n.classList.remove('level-off');
    let found = false;
    for (const [anchor, side] of [['end', 'below'], ['end', 'above'], ['start', 'below'], ['start', 'above']]) {
      n.setAttribute('text-anchor', anchor); n.setAttribute('x', anchor === 'end' ? x1 - 6 : x0 + 6); n.setAttribute('y', ly);
      let b; try { b = n.getBBox(); } catch { b = null; }
      if (!b || !b.width) { found = true; break; } /* not laid out yet (a hidden plate): it is placed again when it is drawn */
      const top = side === 'below' ? ly + gap : ly - gap - b.height, dy = top - b.y;
      n.setAttribute('y', ly + dy);
      const r = { l: b.x, r: b.x + b.width, t: top, b: top + b.height };
      if (r.t < box.top || r.b > box.bottom || r.l < box.left || r.r > box.right) continue;
      const data = under(r.l - clear, r.r + clear);
      if (data && data[1] >= r.t - clear && data[0] <= r.b + clear) continue;
      if (taken.some(o => o.l < r.r + gap && o.r > r.l - gap && o.t < r.b + gap && o.b > r.t - gap)) continue;
      if (fixed.some(o => o.own !== n && o.l < r.r + gap && o.r > r.l - gap && o.t < r.b + gap && o.b > r.t - gap)) continue;
      taken.push(r); found = true; break;
    }
    if (!found) n.classList.add('level-off');
  }
}

/* chart.ref (the one-level form): its name is placed beside its line by the same rule as the levels' (placeLevels); the .ref-label element keeps the name for assistive tech */
const refName = (c, py, x0, x1, map = {}) => {
  if (!c.ref?.label || !Number.isFinite(c.ref.value)) return '';
  const mx = map.vx || (v => v), my = map.vy || (v => v), y = my(py(c.ref.value));
  return `<text data-key="ref-name" class="axis limit-label ref-name" aria-hidden="true" x="${mx(x1) - 6}" y="${y + 15}" text-anchor="end" data-y="${y}" data-x0="${mx(x0)}" data-x1="${mx(x1)}">${esc(c.ref.label)}</text>`;
};

/* on a plate the marks rise with the times as they come in: each stops --space-1 above the highest time label or tick (their own boxes, a joined dot's number included),
   whatever the plate's size; measured once the drawing is in place */
function clearMarks(el) {
  const svg = el.querySelector(':scope > svg'); if (!svg) return;
  const box = n => { try { return n.getBBox(); } catch { return null; } };
  const tops = [...svg.querySelectorAll('text.axis.xl, .xtick')].map(n => n.matches('line') ? Math.min(+n.getAttribute('y1'), +n.getAttribute('y2')) : box(n)?.y).filter(Number.isFinite);
  if (!tops.length) return;
  const limit = Math.min(...tops) - (cssNumber(el, '--space-1') || 0);
  for (const m of svg.querySelectorAll('.evm')) {
    const b = box(m); if (!b || !b.height) continue;
    const dy = parseFloat(m.style.getPropertyValue('--ev-dy')) || 0, over = b.y + b.height + dy - limit;
    if (over > 0) m.style.setProperty('--ev-dy', dy - over + 'px');
  }
}

const averageLine = (c, py, x0, x1, map = {}) => {
  const mx = map.vx || (v => v), my = map.vy || (v => v); /* the name sits where the scale text sits (the shrunk drawing), not on the line's resting place */
  /* c.refs: several levels the readings are held against, each with its own name and tone ('limit' warns, 'request' is the quiet one); c.limit is the one-level form */
  const refs = refLevels(c);
  return refs.map((r, i) => `<line data-key="${i ? 'ref' + i : 'average'}" class="avgl${r.tone === 'request' ? ' request' : ''}" x1="${x0}" x2="${x1}" y1="${py(r.value)}" y2="${py(r.value)}"/>` + (r.label && r.tone ? `<text data-key="${i ? 'ref-label' + i : 'limit-label'}" class="axis limit-label${r.tone === 'request' ? ' request' : ''}" x="${mx(x1) - 6}" y="${my(py(r.value)) + 15}" text-anchor="end" data-y="${my(py(r.value))}" data-x0="${mx(x0)}" data-x1="${mx(x1)}">${esc(r.label)}</text>` : '')).join('');
};
function refLevels(c) {
  if (Array.isArray(c.refs) && c.refs.length) return c.refs.filter(r => Number.isFinite(r.value));
  if (Number.isFinite(c.limit)) return [{ value: c.limit, label: c.limitLabel, tone: 'limit' }];
  return Number.isFinite(c.average) ? [{ value: c.average }] : [];
}
/* chart.events (time charts): moments worth a mark on the time axis (a restart, a rollout): a thin rule with a dot at the top of the plot, each named for the reader and for the screen reader */
/* events that stand nearer than a joined dot's width on the screen become one mark: one rule (the worst tone) with a dot that carries their number, as the change timeline joins its points */
const EVENT_RANK = { danger: 3, warning: 2, run: 1 }, EVENT_APART = 20, EVENT_ROW_R = 3, EVENT_REST_PAD = 5;
function eventGroups(c, px, from, to) {
  const groups = [];
  (c.events || []).map((e, k) => ({ e, k, x: px(e.at) })).filter(({ e }) => e.at >= from && e.at <= to).sort((a, b) => a.x - b.x).forEach(m => {
    const g = groups.at(-1);
    if (g && m.x - g.sum / g.items.length < EVENT_APART) { g.items.push(m); g.sum += m.x; } else groups.push({ items: [m], sum: m.x });
  });
  return groups.map(g => ({ items: g.items, k: g.items[0].k, x: g.sum / g.items.length, tone: g.items.reduce((t, m) => (EVENT_RANK[m.e.tone] ?? 0) > (EVENT_RANK[t] ?? 0) ? m.e.tone : t, g.items[0].e.tone) }));
}
/* the dot sits at the foot of its rule, inside the plot (a reading's own dot is usually high), where the drawing is while the plate is read (map: the shrunk drawing, as the level names are), so it shows with the scale */
const eventMarks = (c, px, from, to, padT, ih, map = {}, x0 = -Infinity, x1 = Infinity, mode = 'full') => {
  if (mode === 'none') return '';
  const mx = map.vx || (v => v), my = map.vy || (v => v), r = mode === 'row' ? EVENT_ROW_R : EVENT_APART / 2 - 2;
  /* a mark's dot rests at the foot of the plot as the plot rests; when the scale and the times come in it moves with them (the axis reveal's own time and easing) to the
     foot of the shrunk plot, just above the times, and back when they leave: --ev-dx / --ev-dy is that move */
  const clampX = (x, lo, hi) => Math.max(lo + r + 1, Math.min(hi - r - 1, x));
  const mark = (g, lift, inner) => {
    const restY = padT + ih - lift - (map.vy ? EVENT_REST_PAD : 0) /* on a plate the foot is its rounded edge: a little room above it */;
    /* near a plate's rounded corner the dot keeps inside the curve too: its whole box, a joined dot's number included */
    const R = map.corner || 0, rise = R ? restY - (padT + ih - R) : -1, bend = rise > 0 ? R - Math.sqrt(Math.max(0, (R - r - 2) ** 2 - rise ** 2)) : 0;
    const restX = Math.max(x0 + bend + r + 1, Math.min(x1 - bend - r - 1, g.x)), hoverX = clampX(mx(g.x), mx(x0), mx(x1)), hoverY = my(padT + ih) - lift;
    return `<g class="evm" style="--ev-dx:${hoverX - restX}px;--ev-dy:${hoverY - restY}px">${inner(restX, restY)}</g>`;
  };
  /* a smaller chart: no rule across the plot and no number, one row of small dots at the foot of the plot (a joined dot is a size larger); the reading lists what each holds */
  if (mode === 'row') return eventGroups(c, px, from, to).map(g => `<g data-key="event${g.k}" class="evg row" data-ev="${g.k}"${g.tone ? ` data-tone="${esc(g.tone)}"` : ''}>${mark(g, EVENT_ROW_R + 2, (x, y) => `<circle class="evd${g.items.length > 1 ? ' many' : ''}" cx="${x}" cy="${y}" r="${g.items.length > 1 ? r + 1 : r}"/>`)}</g>`).join('');
  return eventGroups(c, px, from, to).map(g => `<g data-key="event${g.k}" class="evg" data-ev="${g.k}"${g.tone ? ` data-tone="${esc(g.tone)}"` : ''}><line class="evl" x1="${g.x}" x2="${g.x}" y1="${padT}" y2="${padT + ih}"/>${g.items.length > 1 ? mark(g, EVENT_APART / 2, (x, y) => `<g class="evc"><circle class="evd" cx="${x}" cy="${y}" r="${r}"/><text class="evn" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${g.items.length}</text></g>`) : ''}</g>`).join('');
};
const dotMark = c => c.reading ? c.series.map((_, k) => `<circle data-key="dot${k}" class="xdot" data-sidx="${k}" r="5" cx="0" cy="0"/>`).join('') : ''; /* one dot per line */
/* several lines: the reading is a list, one row per line (its colour, its name, its value at that time) under the time, and every line gets its own dot */
/* one rule for where a reading sits, whatever it holds: right of the crosshair at the top of the plate, over to its left when it does not fit, and never over the value scale */
function placeTip(el, tip, x, W, ys = []) {
  const wide = tip.offsetWidth, high = tip.offsetHeight, px = x / W * el.clientWidth, right = px + 14, plotLeft = (el._chart.view?.l ?? 0) / W * el.clientWidth + 6;
  tip.style.left = Math.max(plotLeft, right + wide > el.clientWidth - 8 ? px - 14 - wide : right) + 'px';
  /* the reading sits against the lines it reads: just over the highest of the dots, or under the lowest when there is no room over it; with no dot to follow it keeps the plate's top */
  const k = el._chart.H ? el.clientHeight / el._chart.H : 1, dots = ys.filter(Number.isFinite).map(y => y * k), gap = parseFloat(getComputedStyle(el).getPropertyValue('--chart-tip-gap')) || 0, edge = parseFloat(getComputedStyle(el).getPropertyValue('--chart-tip-edge')) || 0;
  if (!dots.length) { tip.style.top = 'var(--chart-reading-top)'; dodge(el, tip); return; }
  const over = Math.min(...dots) - gap - high;
  tip.style.top = (over >= edge ? over : Math.min(Math.max(...dots) + gap, el.clientHeight - high - edge - PLATE.bottom * k)) + 'px';
  dodge(el, tip);
}
/* a level's name that the reading would sit on, or touch, steps aside to the reading's left while the reading is there (it hides only where there is no room left of it):
   two names are never drawn over each other or against each other */
/* a level's name keeps the place it was given when the chart was drawn (placeLevels); while the reading lies over it, it fades out (the axis motion) and comes back after */
function dodge(el, tip) {
  const t = tip.getBoundingClientRect(), room = parseFloat(getComputedStyle(el).getPropertyValue('--chart-tip-gap')) || 0;
  const hit = r => r.right > t.left - room && r.left < t.right + room && r.bottom > t.top - room && r.top < t.bottom + room;
  el.querySelectorAll('.axis.limit-label').forEach(n => n.classList.toggle('dodged', hit(n.getBoundingClientRect())));
}
function placeRows(el, tip, x, W, label, rows) {
  el.querySelectorAll('.xdot').forEach(dot => {
    const row = rows.find(r => r.k === Number(dot.dataset.sidx));
    if (!row || row.y === null) { dot.style.display = 'none'; return; }
    dot.style.display = ''; dot.setAttribute('cx', x); dot.setAttribute('cy', row.y); dot.style.fill = `var(${row.color})`;
  });
  tip.innerHTML = rows.map(r => `<div class="rm"><i style="background:var(${esc(r.color)})"></i><span>${esc(r.name)}</span><b>${esc(r.value)}</b></div>`).join('') + `<div class="t">${esc(label)}</div>`; /* the time under the values, as under a single reading */
  /* more readings than the plate can hold: the highest ones stay (the ones that matter), the rest fold into "+N" so the list never leaves the plate */
  const room = el.clientHeight - 2 * (parseFloat(getComputedStyle(el).getPropertyValue('--chart-tip-edge')) || 0) - PLATE.bottom * (el._chart.H ? el.clientHeight / el._chart.H : 1);
  if (tip.offsetHeight > room) {
    const shown = rows.filter(r => r.y !== null).sort((m, n) => m.y - n.y), fold = () => { tip.querySelector('.rm.more')?.remove(); tip.querySelector('.t').insertAdjacentHTML('beforebegin', `<div class="rm more"><span>+${rows.length - shown.length}</span></div>`); };
    const draw = () => { tip.innerHTML = shown.map(r => `<div class="rm"><i style="background:var(${esc(r.color)})"></i><span>${esc(r.name)}</span><b>${esc(r.value)}</b></div>`).join('') + `<div class="t">${esc(label)}</div>`; fold(); };
    do { shown.pop(); draw(); } while (shown.length > 1 && tip.offsetHeight > room);
  }
  placeTip(el, tip, x, W, rows.map(r => r.y));
}
function placeReading(el, tip, x, y, W, color, value, label) {
  const dot = el.querySelector('.xdot');
  if (dot) { dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.style.fill = `var(${color})`; }
  tip.innerHTML = `<div class="rv">${esc(value)}</div><div class="t">${esc(label)}</div>`;
  placeTip(el, tip, x, W, [y]);
}

const groupedValue = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 });
const readable = value => Number.isInteger(value) ? value : Number(value.toFixed(1)); /* a hovered figure keeps one decimal at most */
const chartValue = (value, chart) => chart.valueLabel ? chart.valueLabel(value) : plainValue(value, chart);
const plainValue = (value, chart) => (chart.groupedValues ? groupedValue.format(value) : String(value)) + (chart.unit || '');
const axisValue = (value, chart) => chart.axisLabel ? chart.axisLabel(value) : pageAxisValue(value, chart);
const pageAxisValue = (value, chart) => chart.bleed && !Number.isInteger(value) ? chartValue(Number(value.toFixed(1)), chart) : /* the scale of a widget plate keeps one decimal at most */  chart.axisUnit === false ? groupedValue.format(value) : chartValue(value, chart);

/* a widget plate always shows what it was given: when the readings or the limit go beyond the scale the caller named, the scale grows to hold them (its three marks are the low end, the middle and the high end),
 * and when it would have no height at all (every value the same) it is given some. Within the scale it was given, it is left alone. */
/* the value of one line at a time, or null where the line is not: before it starts, after it ends, across a gap (a reading that does not join the one before it) or when it has no readings.
 * points: its readings in time order ({at, value, joinPrevious}) */
export function lineValueAt(points, at) {
  if (!points.length || at < points[0].at || at > points.at(-1).at) return null;
  const after = points.findIndex(point => point.at >= at), b = points[after < 0 ? points.length - 1 : after], a = points[after <= 0 ? 0 : after - 1];
  if (b.at === at) return b.value;
  return a && b.at > a.at && b.joinPrevious !== false ? a.value + (b.value - a.value) * (at - a.at) / (b.at - a.at) : null;
}

export function widgetFit(c, values) {
  if (!c.bleed) return c;
  const finite = values.filter(Number.isFinite), limit = refLevels(c).filter(r => r.tone).map(r => r.value);
  if (!finite.length && !limit.length) return c;
  const lo0 = Number.isFinite(c.min) ? c.min : Math.min(0, ...c.ticks), hi0 = c.max > lo0 ? c.max : lo0 + 1;
  let lo = Math.min(lo0, ...finite, ...limit), hi = Math.max(hi0, ...finite, ...limit);
  if (c.max > lo0 && lo === lo0 && hi === hi0) return c; /* the scale it was given holds everything */
  if (hi <= lo) hi = lo + (Math.abs(lo) || 1);
  const pad = (hi - lo) * .06, round = v => Math.round(v * 10) / 10;
  if (hi > hi0) hi += pad; if (lo < lo0) lo -= pad;
  return { ...c, min: round(lo), max: round(hi), ticks: [round(lo), round((lo + hi) / 2), round(hi)] };
}

let clipSeq = 0;
const pageZone = el => el.ownerDocument?.documentElement?.dataset.timeZone || 'system';
const zoneOf = (el, c) => c.timeAxis?.timeZone ?? pageZone(el);
const cssNumber = (el, name) => parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue(name));
/* the least room between two time marks: a time of day and the gap after it */
const tickRoom = el => cssNumber(el, '--chart-tick-room') || 64;
/* a wide chart (time or categories) is never a thin strip: its height follows its width (--chart-aspect) between --chart-h-min and --chart-h-max; the page's height
   raises it within that band, never past --chart-h-max (a page that asked for more drew a chart taller than the screen); chart.aspect false keeps the page's height */
/* charts of categories take a flatter band as they widen (--chart-aspect at CAT_NARROW wide down to --chart-aspect-cat-wide at CAT_WIDE) and stop at --chart-h-max-cat:
   a few categories across a wide container would otherwise be mostly empty room */
const CAT_NARROW = 480, CAT_WIDE = 960;
/* how many value steps the plot's height has room for: one per --space-10 of height, two at least and eight at most */
const valueSteps = (el, c) => Math.max(2, Math.min(8, Math.floor(aspectHeight(el, c, el.clientWidth || 300, c.height) * .8 / (cssNumber(el, '--space-10') || 40))));
function aspectHeight(el, c, W, H) {
  if (c.aspect === false) return H;
  const cat = c.timeAxis === undefined, narrow = cssNumber(el, '--chart-aspect'), wide = cssNumber(el, '--chart-aspect-cat-wide');
  const k = cat && Number.isFinite(wide) ? narrow + (wide - narrow) * Math.max(0, Math.min(1, (W - CAT_NARROW) / (CAT_WIDE - CAT_NARROW))) : narrow;
  const lo = cssNumber(el, '--chart-h-min'), hi = cssNumber(el, cat ? '--chart-h-max-cat' : '--chart-h-max');
  if (![k, lo, hi].every(Number.isFinite)) return H;
  return Math.round(Math.min(hi, Math.max(lo, H, W * k))); /* the page's height counts as a least height, never past --chart-h-max */
}
/* how the change marks are drawn for a width: 'full' (a rule across the plot and a numbered dot, on a large chart), 'row' (one row of small dots under the plot, joined
   by time, the numbers in the reading) or 'none' (too small to carry them without hiding the line) */
function eventMode(el, W) {
  const lo = cssNumber(el, '--chart-events-min'), hi = cssNumber(el, '--chart-events-full');
  return W < (lo || 0) ? 'none' : W < (hi || 0) ? 'row' : 'full';
}

function drawTime(el, c) {
  validateTimeChart(c);
  /* the zone every time on the chart is written in: the chart's own (timeAxis.timeZone), else the page's (the kit.timeZone setting, on the document as data-time-zone) */
  c = { ...c, timeAxis: { ...c.timeAxis, timeZone: c.timeAxis.timeZone ?? pageZone(el) } };
  if (!Array.isArray(c.ticks)) c = { ...c, ticks: [Number.isFinite(c.min) ? c.min : 0, Number.isFinite(c.max) ? c.max : 1] }; /* fitted below; a scale of its own is needed only with yScale 'page' */
  c = widgetFit(c, c.series.flatMap(series => series.observations.map(point => point.value)));
  const axis = c.timeAxis, full = { from: axis.from, to: axis.to };
  /* the window: the page's chart.range when it changes (charts kept in step), else the one the reader zoomed or panned to; the whole axis when neither */
  const given = c.range ? JSON.stringify([c.range.from, c.range.to]) : '';
  if (given !== el._rangeSeen) { el._rangeSeen = given; el._range = c.range ? { from: Math.max(full.from, c.range.from), to: Math.min(full.to, c.range.to) } : null; }
  const zoomed = !!el._range && el._range.to > el._range.from && !wholeRange(el._range, full), from = zoomed ? el._range.from : full.from, to = zoomed ? el._range.to : full.to;
  /* the values fit what is shown (chart.yScale 'auto', the default for a time chart): from 0 for values that are never negative, about 10% of room over the top, round
     steps in the unit they are read in (Ki/Mi/Gi for bytes, cores above 1000m); the named levels count as shown. chart.yScale 'page' keeps the page's own max and ticks */
  if (c.yScale !== 'page') {
    const seen = c.series.flatMap(series => series.observations.filter(point => point.at >= from && point.at <= to && Number.isFinite(point.value)).map(point => point.value)), levels = refLevels(c).filter(r => r.tone).map(r => r.value);
    const all = [...seen, ...levels], sc = all.length ? valueScale(Math.min(...all), Math.max(...all), { unit: c.unit, count: valueSteps(el, c), zeroFloor: !Number.isFinite(c.min) || c.min >= 0, zero: c.kind === 'area', integer: all.every(Number.isInteger) }) /* an area starts at 0; a count steps by whole numbers */ : null;
    if (sc) c = { ...c, min: sc.min, max: sc.max, ticks: sc.ticks, axisLabel: sc.label, valueLabel: v => formatValue(v, c.unit) };
  }
  /* the value range the reader set by a drag along the value axis (or Shift with the arrows): its ends exactly, round marks inside; a double click there fits again */
  const scaled = !!el._yRange && el.dataset.interactive !== 'none';
  if (scaled) { const sp = valueSpan(el._yRange.min, el._yRange.max, { unit: c.unit, count: valueSteps(el, c), integer: c.series.every(series => series.observations.every(point => !Number.isFinite(point.value) || Number.isInteger(point.value))) }); c = { ...c, min: sp.min, max: sp.max, ticks: sp.ticks, axisLabel: sp.label, valueLabel: v => formatValue(v, c.unit) }; }
  const records = c.series.flatMap((series, index) => series.observations.filter(point => Number.isFinite(point.value)).map(point => ({ ...point, key: series.key, series: index })));
  records.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const min = Number.isFinite(c.min) ? c.min : Math.min(0, ...c.ticks), observedMax = records.reduce((max, point) => Math.max(max, point.value), 1), max = c.max > min ? c.max : observedMax;
  const W = el.clientWidth || 300, padL = c.bleed ? 0 : axisGutter(el, c.ticks.map(tick => axisValue(tick, c)), c.axisUnit), padB = c.bleed ? 0 : 24, padT = c.bleed ? 0 : c.ref || el.closest('.chart-aligned') ? 30 : 6;
  const H = aspectHeight(el, c, W, compactRefHeight(el, c, max, padB + padT)), iw = W - padL - (c.bleed ? 0 : 8), ih = H - padB - padT;
  if (el.style.height !== `${H}px`) el.style.height = `${H}px`; /* the plate takes the height it is drawn at (its own: a page redraw keeps it) */
  const px = at => padL + (at - from) / (to - from) * iw, py = value => padT + ih - (value - min) / (max - min) * ih;
  const view = insetView(el, c, W, H, c.ticks.map(tick => axisValue(tick, c))), vx = v => view ? view.l + view.sx * v : v, vy = v => view ? view.t + view.sy * v : v;
  let drawing = '';
  for (const tick of c.ticks) {
    drawing += `<line class="gridl" x1="${padL}" x2="${c.bleed ? W : W - 8}" y1="${py(tick)}" y2="${py(tick)}"/>`;
    if (!c.hideYLabels) drawing += `<text class="axis" x="${c.bleed ? PLATE.scaleX : padL - 8}" y="${vy(py(tick)) + 4}" text-anchor="${c.bleed ? 'start' : 'end'}">${esc(axisValue(tick, c))}</text>`;
  }
  /* c.xGrid: a faint rule at every time mark inside the plot, so a dense axis can be read across */
  /* the marks under the plot: the page's own (timeAxis.ticks) while the whole axis shows, else majors at day boundaries named by the date with its year and minors with the time of day, as dense as the width allows */
  const ticks = axis.ticks && !zoomed ? axis.ticks : timeTicks(from, to, iw, { zone: axis.timeZone, minPx: tickRoom(el) });
  for (const tick of ticks) if (tick.at > from && tick.at < to && (c.xGrid || tick.major && !tick.context)) drawing += `<line data-key="xgrid${tick.at}" class="gridl xgrid${tick.major && !tick.context ? ' xmajor' : ''}" x1="${px(tick.at)}" x2="${px(tick.at)}" y1="${padT}" y2="${padT + ih}"/>`;
  if (c.ref) drawing += `<line x1="${padL}" x2="${W - 8}" y1="${py(c.ref.value)}" y2="${py(c.ref.value)}" stroke="var(--muted-foreground)" stroke-dasharray="3 3"/>`;
  drawing += refName(c, py, padL, W - 8, { vx, vy });
  const runs = c.series.map(series => temporalSegments(series.observations, axis.maxGapSeconds));
  const engine = el._engine ||= { status: 'idle' };
  if (engine.status === 'idle') beginEngine(el, engine);
  const win = el.ownerDocument.defaultView, colors = engine.status === 'ready' ? c.series.map(series => resolveTokenColor(el, series.color)) : [];
  const useEngine = engine.status === 'ready' && colors.every(Boolean);
  /* a zoomed window draws its lines past its edges to the next reading: what is outside the plot is clipped away */
  const clipId = el._clipId ||= 'chart-clip-' + (++clipSeq);
  const clipped = zoomed || scaled; /* a window or a value range narrower than the lines: what is outside the plot is clipped away */
  if (clipped) drawing += `<clipPath id="${clipId}" data-key="clip"><rect x="${padL}" y="${padT}" width="${iw}" height="${ih}"/></clipPath>`;
  if (!useEngine) c.series.forEach((series, index) => {
    drawing += `<g data-series="${index}" data-key="${esc(JSON.stringify(['time-series', series.key]))}"${clipped ? ` clip-path="url(#${clipId})"` : ''}>`;
    for (const points of runs[index]) {
      const key = JSON.stringify([series.key, points[0].at]);
      if (points.length === 1) { const point = points[0]; drawing += `<circle data-key="${esc('point' + key)}" cx="${px(point.at)}" cy="${py(point.value)}" r="3" fill="var(${esc(series.color)})"/>`; continue; }
      const path = points.map((point, i) => (i ? 'L' : 'M') + px(point.at) + ',' + py(point.value)).join(' ');
      if (c.kind === 'area') drawing += `<path data-key="${esc('area' + key)}" fill="var(${esc(series.color)})" fill-opacity="${c.fade ? fadeArea(c) : c.series.length > 1 ? .12 : .2}"${fadeAttr(c)} d="${path} L${px(points.at(-1).at)},${py(min)} L${px(points[0].at)},${py(min)} Z"/>`;
      drawing += `<path data-key="${esc('line' + key)}" class="ln" stroke="var(${esc(series.color)})" stroke-dasharray="${esc(seriesDash(series, index))}" d="${path}"/>`;
    }
    drawing += '</g>';
  });
  if (c.bleed && !(axis.ticks && !zoomed)) {
    /* generated marks on a plate: the same placing as the plain chart's (majors first, none cut, none over another), in the shrunk drawing's place */
    for (const { tick, anchor } of timeTickLabels(el, ticks, { from, to }, at => vx(px(at)), view.edge, W - view.edge)) {
      drawing += `<line class="xtick" x1="${vx(px(tick.at))}" x2="${vx(px(tick.at))}" y1="${H - view.b + PLATE.tickFrom}" y2="${H - view.b + PLATE.tickTo}"/>`;
      drawing += `<text class="axis xl${tick.major ? ' major' : ''}" x="${vx(px(tick.at))}" y="${H - PLATE.labelUp}" text-anchor="${anchor}">${esc(tick.label)}</text>`;
    }
  } else if (c.bleed) {
    for (const it of bleedLabels(el, ticks.map(tick => ({ x: vx(px(tick.at)), label: tick.label })), W, view)) {
      drawing += `<line class="xtick" x1="${it.x}" x2="${it.x}" y1="${H - view.b + PLATE.tickFrom}" y2="${H - view.b + PLATE.tickTo}"/>`;
      if (!it.skip) drawing += `<text class="axis xl" x="${it.at}" y="${H - PLATE.labelUp}" text-anchor="${it.anchor}">${esc(it.label)}</text>`;
    }
  } else for (const { tick, anchor } of timeTickLabels(el, ticks, { from, to }, px, padL, W - 8)) drawing += `<text class="axis xl${tick.major ? ' major' : ''}" x="${px(tick.at)}" y="${H - 4}" text-anchor="${anchor}">${esc(tick.label)}</text>`;
  drawing += fadeDefs(c) + eventMarks(c, px, from, to, padT, ih, { vx, vy, corner: view ? parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).borderBottomLeftRadius) || 0 : 0 }, padL, padL + iw, eventMode(el, W)) + averageLine(c, py, padL, padL + iw, { vx, vy }) + `<line data-key="crosshair" class="xh" x1="0" x2="0" y1="${padT}" y2="${padT + ih}"/>${dotMark(c)}<rect data-key="hit" x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent" data-hit/>`;
  /* the axes take a drag (a chart that reads fully): the value scale at the left, the time marks under the plot, each where its labels are */
  if (el.dataset.interactive !== 'none') {
    const y = view ? { x: 0, y: view.t, w: view.l, h: H - view.t - view.b } : { x: 0, y: padT, w: padL, h: ih }, x = view ? { x: view.l, y: H - view.b, w: W - view.l - view.r, h: view.b } : { x: padL, y: padT + ih, w: iw, h: H - padT - ih };
    for (const [name, r] of [['y', y], ['x', x]]) if (r.w > 0 && r.h > 0) drawing += `<rect data-key="axis-${name}" data-axis="${name}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="transparent"/>`;
  }
  drawing += `<desc data-key="time-axis-labels">${ticks.map(tick => esc(tick.label)).join('\n')}</desc>`;
  const host = useEngine ? `<div data-key="engine" class="chart-engine" data-own-children data-own-attrs="style" aria-hidden="true" style="height:${H}px${view ? ';' + view.css : ''}"></div>` : '';
  morph(el, `<svg data-key="svg" viewBox="0 0 ${W} ${H}" style="height:${H}px${view ? ';' + view.css : ''}" role="img">${drawing}</svg>${host}<div data-key="tooltip" class="chart-tip" data-own-children data-own-attrs="style" role="status" aria-live="polite"></div>` + (c.ref?.label ? '<div class="ref-label"></div>' : ''));
  if (c.ref?.label) el.querySelector('.ref-label').textContent = c.ref.label;
  if (view) clearMarks(el);
  { const seen = records.filter(r => r.at >= from && r.at <= to && !el._hiddenSeries?.has(r.series)), byLine = new Map();
    for (const r of seen) { if (!byLine.has(r.series)) byLine.set(r.series, []); byLine.get(r.series).push([vx(px(r.at)), vy(py(r.value))]); }
    placeLevels(el, [...byLine.values()], c.kind === 'area', { left: vx(padL), right: vx(padL + iw), top: vy(padT), bottom: vy(padT + ih) }, eventMode(el, W) === 'full' ? eventGroups(c, px, from, to).map(g => vx(g.x)) : []); }
  if (!useEngine) disposeTemporal(engine);
  let paint = null;
  if (useEngine) {
    const motion = !win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let duration = 0;
    if (c.liveLatestSegment === true && motion) { const text = win.getComputedStyle(el).getPropertyValue('--dur-chart').trim(); duration = parseFloat(text) * (text.endsWith('ms') ? 1 : 1000); }
    /* a widget plate draws its line at the plate's own width (the same token the svg lines use), so a time-axis chart reads as thick as the others */
    const lineWidth = c.bleed ? parseFloat(win.getComputedStyle(el).getPropertyValue('--chart-line-w-lg')) : undefined;
    const token = name => parseFloat(win.getComputedStyle(el).getPropertyValue(name));
    const fade = c.fade && [token('--chart-fade-top'), token('--chart-fade-bottom')].every(Number.isFinite) ? { top: fadeArea(c) * token('--chart-fade-top'), bottom: fadeArea(c) * token('--chart-fade-bottom') } : undefined;
    const geometry = { W, H, padL, padT, iw, ih, min, max, ...(Number.isFinite(lineWidth) ? { lineWidth } : {}), ...(fade ? { fade } : {}), dim: token('--chart-dim-o'), ghost: { opacity: token('--chart-ghost-o'), width: token('--line-avg') } };
    paint = () => {
      const { option, renderer } = buildTemporalOption({ chart: clipped ? { ...c, timeAxis: { ...axis, from, to, clip: true } } : c, segments: runs, geometry, hidden: el._hiddenSeries || new Set(), focus: el._focus ?? null, colors, motion, duration });
      // ECharts stamps its own attribute (_echarts_instance_) on the element it is initialised on. morph sees that as a foreign attribute on a
      // data-own-children node and replaces the node, which orphans the instance. So the engine gets a private child mount that morph never compares.
      const slot = el.querySelector(':scope > .chart-engine');
      let mount = slot.firstElementChild;
      if (!mount) { mount = el.ownerDocument.createElement('div'); slot.append(mount); }
      paintTemporal(engine, { echarts: engine.module, host: mount, option, renderer, width: W, height: H });
    };
  }
  el._chart = { c, W, H, padL, padT, ih, iw, view, n: records.length, zoomed, scaled, events: eventMode(el, W), time: { records, px, py, from, to, full, min, max, height: H, paint } };
  syncSeries(el);
}

/** Lazy engine load for one chart. A stale result (chart removed, engine disposed or replaced) is dropped. */
function beginEngine(el, engine) {
  engine.status = 'loading';
  loadEcharts().then(module => {
    if (el._engine !== engine || engine.disposed) return;
    engine.module = module; engine.status = 'ready';
    if (el.isConnected && el._chart?.time) refreshChart(el, true, false);
  }, () => { if (el._engine === engine) engine.status = 'failed'; });
}

function disposeEngine(el) {
  const engine = el._engine;
  if (!engine) return;
  engine.disposed = true; disposeTemporal(engine); delete el._engine;
}

function timeTickLabels(el, ticks, axis, px, left, right) {
  const doc = el.ownerDocument, win = doc.defaultView;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const text = doc.createElementNS(svg.namespaceURI, 'text');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute'; svg.style.visibility = 'hidden';
  text.setAttribute('class', 'axis xl major'); svg.append(text); el.append(svg); /* measured as drawn: the time labels are the bolder ones */
  try {
    const fontSize = parseFloat(win.getComputedStyle(text).fontSize);
    const gap = parseFloat(win.getComputedStyle(el).getPropertyValue('--space-2'));
    if (!Number.isFinite(gap) || gap < 0) throw new Error('missing chart axis spacing');
    const extents = new Map();
    const measure = (label, anchor) => {
      const key = JSON.stringify([label, anchor]);
      if (extents.has(key)) return extents.get(key);
      text.textContent = label; text.setAttribute('text-anchor', anchor);
      let width = Array.from(label).length * fontSize;
      let start = anchor === 'start' ? 0 : anchor === 'end' ? -width : -width / 2;
      try {
        const box = text.getBBox();
        if (Number.isFinite(box.x) && Number.isFinite(box.width) && (box.width > 0 || !label)) { start = box.x; width = box.width; }
      } catch { /* Until visible, use the same conservative glyph width as the axis gutter. */ }
      const extent = { left: start, right: start + width };
      extents.set(key, extent); return extent;
    };
    return layoutTimeLabels(ticks, axis, px, left, right, gap, measure);
  } finally { svg.remove(); }
}

/* the marks stand evenly: when the dated first time of a window inside one day leaves no room for the time beside it, every other time goes too (every third, …), not that one alone (R4-11).
   A day boundary always stays; a time that fits nowhere on the axis even alone does not count against a spacing */
function layoutTimeLabels(ticks, axis, px, left, right, gap, measure) {
  if (!ticks.length) return [];
  const inTime = ticks.map((tick, index) => ({ tick, index })).sort((a, b) => a.tick.at - b.tick.at || a.index - b.index);
  if (!ticks.some(tick => tick.context)) return placeTimeLabels(inTime, ticks.length, axis, px, left, right, gap, measure);
  const alone = ({ tick, index }) => [index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle', 'middle', 'start', 'end'].some(anchor => { const e = measure(tick.label, anchor), x = px(tick.at); return x + e.left >= left && x + e.right <= right; });
  let first = null;
  for (let k = 1; k <= inTime.length; k++) {
    const keep = inTime.filter((c, i) => (c.tick.major && !c.tick.context) || i % k === 0), placed = placeTimeLabels(keep, ticks.length, axis, px, left, right, gap, measure);
    first ??= placed;
    const at = new Set(placed.map(p => p.tick.at));
    if (keep.every(c => at.has(c.tick.at) || !alone(c))) return placed;
  }
  return first;
}

function placeTimeLabels(candidates, count, axis, px, left, right, gap, measure) {
  const ordered = candidates.slice().sort((a, b) => a.tick.at - b.tick.at || a.index - b.index);
  const remaining = ordered.filter(({ tick }) => tick.at !== axis.to && tick.at !== axis.from);
  const latest = remaining.at(-1)?.tick.at;
  const earliest = remaining.find(({ tick }) => tick.at !== latest)?.tick.at;
  const rank = at => at === axis.to ? 0 : at === axis.from ? 1 : at === latest ? 2 : at === earliest ? 3 : 4;
  ordered.sort((a, b) => (b.tick.major ? 1 : 0) - (a.tick.major ? 1 : 0) || rank(a.tick.at) - rank(b.tick.at) || a.tick.at - b.tick.at || a.index - b.index); /* a day boundary is placed before any time of day */
  const placed = [], epochs = new Set();
  for (const candidate of ordered) {
    const { tick, index } = candidate;
    if (epochs.has(tick.at)) continue;
    const preferred = index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle';
    const anchors = [...new Set([preferred, 'middle', 'start', 'end'])];
    for (const anchor of anchors) {
      const extent = measure(tick.label, anchor), x = px(tick.at);
      const box = { left: x + extent.left, right: x + extent.right };
      if (!Number.isFinite(box.left) || !Number.isFinite(box.right) || box.left < left || box.right > right) continue;
      let lo = 0, hi = placed.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (placed[mid].left < box.left) lo = mid + 1; else hi = mid; }
      if (lo && placed[lo - 1].right + gap > box.left || lo < placed.length && box.right + gap > placed[lo].left) continue;
      placed.splice(lo, 0, { ...candidate, ...box, anchor }); epochs.add(tick.at); break;
    }
  }
  return placed.sort((a, b) => a.index - b.index);
}

/* a widget's legend stays on one line so the plates stay level: what does not fit is folded into "+N" (its title lists the names), the entries that stay are whole ones */
/* a widget's legend names every line and level in its head: up to LEGEND_INLINE entries always show (on two lines when one is too short), only what is beyond them
   and does not fit on one line folds into "+N" (its title lists the names; pointing at it lists them as entries) */
const LEGEND_INLINE = 5;
function fitLegend(el) {
  const legend = el.closest('.card.widget')?.querySelector('.card-h > .legend'), more = legend?.querySelector('.legend-more');
  if (!more) return;
  const items = [...legend.children].filter(x => x !== more), count = more.querySelector('.legend-more-n'), pop = more.querySelector('.legend-pop-in');
  legend.classList.add('fitted'); legend.classList.remove('wraps');
  items.forEach(x => { x.hidden = false; }); more.hidden = true;
  /* end-aligned content overflows to the start, which scrollWidth does not report: the span of the entries is measured */
  const spans = () => { const r = [...legend.children].filter(x => !x.hidden).map(x => x.getBoundingClientRect()); return r.length ? Math.max(...r.map(x => x.right)) - Math.min(...r.map(x => x.left)) : 0; }, fits = () => spans() <= legend.clientWidth + 1;
  pop.replaceChildren();
  if (fits()) { more.removeAttribute('title'); return; }
  let cut = items.length;
  if (items.length > LEGEND_INLINE) {
    more.hidden = false;
    while (cut > LEGEND_INLINE) { cut--; items[cut].hidden = true; count.textContent = `+${items.length - cut}`; if (fits()) break; }
    more.title = items.slice(cut).map(x => x.textContent.trim()).join(', ');
    /* the rest, as entries of their own: the same press (it names its line by data-chart-series) and the same pressed state */
    for (const hiddenItem of items.slice(cut)) { const copy = hiddenItem.cloneNode(true); copy.hidden = false; pop.append(copy); }
  } else more.removeAttribute('title');
  if (!fits()) legend.classList.add('wraps'); /* what must show and does not fit on one line takes a second line in the head */
}


function refreshChart(el, force = false, restoreFocus = true) {
  if (el.dataset.chart === undefined) return; /* a chart that became a state plate in place (a redraw): nothing to draw until it has data again */
  const doc = el.ownerDocument;
    if (!force && el._w === el.clientWidth && el._source === el.dataset.chart && !(el._chart && el.clientWidth > 0 && el.offsetHeight !== Math.round(el._chart.time?.height ?? el._chart.H))) { syncSeries(el); return; }
    if (el._source !== el.dataset.chart && el._chart) {
      const names = el._chart.c.series, nextChart = JSON.parse(el.dataset.chart), next = nextChart.series || [];
      if (!!el._chart.time !== (nextChart.timeAxis !== undefined)) { el._hiddenSeries = new Set(); clearPoint(el); }
      else if (el._chart.time) el._hiddenSeries = new Set([...el._hiddenSeries].map(index => next.findIndex(series => series.key === names[index].key)).filter(index => index >= 0));
      else el._hiddenSeries = new Set([...el._hiddenSeries].map(index => {
        const name = names[index].name;
        return names.filter(series => series.name === name).length === 1 && next.filter(series => series.name === name).length === 1 ? next.findIndex(series => series.name === name) : -1;
      }).filter(index => index >= 0));
    }
    /* chart.hidden (the page's own list of the lines that are off, by key or name): the page keeps that state where it has other views of it (the large view's table) */
    const parsed = JSON.parse(el.dataset.chart);
    if (Array.isArray(parsed.hidden)) el._hiddenSeries = new Set((parsed.series || []).map((line, i) => parsed.hidden.includes(line.key ?? line.name) ? i : -1).filter(i => i >= 0));
    const width = el.clientWidth, source = el.dataset.chart;
    draw(el);
    el._w = width; el._source = source;
    fitLegend(el);
    if (restoreFocus && el._legendFocus?.isConnected && doc.activeElement === doc.body) el._legendFocus.focus({ preventScroll: true });
    if (!el._legendFocus?.isConnected) delete el._legendFocus;
    if (el.matches(':hover') && el.classList.contains('hover')) showPoint(el, el._point || 0);
    else if (!restPoint(el) && el.classList.contains('hover')) showPoint(el, el._point || 0);
  }

/* geometry of a widget plate (svg units = px): the tick marks under the plot, the time labels' baseline, the room beside the plot and the gap between labels */
/* the opacity of a faded area under its mask (svg areas) and the strength its gradient starts from (engine areas): one value for both */
const FADE_AREA = .6;
const fadeArea = c => FADE_AREA * (c.series.length > 1 ? .55 : 1); /* overlapping areas each take less, so what is under another stays readable */
const PLATE = { scaleX: 12, tickFrom: 2, tickTo: 8, labelUp: 7, edge: 12, gap: 8, scalePad: 8, top: 18, bottom: 26, right: 2 }; /* fixed room: the plot gets the rest, a tall plate does not grow its margins */

/* a widget plate rests with the drawing filling it; on hover the drawing shrinks toward the top right (view) and leaves room for the value scale and the times */
function insetView(el, c, W, H, labels) {
  if (!c.bleed) return null;
  const l = axisGutter(el, labels, c.axisUnit, 0) + PLATE.scalePad, t = PLATE.top, r = PLATE.right, b = PLATE.bottom; /* the scale text sits 12 in, the plot starts 14 after it, and runs to the plate's right edge */
  const view = { l, t, r, b, sx: (W - l - r) / W, sy: (H - t - b) / H };
  view.edge = PLATE.edge; view.gap = PLATE.gap;
  view.css = `--tx:${l}px;--ty:${t}px;--sx:${view.sx};--sy:${view.sy}`; /* on the svg itself: a page re-render restores the plate's own style, never the drawing's */
  return view;
}

/* the times under a widget plate: each is told its own place. The first starts at the plot's left, the last ends inside the plate, the ones between stay centred on
 * their tick but are held clear of their neighbours and of the plate's edge, so a long label is moved instead of cut (the reference does the same). */
function bleedLabels(el, items, W, view) {
  const doc = el.ownerDocument, svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'), text = doc.createElementNS(svg.namespaceURI, 'text');
  svg.setAttribute('aria-hidden', 'true'); svg.style.position = 'absolute'; svg.style.visibility = 'hidden'; text.setAttribute('class', 'axis xl'); svg.append(text); el.append(svg);
  const edge = view.edge, widths = items.map(it => { text.textContent = it.label; try { const w = text.getComputedTextLength(); return w > 0 ? w : it.label.length * 7; } catch { return it.label.length * 7; } });
  svg.remove();
  const n = items.length, out = items.map((it, i) => ({ ...it, w: widths[i], anchor: 'middle', at: it.x }));
  if (n) { out[0].anchor = 'start'; out[0].at = Math.max(edge, it0(items)); out[n - 1].anchor = n > 1 ? 'end' : 'start'; if (n > 1) out[n - 1].at = Math.min(W - edge, items[n - 1].x); }
  const gap = view.gap;
  for (let i = 1; i < n - 1; i++) {
    const lo = (out[i - 1].anchor === 'start' ? out[i - 1].at + out[i - 1].w : out[i - 1].at + out[i - 1].w / 2) + gap + out[i].w / 2, last = out[n - 1], hi = (last.anchor === 'end' ? last.at - last.w : last.at) - gap - out[i].w / 2;
    out[i].at = Math.max(lo, Math.min(hi, items[i].x));
    if (lo > hi) out[i].skip = true;
  }
  return out;
}
const it0 = items => items[0].x;

function axisGutter(el, labels, axisUnit, floor) {
  const svg = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const text = el.ownerDocument.createElementNS(svg.namespaceURI, 'text');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute'; svg.style.visibility = 'hidden';
  text.setAttribute('class', 'axis'); text.setAttribute('text-anchor', 'end');
  svg.append(text); el.append(svg);
  try {
    const fontSize = parseFloat(el.ownerDocument.defaultView.getComputedStyle(text).fontSize);
    let width = 0;
    for (const label of labels) {
      text.textContent = label;
      // A hidden host may have no SVG metrics yet; reserve one em per glyph until its resize/font refresh.
      let extent = Array.from(label).length * fontSize;
      try {
        const measured = text.getComputedTextLength();
        if (measured > 0) extent = Math.max(measured, -text.getBBox().x);
      } catch { /* SVG metrics are unavailable until the host can be measured. */ }
      width = Math.max(width, extent);
    }
    return Math.max(floor ?? (axisUnit === false ? 44 : 56), Math.ceil(width) + 8);
  } finally { svg.remove(); }
}

function draw(el) {
  const previous = el._chart?.time ? undefined : el._chart?.c, first = !el.querySelector(':scope > svg'); /* a plate that was a time chart has no categories to carry over */
  const motion = !el.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const c = JSON.parse(el.dataset.chart);
  if (c.timeAxis !== undefined) { drawTime(el, c); return; }
  disposeEngine(el);
  const selected = previous?.x?.[el._point];
  c.x ||= [];
  c.series = (c.series || []).map(series => ({ ...series, values: series.values || [] }));
  Object.assign(c, widgetFit(c, c.series.flatMap(series => series.values)));
  const max = c.max > 0 ? c.max : Math.max(1, ...c.series.flatMap(series => series.values.filter(Number.isFinite)));
  const labels = c.ticks.map(tick => axisValue(tick, c));
  const W = el.clientWidth || 300, padL = c.bleed ? 0 : axisGutter(el, labels, c.axisUnit), padB = c.bleed ? 0 : 24, padT = c.bleed ? 0 : c.ref || el.closest('.chart-aligned') ? 30 : 6;
  const H = aspectHeight(el, c, W, compactRefHeight(el, c, max, padB + padT));
  if (el.style.height !== `${H}px`) el.style.height = `${H}px`; /* the plate takes the height it is drawn at (its own: a page redraw keeps it) */
  const iw = W - padL - (c.bleed ? 0 : 8), ih = H - padB - padT, n = c.x.length;
  const lo = Number.isFinite(c.min) ? c.min : 0, py = v => padT + ih - (v - lo) / (max - lo) * ih; /* c.min: the scale starts at the data's own low end instead of zero */
  const occurrences = new Map();
  const sampleKeys = c.x.map(x => { const count = occurrences.get(x) || 0; occurrences.set(x, count + 1); return JSON.stringify([x, count]); });
  const sampleKey = i => sampleKeys[i];
  const segKey = i => c.reading ? 'seg' + i : sampleKey(i); /* a reading chart's line keeps its identity when the labels change, so new values reshape it */
  let s = '';
  const changed = [];
  const view = insetView(el, c, W, H, c.ticks.map(tick => axisValue(tick, c))), vx = v => view ? view.l + view.sx * v : v, vy = v => view ? view.t + view.sy * v : v;
  for (const tk of c.ticks) s += `<line class="gridl" x1="${padL}" x2="${c.bleed ? W : W - 8}" y1="${py(tk)}" y2="${py(tk)}"/><text class="axis" x="${c.bleed ? PLATE.scaleX : padL - 8}" y="${vy(py(tk)) + 4}" text-anchor="${c.bleed ? 'start' : 'end'}">${esc(axisValue(tk, c))}</text>`;
  const xt = [...new Set(c.xTicks || [0, Math.floor((n - 1) / 2), n - 1])].filter(i => i >= 0 && i < n);
  if (c.kind === 'bar') {
    const gap = 2, bw = iw / Math.max(1, n) - gap;
    const stacked = c.series.length > 1;
    const totals = Array(n).fill(0);
    c.series.forEach((series, index) => series.values.slice(0, n).forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const h = v / max * ih, x = padL + i * (bw + gap) + gap / 2, y = py(totals[i] + v);
      const r = stacked ? 0 : Math.min(4, h, bw / 2);
      const key = stacked ? JSON.stringify([index, sampleKey(i)]) : sampleKey(i);
      totals[i] += v;
      if (v) s += `<path class="${first ? 'grow' : ''}" data-key="${esc(key)}" data-series="${index}" data-sample="${i}" style="animation-delay:${i * 25}ms" fill="var(${series.color})" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z"/>`;
    }));
    if (c.xRange?.length === 2) s += `<text class="axis" x="${padL}" y="${H - 4}" text-anchor="start">${esc(c.xRange[0])}</text><text class="axis" x="${W - 8}" y="${H - 4}" text-anchor="end">${esc(c.xRange[1])}</text>`;
    else xt.forEach(i => s += `<text class="axis" x="${padL + i * (bw + gap) + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(c.x[i])}</text>`);
    c.px = i => padL + i * (bw + gap) + gap / 2 + bw / 2;
  } else {
    const px = i => padL + (n === 1 ? .5 : i / (n - 1)) * iw;
    if (c.ref) s += `<line x1="${padL}" x2="${W - 8}" y1="${py(c.ref.value)}" y2="${py(c.ref.value)}" stroke="var(--muted-foreground)" stroke-dasharray="3 3"/>`;
    s += refName(c, py, padL, W - 8, { vx, vy });
    const fo = c.series.length > 1 ? .12 : .2;
    /* c.slide: a series that arrives in steps (one new reading, the oldest gone) is not redrawn: the drawing it already has slides left by one step and the new reading
       comes in from the right edge, so what was on screen keeps its shape. A step is seen when the new values are the old ones shifted by one. */
    const shifted = !!c.slide && !!previous && previous.series.length === c.series.length && previous.x.length === n && c.series.every((se, k) => se.values.length === n && previous.series[k].values.slice(1).every((v, i) => v === se.values[i]));
    if (shifted) el._slide = (el._slide || 0) + 1;
    /* what is still left of the slide that is running is carried into the next one (it starts a step plus that remainder away), so a new reading never makes the drawing jump */
    const running = shifted && el.querySelector('.slide.run'), win0 = el.ownerDocument.defaultView;
    const carry = running ? Math.max(0, win0.DOMMatrixReadOnly ? new win0.DOMMatrixReadOnly(win0.getComputedStyle(running).transform).m41 : 0) : 0;
    const clipId = 'chart-slide-' + (el._uid ||= Math.random().toString(36).slice(2, 8));
    s += `<clipPath id="${clipId}"><rect x="${padL}" y="0" width="${iw}" height="${H}"/></clipPath>`;
    s += `<g data-key="plot" class="${first ? 'grow' : ''}">`;
    for (const [index, se] of c.series.entries()) {
      s += `<g data-series="${index}" data-key="${esc(JSON.stringify([se.name, c.series.slice(0, index).filter(s => s.name === se.name).length]))}">`;
      /* the frame (clip) stays where it is; only the group inside it moves, so the edge of the plot never travels with the drawing */
      if (c.slide) s += `<g data-key="slideframe" clip-path="url(#${clipId})"><g data-key="slide${shifted ? el._slide : 'rest'}" class="${shifted ? 'slide run' : 'slide'}" style="--slide:${px(1) - px(0) + carry}px;--slide-ms:${c.slideMs ? c.slideMs + 'ms' : 'var(--dur-slide)'}">`;
      const segments = [];
      const lead = shifted ? previous.series[index].values[0] : undefined; /* the reading that is leaving: still drawn, on the left, until the slide has taken it out */
      if (Number.isFinite(lead)) segments.push([{ i: -1, v: lead }]);
      se.values.slice(0, n).forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        if (i === 0 && Number.isFinite(lead)) { segments.at(-1).push({ i, v }); return; }
        if (i === 0 || !Number.isFinite(se.values[i - 1])) segments.push([]);
        segments.at(-1).push({ i, v });
      });
      for (const points of segments) {
        if (points.length === 1) {
          const { i, v } = points[0];
          s += `<circle data-key="${esc('point' + sampleKey(i))}" data-latest="${i === n - 1 ? index : ''}" cx="${px(i)}" cy="${py(v)}" r="3" fill="var(${se.color})"/>`;
          continue;
        }
        const d = points.map(({ i, v }, k) => (k ? 'L' : 'M') + px(i) + ',' + py(v)).join(' ');
        if (c.kind === 'area') s += `<path data-key="${esc('area' + segKey(points[0].i))}" fill="var(${se.color})" fill-opacity="${c.fade ? fadeArea(c) : fo}"${fadeAttr(c)}${morphD(c, `${d} L${px(points.at(-1).i)},${py(lo)} L${px(points[0].i)},${py(lo)} Z`)} d="${d} L${px(points.at(-1).i)},${py(lo)} L${px(points[0].i)},${py(lo)} Z"/>`;
        s += `<path data-key="${esc('line' + segKey(points[0].i))}" class="ln" stroke="var(${se.color})" stroke-dasharray="${esc(se.dash ?? (index === 1 ? '5 3' : index > 1 ? '2 3' : 'none'))}"${morphD(c, d)} d="${d}"/>`;
      }
      const last = n - 1, oldIndex = previous?.x.lastIndexOf(c.x[last]);
      const updated = previous && (oldIndex < 0 || previous.series[index]?.name !== se.name || previous.series[index]?.values[oldIndex] !== se.values[last] || previous.x.length !== n);
      if (motion && updated && !c.slide && last > 0 && Number.isFinite(se.values[last]) && Number.isFinite(se.values[last - 1])) {
        const start = last > 0 && Number.isFinite(se.values[last - 1]) ? last - 1 : last;
        const d = `M${px(start)},${py(se.values[start])} L${px(last)},${py(se.values[last])}`;
        s += `<path data-key="latest" data-latest="${index}" class="ln" stroke="var(${se.color})" stroke-dasharray="${esc(se.dash ?? (index === 1 ? '5 3' : index > 1 ? '2 3' : 'none'))}" d="${d}"/>`;
      }
      if (updated && Number.isFinite(se.values[last])) changed.push(index);
      if (c.slide) s += '</g></g>';
      s += '</g>';
    }
    s += '</g>';
    if (c.bleed) {
      for (const it of bleedLabels(el, xt.map(i => ({ x: vx(px(i)), label: String(c.x[i]) })), W, view)) {
        s += `<line class="xtick" x1="${it.x}" x2="${it.x}" y1="${H - view.b + PLATE.tickFrom}" y2="${H - view.b + PLATE.tickTo}"/>`;
        if (!it.skip) s += `<text class="axis xl" x="${it.at}" y="${H - PLATE.labelUp}" text-anchor="${it.anchor}">${esc(it.label)}</text>`;
      }
    } else xt.forEach(i => s += `<text class="axis xl" x="${px(i)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(c.x[i])}</text>`);
    c.px = px; c.py = py;
  }
  s += fadeDefs(c) + averageLine(c, py, padL, padL + iw, { vx, vy }) + `<line data-key="crosshair" class="xh" x1="0" x2="0" y1="${padT}" y2="${padT + ih}"/>${dotMark(c)}<rect x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent" data-key="hit" data-hit/>`;
  morph(el, `<svg data-key="svg" viewBox="0 0 ${W} ${H}" style="height:${H}px${view ? ';' + view.css : ''}" role="img">${s}</svg><div data-key="tooltip" class="chart-tip" data-own-children data-own-attrs="style" role="status" aria-live="polite"></div>` + (c.ref?.label ? `<div class="ref-label"></div>` : ''));
  if (c.ref?.label) el.querySelector('.ref-label').textContent = c.ref.label;
  { const lines = [];
    if (c.kind === 'bar') { const totals = Array(n).fill(0); c.series.forEach((series, k) => series.values.slice(0, n).forEach((v, i) => { if (Number.isFinite(v)) totals[i] += el._hiddenSeries?.has(k) ? 0 : v; })); lines.push(totals.map((v, i) => [vx(c.px(i)), vy(py(v))])); }
    else c.series.forEach((series, k) => { if (!el._hiddenSeries?.has(k)) lines.push(series.values.slice(0, n).map((v, i) => Number.isFinite(v) ? [vx(c.px(i)), vy(py(v))] : null).filter(Boolean)); });
    placeLevels(el, lines, c.kind !== 'line', { left: vx(padL), right: vx(padL + iw), top: vy(padT), bottom: vy(padT + ih) }); }
  el._chart = { c, W, H, padL, iw, view, n };
  if (selected !== undefined) {
    let candidates = c.x.flatMap((x, i) => x === selected ? [i] : []);
    const oldCandidates = previous.x.flatMap((x, i) => x === selected ? [i] : []);
    if (oldCandidates.length > 1 || candidates.length > 1) {
      const names = previous.series.map(series => series.name);
      const comparable = new Set(names).size === names.length && names.length === c.series.length && names.every(name => c.series.filter(series => series.name === name).length === 1);
      const matches = (chart, index) => comparable && previous.series.every(series => Object.is(series.values[el._point], chart.series.find(next => next.name === series.name).values[index]));
      candidates = oldCandidates.filter(i => matches(previous, i)).length === 1 ? candidates.filter(i => matches(c, i)) : [];
    }
    if (candidates.length === 1) el._point = candidates[0]; else clearPoint(el);
  }
  if (!first && motion) {
    const style = el.ownerDocument.defaultView.getComputedStyle(el), time = style.getPropertyValue('--dur-chart').trim();
    const duration = parseFloat(time) * (time.endsWith('ms') ? 1 : 1000);
    const targets = c.kind === 'bar'
      ? [...el.querySelectorAll('[data-sample]')].filter(node => Number(node.dataset.sample) === n - 1 && (previous?.x.at(-1) !== c.x.at(-1) || previous?.series[0]?.values.at(-1) !== c.series[0]?.values.at(-1)))
      : changed.map(index => el.querySelector(`[data-latest="${index}"]`));
    for (const node of targets.filter(Boolean)) {
      node.getAnimations().forEach(animation => animation.cancel());
      if (!(duration > 0)) { if (node.dataset.key === 'latest') node.remove(); continue; }
      const animation = node.animate(c.kind === 'bar' || node.tagName.toLowerCase() === 'circle' ? [{ opacity: .4 }, { opacity: 1 }] : [{ strokeWidth: 4 }, { strokeWidth: 2 }], { duration, easing: style.getPropertyValue('--ease-standard').trim() || 'ease' });
      animation.onfinish = () => { animation.cancel(); if (node.dataset.key === 'latest') node.remove(); };
    }
  }
  syncSeries(el);
}

function compactRefHeight(el, c, max, padding) {
  if (!c.ref || !el.closest('.card.compact')) return c.height;
  const ticks = [...new Set(c.ticks.filter(Number.isFinite))].sort((a, b) => a - b);
  const gaps = ticks.slice(1).map((tick, i) => tick - ticks[i]);
  if (!gaps.length) return c.height;
  const lineHeight = parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue('--leading-xs'));
  const height = padding + Math.ceil(lineHeight * max / Math.min(...gaps));
  return Number.isFinite(height) && lineHeight > 0 ? Math.max(c.height, height) : c.height;
}

/* a line pointed at from outside the chart (its row in the large view's table): the others step back, and it is the one in full; null puts them all back */
export function focusSeries(el, index) {
  if (!el?._chart) return;
  el._focus = Number.isInteger(index) ? index : null;
  el.querySelectorAll('[data-series]').forEach(line => { line.style.opacity = el._focus === null || Number(line.dataset.series) === el._focus ? '' : String(parseFloat(getComputedStyle(el).getPropertyValue('--chart-dim-o'))); });
  el._chart.time?.paint?.();
}

function syncSeries(el) {
  const hidden = el._hiddenSeries ||= new Set();
  el.querySelectorAll('[data-series]').forEach(series => { series.style.display = hidden.has(Number(series.dataset.series)) ? 'none' : ''; });
  el.closest('.card').querySelectorAll('[data-chart-series]').forEach(button => button.setAttribute('aria-pressed', String(!hidden.has(Number(button.dataset.chartSeries)))));
  restoreTimePoint(el);
  const paint = el._chart?.time?.paint;
  if (paint) {
    try { paint(); } catch {
      // The engine broke at runtime: fall back to the SVG series for good and redraw once.
      if (el._engine) { el._engine.status = 'failed'; disposeTemporal(el._engine); }
      refreshChart(el, true, false);
    }
  }
}

/* the narrowest window a marked span zooms to, in seconds */
const MIN_WINDOW = 60;
const zoomSlop = el => parseFloat(getComputedStyle(el).getPropertyValue('--chart-zoom-slop')) || 0; /* the least drag that is a selection, not a click */

function showPoint(el, index, follow) {
  if (el._chart.time) { showTimePoint(el, index, follow); return; }
  const { c, W, n } = el._chart;
  const i = Math.max(0, Math.min(n - 1, index));
  const rows = c.series.filter((series, k) => !el._hiddenSeries.has(k) && Number.isFinite(series.values[i]));
  if (!n || !rows.length) { el.classList.remove('hover'); return; }
  let x0 = c.px(i), yValue = rows[0].values[i];
  if (c.reading && follow !== undefined && n > 1) {
    const a = c.px(0), b = c.px(n - 1), f = (Math.max(a, Math.min(b, follow)) - a) / (b - a) * (n - 1), i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), v0 = rows[0].values[i0], v1 = rows[0].values[i1];
    x0 = a + f / (n - 1) * (b - a); if (Number.isFinite(v0) && Number.isFinite(v1)) yValue = v0 + (v1 - v0) * (f - i0);
  }
  const v = el._chart.view, x = v ? v.l + v.sx * x0 : x0;
  el._point = i;
  const rule = el.querySelector('.xh');
  rule.setAttribute('x1', x); rule.setAttribute('x2', x);
  if (v) { rule.setAttribute('y1', v.t); rule.setAttribute('y2', el._chart.H - v.b); }
  const tip = el.querySelector('.chart-tip');
  tip.innerHTML = `<div class="t">${esc(c.x[i])}</div>` + rows.map(series => `<div class="r"><i style="background:var(${esc(series.color)})"></i><span>${esc(series.name)}</span><b>${esc(chartValue(series.values[i], c))}</b></div>`).join('');
  el.classList.add('hover');
  if (c.reading && c.py && c.series.length > 1) {
    const lines = c.series.map((series, k) => ({ series, k })).filter(({ k }) => !el._hiddenSeries.has(k)).map(({ series, k }) => {
      let value = series.values[i];
      if (follow !== undefined && n > 1) {
        const a = c.px(0), b = c.px(n - 1), f = (Math.max(a, Math.min(b, follow)) - a) / (b - a) * (n - 1), i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), v0 = series.values[i0], v1 = series.values[i1];
        value = f === i0 ? v0 : Number.isFinite(v0) && Number.isFinite(v1) ? v0 + (v1 - v0) * (f - i0) : null; /* between a reading and a missing one there is no value */
      }
      if (!Number.isFinite(value)) return { k, color: series.color, name: series.name, value: '—', y: null };
      return { k, color: series.color, name: series.name, value: chartValue(readable(value), c), y: v ? v.t + v.sy * c.py(value) : c.py(value) };
    });
    placeRows(el, tip, x, W, c.x[i], lines); return;
  }
  if (c.reading && c.py) { placeReading(el, tip, x, v ? v.t + v.sy * c.py(yValue) : c.py(yValue), W, rows[0].color, chartValue(readable(rows[0].values[i]), c), c.x[i]); return; }
  tip.style.left = Math.max(0, Math.min(x / W * el.clientWidth + 12, el.clientWidth - tip.offsetWidth)) + 'px';
  tip.style.top = '0';
}

/* a chart that holds a reading at rest (c.rest === 'last', the large view): with no pointer on it, the reading is the latest sample's, the same state as a hover */
/* an event's mark is a target of its own: with the pointer on it the reading is the event (its kind, its name, its time), not the line's value there */
function eventNear(el, plotX, plotY) {
  const { c, time } = el._chart, slop = parseFloat(getComputedStyle(el).getPropertyValue('--chart-event-hit')) || 0;
  if (el._chart.events === 'none') return null;
  if (el._chart.events === 'row' && Number.isFinite(plotY) && plotY < el._chart.padT + el._chart.ih - EVENT_APART) return null; /* a row of marks is a target only at the foot of the plot: above it the line is read */
  let best = null;
  eventGroups(c, time.px, time.from, time.to).forEach(g => { const d = Math.abs(g.x - plotX); if (d <= slop + (g.items.length > 1 ? EVENT_APART / 2 : 0) && (!best || d < best.d)) best = { ev: g.items[0].e, k: g.k, d, all: g.items.map(m => m.e) }; });
  return best;
}
function showEventPoint(el, { ev, k, all = [ev] }) {
  const { W, time } = el._chart, v = el._chart.view, x = time.px(ev.at), X = v ? v.l + v.sx * x : x;
  const records = timeRecords(el); let near = records[0]; records.forEach(r => { if (Math.abs(r.at - ev.at) < Math.abs(near.at - ev.at)) near = r; });
  const tip = el.querySelector('.chart-tip');
  el.querySelectorAll('.evg.on').forEach(g => g.classList.remove('on')); el.querySelector(`.evg[data-ev="${k}"]`)?.classList.add('on');
  const kinds = [...new Set(all.map(e => e.kind || e.label))], head = all.length > 1 ? (kinds.length === 1 ? `${kinds[0]} ${all.length}` : kinds.slice(0, 2).join(' · ') + (kinds.length > 2 ? ` +${kinds.length - 2}` : '')) : ev.kind || ev.label, tone = all.reduce((t, e) => (EVENT_RANK[e.tone] ?? 0) > (EVENT_RANK[t] ?? 0) ? e.tone : t, ev.tone);
  tip.innerHTML = all.length > 1 /* a joined mark lists its events (the first few), as the change timeline's joined dot does */
    ? `<div class="rv"${tone ? ` data-tone="${esc(tone)}"` : ''}>${esc(head)}</div>` + all.slice(0, 6).map(e => `<div class="t">${esc([e.time, e.kind ? e.label : ''].filter(Boolean).join(' · '))}</div>`).join('') + (all.length > 6 ? `<div class="t">+${all.length - 6}</div>` : '')
    : `<div class="rv"${ev.tone ? ` data-tone="${esc(ev.tone)}"` : ''}>${esc(ev.kind || ev.label)}</div>${ev.kind ? `<div class="t">${esc(ev.label)}</div>` : ''}<div class="t">${esc(ev.time ?? (near ? observationLabel(near, el._chart.c.timeAxis.timeZone) : ''))}</div>`; /* the same reading as a value's: a large first line, small lines under it, no box */
  el.classList.add('hover', 'evt-on');
  placeTip(el, tip, X, W, []);
}

function restPoint(el) {
  const c = el._chart?.c;
  if (c?.rest !== 'last') return false;
  if (el._chart.time) { const records = timeRecords(el); if (!records.length) return false; let last = 0; records.forEach((r, i) => { if (r.at >= records[last].at) last = i; }); showTimePoint(el, last); return true; }
  showPoint(el, el._chart.n - 1); return true;
}

function clearPoint(el) {
  el.classList.remove('hover', 'evt-on');
  el.querySelectorAll('.axis.dodged').forEach(n => n.classList.remove('dodged'));
  delete el._point; delete el._timePoint;
  el.querySelector('.chart-tip')?.replaceChildren();
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  /* chart info: the ⓘ opens and closes its panel; Escape or a press outside closes it and gives the focus back */
  const closeInfo = (pop, focus) => { if (!pop || pop.hidden) return; pop.hidden = true; const b = pop.previousElementSibling; b?.setAttribute('aria-expanded', 'false'); if (focus) b?.focus({ preventScroll: true }); };
  root.addEventListener('click', e => {
    const b = e.target.closest?.('[data-card-info]');
    root.querySelectorAll('.card-info-pop:not([hidden])').forEach(pop => { if (pop.previousElementSibling !== b && !pop.contains(e.target)) closeInfo(pop, false); });
    if (!b) return;
    const pop = b.nextElementSibling, open = pop.hidden;
    if (!open) { closeInfo(pop, false); return; }
    pop.hidden = false; b.setAttribute('aria-expanded', 'true'); placeInfo(pop, b); pop.focus({ preventScroll: true });
  });
  /* placed the way every floating layer is (core/position.js): under the ⓘ, its start at the ⓘ, flipped up or moved in where the window ends */
  const placeInfo = (pop, b) => { const p = placeLayer(pop, b.getBoundingClientRect(), { side: 'bottom', align: 'start', sideOffset: cssNumber(pop, '--space-1') || 4, padding: EDGE }); pop.style.left = p.x + 'px'; pop.style.top = p.y + 'px'; pop.style.transformOrigin = p.transformOrigin; };
  const replace = () => root.querySelectorAll('.card-info-pop:not([hidden])').forEach(pop => placeInfo(pop, pop.previousElementSibling));
  win.addEventListener('resize', replace); win.addEventListener('scroll', replace, { capture: true, passive: true });
  root.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const pop = e.target.closest?.('.card-info-pop') || e.target.closest?.('.card-info')?.querySelector('.card-info-pop'); if (pop && !pop.hidden) { e.preventDefault(); e.stopPropagation(); closeInfo(pop, true); } }, true);
  const controller = new win.AbortController(), options = { signal: controller.signal }, tracked = new Map();
  const refresh = refreshChart;
  const resize = new win.ResizeObserver(entries => entries.forEach(e => (e.target.matches('.chart-state') ? fitQuietly(e.target) : refresh(e.target))));
  /* fitting rewrites the legend's own attributes: what it changes must not restart the scan that asked for it (the scan would ask again, for ever) */
  const fitQuietly = el => { fitLegend(el); mutations.takeRecords(); };
  const scan = () => {
    for (const el of tracked.keys()) if (!root.contains(el)) { resize.unobserve(el); clearPoint(el); disposeEngine(el); tracked.delete(el); }
    root.querySelectorAll('.chart[data-chart]').forEach(el => {
      if (!tracked.has(el)) { tracked.set(el, true); resize.observe(el); }
      refresh(el);
      fitQuietly(el); /* a redraw of the page rewrites the legend (it comes back with every entry showing) while the plate itself is unchanged and is not drawn again: the legend is fitted every time, not only when the plate is */
    });
    /* a plate that only says why it has nothing to draw still has a legend over it to fit */
    root.querySelectorAll('.chart-state').forEach(el => {
      if (!tracked.has(el)) { tracked.set(el, true); resize.observe(el); }
      fitQuietly(el);
    });
  };
  // The engine rewrites its own subtree on every paint; reacting to that would loop paint -> mutation -> scan.
  const mutations = new win.MutationObserver(records => { if (!records.every(record => record.target.closest?.('.chart-engine'))) scan(); });
  mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-chart', 'hidden'] }); /* hidden: a page redraw gives the legend its entries back (the morph removes the attribute the fitting set), and the fitting is asked for again */
  // Engine colors are concrete values, so a theme switch needs a repaint (the SVG fallback follows CSS variables by itself).
  const theme = new win.MutationObserver(() => tracked.forEach((_, el) => { if (el._engine?.instance) refresh(el, true); }));
  theme.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  /* the page's zone (data-time-zone) changed: every time on every chart is written again */
  const zone = new win.MutationObserver(() => tracked.forEach((_, el) => refresh(el, true)));
  zone.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-time-zone'] });
  root.addEventListener('pointermove', e => {
    const el = e.target.closest?.('.chart[data-chart]');
    if (!el?._chart) return;
    if (el._chart.time) {
      const { W, padL, iw, time } = el._chart, rect = el.querySelector(':scope > svg').getBoundingClientRect(), records = timeRecords(el);
      if (!records.length) { clearPoint(el); return; }
      const v = el._chart.view, plotX = v ? ((e.clientX - rect.left) * W / rect.width - v.l) / v.sx : (e.clientX - rect.left) * W / rect.width;
      const at = time.from + (plotX - padL) / iw * (time.to - time.from), plotY = v ? ((e.clientY - rect.top) * time.height / rect.height - v.t) / v.sy : (e.clientY - rect.top) * time.height / rect.height;
      const onEvent = eventNear(el, plotX, plotY); if (onEvent) { showEventPoint(el, onEvent); return; }
      let nearest = 0; records.forEach((point, index) => { if (Math.abs(point.at - at) < Math.abs(records[nearest].at - at)) nearest = index; });
      showTimePoint(el, nearest, at); return;
    }
    const { W, padL, iw, n } = el._chart, rect = el.querySelector(':scope > svg').getBoundingClientRect();
    const v = el._chart.view, plotX = v ? ((e.clientX - rect.left) * W / rect.width - v.l) / v.sx : (e.clientX - rect.left) * W / rect.width;
    showPoint(el, Math.round((plotX - padL) / iw * (n - 1)), plotX);
  }, options);
  /* time charts: the reader's window, as the dashboards people already use set it (kit/CONTRACTS.md, Charts): a drag across the plot marks a span and shows it, rounded out
     to the marks' step; a double click on the plot shows twice as much around its middle. The wheel always scrolls the page and nothing pans; the values fit what is shown.
     chart.rangeAction is told { id, from, to, source: 'select' | 'zoomout' } (a zoom out past the data asks the page for the wider window it names);
     chart.zoomAction (the older form, the page owns the window) is told { from, to } of a marked span instead. A chart with interactive 'none' only reads. */
  let drag = null;
  const place = (el, e) => {
    const { W, view: v, time } = el._chart, rect = el.querySelector(':scope > svg').getBoundingClientRect();
    const X = (e.clientX - rect.left) * W / rect.width, plotX = v ? (X - v.l) / v.sx : X;
    return { at: time.from + (plotX - el._chart.padL) / el._chart.iw * (time.to - time.from) };
  };
  const timeAt = (el, e) => { const { time } = el._chart; return Math.max(time.from, Math.min(time.to, place(el, e).at)); };
  const setRange = (el, range, source, told = range) => {
    const { c, time } = el._chart;
    el._range = range && !wholeRange(range, time.full) ? range : null;
    refreshChart(el, true, false);
    if (!c.rangeAction) return;
    const r = told || el._range || time.full;
    ctx.emit(c.rangeAction, { id: c.id ?? null, from: Math.round(r.from), to: Math.round(r.to), source });
  };
  /* the axes move to the new window over --dur-plot, easing out; with reduced motion they are there at once. The page is told once, at the end */
  const glide = (el, target, source, told) => {
    const { time } = el._chart, from = el._range || time.full, to = target || time.full;
    const dur = win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : cssNumber(el, '--dur-plot') || 0, start = win.performance.now(), mine = el._glide = {};
    const step = now => {
      if (el._glide !== mine || !el.isConnected) return;
      const k = dur ? Math.min(1, (now - start) / dur) : 1, e = 1 - (1 - k) ** 3, mix = (a, b) => a + (b - a) * e;
      if (k < 1) { el._range = { from: mix(from.from, to.from), to: mix(from.to, to.to) }; refreshChart(el, true, false); win.requestAnimationFrame(step); return; }
      setRange(el, target, source, told);
    };
    win.requestAnimationFrame(step);
  };
  const full = el => el?._chart?.time && el.dataset.interactive !== 'none';
  /* the axes (kit/CONTRACTS.md, Charts): a drag along the time marks stretches the window around its middle (to the right narrower, to the left wider), a drag along the
     value scale stretches the values from their low end (upward narrower, downward wider); a double click on an axis takes it back (the window before the first stretch,
     the values fitted again). The keyboard on a focused chart does the same: - and + the window, Shift with the up and down arrows the values, 0 both back. While an axis is
     dragged the range it now shows is read out in the plot. The window is told to the page as { source: 'scale' } (wider than the data: 'zoomout', naming the window asked
     for), so charts kept in step move together; the value range is the chart's own (charts in step carry different units). */
  let stretch = null;
  const plotBox = el => {
    const { W, H, view: v, padL, padT, iw, ih } = el._chart, box = el.getBoundingClientRect(), kx = box.width / W, ky = box.height / H;
    return v ? { l: v.l * kx, t: v.t * ky, w: (W - v.l - v.r) * kx, h: (H - v.t - v.b) * ky } : { l: padL * kx, t: padT * ky, w: iw * kx, h: ih * ky };
  };
  const shown = el => ({ from: el._chart.time.from, to: el._chart.time.to });
  const STRETCH = 64; /* the most one stretch narrows or widens: past it the plot would be a dot or a line */
  const factor = (d, room) => Math.min(STRETCH, Math.max(1 / STRETCH, 2 ** (d / Math.max(1, room / 2)))); /* half the plot doubles or halves */
  const stretchedWindow = (base, f) => { const mid = (base.from + base.to) / 2, half = Math.max(MIN_WINDOW, (base.to - base.from) * f) / 2; return { from: mid - half, to: mid + half }; };
  const stretchedValues = (base, f) => ({ min: base.min, max: base.min + (base.max - base.min) * f });
  const fittedValues = el => el._yRange || { min: el._chart.time.min, max: el._chart.time.max };
  const scaleReading = (el, axis, text) => {
    let box = el.querySelector(':scope > .chart-scale');
    if (!box) { box = el.appendChild(Object.assign(doc.createElement('div'), { className: 'chart-scale' })); box.innerHTML = '<span class="cz-t"></span>'; }
    const p = plotBox(el); box.dataset.axis = axis;
    Object.assign(box.style, { left: p.l + 'px', top: p.t + 'px', width: p.w + 'px', height: p.h + 'px' });
    box.firstElementChild.textContent = text;
  };
  const windowWords = (el, r) => { const z = zoneOf(el, el._chart.c), d = r.to - r.from; return `${shortTime(r.from, d, z)} – ${shortTime(r.to, d, z)}`; };
  const valueWords = (el, r) => { const word = el._chart.c.axisLabel || (v => formatValue(v, el._chart.c.unit)); return `${word(r.min)} – ${word(r.max)}`; };
  /* the window shown while the time marks are held: inside the data, the axes and lines following the pointer; the page is told only at the end */
  const showWindow = (el, r) => { const { full: whole } = el._chart.time, held = panRange(r, 0, { bounds: whole }); el._range = wholeRange(held, whole) ? null : held; refreshChart(el, true, false); };
  const tellWindow = (el, r, { ease = false } = {}) => {
    const { c, time } = el._chart;
    if (c.zoomAction && !c.rangeAction) { ctx.emit(c.zoomAction, { from: Math.round(r.from), to: Math.round(r.to) }); return; } /* the page owns this window */
    const source = r.from < time.full.from - 1 || r.to > time.full.to + 1 ? 'zoomout' : 'scale', held = panRange(r, 0, { bounds: time.full });
    if (ease) glide(el, held, source, r); else setRange(el, held, source, r);
  };
  const fitValues = el => { delete el._yRange; refreshChart(el, true, false); };
  root.addEventListener('dblclick', e => {
    const el = e.target.closest?.('.chart[data-chart]');
    if (!full(el)) return;
    const axis = e.target.closest?.('[data-axis]')?.dataset.axis;
    if (axis === 'y') { fitValues(el); return; }
    if (axis === 'x') { const o = el._xOrigin; delete el._xOrigin; tellWindow(el, o || el._chart.time.full, { ease: true }); return; }
    const { time } = el._chart, mid = (time.from + time.to) / 2, span = time.to - time.from, wide = { from: mid - span, to: mid + span };
    if (el._chart.c.zoomAction && !el._chart.c.rangeAction) { ctx.emit(el._chart.c.zoomAction, { from: Math.round(wide.from), to: Math.round(wide.to) }); return; }
    glide(el, panRange(wide, 0, { bounds: time.full }), 'zoomout', wide);
  }, options);
  root.addEventListener('pointerdown', e => {
    const el = e.target.closest?.('.chart[data-chart]');
    if (!full(el) || e.button !== 0) return;
    const axis = e.target.closest?.('[data-axis]')?.dataset.axis;
    if (axis) { stretch = { el, axis, x0: e.clientX, y0: e.clientY, id: e.pointerId, moved: false, window: shown(el), values: fittedValues(el) }; return; }
    drag = { el, x0: e.clientX, at0: timeAt(el, e), id: e.pointerId, veil: null, moved: false };
  }, options);
  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || !drag.moved && Math.abs(e.clientX - drag.x0) < zoomSlop(drag.el)) return;
    if (!drag.moved) { drag.moved = true; drag.el.setPointerCapture?.(e.pointerId); }
    /* the marked span: a band in the app's colour with a handle at each edge and the times where it starts and ends */
    const { el } = drag, box = el.getBoundingClientRect(), v = el._chart.view, k = el._chart.H ? box.height / el._chart.H : 1, plotTop = (v ? v.t : el._chart.padT) * k, plotBottom = (v ? v.b : el._chart.H - el._chart.padT - el._chart.ih) * k, plotLeft = (v ? v.l : el._chart.padL) * k;
    el.classList.add('selecting');
    if (!drag.veil) { drag.veil = el.appendChild(Object.assign(doc.createElement('div'), { className: 'chart-zoom' })); drag.veil.innerHTML = '<span class="cz-t a"></span><span class="cz-t b"></span>'; }
    const [a, b] = drag.veil.children, { c } = el._chart;
    const l = Math.max(plotLeft, Math.min(drag.x0, e.clientX) - box.left), r = Math.max(drag.x0, e.clientX) - box.left, at1 = timeAt(el, e), lo = Math.min(drag.at0, at1), hi = Math.max(drag.at0, at1);
    Object.assign(drag.veil.style, { left: l + 'px', width: Math.max(0, r - l) + 'px', top: plotTop + 'px', bottom: plotBottom + 'px' });
    a.textContent = shortTime(lo, hi - lo, zoneOf(el, c)); b.textContent = shortTime(hi, hi - lo, zoneOf(el, c));
  }, options);
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { el, veil, at0, moved } = drag; drag = null; veil?.remove(); el.releasePointerCapture?.(e.pointerId); el.classList.remove('selecting');
    if (!moved || e.type === 'pointercancel') return;
    const at1 = timeAt(el, e), mid = (at0 + at1) / 2, half = Math.max(Math.abs(at1 - at0), MIN_WINDOW) / 2; /* a span shorter than a minute is widened around its middle */
    let from = mid - half, to = mid + half;
    const { full } = el._chart.time; if (from < full.from) { to += full.from - from; from = full.from; } if (to > full.to) { from = Math.max(full.from, from - (to - full.to)); to = full.to; }
    if (!(to - from > 0)) return;
    if (el._chart.c.zoomAction && !el._chart.c.rangeAction) { ctx.emit(el._chart.c.zoomAction, { from: Math.round(from), to: Math.round(to) }); return; } /* the page owns this window */
    const { time, iw } = el._chart;
    glide(el, snapRange({ from, to }, iw, { minPx: tickRoom(el), bounds: time.full }), 'select'); /* rounded out to the marks' step, and the axes move to it */
  };
  root.addEventListener('pointerup', endDrag, options);
  root.addEventListener('pointercancel', endDrag, options);
  root.addEventListener('pointermove', e => {
    if (!stretch || e.pointerId !== stretch.id) return;
    const { el, axis } = stretch, d = axis === 'x' ? e.clientX - stretch.x0 : e.clientY - stretch.y0;
    if (!stretch.moved && Math.abs(d) < zoomSlop(el)) return;
    if (!stretch.moved) { stretch.moved = true; el.setPointerCapture?.(e.pointerId); el.classList.add('selecting'); if (axis === 'x') el._xOrigin ??= stretch.window; }
    const room = plotBox(el);
    if (axis === 'x') { const r = stretch.asked = stretchedWindow(stretch.window, factor(-d, room.w)); showWindow(el, r); scaleReading(el, 'x', windowWords(el, r)); return; }
    el._yRange = stretchedValues(stretch.values, factor(d, room.h)); refreshChart(el, true, false); scaleReading(el, 'y', valueWords(el, el._yRange));
  }, options);
  const endStretch = e => {
    if (!stretch || e.pointerId !== stretch.id) return;
    const { el, axis, moved, asked } = stretch; stretch = null;
    el.releasePointerCapture?.(e.pointerId); el.classList.remove('selecting'); el.querySelector(':scope > .chart-scale')?.remove();
    if (moved && axis === 'x' && asked) tellWindow(el, asked);
  };
  root.addEventListener('pointerup', endStretch, options);
  root.addEventListener('pointercancel', endStretch, options);
  root.addEventListener('keydown', e => {
    const el = e.target.closest?.('.chart[data-chart]');
    if (!full(el) || e.altKey || e.metaKey || e.ctrlKey) return;
    if (['-', '+', '='].includes(e.key)) { e.preventDefault(); const base = shown(el); el._xOrigin ??= base; tellWindow(el, stretchedWindow(base, e.key === '-' ? 2 : .5), { ease: true }); return; }
    if (e.shiftKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); el._yRange = stretchedValues(fittedValues(el), e.key === 'ArrowUp' ? .5 : 2); refreshChart(el, true, false); return; }
    if (e.key === '0') { e.preventDefault(); delete el._yRange; const o = el._xOrigin; delete el._xOrigin; if (o) tellWindow(el, o, { ease: true }); else refreshChart(el, true, false); }
  }, options);
  /* the rest of a legend opens upward (the plate is below it); where the window has no room above, downward */
  const aim = e => {
    const more = e.target.closest?.('.legend-more');
    if (!more) return;
    const box = more.querySelector('.legend-pop'), pop = box.firstElementChild;
    box.style.display = 'block'; box.style.visibility = 'hidden'; /* measured where it would be, without showing it */
    const need = pop.offsetHeight + box.offsetHeight - pop.offsetHeight;
    box.style.display = ''; box.style.visibility = '';
    more.dataset.side = more.getBoundingClientRect().top < need ? 'down' : 'up';
    /* shown, the list is lifted into the top layer (core/position.js): no bar body, card or pane edge cuts it */
    if (lift(box)) { const p = placeLayer(box, more.getBoundingClientRect(), { side: more.dataset.side === 'down' ? 'bottom' : 'top', align: 'end', sideOffset: 0, padding: 8 }); box.style.left = p.x + 'px'; box.style.top = p.y + 'px'; }
  };
  const settle = e => { const more = e.target.closest?.('.legend-more'); if (!more || more.contains(e.relatedTarget) || more.matches(':focus-within') && e.type === 'pointerout') return; drop(more.querySelector('.legend-pop')); };
  root.addEventListener('pointerout', settle, options);
  root.addEventListener('focusout', settle, options);
  root.addEventListener('pointerover', aim, options);
  root.addEventListener('focusin', aim, options);
  root.addEventListener('pointerout', e => {
    const el = e.target.closest?.('.chart[data-chart]');
    if (el && !el.contains(e.relatedTarget) && doc.activeElement !== el && !restPoint(el)) el.classList.remove('hover');
  }, options);
  root.addEventListener('focusin', e => {
    const button = e.target.closest?.('[data-chart-series]');
    if (button) button.closest('.card').querySelector('.chart')._legendFocus = button;
  }, options);
  root.addEventListener('focusout', e => {
    if (e.target.matches?.('.chart') && !restPoint(e.target)) e.target.classList.remove('hover');
    if (e.target.matches?.('[data-chart-series]')) {
      const el = e.target.closest('.card')?.querySelector('.chart');
      win.queueMicrotask(() => {
        if (el && doc.activeElement !== e.target && (e.relatedTarget || el._source === el.dataset.chart)) delete el._legendFocus;
      });
    }
  }, options);
  root.addEventListener('keydown', e => {
    const el = e.target.closest?.('.chart[data-chart]');
    if (!el?._chart || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') { if (!restPoint(el)) el.classList.remove('hover'); return; }
    if (el._chart.time) { showTimePoint(el, e.key === 'Home' ? 0 : e.key === 'End' ? el._chart.n - 1 : el._point === undefined ? 0 : el._point + (e.key === 'ArrowLeft' ? -1 : 1)); return; }
    showPoint(el, e.key === 'Home' ? 0 : e.key === 'End' ? el._chart.n - 1 : (el._point || 0) + (e.key === 'ArrowLeft' ? -1 : 1));
  }, options);
  root.addEventListener('click', e => {
    const button = e.target.closest?.('[data-chart-series]');
    if (!button) return;
    const el = button.closest('.card').querySelector('.chart'), index = Number(button.dataset.chartSeries);
    if (!el?._chart) return;
    if (el._hiddenSeries.has(index)) el._hiddenSeries.delete(index); else el._hiddenSeries.add(index);
    syncSeries(el);
    if (el.classList.contains('hover')) showPoint(el, el._point || 0);
  }, options);
  const refreshFonts = () => { if (!controller.signal.aborted) tracked.forEach((_, el) => refresh(el, true)); };
  doc.fonts?.ready.then(refreshFonts);
  doc.fonts?.addEventListener('loadingdone', refreshFonts, options);
  const detach = () => { controller.abort(); resize.disconnect(); mutations.disconnect(); theme.disconnect(); zone.disconnect(); tracked.forEach((_, el) => { clearPoint(el); disposeEngine(el); delete el._legendFocus; el.getAnimations({ subtree: true }).forEach(animation => animation.cancel()); }); tracked.clear(); };
  win.addEventListener('pagehide', detach, { once: true, ...options });
  scan();
  return detach;
}
