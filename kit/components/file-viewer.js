/*
 * File viewer: two panes, the tree on the left (fixed width, right rule) and the open file on the right.
 * The file pane has a 48 high header with a bottom rule: the path (muted segments, a chevron between, the file name with its icon),
 * then on the right the modified time (12, muted, clock icon) and actions. Below it the file body scrolls with the display title.
 */
import { html, cx } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'file-viewer';

export const css = `
.fv { display: flex; height: 100%; min-height: 0; }
.fv-tree { width: var(--fv-tree-w); flex-shrink: 0; border-right: var(--line) solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.fv-tree-head { height: var(--fv-head-h); flex-shrink: 0; display: flex; align-items: center; padding: 0 var(--space-1); border-bottom: var(--line) solid var(--border); }
.fv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.fv-head { height: var(--fv-head-h); flex-shrink: 0; display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border-bottom: var(--line) solid var(--border); min-width: 0; }
.fv-path { display: flex; align-items: center; gap: var(--space-1_5); min-width: 0; font-size: var(--text-xs); color: var(--muted-foreground); }
.fv-path .cur { display: flex; align-items: center; gap: var(--space-1); color: var(--foreground); font-weight: var(--weight-medium); min-width: 0; }
.fv-time { margin-left: auto; display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; flex-shrink: 0; }
.fv-body { flex: 1; min-height: 0; overflow: auto; padding: var(--space-6) var(--space-8); }
.fv.framed { position: relative; left: 50%; transform: translateX(-50%); width: min(var(--list-col-w), 100cqw - 2 * var(--space-8)); height: var(--fv-framed-h); border-radius: var(--r-panel); corner-shape: var(--corner); box-shadow: 0 0 0 var(--hairline) var(--border-surface-strong); background: var(--surface-secondary); overflow: hidden; }
.fv.framed .fv-body { padding: var(--space-4); --cb-head-top: calc(-1 * var(--space-4)); --cb-head-bg: linear-gradient(var(--surface-tertiary), var(--surface-tertiary)), linear-gradient(var(--surface-secondary), var(--surface-secondary)), var(--background); } /* a code view head stuck at the top hides the lines under it */
.fv-title { font-family: var(--font-display); font-size: var(--fv-title-size, var(--text-lg)); font-weight: var(--weight-semibold); margin: 0 0 var(--space-4); }
`;

/** @param {{tree: any, treeHead?: any, path: string[], time?: string, actions?: any, title?: string, children?: any, framed?: boolean}} p
 *   framed: a card of its own height in a page, as wide as a list page (wider than a narrow page column, centered on it) */
export function render(p) {
  const last = p.path.length - 1;
  return html`<div class="${cx('fv', p.framed && 'framed')}" data-c="file-viewer">
    <div class="fv-tree">${p.treeHead ? html`<div class="fv-tree-head">${p.treeHead}</div>` : ''}<div data-scroll="tree">${p.tree}</div></div>
    <div class="fv-main">
      <div class="fv-head"><nav class="fv-path">${p.path.map((s, i) => i < last ? html`<span class="trunc">${s}</span>${icon('chevron-right-small', 'xs')}` : html`<span class="cur">${icon('file-text', 'sm')}<span class="trunc">${s}</span></span>`)}</nav>
        ${p.time ? html`<span class="fv-time">${icon('clock', 'xs')}${p.time}</span>` : ''}${p.actions || ''}</div>
      <div class="fv-body" data-scroll="file">${p.title ? html`<h2 class="fv-title">${p.title}</h2>` : ''}${p.children || ''}</div>
    </div>
  </div>`;
}
