/*
 * 소유 관계와 조치 계획(순수 함수). 리소스를 누가 관리하는지(Argo CD Application, Helm 릴리스, 없음) 읽고, 바꿀 값을 그 길(Draft PR,
 * helm 명령, kubectl 명령)에 맞는 계획으로 만든다. 인시던트의 조치 후보와 리소스 화면의 조치 제안이 같은 planFor를 쓴다.
 * 짝짓기는 클러스터·namespace·group·kind·이름으로만 한다. 다시 읽은 오브젝트는 새 오브젝트라 오브젝트 동일성으로 정하지 않는다.
 * 글은 만들지 않고 코드(route, checks)와 값만 돌려준다.
 */

import { discloseObject } from './mask.js';

const TRACKING = 'argocd.argoproj.io/tracking-id';
/* a Helm release name (lowercase DNS-like, at most 53) and a namespace name (DNS label) */
const HELM_NAME = /^[a-z0-9](?:[-a-z0-9.]{0,51}[a-z0-9])?$/, NAMESPACE_NAME = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/;
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
 * or the change's own kubectl command when it has no values. The patch fails closed on drift: JSON patch test operations first check the resource UID,
 * its metadata.generation (any spec change since the plan, such as a newer rollout), each guard ({ path, value }, such as the container name at an
 * index; a guard may name its JSON pointer directly) and each value's before, then write (value.op 'add' for a field that may be absent, else
 * 'replace'), then the change's own patch operations (change.patch, as rollbackChange makes).
 * context: the kube context the plan was made for; every kubectl and helm command names it (never the operator's current context). Without a
 * context a write route has no command (check 'context-unbound').
 * 'manual' for a manual step (change.manual): the check command only, no value, no write.
 * checks: codes the screen words ('gitops-auto-sync', 'gitops-sync-unknown', 'git-revert', 'gitops-manual-drift', 'helm-release',
 * 'helm-chart-unknown', 'helm-previous-release', 'helm-scope-unknown', 'not-gitops', 'manual-step', 'context-unbound').
 * preview: the command as shown and given to a model, its patch values passed through the disclosure policy (data/mask.js discloseObject).
 */
export function planFor({ resource, change, owner, context = null }) {
  const values = (change?.values ?? []).map(v => ({ path: v.path, before: v.before, after: v.after, ...(v.op ? { op: v.op } : {}) }));
  const target = { kind: resource?.kind, namespace: resource?.metadata?.namespace ?? '', name: resource?.metadata?.name };
  const guards = (change?.guards ?? []).map(g => ({ path: g.path, value: g.value, ...(g.pointer ? { pointer: g.pointer } : {}) })), extra = change?.patch ?? [];
  const base = { id: change?.id ?? null, title: change?.title ?? null, target, values, guards, diff: change?.diff ?? null };
  /* a manual step (change.manual): the fix lies outside what Wake may change (a Secret value, registry credentials, a quota policy). It carries the
     read-only command to check with, changes no value and takes no write route whoever owns the resource */
  if (change?.manual) return { ...base, values: [], guards: [], diff: null, route: 'manual', command: change.command ?? null, checks: ['manual-step'] };
  if (owner?.kind === 'argocd' && owner.auto !== false) {
    const revert = !values.length;
    return { ...base, route: 'pr', repo: owner.repo, path: change?.diff?.path ?? owner.path, app: owner.app, revision: owner.revision, command: null,
      checks: ['gitops-auto-sync', ...(owner.auto == null ? ['gitops-sync-unknown'] : []), ...(revert ? ['git-revert'] : [])] };
  }
  const unbound = context ? [] : ['context-unbound'];
  if (owner?.kind === 'helm' && change?.rollback) {
    /* the release scope must be a Helm release name and a namespace name (strict, then quoted): anything else is not put in a command */
    if (!HELM_NAME.test(owner.release ?? '') || !NAMESPACE_NAME.test(owner.namespace ?? '')) return { ...base, values: [], route: 'helm', release: owner.release ?? null, namespace: owner.namespace ?? null, command: null, checks: ['helm-release', 'helm-scope-unknown', ...unbound] };
    /* a Helm-owned Deployment rolls back as its release: helm rollback to the revision before the current one when a release history is given
       (owner.history). Wake does not read the release Secrets (RULE-SECRET); without that history the revision is left out and Helm itself rolls back
       to the previous release at run time (check 'helm-previous-release': the target is resolved then, not in the plan) */
    const prev = Math.max(...(owner.history ?? []).map(h => Number(h.revision)).filter(r => Number.isFinite(r) && r < Number(owner.revision)), -Infinity), named = Number.isFinite(prev);
    const command = context ? `helm rollback ${quote(owner.release)}${named ? ` ${prev}` : ''} -n ${quote(owner.namespace)} --kube-context ${quote(context)} --wait` : null;
    return { ...base, values: [], route: 'helm', release: owner.release, namespace: owner.namespace, revision: named ? prev : null, command,
      checks: ['helm-release', ...(named ? [] : ['helm-previous-release']), ...unbound] };
  }
  if (owner?.kind === 'helm') {
    const sets = values.map(v => `--set ${quote(`${v.path}=${v.after}`)}`).join(' ');
    const command = owner.chart && context ? `helm upgrade ${owner.release} ${owner.chart} -n ${owner.namespace} --reuse-values${sets ? ` ${sets}` : ''} --kube-context ${quote(context)}` : null;
    return { ...base, route: 'helm', release: owner.release, namespace: owner.namespace, command, checks: ['helm-release', ...(owner.chart ? [] : ['helm-chart-unknown']), ...unbound] };
  }
  const ns = target.namespace ? ` -n ${target.namespace}` : '';
  const uid = resource?.metadata?.uid, generation = resource?.metadata?.generation;
  const ops = [...(uid ? [{ op: 'test', path: '/metadata/uid', value: uid }] : []), ...(generation != null ? [{ op: 'test', path: '/metadata/generation', value: generation }] : []),
    ...guards.map(g => ({ op: 'test', path: g.pointer ?? pointer(g.path), value: g.value })),
    ...values.filter(v => v.before != null).map(v => ({ op: 'test', path: pointer(v.path), value: v.before })), ...values.map(v => ({ op: v.op ?? 'replace', path: pointer(v.path), value: v.after })), ...extra];
  const own = change?.command ? `${change.command} --context ${quote(context)}` : null;
  const command = !context ? null : values.length || extra.length ? `kubectl patch ${resourceName(resource)}${ns} --type=json -p ${quote(JSON.stringify(ops))} --context ${quote(context)}` : own;
  /* what is shown and given to a model (a historical template may carry literal env values): the same command with the patch operations disclosed */
  const preview = command && extra.length ? `kubectl patch ${resourceName(resource)}${ns} --type=json -p ${quote(JSON.stringify(discloseObject(ops).value))} --context ${quote(context)}` : command;
  return { ...base, route: 'command', command, preview, checks: [owner?.kind === 'argocd' ? 'gitops-manual-drift' : 'not-gitops', ...unbound] };
}

/**
 * A rollback of a Deployment to an earlier ReplicaSet, as a change for planFor: the Deployment's spec.template becomes that ReplicaSet's template
 * (without its pod-template-hash label, which the controller adds), guarded so that it applies only to the same object (UID), at the same
 * metadata.generation (no rollout since the plan) and on the revision it was planned against. Unlike kubectl rollout undo it cannot land on a
 * same-name replacement or undo a newer rollout. Returns { id, title, revision (the ReplicaSet's), guards, patch, values: [] }, or null when the Deployment
 * lacks its UID, generation or revision annotation (no guard, no rollback).
 */
export function rollbackChange({ deployment, to, title = 'rollback' }) {
  const REVISION = 'deployment.kubernetes.io/revision';
  const template = structuredClone(to?.spec?.template ?? {});
  if (template.metadata?.labels) delete template.metadata.labels['pod-template-hash'];
  const current = deployment?.metadata?.annotations?.[REVISION];
  /* every guard is required: without the UID, the generation and the live revision the patch could land on something else */
  if (!deployment?.metadata?.uid || deployment.metadata.generation == null || current == null) return null;
  return { id: 'rollback', title, rollback: true, revision: Number(to?.metadata?.annotations?.[REVISION]) || null, values: [],
    guards: [{ path: `metadata.annotations.${REVISION}`, pointer: `/metadata/annotations/${REVISION.replace(/~/g, '~0').replace(/\//g, '~1')}`, value: current }],
    patch: [{ op: 'replace', path: '/spec/template', value: template }] };
}
