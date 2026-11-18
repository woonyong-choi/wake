const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { create } = require('./services.cjs');
const { loadKubeconfig, yaml } = require('./kubeconfig.cjs');

test('term_env_pins_namespace_and_context_without_modifying_source_or_executing_commands', t => {
  t.mock.method(require('node:fs'), 'watch', () => ({ close() {} }));
  const userData = mkdtempSync(path.join(os.tmpdir(), 'wake-terminal-'));
  const previous = process.env.KUBECONFIG;
  const file = path.join(userData, 'fixture-config');
  const source = yaml.dump({ apiVersion: 'v1', kind: 'Config', 'current-context': 'unrelated',
    contexts: [{ name: 'fixture/a', context: { cluster: 'fixture', user: 'fixture-user', namespace: 'source-ns' } }, { name: 'unrelated', context: { cluster: 'other' } }],
    clusters: [{ name: 'fixture', cluster: { server: 'https://fixture.invalid' } }, { name: 'other', cluster: { server: 'https://other.invalid' } }],
    users: [{ name: 'fixture-user', user: {} }] });
  writeFileSync(file, source); process.env.KUBECONFIG = file;
  t.after(() => { if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous; rmSync(userData, { recursive: true, force: true }); });
  const services = create({ app: { isPackaged: false }, emit() {}, userData });
  const request = { id: 'fixture/a', namespace: 'payments', scope: 'payments', resource: { kind: 'pods', name: 'fixture-pod' } };

  const result = services['term.env'](request);
  const paths = result.env.KUBECONFIG.split(path.delimiter);
  const merged = loadKubeconfig(paths);
  assert.equal(result.cwd, os.homedir());
  assert.equal(merged.current, 'fixture/a');
  assert.deepEqual(merged.contexts.get('fixture/a'), { cluster: 'fixture', user: 'fixture-user', namespace: 'payments', file: paths[0] });
  assert.equal(statSync(paths[0]).mode & 0o777, 0o600);
  assert.equal(readFileSync(file, 'utf8'), source);
  assert.deepEqual(result.target.resource, request.resource);
  assert.equal(result.env.WAKE_NAMESPACE, 'payments');
  assert.equal(result.env.WAKE_RESOURCE_NAME, 'fixture-pod');
  assert.equal(result.command, undefined);
  const other = services['term.env']({ ...request, namespace: 'other', scope: 'other' });
  assert.notEqual(other.env.KUBECONFIG, result.env.KUBECONFIG);
  assert.equal(loadKubeconfig(paths).contexts.get('fixture/a').namespace, 'payments');
  const all = services['term.env']({ id: 'fixture/a', scope: '_all' });
  assert.equal(all.target.namespace, 'source-ns');
  assert.equal(all.env.WAKE_SCOPE_NAMESPACE, '_all');
  assert.equal(services['term.env']({ id: 'unrelated' }).target.namespace, 'default');
  for (const invalid of [{ id: 'missing' }, { ...request, namespace: 'wake://cluster/a' }, { ...request, cwd: 'wake://cluster/a' }, { ...request, resource: { kind: 'pods', name: 'x;echo unsafe' } }, null]) {
    const failure = services['term.env'](invalid);
    assert.ok(failure.error);
    assert.equal(failure.env, undefined);
  }
});

test('observability_services_register_without_connecting_or_exposing_sample_data', async () => {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'wake-observability-services-'));
  const kubeconfig = process.env.KUBECONFIG;
  process.env.KUBECONFIG = path.join(userData, 'missing', 'config');
  try {
    const services = create({ app: { isPackaged: true }, emit() {}, userData });
    assert.deepEqual(services['observability.catalog'](), { status: 'unconfigured', connections: [] });
    assert.equal((await services['observability.read']({})).status, 'invalid_request');
  } finally {
    if (kubeconfig === undefined) delete process.env.KUBECONFIG;
    else process.env.KUBECONFIG = kubeconfig;
    rmSync(userData, { recursive: true, force: true });
  }
});

const GITOPS_TEST_PATHS = Object.freeze({
  applications: '/apis/argoproj.io/v1alpha1/applications',
  kustomizations: '/apis/kustomize.toolkit.fluxcd.io/v1/kustomizations',
  repositories: '/apis/source.toolkit.fluxcd.io/v1/gitrepositories',
  argo: '/apis/apps/v1/namespaces/argocd/deployments/argocd-server',
  flux: '/apis/apps/v1/namespaces/flux-system/deployments/kustomize-controller',
});
function gitopsServices(t, responses = {}) {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'wake-gitops-metadata-'));
  t.after(() => rmSync(userData, { recursive: true, force: true }));
  const calls = [];
  t.mock.method(require('./k8s.cjs'), 'createClient', () => ({ watch: (url, { signal }) => { calls.push({ method: 'WATCH', url }); return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))); }, request: async (method, url) => {
    calls.push({ method, url });
    assert.equal(method, 'GET'); assert.ok(Object.values(GITOPS_TEST_PATHS).includes(url) || Object.hasOwn(responses, url));
    const response = responses[url];
    if (response instanceof Error) throw response;
    return typeof response === 'function' ? response() : structuredClone(response ?? { items: [] });
  } }));
  t.mock.method(require('./kubeconfig.cjs'), 'loadKubeconfig', () => ({ clusters: new Map(), contexts: new Map(), users: new Map() }));
  t.mock.method(require('./kubeconfig.cjs'), 'watchFiles', () => () => {});
  const servicePath = require.resolve('./services.cjs'), previousModule = require.cache[servicePath];
  delete require.cache[servicePath];
  let factory;
  try { factory = require('./services.cjs').create; }
  finally { require.cache[servicePath] = previousModule; }
  const services = factory({ app: { isPackaged: true }, emit() {}, userData });
  t.after(() => services['hub.release']({ id: 'test-context' }));
  return {
    read: () => services['gitops.read']({ id: 'test-context' }),
    calls,
  };
}
function gitopsApplication(name, revision, status = 'OutOfSync') {
  return { metadata: { name, namespace: 'platform-gitops', uid: 'uid-' + name, resourceVersion: '42' },
    spec: { source: { repoURL: 'https://github.com/example/test.git', targetRevision: 'main', path: 'apps/' + name }, destination: { namespace: 'workloads' } },
    status: { sync: { status, revision }, health: { status: 'Degraded' }, reconciledAt: '2026-01-01T00:01:00Z' } };
}

test('gitops_metadata_preserves_source_namespace_uid_and_real_receipt_without_inventing_diff', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-01-02T00:00:00Z') });
  let release;
  const app = gitopsApplication('api', 'revision-a');
  const { read, calls } = gitopsServices(t, { [GITOPS_TEST_PATHS.applications]: () => new Promise(resolve => { release = resolve; }) });
  const pending = read();
  t.mock.timers.tick(5000); release({ items: [app] });
  const result = await pending, actual = result.repos[0].apps[0];
  assert.deepEqual(actual.sourceIdentity, { clusterId: 'test-context', namespace: 'platform-gitops', name: 'api', uid: 'uid-api', resourceVersion: '42' });
  assert.equal(actual.ns, 'workloads'); assert.equal(actual.sync, 'OutOfSync'); assert.equal(actual.health, 'Degraded');
  assert.equal(actual.revision, 'revision-a'); assert.equal(actual.targetRevision, 'main');
  assert.equal(actual.observedAt, null); assert.equal(actual.reconciledAt, app.status.reconciledAt);
  assert.equal(actual.receivedAt, '2026-01-02T00:00:05.000Z');
  assert.equal(actual.diffState, 'not_queried'); assert.equal(actual.diffFiles, null);
  assert.equal(calls.length, 5); assert.equal(result.access, 'ok');
});

test('gitops_reads_after_the_first_serve_argo_applications_from_the_shared_watch_and_the_controller_checks_from_a_short_memo', async t => {
  const app = gitopsApplication('api', 'revision-a', 'Synced');
  const typed = { apiVersion: 'argoproj.io/v1alpha1', kind: 'ApplicationList', metadata: { resourceVersion: '7' }, items: [{ apiVersion: 'argoproj.io/v1alpha1', kind: 'Application', ...app }] };
  const { read, calls } = gitopsServices(t, { [GITOPS_TEST_PATHS.applications]: typed });
  for (let i = 0; i < 4; i++) {
    const result = await read();
    assert.deepEqual(result.repos.flatMap(r => r.apps.map(a => a.name)), ['api'], `read ${i + 1} sees the application`);
    await new Promise(resolve => setImmediate(resolve));
  }
  const gets = path => calls.filter(c => c.method === 'GET' && c.url === path).length;
  assert.ok(calls.some(c => c.method === 'WATCH' && c.url.startsWith(GITOPS_TEST_PATHS.applications + '?watch=1')), 'the applications are watched');
  assert.ok(gets(GITOPS_TEST_PATHS.applications) <= 2, `one GET to find them and one list for the watch, not one per read: ${gets(GITOPS_TEST_PATHS.applications)}`);
  assert.equal(gets(GITOPS_TEST_PATHS.argo), 1, 'the Argo CD server check is reused for a short while');
  assert.equal(gets(GITOPS_TEST_PATHS.flux), 1, 'and the Flux controller check');
});

test('gitops_apps_in_one_repository_keep_distinct_revisions_and_synced_is_not_verified_diff', async t => {
  const first = gitopsApplication('first', 'revision-a', 'Synced'), second = gitopsApplication('second', 'revision-b');
  first.status.health.status = 'Healthy'; second.spec.source.targetRevision = 'release';
  const { read } = gitopsServices(t, { [GITOPS_TEST_PATHS.applications]: { items: [first, second] } });
  const result = await read(); assert.equal(result.repos.length, 1);
  assert.equal(result.repos[0].commit, 'revision-a');
  assert.deepEqual(result.repos[0].apps.map(a => [a.revision, a.targetRevision]), [['revision-a', 'main'], ['revision-b', 'release']]);
  assert.ok(result.repos[0].apps.every(a => a.diffState === 'not_queried' && a.diffFiles === null));
  assert.equal(result.repos[0].apps[0].sync, 'Synced'); assert.equal(result.repos[0].apps[0].health, 'Healthy');
});

test('gitops_multi_source_marks_unbound_source_without_first_source_or_scalar_revision_fallback', async t => {
  const app = gitopsApplication('multiple', 'scalar-must-not-leak', 'Synced');
  delete app.spec.source;
  app.spec.sources = [{ repoURL: 'https://example.invalid/first-source', targetRevision: 'first-branch', path: 'first-path' },
    { repoURL: 'https://example.invalid/second-source', targetRevision: 'second-branch' }];
  const { read } = gitopsServices(t, { [GITOPS_TEST_PATHS.applications]: { items: [app] } });
  const result = await read(), repo = result.repos[0], actual = repo.apps[0];
  assert.equal(actual.multiSource, true); assert.equal(actual.revision, null); assert.equal(actual.targetRevision, null);
  assert.equal(repo.url, ''); assert.equal(repo.branch, ''); assert.equal(repo.commit, ''); assert.equal(actual.path, '');
  assert.equal(actual.sourceIdentity.uid, 'uid-multiple'); assert.equal(actual.diffState, 'not_queried');
  assert.ok(!JSON.stringify(result).includes('first-source')); assert.ok(!JSON.stringify(result).includes('scalar-must-not-leak'));
});

test('gitops_flux_revision_is_exact_last_applied_or_null_with_kustomization_identity_and_no_health_inference', async t => {
  const make = (name, revision) => ({ metadata: { name, namespace: 'flux-workloads', uid: 'uid-' + name, resourceVersion: '17' },
    spec: { sourceRef: { kind: 'GitRepository', name: 'source' }, targetNamespace: 'workloads' },
    status: { lastAppliedRevision: revision, conditions: [{ type: 'Ready', status: 'True' }] } });
  const { read } = gitopsServices(t, {
    [GITOPS_TEST_PATHS.kustomizations]: { items: [make('applied', 'main@sha1:old-applied'), make('missing', undefined), make('empty', '')] },
    [GITOPS_TEST_PATHS.repositories]: { items: [{ metadata: { name: 'source', namespace: 'flux-workloads' },
      spec: { url: 'https://github.com/example/flux.git', ref: { branch: 'main' } }, status: { artifact: { revision: 'main@sha1:new-source' } } }] },
  });
  const result = await read(), repo = result.repos[0];
  assert.equal(repo.commit, 'new-source');
  assert.deepEqual(repo.apps.map(a => a.revision), ['main@sha1:old-applied', null, null]);
  assert.ok(repo.apps.every(a => a.health === null && a.observedAt === null && a.reconciledAt === null && a.diffState === 'not_queried' && a.diffFiles === null));
  assert.equal(repo.apps[0].sourceIdentity.namespace, 'flux-workloads'); assert.equal(repo.apps[0].sourceIdentity.uid, 'uid-applied');
  assert.equal(repo.apps[0].ns, 'workloads'); assert.equal(repo.apps[0].sync, 'Ready');
});

test('gitops_missing_or_empty_source_metadata_stays_null', async t => {
  const app = gitopsApplication('nullable', ''); app.spec.source.targetRevision = '';
  app.status.health = {}; app.status.observedAt = ''; app.status.reconciledAt = '';
  delete app.metadata.uid; delete app.metadata.resourceVersion;
  const { read } = gitopsServices(t, { [GITOPS_TEST_PATHS.applications]: { items: [app] } });
  const actual = (await read()).repos[0].apps[0];
  for (const key of ['revision', 'targetRevision', 'health', 'observedAt', 'reconciledAt']) assert.equal(actual[key], null, key);
  assert.equal(actual.sourceIdentity.uid, null); assert.equal(actual.sourceIdentity.resourceVersion, null);
});

test('gitops_partial_denial_preserves_successful_apps_and_controller_permission_state', async t => {
  const denied = Object.assign(new Error('private-value'), { kind: 'forbidden' });
  const { read } = gitopsServices(t, { [GITOPS_TEST_PATHS.applications]: { items: [gitopsApplication('available', 'revision')] },
    [GITOPS_TEST_PATHS.kustomizations]: denied });
  const result = await read(); assert.equal(result.access, 'partial'); assert.equal(result.repos[0].apps[0].name, 'available');
  assert.equal(result.controllers['test-context'].find(c => c.kind === 'flux').access, 'forbidden');
  assert.ok(!JSON.stringify(result).includes('private-value'));
});

test('gitops_all_denied_network_failure_and_successful_empty_are_distinct', async t => {
  const denied = Object.assign(new Error('private-value'), { kind: 'forbidden', status: 403 });
  const failed = Object.assign(new Error('private-value'), { kind: 'unreachable' });
  const make = error => Object.fromEntries(Object.values(GITOPS_TEST_PATHS).map(p => [p, error]));
  const deniedResult = await gitopsServices(t, make(denied)).read();
  assert.equal(deniedResult.access, 'forbidden'); assert.deepEqual(deniedResult.repos, []);
  await assert.rejects(gitopsServices(t, make(failed)).read(), error => error.code === 'GITOPS_READ_FAILED' && error.kind === 'unreachable' && !error.message.includes('private-value'));
  const empty = await gitopsServices(t).read();
  assert.equal(empty.access, 'ok'); assert.deepEqual(empty.repos, []);
  assert.ok(!JSON.stringify(deniedResult).includes('private-value'));
});


test('gitops_argo_only_excludes_missing_flux_crds_and_controller_from_partial_denominator', async t => {
  const absent = Object.assign(new Error('not found'), { status: 404 });
  const { read, calls } = gitopsServices(t, {
    [GITOPS_TEST_PATHS.applications]: { items: [gitopsApplication('argo-only', 'revision')] },
    [GITOPS_TEST_PATHS.kustomizations]: absent,
    [GITOPS_TEST_PATHS.repositories]: absent,
    [GITOPS_TEST_PATHS.flux]: absent,
  });
  const result = await read();
  assert.equal(result.access, 'ok'); assert.equal(result.repos[0].apps[0].name, 'argo-only');
  assert.deepEqual(result.controllers['test-context'].map(c => c.kind), ['argocd']);
  assert.equal(calls.length, 5);
});

test('gitops_all_absent_is_not_a_permission_or_network_failure', async t => {
  const absent = Object.assign(new Error('not found'), { status: 404 });
  const responses = Object.fromEntries(Object.values(GITOPS_TEST_PATHS).map(p => [p, absent]));
  const result = await gitopsServices(t, responses).read();
  assert.equal(result.access, 'ok'); assert.deepEqual(result.repos, []); assert.deepEqual(result.controllers, {});
});

test('gitops_supported_list_network_failure_rejects_even_when_other_provider_is_absent', async t => {
  const absent = Object.assign(new Error('not found'), { status: 404 });
  const failed = Object.assign(new Error('private-value'), { kind: 'unreachable' });
  const { read, calls } = gitopsServices(t, {
    [GITOPS_TEST_PATHS.applications]: failed,
    [GITOPS_TEST_PATHS.kustomizations]: absent,
    [GITOPS_TEST_PATHS.repositories]: absent,
    [GITOPS_TEST_PATHS.flux]: absent,
  });
  await assert.rejects(read(), error => error.code === 'GITOPS_READ_FAILED' && !error.message.includes('private-value'));
  assert.equal(calls.length, 5);
});

function listTypeServices(t, response, expectedPath) {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'wake-list-type-'));
  t.after(() => rmSync(userData, { recursive: true, force: true }));
  const calls = [];
  t.mock.method(require('./k8s.cjs'), 'createClient', () => ({ request: async (method, url) => {
    calls.push({ method, url }); assert.equal(method, 'GET'); assert.equal(url, expectedPath);
    if (response instanceof Error) throw response;
    return structuredClone(response);
  } }));
  t.mock.method(require('./kubeconfig.cjs'), 'loadKubeconfig', () => ({ clusters: new Map(), contexts: new Map(), users: new Map() }));
  t.mock.method(require('./kubeconfig.cjs'), 'watchFiles', () => () => {});
  const servicePath = require.resolve('./services.cjs'), previousModule = require.cache[servicePath];
  delete require.cache[servicePath]; let factory;
  try { factory = require('./services.cjs').create; }
  finally { require.cache[servicePath] = previousModule; }
  return { services: factory({ app: { isPackaged: true }, emit() {}, userData }), calls };
}
const listEnvelope = (apiVersion, kind, items) => ({ apiVersion, kind, metadata: { resourceVersion: '17' }, items });
const listFailure = error => error.code === 'KUBE_LIST_TYPE_MISMATCH' && error.kind === 'unknown' && error.message === 'invalid resource list response';

function missingWirePod() {
  return { metadata: { name: 'wake-test-5bd7b9db68-8nfzb', namespace: 'wake-test', uid: '8d10cbc3-74cb-4b90-9d19-dbd7f31c1308',
    resourceVersion: '17', labels: { app: 'fixture' }, annotations: { source: 'fixture' }, managedFields: [{ manager: 'fixture' }],
    ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'wake-test-5bd7b9db68', uid: '6ed8e384-5cef-4b15-bdea-ddabf2c69efa', controller: true }] },
    spec: { nodeName: 'fixture-node', containers: [{ name: 'app', image: 'fixture-image' }] }, status: { phase: 'Running' }, extra: { retained: true } };
}

test('kube_list_derives_only_absent_item_types_from_verified_actual_wire_shapes', async t => {
  for (const [plural, apiVersion, kind, item] of [
    ['pods', 'v1', 'Pod', missingWirePod()],
    ['deployments', 'apps/v1', 'Deployment', { metadata: { name: 'wake-test', namespace: 'wake-test', uid: 'cbd2efbc-75f0-4d4e-8501-c5a2e3c2e839', ownerReferences: [] }, spec: { replicas: 1 }, status: { availableReplicas: 1 } }],
  ]) {
    assert.equal(Object.hasOwn(item, 'apiVersion'), false); assert.equal(Object.hasOwn(item, 'kind'), false);
    const response = listEnvelope(apiVersion, kind + 'List', [item]), before = structuredClone(response);
    const { services, calls } = listTypeServices(t, response, (apiVersion === 'v1' ? '/api/v1' : '/apis/' + apiVersion) + '/namespaces/wake-test/' + plural);
    const result = await services['kube.list']({ id: 'test-context', kind: plural, ns: 'wake-test' });
    const expected = { ...item, metadata: { ...item.metadata }, apiVersion, kind }; delete expected.metadata.managedFields;
    assert.deepEqual(result, [expected]); assert.deepEqual(response, before); assert.equal(calls.length, 1);
  }
});

test('kube_list_preserves_explicit_correct_type_and_fills_one_missing_key', async t => {
  for (const item of [{ apiVersion: 'v1' }, { kind: 'Pod' }, { apiVersion: 'v1', kind: 'Pod' }]) {
    const original = { ...item, metadata: { name: 'partial', uid: 'uid-partial' } };
    const { services } = listTypeServices(t, listEnvelope('v1', 'PodList', [original]), '/api/v1/pods');
    const [actual] = await services['kube.list']({ id: 'test-context', kind: 'pods' });
    assert.deepEqual(actual, { ...original, apiVersion: 'v1', kind: 'Pod' });
  }
});

test('kube_list_accepts_only_typed_empty_collection_not_legacy_missing_envelope', async t => {
  const { services } = listTypeServices(t, listEnvelope('v1', 'PodList', []), '/api/v1/pods');
  assert.deepEqual(await services['kube.list']({ id: 'test-context', kind: 'pods' }), []);
  for (const response of [{ items: [] }, {}, null, [], 'fixture', { apiVersion: 'v1', kind: 'PodList' }, listEnvelope('v1', 'PodList', null), listEnvelope('v1', 'PodList', {})]) {
    const { services: invalid } = listTypeServices(t, response, '/api/v1/pods');
    await assert.rejects(invalid['kube.list']({ id: 'test-context', kind: 'pods' }), listFailure);
  }
});

test('kube_list_rejects_wrong_missing_or_nonresource_list_typemeta', async t => {
  for (const response of [listEnvelope('apps/v1', 'PodList', []), listEnvelope('v1', 'DeploymentList', []), listEnvelope('v1', 'List', []),
    listEnvelope('meta.k8s.io/v1', 'Table', []), listEnvelope('v1', 'Status', []), listEnvelope(null, 'PodList', []), listEnvelope('v1', null, [])]) {
    const { services } = listTypeServices(t, response, '/api/v1/pods');
    await assert.rejects(services['kube.list']({ id: 'test-context', kind: 'pods' }), listFailure);
  }
});

test('kube_list_rejects_malformed_item_records', async t => {
  for (const item of [null, [], 'fixture', 17, false]) {
    const { services } = listTypeServices(t, listEnvelope('v1', 'PodList', [item]), '/api/v1/pods');
    await assert.rejects(services['kube.list']({ id: 'test-context', kind: 'pods' }), listFailure);
  }
});

test('kube_list_never_treats_explicit_null_undefined_or_conflicts_as_absence', async t => {
  for (const [key, value] of [['apiVersion', null], ['kind', null], ['apiVersion', undefined], ['kind', undefined], ['apiVersion', ''], ['kind', ''],
    ['apiVersion', 1], ['kind', false], ['apiVersion', 'apps/v1'], ['kind', 'Deployment'], ['kind', 'Secret']]) {
    const item = { [key]: value, metadata: { name: 'conflict' }, data: { fixture: 'not-to-echo' } };
    assert.equal(Object.hasOwn(item, key), true);
    const { services } = listTypeServices(t, listEnvelope('v1', 'PodList', [item]), '/api/v1/pods');
    await assert.rejects(services['kube.list']({ id: 'test-context', kind: 'pods' }), error => listFailure(error) && !error.message.includes('not-to-echo'));
  }
});

test('kube_list_batch_conflict_rejects_without_partial_result_or_input_mutation', async t => {
  const response = listEnvelope('v1', 'PodList', [missingWirePod(), { kind: 'Secret', metadata: { name: 'conflict' } }]);
  const before = structuredClone(response), { services } = listTypeServices(t, response, '/api/v1/pods');
  await assert.rejects(services['kube.list']({ id: 'test-context', kind: 'pods' }), listFailure);
  assert.deepEqual(response, before);
});

test('kube_list_request_failures_keep_original_forbidden_and_timeout_identity', async t => {
  for (const kind of ['forbidden', 'timeout']) {
    const failure = Object.assign(new Error('fixture-request'), { kind, status: kind === 'forbidden' ? 403 : 504 });
    const { services, calls } = listTypeServices(t, failure, '/api/v1/pods');
    await assert.rejects(services['kube.list']({ id: 'test-context', kind: 'pods' }), error => error === failure);
    assert.equal(calls.length, 1);
  }
});

test('kube_list_keeps_encoding_all_cluster_and_namespace_paths', async t => {
  for (const [kind, ns, apiVersion, itemKind, url] of [
    ['pods', 'space/encoded', 'v1', 'Pod', '/api/v1/namespaces/space%2Fencoded/pods'],
    ['pods', '_all', 'v1', 'Pod', '/api/v1/pods'], ['nodes', 'ignored', 'v1', 'Node', '/api/v1/nodes'],
    ['events', 'sample', 'v1', 'Event', '/api/v1/namespaces/sample/events'],
  ]) {
    const { services, calls } = listTypeServices(t, listEnvelope(apiVersion, itemKind + 'List', []), url);
    assert.deepEqual(await services['kube.list']({ id: 'test-context', kind, ns }), []); assert.equal(calls.length, 1);
  }
});

test('kube_list_never_reads_secrets', async t => {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'wake-list-secrets-'));
  t.after(() => rmSync(userData, { recursive: true, force: true }));
  const calls = [];
  t.mock.method(require('./k8s.cjs'), 'createClient', () => ({ request: async (method, url) => { calls.push(url); return {}; } }));
  t.mock.method(require('./kubeconfig.cjs'), 'loadKubeconfig', () => ({ clusters: new Map(), contexts: new Map(), users: new Map() }));
  t.mock.method(require('./kubeconfig.cjs'), 'watchFiles', () => () => {});
  const servicePath = require.resolve('./services.cjs'), previousModule = require.cache[servicePath];
  delete require.cache[servicePath]; let factory;
  try { factory = require('./services.cjs').create; } finally { require.cache[servicePath] = previousModule; }
  const services = factory({ app: { isPackaged: true }, emit() {}, userData });
  await assert.rejects(services['kube.list']({ id: 'test-context', kind: 'secrets', ns: 'sample' }), { kind: 'forbidden' });
  assert.deepEqual(calls, [], 'no request reaches the Secret API');
});

test('kube_list_keeps_namespace_strings_get_and_unsupported_kinds_unchanged', async t => {
  const { services, calls } = listTypeServices(t, { items: [{ metadata: { name: 'legacy-name' } }] }, '/api/v1/namespaces');
  assert.deepEqual(await services['kube.list']({ id: 'test-context', kind: 'namespaces' }), ['legacy-name']);
  for (const kind of ['endpointslices']) await assert.rejects(services['kube.list']({ id: 'test-context', kind }), /unknown kind/);
  assert.equal(calls.length, 1);
  const get = listTypeServices(t, { metadata: { name: 'pod' } }, '/api/v1/namespaces/sample/pods/pod');
  assert.deepEqual(await get.services['kube.get']({ id: 'test-context', kind: 'pods', ns: 'sample', name: 'pod' }), { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'pod' } });
});

test('tool header hook requires the main stored exact binding origin and never returns credentials for a renderer-chosen origin', t => {
  t.mock.method(require('node:fs'), 'watch', () => ({ close() {} }));
  const { createKeychain } = require('./keychain.cjs');
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tool-origin-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const previous = process.env.KUBECONFIG; process.env.KUBECONFIG = path.join(directory, 'missing');
  t.after(() => { if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous; });
  let decrypts = 0;
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from('fixture:' + value), decryptString: bytes => { decrypts++; return bytes.toString().slice(8); } };
  const keychain = createKeychain({ safeStorage, userData: directory }), secret = 'synthetic-tool-header-secret', ref = keychain.set(secret, 'tool-token');
  const origin = 'http://127.0.0.1:12345', binding = { contextId: 'cluster-a', kind: 'grafana', serviceUid: 'service-a', podUid: 'pod-a' };
  const saved = { toolTokens: { 'cluster-a-grafana': ref }, toolMeta: { 'cluster-a-grafana': { contextId: 'cluster-a', kind: 'grafana', origin, binding } } };
  writeFileSync(path.join(directory, 'connections.json'), JSON.stringify(saved));
  const hooks = {}; create({ app: { isPackaged: true }, safeStorage, userData: directory, hooks });
  for (const wrong of [undefined, null, 'https://attacker.invalid', origin + '/', 'http://127.0.0.1:12346']) assert.equal(hooks.toolHeaders('cluster-a-grafana', wrong), null);
  assert.equal(decrypts, 0);
  assert.equal(hooks.toolHeaders('cluster-a-grafana', origin).Authorization, 'Bearer ' + secret); assert.equal(decrypts, 1);
  saved.toolMeta['cluster-a-grafana'].contextId = 'other-context'; writeFileSync(path.join(directory, 'connections.json'), JSON.stringify(saved));
  assert.equal(hooks.toolHeaders('cluster-a-grafana', origin), null); assert.equal(decrypts, 1);
  assert.equal(readFileSync(path.join(directory, 'connections.json'), 'utf8').includes(secret), false);
});

test('normal services discovery owns both context bindings and rejects cross-context tool descriptors before authentication', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tools-services-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  t.mock.method(require('./kubeconfig.cjs'), 'loadKubeconfig', () => ({ clusters: new Map(), contexts: new Map(), users: new Map() }));
  t.mock.method(require('./kubeconfig.cjs'), 'watchFiles', () => () => {});
  const methods = [];
  t.mock.method(require('./k8s.cjs'), 'createClient', (_config, id) => ({ async request(method, url) {
    methods.push(method); assert.equal(method, 'GET');
    const metadata = { name: 'grafana', namespace: 'monitoring', uid: id + '-service' };
    const service = { apiVersion: 'v1', kind: 'Service', metadata, spec: { ports: [{ name: 'http', port: 3000 }], selector: { app: 'grafana' } } };
    if (url === '/api/v1/services') return { apiVersion: 'v1', kind: 'ServiceList', items: [service] };
    if (url.includes('/services/')) return service;
    if (url.includes('/endpoints/')) return { apiVersion: 'v1', kind: 'Endpoints', metadata, subsets: [{ addresses: [{ targetRef: { kind: 'Pod', name: 'grafana-pod', uid: id + '-pod' } }], ports: [{ name: 'http', port: 3000 }] }] };
    if (url.includes('/pods/')) return { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'grafana-pod', namespace: 'monitoring', uid: id + '-pod', labels: { app: 'grafana' } }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } };
    assert.fail('unexpected request');
  } }));
  const servicePath = require.resolve('./services.cjs'), previous = require.cache[servicePath]; delete require.cache[servicePath];
  let factory; try { factory = require('./services.cjs').create; } finally { require.cache[servicePath] = previous; }
  const services = factory({ app: { isPackaged: true }, emit() {}, userData: dir });
  const aws = await services['tools.find']({ id: 'aws' }), gke = await services['tools.find']({ id: 'gke' });
  assert.equal(aws.access, 'ok'); assert.equal(gke.access, 'ok'); assert.notEqual(aws.list[0].bindingId, gke.list[0].bindingId);
  const before = methods.length;
  const result = await services['tool.op']({ op: 'issue', f: { key: 'gke-grafana', cluster: 'gke', tool: aws.list[0] } });
  assert.notEqual(result.ok, true); assert.equal(methods.length, before);
  assert.equal(statSync(dir).isDirectory(), true);
});

test('return226 verified forward rebinding activates only its current origin through the real main header hook', async t => {
  const { createKeychain } = require('./keychain.cjs'), { createToolConnect } = require('./tool-connect.cjs');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tool-rebind-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  t.mock.method(require('node:fs'), 'watch', () => ({ close() {} }));
  const previous = process.env.KUBECONFIG; process.env.KUBECONFIG = path.join(dir, 'missing');
  t.after(() => { if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous; });
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from('fixture:' + value), decryptString: bytes => bytes.toString().slice(8) };
  const keychain = createKeychain({ safeStorage, userData: dir }), secret = 'synthetic-rebind-secret', ref = keychain.set(secret, 'tool-token');
  const file = path.join(dir, 'connections.json'), key = 'cluster-a-grafana', binding = { contextId: 'cluster-a', kind: 'grafana', namespace: 'monitoring', serviceName: 'grafana', serviceUid: 'service-a', port: 3000, podUid: 'pod-a' };
  const read = () => JSON.parse(readFileSync(file, 'utf8')), save = value => writeFileSync(file, JSON.stringify(value));
  save({ toolTokens: { [key]: ref }, toolMeta: { [key]: { contextId: 'cluster-a', kind: 'grafana', origin: 'http://127.0.0.1:12345', binding } } });
  const hooks = {}; create({ app: { isPackaged: true }, userData: dir, safeStorage, hooks });
  const state = { origin: 'http://127.0.0.1:12345', denied: false }, f = { key, cluster: 'cluster-a', tool: { kind: 'grafana' } };
  const ops = createToolConnect({ client: () => ({}), keychain, conns: read, saveConns: save,
    toolAccess: { async open() { return { url: state.origin + '/', binding, async validate() {} }; } },
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).origin, state.origin); assert.equal(options.redirect, 'error'); assert.equal(options.headers.authorization, 'Bearer ' + secret);
      assert.equal(hooks.toolHeaders(key, 'http://127.0.0.1:12345'), null);
      return new Response('[]', { status: state.denied ? 401 : 200 });
    } });
  for (const port of [12346, 12347]) {
    const old = state.origin; state.origin = 'http://127.0.0.1:' + port;
    assert.equal((await ops.verify(f)).ok, true);
    assert.equal(hooks.toolHeaders(key, old), null);
    assert.equal(hooks.toolHeaders(key, 'https://attacker.invalid'), null);
    assert.equal(hooks.toolHeaders(key, state.origin).Authorization, 'Bearer ' + secret);
  }
  state.origin = 'http://127.0.0.1:12348'; state.denied = true;
  assert.equal((await ops.verify(f)).state, 'unauthorized');
  assert.equal(hooks.toolHeaders(key, state.origin), null); assert.equal(hooks.toolHeaders(key, 'http://127.0.0.1:12347'), null);
  assert.equal(read().toolTokens[key], ref);
});

test('operator_bootstrap_receipt_is_main_fixed_and_renderer_cannot_register_or_override_credentials', async t => {
  t.mock.method(require('node:fs'), 'watch', () => ({ close() {} }));
  const userData = mkdtempSync(path.join(os.tmpdir(), 'wake-operator-services-'));
  const previous = process.env.KUBECONFIG; process.env.KUBECONFIG = path.join(userData, 'absent');
  t.after(() => { if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous; rmSync(userData, { recursive: true, force: true }); });
  const services = create({ app: { isPackaged: true }, emit() {}, userData });
  assert.equal(services['tool.operator.enroll'], undefined);
  assert.equal(services['tool.bootstrap'], undefined);
  writeFileSync(path.join(userData, 'tool-bootstrap-operators.json'), JSON.stringify({ version: 1, entries: [{ contextId: 'a', token: 'synthetic-private-password' }] }), { mode: 0o600 });
  const result = await services['tools.find']({ id: 'a', bootstrap: true, operatorContext: 'renderer', origin: 'https://attacker.invalid' });
  assert.deepEqual(result.list, []); assert.notEqual(result.access, 'ok');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private-password|attacker.invalid/);
});

function connectionStore(t, userData) {
  const tools = require('./tool-connect.cjs'), original = tools.createToolConnect;
  let callbacks;
  t.mock.method(tools, 'createToolConnect', options => { callbacks = options; return original(options); });
  t.mock.method(require('./kubeconfig.cjs'), 'watchFiles', () => () => {});
  const modulePath = require.resolve('./services.cjs'), cached = require.cache[modulePath];
  delete require.cache[modulePath];
  t.after(() => { require.cache[modulePath] = cached; });
  require('./services.cjs').create({ app: {}, userData, emit() {} });
  return { read: callbacks.conns, save: callbacks.saveConns };
}
test('connections producer creates 0600 atomic files and preserves all existing valid fields', t => {
  const fs = require('node:fs'), dir = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'wake-conns-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = connectionStore(t, dir), file = path.join(dir, 'connections.json');
  assert.deepEqual(store.read(), { files: [] });
  store.save({ files: ['fixture'], toolMeta: { one: { id: 3 } } });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const original = store.read();
  store.save({ ...original, extra: { preserved: true } });
  assert.deepEqual(store.read(), { ...original, extra: { preserved: true } });
  assert.equal(statSync(file).nlink, 1);
  assert.deepEqual(fs.readdirSync(dir), ['connections.json']);
});
test('connections invalid JSON and insecure existing files are typed failures without overwrite or source leakage', t => {
  const fs = require('node:fs');
  for (const mode of ['json', 'permissions', 'array', 'symlink', 'hardlink']) {
    const dir = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'wake-conns-invalid-')));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const store = connectionStore(t, dir), file = path.join(dir, 'connections.json');
    const body = mode === 'json' ? '{synthetic-private-source' : mode === 'array' ? '[]' : '{"files":[]}';
    writeFileSync(file, body, { mode: 0o600 });
    if (mode === 'permissions') fs.chmodSync(file, 0o664);
    if (mode === 'symlink') { fs.renameSync(file, file + '.original'); fs.symlinkSync(file + '.original', file); }
    if (mode === 'hardlink') fs.linkSync(file, file + '.link');
    for (const action of [() => store.read(), () => store.save({ files: ['replacement'] })]) {
      assert.throws(action, error => error.kind === 'connections' && /^CONNECTIONS_/.test(error.code) && !String(error).includes('synthetic-private-source'));
    }
    assert.equal(readFileSync(file, 'utf8'), body);
  }
});
test('connections prepublication write or rename failure keeps original bytes and removes its temporary file', t => {
  const fs = require('node:fs');
  for (const phase of ['fsync', 'rename']) {
    const dir = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'wake-conns-failure-')));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const store = connectionStore(t, dir), file = path.join(dir, 'connections.json'), bytes = '{"files":[],"untouched":true}';
    writeFileSync(file, bytes, { mode: 0o600 });
    const originalSync = fs.fsyncSync, originalRename = fs.renameSync;
    if (phase === 'fsync') t.mock.method(fs, 'fsyncSync', fd => { if (fs.fstatSync(fd).isFile()) throw new Error('synthetic-private-source'); return originalSync(fd); });
    else t.mock.method(fs, 'renameSync', () => { throw new Error('synthetic-private-source'); });
    assert.throws(() => store.save({ files: ['changed'] }), error => error.kind === 'connections' && !String(error).includes('synthetic-private-source'));
    assert.equal(readFileSync(file, 'utf8'), bytes);
    assert.deepEqual(fs.readdirSync(dir), ['connections.json']);
    fs.fsyncSync = originalSync; fs.renameSync = originalRename;
  }
});

test('legacy owned 0644 connections are strengthened through the same FD without content or inode changes', t => {
  const fs = require('node:fs'), dir = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'wake-conns-legacy-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = connectionStore(t, dir), file = path.join(dir, 'connections.json'), bytes = '{ "files": [], "toolMeta": {"one": {"id": 3}} }';
  writeFileSync(file, bytes, { mode: 0o644 });
  const before = statSync(file);
  assert.deepEqual(store.read(), JSON.parse(bytes));
  assert.equal(statSync(file).mode & 0o777, 0o600); assert.equal(statSync(file).ino, before.ino);
  assert.equal(readFileSync(file, 'utf8'), bytes);
  store.save({ ...store.read(), next: true });
  assert.equal(statSync(file).mode & 0o777, 0o600);
});
test('legacy malformed contents, changed inode and unsafe parent cannot be hardened or overwritten', t => {
  const fs = require('node:fs');
  for (const mode of ['malformed', 'parent', 'race']) {
    const root = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'wake-conns-race-'))), dir = path.join(root, 'home');
    fs.mkdirSync(dir, { mode: 0o700 }); t.after(() => rmSync(root, { recursive: true, force: true }));
    const store = connectionStore(t, dir), file = path.join(dir, 'connections.json');
    const body = mode === 'malformed' ? '{synthetic-private-source' : '{"files":[]}';
    writeFileSync(file, body, { mode: 0o644 });
    const originalChmod = fs.fchmodSync; let changed = false;
    if (mode === 'parent') { fs.renameSync(dir, dir + '.original'); fs.symlinkSync(dir + '.original', dir); }
    if (mode === 'race') t.mock.method(fs, 'readSync', (() => {
      const original = fs.readSync;
      return (...args) => { const n = original(...args); if (!changed) { changed = true; fs.renameSync(file, file + '.original'); writeFileSync(file, body, { mode: 0o644 }); } return n; };
    })());
    assert.throws(() => store.read(), error => error.kind === 'connections');
    assert.equal(statSync(file).mode & 0o777, 0o644); assert.equal(readFileSync(file, 'utf8'), body);
    if (mode === 'race') t.mock.restoreAll();
    assert.equal(fs.fchmodSync, originalChmod);
  }
});
test('post-rename directory fsync failure is explicitly uncertain and never automatically rolls back', t => {
  const fs = require('node:fs'), dir = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'wake-conns-commit-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = connectionStore(t, dir), file = path.join(dir, 'connections.json');
  writeFileSync(file, '{"files":[]}', { mode: 0o600 });
  const sync = fs.fsyncSync;
  t.mock.method(fs, 'fsyncSync', fd => { if (fs.fstatSync(fd).isDirectory()) throw new Error('synthetic-private-source'); return sync(fd); });
  assert.throws(() => store.save({ files: ['committed'] }), error => error.code === 'CONNECTIONS_COMMIT_UNCERTAIN' && error.published === true);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { files: ['committed'] });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dir), ['connections.json']);
});

test('foreign-owner file metadata is rejected before any permission migration or overwrite', t => {
  const fs = require('node:fs'), dir = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'wake-conns-owner-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = connectionStore(t, dir), file = path.join(dir, 'connections.json'), bytes = '{"files":[]}';
  writeFileSync(file, bytes, { mode: 0o644 });
  const original = fs.fstatSync;
  t.mock.method(fs, 'fstatSync', fd => { const stat = original(fd); if (stat.isFile()) stat.uid++; return stat; });
  assert.throws(() => store.read(), error => error.code === 'CONNECTIONS_FILE_INVALID');
  assert.throws(() => store.save({ files: ['replacement'] }), error => error.code === 'CONNECTIONS_FILE_INVALID');
  assert.equal(statSync(file).mode & 0o777, 0o644); assert.equal(readFileSync(file, 'utf8'), bytes);
});


test('logs_section_page_reads_pod_logs_but_other_cluster_pages_are_rejected', async t => {
  t.mock.method(require('node:fs'), 'watch', () => ({ close() {} }));
  const userData = mkdtempSync(path.join(os.tmpdir(), 'wake-logs-page-'));
  const previous = process.env.KUBECONFIG;
  process.env.KUBECONFIG = path.join(userData, 'missing', 'config');
  t.after(() => { if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous; rmSync(userData, { recursive: true, force: true }); });
  const services = create({ app: { isPackaged: true }, emit() {}, userData });
  const owner = sourceAddress => ({ kind: 'page', sourceAddress, isCurrent: () => true, subscribe: () => () => {} });
  const args = { id: 'fixture/a', ns: 'pay', name: 'api-1', uid: 'u-1', container: 'api', previous: false, tail: 500, window: { fromMs: 1, toMs: 2 } };
  const logs = await services['kube.logs'](args, { mainFrame: true }, owner('wake://cluster/fixture%2Fa/logs?from=1'));
  assert.notEqual(logs.error, 'identity_changed');
  for (const address of ['wake://cluster/fixture%2Fa/network', 'wake://cluster/fixture%2Fa/logs/extra', 'wake://cluster/other/logs', 'wake://cluster/fixture%2Fa/ns/other/pods/api-1']) {
    assert.deepEqual(await services['kube.logs'](args, { mainFrame: true }, owner(address)), { error: 'identity_changed' }, address);
  }
});
