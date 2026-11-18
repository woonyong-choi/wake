/*
 * Notice: an alert that needs a person, at the top right under the window's top bar (--z-notice: over the page and its dialogs, under menus and
 * tooltips, so a card's own menu opens over it). It is one of the kit's faces (--radius-face, the surface over the ground, a 1px ring in the strong surface border,
 * shadow md). Why it moves and stacks the way it does is in kit/CONTRACTS.md (Notices).
 * Card: two lines, read in a second. Row 1: the tone's status icon, the title (one line) and, at its end, how long it has been going on
 * ("3 min"), or for a resolved one the time it was resolved; row 2 (muted): the severity word as it came (in the tone's colour, no ground) · one
 * fact · the target (mono, cut short with its whole name as the tooltip). A chevron at the end says the whole card is one action (action: open
 * the incident, ...): its name is the chevron's tooltip and the card's description. No label chips, no buttons, no line that runs out: the rest
 * (summary, subtitle, labels) is the title's tooltip and the app's menu (more), which shows, with close, while the card is pointed at or focused.
 * Stack: the newest is in front; up to --notice-max cards are kept, the ones behind peek under the front card a step smaller (depth), and the
 * stack opens into a column while the pointer or the focus is on it (the times stop meanwhile). A card comes down from above and settles; a card
 * that leaves (closed, acted on, run out) slips quickly to the right (--notice-leave-x, --dur-fast, --ease-exit) while the others glide into its
 * place. The same alert told again (its id) changes in place: a resolved alert is the same card with its new words, not a new card. After
 * --notice-hold with nothing new and nobody on it, the stack folds into one chip (worst tone, newest name, "+N"), unless a critical (danger) card is
 * in it: that one keeps the stack open and does not run out until it is closed or dismissed; pointing at, focusing or pressing the chip opens it
 * again. Reduced motion: no movement, the states change at once.
 *   tone: 'danger' | 'warn' | 'ok' (resolved) | 'info'; title; severity (the word as it came: critical, warning, resolved; else label);
 *   fact: one fact (else summary, else the count); target: the thing it is about (else the last subtitle); since: ms or Date, when it began
 *   (else at); now: ms or a function giving ms (the clock the age is read against; default the page's ctx.now, else the wall clock);
 *   resolvedAt: ms or Date (a resolved one shows it; else since);
 *   action: { label, action, arg? } (the card's press: ctx.emit(action, { arg }) and the card closes; else primary, else link);
 *   menu: { id, arg? } (a menu of the app: mute, ...); summary, subtitle, labels: { key, value }[]: the title's tooltip;
 *   persist: true keeps it until it is acted on; otherwise duration (ms; default --notice-duration, --notice-ok-duration when resolved);
 *   id: notify() with the id of a card that is up updates it in place, patched so nothing it holds (the focus, an open menu's button) is lost;
 *     it comes to the front and its time starts again
 * Place: top right, under the window's top bar (--notice-top, which a page may set), or under the element the page marks with
 *   data-notice-below (its header row, so a card never covers the page's tabs or controls).
 * Keys: a card is focusable; Enter runs its action, Escape closes it. A press on the card that is not one of its buttons runs its action.
 * A card the person closed (close, Escape, its action) stays closed for the session under its id: notify() with that id again shows it
 * only when its tone is worse than when it was closed (a new id always shows); the page's dismiss(id) ends the alert and forgets that.
 * attach() returns { notify(p) -> id, update(id, patch), dismiss(id) }.
 */
import { html, attrs } from '../core/html.js';
import { t, formatRelative } from '../core/i18n.js';
import { formatFull } from '../core/clock.js';
import { morph } from '../core/morph.js';
import { icon } from '../icons/icons.js';
import * as statusIcon from './status-icon.js';
import * as iconButton from './icon-button.js';

export const name = 'notice';

export const css = `
.ntcs { position: fixed; top: var(--notice-top, calc(var(--topbar-h) + var(--space-2))); inset-inline-end: var(--space-3); z-index: var(--z-notice); width: min(var(--notice-w), calc(100vw - 2 * var(--space-3))); pointer-events: none; }
.ntcs.open { pointer-events: auto; } /* open, the column (and the room between its cards) is the stack's: moving between cards does not close it */
.ntc { position: absolute; inset-inline: 0; top: 0; display: grid; grid-template-columns: var(--icon) minmax(0, 1fr) auto var(--icon); column-gap: var(--space-2_5); row-gap: var(--space-0_5); align-items: center; padding: var(--space-3) var(--space-3) var(--space-3) var(--space-3_5); border-radius: var(--r-surface); corner-shape: var(--corner-round); background: linear-gradient(var(--surface-primary), var(--surface-primary)), var(--background); box-shadow: 0 0 0 var(--line) var(--border-surface-strong), var(--shadow-md); color: var(--foreground); pointer-events: auto; cursor: pointer; outline: none; transform-origin: 50% 0;
  transform: translate(var(--ntc-x, 0), var(--ntc-y, 0)) scale(var(--ntc-s, 1)); opacity: var(--ntc-o, 1); max-height: var(--ntc-h, none);
  transition: transform var(--dur-notice) var(--ease-out-expo), opacity var(--dur-notice) var(--ease-out-expo), max-height var(--dur-notice) var(--ease-out-expo), background var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard); }
.ntc:hover { background: linear-gradient(var(--ghost-hover), var(--ghost-hover)), linear-gradient(var(--surface-primary), var(--surface-primary)), var(--background); }
.ntc:focus-visible { box-shadow: 0 0 0 var(--line) var(--border-surface-strong), var(--shadow-md), 0 0 0 var(--focus-w) var(--focus); }
.ntc:active:not(:has(button:active)) { opacity: var(--press-opacity); }
.ntc.behind { overflow: hidden; } .ntc.behind > * { opacity: 0; visibility: hidden; } /* a card behind shows only its edge under the front card */
.ntc.entering { --ntc-y: calc(-1 * var(--space-3)); --ntc-s: var(--notice-leave-scale); --ntc-o: 0; transition: none; } /* it comes down from above */
.ntc.leaving { --ntc-x: var(--notice-leave-x); --ntc-o: 0; pointer-events: none; transition-duration: var(--dur-fast); transition-timing-function: var(--ease-exit); } /* it slips out to the screen's edge, quickly */
.ntc.swap > :not(.ntc-x) { animation: ntc-swap var(--dur-notice) var(--ease-out-expo); } /* the same alert with new words: they change where they stand */
@keyframes ntc-swap { from { opacity: 0; filter: blur(var(--space-0_5)); } }
.ntcs.folded .ntc { pointer-events: none; }
.ntc > .sti { grid-column: 1; grid-row: 1; }
.ntc-t { grid-column: 2; grid-row: 1; margin: 0; min-width: 0; font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-semibold); color: var(--foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ntc-age { grid-column: 3; grid-row: 1; display: grid; justify-items: end; align-items: center; }
.ntc-age > time { grid-area: 1 / 1; font-size: var(--text-xs); line-height: var(--leading-sm); color: var(--muted-foreground); font-variant-numeric: tabular-nums; white-space: nowrap; transition: opacity var(--dur-fast) var(--ease-standard); }
.ntc-age > .ntc-more { grid-area: 1 / 1; display: flex; opacity: 0; transition: opacity var(--dur-fast) var(--ease-standard); }
.ntc:is(:hover, :focus-within) .ntc-age:has(> .ntc-more) > time { opacity: 0; } .ntc:is(:hover, :focus-within) .ntc-age > .ntc-more { opacity: 1; } /* the app's menu takes the time's place while the card is pointed at */
.ntc-m { grid-column: 2 / 4; grid-row: 2; margin: 0; display: flex; align-items: center; gap: var(--space-1_5); min-width: 0; font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--muted-foreground); white-space: nowrap; overflow: hidden; }
.ntc-m > * { flex: none; } .ntc-m > code { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-mono); font-size: inherit; color: var(--muted-foreground); }
.ntc-m > .ntc-f:last-child { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ntc-dot::before { content: "·"; }
.ntc-sev { font-weight: var(--weight-medium); color: var(--muted-foreground); }
.ntc-sev[data-tone="danger"] { color: var(--destructive-content); } .ntc-sev[data-tone="warn"] { color: var(--warning-content); } .ntc-sev[data-tone="ok"] { color: var(--success-content); }
.ntc-go { grid-column: 4; grid-row: 1 / 3; display: grid; place-items: center; color: var(--muted-foreground); }
.ntc-x { position: absolute; top: calc(-1 * var(--space-2)); inset-inline-start: calc(-1 * var(--space-2)); opacity: 0; transition: opacity var(--dur-fast) var(--ease-standard); }
.ntc:is(:hover, :focus-within) .ntc-x { opacity: 1; } /* close shows on the card the pointer or the focus is on */
.ntc-x .ib { border-radius: var(--r-pill); background: linear-gradient(var(--surface-primary), var(--surface-primary)), var(--background); box-shadow: 0 0 0 var(--line) var(--border-surface-strong), var(--shadow-md); }
.ntc-sr { position: absolute; width: var(--space-px); height: var(--space-px); overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.ntc-chip { position: absolute; inset-inline-end: 0; top: 0; display: inline-flex; align-items: center; gap: var(--space-1_5); max-width: var(--notice-chip-max); height: var(--control-h-sm); padding: 0 var(--space-3) 0 var(--space-2); border-radius: var(--r-pill); background: linear-gradient(var(--surface-primary), var(--surface-primary)), var(--background); box-shadow: 0 0 0 var(--line) var(--border-surface-strong), var(--shadow-md); color: var(--foreground); font-size: var(--text-xs); font-weight: var(--weight-medium); pointer-events: auto; opacity: 0; transform: scale(var(--notice-leave-scale)); transition: opacity var(--dur-notice) var(--ease-out-expo), transform var(--dur-notice) var(--ease-out-expo), background var(--dur-fast) var(--ease-standard); visibility: hidden; }
.ntcs.folded .ntc-chip { opacity: 1; transform: none; visibility: visible; }
.ntc-chip:hover { background: linear-gradient(var(--ghost-hover), var(--ghost-hover)), linear-gradient(var(--surface-primary), var(--surface-primary)), var(--background); } .ntc-chip:active { opacity: var(--press-opacity); }
.ntc-chip:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-0_5); }
.ntc-chip-t { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ntc-chip b { font-variant-numeric: tabular-nums; font-weight: var(--weight-medium); color: var(--muted-foreground); }
@media (prefers-reduced-motion: reduce) { .ntc, .ntc-chip, .ntc-x, .ntc-age > * { transition: none; } .ntc.swap > * { animation: none; } }
`;

const KIND = { danger: 'error', warn: 'warn', ok: 'ok', info: 'idle' };
/* a notice the person closed comes back under its id only when its tone ranks worse (RANK) than when it was closed */
const CLOSED_KEY = 'kit.notice.closed', CLOSED_MAX = 64;
const TONES = Object.keys(KIND);
const RANK = { danger: 3, warn: 2, info: 1, ok: 0 };
const toneOf = tone => (TONES.includes(tone) ? tone : 'info');
/** A critical (danger) notice holds the stack open: while one is up the stack does not fold, and it does not run out itself */
export const holdsOpen = tones => tones.some(tone => toneOf(tone) === 'danger');
/** Whether a notice runs out on its own (else it stays until it is closed, acted on or dismissed) */
export const runsOut = p => !p.persist && !holdsOpen([p.tone]);
/** A notice the person closed (at closedRank) comes back under the same id only when its tone is worse */
export const comesBack = (closedRank, tone) => RANK[toneOf(tone)] > closedRank;
const ms = at => (at instanceof Date ? at.getTime() : Number(at));

/** A notice definition with its Text values read in the locale in use (text: core/text.js text) */
export const noticeText = (p, text) => ({ ...p,
  ...(p.label != null ? { label: text(p.label) } : {}), ...(p.title != null ? { title: text(p.title) } : {}), ...(p.summary != null ? { summary: text(p.summary) } : {}),
  ...(p.subtitle != null ? { subtitle: Array.isArray(p.subtitle) ? p.subtitle.map(x => text(x)) : text(p.subtitle) } : {}),
  ...Object.fromEntries(['fact', 'target', 'severity'].filter(k => p[k] != null).map(k => [k, text(p[k])])),
  ...Object.fromEntries(['action', 'primary', 'secondary', 'link'].filter(k => p[k]).map(k => [k, { ...p[k], label: text(p[k].label) }])) });

/** How long a notice has been going on, as words: just now, then minutes, hours, days */
export function age(since, now = Date.now()) {
  const s = Math.max(0, (now - ms(since)) / 1000);
  if (s < 45) return t('notice.now');
  if (s < 3600) return t('notice.forMinutes', { count: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return t('notice.forHours', { count: Math.round(s / 3600) });
  return t('notice.forDays', { count: Math.round(s / 86400) });
}

/** The folded stack: one chip with the worst tone's mark, the newest notice's name and how many more there are */
export const chipMarkup = (tone, title, more) => html`<button class="ntc-chip" type="button" data-tone="${tone}"${attrs({ 'aria-label': more > 0 ? `${title} +${more}` : title, 'aria-expanded': 'false' })}>${statusIcon.render({ kind: KIND[tone] })}<span class="ntc-chip-t">${title}</span>${more > 0 ? html`<b>+${more}</b>` : ''}</button>`;

/** The action a press on the card runs: action, else the older primary, else link */
export const actionOf = p => p.action ?? p.primary ?? p.link ?? null;
/* the card's own attributes (kept on the element when it is patched): its name is the title, its description the action */
const cardAttrs = p => { const tone = toneOf(p.tone); return { 'data-id': p.id, 'data-tone': tone, role: tone === 'danger' || tone === 'warn' ? 'alert' : 'status', 'aria-labelledby': `ntc-t-${p.id}`, 'aria-describedby': actionOf(p) ? `ntc-a-${p.id}` : null }; };
/** The time a notice is read against: its own now (ms, or a function giving ms: a page's simulated clock), else the wall clock */
export const nowOf = p => { const n = typeof p?.now === 'function' ? p.now() : p?.now; return Number.isFinite(n) ? n : Date.now(); };
/* the time at the end of row 1: how long it has been going on (the start as the tooltip), or for a resolved one when it was resolved */
function timeMark(p, now = nowOf(p)) {
  const resolved = toneOf(p.tone) === 'ok', at = ms(resolved ? p.resolvedAt ?? p.since ?? p.at : p.since ?? p.at);
  if (!Number.isFinite(at)) return '';
  const full = formatFull(at / 1000);
  if (resolved) { const today = formatFull(now / 1000).slice(0, 10) === full.slice(0, 10); return html`<time${attrs({ datetime: new Date(at).toISOString(), 'data-tip': full })}>${today ? full.slice(11, 16) : full.slice(0, 16)}</time>`; }
  return html`<time${attrs({ datetime: new Date(at).toISOString(), 'data-at': at, 'data-tip': full })}>${age(at, now)}</time>`;
}

/** @param {{id: string, tone?: 'danger'|'warn'|'ok'|'info', title: string, severity?: string, label?: string, fact?: string, target?: string, since?: number|Date, at?: number|Date, resolvedAt?: number|Date, action?: {label: string, action: string, arg?: any}, primary?: {label: string, action: string, arg?: any}, link?: {label: string, action: string, arg?: any}, menu?: {id: string, arg?: any}, summary?: string, subtitle?: string|string[], labels?: {key: string, value: string}[], count?: number, persist?: boolean, duration?: number}} p */
export function render(p) {
  return html`<div class="ntc" data-c="notice" tabindex="0"${attrs(cardAttrs(p))}>${inner(p)}</div>`;
}

/** What is inside a card (patched in place when the card is updated) */
export function inner(p) {
  const tone = toneOf(p.tone), act = actionOf(p);
  const sub = Array.isArray(p.subtitle) ? p.subtitle.filter(Boolean) : p.subtitle ? [p.subtitle] : [];
  const sev = p.severity ?? p.label, fact = p.fact ?? p.summary ?? (p.count > 1 ? t('notice.count', { count: p.count }) : ''), target = p.target ?? sub.at(-1) ?? '';
  /* what the two lines leave out is the title's tooltip: the summary, where it is, the labels */
  const rest = [p.summary !== fact ? p.summary : '', sub.join(' · '), ...(p.labels ?? []).map(l => `${l.key}=${l.value}`)].filter(Boolean).join(' · ');
  const more = p.menu ? iconButton.render({ icon: 'more', size: 'xs', menu: p.menu.id, arg: p.menu.arg, tip: t('settings.more') }) : '';
  const line = [sev ? html`<b class="ntc-sev" data-tone="${tone}">${sev}</b>` : '', fact ? html`<span class="ntc-f">${fact}</span>` : '', target ? html`<code${attrs({ 'data-tip': p.target ?? sub.join(' · '), 'data-tip-overflow': true })}>${target}</code>` : ''].filter(x => x !== '');
  return html`${statusIcon.render({ kind: KIND[tone] })}<h3 class="ntc-t" id="ntc-t-${p.id}"${attrs({ 'data-tip': rest ? `${p.title} · ${rest}` : p.title, 'data-tip-overflow': rest ? null : true })}>${p.title}</h3><span class="ntc-age">${timeMark(p)}${more ? html`<span class="ntc-more">${more}</span>` : ''}</span>
    ${line.length ? html`<p class="ntc-m">${line.map((m, k) => html`${k ? html`<i class="ntc-dot" aria-hidden="true"></i>` : ''}${m}`)}</p>` : ''}
    ${act ? html`<span class="ntc-go" aria-hidden="true" data-tip="${act.label}">${icon('chevron-right-small', 'sm')}</span><span class="ntc-sr" id="ntc-a-${p.id}">${act.label}</span>` : ''}<span class="ntc-x">${iconButton.render({ icon: 'cross-small', size: 'xs', tip: t('notice.close') })}</span>`;
}

/**
 * Where each card stands: open, a column with gaps; closed, the front card whole and up to two behind it a step lower and smaller, cut to the
 * front card's height. heights: each card's own height, newest first. Returns { y, scale, clip (a height or null), behind } per card and the stack's height.
 */
export function stackLayout(heights, { open, max = 3, gap = 8, peek = 8, step = 0.05 }) {
  const out = []; let y = 0;
  heights.forEach((h, i) => {
    /* closed, a card behind is cut to the front card's height and shrunk from its top: it is moved down so its lower edge shows a peek below */
    const under = k => k * peek + (heights[0] || 0) * k * step;
    if (i >= max) { out.push({ y: open ? y : under(max - 1), scale: open ? 1 : 1 - step * (max - 1), clip: open ? null : heights[0], behind: true, hidden: true }); return; }
    if (open) { out.push({ y, scale: 1, clip: null, behind: false, hidden: false }); y += h + gap; }
    else out.push({ y: under(i), scale: 1 - i * step, clip: i ? heights[0] : null, behind: i > 0, hidden: false });
  });
  const shown = Math.min(heights.length, max);
  return { cards: out, height: !heights.length ? 0 : open ? y - gap : heights[0] + peek * (shown - 1) };
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root, win = doc.defaultView;
  const cssMs = n => parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue(n)) || 0;
  const cssPx = n => parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue(n)) || 0;
  const list = []; /* newest first */
  /* what the person closed (the close button, Escape, one of its buttons), by id, with the tone it had; kept for the session, so a page that
     is left and opened again, or that tells the same alert again, does not bring it back. A new id or a worse tone does */
  const store = (() => { try { return win.sessionStorage; } catch { return null; } })();
  const closed = new Map((() => { try { return JSON.parse(store?.getItem(CLOSED_KEY) || '[]'); } catch { return []; } })());
  const keepClosed = () => { try { store?.setItem(CLOSED_KEY, JSON.stringify([...closed].slice(-CLOSED_MAX))); } catch { /* storage may be off: the memory lasts for this page */ } };
  const closeByPerson = id => { const it = list.find(x => x.p.id === id); if (it) { closed.delete(id); closed.set(id, RANK[toneOf(it.p.tone)]); keepClosed(); } dismiss(id); };
  let host = null, chip = null, seq = 0, open = false, folded = false, inside = 0, foldT = null, ticker = null;

  const ensureHost = () => {
    if (host) return;
    host = doc.createElement('section'); host.className = 'ntcs'; host.setAttribute('aria-live', 'polite'); host.setAttribute('aria-label', t('notice.region'));
    doc.body.appendChild(host);
    win.addEventListener('resize', place, { passive: true });
    const enter = () => { if (inside++ === 0) { clearTimeout(foldT); setOpen(true); } };
    const leave = () => { inside = Math.max(0, inside - 1); if (!inside) { setOpen(false); schedule('leave'); } };
    host.addEventListener('pointerenter', enter); host.addEventListener('pointerleave', leave);
    host.addEventListener('focusin', e => { if (!host.contains(e.relatedTarget)) enter(); });
    host.addEventListener('focusout', e => { if (!host.contains(e.relatedTarget)) leave(); });
    /* the relative times stay true while cards are up */
    ticker = win.setInterval(() => {
      for (const it of list) {
        const tm = it.el.querySelector('time[data-at]'); if (!tm) continue;
        const words = age(+tm.dataset.at, nowOf(it.p));
        if (tm.textContent !== words) tm.textContent = words;
      }
    }, cssMs('--notice-tick') || 5000); /* a simulated clock can run faster than the wall */
  };

  /* the stack's places, from the cards' own heights (read with nothing cut) */
  /* where the stack starts: under the element the page marks with data-notice-below (its header row with tabs and controls), else --notice-top */
  const place = () => {
    if (!host) return;
    const below = doc.querySelector('[data-notice-below]');
    const top = below ? below.getBoundingClientRect().bottom + cssPx('--space-2') : null;
    const v = top != null && top > 0 ? Math.round(top) + 'px' : '';
    if (host.style.top !== v) host.style.top = v;
  };
  const layout = () => {
    if (!host) return;
    place();
    const heights = list.map(it => { it.el.style.removeProperty('--ntc-h'); return it.el.offsetHeight; });
    const { cards, height } = stackLayout(heights, { open, max: cssPx('--notice-max') || 3, gap: cssPx('--space-2'), peek: cssPx('--space-2'), step: 1 - (parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--notice-depth-scale')) || 0.95) });
    list.forEach((it, i) => {
      const c = cards[i], s = it.el.style;
      s.setProperty('--ntc-y', c.y + 'px'); s.setProperty('--ntc-s', String(c.scale));
      if (c.clip != null) s.setProperty('--ntc-h', c.clip + 'px');
      const gone = c.hidden || folded; /* folded, every card leaves into the chip the way a closed card leaves */
      s.setProperty('--ntc-o', gone ? '0' : '1'); if (folded) s.setProperty('--ntc-s', getComputedStyle(doc.documentElement).getPropertyValue('--notice-leave-scale').trim() || '.96');
      s.zIndex = String(list.length - i);
      it.el.classList.toggle('behind', c.behind); it.el.inert = c.behind || gone; it.el.tabIndex = c.behind || gone ? -1 : 0;
    });
    host.style.height = (folded && chip ? chip.offsetHeight : height) + 'px';
    if (folded) drawChip();
  };
  const setOpen = on => { if (open === on) return; open = on; host.classList.toggle('open', on); if (on && folded) unfold(); layout(); };

  /* folding: after --notice-hold with nothing new and nobody on the stack, it folds into one chip the same way a card leaves */
  /* a critical notice (danger) holds the stack open: it neither folds nor runs out until the person closes it or the page dismisses it */
  const critical = () => holdsOpen(list.map(x => x.p.tone));
  const schedule = which => { clearTimeout(foldT); if (!list.length || inside > 0 || critical()) return; foldT = win.setTimeout(fold, cssMs(which === 'leave' ? '--notice-leave' : '--notice-hold')); };
  const drawChip = () => {
    if (!list.length) { chip?.remove(); chip = null; return; }
    const worst = list.reduce((a, b) => (RANK[toneOf(b.p.tone)] > RANK[toneOf(a.p.tone)] ? b : a));
    const wrap = doc.createElement('div'); wrap.innerHTML = chipMarkup(toneOf(worst.p.tone), list[0].p.title, list.length - 1).s;
    const b = wrap.firstElementChild; b.style.zIndex = String(list.length + 1); /* over every card */
    b.addEventListener('click', () => { unfold(); list[0]?.el.focus({ preventScroll: true }); });
    b.addEventListener('focus', () => { unfold(); list[0]?.el.focus({ preventScroll: true }); });
    if (chip) chip.replaceWith(b); else host.appendChild(b);
    chip = b;
  };
  function fold() { if (!list.length || inside > 0 || critical()) return; folded = true; drawChip(); host.classList.add('folded'); layout(); }
  function unfold() { if (!folded) return; folded = false; host.classList.remove('folded'); layout(); schedule('hold'); }

  const timeOf = p => (!runsOut(p) ? 0 : p.duration > 0 ? p.duration : cssMs(toneOf(p.tone) === 'ok' ? '--notice-ok-duration' : '--notice-duration'));
  /* a card's time runs only while nobody is on the stack or on the card */
  const arm = it => {
    clearTimeout(it.timer); it.timer = null;
    if (!it.total || open || it.el.contains(doc.activeElement) || !list.includes(it)) return;
    it.started = performance.now(); it.timer = win.setTimeout(() => dismiss(it.p.id), it.left);
  };
  const pause = it => { if (it.timer) { clearTimeout(it.timer); it.timer = null; it.left -= performance.now() - it.started; } };
  const pauseAll = () => list.forEach(pause), resumeAll = () => list.forEach(arm);

  /* a card is made once; an update patches what is inside it, so what it holds stays (the focus, the button a menu is open from) */
  const draw = it => {
    it.total = timeOf(it.p); it.left = it.total;
    if (it.el) {
      for (const [k, v] of Object.entries(cardAttrs(it.p))) { if (v == null) it.el.removeAttribute(k); else if (it.el.getAttribute(k) !== String(v)) it.el.setAttribute(k, v); }
      const was = it.el.querySelector('.ntc-t')?.textContent;
      morph(it.el, inner(it.p).s);
      /* the same alert with new words (resolved): they change where they stand */
      if (was !== it.p.title) { it.el.classList.remove('swap'); void it.el.offsetWidth; it.el.classList.add('swap'); }
      arm(it);
      return;
    }
    const wrap = doc.createElement('div'); wrap.innerHTML = render(it.p).s;
    const el = wrap.firstElementChild; el.innerHTML = inner(it.p).s;
    it.el = el;
    const run = () => { const a = actionOf(it.p); closeByPerson(it.p.id); if (a?.action) ctx.emit(a.action, { arg: a.arg }); };
    el.addEventListener('animationend', e => { if (e.animationName === 'ntc-swap') el.classList.remove('swap'); });
    el.addEventListener('focusin', e => { if (!el.contains(e.relatedTarget)) pause(it); });
    el.addEventListener('focusout', e => { if (!el.contains(e.relatedTarget)) arm(it); });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeByPerson(it.p.id); }
      else if (e.key === 'Enter' && e.target === el) { e.preventDefault(); run(); }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest?.('button');
      if (b?.matches('[data-menu]')) return; /* the menu opens by itself */
      if (b?.closest('.ntc-x')) { closeByPerson(it.p.id); return; } /* close */
      if (actionOf(it.p)) run(); /* the whole card is its one action */
    });
    arm(it);
  };

  function notify(p) {
    ensureHost();
    const id = p.id ?? `ntc-${++seq}`;
    if (list.some(x => x.p.id === id)) return update(id, p);
    if (closed.has(id)) { if (!comesBack(closed.get(id), p.tone)) return id; closed.delete(id); keepClosed(); } /* closed by the person: back only when worse */
    ctx.onOverlay?.(true, null, { focus: false, owner: 'notice' });
    const it = { p: { ...p, id, now: p.now ?? ctx.now }, el: null }; /* ctx.now: the page's clock for every notice */
    list.unshift(it);
    draw(it);
    it.el.classList.add('entering');
    host.appendChild(it.el);
    if (folded) unfold();
    layout();
    it.el.getBoundingClientRect();
    it.el.classList.remove('entering');
    schedule('hold');
    return id;
  }

  function update(id, patch) {
    const it = list.find(x => x.p.id === id);
    if (!it) return notify({ ...patch, id });
    it.p = { ...it.p, ...patch, id };
    list.splice(list.indexOf(it), 1); list.unshift(it);
    draw(it);
    if (folded) unfold();
    layout(); schedule('hold');
    return id;
  }

  function dismiss(id) {
    const it = list.find(x => x.p.id === id); if (!it) return;
    clearTimeout(it.timer);
    const wasFocused = it.el.contains(doc.activeElement);
    list.splice(list.indexOf(it), 1);
    if (toneOf(it.p.tone) === 'danger' && list.length) schedule('hold'); /* the stack it held open may fold again */
    it.el.classList.add('leaving'); it.el.inert = true;
    win.setTimeout(() => {
      it.el.remove();
      if (!list.length) { ctx.onOverlay?.(false, null, { focus: false, owner: 'notice' }); chip?.remove(); chip = null; folded = false; host.classList.remove('folded', 'open'); open = false; inside = 0; clearTimeout(foldT); host.style.height = '0px'; }
    }, cssMs('--dur-notice'));
    layout();
    if (wasFocused) list[0]?.el.focus({ preventScroll: true });
  }

  /* the times stop while the stack is open (pointer or focus on it) and go on when it closes */
  const observer = new win.MutationObserver(() => { if (!host) return; if (open) pauseAll(); else resumeAll(); });
  const watchHost = () => { if (host && !watchHost.done) { observer.observe(host, { attributes: true, attributeFilter: ['class'] }); watchHost.done = true; } };
  const notifyAndWatch = p => { const id = notify(p); watchHost(); return id; };
  win.addEventListener('pagehide', () => { clearInterval(ticker); observer.disconnect(); }, { once: true });

  /* the page's own dismiss ends the alert: what the person closed under that id is forgotten, so the next alert with it is a new one */
  const end = id => { if (closed.delete(id)) keepClosed(); dismiss(id); };
  return { notify: notifyAndWatch, update, dismiss: end };
}
