/*
 * Progress: one bar component for every ratio value.
 *   size 'row' (default): 4 high bar filling its container (settings usage row), tone from the remaining value:
 *     above 30 ok (green), 30 or less warn, 10 or less danger, unless tone is given.
 *   size 'inline': one line of text and a short fixed-width bar after it (tables, cards).
 * marks: positions (0..100) of reference lines drawn over the bar (a limit, a request, a target).
 * The fill width changes with a transition.
 */
import { html, cx, attrs } from '../core/html.js';

export const name = 'progress';

export const css = `
.prg { position: relative; display: block; width: 100%; height: var(--progress-h); border-radius: var(--r-pill); background: var(--muted); overflow: hidden; }
.prg > i { display: block; height: 100%; width: var(--v); border-radius: inherit; background: var(--success); transition: width var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard); }
.prg.warn > i { background: var(--warning); }
.prg.danger > i { background: var(--destructive); }
.prg.neutral > i { background: var(--primary); }
.prg-mark { position: absolute; inset-block: 0; inset-inline-start: var(--at); width: var(--line); background: var(--foreground); opacity: .6; } /* a reference on the bar: a limit, a request, a target */
.prg.segments { display: flex; }
.prg.segments > i { flex-shrink: 0; border-radius: 0; }
.prg.segments > .neutral { background: var(--muted-foreground); }
.prg.segments > .warn { background: var(--warning); }
.prg.segments > .danger { background: var(--destructive); }
.prg-inline { display: inline-flex; align-items: center; gap: var(--space-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.prg-inline .prg { width: var(--progress-inline-w); flex-shrink: 0; }
`;

const toneOf = v => v <= 10 ? 'danger' : v <= 30 ? 'warn' : 'ok';

/** @param {{value: number, tone?: 'ok'|'warn'|'danger'|'neutral', size?: 'row'|'inline', label?: string, segments?: {value: number, tone: 'ok'|'warn'|'danger'|'neutral', label: string}[], marks?: number[]}} p  value 0..100 */
export function render(p) {
  const v = Math.max(0, Math.min(100, Number(p.value) || 0));
  const segments = p.segments?.filter(segment => Number.isFinite(segment.value) && segment.value > 0);
  const description = segments?.map(segment => segment.label).join(' · ');
  const marks = (p.marks || []).filter(Number.isFinite).map(at => html`<b class="prg-mark" style="--at:${Math.max(0, Math.min(100, at))}%"></b>`);
  const bar = segments?.length
    ? html`<span class="prg segments" data-c="progress" role="img"${attrs({ 'aria-label': description, title: description })}>${segments.map(segment =>
      html`<i class="${segment.tone}" style="--v:${Math.min(100, segment.value)}%"></i>`)}</span>`
    : html`<span class="${cx('prg', p.tone || toneOf(v))}" data-c="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" style="--v:${v}%"><i></i>${marks}</span>`;
  return p.size === 'inline' ? html`<span class="prg-inline">${p.label ?? `${v}%`}${bar}</span>` : bar;
}
