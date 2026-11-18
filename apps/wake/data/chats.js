/*
 * 대화의 자리(진행 중 · 보관 · 삭제)와 보관함 거르기, Markdown 내보내기.
 * 자리는 허브 대화 문서에 둔다. 이전 화면 전용 상태는 해당 대화의 첫 변경까지 읽는다.
 * 대화는 대화 저장소(관문 2: 메인 프로세스의 ai.run과 대화 보관)가 준다. 대화를 지워도 작업 기록은 남는다.
 */
const DAY = 86400000;

/** 모든 대화를 한 모양으로 { id, title, last, time, cluster, incident, messages, state, archivedAt }. conversations: 허브 저장소의 대화 */
export function chatList(conversations, settings) {
  const state = settings['wake.chats.state'] || {}, at = settings['wake.chats.archivedAt'] || {};
  return conversations.map(c => ({ id: c.id, title: c.title, last: c.preview ?? c.last ?? '', time: at[c.id] || c.archivedAt || c.time || '', cluster: c.cluster || '', incident: c.incident || '', messages: c.messages || [],
    state: state[c.id] || c.state || (c.archived ? 'archived' : 'active') }));
}

/** 보관함 거르기: 글자(제목·마지막 답), 클러스터, 기간(일, '0'은 전체) */
export function filterArchive(list, { q = '', cluster = 'all', days = '0' }, now = Date.now()) {
  const words = q.trim().toLowerCase();
  return list.filter(c => c.state === 'archived'
    && (!words || `${c.title} ${c.last}`.toLowerCase().includes(words))
    && (cluster === 'all' || c.cluster === cluster)
    && (!+days || (c.time && now - new Date(c.time).getTime() <= +days * DAY)));
}

/* 답 블록의 글자: 문단(글자와 코드 조각) */
const inline = p => p.map(x => typeof x === 'string' ? x : x.code ? '`' + x.code + '`' : x.text || '').join('');

/** 대화 하나를 Markdown으로: 제목, 클러스터·인시던트, 사람·AI 차례, 실행한 명령, 제안(대상과 바꿀 내용) */
export function toMarkdown(c, t) {
  const out = [`# ${c.title}`, '', `- ${t('wake.md.cluster')}: ${c.cluster}`];
  if (c.incident) out.push(`- ${t('wake.md.incident')}: ${c.incident}`);
  out.push('');
  if (!c.messages.length) out.push(`**${t('wake.md.ai')}**: ${c.last}`, '');
  for (const m of c.messages) {
    if (m.role === 'user') { out.push(`**${t('wake.md.user')}**: ${m.text}`, ''); continue; }
    if (m.steps?.length) out.push(...m.steps.map(s => `- \`${s.text}\``), '');
    for (const p of m.parts || []) {
      if (p.type === 'text') out.push(`**${t('wake.md.ai')}**`, '', ...p.blocks.flatMap(b => [inline(b.p || []), ''])); /* the label is its own line: the answer's own Markdown (a table, a list) stays as it is */
      if (p.type === 'approval') out.push(`**${t('wake.md.proposal')}**: ${p.title} · ${p.target}`, '', '```diff', p.diff, '```', '');
    }
  }
  return out.join('\n');
}
