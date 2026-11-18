import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extendGlyphs, extendIcons } from '../../../kit/index.js';

async function costPage(rows, answer) {
  const url = new URL('./costs.js', import.meta.url), source = readFileSync(url, 'utf8'), imports = {};
  let create, rendered;
  for (const [, def, list, spec] of source.matchAll(/^import (?:(\w+))?(?:,\s*)?(?:\{([^}]+)\})? from '([^']+)';$/gm)) {
    const module = await import(new URL(spec, url));
    if (def) imports[def] = module.default;
    if (spec.endsWith('app.config.js')) { extendGlyphs(module.default.icons.glyphs); extendIcons(module.default.icons.map); }
    for (const part of (list || '').split(',').map(value => value.trim()).filter(Boolean)) {
      const [key, alias = key] = part.split(/\s+as\s+/); imports[alias] = module[key];
    }
  }
  imports.bootPage = (_, factory) => { create = factory; };
  imports.service = async (_name, args) => typeof answer === 'function' ? answer(args) : answer ?? ({ status: 'ready', rows, total: 10, currency: 'USD', start: 1, end: 2, trend: [], previous: null });
  if (!answer) imports.C = { ...imports.C, dataTable: { render: props => { rendered = props.rows.map(row => row.id); return ''; } } };
  imports.globalThis = { addEventListener() {} };
  new Function(...Object.keys(imports), source.replace(/^import .*;\n/gm, ''))(...Object.values(imports));
  const page = create({ params: {cluster:'test'}, query:{}, desktop:true, state:()=>({}), update(){}, t:key=>key, data:{}, api:{} });
  await page.actions['wake.cost.read']();
  return { page, sort: key => page.actions['wake.cost.sort']({arg:key}), rows: () => { page.render(); return rendered; }, html: () => { const r = page.render(); return String(r?.s ?? r); } };
}

// RULE-SORT: code points, immutable IDs on ties, missing values last in either direction.
for (const mode of ['name', 'equal-total', 'missing-total']) test(`costs_${mode}_uses_codepoint_order`, async () => {
  const rows = ['a', 'Z', 'ä', '\uE000', '\u{10000}'].map(id => ({id, name:id, total:mode === 'missing-total' ? null : 1}));
  const page = await costPage(rows);
  if (mode === 'name') page.sort('name');
  const expected = ['Z', 'a', 'ä', '\uE000', '\u{10000}'];
  assert.deepEqual(page.rows(), expected);
  page.sort(mode === 'name' ? 'name' : 'total');
  assert.deepEqual(page.rows(), mode === 'name' ? [...expected].reverse() : expected);
});

test('costs_equal_names_use_ascending_immutable_ids_in_both_directions', async () => {
  const page = await costPage([{ id: 'z', name: 'same', total: 1 }, { id: 'a', name: 'same', total: 1 }]);
  page.sort('name'); assert.deepEqual(page.rows(), ['a', 'z']);
  page.sort('name'); assert.deepEqual(page.rows(), ['a', 'z']);
});

/* A2-18: 비용 화면 머리는 도구·에이전트 화면과 같은 모양(머리 끝 클러스터 검색 칸)이고 "OpenCost 찾기"는 한 번, 글이 아니라 단추 모양(secondary) */
test('costs_header_matches_the_tools_and_agent_screens_with_one_find_button', async () => {
  const page = await costPage([], { status: 'unconfigured' });
  const s = page.html();
  const head = s.slice(s.indexOf('data-c="page-header"'), s.indexOf('data-c="empty-state"'));
  assert.match(head, /data-c="search-input"/, 'the cluster search sits at the end of the header like the tools and agent screens');
  assert.equal([...s.matchAll(/wake\.cost\.find/g)].length, 1, 'one find button');
  const button = /<button[^>]*class="([^"]*)"[^>]*>(?:(?!<\/button>)[\s\S])*wake\.cost\.find/.exec(s);
  assert.ok(button && !/\bghost\b/.test(button[1]), `the find action looks like a button: ${button?.[1]}`);
});

/* 실제 앱: 비용 화면의 빈 상태·머리 단추가 "OpenCost" 이름만 말해 무엇을 하는지 알 수 없었다. 단추는 동작(클러스터에서 OpenCost 찾기)을 말한다 */
test('costs_buttons_say_what_they_do_not_only_the_product_name', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./costs.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /label: 'OpenCost'/, 'a button labelled with the bare product name');
  const ko = (await import('../locale/ko.js')).default, en = (await import('../locale/en.js')).default;
  assert.ok(ko['wake.cost.find'] && en['wake.cost.find'], 'the find action has words in both languages');
});

/* B2-06, B2-18: a find that could not run (its answer a status, no targets) replaced the page's state with a red line and left an empty
   "OpenCost" heading; a find with no service drew its row outside the card. The page keeps saying not connected; the find's own result
   (the reason, or "no OpenCost service") is a row inside the OpenCost card */
test('costs_find_result_or_its_reason_is_a_row_in_the_opencost_card_and_the_page_stays_not_connected', async () => {
  for (const [found, words] of [[{ status: 'timeout' }, 'wake.cost.state.timeout'], [{ status: 'ready', targets: [] }, 'wake.cost.noService']]) {
    const { page, html } = await costPage([], args => (args.op === 'targets' ? found : { status: 'unconfigured' }));
    await page.actions['wake.cost.configure']();
    const s = html();
    const card = s.slice(s.indexOf('data-c="settings-group"'));
    assert.ok(s.includes('data-c="settings-group"'), 'the find result sits in a card');
    assert.ok(card.includes(words), `${words} inside the card`);
    assert.ok(!s.includes('wake.cost.state.target') && !/sti error[\s\S]*wake\.cost\.state\.timeout[\s\S]*data-c="settings-group"/.test(s), 'no red page line for the find');
    assert.ok(s.includes('wake.cost.unconfigured'), 'the page still says it is not connected');
  }
});

/* B3-02: 비용 화면에 meta()가 없어 탭 제목·아이콘이 앞 화면 그대로 남고 즐겨찾기·AI 맥락 칩이 엉뚱한 이름을 가졌다 */
test('costs_page_names_its_tab_and_context_like_the_other_cluster_screens', async () => {
  const { page } = await costPage([], { status: 'unconfigured' });
  assert.equal(typeof page.meta, 'function', 'the costs page tells the shell its name');
  const m = page.meta();
  assert.equal(m.title, 'wake.cost.title');
  assert.equal(m.icon, 'chart-line');
  const { readdirSync } = await import('node:fs');
  const dir = new URL('./', import.meta.url);
  const nameless = readdirSync(dir).filter(file => file.endsWith('.js')).filter(file => {
    const source = readFileSync(new URL(file, dir), 'utf8');
    return /bootPage\(config,/.test(source) && !/create(?:Start|Settings|Chat)Page/.test(source) && !/^\s+meta(?:: |,$)/m.test(source);
  });
  assert.deepEqual(nameless, [], 'every screen names its tab');
});

/* B3-16: 찾기 뒤 빈 상태의 "클러스터에서 OpenCost 찾기"와 카드 안 "다시 시도"가 같은 동작으로 둘 보였다. 찾기 뒤에는 카드의 다시 시도 하나 */
test('costs_find_and_retry_are_one_action_after_a_find', async () => {
  const { page, html } = await costPage([], args => (args.op === 'targets' ? { status: 'ready', targets: [] } : { status: 'unconfigured' }));
  await page.actions['wake.cost.configure']();
  const s = html();
  assert.equal([...s.matchAll(/wake\.cost\.configure/g)].length, 1, 'one button runs the find');
  assert.ok(s.includes('wake.flow.a.retry'), 'the card keeps its retry');
});
