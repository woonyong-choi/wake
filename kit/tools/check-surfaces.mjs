/*
 * Surface rules shared by check-states (corner radii, no inner frame) and check-glass (what shows through a menu), kept apart so that
 * check-surfaces.test.mjs can hold each rule against pages built to pass and to fail.
 * The functions named *_IN_PAGE run inside the page (page.evaluate) and use nothing from this module.
 */
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

/* Corner radius per role: [selector, radius px, superellipse factor (1 = circular arc), basis].
   spec/rules.md#RULE-PANE a role token's computed value is its table value x --squircle (1.4) with the superellipse(1.4) corner; --r-surface (23) and
   --r-window (16) are circular. spec/rules.md#RULE-PANE the side tone (the AI conversation, the sidebar, settings) moves to the roles without changing its pixels,
   so those parts keep the values measured on the reference. */
export const RADII = [
  ['.frame-main', 16, 1, 'spec/rules.md#RULE-PANE --r-window 16, circular'],
  ['.cmp:not(.wide)', 22.4, 1, 'spec/rules.md#RULE-PANE --r-dialog (composer); spec/rules.md#RULE-PANE side tone keeps the reference circle'],
  ['.chip', 16.8, 1.4, 'spec/rules.md#RULE-PANE --r-panel 12 x 1.4'],
  ['.chip-tile', 8.4, 1.4, 'spec/rules.md#RULE-PANE --r-control-sm 6 x 1.4'],
  ['.cmp-round', 9999, 1, 'spec/rules.md#RULE-PANE --r-pill'],
  ['.sb-row', 8, 1, 'spec/rules.md#RULE-PANE --r-row 8 and spec/rules.md#RULE-PANE the sidebar keeps its pixels: 8, circular (review decision 2026-11-16, plan review notes section 16)'],
  ['.pal', 16.8, 1.4, 'spec/rules.md#RULE-PANE the palette is a floating face, --r-panel 12 x 1.4'],
  ['.toast', 23, 1, 'spec/rules.md#RULE-PANE the toast is a face on the page, --r-surface 23, circular'],
  ['.dlg', 22.4, 1.4, 'spec/rules.md#RULE-PANE --r-dialog 16 x 1.4'],
  ['.qp', 23, 1, 'spec/rules.md#RULE-PANE the question panel is a face on the page, --r-surface 23, circular'],
  ['.qp-o', 11.2, 1.4, 'spec/rules.md#RULE-PANE --r-control 8 x 1.4'],
  ['.sg-card:not(.round)', 16.8, 1.4, 'spec/rules.md#RULE-PANE settings group, --r-panel 12 x 1.4'],
  ['.sg-card.round', 23, 1, 'spec/rules.md#RULE-PANE the wide round group is a card on the page, --r-surface 23, circular (kit/components/settings-group.js .sg-card.round)'],
  ['.ltb .slt', 9999, 1, 'spec/rules.md#RULE-PANE a select in the toolbar is a pill (kit/components/list-toolbar.js)'],
  ['.slt:not(.ltb .slt)', 11.2, 1.4, 'spec/rules.md#RULE-PANE a select in a form is a control, 8 x 1.4'],
  ['.inp', 11.2, 1.4, 'spec/rules.md#RULE-PANE --r-control 8 x 1.4'],
  ['.snav-i', 8, 1, 'polish/decisions.md:35 (user decision 2026-11-16 04:15: settings follow the reference app layout, the nav sits on the window ground beside the one body card) and spec/rules.md#RULE-PANE: a settings nav row is a side tone row like the sidebar row, 8, circular'],
  ['.btn:not(.round):not(.link)', 11.2, 1.4, 'spec/rules.md#RULE-PANE a button, --r-control 8 x 1.4'],
  ['.btn.link', 5.6, 1.4, 'spec/rules.md#RULE-PANE the link variant (another screen) is its own role; its hover and focus face is --r-chip 4 x 1.4 (kit/components/button.js:37)'],
  ['.ub-text', 16.8, 1, 'spec/rules.md#RULE-PANE --r-panel 12 x 1.4; spec/rules.md#RULE-PANE the AI conversation keeps the reference circle'],
];

/* Run directly this module checks nothing: say so and fail, so a command line naming it is never read as a pass (by its real path, so a symlink counts too) */
if (process.argv[1] && fileURLToPath(import.meta.url) === (() => { try { return realpathSync(process.argv[1]); } catch { return ''; } })()) {
  console.error('check-surfaces.mjs holds shared surface rules and checks nothing on its own: run node kit/tools/check-states.mjs --app <app> and node kit/tools/check-glass.mjs --app <app> (the screens), node --test kit/tools/check-surfaces.test.mjs (the rules)');
  process.exit(2);
}

/* ---------- the one visibility rule ---------- */

/* Why an element is not shown, or null when it is. Every check here that asks "is it on screen" uses this one rule (floating surfaces,
   the settings group border, the cards inside the body card): in the document; not closing (data-state="closed"); not hidden by display,
   visibility or opacity 0 up its ancestors (checkVisibility); the product of its and its ancestors' opacity (filter: opacity() included) at least
   MIN_OPACITY; some part of its box left after every clip on the way up: the clip-path of it and its ancestors (inset(), and xywh()/rect() that
   compute to it, circle(), ellipse(), polygon(), lengths with calc(); a part left is shown and its border is judged) and the overflow of each
   ancestor that clips it (one on its containing block chain, so a fixed or absolute box escapes a non-positioned clipping ancestor); its
   transformed box at least min px each side and on the viewport. Not judged: path(), url(), a reference box other than border-box, a value
   the page cannot resolve. A surface still fading in has a low opacity for a moment: callers wait for it (readSurface), so only a surface
   that stays transparent is not shown */
export const MIN_OPACITY = 0.05;
export const SHOWN_WHY = (e, min, minOpacity) => {
  if (!e.isConnected) return 'not in the document';
  if (e.dataset?.state === 'closed') return 'closing';
  if (!(e.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? e.getClientRects().length)) return 'hidden (display, visibility or opacity 0)';
  // a length in px against size (calc, min, max through the typed object model); NaN when it cannot be resolved
  const KEY = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
  const px = (s, size) => {
    const ev = n => n instanceof CSSUnitValue ? (n.unit === 'px' ? n.value : n.unit === 'percent' ? n.value / 100 * size : n.unit === 'number' ? n.value : NaN)
      : n instanceof CSSMathSum ? [...n.values].reduce((x, v) => x + ev(v), 0) : n instanceof CSSMathProduct ? [...n.values].reduce((x, v) => x * ev(v), 1)
      : n instanceof CSSMathNegate ? -ev(n.value) : n instanceof CSSMathInvert ? 1 / ev(n.value)
      : n instanceof CSSMathMin ? Math.min(...[...n.values].map(ev)) : n instanceof CSSMathMax ? Math.max(...[...n.values].map(ev)) : NaN;
    try { return ev(CSSNumericValue.parse(KEY[s] ?? s)); } catch { return NaN; }
  };
  // the arguments of a function at the top level, split on spaces (or commas)
  const split = (s, sep = /\s/) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (!d && sep.test(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  // the region a clip-path leaves, in client coordinates: [l, t, r, b], null when not judged
  const shape = (a, clip) => {
    const m = /^(inset|circle|ellipse|polygon)\((.*)\)$/.exec(clip.replace(/\s+(border|padding|content|margin|fill|stroke|view)-box$/, '')); if (!m) return null;
    const br = a.getBoundingClientRect(), w = a.offsetWidth ?? br.width, h = a.offsetHeight ?? br.height;
    if (!(w > 0 && h > 0)) return [0, 0, 0, 0];
    const sx = br.width / w, sy = br.height / h, at = (x0, y0, x1, y1) => [br.left + x0 * sx, br.top + y0 * sy, br.left + x1 * sx, br.top + y1 * sy];
    if (m[1] === 'inset') {
      const v = split(m[2]); const ri = v.indexOf('round'); const [t, r = t, b = t, l = r] = ri < 0 ? v : v.slice(0, ri);
      return at(px(l, w), px(t, h), w - px(r, w), h - px(b, h));
    }
    if (m[1] === 'polygon') {
      const pts = split(m[2], /,/).filter(x => !/^(nonzero|evenodd)$/.test(x)).map(x => { const [X, Y] = split(x); return [px(X, w), px(Y, h)]; });
      const area = Math.abs(pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
      if (!(area >= 1)) return pts.some(p => p.some(Number.isNaN)) ? null : [0, 0, 0, 0];
      return at(Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1])));
    }
    const v = split(m[2]), ai = v.indexOf('at'), rad = ai < 0 ? v : v.slice(0, ai), pos = ai < 0 ? [] : v.slice(ai + 1);
    const cx = px(pos[0] ?? '50%', w), cy = px(pos[1] ?? '50%', h);
    const side = (k, c, size, other) => k === undefined || k === 'closest-side' ? Math.min(c, size - c, ...(other ?? [])) : k === 'farthest-side' ? Math.max(c, size - c, ...(other ?? [])) : null;
    let rx, ry;
    if (m[1] === 'circle') { rx = ry = side(rad[0], cx, w, [cy, h - cy]) ?? px(rad[0], Math.hypot(w, h) / Math.SQRT2); }
    else { rx = side(rad[0], cx, w) ?? px(rad[0], w); ry = side(rad[1], cy, h) ?? px(rad[1], h); }
    return at(cx - rx, cy - ry, cx + rx, cy + ry);
  };
  // whether a's overflow clips e: a is on e's containing block chain
  const makesCb = s => s.transform !== 'none' || s.perspective !== 'none' || s.filter !== 'none' || s.backdropFilter !== 'none' || /paint|layout|strict|content/.test(s.contain) || /transform|perspective|filter/.test(s.willChange) || (s.containerType && s.containerType !== 'normal');
  const cbOf = x => {
    const p = getComputedStyle(x).position;
    if (p !== 'absolute' && p !== 'fixed') return x.parentElement;
    for (let y = x.parentElement; y; y = y.parentElement) { const s = getComputedStyle(y); if (makesCb(s) || (p === 'absolute' && s.position !== 'static')) return y; }
    return null;
  };
  const clips = (a, x) => { while (x && x !== a) x = cbOf(x); return x === a; };
  const er = e.getBoundingClientRect();
  let vis = [er.left, er.top, er.right, er.bottom];
  const cut = q => { vis = [Math.max(vis[0], q[0]), Math.max(vis[1], q[1]), Math.min(vis[2], q[2]), Math.min(vis[3], q[3])]; return vis[2] - vis[0] < 1 || vis[3] - vis[1] < 1; };
  let opacity = 1;
  for (let a = e; a; a = a.parentElement) {
    const c = getComputedStyle(a);
    opacity *= parseFloat(c.opacity);
    for (const [, v, pct] of c.filter.matchAll(/opacity\(\s*([-+\d.eE]+)(%?)\s*\)/g)) opacity *= Math.min(1, Math.max(0, parseFloat(v) / (pct ? 100 : 1)));
    if (c.display === 'contents') continue; // no box: neither its clip-path nor its overflow clips anything
    const q = c.clipPath !== 'none' && shape(a, c.clipPath);
    if (q && !q.some(Number.isNaN) && cut(q)) return `cut away (clip-path ${c.clipPath})`;
    if (a !== e && (c.overflowX !== 'visible' || c.overflowY !== 'visible') && clips(a, e)) {
      const b = a.getBoundingClientRect();
      if (cut([c.overflowX !== 'visible' ? b.left : -Infinity, c.overflowY !== 'visible' ? b.top : -Infinity, c.overflowX !== 'visible' ? b.right : Infinity, c.overflowY !== 'visible' ? b.bottom : Infinity])) return 'clipped to nothing by an ancestor';
    }
  }
  if (opacity < minOpacity) return `transparent (opacity ${opacity.toFixed(2)})`;
  if (er.width < min || er.height < min) return `too small (${Math.round(er.width)}x${Math.round(er.height)})`;
  if (er.right <= 0 || er.bottom <= 0 || er.left >= innerWidth || er.top >= innerHeight) return 'off screen';
  return null;
};
/* Runs an *_IN_PAGE function in d (a Page or a Frame) with the visibility rule handed to it: fn(arg, why), why(e, min) */
const withRule = (fn, arg) => `(${fn})(${JSON.stringify(arg)}, (e, min) => (${SHOWN_WHY})(e, min, ${MIN_OPACITY}))`;
export const inPage = (d, fn, arg) => d.evaluate(withRule(fn, arg));
export const waitInPage = (d, fn, arg, options) => d.waitForFunction(withRule(fn, arg), undefined, options);

/* One frame: [selector, basis]. The settings body (kit/components/content-card.js inset) is the one body card of its screen: no ancestor in its document
   draws a frame around it and no card inside it draws an outer frame (polish/decisions.md:35, user decision 2026-11-16 04:15: the nav on the window ground,
   the content one round body card; spec/design.md#B-005 no card inside a card). The shell side (.frame-main.bare draws no face then) is checked by check-states. */
export const ONE_FRAME = [
  ['.cc-card', 'settings body card: polish/decisions.md:35 (04:15), spec/design.md#B-005'],
];
/* A frame: a box with rounded corners that paints a face or an edge (background, visible border or shadow). A card inside: such a box at least half
   the outer card's width and 48px tall (controls, pills and rows are smaller or have no face). The settings group's border rule (GROUP_IN_CARD)
   does not use this size filter: every shown group is checked */
export const CARD_MIN_H = 48;
/* Boxes that stand for the app window, so the one body card may sit on them: design/gallery/layouts.html draws each layout in a miniature window (.l-box, background --window) */
export const WINDOW_LIKE = '.l-box';
/* The one card role allowed inside the body card: the settings group (spec/rules.md#RULE-PANE, --r-panel round face). In the reference app's settings layout
   (polish/decisions.md:35, user decision 2026-11-16 04:15; coordinator decision 2026-11-16) it is a pale face with no border: its face and radius pass,
   a visible border (dark or light) fails */
export const GROUP_IN_CARD = '.sg-card';

/* In the page: the first element of each rule, its corner radius and shape, and (for ONE_FRAME) the frames drawn around it and inside it */
export const READ_SURFACES_IN_PAGE = ([radii, oneFrame, minH, windowLike, group], why) => {
  const alpha = c => { if (c === 'transparent') return 0; const m = c.match(/\/\s*([\d.]+%?)\s*\)$/) || c.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/); return m ? parseFloat(m[1]) / (m[1].endsWith('%') ? 100 : 1) : 1; };
  return {
    radii: radii.map(([s]) => {
      const e = document.querySelector(s); if (!e) return null;
      const c = getComputedStyle(e), k = c.getPropertyValue('corner-top-left-shape').match(/superellipse\(([\d.]+)\)/);
      const rows = e.matches('.sg-card') ? [...e.children].slice(1).map(x => { const cx = getComputedStyle(x); return (parseFloat(cx.borderTopWidth) || 0) + (/inset/.test(cx.boxShadow) ? 1 : 0); }) : [];
      return { r: [c.borderTopLeftRadius, c.borderBottomLeftRadius].map(parseFloat), k: k ? parseFloat(k[1]) : 1, flat: rows.every(w => w > 0) }; /* a group of one row has nothing to part */
    }),
    frames: oneFrame.map(([s]) => {
      const e = document.querySelector(s); if (!e) return null;
      const face = el => {
        const c = getComputedStyle(el), r = Math.max(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(p => parseFloat(c[p]) || 0));
        const edge = ['Top', 'Right', 'Bottom', 'Left'].some(k => (parseFloat(c[`border${k}Width`]) || 0) > 0 && alpha(c[`border${k}Color`]) > 0);
        const paint = alpha(c.backgroundColor) > 0 || c.backgroundImage !== 'none';
        return r > 0 && (paint || edge || c.boxShadow !== 'none') ? `${[el.tagName.toLowerCase(), ...el.classList].join('.')} (radius ${r}px${paint ? ', background ' + c.backgroundColor : ''}${edge ? ', border' : ''}${c.boxShadow !== 'none' ? ', shadow' : ''})` : null;
      };
      const outer = []; for (let a = e.parentElement; a && !a.matches(windowLike); a = a.parentElement) { const f = face(a); if (f) outer.push(f); }
      const w = e.getBoundingClientRect().width;
      const cards = [...e.querySelectorAll('*')].filter(x => { const r = x.getBoundingClientRect(); return r.width >= w / 2 && r.height >= minH && !why(x, 1); });
      const edged = x => { const c = getComputedStyle(x); return ['Top', 'Right', 'Bottom', 'Left'].some(k => (parseFloat(c[`border${k}Width`]) || 0) > 0 && alpha(c[`border${k}Color`]) > 0); };
      const inner = cards.filter(x => !x.matches(group)).map(face).filter(Boolean);
      /* every shown settings group, whatever its size (a one-row group, a fixed-width column on a wide window): its border is never allowed */
      const groups = [...e.querySelectorAll(group)].filter(x => !why(x, 1) && edged(x)).map(x => `${[x.tagName.toLowerCase(), ...x.classList].join('.')} (border ${getComputedStyle(x).borderTopColor})`);
      return { self: face(e), outer, inner, groups };
    }),
  };
};

/* Reads the radii and frames of d with the visibility rule */
export const readSurfaces = d => inPage(d, READ_SURFACES_IN_PAGE, [RADII, ONE_FRAME, CARD_MIN_H, WINDOW_LIKE, GROUP_IN_CARD]);

/* Judges what READ_SURFACES_IN_PAGE returned; calls fail(where, message) for each finding and adds every drawn selector to seen */
export function judgeSurfaces(got, where, fail, seen = new Set()) {
  RADII.forEach(([s, r, k], i) => {
    const g = got.radii[i]; if (!g) return;
    seen.add(s);
    /* a group drawn as straight rows on the card it sits in (a detail body, the app theme, commit 4ef457e) has no corners of its own, but then every row after the first is parted by a hairline */
    if (s.startsWith('.sg-card') && g.r.every(v => v === 0)) { if (!g.flat) fail(`${where} ${s}`, 'radius 0 without a hairline between its rows'); return; }
    if (g.r.some(v => Math.abs(v - r) > 0.05) || Math.abs(g.k - k) > 0.01) fail(`${where} ${s}`, `radius ${g.r.join('/')}px superellipse(${g.k}), expected ${r}px superellipse(${k})`);
  });
  ONE_FRAME.forEach(([s], i) => {
    const g = got.frames[i]; if (!g) return;
    seen.add(s);
    if (g.outer.length) fail(`${where} ${s}`, `a frame inside a frame: drawn inside ${g.outer.join(', ')}`);
    if (g.inner.length) fail(`${where} ${s}`, `a card inside the body card: ${g.inner.slice(0, 3).join(', ')}`);
    if (g.groups?.length) fail(`${where} ${s}`, `a settings group inside the body card draws a visible border: ${g.groups.slice(0, 3).join(', ')}`);
  });
  return seen;
}

/* ---------- floating surfaces: a surface counts only when it is shown ---------- */

/* Smallest side of a shown surface (px): a menu, submenu, palette or tooltip has rows or text, so a box under it is no surface */
export const MIN_SURFACE = 8;

/* In the page: the first element matching sel that is shown (laid out, MIN px or more each side, not hidden by visibility or display up its
   ancestors, not closing: data-state="closed"), with its fill, backdrop filter and the ancestors that would cut its backdrop. Without one:
   { reason } naming why each match is not shown, or that there is none. With wait it only answers whether one is shown (for waitForFunction) */
export const SHOWN_SURFACE_IN_PAGE = ([sel, min, wait = false], why) => {
  const all = [...document.querySelectorAll(sel)];
  if (!all.length) return wait ? false : { reason: `no ${sel} in the document` };
  const e = all.find(x => !why(x, min));
  if (!e) return wait ? false : { reason: `${sel} not shown: ${all.slice(0, 3).map(x => why(x, min)).join(', ')}` };
  if (wait) return true;
  const cs = getComputedStyle(e);
  const alpha = c => { const m = c.match(/\/\s*([\d.]+)\s*\)$/) || c.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/); return m ? parseFloat(m[1]) : (c === 'transparent' ? 0 : 1); };
  const roots = [];
  for (let a = e.parentElement; a; a = a.parentElement) {
    const c = getComputedStyle(a);
    if (c.filter !== 'none' || parseFloat(c.opacity) < 1 || c.maskImage !== 'none' || c.backdropFilter !== 'none' || c.mixBlendMode !== 'normal' || /filter|opacity|mask/.test(c.willChange)) roots.push(a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ')[0] : ''));
  }
  return { surface: { bg: cs.backgroundColor, alpha: alpha(cs.backgroundColor), filter: cs.backdropFilter, roots } };
};

/* Waits up to timeout for a shown surface in d (a Page or a Frame), lets its opening settle (settleMs), and reads it again: { surface } when it is
   shown, else { reason }. A surface that is late but comes is read; one that stays hidden, closed, tiny or absent is a reason, never a surface */
export async function readSurface(d, sel, { timeout = 5000, settleMs = 300 } = {}) {
  const came = await waitInPage(d, SHOWN_SURFACE_IN_PAGE, [sel, MIN_SURFACE, true], { timeout }).then(() => true, () => false);
  if (came && settleMs) await new Promise(r => setTimeout(r, settleMs));
  const r = await inPage(d, SHOWN_SURFACE_IN_PAGE, [sel, MIN_SURFACE]).catch(e => ({ reason: e.message }));
  return r.surface ? r : { reason: came ? `shown, then ${r.reason}` : `not shown within ${timeout}ms: ${r.reason}` };
}

/* ---------- glass: what shows through a menu ---------- */

/* Largest Laplacian of the show-through allowed (luminance units, 0 to 255). Measured: blurred backdrop 3 to 5, sharp text 30 to 70 */
export const SHARP = 12;
/* Band along the surface's rounded outline left out (its ring and shadow; outside the outline the page shows directly) */
export const EDGE = 3;

/* No caret blink or tooltip between the two captures. While measuring, the menus' own rows and the menu's own overlay scroll bar are hidden
   (their antialiasing depends on what is below, and they are the menu, not what is below it); .glass-probe also hides everything but the menu layer */
export const PROBE_CSS = `* { caret-color: transparent !important; } .tip { display: none !important; }
html.glass-quiet .m-layer .menu * { visibility: hidden !important; } html.glass-quiet .m-layer .menu .m-sub { visibility: visible !important; }
html.glass-quiet .sa-bar.glass-own, html.glass-quiet .sa-bar.glass-own * { visibility: hidden !important; }
html.glass-probe body > :not(.m-layer), html.glass-probe body > :not(.m-layer) * { visibility: hidden !important; }`;

/* In the page: the newest open surface (a side submenu or menu in the layer, or an in-place submenu inside it) */
export const NEWEST_IN_PAGE = () => {
  const menus = [...document.querySelectorAll('.m-layer > .menu')].filter(m => m.dataset.state !== 'closed');
  const m = menus[menus.length - 1]; if (!m) return null;
  const sub = m.querySelector('.m-sub');
  const e = sub && sub.offsetHeight ? sub : m;
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, radius: parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0, filter: getComputedStyle(e).backdropFilter, bg: getComputedStyle(e).backgroundColor };
};

/* In the page: marks the overlay bars that belong to the newest menu's own scrollers (the menu and any [data-scroll] inside it).
   kit/components/scroll-area.js keeps a bar's owner only in its closure and appends every bar to body, so ownership is found by behaviour:
   each own scroller is scrolled by one pixel and back, and the bars whose thumb moves with it, or that the scroll creates, are its bars. A bar of
   any other scroller does not move, wherever it lies. Returns the number of marked bars */
export const MARK_OWN_BARS_IN_PAGE = async () => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const menus = [...document.querySelectorAll('.m-layer > .menu')].filter(m => m.dataset.state !== 'closed');
  const m = menus[menus.length - 1]; if (!m) return 0;
  const scrollers = [m, ...m.querySelectorAll('[data-scroll]')].filter(e => e.hasAttribute('data-scroll') && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1));
  const thumbs = () => new Map([...document.querySelectorAll('body > .sa-bar')].map(b => [b, b.querySelector('.sa-thumb')?.getAttribute('style') || '']));
  let marked = 0;
  for (const s of scrollers) {
    const v = s.scrollHeight > s.clientHeight + 1, top = s.scrollTop, left = s.scrollLeft;
    const before = thumbs();
    if (v) s.scrollTop = top > 0 ? top - 1 : top + 1; else s.scrollLeft = left > 0 ? left - 1 : left + 1;
    await frame();
    /* its bars: those whose thumb moved, and those the scroll created (scroll-area.js makes a scroller's bars on its first scroll) */
    for (const [b, st] of thumbs()) if ((!before.has(b) || before.get(b) !== st) && !b.classList.contains('glass-own')) { b.classList.add('glass-own'); marked++; }
    s.scrollTop = top; s.scrollLeft = left;
    await frame();
  }
  return marked;
};

/* Sharpest edge of what shows through: two PNG captures of the same box, decoded in a blank page (lab) */
export async function sharpness(lab, a, b, radius) {
  return lab.evaluate(async ([a, b, edge, radius]) => {
    const px = async s => {
      const img = new Image(); img.src = 'data:image/png;base64,' + s; await img.decode();
      const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
    };
    const A = await px(a), B = await px(b);
    if (A.w !== B.w || A.h !== B.h) return { lap: Infinity };
    const { w, h } = A, lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) * d[i + 3] / 255;
    const diff = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) diff[i] = lum(A.d, i * 4) - lum(B.d, i * 4);
    // inside the rounded box shrunk by edge (a circular corner lies inside the superellipse one)
    const r = Math.max(radius, edge), inside = (x, y) => {
      const cx = Math.min(Math.max(x + 0.5, r), w - r), cy = Math.min(Math.max(y + 0.5, r), h - r);
      return Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r - edge;
    };
    let lap = 0, at = null;
    for (let y = edge; y < h - edge; y++) for (let x = edge; x < w - edge; x++) {
      if (!inside(x, y)) continue;
      const i = y * w + x, v = Math.abs(4 * diff[i] - diff[i - 1] - diff[i + 1] - diff[i - w] - diff[i + w]);
      if (v > lap) { lap = v; at = [x, y]; }
    }
    return { lap, at };
  }, [a.toString('base64'), b.toString('base64'), EDGE, radius]);
}

/* Measures the newest open surface of page p (PROBE_CSS must be in the page): null when no surface is open, else { box, lap, at, own } */
export async function measureGlass(p, lab) {
  await p.waitForTimeout(300);
  const box = await p.evaluate(NEWEST_IN_PAGE);
  if (!box || box.width < 2 * EDGE + 2 || box.height < 2 * EDGE + 2) return null;
  const clip = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height };
  const own = await p.evaluate(MARK_OWN_BARS_IN_PAGE);
  await p.evaluate(() => document.documentElement.classList.add('glass-quiet'));
  await p.waitForTimeout(80);
  const a = await p.screenshot({ clip, omitBackground: true });
  await p.evaluate(() => document.documentElement.classList.add('glass-probe'));
  await p.waitForTimeout(80);
  const b = await p.screenshot({ clip, omitBackground: true });
  await p.evaluate(() => { document.documentElement.classList.remove('glass-probe', 'glass-quiet'); document.querySelectorAll('.sa-bar.glass-own').forEach(e => e.classList.remove('glass-own')); });
  const s = await sharpness(lab, a, b, box.radius);
  return { box, own, ...s };
}
