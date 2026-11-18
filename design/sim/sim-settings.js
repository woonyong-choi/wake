/*
 * 연결·자료 화면(시뮬레이션): 앱의 설정 › 클러스터와 설정 › 보관한 대화 · AI 대화 · AI 연결에 들어가는 새 줄을 한 화면에서 본다.
 *   1. kubeconfig의 exec 인증 명령을 처음 쓸 때: 그 클러스터 줄이 "인증 명령 실행 허락 필요 · 명령"으로 멈추고, 명령 확인 대화상자가 실제 경로와 인자를 그대로 보인다.
 *   2. 연결 설정 파일을 읽지 못할 때: 클러스터 목록 위 줄 하나가 그 사실과 고치는 길(권한 · 내용 · 다시 시도)을 말하고 다시 읽기를 준다.
 *   3. 내 자료: 내보내기, 지우기(확인 대화상자), 자동 해석 스위치, 외부 AI 클라이언트 토큰 다시 발급(확인 대화상자).
 * 화면 요소는 kit 구성 요소(settings-section · settings-group · settings-row · connection-row · code-block · dialog)만 쓴다.
 */
import { t as L } from './sim-locale.js';

const CONSENT = { id: 'eks-payments', name: 'payments-prod', command: '/opt/homebrew/bin/aws', args: ['--region', 'ap-northeast-2', 'eks', 'get-token', '--cluster-name', 'payments-prod', '--output', 'json'] };
const shellWord = s => (/^[A-Za-z0-9_./=:@%+-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
export const consentLine = c => [c.command, ...c.args].map(shellWord).join(' ');

export function createSettingsSim({ C, html, icon, get, update, toast }) {
  function page() {
    const { S } = get(), allowed = !!S.execAllowed, repair = S.connRepair ?? 'CONNECTIONS_REPAIR_CONTENT', fileOk = !!S.connFileOk;
    const clusterRows = [
      ...(fileOk ? [] : [C.settingsRow.render({ lead: C.statusIcon.render({ kind: 'error' }), title: L('sim.set.connFile.title'), description: L('sim.set.connFile.' + repair), control: C.button.render({ label: L('sim.set.connFile.reread'), icon: 'arrow-rotate-clockwise', size: 'sm', variant: 'secondary', action: 'sim.set.reread' }) })]),
      C.connectionRow.render({ id: 'eks-payments', brand: 'brand-eks', title: CONSENT.name, description: allowed ? 'EKS · v1.33 · Node 6' : L('sim.set.consent.row', { command: 'aws' }), state: allowed ? L('sim.set.ok') : L('sim.set.consent.state'), kind: allowed ? 'ok' : 'fix', attention: !allowed,
        action: allowed ? { label: { raw: L('sim.set.recheck') }, icon: 'arrow-rotate-clockwise', action: 'sim.noop', variant: 'ghost' } : { label: { raw: L('sim.set.consent.review') }, icon: 'shield-check', action: 'sim.set.review' } }),
      C.connectionRow.render({ id: 'kind-lab', brand: 'brand-kind', title: 'kind-lab', description: 'kind · v1.36 · Node 3', state: L('sim.set.ok'), kind: 'ok', action: { label: { raw: L('sim.set.recheck') }, icon: 'arrow-rotate-clockwise', action: 'sim.noop', variant: 'ghost' } }),
    ];
    const autoOn = !!S.autoInterpret;
    const dataRows = [
      C.settingsRow.render({ title: L('sim.set.data.export'), description: L('sim.set.data.exportDesc'), control: C.button.render({ label: L('sim.set.data.exportBtn'), icon: 'download', size: 'sm', variant: 'secondary', action: 'sim.noop' }) }),
      C.settingsRow.render({ title: L('sim.set.data.delete'), description: L('sim.set.data.deleteDesc'), control: C.button.render({ label: L('sim.set.data.deleteBtn'), icon: 'trash', size: 'sm', variant: 'destructive', action: 'sim.set.deleteAsk' }) }),
    ];
    const aiRows = [C.settingsRow.render({ title: L('sim.set.auto'), description: L('sim.set.autoDesc'), control: C.toggle.render({ on: autoOn, action: 'sim.set.auto', label: L('sim.set.auto') }) })];
    const clientRows = [C.settingsRow.render({ lead: icon('plug', 'sm'), title: 'claude-code', description: L('sim.set.client.line'), control: C.button.render({ label: L('sim.set.client.rotate'), icon: 'key-2', size: 'sm', variant: 'ghost', action: 'sim.set.rotateAsk' }) })];
    const section = (title, rows) => C.settingsSection.render({ title, children: C.settingsGroup.render({ children: rows }) });
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('shield-check', 'lg')}<b>${L('sim.view.data')}</b><span class="v-sub">${L('sim.set.sub')}</span></div></div>
      ${section(L('sim.set.clusters'), clusterRows)}${section(L('sim.set.aiChat'), aiRows)}${section(L('sim.set.clients'), clientRows)}${section(L('sim.set.data'), dataRows)}</section>`;
  }
  const dialogs = {
    'sim.set.consentDlg': () => ({ title: { raw: L('sim.set.consent.title') }, size: 'md', description: { raw: L('sim.set.consent.desc', { name: CONSENT.name }) },
      body: C.codeBlock.render({ lang: 'exec', text: consentLine(CONSENT), syntax: 'sh', wrap: true, actions: 'copy' }),
      cancel: { raw: L('sim.set.consent.refuse') }, submit: { label: { raw: L('sim.set.consent.allow') }, action: 'sim.set.allow' } }),
    'sim.set.deleteDlg': () => ({ title: { raw: L('sim.set.data.deleteTitle') }, description: { raw: L('sim.set.data.deleteConfirm') }, submit: { label: { raw: L('sim.set.data.deleteBtn') }, action: 'sim.set.delete', variant: 'destructive' } }),
    'sim.set.rotateDlg': () => ({ title: { raw: L('sim.set.client.rotateTitle') }, description: { raw: L('sim.set.client.rotateConfirm', { name: 'claude-code' }) }, submit: { label: { raw: L('sim.set.client.rotate') }, action: 'sim.set.rotate' } }),
  };
  const open = id => { const b = document.createElement('button'); b.hidden = true; b.dataset.dialog = id; document.body.appendChild(b); b.click(); b.remove(); };
  const actions = {
    'sim.set.review': () => open('sim.set.consentDlg'),
    'sim.set.allow': () => { get().S.execAllowed = true; toast(L('sim.set.consent.done')); update(); },
    'sim.set.reread': () => { get().S.connFileOk = true; update(); },
    'sim.set.auto': () => { const { S } = get(); S.autoInterpret = !S.autoInterpret; update(); },
    'sim.set.deleteAsk': () => open('sim.set.deleteDlg'),
    'sim.set.delete': () => toast(L('sim.set.data.deleted')),
    'sim.set.rotateAsk': () => open('sim.set.rotateDlg'),
    'sim.set.rotate': () => toast(L('sim.set.client.rotated')),
  };
  return { page, dialogs, actions };
}
