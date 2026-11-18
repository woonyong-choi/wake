/*
 * Full-tab conversation: page header (bubbles icon + conversation title + more at the end), centered 820 conversation column, pinned composer at the bottom (pill -> two-row card).
 * Uses the same conversation engine (kit/shell/panel-engine.js). Conversations are read from DataSource 'ai.conversations'; one started in the
 * Asking the AI opens this page with id 'new' as a card beside the page asked about; the question and that page's context come with shell:init (handoff.ask).
 */
import { html } from '../../../core/html.js';
import { components as C } from '../../../components/index.js';
import { createPanelEngine } from '../../../shell/panel-engine.js';
import { morph } from '../../../core/morph.js';
import { playChime } from '../../../core/sound.js';
import { paneNarrow } from '../../../core/pane.js';

export const css = `
.chat-page { display: flex; flex-direction: column; height: 100%; }
.chat-body { flex: 1; min-height: 0; overflow-y: auto; container: chat-body / size; }
.chat-bottom { flex-shrink: 0; padding-top: var(--space-1); /* the composer's top outline and focus ring stay inside the scroller */ max-height: calc(100% - var(--space-5) - var(--leading-2xl) - var(--space-4) - var(--leading-sm) * 2); overflow-y: auto; width: 100%; max-width: calc(var(--chat-col-w) + 2 * var(--pane-pad-inline, var(--space-4))); margin: 0 auto; padding: 0 var(--pane-pad-inline, var(--space-4)) var(--pane-pad-inline, var(--space-4)); }
@container chat-body (max-height: 56px) { .msgs { --cb-head-top: calc(-1 * var(--cb-head-h)); } } /* quality:literal: tokens-allow: container conditions cannot read --cb-head-h (36) plus --leading-sm (20) */
`;

export async function createChatPage(ctx) {
  const { text, t } = ctx;
  let engine;
  const requested = ctx.params?.id === 'new' ? '' : ctx.params?.id || ''; // 'new': a conversation asked for from a page, not yet started
  /* A requested id that resolves to no conversation: why (unconfigured / denied / failed / not found) decides the text and whether a retry is offered */
  const missing = () => {
    if (!requested || engine.state.current !== requested || engine.current()) return null;
    const e = engine.state.listError;
    if (!e || e.status === 404 || e.kind === 'notFound' || e.kind === 'missing') return 'notFound';
    if (e.kind === 'unconfigured' || e.code === 'UNCONFIGURED' || e.code === 'UNSUPPORTED') return 'unconfigured';
    if (e.status === 403 || /forbidden|403/i.test(String(e.kind || e.message || e))) return 'denied';
    return 'failed';
  };
  /* A retry in flight keeps the reason it started from (the list reload briefly reads as "not found") */
  let pending = null, restoreFocus = false;
  /* the page this conversation is about: the shell sends it again whenever the open page changes. A chip the person removed stays off until the page changes. */
  let askContext = null, contextOff = null;
  const compactNow = () => paneNarrow(); // a narrow card shows the controls under the input as icons
  const chipNow = () => (askContext && JSON.stringify(askContext) !== contextOff ? askContext : null);
  const reasonNow = () => { const r = missing(); return r && (pending || r); };
  const stateView = reason => {
    const own = ctx.config.ai.chatStates?.[reason];
    const title = own ? text(own) : t(`chat.${reason}`);
    const icon = reason === 'denied' ? 'lock' : reason === 'failed' ? 'status-error' : 'bubbles';
    const label = ctx.config.ai.chatStates?.retry ? text(ctx.config.ai.chatStates.retry) : t('tab.reload');
    const action = reason !== 'failed' && reason !== 'denied' ? ''
      : pending ? html`<div>${t('tab.loading')}</div>`
        : C.button.render({ label, action: 'kit.chat.retry', size: 'sm', variant: 'secondary' });
    // A stable focusable live wrapper stays mounted across states, so removing the retry button does not drop keyboard focus
    return html`<div role="status" aria-live="polite" tabindex="-1" data-chat-status>${C.emptyState.render({ icon, plainIcon: true, title, action })}</div>`;
  };
  /* the tab's title and chip; a conversation started here ('new') names its saved record once the store has it (conversation): the shell then
     keeps this tab at that conversation's address (lists, ⌘K and a restart find it) without loading the page again */
  const meta = () => { if (missing()) return { title: t('chat.title'), icon: 'bubbles' }; const c = engine.current();
    return { title: c?.title || t('panel.newChat'), icon: 'bubbles', context: { icon: 'bubbles', title: c?.title || t('panel.newChat') }, ...(!requested && c?.savedId ? { conversation: c.savedId } : {}) }; };
  let sentMeta = '', toEnd = false;
  /* only a conversation started here: its title and saved record arrive with its first answer (an opened one is named once the page loads) */
  const syncMeta = () => { if (requested || !engine?.current()) return; const m = meta(), key = JSON.stringify(m); if (key !== sentMeta) { sentMeta = key; ctx.api?.setMeta?.(m); } };
  const redraw = parts => {
    if (parts.includes('header') || parts.includes('body')) syncMeta();
    const body = document.querySelector('[data-chat-body]');
    if (!body || parts.includes('header') || missing()) { ctx.update(); return; }
    if (parts.includes('body')) {
      // While the reader is at the end (streaming), the end stays in view; a message the person just sent brings the end into view
      const atEnd = toEnd || body.scrollHeight - body.scrollTop - body.clientHeight < 8;
      morph(body, engine.renderMessages('full'));
      if (atEnd) body.scrollTop = body.scrollHeight;
      toEnd = false;
    }
    if (parts.includes('bottom')) morph(document.querySelector('[data-chat-bottom]'), engine.renderBottom({ variant: 'wide', chip: chipNow(), compact: compactNow() }));
  };
  /* a run that ends or waits for a person plays the completion sound (kit.ai.sound) and, while the window is in the background,
     shows a system notification for the chosen kinds (kit.ai.notify: 'attention', 'done') */
  const notify = (kind, c) => {
    const settings = ctx.settings();
    if (settings['kit.ai.sound'] !== false) playChime(window).catch(() => {});
    if (!(settings['kit.ai.notify'] ?? ['attention', 'done']).includes(kind) || document.hasFocus()) return;
    const N = window.Notification;
    if (N && N.permission === 'granted') new N(text(ctx.config.brand.name), { body: t('notify.' + kind, { title: c.title || t('panel.newChat') }), silent: true });
  };
  engine = createPanelEngine(ctx.config, { data: ctx.data, onChange: redraw, getSettings: () => ctx.settings(), onNotify: notify });
  void engine.loadModels();
  await engine.loadList(ctx.params);
  if (requested) engine.select(requested);
  let focused = false, wasCompact = compactNow();
  if (typeof window !== 'undefined') window.addEventListener('resize', () => { if (wasCompact !== compactNow()) { wasCompact = compactNow(); redraw(['bottom']); } });
  return {
    css,
    onConversationRemoved: id => { engine.remove(id); ctx.api?.setMeta?.(meta()); ctx.update(); },
    /* The first draw puts the caret in the composer */
    afterRender(root) {
      if (toEnd) { const body = root.querySelector('[data-chat-body]'); if (body) { body.scrollTop = body.scrollHeight; toEnd = false; } }
      if (restoreFocus) { // only after an explicit retry: the wrapper keeps focus; if a handoff replaced it with a composer, that takes focus below
        root.querySelector('[data-chat-status]')?.focus({ preventScroll: true });
        if (!pending) restoreFocus = false;
      }
      if (focused) return;
      const input = root.querySelector('[data-chat-bottom] [data-composer-input]');
      if (!input) return; // a failed lookup has no composer and must not take focus; the first composer that appears gets it
      focused = true; input.focus({ preventScroll: true });
    },
    render() {
      const reason = reasonNow();
      if (reason) return html`<div class="chat-page">
        ${C.pageColumn.render({ width: 'chat', header: true, children: C.pageHeader.render({ icon: 'bubbles', title: t('chat.title'), size: 'sm' }) })}
        <div class="chat-body" data-scroll="content" data-chat-body>${stateView(reason)}</div>
      </div>`;
      const c = engine.current();
      return html`<div class="chat-page">
        ${C.pageColumn.render({ width: 'chat', header: true, children: C.pageHeader.render({ icon: 'bubbles', title: c?.title || t('panel.newChat'), size: 'sm',
          end: c ? C.iconButton.render({ icon: 'more', size: 'xs', iconSize: 'sm', menu: 'kit.chat.more', label: t('settings.more') }) : '' }) })}
        <div class="chat-body" data-scroll="content" data-chat-body>${engine.renderMessages('full')}</div>
        <div class="chat-bottom" data-scroll="y" data-chat-bottom>${engine.renderBottom({ variant: 'wide', chip: chipNow(), compact: compactNow() })}</div>
      </div>`;
    },
    onHandoff: h => {
      if (h.conversation) engine.adopt(h.conversation);
      if (h.ask?.context) askContext = h.ask.context;
      if (h.ask?.prompt) engine.send(h.ask.prompt, chipNow());
    },
    onAskContext: c => {
      askContext = c || null;
      if (contextOff && JSON.stringify(askContext) !== contextOff) contextOff = null;
      redraw(['bottom']);
    },
    meta,
    actions: {
      ...engine.actions,
      'kit.chat.retry': async () => {
        const reason = missing();
        if (pending || (reason !== 'failed' && reason !== 'denied')) return;
        pending = reason; restoreFocus = true; ctx.update();
        try { await engine.loadList(ctx.params); if (!engine.current()) engine.select(requested); } finally { pending = null; }
        ctx.update();
        if (!missing()) ctx.api?.setMeta?.(meta());
      },
      'kit.composer.send': a => { toEnd = true; return engine.send(a.text, chipNow()); },
      'kit.composer.remove-context': () => { contextOff = JSON.stringify(askContext); redraw(['bottom']); },
      'kit.composer.voice': () => ctx.api.dictate(),
      'kit.message.edit': a => { if (typeof a.arg === 'string') C.composer.fill(document, 'panel', a.arg); },
    },
    menus: { ...Object.fromEntries(Object.entries(engine.menus(ctx.api)).map(([k, f]) => [k, () => f()])), 'kit.chat.more': () => ({ items: ctx.config.ai.chatMenu ? ctx.config.ai.chatMenu(ctx).map(i => i.type ? i : { ...i, label: text(i.label) }) : [] }) },
  };
}
