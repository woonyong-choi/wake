/*
 * Toast: bottom center, content-width pill card (radius 3xl, popover background, border, large shadow).
 * Title 14/500 + secondary 12 muted, leading status icon (success emerald, error rose, warning amber).
 * Closes after 3 s, pauses on hover. Enters sliding up from the bottom over 400ms; several stack behind, peeking above (max 3).
 * At the bottom it never covers the top bar or a page header's words.
 * Pressing the card runs card.action and closes it.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'toast';

export const css = `
.toasts { position: fixed; bottom: var(--toast-offset); left: var(--toast-x, 50%); z-index: var(--z-toast); width: 0; height: 0; }
.toast { position: absolute; bottom: 0; left: 0; width: max-content; max-width: min(var(--toast-max-w), calc(100vw - var(--space-4) * 2)); padding: var(--space-2) var(--space-5); display: flex; align-items: center; gap: var(--space-2); border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--popover); color: var(--foreground); border: var(--line) solid var(--border); box-shadow: var(--shadow-xl); font-family: var(--font-display); transform: translate(-50%, var(--y, 0)) scale(var(--s, 1)); opacity: var(--o, 1); transition: transform var(--dur-toast) var(--ease-toast), opacity var(--dur-toast) var(--ease-toast); cursor: default; }
.toast > .wi { flex-shrink: 0; }
.toast .t-content { min-width: 0; overflow-wrap: anywhere; }
.toast[data-stacked] { pointer-events: none; }
.toast[data-stacked] > * { visibility: hidden; }
.toast.entering { --y: 100%; --o: 0; }
.toast.leaving { --y: 100%; --o: 0; }
.toast .t-title { font-size: var(--text-sm); font-weight: var(--weight-medium); line-height: var(--leading-sm); }
.toast .t-body { font-size: var(--text-xs); color: var(--muted-foreground); line-height: var(--leading-xs); }
.toast .ok { color: var(--toast-success); } .toast .error { color: var(--toast-error); } .toast .warn { color: var(--toast-warning); }
`;

const TONE_ICON = { ok: 'circle-check', error: 'circle-x', warn: 'exclamation-triangle' };

/** @param {{title: string, body?: string, tone?: 'ok'|'error'|'warn', id?: string}} p */
export function render(p) {
  return html`<div class="${cx('toast')}" role="status" data-c="toast"${attrs({ 'data-id': p.id })}>${p.tone ? icon(TONE_ICON[p.tone], 'md', p.tone) : ''}<div class="t-content"><div class="t-title">${p.title}</div>${p.body ? html`<div class="t-body">${p.body}</div>` : ''}</div></div>`;
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root;
  let host = null;
  const list = [];
  const cssMs = n => parseFloat(getComputedStyle(doc.documentElement).getPropertyValue(n));
  const layout = () => list.forEach((it, i) => {
    const k = list.length - 1 - i;            // 0 = front (most recent)
    it.el.style.zIndex = String(100 - k);
    it.el.toggleAttribute('data-stacked', k > 0);
    it.el.setAttribute('aria-hidden', String(k > 0));
    if (!it.el.classList.contains('leaving') && !it.el.classList.contains('entering')) {
      it.el.style.setProperty('--y', `${-k * cssMs('--toast-stack-y')}px`);
      it.el.style.setProperty('--s', String(1 - k * .05));
      it.el.style.setProperty('--o', k > 2 ? '0' : '1');
    }
  });
  function dismiss(it) {
    const i = list.indexOf(it); if (i < 0) return;
    clearTimeout(it.timer);
    it.el.classList.add('leaving');
    list.splice(i, 1);
    setTimeout(() => {
      it.el.remove();
      if (!host.childElementCount) ctx.onOverlay?.(false, null, { focus: false, owner: 'toast' });
    }, cssMs('--dur-toast'));
    layout();
  }
  async function show(p) {
    await ctx.onOverlay?.(true, null, { focus: false, owner: 'toast' });
    if (!host) { host = doc.createElement('div'); host.className = 'toasts'; host.setAttribute('aria-live', 'polite'); doc.body.appendChild(host); }
    const wrap = doc.createElement('div'); wrap.innerHTML = render(p).s;
    const el = wrap.firstElementChild; el.classList.add('entering'); host.appendChild(el);
    const it = { el, p, left: cssMs('--toast-duration'), started: performance.now() };
    list.push(it);
    el.getBoundingClientRect();
    el.classList.remove('entering');
    layout();
    const arm = () => { it.started = performance.now(); it.timer = setTimeout(() => dismiss(it), it.left); };
    arm();
    el.addEventListener('mouseenter', () => { clearTimeout(it.timer); it.left -= performance.now() - it.started; });
    el.addEventListener('mouseleave', arm);
    el.addEventListener('click', () => { dismiss(it); if (p.action) ctx.emit(p.action, { arg: p.arg }); });
  }
  return { show };
}
