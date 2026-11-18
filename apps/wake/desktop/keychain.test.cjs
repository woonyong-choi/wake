/* K-02 키체인 파일(secrets.json): 원자적 쓰기(임시 파일 + fsync + rename), 읽을 수 없는 파일 위에는 쓰지 않고 사본을 남김.
   safeStorage는 대역(뒤집은 글자). node --test apps/wake/desktop/keychain.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKeychain } = require('./keychain.cjs');

const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from([...s].reverse().join('')), decryptString: b => [...b.toString()].reverse().join('') };
const home = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-keychain-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };

test('keychain_writes_secrets_atomically_with_fsync_and_leaves_no_temp_file', t => {
  const dir = home(t), calls = [];
  const spy = { ...fs, fsyncSync: fd => { calls.push('fsync'); return fs.fsyncSync(fd); }, renameSync: (a, b) => { calls.push(['rename', path.basename(b)]); return fs.renameSync(a, b); } };
  const k = createKeychain({ safeStorage, userData: dir, fsImpl: spy });
  const ref = k.set('s3cret', 'ai-key');
  assert.equal(k.get(ref), 's3cret');
  assert.deepEqual(calls, ['fsync', ['rename', 'secrets.json']], 'temp file synced, then renamed over secrets.json');
  assert.deepEqual(fs.readdirSync(dir), ['secrets.json']);
  assert.equal(fs.statSync(path.join(dir, 'secrets.json')).mode & 0o777, 0o600);
});

test('keychain_keeps_the_old_file_when_the_rename_fails', t => {
  const dir = home(t);
  const k = createKeychain({ safeStorage, userData: dir });
  const ref = k.set('first');
  const before = fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8');
  const broken = createKeychain({ safeStorage, userData: dir, fsImpl: { ...fs, renameSync() { throw new Error('disk full'); } } });
  assert.throws(() => broken.set('second'), /disk full/);
  assert.equal(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8'), before);
  assert.deepEqual(fs.readdirSync(dir), ['secrets.json'], 'no temp file left');
  assert.equal(k.get(ref), 'first');
});

test('keychain_refuses_to_write_over_an_unreadable_secrets_file_and_keeps_a_backup', t => {
  const dir = home(t), file = path.join(dir, 'secrets.json');
  fs.writeFileSync(file, '{"wake-keychain:ai-key:1":"abc", trunc', { mode: 0o600 });
  const k = createKeychain({ safeStorage, userData: dir });
  assert.throws(() => k.set('new'), e => e.kind === 'keychain_corrupt');
  assert.throws(() => k.delete('wake-keychain:ai-key:1'), e => e.kind === 'keychain_corrupt');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"wake-keychain:ai-key:1":"abc", trunc', 'the damaged file is not overwritten');
  const backups = fs.readdirSync(dir).filter(n => n.startsWith('secrets.json.corrupt-'));
  assert.equal(backups.length, 1, 'one backup copy');
  assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), '{"wake-keychain:ai-key:1":"abc", trunc');
  assert.equal(fs.statSync(path.join(dir, backups[0])).mode & 0o777, 0o600);
  assert.equal(k.get('wake-keychain:ai-key:1'), undefined, 'reads give nothing rather than a guess');
  k.list(); k.has('x');
  assert.equal(fs.readdirSync(dir).filter(n => n.startsWith('secrets.json.corrupt-')).length, 1, 'the backup is made once');
});
