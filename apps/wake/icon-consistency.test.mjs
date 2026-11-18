import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { KIND_LIST } from './data/kinds.js';
import { CHANGE_LANES } from './data/home.js';
import { ICON_MAP } from './icon-map.js';

/* one meaning, one icon: a kind, a section and a tool read the same wherever they show, and two meanings never share an icon */
const src = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const kindIcon = kind => KIND_LIST.find(k => k.kind === kind).icon;
const glyph = icon => ICON_MAP[icon]?.[0] ?? icon;

test('change_lanes_use_the_icon_of_the_kind_they_mark', () => {
  const lanes = Object.fromEntries(CHANGE_LANES);
  assert.deepEqual({ deploy: lanes.deploy, config: lanes.config }, { deploy: kindIcon('Deployment'), config: kindIcon('ConfigMap') }, 'a rollout mark and a ConfigMap change read with the kind icons');
  assert.doesNotMatch(src('./pages/incident-detail.js'), /\['deploy', '/, 'the incident timeline takes the lanes from one place');
});

test('events_and_alerts_sections_do_not_share_an_icon', () => {
  const views = Object.fromEntries([...src('./app.config.js').match(/const CLUSTER_VIEWS = (\[.*\]);/)[1].matchAll(/\['(\w+)', '([\w-]+)'\]/g)].map(m => [m[1], m[2]]));
  assert.notEqual(glyph(views.events), glyph(views.alerts), 'Kubernetes Events and Alertmanager alerts are told apart by their icons');
  assert.equal(views.events, kindIcon('Event'), 'the events section shows the Event kind icon');
});

test('a helm managed band does not show a git icon', () => {
  const line = src('./pages/resource-detail.js').split('\n').find(l => l.includes("owner?.kind === 'helm'"));
  const icon = /icon: '([\w-]+)'/.exec(line)[1];
  assert.ok(!/git|branch/.test(icon) && !/git|branch/.test(glyph(icon)), `Helm reads with its own mark, not a Git branch: ${icon}`);
});

/* R5-06: "읽기만"·"바꾸기 전 묻기"는 설정(PERM_LEVELS)·클러스터 메뉴(PERM_ICON)·첫 실행 기본 설정·AI 칸 권한 고르기에서 같은 아이콘(읽기만은 눈 mode-read) */
test('ai_permission_levels_read_with_one_icon_everywhere', async () => {
  const config = (await import('./app.config.js')).default;
  const menu = Object.fromEntries([...src('./app.config.js').match(/const PERM_ICON = (\{[^}]*\});/)[1].matchAll(/(\w+): '([\w-]+)'/g)].map(m => [m[1], m[2]]));
  const levels = Object.fromEntries([...src('./app.config.js').match(/const PERM_LEVELS = (\[.*\]);/)[1].matchAll(/opt\('(\w+)', '[\w.]+', (?:PERM_ICON\.(\w+)|'([\w-]+)')\)/g)].map(m => [m[1], m[2] ? menu[m[2]] : m[3]]));
  assert.deepEqual(levels, { read: 'mode-read', ask: 'mode-guard' }, 'settings: read only is the eye');
  assert.deepEqual(menu, levels, 'the cluster menu');
  const fr = config.firstRun.steps.flatMap(s => s.options ?? []).find(o => o.key === 'wake.perm.default');
  assert.deepEqual(Object.fromEntries(fr.choices.map(c => [c.id ?? c.value, c.icon])), levels, 'the first run default');
  assert.deepEqual(Object.fromEntries(config.ai.permissions.map(p => [p.id, p.icon])), levels, 'the AI composer permission picker');
});
