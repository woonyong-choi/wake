import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTemporalOption, CANVAS_POINT_THRESHOLD, concreteColor, dashArray, disposeTemporal, paintTemporal, temporalSegments } from './temporal-chart.js';
import { render } from '../components/chart-card.js';
import { readFileSync } from 'node:fs';

/* a concrete color as concreteColor writes it, from its channels (the test's own numbers, not a design color) */
const concrete = (r, g, b, a) => a === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
/* a modern-syntax color the browser parses: the first series token as kit/tokens.css defines it */
const MODERN = /--series-1:\s*([^;]+);/.exec(readFileSync(new URL('../tokens.css', import.meta.url), 'utf8'))[1].trim();

const start = 1700000000.123456;
const alpha = [
  { at: start, value: 1 }, { at: start + 60.032, value: 2, joinPrevious: true },
  { at: start + 180.032, value: 3, joinPrevious: true }, { at: start + 240.032, value: null, joinPrevious: true },
  { at: start + 300.032, value: 4, joinPrevious: true }, { at: start + 360.032, value: 5, joinPrevious: true, gapBefore: true },
  { at: start + 420.032, value: 6, joinPrevious: false }, { at: start + 480.032, value: 7, joinPrevious: true },
];
const chartOf = (extra = {}) => ({
  kind: 'line', height: 64, max: 12, ticks: [0, 12], timeAxis: { from: start, to: start + 600, maxGapSeconds: 90 },
  series: [{ key: 'a', name: 'Alpha', color: '--series-1', observations: alpha }, { key: 'b', name: 'Beta', color: '--series-2', dash: '5 3', observations: [{ at: start + .25, value: 10 }, { at: start + 60.25, value: 11, joinPrevious: true }] }], ...extra,
});
const geometry = { W: 300, H: 64, padL: 56, padT: 6, iw: 236, ih: 34, min: 0, max: 12 };
const build = (chart, over = {}) => buildTemporalOption({ chart, segments: chart.series.map(s => temporalSegments(s.observations, chart.timeAxis.maxGapSeconds)), geometry, hidden: new Set(), colors: [concrete(1, 2, 3), concrete(4, 5, 6)], motion: true, duration: 600, ...over });

test('temporal_segments_split_on_null_gap_unknown_distance_and_join_rules_without_inventing_points', () => {
  const runs = temporalSegments(alpha, 90);
  assert.deepEqual(runs.map(run => run.map(point => point.value)), [[1, 2], [3], [4], [5], [6, 7]]);
  assert.deepEqual(temporalSegments(alpha, null).map(run => run.length), [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(temporalSegments([{ at: 1, value: 0 }], 90).map(run => run.map(point => point.value)), [[0]], 'a zero is observed');
  assert.deepEqual(temporalSegments([{ at: 1, value: null }, { at: 2, value: null }], 90), [], 'null is missing, never a point');
});

test('temporal_option_uses_exact_offsets_plot_rectangle_and_one_series_per_run', () => {
  const { option, points, renderer } = build(chartOf());
  assert.equal(option.series.length, 6); assert.equal(points, 9); assert.equal(renderer, 'svg');
  assert.deepEqual(option.grid[0], { left: 56, top: 6, width: 236, height: 34, containLabel: false });
  assert.deepEqual(option.xAxis[0], { type: 'value', min: 0, max: 600, show: false });
  assert.deepEqual(option.yAxis[0], { type: 'value', min: 0, max: 12, show: false });
  assert.deepEqual(option.series[0].data, [[0, 1], [start + 60.032 - start, 2]]);
  assert.equal(option.series[0].data[1][0], start + 60.032 - start);
  assert.deepEqual(option.series.map(s => s.showSymbol), [false, true, true, true, false, false]);
  assert.deepEqual(option.series.at(-1).lineStyle.type, [5, 3]); assert.equal(option.series[0].lineStyle.type, undefined);
  assert.equal(option.series.every(s => s.silent && s.clip === false && !s.areaStyle), true);
  assert.equal(new Set(option.series.map(s => s.id)).size, 6);
});

test('temporal_option_hides_series_draws_area_and_picks_canvas_only_for_large_data', () => {
  const area = build(chartOf({ kind: 'area' }), { hidden: new Set([1]) });
  assert.equal(area.option.series.length, 5);
  assert.deepEqual(area.option.series.map(s => !!s.areaStyle), [true, false, false, false, true]);
  assert.equal(area.option.series[0].areaStyle.opacity, .06);
  const many = chartOf(); many.series[0].observations = Array.from({ length: CANVAS_POINT_THRESHOLD + 1 }, (_, i) => ({ at: start + i * .1, value: i % 7, joinPrevious: i > 0 }));
  many.timeAxis.to = start + 600; many.timeAxis.maxGapSeconds = 1;
  assert.equal(build(many).renderer, 'canvas');
});

test('temporal_option_animates_only_the_latest_run_under_the_explicit_live_flag', () => {
  const motion = option => option.series.map(s => s.animation);
  assert.deepEqual(motion(build(chartOf()).option), [false, false, false, false, false, false]);
  assert.equal(build(chartOf()).option.animation, false);
  assert.deepEqual(motion(build(chartOf({ liveLatestSegment: false })).option), [false, false, false, false, false, false]);
  const live = build(chartOf({ liveLatestSegment: true })).option;
  assert.deepEqual(motion(live), [false, false, false, false, true, true], 'only the run ending at each series\' final observation');
  assert.equal(live.series.at(-1).animationDurationUpdate, 600); assert.equal(live.series[0].animationDurationUpdate, 0);
  assert.equal(live.series.every(s => s.animationDuration === 0), true, 'no fake motion on first draw');
  assert.equal(build(chartOf({ liveLatestSegment: true }), { motion: false }).option.animation, false, 'reduced motion');
  const ends = chartOf({ liveLatestSegment: true }); ends.series[1].observations.push({ at: start + 120.25, value: null, joinPrevious: true });
  assert.deepEqual(motion(build(ends).option), [false, false, false, false, true, false], 'a trailing null leaves that series no live run');
});

test('temporal_render_validates_live_flag_as_strict_boolean', () => {
  assert.match(String(render({ title: 'x', chart: chartOf({ liveLatestSegment: true }) })), /data-chart=/);
  assert.throws(() => render({ title: 'x', chart: chartOf({ liveLatestSegment: 'true' }) }), TypeError);
});

test('temporal_dash_array_follows_svg_dash_strings', () => {
  assert.deepEqual(dashArray('5 3'), [5, 3]); assert.deepEqual(dashArray('2,3'), [2, 3]);
  for (const value of ['none', undefined, '', '0 0', 'a b']) assert.equal(dashArray(value), null);
});

test('concrete_color_converts_modern_syntax_and_rejects_invalid_or_transparent', () => {
  let alphaByte = 255;
  const ctx = {
    /* like a canvas: an unparsable value is ignored, a named color reads back in another spelling, a modern color as color(srgb ...) */
    style: 'BLACK', get fillStyle() { return this.style; },
    set fillStyle(value) { if (value === 'black' || value === 'white') this.style = value.toUpperCase(); else if (value === MODERN) this.style = 'color(srgb 0.9 0.1 0.2)'; },
    clearRect() {}, fillRect() {}, getImageData() { return { data: [230, 26, 51, alphaByte] }; },
  };
  assert.match(MODERN, /^oklch/);
  assert.equal(concreteColor(MODERN, ctx), concrete(230, 26, 51));
  assert.equal(concreteColor('not a color', ctx), null);
  assert.equal(concreteColor('', ctx), null);
  alphaByte = 0; assert.equal(concreteColor(MODERN, ctx), null);
  alphaByte = 128; assert.equal(concreteColor(MODERN, ctx), concrete(230, 26, 51, 0.502));
});

test('paint_temporal_mounts_once_updates_only_on_change_and_disposes', () => {
  const calls = [];
  const echarts = { init: (host, theme, options) => { calls.push(['init', host, options.renderer]); return { isDisposed: () => false, resize: size => calls.push(['resize', size.width, size.height]), setOption: option => calls.push(['set', option.n]), dispose: () => calls.push(['dispose']) }; } };
  const state = {}, host = {}, args = (n, width = 300, renderer = 'svg') => ({ echarts, host, option: { n }, renderer, width, height: 64 });
  paintTemporal(state, args(1)); paintTemporal(state, args(1));
  assert.deepEqual(calls.map(call => call[0]), ['init', 'set']);
  paintTemporal(state, args(2)); paintTemporal(state, args(2, 320));
  assert.deepEqual(calls.slice(2).map(call => call[0]), ['set', 'resize']);
  paintTemporal(state, args(2, 320, 'canvas'));
  assert.deepEqual(calls.slice(4).map(call => call[0]), ['dispose', 'init', 'set']);
  paintTemporal(state, { ...args(2, 320, 'canvas'), host: {} });
  assert.equal(calls.filter(call => call[0] === 'init').length, 3, 'a replaced host remounts');
  disposeTemporal(state); disposeTemporal(state);
  assert.equal(state.instance, null); assert.equal(calls.filter(call => call[0] === 'dispose').length, 3);
});

test('temporal_option_steps_the_other_lines_back_for_a_focused_line_and_draws_a_ghost_line_light_and_dashed_without_an_area', () => {
  const chart = chartOf({ kind: 'area' });
  const dimmed = build(chart, { focus: 0, geometry: { ...geometry, dim: .25 } }).option.series;
  const ofLine = (option, key) => option.filter(s => JSON.parse(s.id)[0] === key);
  assert.ok(ofLine(dimmed, 'a').every(s => s.lineStyle.opacity === 1));
  assert.ok(ofLine(dimmed, 'b').every(s => s.lineStyle.opacity === .25));
  const plain = build(chart).option.series;
  assert.ok(plain.every(s => s.lineStyle.opacity === 1), 'no focus, nothing steps back');
  const ghosted = build({ ...chart, series: [chart.series[0], { ...chart.series[1], ghost: true }] }, { geometry: { ...geometry, ghost: { opacity: .5, width: 1.5 } } }).option.series;
  const ghost = ofLine(ghosted, 'b');
  assert.ok(ghost.every(s => s.lineStyle.opacity === .5 && s.lineStyle.width === 1.5 && s.areaStyle === undefined && s.lineStyle.type));
  assert.ok(ofLine(ghosted, 'a').some(s => s.areaStyle), 'the line itself keeps its area');
});

/* chart-card's drawing helper is not a component (no name, css or render): it lives in kit/core, outside the component registry; app tests use temporalSegments from the public entry */
test('temporal_chart_is_a_core_drawing_helper_not_a_registered_component', async () => {
  const { existsSync } = await import('node:fs');
  assert.ok(existsSync(new URL('../core/temporal-chart.js', import.meta.url)), 'the helper lives in kit/core');
  assert.ok(!existsSync(new URL('../components/temporal-chart.js', import.meta.url)), 'not among the components');
  const kit = await import('../page/index.js');
  assert.equal('temporalChart' in kit.components, false, 'not in the component registry');
  assert.equal(typeof kit.temporalSegments, 'function', 'the public entry gives the segment rule the app tests check');
});
