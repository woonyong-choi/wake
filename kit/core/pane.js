/*
 * Card width rules every page shares. The numbers live in tokens (tokens.css), never in a page:
 *   --pane-narrow-w   a card narrower than this (CSS px) shows the compact forms (name over scope, controls as icons)
 *   --trim-max, --trim-head, --trim-tail   a generated name longer than --trim-max characters keeps its first --trim-head and last --trim-tail
 * Without a window (a test) or without the tokens nothing is narrow and nothing is trimmed.
 */
const token = (win, name) => { const value = parseFloat(win.getComputedStyle(win.document.documentElement).getPropertyValue(name)); return Number.isFinite(value) ? value : null; };
const defaultWindow = () => (typeof window === 'undefined' ? null : window);

/* a length token in px (--fl-label-under-max: 116px is 116); null without a window or without the token */
export function tokenPx(name, win = defaultWindow()) {
  const own = win ? token(win, name) : null;
  if (own != null) return own;
  const value = parseFloat(source?.(name));
  return Number.isFinite(value) ? value : null;
}

/* a test has no window: it gives the token values from the token file instead (useTokenSource, public through kit/page/index.js) */
let source = null;
export function useTokenSource(read) { source = read; }

export function paneNarrow(win = defaultWindow()) {
  if (!win) return false;
  const limit = token(win, '--pane-narrow-w');
  return limit != null && win.innerWidth < limit;
}

/* the start and the end of a long name: the end tells generated copies apart (checkout-756cc4…-rfr8b) */
export function trimMiddle(text, win = defaultWindow()) {
  const value = String(text ?? '');
  if (!win) return value;
  const max = token(win, '--trim-max'), head = token(win, '--trim-head'), tail = token(win, '--trim-tail');
  return max == null || head == null || tail == null || value.length <= max ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
