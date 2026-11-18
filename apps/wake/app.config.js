/*
 * Wake 앱 정의. kit가 이 정의로 사이드바, 경로 바, 탭, 설정, AI 패널을 만든다(형식: kit/CONTRACTS.md).
 * 이 파일은 Node에서도 읽힐 수 있게 브라우저 전용 API를 쓰지 않는다.
 */
import ko from './locale/ko.js';
import en from './locale/en.js';
import { ROUTES } from './routes.js';
import { ICON_MAP } from './icon-map.js';
import { GLYPHS } from './glyphs.js';
import { BRAND_GLYPHS, BRAND_MAP } from './assets/brands/brand-glyphs.js';
import { createDataSource, kindsGroups, sourceOff } from './data/index.js';
import { toolKind, TOOL_KINDS } from './data/tool-kinds.js';
import { createLive, cardOf, GROUPS, clusterPresentation, checkEverySeconds } from './data/live.js';
import { connectPages, permVerbs, perCluster, PROVIDER_ICON } from './settings-pages.js';
import { aiConnectPage, aiClientDialog, aiClientMenu, aiClientActions, aiTokenDialog } from './ai-connect.js';
import { conversations, conversationRead, refreshConversations, onConversations, createAiAdapter } from './ai-hub.js';
import { formatToolVersion } from './version-display.js';
import pkg from './package.json' with { type: 'json' };
import { specOf } from './data/commands.js';
import { chatList, filterArchive, toMarkdown } from './data/chats.js';
import { maskSecrets } from './data/mask.js';
import { shownTime } from './pages/parts.js';
import { when } from './pages/incident-parts.js';
import { createFlows, METHODS, AGENT_CHART, LIMITS, invalidOf, connectionRecord } from './data/connect-flow.js';
import { connView, toolViews, readOf, read, rememberFound, forgetFound, FOUND_KEY } from './data/conn-view.js';
import { parseForbidden, grantOf, canGrantCheck } from './data/perm.js';
import { KIND_OF, KIND_LIST, titleOf } from './data/kinds.js';
import { FIND_KINDS } from './data/find.js';
import { service, onService, hasService, components as C, html, saveText, text } from '../../kit/page/index.js';

const data = createDataSource('live');
const live = createLive();
const A = (...p) => 'wake://' + p.map(encodeURIComponent).join('/');
const addr = {
  cluster: c => A('cluster', c),
  toolApi: (c, kind) => A('cluster', c, 'api', kind),
  list: (c, ns, kind) => A('cluster', c, 'ns', ns, kind),
  detail: (c, ns, kind, name) => A('cluster', c, 'ns', ns, kind, name),
  settings: p => A('settings', p),
  chat: id => A('chat', id),
};
/** 클러스터 구역의 주소(사이드바 클러스터 구역, 경로 막대, 본문 링크): 홈은 클러스터 주소 그대로, 지표는 지표 id까지 */
export const viewAddress = (cluster, view, ...rest) => (view === 'home' ? addr.cluster(cluster) : A('cluster', cluster, view === 'metric' ? 'metrics' : view, ...rest));
export const incidentAddress = incident => {
  if (!incident?.cluster) return addr.settings('clusters');
  return A('cluster', incident.cluster, 'incidents', incident.id);
};
const raw = s => ({ raw: s });
const kindOf = plural => KIND_OF[plural]; /* 종류 표 하나(kinds.js): 목록 묶음에 없는 Event도 이름을 가짐 */

/* 클러스터 구역(시뮬레이션 사이드바 순서): [id, 아이콘]. 이벤트는 이벤트 목록 */
const CLUSTER_VIEWS = [['home', 'k8s-cluster'], ['resources', 'k8s-deployment'], ['network', 'k8s-service'], ['gitops', 'tool-gitops'], ['events', 'k8s-event'], ['logs', 'terminal'], ['alerts', 'bell'], ['incidents', 'incident'], ['ailog', 'ai']];
const viewLabel = v => (v === 'gitops' ? raw('GitOps') : `wake.view.${v}`);
const viewTarget = (cluster, v) => (v === 'events' ? addr.list(cluster, '_all', 'events') : viewAddress(cluster, v));
/* 구역 탭 밖의 클러스터 화면(B-01): 사이드바 클러스터 메뉴·⌘K·홈 연결 칩 줄이 같은 목록으로 들어간다 */
export const CLUSTER_EXTRAS = [['agent', 'wake.home.agent', 'wake-agent'], ['costs', 'wake.cost.title', 'chart-line']];
/* 사이드바 클러스터 메뉴와 ⌘K는 도구 화면도 같은 줄에(B3-17). 홈 칩 줄은 연결한 도구가 이미 칩이라 CLUSTER_EXTRAS 그대로 */
const CLUSTER_SCREENS = [CLUSTER_EXTRAS[0], ['tools', 'wake.home.tools', 'plug'], ...CLUSTER_EXTRAS.slice(1)];
/* 터미널 제목의 범위: 사람이 읽는 namespace(모든 namespace면 셸이 고정된 namespace를 함께)와 종류 이름(목록 제목과 같은 Events·Pods), 이름(B3-07).
   셸 세션은 클러스터·namespace·리소스 단위라(구역마다 새 셸이 아님) 구역 이름은 두지 않는다 */
const terminalScope = target => {
  const ns = target.namespace || 'default', all = !target.scope || target.scope === '_all';
  return [all ? text({ key: 'wake.term.allNs', vars: { namespace: ns } }) : ns, target.kind ? titleOf(target.kind) : '', target.name].filter(Boolean).join(' · ');
};
const METRIC_IDS = ['cpu', 'mem', 'err', 'rps'];
/* 경로 칸 전환 메뉴(같은 단계의 다른 항목) */
const check = 'check';
/* 실제 클러스터의 namespace 목록(경로 칸 전환): 시작할 때 연결한 클러스터마다 한 번 읽어 둠 */
const nsSeen = {};
const readNamespaces = api => { for (const id of api.settings.get('wake.clusters.connected') || []) data.get('namespaces', { cluster: id }).then(l => { nsSeen[id] = l; }).catch(() => {}); };
const switchers = {
  'wake.switch.cluster': (p, st) => ({ width: 280, items: clustersOf(st || { settings: flowApi?.settings.all?.() || {} }).map(c => ({ id: 'cl-' + c.id, label: raw(c.name), icon: c.icon, end: [c.ctx, c.discriminator].filter(Boolean).join(' · '), checked: c.id === p.cluster, action: 'kit.navigate', arg: { address: addr.cluster(c.id) } })) }),
  'wake.switch.ns': p => ({ width: 240, items: [{ type: 'search', placeholder: 'wake.list.search' }, { id: 'ns-_all', label: 'wake.list.allNs', icon: 'k8s-namespace', checked: p.ns === '_all', action: 'kit.navigate', arg: { address: addr.list(p.cluster, '_all', p.kind || 'pods') } },
    ...(nsSeen[p.cluster] || []).map(n => ({ id: 'ns-' + n, label: raw(n), icon: 'k8s-namespace', checked: n === p.ns, action: 'kit.navigate', arg: { address: addr.list(p.cluster, n, p.kind || 'pods') } }))] }),
  'wake.switch.kind': p => ({ width: 240, items: kindsGroups().flatMap(g => g.items).map(ki => ({ id: 'k-' + ki.plural, label: raw(titleOf(ki.plural)), icon: ki.icon, checked: ki.plural === p.kind, action: 'kit.navigate', arg: { address: addr.list(p.cluster, ki.plural === 'nodes' ? '_all' : p.ns, ki.plural) } })) }),
};
/* 이름 칸 전환: 같은 종류의 다른 리소스. 처음 그릴 때 읽기 시작해 두고, 아직이면 불러오는 중 행으로 열린 뒤
   받으면 그 자리에서 채움. 받은 목록이 비면 칸에 v를 붙이지 않음 */
const namesSeen = {};
const namesOf = p => { const key = [p.cluster, p.ns, p.kind].join(' '), have = namesSeen[key];
  if (have) return have;
  const x = { list: null };
  x.promise = data.get('resources', { cluster: p.cluster, ns: p.ns, kind: p.kind }).then(l => { x.list = l || []; }).catch(() => { x.list = []; });
  return (namesSeen[key] = x); };
switchers['wake.switch.name'] = p => { const x = namesOf(p);
  if (!x.list) return { width: 300, pending: x.promise, items: [{ id: 'r-busy', label: 'wake.res.loading', lead: C.statusIcon.render({ kind: 'busy' }) }] };
  return { width: 300, items: x.list.map(r => ({ id: 'r-' + r.name, label: raw(r.name), icon: kindOf(p.kind)?.icon, checked: r.name === p.name, action: 'kit.navigate', arg: { address: addr.detail(p.cluster, p.ns, p.kind, r.name) } })) }; };
switchers['wake.switch.view'] = p => ({ width: 240, items: CLUSTER_VIEWS.map(([v, icon]) => ({ id: 'v-' + v, label: v === 'home' ? 'wake.view.home' : viewLabel(v), icon, action: 'kit.navigate', arg: { address: viewTarget(p.cluster, v) } })) });
switchers['wake.switch.metric'] = p => ({ width: 240, items: METRIC_IDS.map(m => ({ id: 'm-' + m, label: `wake.metric.${m}`, icon: 'chart-line', checked: m === p.metric, action: 'kit.navigate', arg: { address: viewAddress(p.cluster, 'metric', m), replace: true } })) });
switchers['wake.switch.settings'] = (p, st) => ({ width: 240, items: SETTINGS.groups.flatMap(g => g.pages).flatMap(x => [x, ...(typeof x.children === 'function' ? x.children(st || { settings: {} }) : x.children || [])]).map(x => ({ id: 's-' + x.id, label: x.label, icon: x.icon, checked: x.id === p.page, action: 'kit.navigate', arg: { address: addr.settings(x.id), replace: true } })) });

const crumb = (label, switcher, arg) => ({ label: label === '_all' ? 'wake.list.allNs' : raw(label), switcher, arg });
/* 클러스터 페이지의 위쪽 바 칩: 클러스터 아이콘 + 이름, 누르면 클러스터 정보 팝오버 */
const clusterLabel = id => clusterPresentation((flowApi?.settings.all?.()['wake.clusters.list'] || []).find(c => c.id === id) || { id }).name;
const clusterIdent = p => ({ icon: clusterIcon(p.cluster), label: raw(clusterLabel(p.cluster)), menu: 'wake.cluster.info', arg: p.cluster });
/* 설정 페이지 이름(클러스터 하위 페이지는 클러스터 이름) */
const settingsLabel = id => /^cluster-/.test(id) ? raw(clusterLabel(id.slice(8))) : SETTINGS.groups.flatMap(g => g.pages).find(x => x.id === id)?.label;
/* 대화: 대화 저장소(메인 프로세스 ai.run의 대화 보관)를 ai-hub.js가 읽어 채운다 */
const chatTitle = id => conversations.find(c => c.id === id)?.title || '';
/* 답의 미리보기: 마크다운을 읽은 뒤 낱말만 자른다(자른 원문의 반쪽 코드 표시가 보이지 않게, B3-08) */
const answerPreview = s => { const words = C.answerText.plain(s || ''); return words.length > 160 ? words.slice(0, 159).trimEnd() + '…' : words; };
/* AI 범위: 고른 클러스터(숨김 아닌 연결 클러스터), 없으면 사이드바에 보이는 첫 연결 클러스터와 그 namespace.
   대화가 셸의 오른쪽 칸이 아니라 대화 탭 문서에서 돌면 그 문서에는 셸 상태(flowApi)가 없으므로, 보내는 순간 kit가 넘겨준 설정(send의 settings)을 쓴다 */
let sendSettings = null;
export const aiScope = settings => { const c = scopeCluster(settings); return c ? { cluster: c, namespace: settings['wake.scope.ns'] || scopeNs(settings, c) } : null; };
const aiHub = createAiAdapter({ scope: () => aiScope(sendSettings || flowApi?.settings.all?.() || {}) });
const aiAdapter = { ...aiHub.adapter, send: (req, o = {}) => { sendSettings = o.settings || null; return aiHub.adapter.send(req, o); } };
void refreshConversations();
/* 새 대화가 저장되면(허브 ai-chat saved) 셸의 사이드바·⌘K·탭 이름이 바로 그 대화를 보임(재시작 전까지 안 보이던 문제, B2-04) */
onConversations(() => flowApi?.refresh?.());
const routeFns = {
  cluster: { title: p => raw(clusterLabel(p.cluster)), icon: p => clusterIcon(p.cluster), crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p)], ident: clusterIdent },
  ...Object.fromEntries(CLUSTER_VIEWS.filter(([v]) => !['home', 'events'].includes(v)).map(([v, icon]) => [v, { title: () => viewLabel(v), icon: () => icon,
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: viewLabel(v), switcher: 'wake.switch.view', arg: p }], ident: clusterIdent }])),
  metric: { title: p => `wake.metric.${p.metric}`, icon: () => 'chart-line',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: 'wake.view.metric' }, { label: `wake.metric.${p.metric}`, switcher: 'wake.switch.metric', arg: p }], ident: clusterIdent },
  incident: { title: p => raw(p.id), icon: () => 'incident',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: 'wake.home.incidents' }, crumb(p.id)], ident: clusterIdent },
  evidence: { title: p => ({ key: 'wake.inc.ev.n', vars: { n: p.n } }), icon: () => 'file-text',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: 'wake.home.incidents' }, crumb(p.id), { label: { key: 'wake.inc.ev.n', vars: { n: p.n } } }], ident: clusterIdent },
  report: { title: () => 'wake.rep.title', icon: () => 'file-text',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: 'wake.home.incidents' }, crumb(p.id), { label: 'wake.rep.title' }], ident: clusterIdent },
  'check-report': { title: () => 'wake.rep.checkTitle', icon: () => 'file-text',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: 'wake.rep.checkTitle' }], ident: clusterIdent },
  'gitops-detail': { title: p => raw(p.name), icon: () => 'tool-gitops',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: viewLabel('gitops'), switcher: 'wake.switch.view', arg: p }, crumb(p.name)], ident: clusterIdent },
  alert: { title: p => raw(p.id), icon: () => 'bell',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: viewLabel('alerts'), switcher: 'wake.switch.view', arg: p }, crumb(p.id)], ident: clusterIdent },
  costs: { title: () => 'wake.cost.title', icon: () => 'chart-line',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: 'wake.cost.title' }], ident: clusterIdent },
  'ailog-detail': { title: () => 'wake.view.ailog', icon: () => 'ai',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: viewLabel('ailog'), switcher: 'wake.switch.view', arg: p }], ident: clusterIdent },
  /* 설정 › 도구·에이전트(시뮬레이션 사이드바 설정 구역): 클러스터 › 설정 › 도구 */
  ...Object.fromEntries([['tools', 'wake.home.tools', 'plug'], ['agent', 'wake.home.agent', 'wake-agent']].flatMap(([id, label, icon]) => {
    const crumbs = p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label }];
    return [[id, { title: () => label, icon: () => icon, crumbs, ident: clusterIdent }],
      [id === 'tools' ? 'tool' : 'agent-detail', { title: p => raw(id === 'tools' ? toolName(p.tool) : p.name), icon: () => icon, crumbs: p => [...crumbs(p), crumb(id === 'tools' ? toolName(p.tool) : p.name)], ident: clusterIdent }]]; })),
  'tool-api': { title: p => raw(toolName(p.tool) + ' API'), icon: p => toolKind(p.tool, 'globe').icon,
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), { label: raw(toolName(p.tool) + ' API') }], ident: clusterIdent },
  list: { title: p => p.ns === '_all' ? { key: 'wake.list.titleAll', vars: { kind: `${titleOf(p.kind)}` } } : raw(`${titleOf(p.kind)} · ${p.ns}`), icon: p => kindOf(p.kind)?.icon || 'k8s-pod',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), crumb(p.ns, 'wake.switch.ns', p), crumb(`${titleOf(p.kind)}`, 'wake.switch.kind', p)], ident: clusterIdent },
  detail: { title: p => raw(p.name), icon: p => kindOf(p.kind)?.icon || 'k8s-pod',
    crumbs: p => [crumb(clusterLabel(p.cluster), 'wake.switch.cluster', p), crumb(p.ns, 'wake.switch.ns', p), crumb(`${titleOf(p.kind)}`, 'wake.switch.kind', p), crumb(p.name, namesOf(p).list?.length === 0 ? undefined : 'wake.switch.name', p)], ident: clusterIdent },
  settings: { title: p => settingsLabel(p.page) || 'kit.settings', icon: () => 'settings',
    crumbs: p => [{ label: 'settings.title' }, { label: settingsLabel(p.page) || '', switcher: 'wake.switch.settings', arg: p }], ident: () => ({ icon: 'wake-mark', label: 'wake.name' }) },
  chat: { title: p => raw(chatTitle(p.id)), icon: () => 'bubbles', crumbs: p => [...(chatTitle(p.id) ? [{ label: raw(chatTitle(p.id)) }] : []), { label: 'wake.chat.list' }], ident: () => ({ icon: 'wake-mark', label: 'wake.name' }) },
};

/* 사이드바 클러스터: 첫 실행에서 확인한 kubeconfig context(연결한 것) */
const DOT = { ok: 'ok', forbidden: 'warn' };
const CLUSTER_PLATFORM_ICON = { ...PROVIDER_ICON, aws: 'brand-aws', eks: 'brand-aws', gke: 'brand-googlecloud', aks: 'brand-azure', kind: 'brand-kubernetes' };
const clustersOf = st => {
  const list = st.settings['wake.clusters.list'] || [], on = st.settings['wake.clusters.connected'];
  const real = list.filter(c => !on || on.includes(c.id)).map(c => { const display = clusterPresentation(c); return { id: c.id, name: display.name, ctx: display.endpoint, discriminator: display.discriminator, icon: CLUSTER_PLATFORM_ICON[c.infrastructure?.provider || c.provider] || 'brand-kubernetes', state: DOT[c.state] || 'off' }; });
  const duplicateKeys = real.map(c => JSON.stringify([c.name, c.ctx, c.discriminator]));
  real.forEach((c, index) => { if (duplicateKeys.some((key, other) => other !== index && key === duplicateKeys[index])) c.discriminator = [c.discriminator, c.id].filter(Boolean).join(' · '); });
  return real;
};
/** 사이드바와 같은 클러스터 목록(클러스터 화면의 찾기 범위 메뉴가 같이 씀) */
export const scopeClusters = settings => clustersOf({ settings });
const clusterIcon = id => scopeClusters(flowApi?.settings.all?.() || {}).find(c => c.id === id)?.icon || 'brand-kubernetes';
const inScope = (st, cluster) => clustersOf(st).some(c => c.id === cluster);
/* 사이드바에 보이는 클러스터("연결할 수 없는 클러스터 숨기기"가 켜지면 연결 안 되는 것은 빠짐): 첫 탭과 AI 범위의 기본값은 이 중에서 */
const shownClusters = settings => clustersOf({ settings }).filter(c => !settings['wake.cluster.hideOff'] || c.state !== 'off');
const home = settings => shownClusters(settings).find(c => c.state === 'ok' || c.state === 'warn')?.id;
/* 새 탭·앱 시작·첫 실행 끝: 마지막으로 본 클러스터(아직 연결돼 보이는 것)의 홈, 없으면 첫 연결 클러스터, 그것도 없으면 설정 › 클러스터(연결) */
const lastViewed = settings => { const id = settings['wake.cluster.last']; return id && shownClusters(settings).some(c => c.id === id && (c.state === 'ok' || c.state === 'warn')) ? id : null; };
const homeAddress = settings => { const id = lastViewed(settings) || home(settings); return id ? addr.cluster(id) : addr.settings('clusters'); };
const clusterOfAddress = a => /^wake:\/\/cluster\/([^/?]+)/.exec(a || '')?.[1];
/* 북마크 구역: 사용자가 더한 것만 */
const pinnedOf = st => st.settings['wake.pinned.added'] || [];
const chatsOf = st => chatList(conversations, st.settings);
/* AI 범위의 클러스터: 고른 것(아직 연결돼 있을 때), 아니면 첫 클러스터 */
const scopeCluster = s => (s['wake.scope.cluster'] && shownClusters(s).some(c => c.id === s['wake.scope.cluster']) ? s['wake.scope.cluster'] : home(s));
const scopeNs = (s, c) => s['wake.ns.default.' + c] || 'default';

/* 사이드바 클러스터 구역: 범위 안 클러스터와 그 구역 줄(지금 탭이 있는 구역 선택) */
let viewScope = null;
/* 앞의 탭이 클러스터 화면이면 그 클러스터를 마지막으로 본 클러스터로(새 탭·다음 시작이 그 홈으로) */
const rememberViewed = (s, api) => { const tab = api?.activeTab?.(), at = tab ? api.routeOf?.(tab)?.params?.cluster : null; if (at && at !== s.settings['wake.cluster.last'] && inScope(s, at)) api.setSetting?.('wake.cluster.last', at); };
const scopeOf = (s, api) => { const tab = api?.activeTab?.(), at = tab ? api.routeOf?.(tab)?.params?.cluster : null; return at && inScope(s, at) ? at : home(s.settings); };

/* 사이드바 대화·인시던트 구역의 인시던트: 허브 인시던트 저장소(incident.list)의 열린 것. 감지가 바꾸면('incident' 알림) 다시 읽는다 */
const openIncidents = [];
const SEV_DOT = { critical: 'critical', warning: 'warn' };
async function refreshIncidents() {
  const rows = await data.get('incidents', {}).catch(() => null);
  if (!Array.isArray(rows)) return;
  openIncidents.splice(0, openIncidents.length, ...rows.filter(r => r.phase !== 'resolved'));
  live.st.api?.refresh?.();
}
if (hasService()) { onService(event => { if (event === 'incident') void refreshIncidents(); }); void refreshIncidents(); }

/* 팔레트의 리소스 찾기: 클러스터마다 이름 목록을 잠깐(30초) 다시 씀 */
const paletteSeen = new Map();
async function paletteResources(cluster) {
  if (!cluster) return [];
  const kept = paletteSeen.get(cluster);
  if (kept && Date.now() - kept.at < 30000) return kept.rows;
  const all = await Promise.allSettled(FIND_KINDS.map(kind => data.get('resources', { cluster, ns: '_all', kind }).then(rows => rows.map(r => ({ kind, r })))));
  const rows = all.filter(x => x.status === 'fulfilled').flatMap(x => x.value).map(({ kind, r }) => ({ id: `${kind}/${r.ns || '_all'}/${r.name}`, icon: KIND_OF[kind]?.icon, fav: true, label: raw(r.name),
    end: raw([KIND_OF[kind]?.kind, r.ns].filter(Boolean).join(' · ')), action: 'kit.navigate', arg: { address: addr.detail(cluster, r.ns || '_all', kind, r.name) } }));
  paletteSeen.set(cluster, { at: Date.now(), rows });
  return rows;
}

/* ---------- 설정 정의 ---------- */
const sel = (key, options) => ({ type: 'select', key, options });
const opt = (id, label, icon) => ({ id, label, icon });
/* AI 권한 단계: 읽기만(기본), 바꾸기 전 묻기. 자동 실행은 두지 않음(제품 제약) */
/* 권한 단계 아이콘 하나(설정·클러스터 메뉴·첫 실행·AI 칸이 같은 것): 읽기만은 눈 */
const PERM_ICON = { read: 'mode-read', ask: 'mode-guard' };
const PERM_LEVELS = [opt('read', 'wake.perm.read', PERM_ICON.read), opt('ask', 'wake.perm.ask', PERM_ICON.ask)];
/* 보관함 › AI 대화: 보관한 대화(제목, 마지막 답 한 줄, 클러스터·인시던트, 보관한 날) — 찾기와 거르기(글자, 클러스터, 기간), 다시 열기, Markdown 내보내기, 삭제(작업 기록은 남음) */
const ARCHIVE_PAGE = { id: 'archive', label: 'wake.settings.archive', icon: 'archive', sections: async ctx => {
  /* 아직 읽지 않았거나 읽기에 실패한 동안은 그릴 때마다 다시 읽음(복구되면 바로 보관한 대화 또는 없음) */
  await refreshConversations();
  const st = { settings: ctx.settings() }, all = chatsOf(st).filter(c => c.state === 'archived' && inScope(st, c.cluster));
  const clusterIds = [...new Set(all.map(c => c.cluster))];
  /* 고른 클러스터가 보관 대화에 없으면(그 클러스터의 마지막 대화를 지움 등) 모든 클러스터로 보고 거름 */
  const cluster = clusterIds.includes(st.settings['wake.archive.cluster']) ? st.settings['wake.archive.cluster'] : 'all';
  const list = filterArchive(all, { q: st.settings['wake.archive.q'], cluster, days: st.settings['wake.archive.days'] });
  /* 빈 목록: 대화 저장소를 읽지 못함(그 출처) · 거른 결과 없음 · 보관한 대화 없음을 나눔 */
  const none = conversationRead.state === 'failed' ? 'wake.home.conversationsFailed' : conversationRead.state === 'unconfigured' ? 'wake.home.conversationsUnconfigured'
    : all.length ? 'wake.s.archive.noMatch' : 'wake.s.archive.empty';
  return [
    { title: 'wake.s.archive.list', count: list.length,
      toolbar: { start: [{ type: 'search', key: 'wake.archive.q', placeholder: 'wake.s.archive.search', width: 'var(--select-summary-w)' }, { ...sel('wake.archive.cluster', [opt('all', 'wake.s.archive.allClusters'), ...clusterIds.map(id => opt(id, raw(id), 'k8s-cluster'))]), default: 'all' },
        sel('wake.archive.days', [opt('0', 'wake.s.archive.anytime'), opt('7', 'wake.s.archive.d7'), opt('30', 'wake.s.archive.d30'), opt('90', 'wake.s.archive.d90')])] },
      groups: list.length ? [list.map(c => ({ id: 'ar-' + c.id, icon: 'message', title: raw(c.title), description: raw([answerPreview(c.last), c.cluster, c.incident].filter(Boolean).join(' · ')),
        control: { type: 'group', items: [c.time ? { type: 'value', text: { date: c.time, format: { month: 'long', day: 'numeric' } } } : null, { type: 'more', menu: 'wake.archive.more', arg: c.id }].filter(Boolean) } }))] : [],
      none: list.length ? undefined : { icon: 'archive', title: none } },
    { title: 'wake.s.audit.retention', groups: [[
      { id: 'ar-keep', title: 'wake.s.archive.keep', description: 'wake.s.archive.keep.desc', control: { ...sel('wake.archive.keep', [opt('90', 'wake.s.days.90'), opt('365', 'wake.s.days.365'), opt('0', 'wake.s.archive.forever')]) } },
    ]] },
    /* 내 자료(허브 보관 정책): 내보내기 JSON 하나(가린 값), 지우기는 확인 대화상자 뒤에만 */
    { title: 'wake.data.title', groups: [[
      { id: 'data-export', title: 'wake.data.export', description: 'wake.data.exportDesc', control: { type: 'button', icon: 'download', label: 'wake.data.exportBtn', size: 'sm', action: 'wake.data.export' } },
      { id: 'data-delete', title: 'wake.data.delete', description: 'wake.data.deleteDesc', control: { type: 'button', icon: 'trash', label: 'wake.data.deleteBtn', size: 'sm', variant: 'destructive', dialog: 'wake.data.deleteDlg' } },
    ]] },
  ];
} };
/* 복사용 에이전트 설치 명령: 앱에 든 차트의 이미지가 공개된 것으로 확인됐을 때만(agent.prep image, B2-01). 모르거나 공개되지 않았으면 null(복사 동작 없음) */
let agentImage = null;
const agentCommand = id => {
  if (!agentImage && hasService()) agentImage = service('agent.prep', {}).then(p => p?.image || null, () => null).then(image => { agentImage = { image }; return agentImage; });
  return agentImage?.image?.published === true ? METHODS.agent.command(id, AGENT_CHART) : null;
};
const accessReads = perCluster((ctx, id) => ctx.data.get('access', { cluster: id }));
/* 클러스터 연결 방법(첫 실행 "새로 연결"의 줄과 설정 › 클러스터의 연결 메뉴가 같이 씀): kubeconfig 파일·붙여넣기, 서버 주소와 토큰, 클라우드 명령 */
const CLUSTER_ADD = [{ id: 'add-file', icon: 'file-code', label: 'wake.fr.add.file' }, { id: 'add-token', icon: 'credentials', label: 'wake.fr.add.token' }, { id: 'add-cloud', icon: 'cloud', label: 'wake.fr.add.cloud', desc: 'wake.fr.add.cloud.desc' }];
const clusterAdd = id => CLUSTER_ADD.find(m => m.id === id);
/* 클라우드 명령으로 연결의 고를 곳(첫 실행 칸과 설정 연결 메뉴가 같이 씀) */
const CLOUDS = [{ id: 'aws', label: raw('AWS'), icon: 'brand-aws' }, { id: 'gcp', label: raw('Google Cloud'), icon: 'brand-googlecloud' }, { id: 'azure', label: raw('Azure'), icon: 'brand-azure' }, { id: 'kind', label: raw('kind'), icon: 'brand-kind' }];
const CONNECT = connectPages({ raw, sel, opt, addr, agentCommand, withForm, addMethods: CLUSTER_ADD, clouds: CLOUDS, notify: () => NOTIFY.map(n => ({ ...n, key: notifyKey(n.id) })) });
/* Wake 저장소(의견·문서): 앱 정보 한 곳(package.json repository) */
const REPO = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const SETTINGS = {
  tabIcon: 'wake-mark',
  defaults: {
    'kit.theme': 'dark', 'kit.windowStyle': 'transparent', 'kit.terminal.theme': 'app', 'kit.sidebar.sections': ['pinned', 'conversations'], 'wake.sidebar.recent': '3',
    'wake.perm.default': 'read', 'wake.archive.keep': '365',
    'wake.cluster.refresh': '120', 'wake.cluster.hideOff': false, 'wake.cluster.autoRefresh': true, 'wake.cluster.refreshOnFocus': true,
    'wake.archive.q': '', 'wake.archive.cluster': 'all', 'wake.archive.days': '0', 'kit.startup': 'new', 'wake.tools.pinned': ['grafana'],
  },
  /* 설정 내비 바닥: 의견 보내기(저장소 이슈), 문서(저장소 README) — 시스템 브라우저로 열림 */
  footer: [
    { id: 'feedback', label: 'wake.settings.feedback', icon: 'message', url: `${REPO}/issues` },
    { id: 'docs', label: 'wake.settings.docs', icon: 'book-open', external: true, url: `${REPO}#readme` },
  ],
  groups: [
    { label: 'wake.settings.group.personal', pages: [
      { id: 'general', label: 'wake.settings.general', icon: 'settings', activeIcon: 'settings-active', sections: [
        { title: 'wake.s.preferences', groups: [[
          { id: 'language', title: 'wake.s.language', description: 'wake.s.language.desc', control: sel('kit.locale', [opt('system', 'locale.system'), opt('ko', 'locale.name.ko'), opt('en', 'locale.name.en')]) },
          { id: 'startup', title: 'wake.s.startup', description: 'wake.s.startup.desc', control: { ...sel('kit.startup', [opt('restore', 'wake.s.startup.restore'), opt('new', 'wake.s.startup.new')]), width: 'max-content' } },
          { id: 'open-at-login', title: 'wake.s.openAtLogin', description: 'wake.s.openAtLogin.desc', desktop: true, control: { type: 'switch', key: 'kit.openAtLogin' } },
        ], [
          { id: 'spellcheck', title: 'wake.s.spellcheck', description: 'wake.s.spellcheck.desc', desktop: true, control: { type: 'switch', key: 'kit.spellcheck' } },
        ]] },
        { title: 'wake.s.about', groups: [[
          { id: 'version', title: 'wake.name', description: { key: 'wake.s.version', vars: { v: formatToolVersion(pkg.version) } } },
          /* 첫 출시는 자동 업데이트가 꺼져 있다(desktop.config.cjs update 없음, 위 막대 단추 숨음): 그 사실과 새 버전을 받는 길 */
          { id: 'update', title: 'wake.s.update', description: 'wake.s.update.manual' },
        ]] },
      ] },
      { id: 'appearance', label: 'wake.settings.appearance', icon: 'contrast', initAction: 'wake.appearance.discover', sections: [
        { title: 'wake.s.appearance', groups: [[
          { id: 'theme', title: 'wake.s.theme', description: 'wake.s.theme.desc', control: sel('kit.theme', [opt('system', 'wake.s.theme.system', 'display'), opt('light', 'wake.s.theme.light', 'sun'), opt('dark', 'wake.s.theme.dark', 'moon')]) },
          { id: 'zoom', title: 'wake.s.zoom', control: { type: 'select', key: 'kit.zoom' } },
          { id: 'terminal', title: 'wake.term.title', desktop: true,
            control: { ...sel('kit.terminal.theme', terminalOptions), default: 'app', selected: terminalSelection, action: 'wake.appearance.select' } },
          { id: 'window-style', title: 'wake.s.windowStyle', control: { type: 'choices', key: 'kit.windowStyle', options: ['tinted', 'transparent'].map(id => ({ id, label: `wake.s.windowStyle.${id}`, picture: { look: id }, needs: id === 'transparent' ? 'translucent' : undefined })) } },
        ], [
          { id: 'tab-position', title: 'wake.s.tabPosition', description: 'wake.s.tabPosition.desc', control: sel('kit.tab.position', [opt('top', 'wake.s.tabPosition.top'), opt('bottom', 'wake.s.tabPosition.bottom')]) },
          { id: 'sidebar-sections', title: 'wake.s.sidebarSections', description: 'wake.s.sidebarSections.desc', wideControl: true, control: { type: 'select', key: 'kit.sidebar.sections', multi: true, width: 'var(--select-multi-w)', options: [
            { id: 'clusters', label: 'wake.section.clusters', fixed: true, tip: 'wake.s.sidebarSections.fixed' }, opt('pinned', 'wake.section.pinned'), opt('conversations', 'wake.section.conversations')] } },
          { id: 'sb-recent', title: 'wake.s.recent', description: 'wake.s.recent.desc', control: sel('wake.sidebar.recent', [opt('3', 'wake.s.recent.3'), opt('5', 'wake.s.recent.5'), opt('10', 'wake.s.recent.10')]) },
        ]] },
        { title: 'wake.s.tabs', groups: [[
          { id: 'switch-order', title: 'wake.s.switchOrder', description: 'wake.s.switchOrder.desc', control: sel('kit.tab.switchOrder', [opt('recent', 'wake.s.switchOrder.recent'), opt('sidebar', 'wake.s.switchOrder.sidebar')]) },
        ]] },
        { title: 'wake.s.shortcuts', groups: [[
          ...[['kit.sidebar.toggle', 'sidebar'], ['kit.palette.tabs', 'searchTabs'], ['kit.palette.open', 'find'], ['kit.panel.toggle', 'ask'], ['kit.panel.new', 'newChat'], ['wake.cluster.copyContext', 'copyContext']]
            .map(([id, k]) => ({ id: 'sc-' + k, title: `wake.s.sc.${k}`, description: `wake.s.sc.${k}.desc`, control: { type: 'kbd', shortcut: id, label: `wake.s.sc.${k}` } })),
        ]] },
      ] },
    ] },
    { label: 'wake.settings.group.ai', pages: [
      { id: 'ai-chat', label: 'wake.settings.aiChat', icon: 'bubbles', sections: [
        { title: 'wake.s.chat', groups: [[
          { id: 'notify', title: 'wake.s.notify', description: 'wake.s.notify.desc', control: { type: 'select', key: 'kit.ai.notify', multi: true, summary: { all: 'wake.s.notify.all', none: 'wake.s.notify.none', some: 'wake.s.notify.some' },
            options: [{ id: 'attention', label: 'wake.s.notify.attention', desc: 'wake.s.notify.attention.desc' }, { id: 'done', label: 'wake.s.notify.done', desc: 'wake.s.notify.done.desc' }] } },
          { id: 'sound', title: 'wake.s.sound', description: 'wake.s.sound.desc', control: { type: 'switch', key: 'kit.ai.sound' },
            stack: { type: 'button', icon: 'play', label: 'wake.s.sound.preview', variant: 'outline', size: 'xs', action: 'kit.settings.sound-preview' } },
        ], [
          { id: 'perm-default', title: 'wake.s.perm.default', description: 'wake.s.perm.default.desc', control: sel('wake.perm.default', PERM_LEVELS) },
          { id: 'follow-up', title: 'wake.s.followUp', description: 'wake.s.followUp.desc', control: sel('kit.ai.followUp', [opt('queue', 'wake.s.followUp.queue'), opt('steer', 'wake.s.followUp.steer')]) },
          /* 인시던트 자동 해석(허브 ai-run autoInterpret, settings.json wake.ai.autoInterpret): 기본 꺼짐, 켜면 연결한 모델을 부름 */
          { id: 'auto-interpret', title: 'wake.s.autoInterpret', description: 'wake.s.autoInterpret.desc', control: { type: 'switch', key: 'wake.ai.autoInterpret' } },
        ]] },
      ] },
      { id: 'ai-models', label: 'wake.settings.ai', icon: 'ai', activeIcon: 'ai-active', sections: ctx => [
        /* AI 공급자: 첫 실행과 같은 연결 행(상태, 동작, 단계). API 키는 대화상자로 받아 키체인에만 */
        ...['sub', 'api'].map(g => ({ title: 'wake.fr.ai.' + g, groups: [AI.filter(a => a.group === g).map(a => { const v = aiView(connState(ctx.settings()), a, 'settings');
          return withForm(ctx.settings(), aiKey(a.id), { id: aiKey(a.id), icon: a.icon, title: raw(a.name), description: v.description, connection: connRowOf(v) }); })] })),
      ] },
      aiConnectPage({ raw }),
    ] },
    { label: 'wake.settings.group.connect', pages: [CONNECT.clustersPage, CONNECT.agentsPage, CONNECT.toolsPage, CONNECT.gitPage] },
    { label: 'wake.settings.group.access', pages: [
      /* 권한 3층(8-1): 클러스터 권한(kubeconfig 계정의 RBAC, 읽기만) ∩ AI 권한(읽기만 기본, 바꾸기 전 묻기) */
      { id: 'permissions', label: 'wake.settings.permissions', icon: 'lock', tabs: [{ id: 'cluster', label: 'wake.s.perm.tab.cluster' }, { id: 'ai', label: 'wake.s.perm.tab.ai' }],
        /* 클러스터마다 따로 읽음(한 클러스터가 답하지 않아도 다른 클러스터와 AI 권한 탭은 바로 그림): 기다리는 클러스터는 그 묶음의 행이 확인 중·시간 초과·읽기 실패 */
        sections: ctx => { const clusters = scopeClusters(ctx.settings()), reads = accessReads(ctx, clusters.map(c => c.id)), st = ctx.settings();
          const rows = c => { const e = reads.of(c.id); if (e.state !== 'ok') return [CONNECT.readRow(st, 'acc-read-' + c.id, e, { icon: 'k8s-cluster', title: raw(c.name) })];
            return e.value?.length ? e.value.map(a => ({ id: `acc-${c.id}-${a.ns}`, icon: 'k8s-namespace', title: raw(a.ns), control: permVerbs(a), wideControl: true }))
              : [{ id: `acc-${c.id}-none`, icon: 'k8s-namespace', title: 'wake.s.perm.unknown', description: 'wake.s.perm.unknown.desc' }]; };
          return [
          ...clusters.map((c, i) => ({ tab: 'cluster', title: raw(c.id), ...(i === 0 ? { pending: reads.pending } : {}), groups: [rows(c)] })),
          { tab: 'ai', title: 'wake.s.perm.ai.default', groups: [[
            { id: 'perm-default', title: 'wake.s.perm.default', description: 'wake.s.perm.default.desc', control: sel('wake.perm.default', PERM_LEVELS) },
          ]] },
          { tab: 'ai', title: 'wake.s.perm.ai.clusters', groups: [clusters.map(c => ({ id: 'aip-' + c.id, icon: c.icon, title: raw(c.id), description: raw(c.ctx), control: { ...sel('wake.perm.' + c.id, PERM_LEVELS), default: st['wake.perm.default'] || 'read' } }))] },
        ]; } },
    ] },
    { label: 'wake.settings.group.records', pages: [
      ARCHIVE_PAGE,
    ] },
  ],
};

/* ---------- 메뉴(행 더 보기, 연결, 계정) ---------- */
const item = (id, label, icon, extra = {}) => ({ id, label, icon, ...extra });
/* ---------- 위쪽 바 팝오버(클러스터 정보, 도구) ---------- */
const STATUS = { ok: ['ok', 'plug'], warn: ['warn', 'exclamation-triangle'], off: ['danger', 'unplug'] };
const clusterSettings = (id, section) => ({ address: addr.settings('clusters') + `?cluster=${encodeURIComponent(id)}` + (section ? `&section=${section}` : ''), newTab: true });
function clusterRecord(id, settings) {
  const row = (settings['wake.clusters.list'] || []).find(c => c.id === id) || live.st.kube?.contexts.find(c => c.id === id);
  if (row) return { ...row, ctx: row.ctx || row.id, state: row.state === 'ok' ? 'ok' : ['forbidden', 'warn'].includes(row.state) ? 'warn' : 'off', perm: row.perm || 'read' };
  return null;
}
const permOf = (id, st) => st.settings['wake.perm.' + id] ?? clusterRecord(id, st.settings)?.perm ?? 'read';
const POPOVERS = {
  'wake.cluster.info': (id, st) => {
    const c = clusterRecord(id, st.settings);
    if (!c) return null;
    const [tone, ic] = STATUS[c.state], perm = permOf(id, st);
    const level = x => item('perm-' + x, `wake.perm.${x}`, PERM_ICON[x], { checked: perm === x, action: 'wake.cluster.perm', arg: { cluster: id, perm: x } });
    return { variant: 'popover', items: [
      { type: 'header', label: raw(c.ctx) },
      item('ci-status', { key: 'wake.ci.statusLine', vars: { state: { key: 'wake.state.' + c.state }, version: c.version } }, ic, { tone, chevron: true, action: 'kit.navigate', arg: clusterSettings(id) }),
      item('ci-switch', 'wake.ci.switch', 'k8s-cluster', { submenu: { variant: 'popover', ...switchers['wake.switch.cluster']({ cluster: id }, st) } }),
      item('ci-settings', 'wake.ci.settings', 'sliders', { action: 'kit.navigate', arg: clusterSettings(id) }),
      item('ci-cred', 'wake.ci.credentials', 'lock', { action: 'kit.navigate', arg: clusterSettings(id, 'credentials') }),
      { type: 'separator' }, { type: 'label', label: 'wake.ci.permissions' },
      item('ci-agent', 'wake.ci.agent', 'wake-agent', { desc: 'wake.ci.agent.desc', switch: true, on: c.agent, confirm: true, chevron: true, action: 'wake.cluster.agent', arg: id }),
      item('ci-ai', 'wake.ci.ai', PERM_ICON[perm], { end: { key: `wake.perm.${perm}` }, submenu: { variant: 'popover', items: [level('read'), level('ask')] } }),
      { type: 'separator' },
      item('ci-copy', 'wake.ctx.copyContext', 'copy', { shortcut: ['⌘', '⇧', 'C'], action: 'wake.cluster.copyContext', arg: id }),
      item('ci-retry', 'wake.ci.retry', 'arrow-rotate-clockwise', { action: 'kit.history.reload' }),
    ] };
  },
  'wake.tools': (p, st, api) => {
    const cloudConsole = gcpConsoleMenuItem(p, api), x = toolsHere(p.cluster);
    return { variant: 'popover', align: 'end', ...(x.list ? {} : { pending: x.promise }), items: [
      item('tools-manage', 'wake.tools.manage', 'puzzle', { action: 'kit.navigate', arg: { address: addr.settings('tools'), newTab: true } }),
      ...(cloudConsole ? [cloudConsole] : []),
      ...(x.list ? toolItems(p.cluster, x, st.settings) : [{ type: 'separator' }, item('tools-busy', 'wake.res.loading', null, { lead: C.statusIcon.render({ kind: 'busy' }) })]),
    ] };
  },
};

/* 위쪽 도구 메뉴와 계정 메뉴의 도구: 그 클러스터에서 찾은 도구(tools.find)를 출처 칩과 같은 상태(허브 출처 상태 hub.sources)로. 잠깐(10초) 다시 씀 */
const toolsSeen = {};
/* 열거(tools.find)와 허브 출처 상태(hub.sources)의 읽기 결과(아직 · 실패 · 값)를 그대로 보관(거절을 빈 목록·null로 바꾸지 않음). 잠깐(10초) 다시 씀, 실패는 다시 읽음 */
const toolsHere = cluster => { const have = toolsSeen[cluster]; if (!cluster) return { list: [], inventory: read.ok([]), hub: read.ok({}) };
  /* 성공은 10초 다시 씀. 그 밖(실패 포함)은 읽기가 끝난 바로 뒤(2초 안) 메뉴가 한 번 다시 그릴 때만 쓰고, 다음에 열면 다시 읽음(오래된 결과를 다시 보이지 않음) */
  if (have && (!have.list || (Date.now() - have.at < 10000 && have.inventory.status === 'ok' && have.hub.status !== 'failed'))) return have;
  if (have?.unshown && Date.now() - have.at < 2000) { have.unshown = false; return have; }
  const x = { at: Date.now(), list: null, inventory: read.unread(), hub: read.unread() };
  /* 메뉴는 열거가 오면 열림(허브 상태는 오는 대로, 그 전에는 확인 중): 두 읽기가 서로 기다리지 않음 */
  void readOf(data.get('sourceStates', { cluster })).then(hub => { x.hub = hub; });
  x.promise = readOf(data.get('clusterTools', { cluster })).then(inventory => { rememberFound(() => flowApi?.settings.all?.(), flowApi?.setSetting, cluster, inventory); x.inventory = inventory; x.list = true; x.unshown = true; x.at = Date.now(); });
  return (toolsSeen[cluster] = x); };
const CHIP_DOT = { ok: 'ok', limited: 'warn', perm: 'warn', error: 'critical' };
/* 위쪽 도구 메뉴·계정 메뉴의 도구: 도구 상태 판단 하나(toolViews)로 연결한 도구만, 상태는 같은 판단의 health.
   열거를 읽지 못하면 연결 기록이 있는 도구는 남고 그 아래 실패 한 줄(누르면 도구 화면) */
function toolItems(cluster, x, settings) {
  if (!cluster || !x?.list) return [];
  const set = toolViews({ cluster, settings, inventory: x.inventory, hub: x.hub }), pinned = settings['wake.tools.pinned'] || [];
  const rows = set.included.map(v => { const k = toolKind(v.kind), on = pinned.includes(v.kind), tool = v.tool ? v.tool.raw || v.tool : (settings['wake.connections'] || {})[`${cluster}-${v.kind}`]?.where?.tool || (v.found ? { kind: v.kind, ns: v.found.ns, svc: v.found.svc } : { kind: v.kind });
    const open = { action: 'wake.tool.open', arg: { cluster, tool } }, last = Date.parse(v.tool?.last || ''); // 끝 시각은 이전처럼 열거 항목의 last만(허브 마지막 성공 시각을 새로 띄우지 않음)
    return item('tool-' + v.kind, raw(k.name), k.icon, { fav: true, dot: CHIP_DOT[v.health], end: Number.isFinite(last) ? raw(shownTime(last)) : undefined, subButton: 'wake.more',
      actions: [{ id: 'pin', icon: on ? 'pin-off' : 'pin-item', tip: on ? 'wake.ctx.unpin' : 'wake.tools.pin', on, action: 'wake.tool.pin', arg: v.kind }],
      /* 열 대상(확인된 바인딩)이 없으면 열기 없음(판단 함수의 openable) */
      submenu: { variant: 'popover', items: [...(v.openable ? [item('tm-open', 'wake.ctx.openNewTab', 'arrow-up-right', open), { type: 'separator' }] : []), item('tm-off', 'wake.prov.disconnect', 'unplug', { danger: true, action: 'kit.navigate', arg: { address: addr.settings('tools'), newTab: true } })] } }); });
  const failed = set.inventory === 'failed' ? [item('tools-failed', 'wake.find.c.read', null, { lead: C.statusIcon.render({ kind: 'error' }), action: 'kit.navigate', arg: { address: viewAddress(cluster, 'tools'), newTab: true } })] : [];
  return rows.length || failed.length ? [{ type: 'separator' }, { type: 'label', label: 'wake.tools.title' }, ...rows, ...failed] : [];
}

/* ---------- 대화상자(확인, 초대, 사용자 공급자) ---------- */
const folderOf = (st, id) => (st ? pinnedOf(st).find(x => x.id === id) : null);
const TERMINAL_APPS = { 'com.mitchellh.ghostty': 'Ghostty', 'com.apple.Terminal': 'Terminal', 'com.googlecode.iterm2': 'iTerm2' };
const TERMINAL_PRESETS = ['app', 'midnight', 'paper', 'solarized'];
const appearanceSelections = new WeakMap();
const appearanceDiscovery = new WeakMap();
const terminalApps = settings => {
  const installed = settings['wake.terminal.apps'];
  return Array.isArray(installed) ? Object.keys(TERMINAL_APPS).filter(id => installed.includes(id)) : [];
};
const terminalProfiles = settings => (Array.isArray(settings['kit.terminal.appearances']) ? settings['kit.terminal.appearances'] : [])
  .filter(item => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(item?.id) && typeof item.label === 'string' && !/[\x00-\x1f\x7f/\\]/.test(item.label));
function terminalOptions(ctx) {
  const settings = ctx.settings(), apps = terminalApps(settings);
  return [opt('app', 'wake.s.termTheme.app'), ...apps.map(id => opt(id, raw(TERMINAL_APPS[id]))),
    opt('midnight', raw('Midnight')), opt('paper', raw('Paper')), opt('solarized', raw('Solarized')),
    ...terminalProfiles(settings).filter(item => !apps.includes(item.source?.appId) || item.id !== item.source.appId)
      .map(item => opt('imported:' + item.id, raw(item.label)))];
}
function terminalSelection(ctx) {
  const settings = ctx.settings(), theme = settings['kit.terminal.theme'] || 'app';
  const selected = theme === 'app' ? settings['kit.terminal.font'] || 'app' : theme;
  const profile = terminalProfiles(settings).find(item => 'imported:' + item.id === selected);
  return profile && profile.id === profile.source?.appId && terminalApps(settings).includes(profile.id) ? profile.id : selected;
}
function discoverTerminalApps(api) {
  const pending = appearanceDiscovery.get(api);
  if (pending) return pending;
  const discovery = api.terminal.appearance.list().then(result => {
    if (result?.status !== 'listed') return null;
    const ids = Object.keys(TERMINAL_APPS).filter(id => result.applications.some(app => app.appId === id && app.installed === true));
    if (JSON.stringify(ids) !== JSON.stringify(api.settings.get('wake.terminal.apps'))) api.setSetting('wake.terminal.apps', ids);
    return result;
  }).catch(() => null).finally(() => appearanceDiscovery.delete(api));
  appearanceDiscovery.set(api, discovery);
  return discovery;
}
/* 에이전트 설치 권한이 없을 때의 필요한 권한 시트: 설치할 수 있는 사람이 실행할 설치 명령(복사·Slack), 직접 적용은 데스크톱의 OS 확인 창에 사람이 답한 뒤 실행(commands.json confirm) */
function installSheet(arg, st) {
  const slack = !!(st?.settings?.['wake.connections'] || {})['notify-slack'];
  return { title: 'wake.perm.title', size: 'lg', description: 'wake.flow.c.installForbidden',
    body: C.codeBlock.render({ lang: 'helm', text: arg.install, syntax: 'sh', wrap: true, actions: 'copy' }),
    extra: [{ label: 'wake.perm.slack', icon: 'brand-slack', action: 'wake.perm.slack', arg: { text: arg.install, cluster: arg.cluster }, disabled: !slack, tip: slack ? undefined : 'wake.perm.slackOff' },
      { label: 'wake.perm.apply', icon: 'terminal', variant: 'secondary', action: 'wake.perm.apply', arg: { key: arg.key, cluster: arg.cluster, command: arg.install } }],
    cancel: 'dialog.close', submit: { label: 'wake.perm.copy', action: 'wake.copy', arg: { value: arg.install } } };
}
const DIALOGS = {
  'wake.ai.client.add': aiClientDialog(st => clustersOf({ settings: st?.settings || {} })),
  'wake.folder.rename': (id, st) => ({ title: 'wake.folder.renameTitle', fields: [{ key: 'name', label: 'wake.folder.name', type: 'text', value: folderOf(st, id)?.label || '', required: true }], submit: { label: 'wake.ctx.rename', action: 'wake.folder.rename', arg: id } }),
  'wake.folder.delete': (id, st) => ({ title: 'wake.folder.deleteTitle', description: { key: 'wake.folder.deleteDesc', vars: { name: folderOf(st, id)?.label || '' } }, submit: { label: 'wake.ctx.delete', action: 'wake.folder.delete', arg: id } }),
  'wake.ns.add': id => ({ title: 'wake.ns.addTitle', description: 'wake.ns.addDesc', fields: [{ key: 'name', label: 'wake.ns.name', type: 'text', required: true, validate: v => /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(v) ? null : 'wake.ns.invalid' }], submit: { label: 'wake.fr.add.btn', action: 'wake.ns.add', arg: id } }),
  /* 필요한 권한: 빠진 권한 한 줄, 그것만 주는 kubectl 명령과 YAML(각각 복사), 직접 적용(내 자격이 줄 수 있을 때만), Slack으로 보내기(연결돼 있을 때만) */
  'wake.perm.sheet': (arg = {}, st) => { if (arg.install) return installSheet(arg, st); if (!arg.need) return null; const n = arg.need, g = grantOf(n, arg.cluster), slack = !!(st?.settings?.['wake.connections'] || {})['notify-slack'];
    const where = n.namespace ? { key: 'wake.perm.inNs', vars: { ns: n.namespace } } : { key: 'wake.perm.inCluster' };
    return { title: 'wake.perm.title', size: 'lg', description: n.user ? { key: 'wake.perm.what', vars: { user: n.user, resource: g.resourceRef, where } } : { key: 'wake.perm.whatAnyone', vars: { resource: g.resourceRef, where } },
      body: html`${C.codeBlock.render({ lang: 'kubectl', text: g.kubectl, syntax: 'sh', wrap: true, actions: 'copy' })}${C.codeBlock.render({ path: `${g.name}.yaml`, fold: false, text: g.yaml, syntax: 'yaml', file: `${g.name}.yaml` })}`,
      extra: [{ label: 'wake.perm.slack', icon: 'brand-slack', action: 'wake.perm.slack', arg: { text: g.kubectl, cluster: arg.cluster }, disabled: !slack, tip: slack ? undefined : 'wake.perm.slackOff' },
        ...(arg.can ? [{ label: 'wake.perm.apply', icon: 'terminal', variant: 'secondary', action: 'wake.perm.apply', arg: { key: arg.key, cluster: arg.cluster, command: g.kubectl } }] : [])],
      cancel: 'dialog.close', submit: { label: 'wake.perm.copy', action: 'wake.copy', arg: { value: g.kubectl } } }; },
  /* 대화 삭제: 확인 뒤 삭제. 작업 기록은 남음 */
  'wake.chat.deleteDlg': id => ({ title: 'wake.chat.deleteTitle', description: { key: 'wake.chat.deleteDesc', vars: { title: chatTitle(id) } }, submit: { label: 'wake.ctx.delete', action: 'wake.chat.delete', arg: id, variant: 'destructive' } }),
  /* kubeconfig의 exec 인증 명령 허락: 그 명령(찾은 실제 경로와 인자)을 셸이 읽는 그대로 보이고, 허락은 셸에서만 기록(services kube.execConsent) */
  'wake.exec.consent': (arg = {}) => ({ title: 'wake.exec.title', size: 'md', description: { key: 'wake.exec.desc', vars: { name: arg.name || arg.id } },
    body: C.codeBlock.render({ lang: 'exec', text: [arg.command, ...(arg.args || [])].map(shellWord).join(' '), syntax: 'sh', wrap: true, actions: 'copy' }),
    cancel: 'wake.exec.refuse', submit: { label: 'wake.tool.allow', action: 'wake.exec.allow', arg: { id: arg.id } } }),
  /* 내 자료 지우기: 확인 뒤에만(hub data.delete confirm: true) */
  'wake.kube.repairDlg': () => ({ title: 'wake.s.connFile.repairTitle', description: 'wake.s.connFile.repairConfirm', submit: { label: 'wake.s.connFile.repair', action: 'wake.kube.repair' } }),
  'wake.data.deleteDlg': () => ({ title: 'wake.data.deleteTitle', description: 'wake.data.deleteConfirm', submit: { label: 'wake.data.deleteBtn', action: 'wake.data.delete', variant: 'destructive' } }),
  /* 외부 AI 클라이언트 토큰 다시 발급: 이전 토큰은 바로 무효(hub-server rotateClient) */
  'wake.ai.client.rotateDlg': id => ({ title: 'wake.s.aic.rotateTitle', description: 'wake.s.aic.rotateConfirm', submit: { label: 'wake.s.aic.rotate', action: 'wake.ai.client.rotate', arg: id } }),
  'wake.ai.client.token': aiTokenDialog,
};
/* 셸이 읽는 한 낱말(따옴표가 필요 없으면 그대로) */
const shellWord = v => (/^[A-Za-z0-9_./=:@%+-]+$/.test(String(v)) ? String(v) : `'${String(v).replace(/'/g, `'\\''`)}'`);

const MENUS = {
  ...switchers,
  'wake.ai.client.more': aiClientMenu,
  ...POPOVERS,
  /* 로그인 전(8-0): 작업공간·로그아웃 없이 내 권한, 작업 기록, 설정만 */
  /* 계정 메뉴(프로필 메뉴 구성): 프로필 묶음(이 컴퓨터의 로컬 프로필 하나), 구분선, Wake 화면(북마크 ›, 작업 기록 ›, 도구 ›, 권한), 설정, 구분선, 새 탭.
     Wake에 없는 기능(새 프로필, 내려받기, 개발자, 시크릿 창)은 두지 않음: 같은 묶음 자리에 나중에 더함 */
  'wake.account': (_p, st, api) => { const me = api?.user || null, at = api?.routeOf?.(api.activeTab?.()), go = address => ({ action: 'kit.navigate', arg: { address, newTab: true } });
    /* 도구: 지금 탭 클러스터의 도구(위쪽 도구 메뉴와 같은 목록) */
    const cluster = at?.params?.cluster, tools = toolsHere(cluster);
    /* 작업 기록: 모두 보기는 AI 작업 기록 화면(지금 범위 클러스터). 최근 행은 감사 저장소(6.2, 관문 2)가 생기면 이 자리에 */
    const marks = pinnedOf(st), logCluster = scopeCluster(st.settings);
    const mark = x => item('am-' + x.id, raw(x.label), x.icon, { fav: true, ...go(x.address) });
    return { side: 'top', width: 240, ...(tools.list ? {} : { pending: tools.promise }), items: [
      { type: 'label', label: 'wake.account.profiles' },
      item('acc-me', me ? raw(me) : 'wake.account.local', null, { lead: C.avatar.render({ name: me || api?.t?.('wake.account.local') || '' }), checked: true, action: 'kit.navigate', arg: { address: addr.settings('general'), newTab: true } }),
      { type: 'separator' },
      marks.length ? item('acc-marks', 'wake.section.pinned', 'bookmark', { submenu: { items: marks.map(x => x.items ? item('amf-' + x.id, raw(x.label), 'folder', { submenu: { items: x.items.map(mark) } }) : mark(x)) } })
        : item('acc-marks', 'wake.account.noMarks', 'bookmark', { disabled: true }),
      item('acc-audit', 'wake.account.audit', 'scroll-text', { submenu: { items: [item('aa-all', 'wake.account.auditAll', null, logCluster ? go(viewAddress(logCluster, 'ailog')) : { disabled: true })] } }),
      item('acc-tools', 'wake.home.tools', 'puzzle', { submenu: { items: [item('at-manage', 'wake.tools.manage', 'puzzle', go(addr.settings('tools'))), ...toolItems(cluster, tools, st.settings)] } }),
      item('acc-perm', 'wake.account.permissions', 'lock', go(addr.settings('permissions'))),
      item('acc-settings', 'wake.account.settings', 'settings', { shortcut: ['⌘', ','], action: 'kit.settings.open' }),
      { type: 'separator' },
      item('acc-new', 'tab.new', 'plus-medium', { shortcut: ['⌘', 'T'], action: 'kit.tab.new' }),
    ] }; },
  /* 클러스터 "…": kubeconfig는 고치지 않음 — 같은 서버의 다른 context로 바꾸기, 파일 다시 고르기, 파일 열기(고치면 파일 감시가 다시 확인) */
  'wake.cluster.more': (id, st) => { const c = (st.settings['wake.clusters.list'] || []).find(x => x.id === id), same = (live.st.kube?.contexts || []).filter(x => c && x.server === c.server && x.id !== id);
    return { align: 'end', items: [item('cm-open', 'wake.ctx.openCluster', 'k8s-cluster', { action: 'kit.navigate', arg: { address: addr.cluster(id), newTab: true } }), item('cm-recheck', 'wake.chk.again', 'arrow-rotate-clockwise', { action: 'wake.cluster.recheck', arg: { id } }), { type: 'separator' },
      item('cm-switch', 'wake.cm.switch', 'people-circle', same.length ? { submenu: { items: same.map(x => item('sw-' + x.id, raw(x.id), 'k8s-cluster', { action: 'wake.cluster.switchContext', arg: { from: id, to: x.id } })) } } : { disabled: true }),
      item('cm-repick', 'wake.cm.repick', 'file-code', { action: 'wake.kube.pick' }), item('cm-file', 'wake.cm.openFile', 'arrow-up-right', { action: 'wake.kube.openFile', arg: { path: c?.file || '' }, disabled: !c?.file }),
      { type: 'separator' }, item('cm-off', 'wake.ctx.disconnect', 'unplug', { danger: true, action: 'wake.cluster.disconnect', arg: id })] }; },
  /* 설정 행 끝 더 보기(…): 행이 넘긴 동작들을 그대로 메뉴 항목으로(행 끝은 상태 하나 + 이 메뉴) */
  'wake.row.more': acts => ({ align: 'end', items: (acts || []).map(a => item(a.id, a.label, a.icon, { action: a.action, arg: a.arg, ...(a.danger ? { danger: true } : {}) })) }),
  /* 클러스터 연결 방법: 첫 실행 "새로 연결"과 같은 정의(CLUSTER_ADD). 클라우드 명령은 고를 곳(CLOUDS)이 하위 메뉴 */
  'wake.cluster.connect': () => ({ width: 300, items: CLUSTER_ADD.map(m => item('cc-' + m.id, m.label, m.icon, m.id === 'add-cloud'
    ? { submenu: { items: CLOUDS.map(c => item('cc-cloud-' + c.id, c.label, c.icon, { action: 'wake.conn.form', arg: 'add-cloud-' + c.id })) } }
    : { action: 'wake.conn.form', arg: m.id === 'add-file' ? 'add-paste' : m.id })) }),
  'wake.archive.more': id => ({ align: 'end', items: [item('ar-open', 'wake.ar.reopen', 'arrow-up-right', { action: 'wake.chat.reopen', arg: id }), item('ar-md', 'wake.ar.export', 'download', { action: 'wake.chat.export', arg: id }), { type: 'separator' }, item('ar-del', 'wake.ctx.delete', 'trash', { danger: true, action: 'kit.dialog.open', arg: { id: 'wake.chat.deleteDlg', arg: id } })] }),
};

/* 우클릭 메뉴(웹: kit 메뉴, 데스크톱: 운영체제 메뉴) */
const CONTEXT = {
  /* 클러스터 "…" 메뉴와 같은 동작은 같은 아이콘·위험 색 */
  'wake.cluster': id => [item('c-open', 'wake.ctx.openCluster', 'k8s-cluster', { action: 'kit.navigate', arg: { address: addr.cluster(id), newTab: true } }),
    ...CLUSTER_SCREENS.map(([v, label, ic]) => item('c-' + v, label, ic, { action: 'kit.navigate', arg: { address: viewAddress(id, v), newTab: true } })), { type: 'separator' }, item('c-copy', 'wake.ctx.copyContext', 'copy', { action: 'wake.cluster.copyContext', arg: id }), { type: 'separator' }, item('c-off', 'wake.ctx.disconnect', 'unplug', { danger: true, action: 'wake.cluster.disconnect', arg: id })],
  'wake.pinned': (id, st) => [item('p-delete', 'wake.ctx.delete', null, { action: 'wake.unpin', arg: id }), { type: 'separator' }, item('p-open', 'wake.ctx.openNewTab', null, { action: 'kit.navigate', arg: { address: pinnedOf(st).flatMap(x => x.items || [x]).find(x => x.id === id)?.address, newTab: true } })],
  'wake.pinned.folder': id => [item('f-rename', 'wake.ctx.rename', null, { action: 'kit.dialog.open', arg: { id: 'wake.folder.rename', arg: id } }), item('f-delete', 'wake.ctx.delete', null, { action: 'kit.dialog.open', arg: { id: 'wake.folder.delete', arg: id } })],
  'wake.conversation': id => [...(id ? [item('cv-id', 'wake.chat.copyId', 'copy', { action: 'wake.copy', arg: { value: String(id) } }), { type: 'separator' }] : []), item('cv-archive', 'wake.ctx.archive', null, { action: 'wake.chat.archive', arg: id }), item('cv-delete', 'wake.ctx.deleteChat', null, { action: 'kit.dialog.open', arg: { id: 'wake.chat.deleteDlg', arg: id } }), { type: 'separator' }, item('cv-open', 'wake.ctx.openNewTab', null, { action: 'kit.navigate', arg: { address: addr.chat(id), newTab: true } })],
  'wake.section.conversations': (_a, st) => [item('sc-archive', 'wake.ctx.archiveAll', null, { action: 'wake.chats.archiveAll' })],
};

/* 대화 자리 바꾸기(보관 시각은 보관한 순간) */
async function chatPlace(api, ids, op) {
  try {
    for (const id of ids) {
      if (!await service('ai.chat', { op, id })) throw new Error('conversation missing');
      const state = { ...(api.settings.get('wake.chats.state') || {}) }, at = { ...(api.settings.get('wake.chats.archivedAt') || {}) };
      delete state[id]; delete at[id];
      await refreshConversations();
      if (conversationRead.state === 'failed') throw new Error('conversation read failed');
      api.setSetting('wake.chats.archivedAt', at); api.setSetting('wake.chats.state', state);
      api.refresh();
    }
    return true;
  } catch {
    api.toast({ title: 'wake.home.conversationsFailed', tone: 'error' });
    return false;
  }
}

/* ---------- 첫 실행·연결 도우미 ---------- */
const ctxOf = id => live.st.kube?.contexts.find(c => c.id === id) || { id, ctx: id };
/* AI 공급자 연결: 구독(공식 CLI), API 키. 모두 같은 연결 모델(connect-flow.js의 ai-cli·ai-key)과 연결 행. 구독 CLI는 내장 AI가 그 CLI로 대화함(desktop/ai-cli.cjs) */
const AI = [
  { id: 'codex-cli', method: 'ai-cli', group: 'sub', icon: 'brand-openai', name: 'ChatGPT · Codex', provider: 'openai' },
  { id: 'gemini-cli', method: 'ai-cli', group: 'sub', icon: 'brand-googlegemini', name: 'Gemini', provider: 'google' },
  { id: 'claude-cli', method: 'ai-cli', group: 'sub', icon: 'brand-claude', name: 'Claude', provider: 'anthropic' },
  { id: 'anthropic', method: 'ai-key', group: 'api', icon: 'brand-claude', name: 'Claude API', company: 'Anthropic', provider: 'anthropic' },
  { id: 'openai', method: 'ai-key', group: 'api', icon: 'brand-openai', name: 'OpenAI API', company: 'OpenAI', provider: 'openai' },
  { id: 'google', method: 'ai-key', group: 'api', icon: 'brand-googlegemini', name: 'Gemini API', company: 'Google', provider: 'google' },
];
/* 알림 연결: Slack(Incoming Webhook 주소), PagerDuty(읽기 API 키). 같은 연결 모델(notify) */
const NOTIFY = [{ id: 'slack', icon: 'brand-slack', name: 'Slack', field: 'url' }, { id: 'pagerduty', icon: 'brand-pagerduty', name: 'PagerDuty', field: 'key' }];
const aiKey = id => 'ai-' + id, notifyKey = id => 'notify-' + id;
/* 연결 키 -> 방법과 대상(대상은 메인 프로세스가 아는 이름) */
const CONNS = { ...Object.fromEntries(AI.map(a => [aiKey(a.id), { method: a.method, target: a.id }])), ...Object.fromEntries(NOTIFY.map(n => [notifyKey(n.id), { method: 'notify', target: n.id }])),
  'git-github': { method: 'github', target: 'token' } }; /* GitHub 토큰: 메인 프로세스의 secret github:token(바꾸기 제안의 Draft PR) */
/* 비밀 값을 받는 대화상자의 칸(AI API 키, Slack 웹후크 주소, PagerDuty API 키) */
/* 칸 안의 예시와 값을 구하는 곳(한 줄), 비밀 값은 칸 이름 옆 자물쇠(키체인에 저장) */
const KEY_EXAMPLE = { 'ai-anthropic': 'sk-ant-api03-…', 'ai-openai': 'sk-proj-…', 'ai-google': 'AIzaSy…', 'notify-pagerduty': 'u+abcdEFGH12…', 'git-github': 'github_pat_11A…' };
const SECRET_FIELD = key => /^notify-slack$/.test(key) ? { key: 'url', label: 'wake.notify.slackUrl', lock: 'wake.fr.add.lock', hint: 'wake.notify.h.slack', placeholder: raw('https://hooks.slack.com/services/T000/B000/XXXX'), type: 'password', required: true, validate: v => /^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(v) ? null : 'wake.notify.badUrl' }
  : { key: 'key', label: /^notify-/.test(key) ? 'wake.notify.apiKey' : key === 'git-github' ? 'wake.git.tokenField' : 'wake.fr.ai.keyField', lock: 'wake.fr.add.lock', hint: `wake.h.${key}`, placeholder: raw(KEY_EXAMPLE[key] || ''), type: 'password', required: true };
/* 지금 연결 상태(흐름의 지금 모습 + 연결 기록): 셸은 흐름에서 바로, 탭 문서는 설정 wake.conn.live에서 */
const connState = settings => ({ ...settings, 'wake.conn.live': { ...(settings['wake.conn.live'] || {}), ...Object.fromEntries(flows.keys().map(k => [k, flows.view(k)])) } });
/* 연결한 AI(연결한 순서): 처음 연결한 것이 기본 */
const aiConnected = (settings = flowApi?.settings.all?.() || {}) => { const st = connState(settings), recs = st['wake.connections'] || {};
  return AI.filter(a => connView(st, aiKey(a.id)).connected).sort((a, b) => String(recs[aiKey(a.id)]?.at || '').localeCompare(String(recs[aiKey(a.id)]?.at || ''))).map(a => a.id); };
const aiNames = () => aiConnected().map(id => AI.find(a => a.id === id)?.name || id);
/* 첫 실행 머리 아래 한 줄(R4-07): 수가 아니라 연결된 것의 이름(둘 이상이면 "첫 이름 외 N개"), 아직 없으면 무엇이 없는지 말로 */
const namedList = names => (names.length > 1 ? { key: 'wake.fr.named.more', vars: { name: raw(names[0]), more: names.length - 1 } } : raw(names[0]));
export const firstRunLine = {
  clusters: (found, connected) => (connected.length ? { key: 'wake.fr.connected', vars: { what: namedList(connected) } } : found ? { key: 'wake.fr.clusters.found', vars: { count: found } } : 'wake.fr.clusters.none'),
  ai: connected => (connected.length ? { key: 'wake.fr.connected', vars: { what: namedList(connected) } } : null),
  setup: (clusters, ai) => (clusters.length && ai.length ? { key: 'wake.fr.summary', vars: { clusters: namedList(clusters), ai: namedList(ai) } }
    : clusters.length ? { key: 'wake.fr.summary.cluster', vars: { clusters: namedList(clusters) } }
    : ai.length ? { key: 'wake.fr.summary.ai', vars: { ai: namedList(ai) } } : 'wake.fr.summary.none'),
};
/* AI 한 줄의 연결 모습: 구독은 누르면 바로 확인, API 키는 키 입력(첫 실행과 설정 모두 줄 안의 칸) */
const aiView = (st, a, where) => connView(st, aiKey(a.id), {
  connect: a.method === 'ai-key' ? (where === 'firstRun' ? { label: 'wake.fr.ai.connect', action: 'kit.firstRun.toggle', arg: { row: aiKey(a.id) } } : { label: 'wake.fr.ai.connect', action: 'wake.conn.form', arg: aiKey(a.id) })
    : { label: 'wake.fr.ai.connect', action: 'wake.conn.start', arg: { key: aiKey(a.id) } },
  idleText: a.method === 'ai-cli' ? 'wake.fr.ai.officialCli' : raw(a.company),
  connectedText: { key: 'wake.conn.withCred', vars: { cred: { key: 'wake.conn.cred.personal' } } } });
/* 연결 모습 -> kit 설정 페이지의 연결 행 값(머리 동작은 상태 표가 정한 것만) */
/* 값 줄(연결 행 안, 대화상자 없음): 연결 키마다 칸과 제출 동작, 펼친 동안 줄 설명 자리의 안내. 설정 wake.conn.form의 줄 하나만 열림 */
function VALUE_FORM(key) {
  /* 클러스터 연결 방법의 값(첫 실행 "새로 연결"과 같은 칸 이름·예시): 주 버튼은 첫 실행과 같은 "연결" */
  if (key === 'add-paste') return { hint: 'wake.fr.add.h.file', fields: [{ key: 'text', label: raw('kubeconfig'), placeholder: raw('apiVersion: v1'), multiline: true }], submit: { label: 'wake.flow.connect', action: 'wake.kube.paste' } };
  if (key === 'add-token') return { hint: 'wake.fr.add.h.token', fields: [{ key: 'server', label: 'wake.fr.add.serverField', placeholder: raw('https://203.0.113.10:6443') }, { key: 'token', label: 'wake.fr.add.tokenField', placeholder: raw('eyJhbGciOiJSUzI1NiIs…'), type: 'password' }], submit: { label: 'wake.flow.connect', action: 'wake.kube.token' } };
  const cloud = /^add-cloud-(\w+)$/.exec(key)?.[1];
  if (cloud && METHODS[cloud]) return { hint: `wake.fr.add.h.${cloud}.name`, fields: METHODS[cloud].fields.map(k => ({ key: k, label: 'wake.fr.add.f.' + k, placeholder: raw(EXAMPLE[cloud]?.[k] || '') })), submit: { label: 'wake.flow.connect', action: 'wake.kube.cloud', arg: { cloud } } };
  if (/^(ai|notify|git)-/.test(key)) { const f = SECRET_FIELD(key); return { hint: f.hint, fields: [{ key: f.key, label: f.label, placeholder: f.placeholder, type: 'password' }], submit: { label: 'wake.flow.connect', action: 'wake.conn.start', arg: { key } } }; }
  const label = key.endsWith('-grafana') ? 'wake.s.tool.token.grafana' : key.endsWith('-argocd') ? 'wake.s.tool.token.argocd' : 'wake.s.tool.token';
  return { fields: [{ key: 'token', label, placeholder: label, type: 'password' }], submit: { label: 'wake.flow.connect', action: 'wake.tool.setToken', arg: key } };
}
/** 설정 행(연결 행 값)에 열린 값 줄을 붙임: 펼치고, 설명 자리는 값을 구하는 곳 */
/* 열린 동안 행 끝은 "취소" 하나(값 줄의 주 버튼과 같은 이름의 버튼이 둘 생기지 않음). 클러스터 연결 행은 자기 보조 버튼(파일 선택)을 둠 */
export function withForm(settings, key, row) { if (settings['wake.conn.form'] !== key || row.connection?.busy) return row; const f = VALUE_FORM(key);
  return { ...row, description: f.hint ?? row.description, connection: { ...row.connection, open: true, state: undefined, action: { label: 'wake.flow.a.cancel', variant: 'ghost', action: 'wake.conn.form', arg: key },
    extra: /^add-/.test(key) ? row.connection?.extra : [], form: { fields: f.fields, submit: f.submit } } }; }
const connRowOf = v => ({ kind: v.kind, busy: v.busy, attention: v.attention, action: v.action, extra: v.extra.map(b => ({ type: 'button', size: 'sm', variant: 'secondary', ...b })), flow: v.flow, state: v.word ? text(v.word) : undefined });
/* 분류(기본, 추천)는 배지 바탕 없이 설명 줄 끝의 흐린 글자 */
const withNote = (desc, note) => (note ? () => raw([text(desc), text(note)].filter(Boolean).join(' · ')) : desc);
/* 첫 실행 AI 연결: 구독 위, API 키와 내 컴퓨터 아래. 줄마다 kit 연결 행(상태, 동작, 단계), API 키는 펼친 줄 안에 키 칸 */
function aiGroups(api) {
  const st = connState(api.settings.all()), first = aiConnected(st)[0], open = api.firstRun.opened?.() || [];
  /* 설정 › AI 공급자와 같은 연결 행 값(connRowOf): 상태 글은 상태 표 사전, 내부 상태 값은 화면에 나오지 않음 */
  const row = a => { const v = aiView(st, a, 'firstRun'), key = aiKey(a.id), form = a.method === 'ai-key' && !v.busy && !v.connected && open.includes(key);
    return { id: key, icon: a.icon, label: raw(a.name),
      ...(a.method === 'ai-key' ? { fields: [SECRET_FIELD(key)], submit: { label: 'wake.fr.ai.connect', action: 'wake.conn.start', arg: { key } } } : {}),
      /* 줄을 누르면 키 칸을 열고 닫음(연결 전) */
      conn: { ...connRowOf(v), description: withNote(v.description, first === a.id ? 'wake.fr.ai.default' : null), open: form, form, action: form ? null : v.action,
        ...(a.method === 'ai-key' && !v.busy && !v.connected && !v.flow ? { rowAction: 'kit.firstRun.toggle', rowArg: { row: key } } : {}) } }; };
  return ['sub', 'api'].map(g => ({ label: 'wake.fr.ai.' + g, rows: AI.filter(a => a.group === g).map(row) }));
}
/* 클라우드 명령으로 연결: 고른 곳과 이름·지역으로 공식 CLI 명령을 완성. 연결 버튼을 누르면 Wake가 아래 터미널에서 실행(connect-flow.js) */
const GCP_CONSOLE_INTENT_LIMIT = 16;
const GCP_CONSOLE_INTENT_MS = 30000;
const gcpConsoleIntents = new Map();
const gcpConsoleInflight = new Map();
const gcpConsoleBrand = () => CLOUDS.find(cloud => cloud.id === 'gcp');
function gcpConsoleTarget(api) {
  try {
    const tab = api?.activeTab?.(), entry = tab?.entries?.[tab.index], address = entry?.address;
    if (!tab || tab.unloaded || typeof address !== 'string') return null;
    const encoded = clusterOfAddress(address);
    if (!encoded) return null;
    const contextId = decodeURIComponent(encoded), settings = api.settings.all();
    const candidates = (settings['wake.clusters.list'] || []).filter(cluster => cluster.id === contextId);
    if (candidates.length !== 1 || settings['wake.clusters.connected'] && !settings['wake.clusters.connected'].includes(contextId)) return null;
    const cluster = candidates[0], platform = cluster.infrastructure?.provider;
    if (cluster.provider !== 'gke' && !['gcp', 'gke'].includes(platform)) return null;
    const metadata = cluster.presentation;
    const bound = metadata?.contextId === contextId && metadata.server === (cluster.server || '')
      && metadata.source === 'observability-connections.v1' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(metadata.projectId || '');
    return { api, tab, entry, tabId: tab.id, address, index: tab.index, entriesLength: tab.entries.length, contextId,
      projectId: bound ? metadata.projectId : null,
      metadataKey: JSON.stringify([cluster.provider, platform, cluster.server, metadata?.contextId, metadata?.server, metadata?.projectId, metadata?.location, metadata?.clusterName, metadata?.source]) };
  } catch { return null; }
}
function gcpConsoleCurrent(intent, api) {
  if (api !== intent.api || Date.now() < intent.issuedAt || Date.now() - intent.issuedAt > GCP_CONSOLE_INTENT_MS) return false;
  const target = gcpConsoleTarget(api);
  return !!target && ['tab', 'entry', 'tabId', 'address', 'index', 'entriesLength', 'contextId', 'metadataKey'].every(key => target[key] === intent[key]);
}
function cleanGcpConsoleIntents() {
  for (const [contextId, intent] of gcpConsoleIntents) if (!gcpConsoleCurrent(intent, intent.api)) gcpConsoleIntents.delete(contextId);
}
function gcpConsoleMenuItem(params, api) {
  cleanGcpConsoleIntents();
  const target = gcpConsoleTarget(api);
  if (!target || target.contextId !== params?.cluster || typeof globalThis.crypto?.randomUUID !== 'function') return null;
  const intent = { ...target, token: crypto.randomUUID(), issuedAt: Date.now() };
  gcpConsoleIntents.delete(target.contextId);gcpConsoleIntents.set(target.contextId, intent);
  while (gcpConsoleIntents.size > GCP_CONSOLE_INTENT_LIMIT) gcpConsoleIntents.delete(gcpConsoleIntents.keys().next().value);
  const brand = gcpConsoleBrand();
  return item('gcp-console', brand.label, brand.icon, { action: 'wake.gcp.console', arg: { intent: intent.token },
    disabled: gcpConsoleInflight.has(target.contextId) || gcpConsoleInflight.size >= GCP_CONSOLE_INTENT_LIMIT });
}
function consumeGcpConsoleIntent(action, api) {
  cleanGcpConsoleIntents();
  const arg = action?.arg;
  if (!arg || ![Object.prototype, null].includes(Object.getPrototypeOf(arg))) return null;
  const keys = Reflect.ownKeys(arg), field = Object.getOwnPropertyDescriptor(arg, 'intent');
  if (keys.length !== 1 || keys[0] !== 'intent' || !field || !Object.hasOwn(field, 'value') || typeof field.value !== 'string') return null;
  const intent = [...gcpConsoleIntents.values()].find(record => record.token === field.value);
  if (!intent) return null;
  gcpConsoleIntents.delete(intent.contextId);
  return Object.getOwnPropertyDescriptor(action, 'sourceTabId')?.value === intent.tabId && gcpConsoleCurrent(intent, api) ? intent : null;
}
function validGcpConsoleRequest(value, intent) {
  const fields = ['status', 'requested', 'provider', 'connectionId', 'contextId', 'projectId', 'url'];
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key) || !Object.hasOwn(descriptors[key], 'value'))) return false;
  if (value.status !== 'requested' || value.requested !== true || value.provider !== 'gcp-monitoring' || value.contextId !== intent.contextId
    || typeof value.connectionId !== 'string' || !/^[\w.:-]{1,200}$/.test(value.connectionId)
    || typeof value.projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value.projectId)
    || intent.projectId && value.projectId !== intent.projectId || typeof value.url !== 'string') return false;
  return value.url === 'https://console.cloud.google.com/monitoring?project=' + encodeURIComponent(value.projectId);
}
const cloudOf = v => v.cloud || 'aws';
const cloudCmd = v => METHODS[cloudOf(v)].command(Object.fromEntries(METHODS[cloudOf(v)].fields.map(k => [k, (v[k] || '').trim() || `<${k === 'group' ? 'resource-group' : k}>`])));
/* 첫 실행 연결 확인의 아래 버튼: 상태 하나에 버튼 묶음 하나 */
const CLUSTER_FOOT = {
  /* 확인 중에는 나중에 보기 하나(다음은 연결된 것이 생긴 뒤에만, 두 버튼을 섞지 않음) */
  checking: [{ label: 'wake.fr.later', action: 'kit.firstRun.next' }],
  ready: [{ label: 'wake.fr.next', action: 'kit.firstRun.next' }],
  empty: [{ label: 'wake.fr.later', action: 'kit.firstRun.next' }],
};
const clusterFoot = api => api.firstRun.phase('clusters') === 'checking' ? 'checking' : Object.values(api.firstRun.results('clusters')).some(r => r && r.group === 'ok') ? 'ready' : 'empty';
/* 연결 흐름 진행기: 첫 실행과 설정이 같이 씀 */
let flowApi = null;
/* 흐름의 지금 모습을 설정 저장소(wake.conn.live)에 남겨 설정·대시보드 탭 문서가 같은 연결 행·단계를 그림(첫 실행은 셸이 직접 그림) */
let liveTimer = null;
const publish = () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => { if (!flowApi) return; const out = {};
  for (const k of flows.keys()) { const f = flows.get(k); if (f.preflight || (/^add-/.test(k) && f.origin !== 'settings')) continue; const view = flows.view(k); out[k] = { ...view, rawTruncated: !!view.raw && String(f.raw || '').length > view.raw.length, identity: f.identity || null, method: f.method }; }
  Object.assign(out, opening);
  for (const key of toolOutputs.keys()) publishToolOutput(key);
  flowApi.setSetting('wake.conn.live', out); }, 30); };
/* 도구 하나(키: 클러스터-종류)를 메인 프로세스 동작으로: 보내는 것은 키, 클러스터, 도구 위치뿐 */
const toolOp = async (op, f, extra) => service('tool.op', { op, f: { key: f.key, cluster: f.cluster, tool: f.tool }, extra });
const toolApprovals = new Map();
let tokenFormTarget;
function finishToolApproval(key, approved) {
  const respond = toolApprovals.get(key);
  toolApprovals.delete(key);
  respond?.(approved);
}
/* 도구 열기(연결 과정이 아니라 사용): 누르면 바로 탭으로. 여는 동안 그 줄은 짧게 돌고, 닿지 않을 때만 오류와 다시 열기. 키: 클러스터-종류:open */
const opening = {};
const knownOpenings = new Set();
const outputAttempts = new Map();
const toolOutputs = new Map();
function toolOutputAddress(sourceTabId, api, cluster) {
  const tab = api.state?.tabs.tabs.find(tab => tab.id === sourceTabId && !tab.unloaded);
  const address = tab?.entries[tab.index]?.address;
  if (typeof address !== 'string') return null;
  const bound = clusterOfAddress(address);
  try { if (bound) return decodeURIComponent(bound) === cluster ? address : null; } catch { return null; }
  return address.startsWith('wake://settings/') ? address : null;
}
function toolOutputSnapshot(key, cluster, kind, api, allowStored = false) {
  if (!TOOL_KINDS.some(k => k.id === kind)) return null;
  const base = `${cluster}-${kind}`;
  if (key !== base && key !== base + ':open') return null;
  const f = key.endsWith(':open') ? opening[key] : flows.get(key);
  let view;
  if (f) {
    if (f.cause === 'cancelled' || (!key.endsWith(':open') && (f.kind !== 'tool' || f.cluster !== cluster || f.tool?.kind !== kind))) return null;
    view = key.endsWith(':open') ? f : flows.view(key);
  } else if (allowStored) {
    if (knownOpenings.has(key)) return null;
    view = api.settings.get('wake.conn.live')?.[key];
    if (!view || (!key.endsWith(':open') && !['tool-open', 'tool-login', 'tool-token'].includes(view.method))) return null;
  } else return null;
  if (view.running || !['failed', 'timeout', 'needs-perm', 'needs-login', 'needs-input'].includes(view.state) || typeof view.raw !== 'string' || !view.raw.trim()) return null;
  return { ref: f || null, rawText: f ? view.raw : view.raw.slice(-4000), state: view.state, method: view.method, stored: !f,
    truncated: f ? key.endsWith(':open') ? !!f.rawTruncated : String(f.raw || '').length > view.raw.length : !!view.rawTruncated || view.raw.length > 4000 };
}
function beginToolOutput(a, api, key, cluster, kind) {
  if (!a.outputOwner || typeof a.sourceTabId !== 'string') return null;
  const address = toolOutputAddress(a.sourceTabId, api, cluster); if (!address) return null;
  const tuple = JSON.stringify([a.sourceTabId, cluster, kind, key]);
  const attempt = (outputAttempts.get(tuple) || 0) + 1;
  if (!Number.isSafeInteger(attempt)) return null;
  outputAttempts.set(tuple, attempt);
  const old = toolOutputs.get(key);
  if (old?.ticket) old.api.terminal.closeOutput(old.ticket);
  const ticket = api.terminal.beginOutput({ owner: a.outputOwner, scope: cluster, tool: kind, flow: key, attempt });
  const record = { api, ticket, attempt, cluster, kind, key, sourceTabId: a.sourceTabId, address, ref: null, reported: false };
  toolOutputs.set(key, record);
  return record;
}
/* 진단 출력(터미널, 영어 사전): 도구가 돌려준 코드와 단계를 사람이 읽는 줄로 */
const DIAG_STAGE = { operation: 'operation', reach: 'reach', login: 'login', session: 'login', input: 'input', issue: 'issue', authn: 'verify', verify: 'verify', read: 'read', home: 'home' };
function diagnosticText(value) {
  let result;
  try { result = JSON.parse(value); } catch { return value; }
  if (!/^[a-z0-9_]{1,64}$/.test(result?.code || '')) return value;
  const stage = DIAG_STAGE[result.stage] && en['wake.tool.diag.stage.' + DIAG_STAGE[result.stage]];
  const message = en['wake.tool.diag.code.' + result.code] || en['wake.tool.diag.code.other'];
  return [message, stage && en['wake.tool.diag.line.stage'].replace('{stage}', () => stage), en['wake.tool.diag.line.code'].replace('{code}', () => result.code)].filter(Boolean).join('\n');
}
function showToolOutput(record, snapshot) {
  if (!record?.ticket || !snapshot || toolOutputs.get(record.key) !== record || toolOutputAddress(record.sourceTabId, record.api, record.cluster) !== record.address) return { ok: false, shown: false, reason: 'no-current-output' };
  const current = toolOutputSnapshot(record.key, record.cluster, record.kind, record.api, snapshot.stored);
  if (!current || current.stored !== snapshot.stored || current.ref !== snapshot.ref || current.rawText !== snapshot.rawText || current.state !== snapshot.state) return { ok: false, shown: false, reason: 'no-current-output' };
  record.reported = true;
  const name = toolName(record.kind);
  return record.api.terminal.showOutput(record.ticket, {
    title: en['wake.tool.diagnosticsTitle'].replace('{tool}', () => typeof name === 'string' ? name : text(name)).replace('{cluster}', () => record.cluster),
    rawText: diagnosticText(snapshot.rawText), source: 'connection-check', sourceLabel: en[snapshot.stored ? 'wake.tool.diagnosticsStoredSource' : 'wake.tool.diagnosticsSource'],
    readOnlyLabel: en['wake.tool.diagnosticsReadOnly'], truncated: snapshot.truncated,
    ...(snapshot.truncated ? { limitLabel: en['wake.tool.diagnosticsLimit'] } : {}),
  });
}
function stopToolOutput(key) {
  const record = toolOutputs.get(key);
  toolOutputs.delete(key);
  if (record?.ticket) record.api.terminal.closeOutput(record.ticket);
}
function publishToolOutput(key) {
  const record = toolOutputs.get(key);
  if (!record || record.reported || !record.ref) return;
  const current = key.endsWith(':open') ? opening[key] : flows.get(key);
  if (current !== record.ref) return;
  if (!key.endsWith(':open') && flows.view(key).state === 'connected') { record.reported = true; if (record.ticket) record.api.terminal.closeOutput(record.ticket); return; }
  const snapshot = toolOutputSnapshot(key, record.cluster, record.kind, record.api);
  if (snapshot?.ref === record.ref) { record.reported = true; showToolOutput(record, snapshot); }
}
function startToolOutput(a, api, key, cluster, tool, run) {
  if (flows.get(key)?.running) return;
  const record = beginToolOutput(a, api, key, cluster, tool.kind);
  const result = run();
  if (record) record.ref = flows.get(key);
  return result;
}
/* 도구 탭의 이름과 아이콘: 도구 종류 표(tool-kinds.js) */
/* 도구 탭: 그 클러스터·그 종류의 도구(영구 세션은 key마다). context는 AI에게 묻기의 참조 칩과 대화 handoff에 그대로 가는 대상(도구 이름 · 클러스터 이름, 전역 AI 범위와 따로) */
const toolTab = (key, kind, cluster) => { const k = toolKind(kind, 'globe'); return { id: key, name: k.name, icon: k.icon, partition: key, ...(cluster ? { context: { title: k.name, sub: clusterLabel(cluster), ref: { cluster, kind } } } : {}) }; };
const toolName = id => toolKind(id).name;
const flows = createFlows({
  /* 서비스 호스트가 없는 실행(브라우저)에는 이 컴퓨터가 없음: 연결 단계는 거절된다 */
  service: (n, a) => live.desktop ? service(n, a) : Promise.reject(new Error('no service host')), probe: id => live.probe(id), terminal: () => flowApi.terminal,
  redraw: () => { if (flowApi?.firstRun.active()) flowApi.firstRun.render(); else flowApi?.refresh(); publish(); },
  probeText: r => cardOf(ctxOf(''), r).desc, probeKind: r => cardOf(ctxOf(''), r).kind,
  /* 연결 확인이 권한에서 막힘: 실제로 막힌 동사·리소스·namespace(연결 확인은 그 namespace의 Pod 목록 읽기) */
  needOf: r => parseForbidden(r?.error),
  /* 명령을 실행하는 터미널의 제목: 실제 대상(context, 클러스터 이름)과 작업 폴더 */
  termTitle: f => raw(`${f.target || f.values?.name || clusterOfFlow(f)} · ~/`),
  probeNeed: (_id, r) => parseForbidden(r.error, { user: r.username, resource: 'pods', namespace: r.namespace || 'default' }),
  /* 필요한 권한 시트: 내 자격으로 그 권한을 직접 줄 수 있는지 먼저 묻고(SelfSubjectAccessReview) 시트를 엶 */
  permSheet: f => openPermSheet(flowApi, { key: f.key, cluster: clusterOfFlow(f), need: f.need, ...(METHODS[f.method]?.agent && f.install ? { install: f.install } : {}) }),
  /* 권한이 생겼는지(주기마다): 클러스터는 연결 확인, 에이전트는 그 namespace에 DaemonSet을 만들 수 있는지, 그 밖은 저장한 연결 확인 */
  permGranted: f => f.method === 'recheck' ? live.probe(f.key).then(r => r.state === 'ok')
    : METHODS[f.method]?.agent ? service('kube.can', { id: f.cluster, verb: 'create', group: 'apps', resource: 'daemonsets', namespace: 'wake-system' }).then(r => !!r?.allowed) : METHODS[f.method]?.op ? service('conn.verify', { method: f.method, target: f.target || f.key }).then(r => !!r?.ok) : toolOp('verify', f).then(r => !!r?.ok),
  audit: (command, exit) => flowApi.setSetting('wake.audit.terminal', [{ session: 'wake-run', command: maskSecrets(command), exit, user: '', at: new Date().toISOString() }, ...(flowApi.settings.get('wake.audit.terminal') || [])].slice(0, 500)),
  rescan: () => rescan(flowApi),
  /* 명령은 Wake가 읽는 kubeconfig에만 쓰게 KUBECONFIG를 고정(사용자 시작 파일보다 뒤에 설정) */
  runEnv: () => (live.st.kube?.paths?.length ? { KUBECONFIG: live.st.kube.paths.join(':') } : {}),
  recheck: ids => { ids.forEach(id => flows.recheck(id)); if (flowApi.firstRun.active()) flowApi.firstRun.recheck(ids); else live.recheck(flowApi, ids, flows); },
  add: (method, v) => v.picked ? v.picked : method === 'token' ? service('kube.addToken', { server: v.server, token: v.token }) : service('kube.addPaste', { text: v.text }),
  done: (key, target) => { if (flowApi.firstRun.active()) return flowApi.firstRun.fold(key); if (/^add-/.test(key)) { if (target) addCluster(flowApi, target); setTimeout(() => flows.clear(key), LIMITS.closeAfterMs); } },
  /* 비밀 값 다시 입력(도구 토큰, AI API 키, 알림, kubeconfig): 그 연결 행 안의 값 줄을 엶 */
  input: f => flowApi.setSetting('wake.conn.form', f.key),
  copy: text => { globalThis.navigator?.clipboard?.writeText(text).catch(() => {}); flowApi.toast({ title: 'message.copied', tone: 'ok' }); },
  toast: p => flowApi.toast(p),
  reveal: key => flowApi.firstRun.reveal(key),
  focus: (key, field) => globalThis.document?.querySelector(`[data-fr-row="${key}"] [data-field="${field || 'name'}"]`)?.focus(),
  /* 도구 연결: 메인 프로세스 동작, 로그인 탭(그 도구의 영구 세션), 발급 결정, 연결 기록 */
  tool: (op, f, extra) => toolOp(op, f, extra),
  openLogin: async f => { f.loginTab = flowApi.openTool(toolTab(f.key, f.tool.kind, f.cluster), f.url); },
  loginOpen: f => !!f.loginTab && flowApi.hasTab(f.loginTab),
  closeLogin: (f, ok) => { if (ok && f.loginTab && flowApi.hasTab(f.loginTab)) flowApi.closeTab(f.loginTab); },
  approve: f => new Promise(resolve => { toolApprovals.set(f.key, resolve); }),
  cancelApproval: key => finishToolApproval(key, false),
  toolApprovalResult: (f, ok) => flowApi.toast({ title: { key: ok ? 'wake.tool.connectedToast' : 'wake.tool.failedToast', vars: { tool: toolName(f.tool.kind) } }, tone: ok ? 'ok' : 'error' }),
  record: (key, rec) => { const all = { ...(flowApi.settings.get('wake.connections') || {}) }; if (rec) all[key] = { ...rec, where: { cluster: flows.get(key)?.cluster, tool: flows.get(key)?.tool } }; else delete all[key]; flowApi.setSetting('wake.connections', all); },
});
/* 흐름의 클러스터(필요한 권한의 --context): 도구는 그 클러스터, GitOps는 대상의 앞부분, 다시 확인은 그 context */
const clusterOfFlow = f => f.cluster || (f.method === 'gitops' ? String(f.target || '').split('/')[0] : f.key);
/* 필요한 권한 시트 열기: arg { key?, cluster, need } */
async function openPermSheet(api, arg) {
  if (arg.install) { api.dialog('wake.perm.sheet', arg); return; }
  if (!arg.need) return;
  const can = live.desktop ? await service('kube.can', { id: arg.cluster, ...canGrantCheck(arg.need) }).then(r => !!r?.allowed).catch(() => false) : false;
  api.dialog('wake.perm.sheet', { ...arg, can });
}
/* 연결해 둔 것(도구, AI, 알림, GitOps)이 지금도 통하는지: 시작할 때 한 번, 그 뒤로 클러스터 새로 고침 주기마다.
   도구가 내려가면 접속에서, 토큰이 거부되면 인증에서 멈춘 상태로 바뀌고 돌아오면 다시 연결됨. 사람이 진행 중이거나 결정을 기다리는 흐름은 건드리지 않음 */
async function verifyConnections(api) {
  if (!live.desktop) return;
  toolsCheckedAt = Date.now();
  for (const [key, rec] of Object.entries(api.settings.get('wake.connections') || {})) {
    const m = METHODS[rec.method]; if (!m || (!m.op && !(rec.kind === 'tool' && rec.where?.tool)) || flows.get(key)?.running || opening[key + ':open']?.state === 'running') continue;
    const r = m.op ? await service('conn.verify', { method: rec.method, target: rec.target }).catch(() => ({ cause: 'unknown' })) : await toolOp('verify', { key, ...rec.where }, { restore: true }).catch(() => ({}));
    if (r?.state === 'busy') continue;
    if (r?.ok && r.discovery) {
      const records = api.settings.get('wake.connections') || {};
      if (records[key] === rec) api.setSetting('wake.connections', { ...records, [key]: { ...rec, where: { ...rec.where, tool: r.discovery } } });
    }
    const sig = r?.ok ? 'ok' : r?.cause || r?.state || 'x', cur = flows.get(key);
    if (cur?.running || (cur && cur.sig === sig && !cur.preflight)) continue;
    flows.restore(key, rec, r); if (flows.get(key)) flows.get(key).sig = sig;
  }
}
let toolTimer = null, toolsWired = false, toolsMissed = false, toolsCheckedAt = 0;
function restoreTools(api) {
  api.setSetting('wake.conn.live', {});
  verifyConnections(api);
  /* 연결 상태 확인과 같은 박자(가장 짧아도 2분), 숨은 창에서는 쉬고 다시 보일 때·돌아올 때·다시 연결될 때 한 번 */
  clearInterval(toolTimer); toolTimer = setInterval(() => { if (globalThis.document?.hidden) toolsMissed = true; else verifyConnections(api); }, checkEverySeconds(api.settings.get('wake.cluster.refresh')) * 1000);
  if (!toolsWired) {
    toolsWired = true;
    const again = () => { if (Date.now() - toolsCheckedAt > 60_000 || toolsMissed) { toolsMissed = false; verifyConnections(api); } };
    globalThis.window?.addEventListener?.('online', () => verifyConnections(api));
    globalThis.window?.addEventListener?.('focus', again);
    globalThis.document?.addEventListener?.('visibilitychange', () => { if (!globalThis.document.hidden && toolsMissed) again(); });
  }
}
/* 로그인해서 연결하는 도구(그 밖의 도구는 인증 없이 접속만 확인) */
const TOOL_LOGIN = new Set(['grafana', 'argocd']);
/* 다시 확인: 그 줄이 펼쳐져 확인 단계가 차례로 채워짐(첫 실행은 셸의 확인 목록, 그 밖은 설정 › 클러스터의 줄) */
function recheckIds(api, ids) { flowApi = api; ids.forEach(id => flows.recheck(id)); if (api.firstRun.active()) api.firstRun.recheck(ids); else live.recheck(api, ids, flows); }
/* 입력 칸: 위에 이름, 칸 안에 실제 예시, 아래에 값을 어디서 구하는지 한 줄. 검사는 연결 방법 표의 모양 검사(kit 첫 실행이 제출 때 부름) */
const EXAMPLE = { aws: { region: 'ap-northeast-2' }, gcp: { region: 'asia-northeast3', project: 'my-project-123' }, azure: { group: 'rg-platform' } }; /* 클러스터 이름은 지어낸 예시를 두지 않음(찾은 것처럼 보임) */
const fieldOf = (method, k, extra = {}) => ({ key: k, label: 'wake.fr.add.f.' + k, placeholder: raw(EXAMPLE[method]?.[k] || ''), hint: `wake.fr.add.h.${method}.${k}`, validate: (_x, v) => invalidOf(method, v)[k], ...extra });
/* AWS에 로그인돼 있으면 지역과 그 지역의 클러스터를 고르는 칸으로(aws eks list-clusters, 읽기만). 목록은 지역마다 한 번 읽어 둠 */
const awsLists = {};
/* 지역 목록은 로그인한 계정에서 한 번 읽음(aws ec2 describe-regions). 못 읽으면 지역은 입력 칸 */
let awsRegions = null;
const awsRegionList = api => { if (!live.desktop) return []; if (awsRegions) return awsRegions.list;
  awsRegions = { list: null }; service('cli.regions', { method: 'aws' }).then(r => { awsRegions = { list: r?.list || [] }; api.firstRun.render(); }).catch(() => { awsRegions = { list: [] }; }); return null; };
const awsClusters = (api, region) => { if (!live.desktop || !region || awsLists[region]) return awsLists[region]?.list; awsLists[region] = { list: null };
  service('cli.clusters', { method: 'aws', region }).then(r => { awsLists[region] = { list: r?.list || [] }; api.firstRun.render(); }).catch(() => { awsLists[region] = { list: [] }; }); return null; };
const cloudFields = (api, v) => { const c = cloudOf(v), f = flows.get('add-cloud'), signedIn = c === 'aws' && f?.method === 'aws' && f.state.login === 'done';
  if (!signedIn) return METHODS[c].fields.map(k => fieldOf(c, k));
  /* 리전을 먼저 고르면 그 리전의 클러스터를 읽어(aws eks list-clusters) 이름을 고르게 함 */
  const list = v.region ? awsClusters(api, v.region) : undefined, regions = awsRegionList(api);
  return [fieldOf(c, 'region', regions?.length ? { choices: regions.map(r => opt(r, raw(r))), placeholder: 'wake.fr.add.pickRegion' } : {}),
    fieldOf(c, 'name', !v.region ? {} : list?.length ? { choices: list.map(n => opt(n, raw(n), 'k8s-cluster')), placeholder: 'wake.fr.add.pickCluster' } : list ? { hint: 'wake.fr.add.h.aws.none' } : { hint: 'wake.fr.add.h.aws.loading' })]; };

/* 설정에서 새로 연결한 context(파일, 붙여넣기, 토큰)를 연결한 클러스터 목록과 연결 기록에 더함. 그 줄의 흐름은 접힌 뒤 사라짐 */
async function addCluster(api, id) {
  const c = ctxOf(id), r = await live.probe(id).catch(() => ({ state: 'unknown' })), at = new Date().toISOString();
  api.setSetting('wake.clusters.list', [...(api.settings.get('wake.clusters.list') || []).filter(x => x.id !== id), { id, ctx: c.ctx, provider: c.provider, infrastructure: c.infrastructure, presentation: c.presentation || null, server: c.server, file: c.file, state: r.state, version: r.version || '', namespace: r.namespace || '', user: r.username || '' }]);
  api.setSetting('wake.connections', { ...(api.settings.get('wake.connections') || {}), [id]: connectionRecord({ target: id, method: 'kubeconfig', kind: 'cluster', at }) });
  if (!api.settings.get('wake.ns.default.' + id)) api.setSetting('wake.ns.default.' + id, r.namespace || 'default');
  if (r.state === 'ok' || r.state === 'forbidden') api.setSetting('wake.clusters.connected', [...new Set([...(api.settings.get('wake.clusters.connected') || []), id])]);
}
/* kubeconfig를 다시 읽어 새로 생긴 context만 확인(파일 감시, 연결 흐름) */
async function rescan(api) {
  const before = new Set((live.st.kube?.contexts || []).map(c => c.id));
  await live.readKube();
  const fresh = live.st.kube.contexts.map(c => c.id).filter(id => !before.has(id));
  if (fresh.length && api.firstRun.active()) api.firstRun.recheck(fresh); else api.firstRun.render();
}

function nativeTerminalTarget(target, contextId) {
  const names = ['scope', 'remoteContext', 'remoteKubeconfigPath', 'remoteUser', 'profile', 'region'];
  const session = target?.session;
  const defaultShell = session && typeof session === 'object' && !Array.isArray(session) && Reflect.ownKeys(session).length === 1
    && Object.getOwnPropertyDescriptor(session, 'kind')?.value === 'default-shell';
  return target?.mode === 'remote' && target.contextId === contextId && target.transport === 'aws-ssm'
    && /^\d{12}$/.test(target.accountId) && /^i-[0-9a-f]{17}$/.test(target.instanceId)
    && names.every(name => typeof target[name] === 'string' && target[name].length > 0 && target[name].length <= 1024 && !/[\x00-\x1f\x7f]/.test(target[name]))
    && defaultShell && !['document', 'parameters', 'params'].some(name => Object.hasOwn(target, name)) && target.remoteKubeconfigPath.startsWith('/')
    && /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(target.scope)
    && typeof target.expiresAt === 'string' && Number.isFinite(Date.parse(target.expiresAt))
    && Number.isInteger(target.maxDurationMs) && target.maxDurationMs >= 1000 && target.maxDurationMs <= 3600000
    && Number.isInteger(target.idleTimeoutMs) && target.idleTimeoutMs >= 1000 && target.idleTimeoutMs <= target.maxDurationMs;
}

function remoteTerminalNotice(target, code) {
  const state = { key: 'wake.term.remoteState', vars: { code } };
  if (!target) return state;
  return { key: 'wake.term.remoteMapping', vars: {
    state, accountId: target.accountId, region: target.region, instanceId: target.instanceId,
    contextId: target.contextId, namespace: target.scope, remoteContext: target.remoteContext,
    remoteKubeconfigPath: target.remoteKubeconfigPath, remoteUser: target.remoteUser,
    limits: { key: 'wake.term.remoteLimits', vars: { expiresAt: target.expiresAt, maxDurationSeconds: target.maxDurationMs / 1000, idleTimeoutSeconds: target.idleTimeoutMs / 1000 } },
  } };
}

export default {
  schema: 1,
  id: 'wake',
  name: 'Wake',
  scheme: 'wake',
  kitVersion: '^0.1.0',
  kitBannedTerms: ['wake', 'kubernetes', 'kubectl', 'k8s', 'namespace', 'deployment', 'cluster', 'pod'],
  brand: { mark: 'wake-mark', name: 'wake.name' },
  locales: { ko, en },
  /* 번역하지 않는 쿠버네티스·Argo CD 용어(kubectl 열 이름, 종류, 상태): 모든 언어에서 원문 그대로(kit/tools/check-locale.mjs) */
  terms: ['GitOps', 'Application', 'Draft', 'Name', 'Status', 'Ready', 'Restarts', 'Node', 'Namespace', 'NotReady', 'IP', 'Age', 'Available', 'Image', 'Up-to-date', 'Type', 'Reason', 'Object', 'Count', 'Last Seen',
    'Running', 'Pending', 'Synced', 'Progressing', 'Gateway', 'Service', 'Deployment', 'ReplicaSet', 'Pod', 'HTTPRoute', 'GRPCRoute', 'CrashLoopBackOff', 'Kind', 'Message', 'Warning', 'burn rate',
    'First Seen', 'Source', 'Objects', 'Owner', 'Normal', 'Data', 'Duration', 'Succeeded', 'Completions', 'Schedule', 'Suspend', 'Active', 'Desired', 'Current', 'Revision', 'Strategy', 'Selector', 'Capacity', 'StorageClass', 'Taints', 'Zone', 'Version', 'Pressure', 'State', 'Last State', 'Conditions', 'Labels', 'Endpoints', 'Annotations', 'Pods', 'Created', 'Concurrency Policy', 'Job', 'Resource', 'Allocatable', 'Rules', 'Event', 'Controlled By', 'Evict', 'Taint', 'Sync', 'Health', 'Degraded', 'Chart', 'App', 'Updated', 'Description', 'Ingress'],
  defaultLocale: 'en',
  icons: { map: { ...ICON_MAP, ...BRAND_MAP }, glyphs: { ...GLYPHS, ...BRAND_GLYPHS } },
  features: { tabs: true, panel: true, settings: true, palette: true, externalTools: true, restoreSession: true },
  /* 목록에서 연 리소스 상세는 목록 위의 별도 페이지 뷰(오버레이)로 열린다. 주소로 직접 열거나 탭 이동은 그대로 일반 탭 */
  detailPresentation: { routes: ['detail', 'evidence', 'report', 'check-report', 'gitops-detail', 'alert', 'ailog-detail', 'tool', 'agent-detail'] },
  data,
  dataMode: 'live',
  routes: ROUTES.map(r => ({ ...r, ...routeFns[r.id] })),
  /* restoring: a saved tab on a removed page comes back on the cluster home, and is dropped with no cluster */
  start: st => (st.restoring ? (id => (id ? addr.cluster(id) : null))(lastViewed(st.settings) || home(st.settings)) : homeAddress(st.settings)),
  sidebar: {
    sections: [
      { id: 'clusters', label: 'wake.section.clusters',
        /* 클러스터가 없으면 빈 제목 대신 설정 › 클러스터로 가는 한 줄(⌘K "클러스터 연결"과 같은 말·아이콘) */
        rows: (s, api) => { viewScope = scopeOf(s, api); rememberViewed(s, api); const list = shownClusters(s.settings);
          return list.length ? list.map(c => ({ id: c.id, icon: c.icon, label: raw(c.name), ctx: c.ctx, address: addr.cluster(c.id), context: 'wake.cluster', arg: c.id }))
            : [{ id: 'connect-cluster', icon: 'plus-medium', label: 'wake.cmd.connectCluster', address: addr.settings('clusters'), lead: true }]; } },
      { id: 'pinned', label: 'wake.section.pinned', optional: true,
        rows: s => pinnedOf(s).map(p => p.items
          ? { id: p.id, label: raw(p.label), context: 'wake.pinned.folder', arg: p.id, children: p.items.map(x => ({ ...x, fav: true, label: raw(x.label), context: 'wake.pinned', arg: x.id })) }
          : { ...p, fav: true, label: raw(p.label), context: 'wake.pinned', arg: p.id }) },
      { id: 'conversations', label: 'wake.section.conversations', context: 'wake.section.conversations', optional: true,
        rows: s => {
          const n = +(s.settings['wake.sidebar.recent'] || 3);
          const inc = openIncidents.filter(i => inScope(s, i.cluster)).map(i => ({ id: i.id, kind: 'incident', dot: SEV_DOT[i.severity] || 'warn', label: raw(`${i.number} ${i.title}`), address: incidentAddress(i) }));
          const conv = chatsOf(s).filter(c => c.state === 'active' && inScope(s, c.cluster)).map(c => ({ id: c.id, kind: 'conv', icon: 'message', label: raw(c.title), address: addr.chat(c.id), context: 'wake.conversation', arg: c.id }));
          return [{ id: 'new-chat', icon: 'new-chat', label: 'wake.newChat', action: 'wake.newChat', lead: true }, ...[...inc, ...conv].slice(0, n)];
        } },
      { id: 'tabs', kind: 'tabs', label: 'wake.section.tabs', untitled: 'wake.tab.untitled' },
    ],
    bookmark: 'wake.pin',
    pinnedTabs: { columns: 4 },
    bottom: [
      { icon: 'people-circle', tip: 'wake.account', menu: 'wake.account' },
      { icon: 'search', tip: 'wake.search', action: 'kit.palette.open' },
    ],
  },
  menus: MENUS,
  dialogs: DIALOGS,
  topbar: {
    /* 클러스터 페이지에서만: 도구, 터미널 */
    buttons: ({ route, params }, st, api) => params.cluster ? [
      { icon: 'puzzle', tip: 'wake.tools.menu', menu: 'wake.tools', arg: { route: route.id, cluster: params.cluster, ns: params.ns, kind: params.kind, name: params.name } },
      /* 터미널: 모든 클러스터 페이지에 있고, 열 수 없는 곳(도구 API 화면, 연결하지 않은 클러스터, 데스크톱 밖)은 이유를 말함(B-22) */
      (key => ({ icon: 'terminal', tip: 'wake.term.title', action: 'kit.terminal.toggle', disabled: !key, on: !!key && api.terminal.open(),
        ...(key ? {} : { why: route.id === 'tool-api' ? 'wake.term.why.toolApi' : !(st?.settings?.['wake.clusters.connected'] || []).includes(params.cluster) ? 'wake.term.why.notConnected' : 'wake.term.why.desktop' }) }))(api?.terminal.key()),
    ] : [],
  },
  /* 터미널: 클러스터 페이지는 native 승인 원격 대상으로만 연결한다. 실제 대상과 소유 탭의 세션 분리는 셸이 맡는다.
     친 명령은 사용자 이름·클러스터·시각·성공 여부와 함께 작업 기록에 남김(비밀 값은 가림, 출력은 남기지 않음) */
  terminal: {
    session: ({ params, route }, st) => {
      if (route?.id === 'tool-api') return null;
      if (!params.cluster || !(st.settings['wake.clusters.connected'] || []).includes(params.cluster)) return null;
      /* 모든 namespace 화면도 셸은 한 namespace(그 context의 기본 namespace)에 고정된다: 제목이 그 이름을 말한다(B3-07) */
      const namespace = params.ns && params.ns !== '_all' ? params.ns : st.settings['wake.ns.default.' + params.cluster] || 'default';
      return JSON.stringify({ mode: 'remote', cluster: params.cluster, namespace, scope: params.ns || '', kind: params.kind || '', name: params.name || '' });
    },
    title: key => {
      const target = JSON.parse(key);
      return { key: target.mode === 'remote' ? 'wake.term.remoteTitle' : 'wake.term.localTitle', vars: { cluster: target.cluster, scope: terminalScope(target) } };
    },
    open: async (key, api) => {
      const target = JSON.parse(key);
      if (!['local', 'remote'].includes(target.mode)) throw new Error('terminal mode required');
      if (!hasService() || !(api.settings.get('wake.clusters.connected') || []).includes(target.cluster)) throw new Error('terminal target unavailable');
      if (target.mode === 'remote') {
        const result = await service('term.target', { contextId: target.cluster });
        /* 원격 대상이 없는 클러스터(대부분): 내 셸을 그 화면의 context·namespace로 고정한 kubeconfig로 연다(전역 current-context를 따르지 않음, 제목은 로컬 셸) */
        if (!['REMOTE_UNCONFIGURED', 'REMOTE_EXPIRED'].includes(result?.code)) {
          if (result?.error || !nativeTerminalTarget(result, target.cluster)) return { error: 'remote terminal target unavailable', code: result?.error && typeof result.code === 'string' ? result.code : 'REMOTE_RESPONSE_REJECTED' };
          return { mode: 'remote', contextId: result.contextId, notice: remoteTerminalNotice(result, 'REMOTE_OPENING') };
        }
      }
      const result = await service('term.env', { id: target.cluster, namespace: target.namespace, scope: target.scope, resource: { kind: target.kind, name: target.name } });
      if (result?.error || !result?.env?.KUBECONFIG) throw new Error('terminal context unavailable');
      return { mode: 'local', env: result.env, cwd: result.cwd, notice: { key: 'wake.term.target', vars: { context: result.target.context, namespace: result.target.namespace, cwd: result.cwd, resource: [target.kind, target.name].filter(Boolean).join('/') || '—' } } };
    },
    describe: status => {
      const target = JSON.parse(status.key);
      if (target.mode !== 'remote') return {};
      if (status.mode !== 'remote') return { title: { key: 'wake.term.localTitle', vars: { cluster: target.cluster, scope: terminalScope(target) } } };
      const code = status.cleanup === 'unconfirmed' ? 'REMOTE_CLEANUP_UNCONFIRMED' : status.code || status.errorCode || 'REMOTE_' + status.state.toUpperCase();
      return { title: { key: 'wake.term.remoteTitle', vars: { cluster: target.cluster, scope: terminalScope(target) } },
        notice: remoteTerminalNotice(nativeTerminalTarget(status.target, target.cluster) ? status.target : null, code) };
    },
    record: (e, api) => api.setSetting('wake.audit.terminal', [{ ...e, command: maskSecrets(e.command) }, ...(api.settings.get('wake.audit.terminal') || [])].slice(0, 500)),
  },
  contextMenus: CONTEXT,
  actions: {
    ...aiClientActions,
    /* 구역 알약 탭: 지금 탭의 클러스터에서 고른 구역으로(같은 탭) */
    'wake.view.section': (a, api) => { const cluster = api.routeOf(api.activeTab())?.params?.cluster, v = String(a.arg?.value ?? a.arg ?? ''); if (cluster && CLUSTER_VIEWS.some(([id]) => id === v)) api.navigate(viewTarget(cluster, v)); },
    'wake.appearance.discover': (_a, api) => discoverTerminalApps(api),
    'wake.appearance.select': async (a, api) => {
      const owner = api.activeTab();
      if (!owner || owner.id !== a.sourceTabId || owner.entries[owner.index]?.address !== addr.settings('appearance')) return;
      const choice = a.arg?.value, profiles = terminalProfiles(api.settings.all());
      const stored = profiles.find(item => 'imported:' + item.id === choice);
      if (!TERMINAL_PRESETS.includes(choice) && !stored && !Object.hasOwn(TERMINAL_APPS, choice)) return;
      const selection = Symbol();
      appearanceSelections.set(api, selection);
      const current = () => appearanceSelections.get(api) === selection && api.activeTab() === owner &&
        owner.entries[owner.index]?.address === addr.settings('appearance');
      if (TERMINAL_PRESETS.includes(choice) || stored) {
        api.setSettings({ 'kit.terminal.theme': stored && !Object.keys(stored.colors || {}).length ? 'app' : choice,
          'kit.terminal.font': stored?.font?.family ? choice : 'app' });
        return;
      }
      const unavailable = () => api.toast({ title: 'wake.appearance.noData', tone: 'error' });
      try {
        const result = await discoverTerminalApps(api);
        if (!current()) return;
        if (!result) { api.toast({ title: 'wake.appearance.failed', tone: 'error' }); return; }
        if (!result.applications.some(app => app.appId === choice && app.installed === true)) return unavailable();
        const sources = result.sources.filter(source => source.appId === choice && typeof source.id === 'string');
        for (const source of sources) {
          const imported = await api.terminal.appearance.import({ sourceId: source.id });
          if (!current()) { if (imported?.ticketId) await api.terminal.appearance.cancel(imported.ticketId); return; }
          if (!imported?.ticketId || !imported.snapshot || imported.snapshot.source?.appId !== choice) continue;
          const { colors, font } = imported.snapshot;
          const applied = await api.terminal.appearance.apply(imported.ticketId, {
            acceptPartial: true, colors: Object.keys(colors).length > 0, font: !!font.family, resetMissing: true,
          });
          if (applied?.applied !== true && current()) api.toast({ title: 'wake.appearance.failed', tone: 'error' });
          return;
        }
        unavailable();
      } catch {
        if (current()) api.toast({ title: 'wake.appearance.failed', tone: 'error' });
      }
    },
    'wake.newChat': (_a, api) => { api.openPanel(); },
    /* 대화 보관·다시 열기·삭제: 자리만 바꿈(작업 기록은 그대로) */
    'wake.chat.archive': async (a, api) => { if (a.arg && await chatPlace(api, [a.arg], 'archive')) api.toast({ title: 'wake.chat.archived', tone: 'ok' }); },
    'wake.chats.archiveAll': async (_a, api) => { const ids = chatsOf(api.state).filter(c => c.state === 'active' && inScope(api.state, c.cluster)).map(c => c.id); if (ids.length && await chatPlace(api, ids, 'archive')) { api.toast({ title: 'wake.chat.archived', tone: 'ok' }); } },
    'wake.chat.reopen': async (a, api) => { if (await chatPlace(api, [a.arg], 'restore')) api.navigate(addr.chat(a.arg), { newTab: true }); },
    'wake.chat.delete': async (a, api) => { if (await chatPlace(api, [a.arg], 'delete')) api.toast({ title: 'wake.chat.deleted', tone: 'ok' }); },
    'wake.chat.export': async (a, api) => {
      const c = chatsOf(api.state).find(x => x.id === a.arg); if (!c) return;
      const name = `${c.title.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`, body = toMarkdown(c, k => api.text(k));
      /* 저장 창이 진행 중 표시, 끝나면 결과 하나: 저장됨 / 취소됨 / 실패 */
      const r = await saveText(name, body);
      if (r?.saved) api.toast({ title: 'wake.chat.exported', tone: 'ok' }); else if (r?.cancelled) api.toast({ title: 'wake.chat.exportCancelled' });
      else api.toast({ title: 'wake.chat.exportFailed', tone: 'error' });
    },
    /* AI 범위(입력창 아래): 클러스터와 namespace를 고르면 그 범위로 */
    'wake.scope.cluster': (a, api) => { api.setSetting('wake.scope.cluster', a.arg); api.setSetting('wake.scope.ns', null); },
    'wake.scope.ns': (a, api) => api.setSetting('wake.scope.ns', a.arg),
    /* 북마크: 탭 하나(arg: 주소·제목·아이콘) 또는 폴더(arg: folder 이름, items 탭 목록)를 설정 저장소에 더한다 */
    'wake.pin': (a, api) => {
      const list = api.state.settings['wake.pinned.added'] || [], id = () => 'pin-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const entry = x => ({ id: id(), icon: x.icon || 'globe', label: x.title, address: x.address });
      /* 추가는 늘 화면에 알린다(B-29): 이미 있으면 그렇다고 */
      if (a.arg.folder != null) { api.setSetting('wake.pinned.added', [...list, { id: id(), label: a.arg.folder, items: a.arg.items.map(entry) }]); api.toast?.({ title: 'wake.pin.added', body: raw(a.arg.folder), tone: 'ok' }); }
      else if (!list.some(x => x.address === a.arg.address)) { api.setSetting('wake.pinned.added', [...list, entry(a.arg)]); api.toast?.({ title: 'wake.pin.added', body: raw(a.arg.title || ''), tone: 'ok' }); }
      else api.toast?.({ title: 'wake.pin.exists', body: raw(a.arg.title || '') });
    },
    'wake.unpin': (a, api) => {
      const added = api.state.settings['wake.pinned.added'] || [];
      if (added.some(x => x.id === a.arg)) api.setSetting('wake.pinned.added', added.filter(x => x.id !== a.arg));
      else if (added.some(x => x.items?.some(y => y.id === a.arg))) api.setSetting('wake.pinned.added', added.map(x => x.items ? { ...x, items: x.items.filter(y => y.id !== a.arg) } : x));
    },
    'wake.folder.rename': (a, api) => api.setSetting('wake.pinned.added', (api.state.settings['wake.pinned.added'] || []).map(x => x.id === a.arg ? { ...x, label: a.values.name.trim() } : x)),
    'wake.folder.delete': (a, api) => api.setSetting('wake.pinned.added', (api.state.settings['wake.pinned.added'] || []).filter(x => x.id !== a.arg)),
    /* 연결 해제: 사이드바에서 빼고, 허브의 그 클러스터 주기 수집(알림·이벤트)을 멈춤 */
    'wake.cluster.disconnect': (a, api) => { api.setSetting('wake.clusters.connected', (api.settings.get('wake.clusters.connected') || []).filter(x => x !== a.arg));
      const found = forgetFound(api.settings.all?.() || { [FOUND_KEY]: api.settings.get(FOUND_KEY) }, a.arg); if (found) api.setSetting(FOUND_KEY, found); // 찾기 확인 근거도 지움
      if (live.desktop) void service('hub.release', { id: a.arg }).catch(() => {}); },
    'wake.cluster.switchContext': (a, api) => { const list = api.settings.get('wake.clusters.list') || [], to = ctxOf(a.arg.to); api.setSetting('wake.clusters.list', list.map(c => c.id === a.arg.from ? { ...c, id: to.id, ctx: to.ctx, presentation: to.presentation || null, file: to.file } : c)); api.setSetting('wake.clusters.connected', (api.settings.get('wake.clusters.connected') || []).map(x => x === a.arg.from ? to.id : x)); live.refresh(api); },
    'wake.ns.add': (a, api) => { const k = 'wake.ns.added.' + a.arg; api.setSetting(k, [...new Set([...(api.settings.get(k) || []), a.values.name])]); },
    /* 에이전트 설치: 사람이 누를 때만, 내 kubeconfig 자격으로 아래 터미널에서 Helm 명령을 대신 실행(권한 → 설치 → 준비 → 연결 확인) */
    'wake.agent.install': async (a, api) => { flowApi = api; return flows.run('agent-' + a.arg, 'agent', {}, null, { kind: 'agent', cluster: a.arg, target: a.arg }); },
    'wake.flow.pickChart': (a, api) => { flowApi = api; flows.pickChart(a.arg.key); },
    /* 도구 연결(설정 › 클러스터의 도구, 클러스터 대시보드의 도구 줄): 로그인하는 도구는 로그인해서 연결, 인증 없는 도구는 접속 확인 */
    'wake.tool.connect': (a, api) => { flowApi = api; const { cluster, tool } = a.arg, key = `${cluster}-${tool.kind}`;
      return startToolOutput(a, api, key, cluster, tool, () => flows.run(key, TOOL_LOGIN.has(tool.kind) ? 'tool-login' : 'tool-open', {}, null, { kind: 'tool', cluster, tool })); },
    'wake.flow.approve': (a, api) => { flowApi = api; finishToolApproval(a.arg.key, true); },
    'wake.flow.deny': a => finishToolApproval(a.arg.key, false),
    'wake.flow.token': (a, api) => api.setSetting('wake.conn.form', a.arg.key),
    'wake.tool.tokenForm': (a, api) => {
      const { cluster, tool } = a.arg || {};
      if (typeof cluster !== 'string' || !cluster || !TOOL_LOGIN.has(tool?.kind)) return;
      const key = `${cluster}-${tool.kind}`;
      tokenFormTarget = { key, cluster, tool };
      api.setSetting('wake.conn.form', api.settings.get('wake.conn.form') === key ? '' : key);
    },
    /* 값 줄 열고 닫기(한 번에 한 줄): 연결 행 안에서 키·토큰·kubeconfig를 받음 */
    'wake.conn.form': (a, api) => api.setSetting('wake.conn.form', api.settings.get('wake.conn.form') !== a.arg ? a.arg : ''),
    /* 필요한 권한 보기(흐름의 줄, 확인 카드, 흐름 없이 읽은 결과의 줄) */
    'wake.flow.perm': (a, api) => { flowApi = api; flows.perm(a.arg.key); },
    'wake.cluster.needPerm': (a, api) => { flowApi = api; flows.detail(a.arg.id, live.st.results[a.arg.id]); flows.perm(a.arg.id); },
    'wake.perm.show': (a, api) => openPermSheet(api, a.arg),
    /* 직접 적용: 내 자격으로 아래 터미널에서 실행(사람이 누를 때만), 끝나면 그 줄을 다시 확인 */
    'wake.perm.apply': async (a, api) => { flowApi = api; const command = specOf(a.arg.command); if (!command) { api.toast?.({ title: 'wake.perm.notRunnable', tone: 'error' }); return; }
      const r = await api.terminal.run({ key: 'wake-run', title: raw(`${a.arg.cluster} · ~/`), command, env: { KUBECONFIG: (live.st.kube?.paths || []).join(':') } });
      if (r?.exit === 0) { api.terminal.close('wake-run'); if (a.arg.key && flows.get(a.arg.key)) flows.retry(a.arg.key); } },
    /* Slack으로 보내기: 연결한 Slack 웹후크로 그 명령 한 덩어리(누를 때만) */
    'wake.perm.slack': async (a, api) => { const r = await service('notify.send', { target: 'slack', text: `Wake · ${a.arg.cluster}\n\`\`\`${a.arg.text}\`\`\`` }).catch(e => ({ error: String(e?.message || e) }));
      api.toast(r?.ok ? { title: 'wake.perm.sent', tone: 'ok' } : { title: 'wake.perm.sendFailed', tone: 'error' }); },
    'wake.flow.disconnect': async (a, api) => { flowApi = api; const r = await flows.disconnect(a.arg.key); api.toast({ title: r?.deleted === false ? 'wake.tool.revokeLeft' : 'wake.tool.disconnected', tone: r?.deleted === false ? 'error' : 'ok' }); },
    /* 첫 실행 연결 확인을 마치면: 확인한 모든 context와 상태를 남기고, 연결됨·권한 부족(읽을 수 있는 범위만)인 것을 사이드바에 */
    'wake.firstRun.clusters': async (_a, api) => {
      const res = api.firstRun.results('clusters');
      const previous = api.settings.get('wake.clusters.list') || [];
      const records = { ...(api.settings.get('wake.connections') || {}) };
      const list = Object.entries(res).map(([id, result]) => {
        const c = ctxOf(id), p = result && !result.busy && result.probe;
        const saved = previous.find(item => item.id === id) || records[id];
        const identity = p && Object.hasOwn(p, 'identity') ? p.identity : saved?.identity || null;
        const identityError = p && Object.hasOwn(p, 'identity') ? p.identityError || null : saved?.identityError || null;
        if (p) records[id] = connectionRecord({ target: id, method: 'kubeconfig', kind: 'cluster', identity, identityError, at: new Date().toISOString() });
        return { id, ctx: c.ctx, provider: c.provider, presentation: c.presentation || null, server: c.server, file: c.file, state: p?.state || 'unknown', identity, identityError, version: p?.version || '', namespace: p?.namespace || '', user: p?.username || '' };
      });
      if (!list.length) return;
      api.setSetting('wake.clusters.list', list);
      /* 연결 기록(정책): 내 kubeconfig context는 늘 나만 · 각자 로그인 · 읽기 전용 */
      api.setSetting('wake.connections', records);
      for (const c of list) if (!api.settings.get('wake.ns.default.' + c.id)) api.setSetting('wake.ns.default.' + c.id, c.namespace || 'default');
      api.setSetting('wake.clusters.connected', list.filter(c => c.state === 'ok' || c.state === 'forbidden').map(c => c.id));
      api.setSetting('wake.clusters.checkedAt', new Date().toISOString());
    },
    /* 연결 하나 시작(AI, 알림, GitOps): 키로 연결 방법과 대상을 찾아 같은 흐름으로. 비밀 값은 값(values)으로만 와서 키체인으로 감 */
    'wake.conn.start': (a, api) => { flowApi = api; if (api.settings.get('wake.conn.form') === a.arg.key) api.setSetting('wake.conn.form', ''); const c = CONNS[a.arg.key] || (a.arg.method && { method: a.arg.method, target: a.arg.target || a.arg.key }); if (!c) return;
      flows.run(a.arg.key, c.method, a.values || {}, null, { target: c.target, kind: METHODS[c.method].kind }); },
    'wake.flow.input': a => flows.input(a.arg.key),
    /* 연결 흐름(connect-flow.js): 시작, 실패한 단계부터 다시, 취소·계속 기다리기, 설치·로그인 실행, 입력 칸으로 */
    'wake.flow.start': (a, api) => { flowApi = api; flows.run(a.arg.key, a.arg.method, a.values || {}); },
    'wake.flow.retry': (a, api) => { const key = a.arg.key, f = flows.get(key); if (f?.kind !== 'tool') return flows.retry(key);
      flowApi = api; return startToolOutput(a, api, key, f.cluster, f.tool, () => flows.retry(key)); },
    'wake.flow.detail': (a, api) => { flowApi = api; flows.detail(a.arg.id, live.st.results[a.arg.id]); },
    'wake.flow.cancel': a => { const key = a.arg.key; if (typeof key !== 'string') return; stopToolOutput(key); if (key.endsWith(':open')) { delete opening[key]; publish(); return; } return flows.cancel(key); },
    'wake.flow.wait': a => flows.wait(a.arg.key),
    'wake.flow.install': a => flows.install(a.arg.key),
    'wake.flow.login': a => flows.login(a.arg.key),
    'wake.flow.copyInstall': a => flows.copyInstall(a.arg.key),
    'wake.flow.focus': a => flows.focus(a.arg.key),
    /* 연결 확인 줄의 설치·다시 로그인: 터미널에서 실행한 뒤 그 줄을 단계와 함께 다시 확인 */
    /* 확인에서 멈춘 줄의 설치·다시 로그인: 그 줄의 단계(도구 확인·인증)에서 아래 터미널로 실행하고 끝나면 다시 확인 */
    'wake.flow.ctxRun': (a, api) => { flowApi = api; const { id, command, step } = a.arg; if (command) flows.fix(id, step || 'tool', command); },
    'wake.cluster.recheck': (a, api) => recheckIds(api, [a.arg.id]),
    /* exec 인증 명령 허락: 줄(cardOf)은 { id }, 연결 흐름은 { key }(그 흐름의 대상 context) */
    'wake.exec.review': async (a, api) => { const id = a.arg?.id || flows.get(a.arg?.key)?.target || a.arg?.key; if (!id) return;
      const kube = live.st.kube?.contexts?.length ? live.st.kube : await live.readKube?.().catch(() => null), c = kube?.contexts?.find(x => x.id === id);
      if (!c?.execConsent?.command) { recheckIds(api, [id]); return; }
      api.dialog('wake.exec.consent', { id, name: clusterPresentation(c).name, command: c.execConsent.command, args: c.execConsent.args || [] }); },
    'wake.exec.allow': async (a, api) => { const r = await service('kube.execConsent', { id: a.arg.id, allow: true }).catch(e => ({ error: String(e?.message || e) }));
      if (r?.state !== 'granted') { api.toast({ title: 'wake.exec.failed', tone: 'error' }); return; }
      api.toast({ title: 'wake.exec.granted', tone: 'ok' }); await live.readKube?.().catch(() => {}); recheckIds(api, [a.arg.id]); },
    /* 연결 설정 파일 다시 읽기(고친 뒤): kube.read를 다시 부르고 클러스터를 다시 확인 */
    'wake.kube.reread': (_a, api) => live.refresh(api),
    /* 연결 설정 파일 권한 고치기(확인 대화상자의 단추): 메인 프로세스가 0600·내 계정 폴더로 고치고 kube-changed. 결과는 토스트, 그 뒤 다시 읽기 */
    'wake.kube.repair': async (_a, api) => { const r = await service('kube.connectionsRepair', { confirm: true }).catch(() => null);
      api.toast(r?.state === 'repaired' ? { title: 'wake.s.connFile.repaired', tone: 'ok' } : { title: 'wake.s.connFile.repairFailed', tone: 'error' });
      await live.readKube?.().catch(() => {}); await live.refresh(api); },
    /* 내 자료: 내보내기는 JSON 파일 하나(가린 값), 지우기는 확인 대화상자 뒤에만 */
    'wake.data.export': async (_a, api) => { const r = await service('data.export').catch(() => null);
      if (!r) { api.toast({ title: 'wake.data.exportFailed', tone: 'error' }); return; }
      const saved = await saveText(`wake-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(r, null, 2));
      api.toast(saved?.saved ? { title: 'wake.data.exported', tone: 'ok' } : saved?.cancelled ? { title: 'wake.chat.exportCancelled' } : { title: 'wake.data.exportFailed', tone: 'error' }); },
    'wake.data.delete': async (_a, api) => { const r = await service('data.delete', { confirm: true }).catch(() => null);
      api.toast(r && !r.error ? { title: 'wake.data.deleted', tone: 'ok' } : { title: 'wake.data.deleteFailed', tone: 'error' }); },
    'wake.kube.openFile': a => { live.desktop ? service('kube.openFile', { path: a.arg.path }) : null; },
    'wake.copy': (a, api) => { globalThis.navigator?.clipboard?.writeText(a.arg.value).catch(() => {}); api.toast({ title: 'message.copied', tone: 'ok' }); },
    /* 파일 고르기·붙여넣기·토큰(첫 실행과 설정 모두): 같은 단계 흐름(입력 확인 → kubeconfig 갱신 → 접속 → 인증 → 권한). 설정에서는 클러스터 목록의 새 줄에서 진행 */
    'wake.kube.pick': async (_a, api) => { if (!live.desktop) return; const r = await service('kube.pickFile'); if (r) { flowApi = api; flows.run('add-file', 'file', { picked: r }, null, { origin: api.firstRun.active() ? null : 'settings' }); } },
    'wake.kube.paste': (a, api) => { flowApi = api; api.setSetting('wake.conn.form', ''); flows.run('add-paste', 'file', { text: a.values.text }, null, { origin: 'settings' }); },
    'wake.kube.cloud': (a, api) => { const cloud = a.arg?.cloud; if (!METHODS[cloud]) return; flowApi = api; api.setSetting('wake.conn.form', ''); flows.run('add-cloud', cloud, a.values || {}, null, { origin: 'settings' }); },
    'wake.kube.token': (a, api) => { flowApi = api; api.setSetting('wake.conn.form', ''); flows.run('add-token', 'token', { server: a.values.server, token: a.values.token }, null, { origin: 'settings' }); },
    /* 클러스터 상태를 바꾸는 스위치는 값을 바로 바꾸지 않고 설정의 확인 단계로 보낸다 */
    'wake.cluster.agent': (a, api) => api.navigate(clusterSettings(a.arg, 'agent').address, { newTab: true }),
    'wake.cluster.perm': (a, api) => api.setSetting('wake.perm.' + a.arg.cluster, a.arg.perm),
    'wake.cluster.copyContext': (a, api) => {
      const id = a?.arg || api.routeOf(api.activeTab())?.params?.cluster;
      if (!id) return;
      const c = clusterRecord(id, api.settings.all());
      if (!c) return;
      globalThis.navigator?.clipboard?.writeText(c.ctx).catch(() => {});
      api.toast({ title: 'message.copied', tone: 'ok' });
    },
    /* 도구 웹 화면: 그 도구의 첫 화면(Grafana 대시보드, Prometheus 그래프)을 새 Wake 탭으로. 포트 포워딩을 여는 동안 그 줄이 단계(접속 → 준비 완료)로 진행,
       닿지 않으면 그 줄에서 멈춤(다시 시도, 원인과 출력). 도구·클러스터마다 따로인 세션, 저장한 토큰은 그 주소에만 */
    'wake.gcp.console': async (a, api) => {
      const intent = consumeGcpConsoleIntent(a, api);
      if (!intent) return { status: 'unavailable', requested: false };
      if (gcpConsoleInflight.has(intent.contextId) || gcpConsoleInflight.size >= GCP_CONSOLE_INTENT_LIMIT) return { status: 'busy', requested: false };
      const operation = {};
      gcpConsoleInflight.set(intent.contextId, operation);
      try {
        const response = await service('gcp.console.open', { contextId: intent.contextId });
        if (!gcpConsoleCurrent(intent, api)) return { status: 'ignored', shown: false };
        if (!validGcpConsoleRequest(response, intent)) {
          api.toast({ title: gcpConsoleBrand().label, body: 'wake.conn.short.failed' });
          return { status: 'invalid_response', requested: false };
        }
        api.toast({ title: gcpConsoleBrand().label, body: 'wake.cloud.console.requested' });
        return response;
      } catch {
        if (gcpConsoleCurrent(intent, api)) api.toast({ title: gcpConsoleBrand().label, body: 'wake.conn.short.failed' });
        return { status: 'failed', requested: false };
      } finally {
        if (gcpConsoleInflight.get(intent.contextId) === operation) gcpConsoleInflight.delete(intent.contextId);
      }
    },
    'wake.tool.diagnostics': (a, api) => { const { cluster, tool, flowKey } = a.arg || {}; const snapshot = toolOutputSnapshot(flowKey, cluster, tool?.kind, api, true);
      if (!snapshot) return { ok: false, shown: false, reason: 'no-current-output' };
      return showToolOutput(beginToolOutput(a, api, flowKey, cluster, tool.kind), snapshot); },
    'wake.tool.open': async (a, api) => {
      flowApi = api; const { cluster, tool } = a.arg, key = `${cluster}-${tool.kind}`, at = key + ':open';
      if (['loki', 'tempo'].includes(tool.kind)) {
        if (toolOutputAddress(a.sourceTabId, api, cluster)) api.navigate(addr.toolApi(cluster, tool.kind), { newTab: true });
        return;
      }
      if (opening[at]?.state === 'running') return;
      knownOpenings.add(at);
      const record = beginToolOutput(a, api, at, cluster, tool.kind);
      const run = opening[at] = { state: 'running', hint: 'wake.flow.h.open', steps: [] }; if (record) record.ref = run; publish();
      const tab = { ...toolTab(key, tool.kind, cluster), reopen: { action: 'wake.tool.open', arg: { cluster, tool } } }; // 앱을 다시 열면 같은 탭에 도구를 다시 연다(전달 주소는 그 실행 것)
      const preparedTabId = api.prepareTool?.(tab, a.sourceTabId);
      const r = await toolOp('home', { key, cluster, tool }).catch(e => ({ error: String(e?.message || e) }));
      if (opening[at] !== run) return;
      const rec = api.settings?.get('wake.connections')?.[key];
      if (r?.url) {
        stopToolOutput(at);
        delete opening[at];
        publish();
        const reuseKey = TOOL_LOGIN.has(tool.kind) && rec?.kind === 'tool' ? rec.at || undefined : undefined;
        api.openTool(tab, r.url, { reuse: true, reuseKey, ...(preparedTabId ? { preparedTabId } : {}) });
        return;
      }
      if (preparedTabId) api.cancelPreparedTool(preparedTabId);
      if (rec && ['unauthorized', 'forbidden'].includes(r?.state)) {
        stopToolOutput(at);
        delete opening[at];
        flows.restore(key, { ...rec, where: { cluster, tool } }, r);
        return;
      }
      const cause = r?.state === 'timeout' ? 'wake.flow.c.timeout' : 'wake.flow.c.toolDown';
      if (!record || toolOutputAddress(record.sourceTabId, api, cluster) === record.address) {
        api.toast?.({ title: cause, tone: 'error' });
      }
      /* 닿지 않음: 그 줄에 오류 상태와 해결 버튼 하나(다시 열기), 단계 없음 */
      opening[at] = { raw: r?.code ? JSON.stringify({ code: r.code, stage: r.stage }) : typeof r?.error === 'string' ? r.error.slice(-4000) : '', rawTruncated: typeof r?.error === 'string' && r.error.length > 4000, state: 'failed', cause: { key: cause }, kind: 'error', steps: [], actions: [{ label: 'wake.flow.a.retry', icon: 'arrow-rotate-clockwise', action: 'wake.tool.open', arg: a.arg }] };
      if (record && toolOutputs.get(at) === record) record.ref = opening[at]; publish();
    },
    /* 토큰 직접 입력(대체 방법): 같은 단계 흐름(입력 확인 → 접속 → 인증 → 준비 완료) */
    'wake.tool.setToken': (a, api) => {
      flowApi = api;
      const f = flows.get(a.arg), saved = (api.settings.get('wake.connections') || {})[a.arg]?.where;
      const target = tokenFormTarget?.key === a.arg ? tokenFormTarget : f?.tool ? f : saved;
      if (!target?.tool || a.arg !== `${target.cluster}-${target.tool.kind}`) return;
      api.setSetting('wake.conn.form', '');
      tokenFormTarget = null;
      return startToolOutput(a, api, a.arg, target.cluster, target.tool, () =>
        flows.run(a.arg, 'tool-token', { token: (a.values?.token || '').trim() }, null, { kind: 'tool', cluster: target.cluster, tool: target.tool }));
    },
    'wake.tool.pin': (a, api) => { const cur = api.settings.get('wake.tools.pinned') || []; api.setSetting('wake.tools.pinned', a.on ? [...new Set([...cur, a.arg])] : cur.filter(x => x !== a.arg)); },
  },
  settings: SETTINGS,
  /* 첫 실행(D-USR-2026-11-18): 클러스터 연결(kubeconfig에서 찾은 context를 하나씩 확인, 없으면 여기서 새로 연결) → AI 연결 → 기본 설정(AI 권한 기본값·언어·테마) → 시작은 연결된 클러스터 홈.
     예전 단계(welcome · permission · done)에서 멈춘 첫 실행은 그 단계를 넘겨받은 단계로(aliases) */
  firstRun: {
    steps: [
      /* 연결된 것이 없으면 "나중에 연결". 확인이 끝나지 않은 카드가 있어도 넘어갈 수 있음 */
      { id: 'clusters', aliases: ['welcome'], back: false, kind: 'checks', progress: true, title: 'wake.fr.clusters', key: 'wake.firstRun.clusters', action: 'wake.firstRun.clusters',
        state: (_st, api) => clusterFoot(api), buttons: (_st, api) => CLUSTER_FOOT[clusterFoot(api)],
        /* 머리 아래 한 줄은 실제 상태를 제품 말로: 연결된 클러스터 이름, 아직 없으면 찾은 수 */
        description: (_st, api) => firstRunLine.clusters(live.st.kube?.contexts.length || 0,
          Object.entries(api.firstRun.results('clusters')).filter(([, r]) => r?.group === 'ok').map(([id]) => ctxOf(id).ctx)),
        items: () => (live.st.kube?.contexts || []).map(c => ({ id: c.id, label: raw(c.ctx), icon: PROVIDER_ICON[c.provider] || 'brand-kubernetes' })),
        check: async (id, _api, isCurrent = () => true) => { const r = await live.probe(id, isCurrent); if (isCurrent()) flows.recheckDone(id, r); return { ...cardOf(ctxOf(id), r), probe: r }; },
        /* 다시 확인 중이거나 다시 확인에서 멈춘 줄: 그 줄 아래 단계 표시 */
        rowAction: 'wake.flow.detail',
        flows: () => Object.fromEntries((live.st.kube?.contexts || []).map(c => [c.id, flows.get(c.id)?.method === 'recheck' ? flows.view(c.id) : null]).filter(([, f]) => f)),
        groups: GROUPS, failureGroup: 'check',
        /* 새로 연결: 세 방법 중 하나만 열림. 연결을 누르면 같은 단계 흐름(도구 → 로그인 → kubeconfig → 서버 → 인증)이 그 줄 안에서 채워짐 */
        add: () => ({ label: 'wake.fr.add', exclusive: true, rows: [
          { ...clusterAdd('add-file'), fields: [{ key: 'text', type: 'textarea', required: true, label: raw('kubeconfig'), lock: 'wake.fr.add.lock', hint: 'wake.fr.add.h.file', placeholder: raw('apiVersion: v1\nkind: Config\n…') }],
            foot: [{ label: 'wake.fr.add.pick', icon: 'folder-open', action: 'wake.kube.pick' }], submit: () => ({ label: 'wake.flow.connect', action: 'wake.flow.start', arg: { key: 'add-file', method: 'file' }, disabled: !!flows.get('add-file')?.running }), flow: () => flows.view('add-file'), status: () => flows.status('add-file') },
          { ...clusterAdd('add-token'),
            fields: [[{ key: 'server', label: 'wake.fr.add.serverField', hint: 'wake.fr.add.h.server', placeholder: raw('https://203.0.113.10:6443'), required: true, validate: x => /^https:\/\/[^\s/]+/.test(x) ? null : 'wake.flow.badField.server' }],
              [{ key: 'token', type: 'password', required: true, label: 'wake.fr.add.tokenField', lock: 'wake.fr.add.lock', hint: 'wake.fr.add.h.token', placeholder: raw('eyJhbGciOiJSUzI1NiIs…') }]],
            submit: () => ({ label: 'wake.flow.connect', action: 'wake.flow.start', arg: { key: 'add-token', method: 'token' }, disabled: !!flows.get('add-token')?.running }), flow: () => flows.view('add-token'), status: () => flows.status('add-token') },
          { ...clusterAdd('add-cloud'),
            fields: v => [[{ key: 'cloud', label: 'wake.fr.add.cloudPick', choices: CLOUDS, value: cloudOf(v) }], cloudFields(flowApi, v)],
            preview: v => ({ lang: 'shell', text: cloudCmd(v) }), copy: () => ({ label: 'wake.fr.add.copy', ready: true }),
            /* 고른 곳의 도구·로그인을 미리 확인(읽기만): 안 되는 단계가 있으면 연결 버튼 대신 그 단계의 동작을 보임 */
            status: () => flows.status('add-cloud'),
            flow: v => { const f = flows.get('add-cloud'); if (!f || f.method !== cloudOf(v)) flows.preflight('add-cloud', cloudOf(v)); return flows.view('add-cloud'); },
            submit: v => { const f = flows.get('add-cloud'); return { label: 'wake.flow.connect', action: 'wake.flow.start', arg: { key: 'add-cloud', method: cloudOf(v) }, disabled: !!f?.running || (f?.preflight && f.order.some(s => f.state[s] === 'fail')) || METHODS[cloudOf(v)].fields.some(k => !String(v[k] || '').trim()) }; } }, /* 칸이 다 차기 전에는 연결 없음 */
        ] }) },
      { id: 'ai', kind: 'connect', progress: true, title: 'wake.fr.ai', description: () => firstRunLine.ai(aiNames()),
        groups: (_st, api) => aiGroups(api), primary: () => aiConnected().length ? 'wake.fr.next' : 'wake.fr.ai.without', key: 'wake.firstRun.ai' },
      /* 기본 설정: 한 화면에서 바로 바꿈(AI 권한 기본값은 읽기만) */
      { id: 'setup', aliases: ['permission', 'done'], kind: 'done', progress: true, title: 'wake.fr.setup', primary: 'wake.fr.start', open: st => homeAddress(st.settings),
        description: st => firstRunLine.setup(clustersOf(st).filter(c => c.state === 'ok' || c.state === 'warn').map(c => c.name), aiNames()),
        options: [
          { key: 'wake.perm.default', icon: 'permission-hand', label: 'wake.fr.perm', choices: PERM_LEVELS }, /* 권한 단계 아이콘은 설정·클러스터 메뉴·AI 칸과 같은 것(R5-06) */
          { key: 'kit.locale', icon: 'globe', label: 'wake.s.language', choices: [opt('system', 'locale.system'), opt('ko', 'locale.name.ko'), opt('en', 'locale.name.en')] },
          { key: 'kit.theme', icon: 'contrast', label: 'wake.s.theme', choices: [opt('system', 'wake.s.theme.system', 'display'), opt('light', 'wake.s.theme.light', 'sun'), opt('dark', 'wake.s.theme.dark', 'moon')] },
        ] },
    ],
  },
  onStart: async api => {
    flowApi = api; readNamespaces(api); live.st.onKubeChanged = () => rescan(api); live.st.onProbeStep = p => flows.onProbeStep(p.id, p.step); live.start(api); restoreTools(api);
  },
  palette: {
    placeholder: 'wake.palette.placeholder', keys: ['⌘K'], shortcut: 'mod+k',
    sources: [
      /* 클러스터 전체 이름 검색(지금 탭의 클러스터, 칠 때만 보임): 홈 검색 칸과 같은 종류 목록 */
      { id: 'resources', label: 'wake.palette.resources', queryOnly: true, limit: 20, search: () => paletteResources(viewScope || scopeCluster(flowApi?.settings.all?.() || {})) },
      { id: 'conv', label: 'wake.palette.conversations', search: (_query, st) => chatsOf({ settings: st?.settings || live.st.api?.settings.all?.() || {} }).filter(c => c.state === 'active').slice(0, 2).map(c => ({ id: c.id, icon: 'bubbles', label: raw(c.title), end: raw(when(c.time, Date.now())), action: 'kit.navigate', arg: { address: addr.chat(c.id) } })) },
      /* 고른 클러스터의 구역(경로 칸 구역 전환과 같은 주소): 묶음 이름은 그 클러스터 이름 */
      { id: 'screens', label: s => raw(scopeCluster(s) ? clusterPresentation((s['wake.clusters.list'] || []).find(x => x.id === scopeCluster(s)) || { id: scopeCluster(s) }).name : ''),
        search: (_query, st) => { const c = scopeCluster(st?.settings || live.st.api?.settings.all?.() || {}); return c ? [...CLUSTER_VIEWS.map(([v, icon]) => ({ id: 'scr-' + v, icon, label: v === 'home' ? 'wake.view.home' : viewLabel(v), action: 'kit.navigate', arg: { address: viewTarget(c, v) } })),
          ...CLUSTER_SCREENS.map(([v, label, icon]) => ({ id: 'scr-' + v, icon, label, action: 'kit.navigate', arg: { address: viewAddress(c, v) } }))] : []; } },
      { id: 'cmd', label: 'wake.palette.commands', search: (_query, st) => { const c = scopeCluster(st?.settings || live.st.api?.settings.all?.() || {}); return [
        { id: 'cmd-cl', icon: 'plus-medium', label: 'wake.cmd.connectCluster', action: 'kit.navigate', arg: { address: addr.settings('clusters') } },
        ...(c ? [{ id: 'cmd-au', icon: 'scroll-text', label: 'wake.cmd.audit', action: 'kit.navigate', arg: { address: viewAddress(c, 'ailog') } }] : []),
      ]; } },
    ],
  },
  ai: {
    permissions: [
      { id: 'read', label: 'wake.perm.read', icon: PERM_ICON.read, desc: 'wake.perm.read.desc' },
      { id: 'ask', label: 'wake.perm.ask', icon: PERM_ICON.ask, risky: true, desc: 'wake.perm.ask.desc' },
    ],
    defaultPermission: st => st['wake.perm.default'] || 'read', // read-only unless the person chose otherwise in settings
    /* 모델 목록은 연결한 공급자(Claude API 키, 구독 CLI)에서 읽음(ai-hub.js). 없으면 모델 칸이 "모델 연결 안 됨" */
    providers: [], models: aiHub.models,
    efforts: [{ id: 'low', label: 'wake.effort.low' }, { id: 'medium', label: 'wake.effort.medium' }, { id: 'high', label: 'wake.effort.high' }, { id: 'xhigh', label: 'wake.effort.xhigh' }, { id: 'max', label: 'wake.effort.max' }],
    defaultEffort: 'high',
    scope: {
      icon: 'wake-scope', tip: 'wake.scope',
      /* AI 범위: 연결한 첫 클러스터와 그 기본 namespace */
      label: (_st, s = {}) => { const c = scopeCluster(s); return c ? raw(`${clustersOf({ settings: s }).find(item => item.id === c)?.name || c} · ${s['wake.scope.ns'] || scopeNs(s, c)}`) : 'wake.scope.clusters'; },
      menu: (_st, _api, s = {}) => { const c = scopeCluster(s), ns = s['wake.scope.ns'] || scopeNs(s, c);
        return { items: [{ type: 'label', label: 'wake.scope.clusters' }, ...shownClusters(s).map(x => ({ id: 'sc-' + x.id, label: raw(x.name), icon: x.icon, checked: x.id === c, action: 'wake.scope.cluster', arg: x.id })), { type: 'separator' },
          ...[ns].map(n => ({ id: 'sn-' + n, label: raw(n), icon: 'k8s-namespace', checked: n === ns, action: 'wake.scope.ns', arg: n }))] }; },
    },
    attachments: [{ id: 'at-logs', label: 'wake.attach.logs', icon: 'tool-logs' }, { id: 'at-events', label: 'wake.attach.events', icon: 'k8s-event' }, { id: 'at-file', label: 'wake.attach.file', icon: 'paperclip' }],
    placeholder: { start: 'wake.ask.placeholder', reply: 'wake.reply.placeholder' },
    /* 모델 호출·도구·승인 기록은 메인 프로세스(ai-hub.js → desktop/hub.cjs). 화면 열기·상태 바꾸기는 screenRelay */
    adapter: aiAdapter, screenRelay: aiHub.screenRelay,
    /* 결정 선택지(제품 제약): 허용하고 실행 · 거절만, 항상 허용 없음 */
    approvals: { allowAlways: false, choices: [{ id: 'allow', label: 'wake.approval.allowRun', shortcut: 'mod+enter' }, { id: 'deny', label: 'approval.deny', shortcut: 'escape' }] },
    settingsAddress: addr.settings('ai-models'),
    chatStates: { unconfigured: 'wake.home.conversationsUnconfigured', denied: 'wake.home.conversationsDenied', failed: 'wake.home.conversationsFailed', retry: 'wake.flow.a.retry' }, // same wording as the cluster conversation list
    chatMenu: ctx => [...(ctx?.params?.id ? [item('ch-id', 'wake.chat.copyId', 'copy', { action: 'wake.copy', arg: { value: String(ctx.params.id) } }), { type: 'separator' }] : []), item('ch-archive', 'wake.chat.archive', 'archive', { action: 'wake.chat.archive', arg: ctx?.params?.id }), item('ch-delete', 'wake.chat.delete', 'trash', { danger: true, action: 'kit.dialog.open', arg: { id: 'wake.chat.deleteDlg', arg: ctx?.params?.id } })],
  },
  shortcuts: [{ keys: 'mod+shift+c', action: 'wake.cluster.copyContext' }],
  /* 화면 점검 도구(kit/tools/check-*.mjs)가 여는 주소와 경로 값. 점검 도구는 서비스 호스트를 흉내 내지 않으면 각 화면의 연결 안 됨·읽기 실패 상태를 찍는다.
     클러스터 id는 점검 도구의 서비스 응답(apps/wake/test-fixtures/check-states.json)과 같은 이름 */
  examples: (() => {
    const c = 'check-cluster', ns = 'default';
    const kindScreens = KIND_LIST.flatMap(k => [addr.list(c, '_all', k.plural), ...(k.tabs.length ? k.tabs : ['summary']).map(tab => `${addr.detail(c, k.cluster ? '_all' : ns, k.plural, 'check')}?tab=${tab}`)]);
    return {
      screens: [addr.cluster(c), ...CLUSTER_VIEWS.filter(([v]) => v !== 'home' && v !== 'events').map(([v]) => viewAddress(c, v)), ...['tools', 'agent'].map(v => viewAddress(c, v)), viewAddress(c, 'ailog', 'check'), viewAddress(c, 'tools', 'prometheus'), viewAddress(c, 'agent', 'wake-agent'),
        ...METRIC_IDS.map(m => viewAddress(c, 'metric', m)), A('cluster', c, 'costs'), incidentAddress({ cluster: c, id: 'check' }), A('cluster', c, 'gitops', ns, 'Application', 'check'), A('cluster', c, 'alerts', 'check'),
        `${incidentAddress({ cluster: c, id: 'check' })}/evidence/1`, `${incidentAddress({ cluster: c, id: 'check' })}/report`, A('cluster', c, 'report'), ...kindScreens,
        ...['general', 'appearance', 'clusters', 'agents', 'tools', 'git', 'permissions', 'ai-models', 'ai-connect'].map(id => `wake://settings/${id}`)],
      params: { cluster: { cluster: c }, ...Object.fromEntries(['resources', 'network', 'gitops', 'logs', 'alerts', 'incidents', 'ailog', 'tools', 'agent'].map(v => [v, { cluster: c }])), 'ailog-detail': { cluster: c, id: 'check' }, tool: { cluster: c, tool: 'prometheus' },
        'agent-detail': { cluster: c, name: 'wake-agent' }, metric: { cluster: c, metric: 'cpu' }, incident: { cluster: c, id: 'check' }, evidence: { cluster: c, id: 'check', n: '1' }, report: { cluster: c, id: 'check' }, 'check-report': { cluster: c },
        'gitops-detail': { cluster: c, ns, kind: 'Application', name: 'check' }, alert: { cluster: c, id: 'check' }, costs: { cluster: c }, 'tool-api': { cluster: c, tool: 'loki' }, list: { cluster: c, ns, kind: 'deployments' },
        detail: { cluster: c, ns, kind: 'deployments', name: 'check' }, settings: { page: 'general' }, chat: { id: 'check' } },
    };
  })(),
};
