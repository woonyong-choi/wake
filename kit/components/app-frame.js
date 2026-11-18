/*
 * Window frame: lays out the sidebar and the center (topbar, content cards).
 * The sidebar animates its width, so the center card reflows while it opens or closes;
 * each direction has its own motion token. Their content keeps its full width and is clipped at the window edge.
 * Only the center card (topbar + content) is opaque; the sidebar sits on the window material (the frame background).
 * The card rounds its top and bottom corners (--radius-frame, circular); on the right it meets the window edge and rounds there too.
 * In a narrow window the slots keep their readable width and the frame scrolls horizontally.
 * Split view (measured on the reference): the center holds two cards, each with its own top bar and content, one above the other (h) or side
 * by side (v), with a gap showing the window material; the gap draws nothing and resizes the two cards on hover and drag (--w0..--w2 are the cards' shares).
 * A detail chain adds up to two more side cards (pane 1 and 2): each comes at its share in one frame once its page has drawn; its content slides in.
 * dock: a bottom panel slot (terminal-panel) inside the center card under the panes, so it splits only the center; the sidebar keeps the full window height.
 */
import { html, cx } from '../core/html.js';

export const name = 'app-frame';

export const css = `
.frame { display: flex; height: 100vh; overflow: auto hidden; background: var(--window-material); padding: var(--window-gap) var(--window-gap) var(--window-gap) 0; box-sizing: border-box; } /* every card sits a gap in from the window's edges (the same gap as between cards), so its corners never meet the window's own */
.frame.sidebar-hidden { padding-left: var(--window-gap); }
.frame-sidebar { flex: none; width: var(--sidebar-w); transition: width var(--motion-sidebar-show-dur) var(--motion-sidebar-show-ease), visibility 0s; }
.frame.sidebar-hidden > .frame-sidebar { width: 0; visibility: hidden; transition: width var(--motion-sidebar-hide-dur) var(--motion-sidebar-hide-ease), visibility 0s linear var(--motion-sidebar-hide-dur); }
.frame-sidebar { min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.frame-sidebar > * { width: var(--sidebar-w); flex: 1; min-height: 0; }
.frame-main { --frame-l: var(--r-window); --frame-r: var(--r-window); flex: 1; display: flex; flex-direction: column; min-width: var(--content-min-w); min-height: 0; background: var(--content); border-radius: var(--frame-l) var(--frame-r) var(--frame-r) var(--frame-l); corner-shape: var(--corner-round); box-shadow: var(--shadow-frame); position: relative; z-index: var(--z-content); }
.frame-main.bare { background: transparent; box-shadow: none; } /* a page that lays out its own card on the window ground (settings: nav beside the card) */
.frame-content { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; }
.frame-tool-status { display: grid; flex: 1; place-items: center; }
.frame-panes { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.frame-pane { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
.frame-pane[data-pane="1"], .frame-pane[data-pane="2"], .split-handle { display: none; } /* quality:instant: the second pane comes with the split (the views are placed again at once) */
.frame-main.split { background: transparent; box-shadow: none; }
.frame-main.split.v > .frame-panes { flex-direction: row; }
.frame-main.split > .frame-panes { overflow-x: clip; }
.frame-main.split > .frame-panes > .frame-pane { display: flex; background: var(--content); border-radius: var(--r-window); corner-shape: var(--corner-round); box-shadow: var(--shadow-frame); }
.frame-main.split > .frame-panes > .frame-pane[data-pane="0"] { flex: var(--w0, var(--split-ratio)) 1 0; z-index: var(--z-content); } /* the browser host places the second tab's frame from here over the second pane */
.frame-main.split > .frame-panes > .frame-pane[data-pane="1"] { flex: var(--w1, calc(1 - var(--split-ratio))) 1 0; }
.frame-main.split > .frame-panes > .frame-pane[data-pane="2"] { flex: var(--w2, 0) 1 0; display: none; } /* quality:instant: the third card comes with the chain (the views are placed again at once) */
.frame-main.split.cols-3 > .frame-panes > .frame-pane[data-pane="2"] { display: flex; }
/* a card comes and goes at its share in one frame (quality:instant, sim): only its content slides in, inside the card's own page */
.frame-main.split > .frame-panes > .frame-pane { min-width: 0; }
/* a detail split: the list on the left, its detail (and the detail it opened) to the right, side by side; expanded, the detail takes the whole center */
/* expanded: the other cards collapse to no width (they stay in the layout: the browser host's page frames are their children) and lose their card and top bar */
.frame-main.split.detail-expanded > .frame-panes > .frame-pane:not(.expanded) { flex: 0 0 0; background: transparent; box-shadow: none; }
.frame-main.split.detail-expanded > .frame-panes > .frame-pane:not(.expanded) > :not(.frame-content), .frame-main.split.detail-expanded > .frame-panes > .split-handle { display: none; } /* quality:instant: the views are placed again at once */
.frame-main.split.detail-expanded > .frame-panes > .frame-pane.expanded { flex: 1 1 0; }
/* the list beside a detail keeps a readable width (its title, scope box and name column); when the list and the detail cannot both keep theirs
   (--pane-list-min + gap + --pane-detail-min), the list folds and the detail takes the center, as expanded (its back and close stay on the detail) */
.frame-main.split.detail > .frame-panes { container: frame-panes / inline-size; }
.frame-main.split.detail > .frame-panes > .frame-pane[data-pane="0"] { min-width: var(--pane-list-min); }
.frame-main.split.detail > .frame-panes > .frame-pane[data-pane="1"] { min-width: min(var(--pane-detail-min), 100%); }
@container frame-panes (width < 728px) { .frame-main.split.detail > .frame-panes > .frame-pane[data-pane="0"], .frame-main.split.detail > .frame-panes > .split-handle[data-split-handle="0"] { display: none; } /* quality:literal: a container or media query cannot read a token (360 + 8 + 360) */ /* quality:instant: the views are placed again at once */
  .frame-main.split.detail > .frame-panes > .frame-pane[data-pane="1"] { flex-grow: calc(var(--w1, 1) * 100); } .frame-main.split.detail > .frame-panes > .frame-pane[data-pane="2"] { flex-grow: calc(var(--w2, 0) * 100); } } /* the cards left share the whole center (shares under 1 would leave room empty) */
.frame-main.split > .frame-panes > .split-handle { display: block; flex: none; height: var(--split-gap); cursor: row-resize; }
.frame-main.split.v > .frame-panes > .split-handle { height: auto; width: var(--g0, var(--split-gap)); cursor: col-resize; }
.frame-main.split.v > .frame-panes > .split-handle[data-split-handle="1"] { width: var(--g1, var(--split-gap)); }
.frame-main.split > .frame-panes > .split-handle[data-split-handle="1"] { display: none; } /* quality:instant: the second gap comes with the third card */
.frame-main.split.cols-3 > .frame-panes > .split-handle[data-split-handle="1"] { display: block; } /* quality:instant: with the third card */
`;

/**
 * @param {{sidebar, topbar, content, sidebarHidden?: boolean, dock?: boolean}} p  dock: a bottom panel slot in the center card
 */
export function render(p) {
  return html`<div class="${cx('frame', p.sidebarHidden && 'sidebar-hidden')}" data-c="app-frame" data-scroll="x">
    <div class="frame-sidebar" data-slot="sidebar">${p.sidebar}</div>
    <div class="frame-main" data-slot="main"><div class="frame-panes"><div class="frame-pane" data-pane="0">${p.topbar}<div class="frame-content" data-slot="content">${p.content}</div></div><div class="split-handle" data-split-handle="0"></div><div class="frame-pane" data-pane="1"><div class="frame-content" data-slot="content2"></div></div><div class="split-handle" data-split-handle="1"></div><div class="frame-pane" data-pane="2"><div class="frame-content" data-slot="content3"></div></div></div>${p.dock ? html`<div class="frame-dock" data-slot="dock"></div>` : ''}</div>
  </div>`;
}
