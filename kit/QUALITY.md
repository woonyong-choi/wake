# UI quality rules

**Motion tells the state; normal flows run by themselves.** States are shown with natural motion from the shared tokens. When a flow goes
normally the person only watches: steps that are already satisfied fill on their own, a command opens the terminal, runs and closes it,
the row folds and moves to its new group. A flow stops only where it needs the person, and stops there visibly.

**Nothing working is still.** Running, waiting for a response, checking again, watching (files, periodic checks, the network) always
moves (a turning arc, a moving light, a breathing dot). A step or row waiting for the person (failed, needs sign-in, needs install) keeps a
soft ring spreading out until the person acts. Only idle with no work and plain connected states are still.

**Every action shows its state.** An action that does not finish at once on click (connecting a tool or a server, checking, installing, signing in, saving a secret, watching, a trigger) shows pending or running, success, failure (cause and its action), cancelled, waiting for a response and timeout. No silent buttons, no fire-and-forget. An action with ordered steps shows its state in one place, the status group at the row end (`components/flow-status.js`: a short rolling text and one status icon), never a counter. Each action is data: a state table and a step list, drawn by the same kit parts with the same motion.

Checked by `node kit/tools/check-reuse.mjs` (static, `kit/tools/quality.mjs`) on every commit that touches UI. A finding fails the run.

1. **Icons**: one set. UI icons come from the kit icon set through `icon()`; brand logos come from the app brand glyphs. No other inline `<svg>`, except a data drawing (chart, graph) marked `quality:drawing`.
2. **Motion**: every transition and animation takes its time and easing from tokens (`--motion-enter-*`, `--motion-exit-*`, `--motion-stagger`, `--dur-*`, `--ease-*`). Only `0s` and `linear` (a steady loop) are literal. A part that appears or disappears gets an enter and exit transition; one that must switch at once says why with `quality:instant`. Reduced motion shows end states only.
3. **Interaction states**: every clickable part (button, `role="button"`, link, clickable row) has hover, press, focus-visible and, where it can be off, disabled styles.
4. **Raw text**: raw error text (exception messages, command output) appears only under a failed row, in the shared code view with copy, never in a toast, row, description or tooltip.
5. **No fractions for progress**: progress is never shown as `n/m` (no step counters). Steps show their state instead.
6. **States**: every state in a state table (connection flow, check results, footer buttons) has a visible design and a transition into it.
7. **Composition**: every new screen element maps to an existing kit component (settings rows, status icons, the flow status, the terminal panel). No new card or row style.
8. **Terminal and flow status**: both take colors, type, spacing and motion from kit tokens (`--term-*`, `--fs-*`, the motion tokens), in light and dark.
9. **Literals**: component CSS takes sizes from tokens. A px literal fails unless its line says why with `quality:literal` (a container query cannot read a token). Hairlines use `var(--line)` or `var(--hairline)`.
10. **One part per role**: a component that draws a row or a floating surface declares its role, and only the registered parts may draw one (`ROLES` in `tools/quality.mjs`: the settings row and its compositions, the list row, the sidebar row, the step row, the action row, and the one floating surface: menu, menu item, submenu, popover, right-click menu, tooltip). A second part for a role fails.
11. **Every button works**: every `data-action` used by a component or an app has a handler (kit built-in, app action or page action), and no handler is a no-op. A control that cannot work yet is removed, not shown.
12. **Page column**: every in-tab page body is a `pageColumn` of its screen type (home 680, chat and detail 820, list 1040), centered. A page may not set its own column width.
13. **No fractions anywhere**: counts are shown as separate named values (`Ready 2 · Desired 3`), never `2/3`.
14. **Badges**: healthy is an icon only, a named state is a text badge (10% fill), a state still in progress is the spinning status icon with muted words (never a still dot, never colored words).
15. **Focus ring**: keyboard focus draws one 3px ring outside the control (`:focus-visible`, `--focus-w`, `--focus`); text boxes use `--focus-soft` with the focus border; an invalid value uses `--invalid-ring`. A dialog's first control shows the ring when the dialog opens (`data-focus-visible`). Nothing carries a ring at rest or on hover.
16. **No cut outlines**: an element's border box, with any ring it draws, stays inside the box that clips it sideways. Checked by `node kit/tools/check-layout.mjs --app <id>` over the app's `examples.screens` (two widths, both themes).
17. **Visual baseline**: `node kit/tools/check-visual.mjs` renders the gallery (`design/gallery/components.html`) in both themes, every box at rest and with its controls held hovered, focused and pressed, and a tooltip open, and compares each picture with `kit/tools/visual-baseline/`. Any difference fails. Only the maintainer updates and commits baselines, using Linux Chromium. For an intentional change to the look, the integrator runs `node kit/tools/check-visual.mjs --update`, includes the baseline in the same commit and names the changed pictures and the reason in the commit body. On Mac, the integrator compares before and after pictures on the same Mac before merging; temporary baselines are not committed. See the repository AGENTS.md for the comparison procedure.
