# Contracts

Every definition an app hands to the kit. The same shapes are JSDoc typedefs in `core/types.js`. `core/validate.js` checks the config when the shell and each page start.

## Text

`Text = LocaleKey | { raw: string } | { key: LocaleKey, vars?: { [name]: string | number | Text } } | { date: Date | string | number, format?: Intl.DateTimeFormatOptions } | { number: number, format?: Intl.NumberFormatOptions } | (() => Text)`. Every form is read in the locale in use when it is drawn, so a language change redraws it; `vars.count` picks a plural form (`<key>.one`, `<key>.other`, …) when the dictionary has one. A date is never shown without its year: a `{ date, format }` whose format names the month or the day gets the year, and the clock (`core/clock.js`) writes days as `YYYY-MM-DD` (`formatDay`, `formatFull` to the second, `formatInstant` past a day and a half). Locale keys belong to the kit (`shell.*`, `tab.*`, `panel.*`, `composer.*`, `message.*`, `approval.*`, `settings.*`, `palette.*`, `menu.*`, `table.*`, `time.*`, `error.*`) or to the app under its id prefix (`<id>.*`). Data values such as resource names are `{ raw }`.

## App config (`apps/<id>/app.config.js`, default export)

| key | type | required | notes |
|---|---|---|---|
| `schema` | `1` | yes | |
| `id`, `name`, `scheme` | string | yes | `scheme` is lowercase; addresses are never shown |
| `kitVersion` | semver range | yes | |
| `kitBannedTerms` | string[] | no | words the kit must never contain (used by check-deps) |
| `brand` | `{ mark: IconSlot, name: Text }` | yes | `mark` must be a known icon slot |
| `locales`, `defaultLocale` | `{ [code]: Dictionary }`, string | yes | one dictionary per language, each with the same keys (check-locale); `defaultLocale` is used when the system languages match none. The setting `kit.locale` (`'system'` or a code) picks the language; a change applies at once to the shell, every tab (`shell:locale`), the menu bar and floating surfaces |
| `terms` | string[] | no | domain words shown untranslated in every language (column names and states of the tool the app works with); check-locale accepts them as literals |
| `icons` | `{ map?: IconMap, glyphs?: Glyphs }` | no | |
| `features` | `Features` | no | defaults below |
| `data` | `DataSource` | yes | |
| `dataMode` | `'mock' \| 'live'` | no | `mock` for an app with sample data, `live` for live data (validated only; kit does not read it) |
| `routes` | `Route[]` | yes | |
| `start` | Address \| `({ settings, restoring }) => Address \| null` | yes | first tab when no session is restored, a new tab, and the tab opened when the last one closes (a function reads the stored settings each time). `restoring: true`: the place a restored tab on a gone page (removed or unknown route) comes back on; null drops that tab |
| `sidebar` | `{ sections: SectionDef[], bottom: SlotItem[], kinds?: { [kind]: (section, state, api, { components, html, text, t, icon }) => Markup }, pinnedTabs?: { columns?: number }, bookmark?: ActionId }` | yes | a section is rows (`rows`), the open tabs (`kind: 'tabs'`) or an app kind from `kinds` that draws its body from kit components; `pinnedTabs` adds Pin and Unpin to the tab menu and draws pinned tabs as tiles above the sections (up to `columns`, default 4, per row; more wrap into balanced rows); `bookmark` adds "Add tab to bookmarks" to the tab menu and the action gets `{ address, title, icon }` |
| `menus` | `{ [id]: (arg, ctx) => MenuDef }` | no | |
| `dialogs` | `{ [id]: (arg, { settings }, api) => DialogDef }` | no | opened from pages (see Dialogs) |
| `contextMenus` | `{ [kind]: (arg, ctx) => MenuDef }` | no | |
| `actions` | `{ [id]: (arg, api: ShellApi) => void \| Promise }` | no | `kit.*` are built in |
| `settings` | `SettingsDef` | when `features.settings` | |
| `palette` | `PaletteDef` | when `features.palette` | |
| `firstRun` | `FirstRunDef` | no | full-window first-run flow (see First run) |
| `ai` | `AiDef` | when `features.panel` | |
| `tools` | `ExternalTool[]` | no | |
| `shortcuts` | `Shortcut[]` | no | |
| `terminal` | `TerminalDef` | no | bottom terminal panel (desktop), see Terminal |
| `topbar` | `{ ident?: false, buttons?({ route, params }, state, api): SlotItem[] }` | no | right-side top bar buttons (`disabled`, and `on` for a toggle that is on); a button with `menu` opens it as a popover. `ident: false` draws no identity chip (the path starts after the navigation buttons); a route `ident()` returning null does the same for that route |
| `examples` | `{ [routeId]: params }` | no | used by `tools/check.mjs` |

`Features` defaults: `{ tabs: true, panel: true, settings: true, palette: true, externalTools: false, restoreSession: true }`.

## Routes

```
Route { id, pattern, page, kind?: 'page'|'settings'|'chat',
        title(params): Text, icon(params): IconSlot, crumbs(params): Crumb[], ident?(params): { icon, label: Text, menu?: MenuId, arg? } }
Crumb { label: Text, switcher?: MenuId, arg?: any }
```

A tab whose route kind is `chat` or `settings` keeps the AI panel closed while it is active; the panel comes back on other tabs.

The identity chip (`ident`) names the top level; the path bar starts at the next level and never draws a crumb whose label equals the identity label (the crumb stays in `crumbs` for the context chip). A switcher for the top level belongs in the identity chip's popover.

`pattern` uses `:name` segments, for example `project/:project/item/:item`. The entry file is `pages/<page>.html`. `routes.parse(address)` returns `{ route, params, query }`; `routes.build(id, params)` returns an address.

## Sidebar

```
SectionDef { id, label: Text | (state) => Text, tip?: Text, kind?: 'tabs', variant?: 'collection', untitled?: Text, context?: ContextKind, optional?: boolean,
             enabled?(state): boolean, rows?(state): RowDef[] }
RowDef     { id, label: Text, ctx?: string, icon?: IconSlot, fav?: boolean, lead?: boolean, dot?: 'ok'|'warn'|'off'|'critical'|'high'|'medium',
             address?: Address, action?: ActionId, arg?, context?: ContextKind, selected?, closable?, draggable? }
SlotItem   { icon: IconSlot, tip: Text, action?: ActionId, menu?: MenuId, arg? }
```

An `optional` section shows while its id is in the `kit.sidebar.sections` setting (all optional sections while it is unset); the settings page edits it with a multi select whose always-shown sections are `fixed` options.

`fav` draws the icon as a page icon tile (`favicon()` in `icons/icons.js`), the way a site icon is shown. Tab rows, open and closed tabs in the palette, and the context chip get it for pages of kind `page` and external tool pages. `lead` rows stay visible while the section is collapsed. Collapsed sections are stored per section under `kit.collapsed`.

## Menus

```
MenuDef  { items: MenuItem[], side?: 'bottom'|'top'|'left'|'right', align?: 'start'|'end', width?, minWidth?,
           morph?: boolean, variant?: 'select'|'native'|'popover', icons?: boolean, sideOffset?, alignOffset? }
MenuItem { id, label: Text, icon?, fav?, dot?, desc?, end?, endIcon?, shortcut?: string[], checked?, checkbox?, box?, switch?, on?, confirm?, danger?, disabled?,
           tone?: 'ok'|'warn'|'danger', chevron?, actions?: RowButton[], subButton?: Text, rainbow?, submenu?: MenuDef, action?: ActionId, arg? }
       | { type: 'header', label } | { type: 'label', label } | { type: 'separator' } | { type: 'search', placeholder, kbd? }
       | { type: 'choices', shape: 'swatch'|'icon', items: { color?: TokenName, icon?, label, checked?, action, arg? }[] }
       | { type: 'bulk', label }
RowButton { id, icon, tip: Text, action: ActionId, arg?, on?: boolean }
```

`morph` opens submenus in place (narrow panels); otherwise they open to the side. Switch items keep the menu open. Checkbox items (a multi list) keep it open too; `box: true` leads the row with a kit checkbox instead of the trailing check. A `bulk` row over them is the tri-state select-all menu checkbox row (kit checkbox: checked when every row in sight is on, `aria-checked="mixed"` with a dash when some are, empty when none); choosing it turns the rows in sight (a search narrows them) on, or off when they all are, and emits the list's action once with `{ arg: { ...arg, values }, bulk: 'all'|'none' }`. `select.menuDef({ multi, boxes, bulk })` builds such a list (a scope filter: namespaces). A color swatch runs its action and keeps the menu open with the choice marked, an icon grid cell runs its action and closes; a right-click menu with a choices row is drawn as the web menu with item icons (`icons`) in the desktop shell too.

### Popovers

A popover is a `MenuDef` with `variant: 'popover'` (`components/popover.js`), opened from the route's `ident.menu` (the identity chip) or a `topbar.buttons` entry. Opening, closing, Escape, focus return and submenus are the menu's; Tab and Shift+Tab move the highlight. In a popover:

- `{ type: 'header' }` is the muted first line; `tone` marks the status row, always tinted by state.
- `desc` is one muted line under the label; An `optional` section shows while its id is in the `kit.sidebar.sections` setting (all optional sections while it is unset); the settings page edits it with a multi select whose always-shown sections are `fixed` options.

`fav` draws the icon as a page icon tile and `dot` adds a status dot after the label.
- `switch` with `confirm: true` never changes the value: the popover closes and the action receives the requested value, so the app can ask first.
- `chevron` adds a trailing chevron to a row that opens a page; `actions` are row end icon buttons that run without closing; `subButton` opens the row's submenu from a row end button instead of on hover.
- Menus, submenus, right-click menus, popovers and tooltips share one floating surface (`--float-*` tokens: radius, padding, row height, fill, edge, shadow). Menus and submenus are glass on the desktop; popovers and tooltips are opaque there (`--float-solid`). Every surface is anchored to its trigger (`sideOffset` defaults to `--space-1`).

## Settings

```
SettingsDef  { defaults: { [key]: value }, footer?: (NavItem & { url?: string })[], groups: { label: Text, pages: SettingsPage[] }[] }
SettingsPage { id, label: Text, icon: IconSlot, activeIcon?: IconSlot, title?: Text, help?: Text, badge?: Text, promote?: boolean,
               children?: SettingsPage[], tabs?: { id, label }[], tabsEnd?: Control,
               sections: SettingsSection[] | (ctx) => Promise<SettingsSection[]>, actions? }
SettingsSection { title?: Text, description?: Text, count?, badge?: { label: Text, tone? }, tab?,
                  groups?: (SettingsRow[] | { notice?: { text: Text, action?: Control }, rows: SettingsRow[] })[],
                  intro?: { title, description?, actions?: Control[], picture?: { icon } }, faq?: { id, title, body }[],
                  records?: { start?: Control[], end?: Control[], rows: Record[] | (ctx) => Promise<Record[]>, empty: Text },
                  empty?: { icon, title, description?, action?: Control }, toolbar?: { start?: Control[], end?: Control[] }, none?: { icon, title } }
SettingsRow  { id, title: Text, description?: Text, icon?, tile?, avatar?: Text, dot?, control?: Control, extra?: Control[], stack?: Control,
               trail?: 'chevron'|'external', action?, arg?, rowMenu?, dialog?, variant?: 'add', wideControl? }
Control      { type: 'switch', key, disabled? } | { type: 'select', key, options?: Option[] | (ctx) => Option[], multi?, summary?: { all, none, some }, width?, placeholder?, disabled? }
           | { type: 'button', label?, icon?, variant?, size?, action?, arg?, menu?, dialog?, split?: MenuId, tip? } | { type: 'kbd', keys, menu?, record?: key, reset? } | { type: 'kbd', shortcut: ShortcutId, label? }
           | { type: 'value', text } | { type: 'badge', tone, label } | { type: 'status', state, tip?, menu? } | { type: 'more', menu, arg? }
           | { type: 'split', key, options, menu } | { type: 'progress', value, tone? } | { type: 'link', label, icon?, action?, arg? }
           | { type: 'choices', key, options: { id, label, picture?: { icon } }[] } | { type: 'group', items: Control[] } | { type: 'search', key, placeholder, width? }
Record       { icon?, avatar?, title: Text, meta?: Text[], end?: Text, tone? }
```

Settings pages hold data only; there is no markup hook. A page's `children` open under it in the nav while it or a child is current; a child with `promote` stays at the top level while the list is closed. A `dialog` on a row or button opens that dialog (see Dialogs).

Option = { id, label: Text, icon?, desc?: Text, fixed?: boolean, tip?: Text }: `desc` is a second line in a multi list, a `fixed` option of a multi list is always on (checked, disabled, explained by `tip`). A multi select shows the chosen labels, or with `summary` the word for all, none or `some` ({n} chosen). A select of `kit.zoom` without options lists the zoom steps.

`{ type: 'kbd', shortcut: id }` is an editable shortcut (see Shortcuts): the key button records new keys (a combination already in use is refused with a toast), its "…" menu resets to the default keys or removes it. While it records, the desktop app suspends its shortcuts and menu key equivalents.

Values live in the settings store. Reserved keys: `kit.theme`, `kit.locale`, `kit.windowStyle` (desktop window style, a key of DesktopConfig window.styles), `kit.session`, `kit.collapsed`, `kit.sidebar.sections`, and the behavior keys with kit defaults (`core/settings-store.js` KIT_DEFAULTS):

| key | values | effect |
|---|---|---|
| `kit.zoom` | a zoom step as text, default `'1'` | every tab page's zoom; the zoom keys change it for the session, Actual Size (⌘0) returns to it |
| `kit.tab.position` | `'top'` \| `'bottom'` | where a new tab (⌘T, the new tab row) goes in the tab list |
| `kit.tab.switchOrder` | `'recent'` \| `'sidebar'` | ⌃⇥ / ⌃⇧⇥ order: most recently used (presses under a second apart continue the run) or the sidebar order |
| `kit.shortcuts` | `{ [ShortcutId]: keys \| null }` | the user's shortcut keys; null removes one |
| `kit.ai.followUp` | `'queue'` \| `'steer'` | a message sent while the AI works waits for the run, or stops it and goes now |
| `kit.ai.tabSession` | `'new'` \| `'keep'` | each tab keeps its own panel conversation (a tab without one starts a new chat), or one conversation stays across tabs |
| `kit.ai.notify` | `('attention' \| 'done')[]` | system notifications while the window is in the background: a proposal waits, a run ends |
| `kit.ai.sound` | boolean | completion sound when a run ends or waits for a person (settings action `kit.settings.sound-preview` plays it) |
| `kit.spellcheck` | boolean | spell check in the app's text fields (desktop) |
| `kit.startup` | `'restore'` \| `'new'` | a new window opens the last session's tabs (with `features.restoreSession`) or the start address |
| `kit.openAtLogin` | boolean | open the app at login (desktop, packaged app only) |
| `kit.terminal.height` | number | height of the terminal panel (px), set by dragging its top edge |
| `kit.firstRun.done` | boolean | the first-run flow was finished |
| `kit.firstRun.step` | step id or null | unfinished step to resume; cleared on completion |

## Dialogs

```
dialogs: { [id]: (arg, { settings }, api) => DialogDef }      // app level; a page may add its own as createPage().dialogs
DialogDef { title: Text, description?: Text, size?: 'sm'|'md'|'lg'|'xl', layout?: 'stack'|'grid', fields?: Field[],
            submit: { label: Text, action: ActionId, arg?, variant?: 'default'|'destructive' }, cancel?: Text }
Field     { key, label: Text, type: 'text'|'textarea'|'code'|'select'|'switch', placeholder?, value?, required?, options?, json?, validate?(value, values) -> Text | null }
        | { type: 'rows', fields: Field[] } | { type: 'advanced', label: Text, style?: 'caret'|'chevron', fields: Field[] }
```

An element with `data-dialog` (a row or button `dialog`) or the action `kit.dialog.open` with `{ id, arg }` (a menu item or a page button) opens it inside the page document; the shell dims the rest of the window while it is open (`page:scrim`, pressing that dimming closes the dialog). The primary button stays disabled while a required field is empty; submitting runs the checks (required, JSON, `validate`) and either marks the field with one error line or closes and emits `submit.action` with `{ arg, values }`. An app action chosen inside a page (menu item, dialog submit) runs in the shell through `page:action`. App menus (`config.menus`) also open inside pages and receive `{ settings }` as their state.

## First run

```
FirstRunDef  { steps: FirstRunStep[] }
FirstRunStep { id, kind: 'welcome'|'tiles'|'options'|'switches'|'done', title?: Text, lines?: Text[], description?: Text, primary: Text, hero?: IconSlot,
               progress?: boolean, key?, value?, setting?: boolean, action?: ActionId, required?: boolean, skip?: boolean, skipTip?: Text, width?, back?: false,
               options?: FirstRunOption[] | (state) => FirstRunOption[] }
FirstRunOption { id?, label: Text, icon, sub?: Text, desc?: Text, badge?: Text, key?: SettingKey, action?: ActionId, arg?, disabled?: boolean }
```

The flow covers the whole window (the window drags by it; desktop tab views are hidden) until it is finished once: `kit.firstRun.done` in the settings store. A development run shows it again from View › Show First Run Again (desktop, unpackaged only) (the kit action `kit.firstRun.open`); finished apps have no settings entry for it, as on the reference. A step's value starts from the settings store (`key`) or `value`; Next stores it (`setting`) and hands it to `action`; Skip moves on without either. `tiles` choose several (`required` keeps Next off with none), `options` one, `switches` and `done` rows with a `key` are switches written at once and rows with an `action` are links. `progress` steps get the dots.

Unfinished flows resume the stored step ID, or the step that lists it in `aliases` (a step merged or removed in a later version); unknown IDs fall back to the first step. Reopening a completed flow starts at the first step. A `checks` step may define `failureGroup` for stopped or rejected checks. The shell passes `check(id, api, isCurrent)` an optional validity callback for guarding app-side effects. Results remain attached to their original step within a session. Closing, reopening, stopping, or replacing a row invalidates its pending response. `api.firstRun.render()` starts checks for newly discovered item IDs in the active checks step. Disabled switch options use the shared switch capability.

## Palette

```
PaletteDef    { placeholder: Text, keys?: string[], shortcut?: string, sources: PaletteSource[] }
PaletteSource { id, label: Text | (settings) => Text, search(query): PaletteItem[] | Promise<PaletteItem[]>, queryOnly?: boolean, limit?: number }
PaletteItem   { id, label: Text, icon?, fav?: boolean, end?: Text, endIcon?, action: ActionId, arg? }
```

Open tabs and recently closed tabs are kit sources. A `queryOnly` source (a whole-catalogue name search) is hidden until something is typed; `limit` caps how many of its matches are shown.

## AI

```
AiDef { permissions: Permission[], defaultPermission: id | (settings) => id, providers: Provider[], models?(): Promise<Provider[]>, defaultModel?: { provider, model },
        efforts: { id, label, rainbow? }[], defaultEffort, scope?: { icon, tip, label(state, settings), menu(state, api, settings) },
        attachments?: MenuItem[], placeholder: { start, reply }, adapter: AiAdapter, settingsAddress?, chatMenu?(),
        approvals?: { choices?: Choice[], allowAlways?: boolean }, screenRelay?: { event: string, reply(answer) } }
Choice     { id, label: Text, shortcut?: string }   // only 'allow' with permission 'ask' may execute; shortcuts like 'mod+enter', 'escape'
Permission { id, label, icon, desc, risky? }
Provider   { id, label, icon, models: { id, label, effort? }[] }   // effort: true when the model takes an effort level; the effort button shows only for such a model
AiAdapter  { send(request, { signal }): AsyncIterable<AiEvent>,
             resolveApproval?(id, choice, { permission, proposal: { title, target, icon }, instruction? }): Promise<Decision>,
             recordApprovalDecision?(id, choice, { permission, proposal: { title, target, icon }, instruction?, reason, time }): Decision | Promise<Decision> }
Decision   { state: 'ran'|'approved'|'denied', by?, time?, replayed?: boolean }   // approved: the app recorded the approval and runs nothing itself
AiEvent    { type: 'text', text } | { type: 'step', icon, text, id?, state?, meta? } | { type: 'table', head, rows }
         | { type: 'code', lang, text, diff? } | { type: 'approval', id, question?, title, target, diff, icon?, head?: ApprovalHead } | { type: 'done', refs?: AiRef[] } | { type: 'error', message, refs?: AiRef[] }
AiRef      { n, label: string, tip?: string, address? }   // the evidence an answer's "[n]" mark cites
```

A `step` with an `id` is one row of the answer's steps: a later `step` with the same id changes that row (`state`: run, done, fail; `meta`: how long it took) instead of adding one. A step with a `state` draws as the step row's state form (the status mark of the state, the text, the quiet meta).

An answer's `refs` (on its `done` or `error` event, and on a listed conversation's answer) turn the answer's `[n]` marks they name into reference pills (`ref`): the label, the tip, and a press opens `address` as a detail card beside the conversation (`kit.ai.ref`). A mark no ref names stays as written.

The default permission is read-only. With no known model (`providers` empty or no `defaultModel`) the model button under the composer keeps its place and reads the plain word for model. `models()` reads the models of the connected providers when the conversation opens: they replace `providers`, the first model becomes the choice unless the current one is among them, and when none answers the model button reads that no model is connected (`composer.noModel`); the effort menu then opens with that reason as its first line and every level and option disabled. An `approval` event is a proposal waiting for a person.

Screen relay (`screenRelay`): the AI reads or changes the screen the person sees, and opens panes, as the simulation's AI does. The app's main process emits the service event `event` with `{ request, op: 'get' | 'set', patch?, open? }`; the shown page that declares a `screen` (not a detail card, not a hidden tab) answers once through `reply({ request, value })`:
- `get`: `{ view: the page address, state: ctx.state(), ai: the declared ai keys }`;
- `set`: `patch` goes through `ctx.setState(patch, { ai: true })` (only the declared `ai` keys and the search key are taken, each shown as a removable chip), and `open` (an address of the app's own scheme: a report, an evidence piece, a detail) opens as a detail card beside the page; the answer is `{ view, applied: keys, chips: keys, open }`.
The first answer wins; with no page to answer the app treats the screen as absent. The relay never presses a page's own actions (approve, merge, run).

The conversation DataSource key accepts optional `params.id`: without it, the active list stays unchanged; with it, the source returns only the matching known conversation, or an empty list for an unknown id. A known archived conversation may contain its original metadata and `messages: []` and optional `bodyMissing: true` when the source has metadata but no historical body. This flag describes the supplied read result and adds no stored field. Summary metadata is not a message or historical evidence. The full-tab page passes its route params through `engine.loadList(params)` and displays the existing empty state for a known conversation with `bodyMissing: true` and no messages; a new conversation, unknown id or failed lookup does not imply a missing historical body. The panel's default list and empty composer are unchanged. This read contract adds no persistence or guarantee of permanent loss.

- in the conversation the proposal is part of the answer: its target line (`title · target`) as answer text and the change (`diff`) as a code block.
- an approval with `head` (approval head props) shows it as the question panel's detail, and its choices carry their keys with no footer (the choice decides).
- while it waits, the question panel (`question-panel`) sits right above the composer: `Q. question` (default `approval.question`) with a counter, numbered options from `approvals.choices` (default allow `mod+enter`, deny `escape`), and Cancel and Submit pill buttons. It appears and leaves without animation, as on the reference.
- keys inside the panel: up and down move the selection and wrap, Enter or Submit picks the selected row, Escape or Cancel declines, an option's shortcut picks it; `mod+enter` also works from anywhere in the document outside a text field.
- the composer stays below in answer mode (placeholder `approval.answer`): sending text declines the proposal with `instruction` and sends it as a user message; it is never an approval.
- `approved` is the result of an allowed proposal the app recorded without running it (the run is a person's or another system's); the result line reads approved (`approval.approved`), never ran.
- only permission `ask` with choice `allow` may execute through `resolveApproval`; `ask` with `deny` resolves a refusal. Other permissions or choices call only `recordApprovalDecision`, with reason `permission` or `invalid-choice`, and must persist `denied` with the app-owned actor, actual decision time and reason. This callback never executes or elevates permission. Missing or failed recording leaves the question pending.
- the app preserves the first terminal decision for each proposal id and returns its original state, actor and time on duplicates (`replayed: true`), without repeat execution. The engine displays that authoritative result even if a later choice differs. A new execution result requires explicit `ran`; missing responses never imply execution. A result line (`ran` or `denied`, who, when) follows the proposal in the conversation. The app keeps the record (for example an audit log).
- an in-process duplicate waits for the active decision to finish; an unfinished allow intent is never saved or returned as completed `ran`. A replayed `ran` returned to a blocked read-only choice is the original recorded result, not a new approval or execution by that choice.
- generated and fallback decisions share the same in-process reservation with blocked recording. After an effect completes, a failed save retains its original outcome, actor and time; any later choice retries only that record and remains pending until persistence succeeds. This is a same-realm guarantee, not a distributed claim. The sample keeps at most 128 active or unsaved settlements in memory until saved (or the realm ends); capacity rejects new decisions before effects and never evicts an unsaved result.
- `allowAlways: false` drops a choice with id `always`; defining one anyway is a config error.

## Pages

```
bootPage(config, createPage)
createPage(ctx) -> { render(): Html, css?, init?(), afterRender?(root), meta?(): PageMeta, actions?, menus?, dialogs?, contextMenus?, onSettings?(values), onHandoff?(h), screen?: Screen }
  onHandoff: what only the shell holds for this address, with shell:init (h.conversation: a panel conversation opened as a tab)
ctx  { config, router, route, params, query, address, data: DataSource, api: PageApi, t, text, icon, settings(), pageIdentity(): PageIdentity | null, update(),
       state(), setState(patch, { ai? }): string[], resetAi(key?): boolean, aiApplied(): { key, value, before }[], screen(): Screen | null }
Screen { state: { [key]: default }, ai?: key[], search?: { key, scope?, reset? }, range?: { key, retention? },
         set?: { [actionName]: [key, 'text'|'pick'|'page'|(payload) => value, reset?: { [key]: value }] } }
PageIdentity = Readonly<{ appId: string, tabId: string, address: string }>
PageApi { navigate(address, { newTab?, replace? }), openPanel({ prompt?, context? }), openTool(toolId, path, title),
          toast({ title, body?, tone? }), contextMenu(items, x, y): Promise<id>, setMeta(meta), setSetting(key, value) }
PageMeta { title: string, icon: IconSlot, context?: { icon, title, sub } }
DataSource { get(key, params?): Promise<any>, now?(key, params?): any }
```

Screen declaration (`page/screen.js`): a page that returns `screen` has its state kept by `bootPage` (a copy of the declared defaults). `ctx.state()` reads it, `ctx.setState(patch)` merges and redraws. Each `set` entry becomes a page action that sets one key from its payload (`text`: the typed value, `pick`: the chosen id as a string, `page`: a number) and applies its `reset`; a handler the page defines under the same name wins. Built-in actions: `kit.screen.search` sets `search.key` from the search field and applies `search.reset`; `kit.screen.range` sets `range.key` to the time range's value (`{ preset }` or `{ from, to, live }`, the shape `timeRange` takes back as `value`); `kit.screen.ai-reset` puts back the key a chip names. The AI sets the main view with `ctx.setState(patch, { ai: true })`: only the keys in `ai` and the search key are taken, each remembers the value it had before the AI first set it, `ctx.aiApplied()` lists them in order and `ctx.resetAi(key)` (or all, without a key) puts them back. `search.scope` is the page's own word ('list' filters the screen's list, another finds across everything) and is not read by the kit. Without `screen` these calls answer empty (`{}`, `[]`, `false`, `null`).

`ctx.pageIdentity()` returns null during `createPage` and `init`, and for a standalone page. The first `shell:init` whose `appId` equals `config.id` and whose `tabId` and `address` are non-empty, non-whitespace strings supplies a frozen copy before that valid init message invokes `onSettings` and draw. Values are preserved verbatim. An init without a valid identity still follows the existing initialization flow; a later valid init may supply the identity. Once set, repeated init messages, settings, theme and locale updates cannot replace it.

The address belongs to that document's `shell:init`. Navigation creates a new document with its new address and the same live shell tab ID; a duplicated tab has a separate ID. This metadata grants no authority or authentication and exposes no shell DOM or internal bridge access. It does not guarantee application state storage, history-entry recovery, closed-tab reopening or restart persistence; the app owns its investigation state.

## Faces

- One face radius: every face laid on the page (summary bar, question panel, change timeline, info card, chart card, code view, round settings group, disclosure card, round empty card) has `--r-surface` (half the closed summary bar's height with its edges, `--sbar-h / 2 + --line`) with `corner-shape: var(--corner-round)`. A closed bar is a pill, and the same bar open keeps exactly that corner. The pill controls and the faces of the AI panel, the sidebar and settings keep their own tone.
- The container owns the face; content inside it is flat. Inside a summary bar body (`.sbar-body`), a status flow section (`.sfl-sec`) and a question panel's detail (`.qp-detail`), a component that draws a face on the page (change timeline, chart card, info card, code view) draws no fill, border, radius or face shadow and adds no side inset of its own. The one exception is a code view in a question panel: it keeps its fill with a concentric corner (the panel's radius less its inset, set through `--surface-radius` / `--surface-corner`).
- A summary bar is a face + the items row (+ a body). Its body opens and closes by height and opacity over `--dur-bar` on the standard curve (opening: the height grows, the body fades in behind it; closing: the body fades first); reduced motion opens and closes at once. The items row stands on its own as well: `summaryBar.items(items)` draws the same row with no face (a page header, a detail head line), and the bar draws its row with the same function. An item with `wrap: true` (a bar's title) may take two lines.
- State motion is one vocabulary (`components/state-motion.js`, `motionOf(state)`): a mark that waits or warns breathes a soft halo, a failed one breathes in the error colour and shakes once as it enters the state, idle and unknown are still and muted. The status flow's marks, the summary bar's dots (`dotState`) and the relation graph's nodes all use it; reduced motion keeps the halo drawn and still. Times: `--dur-state-pulse`, `--dur-state-shake`, `--state-halo-mix`. A drawing with several marks is one clock (`stm-clock`): its halos and its `stm-pulse` icons follow one animated phase (`--stm-phase`), so a node's outline and icon breathe together.
- Flow graph (`components/flow-graph.js`): the node carries the state (warn, fail: a tint of the state colour on its face `--fl-state-tint`, the breathing outline and icon on the graph's clock); a tile's icon is drawn in its band's colour (the node's hue, `--fl-ico-hue`), softer between fronts and full as the flowing front passes it; every band keeps flowing whatever its state, and runs from the colour of the node it leaves (neutral when that node is ok and has no colour of its own) to the colour of the node it reaches, so a chain of failing nodes is one red flow and a recovery blends into green. `live: true` keeps the flow running; reduced motion: no flow and no breathing, colours and outlines stay. `stateLabels: { ok, warn, fail, idle }` names the states in the reading; `reasons: { label, count }[]` on a node or a link says why.
- Flow graph drawable range (relation with `stack`, unless `auto: false`): drawn whole when, at one linear scale, every band is at least `drawMin` (4) thick (the fullest column over the least flow at most the height over `drawMin`), no column has more than `maxNodes` (7) nodes and every column's tiles and names fit the height. Otherwise only the flows that touch a node in a state (warn, fail, busy) are drawn, at one linear scale among themselves, and what is left of each column is one summary node with no band (`summary: { [column]: { label, action?, arg?, icon? } }`, the label with `{n}` the amount and `{k}` how many items, a node's `count` saying how many it stands for). Still out of range, a column keeps its `keepTop` (6) largest problem nodes and folds the rest into one node in its worst member's state (`fold: { label, more }`), whose reading lists the members. A drawing in focus goes back to whole only within `hysteresis` (0.8) of the range. Bands are never thinner than `--fl-band-min`, never compressed or marked; figures and readings keep the real amounts (`link.amount`).
- Floating layers are never cut by a container: menus, selects, tooltips (`data-tip`), the time range panel and the flow graph's reading live on the document body; a reading that belongs inside a component (the change timeline's mark reading and its list) is lifted into the top layer while it shows (`core/position.js` `lift`/`drop`, the popover API) and placed in viewport coordinates with `place` (flips above/below, shifts inside the viewport; a long list scrolls inside it). A reading's heading stays in the text colour; a state colours only its mark.
- Redraws (`core/morph.js`): a component root (`data-c`) or a summary row whose rendered markup has not changed since the last draw is left as it is, with what its behavior code wrote into it, so a clock tick that changes nothing there does not make it fit again (no flicker). Rendered markup must therefore be stable for the same data: no counters or times in ids.
- Alerts that need a person are notices, not toasts (see Notices below). Toasts stay the short confirmations they are.
- Time axes (`core/time-axis.js`): charts with `timeAxis` and the change timeline draw day boundaries as `YYYY-MM-DD` majors and hours as minors when the page gives no `ticks`; the reading is `YYYY-MM-DD HH:MM:SS`. A time chart zooms with the wheel or a pinch around the pointer, pans by dragging, zooms to a marked span and resets on double-click; `chart.range { from, to }` and `chart.rangeAction` (`{ id, from, to, source }`) keep several charts on one window. The change timeline emits `zoomAction { from, to }` and resets to `home`.
- Time range (`components/time-range.js`, `timeRange`): the preset pills (`presets: { id, label?, seconds }[]`, default 1h · 6h · 24h · 7d) and "Custom", a panel on the floating surface with typed or calendar-picked start and end (YYYY-MM-DD HH:MM in `timeZone`), quick ranges, "Until now", the zone and the same window in UTC, and checks (end after start, not in the future, within `retention` seconds). The page owns `value` (`{ preset }` or `{ from, to, live }`, seconds); every choice emits `action` with `{ from, to, preset: id|null, live }`. A window marked on a chart (`rangeAction`) or a timeline (`zoomAction`) is passed back as a custom `value`; the Custom pill then shows it ("2026-11-12 13:20 – 14:05") with a clear button that returns to `fallback` (the pill keeps room for that button only then: otherwise every pill is padded the same on both sides). A zoom out button (⊖, or Ctrl+Z / Command+Z outside a text field) doubles the window in use around its centre (never past now nor before `retention`) and emits it with `preset: null`. The panel names the reference zone ('UTC+09:00 Asia/Seoul') and switches between the reader's zone and UTC; the choice is the setting `kit.timeZone` (written with `kit.setting.set`, or the page's `zoneAction` with `{ timeZone }`), which charts and lists read.
- List page toolbar: `listToolbar.render({ scope, search, filters, time, view })` (each slot is component markup). Left, in this order: scope (the select of where the list looks, or a log's object picker) → search (`--ltb-search-w`) → filters (status pill tabs with counts); right, right-aligned: time (`timeRange`, the one preset set 15m · 1h · 6h · 24h · 7d · custom; a page sets only its default through `value`) → view (a view toggle). Absent slots are left out and the rest never move; the row stands `--ltb-top` under the page header; when room is short the right group takes a line of its own, still right-aligned. `{ start, end, fill }` still draws the older free form.
- Control shape: controls in one row share one shape. In a list toolbar (`list-toolbar.js`) the select, the search field and the pill tabs are all pills (`--r-pill`) of `--control-h`; elsewhere a lone field keeps its form shape (`--r-control`). Every popup a control opens (a select's list, a menu, a popover) has the menu's radius (`--r-panel`) and row radius (`--r-row`). A select list shows `--select-rows` rows and scrolls; longer than that it gets a search field on top (`menuDef({ search })` overrides): typing filters, the arrows move through what is left, Enter picks, Escape clears the query first. A multi select's trigger says what is chosen in words (all, the one name, or a count), never "n/n".
- Status flow (`components/status-flow.js`): the line turns into a column on a card under 640 wide. `compact: true` (opt-in) keeps it across at every width: the steps draw closer, a step's name stays whole and the lines under it end in an ellipsis with their whole words in a tooltip shown only when cut (`data-tip-overflow`). The content is the same at every width either way.
- Switch: `toggle.render({ on, action, label?, text? })`; with `text` the switch is followed by that short name (muted xs, the whole pair one inline group, two such pairs a step apart), as a toolbar's on/off option (a log's time and wrap). Without `text` the markup is unchanged.
- Property grid: `layout: 'stack'` (opt-in) puts one label/value pair a line, so long values (links, annotations) never run past a narrow pane; other layouts are unchanged.
- Pill tabs: a tab may carry `icon` and a problem mark `badge: { tone: 'warn'|'danger', value? }` (a count in the tone's word colour, or a status dot without one).
- `iconStack` (`components/icon-stack.js`): a row of round marks `{ id, name, icon?, src?, status?: 'ok'|'warn'|'error'|'idle' }` that slide over one another when short of room and fold past `max` (default 4) into "+N"; `size: 'sm'|'md'`, `label`.

- Resizable panes: the shell resizes its cards by the gap between them (shares kept in `kit.detail.ratio` / `kit.detail.ratio3`). A page with its own side-by-side panes uses the same drag: `attachSplitPanes(root, { min, onChange })` (kit/page/index.js). The container is `[data-split="<id>"]` (`data-split-dir="h"` for stacked panes), handles `[data-split-handle="<index>"]` sit between the panes, the shares are written on the container as `--w0`, `--w1`, … for the page's layout, and `onChange({ id, weights })` fires once at the end of a drag.

### Incident parts

Content parts for a working screen (an investigation, a detail pane, a report's side). None draws a face: each sits in a summary bar's body, a stage or a question panel's detail, and its sub-items are hairline rows (never a card in a card). Every state is a `status-icon`; counts are named values, never a fraction; every word comes from props or a kit locale key (`labels` overrides).

| part | call | notes |
|---|---|---|
| reasoning chain | `reasoningChain.render({ grade: { label, kind, icon? }, source, conclusion, cells: [{ id, label, count?, items: [{ text, refs?: number[] }] }], refAction, icon?, open?, toggle?, head? })` | head: lead mark (default `search`), the conclusion, a quiet line with the grade word in its colour (`kind` ok · warn · idle), the source and `label N` for each cell with `count`; then one row a cell with items (fixed name column), each item followed by its `[n]` references. With `toggle` it is a summary bar whose closed line is `head` (else `grade · conclusion`, two lines at most) and whose body is the chain |
| verify card | `verifyCard.render({ stable, need, left?, max, conditions: [{ id, label, state: 'pass'\|'watch'\|'fail'\|'unknown'\|'unjudged', value?, optional? }], windows?: ('ok'\|'miss'\|'bad'\|'none')[], min?, labels? })` | four figures on a property-grid strip (a number is seconds and reads `m:ss`; `left` defaults to `need − stable`), a row per condition (pass ok, watch busy, fail error, unknown and unjudged idle) with the state word, value and optional at the end, and the named counts of windows (collected = ok + bad, missed, needed). `labels`: `{ stable, need, left, max, windows, missed, min, optional, states }` (`{n}` is the count) |
| action compare | `actionCompare.render({ options: [{ id, title, kind?, grade?: { label, kind, icon? }, change, reach?, route?: string[], note?, disabled? }], selected?, action, labels? })` | a hairline row per option: title, quiet kind word, grade mark with words, pick button (the selected one, else the first, is `default`; the rest `secondary`; emits `action` with the id); then change · reach · note · route (steps joined by →). `labels`: `{ pick, change, reach, note, route }` |
| approval head | `approvalHead.render({ target: string\|string[], tag?, source?, cause?, grade?, change?, code?: { text, path?, diff?, lang? }, reach? })` | above an approval question: the target in mono joined by ` / ` with a warning-dot tag and the request's source (client · desktop, MCP or API) as a quiet badge, the whole change (a wrapped code view, or one line), then the cause and action judgements as status marks and what it reaches |
| head lines | `headLines.render({ rows: [{ id, icon?, tone?, text, end?, attention? }] })` | at most three (`headLines.MAX`) settings rows in one round group under a detail head; lead is a status mark (`tone` a status kind, default idle; `attention` the waiting ring); no rows draws nothing |
| source chips | `sourceChips.render({ items: [{ id, name, icon, state: 'ok'\|'limited'\|'perm'\|'idle'\|'error'\|'busy', detail?, last?, arg? }], action, labels?: { states } })` | pill buttons (`--r-pill`): mark and name; any state but ok follows as its status mark and words (limited warn, perm lock, busy spins); the title is `name · state · detail · last`; emits `action` with `arg` or the id |
| log view | `logView.render({ lines: [{ n, at?, level?, text }], hits?: number[], gaps?: true, query?, wrap?, times?, labels?: { skipped } })` | mono grid rows: the source number as given (never renumbered), time, level (error and warning words take their colour), text. A hit (the numbers in `hits`; else lines holding `query`) keeps a tint and an edge mark and the query is marked; `gaps` puts one `⋯ N lines left out` row between non-consecutive numbers; `times: false` hides the time column, `wrap: false` scrolls sideways; the list scrolls in its own height |
| empty line | `emptyState.render({ title, variant: 'line' })` | the empty state inside a card: one muted line, no icon or action |
| row list | `rowList.render({ rows: [{ id, icon?, lead?, title, sub?, meta?, end?, action, arg? }] })` | hairline rows inside a parent face, each a button the table row height: lead, title (and a muted sub), muted meta and end, the chevron; emits `action` with `arg` or the id |
| metric bars | `summaryBar.metrics(bars, { columns })` | several summary bars as one table of columns: the first five items take the widths in `columns` (token lengths), figures are tabular, and a narrower container hides the fifth, fourth and third items whole (container queries) when that column has a fixed width; content-width items fold behind "+N" by priority |
| query line | `queryLine.render({ source?, query, state?: 'ok'\|'perm'\|'idle'\|'error' })` | status mark, source and the query in mono (wrapped, never cut) |
| stale line | `staleLine.render({ text, kind?: 'warn', icon?, action?: { label, action, arg } })` | a status mark with its words (values are not current) and a link to where to see why |
| evidence reference | `ref.render({ n, label?, tip?, action })`, `ref.list(ns, action, labelOf?)`, `ref.inText(text, action, labelOf?)` | a small pill button that names where the evidence is from (`labelOf(n)` gives `{ label, tip }`: "Logs · checkout-api · 14:02:05", the tip its excerpt; the same evidence the same label), else `[n]`; emits `action` with n |
| range row | `pager.range({ page, per, total, action, labels?: { range } })` | inside a card under its list: `from–to · total` (muted, tabular) and the pager, a hairline above; one page or less draws nothing |
| header subtitle | `pageHeader.render({ …, sub: string[] })` | the three-slot subtitle after the title (source · scope · retention), joined by ` · `, empty slots left out; without `sub` the header is unchanged |
| AI applied | `aiApplied.render({ label, chips: [{ key, label }], end?, action })` | the quiet row above a body: label, a removable round chip (secondary sm, ×) per value the AI set, emitting `action` with the key (`kit.screen.ai-reset` with a screen declaration), and an end link; no band or face; no chips draws nothing |

## Notices

`api.notify(NoticeDef)`, `api.updateNotice(id, patch)`, `api.dismissNotice(id)` (shell and page api; pages send `page:notify`).
`NoticeDef { id?, tone: 'danger'|'warn'|'ok'|'info', title (one line), severity (the word as it came; else label), fact (one fact; else summary, else count), target (else the last subtitle), since (ms; else at), resolvedAt (ms), action: { label, action, arg? } (the card's one press; else primary, else link), menu: { id, arg? }, summary, subtitle, labels (the title's tooltip), persist, duration (ms) }`. The same `id` again updates the card in place (patched, so focus and an open menu stay; a resolved alert is the same card with new words) and brings it to the front.

Why it looks and moves this way (how mature products notify):

| | Sonner / shadcn | Radix toast | Linear | GitHub | Slack | Grafana Alerting | PagerDuty | macOS / Windows |
|---|---|---|---|---|---|---|---|---|
| place | a corner, bottom by default, configurable | viewport corner | bottom left | top right flash | top right banner | top right | top right | top right / bottom right |
| width | 356 | ~360 | ~360 | fluid | ~360 | ~400 | ~400 | 344 / 364 |
| stack | collapsed behind the front card with depth, opens on hover | list | collapsed | one | list | list | list | grouped by app, collapsed |
| hierarchy | icon, title, description, action | title, description, action | icon, title, one line | message | sender, text | severity, title, labels | urgency, service, title | app, title, body |
| actions | one action and close | action and close | one action | close | open, dismiss | view, silence | acknowledge, resolve | up to three, more in a menu |
| severity | icon colour only | none | icon | colour bar | none | colour and badge | urgency badge | none |
| enter / exit | slide from the edge with fade; exit fades and shrinks toward the stack while the others glide | slide | fade and lift | fade | slide | slide | slide | slide in, fade out |
| timing | 4 s, paused on hover and focus | 5 s, paused | 4 s | stays | 5 s | stays for alerts | stays until acted | ~5 s, then the notification centre |
| close | button on hover, swipe | button, swipe | button | button | button | button | button | button, swipe |

The kit takes: top right under the window's top bar (it is a desktop app); about 360 to 380 wide; the Sonner stack (the newest in front, up to three, the ones behind a step lower and smaller, opening into a column while the pointer or the focus is on it, every time paused meanwhile); a card of two lines read in a second, as a notification centre row: the status icon, the title and how long it has been going on (for a resolved one, when it was resolved), then the severity word as it came (in the tone's colour, no ground) · one fact · the target; the whole card is one action (as PagerDuty's acknowledge, incident.io's declare), told by a chevron whose tooltip names it; no label chips, no buttons, no line that runs out (what the lines leave out is the title's tooltip and the app's menu, which shows with close while the card is pointed at); the same alert told again changes in place (a resolved alert is not a new card); enter from above (`--dur-notice`, `--ease-out-expo`), exit slipping quickly to the screen's edge (`--notice-leave-x`, `--dur-fast`, `--ease-exit`) while the others glide into place; critical alerts persist until closed or dismissed and hold the stack open, the rest run out (`--notice-duration`) with nothing drawn for it; and, since a persisting alert must not cover the page's controls, after `--notice-hold` with nobody on it the stack folds into one chip (worst tone, newest name, "+N") that opens it again on hover, focus or press, unless a critical card is in it. The card is the kit's face (`--r-surface`, the surface over the ground, the hairline ring, shadow md). Reduced motion: nothing moves, states change at once.

## Charts

- `chartCard.render({ ..., static: true })` (opt-in) draws the same chart as a still picture for a report or print: no frame (no face, border or padding), no hover reading, drag, zoom, info or expand button, legend entries as plain marks, the axes always shown, nothing animated; the axes, the year-bearing first time, the line and its area, the levels with their names, the legend and every token are the screen's. Without `static` the markup is unchanged (`chart-card-static.test.mjs`).
- Interaction follows the dashboards operators already use. Grafana: drag across a time panel zooms the x range, double-click (or ctrl+Z) zooms out, the wheel scrolls the page, the y axis auto-scales. CloudWatch: drag-select zooms, the time range control zooms out, no wheel zoom, y auto-scales. So a kit time chart (`chart-card`, `change-timeline`): a drag anywhere on the plot marks a span and zooms x to it (rounded out to the axis step), a double click zooms out to twice the window around its middle, the wheel always scrolls the page and nothing pans. `chart.rangeAction` is told `{ id, from, to, source: 'select' | 'zoomout' | 'scale' }` (a zoom out past the data names the wider window, for the page to fetch); `chart.zoomAction` / the timeline's `zoomAction` get `{ from, to }` when the page owns the window.
- Axes (`chart-card` with `interactive` 'full', approved 2026-11-16): the axes take a drag, as the operators asked. A drag along the time marks stretches the window around its middle (to the right narrower, to the left wider; half the plot's width doubles or halves it, at least a minute), the axes and lines following the pointer; at the end the page is told `source: 'scale'` (wider than the data: `'zoomout'`, naming the window asked for), so charts kept in step (one `chart.range` or one page window) move together. A drag along the value scale stretches the values from their low end (upward narrower, downward wider) and is the chart's own (charts in step carry different units; nothing is told). A double click on the time marks goes back to the window before the first stretch, on the value scale fits the values again. While an axis is held its range is read out in the plot (the span's time chip). The cursor is `ew-resize` over the time marks and `ns-resize` over the value scale. Keyboard on a focused chart: `-` and `+` (`=`) the window, Shift with the up and down arrows the values, `0` both back. A widget that only reads (`interactive` 'none') has no axis to drag (`chart-card-axis.test.mjs`).
- The change timeline adds one thing a chart has not: its band of times takes the wheel (a turn zooms around the pointer, Shift with a wheel or a drag moves the window, all through `zoomAction`), since a timeline is browsed along time; the wheel elsewhere on it scrolls the page. Its leftmost shown time and every day boundary carry the date. `marks[].dim` draws a mark quietly while a page filter leaves it out.
- Small charts read only: `chart.interactive` is `'none'` by default on a widget card (hover reading only, no drag, no double click); the large view (`chart-layer`) is always `'full'`.
- Values: the y axis fits what is shown (`chart.yScale: 'auto'`, the default for time charts; `'page'` keeps the page's `max` and `ticks`): fitted to the data at both ends with about 10% room (a soft minimum: 0 only for a percentage or when the data reaches down near 0), as many steps as the plot's height allows, steps of 1/2/5 x 10^n in the unit read (a percentage also 25) (bytes in Ki/Mi/Gi/Ti on round binary steps, millicores as m below a core and cores above, other units such as %, req/s as given; `kit/core/value-axis.js`); a range set on the value axis keeps its ends exactly with round marks inside (`span`). Height: the chart's height follows its width (`--chart-aspect`) between `--chart-h-min` and `--chart-h-max`; `chart.height` raises it within that band and never past `--chart-h-max` (`chart.aspect: false` keeps `chart.height`). Time steps are 15s and 30s for short windows, then 1m, 5m, 15m, 1h, 6h, 1d, 1w by width, at least four marks; day boundaries carry the date with its year (`kit/core/time-axis.js`).
- Time zone: a chart writes its times in `chart.timeAxis.timeZone` (a timeline in its `timeZone`) when given, else in the page's zone, the `kit.timeZone` setting ('system' | 'utc' | an IANA name), which `bootPage` puts on the document as `data-time-zone`; a change redraws every chart.

## Report canvas

A streamed report: a page (or an AI streaming UI operations) builds a report from frozen snapshots of the app's data, narrows it op by op, and exports it. It is drawn as one document sheet (a status update or a postmortem, as the page writes it), not as a copy of the screens.
- Model (`core/report.js`): `createReport(blocks)` → `{ state, canUndo, apply(op), undo(), select(fn) }`. Block `{ id, kind, sub?, title?, caption?, snapshot?: { source, query?, at }, data }`; `sub` makes it a part of the section before it, and `numbers(state)` numbers sections by order ('4', '4.1'), so a move renumbers them.
- Ops: `{ op: 'add', block, at? }`, `{ op: 'filter', block, keep?: ids, drop?: ids }` (rows and lines leave; chart series and timeline marks are quieted instead), `{ op: 'highlight', block, ids }` (`--row-mark`), `{ op: 'collapse', block, around: ids, context? }` (a log folds round its matches), `{ op: 'annotate', block, id?, text }` (drawn as a caption line), `{ op: 'move', block, to }`, `{ op: 'remove', block | blocks | items: { block, id }[] }`. Undo goes back one op; the selection is the reader's and is kept.
- Selection: keys are a block id or `block/item`; it survives narrowing while the item is still shown. `toggle`, `selectedItems(state)` → `{ block, id, kind, label }[]` (stable ids for the AI), `deleteSelectedOp(state)`.

Report form of each block kind (screen and print):

| kind | data | report form | Markdown |
| --- | --- | --- | --- |
| `chart` | `{ card }`: chart-card props (the page's own chart props, frozen) | the kit chart itself with `bare` and `static` (chart-card): the screens' axes, dated first time, line, area, threshold and its name, legend below, no frame, head, hover or drag; the block caption carries the key numbers (peak and its time, threshold, window). No report-only drawing | heading, caption, source footnote |
| `table` | `{ columns: { id, label, w?, end?, mono?, muted?, wrap?, excerpt?: ids }[], rows }` | compact report table: one head row, hairline rows, no hover, row action or sort; fixed column widths (`w`); a value cell keeps one line on screen and in print (ellipsis, whole value as title); a prose column (`wrap`: a to-do, an event's words, a condition) wraps inside its cell; a column with `excerpt` (raw text only: a log line, a query, a system message) is no cell but a monospace excerpt under the table, each row's whole value on one line led by that row's values of the `excerpt` ids, never a part of a value; the head repeats on every page, a row never splits and is never left alone on a page | table, then the excerpt as a code block; pointed rows bold |
| `log` | `{ lines: { id, n, text }[] }` | monospace excerpt with line numbers; pointed lines tinted and medium; lines left out between matches as one muted "N lines left out" row | code fence with line numbers, `>` on pointed lines, the omission rows |
| `summary` | `{ items: { id, label, value }[] }` | name and value rows; a value is document prose and wraps inside its cell | two-column table |
| `statements` | `{ items: { id, label?, text, refs? }[] }` | label column and statements, each with its evidence numbers `[1][3]`; an item with no label belongs to the label above | list grouped by label |
| `timeline` | `{ marks: { id, at, tip: { kind, title } }[] }` | time rows (time · kind · title) | table |
| `text` | `{ text }` | paragraph | paragraph |
| `flow` | `{ graph }` | the flow graph, whole | node list |

- Canvas (`components/report-canvas.js`, `reportCanvas`): `render({ id, report: state, canUndo, action, head?: { title, rows: { label, value }[] }, tools?, end?, bar?: false, zone? })`. One sheet: no card or face around a section; sections follow each other separated only by their numbered heads (a top-level section opens with a rule, a sub section has none); no border radius of its own. The head is the title and one line of name-value pairs that never wrap (ellipsis, the whole value as title). Each section: its number and title, the body's report form, then its caption and source line (source · query · collected, to the second). No checkboxes and no select mode. `toolbar({ report, canUndo, action, tools?, end? })` is the bar as one quiet row (the page's tools, undo, the page's end such as a pane close); `bar: false` leaves it out of the canvas so the page can put it in its pane head.
- Selection by pointer: a drag that starts on a section's body or on empty room draws a marquee (`.rc-marquee`, the focus colour); the rows, lines and statements it touches are selected, and a section whose head it crosses, or with nothing selectable under it (a figure, a paragraph), is selected whole. A press selects one thing; Shift or Cmd/Ctrl adds or takes away; a press on empty room or Escape clears. Selected things take `--secondary` (the selected-row token). While something is selected, "N selected · Delete selected · Refer to AI" take the place of the page's `tools` in the bar (the row keeps its height); Delete or Backspace deletes; Undo stays at the bar's end.
- Reordering: a drag that starts on a section head moves the section (the others step aside by its height, the target is where the pointer is); it never selects. A drag from a head and a drag from a body never meet.
- Every press emits `ctx.emit(action, { type, … })`; `handle(report, payload)` applies it and returns `{ state, refer?, op? }` (types `set { keys } | add { keys } | clear | move { block, to } | delete | refer | undo`). `marqueeKeys(rc, rect)` is the marquee rule. `play(root, state, op)` fades what an op takes away before it is applied, `runOps(root, report, ops, { delay, draw })` applies a stream of ops with a pause. Reduced motion: at once.
- Export: `toDocument(state)` → `{ nodes: heading | paragraph | table | code | list | groups | caption | note, sources }`, `toMarkdown(state, { title, head, format, hidden })` → the title, the head as a two-column table, numbered headings, tables, code fences with line numbers, captions in italics, sources as footnotes. Print: the same sheet; the bar drops, a small section (a figure with its caption and source, a paragraph, a list or table of a few rows) stays on one page whole, so small groups at the end share a page, a section head never ends a page, table heads repeat and rows never split nor stand alone; `reportCanvas.print(document, { title, layout })` adds the print sheet (`pageSheet(title)`: A4, the title as the running header, the page number), turns the page light and lays the report out at the paper's text width (`--rc-paper-w`; `layout()` lets the page redraw its charts at that width) before the print dialog, and puts the theme and the layout back after printing.

## Shell

```
createShell(config, { root, appBase }) -> ShellApi
ShellApi { state, navigate(address, opts), openTab(address), closeTab(id), toast(p), openPanel(opts), setSetting(key, value), refresh(sectionId?), data }
```

Built-in actions: `kit.navigate`, `kit.tab.new|new-below|close|reopen|duplicate|pin|bookmark`, `kit.history.back|forward|reload`, `kit.sidebar.toggle`, `kit.panel.toggle`, `kit.palette.open`, `kit.settings.open`, `kit.composer.send`, `kit.question.choose|select|cancel`, `kit.table.select|select-all`, `kit.panel.open-as-tab`.

## Shortcuts

```
Shortcut { keys: 'mod+shift+e', action: ActionId, arg?, id?: ShortcutId }   // config.shortcuts; id defaults to the action
```

Kit shortcuts (`core/shortcuts.js`) have ids too: the action (`kit.sidebar.toggle`, `kit.panel.toggle`, `kit.panel.new` ⇧⌘E opens the panel on a new chat, ...) or a name for a second key of the same action (`kit.palette.tabs` ⇧⌘A, `kit.palette.location` ⌘L, `kit.palette.open` is the palette's own key). `kit.shortcuts` changes the keys by id; the shell, the pages and the desktop menu bar all follow it.

Keys are matched by the physical key wherever the input source or layout types another character (`core/keys.js` shortcutOf, `core/shortcuts.js` matchCombo: mod is ⌘ on macOS and Ctrl elsewhere). They are shown with `keyText(keys)`: macOS symbols with no separator (⇧⌘E), elsewhere words joined with '+' (Ctrl+Shift+E). `isMac(override?)` names the platform. A work surface shortcut is one key (a letter, digit, punctuation with '?', an arrow or Enter, Shift allowed, never Control, Alt or Command): the shortcut control records it with `scope: 'surface'` and a page reads it with `surfaceKey(e)` (null while an input method composes, with Control, Alt or Command held, for Tab, Escape, Space and Backspace, and in a text field).

## External tools and desktop

```
ExternalTool  { id, origin, allowNavigate?: string[] }
DesktopConfig { appId, name, scheme, icon?, packageIcon?, window: { width, height, translucent?, styles: { [style]: WindowStyle } }, tools: ExternalTool[], commands?, csp?, quitConfirm? }   // apps/<id>/desktop.config.cjs; quitConfirm (default true) asks before quitting, the app menu checkbox keeps the user's choice; icon: PNG (1024, platform icon template) relative to the app folder for the window, About panel and development Dock; packageIcon: .icns for the packager
DesktopCommand { template, args?: { [name]: pattern }, env?: string[], confirm? }   // desktop.config.cjs commands[id]: the terminal runs only these (pty:run { command: id, args }), each argument matching its whole pattern, single-quoted; confirm: true (a command that changes something outside this computer) shows the line and waits for Enter in the terminal before it runs, no answer ends it with 130

Platform adapter (`kit/desktop/platform/<platform>.cjs`, one interface): `capabilities()` → `{ translucent, material?, reason? }` and `wallpaper(sys)` → the desktop picture file or null (macOS: NSWorkspace through the native helper; Windows: the HKCU\Control Panel\Desktop WallPaper value, else the transcoded copy under %APPDATA%; Linux: GNOME `picture-uri` / `picture-uri-dark`, else the KDE Plasma applets config). The main process answers `desktop:info` with `{ capabilities, wallpaper }` (the picture as a small JPEG data URL, read again when a window gains focus or the theme changes, `desktop` event on a change); pages read it as `ctx.desktopInfo()`. A window style with glass, material or tint needs `translucent`: where it is missing the window uses the first opaque style, and a settings `choices` option with `needs: 'translucent'` is shown unavailable with the reason (`desktop.unavailable.<reason>`). On Windows 11 such a style uses the BrowserWindow background material (`styles.<name>.windows.material`, default `acrylic`). Tests: `node --test kit/desktop/platform/platform.test.cjs` (system calls replaced).
WindowStyle { glass?, material?, tint?, background? }   // each a value or { dark, light }: glass { style: 0 regular | 1 clear } (macOS 26 glass view; material is used where the system has none), material a vibrancy name, tint a CSS color drawn natively over the glass or material, background an opaque window color. The kit.windowStyle setting picks the style (default: the app settings default), switched live
start(desktopConfig, { appRoot, repoRoot })                                                               // kit/desktop/index.cjs
```

`name` titles the window, the menu bar and its About, Hide and Quit items. The menu bar is the same for every app (kit/desktop/menu.cjs: app, File, Edit, View, Bookmarks when `sidebar.bookmark` is set, Tab, Window), its strings come from the app dictionary of `defaultLocale`, and its tab, sidebar, panel, reload and settings items send the kit shortcut, so menu and keyboard run one action. A development run on macOS relaunches from a copy of the runtime bundle named `name` (the menu bar title comes from the bundle).

## Icons

`IconMap = { [slot]: [glyphKey, strokeWidth, 'fill'?] }`, `Glyphs = { [glyphKey]: svgInner }` (viewBox 24, stroke). `'fill'` also fills the glyph with fill-rule evenodd; `glyphs.mjs` derives a `<key>-fill` glyph (all shapes in one path) for it. Settings pages use a filled slot as `activeIcon` for the selected nav item. Slot names follow the Central Icons naming. Kit UI slots are listed in `icons/base-map.js`.

## Theme

App-overridable tokens, set in `apps/<id>/theme.css` for both themes:

| token | used for |
|---|---|
| `--brand`, `--brand-content` | dots, badges; `--brand-content` is the contrast-checked variant for small text |
| `--action`, `--action-fg`, `--action-hover` | primary button fill and label |
| `--focus` | focus ring |
| `--indicator` | selected tab underline and indicators |
| `--switch-on` | switch on state |
| `--font-display` | title face (page titles, section titles, big numbers, toasts); prepend the app face to the kit stack |

## First run: live steps

A step value may be a function of the shell state (`(state, api) => value`) for `title`, `description`, `primary`, `note`, `disabled`, `options`,
`items`, `groups`, `add`, `scenes` and the last step's `open` (the address the finish opens in the current tab). The app redraws the screen with
`api.firstRun.render()` after its own values changed.
- `welcome`: `note` (a line above the start button), `scenes` (`{ view, caption }`: a card of kit components with a line or two under it; the cards
  slide to the next one in turn and come back to the first without a jump; still with reduced motion). The start button is as wide as its label.
- `checks`: `items` `{ id, label, icon }`, `check(id, api) -> Promise<{ group, kind, desc, tip?, action?: { label, action, arg } }>`, `groups`
  `[{ id, label, mark? }]`, optional `add` (a connect group). Cards appear one by one, are checked four at a time and move into their groups when all
  have a result. A card shows the status icon of `kind` (ok, fix, admin, unknown; busy while checking) before its name, `desc` under it (`tip` on
  hover) and one `action` button; a group heading shows the group mark `mark` (ok, self, admin) before its name and count.
  `kit.firstRun.recheck { id? }`, `kit.firstRun.stop`, `api.firstRun.recheck(ids)`, `api.firstRun.results(stepId)`.
- `connect`: `groups` `[{ label, rows, exclusive?, other? }]`, a row `{ id, icon, label, desc?, badge?, status?: { kind?, label }, button? | fields + submit }`; a form row unfolds
  (`kit.firstRun.toggle`) and its submit action receives `{ arg, values }`; the fields are emptied at once. A field with `choices` is a select, an array of
  fields is one line. `fields`, `status`, `preview` (`{ lang, text }`, a code block) and `copy` (`{ label, ready }`, copies the preview) may be functions
  of the values typed so far; `foot` adds buttons next to the submit button. In an `exclusive` group, typing in one row hides the others behind the link
  `other` until its fields are empty again.
- `done` / `switches` rows: `{ key, icon, label, desc?, choices? }` is a select written at once when it has `choices` (an option with `needs` is
  unavailable where the desktop cannot draw it), else a switch; `more` is a line under the rows. A setting changed here (the language too) shows at once.
- `done` / `switches`: a switch row `{ key, item }` adds or removes one item of a list setting.

## Terminal

```
TerminalDef { session({ route, params }, state): key | null, title?(key): Text, open(key, api): Promise<{ env?, cwd? }>,
              record?({ session, command, exit, user, at }, api) }
```

A bottom split panel under the whole frame (desktop only; `kit/components/terminal-panel.js`, `kit/shell/terminal.js`, `kit/desktop/terminal.cjs`).
`kit.terminal.toggle` (⌃` on macOS, Ctrl+` elsewhere; id `kit.terminal.toggle`) shows or hides it for the open tab; a tab whose route has no
session key cannot open it, and the panel stays hidden while such a tab is open. Each key has its own terminal and shell process, started with
`open`'s environment, which is set again after the user's startup files (zsh, bash). The shell integration reports each command line with its
exit status to `record` (the app masks and keeps it); output is never kept. node-pty is an optional dependency of the kit (`npm install` in `kit/`);
without it the panel says the terminal could not open. `api.terminal` gives `key()` and `open()` for a top bar toggle button; the key is read from
the page the top bar is for (the body, or the detail in front of it), never from the conversation card beside it. The app's own lines (where the
session goes, why it did not open, "Enter to run") are a text line above the terminal screen, never written into its cells, and a bare status code
is never shown. `api.terminal.run({ command: { id, args, line, confirm }, onOutput, onInput })`: a `confirm` command waits for Enter in the terminal;
`onInput` sees what the person types. The desktop's `hooks.commandGuard(id, args)` may refuse a declared command (a code), whatever the page decided.

