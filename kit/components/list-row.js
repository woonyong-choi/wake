/*
 * List row (inside a settings group): 36 icon tile on the left, title 14 + one-line description 12, trailing extras (badge, more).
 * The same shape serves conversation, tool and history lists. The trailing end is short (a badge, a time, a count) and keeps its
 * size; the description gives way when the row is narrow.
 */
import * as row from './settings-row.js';

export const name = 'list-row';

export const css = ``;

/** @param {{icon?: string, tile?: string, lead?: any, title: string, description?: string, end?: any, action?: string, arg?: any, trail?: 'chevron'|'external', indent?: number, revealText?: boolean}} p
 *  revealText: a cut-off title or description shows in full in a tooltip */
export function render(p) {
  return row.render({ title: p.title, description: p.description, icon: p.icon, tile: p.tile, lead: p.lead, control: p.end, action: p.action, arg: p.arg, trail: p.trail, indent: p.indent, revealText: p.revealText });
}
