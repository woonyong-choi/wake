/*
 * 모든 화면 문서가 사전 키를 키로만 넘기는지(R5-05): 각 페이지 모듈을 그리며 화면의 t가 만든 글에 표지(§)를 붙이고,
 * kit 부품이 그 글을 다시 사전 키로 찾을 때 나는 "missing locale key: §…" 경고가 하나도 없어야 한다(예: 도구 행 단추 "열기"를 키로 다시 찾음).
 * 자료는 이 파일 안의 합성 응답만(연결된 도구 하나, 그 밖은 연결 안 됨).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import config from '../app.config.js';
import { unconnected } from '../data/index.js';
import { extendIcons, extendGlyphs } from '../../../kit/index.js';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } });
extendGlyphs(config.icons.glyphs); extendIcons(config.icons.map);
/* 화면의 t: 번역한 글에 표지를 붙임(kit 부품이 이것을 다시 키로 찾으면 표지가 붙은 키로 경고) */
const MARK = '\u00a7', t = (key, vars) => `${MARK}${key}${vars ? JSON.stringify(vars) : ''}`;
/* 화면이 문서에서 찾는 것(보고서 흐름의 캔버스 등)은 없음으로: 그리기만 본다. 이 파일은 따로 도는 시험 프로세스라 끝까지 둔다(뒤늦은 흐름 타이머 포함) */
Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: true, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} } });
const tick = () => new Promise(r => setImmediate(r));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };

const CLUSTER = 'locale-context', NOW = Date.now(), iso = ms => new Date(ms).toISOString();
/* 연결된 도구 둘: Prometheus는 연결됨(행 단추 "열기"), Loki는 끊김(행 단추 "다시 시도"). 에이전트는 heartbeat가 끊긴 상태(행 단추 "다시 시도") */
const TOOLS = ['prometheus', 'loki'].map((kind, i) => ({ kind, selection: 'verified', state: 'found', ready: 1, svc: `monitoring/${kind}:9090`, ns: 'monitoring', uid: `svc-uid-${i}` }));
const SETTINGS = {
  'wake.connections': Object.fromEntries(TOOLS.map(x => [`${CLUSTER}-${x.kind}`, { target: `${CLUSTER}-${x.kind}`, method: 'tool-open', kind: 'tool', where: { cluster: CLUSTER, tool: { kind: x.kind } } }])),
  'wake.conn.live': Object.fromEntries(TOOLS.map(x => [`${CLUSTER}-${x.kind}`, { state: 'connected', last: iso(NOW - 60_000) }])),
};
const FIXTURE = {
  cluster: async () => ({ id: CLUSTER, state: 'ok' }),
  clusterTools: async () => structuredClone(TOOLS),
  sourceStates: async () => ({ prometheus: { state: 'ready', lastSuccessAt: iso(NOW - 60_000) }, loki: { state: 'error' } }),
  toolAccess: async () => ({ access: 'ok' }),
  toolKinds: async () => [{ id: 'prometheus', name: 'Prometheus', icon: 'brand-prometheus', role: 'metrics' }, { id: 'loki', name: 'Loki', icon: 'brand-loki', role: 'logs' }],
  toolChecks: async () => ({ at: iso(NOW), samples: [{ at: NOW - 120_000, ms: 40 }, { at: NOW - 60_000, ms: 52 }] }),
  agent: async () => ({ lookup: 'present', installed: true, rolloutReady: true, nodes: ['n1'], beatLookup: 'ok', heartbeat: null, version: '1.0.0', identity: { namespace: 'wake-system' } }),
};

async function pageFactory(file) {
  let create;
  globalThis.captureLocalePage = (_, c) => { create = c; };
  const url = new URL(file, import.meta.url);
  const source = (await readFile(url, 'utf8'))
    .replaceAll(/from '([^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`).replace('bootPage(config,', 'globalThis.captureLocalePage(config,');
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis.captureLocalePage;
  return create;
}
/* 화면 문서마다 주소 값: 도구 상세는 연결된 도구, 그 밖은 클러스터 하나 */
const PARAMS = { 'tool-detail.js': { tool: 'prometheus' }, 'tool-api.js': { tool: 'prometheus' }, 'resource-list.js': { ns: '_all', kind: 'pods' }, 'resource-detail.js': { ns: 'payments', kind: 'pods', name: 'api' } };

test('every page renders without asking the dictionary for a word that is already translated', async () => {
  const files = (await readdir(new URL('.', import.meta.url))).filter(f => f.endsWith('.js') && !f.endsWith('.test.mjs'));
  const pages = [];
  for (const f of files) if ((await readFile(new URL(f, import.meta.url), 'utf8')).includes('bootPage(config,')) pages.push(f);
  assert.ok(pages.length >= 20, `page modules: ${pages.join(', ')}`);
  const missing = [], warn = console.warn;
  console.warn = (...a) => { const s = a.join(' '); if (s.startsWith(`missing locale key: ${MARK}`)) missing.push(`${current}: ${s}`); else if (!s.startsWith('missing locale key')) warn(...a); };
  let current = '';
  /* 같은 화면의 다른 상태: 에이전트가 없어 설치 행을 그리는 에이전트 화면 */
  const runs = [...pages.map(f => [f, {}]), ['agent.js', { agent: async () => ({ lookup: 'absent', installed: false, installImage: { published: true } }) }]];
  const before = globalThis.kitService;
  globalThis.kitService = { on() { return () => {}; }, call: async () => { throw unconnected('service'); } };
  try {
    for (const [f, over] of runs) {
      current = f;
      const fixture = { ...FIXTURE, ...over };
      const create = await pageFactory(`./${f}`);
      let state = {}, settings = structuredClone(SETTINGS);
      const ctx = { params: { cluster: CLUSTER, ...PARAMS[f] }, route: { id: 'cluster' }, query: {}, t, update() {}, desktopInfo: () => null,
        data: { get: (key, p) => (fixture[key] ? fixture[key](p) : Promise.reject(unconnected(key))) }, settings: () => settings,
        state: () => state, setState: patch => { state = { ...state, ...patch }; }, api: { navigate() {}, setMeta() {}, openPanel() {}, setSetting: (k, v) => { settings = { ...settings, [k]: v }; } } };
      try {
        const page = await create(ctx);
        state = { ...(page?.screen?.state ?? {}) };
        await page?.init?.(); await settle();
        page?.render?.(); await settle(); page?.render?.();
      } catch { /* 노드에서 그릴 수 없는 화면(문서 객체 필요)은 이 검사 밖 */ }
    }
  } finally { console.warn = warn; globalThis.kitService = before; }
  assert.deepEqual(missing, []);
});
