/*
 * 필요한 권한: 확인이 막힌 실제 원인(쿠버네티스 403 메시지, 연결 확인의 Pod 목록 읽기)에서 빠진 권한 하나(누가, 무엇을, 어디서)를 읽고,
 * 그 권한만 주는 kubectl 명령과 Role·RoleBinding(또는 ClusterRole·ClusterRoleBinding) YAML을 만든다. Wake는 읽기만 하므로 동사는 늘 get·list·watch.
 * 화면: 연결 행의 "필요한 권한 보기" 시트(복사, 직접 적용은 내 자격이 RoleBinding을 만들 수 있을 때만). 논리 검사: perm.test.mjs
 */
const READ = ['get', 'list', 'watch'];

/** 403 메시지(또는 연결 확인의 오류 한 줄) -> { user, verb, resource, group, namespace } | null */
export function parseForbidden(msg, fallback = {}) {
  const s = String(msg || '');
  const k = /User "([^"]+)" cannot (\w+) resource "([^"]+)" in API group "([^"]*)"(?: in the namespace "([^"]+)"| at the cluster scope)?/.exec(s);
  if (k) return { user: k[1], verb: k[2], resource: k[3], group: k[4], namespace: k[5] || '' };
  const p = /cannot (\w+) ([\w.-]+) in namespace "([^"]+)"/.exec(s);
  if (p) { const [resource, ...g] = p[2].split('.'); return { user: fallback.user || '', verb: p[1], resource, group: g.join('.'), namespace: p[3] }; }
  if (fallback.resource) return { user: fallback.user || '', verb: fallback.verb || 'list', resource: fallback.resource, group: fallback.group || '', namespace: fallback.namespace || '' };
  return null;
}

const safe = s => String(s || '').toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'user';
const q = v => `'${String(v).replace(/'/g, `'\\''`)}'`;

/**
 * 빠진 권한 하나를 주는 방법.
 * @param {{user, resource, group, namespace}} need  @param {string} context kubeconfig context(명령의 --context)
 * @returns {{ name, scope: 'namespace'|'cluster', resourceRef, kubectl, yaml }}
 */
export function grantOf(need, context) {
  const ns = need.namespace, res = need.group ? `${need.resource}.${need.group}` : need.resource, name = `wake-read-${safe(need.resource)}`;
  const user = need.user || 'USER', ctx = context ? ` --context ${q(context)}` : '';
  const rule = `- apiGroups: [${JSON.stringify(need.group || '')}]\n  resources: [${JSON.stringify(need.resource)}]\n  verbs: [${READ.map(v => JSON.stringify(v)).join(', ')}]`;
  const subject = `subjects:\n- kind: User\n  name: ${JSON.stringify(user)}\n  apiGroup: rbac.authorization.k8s.io`;
  if (ns) return { name, scope: 'namespace', resourceRef: res,
    kubectl: `kubectl create role ${q(name)} --verb=${READ.join(',')} --resource=${q(res)} -n ${q(ns)}${ctx}\nkubectl create rolebinding ${q(`${name}-${safe(user)}`)} --role=${q(name)} --user=${q(user)} -n ${q(ns)}${ctx}`,
    yaml: `apiVersion: rbac.authorization.k8s.io/v1\nkind: Role\nmetadata:\n  name: ${name}\n  namespace: ${ns}\nrules:\n${rule}\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: RoleBinding\nmetadata:\n  name: ${name}-${safe(user)}\n  namespace: ${ns}\nroleRef:\n  apiGroup: rbac.authorization.k8s.io\n  kind: Role\n  name: ${name}\n${subject}` };
  return { name, scope: 'cluster', resourceRef: res,
    kubectl: `kubectl create clusterrole ${q(name)} --verb=${READ.join(',')} --resource=${q(res)}${ctx}\nkubectl create clusterrolebinding ${q(`${name}-${safe(user)}`)} --clusterrole=${q(name)} --user=${q(user)}${ctx}`,
    yaml: `apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: ${name}\nrules:\n${rule}\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRoleBinding\nmetadata:\n  name: ${name}-${safe(user)}\nroleRef:\n  apiGroup: rbac.authorization.k8s.io\n  kind: ClusterRole\n  name: ${name}\n${subject}` };
}

/** 내 자격이 이 권한을 직접 줄 수 있는지 물을 SelfSubjectAccessReview 대상(RoleBinding 또는 ClusterRoleBinding 만들기) */
export const canGrantCheck = need => need.namespace
  ? { verb: 'create', group: 'rbac.authorization.k8s.io', resource: 'rolebindings', namespace: need.namespace }
  : { verb: 'create', group: 'rbac.authorization.k8s.io', resource: 'clusterrolebindings', namespace: '' };
