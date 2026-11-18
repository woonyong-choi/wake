/*
 * Report: the document a streamed report builds, as data. A page (or an AI streaming operations) applies ops one by one; the report keeps an undo
 * stack, a selection and the narrowing state of every block, and turns into a document model and Markdown. components/report-canvas.js draws it.
 *   Block { id, kind, sub? (a subsection of the section before it), title?, caption? (a figure's or a table's key numbers; several lines as an array), snapshot?: { source, query?, at (seconds) }, data, view }
 *     kind 'text'       data { text }                                                       (no items)
 *     kind 'statements' data { items: { id, label?, text, refs?: number[] }[] }  statements with the numbers of the evidence they rest on   items: statements
 *     kind 'table'      data { columns: { id, label, w? (a CSS width), end?, mono?, muted?, wrap?, excerpt?: ids }[], rows: { id, ... }[] }   items: rows
 *                       a cell keeps one line, except a prose cell (wrap: a to-do, an event's words, a condition) that wraps inside its cell; a column
 *                       with excerpt (raw text only: a log line, a query, a system message) is no cell: each row's whole value stands under the table
 *                       as a monospace excerpt line, led by that row's values of the excerpt's ids ('[1]', 'BackOff'); never a part of a value
 *     kind 'log'        data { lines: { id, n, text }[] }                                    items: lines
 *     kind 'timeline'   data { marks: { id, at, tip: { kind, title } }[] }  drawn as time rows   items: marks
 *     kind 'chart'      data { card: chart-card props whose chart.series are { key, name, ... } }  the kit chart, frozen   items: series (by key)
 *     kind 'summary'    data { items: { id, label, value }[] }  key and value rows               items: by id
 *     kind 'flow'       data { graph: flow-graph props }                                     (drawn whole; no items)
 *     view (what the ops did): out (ids that left), mark (ids pointed to), dim (ids quieted), around ({ ids, context }: a log folded round them),
 *          notes ({ '': a note on the block, [id]: a note on an item })
 *   Ops: { op: 'add', block, at? } | { op: 'filter', block, keep?: ids, drop?: ids } (rows and lines leave; chart series and timeline marks are dimmed
 *        instead) | { op: 'highlight', block, ids } | { op: 'collapse', block, around: ids, context? } | { op: 'annotate', block, id?, text }
 *        | { op: 'move', block, to } (to: the index it takes) | { op: 'remove', block } | { op: 'remove', blocks: ids } | { op: 'remove', items: { block, id }[] }
 *   Selection: keys, a block's id or `${block}/${item}`. It survives narrowing: an item stays selected while it is still there.
 */

const KINDS = ['text', 'statements', 'table', 'log', 'timeline', 'chart', 'summary', 'flow'];
const emptyView = () => ({ out: [], mark: [], dim: [], around: null, notes: {} });
const keyOf = (block, id) => (id == null ? String(block) : `${block}/${id}`);
const plain = v => (v == null ? '' : typeof v === 'object' && 's' in v ? String(v.s).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"') : String(v));

/** Every item a block has (before narrowing), with a label a person reads */
export function allItems(b) {
  const d = b.data || {};
  if (b.kind === 'table') { const first = d.columns?.[0]?.id; return (d.rows || []).map(r => ({ id: r.id, label: plain(first ? r[first] : r.id) })); }
  if (b.kind === 'log') return (d.lines || []).map(l => ({ id: l.id, label: l.text }));
  if (b.kind === 'timeline') return (d.marks || []).map(m => ({ id: m.id, label: plain(m.tip?.title || m.tip?.kind || m.id) }));
  if (b.kind === 'chart') return (d.card?.chart?.series || []).map(s => ({ id: s.key, label: plain(s.name ?? s.key) }));
  if (b.kind === 'statements') return (d.items || []).map(i => ({ id: i.id, label: plain(i.text) }));
  if (b.kind === 'summary') return (d.items || []).map(i => ({ id: i.id, label: [plain(i.label), plain(i.value)].filter(Boolean).join(' ') }));
  return [];
}

/** The lines a folded log still shows: those round the ones it is folded round, and how many are left out between them */
export function foldLines(lines, around) {
  if (!around?.ids?.length) return lines.map(l => ({ line: l }));
  const keep = new Set(), at = new Map(lines.map((l, i) => [l.id, i])), c = around.context ?? 2;
  for (const id of around.ids) { const i = at.get(id); if (i == null) continue; for (let k = Math.max(0, i - c); k <= Math.min(lines.length - 1, i + c); k++) keep.add(k); }
  const out = []; let gap = 0;
  lines.forEach((l, i) => { if (keep.has(i)) { if (gap) out.push({ fold: gap, id: `fold-${i}` }); gap = 0; out.push({ line: l }); } else gap++; });
  if (gap) out.push({ fold: gap, id: 'fold-end' });
  return out;
}

/** The items a block shows now: rows and lines that did not leave (and, in a folded log, the ones still shown) */
export function itemsOf(b) {
  const out = new Set(b.view?.out || []);
  let items = allItems(b).filter(x => !out.has(x.id));
  if (b.kind === 'log' && b.view?.around) { const shown = new Set(foldLines(items.map(x => ({ id: x.id })), b.view.around).filter(x => x.line).map(x => x.line.id)); items = items.filter(x => shown.has(x.id)); }
  return items;
}

const freshBlock = b => {
  if (!b || typeof b.id !== 'string' || !b.id || !KINDS.includes(b.kind)) throw new TypeError('invalid report block');
  return { ...b, view: { ...emptyView(), ...(b.view || {}) } };
};

/* keys that still point at something: a removed block or an item that left takes its key out of the selection */
function prune(state) {
  const live = new Set();
  for (const b of state.blocks) { live.add(b.id); for (const x of itemsOf(b)) live.add(keyOf(b.id, x.id)); }
  return { ...state, selected: state.selected.filter(k => live.has(k)) };
}

/** A report from its first blocks */
export const createState = (blocks = []) => ({ blocks: blocks.map(freshBlock), selected: [] });

/** One op applied: a new state (the old one is left as it was, for undo) */
export function applyOp(state, op) {
  const blocks = state.blocks.slice(), find = id => blocks.findIndex(b => b.id === id);
  const edit = (id, fn) => { const i = find(id); if (i < 0) throw new RangeError(`no report block ${id}`); const b = blocks[i]; blocks[i] = { ...b, view: fn({ ...b.view }, b) }; };
  const dims = b => b.kind === 'chart' || b.kind === 'timeline';
  switch (op?.op) {
    case 'add': {
      const b = freshBlock(op.block); if (find(b.id) >= 0) throw new RangeError(`report block ${b.id} exists`);
      const at = op.at == null ? blocks.length : Math.max(0, Math.min(blocks.length, op.at)); blocks.splice(at, 0, b); break;
    }
    case 'filter': edit(op.block, (v, b) => {
      const ids = allItems(b).map(x => x.id), leave = op.keep ? ids.filter(id => !op.keep.includes(id)) : (op.drop || []);
      if (dims(b)) v.dim = [...new Set([...v.dim, ...leave])]; else v.out = [...new Set([...v.out, ...leave])];
      return v;
    }); break;
    case 'highlight': edit(op.block, v => ({ ...v, mark: [...new Set([...v.mark, ...(op.ids || [])])] })); break;
    case 'collapse': edit(op.block, v => ({ ...v, around: { ids: op.around || [], context: op.context ?? 2 } })); break;
    case 'move': { const i = find(op.block); if (i < 0) throw new RangeError(`no report block ${op.block}`); const [b] = blocks.splice(i, 1); blocks.splice(Math.max(0, Math.min(blocks.length, op.to)), 0, b); break; }
    case 'annotate': edit(op.block, v => ({ ...v, notes: { ...v.notes, [op.id ?? '']: String(op.text ?? '') } })); break;
    case 'remove': {
      for (const id of [op.block, ...(op.blocks || [])].filter(x => x != null)) { const i = find(id); if (i >= 0) blocks.splice(i, 1); }
      for (const { block, id } of op.items || []) { const i = find(block); if (i < 0) continue; edit(block, (v, b) => (dims(b) ? { ...v, dim: [...new Set([...v.dim, id])] } : { ...v, out: [...new Set([...v.out, id])] })); }
      break;
    }
    default: throw new TypeError(`unknown report op ${op?.op}`);
  }
  return prune({ ...state, blocks });
}

/** A report with an undo stack: apply(op), undo(), the state now and whether there is something to undo */
export function createReport(blocks = []) {
  const past = [];
  let state = createState(blocks);
  return {
    get state() { return state; },
    get canUndo() { return past.length > 0; },
    apply(op) { const next = applyOp(state, op); past.push(state); state = next; return state; },
    undo() { if (past.length) { const sel = state.selected; state = prune({ ...past.pop(), selected: sel }); } return state; },
    select(fn) { state = fn(state); return state; },
  };
}

/* ---------- selection ---------- */
export { keyOf };
/** One key on or off (on: undefined flips it) */
export function toggle(state, key, on) {
  const has = state.selected.includes(key), want = on ?? !has;
  return { ...state, selected: want ? (has ? state.selected : [...state.selected, key]) : state.selected.filter(k => k !== key) };
}
/** What is selected, with the stable ids a page hands to the AI */
export function selectedItems(state) {
  const out = [];
  for (const k of state.selected) {
    const [block, ...rest] = k.split('/'), id = rest.length ? rest.join('/') : null, b = state.blocks.find(x => x.id === block); if (!b) continue;
    if (id == null) out.push({ block, id: null, kind: b.kind, label: plain(b.title ?? b.id) });
    else { const x = allItems(b).find(i => String(i.id) === id); if (x) out.push({ block, id: x.id, kind: b.kind, label: x.label }); }
  }
  return out;
}
/** The op that deletes what is selected: whole blocks, and items of the blocks that stay */
export function deleteSelectedOp(state) {
  const items = selectedItems(state), blocks = items.filter(x => x.id == null).map(x => x.block);
  return { op: 'remove', blocks, items: items.filter(x => x.id != null && !blocks.includes(x.block)).map(x => ({ block: x.block, id: x.id })) };
}

/* ---------- export ---------- */
/** A table's excerpt: for each row, and in it each excerpt column with a value, one line led by the row's values of the column's excerpt ids
 *  (and the column's label when the table has more than one excerpt column) */
export function excerpt(columns, rows) {
  const cols = columns.filter(x => x.excerpt), named = cols.length > 1, out = [];
  for (const r of rows) for (const c of cols) { const v = plain(r[c.id]); if (v) out.push({ id: r.id, text: [...c.excerpt.map(k => plain(r[k])), named ? plain(c.label) : ''].filter(Boolean).concat(v).join('  ') }); }
  return out;
}

/** The section numbers by order: a block is the next section ('4'), a sub block the next part of the section before it ('4.1'); they follow a move */
export function numbers(state) {
  const out = new Map(); let top = 0, part = 0;
  for (const b of state.blocks) { if (b.sub && top) out.set(b.id, `${top}.${++part}`); else { top += 1; part = 0; out.set(b.id, String(top)); } }
  return out;
}

/**
 * The report as a document: { type: 'heading' | 'paragraph' | 'table' | 'code' | 'list' | 'groups' | 'caption' | 'note', ... , source?: number } nodes
 * and the sources (source · query · captured at) they point to. format(at) writes a capture time (default: ISO). Each block heads its section with
 * its number ('4.1 title'); a figure is its caption (the key numbers: peak and its time, threshold, window) and its source, a log keeps its line
 * numbers and says what it leaves out, statements are grouped by their label with their evidence numbers.
 */
export function toDocument(state, { format = at => new Date(at * 1000).toISOString(), hidden = n => `… ${n}` } = {}) {
  const nodes = [], sources = [], nums = numbers(state);
  const cite = s => (s ? (sources.push([s.source, s.query, s.at != null ? format(s.at) : null].filter(Boolean).join(' · ')), sources.length) : null);
  for (const b of state.blocks) {
    const v = b.view, d = b.data || {}, src = cite(b.snapshot);
    if (b.title) nodes.push({ type: 'heading', level: b.sub ? 3 : 2, text: `${nums.get(b.id)} ${plain(b.title)}`, source: src });
    if (v.notes['']) nodes.push({ type: 'note', text: v.notes[''] });
    const shown = new Set(itemsOf(b).map(x => x.id)), mark = new Set(v.mark);
    if (b.kind === 'text') nodes.push({ type: 'paragraph', text: plain(d.text) });
    if (b.kind === 'statements') { /* grouped by their label: a statement with none belongs to the label above it */
      const groups = []; for (const i of (d.items || []).filter(x => shown.has(x.id))) { const text = `${plain(i.text)}${i.refs?.length ? ` ${i.refs.map(r => (r && typeof r === 'object' ? ` (${r.label})` : `[${r}]`)).join('').trim()}` : ''}`; if (i.label || !groups.length) groups.push({ label: plain(i.label ?? ''), items: [text] }); else groups.at(-1).items.push(text); }
      nodes.push({ type: 'groups', groups });
    }
    if (b.kind === 'table') {
      const rows = d.rows.filter(r => shown.has(r.id)), cols = d.columns.filter(c => !c.excerpt), ex = excerpt(d.columns, rows);
      nodes.push({ type: 'table', head: cols.map(c => plain(c.label)), rows: rows.map(r => ({ marked: mark.has(r.id), cells: cols.map(c => plain(r[c.id])) })) });
      if (ex.length) nodes.push({ type: 'code', lang: 'text', text: ex.map(x => x.text).join('\n') });
    }
    if (b.kind === 'log') {
      const lines = d.lines.filter(l => !v.out.includes(l.id)), w = String(lines.at(-1)?.n ?? '').length;
      nodes.push({ type: 'code', lang: 'log', text: foldLines(lines, v.around).map(x => (x.fold ? hidden(x.fold) : `${String(x.line.n).padStart(w)}${mark.has(x.line.id) ? ' >' : '  '} ${x.line.text}`)).join('\n') });
    }
    if (b.kind === 'timeline') nodes.push({ type: 'table', head: ['at', 'kind', 'title'], rows: (d.marks || []).filter(m => !v.dim.includes(m.id)).map(m => ({ marked: mark.has(m.id), cells: [format(m.at), plain(m.tip?.kind), plain(m.tip?.title)] })) });
    if (b.kind === 'summary') nodes.push({ type: 'table', head: ['', ''], rows: (d.items || []).filter(i => shown.has(i.id)).map(i => ({ marked: mark.has(i.id), cells: [plain(i.label), plain(i.value)] })) });
    if (b.kind === 'flow') nodes.push({ type: 'list', items: (d.graph?.nodes || []).map(n => [plain(n.label), plain(n.sub)].filter(Boolean).join(' · ')) });
    for (const c of [b.caption ?? []].flat().filter(Boolean)) nodes.push({ type: 'caption', text: plain(c) });
    for (const [id, text] of Object.entries(v.notes)) if (id) nodes.push({ type: 'note', text: `${allItems(b).find(x => String(x.id) === id)?.label ?? id}: ${text}` });
  }
  return { nodes, sources };
}

const cell = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
/**
 * The report as Markdown: the title and its head (name and value rows), numbered section headings, tables (pointed rows bold), code fences with line
 * numbers, captions in italics, notes as quotes, sources as footnotes.
 */
export function toMarkdown(state, { title, head, format, hidden } = {}) {
  const { nodes, sources } = toDocument(state, { format, hidden });
  const out = title ? [`# ${title}`, ''] : [];
  if (head?.length) out.push('| | |', '| --- | --- |', ...head.map(h => `| ${cell(h.label)} | ${cell(h.value)} |`), '');
  for (const n of nodes) {
    if (n.type === 'heading') out.push(`${'#'.repeat(n.level ?? 2)} ${n.text}${n.source ? `[^${n.source}]` : ''}`, '');
    else if (n.type === 'paragraph') out.push(n.text, '');
    else if (n.type === 'caption') out.push(`*${n.text}*`, '');
    else if (n.type === 'note') out.push(`> ${n.text}`, '');
    else if (n.type === 'list') out.push(...n.items.map(i => `- ${i}`), '');
    else if (n.type === 'groups') out.push(...n.groups.flatMap(g => (g.items.length === 1 ? [`- ${g.label ? `${g.label}: ` : ''}${g.items[0]}`] : [`- ${g.label}`, ...g.items.map(i => `  - ${i}`)])), '');
    else if (n.type === 'code') out.push(`\`\`\`${n.lang || ''}`, n.text, '```', '');
    else if (n.type === 'table') out.push(n.head.some(Boolean) ? `| ${n.head.map(cell).join(' | ')} |` : `|${' |'.repeat(n.head.length)}`, `| ${n.head.map(() => '---').join(' | ')} |`, ...n.rows.map(r => `| ${r.cells.map((c, i) => (i === 0 && r.marked ? `**${cell(c)}**` : cell(c))).join(' | ')} |`), '');
  }
  sources.forEach((s, i) => out.push(`[^${i + 1}]: ${s}`));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
