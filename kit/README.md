# kit

A product-agnostic UI kit for desktop-and-browser app shells: a sidebar, a path bar, tabs where each tab is its own page document with its own address and history, an AI panel, a palette and settings. An app adds only definitions, pages and data; the kit knows nothing about any product.

Each app lives in `apps/<id>/` and depends on the kit through public entries only.

## Layout of a repository

```
kit/                 generic: no product names, no domain terms, no product copy (checked by tools/check-deps.mjs)
  tokens.css         every raw value (color, size, radius, motion); app-overridable block at the end
  base.css fonts/    document defaults, Geist, Geist Mono and Pretendard (OFL)
  icons/             icon(slot) layer; glyphs.js is the only file holding drawings
  core/              html, routes, i18n, validate, bridge protocol, settings store, positioning
  components/        one component per file: render(props) + css + optional attach(root, ctx)
  shell/             createShell(config): frame, tabs, hosts, AI panel engine
  page/              bootPage(config, createPage) and page kinds (settings, ai/chat)
  desktop/           Electron main process start(desktopConfig, paths) and preloads
  locale/            en.js and ko.js with generic UI words only
  tools/             bundle, create-app, glyphs and the checks (check-deps, unused-check, check-reuse, check-locale, check-tests, check-release,
                     check, check-states, check-glass, check-brand, check-layout, check-visual with visual-baseline/)
apps/<id>/           one app: app.config.js, routes.js, theme.css, locale/, data/, pages/, desktop.config.cjs
```

## Files an app provides

| file | what it holds |
|---|---|
| `app.config.js` | the whole definition: brand (`mark` glyph key, `name`), locales, routes, sidebar sections (and app section kinds), top bar, menus, context menus, dialogs, actions, shortcuts, settings tree, first-run steps, palette, AI (only with the panel feature) |
| `routes.js` | the address table (`{ id, pattern, page, kind? }`), read by the shell and the desktop main process |
| `desktop.config.cjs` | the desktop window: `appId`, `name`, `scheme`, `icon` (PNG on the platform icon template), `packageIcon` (.icns), window size and styles, external tools, `services` (a main-process module the shell and pages call with `service(name, args)`; `onService` receives its events; in a browser `hasService()` is false) |
| `theme.css` | only the app-overridable tokens (brand, action, focus, indicator, switch, display font) |
| `icon-map.js`, `glyphs.js` | icon slot names to glyphs; the brand mark is an own drawing `{ viewBox, svg }` in `glyphs.js` |
| `locale/<code>.js` | one dictionary per language with the same keys |
| `assets/icon/` | `icon.png` (1024, on the platform icon template), `icon.icns` (packaging) and the logo source |
| `data/`, `pages/` | the data source and the page documents (kit components and page kinds only) |
| `index.html`, `shell.js`, `desktop.cjs`, `package.json` | entry points, the same few lines in every app |

Swapping a logo or app icon is replacing `assets/icon/*` and the brand mark drawing in `glyphs.js`; the keys stay (`brand.mark`, `desktop.config.cjs icon / packageIcon`).
A new app starts from the sample: `node kit/tools/create-app.mjs <id> <Name>` copies `apps/sample` and renames it; `apps/sample` shows a structure
different from the first app (no AI panel, no identity chip, its own sidebar section kind, list / document / details pages).

## Build a new service, step by step

1. **Create the folder.** Copy the shape of an existing app folder: `package.json`, `index.html`, `shell.js`, `app.config.js`, `routes.js`, `theme.css`, `icon-map.js`, `locale/ko.js`, `data/index.js`, `pages/`, `desktop.cjs`, `desktop.config.cjs`.
2. **Name it.** In `app.config.js` set `schema: 1`, `id`, `name`, `scheme` (internal address scheme, never shown), `kitVersion`, and `kitBannedTerms` (your domain words; the kit must never contain them).
3. **Strings.** Write one dictionary per language with the same keys, `locale/en.js` as `{ ...kitLocaleEn, 'yourapp.key': '...' }` and `locale/ko.js` over `kitLocaleKo`, and pass them as `locales: { en, ko }` (`defaultLocale` when the system languages match none). Every label in a definition is a Text value: a locale key, `{ key, vars }`, `{ date }` / `{ number }` (formatted for the language in use) or `{ raw: 'literal' }` for data values; words of the tool your app works with that stay untranslated go in `terms`. The `kit.locale` setting (a settings row with `sel('kit.locale', …)`) switches the shell, every tab, the menu bar and floating surfaces at once.
4. **Icons.** Map slot names to glyph keys in `icon-map.js` (`{ slot: [glyphKey, strokeWidth, 'fill'?] }`), generate app glyphs with `node kit/tools/glyphs.mjs <icon-nodes.json> --app apps/<id>/icon-map.js --out apps/<id>/glyphs.js`, and pass both as `icons: { map, glyphs }`.
5. **Routes.** List screens in `routes.js` (`{ id, pattern, page, kind? }`, pattern like `project/:project`). In `app.config.js` add `title`, `icon`, `crumbs` and `ident` functions per route. Each route's `page` is `pages/<page>.html`.
6. **Pages.** Each page HTML loads `kit/fonts/fonts.css`, `kit/tokens.css`, `kit/base.css`, your `theme.css`, then a module that calls `bootPage(config, ctx => ({ render, actions, menus }))`. Compose screens from `components` only. Built-in kinds: `createSettingsPage`, `createStartPage`, `createChatPage`.
7. **Data.** `data/index.js` exports `createDataSource(mode)` returning `{ get(key, params), now(key, params) }`. Pages fetch their own data; the shell only receives `page:meta`.
8. **Sidebar, menus, actions, palette, settings, AI.** Fill the definitions described in [CONTRACTS.md](CONTRACTS.md). Every `action` is an id; kit actions start with `kit.`.
9. **Theme.** In `theme.css` override only the app-overridable tokens (brand, action, focus, indicator, switch, display font).
10. **Check.** Run every check listed in the repository's AGENTS.md and fix every finding (the browser checks need
    `NODE_PATH=<dir with playwright-core>` and Chromium at `CHROMIUM_PATH` or the playwright default location).
    `check.mjs` opens every route from `config.examples`, every menu, tab back/forward/close/reopen and the palette, and fails on any console error, horizontal scroll or overflowing text.
    `check-glass.mjs` opens every menu, submenu, popover and select list over a transparent page (as in the desktop window) and fails when anything below shows through sharp.
11. **Run.**
    - Browser: serve the repository root over HTTP and open `apps/<id>/index.html`.
    - Desktop: `cd apps/<id> && npx -y electron@44.7.2 .` (Electron 39 or later is required for `corner-shape`).
    - Single file: `node kit/tools/bundle.mjs apps/<id>/index.html <out.html> --pages apps/<id>/pages`.
    - First run again (development only): a desktop development run has View › Show First Run Again (`kit.firstRun.open`); in the browser
      clear `kit.firstRun.done` in the app's settings store. Apps have no settings entry for it.

## Before release

Debug-only aids (diagnostic log `KIT_DESKTOP_DIAG`, calibration backdrop `KIT_DESKTOP_BACKDROP`, native material probes, View menu Developer Tools
and Show First Run Again) all live in `kit/desktop/debug.cjs`. `main.cjs` loads it only in an unpackaged run (`KIT_DEBUG=0` previews the
release without it), and `kit/desktop/release.cjs` lists the paths a package leaves out (pass `ignore` to the packager).
`node kit/tools/check-release.mjs` lists the entry points and fails when any is reachable outside the debug module, when the module is not
behind `app.isPackaged`, when packaging would include it, or when an app screen reaches `kit.firstRun.open`.
Packaging icon: `desktop.config.cjs` `packageIcon` (.icns) goes to the packager; `icon` (PNG) is the window and development Dock icon.

## Rules that keep the kit reusable

- kit never imports from `apps/`; apps import only `kit/index.js` (shell), `kit/page/index.js` (pages), `kit/desktop/index.cjs` (main process) and `kit/locale/*.js`.
- Raw values live only in `kit/tokens.css` and an app `theme.css`. Breakpoints in `@media`/`@container` are the one exception (custom properties cannot be used there).
- Components are pure. A component never reads another component's DOM and talks to the outside only through `ctx.emit(name, payload)`.
- Definitions are data. The config is validated at shell and page start; problems render the kit error screen instead of a broken UI.
- AI is read-only by default. A change is a proposal that waits in the question panel above the composer until a person chooses; choosing allow runs it, and the decision goes to the app's record.

## Gallery and layouts

`design/gallery/components.html` renders every component in its states with an app's data; `design/gallery/layouts.html` recomposes the same components (panel on the left, reordered sidebar sections, a settings page from another definition).
