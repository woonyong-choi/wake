/*
 * AI conversation engine: conversation state, send and receive (ai.adapter), step timers, approval state, composer button menu definitions.
 * Knows no DOM. render*() return html fragments and changes are reported with onChange(part) (part: 'body' | 'header' | 'bottom').
 * The shell AI panel and the full-tab conversation page share this engine.
 *
 * config.ai = {
 *   permissions: [{ id, label, icon, desc, risky? }], defaultPermission,
 *   providers: [{ id, label, icon, models: [{ id, label, effort? }] }], defaultModel?: { provider, model },   // effort: the model takes an effort level (else no effort button)
 *   models?(): Promise<providers>          // the models read from the connected providers at start (replaces providers; the first model is the default)
 *   efforts: [{ id, label, tone? }], defaultEffort,
 *   scope?: { icon, label(state), menu(state, api) -> MenuDef },
 *   attachments?: MenuItem[],              // lower items of the + menu
 *   placeholder: { start, reply },        // dictionary keys
 *   adapter: { send(req, {signal}), resolveApproval?(id, choice, { permission, proposal, instruction? }), recordApprovalDecision?(id, choice, { permission, proposal, reason, time }) },
 *   approvals?: { choices?: [{ id, label, shortcut? }], allowAlways?: boolean },   // only 'allow' with 'ask' may execute
 *                                                                                // allowAlways: false drops a choice with id 'always'
 *   conversations: DataSource key (default 'ai.conversations'),
 *   settingsAddress?: string,             // address opened by the menu's "Settings" item
 * }
 */
import { html, attrs } from '../core/html.js';
import { t } from '../core/i18n.js';
import { text, localizeMenu } from '../core/text.js';
import { components as C } from '../components/index.js';
import { keyLabel } from '../core/keys.js';
import { formatWhen } from '../core/clock.js';

import { AI_SHORTCUTS } from '../core/shortcuts.js';

/* Options of the approval question: the app's definitions or allow and deny. allowAlways: false never lets an 'always' choice through */
export const DEFAULT_CHOICES = [{ id: 'allow', label: 'approval.allow', shortcut: 'mod+enter' }, { id: 'deny', label: 'approval.deny', shortcut: 'escape' }];
export function approvalChoices(ai) {
  const list = ai.approvals?.choices || DEFAULT_CHOICES;
  return ai.approvals?.allowAlways === false ? list.filter(c => c.id !== 'always') : list;
}

/*
 * Options from the settings store (getSettings): kit.ai.followUp 'queue' (default: a message sent while the AI works waits and goes
 * when the run ends) or 'steer' (it stops the run and goes at once). ai.defaultPermission may be a function of the settings.
 * onNotify(kind, conversation): 'attention' when a proposal waits for a person, 'done' when a run ends (the shell notifies and plays the sound).
 */
export function createPanelEngine(config, { data, onChange, now = () => new Date(), getSettings = () => ({}), onNotify = () => {} }) {
  const ai = config.ai;
  const defaultPermission = () => (typeof ai.defaultPermission === 'function' ? ai.defaultPermission(getSettings()) : ai.defaultPermission);
  const st = {
    permission: defaultPermission(), model: { ...ai.defaultModel }, effort: ai.defaultEffort, fast: false,
    convs: new Map(), current: null, list: [], abort: null, open: {}, providers: ai.providers, modelsRead: !ai.models,
  };
  /* models read from the connected providers: until they come (or when none answers) the model button says no model is connected */
  async function loadModels() {
    if (!ai.models) return;
    try { st.providers = (await ai.models()) || []; } catch { st.providers = []; }
    st.modelsRead = true;
    if (!st.providers.some(p => p.id === st.model.provider && p.models.some(m => m.id === st.model.model))) st.model = st.providers[0]?.models[0] ? { provider: st.providers[0].id, model: st.providers[0].models[0].id } : {};
    changed('bottom');
  }
  /* times read one way everywhere (RULE-TIME): today HH:mm, another day YYYY-MM-DD HH:mm, in the reader's zone (kit.timeZone). A message keeps the
     instant (at) and is written when drawn, so a live and a reopened conversation read the same (B3-05, B3-18) */
  const stamp = () => +now();
  const when = ms => { try { return formatWhen(ms / 1000, stamp() / 1000, getSettings()['kit.timeZone'] || 'system'); } catch { return formatWhen(ms / 1000, stamp() / 1000); } };
  const timeOf = m => (Number.isFinite(m?.at) ? when(m.at) : m?.time || null);
  /* a conversation named by its first question: the whole question (the header clips it), marked when cut for length */
  const titleOf = q => { const x = String(q).replace(/\s+/g, ' ').trim(); return x.length > 200 ? x.slice(0, 199).trimEnd() + '…' : x; };
  const conv = () => st.convs.get(st.current);
  const changed = (...parts) => onChange?.(parts.length ? parts : ['body', 'header', 'bottom']);

  async function loadList(params = {}) {
    let error = null;
    try { st.list = (await data.get(ai.conversations || 'ai.conversations', params)) || []; } catch (e) { st.list = []; error = e ?? new Error('read failed'); }
    for (const c of st.list) if (!st.convs.has(c.id)) st.convs.set(c.id, { ...c, savedId: c.id, messages: c.messages || [] }); /* a listed conversation is a saved one: its id is the store's */
    st.listError = error;
    changed('header');
    return { list: st.list, error };
  }
  function remove(id) {
    for (const [key, c] of st.convs) {
      if (key !== id && c.savedId !== id) continue;
      if (st.current === key) stop();
      st.convs.delete(key);
    }
    st.list = st.list.filter(c => c.id !== id);
    changed();
  }
  function select(id) { st.current = id; changed(); }
  /* a conversation handed over by another engine (the panel's chat opened as a tab): its messages as they are now */
  function adopt(c) { if (!c?.id) return; st.convs.set(c.id, { ...c, messages: c.messages || [] }); st.current = c.id; changed(); }
  function newChat() { st.abort?.abort(); st.current = null; st.permission = defaultPermission(); changed(); }
  /* the open conversation without stopping anything (a tab switch shows that tab's own conversation) */
  function show(id) { st.current = id && st.convs.has(id) ? id : null; changed(); }

  async function send(userText, context) {
    let c = conv();
    // an answer written in the composer while a proposal waits declines the proposal and goes to the AI as a message
    const q = waiting(c);
    if (q) await decide(q.id, 'deny', { instruction: userText });
    if (c?.busy && !q) {
      // a follow-up while the AI works: queued until the run ends, or it steers (stops the run and goes now)
      if ((getSettings()['kit.ai.followUp'] || 'queue') === 'queue') { c.messages.push({ id: crypto.randomUUID(), role: 'user', text: userText, at: stamp(), chip: context || null }); (c.queue ||= []).push(context); changed('body'); return; }
      stop();
    }
    if (!c) { c = { id: `c${Date.now().toString(36)}`, title: '', when: 'today', messages: [] }; st.convs.set(c.id, c); st.current = c.id; }
    c.messages.push({ id: crypto.randomUUID(), role: 'user', text: userText, at: stamp(), chip: context || null });
    return reply(c, context);
  }
  async function reply(c, context) {
    const a = { role: 'assistant', id: `m${Date.now().toString(36)}`, working: true, startedAt: Date.now(), seconds: 0, steps: [], parts: [], time: null };
    c.messages.push(a);
    c.busy = true;
    changed();
    const ctrl = new AbortController(); st.abort = ctrl;
    try {
      /* conversation: the id of the saved record this conversation is (the store's, once it has answered; a new conversation offers its own id), so every question
         of one conversation goes on in one record, whichever window or reopened copy asks it */
      const req = { messages: c.messages.slice(0, -1), context, permission: st.permission, model: st.model, effort: st.effort, fast: st.fast, conversation: c.savedId || c.id };
      for await (const ev of ai.adapter.send(req, { signal: ctrl.signal, settings: getSettings() })) { // settings: the store as this document sees it (a page document has no shell state)
        if (ctrl.signal.aborted) break;
        apply(a, c, ev);
        changed('body');
      }
    } catch (e) {
      if (!ctrl.signal.aborted) a.parts.push({ type: 'text', blocks: [{ p: [String(e.message || e)] }] });
    }
    if (ctrl.signal.aborted) return; // stop() already closed this answer
    finish(a, c);
    if (c.queue?.length) { const next = c.queue.shift(); reply(c, next); return; }
    if (!waiting(c) && !a.failed) onNotify('done', c); /* a failed run is not announced as done */
  }
  function apply(a, c, ev) {
    const wasWorking = a.working;
    if (typeof ev.conversation === 'string' && ev.conversation) {
      c.savedId = ev.conversation; /* a run's last event names the saved record: the next question names it too */
      /* a saved conversation with no title of its own is named by its first question (as the store lists it), not "new chat" */
      if (!c.title) { const q = c.messages.find(m => m.role === 'user'); if (q?.text) { c.title = titleOf(q.text); changed('header'); } }
    }
    if ((ev.type === 'done' || ev.type === 'error') && Array.isArray(ev.refs)) a.refs = ev.refs; /* the evidence the answer's "[n]" marks cite */
    const last = a.parts[a.parts.length - 1];
    switch (ev.type) {
      case 'title': c.title = ev.text; changed('header'); break;
      /* a step with an id is one row: a later event with that id changes its state and meta (how long it took) instead of adding a row */
      case 'step': {
        const row = ev.id != null ? a.steps.find(s => s.id === ev.id) : null;
        const fields = Object.fromEntries(['icon', 'text', 'state', 'meta'].filter(k => ev[k] !== undefined).map(k => [k, ev[k]]));
        if (row) Object.assign(row, fields); else a.steps.push({ ...(ev.id != null ? { id: ev.id } : {}), ...fields });
        break;
      }
      case 'text':
        if (ev.blocks) a.parts.push({ type: 'text', blocks: ev.blocks });
        else {
          /* a streamed piece: a blank line in it starts a new paragraph */
          const [head, ...rest] = String(ev.delta || '').split(/\n{2,}/);
          if (last?.type === 'text' && last.streaming) { const b = last.blocks[last.blocks.length - 1]; b.p[b.p.length - 1] += head; }
          else a.parts.push({ type: 'text', streaming: true, blocks: [{ p: [head] }] });
          const part = a.parts[a.parts.length - 1];
          for (const r of rest) part.blocks.push({ p: [r] });
        }
        if (last?.type !== 'text' || !ev.delta) a.working = false;
        break;
      case 'table': a.parts.push({ type: 'table', head: ev.head, rows: ev.rows, widths: ev.widths }); break;
      case 'code': a.parts.push({ type: 'code', lang: ev.lang, text: ev.text, diff: ev.diff }); break;
      case 'approval': a.parts.push({ type: 'approval', id: ev.id, question: ev.question, title: ev.title, target: ev.target, diff: ev.diff, icon: ev.icon, head: ev.head || null, state: 'pending', selected: 0 }); onNotify('attention', c); break;
      case 'error': a.parts.push({ type: 'error', text: ev.message ?? '', ...(ev.action ? { action: ev.action } : {}) }); a.failed = true; break; /* the run failed: its words in the answer, and the answer is not a completed one */
      case 'done': break;
    }
    /* the first words end the working line: the time the steps took until then stays on the answer (finish() sets the whole time) */
    if (ev.type !== 'step' && ev.type !== 'title') a.working = false;
    if (wasWorking && !a.working) a.seconds = Math.max(1, Math.round((Date.now() - a.startedAt) / 1000));
  }
  function finish(a, c) {
    a.working = false;
    a.seconds = Math.max(1, Math.round((Date.now() - a.startedAt) / 1000));
    a.at = stamp();
    for (const p of a.parts) p.streaming = false;
    c.busy = false; st.abort = null;
    changed();
  }
  /* stopping ends the answer being written; follow-ups still waiting are dropped (their messages stay in the conversation) */
  /* a stopped answer says so (neutral, not a failure) and a step still running ends as stopped */
  function stop() {
    st.abort?.abort(); const c = conv(); if (!c) return;
    const a = [...c.messages].reverse().find(m => m.role === 'assistant'); c.queue = [];
    if (a?.working === undefined || !c.busy) return;
    for (const s of a.steps) if (s.state === 'run') s.state = 'off';
    a.parts.push({ type: 'cancelled' });
    if (!c.title) { const q = c.messages.find(m => m.role === 'user'); if (q?.text) c.title = titleOf(q.text); } // kept like an answered one
    finish(a, c);
  }

  /* ---------- Approvals: the person's choice is the approval; allowing runs the action right away ---------- */
  const approvalPart = id => { for (const c of st.convs.values()) for (const m of c.messages) for (const p of m.parts || []) if (p.type === 'approval' && p.id === id) return p; return null; };
  const waiting = c => { for (const m of c?.messages || []) for (const p of m.parts || []) if (p.type === 'approval' && (p.state === 'pending' || p.state === 'submitting')) return p; return null; };
  async function decide(id, choice, extra = {}) {
    const p = approvalPart(id); if (!p || p.state !== 'pending') return;
    const blocked = st.permission !== 'ask' || !['allow', 'deny'].includes(choice);
    const extraDecision = { ...extra, permission: st.permission, proposal: { title: p.title, target: p.target, icon: p.icon } };
    p.state = 'submitting'; changed('bottom');
    try {
      let r;
      if (blocked) {
        if (!ai.adapter.recordApprovalDecision) throw new Error('decision recorder unavailable');
        r = await ai.adapter.recordApprovalDecision(id, choice, { ...extraDecision, reason: st.permission !== 'ask' ? 'permission' : 'invalid-choice', time: when(stamp()) });
        if (!r?.by || !r?.time || !['ran', 'denied'].includes(r.state)) throw new Error('decision record missing');
      } else r = await ai.adapter.resolveApproval?.(id, choice, extraDecision);
      const allowed = (!blocked && choice === 'allow') || r?.replayed === true;
      p.state = allowed && (r?.state === 'ran' || r?.state === 'approved') ? r.state : 'denied'; p.by = r?.by; p.time = r?.time || when(stamp());
    } catch (e) {
      p.state = 'pending';
      console.error(e);
    }
    changed('body', 'bottom');
  }

  /* ---------- Rendering ---------- */
  const permOf = id => ai.permissions.find(p => p.id === id);
  const provOf = id => st.providers.find(p => p.id === id);
  function renderMessages(variant = 'panel') {
    const c = conv();
    if (!c) return '';
    if (!c.messages.length) return c.bodyMissing && variant === 'full' ? C.emptyState.render({ icon: 'bubbles', title: t('message.noBody') }) : '';
    const first = c.messages[0];
    const items = c.messages.map(m => m.role === 'user'
      ? C.userBubble.render({ text: m.text, time: timeOf(m), chip: m.chip })
      : assistant(m, variant));
    return C.messageList.render({ date: c.dateLabel || (Number.isFinite(first.at) && first.role === 'user' ? when(first.at) : undefined), items, variant });
  }
  /* an answer's "[n]" marks that its refs name become their reference pills (the ref's label and tip; a press opens its address). A mark no ref names, and
     an answer still being written, stay as written */
  const refKey = (m, n) => `${m.id}:${n}`;
  function cited(blocks, m) {
    if (m.working || !Array.isArray(m.refs) || !m.refs.length) return blocks;
    const by = new Map(m.refs.map(r => [String(r.n), r]));
    const split = s => {
      if (typeof s !== 'string') return [s];
      const out = []; let at = 0;
      for (const x of s.matchAll(/\[(\d+)\]/g)) { const r = by.get(x[1]); if (!r) continue; out.push(s.slice(at, x.index), { ref: refKey(m, x[1]), label: r.label || x[0], tip: r.tip, action: 'kit.ai.ref' }); at = x.index + x[0].length; }
      out.push(s.slice(at));
      return out.filter(v => v !== '');
    };
    const line = p => (Array.isArray(p) ? p : [p]).flatMap(split);
    return blocks.map(b => (b.p ? { ...b, p: line(b.p) } : b.ul ? { ...b, ul: b.ul.map(line) } : b.ol ? { ...b, ol: b.ol.map(line) } : b));
  }
  function refAt(key) {
    for (const c of st.convs.values()) for (const m of c.messages) for (const r of m.refs || []) if (refKey(m, r.n) === key) return r;
    return null;
  }
  function assistant(m, variant) {
    /* a step with a state (what the AI reads: running, done, failed, with how long it took) draws as the step row's state form */
    const steps = m.steps.map((s, i) => C.stepRow.render(s.state ? { state: s.state, text: s.text, meta: s.meta } : { icon: s.icon, text: s.text, running: m.working && i === m.steps.length - 1 }));
    /* a reopened answer whose time was never measured (no seconds) shows its steps without a duration */
    const group = !m.working && m.steps.length && !Number.isFinite(m.seconds) ? html`${steps}` : (m.steps.length || m.working) ? C.stepGroup.render({ id: m.id, working: m.working, startedAt: m.startedAt, seconds: m.seconds, open: m.working ? false : !!st.open[m.id], steps, current: m.working && m.steps.length ? C.stepRow.render({ ...m.steps[m.steps.length - 1], running: true }) : '' }) : '';
    /* an answer's words are Markdown (a safe subset, answer-text.js parse): its tables and code blocks draw with the answer's table and code views */
    const read = m.parts.flatMap(p => p.type === 'text' && p.blocks.every(b => b.p?.length === 1 && typeof b.p[0] === 'string')
      ? C.answerText.parse(p.blocks.map(b => b.p[0]).join('\n\n')).map((x, i, all) => ({ ...x, streaming: p.streaming && i === all.length - 1 }))
      : [p]);
    const parts = read.map(p => p.type === 'text' ? C.answerText.render({ blocks: cited(p.blocks, m), streaming: p.streaming })
      : p.type === 'table' ? C.messageTable.render({ ...p, expand: variant === 'panel' ? 'kit.panel.open-as-tab' : undefined })
      : p.type === 'code' ? C.codeBlock.render({ lang: p.lang, text: p.text, diff: p.diff })
      : p.type === 'approval' ? proposal(p)
      : p.type === 'cancelled' ? C.statusIcon.render({ kind: 'idle', text: t('message.cancelled') })
      : p.type === 'error' ? (p.action ? C.staleLine.render({ kind: 'error', text: p.text, action: p.action }) : C.statusIcon.render({ kind: 'error', text: p.text })) : ''); /* an error with an action (where to fix it) links there */
    return html`<div class="as" data-message="${m.id}" data-cb-host>${group}${parts}${timeOf(m) ? C.actionRow.render({ time: timeOf(m), id: m.id }) : ''}</div>`;
  }
  function controls({ wide = false, compact = false } = {}) {
    const p = permOf(st.permission), prov = provOf(st.model.provider);
    const model = prov?.models.find(x => x.id === st.model.model);
    const effort = ai.efforts.find(e => e.id === st.effort);
    const left = [C.toolbarButton.render({ icon: p.icon, label: wide ? text(p.label) : null, tone: p.risky ? 'risky' : null, menu: 'kit.ai.permission', tip: t('composer.permission'), chevron: !compact })]; // a narrow card drops the chevrons of the icon buttons: the model name keeps its room
    if (ai.scope) left.push(C.toolbarButton.render({ icon: ai.scope.icon, label: wide ? text(ai.scope.label(st, getSettings())) : null, menu: 'kit.ai.scope', tip: text(ai.scope.tip), chevron: !compact }));
    const right = [
      C.toolbarButton.render({ kind: 'model', icon: prov?.icon, label: model ? text(model.label) : st.modelsRead && !st.providers.length ? t('composer.noModel') : t('composer.model'), menu: 'kit.ai.model', tip: t('composer.model'), keys: keyLabel(AI_SHORTCUTS.model), shrink: true }),
      /* the effort only for a model that takes one (effort: true); with no model at all its menu says why nothing runs */
      ...(model ? (model.effort ? [effortButton(effort)] : []) : [effortButton(effort)]),
    ];
    return C.composerToolbar.render({ left, right, wide });
  }
  const effortButton = effort => C.toolbarButton.render({ kind: 'effort', label: text(effort?.label), menu: 'kit.ai.effort', tip: t('composer.effort'), keys: keyLabel(AI_SHORTCUTS.effort) });
  /* A proposal reads as part of the answer: its target line and the change as a code block; once decided, one result line (who and when) */
  function proposal(p) {
    const line = C.answerText.render({ blocks: [{ p: [[p.title, p.target].filter(Boolean).join(' · ')] }] });
    const code = p.diff ? C.codeBlock.render({ lang: 'diff', text: p.diff, diff: true }) : '';
    const done = p.state === 'ran' || p.state === 'approved' || p.state === 'denied';
    const result = done ? C.stepRow.render({ icon: p.state === 'denied' ? 'circle-x' : 'circle-check', text: [t('approval.' + p.state), p.by, p.time].filter(Boolean).join(' · ') }) : '';
    return html`<div data-proposal="${p.id}"${attrs({ 'data-state': done ? p.state : null })}>${line}${code}${result}</div>`;
  }
  /* While a proposal waits for a decision the question panel sits right above the composer, which takes a written answer.
     A proposal with a head (approval-head props: target, the whole change, the judgements, what it reaches, where the request came from) shows it under
     the question, and its two choices carry their keys with no footer: the choice itself decides */
  function renderQuestion(p) {
    return C.questionPanel.render({
      id: p.id, question: p.question || t('approval.question'), selected: p.selected, submitting: p.state === 'submitting',
      options: approvalChoices(ai).map(c => ({ ...c, label: text(c.label) })),
      ...(p.head ? { detail: C.approvalHead.render(p.head), footer: false } : {}),
    });
  }
  /* compact: a narrow card: the controls under the input show icons only, so the model name keeps its room */
  function renderBottom({ chip, variant = 'panel', compact = false } = {}) {
    const c = conv();
    const p = waiting(c);
    const ph = p ? t('approval.answer') : text(c?.messages.length ? ai.placeholder.reply : ai.placeholder.start);
    return html`${p ? renderQuestion(p) : ''}${C.composer.render({ id: 'panel', variant, placeholder: ph, chip, busy: !!c?.busy, plusMenu: 'kit.ai.plus' })}${controls({ wide: variant === 'wide' && !compact, compact })}`;
  }

  /* ---------- Menu definitions ---------- */
  const settingsItem = () => ai.settingsAddress ? [{ type: 'separator' }, { id: 'ai-settings', label: t('composer.settings'), endIcon: 'arrow-up-right', action: 'kit.navigate', arg: { address: ai.settingsAddress, newTab: true } }] : [];
  const permItems = () => ai.permissions.map(p => ({ id: 'perm-' + p.id, label: text(p.label), checked: st.permission === p.id, action: 'kit.ai.set-permission', arg: p.id }));
  const modelSub = prov => ({ morph: true, items: prov.models.map(m => ({ id: 'model-' + m.id, label: text(m.label), checked: st.model.provider === prov.id && st.model.model === m.id, action: 'kit.ai.set-model', arg: { provider: prov.id, model: m.id } })) });
  function menus(api) {
    return {
      'kit.ai.permission': () => ({ side: 'top', morph: true, items: permItems() }),
      'kit.ai.scope': () => ai.scope && localizeMenu({ side: 'top', morph: true, ...ai.scope.menu(st, api, getSettings()) }),
      'kit.ai.model': () => ({ side: 'top', align: 'end', morph: true, width: 192, items: [
        { type: 'search', placeholder: t('composer.searchModels') },
        ...st.providers.map(p => ({ id: 'prov-' + p.id, label: text(p.label), icon: p.icon, submenu: modelSub(p) })),
        /* the way to the AI settings only while there is no model to pick (decision 2026-11-16), after a line that says so */
        ...(st.providers.some(p => p.models?.length) ? [] : [...(st.modelsRead ? [{ type: 'label', label: t('composer.noModel') }] : []), ...settingsItem()]),
      ] }),
      'kit.ai.effort': () => {
        const off = !st.providers.some(p => p.models?.length); /* no model: nothing here would run, the first line says why */
        return { side: 'top', align: 'end', morph: true, items: [
          ...(off ? [{ type: 'label', label: t('composer.noModel') }] : []),
          ...ai.efforts.map(e => ({ id: 'effort-' + e.id, label: text(e.label), rainbow: e.tone === 'spectrum', checked: st.effort === e.id, action: 'kit.ai.set-effort', arg: e.id, disabled: off })),
          { type: 'separator' }, { type: 'label', label: t('composer.options') },
          { id: 'fast', label: t('composer.fast'), switch: true, on: st.fast, action: 'kit.ai.set-fast', disabled: off },
          ...(off ? settingsItem() : []),
        ] };
      },
      'kit.ai.plus': () => {
        const p = permOf(st.permission);
        const items = [{ id: 'plus-perm', label: t('composer.permission'), icon: p.icon, end: text(p.label), submenu: { morph: true, items: permItems() } }];
        if (ai.scope) items.push({ id: 'plus-scope', label: text(ai.scope.tip), icon: ai.scope.icon, end: text(ai.scope.label(st, getSettings())), submenu: localizeMenu({ morph: true, ...ai.scope.menu(st, api, getSettings()) }) });
        if (ai.attachments?.length) items.push({ type: 'separator' }, ...ai.attachments.map(x => ({ ...x, label: text(x.label) })));
        return { side: 'top', morph: true, width: 280, items };
      },
      'kit.ai.conversations': () => {
        const groups = [['today', t('panel.today')], ['week', t('panel.previous7')]];
        const items = [];
        for (const [w, label] of groups) {
          const list = st.list.filter(c => c.when === w);
          if (!list.length) continue;
          if (items.length) items.push({ type: 'separator' });
          items.push({ type: 'label', label }, ...list.map(c => ({ id: 'conv-' + c.id, label: c.title, checked: undefined, action: 'kit.ai.select-conversation', arg: c.id })));
        }
        return { width: 260, items };
      },
    };
  }

  const actions = {
    'kit.ai.set-permission': a => { st.permission = a.arg; changed('bottom'); },
    'kit.ai.set-model': a => { st.model = a.arg; changed('bottom'); },
    'kit.ai.set-effort': a => { st.effort = a.arg; changed('bottom'); },
    'kit.ai.set-fast': a => { st.fast = !!a.on; },
    'kit.ai.select-conversation': a => select(a.arg),
    'kit.panel.new-chat': () => newChat(),
    'kit.composer.stop': () => stop(),
    'kit.steps.toggle': a => { st.open[a.id] = a.open; },
    'kit.question.select': a => { const p = approvalPart(a.id); if (p) p.selected = a.index; },
    'kit.question.choose': a => decide(a.id, a.choice),
    'kit.question.cancel': a => decide(a.id, 'deny'),
    'kit.ai.ref': (a, ctx) => { const r = refAt(a.arg); if (r?.address) ctx?.api?.navigate(r.address, { presentation: 'detail' }); }, /* the cited evidence, beside the conversation */
  };

  return { state: st, loadModels, loadList, remove, select, adopt, show, newChat, send, stop, renderMessages, renderBottom, menus, actions, current: conv };
}
