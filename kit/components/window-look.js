/*
 * Window style picture (for a choice card): the desktop picture (desktopInfo.wallpaper, a zoomed part of it) or the kit artwork (--wlk-art,
 * replaceable in an app theme), with a glass window over its lower right: 'tinted' is milky glass that hides most of the picture (strong
 * blur, light fill), 'transparent' is clear glass that shows it (slight blur and saturation, a light edge and sheen). Drawn at 2x.
 */
import { html, attrs } from '../core/html.js';

export const name = 'window-look';

export const css = `
.wlk { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--wlk-art) center / cover no-repeat; }
.wlk[data-wallpaper] { background-image: var(--wlk-wallpaper); background-size: 240%; background-position: 32% 48%; }
.wlk-win { position: absolute; left: var(--wlk-win-x); top: var(--wlk-win-y); right: calc(-1 * var(--r-control)); bottom: calc(-1 * var(--r-control)); border-radius: var(--r-control); corner-shape: var(--corner);
  box-shadow: inset 0 0 0 var(--hairline) var(--wlk-win-edge), var(--wlk-win-shadow); }
.wlk[data-look="tinted"] .wlk-win { background: var(--wlk-win-tinted); backdrop-filter: blur(var(--wlk-blur-tinted)) saturate(var(--wlk-sat)); }
.wlk[data-look="transparent"] .wlk-win { background: var(--wlk-win-sheen), var(--wlk-win-clear); backdrop-filter: blur(var(--wlk-blur-clear)) saturate(var(--wlk-sat)); }
`;

/** @param {{look: 'tinted' | 'transparent', wallpaper?: string | null}} p  wallpaper: an image URL (data URL) of the desktop picture */
export function render(p) {
  return html`<span class="wlk" data-look="${p.look}"${attrs({ 'data-wallpaper': p.wallpaper ? '' : null, style: p.wallpaper ? `--wlk-wallpaper:url("${p.wallpaper}")` : null })}><span class="wlk-win"></span></span>`;
}
