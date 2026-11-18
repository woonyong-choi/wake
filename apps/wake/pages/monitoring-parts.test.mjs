import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeMonitoring } from './monitoring-parts.js';

test('home_catalog_is_exactly_scoped_and_failed_metric_keeps_successful_neighbor', async () => {
  const calls = [], windowEnd = '2026-11-05T00:15:00.000Z';
  const connection = cluster => ({ connectionId: cluster, identity: { cluster }, targets: [{ targetId: 'service', queries: [{ queryId: 'request', role: 'request', operation: 'metrics' }, { queryId: 'cpu', role: 'cpu', operation: 'metrics' }] }] });
  const catalog = { connections: [connection('one'), connection('two'), { ...connection('missing'), identity: {} }] };
  const home = createHomeMonitoring({ cluster: 'one', available: () => true, update() {}, now: () => windowEnd, service: async (name, input) => {
    calls.push({ name, input }); if (name === 'observability.catalog') return catalog;
    return { ...input, status: input.queryId === 'cpu' ? 'forbidden' : 'ok', data: { matrix: [] }, polling: { supported: false, reason: 'not_configured' } };
  } });
  await home.load();
  assert.equal(home.state.items.length, 1); assert.ok(calls.slice(1).every(call => call.input.connectionId === 'one'));
  const item = home.state.items[0]; assert.equal(item.results.request.response.status, 'ok'); assert.equal(item.results.cpu.response.status, 'forbidden');
  assert.equal(item.window.from, '2026-11-05T00:00:00.000Z'); home.dispose();
});

test('small_metrics_use_the_same_display_conversion_for_values_axis_and_tooltip', async () => {
  const { monitoringChartData } = await import('./monitoring-parts.js');
  for (const [unit, values, expected, max] of [['cores', ['0.00028', '0.00056'], [.28, .56], .56], ['s', ['0.002375', '0.00475'], [2.375, 4.75], 4.75]]) {
    const response = { status: 'ok', data: { unit, matrix: [{ metric: { pod: 'pod', container: 'app', irrelevant: 'long-source-label' }, values: [[1, values[0]], [2, values[1]]] }] } };
    const raw = structuredClone(response);
    const chart = monitoringChartData({ queryId: 'metric' }, response);
    assert.deepEqual(chart.series[0].values, expected); assert.equal(chart.max, max);
    assert.equal(chart.unit, unit === 's' ? 'ms' : 'mCPU');
    assert.equal(chart.series[0].name, 'pod · app'); assert.deepEqual(response, raw);
  }
  assert.equal(monitoringChartData({ queryId: 'zero' }, { status: 'ok', data: { matrix: [{ metric: {}, values: [[1, '0'], [2, '0']] }] } }).max, 1);
});

test('home CPU and memory keep the same series appearance when only memory has a node label', async t => {
  const queries = ['cpu', 'memory'].map(role => ({ queryId: role, role, operation: 'metrics' }));
  const catalog = { connections: [{ connectionId: 'prom', provider: 'prometheus', identity: { cluster: 'context' },
    targets: [{ targetId: 'nodes', subject: { kind: 'Node' }, queries }] }] };
  const home = createHomeMonitoring({ cluster: 'context', available: () => true, update() {},
    now: () => '2026-11-05T00:15:00Z', service: async (name, input) => {
      if (name === 'observability.catalog') return catalog;
      const isMemory = input.queryId === 'memory';
      const instances = isMemory ? ['node-b:9100', 'node-a:9100'] : ['node-a:9100', 'node-b:9100'];
      return { ...input, status: 'ok', data: { unit: '%', matrix: instances.map(instance => ({
        metric: { instance, ...(isMemory ? { node: instance.split(':')[0] } : {}) }, values: [[1, '2'], [2, '4']],
      })) }, polling: { supported: false } };
    } });
  t.after(() => home.dispose());
  await home.load();
  const chartAppearances = home.overview({ t: key => key, height: 64 }).map(card => {
    assert.ok(card);
    const json = card.s.match(/data-chart="([^"]+)"/)?.[1];
    assert.ok(json);
    return Object.fromEntries(JSON.parse(json.replaceAll('&quot;', '"')).series
      .map(({ name, color, dash }) => [name, [color, dash]]));
  });
  assert.deepEqual(chartAppearances[0], chartAppearances[1]);
  assert.notDeepEqual(chartAppearances[0]['node-a:9100'], chartAppearances[0]['node-b:9100']);
});

test('home_chart_names_the_collected_part_of_a_longer_window_and_drops_a_legend_that_repeats_the_title', async t => {
  const catalog = { connections: [{ connectionId: 'prom', provider: 'prometheus', identity: { cluster: 'context' },
    targets: [{ targetId: 'nodes', subject: { kind: 'Node' }, queries: [{ queryId: 'cpu', role: 'cpu', operation: 'metrics' }] }] }] };
  let samples;
  const home = createHomeMonitoring({ cluster: 'context', available: () => true, update() {}, now: () => '2026-11-05T06:00:00Z',
    service: async (name, input) => name === 'observability.catalog' ? catalog
      : { ...input, status: 'ok', data: { unit: '%', matrix: [{ metric: { instance: 'CPU' }, values: samples(input.queryWindow) }] }, polling: { supported: false } } });
  t.after(() => home.dispose());
  /* the last ten minutes of a longer window only */
  samples = window => { const to = Date.parse(window.to) / 1000; return [[to - 600, '2'], [to - 300, '3'], [to, '4']]; };
  await home.load();
  let card = home.overview({ t: (key, v) => key === 'wake.monitor.metric.cpu' ? 'CPU' : v ? key + JSON.stringify(v) : key, height: 64, metric: 'cpu' });
  assert.ok(card); assert.match(card.s, /wake.overview.collected/);
  assert.doesNotMatch(card.s, /class="[^"]*legend/, 'a single series named like the title has no legend');
  /* full coverage: no collected note */
  samples = window => { const from = Date.parse(window.from) / 1000, to = Date.parse(window.to) / 1000, step = Number(window.step) || 60;
    const out = []; for (let at = from; at <= to; at += step) out.push([at, '1']); return out; };
  await home.load();
  card = home.overview({ t: (key, v) => key === 'wake.monitor.metric.cpu' ? 'CPU' : v ? key + JSON.stringify(v) : key, height: 64, metric: 'cpu' });
  assert.ok(card); assert.doesNotMatch(card.s, /wake.overview.collected/);
});

test('home_poll_commits_one_complete_window_and_keeps_the_prior_snapshot_while_pending', async () => {
  const pending = [], catalog = { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'service', queries: ['request', 'cpu'].map(queryId => ({ queryId, role: queryId, operation: 'metrics' })) }] }] };
  let now = '2026-11-05T00:15:00.000Z';
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, now: () => now, service: async (name, input) => {
    if (name.endsWith('catalog')) return catalog;
    return new Promise(resolve => pending.push(() => resolve({ ...input, status: 'ok', data: { matrix: [] }, polling: { supported: false } })));
  } });
  const first = home.load(); await new Promise(resolve => setImmediate(resolve));
  pending[0](); await new Promise(resolve => setImmediate(resolve)); assert.equal(home.state.items.length, 0);
  pending[1](); await first;
  const previous = structuredClone(home.state.items); now = '2026-11-05T00:16:00.000Z';
  const second = home.load(); await new Promise(resolve => setImmediate(resolve));
  pending[2](); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(home.state.items, previous);
  pending[3](); await second;
  assert.equal(home.state.window.to, now);
  assert.ok(Object.values(home.state.items[0].results).every(result => result.request.queryWindow.to === now)); home.dispose();
});

test('overlapping_home_batches_ignore_late_success_and_disposed_responses', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const reads = [], catalog = { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'service', queries: ['request', 'cpu'].map(queryId => ({ queryId, role: queryId, operation: 'metrics' })) }] }] };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  let now = '2026-11-05T00:15:00.000Z', updates = 0;
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() { updates++; }, now: () => now, service: async (name, input) => {
    if (name === 'observability.catalog') return catalog;
    return new Promise(resolve => reads.push({ input, finish: value => resolve({ ...input, status: 'ok', data: { matrix: [{ metric: { service: 'service' }, values: [[1793837700, value]] }] }, polling: { supported: false, reason: 'not_configured' } }) }));
  } });
  const old = home.load(); await tick();
  reads[0].finish('10'); await tick();
  assert.equal(home.state.items.length, 0);
  now = '2026-11-05T00:16:00.000Z';
  const latest = home.load(); await tick();
  assert.equal(reads.length, 3, 'pending cpu keeps its one native slot; only request is sent again');
  now = '2026-11-05T00:16:03.000Z'; reads[2].finish('20'); await tick();
  t.mock.timers.tick(10000); await latest;
  const snapshot = structuredClone(home.state), committedUpdates = updates;
  assert.deepEqual(snapshot.window, { from: '2026-11-05T00:01:00.000Z', to: '2026-11-05T00:16:00.000Z', step: 30 });
  assert.equal(snapshot.receivedAt, '2026-11-05T00:16:03.000Z');
  assert.equal(snapshot.items[0].results.request.response.data.matrix[0].values[0][1], '20');
  assert.equal(snapshot.items[0].results.cpu.error, 'timeout');
  now = '2026-11-05T00:17:00.000Z'; reads[1].finish('11'); await old;
  assert.deepEqual(home.state, snapshot); assert.equal(updates, committedUpdates);
  const disposed = home.load(); await tick();
  assert.equal(reads.length, 5); home.dispose();
  reads[3].finish('30'); reads[4].finish('31'); await disposed;
  assert.deepEqual(home.state, snapshot); assert.equal(updates, committedUpdates);
});

test('unanswered_catalog_or_read_terminates_as_query_error_without_product_fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stalled of ['observability.catalog', 'observability.read']) {
    const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, service: async name => {
      if (name === stalled) return new Promise(() => {});
      return { status: 'ok', connections: [{ connectionId: 'connection', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', queries: [{ queryId: 'request', role: 'request', operation: 'metrics' }] }] }] };
    } });
    const pending = home.load(); await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(10000); await new Promise(resolve => setImmediate(resolve));
    if (stalled === 'observability.catalog') assert.equal(home.state.status, 'query_error');
    else assert.equal(home.state.items[0]?.results.request.error, 'timeout');
    await pending; home.dispose();
  }
});

test('short_utc_axis_distinguishes_subsecond_collisions', async () => {
  const { monitoringChartData } = await import('./monitoring-parts.js');
  const first = Date.parse('2026-11-05T00:14:00.100Z') / 1000, second = Date.parse('2026-11-05T00:14:00.200Z') / 1000;
  const matrix = [{ metric: { service: 'service' }, values: [[first, '1'], [second, '2']] }], before = structuredClone(matrix);
  const labels = monitoringChartData({ queryId: 'q' }, { status: 'ok', data: { matrix } }).x;
  assert.equal(new Set(labels).size, 2); assert.ok(labels.every(label => !label.includes('2026-') && !label.includes('T'))); assert.deepEqual(matrix, before);
  const acrossDays = monitoringChartData({ queryId: 'q' }, { status: 'ok', data: { matrix: [{ metric: {}, values: [[first, '1'], [first + 86400, '2']] }] } }, { compact: true }).x;
  assert.equal(new Set(acrossDays).size, 2);
});
test('duplicate_meaningful_series_names_keep_exact_differentiating_labels', async () => {
  const { monitoringChartData } = await import('./monitoring-parts.js');
  const names = matrix => monitoringChartData({ queryId: 'request' }, { status: 'ok', data: { matrix } }).series.map(series => series.name);
  const matrix = [{ metric: { service: 'service', zone: 'a' }, values: [] }, { metric: { service: 'service', zone: 'b' }, values: [] }];
  const labels = names(matrix);
  assert.deepEqual(labels, ['service · zone="a"', 'service · zone="b"']);
  assert.deepEqual(names(matrix.toReversed()), labels.toReversed());
});

test('home_read_concurrency_is_two_and_late_native_reads_keep_their_slots', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = [], queries = ['request', 'error', 'latency', 'cpu', 'memory', 'throttle'].map(queryId => ({ queryId, role: queryId, operation: 'metrics', polling: { supported: false, reason: 'not_configured' } }));
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, random: () => 0, service: async (name, input) => {
    if (name.endsWith('catalog')) return { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', queries }] }] };
    return new Promise(resolve => pending.push(() => resolve({ ...input, status: 'ok', data: { matrix: [] }, polling: { supported: false, reason: 'not_configured' } })));
  } });
  const load = home.load(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2);
  t.mock.timers.tick(10000); await new Promise(resolve => setImmediate(resolve)); await load;
  assert.equal(pending.length, 2);
  assert.ok(Object.values(home.state.items[0].results).every(result => result.error === 'timeout'));
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2, 'unsettled native reads still occupy both document slots');
  const stopped = structuredClone(home.state);
  pending.forEach(finish => finish()); await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2, 'expired queued jobs are never dispatched when native slots finally release');
  assert.deepEqual(home.state, stopped); home.dispose();
});

test('home_recovery_retries_only_failed_queries_twice_in_the_same_window', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-05T00:15:00Z') });
  const calls = [], query = queryId => ({ queryId, role: queryId, operation: 'metrics', polling: { supported: true, intervalSeconds: 15 } });
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, random: () => 0, service: async (name, input) => {
    if (name.endsWith('catalog')) return { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', queries: [query('request'), query('cpu')] }] }] };
    calls.push(input); return { ...input, status: input.queryId === 'cpu' ? 'not_queried' : 'ok', receivedAt: new Date().toISOString(), data: { matrix: [] }, polling: { supported: input.queryId !== 'cpu', intervalSeconds: input.queryId === 'cpu' ? null : 15, reason: input.queryId === 'cpu' ? 'not_queried' : null } };
  } });
  await home.load(); const window = structuredClone(home.state.window);
  t.mock.timers.tick(29999); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 2);
  t.mock.timers.tick(1); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 3);
  t.mock.timers.tick(60000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 4);
  t.mock.timers.tick(600000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 4);
  assert.ok(calls.slice(2).every(input => input.queryId === 'cpu'));
  assert.equal(new Set(calls.map(input => input.requestId)).size, 4);
  assert.ok(calls.every(input => JSON.stringify(input.queryWindow) === JSON.stringify(window)));
  assert.equal(home.state.items[0].results.cpu.response.polling.supported, false);
  await home.load(); assert.equal(calls.length, 6);
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 7, 'manual refresh starts a new bounded episode'); home.dispose();
});

test('home_recovery_keeps_failure_raw_last_success_and_each_query_received_time', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-05T00:15:00Z') });
  let failing = false;
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, random: () => 0, service: async (name, input) => {
    if (name.endsWith('catalog')) return { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', queries: ['request', 'cpu'].map(queryId => ({ queryId, role: queryId, operation: 'metrics', polling: { supported: true, intervalSeconds: 15 } })) }] }] };
    const failed = failing && input.queryId === 'request';
    return { ...input, status: failed ? 'network_error' : 'ok', observedAt: '2026-11-05T00:14:00Z', receivedAt: new Date().toISOString(), error: failed ? 'network_error' : null,
      data: { matrix: failed ? [] : [{ metric: { service: 'service' }, values: [[1793837640, '2'], [1793837700, '3']] }], raw: failed ? { failure: 'native diagnostic' } : { success: 'original samples' } }, polling: { supported: !failed, intervalSeconds: failed ? null : 15, reason: failed ? 'network_error' : null } };
  } });
  await home.load(); const first = structuredClone(home.state.items[0].results.request);
  failing = true; t.mock.timers.tick(15000); await new Promise(resolve => setImmediate(resolve));
  const failed = home.state.items[0].results.request, cpuReceivedAt = home.state.items[0].results.cpu.receivedAt;
  assert.deepEqual(failed.lastSuccess.response.data.raw, { success: 'original samples' });
  assert.deepEqual(failed.response.data.raw, { failure: 'native diagnostic' });
  assert.equal(failed.response.status, 'network_error'); assert.equal(failed.response.polling.supported, false);
  assert.equal(failed.lastSuccess.request.queryWindow.to, first.request.queryWindow.to);
  assert.notEqual(failed.lastSuccess.request.queryWindow.to, failed.request.queryWindow.to);
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(home.state.items[0].results.cpu.receivedAt, cpuReceivedAt);
  assert.notEqual(home.state.items[0].results.request.receivedAt, failed.receivedAt); home.dispose();
});

test('home_does_not_retry_denials_invalid_data_generic_errors_or_disabled_catalog_capability', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-05T00:15:00Z') });
  for (const status of ['forbidden', 'unsupported', 'unconfigured', 'invalid_request', 'invalid_response', 'invalid_configuration', 'query_error', 'disabled']) {
    let reads = 0;
    const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, random: () => 0, service: async (name, input) => {
      if (name.endsWith('catalog')) return { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', queries: [{ queryId: 'cpu', role: 'cpu', operation: 'metrics', polling: { supported: status !== 'disabled', intervalSeconds: 15 } }] }] }] };
      reads++; if (status === 'query_error') throw new Error('unknown read failure');
      return { ...input, status: status === 'disabled' ? 'network_error' : status, data: { raw: { status } }, polling: { supported: false, reason: status } };
    } });
    await home.load(); t.mock.timers.tick(600000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1, status); home.dispose();
  }
});

test('home_identity_change_stops_automatic_reads_without_retargeting_or_losing_raw', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-05T00:15:00Z') });
  let uid = 'original', reads = 0;
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, random: () => 0, service: async (name, input) => {
    if (name.endsWith('catalog')) return { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', subject: { uid }, queries: [{ queryId: 'cpu', role: 'cpu', operation: 'metrics', polling: { supported: true, intervalSeconds: 15 } }] }] }] };
    reads++; return { ...input, status: 'ok', data: { raw: { uid } }, polling: { supported: true, intervalSeconds: 15 } };
  } });
  await home.load(); uid = 'replacement';
  t.mock.timers.tick(15000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1); assert.equal(home.state.items[0].results.cpu.error, 'identity_changed');
  assert.equal(home.state.items[0].results.cpu.previousIdentity.result.response.data.raw.uid, 'original');
  t.mock.timers.tick(600000); await new Promise(resolve => setImmediate(resolve)); assert.equal(reads, 1); home.dispose();
});

test('successful_subset_recovery_resumes_polling_and_resets_only_the_successful_episode', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-05T00:15:00Z') });
  const calls = []; let cpuReads = 0;
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, random: () => 0, service: async (name, input) => {
    if (name.endsWith('catalog')) return { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', queries: ['request', 'cpu'].map(queryId => ({ queryId, role: queryId, operation: 'metrics', polling: { supported: true, intervalSeconds: 15 } })) }] }] };
    calls.push(input); const failed = input.queryId === 'cpu' && [1, 3].includes(++cpuReads);
    return { ...input, status: failed ? 'not_queried' : 'ok', data: { matrix: [] }, polling: { supported: !failed, intervalSeconds: failed ? null : 15, reason: failed ? 'not_queried' : null } };
  } });
  await home.load(); const received = home.state.items[0].results.request.receivedAt;
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 3); assert.equal(calls[2].queryId, 'cpu');
  assert.equal(home.state.items[0].results.request.receivedAt, received); assert.equal(home.state.intervalSeconds, 15);
  t.mock.timers.tick(15000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 5);
  assert.equal(home.state.intervalSeconds, null);
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 6);
  assert.deepEqual(calls[5].queryWindow, calls[4].queryWindow);
  assert.equal(home.state.intervalSeconds, 15); home.dispose();
});

test('confirmed_timeout_rechecks_never_resend_an_unsettled_native_query', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-05T00:15:00Z') });
  let reads = 0, release;
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, random: () => 0, service: async (name, input) => {
    if (name.endsWith('catalog')) return { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', queries: [{ queryId: 'cpu', role: 'cpu', operation: 'metrics', polling: { supported: true, intervalSeconds: 15 } }] }] }] };
    reads++; return new Promise(resolve => { release = () => resolve({ ...input, status: 'ok', data: { raw: 'late actual response' }, polling: { supported: true, intervalSeconds: 15 } }); });
  } });
  const load = home.load(); await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(10000); await load;
  assert.equal(home.state.items[0].results.cpu.error, 'timeout'); const received = home.state.receivedAt;
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(60000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1); assert.equal(home.state.recovery[0].attempts, 2); assert.equal(home.state.receivedAt, received);
  const stopped = structuredClone(home.state); release(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(home.state, stopped); home.dispose();
});

test('query_jitter_keeps_other_queries_original_due_time_when_one_retry_finishes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-05T00:15:00Z') });
  const calls = []; let randomCalls = 0;
  const home = createHomeMonitoring({ cluster: 'cluster', available: () => true, update() {}, random: () => randomCalls++ % 2 ? .9 : 0, service: async (name, input) => {
    if (name.endsWith('catalog')) return { connections: [{ connectionId: 'one', identity: { cluster: 'cluster' }, targets: [{ targetId: 'target', queries: ['request', 'cpu'].map(queryId => ({ queryId, role: queryId, operation: 'metrics', polling: { supported: true, intervalSeconds: 15 } })) }] }] };
    calls.push({ at: Date.now(), input }); return { ...input, status: 'not_queried', data: { matrix: [] }, polling: { supported: false, reason: 'not_queried' } };
  } });
  await home.load();
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 3);
  t.mock.timers.tick(13499); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 3);
  t.mock.timers.tick(1); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 4);
  assert.equal(calls[2].input.queryId, 'request'); assert.equal(calls[3].input.queryId, 'cpu');
  assert.equal(calls[3].at - calls[1].at, 43500); home.dispose();
});

test('monitoring charts preserve missing samples and distinguish them from zero', async () => {
  const { monitoringChartData } = await import('./monitoring-parts.js');
  const query = { queryId: 'network-rx', unit: 'bytes/s' };
  const response = { status: 'ok', data: { unit: 'bytes/s', matrix: [{ metric: { instance: 'node' }, values: [[1, '0'], [2, null], [3, '12345']] }] } };
  const chart = monitoringChartData(query, response);
  assert.deepEqual(chart.series[0].values, [0, null, 12345]);
  assert.equal(chart.unit, 'By/s');
  assert.equal(chart.groupedValues, true);
});

test('saturation_display_conversion_keeps_raw_and_has_consistent_ratio_axis', async () => {
  const { monitoringChartData } = await import('./monitoring-parts.js');
  const response = { status: 'ok', data: { unit: 'ratio', matrix: [{ metric: { container: 'app' }, values: [[1, '.001'], [2, '.0123']] }] } }, before = structuredClone(response);
  const chart = monitoringChartData({ queryId: 'throttle' }, response);
  assert.equal(chart.unit, '%');assert.deepEqual(chart.series[0].values, [.1, 1.23]);assert.equal(chart.max, 1.23);
  assert.deepEqual(response, before);
});

test('gcp_node_labels_preserve_discriminators_and_explicit_source_units', async () => {
  const { monitoringChartData } = await import('./monitoring-parts.js');
  const matrix = ['evictable', 'non-evictable'].map(memory_type => ({ metric: { node_name: 'historical-node', memory_type }, values: [[1, '1048576'], [2, '2097152']] }));
  const names = (queryId, options) => monitoringChartData({ queryId }, { status: 'ok', data: { matrix } }, options).series.map(series => series.name);
  assert.ok(names('legacy-title').every(name => name.startsWith('legacy-title')));
  const nodes = names('metric', { nodeNames: true });assert.ok(nodes.every(name => name.startsWith('historical-node')));assert.notEqual(nodes[0], nodes[1]);assert.ok(nodes.every(name => name.includes('memory_type=')));
  for (const [unit, expected] of [['By', 'MiB'], ['By/s', 'By/s'], ['s{CPU}', 's{CPU}']]) assert.equal(monitoringChartData({ queryId: 'metric' }, { status: 'ok', data: { unit, matrix } }).unit, expected);
});

function temporalFixture() {
  const from='2026-11-05T00:00:00.000Z',to='2026-11-05T00:10:00.000Z',at=Date.parse(from)/1000;
  const identity={cluster:'context',projectId:'project'},response={status:'ok',data:{unit:'cores',source:{provider:'gcp-monitoring',metricType:'kubernetes.io/node/cpu/core_usage_time',sampling:{mode:'source-points',status:'ok',samplePeriod:'60s',samplePeriodSeconds:60,ingestDelay:'0s',ingestDelaySeconds:0,provenance:{kind:'metricDescriptor.metadata',provider:'gcp-monitoring',contextId:'context',projectId:'project',metricType:'kubernetes.io/node/cpu/core_usage_time'},observedAt:'2026-11-05T00:11:00Z',cache:{hit:false,ttlSeconds:300,expiresAt:'2026-11-05T00:16:00Z'}}},transform:{kind:'adjacent-counter-rate',resetCount:0},matrix:[
    {metric:{project_id:'project',location:'region',cluster_name:'cluster',node_name:'first'},values:[[at+1,'.0001'],[at+61,'.0002'],[at+181,'.0003']]},
    {metric:{project_id:'project',location:'region',cluster_name:'cluster',node_name:'second'},values:[[at+2.123456,'.0004'],[at+62.123456,'.0005']]}
  ]}};return {response,identity,window:{from,to,step:300},at};
}
test('temporal_adapter_uses_own_observations_validated_cadence_and_exact_domain_without_union_nulls',async()=>{
  const {monitoringChartData}=await import('./monitoring-parts.js'),fixture=temporalFixture(),before=structuredClone(fixture.response);
  const chart=monitoringChartData({queryId:'cpu'},fixture.response,{nodeNames:true,timeAxisWindow:fixture.window,sourceIdentity:fixture.identity});
  assert.equal(chart.timeAxis.maxGapSeconds,90);assert.equal(chart.timeAxis.from,fixture.at);assert.equal(chart.timeAxis.to,fixture.at+600);assert.equal(chart.x,undefined);
  assert.deepEqual(chart.series.map(series=>series.observations.map(point=>point.at)),fixture.response.data.matrix.map(series=>series.values.map(point=>point[0])));
  assert.deepEqual(chart.series.map(series=>series.observations.map(point=>point.joinPrevious)),[[false,true,false],[false,true]]);
  assert.deepEqual(chart.series[0].observations.map(point=>point.value),[.1,.2,.3]);assert.equal(chart.series[1].observations[0].at,fixture.at+2.123456);assert.notEqual(chart.series[0].key,chart.series[1].key);assert.deepEqual(fixture.response,before);
});
test('temporal_adapter_unknown_legacy_metadata_and_mismatched_provenance_are_points_only',async()=>{
  const {monitoringChartData}=await import('./monitoring-parts.js');
  for(const change of [fixture=>{fixture.response.data.source.sampling='source-points';fixture.response.data.source.samplePeriod=null;},fixture=>{fixture.response.data.source.sampling.status='forbidden';},fixture=>{fixture.response.data.source.sampling.provenance.projectId='other';},fixture=>{fixture.response.data.source.sampling.provenance.contextId='other';},fixture=>{fixture.response.data.source.sampling.provenance.metricType='other';},fixture=>{fixture.response.data.source.sampling.samplePeriodSeconds=0;}]){
    const fixture=temporalFixture();change(fixture);const chart=monitoringChartData({queryId:'cpu'},fixture.response,{timeAxisWindow:fixture.window,sourceIdentity:fixture.identity});assert.equal(chart.timeAxis.maxGapSeconds,null);assert.ok(chart.series.every(series=>series.observations.every(point=>point.joinPrevious===false)));
  }
});
test('temporal_adapter_own_null_and_reset_location_unknown_never_join_or_invent_zero',async()=>{
  const {monitoringChartData}=await import('./monitoring-parts.js'),fixture=temporalFixture();fixture.response.data.matrix[0].values=[[fixture.at+1,'1'],[fixture.at+61,null],[fixture.at+121,'3']];
  let chart=monitoringChartData({queryId:'cpu'},fixture.response,{timeAxisWindow:fixture.window,sourceIdentity:fixture.identity});assert.deepEqual(chart.series[0].observations.map(point=>point.value),[1000,null,3000]);assert.ok(chart.series[0].observations.every(point=>point.joinPrevious===false));
  fixture.response.data.transform.resetCount=1;chart=monitoringChartData({queryId:'cpu'},fixture.response,{timeAxisWindow:fixture.window,sourceIdentity:fixture.identity});assert.ok(chart.series.every(series=>series.observations.every(point=>point.joinPrevious===false)));
});
test('temporal_adapter_opt_in_does_not_change_legacy_categorical_or_use_requested_step_for_period',async()=>{
  const {monitoringChartData}=await import('./monitoring-parts.js'),fixture=temporalFixture();
  const legacy=monitoringChartData({queryId:'cpu'},fixture.response);assert.equal(legacy.timeAxis,undefined);assert.ok(legacy.x.length>0);assert.ok(legacy.series.every(series=>Array.isArray(series.values)&&series.observations===undefined));
  const compact=monitoringChartData({queryId:'cpu'},fixture.response,{compact:true,timeAxisWindow:fixture.window,sourceIdentity:fixture.identity});assert.equal(compact.timeAxis.ticks.length,2);assert.deepEqual(compact.timeAxis.ticks.map(tick=>tick.at),[fixture.at+1,fixture.at+181]);assert.equal(compact.timeAxis.from,fixture.at);assert.equal(compact.timeAxis.to,fixture.at+600);
  fixture.response.data.source.sampling.samplePeriodSeconds=30;const chart=monitoringChartData({queryId:'cpu'},fixture.response,{timeAxisWindow:fixture.window,sourceIdentity:fixture.identity});assert.equal(chart.timeAxis.maxGapSeconds,45);assert.ok(chart.series.every(series=>series.observations.every(point=>point.joinPrevious===false)));
});

const queryPlanRoles = ['cpu', 'memory-evictable', 'memory-non-evictable', 'network-rx', 'network-tx', 'ephemeral-storage-used'];
function queryPlanHomeCatalog(provider = 'gcp-monitoring') {
  const roles = [...queryPlanRoles, 'cpu-time', 'network-rx-total', 'network-tx-total', ...Array.from({ length: 17 }, (_, index) => 'extra-' + index)];
  return { connections: [{ connectionId: 'plan', provider, identity: { cluster: 'context' }, targets: [{ targetId: 'nodes', subject: { kind: 'Cluster', name: 'history' }, queries: roles.map(role => ({ queryId: 'query-' + role, role, title: role, operation: 'metrics', unit: 'By', polling: { supported: true, intervalSeconds: 15 } })) }] }] };
}
function queryPlanHomeReply(input, status = 'ok') {
  return { ...input, status, data: { matrix: [], raw: { queryId: input.queryId } }, polling: { supported: status === 'ok', intervalSeconds: 15, reason: status === 'ok' ? null : status } };
}

test('query_plan_home_reads_only_six_roles_and_preserves_catalog_and_unselected_cache', async () => {
  const catalog = queryPlanHomeCatalog(), original = structuredClone(catalog), calls = [];
  const home = createHomeMonitoring({ cluster: 'context', available: () => true, update() {}, service: async (name, input) => {
    if (name.endsWith('catalog')) return catalog;
    calls.push(input); return queryPlanHomeReply(input);
  } });
  try {
    await home.load();
    assert.deepEqual(calls.map(input => input.queryId).sort(), queryPlanRoles.map(role => 'query-' + role).sort());
    assert.deepEqual(catalog, original);
    const hidden = { request: { queryWindow: { from: '2026-11-04T00:00:00Z', to: '2026-11-04T00:15:00Z', step: 60 } }, response: { status: 'forbidden', data: { raw: { previous: true } } }, receivedAt: '2026-11-04T00:15:01Z' };
    home.state.items[0].results['query-extra-0'] = structuredClone(hidden);
    calls.length = 0;
    await home.load();
    assert.equal(calls.length, 6);
    assert.deepEqual(home.state.items[0].results['query-extra-0'], hidden);
    assert.equal(home.state.items[0].target.queries.length, 26);
    assert.equal(home.state.intervalSeconds, 15);
  } finally { home.dispose(); }
});

test('query_plan_home_poll_and_bounded_recovery_ignore_hidden_failures', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-11-05T00:15:00Z') });
  const catalog = queryPlanHomeCatalog(), calls = []; let cpuStatus = 'ok';
  for (const query of catalog.connections[0].targets[0].queries.slice(6)) query.polling = { supported: false };
  const home = createHomeMonitoring({ cluster: 'context', available: () => true, update() {}, random: () => 0, service: async (name, input) => {
    if (name.endsWith('catalog')) return catalog;
    calls.push(input); return queryPlanHomeReply(input, input.queryId === 'query-cpu' ? cpuStatus : queryPlanRoles.some(role => input.queryId === 'query-' + role) ? 'ok' : 'forbidden');
  } });
  try {
    await home.load(); assert.equal(calls.length, 6); assert.equal(home.state.intervalSeconds, 15);
    t.mock.timers.tick(15000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 12);
    cpuStatus = 'not_queried'; await home.load(); const window = structuredClone(home.state.window); calls.length = 0;
    for (const delay of [30000, 60000]) { t.mock.timers.tick(delay); await new Promise(resolve => setImmediate(resolve)); }
    assert.deepEqual(calls.map(input => input.queryId), ['query-cpu', 'query-cpu']);
    assert.ok(calls.every(input => JSON.stringify(input.queryWindow) === JSON.stringify(window)));
    t.mock.timers.tick(600000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 2);
    cpuStatus = 'forbidden'; await home.load(); calls.length = 0;
    t.mock.timers.tick(600000); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, 0);
  } finally { home.dispose(); }
});

test('query_plan_home_keeps_non_gcp_role_policy', async () => {
  for (const provider of ['prometheus', 'cloudwatch', 'kubernetes']) {
    const catalog = queryPlanHomeCatalog(provider), calls = [];
    const home = createHomeMonitoring({ cluster: 'context', available: () => true, update() {}, service: async (name, input) => {
      if (name.endsWith('catalog')) return catalog;
      calls.push(input); return queryPlanHomeReply(input);
    } });
    try { await home.load(); assert.equal(calls.length, 26, provider); }
    finally { home.dispose(); }
  }
});

test('query_plan_home_overlapping_windows_and_dispose_keep_atomic_plan_and_two_native_slots', async () => {
  const pending = [], catalog = queryPlanHomeCatalog(); let now = '2026-11-05T00:15:00.000Z', active = 0, maximum = 0;
  const home = createHomeMonitoring({ cluster: 'context', available: () => true, update() {}, now: () => now, service: async (name, input) => {
    if (name.endsWith('catalog')) return catalog;
    active++; maximum = Math.max(maximum, active);
    return new Promise(resolve => pending.push({ input, finish() { active--; resolve(queryPlanHomeReply(input)); } }));
  } });
  try {
    const old = home.load(); await new Promise(resolve => setImmediate(resolve)); assert.equal(pending.length, 2);
    now = '2026-11-05T00:30:00.000Z'; const next = home.load(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(pending.length, 2); pending[1].finish(); pending[0].finish();
    for (let index = 2; index < 8; index += 2) { await new Promise(resolve => setImmediate(resolve)); pending[index + 1].finish(); pending[index].finish(); }
    await Promise.all([old, next]);
    assert.equal(maximum, 2); assert.equal(home.state.window.to, now);
    assert.ok(Object.values(home.state.items[0].results).every(result => result.request.queryWindow.to === now));
    assert.ok(pending.every(item => queryPlanRoles.some(role => item.input.queryId === 'query-' + role)));
    const committed = structuredClone(home.state), stopped = home.load(); await new Promise(resolve => setImmediate(resolve));
    home.dispose(); for (const item of pending.slice(8)) item.finish(); await stopped;
    assert.deepEqual(home.state.items, committed.items); assert.equal(pending.length, 10);
  } finally { home.dispose(); }
});
test('prometheus_range_uses_requested_absolute_window_and_joins_only_adjacent_evaluation_steps',async()=>{
  const {monitoringChartData}=await import('./monitoring-parts.js');
  const from='2026-11-05T00:00:00.000Z',to='2026-11-05T01:00:00.000Z',at=Date.parse(to)/1000-480,window={from,to,step:60};
  const response={status:'ok',queryWindow:{...window},data:{unit:'cores',matrix:[{metric:{instance:'a'},values:[[at,'1'],[at+60,'2'],[at+120,'3'],[at+300,'4'],[at+360.0000001,'5']]},{metric:{instance:'b'},values:[[at+240,'7']]}]}};
  const chart=monitoringChartData({queryId:'cpu'},response,{timeAxisWindow:window,prometheusRange:true});
  assert.equal(chart.timeAxis.from,Date.parse(from)/1000);assert.equal(chart.timeAxis.to,Date.parse(to)/1000);
  assert.deepEqual(chart.series[0].observations.map(point=>point.joinPrevious),[false,true,true,false,true]);
  assert.equal(chart.series[0].observations.length,5);assert.deepEqual(chart.series[1].observations.map(point=>point.joinPrevious),[false]);
  const {temporalSegments}=await import('../../../kit/page/index.js'),runs=series=>temporalSegments(series.observations,chart.timeAxis.maxGapSeconds).map(run=>run.map(point=>Math.round(point.at-at)));
  assert.ok(chart.timeAxis.maxGapSeconds>=60&&chart.timeAxis.maxGapSeconds<61);
  assert.deepEqual(runs(chart.series[0]),[[0,60,120],[300,360]]);assert.deepEqual(runs(chart.series[1]),[[240]]);
  const mismatched=monitoringChartData({queryId:'cpu'},{...response,queryWindow:{...window,step:30}},{timeAxisWindow:window,prometheusRange:true});
  assert.equal(mismatched.timeAxis.maxGapSeconds,null);assert.ok(mismatched.series.every(series=>temporalSegments(series.observations,mismatched.timeAxis.maxGapSeconds).every(run=>run.length===1)));
  assert.equal(monitoringChartData({queryId:'cpu'},response).timeAxis,undefined);
});
test('prometheus_range_with_points_outside_the_requested_window_keeps_legacy_axis',async()=>{
  const {monitoringChartData}=await import('./monitoring-parts.js'),window={from:'2026-11-05T00:00:00Z',to:'2026-11-05T01:00:00Z',step:60};
  const chart=monitoringChartData({queryId:'cpu'},{status:'ok',queryWindow:window,data:{matrix:[{metric:{},values:[[1,'1'],[2,'2']]}]}},{timeAxisWindow:window,prometheusRange:true});
  assert.equal(chart.timeAxis,undefined);assert.equal(chart.x.length,2);
});
