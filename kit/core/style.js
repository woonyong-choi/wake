/*
 * Puts each component's CSS into a document once, with the SVG filter that translucent floating surfaces end their backdrop filter with
 * (--glass-solid in tokens.css).
 *
 * Why the filter: Chromium draws a backdrop-filter result over the backdrop (source over), not in its place. Where the document is
 * transparent (the desktop window, so the macOS material shows through), the backdrop pixels have little alpha, the blurred copy spreads
 * that alpha thin and the sharp original stays readable through a menu at its 20% transparency (text, glyphs, chips; measured in the
 * desktop window and in headless Chromium with a transparent page alike; the menu's mount point, backdrop roots, layers and isolation
 * change nothing). The filter lays the flat window color (--glass-under) under the blurred copy, so it is opaque and hides the original.
 */
const added = new WeakMap();
const SVG = 'http://www.w3.org/2000/svg';
export const GLASS_FILTER_ID = 'kit-glass-under';

function addGlassFilter(doc) {
  if (doc.getElementById(GLASS_FILTER_ID)) return;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'glass-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<filter id="${GLASS_FILTER_ID}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feFlood/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  // On the root element, not in body, so a page that replaces the body content keeps it
  doc.documentElement.appendChild(svg);
}

export function addStyles(list, doc = document) {
  let seen = added.get(doc);
  if (!seen) { seen = new Set(); added.set(doc, seen); addGlassFilter(doc); }
  for (const c of list) {
    if (!c.css || seen.has(c.name)) continue;
    const el = doc.createElement('style');
    el.dataset.component = c.name;
    el.textContent = c.css;
    doc.head.appendChild(el);
    seen.add(c.name);
  }
}
