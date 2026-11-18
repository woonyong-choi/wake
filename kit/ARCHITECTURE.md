# Architecture

## Layers

```
apps/<id>/        definitions, pages, data, theme          (app knowledge only)
   │ imports public entries only (checked by tools/check-deps.mjs)
kit/desktop/      Electron main process: window, views, protocol, IPC, native menus
kit/shell/        one shell document: frame, tabs model, hosts, AI panel engine, palette
kit/page/         one document per tab: boot, bridge client, page kinds
kit/components/   pure render(props) + css + optional attach(root, ctx)
kit/core/         html, routes, i18n, validate, bridge protocol, settings store, position
kit/icons/        icon(slot) -> glyph
kit/tokens.css    every raw value
```

## Assembly structure

An app is assembled, not copied. Each layer only uses the one below it, and every choice an app makes is a definition, not code in the kit.

1. **Tokens** (`tokens.css`, app `theme.css`): every length, color, radius and motion value. An app overrides only the app-overridable block.
2. **Components** (`components/*.js`): pure render functions with their own CSS and behavior hooks (menus, dialogs, tooltips, tables, rows,
   progress, first-run, settings rows). They take data and return markup; they never read each other's DOM and can be nested in any order.
3. **Page kinds and patterns** (`page/kinds/*`): settings, start and chat pages built from components and driven by definitions
   (settings groups → pages → sections → rows with a control; start page modes and card tabs; chat with the AI panel engine).
   Any other page is an app page that calls components through `bootPage` (a list, a document, a details page).
4. **Shell slots and regions** (`shell/shell.js`): sidebar (pinned tiles, sections, bottom buttons), top bar (identity chip, path, buttons),
   content (tabs, split), AI panel, palette, dialogs, toasts, first run, desktop menus and floating surfaces. Each region is on or off and
   filled from the definition: `features` (tabs, panel, settings, palette, external tools), `sidebar.sections` (built-in kinds `rows` and
   `tabs`, plus the app's own kinds in `sidebar.kinds`), `topbar` (`ident: false`, `buttons`), `menus`, `contextMenus` (a row of
   `choices` opens as a floating surface on the desktop), `shortcuts`, `firstRun.steps`, `settings.groups`, `palette.sources`, `ai`.
5. **App definitions** (`apps/<id>/`): the files listed in README "Files an app provides".

To compose a new structure: turn regions on or off in `features`; list the sidebar sections in the order wanted, writing a section kind in
`sidebar.kinds` when rows are not enough (it returns kit components); give routes their page and, for kit pages, their `kind`; say per route
what the identity chip shows (or `topbar.ident: false`); define settings pages from rows; list first-run steps; add menus and actions.

Checklist for a new structure:
- the app imports only `kit/index.js`, `kit/page/index.js`, `kit/desktop/index.cjs` and `kit/locale/*.js` (check-deps)
- no markup, inline style or CSS outside `theme.css` in the app (check-reuse)
- every route opens with no console error, horizontal scroll or overflowing text in each language (check --locale)
- states, menus over a transparent window and the brand color uses pass (check-states, check-glass, check-brand)
- dictionaries have the same keys and no literal outside them (check-locale); debug aids are not reachable in a release (check-release)
- regions the app turns off leave nothing behind (no empty panel, no identity rule, no AI menu)

Kit rigidities found while assembling the sample app and how they were opened up: the identity chip was always drawn (now `topbar.ident:
false` or a route `ident` returning null); sidebar section kinds were fixed to rows and tabs (now `sidebar.kinds`); the check tools stored
settings under the app folder name instead of the app id, and assumed the AI panel, an identity chip and a start page (now read from the
definition); a page opened on its own missed the kit setting defaults (now merged).

## Documents and slots

The shell document (`apps/<id>/index.html` → `createShell(config)`) renders the `app-frame` component with four named slots:

| slot | content | notes |
|---|---|---|
| `sidebar` | `sidebar` with `section` and `sidebar-row` | sections come from `config.sidebar.sections`; a section with `kind: 'tabs'` lists open tabs |
| `topbar` | `topbar` with `path-segment-switcher` | breadcrumbs only, never an address; each crumb may open a switcher menu |
| `content` | tab views | one page document per tab |
| `panel` | `panel` with the AI panel engine | conversation, composer, approvals |

Each tab is a separate page document at an internal address `<scheme>://<route path>`. The address is never displayed and cannot be typed.

- **Desktop host** (`shell/hosts/desktop-host.js` + `desktop/main.cjs`): one `WebContentsView` per tab, placed over the content slot with rounded corners (over each pane in a split view). Each window has its own shell document and tabs; a second window (⌘N, a tab or group moved to a new window) does not restore or save the session. History is the real `webContents` history; the tabs model mirrors it. When a shell overlay (menu, palette) intersects the content slot the view is replaced by a snapshot, because native views draw above the shell document. A menu the OS menu cannot draw (color swatches, icon grid) opens as a floating surface: a borderless child window over the macOS menu material (`desktop/surface.html` + `shell/surface.js`, one window per menu level), shaped to the menu corner by the native helper (`desktop/native.cjs`, `desktop/native/window.m`, compiled on first use with the system compiler).
- **Browser host** (`shell/hosts/iframe-host.js`): one same-origin iframe per tab, alive while the tab exists. In a split view the two shown frames are placed over their pane slots (never moved in the DOM, which would reload them). The tabs model owns history and the iframe moves only with `location.replace`. In a single-file bundle pages come from `window.__KIT_PAGES` as `srcdoc`.

### Tab behavior (both hosts)

- `replace` swaps the current entry; navigating to the current address does nothing.
- Back, forward and reload are top bar buttons and `mod+[`, `mod+]`, `mod+r`.
- Loading lasts from setting the address until the page sends `page:ready`; the tab row shows a spinner in place of its icon.
- Desktop: a page draws its first document from `kitBridge.boot()` without waiting for `shell:init` (a detail route and a page that takes a handoff wait). A window is shown once its shell has placed its views and the in-app pages in them have drawn (`page:ready { drawn }`, the shell's init to a waiting page, a failed load, or 1.5 s; at most 1.5 s after the first placement, 5 s after creation); until then it is on screen at no opacity (macOS, Windows) so its documents load and paint at full pace.
- Closing keeps the tab with its history on a closed stack; `mod+shift+t` and the palette reopen it with history and position.

## Message API

Envelope `{ v: 1, type, id, replyTo?, payload }`, validated by `core/bridge-protocol.js`; unknown types are dropped. Desktop transport is the preload `window.kitBridge` over IPC (the main process checks the sender); browser transport is `postMessage` restricted to the same origin.

| page → shell | payload |
|---|---|
| `page:ready` | `{ drawn? }` (drawn: the page drew its first document from the desktop's boot values; a window waiting for it shows then) |
| `page:meta` | `{ title, icon, crumbs?, context? }` |
| `page:navigate` | `{ address, newTab?, replace? }` |
| `page:open-panel` | `{ prompt?, context? }` |
| `page:open-tool` | `{ toolId, path, title }` |
| `page:toast` | `{ title, body?, tone? }` |
| `page:context-menu` | `{ items: { id, label, enabled, checked, type }[], x, y }` → reply `shell:context-choice { id }` |
| `page:shortcut` | `{ keys }` |
| `page:action` | `{ name, arg?, on?, values? }`: an app action (`config.actions`) chosen inside the page, from an app menu or dialog; runs in the shell |
| `page:setting-set` | `{ key, value }` |
| `page:state` | `{ scrollY }` |
| `page:error` | `{ message, stack? }` |

| shell → page | payload |
|---|---|
| `shell:init` | `{ protocol, kitVersion, appId, address, tabId, theme, locale, settings, features, shortcuts }` |
| `shell:theme` | `{ theme }` |
| `shell:locale` | `{ locale }` |
| `shell:settings` | `{ values }` |
| `shell:history` | `{ canBack, canForward }` |
| `shell:reload` | `{}` |
| `shell:context-choice` | `{ id }` |
| `shell:zoom` | `{ zoom, bubble: { right } \| null, hud }` (zoom bubble and level pill drawn in the page, `zoom-indicator`) |

Pages never touch shell DOM and the shell never touches page DOM.

## Components

Every file in `components/` exports `name`, `css` and `render(props)`, and optionally `attach(root, ctx)` and `hook` (the data attribute a behavior-only component listens to). `components/index.js` registers them: `addAllStyles(doc)` inserts each component's CSS once, `attachAll(root, ctx)` wires behavior and returns `ctx` extended with `menu`, `palette` and `toast` APIs.

### Primitives and compositions

A screen is composed from a few primitives; a new screen element is a composition of them, never a new style.

| primitive | file | composed into |
|---|---|---|
| row | `settings-row.js` (with `settings-group.js`, `settings-section.js`) | connection row (`connection-row.js`: buttons + flow status + one status icon at the row end, a body only for a form or a failure's output), first-run choice, switch and connect rows, settings rows |
| floating surface | `menu.js` (`--float-*` tokens) | menu item, submenu, right-click menu, popover (`popover.js`), select list, tooltip (`tooltip.js`, edge-aware placement) |
| status icon | `status-icon.js` | connection rows, flow status, group marks |
| flow status | `flow-status.js` (+ `elapsed.js`) | connection flows, agent install: rolling text at the row end, a failure's cause and output |
| code view | `code-block.js` (file head, line numbers, diff with hunks and folded runs, side by side, copy, download through `core/save.js`; `core/diff.js` makes a diff text) | every code-like text: YAML and log tabs, GitOps file diffs, permission sheet, a failed flow's output, answer copy |
| file tree and viewer | `file-tree.js` (change letters, row end status), `file-viewer.js` (framed in a page) | GitOps tab |
| field | `field.js` (label, hint, lock) | first-run forms, dialogs |
| page column | `page-column.js` | every in-tab page (home, list, detail, settings body) |
| page header + pill tabs | `page-header.js`, `pill-tabs.js` | item home, item detail (an app’s home and detail pages) |
| data table, pager | `data-table.js`, `pager.js` | resource lists |
| flow graph | `flow-graph.js` | resource relations |

`ctx` is the only channel: `emit(name, payload)`, `resolveMenu(id, arg, el)`, `resolveContext(kind, arg, el)`, `nativeMenu(items, pos)?`, `nativeSurface(def, pos)?` (desktop floating surface for a menu the OS menu cannot draw), `openSide?`/`closeSide?` (side submenu outside the document), `onOverlay?`. Elements opt in with attributes: `data-action`, `data-arg`, `data-menu`, `data-context`, `data-tip`, `data-scroll`.

## Extension points

| what | where |
|---|---|
| screens | `routes` + `pages/*.html` composed from components |
| sidebar sections and rows | `sidebar.sections[].rows(state)` |
| menus, context menus | `menus`, `contextMenus` (functions returning menu definitions) |
| actions | `actions` (`kit.*` are built in) |
| palette | `palette.sources[].search(query)` |
| settings | `settings.groups[].pages[].sections` |
| AI | `ai.permissions`, `ai.providers`, `ai.efforts`, `ai.scope`, `ai.attachments`, `ai.adapter` |
| icons | `icons.map`, `icons.glyphs` |
| strings | `locales[defaultLocale]` |
| look | app-overridable tokens in `theme.css` |

## Overridable and fixed

- **An app may override:** tokens in the app-overridable block of `tokens.css` (`--brand`, `--brand-content`, `--action`, `--action-fg`, `--action-hover`, `--focus`, `--indicator`, `--switch-on`, `--font-display`), strings, the icon map and glyphs, every definition, pages and data.
- **An app may not override:** component CSS, geometry and motion tokens (row heights, radii, durations, springs), the bridge protocol and the host model.

## Electron security

| item | setting |
|---|---|
| scheme | privileged `standard, secure, supportFetchAPI, stream`; `<scheme>://app/<path>` serves repository files, any other `<scheme>://<route>` serves the route's page HTML |
| CSP | `default-src <scheme>: 'self'; img-src <scheme>: data:; style-src <scheme>: 'unsafe-inline'` (extendable by `desktop.config.csp`) |
| views | `sandbox`, `contextIsolation`, no `nodeIntegration` for the shell and every tab |
| preloads | shell: `window.kitShell` with allowed channels; page: `window.kitBridge.send/on/boot` only (boot: the app id, tab id, theme, language and stored settings for the first drawing) |
| IPC | sender must be the shell or a known tab view |
| permissions | denied by default |
| external tools | separate partition, no preload; navigation outside `origin`/`allowNavigate` opens the system browser |

## Motion

Durations and curves are tokens measured on the reference: menus 100ms, tooltips 150ms after a 600ms delay (400ms group window), collapse 200ms ease-out, sidebar sections open in 100ms and close in 200ms, toast 400ms, springs converted to CSS `linear()` (tab indicator 365ms, in-place submenu 447ms, switch 325ms). `prefers-reduced-motion` sets them to 0.

Redraws (`ctx.update()`, shell slots, chat body) patch the existing DOM with `core/morph.js` instead of replacing it, so elements keep their identity: transitions run, focus and caret stay, and a field being composed with an input method is never touched. Every scroller is a `[data-scroll]` element with overlay bars (`components/scroll-area.js`); a page's scroller is its `main`. `tools/check-states.mjs` checks these states.
