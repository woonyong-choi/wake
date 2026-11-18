/* Underline tabs: 14/500 muted, the selected tab is foreground and a 1px underline slides with a spring */
import { html, cx } from '../core/html.js';
import { attachTabs } from '../core/indicator.js';

export const name = 'underline-tabs';

export const css = `
.utabs { display: flex; align-items: center; gap: var(--utab-gap); position: relative; height: var(--utab-h); }
.utab { height: 100%; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); padding: 0 var(--utab-px); transition: color var(--dur-fast) var(--ease-standard); }
.utab:hover, .utab[aria-selected="true"] { color: var(--foreground); }
.utab .n { margin-inline-start: var(--space-1_5); color: var(--muted-foreground); font-variant-numeric: tabular-nums; font-weight: var(--weight-regular); }
/* sm: the tabs of a page body: control height, a hairline under the row, a line under the selected tab; spaced: the page's tab spacing */
.utabs.sm { height: var(--control-h-sm); gap: var(--space-4); min-width: 0; overflow-x: auto; box-shadow: inset 0 calc(-1 * var(--line)) 0 var(--border); }
.utabs.sm .utab { flex-shrink: 0; white-space: nowrap; }
.utabs.sm .utab-ind { bottom: 0; height: var(--tab-line-w); background: var(--foreground); }
.utabs.spaced { margin: var(--pane-tabs-before, var(--space-6)) 0 var(--pane-tabs-after, var(--space-5)); }
.utab-ind { position: absolute; bottom: var(--utab-ind-bottom); height: var(--utab-ind-h); background: var(--indicator); transition: left var(--dur-spring-tab) var(--ease-spring-tab), width var(--dur-spring-tab) var(--ease-spring-tab); }
`;

/** @param {{id: string, tabs: {id: string, label: string, count?: number}[], value: string, action: string, size?: 'sm', spaced?: boolean}} p */
export function render(p) {
  return html`<div class="${cx('utabs', p.size, p.spaced && 'spaced')}" role="tablist" data-c="underline-tabs" data-tabs="${p.id}">${p.tabs.map(tb => html`<button class="utab" role="tab" aria-selected="${String(tb.id === p.value)}" data-action="${p.action}" data-arg="${JSON.stringify(tb.id)}">${tb.label}${tb.count != null ? html`<span class="n">${tb.count}</span>` : ''}</button>`)}<span class="utab-ind" aria-hidden="true"></span></div>`;
}

export function attach(root) { attachTabs(root, '.utabs', '.utab', '.utab-ind'); }
