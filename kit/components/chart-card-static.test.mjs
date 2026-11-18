import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './chart-card.js';
import { t } from '../core/i18n.js';

const T0 = 1794963600;
const card = extra => ({ title: 'CPU', widget: true, density: 'compact', value: '57%', info: { title: t('chart.info'), rows: [{ label: 'step', value: '15s' }] }, expand: { action: 'x.open', label: t('chart.info') },
  legend: [{ label: 'CPU', color: '--series-1' }, { label: 'limit 80%', color: '--chart-limit', dash: true }],
  chart: { kind: 'area', height: 120, rest: 'last', refs: [{ value: 80, label: 'limit 80%', tone: 'limit' }], series: [{ key: 'v', name: 'CPU', color: '--series-1', observations: [{ at: T0, value: 50 }, { at: T0 + 60, value: 57 }] }], timeAxis: { from: T0, to: T0 + 60, maxGapSeconds: 90, timeZone: 'Asia/Seoul' } }, ...extra });

test('without static the card renders exactly as before (static false and absent are the same markup)', () => {
  const plain = String(render(card()));
  assert.equal(String(render(card({ static: false }))), plain);
  assert.match(plain, /card-info-btn/); assert.match(plain, /card-expand/); assert.match(plain, /data-chart-series="0"/); assert.match(plain, /tabindex="0"/); assert.doesNotMatch(plain, /\bstatic\b/);
});

test('static draws the same chart as a still picture: no info, expand, legend buttons, focus or reading; the drawing data keeps axes, levels and series', () => {
  const s = String(render(card({ static: true })));
  assert.match(s, /class="card compact widget static"/);
  assert.doesNotMatch(s, /card-info-btn|card-expand|data-chart-series|tabindex|legend-more/);
  assert.match(s, /class="chart axes"/);
  const data = JSON.parse(s.match(/data-chart="([^"]+)"/)[1].replaceAll('&quot;', '"'));
  assert.equal(data.interactive, 'none'); assert.equal(data.rest, undefined); assert.equal(data.refs[0].label, 'limit 80%'); assert.equal(data.series[0].observations.length, 2); assert.equal(data.timeAxis.timeZone, 'Asia/Seoul');
  assert.match(s, /limit 80%/);
});
