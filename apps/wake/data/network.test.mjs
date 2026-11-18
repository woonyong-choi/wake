import assert from 'node:assert/strict';
import test from 'node:test';
import * as network from './network.js';

const { sumSeries, serviceRows, networkSummary, serviceFlow } = network;
const errTone = (...a) => network.errTone?.(...a), trafficRows = rows => network.trafficRows?.(rows) ?? rows;

const m = (namespace, service, values) => ({ metric: { namespace, service }, values: values.map(([t, v]) => [t, String(v)]) });
const v = (namespace, service, value, extra = {}) => ({ metric: { namespace, service, ...extra }, value: [100, String(value)] });

test('serviceRows_default_order_prioritizes_existing_error_tones_over_traffic', () => {
  const rows = serviceRows({ rx: [v('a', 'healthy', 1000), v('b', 'warning', 20), v('c', 'danger', 1)], err: [v('b', 'warning', 2), v('c', 'danger', 6)] });
  /* both are over the home 5xx threshold (1%): one failing tier (A2-12), then namespace order */
  assert.deepEqual(rows.map(row => row.name), ['warning', 'danger', 'healthy']);
});
const input = {
  rx: [m('a', 'api', [[0, 100], [60, 200]]), m('a', 'db', [[0, 50], [60, 40]]), m('b', 'web', [[0, 10], [60, 30]])],
  tx: [m('a', 'api', [[0, 300], [60, 400]]), m('a', 'db', [[0, 10], [60, 10]]), m('b', 'web', [[0, 20], [60, 20]])],
  conns: [v('a', 'api', 5), v('a', 'db', 2), v('b', 'web', 7)], err: [v('a', 'api', 2.5), v('b', 'web', 0.2)], retrans: [v('a', 'api', 0.1), v('b', 'web', 0.4)],
};

test('series_add_up_at_each_time_and_the_head_reads_now_and_the_window_peak', () => {
  assert.deepEqual(sumSeries(input.rx), [{ at: 0, value: 160 }, { at: 60000, value: 270 }]);
  const s = networkSummary(input);
  assert.deepEqual([s.rx, s.tx, s.rxPeak, s.txPeak, s.conns], [270, 430, 270, 430, 14]);
  assert.deepEqual(s.worst, { name: 'api', ns: 'a', err: 2.5 });
  assert.equal(networkSummary({ rx: [], tx: [] }).worst, null);
});

test('service_rows_by_service_or_namespace_sort_by_problem_and_identity', () => {
  assert.deepEqual(serviceRows(input).map(r => [r.id, r.rx, r.tx, r.conns, r.err]), [['a/api', 200, 400, 5, 2.5], ['a/db', 40, 10, 2, null], ['b/web', 30, 20, 7, 0.2]]);
  assert.deepEqual(serviceRows(input, 'ns').map(r => [r.id, r.rx, r.tx, r.conns, r.err, r.retrans]), [['a', 240, 410, 7, 2.5, 0.1], ['b', 30, 20, 7, 0.2, 0.4]]);
});

/* A2-13: the flow draws only observed traffic (the ingress controller's request rate per service). A store Service in the same namespace is not
   a caller's band: nothing measured says the api talks to it, so no guessed band (RULE-SANKEY: no unobserved relation as traffic) */
test('service_flow_draws_only_observed_ingress_bands_and_no_same_namespace_store_guess', () => {
  const ingress = [v('a', 'api', 120, { ingress: 'i1' }), v('a', 'api', 30, { ingress: 'i2' }), v('b', 'web', 50, { ingress: 'w' })];
  const f = serviceFlow({ ingress, services: [{ ns: 'a', name: 'db' }, { ns: 'a', name: 'cache', ports: [6379] }], rows: serviceRows(input) });
  assert.equal(f.total, 200);
  assert.deepEqual(f.nodes.map(n => [n.id, n.col, n.value]), [['ingress', 0, 200], ['a/api', 1, 150], ['b/web', 1, 50]]);
  assert.ok(f.links.every(l => l.from === 'ingress'), `only observed bands: ${JSON.stringify(f.links)}`);
  assert.deepEqual(serviceFlow({ ingress: [] }), { nodes: [], links: [], total: 0 });
});

/* A2-12: the 5xx state is the home's: over the home 5xx threshold (1%) is a failure everywhere (row order, flow, cell tone), no second warn tier;
   the traffic table reads the busiest first */
test('five_xx_state_follows_the_home_threshold_and_the_traffic_table_reads_busiest_first', () => {
  const f = serviceFlow({ ingress: [v('a', 'api', 120), v('b', 'web', 50)], rows: serviceRows(input) });
  assert.deepEqual(f.nodes.filter(n => n.col === 1).map(n => [n.id, n.state]), [['a/api', 'fail'], ['b/web', 'ok']], 'api at 2.5% is over the 1% threshold');
  assert.equal(errTone(1.02), 'error'); assert.equal(errTone(1), null); assert.equal(errTone(null), null);
  const rows = serviceRows({ rx: [v('a', 'quiet', 10), v('b', 'busy', 900), v('c', 'mid', 300)], tx: [v('a', 'quiet', 5), v('c', 'mid', 300)], err: [v('a', 'quiet', 3)] });
  assert.deepEqual(trafficRows(rows).map(r => r.id), ['b/busy', 'c/mid', 'a/quiet'], 'receive + transmit, largest first (the failing one keeps its red cell, not the top)');
});
