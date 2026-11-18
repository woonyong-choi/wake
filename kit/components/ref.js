/*
 * Evidence reference: a small quiet pill that opens the evidence it points at (an AI reading, a reasoning chain's line, a report's sentence).
 * Its words say where the evidence is from, read at a glance ("Logs · checkout-api · 14:02:05"): labelOf(n) gives { label, tip } (the tip is
 * the excerpt). The same evidence always has the same label. Without a label the evidence's own number shows ("[n]", never renumbered).
 * A press emits action with n.
 *   ref.render({ n, label?, tip?, action })   one reference
 *   ref.list(ns, action, labelOf?)            the references after a sentence, in the order given
 *   ref.inText(text, action, labelOf?)        a plain text whose "[n]" marks become references; the rest of the text is escaped
 */
import { html, attrs } from '../core/html.js';

export const name = 'ref';

export const css = `
.evr { display: inline-flex; align-items: center; height: var(--badge-h); padding: 0 var(--space-1_5); margin-inline-start: var(--space-1); border-radius: var(--r-pill); background: var(--secondary); font-size: var(--text-xs); color: var(--foreground); font-variant-numeric: tabular-nums; cursor: pointer; vertical-align: baseline; transition: background var(--dur-fast) var(--ease-standard); }
.evr:hover { background: var(--accent); }
@media (prefers-reduced-motion: reduce) { .evr { transition: none; } }
`;

/** @param {{n: number|string, label?: string, tip?: string, action?: string}} p */
export function render(p) {
  const n = String(p.n);
  return html`<span class="evr" data-c="ref"${attrs({ role: p.action ? 'button' : null, tabindex: p.action ? '0' : null, 'data-action': p.action || null, 'data-arg': p.action ? (Number.isFinite(Number(n)) ? Number(n) : n) : null, 'data-tip': p.tip || null })}>${p.label || `[${n}]`}</span>`;
}

/** the references after a sentence, in the order given; labelOf(n) gives each one's { label, tip } */
export const list = (ns, action, labelOf) => html`${(ns || []).map(n => render({ n, action, ...(labelOf?.(n) || {}) }))}`;

/** a plain text with its "[n]" marks drawn as references (the rest is escaped as text) */
export function inText(text, action, labelOf) {
  const s = String(text ?? ''), parts = [];
  let at = 0;
  for (const m of s.matchAll(/\[(\d+)\]/g)) { parts.push(s.slice(at, m.index), render({ n: Number(m[1]), action, ...(labelOf?.(Number(m[1])) || {}) })); at = m.index + m[0].length; }
  parts.push(s.slice(at));
  return html`${parts}`;
}
