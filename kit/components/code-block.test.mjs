import test from 'node:test';
import assert from 'node:assert/strict';
import { render, TOKENIZERS as T, syntaxOf } from './code-block.js';

const text = html => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

test('yaml: keys, quoted and bare strings, numbers and booleans, comments, list items and document separators', () => {
  assert.equal(T.yaml('  name: alpha # n1'), '  <span class="tk-k">name</span>: <span class="tk-s">alpha</span> <span class="tk-c"># n1</span>');
  assert.match(T.yaml('  replicas: 3'), /<span class="tk-n">3<\/span>/);
  assert.match(T.yaml('  paused: false'), /<span class="tk-n">false<\/span>/);
  assert.match(T.yaml('  memory: 512Mi'), /<span class="tk-n">512Mi<\/span>/);
  assert.match(T.yaml('  app: "payments"'), /<span class="tk-s">&quot;payments&quot;<\/span>/);
  assert.match(T.yaml('    - name: api'), /^    - <span class="tk-k">name<\/span>/);
  assert.equal(T.yaml('---'), '<span class="tk-c">---</span>');
  for (const l of ['  url: "http://x#y"', 'a: <b>', 'plain line']) assert.equal(text(T.yaml(l)), l, 'the text itself is kept');
});

test('json: keys, strings, numbers and literals', () => {
  const l = '  "name": "pay", "n": 3, "ok": true, "x": null';
  const h = T.json(l);
  assert.match(h, /<span class="tk-k">&quot;name&quot;<\/span>:/);
  assert.match(h, /<span class="tk-s">&quot;pay&quot;<\/span>/);
  assert.match(h, /<span class="tk-n">3<\/span>/);
  assert.match(h, /<span class="tk-n">true<\/span>/);
  assert.equal(text(h), l);
});

test('promql: functions and aggregations, strings, ranges and numbers, comments', () => {
  const l = 'sum by (job) (rate(cpu{ns="a"}[5m])) > 0.8 # n2';
  const h = T.promql(l);
  assert.match(h, /<span class="tk-k">sum<\/span>/); assert.match(h, /<span class="tk-k">rate<\/span>/); assert.match(h, /<span class="tk-k">by<\/span>/);
  assert.match(h, /<span class="tk-s">&quot;a&quot;<\/span>/); assert.match(h, /<span class="tk-n">\[5m\]<\/span>/); assert.match(h, /<span class="tk-n">0.8<\/span>/);
  assert.match(h, /<span class="tk-c"># n2<\/span>/);
  assert.equal(text(h), l);
});

test('log: time muted, levels coloured (alone or level=), key= names, quoted strings; markup never breaks', () => {
  const a = T.log('E1112 14:02:00.311 level=error msg="x1" unit=p');
  assert.match(a, /^<span class="tk-c">E1112 14:02:00.311<\/span>/);
  assert.match(a, /<span class="tk-k">level<\/span>=<span class="tk-e">error<\/span>/);
  assert.match(a, /<span class="tk-k">msg<\/span>=<span class="tk-s">&quot;x1&quot;<\/span>/);
  assert.match(T.log('2026-11-12T14:02:00Z WARN heap high'), /<span class="tk-w">WARN<\/span>/);
  assert.match(T.log('[2026-11-12 14:02:01] ERROR boom'), /<span class="tk-e">ERROR<\/span>/);
  for (const l of ['a=b c="d e" level=warn', 'INFO <x> & y']) assert.equal(text(T.log(l)), l);
});

test('the language comes from syntax, else lang, else the file extension; docs draw one block with --- between documents', () => {
  assert.equal(syntaxOf({ lang: 'yaml' }), 'yaml'); assert.equal(syntaxOf({ lang: 'YML' }), 'yaml'); assert.equal(syntaxOf({ path: 'x/a.json' }), 'json');
  assert.equal(syntaxOf({ lang: 'promql' }), 'promql'); assert.equal(syntaxOf({ lang: 'shell' }), 'sh'); assert.equal(syntaxOf({ lang: 'diff' }), null);
  const m = render({ lang: 'yaml', docs: ['a: 1\n', 'b: 2'] }).s;
  assert.equal((m.match(/data-c="code-block"/g) || []).length, 1);
  assert.match(m, /<div class="cb-line doc"><span class="ln">2<\/span><span data-line>---<\/span><span class="cb-tok" aria-hidden="true"><span class="tk-c">---<\/span><\/span><\/div>/);
  assert.match(m, /<span data-line>a: 1<\/span>/, 'the line as written stays the text of data-line');
  assert.match(render({ lang: 'yaml', text: 'k: v' }).s, /<span class="tk-k">k<\/span>/, 'lang alone colours the block');
});
