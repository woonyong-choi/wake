/* Kit public entry (shell document). Apps import only this file, kit/page/index.js and kit/desktop/index.cjs */
export { createShell, KIT_VERSION } from './shell/shell.js';
export { createPanelEngine } from './shell/panel-engine.js';
export { components } from './components/index.js';
export { html, raw, esc, cx, attrs } from './core/html.js';
export { icon, extendIcons, extendGlyphs, hasIcon } from './icons/icons.js';
export { t, locale, formatNumber, formatPercent, formatDate, formatRelative } from './core/i18n.js';
export { text } from './core/text.js';
export { createRouter } from './core/routes.js';
export { validate, FEATURE_DEFAULTS } from './core/validate.js';
export { default as kitLocaleKo } from './locale/ko.js';
export { default as kitLocaleEn } from './locale/en.js';
export { service, onService, hasService } from './core/service.js';
