import assert from 'node:assert/strict';
import test from 'node:test';

import config from './app.config.js';

const CLUSTERS_PAGE = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'clusters');

test('cluster_settings_provider_icons_preserve_real_provider_and_fallback_boundaries', () => {
  const providers = [
    ['kind', 'brand-kind'], ['eks', 'brand-eks'], ['gke', 'brand-gke'],
    ['aks', 'brand-aks'], ['docker', 'brand-docker'], ['minikube', 'brand-kubernetes'],
    ['kubernetes', 'brand-kubernetes'], ['unknown', 'brand-kubernetes'], [undefined, 'brand-kubernetes'],
  ];
  const clusters = providers.map(([provider], index) => ({ id: `context-${index}`, provider, state: 'ok' }));

  const sections = CLUSTERS_PAGE.sections({ settings: () => ({ 'wake.clusters.list': clusters }), desktopInfo: () => ({ dev: false }) });
  const rows = sections[0].groups[0].filter(row => row.id !== 'cl-add');

  assert.deepEqual(rows.map(row => row.icon), providers.map(([, icon]) => icon));
});

test('settings cluster row uses shared name and DNS while failure and raw context remain available', () => {
  const server = 'https://gke-real.example.goog', id = 'long-gke-context';
  const c = { id, ctx: id, provider: 'gke', server, state: 'forbidden', version: 'v1.36.4', presentation: { contextId: id, server, clusterName: 'wake-credit-check', projectId: 'project-a', location: 'region-a', source: 'observability-connections.v1' } };
  const settings = { 'wake.clusters.list': [c] };
  const ctx = { settings: () => settings, desktopInfo: () => ({ dev: false }) };
  const row = CLUSTERS_PAGE.sections(ctx)[0].groups[0][0];
  assert.equal(row.title.raw, 'wake-credit-check'); assert.equal(row.description.raw, 'gke-real.example.goog');
  assert.equal(row.connection.kind, 'perm'); assert.ok(row.connection.statusLabel);
  assert.equal(row.connection.action.action, 'wake.cluster.needPerm');
  assert.equal(row.connection.rowArg.address, 'wake://settings/cluster-' + id);
  const child = CLUSTERS_PAGE.children({ settings })[0];
  assert.equal(child.label.raw, 'wake-credit-check'); assert.equal(child.title.raw, 'wake-credit-check');
  assert.equal(c.ctx, id); assert.equal(c.server, server);
});


test('settings tool inventory only shows discovered targets and distinguishes incomplete reads', async () => {
  const tools = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'tools');
  const clusters = ['available', 'partial', 'forbidden', 'timeout', 'empty'].map(id => ({ id, state: 'ok' }));
  const settings = { 'wake.clusters.list': clusters, 'wake.connections': {
    'available-prometheus': { method: 'tool-open' },
    'partial-grafana': { method: 'tool-open' },
    'available-tempo': { method: 'tool-open', where: { tool: { kind: 'tempo', ns: 'monitoring', svc: 'tempo' } } },
  }, 'wake.conn.live': { 'available-tempo': { state: 'connected' } } };
  const ctx = {
    settings: () => settings,
    desktopInfo: () => ({ dev: false }),
    data: { async get(key, { cluster }) {
      if (cluster === 'timeout') throw Object.assign(new Error('private data'), { code: 'tool_deadline' });
      if (key === 'toolAccess') return { access: ['available', 'empty'].includes(cluster) ? 'ok' : cluster, need: cluster === 'forbidden' ? { resource: 'services' } : null };
      if (cluster === 'available') return [
        { kind: 'prometheus', svc: 'monitoring/prometheus:80', selection: 'verified' },
        { kind: 'tempo', svc: 'monitoring/tempo:3200', raw: { kind: 'tempo', ns: 'monitoring', svc: 'tempo', selection: 'unverified' } },
      ];
      if (cluster === 'partial') return [{ kind: 'grafana', svc: 'monitoring/grafana:80', selection: 'unverified' }];
      return [];
    } },
  };
  /* 클러스터마다 따로 읽음: 첫 그림은 기다리지 않고, 답이 다 오면(pending 없음) 다시 그린 것을 본다 */
  let all = tools.sections(ctx); while (all.some(s => s.pending)) { await Promise.all(all.map(s => s.pending)); all = tools.sections(ctx); }
  const sections = all.filter(section => section.tab === 'clusters');
  const [available, partial, denied, timeout, empty] = sections;

  assert.deepEqual(sections.map(section => section.count), [2, 1, undefined, undefined, 0]);
  assert.equal(available.groups[0][0].description.raw, 'monitoring/prometheus:80');
  assert.equal(available.groups[0][0].connection.kind, 'ok');
  assert.equal(available.groups[0][1].connection.kind, 'ok');
  assert.equal(partial.groups[0][0].connection, undefined);
  assert.equal(partial.groups[0][0].control.label, 'wake.home.toolNotReady');
  /* 도구 찾기가 멈춘 행은 같은 연결 행(원인과 다시 시도), 상태 묶음과 버튼을 따로 그리지 않음(검수 M-09) */
  assert.equal(partial.groups[1][0].description, 'wake.gitops.partial');
  assert.equal(partial.groups[1][0].connection.kind, 'warn');
  assert.equal(partial.groups[1][0].connection.action.action, 'kit.settings.reload');
  assert.equal(denied.groups[0][0].connection.action.action, 'wake.perm.show');
  assert.equal(timeout.groups[0][0].description, 'wake.flow.c.timeout');
  assert.equal(timeout.groups[0][0].connection.kind, 'error');
  assert.equal(timeout.groups[0][0].connection.action.action, 'kit.settings.reload');
  assert.equal(empty.groups[0][0].title, 'wake.s.cl.toolsNone');
  assert.doesNotMatch(JSON.stringify(sections), /Alertmanager|kubernetes-mcp|private data/);
});

test('settings_tool_row_health_is_the_hub_source_and_a_finished_flow_never_masks_a_hub_failure', async () => {
  const tools = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'tools');
  const rowOf = async (hubState, live) => {
    const cluster = `hub-${hubState}-${live?.state || 'none'}`;
    const settings = { 'wake.clusters.list': [{ id: cluster, state: 'ok' }], 'wake.connections': { [`${cluster}-prometheus`]: { method: 'tool-open' } },
      'wake.conn.live': live ? { [`${cluster}-prometheus`]: live } : {} };
    const ctx = { settings: () => settings, data: { async get(key) {
      if (key === 'toolAccess') return { access: 'ok' };
      if (key === 'sourceStates') return { prometheus: { state: hubState } };
      return [{ kind: 'prometheus', svc: 'monitoring/prometheus:9090', selection: 'verified' }];
    } } };
    let all = tools.sections(ctx); while (all.some(s => s.pending)) { await Promise.all(all.map(s => s.pending)); all = tools.sections(ctx); }
    return all.find(s => s.tab === 'clusters').groups[0][0].connection;
  };
  /* 끝난 흐름(연결됨·실패)의 기록이 있어도 허브가 끊김·권한 없음·오래됨이면 그것 */
  for (const [hub, kind] of [['error', 'error'], ['forbidden', 'perm'], ['stale', 'warn']]) {
    for (const live of [{ state: 'connected' }, { state: 'failed', cause: 'wake.flow.c.toolDown', kind: 'error' }, undefined]) {
      const c = await rowOf(hub, live);
      assert.equal(c.kind, kind, `${hub} with ${live?.state}`);
      assert.notEqual(c.statusLabel, 'wake.connected');
    }
  }
  /* 허브 정상이면 열기(연결 흐름을 띄우지 않음) */
  const ok = await rowOf('ready', { state: 'connected' });
  assert.equal(ok.kind, 'ok');
  /* 연결된 행 끝은 상태 하나 + 더 보기 메뉴(열기는 그 메뉴 안) */
  const acts = [ok.action, ...(ok.extra || []).flatMap(b => b?.type === 'more' ? b.arg : [b])];
  assert.equal(ok.action, null);
  assert.ok((ok.extra || []).every(b => b.type === 'more'));
  assert.ok(acts.some(b => b?.action === 'wake.tool.open'));
  assert.ok(!acts.some(b => b?.action === 'wake.tool.connect'));
  /* 사람이 하는 조작이 진행 중이면 그 흐름(취소 등)이 줄을 차지 */
  const running = await rowOf('ready', { state: 'running', cancel: true, steps: [{ id: 'reach', label: { raw: 'Reach' }, state: 'run' }] });
  assert.equal(running.busy, true);
});

test('settings_tool_inventory_retry_after_a_failure_reads_again_and_turns_into_rows', async () => {
  const tools = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'tools');
  const cluster = 'retry-inventory';
  let up = false, calls = 0;
  const settings = { 'wake.clusters.list': [{ id: cluster, state: 'ok' }] };
  const ctx = { settings: () => settings, data: { async get(key) {
    calls++;
    if (!up) throw Object.assign(new Error('private data'), { code: 'tool_deadline' });
    if (key === 'toolAccess') return { access: 'ok' };
    if (key === 'sourceStates') return { prometheus: { state: 'ready' } };
    return [{ kind: 'prometheus', svc: 'monitoring/prometheus:9090', selection: 'verified' }];
  } } };
  const settle = async c => { let all = tools.sections(c); while (all.some(s => s.pending)) { await Promise.all(all.map(s => s.pending)); all = tools.sections(c); } return all.find(s => s.tab === 'clusters'); };
  const failed = await settle(ctx);
  assert.equal(failed.groups[0][0].description, 'wake.flow.c.timeout');
  assert.equal(failed.groups[0][0].connection.action.action, 'kit.settings.reload');
  /* 복구 뒤 다시 시도(kit.settings.reload가 넘기는 fresh): 캐시가 아니라 다시 읽고 정상 줄로 */
  up = true; const before = calls;
  const again = tools.sections({ ...ctx, fresh: true });
  assert.ok(again.some(s => s.pending), 'the retry starts a new read');
  const recovered = await settle(ctx);
  assert.ok(calls > before, 'the retry asked the cluster again');
  assert.equal(recovered.groups[0][0].connection.kind, 'ok');
  assert.equal(recovered.count, 1);
});

test('settings_tool_row_follows_the_hub_before_the_discovery_selection', async () => {
  const tools = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'tools');
  const cluster = 'hub-before-selection';
  const settings = { 'wake.clusters.list': [{ id: cluster, state: 'ok' }] };
  const ctx = { settings: () => settings, data: { async get(key) {
    if (key === 'toolAccess') return { access: 'ok' };
    if (key === 'sourceStates') return { prometheus: { state: 'ready' } };
    return [{ kind: 'prometheus', svc: 'monitoring/prometheus', selection: 'not-ready', ready: 0 }];
  } } };
  let all = tools.sections(ctx); while (all.some(s => s.pending)) { await Promise.all(all.map(s => s.pending)); all = tools.sections(ctx); }
  const row = all.find(s => s.tab === 'clusters').groups[0][0];
  assert.equal(row.connection.kind, 'ok', 'the hub read it, so the home chip and this row say the same');
});

test('settings_tool_row_when_the_hub_read_fails_never_shows_an_old_connection_as_healthy_and_retry_reads_the_hub_again', async () => {
  /* 도구 찾기는 성공 × 출처 상태(hub.sources) 조회 거절 × 끝난 연결 기록(connected) × 즉시 복구 */
  const tools = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'tools');
  const cluster = 'hub-read-fails';
  let hubUp = false; const calls = { clusterTools: 0, toolAccess: 0, sourceStates: 0 };
  const settings = { 'wake.clusters.list': [{ id: cluster, state: 'ok' }], 'wake.connections': { [`${cluster}-prometheus`]: { method: 'tool-open', kind: 'tool' } },
    'wake.conn.live': { [`${cluster}-prometheus`]: { state: 'connected' } } };
  const ctx = { settings: () => settings, data: { async get(key) {
    calls[key]++;
    if (key === 'toolAccess') return { access: 'ok' };
    if (key === 'sourceStates') { if (!hubUp) throw new Error('hub unavailable'); return { prometheus: { state: 'ready' } }; }
    return [{ kind: 'prometheus', svc: 'monitoring/prometheus:9090', selection: 'verified' }];
  } } };
  const settle = async c => { let all = tools.sections(c); while (all.some(s => s.pending)) { await Promise.all(all.map(s => s.pending)); all = tools.sections(c); } return all.find(s => s.tab === 'clusters'); };
  const failed = (await settle(ctx)).groups[0][0].connection;
  assert.equal(failed.kind, 'error', 'a failed source read is not "connected"');
  assert.notEqual(failed.statusLabel, 'wake.connected');
  assert.ok(![failed.action, ...(failed.extra || [])].some(b => b?.action === 'wake.tool.open'));
  assert.equal(failed.action?.action, 'kit.settings.reload', 'its one action reads again, it does not start a connection');
  /* 허브 복구 뒤 다시 시도(fresh): 허브를 다시 읽고 정상 */
  hubUp = true; const before = calls.sourceStates;
  tools.sections({ ...ctx, fresh: true });
  const recovered = (await settle(ctx)).groups[0][0].connection;
  assert.ok(calls.sourceStates > before, 'the retry asked the hub again');
  assert.equal(recovered.kind, 'ok');
});
