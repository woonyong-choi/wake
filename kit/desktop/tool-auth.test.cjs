const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { attachToolAuth, headersFor } = require('./tool-auth.cjs');
test('actual main tool header callback forwards the presented id and origin while old one-argument hooks stay compatible', () => {
  const source = readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const line = source.split('\n').find(line => line.includes('if (toolCfg && hooks.toolHeaders) attachToolAuth'));
  for (const origin of ['https://bound.invalid', 'https://attacker.invalid']) {
    const seen = [], toolCfg = { id: 'fixture-tool', origin };
    vm.runInNewContext(line, { toolCfg, hooks: { toolHeaders(...args) { seen.push(args); return null; } }, view: { webContents: { session: {} } }, attachToolAuth(_session, _origin, read) { read(); } });
    assert.deepEqual(seen[0], ['fixture-tool', origin]);
    let id;
    vm.runInNewContext(line, { toolCfg, hooks: { toolHeaders(value) { id = value; return null; } }, view: { webContents: { session: {} } }, attachToolAuth(_session, _origin, read) { read(); } });
    assert.equal(id, 'fixture-tool');
  }
});
test('tool auth never adds token headers to redirect or other-origin requests', () => {
  let listener, reads = 0;
  const origin = 'https://bound.invalid', headers = () => { reads++; return { Authorization: 'Bearer synthetic-private-token' }; };
  attachToolAuth({ webRequest: { onBeforeSendHeaders(callback) { listener = callback; } } }, origin, headers);
  const results = [];
  listener({ url: 'https://attacker.invalid/path', requestHeaders: {} }, result => results.push(result));
  assert.equal(reads, 0); assert.equal(results[0].requestHeaders.Authorization, undefined);
  listener({ url: origin + '/api', requestHeaders: {} }, result => results.push(result));
  assert.equal(reads, 1); assert.equal(results[1].requestHeaders.Authorization, 'Bearer synthetic-private-token');
  assert.equal(headersFor('https://attacker.invalid', origin, headers), null);
});
