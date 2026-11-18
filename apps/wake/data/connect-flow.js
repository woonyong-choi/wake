/*
 * 연결 하나의 기준(모든 연결이 같음: 클러스터 context, 클라우드 명령, kubeconfig 파일·붙여넣기, 토큰, 관측 도구, GitOps, AI 공급자, 알림).
 *   연결 = 대상 + 방법 + 단계 목록 + 상태 + 정책(범위·자격 방식·권한 수준·Secret 읽기·관리자·사용자·만든 사람).
 *   같은 뜻의 단계는 같은 이름(STEP_LABEL), 상태는 한 집합(STATES), 같은 동작은 같은 버튼 글자(ACTIONS).
 * 각 단계는 먼저 이미 되어 있는지 보고, 되어 있으면 바로 완료로 채우고 다음으로 넘어간다. 되어 있지 않은 단계에서만 멈추고 그 자리에
 * 원인과 그 단계의 동작 하나(설치, 로그인, 승인, 입력 칸으로, 이 단계부터 다시 시도)와 원문 보기를 보인다. 다시 시도는 사람이 눌렀을 때만.
 * 명령은 사람이 누른 뒤에만, 아래 터미널 패널에서 Wake가 직접 띄운 프로세스로 실행하고(사용자 로그인 셸의 PATH), 성공·실패는
 * 프로세스 종료 코드와 아래 판정 표로만 정한다. 출력은 원인 판정에만 쓰고 저장하지 않으며, 작업 기록에는 비밀 값을 가린 명령만 남긴다.
 * 이 파일은 표(데이터)와 그 표를 따르는 진행기 하나다. 화면은 kit 연결 행(행 끝 상태 묶음 flow-status)이 그림. 논리 검사: connect-flow.test.mjs
 */

import { specOf } from './commands.js';
import { TOOL_CONNECTION_TIMEOUT_MS } from './tool-connection-limits.js';

/* 시간 제한: 출력이 이만큼 없으면 "응답 기다리는 중"(취소·계속 기다리기), 끝까지 기다리는 최대 시간(kubeconfig 명령, 브라우저 로그인),
   로그인 탭을 다시 보는 간격, 완료를 보인 뒤 줄을 접기까지 */
export const LIMITS = { quietMs: 15000, kubeconfigMs: 120000, loginMs: 300000, pollMs: 1500, closeAfterMs: 1200, stepMinMs: 450, watchMs: 10000, readMs: 15000 };
/* readMs: 설정 페이지가 클러스터 하나의 자료(권한, 에이전트, 도구)를 기다리는 시간. 넘으면 그 클러스터의 행만 시간 초과(다시 시도) */
/* stepMinMs: 이미 된 단계도 하나씩 채워져 보이도록 단계마다 머무는 최소 시간(체크 그리기 뒤 선 채우기 움직임 길이). 마지막 단계가 채워진 뒤에야 연결됨으로 바뀜.
   watchMs: 필요한 권한을 본 뒤 권한이 생겼는지 다시 보는 간격(생기면 그 단계부터 자동으로 이어서 연결) */
/* 다시 확인(연결 확인)도 같은 기준: 15초 동안 답이 없으면 응답 기다리는 중. 인증 도구(exec)가 끝나지 않으면 메인 프로세스가 60초에 끊고 시간 초과로 답함 */

/* 상태 하나의 집합. 한 연결은 한 번에 한 상태. 원인(판정 표의 cause) -> 상태, 상태 -> 사람이 할 동작 하나 */
export const STATES = ['idle', 'running', 'waiting', 'needs-install', 'needs-login', 'needs-input', 'needs-approve', 'needs-perm', 'watching', 'failed', 'cancelled', 'timeout', 'connected'];
export const STATE_OF_CAUSE = { notInstalled: 'needs-install', loginNeeded: 'needs-login', unauthorized: 'needs-login', notFound: 'needs-input', invalid: 'needs-input', input: 'needs-input',
  approve: 'needs-approve', admin: 'needs-perm', forbidden: 'needs-perm', installForbidden: 'needs-perm', chartMissing: 'needs-input', imageUnpublished: 'failed', chartUnreadable: 'failed', network: 'failed', toolDown: 'failed', unknown: 'failed', unchanged: 'failed', probe: 'failed', absent: 'failed', quota: 'failed', unreachable: 'failed',
  cancelled: 'cancelled', tabClosed: 'cancelled', denied: 'cancelled', timeout: 'timeout', quiet: 'waiting' };
export const TRANSITIONS = {
  idle: { start: 'running' },
  running: { done: 'connected', ...STATE_OF_CAUSE },
  waiting: { output: 'running', wait: 'running', cancel: 'cancelled', timeout: 'timeout' },
  'needs-install': { install: 'running', cancel: 'idle' }, 'needs-login': { login: 'running', focus: 'needs-input', cancel: 'idle' }, 'needs-input': { focus: 'idle', start: 'running' },
  'needs-approve': { approve: 'running', deny: 'cancelled' },
  'needs-perm': { perm: 'watching', retry: 'running', cancel: 'idle' }, watching: { granted: 'running', perm: 'watching', cancel: 'needs-perm' }, failed: { retry: 'running', cancel: 'idle' }, cancelled: { retry: 'running', start: 'running' },
  timeout: { retry: 'running', cancel: 'idle' }, connected: { recheck: 'running', disconnect: 'idle' },
};
/* 사람이 할 동작 하나(그 상태의 첫 버튼) */
export const ACTION_OF = { 'needs-install': 'install', 'needs-login': 'login', 'needs-input': 'focus', 'needs-approve': 'approve', 'needs-perm': 'perm', watching: 'perm', failed: 'retry', cancelled: 'retry', timeout: 'retry', waiting: 'cancel', connected: 'disconnect' };
/** 흐름 하나의 지금 상태(표의 이름 하나) */
export function stateOf(f) {
  if (!f) return 'idle';
  if (f.running) return f.cause === 'quiet' ? 'waiting' : 'running';
  if (f.cause && f.watch) return 'watching';
  if (f.cause) return f.causeKind === 'perm' ? 'needs-perm' : STATE_OF_CAUSE[f.cause] || 'failed';
  if (f.done || (f.order && f.order.every(s => f.state[s] === 'done' || f.state[s] === 'skip'))) return 'connected';
  return 'idle';
}

/* 멈춘 상태의 두 낱말(행 끝 상태 묶음 글자). 실패는 닿지 못한 것(접속 실패)과 그 밖(실패)으로 나눔 */
const REACH = ['network', 'toolDown', 'unreachable', 'probe'];
export const shortOf = (state, cause) => ({ 'needs-install': 'wake.conn.short.install', 'needs-login': 'wake.conn.short.login', 'needs-input': 'wake.conn.short.input', 'needs-approve': 'wake.conn.short.approve',
  'needs-perm': 'wake.conn.short.perm', timeout: 'wake.flow.c.timeout', cancelled: 'wake.conn.st.cancelled', failed: REACH.includes(cause) ? 'wake.conn.short.reach' : 'wake.conn.short.failed' })[state] || null;

/* 단계 이름(화면 글자). 모든 연결이 같은 이름을 씀 */
export const STEP_LABEL = Object.fromEntries(['tool', 'login', 'approve', 'issue', 'input', 'kubeconfig', 'reach', 'cert', 'authn', 'version', 'perm', 'install', 'agent', 'ready'].map(s => [s, 'wake.flow.s.' + s]));

/* 셸에 넣는 값은 작은따옴표로 감싸 한 덩어리로(이름·지역에 공백이나 특수 문자가 있어도 명령이 바뀌지 않음) */
const q = v => `'${String(v).replace(/'/g, `'\\''`)}'`;

/* 연결 방법: 단계 순서, 입력 칸과 그 검사, 실행할 명령, 설치·로그인 명령, 자격 방식(각자 로그인 / Wake가 만든 서비스 계정) */
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const CLUSTER = ['reach', 'authn', 'perm'];
/* 복사용 설치 명령의 차트 자리(실행할 때는 agent.prep이 앱에 든 차트 폴더의 실제 경로를 돌려줌) */
export const AGENT_CHART = './wake-agent-only';
/* 에이전트 설치(helm upgrade --install … --namespace wake-system --create-namespace)가 하는 일 전부의 권한: Helm 기록(secrets), namespace,
   차트의 종류(ServiceAccount, Role, RoleBinding, ClusterRole, ClusterRoleBinding, DaemonSet), 그리고 차트의 Role·ClusterRole이 주는 권한
   (Kubernetes는 가지지 않은 권한을 담은 역할을 만들거나 묶지 못하게 함). Helm은 리소스마다 먼저 읽고(get), Helm 4는 server-side apply(patch)로
   만든다: 리소스마다 get·create·patch. 2026-11-18 kind(Helm 4.2.2)에서 이 목록만 가진 사용자가 설치 성공, patch 없이는 실패. 첫 질문은 DaemonSet 생성 */
const AGENT_NS = 'wake-system', RBAC = 'rbac.authorization.k8s.io';
const applied = (group, resource, namespace) => ['create', 'get', 'patch'].map(verb => ({ verb, group, resource, ...(namespace ? { namespace } : {}) }));
const AGENT_INSTALL_ACCESS = [
  ...applied('apps', 'daemonsets', AGENT_NS),
  ...['get', 'list', 'create', 'update'].map(verb => ({ verb, group: '', resource: 'secrets', namespace: AGENT_NS })),
  ...applied('', 'namespaces'), ...applied('', 'serviceaccounts', AGENT_NS),
  ...applied(RBAC, 'roles', AGENT_NS), ...applied(RBAC, 'rolebindings', AGENT_NS), ...applied(RBAC, 'clusterroles'), ...applied(RBAC, 'clusterrolebindings'),
  ...['get', 'list', 'watch'].flatMap(verb => ['nodes', 'pods'].map(resource => ({ verb, group: '', resource }))),
  ...['get', 'create', 'update'].map(verb => ({ verb, group: 'coordination.k8s.io', resource: 'leases', namespace: AGENT_NS })),
];
export const METHODS = {
  aws: { steps: ['tool', 'login', 'kubeconfig', ...CLUSTER], fields: ['name', 'region'], check: { name: NAME, region: /^[a-z]{2}(-[a-z]+)+-\d$/ },
    command: v => `aws eks update-kubeconfig --name ${q(v.name)} --region ${q(v.region)}`, install: 'brew install awscli', loginCommand: 'aws sso login',
    context: (v, fresh) => fresh.find(id => id.endsWith(`:cluster/${v.name}`)) },
  gcp: { steps: ['tool', 'login', 'kubeconfig', ...CLUSTER], fields: ['name', 'region', 'project'], check: { name: NAME, region: /^[a-z]+-[a-z]+\d(-[a-z])?$/, project: /^[a-z][a-z0-9-]{4,29}$/ },
    command: v => `gcloud container clusters get-credentials ${q(v.name)} --region ${q(v.region)} --project ${q(v.project)}`, install: 'brew install --cask google-cloud-sdk && gcloud components install gke-gcloud-auth-plugin', loginCommand: 'gcloud auth login',
    context: (v, fresh) => fresh.find(id => id === `gke_${v.project}_${v.region}_${v.name}`) },
  azure: { steps: ['tool', 'login', 'kubeconfig', ...CLUSTER], fields: ['name', 'group'], check: { name: NAME, group: /^[\w.()-]{1,90}$/ },
    command: v => `az aks get-credentials --name ${q(v.name)} --resource-group ${q(v.group)}`, install: 'brew install azure-cli Azure/kubelogin/kubelogin', loginCommand: 'az login',
    context: (v, fresh) => fresh.find(id => id === v.name) },
  kind: { steps: ['tool', 'kubeconfig', ...CLUSTER], fields: ['name'], check: { name: /^[a-z0-9][a-z0-9.-]{0,62}$/ },
    command: v => `kind export kubeconfig --name ${q(v.name)}`, install: 'brew install kind',
    context: (v, fresh, fp) => fresh.find(id => id === `kind-${v.name}`) || (fp.contexts.includes(`kind-${v.name}`) ? `kind-${v.name}` : null) },
  file: { steps: ['input', 'kubeconfig', ...CLUSTER] },
  token: { steps: ['input', 'kubeconfig', ...CLUSTER] },
  /* 클러스터 안 도구: 인증 없는 도구(Prometheus)는 접속과 준비 확인만, 로그인하는 도구는 로그인해서 연결(Wake 전용 읽기 토큰) 또는 토큰 직접 입력 */
  'tool-open': { steps: ['reach', 'authn', 'ready'], tool: true },
  'tool-login': { steps: ['reach', 'login', 'approve', 'issue', 'authn', 'ready'], tool: true, credential: 'service' },
  'tool-token': { steps: ['input', 'reach', 'authn', 'ready'], tool: true },
  /* 클러스터 밖·안의 그 밖의 연결: 단계마다 메인 프로세스 확인 하나(conn.step). 비밀 값(API 키, 웹후크 주소)은 입력 확인 단계에서 키체인으로만 감 */
  'ai-cli': { steps: ['tool', 'login', 'ready'], kind: 'ai', op: true },
  'ai-key': { steps: ['input', 'reach', 'authn', 'ready'], kind: 'ai', op: true },
  notify: { steps: ['input', 'reach', 'authn', 'ready'], kind: 'notify', op: true },
  /* GitHub 토큰(바꾸기 제안의 Draft PR): 키체인에 두고 GitHub API로 확인(B3-14) */
  github: { steps: ['input', 'reach', 'authn', 'ready'], kind: 'git', op: true },
  /* GitOps 컨트롤러(Argo CD, Flux): 내 kubeconfig 자격으로 그 컨트롤러가 있는지(접속)와 Application·Kustomization을 읽을 수 있는지(권한) */
  gitops: { steps: ['reach', 'perm', 'ready'], kind: 'gitops', op: true },
  /* 에이전트 설치: 내 kubeconfig 자격으로 설치할 수 있는지(권한) → Helm으로 설치(아래 터미널) → 에이전트 준비(DaemonSet 롤아웃) → 접속(Kubernetes API로 다시 확인). 사람이 누를 때만 */
  agent: { steps: ['perm', 'install', 'agent', 'reach'], kind: 'agent', agent: true, install: 'brew install helm',
    command: (cluster, chart) => `helm upgrade --install wake-agent ${q(chart)} --namespace wake-system --create-namespace --kube-context ${q(cluster)} --set identity.clusterId=${q(cluster)}` },
};
/* 확인 단계가 멈춘 원인 -> 그 자리의 동작(원인마다 하나, 원문 보기는 보조) */
const CAUSE_ACTIONS = {
  notInstalled: ['copyInstall'], loginNeeded: ['login'], unauthorized: ['input'], input: ['input'], network: ['retry'], toolDown: ['retry'],
  forbidden: ['perm'], admin: ['perm'], chartMissing: ['pickChart', 'copyInstall'], quota: ['retry'], unreachable: ['retry'], absent: ['retry'], timeout: ['retry'], unknown: ['retry'], cancelled: ['retry'],
};
/* 설치 명령의 첫 단어(그 명령 자체)가 없을 때 그것을 설치하는 명령 */
const INSTALL_OF = { gcloud: 'brew install --cask google-cloud-sdk', az: 'brew install azure-cli', aws: 'brew install awscli', brew: null, kubectl: 'brew install kubectl' };
/* 다시 확인: 연결 확인(probe.cjs)이 실제로 지나는 순서와 그 단계 알림 이름 */
export const RECHECK = ['tool', 'reach', 'cert', 'authn', 'version', 'perm'];
const PROBE_STEP = { authTool: 'tool', reach: 'reach', cert: 'cert', authn: 'authn', version: 'version', perm: 'perm' };
/* 연결 확인 결과 -> 멈춘 단계. 새로 연결은 인증서·버전 단계가 없어 가까운 단계로 */
const PROBE_AT = { config: 'tool', noAuthTool: 'tool', needs_consent: 'authn', timeout: 'authn', unreachable: 'reach', cert: 'cert', unauthorized: 'authn', forbidden: 'perm', unsupported: 'version' };
const PROBE_NEW = { tool: 'reach', reach: 'reach', cert: 'reach', authn: 'authn', version: 'authn', perm: 'perm' };

/* 명령이 끝났을 때의 판정 표(위에서부터 처음 맞는 것): 종료 코드, 알려진 출력 문구 -> 원인, 멈출 단계, 그 단계의 동작.
   종료 0은 kubeconfig가 바뀌었는지와 연결 확인으로 이어서 판정(바뀌지 않음 -> unchanged) */
export const RULES = [
  { exit: null, cause: 'cancelled', actions: ['retry'] },
  { exit: 127, cause: 'notInstalled', step: 'tool', actions: ['install', 'copyInstall'] },
  { match: /Unable to locate credentials|ExpiredToken|InvalidClientTokenId|SSO session|Token has expired|You do not currently have an active account|az login|Please run 'gcloud auth login'/i, cause: 'loginNeeded', step: 'login', actions: ['login'] },
  { match: /ResourceNotFoundException|No cluster found|was not found|could not find|could not locate any control plane|unknown cluster|ResourceGroupNotFound|NotFound/i, cause: 'notFound', actions: ['focus'], field: 'name' },
  { match: /Could not connect|EndpointConnectionError|timed out|Temporary failure|network is unreachable|connection refused/i, cause: 'network', actions: ['retry'] },
  { cause: 'unknown', actions: ['retry'] },
];
/* 원인 -> 화면 글자와 상태 아이콘 종류 */
/* 원인 -> 화면 글자와 색 종류: error(빨강, Wake·내 컴퓨터 쪽에서 실패), fix(주황, 내가 설치·로그인·입력), perm(중립, 권한이 생기기를 기다림), idle(내가 멈춤) */
export const CAUSES = {
  notInstalled: { text: 'wake.flow.c.notInstalled', kind: 'fix' }, loginNeeded: { text: 'wake.flow.c.loginNeeded', kind: 'fix' }, notFound: { text: 'wake.flow.c.notFound', kind: 'fix' },
  network: { text: 'wake.flow.c.network', kind: 'error' }, unknown: { text: 'wake.flow.c.unknown', kind: 'error' }, cancelled: { text: 'wake.flow.c.cancelled', kind: 'idle' },
  timeout: { text: 'wake.flow.c.timeout', kind: 'error' }, quiet: { text: 'wake.flow.c.quiet', kind: 'busy' }, unchanged: { text: 'wake.flow.c.unchanged', kind: 'error' },
  invalid: { text: 'wake.flow.c.invalid', kind: 'fix' }, input: { text: 'wake.flow.c.input', kind: 'fix' }, probe: { text: null, kind: 'error' },
  approve: { text: 'wake.flow.c.approve', kind: 'fix' }, denied: { text: 'wake.flow.c.denied', kind: 'idle' }, tabClosed: { text: 'wake.flow.c.tabClosed', kind: 'idle' },
  toolDown: { text: 'wake.flow.c.toolDown', kind: 'error' }, unauthorized: { text: 'wake.flow.c.unauthorized', kind: 'fix' }, admin: { text: 'wake.flow.c.forbidden', kind: 'perm' },
  forbidden: { text: 'wake.flow.c.forbidden', kind: 'perm' }, installForbidden: { text: 'wake.flow.c.installForbidden', kind: 'perm' }, chartMissing: { text: 'wake.flow.c.chartMissing', kind: 'fix' }, absent: { text: 'wake.flow.c.absent', kind: 'error' }, quota: { text: 'wake.flow.c.quota', kind: 'error' }, unreachable: { text: 'wake.flow.c.unreachable', kind: 'error' },
  imageUnpublished: { text: 'wake.flow.c.imageUnpublished', kind: 'error' }, chartUnreadable: { text: 'wake.flow.c.chartUnreadable', kind: 'error' },
};
/* 붙여넣은 kubeconfig의 YAML 오류(백엔드 kubeconfig.cjs yamlError): 줄·칸이 있으면 그 위치까지 */
const yamlCause = r => r?.code !== 'YAML_PARSE_ERROR' ? null : r.line && r.column ? { key: 'wake.flow.c.yamlAt', vars: { line: r.line, column: r.column } } : { key: 'wake.flow.c.yaml' };
/* 동작 이름 -> 버튼(글자와 Wake 동작). 같은 동작은 어디서나 같은 글자 */
export const ACTIONS = {
  retry: { label: 'wake.flow.a.retry', icon: 'arrow-rotate-clockwise', action: 'wake.flow.retry' },
  install: { label: 'wake.flow.a.install', icon: 'download', action: 'wake.flow.install' },
  copyInstall: { label: 'wake.flow.a.copyInstall', icon: 'copy', action: 'wake.flow.copyInstall', variant: 'ghost' },
  pickChart: { label: 'wake.flow.a.pickChart', icon: 'folder-open', action: 'wake.flow.pickChart' },
  login: { label: 'wake.flow.a.login', icon: 'log-in', action: 'wake.flow.login' },
  focus: { label: 'wake.flow.a.focus', icon: 'pen', action: 'wake.flow.focus' },
  token: { label: 'wake.flow.a.token', icon: 'key-2', action: 'wake.flow.token', variant: 'ghost' },
  input: { label: 'wake.flow.a.input', icon: 'key-2', action: 'wake.flow.input' },
  approve: { label: 'wake.tool.allow', icon: 'circle-check', action: 'wake.flow.approve' },
  deny: { label: 'wake.tool.deny', variant: 'ghost', action: 'wake.flow.deny' },
  perm: { label: 'wake.flow.a.perm', icon: 'lock', action: 'wake.flow.perm' },
  cancel: { label: 'wake.flow.a.cancel', action: 'wake.flow.cancel', variant: 'ghost' },
  wait: { label: 'wake.flow.a.wait', action: 'wake.flow.wait', variant: 'ghost' },
  disconnect: { label: 'wake.flow.a.disconnect', action: 'wake.flow.disconnect', variant: 'ghost' },
  /* kubeconfig의 exec 인증 명령 허락(명령을 보이는 대화상자, app.config.js wake.exec.review) */
  consent: { label: 'wake.exec.review', icon: 'shield-check', action: 'wake.exec.review' },
};

/* 연결 정책(지금은 범위가 늘 나만, 팀 선택지는 숨김). 자격 방식: 내 kubeconfig·CLI 로그인·API 키·직접 넣은 토큰은 각자 로그인(personal),
   "로그인해서 연결"로 Wake가 만든 읽기 토큰은 서비스 계정(service). 권한 수준 기본 읽기 전용, Secret 읽기 꺼짐.
   만든 사람은 기록만(권한 없음). AI가 연결을 쓸 때는 권한 수준과 관계없이 늘 읽기 전용 */
const POLICY = { scope: ['me', 'team'], credentialMode: ['personal', 'service'], accessLevel: ['read', 'write'] };
export function connectionRecord(p) {
  const r = { target: p.target, method: p.method, kind: p.kind || 'cluster', scope: p.scope || 'me', credentialMode: p.credentialMode || 'personal', accessLevel: p.accessLevel || 'read',
    secretRead: !!p.secretRead, admins: p.admins || ['me'], users: p.users || (p.scope === 'team' ? ['team'] : ['me']), createdBy: p.createdBy || 'me', identity: p.identity || null, identityError: p.identityError || null, at: p.at || null };
  const bad = policyProblems(r); if (bad.length) throw new Error(bad.join('; '));
  return r;
}
/** 정책 위반 목록(빈 배열이면 바름) */
export function policyProblems(r) {
  const out = [];
  if (!POLICY.scope.includes(r.scope)) out.push('scope');
  if (!POLICY.credentialMode.includes(r.credentialMode)) out.push('credentialMode');
  if (!POLICY.accessLevel.includes(r.accessLevel)) out.push('accessLevel');
  /* 팀 연결은 한 사람의 개인 자격을 담을 수 없음: 각자 로그인은 자격 없이 설정만 공유, 서비스 계정은 팀 비밀 저장소 */
  if (r.scope === 'team' && r.credentialMode === 'personal' && r.identity) out.push('team connection with a personal credential');
  if (r.scope === 'me' && (r.users.length !== 1 || r.users[0] !== 'me')) out.push('a personal connection has only its owner as user');
  if (!r.admins.length) out.push('no admin');
  return out;
}

/* 입력 칸 검사: 비었으면 필수, 모양이 틀리면 형식(메시지 키). 셸 문자가 섞인 값은 명령에 들어가기 전에 막힘 */
export function invalidOf(method, v) {
  const m = METHODS[method]; if (!m?.fields) return {};
  return Object.fromEntries(m.fields.map(k => [k, !(v[k] || '').trim() ? 'firstRun.required' : m.check[k] && !m.check[k].test(v[k].trim()) ? 'wake.flow.badField.' + k : null]).filter(([, e]) => e));
}

/**
 * 진행기. key마다 흐름 하나: 새로 연결 줄(add-cloud 등), 다시 확인하는 context id, 도구(클러스터-도구 종류).
 * env: { service, terminal(), redraw(), audit(command, exit), rescan(), recheck(ids), copy(text), toast(p), focus(row, field), probe(id),
 *        tool(op, f, extra): 도구 연결의 메인 프로세스 동작(reach, session, issue, verify, setToken, disconnect), openLogin(f), loginOpen(f), closeLogin(f),
 *        approve(f) -> Promise<boolean>(읽기 자격 발급 결정), record(key, record|null): 연결 기록 저장 }
 */
export function createFlows(env) {
  const flows = {};
  const steps = f => f.order.map(id => ({ id, label: STEP_LABEL[id], state: f.state[id] }));
  /* 흐름 하나의 모습: 단계, 상태(진행 중: 하는 일과 그 단계가 시작된 뒤 지난 초, 멈춤: 원인), 멈춤의 두 낱말(short), 동작, 원문 출력(raw).
     행 끝 상태 묶음(kit flow-status)이 이것으로 그림 */
  const view = key => { const f = flows[key]; if (!f) return null;
    const c = f.cause && CAUSES[f.cause], st = stateOf(f), at = f.order.find(s => f.state[s] === 'run');
    const cause = f.cause === 'quiet' || st === 'needs-approve' ? null : f.causeText || (c?.text ? { key: c.text, vars: { tools: '', ...f.causeVars } } : null);
    const kind = f.causeKind || c?.kind;
    const status = st === 'watching' ? { kind: 'busy', text: { key: 'wake.flow.watch' } }
      : f.running ? { kind: 'busy', text: { key: f.cause === 'quiet' ? 'wake.flow.c.quiet' : f.hint || 'wake.conn.st.running' }, since: f.at?.[at] || f.started || Date.now() }
      : cause ? { kind: kind || 'error', text: cause } : st === 'connected' ? { kind: 'ok', text: { key: 'wake.connected' } } : null;
    const acts = f.running ? (f.cause === 'quiet' ? ['cancel', 'wait'] : cancellable(f) && f.hint !== 'wake.flow.h.disconnect' ? ['cancel'] : []) : st === 'watching' ? [] : f.actions || [];
    return { steps: steps(f), running: f.running, state: st, hint: f.running ? f.hint || null : null, cancel: !!f.running && cancellable(f), cause, kind, note: f.note || null, status,
      approval: st === 'needs-approve', raw: !f.running && f.raw ? String(f.raw).slice(-4000) : '', short: shortOf(st, f.cause),
      /* 출력 없이 멈춘 이유(이미지 미공개·values 읽기 실패)는 행 아래에 그 이유 한 문장만(B3-06) */
      explain: !f.running && !f.raw && EXPLAINED.has(f.cause),
      actions: acts.map(a => ({ ...ACTIONS[a], arg: { key } })) }; };
  const set = (f, id, st) => { f.state[id] = st; if (st === 'run') (f.at ||= {})[id] = Date.now(); env.redraw(); };
  const fail = (f, id, cause, actions, extra = {}) => { clearTimeout(f.toolDeadlineTimer); f.state[id] = 'fail'; f.running = false; f.cause = cause; f.actions = actions; Object.assign(f, extra); env.redraw(); env.reveal?.(f.key);
    if (f.approvedTool) { f.approvedTool = false; env.toolApprovalResult?.(f, false); }
    return false; };
  /* 에이전트 차트의 이미지(agent.prep image, image-state.cjs): 공개 이미지가 확인되지 않으면 Helm을 부르지 않고, 복사할 설치 명령도 두지 않는다.
     values를 읽지 못함은 chartUnreadable. 차트 폴더가 없는 경우는 설치 단계의 차트 고르기가 맡는다 */
  const imageStopped = (f, step, p) => {
    if (!p?.exists || p.image?.published === true) return false;
    f.install = undefined;
    fail(f, step, p.image?.reason === 'agent_values_unreadable' ? 'chartUnreadable' : 'imageUnpublished', []); /* 사람이 읽을 이유 한 줄만: 내부 코드(agent_image_unpublished)를 출력 칸에 두지 않는다(B3-06) */
    return true;
  };
  const RUN = 'wake-run';
  const EXPLAINED = new Set(['imageUnpublished', 'chartUnreadable']);
  /* 진행 중에 취소할 수 있는 흐름: 터미널 명령, 로그인 탭 기다리기, 연결 확인(다시 확인), 메인 프로세스 확인 */
  const cancellable = f => !!(f.cmd || f.hint === 'wake.flow.h.login' || f.method === 'recheck' || METHODS[f.method]?.op || METHODS[f.method]?.tool);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* 명령 하나를 터미널 패널에서: 출력이 15초 없으면 기다리는 중, 최대 시간이 지나면 끝내고 시간 초과 */
  async function command(f, line, limit) {
    /* 터미널은 선언한 명령(data/commands.js)만 실행한다: 선언에 없는 글은 실행하지 않고 그 이유로 멈춘다 */
    const spec = specOf(line);
    if (!spec) { f.output = ''; f.refused = true; return { exit: null, error: 'TERMINAL_COMMAND_REJECTED' }; }
    const term = env.terminal(); f.output = ''; f.lastOut = Date.now(); f.waiting = false; f.cmd = true;
    /* 클러스터에 쓰는 명령(confirm)은 데스크톱의 OS 확인 창에 사람이 답한 뒤 시작한다: 그동안은 사람이 할 차례라 출력 없음을 세지 않고, 첫 출력부터 센다 */
    let confirming = spec.confirm === true;
    const quiet = setInterval(() => {
      if (!confirming && f.cause !== 'quiet' && Date.now() - f.lastOut > LIMITS.quietMs && !f.waiting) { f.cause = 'quiet'; f.actions = ['cancel', 'wait']; env.redraw(); }
    }, 1000);
    const hard = setTimeout(() => { f.timedOut = true; term.cancel(RUN); }, limit);
    const r = await term.run({ key: RUN, title: env.termTitle?.(f) || { raw: f.key }, command: spec, env: env.runEnv(),
      onOutput: d => { confirming = false; f.output = (f.output + d).slice(-16384); f.lastOut = Date.now(); if (f.cause === 'quiet') { f.cause = null; f.actions = []; env.redraw(); } } });
    clearInterval(quiet); clearTimeout(hard); f.cmd = false;
    if (f.cause === 'quiet') { f.cause = null; f.actions = []; }
    env.audit(line, r.exit);
    return r;
  }
  /* 판정 표로 원인 찾기 */
  const judge = (exit, out) => RULES.find(r => ('exit' in r ? r.exit === exit : true) && (!r.match || r.match.test(out)) && (r.exit !== undefined || exit !== 0));

  /* 연결 확인 한 번(다시 확인, 새로 연결의 마지막 단계들): 단계 알림을 따라 칠함 */
  async function probe(f, ctx, map) {
    f.probing = ctx; f.map = map;
    const r = await env.probe(ctx);
    f.probing = null;
    return r;
  }
  function onProbeStep(id, step) {
    for (const f of Object.values(flows)) {
      if (f.probing !== id) continue;
      const s0 = PROBE_STEP[step] || step, at = f.map ? f.map[s0] : s0, i = f.order.indexOf(at);
      f.order.forEach((s, j) => { if (j < i && f.state[s] !== 'done') f.state[s] = 'done'; });
      if (i >= 0 && f.state[at] !== 'run') { f.state[at] = 'run'; (f.at ||= {})[at] = Date.now(); }
      env.redraw();
    }
  }
  function probeResult(f, r, map) {
    if (r.state === 'ok') { for (const s of f.order) if (f.state[s] !== 'skip') f.state[s] = 'done'; env.redraw(); return true; }
    const at0 = PROBE_AT[r.state] || f.order.find(s => f.state[s] === 'run') || f.order.at(-1), at = map ? map[at0] : at0;
    f.order.forEach((s, j) => { if (j < f.order.indexOf(at)) f.state[s] = 'done'; });
    /* 멈추면 그 줄은 펼친 채 멈춘 단계와 원인을 보임(줄의 상태 아이콘과 같은 종류) */
    if (r.state === 'timeout') return fail(f, at, 'timeout', ['retry'], { raw: r.error || r.state });
    /* 관리자만 풀 수 있는 원인(권한, 인증서, 버전): 그 자리의 동작은 관리자 요청 복사 */
    const need = env.probeKind(r) === 'perm' ? env.probeNeed?.(f.key, r) : null;
    return fail(f, at, 'probe', need ? ['perm'] : r.state === 'needs_consent' ? ['consent', 'retry'] : ['retry'], { causeText: env.probeText(r), causeKind: env.probeKind(r), raw: r.error || r.state, need });
  }

  /* 연결 하나를 from(단계 id)부터 끝까지. 이미 된 단계는 바로 완료. 끝나면 잠깐 완료를 보인 뒤 줄을 접고 기록을 남김 */
  function startToolDeadline(f) {
    clearTimeout(f.toolDeadlineTimer);
    f.toolDeadlineTimer = setTimeout(() => {
      if (flows[f.key] !== f || f.done || f.manualLoginWait) return;
      void env.tool('cancel', f, { flowId: f.nativeFlow }).catch(() => {});
      const at = f.order.find(step => f.state[step] === 'run') || f.order.find(step => f.state[step] === 'wait') || f.order[0];
      flows[f.key] = { ...f };
      fail(flows[f.key], at, 'timeout', ['retry'], { raw: JSON.stringify({ code: 'tool_deadline', stage: at }) });
    }, TOOL_CONNECTION_TIMEOUT_MS);
    f.toolDeadlineTimer.unref?.();
  }

  async function run(key, method, values, from, extra = {}) {
    const m = METHODS[method];
    const prev = flows[key];
    /* 같은 연결이 이미 진행 중이면 두 번째 시작은 무시(두 번 누름, 두 화면에서 동시에 누름) */
    if (prev?.running || prev?.cause === 'approve') return;
    const f = flows[key] = { key, method, values, ...extra, order: m.steps, state: Object.fromEntries(m.steps.map(s => [s, 'wait'])), running: true, cause: null, actions: [], output: '', started: Date.now() };
    env.reveal?.(key);
    if (m.tool) startToolDeadline(f);
    if (from && prev?.method === method) { for (const s of m.steps.slice(0, m.steps.indexOf(from))) f.state[s] = prev.state[s] === 'skip' ? 'skip' : 'done'; Object.assign(f, { before: prev.before, target: prev.target, added: prev.added, url: prev.url, session: prev.session, manualSession: prev.manualSession, token: prev.token }); }
    env.redraw();
    for (const s of m.steps.slice(from ? m.steps.indexOf(from) : 0)) {
      if (flows[key] !== f) return;
      if (f.state[s] === 'skip') continue;
      set(f, s, 'run');
      let ok; const t0 = Date.now();
      try { ok = await (m.op ? opStep(f, m, s) : STEPS[s](f, m)); } catch (e) { ok = fail(f, s, 'unknown', ['retry'], { raw: String(e?.message || e) }); }
      if (flows[key] !== f || ok === false) { if (m.tool) env.closeLogin?.(f, false); return; }
      if (Date.now() - t0 < LIMITS.stepMinMs) await sleep(LIMITS.stepMinMs - (Date.now() - t0));
      if (flows[key] !== f) return;
      if (f.state[s] === 'run') set(f, s, 'done');
    }
    await sleep(LIMITS.stepMinMs); // 마지막 단계의 채움이 보인 뒤 연결됨으로
    if (flows[key] !== f) return;
    clearTimeout(f.toolDeadlineTimer); f.running = false; f.done = true; f.cause = null; f.actions = [];
    if (m.tool) {
      env.closeLogin?.(f, true);
      env.record(key, connectionRecord({ target: key, method, kind: 'tool', credentialMode: f.token ? 'service' : 'personal', identity: f.identity || null, at: new Date().toISOString() }));
      if (f.approvedTool) { f.approvedTool = false; env.toolApprovalResult?.(f, true); }
    }
    if (m.op) env.record(key, connectionRecord({ target: f.target || key, method, kind: m.kind, identity: f.identity || null, at: new Date().toISOString() }));
    env.redraw();
    setTimeout(() => { if (flows[key] === f && f.done && !f.cleanupPending) { env.done(key, f.target); if (!m.tool && !m.op) env.terminal().close(RUN); env.redraw(); } }, LIMITS.closeAfterMs);
  }
  /* 메인 프로세스 확인 하나로 진행하는 단계: 입력 확인은 비밀 값을 키체인에 두고(흐름에는 남기지 않음), 그 밖은 확인 결과대로.
     결과 { ok, cause?, raw?, install?, login?, identity?, note? } -> 멈추면 원인의 동작(CAUSE_ACTIONS) */
  async function opStep(f, m, s) {
    if (s === 'ready') return true;
    const target = f.target || f.key;
    const r = s === 'input' ? await env.service('conn.save', { method: f.method, target, values: f.values || {} }) : await env.service('conn.step', { method: f.method, target, step: s });
    if (s === 'input') f.values = {};
    if (flows[f.key] !== f) return false;
    if (r?.ok) { if (r.identity) f.identity = r.identity; if (r.note) f.note = r.note; return true; }
    const cause = r?.cause && CAUSE_ACTIONS[r.cause] ? r.cause : 'unknown';
    f.install = r?.install || null; f.loginCommand = r?.login || null; f.need = cause === 'forbidden' ? env.needOf?.(r) || null : null;
    return fail(f, s, cause, CAUSE_ACTIONS[cause].filter(a => a !== 'copyInstall' || f.install), { raw: r?.error || r?.cause || '', causeVars: { tools: r?.missing ? `(${r.missing})` : '' } });
  }
  const tool = async (op, f, extra) => {
    if (op !== 'cancel' && !f.manualLoginWait && Date.now() - f.started >= TOOL_CONNECTION_TIMEOUT_MS) {
      void env.tool('cancel', f, { flowId: f.nativeFlow }).catch(() => {});
      return { state: 'timeout', code: 'tool_deadline', stage: 'operation' };
    }
    const result = await env.tool(op, f, { ...extra, ...(f.nativeFlow ? { flowId: f.nativeFlow } : f.manualLoginWait ? {} : { flowStart: true }) });
    if (typeof result?.flowId === 'string') f.nativeFlow = result.flowId;
    if (op !== 'cancel' && flows[f.key] !== f) return { state: 'cancelled', code: 'tool_cancelled', stage: 'operation' };
    return result;
  };
  function toolFailure(f, step, result) {
    if (flows[f.key] !== f) return false;
    const { state, code } = result || {};
    const permissionDenied = ['unauthorized', 'forbidden'].includes(state) || code === 'bootstrap_unverified' || code === 'forbidden';
    const needsCredential = ['grafana', 'argocd'].includes(f.tool?.kind) && (step === 'input' && code === 'tool_invalid_token' ||
      permissionDenied && ['input', 'login', 'authn', 'issue'].includes(step));
    const cause = state === 'forbidden' && code === 'tool_forbidden' && step !== 'login' ? 'forbidden'
      : needsCredential ? (state === 'unauthorized' && step !== 'input' ? 'unauthorized' : 'input')
        : state === 'forbidden' ? 'forbidden' : state === 'timeout' ? 'timeout' : state === 'cancelled' ? 'cancelled' : 'toolDown';
    const causeText = needsCredential && cause === 'input' ? { key: code === 'tool_invalid_token' ? 'wake.tool.invalidToken'
      : state === 'unauthorized' ? 'wake.flow.c.unauthorized' : 'wake.tool.credentialRequired' } : null;
    const actions = needsCredential ? ['login', 'token'] : ['retry'];
    const raw = !code && typeof result?.error === 'string' ? result.error : JSON.stringify({ state: state || 'failed', code: /^[a-z0-9_]{1,64}$/.test(code || '') ? code : 'tool_failed',
      stage: ['reach', 'session', 'input', 'issue', 'operation', 'verify'].includes(result?.stage) ? result.stage : step });
    if (needsCredential) env.input?.(f);
    return fail(f, step, cause, actions, { raw, causeText });
  }
  async function agentStatus(f) {
    return env.service('agent.status', { id: f.cluster }).catch(error => ({ lookup: error?.status === 403 || error?.kind === 'forbidden' ? 'forbidden' : error?.kind === 'timeout' || error?.code === 'ETIMEDOUT' ? 'timeout' : 'query_error', readError: { kind: error?.kind || 'query_error' } }));
  }
  function agentLookup(f, step, result) {
    f.agentStatus = result;
    if (result?.lookup === 'present') return true;
    const cause = { absent: 'absent', forbidden: 'forbidden', timeout: 'timeout', query_error: 'unknown' }[result?.lookup] || 'unknown';
    return fail(f, step, cause, ['retry'], { causeText: cause === 'unknown' ? { key: 'wake.home.agentReadFailed' } : null,
      raw: JSON.stringify({ lookup: result?.lookup || 'query_error', readError: result?.readError || null }) });
  }
  const STEPS = {
    tool: async (f, m) => { const r = await env.service('cli.check', { method: f.method }); if (r.missing?.length) { f.install = m.install; return fail(f, 'tool', 'notInstalled', ['install', 'copyInstall'], { causeVars: { tools: `(${r.missing.join(', ')})` } }); } return true; },
    login: async (f, m) => {
      if (m.tool) return toolLogin(f);
      const r = await env.service('cli.login', { method: f.method }); return r.ok || fail(f, 'login', 'loginNeeded', ['login'], { raw: r.error });
    },
    input: async (f, m) => {
      if (m.tool) {
        const token = f.values.token;
        f.values = {};
        const r = await tool('setToken', f, { token });
        if (!r?.ok) return toolFailure(f, 'input', r);
        f.token = true; f.readVerified = r.readVerified === true;
        if (f.readVerified) { f.state.reach = 'skip'; clearTimeout(f.toolDeadlineTimer); }
        return true;
      }
      /* 입력을 다시 받는 곳: 첫 실행은 그 줄의 칸, 설정은 같은 대화상자 */
      const r = await env.add(f.method, f.values); if (r?.error) return fail(f, 'input', 'input', [f.origin === 'settings' ? 'input' : 'focus'], { raw: r.error, field: f.method === 'token' ? 'token' : 'text', causeText: yamlCause(r) }); f.added = r.contexts || []; f.before = await env.service('kube.fingerprint'); return true;
    },
    kubeconfig: async (f, m) => {
      if (!m.command) { f.target = f.added?.[0]; return true; } // 파일·토큰: 앞 단계에서 저장함
      const before = await env.service('kube.fingerprint'), line = m.command(f.values);
      f.lastCommand = line; f.timedOut = false;
      const r = await command(f, line, LIMITS.kubeconfigMs);
      if (f.timedOut) return fail(f, 'kubeconfig', 'timeout', ['retry']);
      if (r.exit !== 0) { const rule = judge(r.exit, f.output); return fail(f, rule.step && f.order.includes(rule.step) ? rule.step : 'kubeconfig', rule.cause, rule.actions, { raw: f.output.slice(-600), field: rule.field }); }
      const after = await env.service('kube.fingerprint');
      if (after.hash === before.hash) return fail(f, 'kubeconfig', 'unchanged', ['retry']);
      const fresh = after.contexts.filter(id => !before.contexts.includes(id));
      f.target = m.context(f.values, fresh, after) || fresh[0] || after.current;
      await env.rescan();
      return true;
    },
    /* 클러스터: 연결 확인 한 번이 접속·인증·권한을 함께 칠함. 도구: 포트 포워딩(또는 바깥 주소)으로 그 도구의 상태 주소에 닿는지 */
    reach: async (f, m) => {
      if (m.agent) {
        const a = await agentStatus(f); if (flows[f.key] !== f || !agentLookup(f, 'reach', a)) return false;
        return a.rolloutReady === true || fail(f, 'reach', 'unknown', ['retry'], { causeText: { key: a.rolloutReady === false ? 'wake.agent.rolloutProgressing' : 'wake.agent.rolloutUnknown' } });
      }
      if (m.tool) { const r = await tool('reach', f); if (!r?.ok) return toolFailure(f, 'reach', r); f.url = r.url; return true; }
      if (!f.target) return fail(f, 'reach', 'unknown', [], { raw: 'no context' });
      const r = await probe(f, f.target, PROBE_NEW); return probeResult(f, r, PROBE_NEW);
    },
    authn: async (f, m) => {
      if (!m.tool) return true; // 클러스터: reach의 연결 확인이 함께 칠함
      if (f.readVerified) return true;
      const r = await tool('verify', f, f.manualSession ? { sessionOnly: true } : undefined);
      if (r?.ok) {
        if (r.via === 'session') { f.token = false; f.note = { key: 'wake.tool.sessionOnly' }; }
        else if (r.via === 'token') { f.token = true; if (f.note?.key === 'wake.tool.sessionOnly') f.note = null; }
        return true;
      }
      if (r?.code) return toolFailure(f, 'authn', r);
      return fail(f, 'authn', r?.state === 'unauthorized' ? 'unauthorized' : 'toolDown', r?.state === 'unauthorized' ? ['login', 'token'] : ['retry'], { raw: r?.error || r?.state });
    },
    /* 클러스터: 접속 단계의 연결 확인이 함께 칠함. 에이전트: 그 namespace에 DaemonSet을 만들 수 있는지(SelfSubjectAccessReview) */
    /* 에이전트: 먼저 차트의 이미지(공개되지 않았으면 권한을 묻지도, 설치 명령을 복사하게 하지도 않음), 다음 그 namespace에 DaemonSet을 만들 수 있는지.
       권한이 없으면 필요한 권한 시트(설치 명령·Slack·직접 적용: 데스크톱 OS 확인 창 뒤 실행)로 */
    perm: async (f, m) => {
      if (!m.agent) return true;
      const p = await env.service('agent.prep', { chart: f.chart }).catch(() => null);
      if (flows[f.key] !== f) return false;
      if (p?.exists && p.image?.published !== true) { f.state.perm = 'skip'; imageStopped(f, 'install', p); return false; } // 멈춘 곳은 설치 단계(이미지)
      const answers = await Promise.all(AGENT_INSTALL_ACCESS.map(a => env.service('kube.can', { id: f.cluster, ...a }).catch(e => ({ error: String(e?.message || e) }))));
      if (flows[f.key] !== f) return false;
      const r = answers.find(x => x?.error) || { allowed: answers.every(x => x?.allowed) };
      if (r?.allowed) return true;
      f.install = m.command(f.cluster, p?.chart || f.chart || AGENT_CHART);
      return fail(f, 'perm', r?.error ? 'unknown' : 'installForbidden', r?.error ? ['retry'] : ['perm'], { raw: r?.error || '', causeKind: 'perm' });
    },
    /* Helm과 차트가 있으면 아래 터미널에서 설치 명령을 대신 실행. 없으면 그 자리에서 멈춤(Helm 설치 / 차트 고르기) */
    install: async (f, m) => {
      const p = await env.service('agent.prep', { chart: f.chart });
      if (flows[f.key] !== f) return false;
      if (!p?.helm) { f.install = m.install; return fail(f, 'install', 'notInstalled', ['install', 'copyInstall'], { causeVars: { tools: '(helm)' } }); }
      const line = m.command(f.cluster, p.chart);
      if (!p.exists) { f.install = line; return fail(f, 'install', 'chartMissing', ['pickChart', 'copyInstall'], { raw: `chart not found: ${p.chart}`, causeVars: { path: p.shown || p.chart } }); }
      if (imageStopped(f, 'install', p)) return false;
      f.lastCommand = line; f.timedOut = false;
      const r = await command(f, line, LIMITS.kubeconfigMs);
      if (f.timedOut) return fail(f, 'install', 'timeout', ['retry'], { raw: f.output.slice(-600) });
      if (r.exit !== 0) { const rule = judge(r.exit, f.output); return fail(f, 'install', rule.cause === 'notFound' ? 'unknown' : rule.cause, ['retry'], { raw: f.output.slice(-600) }); }
      return true;
    },
    /* DaemonSet 관측의 롤아웃 준비를 기다린다 */
    agent: async f => {
      const until = Date.now() + LIMITS.kubeconfigMs;
      while (Date.now() < until) {
        const a = await agentStatus(f);
        if (flows[f.key] !== f || !agentLookup(f, 'agent', a)) return false;
        if (a.rolloutReady === true) return true;
        if (a.rolloutReady !== false) return fail(f, 'agent', 'unknown', ['retry'], { causeText: { key: 'wake.agent.rolloutUnknown' } });
        f.hint = 'wake.agent.rolloutProgressing'; env.redraw();
        await sleep(LIMITS.pollMs); if (flows[f.key] !== f) return false;
      }
      return fail(f, 'agent', 'timeout', ['retry'], { raw: JSON.stringify({ lookup: f.agentStatus?.lookup, rolloutReady: f.agentStatus?.rolloutReady, rollout: f.agentStatus?.rollout }) });
    },
    /* 읽기 자격 발급 결정은 연결 행에 머무르며, 승인 뒤 새 요청 기한으로 발급한다. */
    approve: async f => {
      if (!f.session?.canIssue) { f.state.approve = 'skip'; f.state.issue = 'skip'; f.note = f.session?.signedIn ? { key: 'wake.tool.sessionOnly' } : null; return true; }
      if (Date.now() - f.started >= TOOL_CONNECTION_TIMEOUT_MS) return toolFailure(f, 'approve', { state: 'timeout', code: 'tool_deadline', stage: 'operation' });
      clearTimeout(f.toolDeadlineTimer);
      f.running = false; f.cause = 'approve'; f.state.approve = 'fail'; f.actions = ['deny', 'approve'];
      const decision = env.approve(f); env.redraw();
      const yes = await decision;
      if (flows[f.key] !== f) return false;
      if (!yes) return fail(f, 'approve', 'denied', ['retry']);
      f.cause = null; f.actions = []; f.running = true; f.state.approve = 'run';
      f.approvedTool = true; f.nativeFlow = null; f.started = Date.now(); startToolDeadline(f);
      return true;
    },
    issue: async f => {
      const r = await tool('issue', f);
      if (r?.ok) {
        f.token = true; f.identity = r.identity; f.readVerified = r.readVerified === true;
        if (f.readVerified) clearTimeout(f.toolDeadlineTimer);
        return true;
      }
      return toolFailure(f, 'issue', r);
    },
    ready: async () => true,
  };
  /* 도구 로그인: 이미 로그인한 세션이면 바로 통과. 아니면 Wake 탭에 그 도구의 실제 로그인 화면을 열고 로그인될 때까지 지켜봄
     (탭을 닫으면 취소, 5분이 지나면 시간 초과). Wake는 비밀번호를 읽거나 넣지 않음 */
  async function toolLogin(f) {
    const sessionOptions = f.manualSession ? { interactive: true } : undefined;
    f.session = await tool('session', f, sessionOptions);
    if (f.session?.authentication === 'bootstrap') {
      if (f.session.bootstrapAuthenticated === true && f.session.canIssue === true) return true;
      return toolFailure(f, 'login', f.session.code || f.session.error ? f.session : { state: 'forbidden', code: 'tool_forbidden', stage: 'session' });
    }
    if (f.session?.error || ['timeout', 'cancelled', 'busy'].includes(f.session?.state)) return toolFailure(f, 'login', f.session);
    if (f.session?.signedIn) return true;
    clearTimeout(f.toolDeadlineTimer);
    if (f.nativeFlow) await env.tool('cancel', f, { flowId: f.nativeFlow });
    if (flows[f.key] !== f) return false;
    f.nativeFlow = null; f.manualLoginWait = true;
    await env.openLogin(f); f.hint = 'wake.flow.h.login'; env.redraw();
    const until = Date.now() + LIMITS.loginMs;
    while (flows[f.key] === f) {
      await sleep(LIMITS.pollMs);
      if (flows[f.key] !== f) return false;
      f.session = await tool('session', f, sessionOptions);
      if (f.session?.signedIn) {
        f.hint = null; f.manualLoginWait = false; f.nativeFlow = null; f.started = Date.now(); startToolDeadline(f); return true;
      }
      if (!env.loginOpen(f)) return fail(f, 'login', 'tabClosed', ['retry']);
      if (Date.now() > until) return fail(f, 'login', 'timeout', ['retry']);
    }
    return false;
  }

  /* 다시 확인: 연결 확인의 단계를 그대로 보임. 성공하면 잠깐 뒤 접히고, 멈추면 펼친 채 원인과 동작을 보임 */
  function recheck(id) {
    if (flows[id]?.running && flows[id].method === 'recheck') return flows[id];
    const f = flows[id] = { key: id, method: 'recheck', order: RECHECK, state: Object.fromEntries(RECHECK.map(s => [s, 'wait'])), running: true, actions: [], probing: id, map: null, started: Date.now() };
    /* 답이 15초 넘게 없으면 응답 기다리는 중(취소·계속 기다리기) */
    f.quiet = setTimeout(() => { if (flows[id] === f && f.running && !f.waiting) { f.cause = 'quiet'; f.actions = ['cancel', 'wait']; env.redraw(); env.reveal?.(id); } }, LIMITS.quietMs);
    env.redraw();
    return f;
  }
  async function recheckDone(id, r) {
    const f = flows[id]; if (!f || f.method !== 'recheck' || !f.running) return; // 취소한 확인의 늦은 답은 버림
    clearTimeout(f.quiet); if (f.cause === 'quiet') { f.cause = null; f.actions = []; }
    f.probing = null;
    /* 통과: 남은 단계를 하나씩 채운 뒤 연결됨(머리가 단계보다 먼저 바뀌지 않음) */
    if (r.state === 'ok') for (const s of f.order) { if (f.state[s] === 'done' || f.state[s] === 'skip') continue; f.state[s] = 'run'; env.redraw(); await sleep(LIMITS.stepMinMs); if (flows[id] !== f || !f.running) return; f.state[s] = 'done'; }
    f.running = false;
    if (probeResult(f, r, null)) f.done = true;
  }

  /* 확인에서 멈춘 줄의 설치·다시 로그인: 그 줄이 펼쳐져 해당 단계(도구 확인·인증)가 도는 동안 아래 터미널에서 명령을 실행.
     종료 0이면 같은 줄을 다시 확인, 아니면 판정 표대로 그 단계에서 멈춤(127: 그 명령 자체가 없음 -> 설치 안내) */
  async function fix(id, step, line) {
    const f = recheck(id); f.state[step] = 'run'; f.probing = null; env.redraw();
    const r = await command(f, line, LIMITS.loginMs);
    if (flows[id] !== f) return;
    if (r.exit === 0) { setTimeout(() => env.terminal().close(RUN), LIMITS.closeAfterMs); return env.recheck([id]); }
    const rule = judge(r.exit, f.output);
    f.install = r.exit === 127 ? INSTALL_OF[line.split(' ')[0]] || null : null;
    fail(f, step, rule.cause, r.exit === 127 ? (f.install ? ['copyInstall'] : []) : rule.actions,
      { raw: f.output.slice(-600), causeVars: r.exit === 127 ? { tools: `(${line.split(' ')[0]})` } : {} });
  }

  /* 줄을 누름: 흐름 없이 받은 확인 결과를 흐름 모습으로(원인의 두 낱말, 동작, 원문 출력). 다시 실행하지 않음 */
  function detail(id, r) {
    if (flows[id] || !r || r.state === 'ok') return;
    const g = flows[id] = { key: id, method: 'recheck', order: RECHECK, state: Object.fromEntries(RECHECK.map(s => [s, 'wait'])), running: false, actions: [] };
    probeResult(g, r, null); env.redraw();
  }

  const api = {
    view, run, recheck, recheckDone, onProbeStep, invalidOf, detail, fix, state: key => stateOf(flows[key]),
    get: key => flows[key],
    keys: () => Object.keys(flows),
    /* 끝난 연결의 줄 상태(접힌 줄 머리에 보임) */
    status: key => (flows[key]?.done ? { kind: 'ok', label: { key: 'wake.flow.done', vars: { ctx: flows[key].target || '' } } } : null),
    /* 실패한 단계부터 다시(사용자가 누름) */
    retry: key => { const f = flows[key]; if (!f) return; if (f.cleanupPending) return api.disconnect(key); if (f.method === 'recheck') return env.recheck([key]); const at = f.order.find(s => f.state[s] === 'fail') || f.order[0]; return run(key, f.method, f.values, at, { kind: f.kind, cluster: f.cluster, tool: f.tool, target: f.target, origin: f.origin, chart: f.chart }); },
    /* 차트 고르기(에이전트): 고른 폴더로 설치 단계부터 다시 */
    pickChart: async key => { const f = flows[key]; if (!f) return; const r = await env.service('agent.pickChart'); if (!r?.path) return; f.chart = r.path; return api.retry(key); },
    /* 취소: 터미널 명령은 그 프로세스를 끝내고(판정 표가 취소로), 그 밖(로그인 탭 기다리기, 확인)은 지금 단계에서 취소로 멈춤 */
    cancel: key => { const f = flows[key]; if (!f?.running) return; if (f.cmd) return env.terminal().cancel(RUN);
      if (METHODS[f.method]?.tool) {
        void env.tool('cancel', f).catch(() => {});
        env.closeLogin?.(f, false);
      } clearTimeout(f.quiet);
      const at = f.order.find(s => f.state[s] === 'run') || f.order.find(s => f.state[s] === 'wait') || f.order[0]; flows[key] = { ...f, cause: null }; fail(flows[key], at, 'cancelled', ['retry']); },
    wait: key => { const f = flows[key]; if (!f) return; f.waiting = true; f.cause = null; f.actions = []; env.redraw(); },
    /* 설치·로그인: 터미널에서 실행하고, 끝나면 그 단계부터 다시. 도구의 로그인은 로그인 단계부터 다시(로그인 탭) */
    install: async key => { const f = flows[key]; if (!f?.install) return; set(f, 'tool', 'run'); f.cause = null; f.actions = []; f.running = true; const r = await command(f, f.install, LIMITS.loginMs); if (r.exit === 0) return run(key, f.method, f.values, 'tool'); fail(f, 'tool', judge(r.exit, f.output).cause, ['install'], { raw: f.output.slice(-600) }); },
    login: async key => {
      const f = flows[key]; if (!f) return;
      if (METHODS[f.method]?.tool || f.kind === 'tool') return run(key, 'tool-login', {}, null, { kind: 'tool', cluster: f.cluster, tool: f.tool, manualSession: true });
      const m = METHODS[f.method], line = f.loginCommand || m?.loginCommand; if (!line || f.running) return; set(f, 'login', 'run'); f.cause = null; f.actions = []; f.running = true; const r = await command(f, line, LIMITS.loginMs);
      if (r.exit === 0) { if (m.op) setTimeout(() => env.terminal().close(RUN), LIMITS.closeAfterMs); return run(key, f.method, f.values, 'login', { target: f.target }); }
      fail(f, 'login', r.exit === null ? 'cancelled' : 'loginNeeded', r.exit === null ? ['retry'] : ['login'], { raw: f.output.slice(-600) });
    },
    copyInstall: key => env.copy(flows[key]?.install || ''),
    /* 필요한 권한 보기: 시트를 열고, 그 뒤로는 권한이 생겼는지 주기마다 다시 봄(생기면 그 단계부터 자동으로 이어서 연결) */
    perm: key => { const f = flows[key]; if (!f) return; env.permSheet(f); if (f.watch) return; f.watch = true; env.redraw();
      const tick = async () => { if (flows[key] !== f || !f.watch) return;
        const ok = await env.permGranted(f).catch(() => false);
        if (flows[key] !== f || !f.watch) return;
        if (ok) { f.watch = false; return api.retry(key); }
        f.watchTimer = setTimeout(tick, LIMITS.watchMs); };
      f.watchTimer = setTimeout(tick, LIMITS.watchMs); },
    focus: key => env.focus(key, flows[key]?.field),
    /* 연결 해제: Wake가 만든 토큰을 도구에서 지우고 키체인 항목과 기록을 지움 */
    disconnect: async (key, rec) => {
      let f = flows[key]; if (f?.running) return;
      const method = f?.method || rec?.method;
      if (!f) {
        const order = METHODS[method]?.steps || ['ready'];
        f = flows[key] = { key, method, target: rec?.target, ...(rec?.where || {}), order, state: Object.fromEntries(order.map(step => [step, 'wait'])), actions: [] };
      }
      f.running = true; f.cleanupPending = true; f.cause = null; f.actions = []; f.hint = 'wake.flow.h.disconnect'; env.redraw();
      let result;
      try { result = METHODS[method]?.op ? await env.service('conn.forget', { method, target: f.target || rec?.target || key }) : await tool('disconnect', f); }
      catch { result = { state: 'unknown' }; }
      if (flows[key] !== f) return result;
      const explicit = result?.ok === true && (!Object.hasOwn(result, 'localDeleted') || result.localDeleted === true);
      if (!explicit) {
        const states = ['credential_cleanup_failed', 'identity_changed', 'notReady', 'unconfigured', 'busy', 'forbidden', 'unauthorized'];
        const state = states.includes(result?.state) ? result.state : 'unknown';
        const at = f.order.includes('authn') ? 'authn' : f.order.at(-1);
        fail(f, at, 'unknown', ['retry'], { done: false, hint: null, raw: JSON.stringify({ state, localDeleted: false }) });
        return result;
      }
      delete flows[key]; env.record(key, null); env.redraw(); return result;
    },
    /* 시작할 때 남은 연결 기록을 상태로(도구: 저장한 토큰이 아직 통하는지 한 번 확인) */
    /* 시작할 때와 주기마다 남은 연결 기록을 상태로: 확인 결과 r = { ok } 또는 { at(멈춘 단계), cause } (도구는 { state }) */
    restore: (key, rec, r) => { if (flows[key]?.cleanupPending) return; const m = METHODS[rec.method], ok = !!r?.ok, order = m?.steps || [];
      if (flows[key] && stateOf(flows[key]) !== 'connected' && !['failed', 'needs-login', 'needs-perm', 'needs-install', 'timeout'].includes(stateOf(flows[key]))) return; // 사람이 진행 중·멈춘 흐름은 건드리지 않음
      const f = flows[key] = { key, method: rec.method, target: rec.target, order, state: {}, running: false, done: ok, identity: rec.identity, token: rec.credentialMode === 'service', kind: rec.kind, actions: [], ...(rec.where || {}) };
      const toolCause = { unauthorized: 'unauthorized', forbidden: 'forbidden', timeout: 'timeout' };
      const cause = ok ? null : m?.op ? (CAUSE_ACTIONS[r?.cause] ? r.cause : 'unknown') : toolCause[r?.state] || 'toolDown';
      const at = ok ? null : m?.op ? (order.includes(r?.at) ? r.at : order[0])
        : ['unauthorized', 'forbidden'].includes(cause) && order.includes('authn') ? 'authn' : 'reach';
      order.forEach((s, j) => { f.state[s] = ok || j < order.indexOf(at) ? (s === 'approve' || s === 'issue') && !f.token ? 'skip' : 'done' : 'wait'; });
      if (!ok) { f.state[at] = 'fail'; f.cause = cause; f.raw = r?.error || ''; f.install = r?.install || null; f.loginCommand = r?.login || null; f.need = cause === 'forbidden' ? env.needOf?.(r) || null : null;
        const loginTool = ['grafana', 'argocd'].includes(f.tool?.kind);
        f.actions = m?.op ? CAUSE_ACTIONS[cause].filter(a => a !== 'copyInstall' || f.install)
          : loginTool && ['unauthorized', 'forbidden'].includes(cause) ? ['login', 'token'] : ['retry']; }
      env.redraw(); },
    /* 연결 기록 다시 입력(비밀 값을 다시 받는 대화상자) */
    input: key => env.input?.(flows[key] || { key }),
    clear: key => { if (flows[key]?.cause === 'approve') env.cancelApproval?.(key); delete flows[key]; env.redraw(); },
    preflight: async (key, method) => {
      const m = METHODS[method]; if (!m) return;
      if (flows[key]?.running) return;
      const f = flows[key] = { key, method, values: {}, order: m.steps, state: Object.fromEntries(m.steps.map(s => [s, 'wait'])), running: false, preflight: true, actions: [] };
      env.redraw();
      for (const s of m.steps.filter(x => x === 'tool' || x === 'login')) { if (flows[key] !== f) return; set(f, s, 'run'); const ok = await STEPS[s](f, m).catch(e => fail(f, s, 'unknown', [], { raw: String(e?.message || e) })); if (flows[key] !== f) return; if (ok === false) { f.running = false; return; } set(f, s, 'done'); }
      f.running = false; env.redraw();
    },
  };
  return api;
}
