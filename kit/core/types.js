// @ts-check
/*
 * JSDoc typedefs for every definition the kit accepts. Documentation only: nothing here runs.
 * The same shapes are described in kit/CONTRACTS.md.
 */

/** @typedef {string} LocaleKey */
/** @typedef {LocaleKey | { raw: string } | (() => (LocaleKey | { raw: string }))} Text */
/** @typedef {string} IconSlot */
/** @typedef {string} ActionId */
/** @typedef {string} MenuId */
/** @typedef {string} Address  internal '<scheme>://<path>', never shown */

/** @typedef {{ tabs?: boolean, panel?: boolean, settings?: boolean, palette?: boolean, externalTools?: boolean, restoreSession?: boolean }} Features */

/**
 * @typedef {{ id: string, pattern: string, page: string, kind?: 'page'|'settings'|'chat',
 *   title: (params: object) => Text, icon: (params: object) => IconSlot, crumbs: (params: object) => Crumb[],
 *   ident?: (params: object) => { icon: IconSlot, label: Text } }} Route
 */
/** @typedef {{ label: Text, switcher?: MenuId, arg?: any }} Crumb */

/**
 * @typedef {{ id: string, label: Text, tip?: Text, kind?: 'tabs', variant?: 'collection', untitled?: Text,
 *   enabled?: (state: object) => boolean, rows?: (state: object) => RowDef[] }} SectionDef
 */
/**
 * @typedef {{ id: string, label: Text, ctx?: string, icon?: IconSlot, fav?: boolean, lead?: boolean, dot?: string, address?: Address, action?: ActionId, arg?: any,
 *   context?: string, selected?: boolean, closable?: boolean, draggable?: boolean }} RowDef
 */
/** @typedef {{ icon: IconSlot, tip: Text, action?: ActionId, menu?: MenuId }} SlotItem */

/**
 * @typedef {{ items: MenuItem[], side?: 'bottom'|'top'|'left'|'right', align?: 'start'|'end', width?: number, minWidth?: number,
 *   morph?: boolean, size?: 'sm', variant?: 'select'|'native' }} MenuDef
 */
/**
 * @typedef {{ id: string, label: Text, icon?: IconSlot, desc?: Text, end?: any, endIcon?: IconSlot, shortcut?: string[],
 *   checked?: boolean, switch?: boolean, on?: boolean, danger?: boolean, disabled?: boolean, rainbow?: boolean,
 *   submenu?: MenuDef, action?: ActionId, arg?: any }
 *   | { type: 'label', label: Text } | { type: 'separator' } | { type: 'search', placeholder: Text, kbd?: string[] }} MenuItem
 */

/**
 * @typedef {{ defaults: Record<string, any>, footer?: object[], groups: { label: Text, pages: SettingsPage[] }[] }} SettingsDef
 */
/**
 * @typedef {{ id: string, label: Text, icon: IconSlot, activeIcon?: IconSlot, title?: Text, help?: Text, badge?: Text, promote?: boolean, children?: SettingsPage[],
 *   tabs?: { id: string, label: Text }[], tabsEnd?: Control,
 *   sections: SettingsSection[] | ((ctx: PageContext) => Promise<SettingsSection[]>), actions?: Record<string, Function> }} SettingsPage
 */
/**
 * @typedef {{ title?: Text, description?: Text, count?: number, badge?: { label: Text, tone?: string }, tab?: string,
 *   groups?: (SettingsRow[] | { notice?: { text: Text, action?: Control }, rows: SettingsRow[] })[],
 *   intro?: { title: Text, description?: Text, actions?: Control[], picture?: { icon: IconSlot } }, faq?: { id: string, title: Text, body: Text }[],
 *   records?: { start?: Control[], end?: Control[], rows: object[] | ((ctx: PageContext) => Promise<object[]>), empty: Text },
 *   empty?: { icon: IconSlot, title: Text, description?: Text, action?: Control } }} SettingsSection
 */
/**
 * @typedef {{ id: string, title: Text, description?: Text, icon?: IconSlot, tile?: IconSlot, avatar?: Text, dot?: string, control?: Control, extra?: Control[], stack?: Control,
 *   trail?: 'chevron'|'external', action?: ActionId, arg?: any, rowMenu?: MenuId, dialog?: string, variant?: 'add', status?: string, wideControl?: boolean }} SettingsRow
 */
/**
 * @typedef {{ title: Text, description?: Text, size?: 'sm'|'md'|'lg'|'xl', layout?: 'stack'|'grid', fields?: object[],
 *   submit: { label: Text, action: ActionId, arg?: any, variant?: string }, cancel?: Text }} DialogDef
 */
/** @typedef {{ type: string, key?: string, [k: string]: any }} Control */

/** @typedef {{ placeholder: Text, keys?: string[], shortcut?: string, sources: PaletteSource[] }} PaletteDef */
/** @typedef {{ id: string, label: Text, search: (query: string) => PaletteItem[] | Promise<PaletteItem[]>, queryOnly?: boolean, limit?: number }} PaletteSource */
/** @typedef {{ id: string, label: Text, icon?: IconSlot, fav?: boolean, end?: Text, endIcon?: IconSlot, action: ActionId, arg?: any }} PaletteItem */

/** @typedef {{ id: string, label: Text, icon: IconSlot, desc: Text, risky?: boolean }} Permission */
/** @typedef {{ id: string, label: Text, icon: IconSlot, models: { id: string, label: Text }[] }} Provider */
/**
 * @typedef {{ type: 'text', text: string } | { type: 'step', icon: IconSlot, text: string, id?: string, state?: 'run'|'done'|'fail', meta?: string } | { type: 'table', head: string[], rows: string[][] }
 *   | { type: 'code', lang: string, text: string, diff?: boolean } | { type: 'approval', id: string, question?: string, title: string, target: string, diff: string, icon?: IconSlot, head?: object }
 *   | { type: 'done' } | { type: 'error', message: string }} AiEvent
 */
/** @typedef {{ send: (request: object, opts: { signal: AbortSignal }) => AsyncIterable<AiEvent>, resolveApproval?: (id: string, choice: string, extra: { proposal: { title: string, target: string, icon?: IconSlot }, instruction?: string }) => Promise<{ state: 'ran'|'denied', by?: string, time?: string } | void> }} AiAdapter */
/**
 * @typedef {{ permissions: Permission[], defaultPermission: string | ((settings: object) => string), providers: Provider[], defaultModel?: { provider: string, model: string },
 *   efforts: { id: string, label: Text, rainbow?: boolean }[], defaultEffort: string, scope?: object, attachments?: MenuItem[],
 *   placeholder: { start: Text, reply: Text }, adapter: AiAdapter, settingsAddress?: Address, chatMenu?: () => MenuItem[],
 *   approvals?: { choices?: { id: string, label: Text, shortcut?: string }[], allowAlways?: boolean } }} AiDef
 */

/** @typedef {{ get: (key: string, params?: object) => Promise<any>, now?: (key: string, params?: object) => any }} DataSource */
/**
 * An alert notice (components/notice.js): id keeps one card per alert (notify again or updateNotice to group a repeat).
 * @typedef {{ id?: string, tone?: 'danger'|'warn'|'ok'|'info', label?: Text, title: Text, subtitle?: Text|Text[], summary?: Text, at?: number|Date, count?: number,
 *   persist?: boolean, duration?: number, primary?: { label: Text, action: string, arg?: any }, secondary?: { label: Text, action: string, arg?: any }, menu?: { id: string, arg?: any },
 *   labels?: { key: string, value: string }[], link?: { label: Text, action: string, arg?: any }, time?: 'relative'|'absolute' }} NoticeDef
 */
/**
 * @typedef {{ navigate: (address: Address, opts?: { newTab?: boolean, replace?: boolean }) => void, openPanel: (opts?: { prompt?: string, context?: object }) => void,
 *   openTool: (toolId: string, path: string, title: string) => void, toast: (p: { title: Text, body?: Text, tone?: string }) => void,
 *   notify: (p: NoticeDef) => void, updateNotice: (id: string, p: Partial<NoticeDef>) => void, dismissNotice: (id: string) => void,
 *   contextMenu: (items: object[], x: number, y: number) => Promise<string>, setMeta: (meta: PageMeta) => void, setSetting: (key: string, value: any) => void }} PageApi
 */
/**
 * @typedef {{ config: AppConfig, router: object, route: Route | null, params: object, query: object, address: Address, data: DataSource,
 *   api: PageApi, t: Function, text: Function, icon: Function, settings: () => object, pageIdentity: () => PageIdentity | null, update: () => void }} PageContext
 */
/** @typedef {Readonly<{ appId: string, tabId: string, address: Address }>} PageIdentity */
/** @typedef {{ title: string, icon: IconSlot, context?: { icon: IconSlot, title: string, sub?: string } }} PageMeta */
/** @typedef {{ id: string, origin: string, allowNavigate?: string[] }} ExternalTool */

/**
 * @typedef {{ schema: 1, id: string, name: string, scheme: string, kitVersion: string, kitBannedTerms?: string[],
 *   brand: { mark: IconSlot, name: Text }, locales: Record<string, Record<string, string>>, defaultLocale: string,
 *   icons?: { map?: Record<string, [string, number]>, glyphs?: Record<string, string> }, features?: Features,
 *   data: DataSource, dataMode?: 'mock'|'http', routes: Route[], start: Address | ((st: { settings: object }) => Address),
 *   sidebar: { sections: SectionDef[], bottom: SlotItem[] }, menus?: Record<MenuId, Function>, contextMenus?: Record<string, Function>,
 *   actions?: Record<ActionId, Function>, settings?: SettingsDef, palette?: PaletteDef, ai?: AiDef,
 *   tools?: ExternalTool[], shortcuts?: { keys: string, action: ActionId, label?: Text }[], examples?: Record<string, object> }} AppConfig
 */

export {};
