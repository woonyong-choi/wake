/*
 * Switch: height 20, width 40, fully round. Off is muted, on fades in emerald over 200ms.
 * Thumb: 24x16 white pill, off x=2 / on x=14, moves with a spring.
 * While pressed the thumb grows into a 36x24 glass lens that can be dragged. A drag over 3px settles by release position (20 from center), otherwise it toggles.
 * as 'span' renders only the look, for use inside another button (menu item).
 * text: a short visible name after the switch (a toolbar's on/off option, muted xs); without it the markup is unchanged.
 */
import { html, cx, attrs } from '../core/html.js';

export const name = 'switch';

export const css = `
.sw { position: relative; display: inline-flex; align-items: center; width: var(--switch-w); min-width: var(--switch-w); height: var(--switch-h); border-radius: var(--r-round); background: var(--switch-off); flex-shrink: 0; overflow: visible; touch-action: none; }
.sw::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: var(--switch-on); opacity: 0; transition: opacity var(--dur-switch) var(--ease-standard); }
.sw.on::before { opacity: 1; }
.sw-thumb { position: absolute; top: 0; left: 0; width: var(--switch-thumb-w); height: var(--switch-thumb-h); border-radius: var(--r-round); background: var(--switch-thumb); box-shadow: var(--shadow-sm); transform: translate(var(--switch-off-x), var(--switch-pad)); transition: transform var(--dur-spring-switch) var(--ease-spring-switch), width var(--dur-spring-switch) var(--ease-spring-switch), height var(--dur-spring-switch) var(--ease-spring-switch), background-color var(--dur-spring-switch) var(--ease-spring-switch), box-shadow var(--dur-spring-switch) var(--ease-spring-switch); pointer-events: none; }
.sw.on .sw-thumb { transform: translate(var(--switch-on-x), var(--switch-pad)); }
.sw.pressed .sw-thumb { width: var(--switch-lens-w); height: var(--switch-lens-h); background: var(--switch-lens); box-shadow: var(--switch-lens-ring); -webkit-backdrop-filter: blur(var(--line)); backdrop-filter: blur(var(--line)); transform: translate(calc(var(--lens-x) - var(--switch-lens-w) / 2), calc(-1 * var(--switch-pad))); }
.sw.dragging .sw-thumb { transition-property: width, height, background-color, box-shadow; }
button.sw:disabled { opacity: .5; pointer-events: none; }
.sw-named + .sw-named { margin-inline-start: var(--space-2); }
.sw-named { display: inline-flex; align-items: center; gap: var(--space-1_5); font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; }
`;

/** @param {{on?: boolean, action?: string, arg?: any, label?: string, text?: string, as?: 'span', disabled?: boolean}} p */
export function render(p) {
  if (p.text) return html`<span class="sw-named">${render({ ...p, text: undefined, label: p.label ?? p.text })}<span>${p.text}</span></span>`;
  if (p.as === 'span') return html`<span class="${cx('sw', p.on && 'on')}" data-c="switch" aria-hidden="true"><span class="sw-thumb"></span></span>`;
  return html`<button class="${cx('sw', p.on && 'on')}" role="switch" data-c="switch" aria-checked="${String(!!p.on)}"${attrs({ 'data-switch': p.action, 'data-arg': p.arg, 'aria-label': p.label, disabled: p.disabled })}><span class="sw-thumb"></span></button>`;
}

/* Min and max thumb center (px from the switch's left). Derived from the same geometry as the tokens */
const geometry = b => {
  const cs = getComputedStyle(b);
  const w = parseFloat(cs.getPropertyValue('--switch-w')), tw = parseFloat(cs.getPropertyValue('--switch-thumb-w')), pad = parseFloat(cs.getPropertyValue('--switch-pad'));
  return { min: pad + tw / 2, max: w - pad - tw / 2, mid: w / 2 };
};

export function attach(root, ctx) {
  let press = null;
  const set = (b, on) => {
    b.setAttribute('aria-checked', String(on));
    b.classList.toggle('on', on);
    ctx.emit(b.dataset.switch, { arg: b.dataset.arg ? JSON.parse(b.dataset.arg) : undefined, on }, { render: false });
  };
  root.addEventListener('pointerdown', e => {
    const b = e.target.closest('button.sw[data-switch]');
    if (!b || b.disabled || e.button !== 0) return;
    const g = geometry(b), r = b.getBoundingClientRect();
    const start = b.classList.contains('on') ? g.max : g.min;
    press = { b, g, start, offset: e.clientX - r.left - start, moved: false, x: start, id: e.pointerId };
    b.style.setProperty('--lens-x', start + 'px');
    b.classList.add('pressed');
    b.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.id) return;
    const r = press.b.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left - press.offset, press.g.min), press.g.max);
    if (Math.abs(x - press.start) > 3) { press.moved = true; press.b.classList.add('dragging'); }
    press.x = x;
    press.b.style.setProperty('--lens-x', x + 'px');
  });
  const release = e => {
    if (!press || e.pointerId !== press.id) return;
    const { b, moved, x, g } = press; press = null;
    b.classList.remove('pressed', 'dragging');
    const on = moved ? x >= g.mid : !b.classList.contains('on');
    if (on !== b.classList.contains('on') || !moved) set(b, on);
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', e => { if (press && e.pointerId === press.id) { press.b.classList.remove('pressed', 'dragging'); press = null; } });
  // Keyboard (Space, Enter) arrives as click. Clicks already handled by the pointer have detail >= 1
  root.addEventListener('click', e => {
    const b = e.target.closest('button.sw[data-switch]');
    if (!b || e.detail !== 0) return;
    set(b, !b.classList.contains('on'));
  });
}
