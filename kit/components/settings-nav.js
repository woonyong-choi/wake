/*
 * Settings nav: 208 wide (4 top and bottom, 6 left), search field on top, group names (13/450 muted, 12 above), items (height 32, icon 16 + 14/500, 8 | 10 padding), current item on muted background.
 * Hover and current backgrounds change at once, like the reference (measured: no fade).
 * An item may carry a small brand badge ('New') and children: the children list opens under its parent while the parent or a child
 * is current (indented to 32, a 1px rule at 16 behind the icons); a child marked promote shows at the top level while the list is closed.
 * Footer items at the bottom (send feedback, external link). Rendered from the definition.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import * as search from './search-input.js';
import * as badge from './badge.js';

export const name = 'settings-nav';

export const css = `
.snav { width: var(--settings-nav-w); flex-shrink: 0; min-height: 0; padding: var(--snav-pad-y) 0 var(--snav-pad-bottom, var(--snav-pad-y)) var(--snav-pad-start); display: flex; flex-direction: column; font-size: var(--text-sm); }
.snav > .si { flex-shrink: 0; border-radius: var(--r-row-side); corner-shape: var(--corner-round); } /* the nav's search keeps the corner of the nav rows */
/* the search field stays in place; only the list under it scrolls */
.snav-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.snav-list > * { flex-shrink: 0; }
.snav-empty { padding: var(--space-2) var(--snav-g-px); color: var(--muted-foreground); font-size: var(--text-sm); }
.snav-g { margin-top: var(--snav-g-mt); padding: 0 var(--snav-g-px) var(--snav-g-pb); font-family: var(--font-display); font-size: var(--text-snav-g); line-height: var(--leading-snav-g); font-weight: var(--weight-snav-g); color: var(--muted-foreground); }
.snav-i { height: var(--snav-item-h); width: 100%; display: flex; align-items: center; gap: var(--space-1_5); padding: 0 var(--snav-item-pr) 0 var(--snav-item-pl); border: var(--line) solid transparent; border-radius: var(--r-row-side); font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); white-space: nowrap; transition: opacity var(--dur-fast) var(--ease-standard), scale var(--dur-fast) var(--ease-standard); } /* the same row as a sidebar row: same height and corner */
.snav-i:active { scale: var(--press-scale-slight); opacity: var(--press-opacity); }
.snav-i[aria-current="page"] > .wi { color: var(--primary); }
.snav-i:hover { background: var(--n-hover); } /* the nav sits on the window ground beside the side bar: its rows hover and select as side bar rows do, so a hover never looks like a second selection */
.snav-i[aria-current="page"] { background: var(--n-sel); box-shadow: inset 0 0 0 var(--hairline) var(--n-sel-ring), var(--n-sel-shadow); color: var(--foreground); }
.snav-i.has-ext { padding-right: var(--snav-ext-pr); }
.snav-i .ext { margin-left: auto; display: grid; }
.snav .fill { flex: 1; }
.snav-i .badge { margin-left: auto; margin-right: calc(-1 * var(--space-1)); }
.snav-sub { position: relative; display: flex; flex-direction: column; }
.snav-sub::before { content: ""; position: absolute; top: var(--line); bottom: var(--line); left: var(--snav-guide-x); width: var(--line); background: var(--border); pointer-events: none; }
.snav-sub .snav-i { padding-left: var(--snav-sub-pl); }
.snav-sub .snav-i > * { position: relative; }
`;

/**
 * @param {{groups: {label: string, items: {id: string, label: string, icon: string, current?: boolean, activeIcon?: string, action?: string, arg?: any, external?: boolean, badge?: string, children?: object[], promote?: boolean}[]}[], footer?: object[], searchPlaceholder: string}} p
 */
export function render(p) {
  const item = it => html`<button class="${cx('snav-i', it.external && 'has-ext')}"${attrs({ 'data-action': it.action, 'data-arg': it.arg, 'aria-current': it.current ? 'page' : null })}>${icon(it.current && it.activeIcon ? it.activeIcon : it.icon)}<span class="trunc">${it.label}</span>${it.badge ? badge.render({ label: it.badge, tone: 'brand', size: 'sm' }) : ''}${it.external ? html`<span class="ext">${icon('arrow-up-right')}</span>` : ''}</button>`;
  const entry = it => {
    if (!it.children) return item(it);
    const open = p.query || it.current || it.children.some(c => c.current);
    return open ? html`${item({ ...it, current: false, activeIcon: null })}<div class="snav-sub" role="group">${it.children.map(item)}</div>`
      : html`${item(it)}${it.children.filter(c => c.promote).map(item)}`;
  };
  return html`<nav class="snav" data-c="settings-nav">
    ${search.render({ placeholder: p.searchPlaceholder, action: 'kit.settings.search', surface: true, value: p.query || '' })}
    <div class="snav-list" data-scroll="nav">${p.groups.map(g => html`<div class="snav-g">${g.label}</div>${g.items.map(entry)}`)}${p.query && !p.groups.length ? html`<div class="snav-empty">${p.empty || ''}</div>` : ''}
    <div class="fill"></div>
    ${(p.footer || []).map(item)}</div>
  </nav>`;
}
