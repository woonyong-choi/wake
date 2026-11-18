const assert = require('node:assert/strict');
const test = require('node:test');
const { readPodLogWindow, readLokiPodLogWindow } = require('./pod-logs.cjs');

const start = Date.parse('2026-11-05T12:00:00Z');
const range = { fromMs: start, toMs: start + 900_000 };
const subject = { ns: 'payments', name: 'checkout-0', uid: 'live-pod-uid', container: 'app', previous: false, tail: 100, window: range };
const timestamp = offset => new Date(start + offset).toISOString();
const ns = offset => (BigInt(start) * 1_000_000n) + BigInt(offset);
const labels = { namespace: subject.ns, pod: subject.name, container: subject.container, pod_uid: subject.uid };

function podFixture() {
  return {
    apiVersion: 'v1', kind: 'Pod',
    metadata: { name: subject.name, namespace: subject.ns, uid: subject.uid, creationTimestamp: timestamp(-60_000) },
    spec: { containers: [{ name: subject.container }] },
    status: { containerStatuses: [{ name: subject.container, containerID: 'instance-1', restartCount: 0,
      state: { running: { startedAt: timestamp(-30_000) } } }] },
  };
}

test('readPodLogWindow keeps the 100-line request even with 50,000 source lines and filters the upper bound', async () => {
  const requests = [];
  const source = Array.from({ length: 50_000 }, (_, index) => timestamp(index * 18) + ' log line ' + index);
  const client = { async request(method, path, body, options) {
    assert.equal(method, 'GET');
    requests.push(path);
    if (!path.includes('/log?')) return podFixture();
    const search = new URL(path, 'https://test.invalid').searchParams;
    assert.equal(search.get('tailLines'), '100');
    assert.equal(search.get('sinceTime'), timestamp(0));
    assert.equal(search.get('limitBytes'), '2097152');
    assert.equal(options.maxBytes, 2 * 1024 * 1024);
    return source.slice(-100).join('\n') + '\n';
  } };
  const snapshot = await readPodLogWindow(client, subject);
  assert.equal(snapshot.text.split('\n').length, 100);
  assert.match(snapshot.text, /log line 49999$/);
  assert.equal(snapshot.partial, true);
  assert.equal(requests.length, 3);
  const historical = await readPodLogWindow(client, { ...subject, window: { ...range, toMs: start + 899_000 } });
  assert.equal(historical.text.split('\n').length, 45);
  assert.doesNotMatch(historical.text, /log line 49999/);
  assert.equal(historical.partial, true);
});

test('readPodLogWindow rejects replacement during a read and distinguishes a pre-instance window', async () => {
  let identityReads = 0;
  const replaced = { async request(_method, path) {
    if (path.includes('/log?')) return timestamp(1) + ' new pod log';
    const pod = podFixture();
    if (++identityReads > 1) pod.metadata.uid = 'replacement';
    return pod;
  } };
  await assert.rejects(readPodLogWindow(replaced, subject), { kind: 'identity_changed' });
  const old = await readPodLogWindow({ request: async (_method, path) => {
    assert.doesNotMatch(path, /\/log\?/);
    return podFixture();
  } }, { ...subject, window: { fromMs: start - 120_000, toMs: start - 61_000 } });
  assert.equal(old.outsideRetention, true);
  assert.equal(old.text, '');
});

function lokiFixture(records, streams = [labels]) {
  const calls = [];
  return { calls, read: async route => {
    const url = new URL(route, 'http://test.invalid');
    calls.push(url);
    const query = url.searchParams;
    const data = url.pathname.endsWith('/series') ? streams : {
      resultType: 'streams',
      result: [{ stream: labels, values: records.filter(row => row[0] >= BigInt(query.get('start')) && row[0] < BigInt(query.get('end')))
        .slice(0, Number(query.get('limit'))).map(([time, value]) => [String(time), value]) }],
    };
    return { status: 200, body: JSON.stringify({ status: 'success', data }) };
  } };
}

test('readLokiPodLogWindow retains equal-timestamp repeated lines across 100-line pages', async () => {
  const records = Array.from({ length: 98 }, (_, index) => [ns(200 - index), 'latest-' + index])
    .concat([[ns(100), 'same'], [ns(100), 'same'], [ns(100), 'same'], [ns(99), 'older']]);
  const fixture = lokiFixture(records);
  const client = { request: async () => podFixture() };
  const first = await readLokiPodLogWindow(client, { ...subject, search: 'literal " | expression' }, fixture.read);
  const next = await readLokiPodLogWindow(client, { ...subject, search: 'literal " | expression', cursor: first.cursor }, fixture.read);
  assert.equal(first.text.split('\n').length, 100);
  assert.equal(next.text.split('\n').length, 2);
  assert.equal((next.text + '\n' + first.text).match(/ same/g).length, 3);
  assert.match(next.text, /older\n.*same$/);
  assert.equal(next.cursor, null);
  const search = fixture.calls[1].searchParams.get('query');
  assert.match(search, /pod_uid="live-pod-uid"/);
  assert.ok(search.endsWith(' |= ' + JSON.stringify('literal " | expression')));
  assert.equal(fixture.calls[1].searchParams.get('limit'), '100');
});

test('readLokiPodLogWindow stops at a saturated nanosecond and leaves unverified streams unread', async () => {
  const client = { request: async () => podFixture() };
  const crowded = lokiFixture(Array.from({ length: 101 }, (_, index) => [ns(100), String(index)]));
  const first = await readLokiPodLogWindow(client, subject, crowded.read);
  const next = await readLokiPodLogWindow(client, { ...subject, cursor: first.cursor }, crowded.read);
  assert.equal(next.partial, true);
  assert.equal(next.text, '');
  assert.equal(next.cursor, null);

  const unverified = lokiFixture([], [{ ...labels, pod_uid: 'previous-pod' }]);
  const result = await readLokiPodLogWindow(client, subject, unverified.read);
  assert.equal(result.unverifiedStream, true);
  assert.equal(unverified.calls.length, 1);
});

test('readPodLogWindow says the line limit was reached from the lines fetched, before the window filter drops any (R5-02)', async () => {
  /* 상한 100줄을 받았는데 그 중 한 줄이 구간 밖(위 끝 뒤)이라 99줄만 남아도 상한에 닿은 것이다 */
  const fetched = Array.from({ length: 100 }, (_, index) => timestamp(index * 9_000) + ' log line ' + index);
  const client = { async request(_method, path) { return path.includes('/log?') ? fetched.join('\n') + '\n' : podFixture(); } };
  const snapshot = await readPodLogWindow(client, { ...subject, window: { ...range, toMs: start + 890_000 } });
  assert.equal(snapshot.text.split('\n').length, 99);
  assert.equal(snapshot.limitReached, true);
  const few = await readPodLogWindow({ async request(_method, path) { return path.includes('/log?') ? fetched.slice(0, 40).join('\n') + '\n' : podFixture(); } }, subject);
  assert.equal(few.limitReached, false);
});
