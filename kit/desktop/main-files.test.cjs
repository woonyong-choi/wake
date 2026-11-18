const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/main.cjs', 'utf8');
/* the settings and preferences file helpers, run alone (the rest of main.cjs needs Electron) */
function helpers() {
  const a = source.indexOf('function writeFileAtomic('), b = source.indexOf('\n}\n', source.indexOf('function readJsonFile(')) + 2;
  assert(a >= 0 && b > a, 'settings files are written atomically and read with quarantine');
  return vm.runInNewContext('(() => {' + source.slice(a, b) + '; return { writeFileAtomic, readJsonFile }; })()', { fs, path, process, Date, JSON });
}
test('settings files are replaced whole and an unreadable file is moved aside instead of being overwritten', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-files-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { writeFileAtomic, readJsonFile } = helpers(), file = path.join(dir, 'settings.json');
  writeFileAtomic(file, '{"a":1}');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":1}');
  assert.deepEqual(fs.readdirSync(dir), ['settings.json'], 'no temporary file is left');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(JSON.stringify(readJsonFile(file))), { text: '{"a":1}', value: { a: 1 } });
  fs.writeFileSync(file, '{"a":');
  assert.equal(readJsonFile(file), null);
  const names = fs.readdirSync(dir);
  assert.ok(!names.includes('settings.json'), 'the broken file no longer has the name the next save writes');
  assert.ok(names.some(n => /^settings\.json\.corrupt-\d+$/.test(n)), 'the broken file is kept beside it');
  assert.equal(readJsonFile(path.join(dir, 'missing.json')), null);
});
