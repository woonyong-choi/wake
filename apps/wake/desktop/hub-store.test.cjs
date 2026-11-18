const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createHubStore } = require('./hub-store.cjs');
const { createSourceStates } = require('./reads/source-checks.cjs');

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-17T00:00:00Z');

function fixture(t) {
  const root = path.resolve(__dirname, '../../../.local/tmp');
  fs.mkdirSync(root, { recursive: true });
  const userData = fs.mkdtempSync(path.join(root, 'retention-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const open = () => createHubStore({ userData, maskText: text => ({ text, n: 0 }), now: () => NOW });
  return { store: open(), open, setKeep: value => fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ 'wake.archive.keep': value })) };
}

test('prune_default_keeps_conversations_365_days_events_7_and_other_records_90', t => {
  const { store, open } = fixture(t);
  for (const [name, days, kind] of [['conversations', 365, 'docs'], ['incidents', 90, 'docs'], ['approvals', 90, 'docs'], ['audit', 90, 'log'], ['evidence', 90, 'log'], ['alert-history', 90, 'log'], ['source-checks', 90, 'log'], ['events', 7, 'log']]) {
    const collection = store[kind](name), cutoff = NOW - days * DAY;
    for (const [id, at] of [['older', cutoff - 1], ['boundary', cutoff], ['newer', cutoff + 1]]) {
      if (kind === 'docs') collection.put(id, { at, state: id === 'boundary' ? 'archived' : 'active' });
      else collection.append({ id, at });
    }
    assert.equal(collection.prune(), 1, name);
    const reopened = open()[kind](name);
    const rows = kind === 'docs' ? reopened.all() : reopened.list();
    assert.deepEqual(rows.map(r => r.id), ['boundary', 'newer'], name);
  }
  store.docs('conversations').put('day-91', { at: NOW - 91 * DAY });
  assert.equal(open().prune(), 0);
  assert.ok(open().docs('conversations').get('day-91'));
});

test('prune_uses_saved_conversation_selection_on_restart_and_each_cleanup', t => {
  const { store, open, setKeep } = fixture(t);
  for (const value of ['90', '365', '0', 'invalid']) {
    setKeep(value);
    const days = value === '90' ? 90 : 365;
    for (const state of ['active', 'archived']) {
      const id = value + '-' + state;
      store.docs('conversations').put(id, { at: NOW - days * DAY - 1, state });
      store.docs('conversations').put(id + '-boundary', { at: NOW - days * DAY, state });
      store.log('audit').append({ id, at: NOW - 90 * DAY - 1 });
      open().prune();
      assert.equal(Boolean(store.docs('conversations').get(id)), value === '0', id);
      assert.ok(store.docs('conversations').get(id + '-boundary'));
      assert.equal(store.log('audit').list().length, 0);
    }
  }
  setKeep('0');
  store.docs('conversations').put('forever', { at: NOW - 1000 * DAY });
  store.prune();
  assert.ok(open().docs('conversations').get('forever'));
  setKeep('90');
  store.prune();
  assert.equal(open().docs('conversations').get('forever'), null);
});

test('source_checks_read_uses_same_retention_as_persisted_records', t => {
  const { store } = fixture(t);
  const log = store.log('source-checks');
  log.append({ at: NOW - 8 * DAY, start: NOW - 8 * DAY, cluster: 'fixture', source: 'kubernetes', ok: true, ms: 1 });
  const sources = createSourceStates({ log, now: () => NOW });
  const result = sources.state('fixture', 'kubernetes');
  assert.equal(result.retention.days, 90);
  assert.equal(result.lastSuccessAt, new Date(NOW - 8 * DAY).toISOString());
});
