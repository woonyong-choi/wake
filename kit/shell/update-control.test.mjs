import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateControl, updatePresentation } from './update-control.js';
import { render } from '../components/sidebar.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('updatePresentation_absent_or_unavailable_native_state_hides_control', () => {
  for (const state of [null, {}, { state: 'idle' }, { state: 'unconfigured' }, { state: 'unsupported' }, { state: 'invented' }]) assert.equal(updatePresentation(state), null);
});

test('updatePresentation_uses_byte_counters_and_never_native_percentage', () => {
  for (const [receivedBytes, totalBytes, expected] of [[0, 100, 0], [25, 100, 25], [100, 100, 100], [50, null, null], [50, 0, null], [-1, 100, null], [101, 100, null], [NaN, 100, null], [10, Infinity, null]]) {
    const view = updatePresentation({ state: 'downloading', receivedBytes, totalBytes, progress: 99 });
    assert.equal(view.progress, expected);
    assert.equal(view.busy, expected === null);
    assert.equal(view.action, 'cancel');
  }
});

test('sidebar_update_markup_has_determinate_aria_only_for_known_bytes', () => {
  const known = String(render({ update: updatePresentation({ state: 'downloading', receivedBytes: 25, totalBytes: 100 }) }));
  assert.match(known, /aria-valuenow="25"/);
  assert.match(known, /stroke-dasharray="25 100"/);
  assert.match(known, /data-action="kit.update.cancel"/);
  const unknown = String(render({ update: updatePresentation({ state: 'downloading', receivedBytes: 25, totalBytes: null }) }));
  assert.doesNotMatch(unknown, /aria-valuenow|stroke-dasharray/);
  assert.match(unknown, /role="status"/);
});

test('updatePresentation_restart_without_unsaved_protection_stays_disabled', () => {
  const view = updatePresentation({ state: 'downloaded', canInstall: true });
  assert.equal(view.disabled, true);
  assert.equal(view.action, undefined);
  assert.equal(view.label, 'update.restartBlocked');
  const output = String(render({ update: view }));
  assert.match(output, /role="group" tabindex="0" aria-label=/);
  assert.match(output, /disabled/);
});

test('updatePresentation_error_has_retry_and_busy_states_are_disabled', () => {
  assert.equal(updatePresentation({ state: 'error', releaseVersion: '2.0.0' }).retry, 'download');
  assert.equal(updatePresentation({ state: 'error' }).retry, 'check');
  for (const state of ['checking', 'installing']) assert.equal(updatePresentation({ state }).disabled, true);
});

test('createUpdateControl_long_download_keeps_progress_polling_and_cancel_available', async () => {
  let native = { state: 'available' }, finishDownload, scheduled;
  const calls = [], views = [];
  const control = createUpdateControl({
    call: async (method, args) => {
      calls.push([method, args]);
      if (method === 'kit.update.download') {
        native = { state: 'downloading', receivedBytes: 25, totalBytes: 100 };
        await new Promise(resolve => { finishDownload = resolve; });
      }
      if (method === 'kit.update.cancel') { native = { state: 'available' }; finishDownload(); }
      return native;
    },
    onChange: view => views.push(view), onError: () => assert.fail('unexpected error'),
    schedule: callback => { scheduled = callback; return 1; }, cancelSchedule: () => { scheduled = null; },
  });
  await control.start();
  const download = control.run('download');
  scheduled(); await flush();
  assert.equal(views.at(-1).progress, 25);
  assert.equal(views.at(-1).disabled, false);
  await control.run('cancel'); await download;
  assert.equal(views.at(-1).action, 'download');
  assert.deepEqual(calls.filter(([name]) => name !== 'kit.update.state'), [['kit.update.download', {}], ['kit.update.cancel', {}]]);
  await control.run('install');
  assert.equal(calls.some(([name]) => name === 'kit.update.install'), false);
  control.stop();
  assert.equal(scheduled, null);
});

test('createUpdateControl_transport_error_uses_error_surface_and_hides_control', async () => {
  let errors = 0, current;
  const control = createUpdateControl({ call: async () => { throw new Error('private diagnostic'); }, onChange: view => { current = view; }, onError: () => { errors++; } });
  await control.start();
  assert.equal(errors, 1);
  assert.equal(current, null);
  control.stop();
});

test('createUpdateControl_stop_prevents_late_responses_from_republishing', async () => {
  let resolve, changes = 0;
  const control = createUpdateControl({ call: () => new Promise(done => { resolve = done; }), onChange: () => { changes++; }, onError: () => assert.fail('unexpected error') });
  const start = control.start(); control.stop(); resolve({ state: 'available' }); await start;
  assert.equal(changes, 0);
});

test('createUpdateControl_transient_poll_failure_keeps_cancel_and_clears_stale_percentage', async () => {
  let reads = 0, scheduled, view, errors = 0;
  const control = createUpdateControl({
    call: async () => { if (++reads === 2) throw new Error('offline'); return { state: 'downloading', receivedBytes: 25, totalBytes: 100 }; },
    onChange: next => { view = next; }, onError: () => { errors++; },
    schedule: callback => { scheduled = callback; return 1; }, cancelSchedule: () => { scheduled = null; },
  });
  await control.start();
  scheduled(); await flush();
  assert.equal(errors, 1);
  assert.equal(view.action, 'cancel');
  assert.equal(view.progress, null);
  assert.equal(view.status, 'update.refreshFailed');
  assert.equal(typeof scheduled, 'function');
  scheduled(); await flush();
  assert.equal(view.progress, 25);
  control.stop();
});
