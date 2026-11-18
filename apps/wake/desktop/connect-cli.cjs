/*
 * 클라우드 연결 명령의 사전 확인(읽기만, 설치·로그인 창을 열지 않음).
 *   check(method): 그 방법에 필요한 명령줄 도구가 이 컴퓨터에 있는지와 버전. PATH는 연결 확인과 같은 범위(execPath: Homebrew 등 포함)
 *   login(method): 이미 로그인돼 있는지. 클라우드마다 브라우저를 열지 않는 확인 명령 하나(20초 제한)
 *   regions(method): 로그인돼 있을 때 그 계정이 쓸 수 있는 지역 목록(읽기만: aws ec2 describe-regions). 고르는 칸으로 씀
 *   clusters(method, region): 로그인돼 있을 때 그 지역의 클러스터 이름 목록(읽기만: aws eks list-clusters). 고르는 칸으로 씀
 * 방법별 도구와 확인 명령은 이 표에만 둔다. 화면이 보내는 것은 방법 이름뿐이라 임의 명령은 실행되지 않음.
 */
const { execFile } = require('node:child_process');
const { findCommand, execPath } = require('./k8s.cjs');

const METHODS = {
  aws: { tools: ['aws'], version: ['aws', ['--version']], login: ['aws', ['sts', 'get-caller-identity', '--output', 'json']] },
  gcp: { tools: ['gcloud', 'gke-gcloud-auth-plugin'], version: ['gcloud', ['--version']], login: ['gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']], loginNeedsOutput: true },
  azure: { tools: ['az', 'kubelogin'], version: ['az', ['version', '--output', 'tsv']], login: ['az', ['account', 'show', '--output', 'none']] },
  kind: { tools: ['kind'], version: ['kind', ['version']] },
};
const env = () => ({ ...process.env, PATH: execPath() });
/** 명령 찾기 한 곳: 셸 PATH와 흔한 설치 위치(execPath)에서 실행 파일 경로, 없으면 null */
const commandPath = cmd => findCommand(cmd, env());
const run = (cmd, args, ms) => new Promise(res => execFile(commandPath(cmd) || cmd, args, { env: env(), timeout: ms, maxBuffer: 1 << 20 }, (err, stdout, stderr) =>
  res({ code: err ? (typeof err.code === 'number' ? err.code : err.killed ? 'timeout' : 1) : 0, out: String(stdout || ''), err: String(stderr || '') })));

async function check(method) {
  const m = METHODS[method]; if (!m) return { error: 'unknown method' };
  const tools = Object.fromEntries(m.tools.map(t => [t, !!commandPath(t)]));
  const missing = m.tools.filter(t => !tools[t]);
  let version = '';
  if (!missing.length && m.version) { const r = await run(m.version[0], m.version[1], 10000); version = (r.out || r.err).split('\n')[0].trim().slice(0, 80); }
  return { tools, missing, version };
}
async function login(method) {
  const m = METHODS[method]; if (!m?.login) return { ok: true, skipped: true };
  const r = await run(m.login[0], m.login[1], 20000);
  const ok = r.code === 0 && (!m.loginNeedsOutput || r.out.trim().length > 0);
  return { ok, code: r.code, error: ok ? '' : (r.err || r.out).trim().split('\n').slice(-2).join(' ').slice(0, 300) };
}

async function regions(method) {
  if (method !== 'aws') return { list: [] };
  const r = await run('aws', ['ec2', 'describe-regions', '--query', 'Regions[].RegionName', '--output', 'json'], 20000);
  if (r.code !== 0) return { list: [], error: (r.err || '').trim().slice(0, 300) };
  try { return { list: JSON.parse(r.out).map(String).filter(x => /^[a-z]{2}(-[a-z]+)+-\d$/.test(x)).sort() }; } catch { return { list: [] }; }
}
async function clusters(method, region) {
  if (method !== 'aws' || !/^[a-z]{2}(-[a-z]+)+-\d$/.test(String(region || ''))) return { list: [] };
  const r = await run('aws', ['eks', 'list-clusters', '--region', region, '--output', 'json'], 20000);
  if (r.code !== 0) return { list: [], error: (r.err || '').trim().slice(0, 300) };
  try { return { list: (JSON.parse(r.out).clusters || []).map(String).sort() }; } catch { return { list: [] }; }
}

module.exports = { check, login, regions, clusters, commandPath, METHODS };
