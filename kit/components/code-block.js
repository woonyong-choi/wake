/*
 * Code view: the one view for every code-like text (a file, YAML, logs, a diff, commands). Hairline border, mono 13. On the page it is a face
 * (--surface-radius, --surface-corner: --radius-face, round); a container sets a smaller concentric radius (a question panel: its own radius less its
 * inset), and inside a summary bar body or a status flow section it is flat: the container owns the face (kit/CONTRACTS.md, Faces).
 * Head (sticky while the body scrolls): with a path it is a file head like a review tool's: fold caret, file icon, the folder part muted and
 * the file name, +N -M for a diff, then on the right the caller's controls, the diff layout (one column / side by side), "viewed", open,
 * download and copy as icon buttons. Without a path the head shows the language name (12 muted).
 * Body: line numbers in a muted gutter (a diff has two: before and after), hunk heads (@@ -a,b +c,d @@ and the section the hunk is in),
 * unchanged runs longer than the context folded into one "N lines hidden" row that opens in place, add and remove lines on a soft
 * green / red ground with their number cells a step stronger, the + / - sign in its own column. Lines do not wrap unless wrap is set;
 * the body scrolls sideways. Copy and download answer on the button with a check and the words in its tooltip.
 * Colouring follows lang (or syntax, or the file's extension): yaml (keys, strings, numbers and booleans, comments, --- between documents as a
 * rule), json (keys, strings, numbers and literals), promql (functions and aggregations, strings, numbers and ranges, comments), log (time muted,
 * level coloured, key= names), sh; with the code tokens (--code-key/-str/-num/-com) in both themes. The head is a band of its own (--code-head).
 * docs: string[] draws several documents (YAML) in one block with --- between them.
 */
import { html, cx, raw, esc, attrs } from '../core/html.js';
import { t } from '../core/i18n.js';
import { icon } from '../icons/icons.js';
import { saveText } from '../core/save.js';

export const name = 'code-block';

export const css = `
.cb { border-radius: var(--surface-radius); corner-shape: var(--surface-corner); box-shadow: 0 0 0 var(--hairline) var(--border-surface-strong); background: var(--surface-tertiary); overflow: clip; min-width: 0; }
.cb + .cb { margin-top: var(--space-3); }
.cb:not(.cb-folded)::after { content: ""; display: block; height: calc(max(0px, var(--surface-radius) - var(--r-panel)) / 3); } /* the larger corner of a face on the page keeps the last line out of its curve (inside a container this is 0) */
.cb-head { position: sticky; top: var(--cb-head-top, 0); z-index: 1; display: flex; align-items: center; gap: var(--space-2); height: var(--cb-head-h); padding: 0 var(--space-1_5) 0 var(--space-3); font-size: var(--text-xs); color: var(--muted-foreground); background: var(--cb-head-bg, linear-gradient(var(--code-head), var(--code-head)), linear-gradient(var(--surface-tertiary), var(--surface-tertiary)), var(--background)); box-shadow: 0 var(--hairline) 0 var(--border-surface-strong); min-width: 0; } /* the head is a band a step apart from the code under it */
.cb.file .cb-head { padding-left: calc(max(0px, var(--surface-radius) - var(--r-panel)) / 2 + var(--space-1)); box-shadow: 0 var(--hairline) 0 var(--border-surface-strong); }
.cb.file.cb-folded .cb-head { box-shadow: none; }
.cb-path { display: flex; align-items: center; gap: var(--space-1_5); min-width: 0; font-family: var(--font-mono); font-size: var(--text-xs); }
.cb-path .wi { width: var(--icon-sm); height: var(--icon-sm); flex-shrink: 0; }
.cb-path > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.cb-path b { font-weight: var(--weight-medium); color: var(--foreground); }
.cb-stat { display: inline-flex; gap: var(--space-1_5); font-family: var(--font-mono); font-size: var(--text-xs); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.cb-stat .a { color: var(--success-content); } .cb-stat .d { color: var(--destructive-content); }
.cb-tag { flex-shrink: 0; }
.cb-fold { flex-shrink: 0; }
.cb-fold .wi { transition: transform var(--motion-exit-dur) var(--motion-exit-ease); }
.cb.cb-folded .cb-fold .wi { transform: rotate(-90deg); }
.cb-acts { display: flex; align-items: center; gap: var(--space-0_5); }
.cb-tools { margin-left: auto; display: flex; align-items: center; gap: var(--space-1_5); flex-shrink: 0; }
.cb-act > .wi { grid-area: 1 / 1; transition: opacity var(--motion-exit-dur) var(--motion-exit-ease), transform var(--motion-enter-dur) var(--motion-enter-ease); }
.cb-act { display: grid; place-items: center; }
.cb-act > .wi + .wi { opacity: 0; transform: scale(var(--enter-scale)); }
.cb-act:is([data-done="ok"], [data-done="fail"]) > .wi:first-child { opacity: 0; transform: scale(var(--enter-scale)); }
.cb-act[data-done="ok"] > .wi:nth-child(2), .cb-act[data-done="fail"] > .wi:nth-child(3) { opacity: 1; transform: none; }
.cb-act[data-done="ok"] { color: var(--success); }
.cb-act[data-done="fail"] { color: var(--destructive); }
.cb.cb-seen [data-cb=viewed] { color: var(--foreground); background: var(--ghost-hover); }
.cb-seg { display: inline-flex; padding: var(--space-px); border-radius: var(--r-control); background: var(--ghost-hover); }
.cb-seg .ib { width: var(--control-h-xs); height: var(--control-h-xs); }
/* the layout shown: chosen by the person (cb-one, cb-two), else by the block width (side by side from 760 wide, the container query) */
.cb.diff:not(.cb-two) [data-cb=uni], .cb.cb-two [data-cb=split] { color: var(--foreground); background: var(--surface-secondary); }
.cb.cb-folded > .cb-body { display: none; }
.cb-body { overflow-x: auto; padding: var(--space-1) 0 var(--space-2); font-family: var(--font-mono); font-size: var(--text-code); line-height: var(--leading-sm); }
.cb.scroll .cb-body { max-height: var(--cb-max-h); overflow-y: auto; }
.cb.compact .cb-body { font-size: var(--text-xs); line-height: var(--leading-code-compact); padding: var(--space-1) 0; }
.cb-line { display: flex; white-space: pre; padding-right: var(--space-4); min-width: max-content; }
.cb-line.mark { background: var(--row-mark); box-shadow: inset var(--line-avg) 0 0 var(--foreground); } /* a line pointed to: neutral, never the warning colour */
.cb-line:has(> .cb-end) { padding-right: 0; } .cb-line > .cb-end { margin-inline-start: auto; position: sticky; inset-inline-end: 0; display: inline-flex; align-items: center; padding-inline: var(--space-3); background: linear-gradient(to right, transparent, var(--surface-tertiary) var(--space-3)); } /* the line's end column stays in sight while the line scrolls sideways */
.cb-line.cb-fold-note { color: var(--muted-foreground); font-family: var(--font-sans); font-size: var(--text-xs); }
.cb.wrap .cb-line { white-space: pre-wrap; min-width: 0; overflow-wrap: anywhere; }
.cb.wrap .cb-line > [data-line], .cb.wrap .cb-line > .cx, .cb.wrap .cb-line > .cb-tok { flex: 1; min-width: 0; }
.cb.wrap .cb-line .ln { white-space: nowrap; width: auto; min-width: var(--cb-ln-w); } /* a wrapped line keeps its number on one line */
.cb-spacer { height: calc(var(--leading-sm) * var(--cb-spacer-lines)); }
.cb-line:hover { background: var(--line-hl); }
.cb-line .ln { width: var(--cb-ln-w); flex-shrink: 0; text-align: right; padding-right: var(--space-3); color: var(--muted-foreground); opacity: .6; user-select: none; font-variant-numeric: tabular-nums; }
.cb.diff .cb-line .ln { width: calc(var(--cb-ln-w) + var(--space-1)); padding-right: var(--space-2); }
.cb.compact .cb-line .ln { width: var(--cb-ln-w-compact); padding-right: var(--space-2_5); }
.cb-line .sg { width: var(--space-5); flex-shrink: 0; text-align: center; user-select: none; color: var(--muted-foreground); }
.cb-line.add { background: var(--diff-add); } .cb-line.add .ln { background: var(--diff-add); } .cb-line.add .sg { color: var(--success-content); }
.cb-line.del { background: var(--diff-del); } .cb-line.del .ln { background: var(--diff-del); } .cb-line.del .sg { color: var(--destructive-content); }
.cb-line.hl { background: var(--line-hl); } .cb-line.hl-error { background: var(--line-hl-error); } /* a line marked as an error takes the error colour, a warning the warning colour */
.cb-line.hunk { color: var(--muted-foreground); background: color-mix(in oklab, var(--code-key) 9%, transparent); }
.cb-line.hunk .cx { padding-left: var(--space-1); }
.cb-more { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-width: max-content; padding: 0 var(--space-4) 0 0; height: var(--leading-sm); color: var(--muted-foreground); background: color-mix(in oklab, var(--code-key) 6%, transparent); font: inherit; font-family: var(--font-sans); font-size: var(--text-xs); text-align: left; cursor: pointer; }
.cb-more:hover { background: var(--ghost-hover); color: var(--foreground); }
.cb-more .wi { width: calc(var(--cb-ln-w) * 2 + var(--space-2)); height: var(--icon-xs); flex-shrink: 0; }
.cb-line[data-hid]:not(.cb-shown), .cb-more.cb-shown { display: none; }
.cb-split { display: none; }
.cb.diff { container: cb / inline-size; }
.cb.cb-two .cb-uni { display: none; } .cb.cb-two .cb-split { display: grid; grid-template-columns: 1fr 1fr; }
@container cb (min-width: 760px) { /* quality:literal: a container or media query cannot read a token */
  .cb:not(.cb-one) .cb-uni { display: none; } .cb:not(.cb-one) .cb-split { display: grid; grid-template-columns: 1fr 1fr; }
  .cb:not(.cb-one) [data-cb=split] { color: var(--foreground); background: var(--surface-secondary); } .cb:not(.cb-one):not(.cb-two) [data-cb=uni] { color: inherit; background: none; } }
.cb-split > div { min-width: 0; overflow-x: auto; }
.cb-split > div + div { box-shadow: inset var(--hairline) 0 0 var(--border-surface-strong); }
.cb-split .cb-line.cb-gap { background: color-mix(in oklab, var(--muted-foreground) 6%, transparent); }
.tk-k { color: var(--code-key); } .tk-s { color: var(--code-str); } .tk-n { color: var(--code-num); } .tk-c { color: var(--code-com); }
.cb-line > :is([data-line], [data-old]):has(+ .cb-tok) { position: absolute; width: var(--space-px); height: var(--space-px); overflow: hidden; clip-path: inset(50%); white-space: pre; } /* the plain line stays for copy and readers; the coloured copy is what is seen */
.cb-line.doc > .cb-tok { display: block; color: var(--code-com); background: linear-gradient(var(--border-surface-strong), var(--border-surface-strong)) right center / calc(100% - 4ch) var(--hairline) no-repeat; } /* a document separator (---) is a rule across the block */
.tk-e { color: var(--destructive-content); } .tk-w { color: var(--warning-content); }
@media (prefers-reduced-motion: reduce) { .cb-fold .wi { transition: none; } }
`;

/* Line colouring per language, with the code colour tokens (--code-key, --code-str, --code-num, --code-com): each tokenizer returns the line as
   escaped markup, so a line is coloured on its own (a long file needs no state across lines) */
const span = (cls, text) => `<span class="${cls}">${esc(text)}</span>`;
/* a plain YAML or JSON value: a quoted string, a number or quantity, a boolean or null, else a bare string */
const scalar = v => {
  const t = v.trim(); if (!t) return esc(v);
  const lead = v.slice(0, v.indexOf(t)), tail = v.slice(v.indexOf(t) + t.length);
  const cls = /^(['"]).*\1$/.test(t) ? 'tk-s' : /^-?(\d[\d_.]*([eE][+-]?\d+)?|0x[\da-f]+)(m|[KMGTPE]i?|%|s|ms)?$/i.test(t) || /^(true|false|null|~|yes|no)$/i.test(t) ? 'tk-n' : /^[|>][-+]?$/.test(t) ? 'tk-c' : 'tk-s';
  return esc(lead) + span(cls, t) + esc(tail);
};
/* a comment at the end of a line (# outside quotes) */
const splitComment = line => { let q = null; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return [line.slice(0, i), line.slice(i)]; } return [line, '']; };
export const TOKENIZERS = {
  yaml: line => {
    if (/^\s*(---|\.\.\.)\s*$/.test(line)) return span('tk-c', line);
    const [body, com] = splitComment(line), c = com ? span('tk-c', com) : '';
    const m = body.match(/^(\s*(?:-\s+)*)((?:"[^"]*"|'[^']*'|[^\s:#'"][^:#]*?))(\s*:)(\s.*|)$/);
    if (m) return `${esc(m[1])}${span('tk-k', m[2])}${esc(m[3])}${m[4] ? scalar(m[4]) : ''}${c}`;
    const d = body.match(/^(\s*-\s+)(.*)$/);
    if (d) return `${esc(d[1])}${scalar(d[2])}${c}`;
    return `${body.trim() ? scalar(body) : esc(body)}${c}`;
  },
  json: line => esc(line).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g,
    (all, str, colon, num, lit) => str ? `<span class="${colon ? 'tk-k' : 'tk-s'}">${str}</span>${colon || ''}` : num ? `<span class="tk-n">${num}</span>` : `<span class="tk-n">${lit}</span>`),
  promql: line => {
    const [body, com] = splitComment(line);
    const words = /\b(by|without|on|ignoring|group_left|group_right|offset|bool|and|or|unless|sum|avg|min|max|count|stddev|stdvar|topk|bottomk|quantile|count_values)\b/;
    const out = body.replace(/("(?:[^"\\]|\\.)*"|'[^']*')|(\[[^\]]+\])|(\b\d+(?:\.\d+)?(?:ms|s|m|h|d|w|y)?\b)|([a-zA-Z_:][\w:]*)(\s*\()?|([^"'\[\w]+)/g,
      (all, str, range, num, ident, call, other) => str ? span('tk-s', str) : range ? span('tk-n', range) : num ? span('tk-n', num)
        : ident ? (call || words.test(ident) ? span('tk-k', ident) + esc(call || '') : esc(ident)) : esc(other));
    return out + (com ? span('tk-c', com) : '');
  },
  log: line => {
    const ts = line.match(/^(\[?\d{4}-\d\d-\d\d[T ][\d:.,]+(?:Z|[+-]\d\d:?\d\d)?\]?|[IWEF]\d{4} [\d:.]+|\d\d:\d\d:\d\d(?:\.\d+)?)/);
    const head = ts ? span('tk-c', ts[1]) : '', rest = ts ? line.slice(ts[1].length) : line;
    const level = (w, raw) => { const u = w.toUpperCase(); const cls = /^(ERROR|ERR|FATAL|CRIT|CRITICAL|PANIC)$/.test(u) ? 'tk-e' : /^(WARN|WARNING)$/.test(u) ? 'tk-w' : 'tk-c'; return span(cls, raw); };
    /* one pass, so a colour never lands inside another: key=value names, a level word (alone or as level=...), a quoted string */
    const body = esc(rest).replace(/(^|[\s\[(])((?:level|lvl|severity)=)(&quot;)?(\w+)(&quot;)?|(^|[\s\[(])(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|FATAL|PANIC)(?=[\]\s:)]|$)|(^|\s)([a-zA-Z_][\w.]*)=|(&quot;(?:(?!&quot;).)*&quot;)/g,
      (all, p1, lk, q1, lv, q2, p2, word, p3, key, str) => lk ? `${p1}<span class="tk-k">${lk.slice(0, -1)}</span>=${q1 || ''}${level(lv, lv)}${q2 || ''}`
        : word ? p2 + level(word, word) : key ? `${p3}<span class="tk-k">${key}</span>=` : `<span class="tk-s">${str}</span>`);
    return head + body;
  },
  sh: line => /^\s*#/.test(line) ? span('tk-c', line) : esc(line).replace(/(\s)(--?[\w-]+)/g, '$1<span class="tk-k">$2</span>').replace(/(&#39;[^&]*&#39;|'[^']*')/g, '<span class="tk-s">$1</span>'),
};
/* the language a block is coloured in: syntax, else lang (its label), else the file's extension */
const LANGS = { yaml: 'yaml', yml: 'yaml', json: 'json', promql: 'promql', prometheus: 'promql', log: 'log', logs: 'log', sh: 'sh', shell: 'sh', bash: 'sh', zsh: 'sh' };
export const syntaxOf = p => LANGS[String(p.syntax || '').toLowerCase()] || LANGS[String(p.lang || '').toLowerCase()] || LANGS[String(p.path || '').split('.').pop().toLowerCase()] || null;
/* a line as written stays the text of [data-line] (copy, download and readers take it as it is); the coloured copy is drawn beside it, hidden
   from assistive tech, and the plain one is hidden from sight while the coloured one is there */
const painted = (syntax, l, attr = 'data-line') => TOKENIZERS[syntax] ? html`<span ${raw(attr)}>${l}</span><span class="cb-tok" aria-hidden="true">${raw(TOKENIZERS[syntax](l))}</span>` : html`<span ${raw(attr)}>${l}</span>`;
const paint = (syntax, l) => TOKENIZERS[syntax] ? raw(TOKENIZERS[syntax](l)) : raw(esc(l));

const act = (kind, ic, tip) => html`<button type="button" class="ib sm cb-act"${attrs({ 'data-cb': kind, 'data-tip': tip, 'aria-label': tip })}>${icon(ic)}${icon('check')}${icon('status-error')}</button>`;
const tool = (kind, ic, tip) => html`<button type="button" class="ib sm"${attrs({ 'data-cb': kind, 'data-tip': tip, 'aria-label': tip })}>${icon(ic)}</button>`;
/** One copy button for a text host (a message bubble, an answer) */
export const copyButton = () => act('copy', 'copy', t('code.copy'));
/** Copy and download buttons for any text host: an element marked data-cb-host (data-file: the download name) whose [data-line] children are the lines. */
export const actions = (p = {}) => html`<span class="cb-acts">${p.copyOnly ? '' : act('download', 'download', t('code.download'))}${act('copy', 'copy', t('code.copy'))}</span>`;

/* A diff text (each line led by ' ', '+' or '-') into numbered rows, hunks and folded unchanged runs. ctx: context lines kept around changes */
export function parseDiff(text, ctx = 3) {
  const rows = []; let o = 0, n = 0;
  for (const l of text.split('\n')) {
    const s = l[0] === '+' || l[0] === '-' ? l[0] : ' ', body = l[0] === '+' || l[0] === '-' || l[0] === ' ' ? l.slice(1) : l;
    if (s === '+') rows.push({ s, n: ++n, body }); else if (s === '-') rows.push({ s, o: ++o, body }); else rows.push({ s, o: ++o, n: ++n, body });
  }
  const ch = rows.map((r, i) => r.s !== ' ' ? i : -1).filter(i => i >= 0);
  const keep = rows.map((_, i) => ch.some(c => Math.abs(c - i) <= ctx));
  const out = []; let i = 0;
  while (i < rows.length) {
    if (keep[i]) {
      const start = i; while (i < rows.length && keep[i]) i++;
      const part = rows.slice(start, i), first = part[0], os = part.filter(r => r.o).length, ns = part.filter(r => r.n).length;
      const sect = rows.slice(0, start).reverse().find(r => /^\S[^:]*:\s*$/.test(r.body));
      out.push({ hunk: `@@ -${first.o ?? (part.find(r => r.o)?.o || 0)},${os} +${first.n ?? (part.find(r => r.n)?.n || 0)},${ns} @@`, sect: sect?.body || '' }, ...part);
    } else { const start = i; while (i < rows.length && !keep[i]) i++; out.push({ hidden: rows.slice(start, i) }); }
  }
  return { rows: out, add: rows.filter(r => r.s === '+').length, del: rows.filter(r => r.s === '-').length };
}

const lineOf = (r, syntax) => html`<div class="${cx('cb-line', r.s === '+' && 'add', r.s === '-' && 'del')}"><span class="ln">${r.o ?? ''}</span><span class="ln">${r.n ?? ''}</span><span class="sg">${r.s === ' ' ? '' : r.s === '-' ? '−' : '+'}</span>${painted(syntax, r.body, r.s === '-' ? 'data-old' : 'data-line')}</div>`;
const more = (count, id) => html`<button type="button" class="cb-more" data-cb="expand" data-arg="${id}">${icon('chevrons-up-down')}${t('code.hidden', { count })}</button>`;

/* side by side: removes on the left paired with the adds that follow on the right */
function splitOf(d, syntax) {
  const L = [], R = [];
  const side = (r, k) => r ? html`<div class="${cx('cb-line', r.s === '+' && 'add', r.s === '-' && 'del')}"><span class="ln">${k === 'o' ? r.o : r.n}</span><span class="sg">${r.s === ' ' ? '' : r.s === '-' ? '−' : '+'}</span><span class="cx">${paint(syntax, r.body)}</span></div>` : html`<div class="cb-line cb-gap"><span class="ln"></span><span class="sg"></span><span class="cx"> </span></div>`;
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    if (r.hunk) { const h = html`<div class="cb-line hunk"><span class="ln"></span><span class="cx">${r.hunk} ${r.sect}</span></div>`; L.push(h); R.push(h); continue; }
    if (r.hidden) { const id = 'h' + i; L.push(more(r.hidden.length, id)); R.push(more(r.hidden.length, id)); r.hidden.forEach(x => { L.push(html`<div class="cb-line" data-hid="${id}">${''}<span class="ln">${x.o}</span><span class="sg"></span><span class="cx">${paint(syntax, x.body)}</span></div>`); R.push(html`<div class="cb-line" data-hid="${id}"><span class="ln">${x.n}</span><span class="sg"></span><span class="cx">${paint(syntax, x.body)}</span></div>`); }); continue; }
    if (r.s === ' ') { L.push(side(r, 'o')); R.push(side(r, 'n')); continue; }
    const dels = [], adds = []; while (i < d.rows.length && d.rows[i].s === '-') dels.push(d.rows[i++]); while (i < d.rows.length && d.rows[i].s === '+') adds.push(d.rows[i++]); i--;
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) { L.push(side(dels[k], 'o')); R.push(side(adds[k], 'n')); }
  }
  return html`<div class="cb-split"><div>${L}</div><div>${R}</div></div>`;
}

/**
 * @param {{lang?: string, text: string, path?: string, tag?: any, hl?: number[], diff?: boolean, compact?: boolean, wrap?: boolean, scroll?: boolean,
 *          window?: { start: number, end: number, total: number }, actions?: boolean|'copy', file?: string, syntax?: 'yaml'|'json'|'promql'|'log'|'sh', docs?: string[], head?: any, fold?: boolean, viewed?: boolean, open?: {action, arg?}, context?: number}} p
 *   path: a file head (folder part muted, file name strong); lang: the language label when there is no path; tag: a mark after the path (a status letter);
 *   diff: text lines led by ' ', '+' or '-' (two number gutters, hunks, folded unchanged runs; side by side when the block is wide, the head has the layout toggle);
 *   fold: the head caret folds the body; viewed: shows the "viewed" toggle (on folds the file); open: an "open file" icon button;
 *   rows: instead of text, the lines as given: { id?, n (the line's own number, kept when lines around it are folded away), text, mark? (a neutral
 *     tint and a bar at the start: the line a reader is pointed to), end? (markup at the line's end, kept in sight: a check), fold?: count (one muted
 *     row standing for that many lines left out) }; copy and download take the lines shown;
 *   scroll: the body scrolls inside a fixed height (logs); actions: false (none), 'copy' (copy only), else download and copy; head: more controls
 */
const spacer = count => count > 0 ? html`<div class="cb-spacer" aria-hidden="true" style="--cb-spacer-lines:${count}"></div>` : '';

export function render(p) {
  if (Array.isArray(p.docs)) p = { ...p, text: p.docs.map(x => String(x).replace(/\n+$/, '')).join('\n---\n'), docs: undefined }; /* several documents (YAML), one block with --- between */
  const syntax = syntaxOf(p);
  const window = !p.diff && !p.wrap && !p.compact ? p.window : null;
  const lines = Array.isArray(p.rows) ? p.rows.filter(r => !r.fold).map(r => r.text) : p.text.split('\n'), d = p.diff ? parseDiff(p.text, p.context ?? 3) : null;
  const dir = p.path ? p.path.split('/').slice(0, -1).join('/') : '', base = p.path ? p.path.split('/').pop() : '';
  const left = p.path
    ? html`${p.fold !== false ? html`<button type="button" class="ib xs cb-fold" data-cb="fold"${attrs({ 'aria-label': t('code.fold') })}>${icon('chevron-down-small')}</button>` : ''}<span class="cb-path">${icon('file-text')}<span title="${p.path}">${dir ? html`${dir}/` : ''}<b>${base}</b></span></span>${p.tag ? html`<span class="cb-tag">${p.tag}</span>` : ''}${d ? html`<span class="cb-stat"><span class="a">+${d.add}</span><span class="d">−${d.del}</span></span>` : ''}`
    : html`<span>${p.lang || ''}</span>`;
  const layout = d ? html`<span class="cb-seg" role="group" aria-label="${t('code.layout')}">${tool('uni', 'document', t('code.unified'))}${tool('split', 'columns', t('code.split'))}</span>` : '';
  const viewed = p.viewed ? tool('viewed', 'eye', t('code.viewed')) : '';
  const open = p.open ? html`<button type="button" class="ib sm"${attrs({ 'data-action': p.open.action, 'data-arg': p.open.arg, 'data-tip': t('code.open'), 'aria-label': t('code.open') })}>${icon('arrow-up-right')}</button>` : '';
  const acts = p.actions === false ? (p.head || layout || viewed ? html`<span class="cb-tools">${p.head || ''}${layout}${viewed}</span>` : '') : html`<span class="cb-tools">${p.head || ''}${layout}${viewed}${open}${actions({ copyOnly: p.actions === 'copy' })}</span>`;
  const body = d
    ? html`<div class="cb-uni">${d.rows.map((r, i) => r.hunk ? html`<div class="cb-line hunk"><span class="ln"></span><span class="ln"></span><span class="sg"></span><span class="cx">${r.hunk} ${r.sect}</span></div>`
        : r.hidden ? (id => html`${more(r.hidden.length, id)}${r.hidden.map(x => html`<div class="cb-line" data-hid="${id}"><span class="ln">${x.o}</span><span class="ln">${x.n}</span><span class="sg"></span>${painted(syntax, x.body)}</div>`)}`)('h' + i)
        : lineOf(r, syntax))}</div>${splitOf(d, syntax)}`
    : Array.isArray(p.rows) ? html`${p.rows.map(r => r.fold
      ? html`<div class="cb-line cb-fold-note" aria-hidden="false"${attrs({ 'data-key': r.id ? JSON.stringify(['cb-row', r.id]) : null })}><span class="ln"></span><span>${t('code.hidden', { count: r.fold })}</span></div>`
      : html`<div class="${cx('cb-line', r.mark && 'mark', r.cls)}"${attrs({ 'data-key': r.id ? JSON.stringify(['cb-row', r.id]) : null, 'data-row': r.id ?? null })}><span class="ln">${r.n ?? ''}</span>${painted(syntax, r.text)}${r.end ? html`<span class="cb-end">${r.end}</span>` : ''}</div>`)}`
    : html`${window ? spacer(window.start) : ''}${lines.map((line, index) => {
      const number = (window?.start || 0) + index + 1;
      return html`<div class="${cx('cb-line', p.hl && p.hl.includes(number) && 'hl', syntax === 'yaml' && /^---\s*$/.test(line) && 'doc')}"><span class="ln">${number}</span>${painted(syntax, line)}</div>`;
    })}${window ? spacer(window.total - window.end) : ''}`;
  return html`<div class="${cx('cb', p.compact && 'compact', p.path && 'file', d && 'diff', p.wrap && 'wrap', p.scroll && 'scroll')}" data-c="code-block" data-cb-host${attrs({ 'data-file': p.file })}>
    <div class="cb-head">${left}${acts}</div>
    <div class="cb-body" tabindex="0" data-scroll="x">${body}</div>
  </div>`;
}

/* the text of a block as written (line numbers left out; a diff gives its after side) */
const textOf = host => [...host.querySelectorAll('[data-line]')].map(x => x.textContent).join('\n');
const flash = (b, state, tip) => { b.dataset.done = state; b.dataset.tip = tip; clearTimeout(b._t); b._t = setTimeout(() => { delete b.dataset.done; b.dataset.tip = b.getAttribute('aria-label'); }, 1600); };

export function attach(root) {
  root.addEventListener('keydown', e => {
    if (!e.target.matches?.('.cb-body') || e.target.isContentEditable || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const win = (root.ownerDocument || root).defaultView;
    for (let host = e.target; host; host = host.parentElement) {
      if (!/^(auto|scroll)$/.test(win.getComputedStyle(host).overflowY) || host.scrollHeight <= host.clientHeight) continue;
      e.preventDefault();
      host.scrollBy({ top: parseFloat(win.getComputedStyle(e.target).lineHeight) * (e.key === 'ArrowDown' ? 1 : -1), behavior: 'instant' });
      return;
    }
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-cb-host] [data-cb]'); if (!b) return;
    e.stopPropagation();
    const cb = b.closest('[data-cb-host]'), kind = b.dataset.cb;
    /* the person's choices live as classes that a redraw keeps (core/morph LIVE_CLASSES): folded, viewed, the layout, opened runs */
    if (kind === 'fold') { cb.classList.toggle('cb-folded'); return; }
    if (kind === 'viewed') { const on = cb.classList.toggle('cb-seen'); cb.classList.toggle('cb-folded', on); return; }
    if (kind === 'uni' || kind === 'split') { cb.classList.toggle('cb-two', kind === 'split'); cb.classList.toggle('cb-one', kind === 'uni'); return; }
    if (kind === 'expand') { cb.querySelectorAll(`[data-hid="${b.dataset.arg}"], [data-cb=expand][data-arg="${b.dataset.arg}"]`).forEach(x => x.classList.add('cb-shown')); return; }
    const text = textOf(cb);
    if (kind === 'copy') {
      try { await (root.ownerDocument || root).defaultView.navigator.clipboard.writeText(text); flash(b, 'ok', t('message.copied')); } catch { flash(b, 'fail', t('code.failed')); }
      return;
    }
    const r = await saveText(cb.dataset.file || 'code.txt', text);
    flash(b, r.saved ? 'ok' : r.cancelled ? 'cancel' : 'fail', t(r.saved ? 'code.saved' : r.cancelled ? 'code.cancelled' : 'code.failed'));
  });
}
