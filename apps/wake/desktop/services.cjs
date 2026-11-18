/*
 * Wake 데스크톱 서비스(메인 프로세스). kit가 셸·앱 탭에서 부르는 이름 -> 함수(desktop.config.cjs services).
 *   kube.read             kubeconfig 파일만 읽어 context 목록(앱 시작 때, 클러스터에 접속하지 않음)
 *   kube.connectionsRepair  연결 설정 파일(connections.json) 권한 고치기: 셸 문서·confirm: true만, 0600·내 계정 폴더, 내용·링크는 거절
 *   kube.probe {id}       연결 확인 6단계(probe.cjs)
 *   kube.access {id}      namespace별 읽기·쓰기·Secret 권한
 *   kube.list {id, kind, ns}  종류 표(data/kinds.js)의 원본 목록, namespaces / kube.get {id, kind, ns, name, managedFields?} / kube.logs {id, ns, name, container?, previous?, tail?}
 *   kube.pickFile / kube.addPaste {text} / kube.addToken {name, server, token, ca?}  새로 연결(비밀 값은 키체인)
 *   kube.openFile {path}  kubeconfig 파일을 기본 편집기로 열기(고치면 파일 감시가 다시 확인)
 *   conn.save / conn.step / conn.verify / conn.forget  AI 공급자·알림·GitOps 연결의 단계 확인(conn-ops.cjs). 비밀 값은 키체인에만
 *   kube.can {id, verb, group, resource, namespace}  내 자격이 그 일을 할 수 있는지(SelfSubjectAccessReview)
 *   notify.send {target, text}  연결한 알림(Slack 웹후크)으로 글 하나(사람이 누를 때만)
 *   kube.summary {id}     클러스터 상태 요약(버전, 노드, namespace, Pod) / agent.status {id}  에이전트(DaemonSet wake-system/wake-agent) 존재와 rollout
 *   agent.heartbeat {id}  에이전트 Node별 heartbeat Lease, 버전, watch 종류, 지연 이력 6시간, RBAC(agent-heartbeat.cjs)
 *   agent.prep {chart?} / agent.pickChart  에이전트 설치 준비(Helm, 차트 폴더: 없으면 앱에 든 agent-install-charts/wake-agent-only)와 차트 폴더 고르기
 *   tools.find {id} -> { list, access, error? }  클러스터 안 도구(권한이 없으면 access: forbidden과 403 메시지, tools.cjs)
 *   tool.query {id, kind, route}  클러스터 안 도구(Loki, Tempo, Prometheus, Alertmanager)에 읽기 질의 하나(GET, 경로 허용 목록, Kubernetes API 포트 포워딩)
 *   term.target {contextId}  shell main frame only: native remote target metadata; incomplete configuration blocks launch
 *   term.env {id, namespace?, scope?, resource?: {kind, name}}  로컬 cwd와 고정 context·namespace 환경(명령 실행 없음)
 *   cli.check {method}    연결 방법의 명령줄 도구가 있는지와 버전(설치하지 않음, 읽기만). 방법·도구·확인 명령은 connect-cli.cjs 표에만
 *   cli.login {method}    그 클라우드에 로그인돼 있는지(브라우저를 열지 않는 읽기 명령, 20초 제한)
 *   cli.regions {method}  로그인한 클라우드의 지역 목록(aws ec2 describe-regions, 읽기만)
 *   cli.clusters {method, region}  로그인한 클라우드의 그 지역 클러스터 이름 목록(aws eks list-clusters, 읽기만)
 *   tool.op {op, f, extra}  도구 연결 단계(reach, session, issue, verify, setToken, forget, disconnect, home, identity: tool-connect.cjs). 토큰 값은 돌려주지 않음
 *   costs.state {id}      OpenCost 연결 상태(저장된 연결 기록만): { status: connected|unconfigured, service? }
 *   hub.release {id}      클러스터 연결 해제: 허브 주기 수집(알림·이벤트)을 멈추고 그 클러스터의 출처 상태를 잊음
 *   kube.fingerprint      읽는 kubeconfig 파일들의 지문과 context 목록(명령 실행 전후 비교: 바뀌었는지, 새로 생긴 context)
 *   incident.list · incident.workspace · audit.query · ai.* · approval.decide · aiserver.* · screen.reply  인시던트·감사·AI·외부 AI 길(hub.cjs). ai.cancel은 진행 중인 실행 멈춤
 * 이벤트: kube-changed(파일 바뀜), probe-step {id, step}(연결 확인 단계 시작), ai-event {run, ev}(내장 AI 진행), ai-screen(화면 상태 묻기),
 *   approval(새 승인 요청)
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const { kubeconfigPaths, loadKubeconfig, contextList, watchFiles, yaml, yamlError } = require('./kubeconfig.cjs');
const { createProviderConnections } = require('./provider-connections.cjs');
const { createClient, execInvocation, execConsentKey, execConsentView } = require('./k8s.cjs');
const { createExecConsent } = require('./exec-consent.cjs');
const { createTerminalCredentials } = require('./terminal-credential.cjs');
const { createTools } = require('./tools.cjs');
const { createOpenCost } = require('./opencost.cjs');
const { createObservability } = require('./observability.cjs');
const { createKeychain } = require('./keychain.cjs');
const { readPodLogWindow, readLokiPodLogWindow } = require('./pod-logs.cjs');
const { argoDeployment, fluxDeployment } = require('./gitops-deployment.cjs');
const { createConnOps } = require('./conn-ops.cjs');
const cli = require('./connect-cli.cjs');
const { remoteTarget } = require('../../../kit/desktop/index.cjs');
const { createToolConnect } = require('./tool-connect.cjs');
const { createToolBootstrap } = require('./tool-bootstrap.cjs');
const { createHubReads } = require('./reads/index.cjs');
const { createAgentHeartbeat } = require('./agent-heartbeat.cjs');
const { createHub } = require('./hub.cjs');
const { createKubeWatch } = require('./kube-watch.cjs');
const { agentInstallGuard, agentImageState } = require('./agent-install-charts/image-state.cjs');
const { discloseText } = require('../data/mask.js');
/* 화면으로 보내는 원본: managedFields는 따로(YAML 보기에서 켤 때만), Secret 값·값을 담는 주석은 어떤 경우에도 보내지 않음(kube-sanitize.cjs) */
const { sanitize } = require('./kube-sanitize.cjs');
const { slim: slimEvent } = require('./reads/events.cjs');

/* 리소스 종류 표(data/kinds.js, 화면과 같은 표): 읽을 수 있는 종류와 그 API 경로. 원본은 읽기만, Secret은 읽지 않음 */
const kinds = import(require('node:url').pathToFileURL(path.join(__dirname, '../data/kinds.js')).href);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const listMismatch = () => Object.assign(new Error('invalid resource list response'), { kind: 'unknown', code: 'KUBE_LIST_TYPE_MISMATCH' });
/* 목록 항목 하나(목록 응답과 watch 사건이 같은 확인): 종류가 맞아야 하고, 정리한 사본. 이벤트는 보관할 모양으로 줄인다(메모리·IPC) */
function typedItem(item, definition) {
  if (!record(item) || (Object.hasOwn(item, 'apiVersion') && item.apiVersion !== definition.api)
    || (Object.hasOwn(item, 'kind') && item.kind !== definition.kind)) throw listMismatch();
  const typed = sanitize({ ...item,
    ...(!Object.hasOwn(item, 'apiVersion') ? { apiVersion: definition.api } : {}),
    ...(!Object.hasOwn(item, 'kind') ? { kind: definition.kind } : {}) });
  return definition.kind === 'Event' ? { ...slimEvent(typed), metadata: { ...slimEvent(typed).metadata, resourceVersion: typed.metadata.resourceVersion } } : typed;
}
function typedListItems(response, definition) {
  if (!record(response) || !Object.hasOwn(response, 'apiVersion') || response.apiVersion !== definition.api
    || !Object.hasOwn(response, 'kind') || response.kind !== definition.kind + 'List'
    || !Object.hasOwn(response, 'items') || !Array.isArray(response.items)) throw listMismatch();
  return response.items.map(item => typedItem(item, definition));
}
/* 목록을 continue로 끝까지(최대 max개). 다 읽지 못했으면 partial */
async function listAll(client, listPath, { page = 500, max = 10_000 } = {}) {
  const items = []; let token = '', partial = false;
  do {
    const q = new URLSearchParams({ limit: String(Math.min(page, max - items.length)) });
    if (token) q.set('continue', token);
    const r = await client.request('GET', listPath + (listPath.includes('?') ? '&' : '?') + q);
    items.push(...(r?.items || [])); token = r?.metadata?.continue || '';
    if (token && items.length >= max) { partial = true; break; }
  } while (token);
  return { items, partial };
}
const NS_NAME = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/;
/* 도구 찾기(Service 목록 + 도구마다 Endpoints·Pod 대조)를 출처 대상 확인·관측 주소가 다시 쓰는 시간(화면의 도구 찾기와 다시 찾기는 언제나 새로) */
const FIND_MAX_AGE_MS = 120_000;
const secretRefused = () => Object.assign(new Error('Secret is not read by Wake'), { kind: 'forbidden', status: 403 });

/* kube.openFile이 열지 않는 이름: 열면 실행되는 묶음·스크립트(운영체제 기본 앱이 실행함) */
const OPEN_REFUSED = /\.(?:app|command|sh|bash|zsh|fish|csh|tool|terminal|workflow|scpt|applescript|pkg|mpkg|dmg|jar|py|rb|pl|js|mjs|cjs|exe|bat|cmd|ps1|webloc|inetloc|fileloc|url|desktop)$/i;

const gitopsText = value => typeof value === 'string' && value.length > 0 ? value : null;
function gitopsMetadata(object, { id, receivedAt, revision, targetRevision, multiSource = false }) {
  return { sourceIdentity: { clusterId: id, namespace: gitopsText(object.metadata?.namespace), name: gitopsText(object.metadata?.name),
    uid: gitopsText(object.metadata?.uid), resourceVersion: gitopsText(object.metadata?.resourceVersion) },
    revision: gitopsText(revision), targetRevision: gitopsText(targetRevision), multiSource,
    observedAt: gitopsText(object.status?.observedAt), reconciledAt: gitopsText(object.status?.reconciledAt), receivedAt,
    diffState: 'not_queried', diffFiles: null };
}

function saveError(error) {
  if (error.kind === 'connections') return { error: 'connection configuration unavailable', kind: 'connections', code: error.code, repair: error.repair };
  const isKeychain = error.kind === 'keychain';
  return { error: isKeychain ? 'keychain unavailable' : 'failed to save kubeconfig', kind: isKeychain ? 'keychain' : 'config', code: 'CONFIG_SAVE_ERROR' };
}

function openGcpConsoleInChrome(url) {
  if (os.platform() !== 'darwin') throw Object.assign(new Error('unsupported platform'), { code: 'CONSOLE_UNSUPPORTED_PLATFORM' });
  if (!fs.existsSync('/Applications/Google Chrome.app')) throw Object.assign(new Error('browser unavailable'), { code: 'CONSOLE_BROWSER_UNAVAILABLE' });
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/open', ['-a', '/Applications/Google Chrome.app', url], { timeout: 10000, windowsHide: true, shell: false }, error => error ? reject(error) : resolve());
  });
}

/* 연결 설정 파일 오류마다 고치는 길(화면의 고치기 동작이 고르는 코드): 권한·소유자, 내용, 그 밖(다시 시도) */
const CONNECTIONS_REPAIR = { CONNECTIONS_PARENT_INVALID: 'CONNECTIONS_REPAIR_PERMISSIONS', CONNECTIONS_FILE_INVALID: 'CONNECTIONS_REPAIR_PERMISSIONS',
  CONNECTIONS_JSON_INVALID: 'CONNECTIONS_REPAIR_CONTENT', CONNECTIONS_TOO_LARGE: 'CONNECTIONS_REPAIR_CONTENT' };
class ConnectionsError extends Error {
  constructor(code, published = false) {
    super('connection configuration unavailable');
    this.name = 'ConnectionsError'; this.kind = 'connections'; this.code = code; this.published = published;
    this.repair = CONNECTIONS_REPAIR[code] || 'CONNECTIONS_REPAIR_RETRY';
  }
}
function createConnectionStore(userData, filename = 'connections.json') {
  const maxBytes = 1048576;
  const fail = code => { throw new ConnectionsError(code); };
  function parent() {
    const before = fs.lstatSync(userData);
    if (!before.isDirectory() || before.isSymbolicLink() || before.uid !== process.geteuid() || (before.mode & 0o022)) fail('CONNECTIONS_PARENT_INVALID');
    const directory = fs.realpathSync(userData), fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const sameParent = () => {
      const current = fs.lstatSync(userData), canonical = fs.lstatSync(directory), actual = fs.fstatSync(fd);
      if (!current.isDirectory() || current.isSymbolicLink() || current.uid !== process.geteuid() || (current.mode & 0o022)
        || current.dev !== before.dev || current.ino !== before.ino || canonical.dev !== actual.dev || canonical.ino !== actual.ino
        || actual.dev !== before.dev || actual.ino !== before.ino) fail('CONNECTIONS_PARENT_CHANGED');
    };
    try { sameParent(); } catch (error) { fs.closeSync(fd); throw error; }
    return { directory, fd, sameParent };
  }
  function readAt(directory) {
    const file = path.join(directory, filename);
    let fd, bytes;
    try {
      let before;
      try { before = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return { value: { files: [] }, signature: null }; throw error; }
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      let stat = fs.fstatSync(fd);
      if (!stat.isFile() || before.isSymbolicLink() || stat.uid !== process.geteuid() || ![0o600, 0o644].includes(stat.mode & 0o777)
        || stat.nlink !== 1 || stat.size > maxBytes || stat.dev !== before.dev || stat.ino !== before.ino) fail('CONNECTIONS_FILE_INVALID');
      bytes = Buffer.alloc(stat.size + 1); let count = 0, read;
      while (count < bytes.length && (read = fs.readSync(fd, bytes, count, bytes.length - count, count)) > 0) count += read;
      const after = fs.fstatSync(fd), current = fs.lstatSync(file);
      if (count !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs
        || after.uid !== stat.uid || after.nlink !== 1 || (after.mode & 0o777) !== (stat.mode & 0o777)
        || current.ctimeMs !== after.ctimeMs || current.mtimeMs !== after.mtimeMs || current.size !== after.size
        || current.dev !== stat.dev || current.ino !== stat.ino || current.nlink !== 1 || current.uid !== stat.uid || (current.mode & 0o777) !== (stat.mode & 0o777)) fail('CONNECTIONS_FILE_CHANGED');
      let value;
      try { value = JSON.parse(bytes.subarray(0, count).toString('utf8')); } catch { fail('CONNECTIONS_JSON_INVALID'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CONNECTIONS_JSON_INVALID');
      if ((stat.mode & 0o777) === 0o644) {
        fs.fchmodSync(fd, 0o600); fs.fsyncSync(fd);
        const secured = fs.fstatSync(fd), named = fs.lstatSync(file);
        if (secured.dev !== stat.dev || secured.ino !== stat.ino || secured.uid !== stat.uid || secured.nlink !== 1
          || secured.size !== stat.size || secured.mtimeMs !== stat.mtimeMs || (secured.mode & 0o777) !== 0o600
          || named.dev !== secured.dev || named.ino !== secured.ino || named.nlink !== 1 || named.uid !== secured.uid
          || (named.mode & 0o777) !== 0o600 || named.ctimeMs !== secured.ctimeMs || named.mtimeMs !== secured.mtimeMs || named.isSymbolicLink()) fail('CONNECTIONS_FILE_CHANGED');
        stat = secured;
      }
      return { value, signature: JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, createHash('sha256').update(bytes.subarray(0, count)).digest('hex')]) };
    } finally { bytes?.fill(0); if (fd !== undefined) fs.closeSync(fd); }
  }
  function conns() {
    let home;
    try { home = parent(); const result = readAt(home.directory); home.sameParent(); return result.value; }
    catch (error) { if (error instanceof ConnectionsError) throw error; throw new ConnectionsError('CONNECTIONS_READ_FAILED'); }
    finally { if (home) fs.closeSync(home.fd); }
  }
  function saveConns(value) {
    let home, fd, temporary, published = false;
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CONNECTIONS_JSON_INVALID');
      const bytes = JSON.stringify(value, null, 1);
      if (Buffer.byteLength(bytes) > maxBytes) fail('CONNECTIONS_TOO_LARGE');
      home = parent();
      const original = readAt(home.directory);
      temporary = path.join(home.directory, '.' + path.basename(filename, '.json') + '-' + require('node:crypto').randomUUID() + '.tmp');
      fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.uid !== process.geteuid() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size !== Buffer.byteLength(bytes)) fail('CONNECTIONS_TEMP_INVALID');
      fs.closeSync(fd); fd = undefined;
      home.sameParent();
      if (readAt(home.directory).signature !== original.signature) fail('CONNECTIONS_FILE_CHANGED');
      const namedTemporary = fs.lstatSync(temporary);
      if (!namedTemporary.isFile() || namedTemporary.isSymbolicLink() || namedTemporary.dev !== stat.dev || namedTemporary.ino !== stat.ino
        || namedTemporary.uid !== stat.uid || namedTemporary.nlink !== 1 || (namedTemporary.mode & 0o777) !== 0o600) fail('CONNECTIONS_TEMP_CHANGED');
      fs.renameSync(temporary, path.join(home.directory, filename));
      published = true; temporary = undefined;
      const committed = fs.lstatSync(path.join(home.directory, filename));
      if (!committed.isFile() || committed.isSymbolicLink() || committed.dev !== stat.dev || committed.ino !== stat.ino
        || committed.uid !== stat.uid || committed.nlink !== 1 || (committed.mode & 0o777) !== 0o600) fail('CONNECTIONS_FILE_CHANGED');
      fs.fsyncSync(home.fd); home.sameParent();
    } catch (error) {
      if (published) throw new ConnectionsError('CONNECTIONS_COMMIT_UNCERTAIN', true);
      if (error instanceof ConnectionsError) throw error;
      throw new ConnectionsError('CONNECTIONS_WRITE_FAILED');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (temporary) { try { fs.unlinkSync(temporary); } catch { /* 게시되지 않은 자기 임시 파일만 정리한다. */ } }
      if (home) fs.closeSync(home.fd);
    }
  }
  /* 권한 고치기(사람이 요청했을 때만): 내 계정의 폴더에서 그룹·다른 사용자 쓰기를 빼고, 내 계정의 일반 파일(링크·하드 링크 아님)을 0600으로.
     내용·소유자는 바꾸지 않는다(다른 계정의 것은 고치지 못함). 경로가 아니라 연 파일 설명자에 바꾼다(그 사이 바뀐 이름을 따라가지 않음) */
  function repairConns() {
    const fixed = [], own = st => st.uid === process.geteuid();
    const notRepairable = code => ({ error: 'not_repairable', code });
    let dirFd, fd;
    try {
      const before = fs.lstatSync(userData);
      if (!before.isDirectory() || before.isSymbolicLink() || !own(before)) return notRepairable('CONNECTIONS_PARENT_INVALID');
      dirFd = fs.openSync(userData, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const dir = fs.fstatSync(dirFd);
      if (dir.dev !== before.dev || dir.ino !== before.ino) return notRepairable('CONNECTIONS_PARENT_CHANGED');
      if (dir.mode & 0o022) { fs.fchmodSync(dirFd, dir.mode & 0o755); fixed.push('folder'); }
      const file = path.join(userData, filename);
      let named;
      try { named = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return { state: 'repaired', fixed }; throw error; }
      if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1 || !own(named)) return notRepairable('CONNECTIONS_FILE_INVALID');
      if ((named.mode & 0o777) !== 0o600) {
        fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const opened = fs.fstatSync(fd);
        if (opened.dev !== named.dev || opened.ino !== named.ino || opened.nlink !== 1 || !own(opened)) return notRepairable('CONNECTIONS_FILE_CHANGED');
        fs.fchmodSync(fd, 0o600); fixed.push('file');
      }
      return { state: 'repaired', fixed };
    } catch { return notRepairable('CONNECTIONS_REPAIR_FAILED'); }
    finally { if (fd !== undefined) fs.closeSync(fd); if (dirFd !== undefined) fs.closeSync(dirFd); }
  }
  return { conns, saveConns, repairConns };
}

/* GitOps 목록 종류(공유 watch 정의, 화면의 kube.watch에는 열지 않음)와 그 목록 경로 */
const gitopsKind = (group, version, plural, kind) => ({ kind, api: `${group}/${version}`, cluster: false,
  path: ns => `/apis/${group}/${version}/${ns ? `namespaces/${ns}/` : ''}${plural}` });
const GITOPS_KINDS = Object.freeze({
  'applications.argoproj.io': gitopsKind('argoproj.io', 'v1alpha1', 'applications', 'Application'),
  'kustomizations.kustomize.toolkit.fluxcd.io': gitopsKind('kustomize.toolkit.fluxcd.io', 'v1', 'kustomizations', 'Kustomization'),
  'gitrepositories.source.toolkit.fluxcd.io': gitopsKind('source.toolkit.fluxcd.io', 'v1', 'gitrepositories', 'GitRepository'),
});
const GITOPS_PATH_KIND = Object.freeze(Object.fromEntries(Object.entries(GITOPS_KINDS).map(([kind, def]) => [def.path(''), kind])));
const GITOPS_HOLD_MS = 120_000, GITOPS_MEMO_MS = 60_000;

/* Helm의 실제 절대 경로: PATH와 흔한 설치 폴더에서 찾고 실제 파일로 풀어, root나 이 사용자 소유이고 그룹·다른 사람이 쓸 수 없을 때만. 없으면 null */
function defaultHelmPath() {
  const { findCommand, execPath } = require('./k8s.cjs');
  const found = findCommand('helm', { ...process.env, PATH: execPath() });
  if (!found) return null;
  try {
    const real = fs.realpathSync(found), st = fs.statSync(real);
    return st.isFile() && (st.uid === 0 || st.uid === process.geteuid()) && !(st.mode & 0o022) ? real : null;
  } catch { return null; }
}

/* confirm({ message, action, detail, vars }) -> Promise<bool>: kit 메인 프로세스가 직접 띄우는 OS 확인 창(화면 문서는 답할 수 없음). 없으면 언제나 아니오 */
function create({ app, emit, emitTo = () => {}, safeStorage, userData, hooks = {}, remoteTerminalConfig, openExternal = openGcpConsoleInChrome, openPath = p => require('electron').shell.openPath(p), confirm = async () => false,
  pickFolder = () => { const { dialog, BrowserWindow } = require('electron'); return dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), { properties: ['openDirectory'] }); },
  helmPath = defaultHelmPath }) {
  /* Loki·Tempo 질의 다리의 짧은 확인 재사용은 공유 Pod watch 캐시가 같은 Pod UID를 보일 때만(캐시가 없으면 undefined: 요청마다 확인) */
  const keychain = createKeychain({ safeStorage, userData }), tools = createTools({ podIdentity: (id, ns, name) => {
    const pod = kubeWatch?.object(id, 'pods', ns, name);
    return pod === undefined ? undefined : pod?.metadata?.uid ?? null;
  } });
  const dir = path.join(userData, 'kubeconfig.d');
  const { conns, saveConns, repairConns } = createConnectionStore(userData);
  /* 연결 설정 파일(connections.json)을 읽지 못해도 서비스는 선다: 환경의 kubeconfig만 읽고, 오류와 고치는 길은 kube.read의 connections로 보인다 */
  let connectionsError = null;
  const savedFiles = () => {
    try { const files = conns().files; connectionsError = null; return Array.isArray(files) ? files : []; }
    catch (error) { if (error?.kind !== 'connections') throw error; connectionsError = error; return []; }
  };
  const connectionsState = () => (connectionsError ? { state: 'error', code: connectionsError.code, repair: connectionsError.repair } : { state: 'ready' });
  const paths = () => kubeconfigPaths(process.env, savedFiles());
  const kc = () => loadKubeconfig(paths());
  /* exec 인증 명령: 사람이 그 실행 파일·인자·kubeconfig 환경에 동의한 것만 실행(exec-consent.cjs, k8s.cjs needs_consent) */
  const execConsent = createExecConsent({ userData });
  const opts = { keychain, execConsent };
  /* 처음 쓰는 exec 명령의 표시(kube.read 행): 찾은 실제 경로, 가린 인자, 환경 변수 이름(값 없음), 동의 여부. 명령을 찾지 못하면 표시하지 않는다(연결 확인이 noAuthTool) */
  const execConsentOf = user => {
    if (!user?.exec) return undefined;
    try {
      const invocation = execInvocation(user.exec, process.env);
      return { state: execConsent.granted(execConsentKey(invocation)) ? 'granted' : 'needed', ...execConsentView(invocation) };
    } catch { return undefined; }
  };
  /* 터미널 kubectl이 키체인 자격을 쓰는 exec 길(terminal-credential.cjs): 0700 폴더의 0600 ExecCredential 파일, 앱 종료 때 삭제 */
  const terminalCredentials = createTerminalCredentials({ dir: path.join(userData, 'terminal-credentials'), credential: ({ id, user: name }) => {
    const user = kc().users.get(name) || {};
    if (!kc().contexts.has(id)) throw new Error('terminal context unavailable');
    const token = user.tokenRef ? keychain.get(user.tokenRef) : undefined;
    if (token) return { token };
    const key = user.clientKeyRef ? keychain.get(user.clientKeyRef) : undefined;
    if (key && user['client-certificate-data']) return { clientCertificateData: Buffer.from(user['client-certificate-data'], 'base64').toString('utf8'), clientKeyData: Buffer.from(key, 'base64').toString('utf8') };
    throw new Error('terminal credential unavailable');
  } });
  const providers = createProviderConnections({ load: kc, createClient: (config, id) => createClient(config, id, opts) });
  const costs = createOpenCost({ client: providers.client, tools, conns, saveConns });
  const costOperations = new Map(), toolQueries = new Map();
  /* kubeconfig 감시: 시작·감시 중 실패는 kube.read의 watch(출처 상태)로 드러나고, 화면이 다시 읽도록 kube-changed를 보낸다 */
  let watchCheckedAt = Date.now();
  const startWatch = () => { watchCheckedAt = Date.now(); return watchFiles(paths(), () => { releaseGone(); emit('kube-changed', {}); }, { onError: () => emit('kube-changed', {}) }); };
  let unwatch = startWatch();
  const rewatch = () => { unwatch(); unwatch = startWatch(); };
  const watchState = () => { const failures = unwatch.failures ?? [];
    return { id: 'kubeconfig', state: failures.length ? 'error' : 'ready', error: failures.length ? failures.at(-1).code : null, failures, observedAt: new Date(watchCheckedAt).toISOString(),
      receivedAt: failures.at(-1)?.at ?? new Date(watchCheckedAt).toISOString() }; };
  /* kubeconfig에서 사라진 context는 허브 주기 수집을 멈춘다(hubReads는 아래에서 만든다) */
  function releaseGone() { const ids = new Set(contextList(kc()).map(c => c.id)); for (const id of hubReads.watching()) if (!ids.has(id)) hubReads.release(id); }

  /* Wake가 만든 kubeconfig 사본: 비밀 값은 키체인 참조로 바꾸고 0600으로 저장 */
  function saveOwn(doc, name) {
    for (const u of doc.users || []) {
      const x = u.user || {};
      if (x.token) { x.tokenRef = keychain.set(x.token, 'k8s-token'); delete x.token; }
      if (x['client-key-data']) { x.clientKeyRef = keychain.set(x['client-key-data'], 'k8s-key'); delete x['client-key-data']; }
      if (x.password) { x.passwordRef = keychain.set(x.password, 'k8s-password'); delete x.password; }
    }
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name.replace(/[^\w.-]/g, '_')}-${Date.now().toString(36)}.yaml`);
    fs.writeFileSync(file, yaml.dump(doc), { mode: 0o600 });
    const c = conns(); c.files = [...new Set([...c.files, file])]; saveConns(c); rewatch();
    return { file, contexts: (doc.contexts || []).map(x => x.name) };
  }
  /* 도구 탭 로그인 토큰(Grafana 서비스 계정 토큰, Argo CD API 토큰): 키체인에만, 그 도구 주소로 가는 요청에만 Bearer로 붙음(kit tool-auth.cjs) */
  const toolKey = id => String(id).replace(/[^\w.-]+/g, '-');
  hooks.toolHeaders = (id, origin) => {
    const config = conns(), key = toolKey(id), meta = config.toolMeta?.[key];
    if (typeof origin !== 'string' || !meta?.binding || typeof meta.binding.serviceUid !== 'string' || !meta.binding.serviceUid || typeof meta.binding.podUid !== 'string' || !meta.binding.podUid || meta.origin !== origin || meta.contextId !== meta.binding.contextId || meta.kind !== meta.binding.kind
      || key !== toolKey(meta.contextId + '-' + meta.kind)) return null;
    const ref = config.toolTokens?.[key], token = ref && keychain.get(ref);
    return token ? { Authorization: `Bearer ${token}` } : null;
  };
  /* 도구 연결 단계(tool-connect.cjs): 화면이 보내는 것은 동작 이름과 도구 하나(클러스터, 종류, 서비스)뿐 */
  /* 관측 연결의 Prometheus 주소: 저장한 주소 없이 그 클러스터 안에서 찾은 Prometheus 하나로 포트 포워딩(tools.cjs) */
  async function prometheusOrigin(contextId, signal) {
    const client = providers.client(contextId);
    const rows = (await tools.find(client, contextId, { maxAge: FIND_MAX_AGE_MS })).filter(row => row.kind === 'prometheus');
    if (rows.length !== 1 || !rows[0].bindingId) throw Object.assign(new Error('prometheus unconfigured'), { status: 'unconfigured' });
    return new URL((await tools.open(client, contextId, rows[0], { signal })).url).origin;
  }
  const observability = createObservability({ userData, contextIds: () => contextList(kc()).map(c => c.id), client: providers.client, prometheusOrigin });
  /* 도구 쓰기·관리자 비밀 읽기·알림 보내기의 감사 행(S-09): 허브 감사 기록에. 기록 실패가 동작을 막지 않는다 */
  const audit = row => hub().then(h => h.record(row)).catch(() => {});
  const toolBootstrap = createToolBootstrap({ userData, audit,
    registeredClient: providers.registeredClient,
    operatorClient: receipt => createClient(loadKubeconfig([receipt.operatorKubeconfig]), receipt.operatorContext, { ...opts, credentialScope: 'tool-operator' }) });
  const toolConnect = createToolConnect({ bootstrap: toolBootstrap, toolAccess: tools, client: providers.client, keychain, conns, saveConns, audit,
    partition: key => require('electron').session.fromPartition(`persist:wake-tool-${toolKey(key)}`) });
  const connOps = createConnOps({ keychain, conns, saveConns, client: providers.client, audit });
  const agentHeartbeat = createAgentHeartbeat({ client: providers.client });
  /* 허브 읽기(reads/index.cjs): 지표·알림·네트워크·Helm·이벤트 7일·로그 수준·출처 상태. 도구는 찾은 Service로 포트 포워딩 */
  const hubReads = createHubReads({ userData, client: providers.client, maskText: text => require('../data/mask.js').maskText(text), liveEvents: (id, ns) => kubeWatch.peek(id, 'events', ns),
    /* 출처 확인 대신: 그 클러스터의 준비된 watch 스트림(Kubernetes), 잡아 둔 Application watch(Argo CD) */
    liveWatch: (id, source) => kubeWatch.stats().some(e => e.id === id && e.state === 'ready' && e.source === 'watch' && e.subs > 0 && (source === 'kubernetes' || e.kind === 'applications.argoproj.io')),
    /* Grafana 읽기는 키체인의 Viewer 토큰이 있을 때만(도구 탭 로그인과 같은 토큰). 없으면 연결 안 됨 */
    toolQuery: (id, kind, route, signal) => {
      let bearer = null;
      if (kind === 'grafana') { const ref = conns().toolTokens?.[toolKey(id + '-grafana')]; bearer = ref ? keychain.get(ref) : null; if (!bearer) return Promise.resolve({ error: 'unconfigured' }); }
      return tools.query(providers.client(id), id, kind, route, toolBootstrap.discoveryEntries(id), signal, 'application/json', bearer);
    },
    cached: (id, plural) => kubeWatch.peek(id, plural, '_all'),
    /* 출처의 대상 identity: Kubernetes는 kube-system Namespace, 도구(Argo CD 포함)는 이 클러스터에서 찾은 Service 하나의 UID */
    targetOf: async (id, source) => {
      const c = providers.client(id), reason = e => ({ reason: e?.status === 403 || e?.kind === 'forbidden' ? 'forbidden' : e?.status === 404 ? 'not_found' : 'lookup_failed' });
      try {
        if (source === 'kubernetes') { const ns = await c.request('GET', '/api/v1/namespaces/kube-system'); return { uid: ns.metadata.uid, ref: 'Namespace/kube-system' }; }
        const rows = (await tools.find(c, id, { maxAge: FIND_MAX_AGE_MS })).filter(row => row.kind === source);
        if (rows.length !== 1) return { reason: rows.length ? 'ambiguous' : 'not_found' };
        const svc = await c.request('GET', `/api/v1/namespaces/${encodeURIComponent(rows[0].ns)}/services/${encodeURIComponent(rows[0].svc)}`);
        return { uid: svc.metadata.uid, ref: `Service/${rows[0].ns}/${rows[0].svc}` };
      } catch (error) { return reason(error); }
    } });
  /* 쿠버네티스 목록의 공유 watch 캐시(kube-watch.cjs): 화면이 구독(kube.watch)하고, kube.list·kube.get·로그의 Pod 확인·이벤트 보관이 같은 캐시를 읽는다 */
  const kubeWatch = createKubeWatch({ client: providers.client, definition: async kind => (kind === 'secrets' ? null : GITOPS_KINDS[kind] ?? (await kinds).KIND_OF[kind] ?? null),
    listItems: typedListItems, clean: typedItem,
    onChange: (id, kind, ns, changes) => { if (kind === 'events' && ns === '_all') hubReads.recordEvents(id, changes.filter(c => c.t === 'u').map(c => c.o)); } });
  /* GitOps 목록: 첫 GET이 그 종류의 목록(typed)을 돌려주면 공유 watch를 잡아 두고(마지막 읽기에서 GITOPS_HOLD_MS까지), 그 뒤 읽기는 캐시에서(요청 0).
     watch가 준비되지 않았으면 놓고 GET으로 돌아간다. CRD가 없거나 권한이 없으면 watch를 열지 않는다(다시 시도 폭주 없음) */
  const gitopsHolds = new Map(), gitopsMemos = new Map();
  async function gitopsList(id, p, fetch) {
    const kind = GITOPS_PATH_KIND[p], key = JSON.stringify([id, kind]);
    const drop = hold => { if (gitopsHolds.get(key) !== hold) return; clearTimeout(hold.timer); gitopsHolds.delete(key); hold.handle.close(); };
    const hold = gitopsHolds.get(key);
    if (hold) {
      clearTimeout(hold.timer); hold.timer = setTimeout(() => drop(hold), GITOPS_HOLD_MS); hold.timer.unref?.();
      await hold.handle.snapshot;
      const items = kubeWatch.peek(id, kind, '_all');
      if (items) return { items };
      drop(hold);
    }
    const value = await fetch();
    const def = GITOPS_KINDS[kind];
    if (value?.apiVersion === def.api && value?.kind === def.kind + 'List' && Array.isArray(value.items) && !gitopsHolds.has(key)) {
      const next = { handle: kubeWatch.subscribe(id, kind, '_all', () => {}), timer: null };
      next.timer = setTimeout(() => drop(next), GITOPS_HOLD_MS); next.timer.unref?.();
      gitopsHolds.set(key, next);
    }
    return value;
  }
  /* 컨트롤러 Deployment(argocd-server·kustomize-controller) 확인: 공유 watch 캐시에 있으면 그것, 없으면 GET 결과를 GITOPS_MEMO_MS 동안 다시 씀 */
  async function gitopsMemo(id, p, fetch) {
    const m = /^\/apis\/apps\/v1\/namespaces\/([^/]+)\/deployments\/([^/]+)$/.exec(p), cached = m ? kubeWatch.object(id, 'deployments', m[1], m[2]) : undefined;
    if (cached) return cached;
    if (cached === null) throw Object.assign(new Error('not found'), { status: 404 });
    const key = JSON.stringify([id, p]), memo = gitopsMemos.get(key);
    if (memo && Date.now() - memo.at < GITOPS_MEMO_MS) return memo.read;
    const entry = { at: Date.now(), read: fetch() };
    gitopsMemos.set(key, entry);
    entry.read.catch(() => { if (gitopsMemos.get(key) === entry) gitopsMemos.delete(key); });
    return entry.read;
  }
  /* 화면 문서(보낸 webContents·문서 세대)마다 구독: 그 문서가 현재가 아니게 되면(탭 전환·이동·닫힘) 모두 닫고 닫혔다고 알린다 */
  const watchSubs = new Map();
  function ownerSubs(owner) {
    const key = owner.senderWebContentsId + ':' + owner.senderDocumentGeneration;
    let subs = watchSubs.get(key);
    if (subs) return subs;
    subs = new Map(); watchSubs.set(key, subs);
    let stop = null, gone = false;
    stop = owner.subscribe(() => {
      gone = true; stop?.(); watchSubs.delete(key);
      for (const [sub, handle] of subs) { handle.close(); emitTo(owner, 'kube-watch', { sub, closed: true }); }
      subs.clear();
    });
    if (gone) stop?.();
    return subs;
  }
  /* 로그 읽기의 Pod 확인(읽기 전후 두 번)은 Pod watch가 살아 있으면 그 캐시에서: 따라가기마다 Pod GET 두 번이 나가지 않게 */
  const POD_PATH = /^\/api\/v1\/namespaces\/([^/]+)\/pods\/([^/?]+)$/;
  const logClient = id => { const c = providers.client(id);
    return { ...c, request: (method, p, body, o) => { const hit = method === 'GET' && !body && POD_PATH.exec(p);
      const cached = hit ? kubeWatch.object(id, 'pods', decodeURIComponent(hit[1]), decodeURIComponent(hit[2])) : undefined;
      return cached ? Promise.resolve(cached) : c.request(method, p, body, o); } }; };
  /* 앱을 끌 때: 주기 수집 타이머와 kubeconfig 감시, watch를 멈춘다 */
  app?.once?.('will-quit', () => { hubReads.close(); unwatch(); terminalCredentials.close(); kubeWatch.close(); require('./ai-cli.cjs').stopAllRuns(); });
  /* 인시던트·AI 허브(hub.cjs): 감지, 작업면, 근거 스냅샷, 감사 기록, 승인, 도구 층(MCP·HTTP API), 내장 AI */
  /* 읽기는 화면 읽기 서비스와 같은 층(hubReads.cluster). 처음 부를 때 만든다; 외부 AI 경로를 켜 둔 적이 있으면 앱을 켤 때 바로(서버가 다시 열림) */
  let hubStarted = null;
  /* 승인 허용의 사람 확인(approvals.cjs decide): 그 승인 ID·대상·경로·바뀌는 값을 메인 프로세스의 OS 확인 창에 보이고 허용을 누를 때만 true.
     계획 해시는 보이지 않고 approvals가 확인 전후로 대조한다. 컨테이너 자원 값은 "limits.memory (컨테이너 app): 64Mi -> 128Mi"(그 index의 이름 가드) */
  const containerOf = (p, guards) => { const m = /^(.*\b(?:initContainers|containers)\[\d+\])\.resources\.(.+)$/.exec(String(p));
    const guard = m && guards.find(g => g?.path === m[1] + '.name'); return guard ? { field: m[2], container: String(guard.value) } : null; };
  const changeLine = (v, guards) => { const c = containerOf(v.path, guards), before = String(v.before ?? ''), after = String(v.after ?? '');
    return c ? { $t: 'wake.approval.confirm.containerChange', vars: { ...c, before, after } } : { $t: 'wake.approval.confirm.change', vars: { path: String(v.path), before, after } }; };
  const approvalConfirm = shown => confirm({ message: 'wake.approval.confirm.message', action: 'wake.approval.confirm.allow', detail: 'wake.approval.confirm.detail',
    vars: { title: String(shown.title ?? ''), cluster: shown.cluster, target: [shown.target?.namespace, shown.target?.kind, shown.target?.name].filter(Boolean).join('/'),
      route: { $t: `wake.inc.route.${shown.route}` }, changes: shown.values.length ? shown.values.map(v => changeLine(v, shown.guards)) : [String(shown.command ?? '')], id: shown.id } });
  const hub = () => (hubStarted ??= createHub({ userData, emit, sources: hubReads.cluster(), contexts: () => contextList(kc()).map(c => c.id), version: app?.getVersion?.(),
    secret: (method, target) => { const ref = conns().secrets?.[`${method}:${target}`]; return ref ? keychain.get(ref) ?? null : null; },
    cliConnected: id => !!conns().aiCli?.[id], confirm: approvalConfirm }));
  if (fs.existsSync(path.join(userData, 'hub', 'ai-server.json'))) hub().catch(() => {});
  /* 터미널이 사람을 위해 실행하는 선언 명령의 문지기(kit main hooks.commandGuard, 화면의 판단과 무관):
     공개 이미지가 없는 차트로는 에이전트 설치(Helm)를 실행하지 않는다. 클러스터에 쓰는 명령(에이전트 설치·권한 부여)은 등록된 context에만,
     에이전트 차트는 앱에 든 차트나 사람이 메인 프로세스 폴더 창(agent.pickChart)에서 고른 차트만, KUBECONFIG는 Wake가 읽는 파일(화면이 보낸 값 대신) */
  const bundledChart = path.join(app?.isPackaged ? __dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked') : __dirname, 'agent-install-charts', 'wake-agent-only');
  const realOf = p => { try { return fs.realpathSync(p); } catch { return null; } };
  const pickedCharts = new Set();
  hooks.commandGuard = (id, args) => {
    const refused = agentInstallGuard(id, args);
    if (refused) return refused;
    const context = id === 'agent.install' ? args.cluster : id.startsWith('perm.grant.') ? args.context : null;
    if (context == null) return null;
    if (!kc().contexts.has(context)) return 'COMMAND_CONTEXT_UNREGISTERED';
    if (id !== 'agent.install') return { env: { KUBECONFIG: paths().join(path.delimiter) } };
    const chart = realOf(args.chart);
    if (!chart || (chart !== realOf(bundledChart) && !pickedCharts.has(chart))) return 'AGENT_CHART_UNAPPROVED';
    return prepareAgentInstall(context, chart);
  };
  /* 에이전트 설치 한 번에 쓸 것을 메인 프로세스가 고정한다(확인 창이 보인 것이 실행되는 것): 차트의 사본(내용 다이제스트, 링크·특수 파일은 거절),
     확인한 context·cluster·user 하나만 든 kubeconfig(파일 참조는 내용으로 넣음, 0600, userData/agent-install/<id> 0700), Helm의 실제 절대 경로.
     키체인 참조 자격(tokenRef 등)은 Helm이 읽지 못해 거절, exec 사용자는 동의한 플러그인을 Wake가 실행해 고정 자격으로(동의 없으면 EXEC_CONSENT_REQUIRED).
     Helm은 허용 목록 환경(env -i: PATH·HOME·KUBECONFIG)으로만 실행해 시작 파일의 HELM_*·KUBE* 값이 끼어들지 않는다. 실행이 끝나거나 취소되면 cleanup이 폴더를 지운다 */
  /* 앱이 실행 도중 끝나 지우지 못한 지난 설치 폴더는 시작할 때 지운다 */
  try { fs.rmSync(path.join(userData, 'agent-install'), { recursive: true, force: true }); } catch { /* 다음 설치가 새 폴더를 쓴다 */ }
  function prepareAgentInstall(context, chart) {
    const k = kc(), ctx = k.contexts.get(context), cl = k.clusters.get(ctx?.cluster), user = k.users.get(ctx?.user);
    if (!ctx || !cl?.server || !user) return 'COMMAND_CONTEXT_UNREGISTERED';
    if (user.tokenRef || user.clientKeyRef || user.passwordRef) return 'AGENT_INSTALL_CREDENTIAL_UNSUPPORTED';
    /* exec 인증 사용자: 사람이 동의한 그 실행 파일·인자·환경일 때만 Wake가 한 번 실행해 받은 자격을 고정 값으로 넣는다(Helm이 플러그인을 실행하지 않음) */
    let resolved = null;
    if (user.exec) {
      let invocation;
      try { invocation = execInvocation(user.exec, process.env); } catch { return 'EXEC_CREDENTIAL_FAILED'; }
      if (!execConsent.granted(execConsentKey(invocation))) return 'EXEC_CONSENT_REQUIRED';
      try {
        const st = JSON.parse(require('node:child_process').execFileSync(invocation.cmd, invocation.args, { env: invocation.env, timeout: 30000, maxBuffer: 1 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).status || {};
        resolved = st.token ? { token: st.token } : st.clientCertificateData && st.clientKeyData
          ? { 'client-certificate-data': Buffer.from(st.clientCertificateData).toString('base64'), 'client-key-data': Buffer.from(st.clientKeyData).toString('base64') } : null;
      } catch { resolved = null; }
      if (!resolved) return 'EXEC_CREDENTIAL_FAILED';
    }
    const helm = helmPath();
    if (!helm) return 'HELM_NOT_FOUND';
    const root = path.join(userData, 'agent-install');
    const dir = path.join(root, require('node:crypto').randomUUID());
    const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
    try {
      fs.mkdirSync(root, { recursive: true, mode: 0o700 }); fs.mkdirSync(dir, { mode: 0o700 });
      const snapshot = path.join(dir, 'chart'), digest = createHash('sha256');
      const copy = (from, to, rel) => {
        fs.mkdirSync(to, { mode: 0o700 });
        for (const name of fs.readdirSync(from).sort()) {
          const src = path.join(from, name), dst = path.join(to, name), st = fs.lstatSync(src), r = rel ? `${rel}/${name}` : name;
          if (st.isDirectory()) { digest.update(`d ${r}\n`); copy(src, dst, r); }
          else if (st.isFile()) { const bytes = fs.readFileSync(src); digest.update(`f ${r} ${bytes.length}\n`).update(bytes); fs.writeFileSync(dst, bytes, { mode: 0o600, flag: 'wx' }); }
          else throw Object.assign(new Error('chart entry is not a plain file'), { code: 'AGENT_CHART_UNAPPROVED' });
        }
      };
      copy(chart, snapshot, '');
      if (agentImageState(snapshot).published !== true) { cleanup(); return 'AGENT_IMAGE_UNPUBLISHED'; }
      const inline = (o, pairs) => { const x = { ...o }; delete x.file; for (const [file, data] of pairs) if (x[file]) { x[data] = fs.readFileSync(x[file]).toString('base64'); delete x[file]; } return x; };
      const clusterEntry = inline(cl, [['certificate-authority', 'certificate-authority-data']]);
      const userEntry = resolved ?? inline(user, [['client-certificate', 'client-certificate-data'], ['client-key', 'client-key-data']]);
      if (userEntry.tokenFile) { userEntry.token = fs.readFileSync(userEntry.tokenFile, 'utf8').trim(); delete userEntry.tokenFile; }
      const config = path.join(dir, 'kubeconfig');
      fs.writeFileSync(config, yaml.dump({ apiVersion: 'v1', kind: 'Config', 'current-context': context,
        clusters: [{ name: ctx.cluster, cluster: clusterEntry }], users: [{ name: ctx.user, user: userEntry }],
        contexts: [{ name: context, context: { cluster: ctx.cluster, user: ctx.user, ...(ctx.namespace ? { namespace: ctx.namespace } : {}) } }] }), { mode: 0o600, flag: 'wx' });
      const credential = user.exec ? `exec ${user.exec.command}` : userEntry['client-certificate-data'] ? 'client-certificate' : userEntry.token ? 'token' : userEntry.username ? 'basic' : 'none';
      return { env: { KUBECONFIG: config }, args: { chart: snapshot }, program: helm, isolate: true, cleanup,
        detail: { $t: 'wake.agent.install.confirm', vars: { context, server: cl.server, user: ctx.user, credential, digest: digest.digest('hex') } } };
    } catch (error) { cleanup(); return error?.code === 'AGENT_CHART_UNAPPROVED' ? 'AGENT_CHART_UNAPPROVED' : 'AGENT_INSTALL_PREPARE_FAILED'; }
  }
  const TOOL_OPS = new Set(['reach', 'session', 'issue', 'verify', 'setToken', 'forget', 'disconnect', 'home', 'identity', 'cancel']);
  /* 로그 글은 공유 공개 정책(data/mask.js discloseText)을 지나야 IPC를 건넌다 */
  const disclosed = result => (typeof result?.text === 'string' ? { ...result, text: discloseText(result.text).text } : result);
  async function readPagePodLogs(args, from, owner, read) {
    const { id, ns, name } = args || {};
    if (!from?.mainFrame || owner?.kind !== 'page' || !owner.isCurrent() || typeof id !== 'string') return { error: 'identity_changed' };
    /* 읽을 수 있는 화면: 그 클러스터의 로그 구역, 또는 같은 namespace의 Pod·워크로드 상세. Pod UID 대조는 readPodLogWindow가 한다 */
    const cluster = 'wake://cluster/' + encodeURIComponent(id), prefix = cluster + '/ns/';
    const source = owner.sourceAddress?.split('?')[0];
    if (source !== cluster + '/logs') {
      if (!source?.startsWith(prefix)) return { error: 'identity_changed' };
      const [namespace, kind, resource, ...extra] = source.slice(prefix.length).split('/');
      if (extra.length || !resource || (namespace !== '_all' && namespace !== encodeURIComponent(ns)) ||
        !['pods', 'deployments', 'statefulsets', 'daemonsets', 'jobs'].includes(kind) ||
        kind === 'pods' && resource !== encodeURIComponent(name)) return { error: 'identity_changed' };
    }
    const controller = new AbortController();
    const unsubscribe = owner.subscribe(() => controller.abort());
    try {
      const result = await read(logClient(id), args, controller.signal);
      return owner.isCurrent() ? disclosed(result) : { error: 'cancelled' };
    } catch (error) {
      if (controller.signal.aborted) return { error: 'cancelled' };
      if ([401, 403].includes(error?.status)) return { error: 'forbidden' };
      if (error?.status === 404) return { error: 'missing' };
      const known = ['identity_changed', 'forbidden', 'response_too_large', 'unconfigured'];
      return { error: known.includes(error?.kind) ? error.kind : 'connection' };
    } finally { unsubscribe(); }
  }

  return {
    /* OpenCost 연결 상태(저장된 연결 기록만, 클러스터 요청 없음): 설정 › 도구 행과 비용 화면이 같은 사실을 말함 */
    'costs.state': args => (typeof args?.id === 'string' && args.id && args.id.length <= 1024 && !/[\x00-\x1f\x7f]/.test(args.id) ? costs.state(args.id) : { status: 'target' }),
    'costs.open': async (args, from, owner) => {
      const keys = {
        summary: ['id', 'op'],
        targets: ['id', 'op'],
        connect: ['id', 'op', 'service'],
        cancel: ['id', 'op'],
        read: ['id', 'op', 'period', 'from', 'to', 'view', 'namespace', 'controllerKind', 'controller', 'pod', 'node', 'compare'],
      };
      const { id, op } = args || {};
      if (!args || typeof args !== 'object' || Array.isArray(args) || !Object.hasOwn(keys, op)
        || Object.keys(args).some(key => !keys[op].includes(key)) || typeof id !== 'string' || !id || id.length > 1024
        || /[\x00-\x1f\x7f]/.test(id) || !from?.mainFrame || owner?.kind !== 'page' || !owner.isCurrent()
        || owner.sourceAddress.split('?')[0] !== `wake://cluster/${encodeURIComponent(id)}${op === 'summary' ? '' : '/costs'}`) return { status: 'target' };
      const operation = JSON.stringify([owner.sourceWebContentsId, owner.sourceDocumentGeneration]);
      const pending = costOperations.get(operation);
      if (op === 'cancel') { pending?.abort(); return { status: 'cancelled' }; }
      if (pending) return { status: 'busy' };
      const controller = new AbortController();
      costOperations.set(operation, controller);
      const unsubscribe = owner.subscribe(() => controller.abort());
      try { return await costs.run(op === 'summary' ? 'read' : op, args, controller.signal); }
      finally { unsubscribe(); costOperations.delete(operation); }
    },
    'gcp.console.open': async (args, from) => {
      if (!from || ![Object.prototype, null].includes(Object.getPrototypeOf(from))) return { status: 'forbidden', requested: false };
      const sender = Object.getOwnPropertyDescriptors(from);
      if (Reflect.ownKeys(from).length !== 2 || !Object.hasOwn(sender.shell || {}, 'value') || sender.shell.value !== true
        || !Object.hasOwn(sender.mainFrame || {}, 'value') || sender.mainFrame.value !== true) return { status: 'forbidden', requested: false };
      let descriptor;
      try {
        descriptor = observability.resolveGcpConsole(args);
        const expected = new URL('https://console.cloud.google.com/monitoring');
        expected.searchParams.set('project', descriptor.projectId);
        if (descriptor.provider !== 'gcp-monitoring' || descriptor.contextId !== args.contextId
          || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(descriptor.projectId) || descriptor.url !== expected.href) return { status: 'unconfigured', requested: false };
      } catch (error) { return { status: error?.status === 'invalid_request' ? 'invalid_request' : 'unconfigured', requested: false }; }
      try { await openExternal(descriptor.url); }
      catch (error) {
        const status = error?.code === 'CONSOLE_UNSUPPORTED_PLATFORM' ? 'unsupported_platform'
          : error?.code === 'CONSOLE_BROWSER_UNAVAILABLE' ? 'browser_unavailable' : 'external_open_failed';
        return { status, requested: false };
      }
      return { status: 'requested', requested: true, ...descriptor };
    },
    'observability.catalog': () => observability['observability.catalog'](),
    'observability.read': input => observability['observability.read'](input),
    'kube.read': () => { const k = kc(), files = paths();
      const contexts = contextList(k).map(row => { const consent = execConsentOf(k.users.get(row.user)); return consent ? { ...row, execConsent: consent } : row; });
      return { paths: files, files: k.files, current: k.current, contexts, keychain: keychain.usable(), watch: watchState(), connections: connectionsState() }; },
    /* exec 인증 명령 동의(셸 문서만): 그 context의 exec 명령·인자를 사람이 보고 허락했을 때만 기록. 페이지는 동의하지 못한다 */
    'kube.execConsent': (args, from) => {
      if (!from?.shell || from.mainFrame !== true) return { error: 'not_allowed' };
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !['id', 'allow'].includes(key)) || typeof args.id !== 'string' || args.allow !== true) return { error: 'invalid_request' };
      const k = kc(), context = k.contexts.get(args.id), user = context && k.users.get(context.user);
      if (!user?.exec) return { error: 'not_exec' };
      let invocation;
      try { invocation = execInvocation(user.exec, process.env); } catch (error) { return { error: error?.kind || 'noAuthTool', command: user.exec.command }; }
      const view = execConsentView(invocation);
      execConsent.grant(execConsentKey(invocation), view);
      return { state: 'granted', ...view };
    },
    /* 연결 설정 파일 권한 고치기(설정 › 클러스터의 고치기, 셸 문서만, confirm: true일 때만): 지금 오류가 권한이면 폴더·파일 권한을 고치고 다시 읽는다.
       내용 오류·링크·다른 계정의 파일은 고치지 않고 그 코드로 거절 */
    'kube.connectionsRepair': (args, from) => {
      if (!from?.shell || from.mainFrame !== true) return { error: 'not_allowed' };
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== 'confirm') || args.confirm !== true) return { error: 'invalid_request' };
      savedFiles();
      if (!connectionsError) return { state: 'repaired', fixed: [], connections: connectionsState() };
      if (connectionsError.repair !== 'CONNECTIONS_REPAIR_PERMISSIONS') return { error: 'not_repairable', code: connectionsError.code, connections: connectionsState() };
      const result = repairConns();
      savedFiles();
      if (result.state === 'repaired') emit('kube-changed', {});
      return { ...result, connections: connectionsState() };
    },
    'kube.probe': ({ id }) => providers.probe(id, { onStep: step => emit('probe-step', { id, step }) }),
    'cli.check': ({ method }) => cli.check(method),
    /* 도구 연결 해제 뒤에는 그 도구에서 받아 둔 허브 자료(출처 상태·근거 묶음)를 잊는다(spec/data-policy.md#DP-LIFE) */
    'tool.op': async ({ op, f, extra }) => {
      if (!TOOL_OPS.has(op) || !f?.key) return { error: 'unknown op' };
      const cluster = String(f.cluster || ''), result = await toolConnect[op]({ key: String(f.key), cluster, tool: f.tool || null }, extra || {});
      const kind = f.tool?.kind ?? f.kind;
      if (op === 'disconnect' && !result?.error && cluster && typeof kind === 'string') await (await hub()).forgetSource({ cluster, source: kind });
      return result;
    },
    /* 보관 정책(hub.cjs): 출처 하나·클러스터 하나의 자료 잊기, 내 자료 내보내기·지우기(지우기는 confirm: true일 때만) */
    'hub.forgetSource': async args => (await hub()).forgetSource(args || {}),
    'hub.forgetCluster': async args => (await hub()).forgetCluster(args || {}),
    'data.export': async () => (await hub()).exportData(),
    'data.delete': async args => (await hub()).deleteData(args || {}),
    'tool.query': async (args, from, owner) => {
      const { id, kind, route, accept, cancel } = args || {};
      if (!args || typeof args !== 'object' || Array.isArray(args) ||
        Object.keys(args).some(key => !(cancel === true ? ['id', 'kind', 'cancel'] : ['id', 'kind', 'route', 'accept']).includes(key)) ||
        typeof id !== 'string' || !['loki', 'tempo', 'prometheus', 'alertmanager'].includes(kind) || !from?.mainFrame || owner?.kind !== 'page' ||
        owner.sourceAddress !== `wake://cluster/${encodeURIComponent(id)}/api/${kind}` || !owner.isCurrent()) return { error: 'target' };
      const operation = JSON.stringify([owner.sourceWebContentsId, owner.sourceDocumentGeneration]);
      const pending = toolQueries.get(operation);
      if (cancel === true) { pending?.abort(); return { error: 'cancelled' }; }
      if (pending) return { error: 'busy' };
      const controller = new AbortController();
      toolQueries.set(operation, controller);
      const unsubscribe = owner.subscribe(() => controller.abort());
      try {
        const result = await tools.query(providers.client(id), id, kind, route, toolBootstrap.discoveryEntries(id), controller.signal, accept);
        return controller.signal.aborted ? { error: 'cancelled' } : result;
      } catch (error) {
        if (controller.signal.aborted) return { error: 'cancelled' };
        if (error?.name === 'TimeoutError' || error?.kind === 'timeout') return { error: 'timeout' };
        return { error: error?.kind === 'forbidden' ? 'permission' : 'connection' };
      } finally { unsubscribe(); toolQueries.delete(operation); }
    },
    'cli.login': ({ method }) => cli.login(method),
    'cli.regions': ({ method }) => cli.regions(method),
    'cli.clusters': ({ method, region }) => cli.clusters(method, region),
    'kube.fingerprint': () => {
      const hash = require('node:crypto').createHash('sha256');
      for (const f of paths()) { try { hash.update(f); hash.update(fs.readFileSync(f)); } catch { hash.update('-'); } }
      const k = kc(); return { hash: hash.digest('hex').slice(0, 16), contexts: contextList(k).map(c => c.id), current: k.current || '' };
    },
    'kube.access': ({ id }) => providers.access(id),
    /* 목록(원본 객체, 읽기만): namespace가 '_all'이거나 없으면 모든 namespace. 종류는 kinds.js 표에 있는 것만 */
    /* 같은 종류·namespace의 watch가 살아 있으면 그 캐시(서버에 다시 묻지 않음) */
    'kube.list': async ({ id, kind, ns }) => {
      /* Secret은 읽지 않는다(D-01: Wake의 어떤 계정도 Secret get·list·watch를 갖지 않음) */
      if (kind === 'secrets') throw secretRefused();
      const c = providers.client(id);
      if (kind === 'namespaces') return (kubeWatch.peek(id, 'namespaces', '_all') ?? (await c.request('GET', '/api/v1/namespaces')).items ?? []).map(n => n.metadata.name);
      const k = (await kinds).KIND_OF[kind]; if (!k) throw new Error(`unknown kind: ${kind}`);
      const scope = ns && ns !== '_all' && !k.cluster ? ns : '_all';
      return kubeWatch.peek(id, kind, scope) ?? typedListItems(await c.request('GET', k.path(scope === '_all' ? '' : encodeURIComponent(scope))), k);
    },
    /* 목록 구독(화면 문서만): open은 처음 목록 전체(snapshot), 그 뒤로는 그 문서에만 kube-watch { sub, seq, changes | resync+items, state } 묶음. close로 끝냄 */
    'kube.watch': async (args, from, owner) => {
      const { op, id, kind, ns, sub } = args || {};
      if (!record(args) || Object.keys(args).some(key => !['op', 'id', 'kind', 'ns', 'sub'].includes(key)) || !['open', 'close'].includes(op)
        || typeof sub !== 'string' || !/^[\w-]{1,64}$/.test(sub) || !from?.mainFrame || owner?.kind !== 'page' || !owner.isCurrent()) return { error: 'target' };
      const subs = ownerSubs(owner);
      if (op === 'close') { subs.get(sub)?.close(); subs.delete(sub); return { closed: true }; }
      if (kind === 'secrets') return { error: 'forbidden' };
      if (typeof id !== 'string' || !id || id.length > 1024 || /[\x00-\x1f\x7f]/.test(id) || typeof kind !== 'string' || !Object.hasOwn((await kinds).KIND_OF, kind)
        || !(ns === '_all' || NS_NAME.test(ns))) return { error: 'invalid_request' };
      if (subs.size >= 64 && !subs.has(sub)) return { error: 'capacity' };
      subs.get(sub)?.close();
      const handle = kubeWatch.subscribe(id, kind, ns, payload => emitTo(owner, 'kube-watch', { sub, ...payload }));
      subs.set(sub, handle);
      return { sub, ...await handle.snapshot };
    },
    'kube.relationships': async ({ id, kind, ns, name, uid }) => {
      const validName = value => typeof value === 'string' && value.length <= 253 && /^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(value);
      if (!['deployments', 'services'].includes(kind) || !validName(ns) || !validName(name) ||
        typeof uid !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(uid)) throw new Error('invalid relationship subject');
      const client = providers.client(id), source = (await kinds).KIND_OF[kind];
      const namespace = encodeURIComponent(ns), resourcePath = source.path(namespace) + '/' + encodeURIComponent(name);
      const requireIdentity = async () => {
        const object = await client.request('GET', resourcePath);
        if (object.metadata?.uid !== uid || object.metadata?.namespace !== ns || object.metadata?.name !== name) {
          throw Object.assign(new Error('resource UID changed'), { kind: 'identity_changed' });
        }
        return object;
      };
      const resource = await requireIdentity(), service = kind === 'services';
      const definition = service ? { api: 'discovery.k8s.io/v1', kind: 'EndpointSlice' } : { api: 'apps/v1', kind: 'ReplicaSet' };
      const params = new URLSearchParams({ limit: '300' });
      if (service) params.set('labelSelector', 'kubernetes.io/service-name=' + name);
      else {
        const labels = Object.entries(resource.spec?.selector?.matchLabels || {});
        if (labels.length) params.set('labelSelector', labels.map(([key, value]) => key + '=' + value).join(','));
      }
      const list = await client.request('GET', `/apis/${definition.api}/namespaces/${namespace}/${service ? 'endpointslices' : 'replicasets'}?${params}`);
      const items = typedListItems(list, definition).filter(item => {
        if (item.metadata?.namespace !== ns || !item.metadata.uid) return false;
        const refs = item.metadata.ownerReferences ?? [];
        if (!Array.isArray(refs) || refs.some(ref => !ref || typeof ref !== 'object')) return false;
        const owners = refs.filter(ref => ref.kind === source.kind);
        const sameOwner = ref => ref.apiVersion === source.api && ref.uid === uid && ref.name === name;
        if (service) return item.metadata.labels?.['kubernetes.io/service-name'] === name && (!owners.length || owners.some(sameOwner));
        const controllers = refs.filter(ref => ref.controller === true);
        return controllers.length === 1 && sameOwner(controllers[0]);
      });
      await requireIdentity();
      return { items, partial: Boolean(list.metadata?.continue) };
    },
    'kube.get': async ({ id, kind, ns, name, managedFields }) => {
      if (kind === 'secrets') throw secretRefused();
      const k = (await kinds).KIND_OF[kind]; if (!k) throw new Error(`unknown kind: ${kind}`);
      /* managedFields 없이 보는 객체는 살아 있는 watch 캐시에서 */
      const cached = managedFields ? undefined : kubeWatch.object(id, kind, k.cluster ? '' : ns, name);
      if (cached) return cached;
      const o = await providers.client(id).request('GET', `${k.path(k.cluster ? '' : encodeURIComponent(ns))}/${encodeURIComponent(name)}`);
      return sanitize({ apiVersion: k.api, kind: k.kind, ...o }, !!managedFields);
    },
    /* 로그(읽기만): 컨테이너, 이전 컨테이너, 마지막 줄 수, 시각 */
    'kube.logs': async (args, from, owner) => {
      const { id, ns, name, container, previous, tail, window } = args;
      if (!window) return discloseText(await providers.client(id).request('GET', `/api/v1/namespaces/${encodeURIComponent(ns)}/pods/${encodeURIComponent(name)}/log?timestamps=true&tailLines=${Math.min(+tail || 500, 5000)}${container ? '&container=' + encodeURIComponent(container) : ''}${previous ? '&previous=true' : ''}`, null, { raw: true })).text;
      return readPagePodLogs(args, from, owner, (client, request, signal) => readPodLogWindow(client, request, signal));
    },
    'loki.logs': (args, from, owner) => readPagePodLogs(args, from, owner, (client, request, signal) =>
      readLokiPodLogWindow(client, request, route => tools.query(client, request.id, 'loki', route,
        toolBootstrap.discoveryEntries(request.id), signal), signal)),
    'kube.pickFile': async () => {
      const { dialog, BrowserWindow } = require('electron');
      const r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), { properties: ['openFile', 'showHiddenFiles'] });
      if (r.canceled || !r.filePaths[0]) return null;
      const file = r.filePaths[0], k = loadKubeconfig([file]);
      if (k.files[0].state !== 'ok') return { error: k.files[0].error || k.files[0].state, code: k.files[0].code, line: k.files[0].line, column: k.files[0].column };
      const c = conns(); c.files = [...new Set([...c.files, file])]; saveConns(c); rewatch();
      return { file, contexts: [...k.contexts.keys()] };
    },
    'kube.addPaste': ({ text }) => {
      let doc; try { doc = yaml.load(text); } catch (e) { return yamlError(e); }
      if (!doc?.contexts?.length) return { error: 'no contexts' };
      try { return saveOwn(doc, doc['current-context'] || doc.contexts[0].name); } catch (e) { return saveError(e); }
    },
    'kube.addToken': ({ name, server, token, ca }) => {
      const n = name || new URL(server).hostname;
      const doc = { apiVersion: 'v1', kind: 'Config', clusters: [{ name: n, cluster: { server, ...(ca ? { 'certificate-authority-data': Buffer.from(ca).toString('base64') } : {}) } }],
        users: [{ name: n, user: { token } }], contexts: [{ name: n, context: { cluster: n, user: n } }] };
      try { return saveOwn(doc, n); } catch (e) { return saveError(e); }
    },
    /* kubeconfig 파일 열기: kube.read 목록의 파일만, 실제 경로가 일반 파일이고 실행 권한·실행 확장자(.app·.command·.sh 등)가 없을 때만 기본 편집기로 */
    'kube.openFile': async args => {
      const p = args?.path;
      if (typeof p !== 'string' || !path.isAbsolute(p)) return { error: 'not_a_kubeconfig' };
      let real;
      try { real = fs.realpathSync(p); } catch { return { error: 'missing' }; }
      const listed = new Set(paths().flatMap(file => { try { return [fs.realpathSync(file)]; } catch { return []; } }));
      if (!listed.has(real)) return { error: 'not_a_kubeconfig' };
      const stat = fs.statSync(real);
      if (!stat.isFile() || (stat.mode & 0o111) || OPEN_REFUSED.test(path.basename(real))) return { error: 'refused' };
      return openPath(real);
    },
    /* 홈 요약의 원본(읽기만): 버전, Node, namespace 수, Pod, 최근 이벤트, 사용률(metrics-server가 있을 때만) */
    'kube.summary': async ({ id }) => {
      const c = providers.client(id), get = p => c.request('GET', p).catch(() => null);
      /* Pod·이벤트는 continue로 끝까지(상한까지), 다 읽지 못하면 partial에 남긴다. 살아 있는 watch 캐시가 있으면 그것 */
      const all = (kind, listPath, max) => { const cached = kubeWatch.peek(id, kind, '_all'); return cached ? Promise.resolve({ items: cached, partial: false }) : listAll(c, listPath, { max }).catch(() => null); };
      const [ver, nodes, nss, pods, events, usage] = await Promise.all([get('/version'), get('/api/v1/nodes'), get('/api/v1/namespaces'), all('pods', '/api/v1/pods', 10_000), all('events', '/api/v1/events', 2000), get('/apis/metrics.k8s.io/v1beta1/nodes')]);
      const strip = l => (l?.items || []).map(o => sanitize(o));
      return { version: ver?.gitVersion || '', namespaces: nss ? nss.items.length : null, nodes: nodes ? strip(nodes) : null, pods: pods ? strip(pods) : null, events: events ? strip(events) : null, usage: usage ? strip(usage) : null,
        partial: { pods: !!pods?.partial, events: !!events?.partial } };
    },
    /* 에이전트 설치 준비(읽기만): Helm이 있는지, 차트 폴더가 있는지(상대 경로는 터미널 작업 폴더인 홈 기준) */
    /* 이미지 상태(agent-install-charts/image-state.cjs): 공개 이미지가 없으면 agent_image_unpublished로 설치를 멈춘다. 패키지 앱은 app.asar.unpacked의 차트(Helm이 읽을 실제 파일) */
    'agent.prep': ({ chart } = {}) => {
      const abs = chart ? path.resolve(os.homedir(), String(chart)) : bundledChart;
      return { helm: !!require('./k8s.cjs').findCommand('helm', { ...process.env, PATH: require('./k8s.cjs').execPath() }), chart: abs, shown: abs.replace(os.homedir(), '~'), exists: fs.existsSync(path.join(abs, 'Chart.yaml')),
        image: require('./agent-install-charts/image-state.cjs').agentImageState(abs) };
    },
    'agent.heartbeat': args => agentHeartbeat.read(args),
    /* 사람이 메인 프로세스의 폴더 창에서 고른 차트: 에이전트 설치 문지기가 이 실행 동안 허락하는 차트로 기억한다 */
    'agent.pickChart': async () => {
      const r = await pickFolder();
      if (r.canceled || !r.filePaths[0]) return null;
      const real = realOf(r.filePaths[0]);
      if (real) pickedCharts.add(real);
      return { path: r.filePaths[0] };
    },
    'agent.status': async args => {
      const identity = { contextId: null, release: 'wake-agent', namespace: 'wake-system', kind: 'DaemonSet', name: 'wake-agent', uid: null };
      const result = { identity, lookup: 'query_error', installed: null, unknown: true, rolloutReady: null,
        rollout: { state: 'unknown', reason: 'not_observed', counters: null }, imageRef: null, version: null };
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1
        || Object.keys(args)[0] !== 'id' || typeof args.id !== 'string' || !args.id.length || args.id.length > 256 || /[\x00-\x1f\x7f]/.test(args.id)) {
        return { ...result, readError: { kind: 'invalid_request', status: null } };
      }
      identity.contextId = args.id;
      let object;
      try { object = await providers.client(args.id).request('GET', '/apis/apps/v1/namespaces/wake-system/daemonsets/wake-agent'); }
      catch (error) {
        const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : null;
        const lookup = status === 403 || error?.kind === 'forbidden' ? 'forbidden' : status === 404 ? 'absent'
          : error?.kind === 'timeout' || ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(error?.code) || status === 408 || status === 504 ? 'timeout' : 'query_error';
        return { ...result, lookup, installed: lookup === 'absent' ? false : null, unknown: lookup !== 'absent',
          rolloutReady: lookup === 'absent' ? false : null,
          rollout: { state: lookup === 'absent' ? 'absent' : 'unknown', reason: lookup, counters: null }, readError: { kind: lookup, status } };
      }
      const metadata = object?.metadata;
      if (object?.kind !== identity.kind || metadata?.name !== identity.name || metadata?.namespace !== identity.namespace
        || metadata?.labels?.['app.kubernetes.io/instance'] !== identity.release || metadata?.labels?.['app.kubernetes.io/component'] !== 'agent') {
        return { ...result, readError: { kind: 'identity_mismatch', status: null } };
      }
      identity.uid = typeof metadata.uid === 'string' && metadata.uid.length > 0 ? metadata.uid : null;
      result.lookup = 'present'; result.installed = true; result.unknown = false;
      const containers = object.spec?.template?.spec?.containers;
      const agents = Array.isArray(containers) ? containers.filter(container => container?.name === 'agent') : [];
      if (agents.length === 1 && typeof agents[0].image === 'string' && agents[0].image.length > 0 && agents[0].image.length <= 2048
        && !/[\x00-\x1f\x7f]/.test(agents[0].image)) result.imageRef = agents[0].image;
      const status = object.status || {}, countKeys = ['desiredNumberScheduled', 'currentNumberScheduled', 'updatedNumberScheduled', 'numberReady', 'numberAvailable', 'numberMisscheduled'];
      const validCount = value => Number.isSafeInteger(value) && value >= 0;
      if (!identity.uid || !result.imageRef || !Number.isSafeInteger(metadata.generation) || metadata.generation < 1
        || !Number.isSafeInteger(status.observedGeneration) || status.observedGeneration < 1 || !countKeys.every(key => validCount(status[key]))) {
        result.rollout.reason = 'incomplete_observation'; return result;
      }
      const counters = Object.fromEntries(countKeys.map(key => [key, status[key]]));
      const unavailableDerived = !Object.hasOwn(status, 'numberUnavailable');
      const unavailable = unavailableDerived ? counters.desiredNumberScheduled - counters.numberAvailable : status.numberUnavailable;
      if (!validCount(unavailable) || status.observedGeneration > metadata.generation) { result.rollout.reason = 'invalid_status'; return result; }
      counters.numberUnavailable = unavailable;
      result.rollout.counters = counters;
      result.rollout.generation = metadata.generation; result.rollout.observedGeneration = status.observedGeneration;
      result.rollout.unavailableDerived = unavailableDerived;
      result.rolloutReady = false;
      if (metadata.deletionTimestamp) { result.rollout.state = 'progressing'; result.rollout.reason = 'deleting'; return result; }
      if (status.observedGeneration < metadata.generation) { result.rollout.state = 'progressing'; result.rollout.reason = 'generation_not_observed'; return result; }
      if (counters.desiredNumberScheduled === 0) { result.rollout.state = 'not_scheduled'; result.rollout.reason = 'no_desired_nodes'; return result; }
      result.rolloutReady = ['currentNumberScheduled', 'updatedNumberScheduled', 'numberReady', 'numberAvailable'].every(key => counters[key] === counters.desiredNumberScheduled)
        && counters.numberUnavailable === 0 && counters.numberMisscheduled === 0;
      result.rollout.state = result.rolloutReady ? 'ready' : 'progressing';
      result.rollout.reason = result.rolloutReady ? 'rollout_complete' : 'rollout_incomplete';
      return result;
    },
    /* GitOps: 이 클러스터의 Argo CD Application과 Flux Kustomization(원본 GitRepository)을 읽어 저장소 -> 컨트롤러 -> namespace 관계로(읽기만).
       같은 저장소 주소는 한 저장소로 묶음. 컨트롤러 버전은 각 컨트롤러 Deployment의 이미지 태그 */
    'metrics.range': args => hubReads['metrics.range'](args), 'metrics.usage': args => hubReads['metrics.usage'](args),
    'alerts.read': args => hubReads['alerts.read'](args), 'alerts.expr': args => hubReads['alerts.expr'](args),
    'network.read': args => hubReads['network.read'](args),
    'events.read': args => hubReads['events.read'](args), 'logs.levels': args => hubReads['logs.levels'](args),
    'hub.sources': args => hubReads['hub.sources'](args), 'tool.checks': args => hubReads['tool.checks'](args),
    /* 클러스터 연결 해제(설정의 연결 해제): 그 클러스터의 주기 수집을 멈추고 출처 상태를 잊는다 */
    'hub.release': args => { if (!args || typeof args.id !== 'string' || !args.id) return { error: 'invalid_request', source: 'kubernetes' }; hubReads.release(args.id); kubeWatch.close(args.id); return { released: true }; },
    /* 인시던트·감사·AI(hub.cjs) */
    'incident.list': async args => (await hub()).incidents(args), 'incident.workspace': async args => (await hub()).workspace(args), 'audit.query': async args => (await hub()).audit(args),
    'ai.providers': async () => (await hub()).providers(), 'ai.run': async args => (await hub()).run(args), 'ai.conversations': async args => (await hub()).conversations(args),
    'ai.chat': async args => (await hub()).chat(args), 'ai.cancel': async args => (await hub()).cancel(args),
    'approval.decide': async args => (await hub()).decide(args),
    'aiserver.state': async () => (await hub()).serverState(), 'aiserver.set': async args => (await hub()).serverSet(args), 'aiserver.client': async args => (await hub()).client(args),
    'screen.reply': async args => (await hub()).screenReply(args),
    'gitops.diff': ({ id, application, tool }) => {
      if (tool?.kind !== 'argocd' || typeof tool.bindingId !== 'string') return { state: 'unsupported' };
      return toolConnect.gitopsDiff({ key: id + '-argocd', cluster: id, tool }, { application });
    },
    'gitops.read': async ({ id }) => {
      const c = providers.client(id), outcomes = new Map(), received = new Map();
      /* Argo CD Application 읽기는 Argo CD 출처 상태(hub.sources argocd)로 남는다: 홈 칩과 GitOps 값이 같은 읽기를 본다. CRD 없음(404)은 연결 안 됨.
         GitOps 목록(Application·Kustomization·GitRepository)은 GET으로 한 번 있음을 확인한 뒤 공유 watch 캐시에서(gitopsList), 컨트롤러 Deployment 확인은 짧게 다시 씀 */
      const APPS = '/apis/argoproj.io/v1alpha1/applications';
      const fetchOf = p => () => c.request('GET', p);
      const read = p => (p === APPS ? hubReads.track(id, 'argocd', () => gitopsList(id, p, () => c.request('GET', p).catch(e => { throw e?.status === 404 ? Object.assign(e, { kind: 'unconfigured' }) : e; })))
        : GITOPS_PATH_KIND[p] ? gitopsList(id, p, fetchOf(p)) : gitopsMemo(id, p, fetchOf(p)));
      const get = p => read(p).then(value => { outcomes.set(p, 'ok'); received.set(p, new Date().toISOString()); return value; })
        .catch(e => { outcomes.set(p, e.status === 404 ? 'absent' : e.kind === 'forbidden' || e.status === 403 ? 'forbidden' : 'error'); return null; });
      const kustomizations = '/apis/kustomize.toolkit.fluxcd.io/v1/kustomizations';
      const repositories = '/apis/source.toolkit.fluxcd.io/v1/gitrepositories';
      let [apps, ks, gits, argo, flux] = await Promise.all([get('/apis/argoproj.io/v1alpha1/applications'), get(kustomizations),
        get(repositories), get('/apis/apps/v1/namespaces/argocd/deployments/argocd-server'), get('/apis/apps/v1/namespaces/flux-system/deployments/kustomize-controller')]);
      let fixedFlux;
      if (outcomes.get(kustomizations) === 'forbidden' || outcomes.get(repositories) === 'forbidden') {
        fixedFlux = await toolBootstrap.readFlux(id).catch(() => null);
        if (fixedFlux) {
          ks = { items: [fixedFlux.kustomization] };
          gits = { items: [fixedFlux.repository] };
          received.set(kustomizations, new Date().toISOString());
        }
      }
      const repos = new Map();
      const repoOf = (url, branch, commit) => { if (!repos.has(url)) repos.set(url, { id: url, url, name: url.replace(/^[a-z]+:\/\/[^/]+\//, '').replace(/^git@[^:]+:/, '').replace(/\.git$/, ''), branch, commit, apps: [] }); return repos.get(url); };
      for (const a of apps?.items || []) {
        const multiSource = Array.isArray(a.spec?.sources) && a.spec.sources.length > 1;
        const src = multiSource ? {} : a.spec?.source || a.spec?.sources?.[0] || {};
        const revision = multiSource ? null : a.status?.sync?.revision;
        const metadata = gitopsMetadata(a, { id, receivedAt: received.get('/apis/argoproj.io/v1alpha1/applications') || null,
          revision, targetRevision: multiSource ? null : src.targetRevision, multiSource });
        let repo;
        if (multiSource) {
          const key = 'application:' + JSON.stringify([id, a.metadata?.namespace, a.metadata?.name, a.metadata?.uid]);
          repo = { id: key, url: '', name: a.metadata.name, branch: '', commit: '', multiSource: true, apps: [] };
          repos.set(key, repo);
        } else repo = repoOf(String(src.repoURL || ''), src.targetRevision || 'HEAD', a.status?.sync?.revision || '');
        repo.apps.push({ name: a.metadata.name, kind: 'Application', controller: 'argocd', cluster: id, ns: a.spec?.destination?.namespace || '',
          path: src.path || '', sync: a.status?.sync?.status || 'Unknown', health: gitopsText(a.status?.health?.status), deployment: argoDeployment(a),
          auto: !!a.spec?.syncPolicy?.automated, repoURL: multiSource ? null : gitopsText(src.repoURL), ...metadata });
      }
      /* Flux: Kustomization의 sourceRef(GitRepository)에서 저장소 주소·브랜치·적용 리비전, Ready 조건에서 상태 */
      const gitRepo = (name, ns) => (gits?.items || []).find(g => g.metadata.name === name && g.metadata.namespace === ns);
      const ready = o => { const r = (o.status?.conditions || []).find(x => x.type === 'Ready'); return o.spec?.suspend ? 'Suspended' : !r ? 'Unknown' : r.status === 'True' ? 'Ready' : r.status === 'False' ? 'NotReady' : 'Progressing'; };
      for (const k of ks?.items || []) {
        const ref = k.spec?.sourceRef || {}; if (ref.kind !== 'GitRepository') continue;
        const g = gitRepo(ref.name, ref.namespace || k.metadata.namespace); if (!g) continue;
        const rev = String(g.status?.artifact?.revision || k.status?.lastAppliedRevision || ''), sha = rev.includes(':') ? rev.split(':').pop() : rev.split('/').pop();
        const r = g.spec?.ref || {};
        repoOf(String(g.spec?.url || ''), r.branch || r.tag || r.semver || r.name || 'main', sha).apps.push({ name: k.metadata.name, kind: 'Kustomization', controller: 'flux', cluster: id, ns: k.spec?.targetNamespace || k.metadata.namespace, path: String(k.spec?.path || './').replace(/^\.\//, '') || '.', sync: ready(k), health: null, deployment: fluxDeployment(k), auto: !k.spec?.suspend, repoURL: gitopsText(g.spec?.url),
          ...gitopsMetadata(k, { id, receivedAt: received.get('/apis/kustomize.toolkit.fluxcd.io/v1/kustomizations') || null,
            revision: k.status?.lastAppliedRevision, targetRevision: r.branch || r.tag || r.semver || r.name }) });
      }
      const tag = d => (d?.spec?.template?.spec?.containers?.[0]?.image || '').split(':')[1] || '';
      /* 컨트롤러마다 읽기 권한: 목록을 못 읽으면 forbidden(관리자 필요). Deployment도 목록도 못 읽으면 컨트롤러가 있는지조차 모름 -> access forbidden */
      const can = p => outcomes.get(p) || 'error';
      const controllers = [...(argo || apps ? [{ kind: 'argocd', ns: 'argocd', version: tag(argo), access: can('/apis/argoproj.io/v1alpha1/applications') }] : []),
        ...(flux || ks?.items?.length ? [{ kind: 'flux', ns: 'flux-system', version: tag(flux), access: fixedFlux ? 'partial' : can(kustomizations) }] : [])];
      const listStates = [...outcomes].filter(([p, state]) => !p.includes('/deployments/') && state !== 'absent').map(([, state]) => state);
      const supportedStates = [...outcomes.values()].filter(state => state !== 'absent');
      const hasLists = listStates.includes('ok') || !!fixedFlux, allDenied = listStates.length > 0 && listStates.every(state => state === 'forbidden');
      if (!hasLists && listStates.includes('error')) throw Object.assign(new Error('GitOps API request failed'), { kind: 'unreachable', code: 'GITOPS_READ_FAILED' });
      const access = supportedStates.every(state => state === 'ok') ? 'ok' : !hasLists && allDenied ? 'forbidden' : 'partial';
      return { repos: [...repos.values()].filter(r => r.apps.length), controllers: controllers.length ? { [id]: controllers } : {}, access };
    },
    /* 도구 찾기: 서비스를 읽을 권한이 없으면 "찾은 도구 없음"이 아니라 권한 상태(관리자 요청 글과 함께) */
    'tools.find': async ({ id, refresh }) => {
      try {
        const entries = toolBootstrap.discoveryEntries(id);
        let list, denied = null;
        try { list = await tools.find(providers.client(id), id, { refresh: refresh === true }); }
        catch (error) { if (!entries.length) throw error; list = []; denied = error.kind || 'unknown'; }
        const results = await Promise.allSettled(entries.map(entry => tools.findFixed(id, [entry])));
        const fixed = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        const kinds = new Set(fixed.map(row => row.kind));
        if (results.some(result => result.status === 'rejected')) denied ||= 'identity_unverified';
        const discovered = list.filter(row => !kinds.has(row.kind));
        return { list: [...discovered, ...fixed], access: denied ? 'partial' : 'ok' };
      }
      catch (e) { return { list: [], access: e.kind === 'forbidden' ? 'forbidden' : e.kind || 'unknown', error: String(e.message || e).slice(0, 400) }; }
    },
    'term.target': (args, from) => {
      if (!from?.shell || from.mainFrame !== true) return { error: 'remote terminal sender not allowed', code: 'REMOTE_SENDER_REJECTED' };
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1 || Object.keys(args)[0] !== 'contextId' || typeof args.contextId !== 'string') return { error: 'invalid remote terminal target', code: 'REMOTE_ARGUMENTS_REJECTED' };
      if (!kc().contexts.has(args.contextId)) return { error: 'remote terminal context unavailable', code: 'REMOTE_UNCONFIGURED' };
      const target = remoteTarget(remoteTerminalConfig, args.contextId);
      return target.error ? target : { ...target, identityVerification: 'required_at_launch' };
    },
    'term.env': (args = {}) => {
      const { id, namespace, scope = '', resource = {} } = args || {};
      const namespaceOk = value => typeof value === 'string' && value.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value);
      const resourceOk = value => typeof value === 'string' && value.length <= 253 && (!value || /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value));
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !['id', 'namespace', 'scope', 'resource'].includes(k)) || typeof id !== 'string' || !id || id.length > 1024 || /[\x00-\x1f\x7f]/.test(id)
        || (namespace != null && !namespaceOk(namespace)) || (scope !== '' && scope !== '_all' && !namespaceOk(scope))
        || !resource || typeof resource !== 'object' || Array.isArray(resource) || Object.keys(resource).some(k => !['kind', 'name'].includes(k)) || !resourceOk(resource.kind ?? '') || !resourceOk(resource.name ?? '')) return { error: 'invalid terminal target', code: 'INVALID_TERMINAL_TARGET' };
      const source = kc(), context = source.contexts.get(id);
      if (!context?.cluster || !source.clusters.has(context.cluster) || (context.user && !source.users.has(context.user))) return { error: 'terminal context unavailable', code: 'TERMINAL_CONTEXT_UNAVAILABLE' };
      const ns = namespace ?? (context.namespace || 'default');
      if (!namespaceOk(ns)) return { error: 'invalid terminal namespace', code: 'INVALID_TERMINAL_TARGET' };
      const target = { cluster: id, context: id, namespace: ns, scope, resource: { kind: resource.kind || '', name: resource.name || '' } };
      const digest = createHash('sha256').update(JSON.stringify(target)).digest('hex');
      const f = path.join(userData, 'terminal', `${digest}.kubeconfig`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      /* Wake가 키체인에 둔 자격(tokenRef·clientKeyRef)은 kubectl이 읽지 못한다: 그 user 대신 자격 파일을 출력하는 exec user(kubeconfig에는 토큰이 없음) */
      const user = context.user ? source.users.get(context.user) : null;
      const helperUser = user && !user.exec && (user.tokenRef || user.clientKeyRef) ? `wake-terminal-${digest.slice(0, 16)}` : null;
      let exec = null;
      try { exec = helperUser ? terminalCredentials.issue({ id, user: context.user }) : null; } catch { /* 키체인에서 꺼내지 못함: 원래 user로(kubectl이 인증 실패를 그대로 보임) */ }
      const users = exec ? [{ name: helperUser, user: { exec } }] : [];
      const userName = exec ? helperUser : context.user;
      fs.writeFileSync(f, yaml.dump({ apiVersion: 'v1', kind: 'Config', 'current-context': id, contexts: [{ name: id, context: { cluster: context.cluster, ...(userName ? { user: userName } : {}), namespace: ns } }], ...(users.length ? { users } : {}) }), { mode: 0o600 });
      return { cwd: os.homedir(), target, env: { KUBECONFIG: [f, ...paths()].join(path.delimiter), WAKE_CLUSTER: id, WAKE_CONTEXT: id, WAKE_NAMESPACE: ns, WAKE_SCOPE_NAMESPACE: scope, WAKE_RESOURCE_KIND: target.resource.kind, WAKE_RESOURCE_NAME: target.resource.name } };
    },
    /* 내 자격이 그 일을 할 수 있는지(SelfSubjectAccessReview, 읽기만): 필요한 권한을 직접 줄 수 있을 때만 직접 적용을 보임 */
    'kube.can': async ({ id, verb, group, resource, namespace }) => {
      const r = await providers.client(id).request('POST', '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
        { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview', spec: { resourceAttributes: { verb, group, resource, ...(namespace ? { namespace } : {}) } } });
      return { allowed: !!r?.status?.allowed };
    },
    /* 연결한 알림으로 글 한 덩어리 보내기(사람이 누를 때만) */
    'notify.send': ({ target, text }) => connOps.send({ target, text }),
    'conn.save': p => connOps.save(p), 'conn.step': p => connOps.step(p), 'conn.verify': p => connOps.verify(p), 'conn.forget': p => connOps.forget(p),
  };
}
module.exports = { create };
