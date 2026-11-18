/*
 * Answer text: plain text without a surface. Renders a list of block definitions.
 * Block: { p: Inline[] } | { h2 } | { h3 } | { ul: Inline[][] } | { ol: Inline[][] } | { quote } | { html }
 * Inline: string | { code } | { b: string | Inline[] } | { a, href } | { ref, label, tip?, action } (an evidence reference: the ref pill, kit/components/ref.js)
 * Text color primary (85%), inline code on muted background at .875em. A paragraph's single line breaks stay line breaks.
 * parse(text): an answer written in Markdown -> answer parts, read as a safe subset: { type: 'text', blocks } (paragraphs, line breaks, - / 1. lists,
 * **bold**, `code`), { type: 'table', head, rows } (a pipe table, drawn with the answer table, message-table.js) and { type: 'code', lang, text } (a fenced
 * block, drawn with the code view, code-block.js). Everything else stays text: HTML is escaped as written, a heading line reads as a bold line, a link
 * reads as its words with an http(s) address after them in brackets (never a link). A half-written answer reads too: an unclosed fence is already a
 * code block, a table head without its rule line and an unclosed ** stay text.
 * plain(text): the same answer as one line of its words without the marks (a short preview); its tables and code blocks add nothing.
 */
import { html } from '../core/html.js';
import { render as refPill } from './ref.js';

export const name = 'answer-text';

export const css = `
.ans { color: var(--primary); line-height: var(--leading-sm); overflow-wrap: anywhere; }
.ans p { margin: .5em 0; white-space: pre-line; } /* a paragraph keeps its single line breaks */
.ans > :first-child { margin-top: 0; }
.ans > :last-child { margin-bottom: 0; }
.ans h2 { margin: var(--ans-h2-mt) 0 var(--ans-h2-mb); font-size: var(--ans-h2-size, var(--text-2xl)); font-weight: var(--weight-medium); line-height: var(--ans-h2-leading, var(--leading-2xl)); color: var(--foreground); }
.ans h3 { margin: 1em 0 .35em; font-size: var(--ans-h3-size, 1.125em); font-weight: var(--weight-medium); line-height: var(--ans-h3-leading, 1.4); color: var(--foreground); }
.ans ul { margin: .5em 0; padding-left: 1.25em; list-style: none; }
.ans ul > li { position: relative; }
.ans ul > li::before { content: ""; position: absolute; top: .6em; left: -1em; width: .3em; height: .3em; border-radius: var(--r-round); background: var(--primary); opacity: .35; }
.ans ol { margin: .5em 0; padding-left: 1.5em; color: var(--muted-foreground); }
.ans ol > li { color: var(--primary); }
.ans li { margin: .25em 0; line-height: 1.5; }
.ans blockquote { margin: .75em 0; padding-left: 1em; border-left: var(--quote-w) solid var(--accent); color: var(--muted-foreground); }
.ans code { margin-inline: var(--space-0_5); font-family: inherit; font-size: .875em; background: var(--muted); border-radius: var(--r-chip); padding: .2em .4em; line-height: 1; }
.ans strong { font-weight: var(--weight-semibold); }
.ans a { color: var(--link); text-decoration: underline; text-decoration-color: var(--link-underline); text-decoration-thickness: var(--underline-w); text-underline-offset: var(--underline-offset); transition: opacity var(--dur-fast) var(--ease-standard); }
.ans a:hover { opacity: .6; }
.ans .caret { display: inline-block; width: .45em; height: 1em; margin-left: var(--line); vertical-align: -.12em; background: currentColor; opacity: .6; animation: caret var(--dur-caret) var(--ease-caret) infinite; }
@keyframes caret { 50% { opacity: 0; } }
`;

export function inline(parts) {
  return (Array.isArray(parts) ? parts : [parts]).map(x => typeof x === 'string' ? x
    : x.code != null ? html`<code>${x.code}</code>`
    : x.b != null ? html`<strong>${Array.isArray(x.b) ? inline(x.b) : x.b}</strong>`
    : x.a != null ? html`<a href="${x.href || '#'}">${x.a}</a>`
    : x.ref != null ? refPill({ n: x.ref, label: x.label, tip: x.tip, action: x.action }) : '');
}

function block(b) {
  if (b.p) return html`<p>${inline(b.p)}</p>`;
  if (b.h2) return html`<h2>${inline(b.h2)}</h2>`;
  if (b.h3) return html`<h3>${inline(b.h3)}</h3>`;
  if (b.ul) return html`<ul>${b.ul.map(li => html`<li>${inline(li)}</li>`)}</ul>`;
  if (b.ol) return html`<ol${b.start > 1 ? html` start="${b.start}"` : ''}>${b.ol.map(li => html`<li>${inline(li)}</li>`)}</ol>`;
  if (b.quote) return html`<blockquote>${inline(b.quote)}</blockquote>`;
  if (b.html) return b.html;
  return '';
}

/** @param {{blocks: object[], streaming?: boolean}} p */
export function render(p) {
  return html`<div class="ans" data-c="answer-text" data-line>${p.blocks.map(block)}${p.streaming ? html`<span class="caret" aria-hidden="true"></span>` : ''}</div>`;
}

/* ---------- Markdown (a safe subset) -> answer parts ---------- */
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/, NUMBER = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/, HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const RULE_CELL = /^\s*:?-{1,}:?\s*$/;

/* a table row's cells: split at | outside `code`, a \| stays a bar; the outer bars are optional */
function cells(line) {
  const out = []; let cur = '', tick = 0;
  const s = line.trim().replace(/^\|/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') { let n = 1; while (s[i + n] === '`') n++; tick = tick === 0 ? n : tick === n ? 0 : tick; cur += s.slice(i, i + n); i += n - 1; continue; }
    if (c === '|' && !tick) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '' || !/\|\s*$/.test(line)) out.push(cur);
  return out.map(x => x.trim());
}
const isRule = line => line.includes('-') && line.includes('|') && cells(line).length > 0 && cells(line).every(c => RULE_CELL.test(c));

/** one line of Markdown -> Inline[]: `code`, **bold** (may hold code), [words](address) as text; the rest is text as written */
export function inlineOf(text) {
  const out = [], push = x => { if (typeof x === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += x; else if (x !== '') out.push(x); };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && /[\\`*_[\]()#|>-]/.test(text[i + 1] || '')) { push(text[i + 1]); i += 2; continue; }
    if (c === '`') {
      let n = 1; while (text[i + n] === '`') n++;
      const end = text.indexOf('`'.repeat(n), i + n);
      if (end > 0 && text[end + n] !== '`') { push({ code: text.slice(i + n, end).replace(/^ (.+) $/, '$1') }); i = end + n; continue; }
      push('`'.repeat(n)); i += n; continue;
    }
    if (c === '*' && text[i + 1] === '*' || c === '_' && text[i + 1] === '_' && !/\w/.test(text[i - 1] || '')) {
      const mark = c + c, end = text.indexOf(mark, i + 2);
      if (end > i + 2 && text[i + 2] !== ' ' && text[end - 1] !== ' ') { push({ b: inlineOf(text.slice(i + 2, end)) }); i = end + 2; continue; }
      push(mark); i += 2; continue;
    }
    if (c === '[') {
      const m = /^\[([^\]\n]+)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/.exec(text.slice(i));
      if (m) { for (const x of inlineOf(m[1])) push(x); if (/^https?:\/\//i.test(m[2]) && m[2] !== m[1]) push(` (${m[2]})`); i += m[0].length; continue; }
    }
    push(c); i++;
  }
  return out;
}

/** @param {string} text an answer in Markdown @returns {({type:'text', blocks:object[]}|{type:'table', head:any[], rows:any[][]}|{type:'code', lang:string, text:string})[]} */
export function parse(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n'), parts = [];
  let blocks = [];
  const flush = () => { if (blocks.length) parts.push({ type: 'text', blocks }); blocks = []; };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = FENCE.exec(line);
    if (fence) {
      const body = []; i++;
      while (i < lines.length && !(lines[i].trim().startsWith(fence[1][0].repeat(fence[1].length)) && lines[i].trim().replace(/[`~]/g, '') === '')) body.push(lines[i++]);
      i++; /* the closing fence (an answer still being written may not have it yet) */
      flush(); parts.push({ type: 'code', lang: fence[2] || '', text: body.join('\n') }); continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line), width = head.length, rows = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { const r = cells(lines[i++]); rows.push(Array.from({ length: width }, (_, k) => inlineOf(r[k] ?? ''))); }
      flush(); parts.push({ type: 'table', head: head.map(h => h.replace(/\*\*|`/g, '')), rows }); continue;
    }
    const heading = HEADING.exec(line);
    if (heading) { blocks.push({ p: [{ b: inlineOf(heading[1]) }] }); i++; continue; }
    const list = BULLET.exec(line) ? 'ul' : NUMBER.exec(line) ? 'ol' : null;
    if (list) {
      const items = [], start = list === 'ol' ? Number(NUMBER.exec(line)[1]) : 0, item = l => list === 'ul' ? BULLET.exec(l)?.[1] : NUMBER.exec(l)?.[2];
      let cur = null;
      while (i < lines.length && lines[i].trim()) {
        const l = lines[i], own = item(l), other = list === 'ul' ? NUMBER.exec(l) : BULLET.exec(l);
        if (own != null && !(/^\s{2,}/.test(l) && cur != null)) { if (cur != null) items.push(cur); cur = own; }
        else if (other && !/^\s{2,}/.test(l) || FENCE.test(l) || l.includes('|') && isRule(lines[i + 1] || '')) break;
        else cur = cur == null ? l.trim() : cur + '\n' + (own != null ? (list === 'ul' ? '- ' : '') + own : l.trim());
        i++;
      }
      if (cur != null) items.push(cur);
      blocks.push(list === 'ul' ? { ul: items.map(inlineOf) } : { ol: items.map(inlineOf), start }); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) && !HEADING.test(lines[i]) && !(lines[i].includes('|') && isRule(lines[i + 1] || ''))) para.push(lines[i++].trimStart()); /* a line's own end stays as written while it is streamed */
    if (!para.length) { blocks.push({ p: inlineOf(lines[i++].trim()) }); continue; }
    blocks.push({ p: inlineOf(para.join('\n')) });
  }
  flush();
  return parts;
}

/** an answer in Markdown -> its words on one line, without marks; tables and code blocks are left out */
export function plain(text) {
  const words = x => typeof x === 'string' ? x : x.code != null ? x.code : x.b != null ? (Array.isArray(x.b) ? x.b.map(words).join('') : x.b) : '';
  return parse(text).filter(x => x.type === 'text').flatMap(x => x.blocks.flatMap(b => b.p ? [b.p] : b.ul || b.ol || []))
    .map(l => l.map(words).join('')).join(' ').replace(/\s+/g, ' ').trim();
}
