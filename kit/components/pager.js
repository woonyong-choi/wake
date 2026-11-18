/*
 * Pager under a long list: previous and next (secondary, small) on the right, 12 above. Lists show 20 rows a page.
 * range({ page, per, total, action, labels }): the row inside a card under its list: the shown range and the total on the left (muted,
 * tabular), the pager on the right, a hairline above. One page or less draws nothing. labels.range overrides the words ({from}, {to}, {total}).
 */
import { t, formatNumber } from '../core/i18n.js';
import { html } from '../core/html.js';
import * as button from './button.js';

export const name = 'pager';

export const css = `
.pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-1); padding: var(--space-3) var(--space-2) 0; }
.pager-range { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: var(--control-h); padding-block-start: var(--space-3); border-block-start: var(--line) solid var(--border-surface); }
.pager-range > .pager { padding: 0; }
.pager-range-n { min-width: 0; font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
`;

/** @param {{page?: number, pages?: number, action?: string}} p */
export function render(p = {}) {
  const page = p.page || 1, pages = p.pages || 1;
  return html`<nav class="pager" data-c="pager" aria-label="${t('pager.label')}">${button.render({ label: t('pager.prev'), variant: 'secondary', size: 'sm', disabled: page <= 1, action: p.action, arg: page - 1 })}${button.render({ label: t('pager.next'), variant: 'secondary', size: 'sm', disabled: page >= pages, action: p.action, arg: page + 1 })}</nav>`;
}

/** @param {{page?: number, per: number, total: number, action?: string, labels?: {range?: string}}} p */
export function range(p) {
  const per = Math.max(1, p.per || 20), total = Math.max(0, p.total || 0);
  if (total <= per) return '';
  const pages = Math.ceil(total / per), page = Math.min(Math.max(1, p.page || 1), pages);
  const vars = { from: formatNumber((page - 1) * per + 1), to: formatNumber(Math.min(page * per, total)), total: formatNumber(total) };
  const words = p.labels?.range ? p.labels.range.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : t('pager.range', vars);
  return html`<div class="pager-range"><span class="pager-range-n">${words}</span>${render({ page, pages, action: p.action })}</div>`;
}
