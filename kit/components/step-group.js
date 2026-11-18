/*
 * Step group: "Working for N s" (running, ticks every second) or "Worked for N s >" (done, press to expand).
 * The expanded content is a step-row list whose height opens and closes over 200ms ease-out. While running it shows the current step line.
 */
import { html, cx } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { t } from '../core/i18n.js';

export const name = 'step-group';

export const css = `
.sg { width: 100%; min-width: 0; } /* a group takes its pane's width (a pane that sizes to its content does not decide it) */
.sg-fold { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--control-h-xs); padding-bottom: var(--space-2); font-size: var(--text-sm); color: var(--muted-foreground); font-variant-numeric: tabular-nums; user-select: none; transition: color var(--dur-fast) var(--ease-standard); }
.sg-fold:hover { color: var(--foreground); }
.sg-fold .wi { transition: transform var(--dur-fast) var(--ease-standard); }
.sg-fold[aria-expanded="true"] .wi { transform: rotate(90deg); }
.sg-body { overflow: hidden; transition: height var(--dur-collapse) var(--ease-out); }
.sg-body[hidden] { display: block; height: 0; }
.sg-inner { padding: var(--space-1) 0 var(--space-4); }
.sg-working .sg-fold { color: var(--muted-foreground); }
.sg-working .shimmer { background: linear-gradient(90deg, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: sg-shimmer var(--dur-shimmer) linear infinite; }
@keyframes sg-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
`;

export const formatSeconds = s => s < 60 ? t('time.seconds', { n: s }) : t('time.minutes', { m: Math.floor(s / 60), s: s % 60 });

/** @param {{id: string, working?: boolean, seconds: number, open?: boolean, steps: any[], current?: any, startedAt?: number}} p */
export function render(p) {
  const label = p.working ? t('message.workingFor', { time: formatSeconds(p.seconds) }) : t('message.workedFor', { time: formatSeconds(p.seconds) });
  return html`<div class="${cx('sg', p.working && 'sg-working')}" data-c="step-group" data-id="${p.id}"${p.working && p.startedAt ? html` data-started="${p.startedAt}"` : ''}>
    <button class="sg-fold" aria-expanded="${String(!!p.open)}" aria-controls="sg-${p.id}"><span class="${p.working ? 'shimmer' : ''}" data-sg-label>${label}</span>${icon(p.working ? 'chevron-down-small' : 'chevron-right-small')}</button>
    ${p.working && p.current ? p.current : ''}
    <div class="sg-body" id="sg-${p.id}" ${p.open ? '' : html`hidden`}><div class="sg-inner">${p.steps}</div></div>
  </div>`;
}

/* Expand and collapse (height animation) and the running timer */
export function attach(root, ctx) {
  root.addEventListener('click', e => {
    const b = e.target.closest('.sg-fold');
    if (!b) return;
    const body = b.parentElement.querySelector('.sg-body');
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    const h = body.querySelector('.sg-inner').offsetHeight;
    if (open) { body.hidden = false; body.style.height = '0px'; body.getBoundingClientRect(); body.style.height = h + 'px'; }
    else { body.style.height = h + 'px'; body.getBoundingClientRect(); body.style.height = '0px'; }
    body.addEventListener('transitionend', function done() { body.removeEventListener('transitionend', done); body.style.height = ''; if (!open) body.hidden = true; });
    ctx.emit('kit.steps.toggle', { id: b.parentElement.dataset.id, open }, { render: false });
  });
  const tick = () => {
    (root.ownerDocument || root).querySelectorAll('.sg-working[data-started]').forEach(g => {
      const s = Math.max(0, Math.floor((Date.now() - +g.dataset.started) / 1000));
      const l = g.querySelector('[data-sg-label]');
      const text = t('message.workingFor', { time: formatSeconds(s) });
      if (l.textContent !== text) l.textContent = text;
    });
  };
  setInterval(tick, 250);
}
