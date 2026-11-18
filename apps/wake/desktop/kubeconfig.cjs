/*
 * kubeconfig 읽기(파일만 읽음, 클러스터에 접속하지 않음). kubectl과 같은 규칙:
 *   - 파일 목록: KUBECONFIG(경로 구분자로 나뉜 여러 파일, 없는 파일은 건너뜀), 없으면 ~/.kube/config. Wake가 더한 파일은 그 뒤에.
 *   - 병합: clusters·contexts·users는 이름이 같으면 먼저 나온 파일의 것, current-context도 먼저 정한 파일의 것.
 *   - 상대 경로(certificate-authority, client-certificate, client-key, exec.command가 경로일 때)는 그 항목이 나온 파일의 폴더 기준.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('./vendor/js-yaml.cjs');

function kubeconfigPaths(env = process.env, extra = []) {
  const fromEnv = (env.KUBECONFIG || '').split(path.delimiter).filter(Boolean);
  const base = fromEnv.length ? fromEnv : [path.join(os.homedir(), '.kube', 'config')];
  return [...new Set([...base, ...extra].map(p => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()))))];
}

const FILE_KEYS = { cluster: ['certificate-authority'], user: ['client-certificate', 'client-key', 'tokenFile'] };
function absolutize(obj, kind, dir) {
  if (!obj) return obj;
  const o = { ...obj };
  for (const k of FILE_KEYS[kind]) if (o[k] && !path.isAbsolute(o[k])) o[k] = path.resolve(dir, o[k]);
  if (kind === 'user' && o.exec?.command && /[\\/]/.test(o.exec.command) && !path.isAbsolute(o.exec.command)) o.exec = { ...o.exec, command: path.resolve(dir, o.exec.command) };
  return o;
}

/** 파일들을 읽어 병합한 결과와 파일별 상태를 돌려준다 */
function loadKubeconfig(paths) {
  const files = [], merged = { clusters: new Map(), users: new Map(), contexts: new Map(), current: null };
  for (const file of paths) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { files.push({ path: file, state: e.code === 'ENOENT' ? 'missing' : 'unreadable', error: 'failed to read kubeconfig', code: ['ENOENT', 'EACCES', 'EPERM', 'EISDIR'].includes(e.code) ? e.code : 'CONFIG_READ_ERROR' }); continue; }
    let doc;
    try { doc = yaml.load(text) || {}; } catch (e) { files.push({ path: file, state: 'invalid', ...yamlError(e) }); continue; }
    if (typeof doc !== 'object' || Array.isArray(doc)) { files.push({ path: file, state: 'invalid', error: 'not a kubeconfig' }); continue; }
    const dir = path.dirname(file);
    for (const c of doc.clusters || []) if (c?.name && !merged.clusters.has(c.name)) merged.clusters.set(c.name, { ...absolutize(c.cluster || {}, 'cluster', dir), file });
    for (const u of doc.users || []) if (u?.name && !merged.users.has(u.name)) merged.users.set(u.name, { ...absolutize(u.user || {}, 'user', dir), file });
    for (const x of doc.contexts || []) if (x?.name && !merged.contexts.has(x.name)) merged.contexts.set(x.name, { ...(x.context || {}), file });
    if (!merged.current && doc['current-context']) merged.current = doc['current-context'];
    files.push({ path: file, state: 'ok', contexts: (doc.contexts || []).length });
  }
  return { files, ...merged };
}

function yamlError(error) {
  const mark = error?.mark;
  const hasPosition = Number.isSafeInteger(mark?.line) && mark.line >= 0 && Number.isSafeInteger(mark?.column) && mark.column >= 0;
  const position = hasPosition ? { line: mark.line + 1, column: mark.column + 1 } : {};
  return { error: hasPosition ? `invalid YAML (line ${position.line}, column ${position.column})` : 'invalid YAML', code: 'YAML_PARSE_ERROR', ...position };
}

/* 어떤 곳의 클러스터인지(아이콘·종류 표시용): 위에서부터 처음 맞는 규칙. context 이름뿐 아니라 그 context가 가리키는 cluster 항목
   (이름·서버 주소)과 user의 exec 명령을 본다. 가짜 서버처럼 단서가 없으면 kubernetes */
const PROVIDER_RULES = [
  { provider: 'eks', when: x => /\.eks\.amazonaws\.com(:\d+)?$/.test(x.host) || /^arn:aws:eks/.test(x.cluster) || /^arn:aws:eks/.test(x.name) || /(^|\/)(aws|aws-iam-authenticator)$/.test(x.cmd) },
  { provider: 'aks', when: x => /\.azmk8s\.io(:\d+)?$/.test(x.host) || /(^|\/)(kubelogin|az)$/.test(x.cmd) },
  { provider: 'gke', when: x => /(^|\/)gke-gcloud-auth-plugin$/.test(x.cmd) || /^gke_/.test(x.cluster) || /^gke_/.test(x.name) },
  { provider: 'kind', when: x => /^kind-/.test(x.cluster) || /^kind-/.test(x.name) },
  { provider: 'docker', when: x => x.cluster === 'docker-desktop' || x.name === 'docker-desktop' },
  { provider: 'minikube', when: x => x.cluster === 'minikube' || x.name === 'minikube' },
];
function providerOf(name, server = '', user = {}, cluster = '') {
  let host = ''; try { host = new URL(server).host; } catch { /* 주소 없음 */ }
  const x = { name: String(name || ''), cluster: String(cluster || ''), host, cmd: String(user.exec?.command || '') };
  return PROVIDER_RULES.find(r => r.when(x))?.provider || 'kubernetes';
}

/** 화면에 보일 context 목록(비밀 값 없이) */
function contextList(kc) {
  /* a cluster entry with the same server as a kind cluster's is that kind cluster (another user or namespace on it) */
  const kindServers = new Set([...kc.clusters].filter(([n]) => /^kind-/.test(n)).map(([, cl]) => cl?.server).filter(Boolean));
  return [...kc.contexts].map(([name, c]) => {
    const cl = kc.clusters.get(c.cluster), us = kc.users.get(c.user);
    return { id: name, ctx: name, cluster: c.cluster || '', user: c.user || '', namespace: c.namespace || '', server: cl?.server || '', file: c.file,
      ...infrastructureMetadata(cl),
      provider: kindServers.has(cl?.server) ? 'kind' : providerOf(name, cl?.server, us || {}, c.cluster), current: kc.current === name, authKind: authKindOf(us) };
  });
}
function infrastructureMetadata(cluster) {
  if (!Array.isArray(cluster?.extensions)) return {};
  const entries = cluster.extensions.filter(item => item?.name === 'wake.infrastructure');
  if (entries.length !== 1) return {};
  const value = entries[0].extension;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  if (value.provider !== 'aws' || typeof value.account !== 'string' || !/^\d{12}$/.test(value.account)) return {};
  if (typeof value.region !== 'string' || !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(value.region)) return {};
  return { infrastructure: { provider: value.provider, account: value.account, region: value.region } };
}

function authKindOf(u) {
  if (!u) return 'none';
  if (u.exec) return 'exec';
  if (u['auth-provider']) return 'auth-provider';
  if (u.token || u.tokenFile || u.tokenRef) return 'token';
  if (u['client-certificate'] || u['client-certificate-data']) return 'cert';
  if (u.username) return 'basic';
  return 'none';
}

/** 파일이 바뀌면 cb(path). 폴더를 감시해 지웠다 다시 쓰는 편집기 저장도 잡는다.
 *  감시를 시작하지 못하거나(EMFILE 등) 감시 중 오류가 나면 그 폴더는 감시하지 않고 failures에 { dir, code, at(ISO) }로 남기며 onError를 부른다.
 *  돌려주는 함수는 감시를 멈추고, 그 함수의 failures가 지금까지의 실패다(없는 폴더 ENOENT는 실패가 아니다: 파일이 생기면 다시 감시). */
function watchFiles(paths, cb, { watch = fs.watch, onError = () => {}, now = Date.now } = {}) {
  const watchers = [], failures = [];
  const fail = (dir, error) => { failures.push({ dir, code: typeof error?.code === 'string' ? error.code : 'WATCH_ERROR', at: new Date(now()).toISOString() }); onError(failures.at(-1)); };
  for (const dir of new Set(paths.map(p => path.dirname(p)))) {
    let w;
    try { w = watch(dir, (_ev, f) => { const full = f && path.join(dir, String(f)); if (!f || paths.includes(full)) cb(full || dir); }); }
    catch (error) { if (error?.code !== 'ENOENT') fail(dir, error); continue; }
    w.on?.('error', error => { try { w.close(); } catch { /* 이미 닫힘 */ } fail(dir, error); });
    watchers.push(w);
  }
  const close = () => watchers.forEach(w => { try { w.close(); } catch { /* 이미 닫힘 */ } });
  close.failures = failures;
  return close;
}

module.exports = { kubeconfigPaths, loadKubeconfig, contextList, providerOf, watchFiles, yaml, yamlError };
