/*
 * Connection row: one connection (a server, a tool, an account) as the row primitive (settings-row). The same row everywhere a connection
 * shows (first-run checks and connect rows, Settings, a dashboard's tool list), so every connection looks and moves the same: icon, name,
 * a description line that always says what the thing is (kind · version, an address), and at the end the row's buttons and its status
 * group: the flow's rolling text (flow-status) right before one status icon. The row stays one line: the buttons of a stop or of a
 * question (install, sign in, keep waiting) sit at its end; while it runs, Cancel is a small ghost button that shows only on hover or focus.
 * It opens below only for what the person reads or fills to decide (flow-status body: the value to type, a failure's cause and output).
 * A value the connection needs (a key, a token, a pasted file) is typed in the row's own body, never in a dialog: form as data draws the
 * value line (the fields left, the submit button right); its button or Enter in a field emits submit.action with { arg, values } and
 * empties the fields (the values are secrets: they live only in the keychain).
 */
import { html, attrs } from '../core/html.js';
import { text } from '../core/text.js';
import * as button from './button.js';
import * as statusIcon from './status-icon.js';
import * as settingsRow from './settings-row.js';
import * as flowStatus from './flow-status.js';
import * as input from './text-input.js';
import * as field from './field.js';
import * as iconStack from './icon-stack.js';

export const name = 'connection-row';

export const css = `
.cr-result { display: inline-flex; align-items: center; gap: var(--space-1); flex-shrink: 0; }
.cr-state { font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--muted-foreground); white-space: nowrap; }
.cr-state[data-kind="ok"] { color: var(--success-content); } .cr-state[data-kind="warn"] { color: var(--warning-content); } .cr-state[data-kind="fix"] { color: var(--serious); } .cr-state[data-kind="error"] { color: var(--destructive-content); }
.sr-row .sr-lead:has(> .ist-disc) { width: auto; } /* a brand lead takes its own size */
`;

/**
 * @param {{id: string, icon?: string, tile?: string, brand?: string, title: string, description?: string, statusLabel?: string, state?: string, showState?: boolean, kind: 'ok'|'warn'|'fix'|'error'|'perm'|'unknown'|'busy'|'idle',
 *          busy?: boolean, attention?: boolean, action?: {label, icon?, action, arg?, dialog?, variant?, disabled?}, extra?: any,
 *          rowAction?: string, rowArg?: any, flow?: object | null, form?: any, open?: boolean, fresh?: boolean, i?: number}} p
 *   brand: the product's own mark as the lead, bare at 24 as in a row of connection marks (icon-stack disc, size 'row')
 *   state: the connection state's word ("Connected", "Limited"), shown next to the status icon in the state's word colour (ok green, warn amber,
 *     fix orange, error red, the rest muted) and read with it; showState: false keeps it for assistive tech only. A row whose flow is running shows
 *     the flow's own text instead. statusLabel stays what assistive tech reads when there is no state word.
 *   flow: the flow-status props (its text sits in the status group, its buttons at the row end); form: the value line (a labelled field shows its name above it); open: the body (a form) is shown
 */
/* the value line: fields then the submit button (form data: { fields: [{ key, placeholder?, label?, type?: 'password', multiline? }], submit: { label, action, arg? } }) */
/* a field with a label shows it above the field (the first-run connect form's field), the submit button level with the field */
const formField = x => { const ctl = input.render({ key: x.key, placeholder: x.placeholder, label: x.label || x.placeholder, type: x.type, multiline: x.multiline }); return x.label ? field.render({ label: x.label, control: ctl }) : ctl; };
const formOf = f => html`<div class="fr-form" data-conn-form${attrs({ 'data-submit': f.submit.action, 'data-submit-arg': f.submit.arg })}><div class="fr-line">${f.fields.map(formField)}${button.render({ label: f.submit.label, size: 'md', action: 'kit.conn.submit' })}</div></div>`;

/* the flow's buttons at the row end: a stop's or a question's choices, else while it runs Cancel (ghost, on hover or focus) */
const btn = a => button.render({ label: text(a.label), icon: a.icon, variant: a.variant || 'secondary', size: 'sm', action: a.action, arg: a.arg, dialog: a.dialog, disabled: a.disabled });
export function render(p) {
  const fl = p.flow, stop = flowStatus.problem(fl), run = flowStatus.running(fl), ask = flowStatus.asking(fl);
  const kind = p.busy || run ? 'busy' : p.kind;
  const form = p.form?.fields ? formOf(p.form) : p.form;
  const acts = (stop || ask) && fl.actions?.length ? fl.actions.map(btn) : run && fl.actions?.[0] ? html`<span class="reveal">${btn({ ...fl.actions[0], variant: 'ghost' })}</span>`
    : run && p.action ? html`<span class="reveal">${btn({ ...p.action, variant: 'ghost' })}</span>` : p.action ? btn(p.action) : '';
  const body = fl ? flowStatus.body(fl, form || '', { said: typeof p.description === 'string' ? p.description : String(p.description || '') }) : form || '';
  const word = p.state && p.showState !== false && !(fl && flowStatus.line(fl)) ? html`<span class="cr-state" data-kind="${kind}">${p.state}</span>` : '';
  const status = html`${word}${statusIcon.render({ kind, label: word ? undefined : p.state ?? p.statusLabel ?? (typeof p.description === 'string' ? p.description : ''), attention: !run && !p.busy && !!p.attention })}`;
  /* the row end says one thing: a connection not made yet shows only its connect button (the button already says it is not connected) */
  const only = kind === 'idle' && p.action && !fl && !p.attention;
  const result = only ? acts : kind === 'ok' && p.action
    ? html`<span class="cr-result">${acts}${status}</span>`
    : html`${acts}${fl ? flowStatus.line(fl) : ''}${status}`;
  return settingsRow.render({ c: 'connection-row', key: p.id, icon: p.brand ? undefined : p.icon, tile: p.brand ? undefined : p.tile, lead: p.brand ? iconStack.disc(p.brand, 'row') : undefined, title: p.title, description: p.description, action: p.rowAction, arg: p.rowArg, wideControl: true,
    control: html`${stop ? '' : p.extra || ''}${result}`,
    body, open: !!body && (stop || !!p.open), fresh: p.fresh, i: p.i });
}

/* the value line: its button or Enter in a field sends the values with the row's submit action, then the fields are emptied */
export function attach(root, ctx) {
  const send = form => {
    const fields = [...form.querySelectorAll('[data-field]')], values = Object.fromEntries(fields.map(f => [f.dataset.field, f.value.trim()]));
    if (fields.some(f => !f.value.trim())) { fields.find(f => !f.value.trim()).focus(); return; }
    fields.forEach(f => { f.value = ''; });
    ctx.emit(form.dataset.submit, { arg: form.dataset.submitArg ? JSON.parse(form.dataset.submitArg) : undefined, values });
  };
  root.addEventListener('click', e => { const b = e.target.closest?.('[data-conn-form] [data-action]'), name = b?.dataset.action; if (name === 'kit.conn.submit') { e.stopPropagation(); send(b.closest('[data-conn-form]')); } }, true);
  root.addEventListener('keydown', e => { const f = e.target.closest?.('[data-conn-form] input[data-field]'); if (f && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(f.closest('[data-conn-form]')); } });
}
