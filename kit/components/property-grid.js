/* Read-only properties: semantic label/value pairs in a grid or wrapping summary strip. */
import { html, attrs, Safe, esc, raw } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'property-grid';

export const css = `
.pg { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(var(--space-40) + var(--space-16))), 1fr)); gap: var(--space-3) var(--space-6); position: relative; min-width: 0; margin: 0; }
.pg-item { position: relative; min-width: 0; }
.pg-label { margin: 0 0 var(--space-1); font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--muted-foreground); overflow-wrap: break-word; }
.pg-value { margin: 0; font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; color: var(--primary); overflow-wrap: break-word; }
/* a long name (a label key, a selector) breaks after its separators (wordBreaks), a word is cut only when one part alone is wider than the cell */
.pg-item.lead .pg-value { font-size: var(--text-lg); line-height: var(--leading-base); } /* the one value that matters most on a screen */
.pg-item.click { cursor: pointer; border-radius: var(--r-chip); transition: opacity var(--dur-fast) var(--ease-standard); }
.pg-item.click .pg-label { transition: color var(--dur-fast) var(--ease-standard); }
.pg-item.click:hover .pg-label { color: var(--foreground); }
.pg-item.click:active { opacity: var(--press-opacity); }
.pg-item.click:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-1); }
.pg-value[data-tone="warn"] { color: var(--warning-content); }
.pg-value[data-tone="danger"] { color: var(--destructive-content); }
.pg-meta { margin-top: var(--space-1); font-size: var(--text-xs); line-height: var(--leading-xs); font-weight: var(--weight-regular); color: var(--muted-foreground); }
.pg-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1_5); margin-top: var(--space-1_5); min-width: 0; }
.pg.strip { display: flex; flex-wrap: wrap; }
.pg.stack { grid-template-columns: minmax(0, 1fr); } /* one pair a line: long values (a link, an annotation) never run past a narrow pane */
.pg.strip > .pg-item { flex: 1 1 var(--property-strip-min, var(--space-40)); min-width: min(100%, var(--property-strip-min, var(--space-40))); }
.pg.strip .pg-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pg.strip .pg-value { font-size: var(--text-lg); line-height: var(--leading-base); }
.pg-label:has(.wi) { display: flex; align-items: center; gap: var(--space-1_5); }
.pg-label .wi { width: var(--icon-sm); height: var(--icon-sm); flex-shrink: 0; transition: color var(--dur-fast) var(--ease-standard); }
.pg-item[data-tone="warn"] .pg-label .wi { color: var(--warning); }
.pg-item[data-tone="danger"] .pg-label .wi { color: var(--destructive); }
.pg-gauge { margin-top: var(--space-2); }
/* a strip reads at a glance: items rise in once, a pressable item takes a soft surface and a brighter icon under the pointer */
.pg.strip { isolation: isolate; }
.pg.strip > .pg-item { animation: pg-rise var(--dur-flow-reveal) var(--ease-standard) both; animation-delay: calc(var(--i, 0) * var(--pg-stagger)); }
@keyframes pg-rise { from { opacity: 0; transform: translateY(var(--space-1)); } }
.pg.strip > .pg-item.click::after { content: ''; position: absolute; inset: calc(-1 * var(--space-2)) calc(-1 * var(--space-3)); z-index: -1; border-radius: var(--r-control); background: transparent; transition: background var(--dur-fast) var(--ease-standard); }
.pg.strip > .pg-item.click:hover::after { background: var(--ghost-hover); }
.pg.strip > .pg-item.click:hover .pg-label { color: var(--foreground); }
.pg.strip > .pg-item.click:hover .pg-label .wi { color: var(--foreground); }
.pg.strip.pg-ready > .pg-item:not(.pg-row-start)::before { position: absolute; inset-block: 0; inset-inline-start: calc(-1 * var(--space-3)); border-inline-start: var(--line) solid var(--border); content: ''; }
`;

/**
 * Strings are escaped; Safe fragments use the existing trusted component markup contract.
 * A null value is rendered as an em dash; unsupported/unknown labels belong to the caller.
 * @param {{items: {id: string, label: string, value: string|number|boolean|null|Safe, tone?: 'warn'|'danger', lead?: boolean, icon?: string, gauge?: Safe, action?: string, arg?: any, meta?: string|number|boolean|Safe, actions?: string|Safe|(string|Safe)[]}[], layout?: 'grid'|'strip'|'ranked'|'stack'}} p
 * @throws {TypeError} Invalid items, labels, values or layout.
 * @throws {RangeError} Duplicate item identifiers.
 */
export function render(p) {
  if (!Array.isArray(p.items) || (p.layout !== undefined && !['grid', 'strip', 'ranked', 'stack'].includes(p.layout))) throw new TypeError('invalid property grid');
  const keys = new Set();
  const items = p.items.map((item, index) => {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || typeof item.label !== 'string' || !item.label.trim() || !Object.hasOwn(item, 'value')) throw new TypeError('invalid property item');
    if (keys.has(item.id)) throw new RangeError('duplicate property identifier');
    keys.add(item.id);
    const actions = item.actions == null ? [] : Array.isArray(item.actions) ? item.actions : [item.actions];
    return html`<div class="${[item.action ? 'pg-item click' : 'pg-item', item.lead && 'lead'].filter(Boolean).join(' ')}"${attrs({ style: `--i:${index}`, 'data-tone': ['warn', 'danger'].includes(item.tone) ? item.tone : null, 'data-key': JSON.stringify(['property', item.id]), role: item.action ? 'button' : null, tabindex: item.action ? '0' : null, 'data-action': item.action || null, 'data-arg': item.action ? item.arg ?? null : null })}><dt class="pg-label"${attrs({ title: p.layout === 'strip' || p.layout === 'ranked' ? item.label : null })}>${item.icon ? icon(item.icon, 'sm') : ''}${wordBreaks(item.label)}</dt><dd class="pg-value"${attrs({ 'data-value-state': item.value === null ? 'null' : 'value', 'data-tone': ['warn', 'danger'].includes(item.tone) ? item.tone : null })}>${content(item.value)}${item.meta != null ? html`<div class="pg-meta">${content(item.meta)}</div>` : ''}${item.gauge ? html`<div class="pg-gauge">${content(item.gauge)}</div>` : ''}${actions.length ? html`<div class="pg-actions">${actions.map(content)}</div>` : ''}</dd></div>`;
  });
  return html`<dl class="${p.layout === 'strip' ? 'pg strip' : p.layout === 'ranked' ? 'pg ranked' : p.layout === 'stack' ? 'pg stack' : 'pg'}" data-c="property-grid">${items}</dl>`;
}

/* a long name gets a break chance after each separator (/ . - _ = , :) that a word follows, never between digits (6.7.1 stays whole) */
const BREAK_AFTER = /([/_=,:-]|(?<!\d)\.|\.(?!\d))(?=[^\s/._=,:-])/g;
const wordBreaks = text => (text.length < 16 || text.search(BREAK_AFTER) < 0 ? text : raw(text.split(BREAK_AFTER).map((part, i) => (i % 2 ? esc(part) + '<wbr>' : esc(part))).join('')));

function content(value) {
  if (value === null) return '—';
  if (value instanceof Safe) return value;
  if (typeof value === 'string') return wordBreaks(value);
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
  throw new TypeError('invalid property content');
}

export function attach(root) {
  const doc = root.ownerDocument || root, win = doc.defaultView, tracked = new Map();
  let frame = null, stopped = false;
  const refresh = () => {
    frame = null;
    for (const el of tracked.keys()) {
      if (!el.classList.contains('strip')) continue;
      const items = [...el.children];
      items.forEach((item, i) => {
        const start = !i || item.offsetTop !== items[i - 1].offsetTop;
        if (item.classList.contains('pg-row-start') !== start) item.classList.toggle('pg-row-start', start);
      });
      if (!el.classList.contains('pg-ready')) el.classList.add('pg-ready');
    }
  };
  const schedule = () => { if (!stopped && frame === null) frame = win.requestAnimationFrame(refresh); };
  const resize = new win.ResizeObserver(schedule);
  const scan = () => {
    for (const [el, observer] of tracked) if (!el.isConnected) { resize.unobserve(el); observer.disconnect(); tracked.delete(el); }
    const candidates = [...root.querySelectorAll('.pg')];
    if (root.matches?.('.pg')) candidates.unshift(root);
    for (const el of candidates) if (!tracked.has(el)) {
      const observer = new win.MutationObserver(records => {
        if (!el.classList.contains('strip')) return;
        const ownClass = records.some(({ target }) => target === el || (target.parentElement === el && target.classList.contains('pg-item')));
        if (!ownClass) return;
        const items = [...el.children];
        const stale = !el.classList.contains('pg-ready') || items.some((item, i) => item.classList.contains('pg-row-start') !== (!i || item.offsetTop !== items[i - 1].offsetTop));
        if (stale) schedule();
      });
      observer.observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
      tracked.set(el, observer); resize.observe(el);
    }
    schedule();
  };
  const mutations = new win.MutationObserver(scan);
  mutations.observe(root.documentElement || root, { childList: true, subtree: true });
  doc.fonts?.ready.then(schedule);
  doc.fonts?.addEventListener('loadingdone', schedule);
  scan();
  const detach = () => {
    if (stopped) return;
    stopped = true; resize.disconnect(); mutations.disconnect();
    if (frame !== null) win.cancelAnimationFrame(frame);
    doc.fonts?.removeEventListener('loadingdone', schedule);
    win.removeEventListener('pagehide', detach);
    for (const observer of tracked.values()) observer.disconnect();
    tracked.clear();
  };
  win.addEventListener('pagehide', detach, { once: true });
  return detach;
}
