/*
 * Question panel: a small card right above the composer while the AI waits for an answer (one question, numbered options).
 * Measured on the reference: wrapper 16 side inset, 4 top, 8 to the composer; surface fill, 0.5px surface ring, shadow md. The card is a face (--radius-face, round);
 * a code view in its detail keeps a concentric corner (the face radius less the 16 inset), any other face there is flat (the panel owns the face).
 * Title row 16 top / 16 left / 10 right: "Q. question" (14/20 medium). No step counter (progress is never shown as a fraction).
 * Option list 8 sides / 12 top and bottom: rows 32 including their 1px edge (5 vertical, 8 side padding, radius lg), number column 18 (14 medium muted, "1."),
 * label (14 regular). Selected row accent fill, hover ghost fill; both fade over the button transition.
 * Footer 12 sides, 8 top, 14 bottom, 6 gap: pill buttons Cancel (secondary) and Submit (primary), 30 high, at the right; the card is 180 high with two options.
 * footer: false (an approval, whose two choices each carry a key): no footer, the choice itself decides, and each option shows its key at the row end.
 * (Measured on the reference capture at 1.875x: rows 60, buttons 56, card 339 device pixels.)
 * The panel appears and leaves without animation, as on the reference.
 * A pointer press on an option picks it at once (the Submit button is for the keyboard). Keys inside the panel: up and down move the selection
 * (wrapping) and focus the row, Enter submits the selected row, a number key picks that option, Escape cancels, each option's shortcut picks it. mod+enter also works anywhere outside a text field.
 * The panel takes focus when it appears unless a text field holds typed text.
 * Emits kit.question.select { id, index } (no render), kit.question.choose { id, choice }, kit.question.cancel { id }.
 */
import { html, cx, attrs } from '../core/html.js';
import { t } from '../core/i18n.js';
import * as button from './button.js';
import { keyText } from '../core/shortcuts.js';

export const name = 'question-panel';

export const css = `
.qp-wrap { padding: var(--space-1) var(--space-4) var(--space-2); }
.qp { --surface-radius: calc(var(--r-surface) - var(--space-4)); --surface-corner: var(--corner-round); display: flex; flex-direction: column; overflow: hidden; border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--surface-primary); box-shadow: 0 0 0 var(--hairline) var(--border-surface), var(--shadow-md); outline: 0; }
.qp-top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); padding: var(--space-4) var(--space-2_5) 0 var(--space-4); }
.qp-q { margin: 0; min-width: 0; font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-medium); color: var(--primary); overflow-wrap: break-word; }
.qp-detail { display: grid; gap: var(--space-2); min-width: 0; padding: var(--space-3) var(--space-4) 0; }
.qp-list { display: flex; flex-direction: column; max-height: var(--qp-list-max); overflow-y: auto; padding: var(--space-3) var(--space-2); }
.qp-o { flex-shrink: 0; display: flex; align-items: flex-start; gap: var(--space-0_5); width: 100%; min-height: var(--control-h); padding: var(--qp-row-py) var(--space-2); border: var(--line) solid transparent; border-radius: var(--r-control); corner-shape: var(--corner); background-clip: padding-box; font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-regular); text-align: left; color: var(--foreground); transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.qp-o:hover { background-color: var(--ghost-hover); }
.qp-o.is-sel, .qp-o.is-sel:hover { background-color: var(--accent); }
.qp-o:disabled { opacity: .5; pointer-events: none; }
.qp:focus-visible, .qp-o:focus-visible { box-shadow: none; }
.qp-n { display: flex; align-items: center; width: var(--qp-num-w); height: var(--leading-sm); flex-shrink: 0; font-weight: var(--weight-medium); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.qp-l { min-width: 0; overflow-wrap: break-word; }
.qp-k { margin-left: auto; padding-left: var(--space-3); flex-shrink: 0; color: var(--muted-foreground); font-size: var(--text-xs); line-height: var(--leading-sm); font-variant-numeric: tabular-nums; }
.qp[data-bare] .qp-list { padding-bottom: var(--space-2); }
.qp-foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-1_5); padding: var(--qp-foot-pt) var(--space-3) var(--qp-foot-pb); }
.qp-foot .btn { height: var(--qp-btn-h); }
`;

/**
 * @param {{id: string, question: string, detail?: any, options: {id: string, label: string, shortcut?: string}[], selected?: number, submitting?: boolean, footer?: boolean}} p  detail: what the answer acts on, inside the panel under the question
 */
export function render(p) {
  const sel = Math.min(Math.max(p.selected || 0, 0), p.options.length - 1);
  const bare = p.footer === false;
  return html`<div class="qp-wrap"><div class="qp" data-c="question-panel" data-id="${p.id}" role="group" tabindex="-1" aria-labelledby="qp-q-${p.id}"${attrs({ 'aria-busy': p.submitting ? 'true' : null, 'data-bare': bare ? '' : null })}>
    <div class="qp-top"><h3 class="qp-q" id="qp-q-${p.id}">${t('question.prefix')} ${p.question}</h3></div>${p.detail ? html`<div class="qp-detail">${p.detail}</div>` : ''}
    <div class="qp-list" data-scroll="y" role="listbox" aria-labelledby="qp-q-${p.id}">${p.options.map((o, i) => html`<button class="${cx('qp-o', i === sel && 'is-sel')}" role="option" aria-selected="${i === sel ? 'true' : 'false'}" data-choice="${o.id}" data-index="${i}"${attrs({ disabled: p.submitting, 'data-shortcut': o.shortcut })}><span class="qp-n">${i + 1}.</span><span class="qp-l">${o.label}</span>${bare && o.shortcut ? html`<kbd class="qp-k">${keyText(o.shortcut)}</kbd>` : ''}</button>`)}</div>
    ${bare ? '' : html`<div class="qp-foot" data-qp-foot>${button.render({ label: t('question.cancel'), variant: 'secondary', round: true, disabled: p.submitting })}${button.render({ label: t('question.submit'), round: true, disabled: p.submitting })}</div>`}
  </div></div>`;
}

const editable = el => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

export function attach(root, ctx) {
  const doc = root.ownerDocument || root;
  const win = doc.defaultView;
  const rows = qp => [...qp.querySelectorAll('.qp-o')];
  const busy = qp => qp.getAttribute('aria-busy') === 'true';
  const current = qp => Math.max(0, rows(qp).findIndex(r => r.classList.contains('is-sel')));
  const select = (qp, i, focus) => {
    const list = rows(qp); if (!list.length) return;
    const n = (i + list.length) % list.length;
    list.forEach((r, k) => { r.classList.toggle('is-sel', k === n); r.setAttribute('aria-selected', k === n ? 'true' : 'false'); });
    if (focus) { list[n].focus({ preventScroll: true }); list[n].scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    ctx.emit('kit.question.select', { id: qp.dataset.id, index: n }, { render: false });
  };
  const choose = (qp, choice) => { if (!busy(qp) && choice) ctx.emit('kit.question.choose', { id: qp.dataset.id, choice }); };
  const submit = qp => choose(qp, rows(qp)[current(qp)]?.dataset.choice);
  const cancel = qp => { if (!busy(qp)) ctx.emit('kit.question.cancel', { id: qp.dataset.id }); };
  const shortcutOf = (qp, e) => rows(qp).find(r => r.dataset.shortcut && matches(e, r.dataset.shortcut));

  root.addEventListener('keydown', e => {
    const qp = e.target.closest?.('.qp'); if (!qp || e.isComposing || e.keyCode === 229) return;
    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && ['PageDown', 'PageUp', 'End', 'Home'].includes(e.key)) {
      const down = e.key === 'PageDown' || e.key === 'End';
      for (let host = qp.querySelector('.qp-list'); host; host = host.parentElement) {
        if (!/^(auto|scroll)$/.test(win.getComputedStyle(host).overflowY) || host.scrollHeight <= host.clientHeight) continue;
        const canScroll = down ? host.scrollTop + host.clientHeight < host.scrollHeight - 1 : host.scrollTop > 1;
        if (!canScroll) continue;
        const rect = host.getBoundingClientRect();
        let top = Math.max(0, rect.top), bottom = Math.min(win.innerHeight, rect.bottom);
        for (let parent = host.parentElement; parent; parent = parent.parentElement) {
          if (!/^(auto|scroll|hidden|clip)$/.test(win.getComputedStyle(parent).overflowY)) continue;
          const clip = parent.getBoundingClientRect();
          top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
        }
        const scale = rect.height / host.offsetHeight;
        const line = parseFloat(win.getComputedStyle(qp.querySelector('.qp-q')).lineHeight);
        const distance = e.key === 'End' || e.key === 'Home' ? host.scrollHeight : Math.max(line, (bottom - top) / scale - line);
        e.preventDefault(); e.stopPropagation();
        host.scrollBy({ top: down ? distance : -distance, behavior: 'instant' });
        break;
      }
      return;
    }
    const hit = shortcutOf(qp, e);
    if (hit) { e.preventDefault(); e.stopPropagation(); choose(qp, hit.dataset.choice); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); select(qp, current(qp) + (e.key === 'ArrowDown' ? 1 : -1), true); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(qp); return; }
    if (/^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !editable(e.target)) { const r = rows(qp)[+e.key - 1]; if (r && !r.disabled) { e.preventDefault(); e.stopPropagation(); select(qp, +e.key - 1, false); choose(qp, r.dataset.choice); } return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.target.closest('[data-qp-foot]')) { e.preventDefault(); e.stopPropagation(); submit(qp); }
  }, true);
  // mod+enter anywhere in the document outside a text field picks the option bound to it
  win?.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.isComposing || editable(e.target) || !(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
    const qp = doc.querySelector('.qp'); if (!qp) return;
    const hit = shortcutOf(qp, e); if (hit) { e.preventDefault(); choose(qp, hit.dataset.choice); }
  });
  root.addEventListener('click', e => {
    const qp = e.target.closest('.qp'); if (!qp) return;
    const btn = e.target.closest('[data-qp-foot] .btn');
    if (btn) { if (btn.classList.contains('secondary')) cancel(qp); else submit(qp); return; }
    /* a press with the pointer is the choice itself (a click made from the keyboard, detail 0, only selects: Enter or Submit decide) */
    const row = e.target.closest('.qp-o'); if (row) { select(qp, +row.dataset.index, false); if (e.detail > 0) choose(qp, row.dataset.choice); }
  });
  root.addEventListener('focusin', e => { const row = e.target.closest?.('.qp-o'); if (row && !row.classList.contains('is-sel')) select(row.closest('.qp'), +row.dataset.index, false); });
  // a panel that appears takes focus unless a text field holds typed text
  const seen = new WeakSet();
  const claim = () => { for (const qp of root.querySelectorAll('.qp')) { if (seen.has(qp)) continue; seen.add(qp); if (qp.closest('[data-static]')) continue; const a = doc.activeElement; if (!(editable(a) && (a.value || a.textContent))) qp.focus({ preventScroll: true }); } };
  new win.MutationObserver(claim).observe(root, { childList: true, subtree: true });
  claim();
}

/* Shortcut text ('mod+enter', 'escape') against a key event */
function matches(e, keys) {
  const parts = keys.toLowerCase().split('+'); const key = parts.pop();
  if (parts.includes('mod') !== (e.metaKey || e.ctrlKey)) return false;
  if (parts.includes('shift') !== e.shiftKey || parts.includes('alt') !== e.altKey) return false;
  return e.key.toLowerCase() === key;
}
