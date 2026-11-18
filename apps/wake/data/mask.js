/*
 * 비밀 값 가리기. 규칙은 이 파일 하나이고 가린 자리에는 같은 표시(HIDE)를 쓴다.
 * maskSecrets: 명령 기록에 남기기 전(터미널 작업 기록). 출력은 남기지 않고 친 명령만 남긴다.
 *   가리는 것: 토큰·비밀번호 플래그 값(--token x, --password=x, -p x 다음 값), 이름에 TOKEN·SECRET·PASSWORD·KEY가 든 변수 대입,
 *   Authorization 헤더 값, URL 안 사용자:비밀번호, kubectl create secret의 --from-literal 값.
 * maskText: 로그·대화·근거·내보내기 글. maskSecrets 규칙에 더해 PEM 개인 키, 비밀 이름의 key=value·key: value,
 *   모양으로 알아보는 토큰(JWT, GitHub, Slack, AWS 액세스 키 ID), 카드 번호, 이메일 주소를 가리고 가린 수를 센다.
 *   근거 저장 전, 모델 전달 전, 내보내기 전에 같은 함수를 쓴다.
 *   키 이름으로도 가린다: JSON의 "password":"x", 환경 변수 항목 {"name":"DB_PASSWORD","value":"x"}와 YAML의 - name: … / value: ….
 * maskObject: 객체(근거·감사 행) 안의 비밀 키 값과 env 항목 값을 키 이름으로 가리고 글 값에는 maskText를 쓴다: { value, n }.
 * 비밀 키 이름(isSecretKey): password·passwd·secret·token·apikey·credential·privatekey·accesskey가 들고, 이름·참조·개수를 뜻하는 끝(…Name, …Ref, …_tokens)이 아닌 것.
 */
const HIDE = '••••';
const RULES = [
  [/(--(?:token|password|passwd|client-secret|secret|api-key|apikey|access-key|secret-key|auth|bearer)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi, `$1${HIDE}`],
  [/(--from-literal[=\s]+[^=\s]+=)("[^"]*"|'[^']*'|\S+)/gi, `$1${HIDE}`],
  [/(\b[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY)[A-Za-z0-9_]*=)("[^"]*"|'[^']*'|\S+)/gi, `$1${HIDE}`],
  [/((?:authorization|x-api-key|api-key)\s*:\s*(?:bearer\s+|basic\s+)?)("[^"]*"|'[^']*'|[^\s'"]+)/gi, `$1${HIDE}`],
  [/(\bbearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi, `$1${HIDE}`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, `$1${HIDE}$3`],
  [/(\s-p)(\S+)/g, `$1${HIDE}`],
];
const SECRET_WORD = /password|passwd|secret|token|apikey|credential|privatekey|accesskey/;
const NOT_SECRET_END = /(name|names|ref|refs|uid|namespace|count|kind|type|path|file|mode|version|seconds|expiry|expires|expiresat|expiration|used|limit|id|ids|tokens|length|size|policy)$/;
/** a key (or env variable) name that holds a secret value */
export function isSecretKey(name) {
  const k = String(name ?? '').toLowerCase().replace(/[-_.\s]/g, '');
  return SECRET_WORD.test(k) && !NOT_SECRET_END.test(k);
}
const QUOTED = '"((?:[^"\\\\]|\\\\.)*)"';
const TEXT_RULES = [
  /* a PEM private key block, whole */
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, HIDE],
  /* JSON "key": "value" with a secret key name */
  [new RegExp(`("([A-Za-z0-9_.-]+)"\\s*:\\s*)${QUOTED}`, 'g'), (all, head, key) => (isSecretKey(key) ? `${head}"${HIDE}"` : all)],
  /* an env entry with a secret variable name: {"name":"DB_PASSWORD","value":"x"} and YAML - name: DB_PASSWORD / value: x */
  [new RegExp(`("name"\\s*:\\s*"([^"]*)"\\s*,\\s*"value"\\s*:\\s*)${QUOTED}`, 'g'), (all, head, key) => (isSecretKey(key) ? `${head}"${HIDE}"` : all)],
  [/(-\s+name:\s*["']?([A-Za-z0-9_.-]+)["']?[ \t]*\r?\n[ \t]+value:[ \t]*)("[^"\n]*"|'[^'\n]*'|[^\s][^\n]*)/g, (all, head, key) => (isSecretKey(key) ? `${head}${HIDE}` : all)],
  /* key=value and key: value with a secret-looking key (password, token, secret, API and access keys, the AWS secret key) */
  [/(\b(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|secret[_-]?key|aws_secret_access_key|client[_-]?secret)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, `$1${HIDE}`],
  /* tokens recognisable by their shape: a JWT, a GitHub token, a Slack token, an AWS access key id */
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, HIDE],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, HIDE],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, HIDE],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, HIDE],
  /* a card number (with or without separators) and an email address */
  [/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, HIDE],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, HIDE],
];
const marks = s => s.split(HIDE).length - 1;

/** 명령 한 줄에서 비밀 값을 가림 */
export function maskSecrets(command) {
  return RULES.reduce((s, [re, to]) => s.replace(re, to), String(command ?? ''));
}

/** 글(로그, 대화, 근거, 내보내기)에서 비밀 값을 가림: { text, n }. n은 이번에 새로 가린 자리 수 */
export function maskText(text) {
  const src = String(text ?? ''), out = TEXT_RULES.reduce((s, [re, to]) => s.replace(re, to), maskSecrets(src));
  return { text: out, n: marks(out) - marks(src) };
}

/** 객체 안 비밀 값 가리기: 비밀 키 이름의 값, 비밀 이름의 env 항목({ name, value })의 값, 그 밖의 글 값은 maskText. { value, n } */
export function maskObject(input) {
  let n = 0;
  const hide = v => (v === HIDE ? v : (n++, HIDE));
  const plain = v => typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint';
  const walk = v => {
    if (typeof v === 'string') { const r = maskText(v); n += r.n; return r.text; }
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const envSecret = typeof v.name === 'string' && 'value' in v && isSecretKey(v.name);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (envSecret && k === 'value' || isSecretKey(k)) && plain(x) ? hide(x) : walk(x)]));
  };
  return { value: walk(input), n };
}
