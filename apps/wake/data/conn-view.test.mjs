/* 연결 행 머리 동작의 논리 검사: 상태마다 표(HEAD)에 있는 동작만, 진행 중에는 연결됨의 동작(열기·연결 해제)이 절대 없음 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connView, HEAD, foundAfter, forgetFound, toolViews, read, FOUND_KEY } from './conn-view.js';
import { STATES, ACTIONS } from './connect-flow.js';
import { components, text } from '../../../kit/page/index.js';

const O = { connect: { label: 'c', action: 'x.connect' }, alt: { label: 'a', action: 'x.alt' }, open: { label: 'o', action: 'x.open' } };
const ID = { 'x.connect': 'connect', 'x.alt': 'alt', 'x.open': 'open', 'wake.flow.disconnect': 'disconnect', 'wake.flow.cancel': 'cancel', 'wake.flow.perm': 'perm' };
const steps = [{ id: 'reach', label: { raw: 'Reach' }, state: 'done' }, { id: 'issue', label: { raw: 'Issue' }, state: 'run' }];
const viewOf = (state, extra = {}) => connView({ 'wake.conn.live': { k: { state, steps, actions: [ACTIONS.retry], ...extra } }, 'wake.connections': { k: { method: 'tool-login' } } }, 'k', O);
const ids = v => [...v.extra, v.action].filter(Boolean).map(b => ID[b.action] || 'step');

test('모든 상태에 머리 동작 표가 있고 표 밖의 동작은 없음', () => {
  for (const s of STATES) {
    assert.ok(HEAD[s], s);
    for (const cancel of [false, true]) for (const id of ids(viewOf(s, { cancel }))) assert.ok(HEAD[s].includes(id), `${s}: ${id}`);
  }
});
test('진행 중(자격 증명 발급 단계 포함)에는 열기·연결 해제·연결됨 아이콘이 없음, 취소는 취소할 수 있을 때만', () => {
  for (const s of ['running', 'waiting']) {
    const v = viewOf(s);
    assert.equal(v.kind, 'busy'); assert.ok(!v.connected); assert.deepEqual(ids(v), []);
    assert.deepEqual(ids(viewOf(s, { cancel: true })), ['cancel']);
  }
});
test('연결됨은 열기와 연결 해제, 연결 전은 연결과 대체 방법', () => {
  assert.deepEqual(ids(viewOf('connected')), ['open', 'disconnect']); assert.equal(viewOf('connected').kind, 'ok');
  const idle = connView({}, 'k', O); assert.deepEqual(ids(idle), ['alt', 'connect']); assert.equal(idle.kind, 'idle');
});
test('멈춘 상태: 단계가 있으면 머리 동작 없음(흐름의 동작이 행 끝에), 단계가 없으면 머리에 하나', () => {
  for (const s of STATES.filter(x => x.startsWith('needs-') || ['failed', 'timeout', 'cancelled'].includes(x))) {
    assert.deepEqual(ids(viewOf(s)), [], s); assert.deepEqual(ids(viewOf(s, { steps: [] })), ['step'], s);
  }
  assert.equal(viewOf('cancelled').kind, 'idle');
});
test('흐름이 있으면 기록보다 흐름의 상태(기록이 있어도 진행 중이면 연결됨이 아님)', () => {
  const v = connView({ 'wake.conn.live': { k: { state: 'running', steps } }, 'wake.connections': { k: { method: 'tool-login', credentialMode: 'service' } } }, 'k', O);
  assert.equal(v.state, 'running'); assert.ok(!v.connected);
});

/* 문구는 이 프로세스에 앱 사전이 없으므로 버튼 이름(text)으로 비교한다: 아이콘이 아니라 그 이름이 버튼 안의 글자임을 본다 */
test('연결 중 취소는 텍스트 버튼이고 완료 후 연결 해제와 체크가 같은 묶음에 표시됨', ctx => {
  ctx.mock.method(console, 'warn', () => {});
  const running = viewOf('running', { cancel: true, actions: [ACTIONS.cancel] });
  assert.equal(running.action.icon, undefined);
  const pending = String(components.connectionRow.render({ ...running, id: 'k', title: 'Connection' }));
  assert.equal(running.action.label, 'wake.flow.a.cancel', 'the cancel button carries the cancel text, not another action\'s');
  assert.equal(/class="btn ghost sm"[^>]*data-action="wake.flow.cancel"[^>]*><span>([^<]*)<\/span><\/button>/.exec(pending)?.[1], text(running.action.label));
  const connected = viewOf('connected', { steps: steps.map(step => ({ ...step, state: 'done' })) });
  const complete = String(components.connectionRow.render({ ...connected, id: 'k', title: 'Connection' }));
  assert.equal(connected.action.label, 'wake.flow.a.disconnect');
  assert.equal(/class="cr-result"><button class="btn ghost sm"[^>]*data-action="wake.flow.disconnect"[^>]*><span>([^<]*)<\/span><\/button><span[^>]*data-c="status-icon"/.exec(complete)?.[1], text(connected.action.label));
  assert.doesNotMatch(complete, /class="fs-roll"/);
});

test('row_end_word_comes_from_the_state_dictionary_never_the_raw_state_and_is_absent_when_connected_or_said_by_the_description', async () => {
  const idle = connView({}, 'k', { idleText: { raw: 'localhost' } });
  assert.equal(idle.word, 'wake.conn.st.idle');
  assert.notEqual(idle.word, 'idle');
  assert.equal(connView({}, 'k', {}).word, null, 'the description already says it');
  assert.equal(connView({ 'wake.conn.live': { k: { state: 'connected' } } }, 'k', {}).word, null);
  assert.equal(connView({ 'wake.conn.live': { k: { state: 'running', steps } } }, 'k', {}).word, null, 'a flow with steps speaks with its own line');
});

test('tool_views_keep_read_outcomes_apart_and_never_promote_a_past_connection', async () => {
  const { toolViews, read } = await import('./conn-view.js');
  const tool = { kind: 'prometheus', selection: 'unverified', state: 'found', ready: 1 };
  const rec = { 'wake.connections': { 'c-prometheus': { kind: 'tool', where: { cluster: 'c', tool: { kind: 'prometheus' } } } }, 'wake.conn.live': { 'c-prometheus': { state: 'connected' } } };
  const one = (settings, inventory, hub) => toolViews({ cluster: 'c', settings, inventory, hub }).views.find(v => v.kind === 'prometheus');
  assert.deepEqual([one(rec, read.ok([tool]), read.failed(new Error('x'))).health, one(rec, read.ok([tool]), read.failed(new Error('x'))).reason], ['error', 'hub'], 'a failed hub read is not the old connected flow');
  assert.equal(one(rec, read.failed(new Error('x')), read.ok({})).reason, 'inventory');
  assert.equal(one(rec, read.failed(new Error('x')), read.ok({})).included, true, 'a recorded tool stays when the inventory fails');
  assert.equal(one({}, read.ok([tool]), read.ok({ prometheus: { state: 'error' } })).included, false, 'a hub entry alone is no connection');
  assert.equal(one({}, read.ok([{ ...tool, selection: 'verified' }]), read.ok({ prometheus: { state: 'ready' } })).health, 'ok');
  assert.equal(one(rec, read.ok([tool]), read.unread()).health, 'busy');
  assert.equal(one(rec, read.ok([tool]), read.ok({ prometheus: { state: 'invented' } })).health, 'error', 'a state outside the contract is never ok');
  assert.equal(toolViews({ cluster: 'c', settings: {}, inventory: read.failed(new Error('x')), hub: read.ok({}) }).inventory, 'failed', 'a failed list is not zero tools');
});

test('a verified finding is kept as evidence only for the same Service and goes with the cluster', () => {
  const at = '2026-11-16T00:00:00.000Z', row = { kind: 'prometheus', selection: 'verified', uid: 'u1', ns: 'monitoring', svc: 'kps-prometheus' };
  /* 열거가 확인한 도구만 남김(클러스터·종류·UID·확인 시각) */
  const first = foundAfter({}, 'c1', read.ok([row, { kind: 'loki', selection: 'unverified', uid: 'u9' }]), at);
  assert.deepEqual(first, { 'c1-prometheus': { cluster: 'c1', kind: 'prometheus', uid: 'u1', ns: 'monitoring', svc: 'kps-prometheus', port: null, at } });
  /* 화면용 svc 글(ns/이름:포트)이 아니라 서비스가 준 그대로(raw)를 남김 */
  assert.deepEqual(foundAfter({}, 'c1', read.ok([{ ...row, svc: 'monitoring/kps-prometheus:9090', raw: { ...row, port: 9090 } }]), at)['c1-prometheus'], { cluster: 'c1', kind: 'prometheus', uid: 'u1', ns: 'monitoring', svc: 'kps-prometheus', port: 9090, at });
  const settings = { [FOUND_KEY]: first };
  /* 같은 결과면 다시 쓰지 않음, 열거가 값이 아니면 건드리지 않음 */
  assert.equal(foundAfter(settings, 'c1', read.ok([row]), 'later'), null);
  assert.equal(foundAfter(settings, 'c1', read.failed(new Error('x'))), null);
  /* 같은 UID를 지금 확인하지 못함(일시 오류)이면 유지, 다른 UID거나 그 종류가 없으면 지움 */
  assert.equal(foundAfter(settings, 'c1', read.ok([{ ...row, selection: 'unverified' }])), null);
  assert.deepEqual(foundAfter(settings, 'c1', read.ok([{ ...row, selection: 'unverified', uid: 'u2' }])), {});
  assert.deepEqual(foundAfter(settings, 'c1', read.ok([])), {});
  /* 열거 실패 중에는 근거로 포함(건강은 실패 사유), 다른 클러스터의 근거는 쓰지 않음 */
  const kept = toolViews({ cluster: 'c1', settings, inventory: read.failed(new Error('x')), hub: read.ok({}) });
  assert.deepEqual(kept.included.map(v => [v.kind, v.health, v.reason]), [['prometheus', 'error', 'inventory']]);
  assert.equal(toolViews({ cluster: 'c2', settings, inventory: read.failed(new Error('x')), hub: read.ok({}) }).included.length, 0);
  /* 클러스터 연결 해제: 그 클러스터 것만 지움 */
  assert.deepEqual(forgetFound({ [FOUND_KEY]: { ...first, 'c2-loki': { cluster: 'c2', kind: 'loki', uid: 'u3' } } }, 'c1'), { 'c2-loki': { cluster: 'c2', kind: 'loki', uid: 'u3' } });
  assert.equal(forgetFound(settings, 'c9'), null);
});

test('recorded_tools_require_a_current_verified_binding_to_open', async () => {
  const { toolViews, read } = await import('./conn-view.js');
  const settings = { 'wake.connections': { 'c-loki': { kind: 'tool', where: { cluster: 'c', tool: { kind: 'loki', uid: 'old' } } } } };
  for (const selection of ['unverified', 'not-ready', undefined]) {
    const result = toolViews({ cluster: 'c', settings, inventory: read.ok([{ kind: 'loki', uid: 'new', selection }]), hub: read.ok({ loki: { state: 'ready' } }) });
    assert.equal(result.views[0].openable, false, String(selection));
    assert.equal(result.views[0].included, selection === 'not-ready', 'only current verified discovery evidence can include a different UID');
  }
});
