import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('tool.op_home_keeps_tool_opening_without_unused_service', async t => {
  const userData = mkdtempSync(join(tmpdir(), 'wake-services-'));
  const previous = process.env.KUBECONFIG;
  process.env.KUBECONFIG = join(userData, 'missing', 'config');
  t.after(() => {
    if (previous === undefined) delete process.env.KUBECONFIG;
    else process.env.KUBECONFIG = previous;
    rmSync(userData, { recursive: true, force: true });
  });
  const service = { apiVersion: 'v1', kind: 'Service', metadata: { name: 'prometheus', namespace: 'monitoring', uid: 'service-a' }, spec: { ports: [{ name: 'http', port: 9090 }], selector: { app: 'prometheus' } } };
  const client = { async request(method, url) {
    assert.equal(method, 'GET');
    if (url === '/api/v1/services') return { apiVersion: 'v1', kind: 'ServiceList', items: [service] };
    if (url.includes('/services/')) return service;
    if (url.includes('/endpoints/')) return { apiVersion: 'v1', kind: 'Endpoints', metadata: { ...service.metadata, uid: 'endpoint-a' }, subsets: [{ addresses: [{ targetRef: { kind: 'Pod', name: 'prometheus-pod', uid: 'pod-a' } }], ports: [{ name: 'http', port: 9090 }] }] };
    if (url.includes('/pods/')) return { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'prometheus-pod', namespace: 'monitoring', uid: 'pod-a', labels: { app: 'prometheus' } }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } };
    assert.fail('unexpected tool API');
  } };
  t.mock.method(require('./k8s.cjs'), 'createClient', () => client);
  t.mock.method(require('./kubeconfig.cjs'), 'watchFiles', () => () => {});
  const forward = t.mock.fn(async () => ({ port: 41234, close() {} }));
  const tools = require('./tools.cjs').createTools({ forward }); t.after(() => tools.closeAll());
  t.mock.method(require('./tools.cjs'), 'createTools', () => tools);
  const modulePath = require.resolve('./services.cjs'), cached = require.cache[modulePath]; delete require.cache[modulePath];
  t.after(() => { if (cached) require.cache[modulePath] = cached; else delete require.cache[modulePath]; });
  const unexpected = () => assert.fail('unexpected native or keychain access');
  const services = require('./services.cjs').create({ app: {}, userData, emit: unexpected,
    safeStorage: { isEncryptionAvailable: unexpected, encryptString: unexpected, decryptString: unexpected }, hooks: {} });
  const tool = (await services['tools.find']({ id: 'sample' })).list[0];
  const request = { op: 'home', f: { key: 'sample-prometheus', cluster: 'sample', tool } };
  const result = await services['tool.op'](request);
  assert.equal(Object.hasOwn(services, 'tool.open'), false);
  assert.deepEqual(result, { url: 'http://127.0.0.1:41234/graph?g0.expr=up&g0.tab=0' });
  assert.equal(forward.mock.callCount(), 1);
  /* the cluster client behind the per-cluster request gate (provider-connections.cjs): same requests reach the same client */
  assert.deepEqual(await forward.mock.calls[0].arguments[0].request('GET', '/api/v1/services'), await client.request('GET', '/api/v1/services'));
  assert.deepEqual(await forward.mock.calls[0].arguments[1](), { ns: 'monitoring', pod: 'prometheus-pod', port: 9090 });
  tools.closeAll(); request.f.tool = (await services['tools.find']({ id: 'sample' })).list[0];
  forward.mock.mockImplementation(async () => { throw new Error('tool unavailable'); });
  await assert.rejects(services['tool.op'](request), /tool unavailable/);
});


function consoleServiceFixture(t, opener) {
  const fs = require('node:fs'),dir = mkdtempSync(join(tmpdir(), 'wake-console-')),previous = process.env.KUBECONFIG;
  process.env.KUBECONFIG = join(dir, 'missing-config');
  const no = () => assert.fail('unexpected IO, credential or mutation');
  t.mock.method(require('./kubeconfig.cjs'), 'watchFiles', () => () => {});
  t.mock.method(require('./kubeconfig.cjs'), 'contextList', () => [{ id: 'console-context' }]);
  t.mock.method(require('./k8s.cjs'), 'createClient', no);
  const saved = { version: 1, connections: [{ id: 'console-registration', provider: 'gcp-monitoring', contextId: 'console-context', projectId: 'fixture-project', location: 'fixture-region', clusterName: 'fixture-cluster', credentialSource: { kind: 'gke-exec', command: '/fixture/gke-gcloud-auth-plugin' }, targets: [] }] };
  const file = join(dir, 'observability-connections.json'), bytes = JSON.stringify(saved);fs.writeFileSync(file, bytes);
  t.after(() => { if(previous===undefined)delete process.env.KUBECONFIG;else process.env.KUBECONFIG=previous;rmSync(dir,{recursive:true,force:true}); });
  const modulePath = require.resolve('./services.cjs'), cached = require.cache[modulePath];delete require.cache[modulePath];
  t.after(() => { if (cached) require.cache[modulePath] = cached;else delete require.cache[modulePath]; });
  const services = require('./services.cjs').create({ userData: dir, app: {}, hooks: {}, emit: no, safeStorage: { isEncryptionAvailable: no }, openExternal: opener });
  return { services, file, bytes, fs, saved };
}
test('gcp_console_service_shell_mainframe_requests_exact_system_url_once_without_token_or_tool_partition', async t => {
  const opened = [],f = consoleServiceFixture(t, async url => { opened.push(url); });
  const response = await f.services['gcp.console.open']({ contextId:'console-context' }, { shell:true, mainFrame:true });
  assert.deepEqual(opened,['https://console.cloud.google.com/monitoring?project=fixture-project']);
  assert.deepEqual(response,{status:'requested',requested:true,provider:'gcp-monitoring',connectionId:'console-registration',contextId:'console-context',projectId:'fixture-project',url:opened[0]});
  assert.equal(f.fs.readFileSync(f.file,'utf8'),f.bytes);assert.equal(Object.hasOwn(response,'connected'),false);assert.equal(Object.hasOwn(response,'signedIn'),false);
});
test('gcp_console_service_rejects_pages_subframes_getters_and_url_arguments_without_open', async t => {
  const opened = [],f = consoleServiceFixture(t, async url => { opened.push(url); });let getters=0;
  const sender={};Object.defineProperty(sender,'shell',{enumerable:true,get(){getters++;return true;}});Object.defineProperty(sender,'mainFrame',{value:true,enumerable:true});
  for(const from of [undefined,null,{}, {shell:false,mainFrame:true},{shell:true,mainFrame:false},Object.create({shell:true,mainFrame:true}),sender])assert.deepEqual(await f.services['gcp.console.open']({contextId:'console-context'},from),{status:'forbidden',requested:false});
  const arg={};Object.defineProperty(arg,'contextId',{enumerable:true,get(){getters++;return 'console-context';}});
  for(const input of [null,[],arg,{contextId:'console-context',url:'https://untrusted.invalid'},{contextId:'console-context',projectId:'other-project'},{contextId:'missing'}])assert.equal((await f.services['gcp.console.open'](input,{shell:true,mainFrame:true})).requested,false);
  assert.equal(getters,0);assert.deepEqual(opened,[]);assert.equal(f.fs.readFileSync(f.file,'utf8'),f.bytes);
});
test('gcp_console_service_pins_url_and_metadata_before_await_and_sanitizes_external_failure', async t => {
  let release, rejectOpen=false;const opened=[],f=consoleServiceFixture(t,url=>{if(rejectOpen)throw new Error('private native detail');opened.push(url);return new Promise(resolve=>{release=resolve;});});
  const pending=f.services['gcp.console.open']({contextId:'console-context'},{shell:true,mainFrame:true});
  const next=structuredClone(f.saved);next.connections[0].projectId='another-project';f.fs.writeFileSync(f.file,JSON.stringify(next));release();
  const response=await pending;assert.equal(response.projectId,'fixture-project');assert.equal(response.url,opened[0]);assert.deepEqual(opened,['https://console.cloud.google.com/monitoring?project=fixture-project']);
  rejectOpen=true;
  assert.deepEqual(await f.services['gcp.console.open']({contextId:'console-context'},{shell:true,mainFrame:true}),{status:'external_open_failed',requested:false});
});

test('gcp_console_service_revalidates_native_url_before_external_dispatch', async t => {
  let descriptor;
  t.mock.method(require('./observability.cjs'), 'createObservability', () => ({ resolveGcpConsole: () => ({ ...descriptor }) }));
  const opened=[],f=consoleServiceFixture(t,async url=>{opened.push(url);});
  const valid={provider:'gcp-monitoring',connectionId:'console-registration',contextId:'console-context',projectId:'fixture-project',url:'https://console.cloud.google.com/monitoring?project=fixture-project'};
  const badUrls=['https://untrusted.invalid/monitoring?project=fixture-project','https://user@console.cloud.google.com/monitoring?project=fixture-project','https://console.cloud.google.com/monitoring?project=fixture-project&extra=1','https://console.cloud.google.com/monitoring?project=fixture-project#fragment','https://console.cloud.google.com/monitoring?project=fixture-project&project=fixture-project','https://console.cloud.google.com/monitoring?project=other-project','https://console.cloud.google.com/monitoring/?project=fixture-project'];
  for(const url of badUrls){descriptor={...valid,url};assert.deepEqual(await f.services['gcp.console.open']({contextId:'console-context'},{shell:true,mainFrame:true}),{status:'unconfigured',requested:false});}
  for(const override of [{provider:'cloudwatch'},{contextId:'other-context'},{projectId:'Upper-project'}]){descriptor={...valid,...override};assert.deepEqual(await f.services['gcp.console.open']({contextId:'console-context'},{shell:true,mainFrame:true}),{status:'unconfigured',requested:false});}
  assert.deepEqual(opened,[]);assert.equal(f.fs.readFileSync(f.file,'utf8'),f.bytes);
});

function chromeCommandFixture(t, { platform = 'darwin', installed = true, commandError = null } = {}) {
  const fs = require('node:fs'), childProcess = require('node:child_process'), module = require('node:module');
  const exists = fs.existsSync, load = module._load, commands = [], defaultOpens = [];
  t.mock.method(require('node:os'), 'platform', () => platform);
  t.mock.method(fs, 'existsSync', file => file === '/Applications/Google Chrome.app' ? installed : exists(file));
  t.mock.method(childProcess, 'execFile', (file, args, options, done) => { commands.push({ file, args, options }); done(commandError, '', ''); });
  t.mock.method(module, '_load', function (name, ...args) {
    if (name === 'electron') return { shell: { openExternal: async url => { defaultOpens.push(url); } } };
    return load.call(this, name, ...args);
  });
  return { ...consoleServiceFixture(t), commands, defaultOpens };
}

test('gcp_console_chrome_default_opener_uses_absolute_command_fixed_app_and_single_verified_url', async t => {
  const f = chromeCommandFixture(t);
  const response = await f.services['gcp.console.open']({ contextId: 'console-context' }, { shell: true, mainFrame: true });
  assert.deepEqual(f.commands, [{ file: '/usr/bin/open', args: ['-a', '/Applications/Google Chrome.app', 'https://console.cloud.google.com/monitoring?project=fixture-project'], options: { timeout: 10000, windowsHide: true, shell: false } }]);
  assert.deepEqual(response, { status: 'requested', requested: true, provider: 'gcp-monitoring', connectionId: 'console-registration', contextId: 'console-context', projectId: 'fixture-project', url: f.commands[0].args[2] });
  assert.deepEqual(f.defaultOpens, []); assert.equal(f.fs.readFileSync(f.file, 'utf8'), f.bytes);
});

test('gcp_console_chrome_unsupported_platform_never_uses_default_browser_or_command', async t => {
  const f = chromeCommandFixture(t, { platform: 'linux' });
  assert.deepEqual(await f.services['gcp.console.open']({ contextId: 'console-context' }, { shell: true, mainFrame: true }), { status: 'unsupported_platform', requested: false });
  assert.deepEqual(f.commands, []); assert.deepEqual(f.defaultOpens, []);
});

test('gcp_console_chrome_missing_app_never_uses_default_browser_or_command', async t => {
  const f = chromeCommandFixture(t, { installed: false });
  assert.deepEqual(await f.services['gcp.console.open']({ contextId: 'console-context' }, { shell: true, mainFrame: true }), { status: 'browser_unavailable', requested: false });
  assert.deepEqual(f.commands, []); assert.deepEqual(f.defaultOpens, []);
});

test('gcp_console_chrome_command_failure_is_sanitized_without_default_fallback', async t => {
  const f = chromeCommandFixture(t, { commandError: new Error('private command stderr') });
  assert.deepEqual(await f.services['gcp.console.open']({ contextId: 'console-context' }, { shell: true, mainFrame: true }), { status: 'external_open_failed', requested: false });
  assert.equal(f.commands.length, 1); assert.deepEqual(f.defaultOpens, []);
});

test('gcp_console_chrome_rejects_renderer_browser_path_extra_arguments_and_untrusted_sender_before_command', async t => {
  const f = chromeCommandFixture(t);
  for (const extra of [{ browser: 'UntrustedBrowser' }, { path: '/Applications/UntrustedBrowser.app' }, { args: ['--profile-directory=forged'] }, { url: 'https://untrusted.invalid' }]) {
    assert.deepEqual(await f.services['gcp.console.open']({ contextId: 'console-context', ...extra }, { shell: true, mainFrame: true }), { status: 'invalid_request', requested: false });
  }
  assert.deepEqual(await f.services['gcp.console.open']({ contextId: 'console-context' }, { shell: false, mainFrame: true }), { status: 'forbidden', requested: false });
  assert.deepEqual(f.commands, []); assert.deepEqual(f.defaultOpens, []);
});
