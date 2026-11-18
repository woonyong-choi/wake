/*
 * 도구 사용자 항목 읽기(spec/data-policy.md#DP-ITEMS): 연결된 도구에서 사용자가 만든 항목을 읽기만 한다.
 *   rules(id, { type, group, name, namespace })   Prometheus /api/v1/rules: 경보·기록 규칙의 식(expr), for, 라벨, 상태
 *   silences(id, { state, namespace, labels })     Alertmanager /api/v2/silences: 활성·대기 무음과 그 matcher
 *   routing(id)                                    Alertmanager /api/v2/status의 설정에서 경로·수신처 이름·억제 규칙만(주소·자격은 버림)
 *   syncWindows(id, { app })                       Argo CD AppProject의 동기화 창(Kubernetes API), 지금 막힌 Application, ApplicationSet
 *   dashboards(id, { query, tags, limit })         Grafana /api/search(대시보드 제목·폴더·태그·경로)
 * 항목마다 ref(도구, 종류, id)와 내용 해시(hash)를 붙인다. 목록 저장(store가 있으면 'tool-catalog')은 참조와 해시만: 내용은 인시던트 근거로 붙일 때만 스냅샷으로 남는다.
 * deps: tool(id, kind, path, params) -> Prometheus는 data, 그 밖은 본문(reads/index.cjs의 tool과 같은 해석), kube(id, path) -> JSON, grafana: Grafana 질의가 연결돼 있는가
 */
const { createHash } = require('node:crypto');
const { yaml } = require('./kubeconfig.cjs');

const ARGO = '/apis/argoproj.io/v1alpha1';
const hashOf = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = (kind, source) => Object.assign(new Error(`tool items ${kind}`), { kind, source });
const arr = v => (Array.isArray(v) ? v : []);
const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));

/* ---------- Alertmanager matcher ---------- */
const matcherText = m => `${m.name}${m.isEqual === false ? (m.isRegex ? '!~' : '!=') : m.isRegex ? '=~' : '='}"${m.value}"`;
function matcherTest(m, labels) {
  const v = labels[m.name] ?? '';
  let hit;
  if (m.isRegex) { try { hit = new RegExp(`^(?:${m.value})$`).test(v); } catch { return false; } } else hit = v === m.value;
  return m.isEqual === false ? !hit : hit;
}
/** 무음 하나가 라벨 묶음에 걸리는가(Alertmanager와 같은 규칙: 모든 matcher, 없는 라벨은 빈 값) */
const silenceMatches = (silence, labels) => arr(silence.matchers).every(m => matcherTest(m, labels ?? {}));
/** 설정 글의 matcher('name="v"', 'name=~"v"')를 구조로 */
function parseMatcher(text) {
  const m = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*(?:"((?:[^"\\]|\\.)*)"|(\S*))\s*$/.exec(str(text));
  return m ? { name: m[1], value: m[3] ?? m[4] ?? '', isRegex: m[2].includes('~'), isEqual: !m[2].startsWith('!') } : null;
}

/* ---------- Argo CD 동기화 창(cron 5필드, 시간대) ---------- */
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }, MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function cronField(text, min, max, names = {}) {
  const set = new Set();
  for (const part of str(text).toLowerCase().split(',')) {
    const [range, stepText] = part.split('/'), step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) return null;
    const val = s => (Object.hasOwn(names, s) ? names[s] : /^\d+$/.test(s) ? Number(s) : NaN);
    let lo, hi;
    if (range === '*') { lo = min; hi = max; } else if (range.includes('-')) { [lo, hi] = range.split('-').map(val); } else { lo = val(range); hi = stepText ? max : lo; }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}
const DESCRIPTORS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
function parseCron(schedule) {
  const f = str(DESCRIPTORS[str(schedule).trim()] ?? schedule).trim().split(/\s+/);
  if (f.length !== 5) return null;
  const dow = cronField(f[4].replaceAll('7', '0'), 0, 6, DOW);
  const c = { minute: cronField(f[0], 0, 59), hour: cronField(f[1], 0, 23), dom: cronField(f[2], 1, 31), month: cronField(f[3], 1, 12, MON), dow, domAny: f[2] === '*', dowAny: f[4] === '*' };
  return Object.values(c).includes(null) ? null : c;
}
function durationMs(text) {
  const s = str(text).trim(); let total = 0, rest = s;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)(h|m|s)/g)) { total += Number(m[1]) * { h: 3_600_000, m: 60_000, s: 1000 }[m[2]]; rest = rest.replace(m[0], ''); }
  return s && !rest.trim() && total > 0 ? total : null;
}
const formatters = new Map();
function fieldsAt(t, timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' }));
  const p = Object.fromEntries(formatters.get(timeZone).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { minute: Number(p.minute), hour: Number(p.hour), dom: Number(p.day), month: Number(p.month), dow: DOW[p.weekday.toLowerCase().slice(0, 3)] };
}
/** 창이 시각 t에 열려 있는가: t - duration < 시작 <= t 인 cron 시작이 있으면. 읽을 수 없는 창은 null */
function windowActive(w, t) {
  const cron = parseCron(w.schedule), dur = durationMs(w.duration);
  if (!cron || !dur || dur > 31 * 86_400_000) return null;
  let tz = w.timeZone || 'UTC';
  try { fieldsAt(t, tz); } catch { tz = 'UTC'; }
  const start = Math.floor(t / 60_000) * 60_000;
  for (let s = start; s > t - dur; s -= 60_000) {
    const f = fieldsAt(s, tz);
    const day = cron.domAny || cron.dowAny ? cron.dom.has(f.dom) && cron.dow.has(f.dow) : cron.dom.has(f.dom) || cron.dow.has(f.dow);
    if (cron.minute.has(f.minute) && cron.hour.has(f.hour) && cron.month.has(f.month) && day) return true;
  }
  return false;
}
const glob = (pattern, value) => new RegExp(`^${str(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')}$`).test(str(value));
const windowCovers = (w, app) => arr(w.applications).some(p => glob(p, app.metadata?.name)) || arr(w.namespaces).some(p => glob(p, app.spec?.destination?.namespace))
  || arr(w.clusters).some(p => glob(p, app.spec?.destination?.server) || glob(p, app.spec?.destination?.name));

/* ---------- Alertmanager 설정: 경로·수신처 이름·억제 규칙만 ---------- */
const MAX_ROUTES = 500;
function routeOf(r, depth, budget) {
  if (!r || typeof r !== 'object' || depth > 20 || budget.n-- <= 0) return null;
  const matchers = [...arr(r.matchers).map(m => str(m).trim()), ...Object.entries(r.match ?? {}).map(([k, v]) => `${k}="${v}"`), ...Object.entries(r.match_re ?? {}).map(([k, v]) => `${k}=~"${v}"`)];
  return { receiver: r.receiver == null ? null : str(r.receiver), matchers, groupBy: arr(r.group_by).map(str), continue: r.continue === true, routes: arr(r.routes).map(x => routeOf(x, depth + 1, budget)).filter(Boolean) };
}
const sideOf = (rule, side) => [...arr(rule[`${side}_matchers`]).map(m => str(m).trim()), ...Object.entries(rule[`${side}_match`] ?? {}).map(([k, v]) => `${k}="${v}"`), ...Object.entries(rule[`${side}_match_re`] ?? {}).map(([k, v]) => `${k}=~"${v}"`)];
/** 라벨 묶음이 닿는 수신처(Alertmanager 경로 규칙: 맞는 첫 자식으로 내려가고 continue면 다음 형제도, 맞는 자식이 없으면 그 노드의 수신처) */
function receiversFor(routing, labels) {
  const out = [];
  const walk = (node, inherited) => {
    const receiver = node.receiver ?? inherited;
    let matched = false;
    for (const child of node.routes) {
      if (!child.matchers.every(m => { const p = parseMatcher(m); return p && matcherTest(p, labels); })) continue;
      matched = true; walk(child, receiver);
      if (!child.continue) break;
    }
    if (!matched && receiver) out.push(receiver);
  };
  if (routing?.route) walk(routing.route, null);
  return [...new Set(out)];
}

function createToolItems({ tool = null, kube = null, grafana = false, store = null, now = Date.now }) {
  const catalog = store ? store.docs('tool-catalog') : null;
  const need = (fn, source) => { if (typeof fn !== 'function') throw fail('unconfigured', source); return fn; };
  /* 목록 저장: 참조·해시·이름만(reference 등급). 저장 실패는 읽기를 막지 않는다 */
  function remember(id, source, kind, items) {
    if (!catalog) return;
    try { catalog.put(`${id}|${source}|${kind}`, { cluster: id, source, kind, at: now(), items: items.map(x => ({ id: x.ref.id, name: x.name ?? x.title ?? x.ref.id, hash: x.hash })) }); } catch { /* 다음 읽기 때 다시 */ }
  }
  /** 저장된 목록과 비교해 그 항목이 바뀌었는가(목록이 없거나 항목이 사라졌으면 null) */
  function changed(id, ref, hash) {
    const doc = catalog?.get(`${id}|${ref.tool}|${ref.kind}`); const item = doc?.items.find(x => x.id === ref.id);
    return item ? item.hash !== hash : null;
  }

  async function rules(id, { type, group, name, namespace } = {}) {
    const params = { ...(type ? { type } : {}), ...(name ? { 'rule_name[]': name } : {}), ...(group ? { 'rule_group[]': group } : {}), ...(name || group ? {} : { exclude_alerts: 'true' }) };
    const data = await need(tool, 'prometheus')(id, 'prometheus', '/api/v1/rules', params);
    const items = arr(data?.groups).flatMap(g => arr(g.rules).map(r => {
      const kind = r.type === 'recording' ? 'record' : 'alert';
      const content = { group: str(g.name), name: str(r.name), type: kind, expr: str(r.query), for: r.duration ?? 0, labels: r.labels ?? {}, annotations: r.annotations ?? {} };
      return { ...content, file: str(g.file), interval: g.interval ?? null, health: r.health ?? null, lastError: r.lastError || null, state: r.state ?? null,
        firing: Array.isArray(r.alerts) ? r.alerts.filter(a => a.state === 'firing').length : null, alerts: arr(r.alerts).map(a => ({ labels: a.labels ?? {}, state: a.state ?? null })),
        ref: { tool: 'prometheus', kind: 'rule', id: `${content.group}|${content.name}`, file: str(g.file) }, hash: hashOf(content) };
    })).filter(r => (!type || r.type === type) && (!name || r.name === name) && (!group || r.group === group)
      && (!namespace || r.labels.namespace === namespace || r.expr.includes(`namespace="${namespace}"`) || r.alerts.some(a => (a.labels.exported_namespace || a.labels.namespace) === namespace))); /* 알림이 말하는 객체의 namespace(data/alerts.js alertLabels와 같이 exported_namespace 먼저) */
    if (!type && !name && !group && !namespace) remember(id, 'prometheus', 'rule', items);
    return { at: now(), items };
  }

  async function silences(id, { state = 'active', namespace, labels } = {}) {
    const body = await need(tool, 'alertmanager')(id, 'alertmanager', '/api/v2/silences', {});
    const all = arr(body).map(s => {
      const content = { matchers: arr(s.matchers).map(m => ({ name: str(m.name), value: str(m.value), isRegex: m.isRegex === true, isEqual: m.isEqual !== false })), startsAt: s.startsAt ?? null, endsAt: s.endsAt ?? null, createdBy: str(s.createdBy), comment: str(s.comment) };
      return { id: str(s.id), state: s.status?.state ?? null, ...content, matchers: content.matchers.map(matcherText).join(', '), matcherList: content.matchers, updatedAt: s.updatedAt ?? null,
        ref: { tool: 'alertmanager', kind: 'silence', id: str(s.id) }, hash: hashOf(content) };
    });
    const wanted = state === 'all' ? () => true : state === 'expired' ? s => s.state === 'expired' : s => s.state === 'active' || s.state === 'pending';
    const items = all.filter(wanted).filter(s => (!labels || silenceMatches({ matchers: s.matcherList }, labels))
      && (!namespace || (s.matcherList.some(m => m.name === 'namespace') && s.matcherList.filter(m => m.name === 'namespace').every(m => matcherTest(m, { namespace })))));
    if (state === 'active' && !namespace && !labels) remember(id, 'alertmanager', 'silence', items);
    return { at: now(), items };
  }

  async function routing(id) {
    const body = await need(tool, 'alertmanager')(id, 'alertmanager', '/api/v2/status', {});
    let config;
    try { config = yaml.load(str(body?.config?.original), { schema: yaml.JSON_SCHEMA }) ?? {}; } catch { throw fail('invalid_response', 'alertmanager'); }
    const value = {
      route: routeOf(config.route, 0, { n: MAX_ROUTES }),
      receivers: arr(config.receivers).map(r => ({ name: str(r?.name), integrations: Object.fromEntries(Object.entries(r ?? {}).filter(([k, v]) => k.endsWith('_configs') && Array.isArray(v)).map(([k, v]) => [k.slice(0, -'_configs'.length), v.length])) })),
      inhibitRules: arr(config.inhibit_rules).map(r => ({ source: sideOf(r, 'source'), target: sideOf(r, 'target'), equal: arr(r.equal).map(str) })),
    };
    return { at: now(), ...value, ref: { tool: 'alertmanager', kind: 'routing', id: 'config' }, hash: hashOf(value) };
  }

  async function syncWindows(id, { app } = {}) {
    const k = need(kube, 'argocd');
    const list = async (plural, optional) => {
      try { return arr((await k(id, `${ARGO}/${plural}`))?.items); } catch (e) { if (Number(e?.status) === 404) { if (optional) return []; throw fail('unconfigured', 'argocd'); } throw e; }
    };
    const [projects, apps, sets] = await Promise.all([list('appprojects'), list('applications', true), list('applicationsets', true)]);
    const t = now();
    const out = projects.map(p => ({ name: str(p.metadata?.name), namespace: str(p.metadata?.namespace), ref: { tool: 'argocd', kind: 'appproject', id: `${p.metadata?.namespace}/${p.metadata?.name}` },
      windows: arr(p.spec?.syncWindows).map(w => ({ kind: w.kind === 'deny' ? 'deny' : 'allow', schedule: str(w.schedule), duration: str(w.duration), applications: arr(w.applications), namespaces: arr(w.namespaces), clusters: arr(w.clusters),
        manualSync: w.manualSync === true, timeZone: w.timeZone || 'UTC', active: windowActive(w, t) })) }));
    out.forEach(p => { p.hash = hashOf(p.windows.map(({ active, ...w }) => w)); });
    const byName = new Map(out.map(p => [p.name, p]));
    const blocked = [];
    for (const a of apps.filter(x => !app || x.metadata?.name === app)) {
      const p = byName.get(a.spec?.project || 'default'); if (!p) continue;
      const covering = p.windows.map((w, i) => ({ w, i })).filter(({ w }) => windowCovers(w, a));
      const deny = covering.find(({ w }) => w.kind === 'deny' && w.active);
      const allows = covering.filter(({ w }) => w.kind === 'allow');
      const row = { app: str(a.metadata.name), namespace: str(a.metadata.namespace), project: p.name };
      if (deny) blocked.push({ ...row, window: deny.i, kind: 'deny', manualSync: deny.w.manualSync });
      else if (allows.length && !allows.some(({ w }) => w.active)) blocked.push({ ...row, window: null, kind: 'allow', manualSync: allows.some(({ w }) => w.manualSync) });
    }
    const applicationSets = sets.map(s => ({ name: str(s.metadata?.name), namespace: str(s.metadata?.namespace), project: str(s.spec?.template?.spec?.project), generators: arr(s.spec?.generators).flatMap(g => Object.keys(g ?? {})),
      ref: { tool: 'argocd', kind: 'applicationset', id: `${s.metadata?.namespace}/${s.metadata?.name}` } }));
    if (!app) remember(id, 'argocd', 'appproject', out.map(p => ({ ...p, name: p.name })));
    return { at: t, projects: out, blocked, applicationSets };
  }

  async function dashboards(id, { query, tags = [], limit = 50 } = {}) {
    if (!grafana) throw fail('unconfigured', 'grafana');
    const body = await need(tool, 'grafana')(id, 'grafana', '/api/search', { type: 'dash-db', limit: String(Math.min(Math.max(1, limit), 200)), ...(query ? { query } : {}), ...(tags[0] ? { tag: tags[0] } : {}) });
    const items = arr(body).filter(d => d?.type === 'dash-db' && tags.every(tag => arr(d.tags).includes(tag))).map(d => ({ uid: str(d.uid), title: str(d.title), folder: str(d.folderTitle), tags: arr(d.tags).map(str),
      path: str(d.url).startsWith('/') ? str(d.url) : '', ref: { tool: 'grafana', kind: 'dashboard', id: str(d.uid) } }));
    return { at: now(), items };
  }

  return { rules, silences, routing, syncWindows, dashboards, changed, receiversFor };
}

module.exports = { createToolItems, silenceMatches, windowActive, receiversFor, parseMatcher, hashOf };
