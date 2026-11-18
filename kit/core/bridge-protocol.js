/*
 * Message contract between the shell and tab pages. Envelope { v: 1, type, id?, replyTo?, payload }.
 * Pages never touch the shell DOM and the shell never touches page DOM. Types missing from this table are dropped.
 */
export const PROTOCOL = 1;

const str = v => typeof v === 'string';
const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const opt = (v, f) => v === undefined || f(v);

export const MESSAGES = {
  // page -> shell
  'page:ready': p => obj(p),
  'page:meta': p => obj(p) && opt(p.title, str) && opt(p.icon, str) && opt(p.conversation, str), // conversation: the saved record a new chat page became
  'page:scrim': p => obj(p) && typeof p.on === 'boolean', // a dialog in the page: the shell dims the rest of the window
  'page:navigate': p => obj(p) && str(p.address) && (p.presentation === undefined || p.presentation === 'detail'),
  'page:detail': p => obj(p) && ['back', 'close', 'expand', 'collapse'].includes(p.op),
  'page:open-panel': p => obj(p),
  'page:open-tool': p => obj(p) && (str(p.toolId) || (obj(p.tool) && str(p.url))),
  'page:toast': p => obj(p) && str(p.title),
  'page:notify': p => obj(p) && ['show', 'update', 'dismiss'].includes(p.op) && (p.op === 'show' ? obj(p.notice) && str(p.notice.title) : str(p.id)),
  'page:context-menu': p => obj(p) && Array.isArray(p.items) && p.items.every(i => obj(i) && (i.type || (str(i.id) && str(i.label)))),
  'page:shortcut': p => obj(p) && str(p.keys),
  'page:shortcuts-suspend': p => obj(p) && typeof p.on === 'boolean',
  'page:dictate': p => obj(p),
  'page:action': p => obj(p) && str(p.name) && !p.name.startsWith('kit.'),
  'page:setting-set': p => obj(p) && str(p.key),
  'page:state': p => obj(p),
  'page:error': p => obj(p) && str(p.message),
  // shell -> page
  'shell:init': p => obj(p) && p.protocol === PROTOCOL,
  'shell:desktop': p => obj(p) && (p.info === null || obj(p.info)),
  'shell:theme': p => obj(p) && str(p.theme),
  'shell:locale': p => obj(p) && str(p.locale),
  'shell:settings': p => obj(p) && obj(p.values),
  'shell:history': p => obj(p),
  'shell:reload': p => obj(p),
  'shell:context-choice': p => obj(p),
  'shell:zoom': p => obj(p) && typeof p.zoom === 'number',
  // an overlay page learns its state: open (animating or settled), expanded to the full center, closed; width is the settled width in px
  'shell:scrim': p => obj(p) && p.op === 'close', // the shell's dimming was pressed: the page closes its dialog
  'shell:ask-context': p => obj(p) && (p.context === null || obj(p.context)),
  'shell:detail': p => obj(p) && ['open', 'closed'].includes(p.state) && opt(p.expanded, v => typeof v === 'boolean'),
};

let seq = 0;
export const envelope = (type, payload = {}, replyTo) => ({ v: PROTOCOL, type, id: `${Date.now().toString(36)}-${++seq}`, ...(replyTo ? { replyTo } : {}), payload });

/** Checks a received envelope. Returns the envelope when valid, otherwise null */
export function accept(msg) {
  if (!obj(msg) || msg.v !== PROTOCOL || !str(msg.type)) return null;
  const check = MESSAGES[msg.type];
  if (!check || !check(msg.payload ?? {})) return null;
  return msg;
}
