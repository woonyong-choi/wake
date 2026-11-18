/*
 * 설계서(인시던트)의 새 부품 견본. 승인 전이라 kit이 아니라 견본 쪽에 둔다(시뮬레이션 sim.html이 쓴다).
 * 면 규칙(상태 도구 견본과 같음): 면은 summary-bar 하나(반경 3xl, 닫히면 알약 한 줄). 그 안의 하위 항목은 면을 다시 깔지 않고
 * 구분선으로 나눈 줄(닫힌 줄은 요약, 누르면 그 아래에 내용)로 놓는다. 떠 있는 것(메뉴, 대화 상자)은 kit menu·dialog를 그대로 쓴다.
 *   인시던트 한 건은 kit status-flow(GitOps 상태 도구와 같은 부품): 감지 → 범위 → 원인 → 조치 → 확인 → 결과, 그 아래 단계 섹션은 생길 때 하나씩 더한다
 *   reasoningChain  추론 사슬(면 없음): 결론 한 줄(등급, 출처, 칸 수) 아래 관측·기준·해석·결론·검증 방법·확인 안 됨 줄
 *   verifyCard      복구 확인(면 없음): 조건 줄, 수집 구간 수(정상 지속·통과까지는 단계 머리 값)
 *   actionCompare   조치 비교(면 없음): 안마다 구분선으로 나눈 줄
 *   approvalHead    승인 질문 위 대상 줄(면 없음)
 *   headLines       상세 머리 아래 조건부 줄(사유 · 관리 · 연결, 최대 셋)
 *   exportMenuDef, exportDialog  kit menu·dialog 정의
 */
import { redactedTotal } from './sim-mask.js';
import { t as L } from './sim-locale.js';
const GRADE = Object.freeze({
  confirmed: { label: L('sim.p.grade.confirmed'), kind: 'ok', icon: 'shield-check' },
  inferred: { label: L('sim.p.grade.inferred'), kind: 'warn' },
  supported: { label: L('sim.p.grade.supported'), kind: 'warn' }, /* an outside team's reply backs it; Wake's own data does not show it yet */
  insufficient: { label: L('sim.p.grade.insufficient'), kind: 'idle', icon: 'lock' },
});
const SOURCE = Object.freeze({ rule: { word: L('sim.p.src.rule') }, skill: { word: L('sim.p.src.skill') }, ai: { word: 'AI' } });
const CAUSE_ICON = 'search'; /* one mark for a cause, whoever reached it (rule, skill, AI): who it was reads in the words beside it */
const CELLS = [['observe', L('sim.p.cell.observe')], ['basis', L('sim.p.cell.basis')], ['interpret', L('sim.p.cell.interpret')], ['verify', L('sim.p.cell.verify')], ['unknown', L('sim.p.cell.unknown')]]; /* the conclusion is the chain's own head line */
export const KEYS = [
  [L('sim.p.keys.move'), [['j', L('sim.p.keys.next')], ['k', L('sim.p.keys.prev')], ['Enter', L('sim.p.keys.open')], ['Esc', L('sim.p.keys.close')], ['1-6', L('sim.p.keys.stage')]]],
  [L('sim.p.keys.view'), [['l', L('sim.p.keys.logs')], ['y', 'YAML'], ['t', L('sim.p.keys.timeline')]]],
  [L('sim.p.keys.work'), [['a', L('sim.p.keys.approve')], ['c', L('sim.p.keys.copy')], ['x', L('sim.p.keys.export')], ['?', L('sim.p.keys.help')]]],
];
const FORMATS = [['pdf', 'PDF'], ['xls', 'Excel'], ['csv', 'CSV'], ['json', 'JSON'], ['md', 'Markdown']];

export const css = `
.wsc-t { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; max-width: 100%; } .wsc-t > :not(:last-child) { flex: none; } .wsc-t > :last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } /* what gives way in a state with a name is the name at its end */
.rc-head { display: flex; align-items: flex-start; gap: var(--space-2); min-width: 0; white-space: normal; text-align: start; }

.rc, .ah, .ac, .vc { word-break: keep-all; overflow-wrap: anywhere; }
.rc { display: grid; gap: var(--space-3); min-width: 0; }
.rc-h { display: flex; align-items: flex-start; gap: var(--space-2); min-width: 0; }
.rc-lead { flex: none; display: grid; place-items: center; height: var(--leading-sm); color: var(--muted-foreground); } /* the head leads with who reached it (rule, skill, AI); how sure it is reads as the coloured word under it */
.rc-t { display: grid; gap: var(--space-1); flex: 1; min-width: 0; }
.rc-t b { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--foreground); text-wrap: pretty; } /* the conclusion is the whole first line; when it runs to a second line it breaks evenly, not on one stray word */
.rc-g { font-weight: var(--weight-medium); } .rc-g[data-kind="warn"] { color: var(--warning-content); } .rc-g[data-kind="ok"] { color: var(--success-content); }
.rc[data-part="body"] .rc-row:first-child { border-block-start: 0; padding-block-start: 0; } /* under a bar's head the bar draws the rule: the first row adds none of its own */
.rc-m { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.chain-src { display: inline-flex; align-items: center; gap: var(--space-1); }
.rc-b { display: grid; }
.rc-row { display: grid; grid-template-columns: calc(var(--space-16) + var(--space-2)) minmax(0, 1fr); gap: var(--space-3); padding-block: var(--space-2); border-block-start: var(--line) solid var(--border-surface); font-size: var(--text-sm); line-height: var(--leading-sm); }
.rc-row > span { color: var(--muted-foreground); font-size: var(--text-xs); line-height: var(--leading-sm); }
.rc-row ul { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-1); }
.rc-row li { color: var(--foreground); }
.rc-ref { display: inline-flex; align-items: center; height: var(--badge-h); padding: 0 var(--space-1_5); margin-left: var(--space-1); border-radius: var(--r-pill); background: var(--secondary); font-size: var(--text-xs); color: var(--foreground); font-variant-numeric: tabular-nums; cursor: pointer; vertical-align: baseline; }
.rc-ref:hover { background: var(--accent); }
.rc-f { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
.rc-prev { font-size: var(--text-xs); color: var(--muted-foreground); }

.vc { display: grid; gap: var(--space-3); min-width: 0; --property-strip-min: calc(var(--space-16) * 1.5); } /* the four figures stay on one row in a pane (two by two when narrower) */
.vc-rows { display: grid; }
.vc-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); min-height: var(--control-h); border-block-start: var(--line) solid var(--border-surface); font-size: var(--text-sm); }
.vc-row em { font-style: normal; font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.vc-cap { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }

.ac { display: grid; }
.ac-o { display: grid; gap: var(--space-2); min-width: 0; padding-block: var(--space-3); border-block-start: var(--line) solid var(--border-surface); }
.ac-o:first-child { border-block-start: 0; padding-block-start: 0; }
.ac-h { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.ac-h b { font-size: var(--text-sm); font-weight: var(--weight-semibold); } .ac-k { font-size: var(--text-xs); color: var(--muted-foreground); } /* a kind is a quiet word, never a filled badge */
.ac-h > :last-child { margin-left: auto; }
.ac-kv { display: grid; grid-template-columns: calc(var(--space-16) + var(--space-2)) minmax(0, 1fr); gap: var(--space-1) var(--space-3); margin: 0; font-size: var(--text-sm); }
.ac-kv dt { color: var(--muted-foreground); font-size: var(--text-xs); line-height: var(--leading-sm); } .ac-kv dd { margin: 0; color: var(--foreground); min-width: 0; }
.ac-path { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; color: var(--muted-foreground); }
.ac-path i { font-style: normal; }

.ah { display: grid; gap: var(--space-1_5); padding: 0 var(--space-1) var(--space-1); font-size: var(--text-sm); }
.ah-t { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--muted-foreground); }
.ah-prod { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--warning-content); font-family: var(--font-sans); }
.ah-prod::before { content: ""; width: var(--space-1_5); height: var(--space-1_5); border-radius: var(--r-pill); background: var(--warning); }
.ah-g { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--muted-foreground); }

.kd-v { white-space: nowrap; font-size: var(--text-sm); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
`;

export function createParts({ C, html, icon }) {
  const grade = g => GRADE[g] ?? GRADE.insufficient;
  const ref = (id, action) => html`<span class="rc-ref" role="button" tabindex="0" data-action="${action}" data-arg="${JSON.stringify(id)}">${L('sim.p.ref', { id })}</span>`;
  const line = (item, action) => html`<li>${item.text}${(item.refs || []).map(r => ref(r, action))}</li>`;

  /** content only (no face): the caller puts it in a stage or a summary-bar
   *  @param {{conclusion, grade, source: {kind, name, version?, adoptedBy?}, cells, refAction, adopt?: {action, arg}, previous?: string[]}} p */
  function reasoningChain(p) {
    const g = grade(p.grade), src = SOURCE[p.source.kind];
    const count = [['observe', L('sim.p.cell.observe')], ['basis', L('sim.p.cell.basis')], ['unknown', L('sim.p.cell.unknown')]].map(([k, w]) => [w, (p.cells[k] || []).length]).filter(([, n]) => n);
    const headOf = cls => html`<div class="${cls}"><span class="rc-lead">${icon(CAUSE_ICON, 'sm')}</span>
        <div class="rc-t"><b>${p.conclusion}</b>
          <span class="rc-m"><span class="rc-g" data-kind="${g.kind}">${g.label}</span><span class="chain-src">${src.word} · ${p.source.name}${p.source.version ? ' ' + p.source.version : ''}${p.source.adoptedBy ? html` · ${L('sim.p.adopted')} ${C.avatar.render({ name: p.source.adoptedBy, size: 'sm', showName: true })}` : ''}</span>${p.note ? html`<span>${p.note}</span>` : ''}${count.map(([w, n]) => html`<span>${w} ${n}</span>`)}</span></div></div>`;
    if (p.part === 'head') return headOf('rc-head');
    return html`<section class="rc" data-part="${p.part || 'all'}">
      ${p.part === 'body' ? '' : headOf('rc-h')}
      <div class="rc-b">${CELLS.map(([k, label]) => (p.cells[k] || []).length ? html`<div class="rc-row"><span>${label}</span><ul>${p.cells[k].map(it => line(it, p.refAction))}</ul></div>` : '')}</div>
      ${p.adopt || p.previous?.length ? html`<div class="rc-f">${p.adopt ? C.button.render({ label: L('sim.p.adopt'), icon: 'check', variant: 'secondary', size: 'sm', round: true, action: p.adopt.action, arg: p.adopt.arg }) : ''}${(p.previous || []).map(t => html`<span class="rc-prev">${L('sim.p.prevConclusion', { t })}</span>`)}</div>` : ''}
    </section>`;
  }

  const S = { pass: ['ok', L('sim.p.vc.pass')], watch: ['busy', L('sim.p.vc.watch')], fail: ['error', L('sim.p.vc.fail')], unknown: ['idle', L('sim.p.vc.unknown')], unjudged: ['idle', L('sim.p.vc.unjudged')] };
  /** @param {{stable, need, max, conditions: {id, label, state, value}[], windows: ('ok'|'bad'|'miss'|'none')[], cadence, minWindows}} p */
  function verifyCard(p) {
    return html`<div class="vc">
      <div class="vc-rows">${p.conditions.map(c => html`<div class="vc-row">${C.statusIcon.render({ kind: S[c.state][0], text: c.label })}<em>${S[c.state][1]}${c.value ? ' · ' + c.value : ''}</em></div>`)}</div>
      <div class="vc-cap"><span>${L('sim.p.vc.windows', { n: p.windows.filter(w => w === 'ok' || w === 'bad').length })}</span><span>${L('sim.p.vc.missed', { n: p.windows.filter(w => w === 'miss').length })}</span><span>${L('sim.p.vc.min', { n: p.minWindows })}</span></div>
    </div>`;
  }

  /** content only: options one under another, divided by a line
   *  @param {{options: {id, title, grade, kind, change, impact, path: string[], note?, disabled?}[], action}} p */
  function actionCompare(p) {
    return html`<div class="ac">${p.options.map((o, i) => html`<div class="ac-o">
      <div class="ac-h"><b>${o.title}</b><span class="ac-k">${o.kind}</span>${C.statusIcon.render({ kind: grade(o.grade).kind, icon: grade(o.grade).icon, text: (b => /^근거/.test(b) ? L('sim.p.act.grade', { g: b }) : L('sim.p.act.basis', { g: b }))(o.basis ?? grade(o.grade).label) })}<span>${C.button.render({ label: L('sim.p.act.pick'), variant: i === 0 ? 'default' : 'secondary', size: 'sm', round: true, action: p.action, arg: o.id, disabled: !!o.disabled })}</span></div>
      <dl class="ac-kv"><dt>${L('sim.p.act.change')}</dt><dd>${o.change}</dd><dt>${L('sim.p.act.impact')}</dt><dd>${o.impact}</dd>${o.note ? html`<dt>${L('sim.p.act.note')}</dt><dd>${o.note}</dd>` : ''}<dt>${L('sim.p.act.path')}</dt><dd><span class="ac-path">${o.path.map((s, j) => html`${j ? html`<i>→</i>` : ''}<span>${s}</span>`)}</span></dd></dl>
    </div>`)}</div>`;
  }

  /** the approval head: the target, the full change to be applied (every line that moves, wrapped, the path whole), what it touches, and two
   *  separate judgements: how sure the cause is (the chain's grade) and how well the action itself is founded (a rollback can be sound while the
   *  cause is inferred). A manual action shows the command or request text that is copied.
   *  @param {{target: string[], prod, grade, cause?, change, impact, diff?: {path, before: string[], after: string[]}, command?: string}} p */
  function approvalHead(p) {
    const g = grade(p.grade), c = p.cause ? grade(p.cause) : null;
    return html`<div class="ah"><div class="ah-t">${p.target.join(' / ')}${p.prod ? html`<span class="ah-prod">${L('sim.p.prod')}</span>` : ''}</div>
      ${p.diff ? C.codeBlock.render({ path: p.diff.path, text: [...p.diff.before.map(l => '-' + l), ...p.diff.after.map(l => '+' + l)].join('\n'), diff: true, wrap: true }) : p.command ? C.codeBlock.render({ lang: 'shell', text: p.command, wrap: true }) : html`<div>${p.change}</div>`}
      <div class="ah-g">${c ? C.statusIcon.render({ kind: c.kind, icon: c.icon, text: L('sim.p.cause', { g: c.label }) }) : ''}${C.statusIcon.render({ kind: g.kind, icon: g.icon, text: g.label === L('sim.p.grade.insufficient') ? L('sim.p.act.hold') : L('sim.p.act.grade', { g: g.label }) })}<span>${p.impact}</span></div></div>`;
  }

  /** @param {{reason?: string, reasonAction?, managed?: {text}, link?: {kind: 'incident'|'memory', text, action, arg}}} p  lines appear only when their condition holds */
  function headLines(p) {
    const row = (lead, text, end) => C.settingsRow.render({ lead, title: html`<span>${text}</span>`, control: end });
    const rows = [
      p.reason ? row(C.statusIcon.render({ kind: p.reasonKind ?? 'error', attention: true }), p.reason, p.reasonAction ? C.button.render({ label: p.reasonAction.label, icon: 'clock', variant: 'link', action: p.reasonAction.action, arg: p.reasonAction.arg }) : '') : '',
      p.managed ? row(C.statusIcon.render({ kind: 'idle', icon: 'branch' }), p.managed.text, '') : '',
      ...(p.notes ?? []).map(n => row(C.statusIcon.render({ kind: 'idle', icon: n.icon }), n.text, '')), /* what Wake cannot read or change about it: a neutral line of the same card */
      p.link ? row(C.statusIcon.render({ kind: p.link.kind === 'incident' ? 'busy' : 'warn', icon: p.link.kind === 'incident' ? undefined : 'clock' }), p.link.text, C.button.render({ label: p.link.kind === 'incident' ? L('sim.p.link.incident') : L('sim.p.link.past'), icon: 'arrow-up-right', variant: 'link', action: p.link.action, arg: p.link.arg })) : '',
    ].filter(Boolean);
    return rows.length ? C.settingsGroup.render({ round: true, children: rows }) : '';
  }

  /** kit menu definition */
  const exportMenuDef = action => ({ align: 'end', items: FORMATS.map(([id, name]) => ({ id, label: name, icon: 'download', action, arg: id })) });
  const group = (title, rows) => C.settingsSection.render({ title, children: C.settingsGroup.render({ children: rows }) });
  /** kit dialog definition: what is hidden and where the record stands, before saving
   *  @param {{format, redactions: {label, n}[], basis: {label, value}[], save}} p */
  function exportDialog(p) {
    const name = FORMATS.find(f => f[0] === p.format)?.[1] ?? p.format, total = redactedTotal(p.redactions);
    const row = r => C.settingsRow.render({ title: r.label, control: html`<span class="kd-v">${r.value}</span>` });
    return { title: { raw: L('sim.p.export.title', { name }) }, size: 'md',
      body: html`${group(L('sim.p.export.masked', { n: total }), (p.redactions.length ? p.redactions.map(r => ({ label: r.label, value: L('sim.p.count', { n: r.n }) })) : [{ label: L('sim.p.export.none'), value: '' }]).map(row))}${group(L('sim.p.export.basis'), p.basis.map(row))}`,
      submit: { label: { raw: L('sim.p.export.save') }, action: p.save, arg: p.format } };
  }

  return { reasoningChain, verifyCard, actionCompare, approvalHead, headLines, exportMenuDef, exportDialog, grade };
}
