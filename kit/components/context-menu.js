/*
 * Right-click menu. Right-clicking an element with [data-context="kind"] asks ctx.resolveContext(kind, arg) for items.
 * The desktop shell shows an OS menu (ctx.nativeMenu, items keep their icon slot names); the browser shows the same items as a web menu styled like the OS menu.
 * The chosen item is reported with ctx.emit(item.action, { arg: item.arg }). Submenus go to the OS menu as submenus; a menu with a row the OS
 * menu cannot draw (a choices row: color swatches, icon grid) opens in the desktop shell as a floating surface (ctx.nativeSurface: its own
 * window over the macOS menu material, desktop/main.cjs), and in the browser as the web menu with its item icons.
 */
export const name = 'context-menu';
export const hook = 'data-context';

export const css = `
/* drawn by the page (a browser, or a menu the OS cannot draw): the one floating surface and item height of every menu */
.menu.native { color: var(--n-label-strong); }
.menu.native:not(.icons) .mi > .wi { display: none; }
.menu.native.icons { padding: var(--rich-menu-pad); border-radius: var(--r-panel); font-size: var(--text-rich-menu); }
.menu.native.icons .mi { min-height: var(--rich-menu-row-h); padding: 0 var(--space-2); border-radius: var(--r-row); font-size: var(--text-rich-menu); }
.menu.native.icons .mi:not(:has(> .wi)) > .mi-text { padding-left: calc(var(--icon) + var(--space-2)); }
.menu.native.icons .mi[data-highlighted] { background: var(--accent); color: var(--n-label-strong); }
.menu.native.icons .m-label { min-height: var(--rich-menu-label-h); display: flex; align-items: center; padding: 0 var(--space-2); letter-spacing: normal; }
.menu.native.icons .m-choices.swatch, .menu.native.icons .m-choices:not(.icon) { min-height: var(--rich-menu-choices-h); }
.menu.native.icons .m-choices.icon { padding: var(--rich-menu-grid-pad); }
.menu.native.icons .m-sep { margin: var(--rich-menu-sep-my) calc(-1 * var(--rich-menu-pad)); }
.menu.native .mi[data-highlighted] { background: var(--n-menu-hl); color: var(--n-menu-hl-fg); }
.menu.native .mi[data-highlighted] .mi-end { color: var(--n-menu-hl-fg); }
.menu.native .m-sep { margin: var(--space-1_5) var(--space-2_5); }
.menu.native[data-state="open"], .menu.native[data-state="closed"] { animation: none; }
/* floating surface window (desktop): the window draws the material, corner and shadow */
html.is-surface body { background: transparent; }
html.is-surface .menu.native { position: static; width: max-content; max-height: none; background: transparent; -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: none; }
`;

export function attach(root, ctx) {
  root.addEventListener('contextmenu', async e => {
    const el = e.target.closest('[data-context]');
    if (!el) return;
    e.preventDefault();
    const arg = el.dataset.contextArg ? JSON.parse(el.dataset.contextArg) : undefined;
    const items = ctx.resolveContext?.(el.dataset.context, arg, el);
    if (!items || !items.length) return;
    const rich = items.some(it => it.type === 'choices');
    if (rich && ctx.nativeSurface) { ctx.nativeSurface({ items, variant: 'native', icons: true }, { x: e.clientX, y: e.clientY }); return; }
    if (ctx.nativeMenu && !rich) {
      const plainOf = list => list.map(it => it.type ? { type: it.type, label: it.label } : { id: it.id, label: it.label, icon: it.icon, enabled: !it.disabled, checked: it.checked, submenu: it.submenu ? plainOf(it.submenu.items) : undefined });
      const id = await ctx.nativeMenu(plainOf(items), { x: e.clientX, y: e.clientY });
      const flat = list => list.flatMap(it => [it, ...(it.submenu ? flat(it.submenu.items) : [])]);
      const chosen = flat(items).find(it => it.id === id);
      if (chosen?.action) ctx.emit(chosen.action, { arg: chosen.arg, item: chosen });
      return;
    }
    const m = ctx.menu.open(null, { items, variant: 'native', icons: rich }, { point: { x: e.clientX, y: e.clientY } });
    m.el.dataset.state = 'idle';
  });
}
