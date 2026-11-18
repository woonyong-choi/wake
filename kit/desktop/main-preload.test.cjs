const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/* A-31: the module graph announced as <link rel="modulepreload"> holds JavaScript modules only. A JSON module
   (import … with { type: 'json' }) preloaded as a script fails strict MIME checking in the page ("application/json") */
/* A2-07: the first visit to a section waited 250–480ms for its document while the main process walked the page's module graph
   (a few hundred imports, one read after another). Every route page's graph is read once after the first window is up */
test('every_route_page_module_graph_is_read_ahead_after_the_first_window', () => {
  const source = readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const warm = /const warmPages = async \(\) => \{([\s\S]+?)\n    \};/.exec(source)?.[1] || '';
  assert.match(warm, /routes\.map\(r => r\.page\)/, 'every route page');
  assert.match(warm, /withPreloads\(/, 'its module graph, as the document response builds it');
  assert.match(source, /createWindow\(\);\n\s+setTimeout\(warmPages, \d+\)/, 'read ahead after the first window, not before it');
});

test('module_preload_graph_skips_json_modules_imported_with_a_type_attribute', () => {
  const source = readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const literal = /const IMPORT = (\/.+\/g);\n/.exec(source)?.[1];
  assert.ok(literal, 'main.cjs declares the import pattern');
  const IMPORT = new Function(`return ${literal}`)();
  const found = text => [...text.matchAll(IMPORT)].map(m => m[1] || m[2]);
  const [here, up] = ['.', '..'].map(d => d + '/'); /* sample import lines (built so no file reference is written here) */
  const app = `import ko from '${here}locale/ko.js';\nimport pkg from '${here}package.json' with { type: 'json' };\nimport { x } from '${up}data/x.js';\nimport '${here}side.js';\n`;
  assert.deepEqual(found(app), [`${here}locale/ko.js`, `${up}data/x.js`, `${here}side.js`]);
});
