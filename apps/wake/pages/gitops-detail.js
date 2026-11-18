/*
 * GitOps 상세 칸(시뮬레이션 appDetail()): 주소 cluster/:cluster/gitops/:ns/:kind/:name.
 * Application·Kustomization: 머리(이름 · Sync · Health · Application · namespace · 클러스터) → 경고 줄(소유 워크로드가 준비되지 않음, N3 · 차이 출처 끊김)
 *  → 상태 막대(Sync · Health · Revision · 자동 동기화 · 저장소) → 구간 → 동기화 이력(타임라인 + 표) → 마지막 변경(바뀐 파일 트리 M·A·D + 파일 차이, − 클러스터 + Git)
 *  → 리소스 상태(Application → 워크로드 → Pod 상태 흐름).
 */
import config from '../app.config.js';
import { bootPage, components as C, html, lineDiff, service, hasService, text } from '../../../kit/page/index.js';
import { sourceOff } from '../data/index.js';
import { status, num } from './parts.js';
import { when } from './incident-parts.js';
import { clusterNameOf, sourceLines, readRow, stateCell, healthCell } from './view-parts.js';
import { contract, syncHistory, shortRev, ownedWarnings } from '../data/gitops.js';
import { KIND_OF } from '../data/kinds.js';
import { workloadOf, podTone, windowOf, CHANGE_LANES, DAY } from '../data/home.js';

const A = (...p) => 'wake://' + p.map(encodeURIComponent).join('/');
const PLURAL = { Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets' };
const W = { at: 'calc(var(--space-40) * .9)', rev: 'calc(var(--space-16) * 1.3)' };

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let phase = 'loading', gitops = null, app = null, workloads = [], pods = [], diff = null, failure = null;
  const st = { range: { preset: '7d' }, file: '' }, folded = {};
  const sources = sourceLines(ctx, id);
  const now = () => Date.now();
  async function load() {
    phase = 'loading'; ctx.update();
    try {
      gitops = await data.get('gitops', { cluster: id });
      const apps = contract(gitops?.repos).applications.filter(a => a.binding.cluster_id === id && a.name === params.name && (params.ns === '_all' || a.binding.namespace === params.ns));
      app = (ctx.query.uid ? apps.find(a => a.sourceIdentity?.uid === ctx.query.uid) : null) ?? apps[0] ?? null;
      const kinds = ['deployments', 'statefulsets', 'daemonsets'];
      workloads = (await Promise.all(kinds.map(k => data.get('resources', { cluster: id, ns: '_all', kind: k }).then(l => l.map(w => ({ ...w, kind: KIND_OF[k].kind }))).catch(() => [])))).flat();
      pods = app ? await data.get('resources', { cluster: id, ns: app.binding.namespace || '_all', kind: 'pods' }).catch(() => []) : [];
      if (app) void readDiff();
      phase = app ? 'ready' : 'missing';
    } catch (e) { failure = e; phase = e?.kind === 'unconfigured' ? 'unconfigured' : e?.status === 403 ? 'forbidden' : 'error'; }
    void sources.read().then(() => ctx.update());
    ctx.update();
  }
  /* 차이: Argo CD API(읽기 전용 계정이 있을 때)에서 한 번 */
  async function readDiff() {
    if (app.diffState === 'available' && Array.isArray(app.diffFiles)) { diff = { state: 'available', files: app.diffFiles }; return; }
    const tools = await data.get('clusterTools', { cluster: id, discovery: {} }).catch(() => []);
    const tool = tools.find(x => x.kind === 'argocd' && x.raw?.bindingId)?.raw;
    if (!hasService() || app.controller !== 'argocd' || app.multiSource || !app.sourceIdentity?.uid || !app.revision) { diff = { state: app.controller === 'flux' || app.multiSource ? 'unsupported' : 'notQueried' }; ctx.update(); return; }
    if (!tool) { diff = { state: 'unconfigured' }; ctx.update(); return; }
    diff = { state: 'loading' }; ctx.update();
    const { name, namespace, uid } = app.sourceIdentity;
    const r = await service('gitops.diff', { id, tool, application: { name, namespace, uid, revision: app.revision } }).catch(() => ({ state: 'error' }));
    diff = { state: r?.state || 'error', files: r?.files }; ctx.update();
  }

  const range = () => C.timeRange.render({ id: 'gitops-detail-range', value: st.range, action: 'wake.gd.range', fallback: '7d', retention: 90 * DAY / 1000, now: Math.floor(now() / 1000), label: t('wake.view.range') });
  const card = (key, label, items, body, open = true) => C.summaryBar.render({ label, open: key in folded ? !folded[key] : open, /* folded: 사람이 접은 카드(true)·편 카드(false) */ toggle: { action: 'wake.gd.fold', arg: key }, items: [{ id: 't', label: '', value: label }, ...items], body });
  const headState = a => (a.health && a.health !== 'Healthy' ? stateCell(a.health) : a.sync !== 'Synced' && a.sync !== 'Ready' ? stateCell(a.sync) : ownedWarnings(a, workloads).length ? C.statusIcon.render({ kind: 'warn', text: a.health || a.sync }) : stateCell(a.sync));

  /* ---------- Application ---------- */
  function appHead() {
    const warns = ownedWarnings(app, workloads), argo = sources.of('argocd', now());
    const rows = [
      ...warns.slice(0, 2).map(w => ({ id: 'own-' + w.name, tone: 'warn', attention: true, text: [`${w.kind} ${w.name}`, w.reason, `Ready ${num(w.ready)} · Desired ${num(w.desired)}`].join(' · '),
        end: PLURAL[w.kind] ? C.button.render({ label: `${w.kind} ${w.name}`, icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address: A('cluster', id, 'ns', w.ns, PLURAL[w.kind], w.name) } }) : '' })),
      ...(app.controller === 'argocd' && argo?.stale ? [{ id: 'argo', icon: argo.state === 'perm' ? 'lock' : undefined, tone: argo.state === 'perm' ? 'idle' : 'error', text: [t(argo.state === 'perm' ? 'wake.view.toolPerm' : argo.state === 'idle' ? 'wake.view.toolOff' : 'wake.view.toolDown', { tool: 'Argo CD' }), argo.last ? t('wake.view.lastCollected', { at: when(argo.last, 0) }) : ''].filter(Boolean).join(' · ') }] : []),
    ];
    return html`${C.pageHeader.render({ icon: app.controller === 'flux' ? 'brand-flux' : 'tool-gitops', title: app.name, tip: app.name, size: 'sm', after: headState(app),
      context: [app.kind || 'Application', app.binding.namespace, clusterNameOf(ctx, id)].filter(Boolean).join(' · ') })}${C.headLines.render({ rows })}`;
  }
  function appBody() {
    const hist = syncHistory(app), { from, to } = windowOf(st.range, now()), shown = hist.filter(h => h.at >= from && h.at <= to), failed = hist.filter(h => h.result[0] === 'error').length;
    const statusBar = C.summaryBar.render({ label: t('wake.git.state'), items: [{ id: 's', label: 'Sync', value: stateCell(app.sync) }, ...(app.health ? [{ id: 'h', label: 'Health', value: healthCell({ health: app.health, warn: ownedWarnings(app, workloads) }) }] : []),
      ...(app.revision ? [{ id: 'v', label: 'Revision', value: shortRev(app.revision) }] : []), ...(app.auto != null ? [{ id: 'a', label: t('wake.git.autoSync'), value: t(app.auto ? 'wake.git.on' : 'wake.git.off') }] : []),
      ...(app.manifest_path ? [{ id: 'r', label: t('wake.git.repo'), value: [contract(gitops.repos).repositories.find(r => r.repository_id === app.repository_id)?.repo_ref, app.manifest_path].filter(Boolean).join(' · ') }] : [])] });
    const sec = ms => Math.floor(ms / 1000);
    const timeline = C.changeTimeline.render({ label: t('wake.git.syncHistory'), from: sec(from), to: sec(to) + 60, now: sec(now()), zoomAction: 'wake.gd.zoom',
      lanes: CHANGE_LANES.map(([lane, icon]) => ({ id: lane, label: t(`wake.inc.lane.${lane}`), icon })),
      marks: hist.map(h => ({ id: h.id, lane: h.result[0] === 'error' ? 'symptom' : 'deploy', at: sec(h.at), tone: h.result[0] === 'error' ? 'danger' : h.result[0] === 'warn' ? 'warn' : 'info', tip: { time: when(h.at, now()), kind: h.result[1], title: `${app.name} → ${shortRev(h.revision)}`, text: h.by } })) });
    const table = shown.length ? C.dataTable.render({ clip: true, rowKey: 'id', rows: shown, reveal: true, columns: [
      { id: 'at', label: t('wake.git.time'), time: true, width: W.at, cell: h => when(h.at, now()) },
      { id: 'revision', label: 'Revision', kind: 'mono', width: W.rev, cell: h => shortRev(h.revision) },
      { id: 'result', label: t('wake.git.result'), fit: true, width: 'calc(var(--space-16) * 2.4)', cell: h => (h.result[0] === 'busy' ? C.statusIcon.render({ kind: 'busy', text: h.result[1] }) : status([h.result[0] === 'error' ? 'danger' : h.result[0], h.result[1]])) },
      ...(shown.some(h => h.by) ? [{ id: 'by', label: t('wake.git.by'), muted: true }] : [])] }) : C.emptyState.render({ title: t('wake.git.noSyncs'), variant: 'line' });
    const history = card('sync', t('wake.git.syncHistory'), [{ id: 'n', label: '', value: num(hist.length) }, ...(failed ? [{ id: 'f', label: t('wake.git.failed'), value: num(failed), tone: 'danger' }] : [])], html`${timeline}${table}`);
    return html`${statusBar}${C.listToolbar.render({ time: range() })}${history}${diffCard()}${resourceCard()}`;
  }
  const DIFF_TEXT = { loading: 'wake.res.loading', forbidden: 'wake.flow.c.forbidden', unauthorized: 'wake.flow.c.unauthorized', unsupported: 'wake.gitops.diffUnsupported', unconfigured: 'wake.gitops.diffUnconfigured', verified_empty: 'wake.gitops.same', timeout: 'wake.flow.c.timeout', notQueried: 'wake.gitops.notQueried' };
  const DIFF_QUIET = new Set(['available', 'loading', 'unsupported', 'unconfigured', 'verified_empty', 'notQueried']);
  function diffCard() {
    const files = diff?.state === 'available' ? diff.files ?? [] : [], label = t('wake.gitops.diff');
    const rev = app.revision ? [{ id: 'r', label: 'Revision', value: shortRev(app.revision) }] : [];
    /* 읽지 못한 차이(인증·권한·시간 초과·오류): 파일 수 0이 아니라 원인 · 다시 시도 · Argo CD 연결 설정 */
    if (diff && !DIFF_QUIET.has(diff.state)) {
      const why = t(DIFF_TEXT[diff.state] ?? 'wake.find.c.read');
      return card('diff', label, [...rev, { id: 'x', label: '', value: C.button.render({ label: t('wake.flow.a.retry'), size: 'sm', variant: 'secondary', action: 'wake.gd.diff' }), priority: 9 }],
        C.staleLine.render({ kind: ['forbidden', 'unauthorized'].includes(diff.state) ? 'perm' : 'error', text: why, action: { label: t('wake.ci.settings'), action: 'kit.navigate', arg: { address: `wake://settings/cluster-${encodeURIComponent(id)}` } } }));
    }
    const items = [...rev, ...(diff?.state === 'available' ? [{ id: 'f', label: t('wake.git.files'), value: num(files.length) }] : [])];
    if (!files.length) return card('diff', label, items, C.emptyState.render({ title: t(DIFF_TEXT[diff?.state] ?? (diff?.state === 'available' ? 'wake.gitops.same' : 'wake.find.c.read')), variant: 'line' }), false);
    const cur = files.find(f => f.file === st.file) ?? files[0], word = k => t(`wake.gitops.change.${k}`);
    const tree = C.fileTree.render({ action: 'wake.gd.file', current: cur.file, nodes: [{ id: '_app', name: app.name, icon: app.controller === 'flux' ? 'brand-flux' : 'tool-gitops', end: headState(app), open: true,
      children: files.map(f => ({ id: f.file, name: f.file, icon: KIND_OF[PLURAL[f.kind]]?.icon ?? 'file-text', letter: f.change, letterLabel: word(f.change) })) }] });
    const code = C.codeBlock.render({ path: `${app.manifest_path ? app.manifest_path + '/' : ''}${cur.file}`, tag: C.fileTree.letter(cur.change, word(cur.change)), text: lineDiff(cur.live ?? '', cur.git ?? ''), diff: true, syntax: 'yaml', file: `${app.name}-${cur.file}` });
    const argo = sources.of('argocd', now());
    const stale = argo?.stale && app.controller === 'argocd' ? C.staleLine.render({ kind: argo.state === 'perm' ? 'perm' : 'error', text: [t('wake.git.diffAt'), argo.last ? when(argo.last, 0) : ''].filter(Boolean).join(' · ') }) : '';
    return card('diff', label, items, html`${stale}${tree}${C.value.render({ text: t('wake.gitops.dir'), size: 'xs' })}${code}`);
  }
  /* Application → 워크로드 → Pod 상태(Pod 수) */
  function resourceCard() {
    const mine = workloads.filter(w => (app.deployment?.resources?.items ?? []).some(x => x.kind === w.kind && x.name === w.name && (x.namespace ?? '') === w.ns) || (!app.deployment?.resources?.items?.length && w.application === app.name));
    const groups = mine.map(w => ({ w, pods: pods.filter(p => p.ns === w.ns && workloadOf(p).name === w.name && (workloadOf(p).kind === w.kind)) })).filter(g => g.pods.length);
    if (!groups.length) return '';
    const all = groups.flatMap(g => g.pods), bad = all.filter(p => !['ok', 'neutral'].includes(p.status?.[0])).length, states = [...new Set(all.map(p => p.status?.[1] ?? 'Unknown'))];
    const toneOf = s => podTone(all.find(p => (p.status?.[1] ?? 'Unknown') === s));
    const HUE = { warn: '--warning', fail: '--destructive' };
    const g = { mode: 'relation', visual: 'filledOutline', stack: true, stretch: true, fade: true, live: true, label: t('wake.git.resState'), gid: 'flg-gitops-app', width: 920, height: 300, columns: [0, 380, 804], bar: 56,
      stateLabels: { ok: 'Ready', warn: 'NotReady', fail: t('wake.view.podFailing'), idle: 'Completed' },
      nodes: [{ id: 'app', col: 0, y: 0, h: 0, label: app.name, value: num(all.length), icon: 'tool-gitops', state: app.sync === 'Synced' || app.sync === 'Ready' ? 'ok' : 'warn', tone: 'soc' },
        ...groups.map((x, i) => { const s = x.w.status?.[0] === 'ok' ? 'ok' : 'warn'; return { id: 'w-' + x.w.name, col: 1, y: i + 1, h: 0, label: `${x.w.kind} ${x.w.name}`, value: num(x.pods.length), icon: KIND_OF[PLURAL[x.w.kind]]?.icon, state: s, ...(HUE[s] ? { hue: HUE[s] } : { tone: 'other' }),
          action: 'kit.navigate', arg: { address: A('cluster', id, 'ns', x.w.ns, PLURAL[x.w.kind], x.w.name) } }; }),
        ...states.map((s, i) => ({ id: 's-' + s, col: 2, y: 20 + i, h: 0, label: s, value: num(all.filter(p => (p.status?.[1] ?? 'Unknown') === s).length), icon: toneOf(s) === 'ok' ? 'circle-check' : 'exclamation-triangle', state: toneOf(s), ...(HUE[toneOf(s)] ? { hue: HUE[toneOf(s)] } : {}) }))],
      links: [...groups.map(x => ({ from: 'app', to: 'w-' + x.w.name, fromOffset: 0, toOffset: 0, size: x.pods.length, amount: x.pods.length, value: `Pod ${num(x.pods.length)}`, state: x.w.status?.[0] === 'ok' ? 'ok' : 'warn' })),
        ...groups.flatMap(x => states.map(s => [s, x.pods.filter(p => (p.status?.[1] ?? 'Unknown') === s).length]).filter(([, n]) => n).map(([s, n]) => ({ from: 'w-' + x.w.name, to: 's-' + s, fromOffset: 0, toOffset: 0, size: n, amount: n, value: num(n), state: toneOf(s) })))] };
    return card('res', t('wake.git.resState'), [{ id: 'n', label: 'Pod', value: num(all.length) }, { id: 'b', label: t('wake.view.bad'), value: num(bad), ...(bad ? { tone: 'danger' } : {}) }], C.flowGraph.render(g), true);
  }

  const empty = () => (phase === 'loading' ? readRow(t, 'loading', 'wake.gd.retry') : phase === 'missing' ? C.emptyState.render({ icon: 'tool-gitops', plainIcon: true, title: t('wake.git.gone') })
    : phase === 'unconfigured' ? C.emptyState.render({ icon: 'plug', plainIcon: true, title: text(sourceOff(failure?.source ?? 'kubernetes')) }) : readRow(t, phase, 'wake.gd.retry'));
  const header = () => (phase !== 'ready' ? C.pageHeader.render({ icon: 'tool-gitops', title: params.name, size: 'sm', context: [params.kind, params.ns === '_all' ? '' : params.ns, clusterNameOf(ctx, id)].filter(Boolean).join(' · ') }) : appHead());
  const bodyOf = () => (phase !== 'ready' ? empty() : appBody());
  void load();
  return {
    render: () => html`${C.pageColumn.render({ width: 'list', header: true, children: header() })}${C.pageColumn.render({ width: 'list', children: bodyOf(), scroll: true })}`,
    meta: () => ({ title: params.name, icon: 'tool-gitops', context: { icon: 'tool-gitops', title: params.name, sub: [params.kind, clusterNameOf(ctx, id)].join(' · ') } }),
    afterRender: root => { root.dataset.wakeView = 'detail'; },
    actions: {
      'wake.gd.retry': () => load(),
      'wake.gd.diff': () => (app ? readDiff() : undefined),
      'wake.gd.fold': a => { folded[a.arg] = !a.open; },
      'wake.gd.file': a => { if (a.arg !== '_app') { st.file = String(a.arg); ctx.update(); } },
      'wake.gd.range': a => { st.range = a.preset ? { preset: a.preset } : { from: a.from, to: a.to, live: !!a.live }; ctx.update(); },
      'wake.gd.zoom': a => { if (Number.isFinite(a.from) && Number.isFinite(a.to)) { st.range = { from: Math.floor(a.from), to: Math.ceil(a.to), live: false }; ctx.update(); } },
    },
  };
}, { scroll: false });
