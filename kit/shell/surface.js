/*
 * Floating surface document (desktop, kit/desktop/surface.html): one menu level shown in its own borderless window over the macOS
 * menu material (main.cjs openSurface). The menu is the kit menu component in its native variant; the window supplies the material,
 * corner and shadow, so the menu box itself draws none. The app is named in the query (?app=<path>) for its icons, words and theme,
 * and the locale in use (?locale=<code>) for its words.
 * Choices, side submenus and closing go back through window.kitSurface.
 */
import { setLocales, useLocale } from '../core/i18n.js';
import { extendGlyphs, extendIcons } from '../icons/icons.js';
import { addAllStyles } from '../components/index.js';
import * as menu from '../components/menu.js';

const bridge = window.kitSurface;
const doc = document;
const app = new URLSearchParams(location.search).get('app') || '';

const theme = doc.createElement('link');
theme.rel = 'stylesheet';
theme.href = `../../${app}/theme.css`;
const themeLoaded = new Promise(res => { theme.onload = theme.onerror = res; });
doc.head.appendChild(theme);
const config = (await import(`../../${app}/app.config.js`)).default;
if (config.icons?.glyphs) extendGlyphs(config.icons.glyphs);
if (config.icons?.map) extendIcons(config.icons.map);
setLocales(config.locales);
useLocale(new URLSearchParams(location.search).get('locale') || config.defaultLocale);
addAllStyles(doc);
await themeLoaded;

let shown = false;
const ctl = menu.attach(doc, {
  surface: true,
  emit: (action, payload, opts) => { if (action) bridge.send('choose', { action, arg: payload?.arg, keep: !!opts?.keep }); },
  // a side submenu opens next to the menu edge, its top on the row top (measured)
  openSide: (def, rect) => {
    const box = doc.querySelector('.menu').getBoundingClientRect(), gap = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--rich-menu-sub-gap')) || 0;
    bridge.send('sub', { def, rect: { left: box.left - gap, right: box.right + gap, top: rect.top } });
  },
  closeSide: () => bridge.send('close-sub'),
  // closing after it was open (opening reports a close of nothing first); a choice is sent before the close (same task), so main still
  // knows the surface when the choice arrives
  onOverlay: on => { if (on) shown = true; else if (shown) { shown = false; setTimeout(() => bridge.send('close'), 0); } },
});

bridge.onDef(({ def, theme: mode }) => {
  doc.documentElement.dataset.theme = mode;
  const m = ctl.open(null, def, { point: { x: 0, y: 0 } });
  m.el.dataset.state = 'idle';
  const r = m.el.getBoundingClientRect(), cs = getComputedStyle(m.el);
  bridge.send('size', { width: r.width, height: r.height, radius: parseFloat(cs.borderTopLeftRadius) || 0 });
});
bridge.send('ready');
