/*
 * UI quality gate (static), run by check-reuse.mjs: every finding fails the run. The rules are written down in kit/QUALITY.md.
 *   icons        an inline <svg> only in the icon set (kit/icons, the app glyph files, the brand glyphs) or in a data drawing marked
 *                "quality:drawing" (charts, graphs, a progress ring); a kit icon('name') call names an icon of the kit set
 *   motion       transitions and animations take their time and easing from tokens (var(--…)); only 0s and linear (a steady loop) are literal;
 *                in the first-run, terminal and frame components a part shown or hidden by display carries "quality:instant" (why it may jump)
 *   interaction  a kit button or role="button" element class has a :hover style (its own or its parent's), and the kit has a press (:active),
 *                focus-visible and disabled style for buttons
 *   sizes        component CSS: no px literal without a reason; one primitive per role (rows, floating surfaces)
 *   actions      every button's action has a handler that does something; pages sit in the one page column
 *   raw text     app screens show no raw error text (e.message, r.error) in a toast, row or description: raw text only in the output view;
 *                no progress shown as a fraction ("3/6", "{k}/{n}", `${a}/${b}`) in a dictionary text or a kit or app screen template
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export function qualityProblems({ repo, rel, walk }) {
  const out = [];
  const read = p => readFileSync(p, 'utf8');
  const lineOf = (src, i) => src.slice(0, i).split('\n').length;
  const kitFiles = [...walk(`${repo}/kit/components`), ...walk(`${repo}/kit/shell`), ...walk(`${repo}/kit/page`)].filter(p => p.endsWith('.js'));
  const appFiles = walk(`${repo}/apps`).filter(p => /\.(js|mjs)$/.test(p) && !p.endsWith('.test.mjs'));
  const iconSet = new Set([...read(`${repo}/kit/icons/base-map.js`).matchAll(/^\s*'([\w-]+)'/gm)].map(m => m[1]));

  /* icons */
  const iconFiles = /kit\/icons\/|\/glyphs\.js$|brand-glyphs\.js$/;
  for (const p of [...kitFiles, ...appFiles]) {
    const src = read(p), r = rel(p);
    if (iconFiles.test(r)) continue;
    if (/<svg[\s>]/.test(src) && !/quality:drawing/.test(src)) out.push(`${r}: inline <svg> outside the icon set (use icon() or mark a data drawing "quality:drawing")`);
    if (r.startsWith('kit/')) for (const m of src.matchAll(/\bicon\('([\w-]+)'\s*[,)]/g)) if (!iconSet.has(m[1])) out.push(`${r}:${lineOf(src, m.index)}: icon '${m[1]}' is not in the kit icon set`);
  }

  /* motion */
  const cssFiles = [...kitFiles.map(p => [p, read(p)]), [`${repo}/kit/base.css`, read(`${repo}/kit/base.css`)], ...walk(`${repo}/apps`).filter(p => p.endsWith('theme.css')).map(p => [p, read(p)])];
  const easing = /\b(cubic-bezier\(|steps\(|ease-in-out\b|ease-in\b|ease-out\b|ease\b)/;
  for (const [p, src] of cssFiles) {
    for (const m of src.matchAll(/\b(transition|animation)(-duration|-timing-function|-delay)?\s*:\s*([^;}`]+)/g)) {
      const v = m[3].replace(/var\([^)]*\)/g, '').replace(/calc\([^)]*\)/g, '');
      const lit = v.match(/(?<![\w-])(\d*\.?\d+)(ms|s)\b/g)?.filter(x => parseFloat(x) !== 0);
      if (lit?.length) out.push(`${rel(p)}:${lineOf(src, m.index)}: ${m[1]} with a literal time (${lit.join(', ')}); use a motion token`);
      if (easing.test(v)) out.push(`${rel(p)}:${lineOf(src, m.index)}: ${m[1]} with a literal easing; use a motion token`);
    }
  }
  for (const p of kitFiles.filter(p => /\/(first-run|terminal-panel|app-frame)\.js$/.test(p))) {
    const src = read(p);
    for (const m of src.matchAll(/^.*display:\s*none.*$/gm)) if (!/quality:instant/.test(m[0])) out.push(`${rel(p)}:${lineOf(src, m.index)}: shown or hidden by display without a transition (or a "quality:instant" reason)`);
  }

  /* nothing working or waiting is still: a running flow's text and the busy and waiting status icons move without end */
  const still = [['kit/components/flow-status.js', /\.fs-shim[^{]*\{[^}]*infinite/, 'running flow text'],
    ['kit/components/status-icon.js', /\.sti\.busy[^{]*\{[^}]*infinite/, 'busy status'], ['kit/components/status-icon.js', /\.sti\.attn[^{]*\{[^}]*infinite/, 'waiting status']];
  for (const [f, re, what] of still) if (!re.test(read(`${repo}/${f}`))) out.push(`${f}: the ${what} has no continuous motion`);

  /* interaction */
  const allCss = cssFiles.map(([, s]) => s).join('\n');
  for (const p of kitFiles) {
    const src = read(p);
    for (const m of src.matchAll(/<button[^>]*?class="([\w-]+)|class="([\w-]+)[^"]*"[^>]*role="button"/g)) {
      const c = m[1] || m[2];
      if (!new RegExp(`\\.${c}(\\.[\\w-]+|\\[[^\\]]+\\])*:hover|\\.${c}[^{,]*:hover|:has\\(\\.${c}:hover\\)`).test(allCss) && !new RegExp(`:hover[^{]*\\.${c}\\b`).test(allCss))
        out.push(`${rel(p)}:${lineOf(src, m.index)}: clickable .${c} has no :hover style`);
    }
  }
  const base = read(`${repo}/kit/base.css`);
  if (!/:active/.test(base)) out.push('kit/base.css: no press (:active) style for buttons');
  if (!/:focus-visible/.test(base)) out.push('kit/base.css: no focus-visible style');
  if (!/:disabled/.test(base)) out.push('kit/base.css: no disabled style for buttons');

  /* raw text */
  for (const p of appFiles.filter(p => !/\/desktop\/|\/data\//.test(p) && basename(p) !== 'desktop.cjs')) {
    const src = read(p);
    for (const m of src.matchAll(/\b(body|desc|description|label)\s*:\s*[^,}]*\b(e\.message|err\.message|r\.error|\.error\.slice|String\(e\b)/g))
      out.push(`${rel(p)}:${lineOf(src, m.index)}: raw error text on screen (show it only in the output view)`);
  }
  /* progress fractions: dictionary texts and screen templates (data such as a ready count 1/1 lives in data files and is not scanned) */
  const dicts = [...walk(`${repo}/kit/locale`), ...walk(`${repo}/apps`).filter(p => /\/locale\/[\w-]+\.js$/.test(p))];
  for (const p of dicts) { const src = read(p); for (const m of src.matchAll(/'([\w.-]+)':\s*'([^']*)'/g)) if (/\{\w+\}\s*\/\s*\{\w+\}|\b\d+\s*\/\s*\d+\b/.test(m[2])) out.push(`${rel(p)}:${lineOf(src, m.index)}: '${m[1]}' shows progress as a fraction`); }
  for (const p of [...kitFiles, ...appFiles.filter(p => !/\/desktop\/|\/data\/|\/locale\//.test(p))]) { const src = read(p); for (const m of src.matchAll(/\$\{[^}]+\}\s*\/\s*\$\{[^}]+\}/g)) { const line = src.split('\n')[lineOf(src, m.index) - 1]; if (!/https?:|address|path|url|join\(|'\/'|[a-z]+:\/\/|\bid\b|===|dataset/i.test(line)) out.push(`${rel(p)}:${lineOf(src, m.index)}: a fraction in a screen template (no n/m progress)`); } }

  /* sizes: component CSS takes sizes and spacing from tokens; a non-zero px literal fails unless its line says why ("quality:literal: …") */
  for (const p of walk(`${repo}/kit/components`).filter(p => p.endsWith('.js'))) {
    const src = read(p), css = /export const css = `([\s\S]*?)`;/.exec(src)?.[1] || '';
    css.split('\n').forEach(l => { const lit = (l.match(/(?<![\w.-])(\d*\.?\d+)px\b/g) || []).filter(x => parseFloat(x) !== 0); if (lit.length && !/quality:literal/.test(l)) out.push(`${rel(p)}: a px literal (${lit.join(', ')}) in component CSS; use a size or spacing token`); });
  }

  /* one primitive per role: a row is the settings row, a floating surface is the menu surface (--float-*). A component whose name says it
     is a row, menu, popover or tooltip must be one of the registered compositions (kit/QUALITY.md, "Primitives") */
  const ROLES = new Set(['settings-row', 'list-row', 'connection-row', 'sidebar-row', 'step-row', 'action-row', 'menu', 'menu-item', 'submenu', 'popover', 'context-menu', 'tooltip']);
  for (const p of walk(`${repo}/kit/components`).filter(p => /(row|menu|popover|tooltip)\.js$/.test(p))) { const n = basename(p, '.js'); if (!ROLES.has(n)) out.push(`${rel(p)}: a new ${n} duplicates a primitive's role (compose settings-row or the menu surface; register it in kit/QUALITY.md)`); }

  /* every button does something: each action a kit or app button names has a handler, and no handler is empty. A kit component action a page
     must handle when it opts in (selectable tables) is listed with its reason */
  const PAGE_CONTRACT = { 'kit.table.select': 'a selectable data table: the page that sets selectable handles it', 'kit.table.select-all': 'a selectable data table: the page that sets selectable handles it' };
  const defined = new Set(), used = new Map();
  for (const p of [...kitFiles, ...appFiles, `${repo}/kit/components/index.js`]) {
    const src = read(p);
    for (const m of src.matchAll(/'([a-z]+\.[\w.-]+)':\s*(?:async\s*)?(?:\([^)]*\)|[a-z_]\w*)\s*=>\s*(\{\s*\})?/g)) { defined.add(m[1]); if (m[2]) out.push(`${rel(p)}:${lineOf(src, m.index)}: '${m[1]}' does nothing (make it work or remove its button)`); }
    for (const m of src.matchAll(/name === '([a-z]+\.[\w.-]+)'/g)) defined.add(m[1]);
    for (const m of src.matchAll(/(?:action|data-action|rowAction|followAction|wrapAction|queryAction|sortAction)\s*[:=]\s*['"]([a-z]+\.[\w.-]+)['"]/g)) if (!used.has(m[1])) used.set(m[1], `${rel(p)}:${lineOf(src, m.index)}`);
  }
  for (const [a, at] of used) if (!defined.has(a) && !PAGE_CONTRACT[a]) out.push(`${at}: '${a}' has no handler (a button that does nothing)`);
  for (const p of appFiles.filter(p => /\/pages\//.test(p))) { const src = read(p); if (/selectable:\s*true/.test(src) && !/'kit\.table\.select'/.test(src)) out.push(`${rel(p)}: a selectable table without its kit.table.select handler`); }

  /* page column: every in-tab page sits in the page column of its screen type (home, list, chat), never a width of its own */
  for (const p of appFiles.filter(p => /\/pages\/[\w-]+\.js$/.test(p))) {
    const src = read(p);
    for (const m of src.matchAll(/pageColumn\.render\(\{([^}]*)/g)) if (!/\bwidth: '(home|list|chat)'/.test(m[1])) out.push(`${rel(p)}: a page column without its screen type width (home, list, chat)`);
    if (/bootPage\(/.test(src) && !/pageColumn\.render|createSettingsPage|createChatPage|createStartPage/.test(src)) out.push(`${rel(p)}: an in-tab page outside the page column`);
  }
  return out;
}
