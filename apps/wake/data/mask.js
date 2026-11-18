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
];
/* values recognisable by their shape alone (no key or header around them): checked after identifiers are held back */
const SHAPE_RULES = [
  /* tokens recognisable by their shape: a JWT, a Kubernetes bootstrap token, GitHub, GitLab, Slack, AWS access key id, Anthropic and OpenAI
     keys, a Google API key, Stripe, npm, Grafana service account and cloud tokens, Hugging Face */
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, HIDE],
  [/(?<![\w.:/@-])[a-z0-9]{6}\.[a-z0-9]{16}\b/g, HIDE],
  [/\bya29\.[A-Za-z0-9_-]{20,}/g, HIDE],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, HIDE],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, HIDE],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, HIDE],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, HIDE],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, HIDE],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g, HIDE],
  [/\bAIza[A-Za-z0-9_-]{35}\b/g, HIDE],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, HIDE],
  [/\bnpm_[A-Za-z0-9]{36}\b/g, HIDE],
  [/\bgl(?:sa|c)_[A-Za-z0-9_+/=-]{20,}\b/g, HIDE],
  [/\bhf_[A-Za-z0-9]{30,}\b/g, HIDE],
  /* a card number (Luhn-valid 16 digits, with or without separators) and an email address */
  [/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, all => (luhn(all.replace(/\D/g, '')) ? HIDE : all)],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, HIDE],
];
function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) { let d = +digits[digits.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
}
const marks = s => s.split(HIDE).length - 1;
/* identifiers that are never secrets and must reach evidence as they are: a UUID (also with all-numeric groups), a sha256 digest, a resourceVersion.
   They are held back before the rules and put back after, unless a rule hid the whole value they were in (a token=<uuid> stays hidden) */
/* an image reference by the Docker reference grammar ([domain[:port]/]component[/component…][:tag][@sha256:hex]) that matches no credential shape:
   only then is an image value kept as it is (a token echoed as an image is still a token) */
const COMPONENT = '[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*', DOMAIN = '(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*(?::\\d+)?';
const IMAGE_REF = new RegExp(`^(?:${DOMAIN}/)?${COMPONENT}(?:/${COMPONENT})*(?::[\\w][\\w.-]{0,127})?(?:@sha256:[0-9a-f]{64})?$`);
const imageRef = v => IMAGE_REF.test(v) && !SHAPE_RULES.some(([re]) => new RegExp(re.source, re.flags.replace('g', '')).test(v));
const KEEP = [[/(\b(?:image|Image)"?\s*[:=]\s*"?)([^\s"',]+)/g, imageRef], /(\b(?:trace|span|request)[_-]?id"?\s*[:=]\s*"?|\btraceparent"?\s*[:=]\s*"?|\bx-request-id\s*:\s*)([A-Za-z0-9-]+)/gi,
  [/\b[\w.-]+(?::\d+)?(?:\/[\w.-]+)+:[\w][\w.-]{0,127}(?:@sha256:[0-9a-f]{64})?/g, imageRef], [/\b[\w.-]+(?:\/[\w.-]+)*@sha256:[0-9a-f]{64}\b/g, imageRef],
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, /\bsha256:[0-9a-f]{64}\b/g, /\b[0-9a-f]{64}\b/g,
  /("resourceVersion"\s*:\s*"|\bresourceVersion\s*[:=]\s*"?)(\d+)/g];
const SLOT = /([-]+)/g;
function holdBack(text) {
  const kept = [];
  const slot = value => { kept.push(value); return `${[...String(kept.length - 1)].map(c => String.fromCharCode(0xE100 + +c)).join('')}`; };
  let out = text;
  for (const rule of KEEP) {
    const [re, ok = () => true] = Array.isArray(rule) ? rule : [rule];
    out = out.replace(re, (all, head, value) => (value !== undefined && typeof head === 'string' ? (ok(value) ? head + slot(value) : all) : ok(all) ? slot(all) : all));
  }
  return { out, back: s => s.replace(SLOT, (_, code) => kept[+[...code].map(c => c.charCodeAt(0) - 0xE100).join('')]) };
}

/** 명령 한 줄에서 비밀 값을 가림 */
export function maskSecrets(command) {
  return RULES.reduce((s, [re, to]) => s.replace(re, to), String(command ?? ''));
}

/** 글(로그, 대화, 근거, 내보내기)에서 비밀 값을 가림: { text, n }. n은 이번에 새로 가린 자리 수. UUID·sha256 다이제스트·resourceVersion은 그대로 */
export function maskText(text) { return masked(text, []); }
/* the order: the credential context first (flags, headers, key=value, secret JSON keys: whatever their value looks like, even a UUID), then
   identifiers and image references are held back, then shapes alone (and the caller's extra rules), then the identifiers come back */
function masked(text, extra) {
  const src = String(text ?? ''), { out: guarded, back } = holdBack(TEXT_RULES.reduce((s, [re, to]) => s.replace(re, to), maskSecrets(src)));
  const out = back([...SHAPE_RULES, ...extra].reduce((s, [re, to]) => s.replace(re, to), guarded));
  return { text: out, n: marks(out) - marks(src) };
}

/* 객체 안 비밀 값 가리기(글 값은 text 함수): 비밀 키 이름의 값, 비밀 이름의 env 항목({ name, value })의 값 */
const objectWith = text => input => {
  let n = 0;
  const hide = v => (v === HIDE ? v : (n++, HIDE));
  const plain = v => typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint';
  const walk = v => {
    if (typeof v === 'string') { const r = text(v); n += r.n; return r.text; }
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const envSecret = typeof v.name === 'string' && 'value' in v && isSecretKey(v.name);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (envSecret && k === 'value' || isSecretKey(k)) && plain(x) ? hide(x) : walk(x)]));
  };
  return { value: walk(input), n };
};
/** 객체 안 비밀 값 가리기: 비밀 키 이름의 값, 비밀 이름의 env 항목({ name, value })의 값, 그 밖의 글 값은 maskText. { value, n } */
export const maskObject = objectWith(maskText);

/* 이름표 없는 불투명 자격(API 키, 세션 토큰): base64·URL-safe base64 문자 32자 이상이 대문자·소문자·숫자 3개 이상을 섞은 것.
   소문자 hex 다이제스트·UUID·이미지 다이제스트·Kubernetes 이름·Java 클래스 경로는 맞지 않는다. 경로 모양(/로 시작, 짧은 조각만)도 제외 */
const OPAQUE = /(?<![A-Za-z0-9+/_=.-])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9+/_=.-])/g;
const opaque = s => /[A-Z]/.test(s) && /[a-z]/.test(s) && (s.match(/\d/g) ?? []).length >= 3
  && (!s.includes('/') || (!s.startsWith('/') && s.split('/').some(part => part.length >= 20)));
/** 공개 정책(로그 글이 IPC를 건너거나 근거 저장·모델 도구에 들어가기 전): maskText 규칙에 더해 이름표 없는 불투명 자격을 가림. { text, n } */
export function discloseText(text) { return masked(text, [[OPAQUE, m => (opaque(m) ? HIDE : m)]]); }
/** 객체(근거 조각·도구 결과)에 공개 정책: maskObject와 같고 글 값은 discloseText. { value, n } */
export const discloseObject = objectWith(discloseText);

/* 다음 인자(또는 =값)가 자격인 플래그 */
const SECRET_FLAG = /^--?(?:token|password|passwd|client-secret|secret|api-key|apikey|access-key|secret-key|auth|bearer|private-key|key|credential|credentials)$/i;
/** 사람·화면에 보이는 명령 인자(exec 인증 명령 동의 등): 자격 플래그 다음 값, --자격=값의 값, 공개 정책이 가리는 값은 HIDE. 실행하는 인자는 바꾸지 않는다 */
export function argsPreview(args) {
  const out = [];
  let hideNext = false;
  for (const raw of args ?? []) {
    const a = String(raw);
    if (hideNext) { out.push(HIDE); hideNext = false; continue; }
    const pair = /^(--?[A-Za-z][\w-]*)=([\s\S]*)$/.exec(a);
    if (pair && (SECRET_FLAG.test(pair[1]) || isSecretKey(pair[1]))) { out.push(`${pair[1]}=${HIDE}`); continue; }
    if (/^--?[A-Za-z]/.test(a) && (SECRET_FLAG.test(a) || isSecretKey(a))) { out.push(a); hideNext = true; continue; }
    out.push(discloseText(a).text);
  }
  return out;
}
