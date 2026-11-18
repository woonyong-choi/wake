/*
 * 소유 관계와 조치 계획(순수 함수). 리소스를 누가 관리하는지(Argo CD Application, Helm 릴리스, 없음) 읽고, 바꿀 값을 그 길(Draft PR,
 * helm 명령, kubectl 명령)에 맞는 계획으로 만든다. 인시던트의 조치 후보와 리소스 화면의 조치 제안이 같은 planFor를 쓴다.
 * 짝짓기는 클러스터·namespace·group·kind·이름으로만 한다. 다시 읽은 오브젝트는 새 오브젝트라 오브젝트 동일성으로 정하지 않는다.
 * 글은 만들지 않고 코드(route, checks)와 값만 돌려준다.
 */

const TRACKING = 'argocd.argoproj.io/tracking-id';
const groupOf = apiVersion => (String(apiVersion ?? '').includes('/') ? String(apiVersion).split('/')[0] : '');
const keyOf = r => ({ group: r.group ?? groupOf(r.apiVersion), kind: r.kind, namespace: r.metadata?.namespace ?? r.namespace ?? '', name: r.metadata?.name ?? r.name });
const same = (a, b) => (a.group ?? '') === (b.group ?? '') && a.kind === b.kind && (a.namespace ?? '') === (b.namespace ?? '') && a.name === b.name;

/** an Application deploys to the resource's cluster when its destination names it (by name or server); without a cluster to compare, any does */
const sameCluster = (app, cluster) => {
  if (!cluster) return true;
  const d = app?.spec?.destination ?? {};
  if (d.name && cluster.name) return d.name === cluster.name;
  if (d.server && cluster.server) return d.server === cluster.server;
  return true;
};

/** the Argo CD tracking annotation: `<app>:<group>/<kind>:<namespace>/<name>`, the app written `<namespace>_<name>` when Applications live outside argocd */
function parseTracking(value) {
  const m = /^([^:]+):([^/]*)\/([^:]+):([^/]*)\/(.+)$/.exec(String(value ?? ''));
  if (!m) return null;
  const [app, appNs] = m[1].includes('_') ? [m[1].slice(m[1].indexOf('_') + 1), m[1].slice(0, m[1].indexOf('_'))] : [m[1], null];
  return { app, appNs, target: { group: m[2], kind: m[3], namespace: m[4], name: m[5] } };
}

const argocd = (app, fallback = {}) => {
  const src = app?.spec?.source ?? app?.spec?.sources?.[0] ?? {};
  const automated = app?.spec?.syncPolicy?.automated;
  return { kind: 'argocd', app: app?.metadata?.name ?? fallback.app, namespace: app?.metadata?.namespace ?? fallback.appNs ?? null,
    auto: app ? !!automated && automated.enabled !== false : null, repo: src.repoURL ?? null, path: src.path ?? null,
    revision: app?.status?.sync?.revision ?? app?.status?.sync?.revisions?.[0] ?? null };
};

/**
 * Who manages a resource: { kind: 'argocd', app, namespace, auto, repo, path, revision } | { kind: 'helm', release, namespace, revision?, chart? } | null.
 *  resource: a Kubernetes object (apiVersion, kind, metadata); applications: Argo CD Application objects; helm: releases [{ name, namespace, revision, chart }]
 *  (optional: when given, a release the labels name must be in it); cluster: { name, server } the resource lives in.
 * An Application owns the resource when its status.resources lists the same group, kind, namespace and name, or when the resource's tracking-id
 * annotation names it and the same target (a copied annotation does not count). auto is null when the Application is not readable: treat as automated.
 * Helm owns it through app.kubernetes.io/managed-by=Helm and the meta.helm.sh/release-name and -namespace annotations.
 */
export function ownerOf(resource, { applications = [], helm = null, cluster = null } = {}) {
  if (!resource) return null;
  const me = keyOf(resource), apps = (applications ?? []).filter(a => sameCluster(a, cluster));
  const listed = apps.find(a => (a?.status?.resources ?? []).some(x => same({ group: x.group ?? '', kind: x.kind, namespace: x.namespace ?? '', name: x.name }, me)));
  if (listed) return argocd(listed);
  const t = parseTracking(resource.metadata?.annotations?.[TRACKING]);
  if (t && same(t.target, me)) {
    const app = (applications ?? []).find(a => a?.metadata?.name === t.app && (t.appNs == null || a?.metadata?.namespace === t.appNs));
    if (!app || sameCluster(app, cluster)) return argocd(app, t);
  }
  const labels = resource.metadata?.labels ?? {}, ann = resource.metadata?.annotations ?? {};
  const release = ann['meta.helm.sh/release-name'];
  if (labels['app.kubernetes.io/managed-by'] === 'Helm' && release) {
    const namespace = ann['meta.helm.sh/release-namespace'] ?? me.namespace;
    if (!helm) return { kind: 'helm', release, namespace };
    const r = helm.find(x => x.name === release && x.namespace === namespace);
    return r ? { kind: 'helm', release, namespace, revision: r.revision ?? null, chart: r.chart ?? null } : null;
  }
  return null;
}

/** a dotted path with indexes (spec.template.spec.containers[0].resources.limits.memory) as a JSON pointer (/spec/template/…/0/…) */
const pointer = path => '/' + String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).map(p => p.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
const quote = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
const resourceName = r => `${String(r.kind).toLowerCase()}/${r.metadata?.name ?? r.name}`;

/**
 * One plan for a change to a resource: the route its owner allows, and every value it changes.
 *  resource: a Kubernetes object; change: { id, title, values: [{ path, before, after }], diff?: { path, before, after }, command? };
 *  owner: ownerOf().
 * route: 'pr' for an Application that syncs automatically (or whose sync policy is unknown): the change goes to its repository and path, never as a
 * command against the cluster that the next sync would undo (N2); a change without values (a rollback, a restart) becomes a revert of the synced revision.
 * 'helm' for a Helm release: helm upgrade with --reuse-values and one --set per value. 'command' otherwise: one kubectl JSON patch with every value,
 * or the change's own command when it has no values.
 * checks: codes the screen words ('gitops-auto-sync', 'gitops-sync-unknown', 'git-revert', 'gitops-manual-drift', 'helm-release',
 * 'helm-chart-unknown', 'not-gitops').
 */
export function planFor({ resource, change, owner }) {
  const values = (change?.values ?? []).map(v => ({ path: v.path, before: v.before, after: v.after }));
  const target = { kind: resource?.kind, namespace: resource?.metadata?.namespace ?? '', name: resource?.metadata?.name };
  const base = { id: change?.id ?? null, title: change?.title ?? null, target, values, diff: change?.diff ?? null };
  if (owner?.kind === 'argocd' && owner.auto !== false) {
    const revert = !values.length;
    return { ...base, route: 'pr', repo: owner.repo, path: change?.diff?.path ?? owner.path, app: owner.app, revision: owner.revision, command: null,
      checks: ['gitops-auto-sync', ...(owner.auto == null ? ['gitops-sync-unknown'] : []), ...(revert ? ['git-revert'] : [])] };
  }
  if (owner?.kind === 'helm') {
    const sets = values.map(v => `--set ${quote(`${v.path}=${v.after}`)}`).join(' ');
    const command = owner.chart ? `helm upgrade ${owner.release} ${owner.chart} -n ${owner.namespace} --reuse-values${sets ? ` ${sets}` : ''}` : null;
    return { ...base, route: 'helm', release: owner.release, namespace: owner.namespace, command, checks: ['helm-release', ...(owner.chart ? [] : ['helm-chart-unknown'])] };
  }
  const ns = target.namespace ? ` -n ${target.namespace}` : '';
  const patch = values.length ? `kubectl patch ${resourceName(resource)}${ns} --type=json -p ${quote(JSON.stringify(values.map(v => ({ op: 'replace', path: pointer(v.path), value: v.after }))))}` : change?.command ?? null;
  return { ...base, route: 'command', command: patch, checks: [owner?.kind === 'argocd' ? 'gitops-manual-drift' : 'not-gitops'] };
}
