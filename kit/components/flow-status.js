/*
 * Flow status: the state of one action with ordered steps (connecting, checking, installing) in ONE place, the status group at the end
 * of a row: a short rolling text right before the row's single status icon. Nothing sits in the middle of the row, there is never a
 * second spinner and never a step counter; the row's description line keeps saying what the thing is.
 *   running   "login · 2s" with the working shimmer next to the turning icon. When a step ends its text slides up and out and the next comes
 *             up from below with its step name; the seconds then join
 *   asking    the running action waits for the person ("waiting for an answer · 40s"): the row's buttons are the choices
 *   watching  stopped on a step but watching for it to clear by itself (a permission being granted): the status text, turning icon
 *   done      the last text slides up, "Connected" comes up beside the check and fades after a moment: only the check stays
 *   stopped   the icon becomes the cause's mark and the text names it in two words (given as short, else from the kind)
 * The row stays one line; its buttons sit at its end. It opens below only for what the person has to read or fill to decide (body):
 * the value to type, or for a failure the cause in a sentence and the raw output in the shared code view.
 * Every motion uses the shared enter/exit motion tokens (zero under reduced motion: end states only).
 */
import { html } from '../core/html.js';
import { text } from '../core/text.js';
import { t } from '../core/i18n.js';
import * as elapsed from './elapsed.js';
import * as codeBlock from './code-block.js';

export const name = 'flow-status';

export const css = `
.fs-roll { flex: 0 1 auto; min-width: 0; max-width: var(--fs-max-w); display: grid; justify-items: end; align-items: center; height: var(--leading-xs); overflow: hidden; margin-right: calc(var(--space-2) - var(--space-3));
  font-size: var(--text-xs); font-weight: var(--weight-medium); line-height: var(--leading-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.fs-it { grid-area: 1 / 1; display: flex; align-items: center; gap: var(--space-1_5); min-width: 0; max-width: 100%; white-space: nowrap; }
.fs-tx { display: flex; min-width: 0; }
.fs-tx > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.fs-sec { flex-shrink: 0; white-space: pre; }
.fs-it.fail .fs-tx { color: var(--foreground); }
.fs-shim { background: linear-gradient(90deg, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: sg-shimmer var(--dur-shimmer) linear infinite; }
.fs-it.in { animation: fs-in var(--motion-enter-dur) var(--motion-enter-ease) both; }
.fs-it.out { animation: fs-out var(--motion-exit-dur) var(--motion-exit-ease) both; }
.fs-it.ok.in { animation: fs-in var(--motion-enter-dur) var(--motion-enter-ease) both, fs-hide var(--motion-exit-dur) var(--motion-exit-ease) var(--fs-done-hold) both; }
.fs-cause { font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--muted-foreground); }
@keyframes fs-in { from { transform: translateY(100%); opacity: 0; } }
@keyframes fs-out { to { transform: translateY(-100%); opacity: 0; } }
@keyframes fs-hide { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fs-shim { animation: none; background: none; color: var(--muted-foreground); } }
`;

const failedOf = p => p.steps.find(x => x.state === 'fail');
/* stopped on a step but the action still goes on by itself (status busy): it watches for the step to clear */
const watchingOf = p => !!failedOf(p) && p.status?.kind === 'busy';
/* the step underway: the running one, or while the action is busy and nothing runs yet the next one */
const curOf = p => p.steps.find(x => x.state === 'run') || (p.status?.kind === 'busy' && !failedOf(p) ? p.steps.find(x => x.state === 'wait') : undefined);
/** a running flow that waits for the person to choose (keep waiting, cancel) */
export const asking = p => !!(p?.steps?.length && curOf(p) && (p.actions || []).length > 1);
const kindOf = p => (p.kind === 'unknown' || !p.kind || p.kind === 'busy' ? 'error' : p.kind);

/** true when the flow stopped on something the person has to do */
export const problem = p => !!(p?.steps?.length && failedOf(p) && !watchingOf(p));
/** true while the flow works (the row's status icon turns) */
export const running = p => !!(p?.steps?.length && (curOf(p) || watchingOf(p)));

/** the two words of a stop: given (short), or from the kind */
const shortOf = p => (p.short ? text(p.short) : t({ perm: 'flow.perm', idle: 'flow.stopped', fix: 'flow.fix' }[kindOf(p)] || 'flow.failed'));

/**
 * The rolling text of the status group (right before the row's status icon), or '' when there is nothing to say.
 * @param {{steps: {id, label, state: 'wait'|'run'|'done'|'fail'|'skip'}[], status?: {kind, text, since?}, cause?, short?, kind?, actions?: object[], raw?: string}} p
 *   status.since: start of the running step (seconds count); short: the two words of a stop
 */
export function line(p) {
  if (!p?.steps?.length) return '';
  const cur = curOf(p), failed = failedOf(p), watch = watchingOf(p);
  const allDone = !cur && !failed && p.steps.every(x => x.state === 'done' || x.state === 'skip');
  if (!cur && !failed && !allDone) return '';
  const at = cur || failed ? p.steps.indexOf(cur || failed) : p.steps.length;
  const prev = p.steps.slice(0, at).reverse().find(x => x.state === 'done');
  const out = prev && !failed ? html`<span class="fs-it out" data-key="${prev.id}"><span class="fs-tx"><span>${text(prev.label)}</span></span></span>` : '';
  const sec = p.status?.since ? html`<span class="fs-sec"> · ${elapsed.render({ since: p.status.since })}</span>` : '';
  let now;
  if (cur && !asking(p)) now = html`<span class="fs-it in run" data-key="${cur.id}"><span class="fs-tx"><span class="fs-shim">${text(cur.label)}</span>${sec}</span></span>`;
  else if (cur || watch) now = html`<span class="fs-it in run" data-key="${cur ? cur.id : failed.id}-wait"><span class="fs-tx"><span class="fs-shim">${text(p.status.text)}</span>${sec}</span></span>`;
  else if (failed) now = html`<span class="fs-it in fail" data-key="${failed.id}-stop"><span class="fs-tx"><span>${shortOf(p)}</span></span></span>`;
  else now = html`<span class="fs-it in ok" data-key="fs-done"><span class="fs-tx"><span>${t('flow.done')}</span></span></span>`;
  return html`<span class="fs-roll" data-key="fs" data-c="flow-status" role="status">${out}${now}</span>`;
}

/**
 * What a stopped row shows under it, only what the person reads or fills to decide: with a value to type (form) the cause in a sentence
 * and the form; for a failure with raw output the cause and that output in the shared code view. '' otherwise (the row stays one line).
 * o.said: the text the row already shows under its title (the cause is not said twice). p.explain: a stop with no output still opens for its cause sentence.
 */
export function body(p, form = '', o = {}) {
  if (!problem(p)) return form;
  const raw = kindOf(p) === 'error' && p.raw ? String(p.raw).replace(/\n$/, '') : '';
  if (!form && !raw && !p.approval && !p.explain) return ''; /* explain: a stop with no output whose cause is the one thing to read */
  const cause = p.cause ? text(p.cause) : '';
  return html`${cause && cause !== o.said ? html`<div class="fs-cause">${cause}</div>` : ''}${form}${raw ? codeBlock.render({ lang: t('flow.output'), text: raw, compact: true, actions: 'copy', wrap: true }) : ''}`;
}
