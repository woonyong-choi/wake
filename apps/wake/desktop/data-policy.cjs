/*
 * 보관 정책(spec/data-policy.md): 허브 저장소(hub-store.cjs)의 모든 묶음은 여기서 등급을 선언한다. 선언 없는 이름은 저장소가 열지 않는다.
 *   archive    인시던트와 함께 남는 기록(인시던트, 근거 스냅샷, 감사, 승인, 대화). 크기로 밀어내지 않는다. 인시던트가 남는 동안 그 행도 남는다
 *   cache      원본에서 다시 만들 수 있거나 잃어도 되는 관측 기록. TTL(days)과 묶음 크기 상한(maxBytes), 넘으면 오래된 행부터 지운다
 *   reference  도구 사용자 항목(규칙·무음·동기화 창·대시보드)의 목록: 참조와 내용 해시만. 내용은 인시던트 근거로 붙일 때만 스냅샷(archive)으로 남는다
 *   config     설정과 번호(사용자가 지울 때까지)
 * 저장 금지(never): Secret 값, 토큰·비밀번호 필드, kubeconfig 자격, 경계 없는 원본 로그. guard()가 저장 직전에 거절한다(가리기 maskText 뒤에도 남은 것).
 */
const DAY = 86_400_000;
const KiB = 1024, MiB = 1024 * KiB;
const CLASSES = Object.freeze(['archive', 'cache', 'reference', 'config']);
/** 보관 기본 일수(RULE-RETENTION, D-USR-2026-11-16-4) */
const ARCHIVE_DAYS = 90;

/*
 * days: 기준 시각에서 지나면 지움(null은 기간으로 지우지 않음, 'setting'은 wake.archive.keep). withIncident: 행의 incident가 아직 남아 있으면 기간과 무관하게 남김.
 * recordBytes: 한 행(JSON) 상한. maxBytes: 묶음 전체 상한(cache·reference만), 넘으면 오래된 행부터 밀어냄. perCluster/perSource: 연결 해제·클러스터 삭제 때 지울 수 있는 필드.
 */
const POLICY = Object.freeze({
  incidents: { class: 'archive', shape: 'docs', days: ARCHIVE_DAYS, anchor: 'incident', recordBytes: 1 * MiB, maxBytes: null },
  evidence: { class: 'archive', shape: 'log', days: ARCHIVE_DAYS, withIncident: true, recordBytes: 1 * MiB, maxBytes: null },
  audit: { class: 'archive', shape: 'log', days: ARCHIVE_DAYS, withIncident: true, recordBytes: 256 * KiB, maxBytes: null },
  approvals: { class: 'archive', shape: 'docs', days: ARCHIVE_DAYS, withIncident: true, recordBytes: 256 * KiB, maxBytes: null },
  conversations: { class: 'archive', shape: 'docs', days: 'setting', recordBytes: 8 * MiB, maxBytes: null },
  'alert-history': { class: 'cache', shape: 'log', days: 90, recordBytes: 64 * KiB, maxBytes: 16 * MiB, cluster: 'cluster' },
  events: { class: 'cache', shape: 'log', days: 7, recordBytes: 64 * KiB, maxBytes: 32 * MiB, cluster: 'cluster' },
  'source-checks': { class: 'cache', shape: 'log', days: 90, recordBytes: 16 * KiB, maxBytes: 8 * MiB, cluster: 'cluster', source: 'source' },
  'tool-catalog': { class: 'reference', shape: 'docs', days: 7, recordBytes: 1 * MiB, maxBytes: 8 * MiB, cluster: 'cluster', source: 'source' },
  meta: { class: 'config', shape: 'docs', days: null, recordBytes: 16 * KiB, maxBytes: null },
  'ai-prefs': { class: 'config', shape: 'docs', days: null, recordBytes: 64 * KiB, maxBytes: null },
  'ai-clients': { class: 'config', shape: 'docs', days: null, recordBytes: 64 * KiB, maxBytes: null },
  'ai-server': { class: 'config', shape: 'docs', days: null, recordBytes: 64 * KiB, maxBytes: null },
});

/* 저장 금지 검사: 값이 남은 비밀 필드(가린 표시나 빈 값은 통과), 값이 든 Secret 객체, 경계 없는 로그 줄, 한 행 크기 */
const HIDE = '••••';
const SECRET_FIELD = /^(?:password|passwd|pwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|bearer|authorization|cookie|set-cookie|api[_-]?key|apikey|x-api-key|access[_-]?key|secret[_-]?key|private[_-]?key|client-key-data|client-certificate-data|token-data|auth_password|smtp_auth_password)$/i;
const LOG_LINES = 2000;

/** 저장해도 되면 null, 아니면 { reason, at(경로) } */
function guard(value, recordBytes) {
  let found = null;
  const walk = (v, at, depth) => {
    if (found || depth > 64) return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${at}[${i}]`, depth + 1)); return; }
    if (!v || typeof v !== 'object') return;
    if (v.kind === 'Secret' && [v.data, v.stringData].some(d => d && typeof d === 'object' && Object.values(d).some(x => x !== '' && x != null))) { found = { reason: 'secret_object', at }; return; }
    if (Array.isArray(v.lines) && v.lines.length > LOG_LINES) { found = { reason: 'raw_logs', at: `${at}.lines` }; return; }
    for (const [k, x] of Object.entries(v)) {
      if (SECRET_FIELD.test(k) && typeof x === 'string' && x !== '' && x.replaceAll(HIDE, '').replace(/^(?:bearer|basic)\s*/i, '').trim() !== '') { found = { reason: 'secret_field', at: `${at}.${k}` }; return; }
      walk(x, `${at}.${k}`, depth + 1);
    }
  };
  walk(value, '$', 0);
  if (found) return found;
  if (recordBytes && Buffer.byteLength(JSON.stringify(value) ?? '') > recordBytes) return { reason: 'too_large', at: '$' };
  return null;
}

/** 묶음 정책 하나(덮어쓰기 overrides는 시험 전용: 크기 상한을 작게) */
function policyOf(name, overrides = {}) {
  const p = overrides[name] ?? POLICY[name];
  if (!p) throw new Error(`undeclared collection: ${name} (declare it in data-policy.cjs)`);
  return p;
}

module.exports = { POLICY, CLASSES, ARCHIVE_DAYS, DAY, guard, policyOf, LOG_LINES };
