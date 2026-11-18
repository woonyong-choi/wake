/*
 * Page header: display title 24/450 (line 32), 24 below. An optional help mark (16, muted) follows the title and shows its text as a tooltip;
 * an optional end slot holds page-level controls and wraps under the title when the pane is too narrow for both. icon puts a 20 muted icon before the title; after is placed right after it (a state badge, a count);
 * size 'sm' is the list title spacing (16 below). context is an optional one-line scope after the title (14 muted, clipped with an ellipsis; the full text shows
 * as a tooltip only when it is actually cut); an empty context draws nothing. sub is the three-slot subtitle after the title (source · scope ·
 * retention: 12 muted, tabular, joined by " · "; empty slots are left out); without sub nothing changes.
 */
import { html } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'page-header';

export const css = `
.ph { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: 0 0 var(--pane-head-gap, var(--space-6)); min-width: 0; }
.ph-title { font-family: var(--font-display); font-size: var(--page-title-size, var(--text-2xl)); line-height: var(--page-title-leading, var(--leading-2xl)); font-weight: var(--weight-display); margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph > .wi { width: var(--icon-xl); height: var(--icon-xl); color: var(--muted-foreground); flex-shrink: 0; }
.ph.sm { margin-bottom: var(--pane-head-gap, var(--space-4)); }
.ph.home { gap: var(--space-2_5); margin-bottom: var(--pane-head-gap, var(--space-5)); }
.ph-ctx { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 1 var(--ph-ctx-min); } /* below its minimum the context goes to the next line instead of shrinking to a sliver */
.ph.ctx .ph-title { flex-shrink: 0; max-width: 70%; }
.ph-help { color: var(--muted-foreground); display: grid; flex-shrink: 0; transition: color var(--dur-fast) var(--ease-standard); }
.ph-help:hover { color: var(--foreground); }
.ph-sub { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; } /* the sub line gives way (one line, cut with its whole value as the tip) before the end slot (search, section tabs) is pushed to a line of its own */
.ph-end { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: safe flex-end; align-items: center; gap: var(--space-2); max-width: 100%; min-width: 0; }
.ph-end > * { min-width: 0; max-width: 100%; } /* a wide end (section tabs) in a narrow pane shrinks inside the head instead of running out past its start */
/* section tabs in the head: they stay on the title's line and take the room left after the icon, the title and the sub line; the tabs
   that do not fit fold into "more" (pill-tabs). The sub line keeps its words and gives way only when the title and it alone fill the line */
.ph:has(> .ph-end > [data-pills-fold]) { flex-wrap: nowrap; }
.ph:has(> .ph-end > [data-pills-fold]) > .ph-sub { flex: 0 1000 auto; } /* the sub line gives way before the title */
.ph-end:has(> [data-pills-fold]) { flex: 1 1 0; flex-wrap: nowrap; min-width: var(--pills-need, 0); } /* the sub line gives way before the chosen section tab is cut: the tab row names the room it needs (the chosen tab and "more") */
.ph-end > [data-pills-fold] { margin: 0; }
`;

/** @param {{title: string, tip?: string, icon?: string, after?: any, help?: string, end?: any, context?: string, sub?: string[], size?: 'sm'|'home'}} p */
export function render(p) {
  const context = (p.context || '').trim(), sub = (Array.isArray(p.sub) ? p.sub : p.sub ? [p.sub] : []).map(x => String(x ?? '').trim()).filter(Boolean).join(' · ');
  return html`<header class="${['ph', p.size, context && 'ctx'].filter(Boolean).join(' ')}" data-c="page-header">${p.icon ? icon(p.icon, 'xl') : ''}<h1 class="ph-title" title="${p.tip ?? p.title}">${p.title}</h1>${p.after || ''}${context ? html`<span class="ph-ctx" data-tip="${context}" data-tip-overflow="">${context}</span>` : ''}${sub ? html`<span class="ph-sub" data-tip="${sub}" data-tip-overflow="">${sub}</span>` : ''}${p.help ? html`<span class="ph-help" role="img" tabindex="0" data-tip="${p.help}" aria-label="${p.help}">${icon('circle-question')}</span>` : ''}${p.end ? html`<div class="ph-end">${p.end}</div>` : ''}</header>`;
}
