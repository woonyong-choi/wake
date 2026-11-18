/*
 * 시뮬레이션의 마스킹 규칙 하나: 앱의 비밀 값 규칙(apps/wake/data/mask.js: 플래그·변수 대입·Authorization·bearer·URL 안 비밀번호)에
 * 로그와 대화에 섞여 오는 비밀 값을 더한다. 보고서·내보내기·AI 입력·로그 내려받기가 모두 이것을 쓴다.
 */
import { maskSecrets } from '../../apps/wake/data/mask.js';
import { t as L } from './sim-locale.js';

const MARK = L('sim.mask.mark');
const EXTRA = [
  /* a PEM private key block, whole */
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, MARK],
  /* key=value and key: value with a secret-looking key (password, token, secret, API and access keys, the AWS secret key) */
  [/(\b(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|secret[_-]?key|aws_secret_access_key|client[_-]?secret)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, `$1${MARK}`],
  /* tokens recognisable by their shape: a JWT, a GitHub token, a Slack token, an AWS access key id */
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, MARK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, MARK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, MARK],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, MARK],
  /* a card number (with or without separators) and an email address */
  [/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, MARK],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, MARK],
];
const count = s => s.split(MARK).length - 1;
/** the text with secrets hidden, and how many were hidden */
export function maskCount(text) {
  const src = String(text ?? ''), out = EXTRA.reduce((s, [re, to]) => s.replace(re, to), maskSecrets(src)).replaceAll('••••', MARK);
  return { text: out, n: count(out) - count(src) };
}
export const mask = text => maskCount(text).text;
/** how many values a scenario's redaction list hides in all */
export const redactedTotal = list => (list ?? []).reduce((t, r) => t + r.n, 0);
