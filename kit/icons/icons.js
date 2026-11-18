import { raw } from '../core/html.js';
import { GLYPHS as KIT_GLYPHS } from './glyphs.js';
import { BASE_MAP } from './base-map.js';

const MAP = { ...BASE_MAP };
const GLYPHS = { ...KIT_GLYPHS };
const LEGACY_ALIASES = Object.freeze({
  'pencil-2': 'new-chat',
  'key-2': 'credentials',
  'sparkles-two-2': 'ai',
  'sparkles-two-2-fill': 'ai-active',
  'checkmark-2-medium': 'check',
  'dot-grid-1-x-3-horizontal-tight': 'more',
  'settings-gear': 'settings',
  'settings-gear-fill': 'settings-active',
  'magnifying-glass': 'search',
  'magnifying-glass-plus': 'zoom-in',
  'shield-check-3': 'shield-check',
});

/** Add app glyphs (app-only drawings). @param {Record<string, string | {viewBox: string, svg: string}>} glyphs key -> SVG inner content (viewBox 24), or an own drawing */
export function extendGlyphs(glyphs) { Object.assign(GLYPHS, glyphs); }
const SIZES = { xs: 'wi wi-xs', sm: 'wi wi-sm', md: 'wi', lg: 'wi wi-lg', xl: 'wi wi-xl' };
/* one line weight for every drawn icon (viewBox 24): icons of one size never differ in weight, and the weight grows with the size */
const STROKE = 1.5;

/** Add app icon table entries; direct entries take precedence over legacy aliases. @param {Record<string, [string, 'fill'?]>} map  glyph key; 'fill' fills the glyph (evenodd) as well as stroking it */
export function extendIcons(map) {
  for (const [k, v] of Object.entries(map)) {
    if (!GLYPHS[v[0]]) throw new Error(`icon "${k}": glyph "${v[0]}" is not in kit glyphs or app glyphs`);
    MAP[k] = v;
  }
}

/** Whether a current slot or a supported legacy alias has a drawing. */
export function hasIcon(name) { return !!resolveIcon(name).entry; }

/** Icon SVG with a current data-icon name, accepting legacy aliases. size: xs 12, sm 14, md 16, lg 18, xl 20. @throws {Error} Unknown slot */
export function icon(name, size = 'md', extraClass = '') {
  const { slot, entry: v } = resolveIcon(name);
  if (!v) throw new Error(`unknown icon slot: ${name}`);
  const cls = SIZES[size] + (extraClass ? ' ' + extraClass : '');
  const g = GLYPHS[v[0]];
  if (typeof g === 'object') {
    if (/\sid=["']/.test(g.svg)) return raw(`<img class="${cls}" src="${ownDrawing(v[0], g)}" alt="" aria-hidden="true" data-icon="${slot}">`);
    return raw(`<svg class="${cls}" viewBox="${g.viewBox}" fill="currentColor" fill-rule="evenodd" aria-hidden="true" data-icon="${slot}">${g.svg}</svg>`);
  }
  return raw(`<svg class="${cls}" viewBox="0 0 24 24" ${v.includes('fill') ? 'fill="currentColor" fill-rule="evenodd"' : 'fill="none"'} stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="${slot}">${g}</svg>`);
}

/* A drawing that names its own parts (gradients, clip paths: id and url(#id)) is drawn as a picture of itself, so every copy is whole:
   inlined, all copies would share the first copy's ids, and a first copy that is hidden (in a closed bar) would leave every later one empty.
   Such drawings carry their own colours (brand marks), so nothing of the text colour is lost. */
const OWN = new Map();
function ownDrawing(key, g) {
  if (!OWN.has(key)) {
    const xlink = g.svg.includes('xlink:') ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : '';
    OWN.set(key, 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"${xlink} viewBox="${g.viewBox}" fill="currentColor" fill-rule="evenodd">${g.svg}</svg>`).replace(/'/g, '%27'));
  }
  return OWN.get(key);
}

/** Page icon in the place of a site icon (tab rows, palette rows, context chips): the slot's glyph on a small rounded tile. size: md 16, lg 18, xl 20 */
export function favicon(name, size = 'md') {
  return raw(`<span class="fav${size === 'md' ? '' : ' fav-' + size}" data-fav="${resolveIcon(name).slot}">${icon(name, 'md').s}</span>`);
}

function resolveIcon(name) {
  const slot = Object.hasOwn(LEGACY_ALIASES, name) ? LEGACY_ALIASES[name] : name;
  const key = Object.hasOwn(MAP, name) ? name : slot;
  return { slot, entry: Object.hasOwn(MAP, key) ? MAP[key] : undefined };
}
