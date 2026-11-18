/*
 * Path: list of segments. Pressing a segment opens a menu (menu) to switch to a sibling at the same level.
 * The last segment gets a chevron and truncates within the remaining width; when room runs short the earlier segments give way first and the
 * last keeps at least a few letters (never a bare separator at the end).
 */
import { t } from '../core/i18n.js';
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'path-segment-switcher';

export const css = `
.path { display: flex; align-items: center; padding-left: var(--tb-path-pad); min-width: 0; flex: 1; overflow: hidden; }
.seg { height: var(--control-h-xs); padding: 0 var(--space-1_5); display: flex; align-items: center; gap: var(--tb-seg-gap); border-radius: var(--r-control-sm); color: var(--n-tertiary); font-size: var(--text-native); white-space: nowrap; flex-shrink: 8; min-width: 0; }
.seg[data-menu]:hover, .seg[aria-expanded="true"] { background: var(--n-bar-hover); color: var(--n-label); }
.seg.last { flex-shrink: 1; min-width: min-content; max-width: max-content; } .seg.last > .trunc { min-width: calc(var(--control-h-xs) * 1.5); }
.seg .chev { display: grid; opacity: .9; }
.path .sep { color: var(--n-tertiary); display: grid; place-items: center; flex-shrink: 0; }
`;

/**
 * @param {{segments: {label: string, menu?: string, arg?: any}[]}} p
 */
export function render(p) {
  const n = p.segments.length;
  return html`<nav class="path" data-c="path-segment-switcher" aria-label="${t('shell.path.label')}">${p.segments.map((s, i) => html`${i ? html`<span class="sep">${icon('chevron-right-small', 'xs')}</span>` : ''}<button class="${cx('seg', i === n - 1 && 'last')}"${attrs({ 'data-menu': s.menu, 'data-menu-arg': s.arg, 'aria-current': i === n - 1 ? 'page' : null })}><span class="trunc" data-tip="${s.label}" data-tip-overflow>${s.label}</span>${i === n - 1 && s.menu ? html`<span class="chev">${icon('chevron-down-small', 'xs')}</span>` : ''}</button>`)}</nav>`;
}
