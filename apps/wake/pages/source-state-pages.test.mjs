import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import ko from '../locale/ko.js';
import kitKo from '../../../kit/locale/ko.js';
import { extendIcons, extendGlyphs } from '../../../kit/index.js';
import { ICON_MAP } from '../icon-map.js';
import { GLYPHS } from '../glyphs.js';

extendGlyphs(GLYPHS); extendIcons(ICON_MAP);
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }

async function pageOf(name, get, params = {}) {
  const url = new URL(`./${name}.js`, import.meta.url), source = readFileSync(url, 'utf8'), imports = {};
  let create, hide, refreshSources;
  for (const [, def, list, spec] of source.matchAll(/^import (?:(\w+))?(?:,\s*)?(?:\{([^}]+)\})? from '([^']+)';$/gm)) {
    const mod = await import(new URL(spec, url));
    if (def) imports[def] = mod.default;
    if (spec.endsWith('app.config.js')) { extendGlyphs(mod.default.icons.glyphs); extendIcons(mod.default.icons.map); }
    for (const part of (list ?? '').split(',').map(x => x.trim()).filter(Boolean)) {
      const [key, alias = key] = part.split(/\s+as\s+/); imports[alias] = mod[key];
    }
  }
  imports.bootPage = (_, factory) => { create = factory; };
  imports.setInterval = fn => { refreshSources = fn; return { unref() {} }; };
  imports.clearInterval = () => { refreshSources = null; };
  /* the live poll (kit createLivePoll): the test runs its read by hand; a failed read only lengthens the poll's wait */
  imports.createLivePoll = ({ read }) => ({ start() { refreshSources = () => Promise.resolve(read({ recovering: false })).catch(() => {}); }, stop() { refreshSources = null; } });
  imports.globalThis = { addEventListener: (_event, fn) => { hide = fn; } };
  new Function(...Object.keys(imports), source.replace(/^import .*;\n/gm, ''))(...Object.values(imports));
  let state = {}, settings = {}; /* 셸처럼 쓰기를 바로 설정에 남긴다(범위 상자는 늘 설정에서 읽음) */
  const ctx = { params: { cluster: 'c1', ...params }, query: {}, api: { setMeta() {}, setSetting: (key, value) => { settings = { ...settings, [key]: value }; } }, data: { get }, settings: () => settings, update() {},
    t: (key, vars) => (ko[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? ''),
    state: () => state, setState: patch => { state = { ...state, ...patch }; } };
  const page = await create(ctx); state = structuredClone(page.screen.state);
  return { page, ctx, refreshSources: () => refreshSources?.(), render: () => page.render().s, hide: () => hide?.() };
}

for (const view of ['network', 'alerts']) test(`${view}_failed_reread_keeps_last_values_and_recovery_replaces_them`, async () => {
  let failed = false, changed = false, value = 7;
  const at = Date.now(), source = () => ({ state: failed ? 'error' : 'ready', last: at, target: { uid: 'same' } });
  const network = () => ({ at: new Date(at).toISOString(), range: { from: at - 60_000, to: at }, step: 15, queries: { rx: 'rx', tx: 'tx' },
    rx: [{ metric: { namespace: 'shop', service: 'web' }, values: [[at / 1000, String(value * 1024)]] }], tx: [], ingress: [] });
  const alerts = () => ({ at: new Date(at).toISOString(), rules: { groups: [{ name: 'test', rules: [{ name: 'Unavailable', type: 'alerting', alerts: [{ state: 'firing', activeAt: new Date(at).toISOString(), labels: { pod: `pod-${value}` } }] }] }] }, alertmanager: [], history: [] });
  const app = await pageOf(view, async key => {
    if (key === view) { if (failed) throw Object.assign(new Error('read failed'), { kind: changed ? 'identity_changed' : 'timeout' }); return view === 'network' ? network() : alerts(); }
    if (key === 'sourceStates') return { prometheus: source(), alertmanager: source() };
    if (key === 'clusterTools') return [{ kind: 'prometheus' }, { kind: 'alertmanager' }];
    return [];
  });
  const retry = view === 'network' ? 'wake.net.retry' : 'wake.al.retry';
  const expected = view === 'network' ? '7 KiB/s' : 'pod-7';
  await app.page.actions[retry](); assert.ok(app.render().includes(expected));
  failed = true; await app.page.actions[retry]();
  const stale = app.render();
  assert.ok(stale.includes(expected), 'same-target last successful value must survive');
  assert.ok(stale.includes(ko['wake.view.lastCollected'].split('{at}')[0]), 'stale values need their successful observation time');
  assert.ok(stale.includes(ko['wake.flow.a.retry']));
  if (view === 'network') {
    assert.equal(stale.split(ko['wake.view.lastCollected'].split('{at}')[0]).length - 1, 1);
    assert.ok(!stale.includes(ko['wake.find.c.read']));
  }
  failed = false; value = 9; await app.page.actions[retry]();
  assert.ok(app.render().includes(view === 'network' ? '9 KiB/s' : 'pod-9'));
  assert.ok(!app.render().includes(ko['wake.view.toolDown'].replace('{tool}', 'Prometheus')));
  failed = true; changed = true; await app.page.actions[retry]();
  assert.ok(!app.render().includes(view === 'network' ? '9 KiB/s' : 'pod-9'), 'identity change must remove the previous values');
});

test('gitops_forbidden_reread_keeps_applications_and_recovery_replaces_them', async () => {
  let denied = false, name = 'before';
  const app = await pageOf('gitops', async key => {
    if (key === 'gitops') return denied ? { access: 'forbidden', repos: [], controllers: { c1: [{ kind: 'argocd', access: 'forbidden' }] } }
      : { access: 'ok', controllers: {}, repos: [{ id: 'r', apps: [{ name, kind: 'Application', controller: 'argocd', cluster: 'c1', ns: 'app', sync: 'Synced', health: 'Healthy' }] }] };
    if (key === 'sourceStates') return { argocd: { state: denied ? 'forbidden' : 'ready', last: Date.now(), target: { uid: 'same' } } };
    return [];
  });
  try {
    await app.page.actions['wake.git.retry'](); assert.ok(app.render().includes('before'));
    denied = true; await app.page.actions['wake.git.retry']();
    assert.ok(app.render().includes('before'), 'permission failure must not replace the successful list with empty');
    assert.ok(app.render().includes(ko['wake.home.permissionDenied']));
    assert.equal((app.render().match(/data-c="stale-line"/g) || []).length, 1);
    assert.ok(!app.render().includes('class="sti ok"'));
    assert.ok(app.render().includes('Synced')); assert.ok(app.render().includes('Healthy'));
    assert.ok(app.render().includes(ko['wake.view.lastCollected'].split('{at}')[0]));
    denied = false; name = 'after'; await app.page.actions['wake.git.retry']();
    assert.ok(app.render().includes('after')); assert.ok(!app.render().includes(ko['wake.home.permissionDenied']));
  } finally { app.hide(); }
});

test('home_identity_changed_drops_previous_metric_values', async () => {
  let changed = false;
  const at = Date.now();
  const app = await pageOf('cluster-home', async (key, args) => {
    if (key === 'metricSeries') {
      if (changed) throw Object.assign(new Error('target changed'), { kind: 'identity_changed', source: 'prometheus' });
      return { result: [{ metric: {}, values: [[at / 1000, '77']] }], range: { from: at - 60_000, to: at }, step: 15, query: args.series };
    }
    if (key === 'cluster') return { id: 'c1', name: 'test', state: 'ok' };
    if (key === 'summary') return { timeBasis: { referenceAt: new Date(at).toISOString() }, usage: {} };
    if (key === 'sourceStates') return {};
    return [];
  });
  await app.page.actions['wake.home.retry'](); app.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(app.render().includes('>77%</'));
  changed = true; await app.page.actions['wake.home.retry'](); app.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!app.render().includes('>77%</'), 'a replacement target must not inherit old values');
});

for (const view of ['network', 'cluster-home']) test(`${view}_changed_range_failure_drops_old_values_and_can_retry`, async () => {
  let failed = false, value = 77;
  const at = Date.now(), calls = [];
  const app = await pageOf(view, async (key, args) => {
    if (key === 'network' || key === 'metricSeries') {
      calls.push(args);
      if (failed) throw Object.assign(new Error('read failed'), { kind: 'timeout', source: 'prometheus' });
      const common = { at: new Date(at).toISOString(), range: { from: args.from, to: args.to }, step: 15 };
      return key === 'network' ? { ...common, queries: { rx: 'rx', tx: 'tx' }, rx: [{ metric: {}, values: [[args.to / 1000, String(value * 1024)]] }], tx: [], ingress: [] }
        : { ...common, result: [{ metric: {}, values: [[args.to / 1000, String(value)]] }], query: args.series };
    }
    if (key === 'cluster') return { id: 'c1', name: 'test', state: 'ok' };
    if (key === 'summary') return { timeBasis: { referenceAt: new Date(at).toISOString() }, usage: {} };
    if (key === 'sourceStates') return { prometheus: { state: failed ? 'error' : 'ready', last: at, target: { uid: 'same' } } };
    return [];
  });
  const retry = view === 'network' ? 'wake.net.retry' : 'wake.home.retry';
  const shown = () => app.render().includes(view === 'network' ? '77 KiB/s' : '>77%</');
  await app.page.actions[retry](); app.render(); await new Promise(setImmediate);
  assert.ok(shown());
  failed = true;
  for (const range of [{ preset: '15m' }, { from: Math.floor(at / 1000) - 3 * 86400, to: Math.floor(at / 1000) - 2 * 86400, live: false }]) {
    app.ctx.setState({ range }); app.render(); await new Promise(setImmediate);
    assert.ok(!shown(), 'a changed interval must never inherit the previous value');
    assert.ok(!app.render().includes(ko['wake.find.c.read']), 'the failed metrics source must be named');
    assert.ok(app.render().includes('wake.' + (view === 'network' ? 'net' : 'home') + '.retry'));
  }
  assert.ok(calls.at(-1).to < at - 86400_000);
  failed = false; value = 19; await app.page.actions[retry](); app.render(); await new Promise(setImmediate);
  assert.ok(app.render().includes(view === 'network' ? '19 KiB/s' : '>19%</'));
});

for (const kind of ['identity_changed', 'cancelled']) test(`gitops_${kind}_clears_last_applications`, async () => {
  let failed = false;
  const app = await pageOf('gitops', async key => {
    if (key === 'gitops') {
      if (failed) throw Object.assign(new Error('read failed'), { kind });
      return { access: 'ok', repos: [{ id: 'r', apps: [{ name: 'old-application', kind: 'Application', controller: 'argocd', cluster: 'c1', ns: 'app', sync: 'Synced', health: 'Healthy' }] }] };
    }
    return [];
  });
  try {
    await app.page.actions['wake.git.retry'](); assert.ok(app.render().includes('old-application'));
    failed = true; await app.page.actions['wake.git.retry']();
    assert.ok(!app.render().includes('old-application'));
  } finally { app.hide(); }
});

test('home_source_chips_follow_permission_loss_and_recovery_without_reloading_home', async () => {
  let denied = false;
  const at = Date.now();
  const app = await pageOf('cluster-home', async key => {
    if (key === 'metricSeries') throw Object.assign(new Error('not configured'), { kind: 'unconfigured' });
    if (key === 'cluster') return { id: 'c1', state: 'ok' };
    if (key === 'clusterTools') return [{ kind: 'argocd', svc: 'argo', selection: 'verified' }];
    if (key === 'sourceStates') return { argocd: { state: denied ? 'forbidden' : 'ready', last: at, lastSuccessAt: new Date(at).toISOString() } };
    return [];
  });
  await app.page.actions['wake.home.retry']();
  app.page.afterRender({ dataset: {}, ownerDocument: { defaultView: { addEventListener() {} } } });
  assert.ok(!app.render().includes(kitKo['source.perm']));
  denied = true; await app.refreshSources();
  assert.ok(app.render().includes(kitKo['source.perm']));
  denied = false; await app.refreshSources();
  assert.ok(!app.render().includes(kitKo['source.perm']));
});


test('home_source_uid_change_invalidates_saved_and_inflight_series', async () => {
  let uid = 'old', late = false, sourceFailed = false;
  const at = Date.now(), pending = [];
  const app = await pageOf('cluster-home', async (key, args) => {
    if (key === 'metricSeries') {
      const value = { result: [{ metric: {}, values: [[at / 1000, uid === 'old' ? '77' : '19']] }], range: { from: at - 60_000, to: at }, step: 15, query: args.series, sourceState: { target: { uid } } };
      if (late) return new Promise(resolve => pending.push(() => resolve(value)));
      return value;
    }
    if (key === 'cluster') return { id: 'c1', state: 'ok' };
    if (key === 'sourceStates') {
      if (sourceFailed) throw new Error('source read failed');
      return { prometheus: { state: uid === 'old' ? 'ready' : 'unknown', target: { uid }, ...(uid === 'new' ? { previous: { target: { uid: 'old' } } } : {}) } };
    }
    return [];
  });
  await app.page.actions['wake.home.retry'](); app.render(); await new Promise(setImmediate);
  assert.ok(app.render().includes('>77%</'));
  app.page.afterRender({ dataset: {}, ownerDocument: { defaultView: { addEventListener() {} } } });
  late = true; await app.page.actions['wake.home.retry'](); app.render();
  uid = 'new'; await app.refreshSources();
  assert.ok(!app.render().includes('>77%</'), 'source-only refresh must remove old UID values');
  sourceFailed = true; await app.refreshSources();
  for (const resolve of pending) resolve(); await new Promise(setImmediate);
  assert.ok(!app.render().includes('>77%</'), 'late old UID success must not restore values');
  late = false; sourceFailed = false; await app.page.actions['wake.home.retry'](); app.render(); await new Promise(setImmediate);
  assert.ok(app.render().includes('>19%</'), 'new UID observations can be displayed');
});

for (const outcome of ['success', 'failure']) test(`alerts_late_${outcome}_cannot_replace_new_values_phase_or_sources`, async () => {
  const pending = [], at = new Date().toISOString();
  let sourceReads = 0;
  const snapshot = name => ({ at, rules: { groups: [{ rules: [{ name, type: 'alerting', alerts: [{ state: 'firing', activeAt: at, labels: { pod: name } }] }] }] }, alertmanager: [], history: [] });
  const app = await pageOf('alerts', async key => {
    if (key === 'alerts') return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    if (key === 'sourceStates') { sourceReads++; return { prometheus: { state: 'ready', target: { uid: 'same' } } }; }
    return [];
  });
  const a = app.page.actions['wake.al.retry'](), b = app.page.actions['wake.al.retry']();
  pending[1].resolve(snapshot('new-alert')); await b;
  const rendered = app.render(), count = sourceReads;
  assert.ok(rendered.includes('new-alert'));
  if (outcome === 'success') pending[0].resolve(snapshot('old-alert'));
  else pending[0].reject(Object.assign(new Error('old failure'), { kind: 'unconfigured' }));
  await a;
  assert.equal(app.render(), rendered);
  assert.equal(sourceReads, count, 'obsolete requests must not start source refreshes');
});


test('source_lines_reversed_reads_keep_latest_source_state', async () => {
  const { sourceLines } = await import('./view-parts.js'), pending = [];
  const source = sourceLines({ t: k => k, data: { get: key => key === 'sourceStates' ? new Promise(resolve => pending.push(resolve)) : Promise.resolve([]) } }, 'c1');
  const a = source.read(), b = source.read();
  pending[1]({ prometheus: { state: 'ready', target: { uid: 'new' } } }); await b;
  pending[0]({ prometheus: { state: 'forbidden', target: { uid: 'old' } } }); await a;
  assert.equal(source.matches('prometheus', { uid: 'new' }), true);
  assert.equal(source.of('prometheus', Date.now())?.state, 'ok');
});

test('resource_list_late_usage_failure_cannot_erase_new_values', async () => {
  const pending = [];
  const app = await pageOf('resource-list', async key => {
    if (key === 'usage') return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    if (key === 'resources') return [{ name: 'pod', ns: 'app', uid: 'pod', status: ['ok', 'Running'] }];
    return [];
  }, { kind: 'pods' });
  try {
    await app.page.actions['wake.list.retry']();
    pending[1].resolve({ rows: { 'app/pod': { cpu: 123 } } }); await new Promise(setImmediate);
    assert.ok(app.render().includes('123m'));
    pending[0].reject(new Error('old failure')); await new Promise(setImmediate);
    assert.ok(app.render().includes('123m'));
  } finally { app.hide(); }
});

test('logs_late_pod_failure_cannot_replace_new_page_phase', async () => {
  const pending = [];
  const app = await pageOf('logs', async key => {
    if (key === 'resources') return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    if (key === 'logs') return { text: 'latest log line' };
    return [];
  });
  try {
    const a = app.page.actions['wake.logs.retry'](), b = app.page.actions['wake.logs.retry']();
    pending[1].resolve([{ name: 'new-pod', ns: 'app', uid: 'new' }]); await b; await new Promise(setImmediate);
    assert.ok(app.render().includes('new-pod'));
    pending[0].reject(new Error('old failure')); await a;
    assert.ok(app.render().includes('new-pod'));
  } finally { app.hide(); }
});

test('events_late_related_read_cannot_replace_new_timeline', async () => {
  const { eventsView } = await import('./events-view.js'), pending = [];
  const at = Date.now(), state = { evRange: { preset: '1h' }, evType: 'all', evGroup: 'list', evPage: 1 };
  const ctx = { params: { cluster: 'c1' }, query: {}, state: () => state, t: k => ko[k] || k,
    data: { get: (_key, args) => args.kind === 'deployments' ? new Promise(resolve => pending.push(resolve)) : Promise.resolve([]) } };
  const view = eventsView(ctx, { rows: () => [], ready: () => true, loading: () => false, header: () => '', box: { render: () => '', q: () => '', wait: () => false, failure: () => null, relation: () => ({ has: () => true }) }, clusterName: () => 'c1', folded: {} });
  const a = view.read(), b = view.read();
  const row = name => [{ name, ns: 'app', uid: name, createdAt: new Date(at - 1000).toISOString(), raw: { metadata: { creationTimestamp: new Date(at - 1000).toISOString() } } }];
  pending[1](row('new-deployment')); await b;
  assert.ok(view.render().s.includes('new-deployment'));
  pending[0](row('old-deployment')); await a;
  assert.ok(view.render().s.includes('new-deployment'));
  assert.ok(!view.render().s.includes('old-deployment'));
});


test('home_reversed_summary_and_source_reads_keep_latest_snapshot', async () => {
  const summaries = [], sources = [];
  const app = await pageOf('cluster-home', async key => {
    if (key === 'cluster') return { id: 'c1', state: 'ok' };
    if (key === 'summary') return new Promise(resolve => summaries.push(resolve));
    if (key === 'sourceStates') return new Promise(resolve => sources.push(resolve));
    if (key === 'metricSeries') throw Object.assign(new Error('not configured'), { kind: 'unconfigured' });
    return [];
  });
  const a = app.page.actions['wake.home.retry'](), b = app.page.actions['wake.home.retry']();
  summaries[1]({ nodes: { ready: 7, total: 7 } }); sources[1]({}); await b;
  app.render(); await new Promise(setImmediate);
  const newest = app.render();
  summaries[0]({ nodes: { ready: 2, total: 2 } }); sources[0]({ prometheus: { state: 'forbidden' } }); await a;
  assert.equal(app.render(), newest);
});

test('gitops_overlapping_retries_share_one_read_and_keep_its_result', async () => {
  let resolve, calls = 0;
  const app = await pageOf('gitops', async key => {
    if (key === 'gitops') { calls++; return new Promise(done => { resolve = done; }); }
    return [];
  });
  try {
    const a = app.page.actions['wake.git.retry'](), b = app.page.actions['wake.git.retry']();
    await new Promise(setImmediate); assert.equal(calls, 1);
    resolve({ access: 'ok', repos: [{ id: 'r', apps: [{ name: 'current-app', kind: 'Application', controller: 'argocd', cluster: 'c1', ns: 'app', sync: 'Synced', health: 'Healthy' }] }] });
    await Promise.all([a, b]); assert.ok(app.render().includes('current-app'));
  } finally { app.hide(); }
});

test('resource_list_reversed_auxiliary_reads_keep_latest_kinds', async () => {
  const kinds = [];
  const app = await pageOf('resource-list', async key => {
    if (key === 'kinds') return new Promise(resolve => kinds.push(resolve));
    if (key === 'resources') return [];
    return [];
  }, { kind: 'pods' });
  try {
    await new Promise(setImmediate);
    await app.page.actions['wake.list.retry']();
    const last = kinds.length - 1;
    kinds[last]([{ items: [{ plural: 'pods', kind: 'Pod', count: 7 }] }]); await new Promise(setImmediate);
    const newest = app.render();
    assert.ok(!newest.includes(ko['wake.rv.limited'].split('{')[0]), 'the newest read has no locked kind');
    kinds[last - 1]([{ items: [{ plural: 'pods', kind: 'Pod', count: 2, readStatus: 'forbidden' }] }]); await new Promise(setImmediate);
    assert.ok(!app.render().includes(ko['wake.rv.limited'].split('{')[0]), 'the older read does not bring the lock back');
  } finally { app.hide(); }
});


test('home_unconfigured_source_keeps_explicit_off_state_and_usage_fallback', async () => {
  const app = await pageOf('cluster-home', async key => {
    if (key === 'cluster') return { id: 'c1', state: 'ok' };
    if (key === 'summary') return { usage: { cpu: 42 } };
    if (key === 'sourceStates') return { prometheus: { state: 'unconfigured' } };
    if (key === 'metricSeries') throw Object.assign(new Error('not configured'), { kind: 'unconfigured' });
    return [];
  });
  await app.page.actions['wake.home.retry'](); app.render(); await new Promise(setImmediate);
  assert.ok(app.render().includes('>42%</'), 'unconfigured is off, not perpetual loading');
});

test('home_same_source_refresh_keeps_series_without_starting_another_read', async () => {
  let reads = 0;
  const at = Date.now();
  const app = await pageOf('cluster-home', async (key, args) => {
    if (key === 'cluster') return { id: 'c1', state: 'ok' };
    if (key === 'sourceStates') return { prometheus: { state: 'ready', target: { uid: 'same' } } };
    if (key === 'metricSeries') {
      reads++;
      return { result: [{ metric: {}, values: [[at / 1000, '7']] }], range: { from: at - 60000, to: at }, step: 15, query: args.series, sourceState: { target: { uid: 'same' } } };
    }
    if (key === 'summary') return {};
    return [];
  });
  await app.page.init(); app.render();
  app.page.afterRender({ dataset: {}, ownerDocument: { defaultView: { addEventListener() {} } } });
  const count = reads;
  await app.refreshSources(); app.render(); await new Promise(setImmediate);
  assert.equal(reads, count);
  assert.ok(app.render().includes('>7%</'));
});

test('alerts_critical_severity_count_carries_no_state_tone', async () => {
  const at = Date.now(), source = { state: 'ready', last: at, target: { uid: 'same' } };
  const app = await pageOf('alerts', async key => {
    if (key === 'alerts') return { at: new Date(at).toISOString(), rules: { groups: [{ name: 'g', rules: [{ name: 'Down', type: 'alerting', alerts: [{ state: 'firing', activeAt: new Date(at - 60_000).toISOString(), labels: { severity: 'critical', pod: 'p' } }] }] }] }, alertmanager: [], history: [] };
    if (key === 'sourceStates') return { prometheus: source, alertmanager: source };
    if (key === 'clusterTools') return [{ kind: 'prometheus' }, { kind: 'alertmanager' }];
    return [];
  });
  try {
    await app.page.actions['wake.al.retry']();
    const item = /<span class="sbar-item[^>]*s-critical[^>]*>/.exec(app.render());
    assert.ok(item, 'critical severity count is shown');
    assert.ok(!/data-tone/.test(item[0]), 'severity count must not carry a state tone (RULE-TONE)');
  } finally { app.hide(); }
});

const levelPills = html => { const bar = html.slice(html.indexOf('data-tabs="wake-log-lv"')); const end = bar.indexOf('pill-ind');
  return [...bar.slice(0, end).matchAll(/data-arg="&quot;(\w+)&quot;"[^>]*>(?:[^<]|<(?!\/button))*?(?:<span class="n">([^<]*)<\/span>)?[^<]*<\/button>/g)].map(m => [m[1], m[2]]); };
const logsWith = logs => pageOf('logs', async key => {
  if (key === 'resources') return [{ name: 'api-0', ns: 'app', uid: 'u-api', containerList: [{ name: 'api' }] }];
  if (key === 'logs') return logs();
  return [];
});

test('logs_level_counts_add_up_to_all_lines_with_debug_and_unlevelled_lines', async () => {
  const at = new Date().toISOString();
  const app = await logsWith(() => ({ text: [`${at} {"level":"debug","msg":"a"}`, `${at} {"level":"debug","msg":"b"}`, `${at} ERROR boom`, `${at} plain line`].join('\n') }));
  try {
    await app.page.actions['wake.logs.retry'](); await new Promise(setImmediate);
    const pills = Object.fromEntries(levelPills(app.render()));
    const sum = Object.entries(pills).filter(([id]) => id !== 'all').reduce((n, [, v]) => n + Number(v), 0);
    assert.equal(pills.all, '4');
    assert.equal(sum, 4, `level buckets ${JSON.stringify(pills)} must add up to all lines`);
  } finally { app.hide(); }
});

test('logs_read_failure_shows_cause_and_no_zero_counts', async () => {
  const app = await logsWith(() => { throw new Error("Error invoking remote method 'kit:service:call': Error: kubernetes API request failed (HTTP 500)"); });
  try {
    await app.page.actions['wake.logs.retry'](); await new Promise(setImmediate);
    const html = app.render();
    assert.ok(html.includes('HTTP 500'), 'the failure names its cause');
    assert.deepEqual(levelPills(html).filter(([, n]) => n != null), [], 'no level counts without a read');
    assert.ok(!/s-?h&quot;|summary-bar&quot;,&quot;h&quot;/.test(html) && !/>ERROR<\/span><b>0</.test(html), 'no ERROR 0 in the card');
  } finally { app.hide(); }
});

/* A-14·A-06: 이벤트 표(이벤트 구역과 상세의 이벤트 탭이 같은 표)는 좁은 폭에서도 대상(Object)·Count·First Seen을 접지 않는다(SCR-RESOURCE-EVENTS-V02).
   접는 열(data-opt)은 Source(먼저)와 Message뿐이다 */
test('events_table_never_folds_object_count_or_first_seen_at_narrow_width', async () => {
  const { eventTable } = await import('./events-view.js');
  const at = Date.now(), s = String(eventTable([{ key: 'Pod/app/p|BackOff', type: 'Warning', reason: 'BackOff', kind: 'Pod', name: 'p', ns: 'app', count: 8, first: at - 300_000, last: at, source: 'kubelet', message: 'm' }], { now: at }));
  const heads = [...s.matchAll(/<th class="[^"]*"([^>]*)>([^<]*)</g)].map(m => [m[2], /data-opt/.test(m[1])]);
  const optional = heads.filter(([, o]) => o).map(([label]) => label);
  assert.deepEqual(optional, ['Type', 'First Seen', 'Source', 'Message'], `only Type, First Seen, Source and Message may fold: ${JSON.stringify(heads)}`);
  /* A3-09: at 548 the two times took the room the Object and the Message needed: First Seen folds first and Last Seen carries it on hover */
  assert.match(s, /data-opt="1"[^>]*>First Seen</, 'First Seen folds first');
  assert.match(s, /data-opt="2"[^>]*>Source</, 'then Source');
  assert.match(s, /data-opt="4"[^>]*>Type</, 'Type folds after Message (A2-05: the Reason keeps the warning mark)');
  assert.match(s, /data-tip="First Seen [^"]+"/, 'the Last Seen cell names the first time on hover');
  assert.match(s, /class="dt-trim" data-trim>Pod\/p</, 'the Object keeps its end when cut (middle trim)');
});

/* A-06·A2-05: 820px 창(사이드바 열림)의 이벤트 표는 가로 스크롤 없이 Last Seen · Reason · Object · Total Count · First Seen을 보인다.
   접는 순서는 Source → Message → Type, 그래도 모자라면 Reason이 제 폭까지 양보하고 대상 칸이 좁아진다(말줄임 + 툴팁). 시각 열은 그 시각 글의 폭만 갖는다.
   폭은 실제 앱에서 잰 표 그릇 폭: 820px 창 + 사이드바 → 페이지 548px → 카드 본문(.dt-host) 482px(2026-11-18, wake-lab 이벤트 화면) */
const MAIN_820 = 482;
test('events_table_fits_an_820px_window_without_a_sideways_scroll', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 820, height: 600 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/kit/tokens.css`);
    await page.setContent('');
    for (const sheet of ['/kit/tokens.css', '/kit/base.css']) await page.addStyleTag({ url: `http://127.0.0.1:${server.address().port}${sheet}` });
    const got = await page.evaluate(async width => {
      document.body.appendChild(document.createElement('main')).style.width = width + 'px';
      const kit = await import('/kit/components/index.js'), { eventTable } = await import('/apps/wake/pages/events-view.js');
      kit.addAllStyles();
      const now = Date.parse('2026-11-18T13:50:00Z'), day = 86_400_000;
      const row = (key, type, reason, kind, name, count, first) => ({ key, type, reason, kind, name, ns: 'payments', count, first, last: now - 3_600_000, source: 'kubelet', message: 'Readiness probe failed: HTTP probe failed with statuscode: 503' });
      document.querySelector('main').innerHTML = String(eventTable([row('a', 'Normal', 'ScalingReplicaSet', 'Deployment', 'checkout-api', 1, now - 3_600_000),
        row('b', 'Warning', 'Unhealthy', 'Pod', 'checkout-api-58cbf4fb5f-x2x9k', 187, now - 3 * day), row('c', 'Warning', 'Unhealthy', 'Pod', 'session-gateway-5b9b768c4d-q8w2p', 306, now - 2 * day),
        row('d', 'Warning', 'FailedComputeMetricsReplicas', 'HorizontalPodAutoscaler', 'checkout-api', 21, now - 2 * day)], { now }));
      kit.attachAll(document, { emit() {} });
      await new Promise(r => setTimeout(r, 300));
      const wrap = document.querySelector('.dt-wrap'), shown = [...document.querySelectorAll('thead th')].filter(th => th.getClientRects().length).map(th => th.textContent);
      return { scroll: wrap.scrollWidth - wrap.clientWidth, shown, object: [...document.querySelectorAll('thead th')].find(th => th.textContent === 'Object').offsetWidth };
    }, MAIN_820);
    for (const label of ['Last Seen', 'Reason', 'Object', 'Total Count']) assert.ok(got.shown.includes(label), `${label} is shown: ${got.shown}`);
    assert.ok(got.object > 120, `the object column has the room the folded First Seen gave back (A3-09): ${got.object}`);
    assert.equal(got.scroll, 0, `the events table fits the body of an 820 pixel window without a sideways scroll: ${JSON.stringify(got)}`);
  } finally { await browser?.close(); server.close(); }
});

/* R4-10: Pod 상세 이벤트 탭(창 약 670px → 표 그릇 605px, 2026-11-18 wake-lab)에서 Unhealthy 두 줄이 같은 글이라 Liveness와 Readiness를 가를 수 없었다.
   Reason 칸이 경고 표시를 가지므로 글만인 Type이 Message보다 먼저 접히고, 이 폭에서 Message가 남아 두 줄의 probe가 보인다 */
const DETAIL_670 = 605;
test('events_table_in_a_pod_detail_tells_a_liveness_from_a_readiness_failure', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 700, height: 600 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/kit/tokens.css`);
    await page.setContent('');
    for (const sheet of ['/kit/tokens.css', '/kit/base.css']) await page.addStyleTag({ url: `http://127.0.0.1:${server.address().port}${sheet}` });
    const got = await page.evaluate(async width => {
      document.body.appendChild(document.createElement('main')).style.width = width + 'px';
      const kit = await import('/kit/components/index.js'), { eventTable } = await import('/apps/wake/pages/events-view.js');
      kit.addAllStyles();
      const now = Date.parse('2026-11-18T13:00:00Z'), pod = 'checkout-api-58cbf4fb5f-pgbhx';
      const row = (key, reason, message, count, last) => ({ key, type: 'Warning', reason, kind: 'Pod', name: pod, ns: 'payments', count, first: now - 3_600_000, last, source: 'kubelet', message });
      document.querySelector('main').innerHTML = String(eventTable([row('a', 'Unhealthy', 'Liveness probe failed: HTTP probe failed with statuscode: 500', 493, now - 36 * 60_000),
        row('b', 'Unhealthy', 'Readiness probe failed: HTTP probe failed with statuscode: 503', 11, now - 53 * 60_000), row('c', 'BackOff', 'Back-off restarting failed container app in pod', 24, now - 56 * 60_000)], { now }));
      kit.attachAll(document, { emit() {} });
      await new Promise(r => setTimeout(r, 300));
      const wrap = document.querySelector('.dt-wrap'), seen = el => !!el.getClientRects().length && el.getBoundingClientRect().width > 0;
      const rows = [...document.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].filter(seen).map(td => td.innerText.trim()).join(' | '));
      return { scroll: wrap.scrollWidth - wrap.clientWidth, shown: [...document.querySelectorAll('thead th')].filter(seen).map(th => th.textContent), rows };
    }, DETAIL_670);
    assert.notEqual(got.rows[0], got.rows[1], `the two Unhealthy rows read alike: ${JSON.stringify(got)}`);
    assert.ok(/Liveness/.test(got.rows[0]) && /Readiness/.test(got.rows[1]), `each row names its probe: ${JSON.stringify(got.rows)}`);
    for (const label of ['Last Seen', 'Reason', 'Object', 'Total Count']) assert.ok(got.shown.includes(label), `${label} stays: ${got.shown}`);
    assert.equal(got.scroll, 0, 'no sideways scroll');
    /* the AI pane's 487px body: the reason column gives its room back and "Unhealthy · Readiness" was cut mid-word with no ellipsis and no full text
       (the probe lost). A cut reason ends in an ellipsis and shows its whole words on hover, probe included */
    const narrow = await page.evaluate(async () => {
      document.querySelector('main').style.width = 440 + 'px';
      await new Promise(r => setTimeout(r, 300));
      return [...document.querySelectorAll('tbody tr')].slice(0, 2).map(tr => {
        const td = [...tr.querySelectorAll('td')].find(c => c.querySelector('.sti-text')), el = td.querySelector('.sti-label') || td.querySelector('.sti-text');
        const cut = el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > td.getBoundingClientRect().right + 1;
        /* the probe's first letters are in sight (an ellipsis takes about a letter): the two rows still read apart when the reason is cut */
        const node = [...el.childNodes].find(n => n.nodeType === 3 && /Liveness|Readiness/.test(n.textContent)), at = node.textContent.search(/Liveness|Readiness/), r = document.createRange();
        r.setStart(node, at); r.setEnd(node, at + 3);
        const seen = r.getBoundingClientRect().right <= Math.min(el.getBoundingClientRect().right, td.getBoundingClientRect().right) - 8;
        return { cut, seen, ellipsis: getComputedStyle(el).textOverflow === 'ellipsis', tip: el.dataset.tip || '' };
      });
    });
    assert.ok(narrow.every(r => r.seen && (!r.cut || (r.ellipsis && /Liveness|Readiness/.test(r.tip)))), `a cut reason keeps its probe in sight, ends in an ellipsis and shows its whole words on hover: ${JSON.stringify(narrow)}`);
  } finally { await browser?.close(); server.close(); }
});

/* A-07: 이벤트 화면의 Warning 수(타임라인 머리 · Warning 칸 · 이벤트 카드 머리)는 한 모집단(범위·거르기를 지난 행)에서 센다.
   범위 밖 대상의 Warning은 타임라인에 없고, 거르기에 맞지 않는 표시는 흐리게 남되 수에 들지 않는다 */
test('events_warning_counts_are_one_population_across_timeline_lane_and_card', async () => {
  const { eventsView } = await import('./events-view.js');
  const at = Date.now(), state = { evRange: { preset: '1h' }, evType: 'all', evGroup: 'list', evPage: 1, evReason: '' };
  const ev = (uid, ns, name, reason) => ({ uid, type: 'Warning', reason, message: reason, object: { kind: 'Pod', name, ns, uid: 'o' + uid }, at: new Date(at - 60_000 * (1 + Number(uid))).toISOString(), count: 5, source: 'kubelet' });
  const rows = Object.assign([ev('1', 'payments', 'a', 'BackOff'), ev('2', 'payments', 'b', 'Unhealthy'), ev('3', 'shop', 'c', 'BackOff'), ev('4', 'shop', 'd', 'Unhealthy'), ev('5', 'shop', 'e', 'Failed')], { timeBasis: { referenceAt: new Date(at).toISOString() } });
  const ctx = { params: { cluster: 'c1' }, query: {}, state: () => state, t: k => ko[k] || k, data: { get: () => Promise.resolve([]) } };
  let q = '';
  const view = eventsView(ctx, { rows: () => rows, ready: () => true, loading: () => false, header: () => '', clusterName: () => 'c1', folded: {},
    box: { render: () => '', q: () => q, wait: () => false, failure: () => null, relation: () => ({ has: (_k, ns) => ns === 'payments' }) } });
  const counts = () => { const s = String(view.render().s);
    return { lane: /data-lane="symptom"[\s\S]*?<b>(\d+)<\/b>/.exec(s)?.[1], heads: [...s.matchAll(/>Warning<\/span><b>(\d+)<\/b>/g)].map(m => m[1]) }; };
  assert.deepEqual(counts(), { lane: '2', heads: ['2', '2', '2'] }, 'scope: two Warning rows everywhere');
  q = 'backoff';
  assert.deepEqual(counts(), { lane: '1', heads: ['1', '1', '1'] }, 'search: the dimmed mark is not counted');
});

/* A2-01: 이벤트 카드 머리의 Reason·발생은 홈 경고 이벤트 카드와 같은 구간 안 발생 수(누적 Event.count가 아님), 표의 누적 수는 Total Count라고 적는다.
   A2-02: 한 Pod의 Readiness 실패와 Liveness 실패(같은 Reason Unhealthy)는 두 행 */
test('events_heads_count_the_window_occurrences_like_the_home_card_and_name_the_cumulative_column', async () => {
  const { eventsView } = await import('./events-view.js');
  const { warningSummary } = await import('../data/home.js');
  const at = Date.now(), state = { evRange: { preset: '1h' }, evType: 'all', evGroup: 'list', evPage: 1, evReason: '' };
  const ev = (uid, message, count, firstAgo) => ({ uid, type: 'Warning', reason: 'Unhealthy', message, object: { kind: 'Pod', name: 'checkout-api-x', ns: 'payments', uid: 'o' }, at: new Date(at - 60_000).toISOString(), firstAt: new Date(at - firstAgo).toISOString(), count, source: 'kubelet' });
  const rows = Object.assign([ev('r', 'Readiness probe failed: 503', 302, 3 * 86_400_000), ev('l', 'Liveness probe failed: 500', 4, 10 * 60_000)], { timeBasis: { referenceAt: new Date(at).toISOString() } });
  const ctx = { params: { cluster: 'c1' }, query: {}, state: () => state, t: k => ko[k] || k, data: { get: () => Promise.resolve([]) } };
  const view = eventsView(ctx, { rows: () => rows, ready: () => true, loading: () => false, header: () => '', clusterName: () => 'c1', folded: {},
    box: { render: () => '', q: () => '', wait: () => false, failure: () => null, relation: () => ({ has: () => true }) } });
  const s = String(view.render().s), home = warningSummary(rows, { from: at - 3_600_000, to: at });
  assert.match(s, />Reason<\/span><b>Unhealthy ≥5<\/b>/, 'the Reason head counts the window occurrences, not 302 + 4');
  assert.ok([...s.matchAll(/>([^<>]+)<\/span><b>≥5<\/b>/g)].some(m => m[1] === ko['wake.view.occurrences']), 'the occurrences head of the events card');
  assert.deepEqual([home.inWindow, home.atLeast], [5, true], 'the home card counts the same');
  const { TOTAL_COUNT } = await import('./events-view.js');
  assert.ok(new RegExp('>' + TOTAL_COUNT + '<\\/th>').test(s) && /total/i.test(TOTAL_COUNT), 'the cumulative Event.count is named as such');
  assert.ok(s.includes('Liveness probe failed: 500') && s.includes('Readiness probe failed: 503'), 'the liveness failure has its own row');
});

/* A-03: 대역폭 차트 단위는 자료의 크기에서 고른다(1–2 KiB/s가 MiB/s 축에서 0에 붙지 않음) */
test('network_bandwidth_chart_unit_follows_the_data_not_a_fixed_mib', async () => {
  const at = Date.now(), source = { state: 'ready', last: at, target: { uid: 'same' } };
  const app = await pageOf('network', async key => {
    if (key === 'network') return { at: new Date(at).toISOString(), range: { from: at - 120_000, to: at }, step: 15, queries: { rx: 'rx', tx: 'tx' },
      rx: [{ metric: { namespace: 'shop', service: 'web' }, values: [[at / 1000 - 60, '1024'], [at / 1000, '2048']] }], tx: [], ingress: [] };
    if (key === 'sourceStates') return { prometheus: source };
    if (key === 'clusterTools') return [{ kind: 'prometheus' }];
    return [];
  });
  try {
    await app.page.actions['wake.net.retry']();
    const s = app.render(), unit = /&quot;unit&quot;:&quot;([^&]*)&quot;/.exec(s)?.[1], values = [...s.matchAll(/&quot;value&quot;:([\d.]+)/g)].map(m => Number(m[1]));
    assert.equal(unit, 'KiB/s', 'KiB-sized traffic is drawn on a KiB/s axis');
    assert.ok(values.includes(2), `values in that unit: ${values}`);
  } finally { app.hide(); }
});

/* A-04: 머리의 보관 기간은 출처가 말한 값(Prometheus storageRetention)만, 모르면 쓰지 않는다. 알림은 Alertmanager가 보관 기간을 알려 주지 않아 쓰지 않는다 */
test('section_heads_show_the_source_retention_only_when_the_source_reports_it', async () => {
  const at = Date.now(), source = { state: 'ready', last: at, target: { uid: 'same' } }, kept = ko['wake.inc.list.retention'].split('{n}')[0];
  let retention = 7 * 86400;
  const net = await pageOf('network', async key => {
    if (key === 'network') return { at: new Date(at).toISOString(), range: { from: at - 120_000, to: at }, step: 15, queries: { rx: 'rx', tx: 'tx' }, rx: [], tx: [], ingress: [], retention };
    if (key === 'sourceStates') return { prometheus: source };
    if (key === 'clusterTools') return [{ kind: 'prometheus' }];
    return [];
  });
  const al = await pageOf('alerts', async key => {
    if (key === 'alerts') return { at: new Date(at).toISOString(), rules: { groups: [] }, alertmanager: [], history: [], historyDays: 90 };
    if (key === 'sourceStates') return { prometheus: source, alertmanager: source };
    if (key === 'clusterTools') return [{ kind: 'prometheus' }, { kind: 'alertmanager' }];
    return [];
  });
  try {
    await net.page.actions['wake.net.retry']();
    assert.ok(net.render().includes(ko['wake.inc.list.retention'].replace('{n}', '7')), 'the retention Prometheus reports');
    retention = null; await net.page.actions['wake.net.retry']();
    assert.ok(!net.render().includes(kept), 'no retention when Prometheus does not say');
    await al.page.actions['wake.al.retry']();
    assert.ok(!al.render().includes(kept), 'Alertmanager does not report its retention');
  } finally { net.hide(); al.hide(); }
});

/* A-20: Kubernetes 객체 표(리소스 · 이벤트 · GitOps Application · 네트워크 Service · Node · Ingress)의 머리는 한국어 화면에서도 kubectl 말(영어)이다.
   한 표에 Name · Namespace와 이름 · 포트 · 사용이 섞이지 않는다 */
test('kubernetes_object_table_heads_read_in_kubectl_words_in_korean_too', async () => {
  const heads = ['wake.col.namespace', 'wake.col.lastSync', 'wake.col.syncs', 'wake.col.autoSync', 'wake.col.receive', 'wake.col.transmit', 'wake.col.connections', 'wake.col.retransmits', 'wake.kube.port', 'wake.kube.host', 'wake.kube.path', 'wake.rv.used'];
  const mixed = heads.filter(k => !/^[A-Za-z][A-Za-z ]*$/.test(ko[k] ?? ''));
  assert.deepEqual(mixed, [], `Korean table heads: ${mixed.map(k => `${k}=${ko[k]}`)}`);
  const net = readFileSync(new URL('./network.js', import.meta.url), 'utf8');
  assert.doesNotMatch(net, /label: by === 'ns' \? 'Namespace' : t\('wake\.git\.name'\)/, 'the Service table names its first column Name');
});

/* C-25: 로그 화면의 글(범위 검색 상자)은 출처를 Loki로 바꿔도 그대로 적용된다: 상자에 글이 남았는데 Loki 서버 검색이 빈 값이면 적용된 것처럼 보이기만 한다 */
test('logs_box_text_is_the_loki_search_after_switching_the_source', async () => {
  const reads = [];
  const app = await pageOf('logs', async (key, p) => {
    if (key === 'resources') return [{ name: 'api-0', ns: 'app', uid: 'u-api', containerList: [{ name: 'api' }] }];
    if (key === 'logs') { reads.push(p); return { text: '' }; }
    return [];
  });
  try {
    await app.page.actions['wake.logs.retry'](); await new Promise(setImmediate);
    app.page.actions['kit.composer.send']({ id: 'wake-scope', text: 'timeout' }); await new Promise(setImmediate);
    app.page.actions['wake.log.source']({ arg: { value: 'loki' } }); await new Promise(setImmediate); await new Promise(setImmediate);
    assert.equal(reads.at(-1)?.source, 'loki');
    assert.equal(reads.at(-1)?.search, 'timeout', 'the box text is the Loki search');
  } finally { app.hide(); }
});

/* C-26: 범위 고르기 폭(SCOPE_W)은 view-parts.js 하나에만 있다(화면마다 같은 값을 다시 정의하지 않음) */
test('scope_picker_width_is_defined_once_in_view_parts', () => {
  for (const page of ['logs', 'resource-list', 'network', 'gitops', 'alerts', 'events-view']) {
    assert.doesNotMatch(readFileSync(new URL(`./${page}.js`, import.meta.url), 'utf8'), /const SCOPE_W\b/, `${page}.js redefines SCOPE_W`);
  }
});

/* C-17: 알림 · 네트워크 화면을 닫은 뒤 늦게 온 읽기(범위 관계 · 화면 자료)는 화면을 다시 그리게 하지 않는다 */
for (const view of ['alerts', 'network']) test(`${view}_late_reads_after_the_page_closed_do_not_redraw_it`, async () => {
  const pending = [];
  const app = await pageOf(view, key => new Promise(resolve => pending.push({ key, resolve })));
  let updates = 0;
  app.ctx.update = () => { updates++; };
  app.page.actions['wake.scope.kinds']({ arg: { key: 'kinds', value: 'deployments' } });
  void app.page.actions[view === 'alerts' ? 'wake.al.retry' : 'wake.net.retry']?.();
  await new Promise(setImmediate);
  app.hide(); updates = 0;
  for (const p of pending.splice(0)) p.resolve([]);
  for (let i = 0; i < 6; i++) await new Promise(setImmediate);
  for (const p of pending.splice(0)) p.resolve([]);
  for (let i = 0; i < 6; i++) await new Promise(setImmediate);
  assert.equal(updates, 0, `${view}: a closed page is not redrawn by a late read`);
});

/* C-20: 클러스터 이름 검색은 일부 종류를 읽지 못하면 "결과 없음" 대신 못 읽은 종류와 원인 · 다시 시도를 보이고, 다시 시도는 색인을 다시 읽는다. 수는 다른 카드처럼 천 단위 형식 */
test('cluster_search_names_the_kinds_it_could_not_read_and_reads_the_index_again', async () => {
  const { clusterSearch } = await import('./cluster-search.js');
  let fail = true, reads = 0, updates = 0;
  const pods = Array.from({ length: 1200 }, (_, i) => ({ name: `api-${i}`, ns: 'app', status: ['ok', 'Running'] }));
  const ctx = { t: (key, vars) => (ko[key] || kitKo[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? ''), state: () => ({ q: '' }), update: () => { updates++; }, api: { navigate() {} },
    data: { get: async (_key, p) => { reads++; if (p.kind === 'pods') return pods; if (fail && p.kind === 'deployments') throw Object.assign(new Error('denied'), { status: 403 }); return []; } } };
  const search = clusterSearch(ctx, 'c1');
  search.results({ q: 'checkout' }); for (let i = 0; i < 4; i++) await new Promise(setImmediate);
  const miss = String(search.results({ q: 'checkout' }).s ?? search.results({ q: 'checkout' }));
  assert.ok(!miss.includes(ko['wake.search.none'].replace("'{q}' ", '')), 'a partial index is not "no results"');
  assert.match(miss, /Deployment/, 'names the kind it could not read');
  assert.match(miss, /wake\.search\.retry/, 'offers to read again');
  const hit = String(search.results({ q: 'api' }).s);
  assert.match(hit, /1,200/, 'the count reads like every other count');
  fail = false; const before = reads;
  await search.actions['wake.search.retry'](); for (let i = 0; i < 4; i++) await new Promise(setImmediate);
  assert.ok(reads > before, 'retry reads the index again');
  assert.ok(String(search.results({ q: 'checkout' }).s).includes(ko['wake.search.none'].replace("'{q}' ", '')), 'with every kind read, nothing found is "no results"');
});

/* A-28: 서비스 흐름에 저장소 열이 없으면(Ingress → Service 두 열) 그래프가 카드 폭을 다 쓴다: 쓰지 않는 셋째 열 자리를 남기지 않는다 */
test('network_service_flow_with_two_columns_spans_the_card_width', async () => {
  const at = Date.now(), source = { state: 'ready', last: at, target: { uid: 'same' } };
  const app = await pageOf('network', async key => {
    if (key === 'network') return { at: new Date(at).toISOString(), range: { from: at - 120_000, to: at }, step: 15, queries: { rx: 'rx', tx: 'tx' }, rx: [], tx: [],
      ingress: [{ metric: { namespace: 'shop', ingress: 'web', service: 'web' }, values: [[at / 1000, '2']] }, { metric: { namespace: 'shop', ingress: 'api', service: 'api' }, values: [[at / 1000, '1']] }] };
    if (key === 'sourceStates') return { prometheus: source };
    if (key === 'clusterTools') return [{ kind: 'prometheus' }];
    return [];
  });
  try {
    await app.page.actions['wake.net.retry']();
    const s = app.render(), xs = [];
    const right = Math.max(...[...s.matchAll(/<rect[^>]*\bx="([\d.]+)"[^>]*\bwidth="([\d.]+)"/g)].map(m => Number(m[1]) + Number(m[2])));
    assert.ok(right > 800, `the last tile ends near the right edge of 920: ${right} ${xs}`);
  } finally { app.hide(); }
});
