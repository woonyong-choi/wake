#!/usr/bin/env node
/*
 * Scaffold a new app from the sample app (apps/sample), which uses only kit public entries and definitions.
 *   node kit/tools/create-app.mjs <id> <Name> [--from <app folder>]
 * Copies apps/<from> (default sample) to apps/<id> and renames its id, name, scheme, string prefix and brand glyph key
 * (the template's app id and name, read from its app.config.js, become <id> and <Name>). Then run the checks in kit/README.md step 10.
 * What to change next: assets/icon (icon.png on the platform icon template, icon.icns for packaging), the brand mark in glyphs.js,
 * the colors in theme.css, locale/*.js, routes.js and app.config.js.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const [id, name] = args;
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : 'sample';
if (!id || !name || !/^[a-z][a-z0-9-]*$/.test(id)) { console.error('usage: create-app.mjs <id: lowercase> <Name> [--from <app folder>]'); process.exit(2); }
const src = join(repo, 'apps', from), dst = join(repo, 'apps', id);
if (!existsSync(join(src, 'app.config.js'))) { console.error(`no app at apps/${from}`); process.exit(2); }
if (existsSync(dst)) { console.error(`apps/${id} already exists`); process.exit(2); }
const tpl = (await import(pathToFileURL(join(src, 'app.config.js')))).default;
const oldId = tpl.id, oldName = tpl.name;
const TEXT = new Set(['.js', '.cjs', '.mjs', '.css', '.html', '.json', '.md']);
const swap = s => s.replaceAll(oldId, id).replaceAll(oldName, name);
let files = 0;
const copy = (a, b) => {
  mkdirSync(b, { recursive: true });
  for (const n of readdirSync(a)) {
    const p = join(a, n), q = join(b, n);
    if (statSync(p).isDirectory()) { copy(p, q); continue; }
    if (TEXT.has(extname(n))) writeFileSync(q, swap(readFileSync(p, 'utf8'))); else copyFileSync(p, q);
    files++;
  }
};
copy(src, dst);
console.log(`apps/${id}: ${files} files from apps/${from} (${oldId} -> ${id}, ${oldName} -> ${name})`);
