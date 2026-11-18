/*
 * Dialog (inside the page document): a centered panel over a 15% black scrim with a light backdrop blur.
 * Panel: popover fill, glass ring, radius 2xl, 24 x 20 inside, shadow 2xl, close button (top right, 50% muted).
 * Head: display 18/500 title and a 14 muted description. Footer on the right: Cancel (secondary) and the primary button
 * (default, or destructive for a destructive action), 4 apart.
 * Motion: scrim fades and the panel fades and scales from .95 over the menu duration, both ways.
 *
 * Definition: { title, description?, size?: 'sm'|'md'|'lg'|'xl', layout?: 'stack'|'grid', fields?: Field[], body?: html,
 *               submit: { label, action, arg?, variant?, kbd? } | null (a read-only dialog: one close button, no submit), extra?: [{ label, action, arg?, icon?, variant?, disabled?, tip? }] (more buttons before Cancel: each closes the dialog and emits its action), cancel?: label, cancelKbd?: string, icon?: string, onCancel?: action | { action, arg } }
 * icon: a confirmation (measured on the reference quit question): a 40 icon tile above the title, no close button, a stronger scrim,
 *       24 around the buttons, key hint chips in the buttons, Cancel at least 100 wide. onCancel is emitted when it closes without submit.
 * Field: { key, label, type: 'text'|'password'|'textarea'|'code'|'select'|'switch', placeholder?, value?, required?, options? (select), hint? (where the value comes from), lock? (a secret: where it is kept),
 *          json? (code: must parse as JSON), validate?(value) -> error text | null }
 *      | { type: 'rows', fields: Field[] }  (property rows in a bordered card)
 *      | { type: 'advanced', label, style?: 'caret'|'chevron', fields: Field[] }
 * Text values may be dictionary keys or { raw }.
 * The primary button stays disabled while a required field is empty; a required field emptied after typing, or left empty (pressing the disabled button leaves it), shows its error at once. Submitting runs the checks; a failing field gets aria-invalid
 * and one error line, otherwise the dialog closes and emits submit.action with { arg, values }.
 *
 * Wiring: an element with [data-dialog="id"] (and data-dialog-arg) opens ctx.resolveDialog(id, arg); the kit action
 * 'kit.dialog.open' with arg { id, arg } does the same (from a menu item). Escape, the scrim, the close button and Cancel close it
 * and return focus to the opener; Tab stays inside the panel.
 */
import { t } from '../core/i18n.js';
import { text } from '../core/text.js';
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import * as button from './button.js';
import * as field from './field.js';
import * as input from './text-input.js';
import * as select from './select.js';
import * as toggle from './switch.js';
import * as disclosure from './disclosure.js';
import { morph } from '../core/morph.js';

export const name = 'dialog';

export const css = `
.dlg-layer { position: fixed; inset: 0; z-index: var(--z-dialog); display: grid; place-items: center; padding: var(--space-4); }
.dlg-scrim { position: absolute; inset: 0; background: var(--scrim); -webkit-backdrop-filter: blur(var(--blur-scrim)); backdrop-filter: blur(var(--blur-scrim)); }
.dlg { position: relative; width: 100%; max-width: var(--dialog-w-sm); max-height: calc(100vh - 2 * var(--space-4)); display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-5) var(--space-6); border-radius: var(--r-dialog); corner-shape: var(--corner); background: var(--popover); color: var(--foreground); box-shadow: inset 0 0 0 var(--line) var(--glass-ring-inner), 0 0 0 var(--hairline) var(--glass-ring-outer), var(--shadow-2xl); font-size: var(--text-sm); outline: none; }
.dlg.md { max-width: var(--dialog-w-md); }
.dlg.lg { max-width: var(--dialog-w-lg); }
.dlg.xl { max-width: var(--dialog-w-xl); }
.dlg-layer[data-state="open"] .dlg-scrim { animation: dlg-fade var(--dur-menu) var(--ease-enter) both; }
.dlg-layer[data-state="open"] .dlg { animation: dlg-in var(--dur-menu) var(--ease-enter) both; }
.dlg-layer[data-state="closed"] { pointer-events: none; }
.dlg-layer[data-state="closed"] .dlg-scrim { animation: dlg-fade var(--dur-menu) var(--ease-enter) reverse both; }
.dlg-layer[data-state="closed"] .dlg { animation: dlg-in var(--dur-menu) var(--ease-enter) reverse both; }
.dlg-layer.static { position: relative; inset: auto; z-index: auto; display: block; padding: 0; }
.dlg-layer.static .dlg { animation: none; }
@keyframes dlg-fade { from { opacity: 0; } }
@keyframes dlg-in { from { opacity: 0; transform: scale(var(--enter-scale)); } }
.dlg-x { position: absolute; top: var(--space-2); right: var(--space-2); width: var(--control-h-xs); height: var(--control-h-xs); display: grid; place-items: center; border-radius: var(--r-pill); color: var(--muted-foreground); opacity: .5; transition: opacity var(--dur-fast) var(--ease-standard); }
.dlg-x:hover { opacity: 1; }
.dlg-head { display: flex; flex-direction: column; gap: var(--space-0_5); padding-right: var(--space-4); word-break: keep-all; overflow-wrap: break-word; }
.dlg-title { margin: 0; font-family: var(--font-display); font-size: var(--dlg-title-size, var(--text-lg)); line-height: var(--leading-snug); font-weight: var(--weight-medium); }
.dlg-desc { margin: 0; color: var(--muted-foreground); }
.dlg-body { min-height: 0; overflow-y: auto; margin: 0 calc(-1 * var(--space-1)); padding: var(--space-1); }
.dlg-extra:first-child { margin-right: auto; }
.dlg-foot { display: flex; justify-content: flex-end; gap: var(--space-1); margin: 0 calc(-1 * var(--space-5)) calc(-1 * var(--space-5)); padding: var(--space-4); }
.dlg-layer.confirm .dlg-scrim { background: var(--scrim-strong); -webkit-backdrop-filter: none; backdrop-filter: none; }
.dlg.confirm { padding: var(--space-5) var(--space-6) var(--space-6); background: var(--dlg-confirm-bg); }
.dlg.confirm .dlg-head { padding-right: 0; }
.dlg.confirm .dlg-foot { margin: var(--space-2) 0 0; padding: 0; gap: var(--space-2); }
.dlg.confirm .dlg-foot .btn.secondary { min-width: var(--dlg-cancel-min-w); background: var(--dlg-cancel-bg); }
.dlg-tile { width: var(--space-10); height: var(--space-10); border-radius: var(--r-control); corner-shape: var(--corner); display: grid; place-items: center; background: var(--dlg-tile-bg); color: var(--foreground); }
.dlg-tile .wi { width: var(--icon-xl); height: var(--icon-xl); }
`;

const valueOf = f => f.value ?? (f.type === 'switch' ? false : '');
const flat = fields => (fields || []).flatMap(f => f.fields ? flat(f.fields) : [f]);

/** Field markup @param {object} f @param {object} st { values, errors } @param {string} layout */
function fieldHtml(f, st, layout) {
  if (f.type === 'rows') return field.rows({ children: f.fields.map(x => fieldHtml(x, st, 'row')) });
  if (f.type === 'advanced') return disclosure.render({ label: text(f.label), style: f.style, open: st.open?.includes(text(f.label)), children: field.stack({ children: f.fields.map(x => fieldHtml(x, st, layout)) }) });
  const v = st.values[f.key], id = `dlg-f-${f.key}`, invalid = !!st.errors[f.key];
  let control;
  if (f.type === 'select') { const o = f.options.find(x => x.id === v); control = select.render({ value: o ? text(o.label) : text(f.placeholder), icon: o?.icon, menu: 'kit.dialog.select', arg: f.key, variant: layout === 'row' ? 'ghost' : undefined, placeholder: !o, block: layout !== 'row' }); }
  else if (f.type === 'switch') control = toggle.render({ on: !!v, action: 'kit.dialog.switch', arg: f.key, label: text(f.label) });
  else control = input.render({ key: f.key, id, value: v, placeholder: f.placeholder ? text(f.placeholder) : undefined, multiline: f.type === 'textarea', code: f.type === 'code', type: f.type === 'password' ? 'password' : undefined, invalid });
  return field.render({ label: text(f.label), control, required: f.required, error: st.errors[f.key] || '', hint: f.hint ? text(f.hint) : '', lock: f.lock ? text(f.lock) : '', layout, key: f.key, id });
}

/** @param {object} def dialog definition @param {{values: object, errors: object}} st  @param {{static?: boolean}} o static draws the panel in place (gallery) */
export function render(def, st = { values: {}, errors: {} }, o = {}) {
  st = { values: { ...Object.fromEntries(flat(def.fields).map(f => [f.key, valueOf(f)])), ...st.values }, errors: st.errors || {}, open: st.open || [] };
  const layout = def.layout || 'stack';
  const missing = flat(def.fields).some(f => f.required && !String(st.values[f.key] ?? '').trim());
  return html`<div class="${cx('dlg-layer', o.static && 'static', def.icon && 'confirm')}" data-c="dialog"${o.static ? '' : html` data-state="open"`}>
    ${o.static ? '' : html`<div class="dlg-scrim" data-dialog-close></div>`}
    <div class="${cx('dlg', def.size && def.size !== 'sm' && def.size, def.icon && 'confirm')}" role="dialog"${o.static ? '' : html` aria-modal="true" aria-labelledby="dlg-title"`} tabindex="-1">
      ${def.icon ? html`<span class="dlg-tile">${icon(def.icon)}</span>` : html`<button type="button" class="dlg-x" data-dialog-close aria-label="${t('dialog.close')}">${icon('circle-x')}</button>`}
      <div class="dlg-head"><h2 class="dlg-title"${o.static ? '' : html` id="dlg-title"`}>${text(def.title)}</h2>${def.description ? html`<p class="dlg-desc">${text(def.description)}</p>` : ''}</div>
      ${def.fields?.length || def.body ? html`<form class="dlg-body" data-scroll="dialog" novalidate>${def.body || ''}${def.fields?.length ? field.stack({ children: def.fields.map(f => fieldHtml(f, st, layout)) }) : ''}</form>` : ''}
      <div class="dlg-foot">${(def.extra || []).map(b => html`<span class="dlg-extra">${button.render({ label: text(b.label), icon: b.icon, variant: b.variant || 'ghost', action: b.action, arg: b.arg, disabled: b.disabled, tip: b.tip ? text(b.tip) : undefined })}</span>`)}${def.submit ? html`${button.render({ label: def.cancel ? text(def.cancel) : t('dialog.cancel'), variant: 'secondary', action: 'kit.dialog.cancel', kbd: def.cancelKbd })}${button.render({ label: text(def.submit.label), variant: def.submit.variant || 'default', action: 'kit.dialog.submit', disabled: missing, kbd: def.submit.kbd })}` : button.render({ label: def.cancel ? text(def.cancel) : t('dialog.close'), variant: 'secondary', action: 'kit.dialog.cancel', kbd: def.cancelKbd })}</div>
    </div>
  </div>`;
}
/** Options menu of a select field (a select list, same as everywhere) */
function selectMenu(def, st, key) {
  const f = flat(def.fields).find(x => x.key === key);
  return select.menuDef({ options: f.options.map(o => ({ ...o, label: text(o.label) })), value: st.values[key], action: 'kit.dialog.select', key });
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root;
  let cur = null; // { def, st, el, trigger, arg }
  const values = () => {
    for (const el of cur.el.querySelectorAll('[data-field]')) cur.st.values[el.dataset.field] = el.value;
    return cur.st.values;
  };
  /* Redraw in place: elements stay (focus, caret, open disclosures, switch motion) */
  const redraw = () => {
    values();
    cur.st.open = [...cur.el.querySelectorAll('[data-dsc][aria-expanded="true"]')].map(b => b.textContent.trim());
    const wrap = doc.createElement('div'); wrap.innerHTML = render(cur.def, cur.st).s;
    morph(cur.el.querySelector('.dlg'), wrap.querySelector('.dlg').innerHTML);
  };
  const updateSubmit = () => {
    const missing = flat(cur.def.fields).some(f => f.required && !String(values()[f.key] ?? '').trim());
    const b = cur.el.querySelector('[data-action="kit.dialog.submit"]'); if (b) b.disabled = missing;
  };
  function open(def, trigger, arg) {
    if (!def) return;
    if (cur) close(false);
    const st = { values: Object.fromEntries(flat(def.fields).map(f => [f.key, valueOf(f)])), errors: {} };
    const wrap = doc.createElement('div'); wrap.innerHTML = render(def, st).s;
    const el = wrap.firstElementChild; doc.body.appendChild(el);
    cur = { def, st, el, trigger: trigger || doc.activeElement, arg };
    ctx.onOverlay?.(true, el, { owner: 'dialog' });
    /* a destructive action never starts focused: Enter right after opening cancels (B3-03) */
    const foot = def.submit?.variant === 'destructive' ? '.dlg-foot [data-action="kit.dialog.cancel"]' : '.dlg-foot .btn:last-child:not(:disabled)';
    const first = el.querySelector('[data-field], .dlg-body [data-menu], .dlg-body button.sw') || el.querySelector(foot) || el.querySelector('.dlg');
    /* the first control shows the focus ring from the moment the dialog opens (from a menu or the app, no key pressed in this document) and
       keeps it while the window is in the background (a window going inactive blurs it but focus comes back to it); it goes once focus
       moves to another control in this document */
    if (first.matches('.btn')) {
      first.setAttribute('data-focus-visible', '');
      const off = () => { if (!doc.hasFocus()) return; first.removeAttribute('data-focus-visible'); first.removeEventListener('blur', off); };
      first.addEventListener('blur', off);
    }
    first.focus({ preventScroll: true });
    if (first.matches('input[data-field]')) first.select(); // a text box starts with its value selected (measured)
  }
  function close(returnFocus = true, submitted = false) {
    if (!cur) return;
    const { el, trigger, def } = cur; cur = null;
    if (!submitted && def.onCancel) ctx.emit(def.onCancel.action || def.onCancel, { arg: def.onCancel.arg });
    el.dataset.state = 'closed';
    const ms = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--dur-menu')) || 0;
    setTimeout(() => el.remove(), ms);
    ctx.onOverlay?.(false, null, { owner: 'dialog' });
    if (returnFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
  function submit() {
    const v = values(), errors = {};
    for (const f of flat(cur.def.fields)) {
      const s = String(v[f.key] ?? '');
      if (f.required && !s.trim()) { errors[f.key] = t('dialog.required'); continue; }
      if (f.json && s.trim()) { try { JSON.parse(s); } catch (e) { errors[f.key] = t('dialog.json', { message: e.message }); continue; } }
      const msg = f.validate?.(v[f.key], v); if (msg) errors[f.key] = text(msg);
    }
    cur.st.errors = errors;
    if (Object.keys(errors).length) { redraw(); cur.el.querySelector('[aria-invalid="true"]')?.focus(); return; }
    const { def, arg } = cur;
    if (!def.submit) { close(); return; } /* a read-only dialog: Enter closes it */
    close(true, true);
    ctx.emit(def.submit.action, { arg: def.submit.arg ?? arg, values: v });
  }
  /* kit.dialog.* actions arrive here first (see attachAll) */
  function handle(name, payload) {
    if (name === 'kit.dialog.open') { open(ctx.resolveDialog?.(payload.arg.id, payload.arg.arg, payload.trigger), payload.trigger, payload.arg.arg); return true; }
    if (!cur) return false;
    if (name === 'kit.dialog.select') { cur.st.values[payload.arg.key] = payload.arg.value; redraw(); updateSubmit(); return true; }
    if (name === 'kit.dialog.switch') { cur.st.values[payload.arg] = payload.on; return true; }
    if (name === 'kit.dialog.cancel') { close(); return true; }
    if (name === 'kit.dialog.submit') { submit(); return true; }
    return false;
  }
  doc.addEventListener('click', e => {
    const opener = e.target.closest('[data-dialog]');
    if (opener && !cur) { const a = opener.dataset.dialogArg ? JSON.parse(opener.dataset.dialogArg) : undefined; open(ctx.resolveDialog?.(opener.dataset.dialog, a, opener), opener, a); return; }
    if (!cur || !cur.el.contains(e.target)) return;
    if (e.target.closest('[data-dialog-close]')) { close(); return; }
    const b = e.target.closest('.dlg-foot [data-action]');
    if (b && !b.disabled && b.closest('.dlg-extra')) { const arg = b.dataset.arg ? JSON.parse(b.dataset.arg) : undefined; close(); ctx.emit(b.dataset.action, { arg }); return; }
    if (b && !b.disabled) handle(b.dataset.action, {});
  });
  /* typing clears a field's error; a required field typed in and emptied again shows its required error (the disabled submit alone says nothing) */
  doc.addEventListener('input', e => {
    if (!cur || !cur.el.contains(e.target) || !e.target.dataset.field) return;
    const key = e.target.dataset.field;
    if (flat(cur.def.fields).find(f => f.key === key)?.required && !e.target.value.trim()) { cur.st.errors[key] = t('dialog.required'); redraw(); }
    else if (cur.st.errors[key]) { delete cur.st.errors[key]; e.target.removeAttribute('aria-invalid'); e.target.closest('.fld')?.querySelector('.fld-err')?.replaceChildren(); }
    updateSubmit();
  });
  /* leaving an empty required field (pressing the disabled submit does so) shows its error; leaving for Cancel or close says nothing */
  doc.addEventListener('focusout', e => {
    if (!cur || !cur.el.contains(e.target) || !e.target.dataset?.field || e.relatedTarget?.closest?.('[data-action="kit.dialog.cancel"], [data-dialog-close]')) return;
    const key = e.target.dataset.field;
    if (flat(cur.def.fields).find(f => f.key === key)?.required && !String(e.target.value ?? '').trim() && !cur.st.errors[key]) { cur.st.errors[key] = t('dialog.required'); redraw(); }
  });
  doc.addEventListener('keydown', e => {
    if (!cur || doc.querySelector('.menu[data-state="open"], .menu[data-state="idle"]')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const list = [...cur.el.querySelectorAll('button:not(:disabled), [data-field], [tabindex="0"]')].filter(x => x.offsetParent !== null);
      if (!list.length) return;
      const i = list.indexOf(doc.activeElement);
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i === list.length - 1 ? 0 : i + 1);
      e.preventDefault(); list[next].focus();
    }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && cur.el.contains(e.target)) { e.preventDefault(); submit(); }
  }, true);
  return { open, close, handle, menu: key => cur ? selectMenu(cur.def, cur.st, key) : null };
}
