/*
 * 연결 확인(첫 실행 연결 카드, 클러스터 설정의 상태 배지가 같은 결과를 씀). 순서대로 하나라도 실패하면 거기서 멈춘다:
 *   1 kubeconfig 항목(context → cluster·user, 서버 주소)      실패: config
 *   2 인증 도구(exec 명령이 이 컴퓨터에 있는지, 사람이 그 명령·인자에 동의했는지)   실패: noAuthTool, needs_consent(command·args·code: 동의 화면이 보일 실제 경로와 인자)
 *   3 서버 닿기(TCP)                                           실패: unreachable
 *   4 서버 인증서(TLS, kubeconfig의 CA로 확인)                  실패: cert
 *   5 인증(SelfSubjectReview, 실패면 401)                        실패: unauthorized (exec 실패 포함: 다시 로그인)
 *   6 버전(지원 범위 1.27 이상)                                  실패: unsupported
 *   7 권한(SelfSubjectAccessReview: Pod 목록 읽기)              실패: forbidden(연결은 되지만 읽을 수 없음)
 *   그 밖의 응답·오류                                           unknown(원문 오류 보기)
 * 결과: { state, step, error?, version?, username?, namespace, identity?: { uid, ref } | null, identityError?: string | null, canListNamespaces?, checkedAt }
 * opts.onStep(name): 각 단계를 시작할 때 알림(authTool, reach, cert, authn, version, perm). 화면의 단계 표시가 실제 진행을 따름
 */
const { K8sError } = require('./k8s.cjs');

const STEP = { config: 1, noAuthTool: 2, needs_consent: 2, unreachable: 3, cert: 4, unauthorized: 5, unsupported: 6, forbidden: 7, unknown: 0 };
const MIN_MINOR = 27; // 지원하는 가장 낮은 쿠버네티스 버전 1.27

async function can(client, verb, resource, namespace, group = '') {
  const r = await client.request('POST', '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview', spec: { resourceAttributes: { verb, resource, group, ...(namespace ? { namespace } : {}) } } });
  return !!r?.status?.allowed;
}

async function probe(createClient, opts = {}) {
  const checkedAt = new Date().toISOString();
  let client;
  try {
    const step = n => opts.onStep?.(n);
    step('authTool');
    client = createClient();
    client.checkExec();
    step('reach'); await client.reach();
    step('cert'); await client.handshake();
    step('authn');
    let username = '';
    try {
      const r = await client.request('POST', '/apis/authentication.k8s.io/v1/selfsubjectreviews', { apiVersion: 'authentication.k8s.io/v1', kind: 'SelfSubjectReview' });
      username = r?.status?.userInfo?.username || '';
    } catch (e) {
      if (e.kind !== 'unknown' || e.status !== 404) throw e;
      await client.request('GET', '/api'); // 1.27 이하: 인증만 확인
    }
    const ns = client.namespace;
    step('version');
    let version = '';
    try { version = (await client.request('GET', '/version')).gitVersion || ''; } catch { /* 버전은 없어도 됨 */ }
    const minor = +(version.match(/^v1\.(\d+)/) || [])[1];
    if (minor && minor < MIN_MINOR) return { state: 'unsupported', step: 6, error: `${version} is older than v1.${MIN_MINOR}`, username, namespace: ns, version, checkedAt };
    step('perm');
    const [pods, nsList, { identity, identityError }] = await Promise.all([
      can(client, 'list', 'pods', ns), can(client, 'list', 'namespaces'),
      client.request('GET', '/api/v1/namespaces/kube-system').then(namespace => {
        const uid = namespace?.metadata?.uid;
        return typeof uid === 'string' && uid ? { identity: { uid, ref: 'Namespace/kube-system' }, identityError: null } : { identity: null, identityError: 'missing_uid' };
      }).catch(e => ({ identity: null, identityError: e.kind || 'unknown' })),
    ]);
    if (!pods) return { state: 'forbidden', step: 7, error: `cannot list pods in namespace "${ns}"`, username, namespace: ns, version, identity, identityError, canListNamespaces: nsList, checkedAt };
    let nodes = null;
    try { if (await can(client, 'list', 'nodes')) nodes = ((await client.request('GET', '/api/v1/nodes')).items || []).length; } catch { /* 노드 수는 없어도 됨 */ }
    return { state: 'ok', step: 7, username, namespace: ns, version, nodes, identity, identityError, canListNamespaces: nsList, checkedAt };
  } catch (e) {
    const state = e instanceof K8sError ? e.kind : 'unknown';
    return { state, step: STEP[state] ?? 0, error: String(e.message || e), command: e.command, ...(state === 'needs_consent' ? { code: e.code, args: Array.isArray(e.args) ? [...e.args] : [] } : {}), namespace: client?.namespace, checkedAt };
  }
}

/* namespace마다 읽기·쓰기·Secret 읽기(권한 페이지 클러스터 권한 탭) */
async function access(client) {
  let namespaces;
  try { namespaces = ((await client.request('GET', '/api/v1/namespaces')).items || []).map(n => n.metadata.name); }
  catch { namespaces = [client.namespace]; }
  const one = async ns => {
    const [read, write, secret] = await Promise.all([can(client, 'list', 'pods', ns), can(client, 'patch', 'deployments', ns, 'apps'), can(client, 'get', 'secrets', ns)]);
    return { ns, read, write, secret };
  };
  return Promise.all(namespaces.slice(0, 30).map(one));
}

module.exports = { probe, access, can };
