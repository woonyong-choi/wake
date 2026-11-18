/* 글의 비밀 값 가리기(maskText): node --test apps/wake/data/mask-text.test.mjs
 * 값은 모두 모양만 맞춘 가짜다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskText, maskSecrets } from './mask.js';

const HIDE = '••••';

test('PEM private key block is hidden whole', () => {
  const pem = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEfakefakefakefakefake', 'fakefakefake==', '-----END RSA PRIVATE KEY-----'].join('\n');
  assert.deepEqual(maskText(`key:\n${pem}\ndone`), { text: `key:\n${HIDE}\ndone`, n: 1 });
});

test('secret key=value and key: value', () => {
  assert.deepEqual(maskText('db password=hunter2 user=app'), { text: `db password=${HIDE} user=app`, n: 1 });
  assert.deepEqual(maskText('client_secret: "abc def"'), { text: `client_secret: ${HIDE}`, n: 1 });
  assert.equal(maskText('aws_secret_access_key = wJalrFAKEFAKEFAKE').text, `aws_secret_access_key = ${HIDE}`);
});

test('tokens by shape: JWT, GitHub, Slack, AWS access key id', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.ZmFrZXNpZ25hdHVyZQ';
  assert.deepEqual(maskText(`got ${jwt} ok`), { text: `got ${HIDE} ok`, n: 1 });
  assert.equal(maskText(`ghp_${'A'.repeat(36)}`).text, HIDE);
  assert.equal(maskText('xoxb-0000000000-fakefakefake').text, HIDE);
  assert.equal(maskText('AKIAABCDEFGHIJKLMNOP').text, HIDE);
});

test('card numbers and e-mail addresses', () => {
  assert.deepEqual(maskText('card 4111-1111-1111-1111 by ops@example.test'), { text: `card ${HIDE} by ${HIDE}`, n: 2 });
  assert.equal(maskText('4111111111111111').text, HIDE);
});

test('command rules apply too, one mark, counts only new marks', () => {
  assert.deepEqual(maskText('kubectl get pods --token abc.def'), { text: maskSecrets('kubectl get pods --token abc.def'), n: 1 });
  assert.deepEqual(maskText(`already ${HIDE}`), { text: `already ${HIDE}`, n: 0 });
  assert.deepEqual(maskText('git clone https://me:s3cret@github.com/a/b'), { text: `git clone https://me:${HIDE}@github.com/a/b`, n: 1 });
  assert.deepEqual(maskText('kubectl get pods -n payments -o wide'), { text: 'kubectl get pods -n payments -o wide', n: 0 });
  assert.deepEqual(maskText(null), { text: '', n: 0 });
});

/* S-03: JSON-quoted secret keys, Kubernetes env entries (JSON and YAML) and objects are masked by key name */
test('json_quoted_secret_keys_are_masked_by_key_name', () => {
  assert.deepEqual(maskText('{"user":"app","password":"hunter2"}'), { text: `{"user":"app","password":"${HIDE}"}`, n: 1 });
  assert.equal(maskText('{"db_password": "x y", "apiKey":"k1", "client_secret":"s", "private_key":"p", "credentials":"c"}').text,
    `{"db_password": "${HIDE}", "apiKey":"${HIDE}", "client_secret":"${HIDE}", "private_key":"${HIDE}", "credentials":"${HIDE}"}`);
  /* references and counts are not secrets: a Secret's name, a token count */
  assert.deepEqual(maskText('{"secretName":"db-creds","input_tokens":12,"tokenRef":"wake-keychain:x"}'), { text: '{"secretName":"db-creds","input_tokens":12,"tokenRef":"wake-keychain:x"}', n: 0 });
});

test('env_entries_with_a_secret_name_hide_their_value_in_json_and_yaml', () => {
  assert.deepEqual(maskText('[{"name":"DB_PASSWORD","value":"hunter2"},{"name":"LOG_LEVEL","value":"debug"}]'),
    { text: `[{"name":"DB_PASSWORD","value":"${HIDE}"},{"name":"LOG_LEVEL","value":"debug"}]`, n: 1 });
  assert.deepEqual(maskText('env:\n- name: API_TOKEN\n  value: abc123\n- name: MODE\n  value: prod'),
    { text: `env:\n- name: API_TOKEN\n  value: ${HIDE}\n- name: MODE\n  value: prod`, n: 1 });
});

test('mask_object_hides_secret_keys_and_env_values_and_counts_them', async () => {
  const { maskObject } = await import('./mask.js');
  const { value, n } = maskObject({ spec: { env: [{ name: 'DB_PASSWORD', value: 'hunter2' }, { name: 'MODE', value: 'prod' }] }, auth: { apiKey: 'k', token: 12, secretName: 'db' }, note: 'password=x' });
  assert.deepEqual(value, { spec: { env: [{ name: 'DB_PASSWORD', value: HIDE }, { name: 'MODE', value: 'prod' }] }, auth: { apiKey: HIDE, token: HIDE, secretName: 'db' }, note: `password=${HIDE}` });
  assert.equal(n, 4);
});
