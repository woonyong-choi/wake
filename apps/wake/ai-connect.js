/*
 * 설정 › AI 연결(spec/architecture.md#F-ARC-006): 외부 AI(MCP)와 API 기반 AI·스크립트(HTTP)가 Wake 도구 층을 쓰는 길. kit 설정 부품만 쓴다.
 *   경로 켜기(MCP, HTTP API: 기본 꺼짐, 127.0.0.1에만 열림), 클라이언트 행(이름 · 경로 · 범위 · 마지막 호출), 클라이언트 추가 대화 상자, 최근 호출(감사 기록 행).
 * 서버와 클라이언트는 메인 프로세스 허브(desktop/hub-server.cjs: aiserver.state, aiserver.set, aiserver.client). 경로 스위치 값(설정 저장소)이 원하는 상태이고
 * 이 페이지가 그릴 때 허브에 맞춘다. 클라이언트 토큰은 만들 때 한 번만 대화 상자에 보이고(클립보드 복사를 시도해 결과를 그대로 말함) 허브에는 해시만 남는다.
 */
import { service, hasService, components as C } from '../../kit/page/index.js';
import { sourceOff, said } from './data/index.js';
import { shownTime } from './pages/parts.js';

const transportWord = tr => `wake.inc.transport.${tr}`;
const MCP = 'wake.ai.mcp', API = 'wake.ai.api';

/** 범위 한 줄: 클러스터 · namespace · 종류 · Secret 메타데이터만 */
const scopeLine = s => ({ key: 'wake.s.aic.scopeLine', vars: { cluster: s.cluster, ns: s.namespaces?.length ? s.namespaces.join(', ') : { key: 'wake.list.allNs' }, kinds: s.kinds?.length ? s.kinds.join(', ') : { key: 'wake.s.aic.allKinds' } } });

export function aiConnectPage({ raw }) {
  return { id: 'ai-connect', label: 'wake.settings.aiConnect', icon: 'plug', sections: async ctx => {
    if (!hasService()) return [{ title: 'wake.s.aic.transports', none: { icon: 'plug', title: sourceOff('auditStore') } }];
    const want = ctx.settings();
    let st = await service('aiserver.state');
    if ((want[MCP] ?? false) !== st.mcp || (want[API] ?? false) !== st.api) st = await service('aiserver.set', { mcp: !!want[MCP], api: !!want[API] });
    const calls = (await service('audit.query', {}).then(said)).rows.filter(r => r.transport === 'mcp' || r.transport === 'api').slice(0, 20);
    return [
      { title: 'wake.s.aic.transports', description: st.url ? { key: 'wake.s.aic.listening', vars: { url: st.url } } : st.error ? { key: `wake.s.aic.${st.error}`, vars: { port: st.port } } : undefined, groups: [[
        { id: 'aic-mcp', title: 'wake.s.aic.mcp', control: { type: 'switch', key: MCP } },
        { id: 'aic-api', title: raw('HTTP API'), control: { type: 'switch', key: API } },
      ]] },
      { title: 'wake.s.aic.clients', count: st.clients.length, groups: [[
        ...st.clients.map(c => ({ id: 'aic-' + c.id, icon: c.transport === 'mcp' ? 'plug' : 'terminal', title: raw(c.name),
          description: { key: 'wake.s.aic.clientLine', vars: { transport: { key: transportWord(c.transport) }, scope: scopeLine(c.scope) } },
          control: { type: 'group', items: [...(c.lastCall ? [{ type: 'value', text: raw(shownTime(c.lastCall)) }] : []), { type: 'more', menu: 'wake.ai.client.more', arg: c.id }] } })),
        { id: 'aic-add', variant: 'add', title: 'wake.s.aic.add', dialog: 'wake.ai.client.add' },
      ]] },
      { title: 'wake.s.aic.calls', records: { empty: 'wake.ailog.none', rows: calls.map(r => ({ icon: r.transport === 'mcp' ? 'plug' : 'terminal', title: raw(r.summary),
        meta: [raw([r.client, r.transport.toUpperCase()].filter(Boolean).join(' · ')), raw(shownTime(r.at))], end: { key: r.result === 'ok' ? 'wake.audit.r.ok' : r.result === 'forbidden' ? 'wake.flow.c.forbidden' : r.result === 'waiting' ? 'wake.audit.r.pending' : 'wake.audit.r.failed' },
        tone: r.result === 'ok' || r.result === 'waiting' ? undefined : 'danger' })) } },
    ];
  } };
}

/** 클라이언트 추가 대화 상자: 이름, 경로, 범위(클러스터, namespace, 종류, Secret은 메타데이터만) */
export const aiClientDialog = clusters => (_arg, st = { settings: {} }) => { const list = clusters(st); return { title: 'wake.s.aic.add', fields: [
  { key: 'name', label: 'wake.s.aic.name', type: 'text', placeholder: 'claude-code', required: true },
  { key: 'transport', label: 'wake.ailog.transport', type: 'select', value: 'mcp', options: [{ id: 'mcp', label: transportWord('mcp') }, { id: 'api', label: transportWord('api') }] },
  { key: 'cluster', label: 'wake.s.aic.cluster', type: 'select', required: true, value: list[0]?.id, options: list.map(c => ({ id: c.id, label: { raw: c.name }, icon: c.icon })) },
  { key: 'namespaces', label: 'Namespace', type: 'text', placeholder: 'payments, checkout' },
  { key: 'kinds', label: 'wake.s.aic.kinds', type: 'text', placeholder: 'Pod, Deployment, Event' },
  { key: 'secrets', label: 'wake.s.aic.secrets', type: 'select', value: 'metadata', options: [{ id: 'metadata', label: 'wake.s.aic.secretsMeta' }] },
], submit: { label: 'wake.fr.add.btn', action: 'wake.ai.client.add' } }; };

export const aiClientMenu = id => ({ align: 'end', items: [{ id: 'aic-rotate', label: 'wake.s.aic.rotate', icon: 'key-2', action: 'kit.dialog.open', arg: { id: 'wake.ai.client.rotateDlg', arg: id } }, { type: 'separator' },
  { id: 'aic-remove', label: 'wake.ctx.delete', icon: 'trash', danger: true, action: 'wake.ai.client.remove', arg: id }] });

/* 클립보드에 실제로 들어갔는지(권한 거절·클립보드 없음은 false) */
const copyToken = async token => { try { await globalThis.navigator.clipboard.writeText(token); return true; } catch { return false; } };

/** 새 토큰 대화 상자: 토큰은 사람이 닫을 때까지 복사할 수 있는 칸에 한 번 보이고, 복사됐는지 그대로 말한다(B3-04) */
export const aiTokenDialog = ({ token, copied, rotated } = {}) => ({ title: rotated ? 'wake.s.aic.rotatedTitle' : 'wake.s.aic.tokenTitle',
  description: copied ? 'wake.s.aic.tokenCopied' : 'wake.s.aic.tokenNotCopied', body: C.codeBlock.render({ lang: 'token', text: String(token || ''), wrap: true, actions: 'copy' }),
  submit: null });

const showToken = async (api, token, rotated) => { api.dialog?.('wake.ai.client.token', { token, copied: await copyToken(token), rotated }); api.refresh?.(); };

export const aiClientActions = {
  /* 허브가 토큰을 만든다: 값은 이 한 번만 보임(허브에는 해시만) */
  'wake.ai.client.add': async (a, api) => { const v = a.values || {}, name = String(v.name || '').trim(); if (!name || !v.cluster) return;
    const r = await service('aiserver.client', { op: 'add', name, transport: v.transport === 'api' ? 'api' : 'mcp', scope: { cluster: v.cluster, namespaces: v.namespaces || '', kinds: v.kinds || '' } });
    if (!r?.token) return;
    await showToken(api, r.token, false); },
  'wake.ai.client.remove': async (a, api) => { await service('aiserver.client', { op: 'remove', id: a.arg }); api.refresh?.(); },
  /* 토큰 다시 발급: 새 값은 이 한 번만 보임, 이전 토큰은 허브가 바로 무효로 함 */
  'wake.ai.client.rotate': async (a, api) => { const r = await service('aiserver.client', { op: 'rotate', id: a.arg }).catch(() => null);
    if (!r?.token) { api.toast({ title: 'wake.s.aic.rotateFailed', tone: 'error' }); return; }
    await showToken(api, r.token, true); },
};
