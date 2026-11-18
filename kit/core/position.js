/*
 * Positioning for floating layers (menus, tooltips, popovers).
 * Places the layer offset from the anchor on the given side; flips to the other side and shifts along when it would leave the viewport.
 * within (a rect) keeps the layer inside that box along the cross axis too (a menu opened from a side panel stays inside the panel).
 * The returned transformOrigin is the origin for the open scale animation.
 */
export function place(popup, anchorRect, opts = {}) {
  const { side = 'bottom', align = 'start', sideOffset = 4, alignOffset = 0, padding = 5, within } = opts;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const pw = popup.offsetWidth, ph = popup.offsetHeight;
  const a = anchorRect;
  const fits = s => s === 'bottom' ? a.bottom + sideOffset + ph <= vh - padding
    : s === 'top' ? a.top - sideOffset - ph >= padding
    : s === 'right' ? a.right + sideOffset + pw <= vw - padding
    : a.left - sideOffset - pw >= padding;
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  let s = side;
  if (!fits(s) && fits(opposite[s])) s = opposite[s];
  let x, y;
  if (s === 'bottom' || s === 'top') {
    y = s === 'bottom' ? a.bottom + sideOffset : a.top - sideOffset - ph;
    x = align === 'start' ? a.left + alignOffset : align === 'end' ? a.right - pw - alignOffset : a.left + a.width / 2 - pw / 2;
    if (within) x = Math.max(within.left + padding, Math.min(x, within.right - pw - padding));
    x = Math.max(padding, Math.min(x, vw - pw - padding));
    y = Math.max(padding, Math.min(y, vh - ph - padding));
  } else {
    x = s === 'right' ? a.right + sideOffset : a.left - sideOffset - pw;
    y = align === 'start' ? a.top + alignOffset : align === 'end' ? a.bottom - ph - alignOffset : a.top + a.height / 2 - ph / 2;
    y = Math.max(padding, Math.min(y, vh - ph - padding));
    x = Math.max(padding, Math.min(x, vw - pw - padding));
  }
  // Open origin: the anchor's center on the edge facing the anchor
  let ox, oy;
  if (s === 'bottom' || s === 'top') {
    ox = Math.max(0, Math.min(pw, a.left + a.width / 2 - x));
    oy = s === 'bottom' ? 0 : ph;
  } else {
    oy = Math.max(0, Math.min(ph, a.top + a.height / 2 - y));
    ox = s === 'right' ? 0 : pw;
  }
  return { x: Math.round(x), y: Math.round(y), side: s, transformOrigin: `${Math.round(ox)}px ${Math.round(oy)}px` };
}

/* A floating layer that lives inside a container (a timeline's reading, a legend's list) is lifted into the top layer while it shows (the popover
   API, manual: no light dismiss), so no container's overflow, clip or stacking can cut it; it stays in its place in the document, so its styles and
   its events are where they were. place() then gives it viewport coordinates. Without the API it stays where it is. */
export function lift(el) {
  if (!el || typeof el.showPopover !== 'function') return false;
  if (!el.hasAttribute('popover')) { el.setAttribute('popover', 'manual'); el.dataset.lifted = ''; }
  if (!el.matches(':popover-open')) el.showPopover();
  return true;
}
export function drop(el) { if (el?.matches?.(':popover-open')) el.hidePopover(); }
