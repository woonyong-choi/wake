/*
 * Tab preview card (measured on the reference): resting the pointer on a tab row or a pinned tile ([data-preview] holding the tab id)
 * opens a card at the element's right edge, top aligned: the page picture, the tab name, a secondary line and the tab's memory use.
 * It opens after --delay-preview; moving to another tab element while it is open switches at once; leaving closes it at once.
 * The data comes from ctx.resolvePreview(id) -> Promise<{ title, sub?, image?, memory? } | null>; without it the card never opens.
 * The card lies over the tab view, so it asks for the overlay (snapshot in place of the native view) without taking the keyboard.
 */
import { t } from '../core/i18n.js';
import { place } from '../core/position.js';
import { icon } from '../icons/icons.js';

export const name = 'tab-preview';
export const hook = 'data-preview';

export const css = `
.tp { position: fixed; z-index: var(--z-tooltip); width: var(--tp-w); padding: var(--tp-pad); border-radius: var(--r-panel); corner-shape: var(--corner-round); background: var(--tp-bg); box-shadow: inset 0 0 0 var(--hairline) var(--n-palette-ring), var(--shadow-lg); pointer-events: none; font-family: var(--font-native); color: var(--n-label); }
.tp-img { height: var(--tp-img-h); border-radius: var(--r-panel); background: var(--n-bar-hover) center / cover no-repeat; }
.tp-txt { padding: var(--tp-txt-pt) var(--tp-txt-px) var(--tp-txt-pb); }
.tp-title { font-size: var(--text-tp-title); line-height: var(--leading-tp-title); color: var(--n-label-strong); }
.tp-sub { font-size: var(--text-native-sm); line-height: var(--leading-tp-line); color: var(--n-secondary); margin-top: var(--tp-sub-gap); }
.tp-mem { display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-native-sm); line-height: var(--leading-tp-line); color: var(--n-tertiary); margin-top: var(--tp-mem-gap); }
.tp-mem svg { width: var(--tp-mem-icon); height: var(--tp-mem-icon); }
`;

const ms = (doc, name, fallback) => parseFloat(getComputedStyle(doc.documentElement).getPropertyValue(name)) || fallback;
const mb = kb => `${(kb / 1024).toFixed(1)}MB`;

export function attach(root, ctx) {
  const doc = root.ownerDocument || root;
  // current: the tab id under the pointer; a press closes the card and keeps it, so the card comes back only after the pointer leaves
  let timer = null, card = null, current = null, seq = 0;
  const close = (keep = false) => {
    clearTimeout(timer); if (!keep) current = null; seq++;
    if (!card) return;
    card.remove(); card = null;
    ctx.onOverlay?.(false, null, { owner: 'preview' });
  };
  const show = async el => {
    const id = el.dataset.preview, n = ++seq;
    const p = await ctx.resolvePreview?.(id);
    if (n !== seq || !p || !el.isConnected) return;
    const first = !card;
    if (first) { card = doc.createElement('div'); card.className = 'tp'; card.setAttribute('role', 'tooltip'); doc.body.appendChild(card); }
    card.replaceChildren();
    const img = doc.createElement('div'); img.className = 'tp-img'; if (p.image) img.style.backgroundImage = `url("${p.image}")`; else img.hidden = true;
    const txt = doc.createElement('div'); txt.className = 'tp-txt';
    const title = doc.createElement('div'); title.className = 'tp-title trunc'; title.textContent = p.title; txt.appendChild(title);
    if (p.sub) { const sub = doc.createElement('div'); sub.className = 'tp-sub trunc'; sub.textContent = p.sub; txt.appendChild(sub); }
    if (p.memory) { const m = doc.createElement('div'); m.className = 'tp-mem'; m.innerHTML = icon('memory', 'sm').s; m.append(t('tab.memory', { size: mb(p.memory) })); txt.appendChild(m); }
    card.append(img, txt);
    const pos = place(card, el.getBoundingClientRect(), { side: 'right', align: 'start', sideOffset: 0 });
    card.style.left = pos.x + 'px'; card.style.top = pos.y + 'px';
    if (first) ctx.onOverlay?.(true, card, { focus: false, owner: 'preview' });
  };
  root.addEventListener('pointerover', e => {
    const el = e.target.closest?.('[data-preview]');
    if ((el?.dataset.preview ?? null) === current) return;
    clearTimeout(timer);
    if (!el || e.buttons) { close(); return; }
    current = el.dataset.preview;
    if (card) show(el); else timer = setTimeout(() => show(el), ms(doc, '--delay-preview', 600));
  });
  root.addEventListener('pointerout', e => { if (!e.relatedTarget?.closest?.('[data-preview]')) close(); });
  root.addEventListener('pointerdown', () => close(true));
  doc.addEventListener('keydown', () => close(true));
  doc.defaultView.addEventListener('blur', () => close());
}
