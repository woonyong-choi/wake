/*
 * Approval head: what sits above an approval question (in the question panel's detail), with no face of its own.
 *   target   the path of what is changed, in mono, joined by " / ", and an optional tag after it (a warning dot and its word, for an
 *            environment that needs care)
 *   source   who asked for it (a client name · the way it came: desktop, MCP, API), a quiet badge at the end of the target row
 *   change   the whole change: a code view (code: { text, path?, diff?, lang? }, wrapped) or one plain line (change)
 *   judgements  two separate status marks with words: how sure the cause is (cause) and how well the action itself is founded (grade),
 *            then what it reaches (reach) as quiet words
 *   grade, cause: { label, kind, icon? } (label: the words the page wants next to the mark)
 */
import { html } from '../core/html.js';
import * as codeBlock from './code-block.js';
import * as statusIcon from './status-icon.js';
import * as badge from './badge.js';

export const name = 'approval-head';

export const css = `
.aph { display: grid; gap: var(--space-1_5); padding: 0 var(--space-1) var(--space-1); font-size: var(--text-sm); word-break: keep-all; overflow-wrap: anywhere; }
.aph-t { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--muted-foreground); }
.aph-tag { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--warning-content); font-family: var(--font-sans); }
.aph-t .badge { font-family: var(--font-sans); }
.aph-tag::before { content: ""; width: var(--space-1_5); height: var(--space-1_5); border-radius: var(--r-round); background: var(--warning); }
.aph-g { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--muted-foreground); }
`;

const mark = g => (g ? statusIcon.render({ kind: g.kind, icon: g.icon, subject: g.label }) : '');

/**
 * @param {{target: string|string[], tag?: string, source?: string, grade?: {label: string, kind: string, icon?: string}, cause?: {label: string, kind: string, icon?: string},
 *   change?: any, code?: {text: string, path?: string, diff?: boolean, lang?: string}, reach?: any}} p
 */
export function render(p) {
  const target = Array.isArray(p.target) ? p.target.filter(Boolean).join(' / ') : p.target;
  const change = p.code ? codeBlock.render({ path: p.code.path, lang: p.code.lang, text: p.code.text, diff: !!p.code.diff, wrap: true }) : p.change != null && p.change !== '' ? html`<div>${p.change}</div>` : '';
  return html`<div class="aph" data-c="approval-head"><div class="aph-t">${target}${p.tag ? html`<span class="aph-tag">${p.tag}</span>` : ''}${p.source ? badge.render({ tone: 'neutral', size: 'sm', label: p.source }) : ''}</div>
    ${change}
    ${p.cause || p.grade || p.reach ? html`<div class="aph-g">${mark(p.cause)}${mark(p.grade)}${p.reach ? html`<span>${p.reach}</span>` : ''}</div>` : ''}</div>`;
}
