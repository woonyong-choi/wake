/*
 * Composer: context chip on top (optional), input, bottom row (+ round secondary button | dictate and send round buttons).
 * Buttons are 28 round. Empty: dictate is the filled primary button and there is no send button.
 * With text: dictate turns ghost (muted icon) and a filled send button appears 4 to its right. Dictate puts the focus in the input and
 * asks the host to start the system dictation there (kit.composer.voice). While a reply streams
 * without new text the send button stops it. These swaps are instant (no transition), as measured on the reference.
 * A wide composer with a context chip is always the two-row card: the chip alone on the first row, the input under it.
 * variant 'panel': radius 2xl card with a circular corner (the reference draws this card without the superellipse corner). variant 'wide' (full tab): a one-line pill (44 high, 8 padding, input 12 | 10 padding)
 * that stays a pill while typing and becomes the two-row card once the text needs a second line; it returns to the pill when emptied.
 * lead (an icon name) draws that icon in the round + button (same shape, size and hover) with no + menu; pressing it focuses the input:
 * a query box in the same shell (find, filter), without dictation and without a run button (results follow the text; Enter runs it). In the
 * wide variant it is one line and grows by the lines typed, up to the composer's height limit (--cmp-input-max), then scrolls; the lead icon
 * stays on the left. results (a menu name) makes it a combobox: as the text changes the menu is resolved with { value } and shown
 * under the box without taking focus (arrows move, Enter opens the highlighted row, Esc closes); a definition with pending (a promise)
 * is resolved again once that settles. keep leaves the text in the box after Enter.
 * run (the run button's name) makes it a scope box that runs what it holds: no dictation, the round send button always shows and sends the text
 * as it is (an empty box too, which clears what ran before), and the text stays in the box. tools puts controls (toolbar buttons that open
 * pickers) at the start of the bottom row in place of the + button (on the wide pill: before the input, on one line with it).
 * value is the text a newly drawn box starts with.
 * Enter sends, Shift+Enter adds a line. The input is never re-rendered or re-laid out while an input method is composing
 * (Korean and so on): layout changes wait for compositionend.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { t } from '../core/i18n.js';
import { keyLabel } from '../core/keys.js';
import * as chip from './context-chip.js';

export const name = 'composer';

export const css = `
.cmp { border-radius: var(--r-dialog); corner-shape: var(--corner-round); background: var(--cmp-bg); box-shadow: inset 0 0 0 var(--hairline) var(--ring); padding: var(--cmp-pad-top) var(--space-2) var(--cmp-pad-bottom); transition: box-shadow var(--dur-fast) var(--ease-standard); }
.cmp textarea { display: block; width: 100%; resize: none; background: none; border: 0; outline: 0; color: var(--primary); caret-color: var(--primary); font-family: var(--font-sans); font-size: var(--text-sm); line-height: var(--leading-sm); padding: var(--cmp-input-pt) var(--cmp-input-px) var(--cmp-input-pb); min-height: var(--cmp-input-min); max-height: var(--cmp-input-max); height: var(--cmp-input-h); overflow-y: auto; }
.cmp textarea::placeholder { color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmp textarea:placeholder-shown { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmp-row { display: flex; align-items: center; gap: var(--space-1); margin: 0 var(--cmp-row-mx-end) 0 var(--cmp-row-mx-start); }
.cmp-row .gap { flex: 1; }
.cmp-end { display: flex; align-items: center; gap: var(--space-1); }
.cmp-round, .cmp-voice, .cmp-send { width: var(--cmp-btn); height: var(--cmp-btn); border-radius: var(--r-pill); display: grid; place-items: center; flex-shrink: 0; border: var(--line) solid transparent; }
.cmp-round { background: var(--cmp-round-bg); color: var(--muted-foreground); transition: background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.cmp-round:hover { background: var(--cmp-round-hover); }
.cmp-round[aria-expanded="true"] { background: var(--cmp-round-bg); color: var(--foreground); }
.cmp-voice, .cmp-send { background: var(--send-bg); color: var(--send-fg); transition: opacity var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.cmp-voice:hover, .cmp-send:hover { background: var(--send-bg-hover); }
.cmp-send .wi { width: var(--icon-send); height: var(--icon-send); }
/* with dictation: empty shows only dictate; text (or a running reply) turns dictate ghost and shows send */
.cmp.voice:not(.has-text):not(.busy) .cmp-send { display: none; }
.cmp.has-text .cmp-voice, .cmp.busy .cmp-voice { background: transparent; color: var(--muted-foreground); }
.cmp.has-text .cmp-voice:hover, .cmp.busy .cmp-voice:hover { background: var(--ghost-hover); color: var(--foreground); }
.cmp-send .when-stop, .cmp.busy:not(.has-text) .cmp-send .when-send { display: none; }
.cmp.busy:not(.has-text) .cmp-send .when-stop { display: block; }
.cmp.wide { border-radius: var(--r-pill); display: flex; align-items: center; padding: 0 var(--space-2); min-height: var(--cmp-wide-h); }
.cmp.wide .cmp-row { display: contents; }
.cmp.wide textarea { order: 1; flex: 1; min-width: 0; padding: var(--cmp-wide-input-py) var(--cmp-wide-input-px); min-height: var(--cmp-wide-h); height: var(--cmp-wide-h); }
.cmp.wide .cmp-round { order: 0; }
.cmp.wide .cmp-round, .cmp.wide .cmp-voice, .cmp.wide .cmp-send { width: var(--cmp-wide-btn); height: var(--cmp-wide-btn); }
.cmp.wide .cmp-row .gap { display: none; }
.cmp.wide .cmp-end { order: 2; }
.cmp.wide:not(.multi) textarea { overscroll-behavior: auto; } /* one line never scrolls: a wheel over the pill passes on to the page (a box of several lines keeps its own scroll) */
.cmp.wide:is(.multi, .has-chip) { border-radius: var(--r-dialog); flex-wrap: wrap; padding: var(--space-1); }
.cmp.wide:is(.multi, .has-chip) textarea { flex: 1 0 100%; order: 1; padding: var(--space-2) var(--space-2_5); height: auto; min-height: 0; }
.cmp.wide:is(.multi, .has-chip) .cmp-round { order: 2; margin: 0 0 var(--space-1) var(--space-1); }
.cmp.wide:is(.multi, .has-chip) .cmp-end { order: 3; margin: 0 var(--space-1) var(--space-1) auto; }
.cmp.wide:is(.multi, .has-chip) .cmp-tools { order: 2; margin: 0 0 var(--space-1) var(--space-1); } /* the pickers of a wide scope box: before the input on the pill, on the card's bottom row once the text takes lines */
.cmp.wide.has-chip .chip { order: 0; flex: 0 1 auto; min-width: 0; max-width: 100%; margin: var(--space-1) var(--space-1) 0; } /* the context chip sits alone on the first row of the card */
.cmp.wide.query.multi { flex-wrap: nowrap; align-items: flex-start; padding: 0 var(--space-2); }
.cmp.wide.query.multi textarea { order: 1; flex: 1; padding: var(--cmp-wide-input-py) var(--cmp-wide-input-px); min-height: var(--cmp-wide-h); }
.cmp.wide.query.multi .cmp-round { order: 0; margin: calc((var(--cmp-wide-h) - var(--cmp-wide-btn)) / 2) 0 0; }
.cmp .chip { margin: var(--hairline) 0 var(--space-0_5); }
.cmp-tools { display: flex; align-items: center; gap: var(--space-0_5); min-width: 0; flex-shrink: 0; }
.cmp.run .cmp-row { min-width: 0; }
`;

/**
 * @param {{id: string, variant?: 'panel'|'wide', placeholder: string, chip?: object, busy?: boolean, plusMenu?: string, lead?: string, results?: string, keep?: boolean, run?: string, tools?: any, value?: string}} p
 */
export function render(p) {
  const send = p.run || t('composer.send');
  return html`<div class="${cx('cmp', p.variant === 'wide' && 'wide', p.chip && 'has-chip', p.busy && 'busy', p.lead ? 'query' : p.run ? 'run' : 'voice')}" data-c="composer" data-id="${p.id}"${attrs({ 'data-results': p.results, 'data-keep': p.keep ? '' : null })}>
    ${p.chip ? chip.render({ ...p.chip, removable: true }) : ''}
    <textarea rows="1" placeholder="${p.placeholder}" aria-label="${p.placeholder}"${attrs({ role: p.results ? 'combobox' : null, 'aria-expanded': p.results ? 'false' : null, 'aria-autocomplete': p.results ? 'list' : null })} data-composer-input data-scroll="field" spellcheck="false" autocomplete="off">${p.value ?? ''}</textarea>
    <div class="cmp-row">
      ${p.lead ? html`<button class="cmp-round" tabindex="-1" aria-label="${p.placeholder}" data-composer-focus>${icon(p.lead)}</button>` : p.tools ? html`<span class="cmp-tools">${p.tools}</span>` : html`<button class="cmp-round" aria-label="${t('composer.add')}" data-tip="${t('composer.add')}"${attrs({ 'data-menu': p.plusMenu })}>${icon('plus-medium')}</button>`}
      <span class="gap"></span>
      ${p.lead ? '' : html`<span class="cmp-end">
        ${p.run ? '' : html`<button class="cmp-voice" data-composer-voice aria-label="${t('composer.dictate')}" data-tip="${t('composer.dictate')}">${icon('microphone')}</button>`}
        <button class="cmp-send" data-composer-send data-send="${send}" data-stop="${t('composer.stop')}" data-keys="${keyLabel('enter')}"${attrs(p.busy && !p.value ? { 'aria-label': t('composer.stop'), 'data-tip': t('composer.stop') } : { 'aria-label': send, 'data-tip': send, 'data-tip-keys': keyLabel('enter') })}>${icon('arrow-up', 'md', 'when-send')}${icon('stop', 'xs', 'when-stop')}</button>
      </span>`}
    </div>
  </div>`;
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root;
  /* Height follows the text (up to max-height). The wide pill turns into the card once the text needs a second line */
  const fit = (ta, composing) => {
    const cmp = ta.closest('.cmp');
    cmp.classList.toggle('has-text', ta.value.length > 0);
    /* the button's name follows what it does: stop while an answer runs and nothing is typed, else send (with its key) */
    const b = cmp.querySelector?.('[data-composer-send]');
    if (b?.dataset.stop) {
      const stop = cmp.classList.contains('busy') && !ta.value.length, name = stop ? b.dataset.stop : b.dataset.send;
      b.setAttribute('aria-label', name); b.dataset.tip = name;
      if (stop) b.removeAttribute('data-tip-keys'); else b.dataset.tipKeys = b.dataset.keys;
    }
    if (composing) return;
    const wide = cmp.classList.contains('wide');
    if (wide && !ta.value) { cmp.classList.remove('multi'); ta.style.height = ''; return; }
    if (wide && !cmp.classList.contains('multi')) {
      /* one line of the pill: its line and padding, or the pill's own min-height when that is taller (scrollHeight never reads under it) */
      const cs = getComputedStyle(ta);
      const one = Math.max(parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), parseFloat(cs.minHeight) || 0);
      ta.style.height = 'auto';
      if (ta.scrollHeight > one + 1) cmp.classList.add('multi');
      ta.style.height = '';
      if (!cmp.classList.contains('multi')) return;
    }
    ta.style.height = 'auto';
    const max = parseFloat(getComputedStyle(ta).maxHeight) || 160;
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
  };
  /* combobox: the results menu follows the text; it never takes focus from the box */
  let seq = 0;
  const results = async ta => {
    const cmp = ta.closest('.cmp'), id = cmp?.dataset.results;
    if (!id || !ctx.menu) return;
    const value = ta.value.trim(), n = ++seq;
    if (!value) { ctx.menu.closeCombo?.(cmp); ta.setAttribute('aria-expanded', 'false'); return; }
    const show = def => { if (n !== seq || !def || doc.activeElement !== ta) return; ctx.menu.combo(cmp, { ...def, width: def.width || cmp.offsetWidth }, { onKeep: () => results(ta), onClose: () => ta.setAttribute('aria-expanded', 'false') }); ta.setAttribute('aria-expanded', 'true'); };
    const def = ctx.resolveMenu(id, { value }, cmp);
    show(def);
    if (def?.pending) { await Promise.resolve(def.pending).catch(() => {}); if (n === seq) show(ctx.resolveMenu(id, { value }, cmp)); }
  };
  root.addEventListener('input', e => { if (e.target.matches?.('[data-composer-input]')) { fit(e.target, e.isComposing); results(e.target); } });
  doc.addEventListener('compositionend', e => { if (e.target.matches?.('[data-composer-input]')) fit(e.target, false); }, true);
  const send = cmp => {
    const ta = cmp.querySelector('[data-composer-input]');
    const text = ta.value.trim();
    const run = cmp.classList.contains('run');
    if (!text && !run) { if (cmp.classList.contains('busy')) ctx.emit('kit.composer.stop', { id: cmp.dataset.id }); return; }
    if (!('keep' in cmp.dataset) && !run) { ta.value = ''; fit(ta, false); }
    if (cmp.dataset.results) { seq++; ctx.menu?.closeCombo?.(cmp); ta.setAttribute('aria-expanded', 'false'); }
    ctx.emit('kit.composer.send', { id: cmp.dataset.id, text });
  };
  root.addEventListener('keydown', e => {
    if (!e.target.matches?.('[data-composer-input]') || e.defaultPrevented) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(e.target.closest('.cmp')); }
    /* a closed results list opens again with the arrow keys */
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest('.cmp')?.dataset.results && e.target.getAttribute('aria-expanded') !== 'true' && e.target.value.trim()) { e.preventDefault(); results(e.target); }
  });
  root.addEventListener('click', e => {
    const s = e.target.closest('[data-composer-send]'); if (s) { send(s.closest('.cmp')); return; }
    const f = e.target.closest('[data-composer-focus]'); if (f) f.closest('.cmp').querySelector('[data-composer-input]').focus();
    const v = e.target.closest('[data-composer-voice]'); if (v) { const cmp = v.closest('.cmp'); cmp.querySelector('[data-composer-input]').focus(); ctx.emit('kit.composer.voice', { id: cmp.dataset.id }, { render: false }); }
  });
}

/** Put a text into a composer's input for editing (a sent message taken back): the caret goes to its end and the box grows to fit */
export function fill(doc, id, value) {
  const ta = doc.querySelector(`.cmp[data-id="${id}"] [data-composer-input]`); if (!ta) return;
  ta.value = value; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); ta.setSelectionRange(value.length, value.length);
}
