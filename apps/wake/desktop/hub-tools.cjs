/*
 * AI 경계의 도구 층(spec/architecture.md#F-ARC-TOOLS): 도구 23개의 입력 JSON 스키마와 함수 하나씩. 데스크톱 내장 AI(프로세스 안), MCP 서버, HTTP API가 이 표 하나를 쓴다.
 *   call(name, args, caller) -> { result, source: { id, state, last }, masked }  (실패는 { error: code })
 *   caller: { transport: desktop|mcp|api, requester: { kind: human|ai|external, name }, client?, model?, permission?: read|ask, scope?: { cluster, namespaces[], kinds[] }, screen? }
 *   AI(ai)와 외부 클라이언트(external)는 범위가 반드시 있다(없으면 forbidden). permission read는 propose_action을 막는다. 외부 클라이언트는 화면 상태 도구를 쓰지 않는다.
 *   namespace로 좁힌 범위는 클러스터 범위 종류(Node 등)와 클러스터 전체 항목(규칙·경로·동기화 창·대시보드)을 namespace 없이 읽지 못한다.
 *   screen: 사람이 화면을 연 읽기(데스크톱 IPC). 같은 함수를 지나지만 도구 호출이 아니라 감사 행을 남기지 않는다
 * 안전 경계: 모든 도구는 읽기만 한다(readOnly). 바꾸는 일은 propose_action 하나이고 그것도 승인 요청(대기)만 만든다.
 *   사람이 데스크톱에서 고를 때만 결정이 기록되고, 허브는 클러스터에 쓰지 않는다. Secret은 메타데이터만.
 *   범위(클라이언트의 클러스터·namespace·종류) 밖 호출은 forbidden으로 끝나고 기록된다.
 * 도구 호출 하나가 감사 기록 한 행(6.2): 요청자, 모델, 경로, 도구, 범위, 시각, 마스킹한 인자, 결과.
 * 결과는 도구 층을 나가기 전에 maskText로 한 번 가린다(6.6). Secret 값과 last-applied 주석은 어떤 경로로도 나가지 않는다.
 * 도구 사용자 항목(tool-items.cjs: 규칙, 무음, 알림 경로, 동기화 창, 대시보드)도 같은 검사·범위·가림·감사를 지난다. 감사 행의 인자가 저장 금지(never_store)면 인자 없이 남긴다.
 */
const path = require('node:path');
const { RETENTION_DAYS: STORE_DAYS } = require('./hub-store.cjs');
const { createToolItems } = require('./tool-items.cjs');
const { pathToFileURL } = require('node:url');

const esm = rel => import(pathToFileURL(path.join(__dirname, '..', rel)).href);
const T = (key, vars = {}) => ({ $t: key, vars });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const WINDOW = { type: 'object', description: 'time window, ISO 8601', properties: { from: str('start (ISO 8601)'), to: str('end (ISO 8601)') }, required: ['from', 'to'], additionalProperties: false };
const CLUSTER = str('kubeconfig context id of the cluster');
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
/* ISO 8601 시각은 시간대(Z 또는 ±hh:mm)가 있어야 한다: 없으면 앱 프로세스의 지역 시각으로 읽혀 범위가 어긋난다 */
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:?\d\d)$/i;
const at = v => { const n = ISO.test(String(v)) ? Date.parse(v) : NaN; if (!Number.isFinite(n)) throw Object.assign(new Error('invalid time'), { kind: 'invalid_request' }); return n; };
const win = w => { const from = at(w.from), to = at(w.to); if (to < from || to - from > 31 * 86_400_000) throw Object.assign(new Error('invalid window'), { kind: 'invalid_request' }); return { from, to }; };
const NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const LABEL_VALUE = /^[A-Za-z0-9_.\-/]{1,253}$/;
const LAST_APPLIED = 'kubectl.kubernetes.io/last-applied-configuration';
/** 도구 층을 나가는 객체: managedFields·last-applied 주석 없음, Secret은 키 이름만 */
function safeObject(raw, kind) {
  const o = { ...raw, metadata: { ...raw.metadata } };
  delete o.metadata.managedFields;
  if (o.metadata.annotations) { const { [LAST_APPLIED]: _drop, ...rest } = o.metadata.annotations; o.metadata.annotations = rest; }
  if (kind === 'Secret' || o.kind === 'Secret') { o.data = Object.fromEntries(Object.keys(raw.data ?? {}).map(x => [x, ''])); delete o.stringData; }
  return o;
}
/* Prometheus 한 질의의 점 수 상한(11,000) 아래로: 구간이 길면 step을 늘린다 */
const stepFor = (w, min = 30_000) => Math.max(min, Math.ceil((w.to - w.from) / 10_000 / 1000) * 1000);
const LOG_TAIL = 2000, LOG_BYTES = 2 * 1024 * 1024;

/** 작은 JSON 스키마 검사(type, required, properties, additionalProperties: false, enum, pattern, items) */
function check(schema, value, at = 'args') {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (schema.type === 'integer' ? !Number.isInteger(value) : schema.type && schema.type !== type) return `${at}: expected ${schema.type}`;
  if (schema.enum && !schema.enum.includes(value)) return `${at}: not one of ${schema.enum.join(', ')}`;
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${at}: invalid value`;
  if (schema.maxLength && value.length > schema.maxLength) return `${at}: too long`;
  if (type === 'object') {
    for (const k of schema.required ?? []) if (!(k in value)) return `${at}.${k}: required`;
    for (const [k, v] of Object.entries(value)) {
      const s = schema.properties?.[k];
      if (!s) { if (schema.additionalProperties === false) return `${at}.${k}: not allowed`; continue; }
      const e = check(s, v, `${at}.${k}`); if (e) return e;
    }
  }
  if (type === 'array' && schema.items) for (const [i, v] of value.entries()) { const e = check(schema.items, v, `${at}[${i}]`); if (e) return e; }
  return null;
}

/**
 * deps: { sources (reads/cluster.cjs; tool·toolKinds가 있으면 도구 사용자 항목도), hub (incident-hub), store (hub-store), screen: { get(tab), set(tab, patch) }, approvals (approvals.cjs), report }
 */
function createToolLayer({ sources, hub, store, screen, approvals, report }) {
  const auditLog = store.log('audit');
  /* 도구 사용자 항목: 화면 읽기와 같은 도구 GET(sources.tool)과 Kubernetes GET(sources.kube). Grafana는 질의 경로가 연결된 때만(sources.toolKinds) */
  let itemReader = null;
  const items = () => (itemReader ??= createToolItems({ tool: sources.tool, kube: sources.kube, grafana: (sources.toolKinds ?? []).includes('grafana'), store }));
  const kindsOf = esm('data/kinds.js').then(m => m.KIND_OF);
  const byKind = async kind => { const K = await kindsOf; return Object.values(K).find(k => k.kind === kind || k.plural === kind) ?? null; };
  const owners = o => (o.metadata?.ownerReferences ?? []).map(r => `${r.kind}/${r.name}`);
  const ageOf = o => Date.now() - Date.parse(o.metadata?.creationTimestamp ?? '');
  /* Pod 한 줄: 목록 화면이 보이는 것(준비된 컨테이너 수, 재시작 합, 기다리는·마지막 종료 사유, Node). 모델이 Pod마다 get_resource를 부르지 않게 */
  const podFacts = o => { const cs = [...(o.status?.initContainerStatuses ?? []), ...(o.status?.containerStatuses ?? [])], main = o.status?.containerStatuses ?? [];
    return { ready: { ready: main.filter(c => c.ready).length, total: main.length }, restarts: cs.reduce((n, c) => n + (c.restartCount ?? 0), 0),
      reason: cs.map(c => c.state?.waiting?.reason ?? c.state?.terminated?.reason).find(Boolean) ?? o.status?.reason ?? null,
      lastTerminated: cs.map(c => c.lastState?.terminated?.reason).find(Boolean) ?? null, node: o.spec?.nodeName ?? null }; };

  const TOOLS = {
    list_resources: { input: obj({ cluster: CLUSTER, namespace: str('namespace (omit for all)'), kind: str('kind, e.g. Pod or pods'), labelSelector: str('label selector', { maxLength: 512 }), limit: { type: 'integer', description: 'max rows (default 200)' } }, ['cluster', 'kind']),
      description: 'List Kubernetes resources of one kind (read-only). A Pod row has its ready containers, restarts, waiting or last terminated reason and node. Secrets give metadata only.', source: 'kubernetes',
      async run(a) {
        const k = await byKind(a.kind); if (!k) throw Object.assign(new Error('unknown kind'), { kind: 'invalid_request' });
        const q = new URLSearchParams({ limit: String(Math.min(a.limit ?? 200, 500)), ...(a.labelSelector ? { labelSelector: a.labelSelector } : {}) });
        const r = await sources.kube(a.cluster, k.path(a.namespace && !k.cluster ? encodeURIComponent(a.namespace) : '') + '?' + q);
        return (r.items ?? []).map(o => ({ kind: k.kind, namespace: o.metadata.namespace ?? '', name: o.metadata.name, uid: o.metadata.uid, status: o.status?.phase ?? o.status?.conditions?.at?.(-1)?.type ?? null, age: ageOf(o), owner: owners(o)[0] ?? null,
          ...(k.kind === 'Pod' ? podFacts(o) : {}) }));
      } },
    get_resource: { input: obj({ cluster: CLUSTER, namespace: str('namespace'), kind: str('kind'), name: str('name', { pattern: NAME.source }) }, ['cluster', 'kind', 'name']),
      description: 'Read one Kubernetes object without managedFields; a Secret gives metadata and key names only.', source: 'kubernetes',
      async run(a) {
        const k = await byKind(a.kind); if (!k) throw Object.assign(new Error('unknown kind'), { kind: 'invalid_request' });
        const raw = await sources.kube(a.cluster, `${k.path(a.namespace && !k.cluster ? encodeURIComponent(a.namespace) : '')}/${encodeURIComponent(a.name)}`);
        const o = safeObject(raw, k.kind);
        return { object: o, owner: owners(o)[0] ?? null, conditions: o.status?.conditions ?? [] };
      } },
    list_events: { input: obj({ cluster: CLUSTER, namespace: str('namespace'), involved: obj({ kind: str('kind'), name: str('name'), uid: str('uid') }), type: { type: 'string', enum: ['all', 'Warning', 'Normal'] }, window: WINDOW }, ['cluster', 'window']),
      description: 'Kubernetes events of a window as rows (one per object and reason, counted).', source: 'kubernetes',
      async run(a) {
        const { eventSummary } = await esm('data/incident-model.js'), w = win(a.window);
        const list = await sources.list(a.cluster, 'events', a.namespace ?? '');
        const rows = list.filter(e => !a.involved || ((!a.involved.uid || e.involvedObject?.uid === a.involved.uid) && (!a.involved.name || e.involvedObject?.name === a.involved.name) && (!a.involved.kind || e.involvedObject?.kind === a.involved.kind)));
        return eventSummary(rows, { ...w, type: a.type ?? 'all' });
      } },
    read_logs: { input: obj({ cluster: CLUSTER, namespace: str('namespace'), pod: str('pod name', { pattern: NAME.source }), container: str('container'), previous: { type: 'boolean' }, window: WINDOW, query: str('text to find', { maxLength: 200 }), around: { type: 'integer' }, source: { type: 'string', enum: ['kubernetes', 'loki'] } }, ['cluster', 'namespace', 'pod', 'window']),
      description: 'Read container log lines of one Pod in a window, numbered as in the source; with query, the matching lines and `around` lines on each side. truncated is true when the window held more than was read.', source: a => a.source ?? 'kubernetes',
      async run(a) {
        const { logExcerpt } = await esm('data/log-excerpt.js'), w = win(a.window);
        let lines, truncated = false;
        if (a.source === 'loki') {
          if (![a.namespace, a.pod, a.container ?? 'x'].every(v => LABEL_VALUE.test(v))) throw Object.assign(new Error('invalid label'), { kind: 'invalid_request' });
          lines = (await sources.loki(a.cluster, `{namespace="${a.namespace}", pod="${a.pod}"${a.container ? `, container="${a.container}"` : ''}}`, { ...w, limit: 1000 })).map((l, i) => ({ n: i + 1, at: l.at, text: l.text }));
          truncated = lines.length >= 1000;
        } else {
          /* 구간 시작부터(sinceTime) 읽고 줄 수·바이트 상한에 닿으면 잘렸다고 알린다 */
          const q = new URLSearchParams({ timestamps: 'true', sinceTime: new Date(w.from).toISOString().replace(/\.\d{3}Z$/, 'Z'), tailLines: String(LOG_TAIL), limitBytes: String(LOG_BYTES), ...(a.container ? { container: a.container } : {}), ...(a.previous ? { previous: 'true' } : {}) });
          const text = String(await sources.kube(a.cluster, `/api/v1/namespaces/${encodeURIComponent(a.namespace)}/pods/${encodeURIComponent(a.pod)}/log?${q}`, { raw: true, maxBytes: LOG_BYTES }));
          const all = text.split('\n').filter(Boolean);
          truncated = all.length >= LOG_TAIL || Buffer.byteLength(text) >= LOG_BYTES - 4096;
          lines = all.map((l, i) => { const sp = l.indexOf(' '); return { n: i + 1, at: Date.parse(l.slice(0, sp)) || null, text: l.slice(sp + 1) }; })
            .filter(l => l.at == null || (l.at >= w.from && l.at <= w.to));
        }
        lines = lines.map(l => ({ ...l, level: /\b(error|fatal|panic)\b/i.test(l.text) ? 'ERROR' : /\bwarn/i.test(l.text) ? 'WARN' : 'INFO' }));
        const ex = a.query ? logExcerpt(lines, { key: a.query, around: a.around ?? 2 }) : null;
        return { lines: ex ? ex.rows : lines.slice(-500), hits: ex?.hits ?? [], total: lines.length, truncated: truncated || (!ex && lines.length > 500) };
      } },
    query_metrics: { input: obj({ cluster: CLUSTER, query: str('PromQL', { maxLength: 2000 }), window: WINDOW, step: { type: 'integer', description: 'seconds (default: window / 120)' } }, ['cluster', 'query', 'window']),
      description: 'Prometheus range query (read-only).', source: 'prometheus',
      async run(a) { const w = win(a.window); return { series: await sources.promRange(a.cluster, a.query, { ...w, step: Math.max((a.step ?? Math.max(15, Math.round((w.to - w.from) / 120_000))) * 1000, stepFor(w, 1000)) }) }; } },
    query_logs_count: { input: obj({ cluster: CLUSTER, selector: str('LogQL stream selector, e.g. {namespace="payments"}', { maxLength: 500, pattern: '^\\{[^}]*\\}$' }), window: WINDOW, by: { type: 'string', enum: ['level'] } }, ['cluster', 'selector', 'window']),
      description: 'Loki line counts by level over a window.', source: 'loki',
      async run(a) { return { counts: await sources.lokiCount(a.cluster, a.selector, win(a.window)) }; } },
    list_apps: { input: obj({ cluster: CLUSTER }, ['cluster']), description: 'Argo CD Applications (read from the Application resources).', source: 'kubernetes',
      async run(a) {
        return (await sources.list(a.cluster, 'applications')).map(x => ({ name: x.metadata.name, namespace: x.metadata.namespace, sync: x.status?.sync?.status ?? null, health: x.status?.health?.status ?? null,
          revision: x.status?.sync?.revision ?? null, repo: x.spec?.source?.repoURL ?? null, path: x.spec?.source?.path ?? null, auto: !!x.spec?.syncPolicy?.automated, resources: (x.status?.resources ?? []).length }));
      } },
    app_history: { input: obj({ cluster: CLUSTER, namespace: str('Application namespace'), name: str('Application name', { pattern: NAME.source }), window: WINDOW }, ['cluster', 'namespace', 'name']),
      description: 'Sync history of one Argo CD Application.', source: 'kubernetes',
      async run(a) {
        const x = await sources.get(a.cluster, 'Application', a.namespace, a.name); if (!x) throw Object.assign(new Error('missing'), { kind: 'missing' });
        const w = a.window ? win(a.window) : null;
        return (x.status?.history ?? []).map(h => ({ revision: h.revision, at: h.deployedAt, id: h.id })).filter(h => !w || (Date.parse(h.at) >= w.from && Date.parse(h.at) <= w.to));
      } },
    collect_evidence: { input: obj({ incident: str('incident id'), spec: obj({ kind: { type: 'string', enum: ['pod', 'logs', 'events', 'metric', 'app', 'rule', 'silences'] }, namespace: str('namespace'), name: str('object, alert rule or Application name'), container: str('container'), query: str('PromQL or text', { maxLength: 2000 }), window: WINDOW }, ['kind']) }, ['incident', 'spec']),
      description: 'Read one piece of evidence for an incident and freeze it: the same piece gives back the same number. rule freezes an alerting rule (name, default the incident alert) with its expression; silences freezes the active Alertmanager silences over the incident namespace.',
      source: s => ({ pod: 'kubernetes', logs: 'kubernetes', events: 'kubernetes', metric: 'prometheus', app: 'kubernetes', rule: 'prometheus', silences: 'alertmanager' })[s.spec.kind],
      /* app은 읽는 namespace(기본 argocd)로 범위를 본다: 검사한 namespace와 읽는 namespace가 같아야 한다 */
      scopeOf: a => ({ cluster: hub.get(a.incident)?.cluster, namespace: a.spec.kind === 'app' ? a.spec.namespace ?? 'argocd' : a.spec.namespace ?? hub.get(a.incident)?.target.namespace }),
      async run(a, caller) {
        const inc = hub.get(a.incident); if (!inc) throw Object.assign(new Error('missing'), { kind: 'missing' });
        const id = inc.cluster, s = a.spec, ns = s.namespace ?? inc.target.namespace, now = Date.now(), w = s.window ? win(s.window) : { from: inc.detectedAt - 30 * 60_000, to: now };
        let piece;
        if (s.kind === 'rule' || s.kind === 'silences') { const r = await hub.citeToolItems(inc, { kind: s.kind, name: s.name }); if (!r) throw Object.assign(new Error('missing'), { kind: 'missing' }); return { n: r.n, hash: r.hash }; }
        if (s.kind === 'metric') { if (!s.query) throw Object.assign(new Error('query required'), { kind: 'invalid_request' }); const series = await sources.promRange(id, s.query, { ...w, step: stepFor(w) });
          piece = { kind: 'metric', source: 'prometheus', target: { kind: inc.target.kind, namespace: ns, name: inc.target.name }, window: w, query: s.query, result: { series: series.map(x => ({ ...x, unit: '' })) }, total: series.reduce((n, x) => n + x.samples.length, 0) }; }
        else if (s.kind === 'pod') { const o = await sources.get(id, 'Pod', ns, s.name); if (!o) throw Object.assign(new Error('missing'), { kind: 'missing' });
          piece = { kind: 'object', source: 'kubernetes', target: { kind: 'Pod', namespace: ns, name: s.name, uid: o.metadata.uid }, window: { from: now, to: now }, query: `GET /api/v1/namespaces/${ns}/pods/${s.name}`, result: { object: JSON.stringify(o.status, null, 2) }, total: 1 }; }
        else if (s.kind === 'logs') { const r = await TOOLS.read_logs.run({ cluster: id, namespace: ns, pod: s.name, container: s.container, window: { from: new Date(w.from).toISOString(), to: new Date(w.to).toISOString() }, query: s.query }, caller);
          piece = { kind: 'logs', source: 'kubernetes', key: s.query ?? null, target: { kind: 'Pod', namespace: ns, name: s.name, container: s.container ?? null }, window: w, query: `pod logs ${ns}/${s.name}${s.query ? ` |= "${s.query}"` : ''}`, result: { lines: r.lines.filter(l => !l.gap) }, hits: r.hits, total: r.total, truncated: r.truncated }; }
        else if (s.kind === 'events') { const r = await TOOLS.list_events.run({ cluster: id, namespace: ns, window: { from: new Date(w.from).toISOString(), to: new Date(w.to).toISOString() } });
          piece = { kind: 'events', source: 'kubernetes', target: { kind: inc.target.kind, namespace: ns, name: inc.target.name }, window: w, query: `GET /api/v1/namespaces/${ns}/events`, result: { rows: r.rows.map(x => ({ last: x.last, type: x.type, reason: x.reason, object: `${x.kind}/${x.name}`, count: x.count, message: x.message })) }, total: r.occurrences }; }
        else { if (!s.name) throw Object.assign(new Error('name required'), { kind: 'invalid_request' }); const x = await sources.get(id, 'Application', s.namespace ?? 'argocd', s.name); if (!x) throw Object.assign(new Error('missing'), { kind: 'missing' });
          piece = { kind: 'app', source: 'kubernetes', target: { kind: 'Application', namespace: x.metadata.namespace, name: x.metadata.name }, window: { from: now, to: now }, query: `GET Application ${x.metadata.namespace}/${x.metadata.name}`, result: { object: JSON.stringify(x.status?.history ?? [], null, 2) }, total: (x.status?.history ?? []).length }; }
        const saved = hub.cite(inc, { ...piece, collectedAt: now, sourceState: 'ok' });
        return { n: saved.n, hash: saved.hash };
      } },
    get_evidence: { input: obj({ incident: str('incident id'), n: { type: 'integer' } }, ['incident']), description: 'The frozen evidence pieces of an incident, or one by number.', source: 'wake',
      scopeOf: a => ({ cluster: hub.get(a.incident)?.cluster, namespace: hub.get(a.incident)?.target.namespace }),
      async run(a) { const all = hub.pieces(a.incident).map(({ identity, incident, ...e }) => e); if (a.n == null) return all; const one = all.find(e => e.n === a.n); if (!one) throw Object.assign(new Error('missing'), { kind: 'missing' }); return one; } },
    list_incidents: { input: obj({ cluster: CLUSTER, state: { type: 'string', enum: ['all', 'open', 'mitigated', 'resolved'] }, window: WINDOW }), description: 'Incidents Wake detected (kept 90 days).', source: 'wake',
      /* 저장된 인시던트만: 감지는 허브의 주기 감지(hub.cjs)가 맡고, 목록 읽기가 클러스터 전체를 다시 읽지 않는다 */
      async run(a, caller) { const ns = caller?.scope?.namespaces ?? []; return hub.rows({ cluster: a.cluster, state: a.state, window: a.window }).filter(r => !ns.length || ns.includes(r.ns)); } },
    get_incident: { input: obj({ id: str('incident id') }, ['id']), description: 'The incident workspace: scope, impact, timeline, evidence chain, action candidates, recovery check, audit rows.', source: 'wake',
      scopeOf: a => ({ cluster: hub.get(a.id)?.cluster, namespace: hub.get(a.id)?.target.namespace }),
      async run(a) { const inc = hub.get(a.id); if (!inc) throw Object.assign(new Error('missing'), { kind: 'missing' }); return hub.workspace({ cluster: inc.cluster, id: a.id }); } },
    get_timeline: { input: obj({ incident: str('incident id') }, ['incident']), description: 'The incident timeline: rollouts, ConfigMap changes, Argo CD syncs and symptoms.', source: 'kubernetes',
      scopeOf: a => ({ cluster: hub.get(a.incident)?.cluster, namespace: hub.get(a.incident)?.target.namespace }),
      async run(a) { const inc = hub.get(a.incident); if (!inc) throw Object.assign(new Error('missing'), { kind: 'missing' }); const w = await hub.workspace({ cluster: inc.cluster, id: a.incident });
        return w.timeline.map(m => ({ at: new Date(m.at).toISOString(), kind: m.kind, source: m.lane, title: m.title, text: m.text })); } },
    query_audit: { input: obj({ window: WINDOW, incident: str('incident id'), requester: { type: 'string', enum: ['human', 'ai', 'wake', 'external'] }, transport: { type: 'string', enum: ['desktop', 'mcp', 'api'] }, tool: str('tool name') }, ['window']),
      description: 'Audit rows of tool calls, approvals and detections.', source: 'wake',
      async run(a, caller) { const w = win(a.window), scope = caller.scope;
        return auditLog.list(r => r.at >= w.from && r.at <= w.to && (!a.incident || r.incident === a.incident) && (!a.requester || r.requester?.kind === a.requester) && (!a.transport || r.transport === a.transport) && (!a.tool || r.tool === a.tool)
          && (!scope?.cluster || r.scope === scope.cluster || String(r.scope ?? '').startsWith(scope.cluster + '/'))).sort((x, y) => y.at - x.at).slice(0, 500); } },
    get_screen_state: { input: obj({ tab: str('tab (omit for the open one)') }), description: 'The desktop screen: its address and declared state keys.', source: 'wake',
      async run(a) { return screen.get(a.tab ?? null); } },
    set_screen_state: { input: obj({ tab: str('tab'), patch: { type: 'object', description: 'declared AI keys only' }, open: str('a wake:// address to open beside the screen (a detail or the report)') }), description: 'Set declared AI keys of the desktop screen, or open a pane (report, evidence, detail). Each value shows as a removable chip.', source: 'wake',
      async run(a) { if (a.open && !/^wake:\/\//.test(a.open)) throw Object.assign(new Error('address'), { kind: 'invalid_request' }); return screen.set(a.tab ?? null, a.patch ?? {}, a.open ?? null); } },
    build_report: { input: obj({ incident: str('incident id'), kind: { type: 'string', enum: ['status', 'postmortem', 'check'] }, format: { type: 'string', enum: ['md', 'channel'] } }, ['kind']),
      description: 'Build the incident report from the frozen evidence (a status update while open, a postmortem when resolved).', source: 'wake',
      scopeOf: a => ({ cluster: a.incident ? hub.get(a.incident)?.cluster : undefined, namespace: a.incident ? hub.get(a.incident)?.target.namespace : undefined }),
      async run(a) { if (!a.incident) throw Object.assign(new Error('incident required'), { kind: 'invalid_request' }); const inc = hub.get(a.incident); if (!inc) throw Object.assign(new Error('missing'), { kind: 'missing' });
        return report(await hub.workspace({ cluster: inc.cluster, id: a.incident }), a); } },
    list_alert_rules: { input: obj({ cluster: CLUSTER, namespace: str('keep rules that select or fire in this namespace'), type: { type: 'string', enum: ['alert', 'record'] }, group: str('rule group', { maxLength: 253 }), name: str('rule name', { maxLength: 253 }) }, ['cluster']),
      description: 'Prometheus alerting and recording rules (user-made): expression, for, labels, annotations, health, firing count, a reference and content hash.', source: 'prometheus',
      async run(a) { return items().rules(a.cluster, a); } },
    list_silences: { input: obj({ cluster: CLUSTER, namespace: str('silences whose namespace matchers cover this namespace'), state: { type: 'string', enum: ['active', 'expired', 'all'] }, alert: str('alert name: silences that would mute it in the namespace', { maxLength: 253 }) }, ['cluster']),
      description: 'Alertmanager silences (user-made): matchers, start, end, author, comment. Active and pending by default.', source: 'alertmanager',
      async run(a) { return items().silences(a.cluster, { state: a.state ?? 'active', ...(a.alert ? { labels: { alertname: a.alert, ...(a.namespace ? { namespace: a.namespace } : {}) } } : a.namespace ? { namespace: a.namespace } : {}) }); } },
    get_alert_routing: { input: obj({ cluster: CLUSTER, labels: { type: 'object', description: 'alert labels: also answer the receivers they reach' } }, ['cluster']),
      description: 'Alertmanager routing tree, receiver names with integration kinds, and inhibit rules (no addresses or credentials).', source: 'alertmanager',
      async run(a) { const r = await items().routing(a.cluster); return a.labels ? { ...r, receiversFor: items().receiversFor(r, Object.fromEntries(Object.entries(a.labels).map(([k, v]) => [k, String(v)]))) } : r; } },
    list_sync_windows: { input: obj({ cluster: CLUSTER, app: str('Application name: only whether it is blocked now', { pattern: NAME.source }) }, ['cluster']),
      description: 'Argo CD AppProject sync windows (user-made) with whether each is open now, the Applications a window blocks now, and ApplicationSets.', source: 'kubernetes',
      async run(a) { return items().syncWindows(a.cluster, a); } },
    search_dashboards: { input: obj({ cluster: CLUSTER, query: str('title words', { maxLength: 200 }), tags: { type: 'array', items: str('tag', { maxLength: 100 }) }, limit: { type: 'integer', description: 'max rows (default 50, at most 200)' } }, ['cluster']),
      description: 'Grafana dashboards (user-made) by title words and tags: title, folder, tags, path in Grafana.', source: 'grafana',
      async run(a) { return items().dashboards(a.cluster, a); } },
    propose_action: { input: obj({ incident: str('incident id'), option: str('an action candidate id of the incident (raise-memory, rollback)'),
      target: obj({ cluster: CLUSTER, namespace: str('namespace'), kind: str('kind'), name: str('name') }, ['cluster', 'kind', 'name']),
      change: obj({ title: str('title', { maxLength: 200 }), values: { type: 'array', items: obj({ path: str('dotted path'), before: str('value now'), after: { type: 'string' } }, ['path', 'after']) } }, ['title']) }, ['target']),
      description: 'Propose a change. It only creates a request waiting for a person to approve it in the Wake desktop; nothing runs.', source: 'wake', proposes: true,
      scopeOf: a => ({ cluster: a.target.cluster, namespace: a.target.namespace, kind: a.target.kind }),
      async run(a, caller) { return approvals.propose(a, caller); } },
  };
  for (const [name, t] of Object.entries(TOOLS)) { t.name = name; t.readOnly = !t.proposes; }
  /* 클러스터 전체 항목(namespace로 좁힌 범위는 namespace를 대야 함): 규칙·무음은 namespace로 거르고, 경로·동기화 창·대시보드는 클러스터 범위 */
  const CLUSTER_WIDE = new Set(['list_alert_rules', 'list_silences', 'get_alert_routing', 'list_sync_windows', 'search_dashboards', 'list_apps']);
  const SCREEN = new Set(['get_screen_state', 'set_screen_state']);

  /* 범위: 클러스터 하나, namespace·종류 목록(빈 목록은 전부) */
  async function inScope(tool, args, caller) {
    const scope = caller.scope;
    if (SCREEN.has(tool.name) && (caller.requester?.kind === 'external' || caller.transport !== 'desktop')) return false;
    /* AI와 외부 클라이언트는 범위 없이 부를 수 없다(사람의 화면 읽기만 범위 없음) */
    if (!scope) return !['ai', 'external'].includes(caller.requester?.kind) || SCREEN.has(tool.name);
    const s = tool.scopeOf ? tool.scopeOf(args) : { cluster: args.cluster ?? args.target?.cluster, namespace: args.namespace, kind: args.kind };
    if (tool.name === 'list_incidents' || tool.name === 'query_audit' || SCREEN.has(tool.name)) { if (tool.name === 'list_incidents') args.cluster = scope.cluster; return !s.cluster || s.cluster === scope.cluster; }
    if (!s.cluster || s.cluster !== scope.cluster) return false;
    if (scope.namespaces?.length && (!s.namespace || !scope.namespaces.includes(s.namespace))) return false;
    if (scope.namespaces?.length && CLUSTER_WIDE.has(tool.name) && !['list_alert_rules', 'list_silences'].includes(tool.name)) return false;
    const kind = s.kind ?? args.kind;
    if (kind) { const k = await byKind(kind);
      if (scope.namespaces?.length && k?.cluster) return false; /* namespace 범위는 Node 같은 클러스터 범위 종류를 읽지 못한다 */
      if (scope.kinds?.length && (!k || !scope.kinds.some(x => x === k.kind || x === k.plural))) return false; }
    return true;
  }

  const sizeOf = r => (Array.isArray(r) ? { n: r.length, unit: 'items' } : r?.lines ? { n: r.lines.length, unit: 'lines' } : r?.series ? { n: r.series.reduce((a, s) => a + s.samples.length, 0), unit: 'samples' } : null);
  /** 도구 하나 부르기: 검사 → 범위 → 실행 → 가림 → 감사 한 행 */
  async function call(name, args = {}, caller) {
    const tool = Object.hasOwn(TOOLS, name) ? TOOLS[name] : null;
    const row = { tool: name, action: tool?.proposes ? 'propose' : 'read', requester: caller.requester, ...(caller.client ? { client: caller.client } : {}), transport: caller.transport,
      ...(caller.model ? { model: caller.model } : {}), executor: 'Wake', permission: tool?.proposes ? 'propose' : 'read', target: '', scope: '' };
    const done = (result, { outOfScope, ...extra } = {}) => { if (caller.screen) return; const masked = store.mask(args);
      const entry = { ...row, ...extra, args: masked.value, result, masked: masked.n + (extra.masked ?? 0), summary: T(outOfScope ? 'wake.audit.tool.forbidden' : 'wake.audit.tool', { tool: name }) };
      /* 저장 금지 인자(비밀 필드 등)는 감사 행을 버리지 않고 인자 없이 남긴다 */
      try { auditLog.append(entry); } catch (error) { if (error?.kind !== 'never_store') throw error; auditLog.append({ ...entry, args: { refused: 'never_store' } }); } };
    if (!tool) { done('failed', { error: 'unknown_tool' }); return { error: 'unknown_tool' }; }
    if (!tool.readOnly && !tool.proposes) { done('forbidden'); return { error: 'forbidden' }; }
    /* 읽기 권한으로 부른 AI는 제안도 만들지 못한다(사람의 승인 요청은 권한 ask에서만) */
    if (tool.proposes && caller.requester?.kind === 'ai' && caller.permission !== 'ask') { done('forbidden', { outOfScope: true }); return { error: 'forbidden' }; }
    const invalid = check(tool.input, args ?? {});
    if (invalid) { done('failed', { error: 'invalid_request' }); return { error: 'invalid_request', detail: invalid }; }
    const s = tool.scopeOf ? tool.scopeOf(args) : { cluster: args.cluster ?? args.target?.cluster, namespace: args.namespace ?? args.target?.namespace };
    row.scope = [s.cluster, s.namespace].filter(Boolean).join('/');
    row.target = [args.namespace ?? args.target?.namespace, args.kind ?? args.target?.kind, args.name ?? args.pod ?? args.target?.name ?? args.id ?? args.incident].filter(Boolean).join('/');
    if (args.incident || (name === 'get_incident' && args.id)) row.incident = args.incident ?? args.id;
    /* 부른 쪽의 범위 밖(클러스터·namespace): Kubernetes 권한(403)과 다른 코드와 모델이 읽을 설명. 감사 행은 그대로 범위 밖 거절 */
    if (!(await inScope(tool, args, caller))) {
      done('forbidden', { outOfScope: true });
      return { error: 'out_of_scope', scope: { cluster: caller.scope?.cluster ?? null, namespaces: caller.scope?.namespaces ?? [] },
        detail: 'This call asked for something outside the scope this caller may read (cluster and namespaces above). It is not a Kubernetes permission (RBAC) denial: nothing was asked of the cluster.' };
    }
    const sourceId = typeof tool.source === 'function' ? tool.source(args) : tool.source;
    try {
      const raw = await tool.run(args, caller);
      const { value, n } = store.mask(raw);
      const st = sourceId === 'wake' ? null : sources.sourceState(s.cluster ?? '', sourceId);
      done(tool.proposes ? 'waiting' : 'ok', { masked: n, size: sizeOf(raw), ...(tool.proposes ? { approval: raw.approval } : {}) });
      /* 출처 상태는 SourceState v1 그대로. 허브가 아직 확인하지 않은 출처는 unknown(ok로 올리지 않음); wake(허브 자신의 저장소·화면)는 localSource */
      return { result: value, source: st ?? localSource(name, s.cluster, null), masked: n };
    } catch (error) {
      const code = ['invalid_request', 'missing', 'unconfigured', 'forbidden'].includes(error?.kind) ? error.kind : error?.status === 403 ? 'forbidden' : error?.status === 404 ? 'missing' : 'failed';
      done(code === 'forbidden' ? 'forbidden' : 'failed', { error: code });
      /* 실패도 같은 출처 상태(SourceState v1 전체). 출처가 기록하지 않은 실패(입력 오류 등)는 그 결과의 상태로 */
      if (sourceId === 'wake') return { error: code, source: localSource(name, s.cluster, code) };
      const st = sources.sourceState?.(s.cluster ?? '', sourceId);
      return { error: code, source: st && st.state !== 'ready' ? st : { ...(st ?? { id: sourceId }), state: code === 'unconfigured' || code === 'forbidden' ? code : 'error', error: code } };
    }
  }
  /** 로컬 출처(wake: 허브 저장소, 화면 상태)의 SourceState v1. 저장소 읽기 범위(coverage)는 보관 기간(그 시각부터 지금까지),
   *  화면 상태는 그 순간. 실패는 공통 오류 코드(missing -> not_found, failed -> unavailable)와 이유. null 필드는 모두 이유가 있다 */
  function localSource(tool, cluster, failure) {
    const nowMs = Date.now(), at = new Date(nowMs).toISOString(), screen = /_screen_state$/.test(tool);
    const error = failure == null ? null : { missing: 'not_found', failed: 'unavailable' }[failure] ?? failure;
    const ok = error === null;
    const coverage = ok ? { from: screen ? at : new Date(nowMs - STORE_DAYS * 86_400_000).toISOString(), to: at, missingIntervals: [], partial: false, truncated: false } : null;
    const value = { id: 'wake', cluster: cluster ?? null, target: null, state: ok ? 'ready' : error === 'forbidden' || error === 'unconfigured' ? error : 'error', error,
      observedAt: ok ? at : null, receivedAt: at, lastSuccessAt: ok ? at : null, checkedAt: null, collectionIntervalMs: null,
      retention: screen ? null : { days: STORE_DAYS, of: 'hub-store' }, coverage, last: ok ? nowMs : null, at: nowMs };
    const why = ok ? null : 'read_failed';
    value.reasons = Object.fromEntries(Object.entries({ cluster: 'not_cluster_scoped', target: 'local_store', checkedAt: 'local_store', collectionIntervalMs: 'on_demand',
      retention: 'not_stored', coverage: why, observedAt: why, lastSuccessAt: why, last: why, error: 'none' }).filter(([k, r]) => r && value[k] === null));
    return value;
  }
  const list = () => Object.values(TOOLS).map(t => ({ name: t.name, description: t.description, inputSchema: t.input, readOnly: t.readOnly }));
  return { call, list };
}

module.exports = { createToolLayer };
