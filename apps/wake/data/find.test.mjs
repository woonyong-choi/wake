/* 클러스터 전체 이름 검색의 맞춤·순위(find.js) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rank, findResources } from './find.js';

const rows = {
  pods: [{ name: 'billing-api-7bd4f-a7x2k', ns: 'payments', status: ['danger', 'Evicted'] }, { name: 'billing-api-7bd4f-c3m8p', ns: 'payments', status: ['ok', 'Running'] }, { name: 'checkout-api-1', ns: 'payments', status: ['ok', 'Running'] }],
  deployments: [{ name: 'billing-api', ns: 'payments', status: ['danger', 'Unavailable'] }, { name: 'old-billing', ns: 'batch', status: ['ok', 'Available'] }],
  services: [{ name: 'billing-api', ns: 'payments', status: ['ok', 'Active'] }],
};

test('이름 순위: 같음 0, 시작 1, 들어 있음 2, 없음·빈 말 -1, 대소문자 구분 없음', () => {
  assert.equal(rank('billing-api', 'Billing-API'), 0);
  assert.equal(rank('billing-api-1', 'billing'), 1);
  assert.equal(rank('old-billing', 'billing'), 2);
  assert.equal(rank('checkout', 'billing'), -1);
  assert.equal(rank('checkout', '  '), -1);
});
test('리소스: 같은 이름 먼저, 같은 순위면 문제 있는 것 먼저, 종류 거르기', () => {
  const r = findResources(rows, 'billing-api');
  assert.deepEqual(r.slice(0, 2).map(x => x.plural), ['deployments', 'services']);
  assert.equal(r[2].name, 'billing-api-7bd4f-a7x2k'); // 시작 순위 중 Evicted가 Running보다 앞
  assert.ok(!r.some(x => x.name === 'checkout-api-1'));
  assert.deepEqual(findResources(rows, 'billing', { kinds: ['services'] }).map(x => x.plural), ['services']);
  assert.equal(findResources(rows, 'billing').at(-1).name, 'old-billing');
});
