/*
 * First-run flow (measured on the reference onboarding): one screen over the whole window that the window can be dragged by.
 *   welcome: left 45.5% (min 320) with the brand mark (32 high, its own width, text color), a 36/40 display title in lines and the start button at the bottom
 *            (its content width, 20 sides, at most 320, on the title's left line);
 *            right a picture card (8 around, radius xl, 1px inner ring). Both fade in over 400 ms.
 *   other steps: a centered header (36 sides, 40 bottom, 10 between: 30/32 display title 450, 16/24 muted description 480 whose line is
 *            kept even while it is empty, tracking -0.008em) and the column under it, one block centred in the room above the foot (scrolling when
 *            taller); list steps share one column width (--fr-w-list) and a kept height (--fr-h-list). A footer (20) as wide as the column, Back
 *            on its left edge and Skip + the primary button (trailing arrow at 50%) on its right edge; the last step has the same foot with its
 *            finish button. The step fades in over 200 ms.
 *   progress: dots in the foot for the steps marked progress, the last one too (6, gap 6, the current one 12 wide and primary), none on welcome.
 *   rows with steps (connecting, checking again) show their state at the row end (flow-status), like the connection row.
 *   kinds: 'tiles' (choice cards 144 high, max 176, radius 2xl, 44 icon, check top right; several can be chosen),
 *          'options' (a rounded 2xl group of rows with a radio: one choice), 'switches' (option rows with a switch, and link rows),
 *          'checks' (settings rows that come in one after another while each item is checked, then move into groups with a count; each row
 *                   has the item icon, its name, one line saying what was found (or the cause) and, at the end, a status icon or the row's
 *                   action button; checking one again keeps the row in place with a spinner until its answer; a line with the last check
 *                   time and Check again / Stop; an optional 'add' group of connect rows; rowAction: pressing a row (for example to
 *                   open its steps under it)),
 *          'connect' (labelled groups of connect rows: a row with a form that unfolds under it, or a connection row (conn) with its state, buttons,
 *                   steps and an optional form in its body; in an exclusive group one row is open at a time; a form opens and closes by height and fades its content).
 *   welcome: an optional note line above the start button, and scenes ({ view, caption }: app pictures built from kit parts on a card, a line
 *            or two under it) that slide to the next one in turn and come back to the first without a jump.
 *   done / switches rows: a switch, a select (choices, written at once) or a link; an optional line under them (more).
 * The footer is one set of buttons per step state: a step's buttons (from the app, by its state) or Back, Skip and the primary button.
 * Only a strip along the top (where the window title bar would be) drags the window, so rows hover, scroll and click everywhere else.
 * dock: a slot at the bottom of a step for the terminal panel while a command runs (its children belong to the shell); there the panel is
 *       compact (--dock-run-h, about eight lines) and the header shrinks so the steps above it keep their room.
 * Enter presses the primary button unless the focus is on a field or another control.
 * Actions: kit.firstRun.next | back | skip | finish, kit.firstRun.pick { key, value, multi }, kit.firstRun.switch { arg: key, on },
 *          a link row's own action, kit.firstRun.toggle { row } (unfold a connect row),
 *          kit.firstRun.submit { row } (a connect row form: its fields go to the row's submit action as values, then the fields are emptied),
 *          kit.firstRun.recheck { id? } / kit.firstRun.stop (checks), and a check card's own action,
 *          kit.firstRun.input { row, key, value } (a field changed), kit.firstRun.set { key | row, value } (a select, from the menu kit.firstRun.select),
 *          kit.firstRun.copy { row } (copy the row preview).
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { text } from '../core/text.js';
import * as button from './button.js';
import * as toggle from './switch.js';
import * as badge from './badge.js';
import * as input from './text-input.js';
import * as statusIcon from './status-icon.js';
import * as select from './select.js';
import * as codeBlock from './code-block.js';
import * as settingsGroup from './settings-group.js';
import * as settingsRow from './settings-row.js';
import * as settingsSection from './settings-section.js';
import * as checkbox from './checkbox.js';
import * as field from './field.js';
import * as flowStatus from './flow-status.js';
import * as connectionRow from './connection-row.js';

export const name = 'first-run';

export const css = `
.fr { position: fixed; inset: 0; z-index: var(--z-first-run); display: flex; background: var(--background); color: var(--foreground); font-family: var(--font-sans); overflow: hidden; }
.fr-drag { position: absolute; top: 0; left: 0; right: 0; height: var(--fr-desktop-top); z-index: 1; -webkit-app-region: drag; }
.fr-main { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; animation: fr-in var(--fr-fade) var(--ease-standard) both; }
@keyframes fr-in { from { opacity: 0; } to { opacity: 1; } }
.fr-head { width: 100%; flex-shrink: 0; padding: 0 var(--space-9) var(--space-10); text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--space-2_5); user-select: none; }
.fr-mark { width: var(--fr-mark); height: var(--fr-mark); padding-bottom: var(--space-1); color: var(--fr-mark-color); }
.fr-mark .wi { width: var(--fr-mark); height: var(--fr-mark); }
.fr-title { font-family: var(--font-display); font-size: var(--fr-title); line-height: var(--fr-title-lead); font-weight: var(--weight-display); letter-spacing: var(--fr-track); margin: 0; }
.fr-desc { font-size: var(--text-base); line-height: var(--leading-base); font-weight: var(--fr-desc-weight); letter-spacing: var(--fr-track); color: var(--muted-foreground); text-wrap: balance; margin: 0; min-height: var(--leading-base); }
/* the header and the column are one block in the middle of the room above the foot (scrolling when taller); a list step's column has one width
   on every step and keeps a reserved height, so rows coming in grow into it without moving the header */
.fr-body { width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: safe center; padding: var(--fr-desktop-top) var(--space-10) var(--space-9); overflow-y: auto; }
.fr-col { max-width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
.fr-col.list { width: var(--fr-w-list); min-height: var(--fr-h-list); }
.fr-col .sg-card { margin: 0; }
.fr-foot { position: relative; width: var(--fr-w-list); max-width: calc(100% - 2 * var(--space-5)); flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--space-5) 0; }
.fr-foot-end { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
.fr-next .wi:last-child { opacity: .5; }
.fr-dots { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; }
.fr-dock { width: 100%; flex-shrink: 0; display: flex; flex-direction: column; --dock-h: var(--dock-run-h); }
/* while a command runs in the panel the header gives the body its room (the steps stay readable above the panel) */
.fr-head { transition: padding var(--motion-exit-dur) var(--motion-exit-ease); }
.fr-main:has(.fr-dock .frame-dock.open) .fr-head { padding-bottom: var(--space-4); transition: padding var(--motion-enter-dur) var(--motion-enter-ease); }
.fr-main:has(.fr-dock .frame-dock.open) .fr-col.list { min-height: 0; }
.fr-dots-in { height: var(--space-9); display: flex; align-items: center; gap: var(--space-1_5); }
.fr-dot { width: var(--fr-dot); height: var(--fr-dot); border-radius: var(--r-pill); background: var(--muted); transition: width var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard); }
.fr-dot.on { width: var(--fr-dot-on); background: var(--primary); }
:root[data-theme="light"] .fr-dot:not(.on) { background: color-mix(in oklab, var(--muted-foreground) 35%, transparent); } /* on the white first-run screen the muted fill is not seen */
:root[data-theme="light"] .fr-body .sg-card { border-color: var(--border); } /* the settings card's face is the screen's white: its edge shows it */
.fr-tiles { display: flex; gap: var(--space-3); width: var(--fr-w-tiles); max-width: 100%; justify-content: center; }
.fr-tile { position: relative; height: var(--fr-tile-h); max-width: var(--fr-tile-max); min-width: 0; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-3) var(--space-2) 0; border-radius: var(--r-dialog); corner-shape: var(--corner); background: var(--secondary); transition: background var(--dur-fast) var(--ease-standard); }
.fr-tile:hover { background: var(--accent); }
.fr-tile:focus-visible { outline: none; box-shadow: 0 0 0 var(--focus-w) var(--focus-soft); }

.fr-tile .fr-tile-ic .wi { width: var(--fr-tile-icon); height: var(--fr-tile-icon); }
.fr-tile-lbl { width: 100%; text-align: center; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--primary); }
.fr-tile-sub { width: 100%; margin-top: calc(-1 * var(--space-3)); text-align: center; font-size: var(--text-xs); color: var(--muted-foreground); }
.fr-tile-check { position: absolute; top: var(--space-2_5); right: var(--space-2_5); color: var(--brand); }
.fr-tile-check .wi { width: var(--space-4); height: var(--space-4); }
.fr-welcome { display: flex; width: 100%; height: 100%; animation: fr-in var(--fr-welcome-fade) var(--ease-standard) both; }
.fr-left { width: var(--fr-left); min-width: var(--fr-left-min); display: flex; flex-direction: column; padding: var(--space-6) var(--space-7) var(--space-8); }
.is-desktop .fr-left { padding-top: var(--fr-desktop-top); }
.fr-left .fr-mark { padding: 0; margin-left: calc(-1 * var(--space-1)); color: inherit; width: auto; }
.fr-left .fr-mark .wi { width: auto; }
.fr-hero-title { margin: var(--space-6) 0 0; font-family: var(--font-display); font-size: var(--fr-hero-title); line-height: var(--fr-hero-lead); font-weight: var(--weight-regular); letter-spacing: var(--tracking-tight); }
.fr-left-foot { margin-top: auto; padding-top: var(--space-10); display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); max-width: var(--fr-w-start); }
.fr-left-foot .btn { border-radius: var(--r-panel); padding: 0 var(--space-5); max-width: 100%; }
.fr-right { flex: 1; min-width: 0; padding: var(--space-2); display: flex; }
.fr-hero { flex: 1; border-radius: var(--r-panel); corner-shape: var(--corner); box-shadow: inset 0 0 0 var(--line) var(--fr-hero-ring); background: var(--fr-hero-bg); display: grid; place-items: center; overflow: hidden; color: var(--fr-hero-fg); }
.fr-hero > .wi { width: var(--fr-hero-icon); height: var(--fr-hero-icon); }
@media (prefers-reduced-motion: reduce) { .fr-main, .fr-welcome { animation: none; } }
.fr-note { font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--muted-foreground); margin: 0 0 var(--space-1); }
.fr-scenes { position: relative; width: var(--fr-scene-w); max-width: 86%; overflow: hidden; pointer-events: none; user-select: none; }
.fr-track { display: flex; align-items: stretch; transition: transform var(--fr-scene-in) var(--ease-out-expo); }
.fr-track.jump { transition: none; }
.fr-scene { flex: 0 0 100%; min-width: 0; margin: 0; padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-4); }
.fr-scene-card { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: var(--space-4); border-radius: var(--r-dialog); corner-shape: var(--corner); background: var(--surface-primary); box-shadow: 0 0 0 var(--hairline) var(--border-surface), var(--shadow-md); color: var(--foreground); }
.fr-scene-card > * + * { margin-top: var(--space-3); }
.fr-scene-card > * { flex-shrink: 0; }
.fr-scene-cap { margin: 0; text-align: center; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--muted-foreground); text-wrap: balance; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fr-checks { display: flex; flex-direction: column; gap: var(--space-4); }
.fr-checks-bar { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); font-size: var(--text-xs); color: var(--muted-foreground); min-height: var(--control-h); }
.fr-checks .ss + .ss, .fr-groups .ss + .ss { margin-top: 0; }
.fr-groups { display: flex; flex-direction: column; gap: var(--space-4); }
.fr-form { display: flex; flex-direction: column; gap: var(--space-2); padding-left: calc(var(--space-2_5) + var(--icon-xl) + var(--srow-lead-txt-ml)); }
.fr-line { display: flex; align-items: flex-start; gap: var(--space-2); }
.fr-line > .fld, .fr-line > .inp { flex: 1; min-width: 0; } /* direct children only: a field's own input keeps its height */
.fr-line .slt { flex-shrink: 0; -webkit-app-region: no-drag; }
.fr-line textarea.inp { min-height: var(--fr-check-h); }
.fr-line .btn { flex-shrink: 0; }
.fr-line:has(.fld) > .btn { margin-top: calc(var(--text-sm) + var(--space-2)); } /* beside labelled fields: level with the field, not the label */
.fr-st { display: flex; align-items: center; gap: var(--space-1_5); font-size: var(--text-xs); color: var(--muted-foreground); min-width: 0; }
.fr-line > .fr-st { flex: 1; } /* the status before a line's buttons takes the room: the buttons end on the form's right edge */
.fr-more { margin: 0; text-align: center; font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--muted-foreground); }
@media (prefers-reduced-motion: reduce) { .fr-track { transition: none; } }
`;

const arrow = 'arrow-right';
const nextButton = (label, action, disabled) => html`<span class="fr-next">${button.render({ label, iconEnd: arrow, size: 'lg', action, disabled })}</span>`;

function tiles(s, values) {
  const chosen = values[s.key] || [];
  return html`<div class="fr-tiles">${s.options.map(o => html`<button class="fr-tile" data-c="first-run-tile"${attrs({ 'aria-pressed': String(chosen.includes(o.id)), 'data-action': 'kit.firstRun.pick', 'data-arg': { key: s.key, value: o.id, multi: true } })}>
    ${chosen.includes(o.id) ? html`<span class="fr-tile-check">${icon('circle-check')}</span>` : ''}<span class="fr-tile-ic">${icon(o.icon)}</span><span class="fr-tile-lbl trunc">${o.label}</span>${o.sub ? html`<span class="fr-tile-sub trunc">${o.sub}</span>` : ''}</button>`)}</div>`;
}
const rowDesc = o => o.desc || undefined;
function options(s, values) {
  return settingsGroup.render({ role: 'radiogroup', children: s.options.map(o => settingsRow.render({ icon: o.icon, title: html`${o.label}${o.badge ? badge.render({ label: o.badge, tone: 'brand', size: 'sm' }) : ''}`, description: rowDesc(o),
    action: 'kit.firstRun.pick', arg: { key: s.key, value: o.id }, aria: { role: 'radio', 'aria-checked': String(values[s.key] === o.id) }, control: checkbox.radio({ checked: values[s.key] === o.id }) })) });
}
/* rows of a switches or done step: a switch (key, or key + item of a list), a select (key + choices: written at once) or a link (action) */
function switches(s, values) {
  return settingsGroup.render({ children: s.options.map(o => o.action
    ? settingsRow.render({ icon: o.icon, title: o.label, description: rowDesc(o), action: o.action, arg: o.arg, trail: 'chevron' })
    : settingsRow.render({ icon: o.icon, title: o.label, description: rowDesc(o), control: o.choices ? choiceSelect(o.choices, values[o.key], o.key, o.label)
      : toggle.render({ on: o.item ? (values[o.key] || []).includes(o.item) : !!values[o.key], action: 'kit.firstRun.switch', arg: o.item ? { key: o.key, item: o.item } : o.key, label: o.label, disabled: o.disabled }) })) });
}
/* a select whose list is the kit menu kit.firstRun.select (arg: the setting key, or { row, key } for a connect row field) */
function choiceSelect(choices, value, arg, label, placeholder) {
  const o = choices.find(x => x.id === value), shown = o ? o.label : value || '';
  /* named like a settings select: the row, then the value it holds (B3-12) */
  return select.render({ value: shown || placeholder || '', icon: o?.icon, menu: 'kit.firstRun.select', arg, label: label && shown ? `${label}, ${shown}` : label });
}

/* a check row: the connection row (the same row as Settings and the dashboards): the item icon, its name, one muted line (what was found
   or the cause), a status icon (a spinner while checking) or, for a problem, its status icon and action button; its steps under it */
function checkRow(o, r, i, fresh, flow, rowAction) {
  const busy = !r || r.busy || !!flow?.running;
  return connectionRow.render({ id: o.id, icon: o.icon, title: o.label, description: busy && !(flow && r?.desc) ? (flow?.description || o.checking) : r?.desc || '', kind: r?.kind, busy, attention: !!r?.action,
    action: busy || (flow?.open && flow?.actions?.length) ? null : r?.action, rowAction: !busy && rowAction ? rowAction : undefined, rowArg: { id: o.id }, flow, fresh, i });
}
function checks(s) {
  const c = s.checks || { order: [], results: {}, fresh: [] };
  const items = s.items.filter(o => c.order.includes(o.id));
  const rows = list => settingsGroup.render({ children: list.map((o, i) => checkRow(o, c.results[o.id], i, c.fresh.includes(o.id), s.flows?.[o.id], s.rowAction)) });
  const body = !s.items.length ? '' : c.grouped
    ? s.groups.map(g => { const list = items.filter(o => c.results[o.id]?.group === g.id); return list.length ? html`<div data-bin="${g.id}">${settingsSection.render({ mark: g.mark ? statusIcon.group(g.mark) : '', title: g.label, count: list.length, children: rows(list) })}</div>` : ''; })
    : rows(items);
  const bar = s.items.length ? html`<div class="fr-checks-bar">${c.running
    ? button.render({ label: s.stopLabel, icon: 'circle-x', variant: 'ghost', size: 'xs', action: 'kit.firstRun.stop' })
    : button.render({ label: s.recheckLabel, icon: 'arrow-rotate-clockwise', variant: 'ghost', size: 'xs', action: 'kit.firstRun.recheck' })}</div>` : '';
  return html`<div class="fr-checks">${bar}${body}${s.add ? connectGroups([s.add], s) : ''}</div>`;
}
/* connect rows: the connection row with, in its body, a form: lines of fields (a field with choices is a select; an array is one line;
   each field has its label above, an example as placeholder and an optional hint under it), an optional preview of the values (code,
   with its copy) and the row's buttons at the end of the last line. Field values live in the shell (s.fields) until the row is submitted.
   The steps of its work open under the form. A row without conn opens and closes by pressing it. */
function formOf(r, s) {
  const vals = s.fields?.[r.id] || {}, errs = s.errors?.[r.id] || {};
  const one = f => {
    const ctl = f.choices ? choiceSelect(f.choices, vals[f.key] ?? f.value, { row: r.id, key: f.key }, f.label || f.placeholder, f.placeholder)
      : input.render({ key: f.key, placeholder: f.placeholder, label: f.label || f.placeholder, multiline: f.type === 'textarea', type: f.type === 'password' ? 'password' : 'text', value: vals[f.key] || '', invalid: !!errs[f.key] });
    return f.label ? field.render({ label: f.label, control: ctl, hint: f.hint, lock: f.lock, error: errs[f.key] || '' }) : ctl;
  };
  const buttons = [...(r.foot || []).map(b => button.render({ label: b.label, icon: b.icon, variant: b.variant || 'secondary', size: 'md', action: b.action, arg: b.arg, disabled: b.disabled })),
    r.copy ? button.render({ label: r.copy.label, icon: r.copy.icon || 'copy', variant: 'secondary', size: 'md', action: 'kit.firstRun.copy', arg: { row: r.id }, disabled: !r.copy.ready }) : '',
    r.submit ? button.render({ label: r.submit.label, icon: r.submit.icon, size: 'md', action: 'kit.firstRun.submit', arg: { row: r.id }, disabled: r.submit.disabled }) : ''];
  const lines = r.fields.map(f => [].concat(f)), last = lines.length - 1, unlabelled = Object.values(errs).find(Boolean) && !r.fields.flat().some(f => f.label);
  return html`<div class="fr-form" data-fr-row="${r.id}">${lines.map((l, i) => html`<div class="fr-line">${l.map(one)}${i === last && !r.preview ? buttons : ''}</div>`)}
    ${r.preview ? html`${codeBlock.render({ lang: r.preview.lang, text: r.preview.text, compact: true, actions: false })}<div class="fr-line"><span class="fr-st"></span>${buttons}</div>` : ''}
    ${unlabelled ? html`<span class="fr-st">${statusIcon.render({ kind: 'fix' })}<span class="trunc">${unlabelled}</span></span>` : r.status && !r.flow ? html`<span class="fr-st">${r.status.kind ? statusIcon.render({ kind: r.status.kind }) : ''}<span class="trunc">${r.status.label}</span></span>` : ''}</div>`;
}
function connectRow(r, s) {
  if (r.conn) {
    const c = r.conn;
    return connectionRow.render({ ...c, id: r.id, icon: r.icon, title: html`${r.label}${r.badge ? badge.render({ label: r.badge, tone: 'brand', size: 'sm' }) : ''}`,
      extra: c.extra?.map(b => button.render({ label: b.label, icon: b.icon, variant: b.variant || 'secondary', size: 'sm', action: b.action, arg: b.arg, dialog: b.dialog })), form: c.form && r.fields ? formOf(r, s) : '' });
  }
  /* a row with steps keeps its state at the row end (rolling text, one status icon, a stop's buttons); a stop opens the row on its form */
  const open = (s.open || []).includes(r.id) || flowStatus.problem(r.flow), fl = r.flow && flowStatus.line(r.flow) ? r.flow : null;
  const acts = fl && (flowStatus.problem(fl) || flowStatus.asking(fl)) ? (fl.actions || []).map(a => button.render({ label: text(a.label), icon: a.icon, variant: a.variant || 'secondary', size: 'sm', action: a.action, arg: a.arg })) : '';
  return settingsRow.render({ key: r.id, icon: r.icon, title: html`${r.label}${r.badge ? badge.render({ label: r.badge, tone: 'brand', size: 'sm' }) : ''}`, description: r.desc,
    control: fl ? html`${acts}${flowStatus.line(fl)}${statusIcon.render({ kind: flowStatus.running(fl) ? 'busy' : flowStatus.problem(fl) ? (fl.kind === 'unknown' || !fl.kind ? 'error' : fl.kind) : 'ok' })}`
      : r.status && !open ? html`<span class="fr-st">${r.status.kind ? statusIcon.render({ kind: r.status.kind }) : ''}<span class="trunc">${r.status.label}</span></span>` : '', wideControl: true,
    action: 'kit.firstRun.toggle', arg: { row: r.id }, expand: true, open, body: r.flow ? flowStatus.body(r.flow, formOf(r, s), { said: String(r.desc || '') }) : formOf(r, s) });
}
function connectGroups(groups, s) {
  return html`<div class="fr-groups">${groups.map(g => settingsSection.render({ title: g.label, children: settingsGroup.render({ children: g.rows.map(r => connectRow(r, s)) }) }))}</div>`;
}

/**
 * @param {{step: object, values: object, dots?: {count: number, index: number} | null, mark: string, back?: string, skip?: string, skipTip?: string}} p
 *   step: { id, kind: 'welcome'|'tiles'|'options'|'switches'|'done', title, lines?, description?, mark?, options?, key?, width?, primary, back?: boolean, skip?: boolean, hero?,
 *           state?: string, buttons?: {label, action, disabled?}[] (the footer set for that state), errors?: { [row]: { [field]: message } } }
 */
export function render(p) {
  const s = p.step;
  if (s.kind === 'welcome') {
    /* scenes: cards in a row that slide to the next one; a copy of the first card after the last makes the turn back seamless */
    const sc = s.scenes || [], at = sc.length ? (p.scene || 0) % (sc.length + 1) : 0;
    const hero = sc.length ? html`<div class="fr-scenes"><div class="${cx('fr-track', p.jump && 'jump')}"${attrs({ style: `transform:translateX(${-at * 100}%)` })}>${[...sc, sc[0]].map((x, i) => html`<figure class="fr-scene" data-key="scene-${i}"${attrs({ 'aria-hidden': i === at ? null : 'true' })}><div class="fr-scene-card">${x.view}</div>${x.caption ? html`<figcaption class="fr-scene-cap">${x.caption}</figcaption>` : ''}</figure>`)}</div></div>` : icon(s.hero || p.mark);
    return html`<div class="fr" data-c="first-run" data-step="${s.id}"><div class="fr-welcome" data-key="${s.id}">
    <section class="fr-left"><span class="fr-mark">${icon(p.mark)}</span><h1 class="fr-hero-title">${(s.lines || [s.title]).map((l, i) => html`${i ? html`<br>` : ''}${l}`)}</h1>
      <div class="fr-left-foot">${s.note ? html`<p class="fr-note">${s.note}</p>` : ''}${button.render({ label: s.primary, size: 'lg', action: 'kit.firstRun.next' })}</div></section>
    <div class="fr-right"><div class="fr-hero">${hero}</div></div></div><div class="fr-drag" aria-hidden="true"></div></div>`;
  }
  const body = s.kind === 'checks' ? checks(s) : s.kind === 'connect' ? connectGroups(s.groups, s) : s.kind === 'tiles' ? tiles(s, p.values) : s.kind === 'options' ? options(s, p.values) : (s.kind === 'switches' || (s.kind === 'done' && s.options)) ? switches(s, p.values) : '';
  const last = s.kind === 'done';
  /* list steps (checks, connect rows, options, the last step) share one column width and reserved height; tiles have their own row */
  const list = s.kind === 'checks' || s.kind === 'connect' || s.kind === 'options' || last;
  const dots = p.dots ? html`<div class="fr-dots"><div class="fr-dots-in">${Array.from({ length: p.dots.count }, (_, i) => html`<span class="${cx('fr-dot', i === p.dots.index && 'on')}"></span>`)}</div></div>` : '';
  /* one button set per step state: the app's buttons for this state (the last is the primary one), else Skip and the primary button */
  const end = s.buttons
    ? s.buttons.map((b, i, all) => i === all.length - 1 ? nextButton(b.label, b.action, b.disabled) : button.render({ label: b.label, variant: 'secondary', size: 'lg', action: b.action, disabled: b.disabled }))
    : last ? nextButton(s.primary, 'kit.firstRun.finish')
    : html`${s.skip ? html`<span${attrs({ 'data-tip': s.skipTip })}>${button.render({ label: p.skip, variant: 'secondary', size: 'lg', action: 'kit.firstRun.skip' })}</span>` : ''}${nextButton(s.primary, 'kit.firstRun.next', s.disabled || (s.required && !(p.values[s.key]?.length)))}`;
  /* every step after the welcome, the last one too, has the same foot: Back, the step dots and its buttons (the last one's finishes) */
  const foot = html`<div class="fr-foot">${s.back !== false ? button.render({ label: p.back, icon: 'chevron-left-small', variant: 'secondary', size: 'lg', action: 'kit.firstRun.back' }) : ''}${dots}
      <div class="fr-foot-end" data-foot-state="${s.state || ''}">${end}</div></div>`;
  return html`<div class="fr" data-c="first-run" data-step="${s.id}"><main class="fr-main" data-key="${s.id}">
    <div class="fr-body" data-scroll="y"><header class="fr-head">${s.mark ? html`<span class="fr-mark">${icon(p.mark)}</span>` : ''}<h1 class="fr-title">${s.title}</h1><p class="fr-desc">${s.description || ''}</p></header>
    <div class="${cx('fr-col', list && 'list')}">${body}${s.more ? html`<p class="fr-more">${s.more}</p>` : ''}</div></div>
    ${foot}
    <div class="fr-dock" data-fr-dock data-own-children></div>
  </main><div class="fr-drag" aria-hidden="true"></div></div>`;
}

/* Enter presses the primary button unless a field or another control has the focus */
export function attach(root, ctx) {
  root.addEventListener('keydown', e => {
    const fr = root.querySelector?.('.fr'); if (!fr || e.key !== 'Enter' || e.isComposing || e.defaultPrevented || e.repeat) return;
    const form = e.target.closest?.('[data-fr-row]'); // Enter in a connect row field submits that row (a text area keeps its new line)
    if (form) { if (e.target.tagName === 'INPUT') { e.preventDefault(); form.querySelector('.btn')?.click(); } return; }
    if (e.target.closest?.('input, textarea, select, button, a[href], [contenteditable="true"], [role="button"], [tabindex]:not([tabindex="-1"])')) return;
    const btn = fr.querySelector('.fr-next .btn, .fr-left-foot .btn');
    if (!btn || btn.disabled) return;
    e.preventDefault(); btn.click();
  });
  /* a connect row field: its value goes to the shell (kit.firstRun.input) */
  root.addEventListener('input', e => { const f = e.target.closest?.('[data-fr-row] [data-field]'); if (!f || e.isComposing) return; ctx.emit('kit.firstRun.input', { arg: { row: f.closest('[data-fr-row]').dataset.frRow, key: f.dataset.field, value: f.value } }); });
  root.addEventListener('compositionend', e => { const f = e.target.closest?.('[data-fr-row] [data-field]'); if (f) ctx.emit('kit.firstRun.input', { arg: { row: f.closest('[data-fr-row]').dataset.frRow, key: f.dataset.field, value: f.value } }); });
}

