/*
 * App definition check. Called when the shell and pages start. Returns a list of problems; if any, draws the kit error screen.
 * strict also reports unknown top-level keys.
 */
import { hasIcon } from '../icons/icons.js';

const TOP = ['schema', 'id', 'name', 'scheme', 'kitVersion', 'brand', 'locales', 'defaultLocale', 'terms', 'icons', 'features', 'sidebar', 'routes', 'start', 'notFound',
  'menus', 'contextMenus', 'dialogs', 'actions', 'settings', 'ai', 'palette', 'tools', 'shortcuts', 'data', 'dataMode', 'examples', 'kitBannedTerms', 'pages', 'firstRun', 'topbar', 'terminal', 'detailPresentation'];

export const FEATURE_DEFAULTS = { tabs: true, panel: true, settings: true, palette: true, externalTools: false, restoreSession: true };

export function validate(config, { strict = false } = {}) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(config && typeof config === 'object', 'config must be an object');
  if (!config) return errors;
  need(config.schema === 1, 'schema must be 1');
  for (const k of ['id', 'name', 'scheme']) need(typeof config[k] === 'string' && config[k], `${k} is required`);
  need(/^[a-z][a-z0-9-]*$/.test(config.scheme || ''), 'scheme must be lowercase letters, digits or -');
  need(config.locales && config.locales[config.defaultLocale], 'locales[defaultLocale] is required');
  need(Array.isArray(config.routes) && config.routes.length, 'routes must be a non-empty array');
  const ids = new Set();
  for (const r of config.routes || []) {
    need(typeof r.id === 'string', 'route.id is required');
    need(!ids.has(r.id), `duplicate route id ${r.id}`); ids.add(r.id);
    need(typeof r.pattern === 'string', `route ${r.id}: pattern is required`);
    need(typeof r.page === 'string', `route ${r.id}: page is required`);
    for (const f of ['title', 'icon', 'crumbs']) need(typeof r[f] === 'function', `route ${r.id}: ${f} must be a function`);
  }
  need(config.sidebar && Array.isArray(config.sidebar.sections), 'sidebar.sections must be an array');
  const sec = new Set();
  for (const s of config.sidebar?.sections || []) {
    need(typeof s.id === 'string' && !sec.has(s.id), `sidebar section id missing or duplicate: ${s.id}`); sec.add(s.id);
    need(s.kind === 'tabs' || typeof s.rows === 'function' || typeof config.sidebar.kinds?.[s.kind] === 'function', `sidebar section ${s.id}: rows must be a function (or kind 'tabs', or a kind in sidebar.kinds)`);
  }
  const features = { ...FEATURE_DEFAULTS, ...(config.features || {}) };
  if (!features.panel) {
    need(!config.ai, 'features.panel is off but ai is defined');
    need(!(config.routes || []).some(r => r.kind === 'chat'), 'features.panel is off but a chat route exists');
  } else {
    need(config.ai && Array.isArray(config.ai.permissions) && config.ai.permissions.length, 'ai.permissions is required when features.panel is on');
    need(config.ai && config.ai.adapter && typeof config.ai.adapter.send === 'function', 'ai.adapter.send is required when features.panel is on');
  }
  if (features.settings) need(config.settings && Array.isArray(config.settings.groups), 'settings.groups is required when features.settings is on');
  if (config.brand?.mark) need(hasIcon(config.brand.mark), `brand.mark icon slot "${config.brand.mark}" is not defined`);
  for (const p of config.ai?.permissions || []) need(!p.icon || hasIcon(p.icon), `ai permission ${p.id}: unknown icon ${p.icon}`);
  const choices = config.ai?.approvals?.choices;
  if (choices) {
    need(Array.isArray(choices) && choices.length >= 2 && choices.some(c => c.id === 'deny'), 'ai.approvals.choices needs at least two choices including deny');
    need(!(config.ai.approvals.allowAlways === false && choices.some(c => c.id === 'always')), 'ai.approvals.allowAlways is false but an always choice is defined');
  }
  for (const g of config.settings?.groups || []) for (const p of (g.pages || []).flatMap(x => [x, ...(Array.isArray(x.children) ? x.children : [])])) for (const k of ['icon', 'activeIcon']) need(!p[k] || hasIcon(p[k]), `settings page ${p.id}: unknown ${k} ${p[k]}`);
  for (const [id, f] of Object.entries(config.dialogs || {})) need(typeof f === 'function', `dialog ${id} must be a function returning a dialog definition`);
  for (const t of config.tools || []) need(/^https?:\/\//.test(t.origin || ''), `tool ${t.id}: origin must be an http(s) origin`);
  if (config.detailPresentation) need(Array.isArray(config.detailPresentation.routes) && config.detailPresentation.routes.every(id => ids.has(id)), 'detailPresentation.routes must list route ids');
  if (strict) for (const k of Object.keys(config)) if (!TOP.includes(k)) errors.push(`unknown key: ${k}`);
  return errors;
}

/** Kit error screen (definition errors, page load failures) */
export function errorScreen(title, lines, retryAction) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<div class="kit-error" role="alert"><h1>${esc(title)}</h1><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${retryAction ? `<button class="btn secondary" data-action="${esc(retryAction)}">↻</button>` : ''}</div>`;
}
