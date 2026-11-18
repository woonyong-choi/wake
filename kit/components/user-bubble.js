/*
 * User bubble: right aligned, context chip above (optional), time, copy and edit below on hover.
 */
import { html, cx } from '../core/html.js';
import * as chip from './context-chip.js';
import { t } from '../core/i18n.js';
import { copyButton } from './code-block.js';
import * as iconButton from './icon-button.js';

export const name = 'user-bubble';

export const css = `
.ub { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: var(--ub-gap); margin-bottom: var(--ub-mb); }
.msgs.full .ub { margin-bottom: var(--ub-mb-full); }
.ub-text { background: var(--secondary); color: var(--foreground); border-radius: var(--r-panel); corner-shape: var(--corner-round); padding: var(--ub-py) var(--space-3); max-width: var(--ub-max-w); font-size: var(--text-sm); line-height: var(--leading-sm); white-space: pre-wrap; overflow-wrap: anywhere; }
.ub-acts { position: absolute; right: 0; top: 100%; display: flex; align-items: center; gap: 0; color: var(--muted-foreground); font-size: var(--text-xs); height: var(--control-h-xs); margin-top: calc(-1 * var(--ub-mb) + var(--space-1)); }
.ub-acts .time { margin-right: var(--space-1); }
`;

/** @param {{text: string, time?: string, chip?: object, actions?: boolean}} p */
export function render(p) {
  return html`<div class="ub reveal-host" data-c="user-bubble" data-cb-host>
    ${p.chip ? chip.render({ ...p.chip, raised: true }) : ''}
    <div class="${cx('ub-text')}" data-line>${p.text}</div>
    ${p.actions === false ? '' : html`<div class="ub-acts reveal">${p.time ? html`<span class="time">${p.time}</span>` : ''}${copyButton()}${iconButton.render({ icon: 'pen', tip: t('message.edit'), size: 'xs', iconSize: 'sm', action: 'kit.message.edit', arg: p.text })}</div>`}
  </div>`;
}
