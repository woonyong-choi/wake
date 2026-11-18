/*
 * Composer toolbar button: ghost pill (fully round), height 24, 12/500 muted, 4 gap, 8 side padding (6 with a leading icon); opens a menu.
 * Hover, focus and open: muted 50% background and foreground text. Every change animates over 150ms (padding included).
 * kind 'model': the right padding is 2 at rest and the down chevron is hidden; on hover, focus or open the padding grows to 8
 *   and the chevron grows in (width 0 -> 14, scale 0 -> 1, 150ms ease-out).
 * kind 'effort': the left padding is 2 at rest and grows to 8; the label box follows a new label's width (300ms).
 * tone 'risky' uses the warning color (risky permission). keys shows a shortcut chip in the tooltip.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'toolbar-button';

export const css = `
.tbb { height: var(--control-h-xs); padding: 0 var(--space-2); display: inline-flex; align-items: center; gap: var(--space-1); border: var(--line) solid transparent; border-radius: var(--r-pill); color: var(--muted-foreground); font-size: var(--text-xs); font-weight: var(--weight-medium); white-space: nowrap; flex-shrink: 0; min-width: 0; transition: background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), padding var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard); }
.tbb:hover, .tbb[aria-expanded="true"] { background: var(--ghost-hover); color: var(--foreground); }
.tbb.risky, .tbb.risky:hover { color: var(--serious); }
.tbb > .wi { width: var(--icon); height: var(--icon); flex-shrink: 0; }
.tbb .chev { display: inline-flex; flex-shrink: 0; color: var(--muted-foreground); opacity: .5; }
.tbb .chev .wi { width: var(--icon-chev); height: var(--icon-chev); }
.tbb .v { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.tbb.shrink { flex-shrink: 1; }
.tbb.lead { padding: 0 var(--space-1_5); }
.tbb.model { padding-right: var(--space-0_5); }
.tbb.model .v { max-width: var(--tbb-model-max); }
.tbb.model .chev { width: 0; margin-left: calc(-1 * var(--space-1)); transition: width var(--dur-fast) var(--ease-out), margin-left var(--dur-fast) var(--ease-out); }
.tbb.model .chev .wi { flex-shrink: 0; scale: 0; transition: scale var(--dur-fast) var(--ease-out); }
.tbb.model:is(:hover, :focus-visible, [aria-expanded="true"]) { padding-right: var(--space-2); }
.tbb.model:is(:hover, :focus-visible, [aria-expanded="true"]) .chev { width: var(--icon-chev); margin-left: 0; }
.tbb.model:is(:hover, :focus-visible, [aria-expanded="true"]) .chev .wi { scale: 1; }
.tbb.effort { padding-left: var(--space-0_5); }
.tbb.effort:is(:hover, :focus-visible, [aria-expanded="true"]) { padding-left: var(--space-2); }
.tbb .fit { display: inline-flex; overflow: hidden; transition: width var(--dur-label-fit) var(--ease-out-expo); }
.tbb .fit > span { display: inline-flex; flex-shrink: 0; white-space: nowrap; }
.tbb.effort .fit > span { opacity: .8; }
`;

/** @param {{icon?: string, label?: string, chevron?: boolean, tone?: 'risky', kind?: 'model'|'effort', menu: string, arg?: any, tip?: string, keys?: string, maxLabel?: string, shrink?: boolean}} p */
export function render(p) {
  const label = p.label ? (p.kind === 'effort' ? html`<span class="fit"><span>${p.label}</span></span>` : html`<span class="v"${attrs({ style: p.maxLabel ? `max-width:${p.maxLabel}` : null })}>${p.label}</span>`) : '';
  return html`<button class="${cx('tbb', p.tone === 'risky' && 'risky', p.shrink && 'shrink', p.icon && !p.kind && 'lead', p.kind)}" data-c="toolbar-button"${attrs({ 'data-menu': p.menu, 'data-menu-arg': p.arg, 'data-tip': p.tip, 'data-tip-keys': p.keys, 'aria-label': p.label ? null : p.tip, 'aria-haspopup': 'menu', 'aria-expanded': 'false' })}>
    ${p.icon ? icon(p.icon) : ''}${label}${p.chevron !== false || p.kind === 'model' ? html`<span class="chev">${icon('chevron-down-small')}</span>` : ''}
  </button>`;
}

/* The effort label box follows its text width so a new label slides to its size */
export function attach(root) {
  const doc = root.ownerDocument || root;
  /* the box width is written in the next frame (once per frame for every label that changed), never inside the observer callback: writing there
     resized the composer row in the same frame and the browser reported a ResizeObserver loop (R5-07) */
  const due = new Set(); let frame = 0;
  const apply = () => {
    frame = 0;
    for (const span of due) {
      const box = span.parentElement; if (!box || !span.isConnected) continue;
      const w = span.offsetWidth + 'px';
      if (!box.style.width) { box.style.transition = 'none'; box.style.width = w; box.getBoundingClientRect(); box.style.transition = ''; }
      else if (box.style.width !== w) box.style.width = w;
    }
    due.clear();
  };
  const ro = new doc.defaultView.ResizeObserver(entries => {
    for (const e of entries) due.add(e.target);
    if (!frame) frame = doc.defaultView.requestAnimationFrame(apply);
  });
  const seen = new WeakSet();
  const scan = () => doc.querySelectorAll('.tbb .fit > span').forEach(s => { if (!seen.has(s)) { seen.add(s); ro.observe(s); } });
  new doc.defaultView.MutationObserver(scan).observe(doc.body, { childList: true, subtree: true });
  scan();
}
