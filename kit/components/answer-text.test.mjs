import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }

/* an answer keeps its paragraphs (blank lines) and its line breaks: the "- " lines of one paragraph are not joined into one line */
test('answer_text_keeps_line_breaks_inside_a_paragraph_so_list_lines_are_not_joined', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const lines = await page.evaluate(async () => {
      const answer = await import('/kit/components/answer-text.js');
      const style = document.createElement('style'); style.textContent = answer.css; document.head.append(style);
      document.querySelector('main').innerHTML = String(answer.render({ blocks: [{ p: ['Most restarts:\n- checkout-api 13\n- session-gateway 5'] }, { p: ['Done.'] }] }));
      return [...document.querySelectorAll('.ans p')].map(p => p.innerText.split('\n'));
    });
    assert.deepEqual(lines, [['Most restarts:', '- checkout-api 13', '- session-gateway 5'], ['Done.']], 'list lines stay on their own lines');
  } finally {
    await browser?.close();
    server.close();
  }
});

/* AI-2: an answer's Markdown is read as a safe subset (paragraphs, line breaks, lists, bold, inline code, code blocks, pipe tables).
   Everything else stays text: no HTML passes through, a link is its words and an http(s) address as text, never an <a> */
test('answer_markdown_reads_paragraphs_lists_bold_code_and_tables_into_answer_parts', async () => {
  const { parse } = await import('./answer-text.js');
  const parts = parse([
    'Most restarts:',
    '- **checkout-api** 13',
    '- `session-gateway` 5',
    '',
    '1. first',
    '2. second',
    '',
    '| Group | Item | Count |',
    '|---|:--|--:|',
    '| payments | `a|b` | 13 |',
    '',
    '```yaml',
    'kind: Item',
    '',
    'spec: {}',
    '```',
    'line one',
    'line two',
  ].join('\n'));
  assert.deepEqual(parts, [
    { type: 'text', blocks: [{ p: ['Most restarts:'] }, { ul: [[{ b: ['checkout-api'] }, ' 13'], [{ code: 'session-gateway' }, ' 5']] }, { ol: [['first'], ['second']], start: 1 }] },
    { type: 'table', head: ['Group', 'Item', 'Count'], rows: [[['payments'], [{ code: 'a|b' }], ['13']]] },
    { type: 'code', lang: 'yaml', text: 'kind: Item\n\nspec: {}' },
    { type: 'text', blocks: [{ p: ['line one\nline two'] }] },
  ]);
});

test('answer_markdown_escapes_html_and_never_draws_a_link', async () => {
  const { parse, render } = await import('./answer-text.js');
  const parts = parse('<img src=x onerror="alert(1)"> and <script>alert(2)</script>\n\n[click](javascript:alert(3)) or [docs](https://example.com/a) **bold `code` bold**');
  assert.ok(parts.every(p => p.type === 'text'));
  const out = String(render({ blocks: parts.flatMap(p => p.blocks) }));
  assert.doesNotMatch(out, /<img|<script|<a |javascript:/);
  assert.match(out, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(out, /click/);
  assert.match(out, /docs \(https:\/\/example\.com\/a\)/);
  assert.match(out, /<strong>bold <code>code<\/code> bold<\/strong>/);
});

/* a streamed answer is read as it grows: an unclosed fence is already a code block, a table head without its rule line is still text */
test('answer_markdown_reads_a_half_written_answer_without_breaking', async () => {
  const { parse } = await import('./answer-text.js');
  assert.deepEqual(parse('Run:\n```sh\napp list items'), [{ type: 'text', blocks: [{ p: ['Run:'] }] }, { type: 'code', lang: 'sh', text: 'app list items' }]);
  assert.deepEqual(parse('| Item | Count |'), [{ type: 'text', blocks: [{ p: ['| Item | Count |'] }] }]);
  assert.deepEqual(parse('**half bold'), [{ type: 'text', blocks: [{ p: ['**half bold'] }] }]);
});

/* a short preview of an answer (a new tab's recent conversation card) is its words without the Markdown marks; a table or code block adds nothing */
test('answer_plain_text_reads_a_markdown_answer_without_its_marks', async () => {
  const { plain } = await import('./answer-text.js');
  assert.equal(plain('Most **restarts** in `api`:\n\n| Item | Count |\n|---|---|\n| api | 13 |\n\n- first\n- second\n\n```sh\napp list items\n```'), 'Most restarts in api: first second');
  assert.equal(plain('| Item | Count |\n|---|---|\n| api | 13 |'), '');
  assert.equal(plain('<b>x</b> [docs](https://example.com)'), '<b>x</b> docs (https://example.com)');
});

/* B2-10: an answer's markdown table (message-table, fixed layout) let a long token run into the next column ("FailedComputeMetricsRep21as"):
   a cell's words wrap inside their own column, a long name breaks where it must */
test('answer_table_cells_wrap_inside_their_own_column', async () => {
  const { css } = await import('./message-table.js');
  const td = /\.mt td \{([^}]*)\}/.exec(css)?.[1] || '', th = /\.mt th \{([^}]*)\}/.exec(css)?.[1] || '';
  assert.match(td, /overflow-wrap: anywhere/);
  assert.match(th, /overflow-wrap: anywhere/);
});

/* B2-10 (verified in a browser, 3b had only the CSS rule): an answer table with a long unbroken word (a full image path) at a narrow width keeps
   every cell's words inside its own column; nothing spills over the next cell */
test('answer_table_with_a_long_word_keeps_each_cell_inside_its_column_in_a_browser', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main style="width:var(--dialog-w-sm)"></main>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const spill = await page.evaluate(async () => {
      const table = await import('/kit/components/message-table.js');
      const style = document.createElement('style'); style.textContent = table.css; document.head.append(style);
      const long = 'registry.example.internal/platform/payments/checkout-api@sha256:4f1c0e7a9b2d3c4e5f60718293a4b5c6d7e8f9012345678';
      document.querySelector('main').innerHTML = String(table.render({ head: ['Name', 'Image', 'Restarts'], rows: [['checkout-api-7d9f', long, '13'], ['orders-5b6c', 'nginx:1.27', '0']] }));
      const cells = [...document.querySelectorAll('.mt td, .mt th')];
      return { n: cells.length, over: cells.filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent.slice(0, 30)) };
    });
    assert.equal(spill.n, 9, 'the table drew');
    assert.deepEqual(spill.over, [], 'no cell spills over its neighbour');
  } finally {
    await browser?.close();
    server.close();
  }
});
