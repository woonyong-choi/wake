/*
 * Temporal drawing helpers for chart-card: continuity segments, the ECharts option, concrete colors and the engine lifecycle.
 * ECharts only paints the series. Axes, grid, crosshair, tooltip, keyboard and legend stay in chart-card's SVG layer, so both use the
 * same padding and the same data coordinates. Nothing here touches the DOM except the host passed to paintTemporal.
 */

/** Above this many drawn points the canvas renderer is used; below it SVG keeps the output inspectable. */
export const CANVAS_POINT_THRESHOLD = 4000;

let loading = null;

/** Loads the vendored ECharts bundle once per page. A failure is remembered, so callers stay on the SVG fallback. */
export function loadEcharts() {
  loading ||= import('../vendor/echarts/echarts-6.1.0.mjs').then(module => {
    if (typeof module.init !== 'function') throw new TypeError('invalid echarts module');
    return module;
  });
  return loading;
}

/**
 * Continuous runs of observed values. A null value, a missing joinPrevious, gapBefore, an unknown maxGapSeconds (null) or a
 * distance above maxGapSeconds all start a new run, so no line is ever drawn across missing time.
 * @param {{at: number, value: number|null, joinPrevious?: boolean, gapBefore?: boolean}[]} observations
 * @param {number|null} maxGapSeconds
 */
export function temporalSegments(observations, maxGapSeconds) {
  const segments = []; let previous = null;
  for (const point of observations) {
    if (Number.isFinite(point.value)) {
      const connected = previous && Number.isFinite(previous.value) && point.joinPrevious === true && point.gapBefore !== true && maxGapSeconds !== null && point.at - previous.at <= maxGapSeconds;
      if (!connected) segments.push([]);
      segments.at(-1).push(point);
    }
    previous = point;
  }
  return segments;
}

/** The SVG dash string ('5 3', 'none') as a dash array, or null for a solid line. */
export function dashArray(dash) {
  if (typeof dash !== 'string' || dash.trim() === 'none') return null;
  const parts = dash.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  return parts.length && parts.every(part => Number.isFinite(part) && part >= 0) && parts.some(part => part > 0) ? parts : null;
}

/** Same default dash by slot as the SVG drawing. */
export const seriesDash = (series, index) => series.dash ?? (index === 1 ? '5 3' : index > 1 ? '2 3' : 'none');

/**
 * Concrete rgb()/rgba() for any color the browser can parse (oklch, color-mix, light-dark already computed), via one canvas pixel.
 * ECharts and its color helpers cannot be trusted with modern color syntax. Returns null for an unparsable or fully transparent value.
 * @param {string} value
 * @param {CanvasRenderingContext2D} ctx
 */
export function concreteColor(value, ctx) {
  if (typeof value !== 'string' || !value.trim()) return null;
  /* two different starting colors: a value the canvas cannot parse leaves fillStyle at the start, a valid value equal to one start differs from the other */
  let valid = false;
  for (const sentinel of ['black', 'white']) {
    ctx.fillStyle = sentinel; const start = ctx.fillStyle; /* the canvas serializes the start ('black' reads back as a hex) */
    ctx.fillStyle = value;
    if (ctx.fillStyle !== start) { valid = true; break; }
  }
  if (!valid) return null;
  ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (!a) return null;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round(a / 255 * 1000) / 1000})`;
}

const contexts = new WeakMap();

/**
 * Resolves a token name ('--series-1') in el's cascade to a concrete color, or null if the token is missing, transparent or unparsable.
 * @param {Element} el
 * @param {string} token
 */
export function resolveTokenColor(el, token) {
  if (typeof token !== 'string' || !/^--[\w-]+$/.test(token)) return null;
  const doc = el.ownerDocument;
  let ctx = contexts.get(doc);
  if (!ctx) {
    try { ctx = doc.createElement('canvas').getContext('2d', { willReadFrequently: true }); } catch { ctx = null; }
    if (!ctx) return null;
    contexts.set(doc, ctx);
  }
  const probe = doc.createElement('span');
  probe.style.color = `var(${token}, transparent)`;
  el.append(probe);
  try { return concreteColor(doc.defaultView.getComputedStyle(probe).color, ctx); } catch { return null; } finally { probe.remove(); }
}

/**
 * The ECharts option for one temporal chart. x values are seconds since timeAxis.from (an exact subtraction of the real timestamps),
 * and the grid is the chart-card plot rectangle, so a point lands on the same pixel as in the SVG layer.
 * Every continuity run is its own series: ECharts never joins two runs, so there are no synthetic gaps and no invented points.
 * Opt-in live contract: only when chart.liveLatestSegment === true, motion is allowed and duration > 0 is the run that ends at a series'
 * final observation animated on update. Otherwise nothing animates, including the first draw.
 * @param {{chart: any, segments: any[][][], geometry: {W: number, H: number, padL: number, padT: number, iw: number, ih: number, min: number, max: number}, hidden: Set<number>, colors: string[], motion: boolean, duration: number}} p
 */
/* the same colour with another opacity: resolved colours are rgb(r, g, b) or rgba(r, g, b, a) (see concreteColor) */
const withAlpha = (color, alpha) => { const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(color); return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : color; };

export function buildTemporalOption({ chart, segments, geometry, hidden, focus = null, colors, motion, duration }) {
  const { padL, padT, iw, ih, min, max } = geometry, axis = chart.timeAxis, from = axis.from;
  const live = chart.liveLatestSegment === true && motion && duration > 0;
  const fillOpacity = chart.series.length > 1 ? .06 : .12;
  const series = []; let points = 0;
  chart.series.forEach((source, index) => {
    if (hidden.has(index)) return;
    /* a ghost line (the same reading from an earlier period) is drawn light, dashed and without an area; with one line in focus every other line steps back */
    const ghost = source.ghost === true, dim = focus !== null && focus !== index, back = dim ? geometry.dim : 1;
    const color = colors[index], dash = ghost ? dashArray(seriesDash({ dash: '5 3' }, index)) : dashArray(seriesDash(source, index)), final = source.observations.at(-1);
    for (const run of segments[index]) {
      const single = run.length === 1, latest = live && run.at(-1) === final;
      points += run.length;
      series.push({
        id: JSON.stringify([source.key, run[0].at]), type: 'line', silent: true, clip: !!axis.clip, /* a zoomed window (timeAxis.clip) cuts its lines at the plot's edges */ smooth: false, z: 2,
        data: run.map(point => [point.at - from, point.value]),
        showSymbol: single, symbol: 'circle', symbolSize: 6, itemStyle: { color },
        lineStyle: { color, width: ghost ? (geometry.ghost?.width ?? 1) : geometry.lineWidth ?? 2, opacity: (ghost ? (geometry.ghost?.opacity ?? 1) : 1) * back, cap: 'round', join: 'round', ...(dash ? { type: dash } : {}) },
        ...(chart.kind === 'area' && !single && !ghost ? { areaStyle: geometry.fade
          /* the area thins out toward the axis, as the svg areas do (the top and bottom opacities are the shared fade tokens) */
          ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: withAlpha(color, geometry.fade.top * back) }, { offset: 1, color: withAlpha(color, geometry.fade.bottom * back) }] }, origin: 'auto' }
          : { color, opacity: fillOpacity * back, origin: 'auto' } } : {}),
        emphasis: { disabled: true },
        animation: latest, animationDuration: 0, animationDurationUpdate: latest ? duration : 0, animationEasingUpdate: 'cubicOut',
      });
    }
  });
  const option = {
    animation: live, animationDuration: 0, animationDurationUpdate: 0, backgroundColor: 'transparent', aria: { enabled: false },
    grid: [{ left: padL, top: padT, width: iw, height: ih, containLabel: false }],
    xAxis: [{ type: 'value', min: 0, max: axis.to - from, show: false }],
    yAxis: [{ type: 'value', min, max, show: false }],
    series,
  };
  return { option, points, renderer: points > CANVAS_POINT_THRESHOLD ? 'canvas' : 'svg' };
}

/**
 * Mounts once per host and renderer, then only resizes or updates when size or option changed.
 * `state` is the caller-owned per-chart record; the instance never outlives disposeTemporal.
 */
export function paintTemporal(state, { echarts, host, option, renderer, width, height }) {
  if (state.instance && (state.host !== host || state.renderer !== renderer || state.instance.isDisposed?.())) disposeTemporal(state);
  if (!state.instance) {
    state.instance = echarts.init(host, null, { renderer, width, height });
    state.host = host; state.renderer = renderer; state.size = `${width}x${height}`; state.json = null;
  }
  const size = `${width}x${height}`;
  if (state.size !== size) { state.instance.resize({ width, height, animation: { duration: 0 } }); state.size = size; }
  const json = JSON.stringify(option);
  if (state.json !== json) { state.instance.setOption(option, { notMerge: false, replaceMerge: ['series'], lazyUpdate: false }); state.json = json; }
}

export function disposeTemporal(state) {
  try { state.instance?.dispose(); } catch { /* A half-built instance is dropped with its host. */ }
  state.instance = null; state.host = null; state.renderer = null; state.size = null; state.json = null;
}
