/*
 * 내장 AI(spec/architecture.md#F-ARC-007)의 화면 쪽: kit AI 어댑터(send, 승인 결정), 공급자 모델 목록, 대화 목록, 화면 상태 중계.
 * 모델 호출과 도구는 모두 메인 프로세스(desktop/hub.cjs: ai.run, approval.decide, ai.providers, ai.conversations, screen.reply).
 * ai.run의 진행은 ai-event 서비스 이벤트({ run, ev })로 오고, 여기서 kit AiEvent로 흘린다. 서비스 호스트가 없으면 "AI 연결 안 됨".
 */
import { service, hasService, onService, text, t } from '../../kit/page/index.js';
import { said, sourceOff } from './data/index.js';
import { evidenceTag, when } from './pages/incident-parts.js';

/** 대화 저장소의 대화(사이드바, 보관함, 시작 화면이 같이 읽음): refreshConversations()가 채운다 */
export const conversations = [];
/* 답이 인용한 근거(허브 ai.run의 refs: 그 인시던트 근거와 같은 모양의 짧은 기록)를 kit 참조 알약으로: 이름표 '<종류> · <대상> · <시각 또는 값>'(인시던트 화면과 같은
   evidenceTag), 툴팁은 발췌, 누르면 그 근거(인시던트의 근거 주소). 저장된 대화의 답도 같은 기록을 가진다 */
const evidenceAddress = e => `wake://${['cluster', e.cluster, 'incidents', e.incident, 'evidence', String(e.n)].map(encodeURIComponent).join('/')}`;
export const citedRefs = refs => (Array.isArray(refs) ? refs : []).filter(e => e && Number.isInteger(e.n) && typeof e.cluster === 'string' && e.cluster && typeof e.incident === 'string' && e.incident)
  .map(e => { const tag = evidenceTag(t, e); return { n: e.n, label: tag?.label || `[${e.n}]`, ...(tag?.tip ? { tip: tag.tip } : {}), address: evidenceAddress(e) }; });
const withRefs = m => (m && Array.isArray(m.refs) ? { ...m, refs: citedRefs(m.refs) } : m);

/** 대화 저장소를 읽은 결과: unconfigured(서비스 호스트 없음) · loading · ready(0건도 ready) · failed. 보관함은 0건과 읽기 실패를 이것으로 나눔 */
export const conversationRead = { state: hasService() ? 'loading' : 'unconfigured' };
/* 목록이 다시 읽힌 뒤 부를 것(셸: 사이드바·⌘K를 다시 그림) */
const listeners = new Set();
export const onConversations = f => { listeners.add(f); return () => listeners.delete(f); };
export async function refreshConversations() {
  if (!hasService()) return conversations;
  const list = await service('ai.conversations', { includeArchived: true }).then(said, () => null);
  if (Array.isArray(list)) conversations.splice(0, conversations.length, ...list.map(c => (Array.isArray(c?.messages) ? { ...c, messages: c.messages.map(withRefs) } : c)));
  conversationRead.state = Array.isArray(list) ? 'ready' : 'failed';
  for (const f of listeners) { try { f(conversations); } catch { /* a listener's failure does not stop the others */ } }
  return conversations;
}
if (hasService()) onService(event => { if (event === 'approval' || event === 'ai-chat') void refreshConversations(); });

/* 질문 대상(B1): 참조 칩의 ref({ cluster, kind }, 도구 탭·페이지가 정한 그 대상)는 허브 ai.run의 target으로, 사용자 말마다의 ref로 간다. 전역 AI 범위는 scope로 따로 간다.
   허브는 target이 있으면 그것을 질문 대상으로, scope는 보조로 함께 기록한다(desktop/ai-run.cjs).
   cluster는 kubeconfig context 식별자 그대로다(EKS ARN "arn:aws:eks:…:cluster/prod", "team/prod" 같은 것도 정상): 문자 집합으로 거르지 않고, 등록된 context인지는 허브가 본다.
   여기서는 글자열 모양(비어 있지 않음, 제어 문자 없음, 1024자 이하)만. kind는 도구 종류 허용 목록(data/tool-kinds.js TOOL_KINDS와 같은 id) */
const KINDS = new Set(['prometheus', 'loki', 'tempo', 'grafana', 'argocd', 'flux', 'alertmanager']);
const contextId = x => typeof x === 'string' && x.length > 0 && x.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(x);
/* a reference the person asked from goes to the hub as asked, even when malformed: the hub refuses it in front of them, it is never quietly dropped (and the scope used instead) */
const askedTarget = x => (x && typeof x === 'object' ? refOf(x) ?? { cluster: x.cluster } : x); /* as given, never shortened: the hub checks and refuses it (a cut id could match another context) */
export const refOf = x => (x && typeof x === 'object' && contextId(x.cluster) ? { cluster: x.cluster, ...(KINDS.has(x.kind) ? { kind: x.kind } : {}) } : null);
const plain = m => (m.role === 'user' ? m.text : (m.parts ?? []).filter(p => p.type === 'text').flatMap(p => p.blocks.map(b => (b.p ?? []).join(''))).join('\n'));
/* 답의 시각을 쓸 시간대(설정 kit.timeZone: 'system'은 이 컴퓨터의 시간대, 'utc', 또는 IANA 이름) -> IANA 이름 */
const zoneName = z => (z === 'utc' ? 'UTC' : typeof z === 'string' && z && z !== 'system' ? z : Intl.DateTimeFormat().resolvedOptions().timeZone);
/* 결정 시각도 같은 시각 형식(RULE-TIME: 오늘 HH:mm, 다른 날 YYYY-MM-DD HH:mm) */
const decision = r => ({ ...r, ...(typeof r?.time === 'number' ? { time: when(r.time, Date.now()) } : {}) });
/* 질문에 붙은 맥락 칩(그 화면의 이름표): 다시 연 대화도 같은 칩을 보이게 글자만 저장 */
const chipOf = c => (c && typeof c === 'object' && typeof c.title === 'string' ? { title: c.title, ...(typeof c.icon === 'string' ? { icon: c.icon } : {}), ...(typeof c.sub === 'string' ? { sub: c.sub } : {}) } : null);

/** kit AiDef의 어댑터와 모델 목록. scope(): { cluster, namespace } 지금 AI 범위 */
export function createAiAdapter({ scope }) {
  return {
    /* 공급자·모델 이름은 CLI가 준 말 그대로(문구 키가 아님): { raw }로 */
    models: async () => (hasService() ? ((await service('ai.providers')) || []).map(p => ({ ...p, label: { raw: String(p.label ?? p.id) }, models: (p.models || []).map(m => ({ ...m, label: { raw: String(m.label ?? m.id) } })) })) : []),
    adapter: {
      async *send(req, { signal, settings } = {}) {
        if (!hasService()) { yield { type: 'error', message: text(sourceOff('ai')) }; return; }
        const run = crypto.randomUUID(), queue = [];
        let wake = null, finished = false;
        const off = onService((event, p) => { if (event === 'ai-event' && p?.run === run) { queue.push(withRefs(said(p.ev))); wake?.(); } });
        /* the saved conversation is named by its id: the one the engine keeps (the hub's answer, or the new conversation's own); a caller without one starts a new
           record under a fresh id. Never rebuilt from the client's messages */
        const call = service('ai.run', { run, conversation: typeof req.conversation === 'string' && req.conversation ? req.conversation : `cv-${crypto.randomUUID()}`,
          messages: req.messages.map(m => ({ id: m.id ??= crypto.randomUUID(), role: m.role, text: plain(m), at: Number.isFinite(m.at) ? m.at : null, ...(chipOf(m.chip) ? { chip: chipOf(m.chip) } : {}), ...(refOf(m.chip?.ref) ? { ref: refOf(m.chip.ref) } : {}) })), model: req.model, permission: req.permission,
          ...(req.context && req.context.ref !== undefined ? { target: askedTarget(req.context.ref) } : {}), scope: scope(), timeZone: zoneName(settings?.['kit.timeZone']) })
          .catch(() => { queue.push({ type: 'error', message: t('wake.ai.failed', { reason: 'request_failed' }) }); })
          .finally(() => { finished = true; wake?.(); });
        /* 멈춤: 허브가 그 실행을 끝낸다(API 요청 중단, 구독 CLI 프로세스 종료) */
        const onAbort = () => { void service('ai.cancel', { run }).catch(() => null); wake?.(); };
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
          while (!signal?.aborted) {
            if (queue.length) { const ev = queue.shift(); yield ev; if (ev.type === 'done' || ev.type === 'error') break; continue; }
            if (finished) break;
            await new Promise(resolve => { wake = resolve; }); wake = null;
          }
        } finally { off(); signal?.removeEventListener('abort', onAbort); }
        if (signal?.aborted) { void call.then(() => refreshConversations()); return; }
        await call;
        void refreshConversations();
      },
      /* 허용·거절은 데스크톱의 사람만. 허브는 실행하지 않는다: 허용은 approved(승인 기록, Draft PR 길은 GitHub이 없으면 PR 실패 기록) */
      resolveApproval: (id, choice) => service('approval.decide', { id, choice }).then(decision),
      recordApprovalDecision: (id, choice, { reason }) => service('approval.decide', { id, choice, reason }).then(decision),
    },
    /* 화면 상태 중계: get/set_screen_state 도구가 열린 페이지에 묻고 답을 받는다(kit ai.screenRelay) */
    screenRelay: { event: 'ai-screen', reply: value => { void service('screen.reply', value); } },
  };
}
