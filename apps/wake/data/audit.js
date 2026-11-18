import { compareHistory } from './table-order.js';
/*
 * 감사 기록(spec/backend.md#F-BE-012): 도구 호출 하나가 한 행. AI 작업 기록 화면, 인시던트 진행 기록, 설정 › AI 연결의 최근 호출이 같은 행을 읽는다.
 * 행: { id, at(ms), incident?, action, requester: { kind: human|ai|wake|external, name }, client?, transport: desktop|mcp|api, tool?, scope, executor,
 *       permission?, model?, target, evidence?: [n], result(code), summary, masked, size?: { n, unit: lines|items|samples|tokens } }
 */
export const AUDIT_RETENTION_DAYS = 90;

/** 화면이 거르는 요청자 묶음: 사람, AI(내장·외부 AI 클라이언트), 그 밖(Wake 규칙, 외부 webhook·스크립트) */
export const requesterGroup = r => (r.requester?.kind === 'human' ? 'human' : r.requester?.kind === 'ai' ? 'ai' : 'other');

/** 출처 이름표의 칸(클라이언트 · 경로): 클라이언트를 거친 호출만(내장 AI는 Wake, 외부는 클라이언트 이름). 없으면 빈 목록 */
export const sourceParts = r => (r.client || r.transport === 'mcp' ? [r.client, r.transport].filter(Boolean) : []);

/** 결과 코드 -> [상태 아이콘 종류, 사전 키]: 성공·실행은 정상, 승인 대기는 진행, 거부·실패는 오류, 복구 확인은 복구 종류(incident-model) */
const RESULT = { ok: ['ok', 'wake.audit.r.ok'], ran: ['ok', 'wake.audit.r.ran'], waiting: ['busy', 'wake.audit.r.pending'], denied: ['error', 'wake.audit.r.denied'], forbidden: ['error', 'wake.flow.c.forbidden'],
  failed: ['error', 'wake.audit.r.failed'], firing: ['error', null], inferred: ['warn', 'wake.inc.grade.inferred'] };
export const resultOf = code => RESULT[code] ?? [code === 'service' ? 'ok' : 'warn', `wake.inc.result.${code}`];

/** 요약 카드 숫자: AI 읽기, 거부·실패, 모델 전달, 마스킹 합, 사람 요청·승인 */
export function auditCounts(rows) {
  const failed = r => ['denied', 'forbidden', 'failed'].includes(r.result);
  return {
    reads: rows.filter(r => r.action === 'read' && !failed(r)).length,
    failed: rows.filter(failed).length,
    model: rows.filter(r => r.model).length,
    masked: rows.reduce((a, r) => a + (r.masked || 0), 0),
    human: rows.filter(r => r.requester?.kind === 'human').length,
  };
}

/** 구간 { from, to }(ms) 안의 행, 새것 먼저 */
export const auditIn = (rows, { from, to }) => rows.filter(r => r.at >= from && r.at <= to).sort(compareHistory);

/** 거르기: requester(all|human|ai), transport(all|desktop|mcp|api), q(검색 글자) */
export function auditFilter(rows, { requester = 'all', transport = 'all', q = '' } = {}) {
  const words = q.trim().toLowerCase();
  return rows.filter(r => (requester === 'all' || requesterGroup(r) === requester) && (transport === 'all' || r.transport === transport)
    && (!words || [r.incident, r.summary, r.requester?.name, r.client, r.tool, r.target, r.executor, r.model].filter(Boolean).join(' ').toLowerCase().includes(words)));
}
