const { withRequestScope } = require('./k8s.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const CONFIG_NAME = 'tool-bootstrap-operators.json';
const MAX_BYTES = 32768;
const fields = ['contextId', 'kind', 'namespace', 'namespaceUid', 'serviceName', 'serviceUid', 'podName', 'podUid', 'secretName', 'secretUid', 'evidence', 'operatorKubeconfig', 'operatorContext', 'serverSha256', 'expiresAt'];
const dns = value => typeof value === 'string' && value.length <= 253 && value.split('.').every(v => /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/.test(v));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\x00-\x1f\x7f-\x9f]/.test(value);
const isAttestation = mode => ['operator-attestation', 'wake-operation-attestation', 'tls-operator-attestation'].includes(mode);
function unavailable() { return Object.assign(new Error('tool bootstrap unavailable'), { kind: 'bootstrap_unverified' }); }
function validEvidence(entry) {
  const e = entry.evidence;
  if (!e || typeof e !== 'object') return false;
  if (e.mode === 'transport-only') return ['prometheus', 'loki', 'tempo'].includes(entry.kind) && Object.keys(e).length === 1 && entry.secretName === null && entry.secretUid === null;
  if (e.mode === 'helm-workload-ref') return Object.keys(e).sort().join(',') === 'mode,release'
    && e.release && Object.keys(e.release).sort().join(',') === 'name,namespace' && dns(e.release.name) && dns(e.release.namespace);
  if (e.mode === 'owner-reference') return Object.keys(e).sort().join(',') === 'mode,owner'
    && e.owner && Object.keys(e.owner).sort().join(',') === 'apiVersion,kind,name,uid'
    && ['Deployment', 'StatefulSet', 'ReplicaSet', 'Pod'].includes(e.owner.kind) && dns(e.owner.name) && uuid(e.owner.uid)
    && e.owner.apiVersion === (e.owner.kind === 'Pod' ? 'v1' : 'apps/v1');
  const designated = e.mode === 'wake-operation-attestation' && entry.kind === 'grafana' && entry.secretName === 'wake-grafana-admin';
  const pinnedTls = e.mode === 'tls-operator-attestation';
  if (!designated && (!['operator-attestation', 'tls-operator-attestation'].includes(e.mode) || entry.kind !== 'argocd' || entry.secretName !== 'argocd-initial-admin-secret')
    || Object.keys(e).sort().join(',') !== (designated ? 'creationResourceVersion,deployment,expectedLabels,expiresAt,mode,podImageID,purpose,secretResourceVersion,transaction' : 'deployment,expiresAt,mode,podImageID,purpose,secretResourceVersion,' + (pinnedTls ? 'tls,' : '') + 'transaction')) return false;
  if (pinnedTls && (!e.tls || Object.keys(e.tls).sort().join(',') !== 'pem,sha256' || !/^[a-f0-9]{64}$/.test(e.tls.sha256)
    || typeof e.tls.pem !== 'string' || e.tls.pem.length > 8192 || !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(e.tls.pem))) return false;
  if (designated && (e.creationResourceVersion !== null && e.creationResourceVersion !== e.secretResourceVersion
    || !e.expectedLabels || Object.keys(e.expectedLabels).sort().join(',') !== 'wake.dev/owner,wake.dev/purpose'
    || !Object.values(e.expectedLabels).every(text))) return false;
  return e.purpose === (designated ? 'grafana-admin-session' : 'argocd-initial-admin-session') && Number.isFinite(Date.parse(e.expiresAt)) && Date.parse(e.expiresAt) > Date.now()
    && /^[1-9][0-9]{0,19}$/.test(e.secretResourceVersion) && e.deployment && Object.keys(e.deployment).sort().join(',') === 'image,name,uid'
    && dns(e.deployment.name) && uuid(e.deployment.uid) && text(e.deployment.image) && text(e.podImageID)
    && e.transaction && Object.keys(e.transaction).sort().join(',') === 'artifactSha256,id'
    && text(e.transaction.id) && /^[a-f0-9]{64}$/.test(e.transaction.artifactSha256);
}
function secretInput(entry) {
  const e = entry.evidence;
  return { kind: 'Secret', namespace: entry.namespace, name: entry.secretName, uid: entry.secretUid,
    ...(e.mode === 'helm-workload-ref' ? { expectedRelease: e.release } : e.mode === 'owner-reference' ? { expectedOwner: e.owner }
      : { attestedResourceVersion: e.secretResourceVersion, resourceVersion: e.secretResourceVersion, ...(e.expectedLabels ? { expectedLabels: e.expectedLabels } : {}) }) };
}
function loadOperatorReceipts(userData) {
  const file = path.join(userData, CONFIG_NAME);
  let fd;
  try {
    const before = fs.lstatSync(file);
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > MAX_BYTES
      || stat.ino !== before.ino || stat.dev !== before.dev) throw unavailable();
    const bytes = Buffer.alloc(MAX_BYTES + 1), size = fs.readSync(fd, bytes, 0, bytes.length, 0), after = fs.fstatSync(fd);
    if (size !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ino !== stat.ino) throw unavailable();
    const value = JSON.parse(bytes.subarray(0, size).toString('utf8'));
    if (!value || Object.keys(value).length !== 2 || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 16) throw unavailable();
    const identities = new Map();
    for (const entry of value.entries) {
      if (!entry || !text(entry.contextId) || typeof entry.kind !== 'string') continue;
      const key = JSON.stringify([entry.contextId, entry.kind]);
      identities.set(key, (identities.get(key) || 0) + 1);
    }
    const accepted = [];
    for (const entry of value.entries) {
      try {
      if (!entry || Object.keys(entry).length !== fields.length || fields.some(k => !Object.hasOwn(entry, k))
        || !['grafana', 'argocd', 'prometheus', 'loki', 'tempo'].includes(entry.kind) || !text(entry.contextId) || !text(entry.operatorContext)
        || !text(entry.operatorKubeconfig) || !path.isAbsolute(entry.operatorKubeconfig)
        || !['namespace', 'serviceName', 'podName'].every(k => dns(entry[k])) || entry.evidence?.mode !== 'transport-only' && !dns(entry.secretName)
        || !['namespaceUid', 'serviceUid', 'podUid'].every(k => uuid(entry[k])) || entry.evidence?.mode !== 'transport-only' && !uuid(entry.secretUid)
        || !validEvidence(entry)
        || !Number.isFinite(Date.parse(entry.expiresAt)) || Date.parse(entry.expiresAt) <= Date.now()
        || !/^[a-f0-9]{64}$/.test(entry.serverSha256)) continue;
      const key = JSON.stringify([entry.contextId, entry.kind]);
      if (identities.get(key) !== 1) continue;
      accepted.push(entry);
      } catch { continue; }
    }
    return accepted;
  } catch { return []; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
/** audit(row): 허브 감사 기록에 한 행. 관리자 Secret 본문을 읽을 때마다(성공·실패) 행 하나, 값은 남기지 않는다(S-09) */
function createToolBootstrap({ userData, operatorClient, registeredClient, audit = () => {} }) {
  const auditRead = (entry, result) => { try { audit({ action: 'tool.adminSecret.read', transport: 'desktop', requester: { kind: 'human', name: os.userInfo().username },
    permission: 'admin', tool: entry.kind, scope: entry.contextId, target: `Secret/${entry.namespace}/${entry.secretName}`, result }); } catch { /* 감사 실패가 흐름을 바꾸지 않음 */ } };
  const running = new Set();
  function receipts(contextId) { return loadOperatorReceipts(userData).filter(e => e.contextId === contextId); }
  function select(binding) {
    const matches = receipts(binding.contextId).filter(e => e.kind === binding.kind);
    if (!matches.length) return null;
    const e = matches[0];
    if (e.namespace !== binding.namespace || e.serviceName !== binding.serviceName || e.serviceUid !== binding.serviceUid
      || e.podName !== binding.podName || e.podUid !== binding.podUid) throw unavailable();
    return e;
  }
  function client(entry) {
    const c = operatorClient(entry), registered = registeredClient(entry.contextId);
    const ca = value => {
      if (value.cluster?.['insecure-skip-tls-verify']) throw unavailable();
      const bytes = value.cluster?.['certificate-authority-data'] ? Buffer.from(value.cluster['certificate-authority-data'], 'base64')
        : value.cluster?.['certificate-authority'] ? fs.readFileSync(value.cluster['certificate-authority']) : null;
      if (!bytes && registered.provider === 'gke' && value.url.protocol === 'https:'
        && value.url.hostname.endsWith('.gke.goog') && !value.cluster?.['tls-server-name']) return 'system';
      if (!bytes?.length || bytes.length > 32768) throw unavailable();
      return createHash('sha256').update(bytes).digest('hex');
    };
    if (ca(c) !== ca(registered) || (c.cluster?.['tls-server-name'] || '') !== (registered.cluster?.['tls-server-name'] || '')) throw unavailable();
    const hash = value => createHash('sha256').update(value.url.href).digest('hex');
    if (!c.user || c.user.token || c.user.password || c.user['client-key-data'] || c.user.tokenFile || !(c.user.tokenRef || c.user.exec)) throw unavailable();
    if (isAttestation(entry.evidence.mode) && (entry.evidence.mode === 'tls-operator-attestation' ? registered.infrastructure?.provider !== 'aws' : registered.provider !== 'gke')) throw unavailable();
    if (hash(c) !== entry.serverSha256 || hash(registered) !== entry.serverSha256) throw unavailable();
    return c;
  }
  async function validate(entry, c, { pod: verifiedPod, signal } = {}) {
    signal?.throwIfAborted();
    if (!receipts(entry.contextId).some(value => JSON.stringify(value) === JSON.stringify(entry))) throw unavailable();
    const namespace = await c.getMetadata({ kind: 'Namespace', name: entry.namespace, uid: entry.namespaceUid });
    if (namespace.metadata.uid !== entry.namespaceUid) throw unavailable();
    if (!validEvidence(entry)) throw unavailable();
    if (entry.evidence.mode === 'transport-only') return;
    const metadata = await c.getToolSecretMetadata(secretInput(entry));
    if (!isAttestation(entry.evidence.mode) && !metadata.ownershipMatched) throw unavailable();
    const pod = verifiedPod || await c.request('GET', '/api/v1/namespaces/' + entry.namespace + '/pods/' + entry.podName);
    if (pod?.metadata?.uid !== entry.podUid || pod.metadata.deletionTimestamp) throw unavailable();
    if (entry.evidence.mode === 'owner-reference') {
      const owner = entry.evidence.owner;
      await c.getMetadata({ kind: owner.kind, namespace: entry.namespace, name: owner.name, uid: owner.uid });
      return metadata;
    }
    if (isAttestation(entry.evidence.mode)) {
      const e = entry.evidence;
      const deployment = await c.request('GET', '/apis/apps/v1/namespaces/' + entry.namespace + '/deployments/' + e.deployment.name);
      if (deployment?.apiVersion !== 'apps/v1' || deployment.kind !== 'Deployment' || deployment.metadata?.uid !== e.deployment.uid
        || deployment.metadata.name !== e.deployment.name || deployment.metadata.namespace !== entry.namespace || deployment.metadata.deletionTimestamp
        || !deployment.spec?.template?.spec?.containers?.some(container => container.image === e.deployment.image)) throw unavailable();
      const refs = pod.metadata.ownerReferences || [];
      if (refs.length !== 1 || refs[0].kind !== 'ReplicaSet' || refs[0].apiVersion !== 'apps/v1' || refs[0].controller !== true || !uuid(refs[0].uid) || !dns(refs[0].name)) throw unavailable();
      const replica = await c.request('GET', '/apis/apps/v1/namespaces/' + entry.namespace + '/replicasets/' + refs[0].name);
      const owners = replica.metadata?.ownerReferences || [];
      if (replica.apiVersion !== 'apps/v1' || replica.kind !== 'ReplicaSet' || replica.metadata?.uid !== refs[0].uid || replica.metadata.namespace !== entry.namespace
        || replica.metadata.name !== refs[0].name || replica.metadata.deletionTimestamp || owners.length !== 1 || owners[0].controller !== true
        || owners[0].apiVersion !== 'apps/v1' || owners[0].kind !== 'Deployment' || owners[0].uid !== e.deployment.uid || owners[0].name !== e.deployment.name
        || !pod.status?.containerStatuses?.some(status => status.ready === true && status.imageID === e.podImageID
          && pod.spec?.containers?.some(container => container.name === status.name && container.image === e.deployment.image))) throw unavailable();
      if (entry.evidence.mode !== 'wake-operation-attestation') return metadata;
    }
    const keys = entry.kind === 'grafana' ? ['admin-user', 'admin-password'] : ['password'];
    const containers = [...(pod.spec?.containers || []), ...(pod.spec?.initContainers || [])];
    const references = new Set();
    for (const container of containers) for (const env of container.env || []) {
      const ref = env.valueFrom?.secretKeyRef;
      if (ref?.name === entry.secretName && ref.optional !== true) references.add(ref.key);
    }
    for (const volume of pod.spec?.volumes || []) if (volume.secret?.secretName === entry.secretName && volume.secret.optional !== true) {
      for (const item of volume.secret.items || []) references.add(item.key);
    }
    if (!keys.every(key => references.has(key))) throw unavailable();
    return metadata;
  }
  async function readFlux(contextId, { expected, signal } = {}) {
    signal?.throwIfAborted();
    const file = path.join(userData, 'flux-read-targets.json');
    let fd;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.uid !== process.geteuid() || (stat.mode & 0o7777) !== 0o600 || stat.nlink !== 1 || stat.size > 4096) throw unavailable();
      const target = JSON.parse(fs.readFileSync(fd, 'utf8'));
      if (target.contextId !== contextId) return null;
      if (target.version !== 1 || !dns(target.namespace) || !text(target.operatorContext)
        || ![target.kustomization, target.repository].every(item => item && Object.keys(item).length === 2 && dns(item.name) && uuid(item.uid))) throw unavailable();
      if (expected && (expected.namespace !== target.namespace || expected.name !== target.kustomization.name ||
        expected.uid && expected.uid !== target.kustomization.uid)) return null;
      const entries = receipts(contextId).filter(entry => entry.operatorContext === target.operatorContext && entry.evidence.mode === 'transport-only');
      const [entry] = entries;
      if (!entry || entries.some(item => item.operatorKubeconfig !== entry.operatorKubeconfig || item.serverSha256 !== entry.serverSha256)) throw unavailable();
      const deadline = AbortSignal.timeout(15000);
      const c = client(entry), scope = withRequestScope(c, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
      const ns = '/namespaces/' + target.namespace;
      const endpoints = [
        ['kustomize.toolkit.fluxcd.io/v1', 'kustomizations', 'Kustomization', target.kustomization],
        ['source.toolkit.fluxcd.io/v1', 'gitrepositories', 'GitRepository', target.repository],
      ];
      const objects = await Promise.all(endpoints.map(async ([api, resource, kind, identity]) => {
        const object = await scope.request('GET', '/apis/' + api + ns + '/' + resource + '/' + identity.name);
        if (object?.apiVersion !== api || object.kind !== kind || object.metadata?.name !== identity.name
          || object.metadata?.namespace !== target.namespace || object.metadata?.uid !== identity.uid || object.metadata.deletionTimestamp) throw unavailable();
        return object;
      }));
      const [kustomization, repository] = objects;
      const ref = kustomization.spec?.sourceRef;
      if (ref?.kind !== 'GitRepository' || ref.name !== repository.metadata.name || (ref.namespace || target.namespace) !== target.namespace) throw unavailable();
      return { kustomization, repository };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  return { receipts, client,
    readFlux,
    discoveryEntries: contextId => receipts(contextId).map(receipt => {
      const c = client(receipt);
      return { receipt, client: c, validate: scope => validate(receipt, withRequestScope(c, scope), scope) };
    }),
    expiresAt: binding => { const entry = select(binding); if (!entry) throw unavailable(); return Math.min(Date.parse(entry.expiresAt), entry.evidence.expiresAt ? Date.parse(entry.evidence.expiresAt) : Infinity); },
    available: binding => ['grafana', 'argocd'].includes(binding?.kind) && !!select(binding),
    async run(binding, validateTarget, send, use, scope = {}) {
      const entry = select(binding);
      if (!entry || !['grafana', 'argocd'].includes(entry.kind)) throw unavailable();
      const c = withRequestScope(client(entry), scope), dataKeys = entry.kind === 'grafana' ? ['admin-user', 'admin-password'] : ['password'];
      const jobKey = JSON.stringify([entry.contextId, entry.kind]);
      if (running.has(jobKey)) throw unavailable();
      running.add(jobKey);
      let secret, password, username, jwt, secretRevision;
      const guard = async () => {
        scope.signal?.throwIfAborted();
        const target = await validateTarget();
        const metadata = await validate(entry, c, { pod: target?.pod, signal: scope.signal });
        const revision = metadata?.metadata?.resourceVersion;
        if (typeof revision !== 'string' || !/^[1-9][0-9]{0,19}$/.test(revision) || secretRevision && secretRevision !== revision) throw unavailable();
        secretRevision = revision;
        scope.signal?.throwIfAborted();
      };
      try {
        await guard();
        try { secret = await c.getToolBootstrapSecret({ ...secretInput(entry), resourceVersion: secretRevision, dataKeys }); }
        catch (error) { auditRead(entry, 'failed'); throw error; }
        auditRead(entry, 'ok');
        if (secret.metadata?.resourceVersion !== secretRevision) throw unavailable();
        username = entry.kind === 'grafana' ? secret.data['admin-user'].toString('utf8') : 'admin';
        password = secret.data[entry.kind === 'grafana' ? 'admin-password' : 'password'].toString('utf8');
        if (!text(username) || !text(password)) throw unavailable();
        await guard();
        let headers;
        if (entry.kind === 'grafana') headers = { authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64') };
        else {
          await guard();
          const session = await send('POST', '/api/v1/session', { username, password });
          await guard();
          if (session.status !== 200 || typeof session.body?.token !== 'string' || !session.body.token || session.body.token.length > 16384 || /[\x00-\x20\x7f]/.test(session.body.token)) throw unavailable();
          jwt = session.body.token; session.body.token = null;
          headers = { authorization: 'Bearer ' + jwt };
        }
        password = null; username = null;
        const authenticated = async (method, route, body) => {
          await guard();
          const result = await send(method, route, body, headers);
          await guard();
          return result;
        };
        try { return await use(authenticated); }
        finally { delete headers.authorization; }
      } catch { throw unavailable(); }
      finally { running.delete(jobKey); for (const buffer of Object.values(secret?.data || {})) buffer.fill(0); secret = null; password = null; username = null; jwt = null; }
    },
  };
}
module.exports = { createToolBootstrap, loadOperatorReceipts };

function enrollOperatorCredential({ keychain, userData, contextId, server, certificateAuthorityData, token }) {
  let ref, temporary, published = false, setStarted = false;
  try {
    if (!keychain?.usable?.() || !text(contextId) || typeof token !== 'string' || token.length < 16 || token.length > 16384 || /[\x00-\x20\x7f-\x9f]/.test(token)
      || typeof certificateAuthorityData !== 'string' || !certificateAuthorityData.length || certificateAuthorityData.length > 24576
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(certificateAuthorityData)) throw unavailable();
    const url = new URL(server);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw unavailable();
    const home = fs.lstatSync(userData);
    if (!home.isDirectory() || home.isSymbolicLink() || home.uid !== process.geteuid()) throw unavailable();
    const secretsPath = path.join(userData, 'secrets.json');
    try {
      const stat = fs.lstatSync(secretsPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 1048576) throw unavailable();
      const existing = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
      if (!existing || typeof existing !== 'object' || Array.isArray(existing) || Object.values(existing).some(value => typeof value !== 'string')) throw unavailable();
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const name = 'tool-operator-' + createHash('sha256').update(JSON.stringify([contextId, url.href])).digest('hex').slice(0, 40);
    const dir = path.join(userData, 'operator-credentials');
    try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    return publish();
    function publish() {
      const stat = fs.lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.geteuid() || (stat.mode & 0o077)) throw unavailable();
      const file = path.join(dir, name + '.json');
      if (fs.existsSync(file)) throw unavailable();
      setStarted = true; ref = keychain.set(token, 'tool-operator');
      if (typeof ref !== 'string' || !ref || keychain.get(ref) !== token) throw unavailable();
      token = null;
      const config = { apiVersion: 'v1', kind: 'Config', 'current-context': contextId,
        contexts: [{ name: contextId, context: { cluster: name, user: name } }],
        clusters: [{ name, cluster: { server: url.href, 'certificate-authority-data': certificateAuthorityData } }],
        users: [{ name, user: { tokenRef: ref } }] };
      temporary = file + '.pending-' + require('node:crypto').randomUUID();
      const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(config)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.linkSync(temporary, file); published = true; fs.unlinkSync(temporary); temporary = null;
      return { status: 'stored', operatorKubeconfig: file, operatorContext: contextId };
    }
  } catch (error) {
    let cleanupFailed = false;
    if (ref && !published) { try { keychain.delete(ref); } catch { cleanupFailed = true; } }
    return { status: cleanupFailed || published || setStarted && !ref ? 'credential_cleanup_failed' : 'blocked' };
  } finally { token = null; if (temporary) { try { fs.unlinkSync(temporary); } catch { /* 비밀 없는 임시 참조 파일만 남을 수 있다. */ } } }
}
module.exports.enrollOperatorCredential = enrollOperatorCredential;
