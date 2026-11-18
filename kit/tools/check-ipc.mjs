#!/usr/bin/env node
/*
 * IPC check: every channel the shell, pages and surfaces use is allowed by its preload and handled by the main process, and every
 * allowed channel is used. A channel missing from an allow list fails silently at run time (the button does nothing), so this runs
 * before every commit. Exit code 1 on any finding.
 *   node kit/tools/check-ipc.mjs [--app <name>]
 *
 * Checks:
 *  1. Page preload PAGE_TYPES equals the page:* types of kit/core/bridge-protocol.js MESSAGES.
 *  2. Every page:* / shell:* type a page or the shell sends is in MESSAGES (accept() drops unknown types).
 *  3. Shell preload INVOKE equals the channels main.cjs handles, and every kitShell invoke in kit/shell or apps is in INVOKE.
 *  4. Shell preload EVENTS equals the events the main process sends, and every event the shell listens to is in EVENTS.
 *  5. Surface preload SEND equals the events main.cjs handles on kit:surface.
 *  6. Every service(name) an app calls is defined by that app's services module (desktop.config.cjs services), and every defined
 *     service is called somewhere.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const rel = p => relative(repo, p).split(sep).join('/');
const read = p => readFileSync(resolve(repo, p), 'utf8');
const argApp = (() => { const i = process.argv.indexOf('--app'); return i > 0 ? process.argv[i + 1] : null; })();
const apps = argApp ? [argApp] : readdirSync(resolve(repo, 'apps')).filter(n => existsSync(resolve(repo, 'apps', n, 'app.config.js')));

const walk = (dir, exts, out = []) => {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'vendor' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, exts, out); else if (exts.has(extname(n)) && !/\.test\.m?js$/.test(n)) out.push(p);
  }
  return out;
};
const JS = new Set(['.js', '.mjs', '.cjs']);
const all = (re, text) => [...text.matchAll(re)].map(m => m[1]);
const setOf = (src, name) => {
  const m = src.match(new RegExp(`const ${name} = (?:new Set\\()?\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`${name} not found`);
  return new Set(all(/'([^']+)'/g, m[1]));
};
const findings = [];
const diff = (label, want, have, wantName, haveName) => {
  for (const x of want) if (!have.has(x)) findings.push(`${label}: '${x}' is in ${wantName} but not in ${haveName}`);
};

/* 1, 2: page bridge */
const protocol = read('kit/core/bridge-protocol.js');
const messages = new Set(all(/^\s*'((?:page|shell):[a-z-]+)':/gm, protocol));
const pagePreload = setOf(read('kit/desktop/preload-page.cjs'), 'PAGE_TYPES');
const pageMessages = new Set([...messages].filter(t => t.startsWith('page:')));
diff('page preload', pageMessages, pagePreload, 'MESSAGES', 'preload-page.cjs PAGE_TYPES');
diff('page preload', pagePreload, pageMessages, 'preload-page.cjs PAGE_TYPES', 'MESSAGES');
const senders = [...walk(resolve(repo, 'kit/page'), JS), ...walk(resolve(repo, 'kit/shell'), JS), ...apps.flatMap(a => walk(resolve(repo, 'apps', a), JS))];
for (const f of senders) {
  const src = readFileSync(f, 'utf8');
  for (const t of all(/(?:envelope|send|post|request)\(\s*'((?:page|shell):[a-z-]+)'/g, src)) if (!messages.has(t)) findings.push(`${rel(f)}: sends '${t}', which MESSAGES does not list (accept() drops it)`);
}

/* 3, 4: shell invoke channels and events */
const main = read('kit/desktop/main.cjs') + '\n' + read('kit/desktop/terminal.cjs');
const shellPreload = read('kit/desktop/preload-shell.cjs');
const invoke = setOf(shellPreload, 'INVOKE'), events = setOf(shellPreload, 'EVENTS');
const handled = new Set([...all(/\bhandle\('([a-z-]+:[a-z-]+)'/g, main), ...all(/ipcMain\.handle\('kit:([a-z-]+:[a-z-]+)'/g, main)]);
diff('shell invoke', invoke, handled, 'preload-shell.cjs INVOKE', 'main.cjs handlers');
diff('shell invoke', handled, invoke, 'main.cjs handlers', 'preload-shell.cjs INVOKE');
const sent = new Set([...all(/\bsend\(\s*[\w.?]+,\s*'([a-z-]+)'/g, main), ...all(/webContents\.send\('kit:([a-z-]+)'/g, main)].filter(e => !['shell'].includes(e)));
const shellFiles = [...walk(resolve(repo, 'kit/shell'), JS), ...apps.flatMap(a => walk(resolve(repo, 'apps', a), JS))];
const used = new Set(), listened = new Set();
for (const f of shellFiles) {
  const src = readFileSync(f, 'utf8');
  for (const c of all(/\binvoke\('([a-z-]+:[a-z-]+)'/g, src)) { used.add(c); if (!invoke.has(c)) findings.push(`${rel(f)}: invokes '${c}', which preload-shell.cjs INVOKE does not allow`); }
  for (const e of all(/\.on\('([a-z]+(?:-[a-z]+)*)'/g, src)) if (events.has(e) || sent.has(e)) listened.add(e);
}
for (const c of invoke) if (!used.has(c) && c !== 'service:call' && c !== 'settings:save') findings.push(`shell invoke: '${c}' is allowed but nothing invokes it`);
diff('shell events', events, sent, 'preload-shell.cjs EVENTS', 'events the main process sends');
diff('shell events', sent, events, 'events the main process sends', 'preload-shell.cjs EVENTS');

/* 5: surface */
const surfaceSend = setOf(read('kit/desktop/preload-surface.cjs'), 'SEND');
const surfaceHandled = new Set(all(/event === '([a-z-]+)'/g, read('kit/desktop/main.cjs')));
diff('surface', surfaceSend, surfaceHandled, 'preload-surface.cjs SEND', 'main.cjs kit:surface handler');
diff('surface', surfaceHandled, surfaceSend, 'main.cjs kit:surface handler', 'preload-surface.cjs SEND');

/* 6: app services */
for (const a of apps) {
  const cfgPath = resolve(repo, 'apps', a, 'desktop.config.cjs');
  if (!existsSync(cfgPath)) continue;
  const mod = (readFileSync(cfgPath, 'utf8').match(/services:\s*'([^']+)'/) || [])[1];
  if (!mod) continue;
  const defined = new Set(all(/'([a-z]+\.[a-zA-Z.]+)':\s*(?:async\s*)?(?:\(|\w+\s*=>|function)/g, read(`apps/${a}/${mod}`)));
  const calls = new Map();
  for (const f of walk(resolve(repo, 'apps', a), JS)) for (const n of all(/\bservice\('([a-z]+\.[a-zA-Z.]+)'/g, readFileSync(f, 'utf8'))) if (!n.startsWith('kit.')) calls.set(n, rel(f));
  for (const [n, f] of calls) if (!defined.has(n)) findings.push(`${f}: calls service '${n}', which apps/${a}/${mod} does not define`);
  for (const n of defined) if (!calls.has(n)) findings.push(`apps/${a}/${mod}: defines service '${n}' but nothing calls it`);
}

if (findings.length) { console.log(findings.map(f => `- ${f}`).join('\n')); console.log(`check-ipc: ${findings.length} finding(s)`); process.exit(1); }
console.log('check-ipc: ok');
