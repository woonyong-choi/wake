const assert = require('node:assert/strict');
const test = require('node:test');
const { argoDeployment, fluxDeployment } = require('./gitops-deployment.cjs');

const old = 'rev-previous';
const next = 'rev-current';
const at = '2026-11-05T12:00:00Z';
const finished = '2026-11-05T12:02:00Z';

function argoFixture() {
  return {
    spec: { source: { repoURL: 'https://git.invalid/example', targetRevision: 'main', path: 'apps' }, destination: { server: 'https://kubernetes.default.svc' } },
    status: { sync: { revision: next, status: 'OutOfSync' }, health: { status: 'Healthy' }, reconciledAt: at,
      history: [{ id: 2, revision: old, deployedAt: at }] },
  };
}

test('argoDeployment records the current operation beside the recorded successes', () => {
  const app = argoFixture();
  app.status.operationState = { operation: { sync: { revision: next } }, phase: 'Running', startedAt: at };
  let deployment = argoDeployment(app);
  assert.ok(deployment.history.some(record => record.revision[0] === old && record.state === 'succeeded'));
  assert.ok(deployment.history.some(record => record.revision[0] === next && record.state === 'running'));
  app.status.operationState.phase = 'Failed';
  deployment = argoDeployment(app);
  assert.ok(deployment.history.some(record => record.revision[0] === next && record.state === 'failed'));
  app.status.operationState = { operation: { sync: { revision: next, dryRun: true } }, syncResult: { revision: next }, phase: 'Succeeded', startedAt: at, finishedAt: finished };
  assert.equal(argoDeployment(app).history[0].state, 'dryRun');
  assert.equal(argoDeployment(app).history[0].startedAt, at);
});

test('argoDeployment keeps one row for the same successful attempt and preserves a prior retry of that revision', () => {
  const app = argoFixture();
  app.status.operationState = { operation: { sync: { revision: next } }, syncResult: { revision: next },
    phase: 'Succeeded', startedAt: at, finishedAt: finished };
  app.status.history.push(
    { id: 3, revision: next, deployStartedAt: '2026-11-05T11:58:00Z', deployedAt: at },
    { id: 4, revision: next, deployStartedAt: at, deployedAt: finished },
  );
  const matching = argoDeployment(app).history.filter(record => record.revision[0] === next);
  assert.deepEqual(matching.map(record => record.source), ['status.operationState', 'status.history']);
  assert.equal(matching[1].key, 'deploy:3');

  app.status.operationState.operation.sync.dryRun = true;
  assert.equal(argoDeployment(app).history.filter(record => record.revision[0] === next).length, 3);
});

test('argoDeployment keeps source revisions ordered and rejects scalar fallback for multiple sources', () => {
  const app = argoFixture();
  app.spec.sources = [{ targetRevision: 'main' }, { targetRevision: 'release' }];
  assert.deepEqual(argoDeployment(app).history, []);
  app.status.operationState = { operation: { sync: { revisions: ['source-two', 'source-one'] } }, phase: 'Running', startedAt: at };
  assert.deepEqual(argoDeployment(app).history[0].revision, ['source-two', 'source-one']);
});

test('fluxDeployment preserves controller history and keeps inventory without UID unlinked', () => {
  const kustomization = { metadata: { generation: 2 }, spec: {}, status: { observedGeneration: 2 } };
  kustomization.status.history = [
    { metadata: { revision: old }, firstReconciled: at, lastReconciled: at, lastReconciledStatus: 'ReconciliationSucceeded', totalReconciliations: 5 },
    { metadata: { revision: next }, firstReconciled: finished, lastReconciled: finished, lastReconciledStatus: 'HealthCheckFailed', totalReconciliations: 1 },
  ];
  kustomization.status.inventory = { entries: [{ id: 'apps_demo_apps_Deployment', v: 'v1' }, { id: '_demo__Namespace', v: 'v1' }] };
  const deployment = fluxDeployment(kustomization);
  assert.deepEqual(deployment.history.map(record => [record.reason, record.revision[0], record.state]), [['HealthCheckFailed', next, 'failed'], ['ReconciliationSucceeded', old, 'succeeded']]);
  assert.equal(deployment.history[1].count, 5);
  assert.deepEqual(deployment.resources.items[0], { name: 'demo', namespace: 'apps', group: 'apps', kind: 'Deployment', version: 'v1' });
  assert.equal(deployment.resources.items[1].namespace, null);
});

test('argoDeployment_counts_a_self_heal_that_starts_before_the_recorded_deploy_ends_as_the_same_sync', () => {
  /* wake-lab loadgen: history 04:09:18→04:09:20, operationState targeted (resources) self-heal 04:09:20→04:09:21 of the same revision */
  const app = argoFixture();
  app.status.history = [{ id: 0, revision: next, deployStartedAt: '2026-11-15T04:09:18Z', deployedAt: '2026-11-15T04:09:20Z', initiatedBy: { automated: true } }];
  app.status.operationState = { operation: { sync: { revision: next, autoHealAttemptsCount: 1, resources: [{ group: 'apps', kind: 'Deployment', name: 'loadgen' }] }, initiatedBy: { automated: true } },
    syncResult: { revision: next }, phase: 'Succeeded', startedAt: '2026-11-15T04:09:20Z', finishedAt: '2026-11-15T04:09:21Z' };
  assert.equal(argoDeployment(app).history.length, 1, 'one sync, not two');
  app.status.operationState.startedAt = '2026-11-16T09:00:00Z';
  app.status.operationState.finishedAt = '2026-11-16T09:00:01Z';
  assert.equal(argoDeployment(app).history.length, 2, 'a later drift correction is its own sync');
  app.status.operationState.startedAt = '2026-11-15T04:09:20Z';
  app.status.operationState.phase = 'Failed';
  assert.equal(argoDeployment(app).history.length, 2, 'a failed attempt is kept');
});

test('argoDeployment names who started each sync (Argo CD initiatedBy)', () => {
  const app = argoFixture();
  app.status.history[0].initiatedBy = { automated: true };
  app.status.operationState = { operation: { sync: { revision: next }, initiatedBy: { username: 'admin' } }, phase: 'Running', startedAt: at };
  const by = Object.fromEntries(argoDeployment(app).history.map(record => [record.revision[0], record.by]));
  assert.deepEqual(by, { [old]: 'automated', [next]: 'admin' });
  delete app.status.operationState.operation.initiatedBy;
  assert.equal(argoDeployment(app).history.find(record => record.revision[0] === next).by, undefined);
});
