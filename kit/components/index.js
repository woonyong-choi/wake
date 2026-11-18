/*
 * Component registry. addAllStyles() puts the CSS into a document, attachAll() attaches behavior.
 * Behaviors talk only through ctx: ctx.emit(name, value), ctx.resolveMenu, ctx.resolveContext, ctx.resolveDialog, ctx.menu, ctx.palette, ctx.toast, ctx.dialog.
 */
import { addStyles } from '../core/style.js';
import * as appFrame from './app-frame.js';
import * as sidebar from './sidebar.js';
import * as section from './section.js';
import * as sectionHeader from './section-header.js';
import * as sidebarRow from './sidebar-row.js';
import * as pinnedTiles from './pinned-tiles.js';
import * as tabPreview from './tab-preview.js';
import * as topbar from './topbar.js';
import * as pathSegmentSwitcher from './path-segment-switcher.js';
import * as contentCard from './content-card.js';
import * as messageList from './message-list.js';
import * as userBubble from './user-bubble.js';
import * as answerText from './answer-text.js';
import * as codeBlock from './code-block.js';
import * as messageTable from './message-table.js';
import * as stepGroup from './step-group.js';
import * as stepRow from './step-row.js';
import * as changeTimeline from './change-timeline.js';
import * as questionPanel from './question-panel.js';
import * as actionRow from './action-row.js';
import * as contextChip from './context-chip.js';
import * as composer from './composer.js';
import * as composerToolbar from './composer-toolbar.js';
import * as toolbarButton from './toolbar-button.js';
import * as menu from './menu.js';
import * as menuItem from './menu-item.js';
import * as submenu from './submenu.js';
import * as popover from './popover.js';
import * as contextMenu from './context-menu.js';
import * as palette from './palette.js';
import * as settingsNav from './settings-nav.js';
import * as settingsSection from './settings-section.js';
import * as settingsGroup from './settings-group.js';
import * as settingsRow from './settings-row.js';
import * as firstRun from './first-run.js';
import * as toggle from './switch.js';
import * as select from './select.js';
import * as splitButton from './split-button.js';
import * as listRow from './list-row.js';
import * as button from './button.js';
import * as iconButton from './icon-button.js';
import * as badge from './badge.js';
import * as kbd from './kbd.js';
import * as dataTable from './data-table.js';
import * as chartCard from './chart-card.js';
import * as chartLayer from './chart-layer.js';
import * as statusFlow from './status-flow.js';
import * as flowGraph from './flow-graph.js';
import * as pillTabs from './pill-tabs.js';
import * as timeRange from './time-range.js';
import * as underlineTabs from './underline-tabs.js';
import * as emptyState from './empty-state.js';
import * as searchInput from './search-input.js';
import * as terminalPanel from './terminal-panel.js';
import * as scrollArea from './scroll-area.js';
import * as tooltip from './tooltip.js';
import * as toast from './toast.js';
import * as skeleton from './skeleton.js';
import * as checkbox from './checkbox.js';
import * as avatar from './avatar.js';
import * as iconStack from './icon-stack.js';
import * as stateMotion from './state-motion.js';
import * as notice from './notice.js';
import * as reportCanvas from './report-canvas.js';
import * as pageHeader from './page-header.js';
import * as progress from './progress.js';
import * as introCard from './intro-card.js';
import * as accordion from './accordion.js';
import * as fileTree from './file-tree.js';
import * as fileViewer from './file-viewer.js';
import * as textInput from './text-input.js';
import * as field from './field.js';
import * as disclosure from './disclosure.js';
import * as dialog from './dialog.js';
import * as shortcut from './shortcut.js';
import * as choiceCards from './choice-cards.js';
import * as windowLook from './window-look.js';
import * as listToolbar from './list-toolbar.js';
import * as recordList from './record-list.js';
import * as statusDot from './status-dot.js';
import * as statusIcon from './status-icon.js';
import * as flowStatus from './flow-status.js';
import * as elapsed from './elapsed.js';
import * as connectionRow from './connection-row.js';
import * as pageColumn from './page-column.js';
import * as layoutGrid from './layout-grid.js';
import * as pager from './pager.js';
import * as subHeader from './sub-header.js';
import * as value from './value.js';
import * as propertyGrid from './property-grid.js';
import * as zoomIndicator from './zoom-indicator.js';
import * as tabGroup from './tab-group.js';
import * as tabChooser from './tab-chooser.js';
import * as detailBar from './detail-bar.js';
import * as summaryBar from './summary-bar.js';
import * as ref from './ref.js';
import * as reasoningChain from './reasoning-chain.js';
import * as verifyCard from './verify-card.js';
import * as actionCompare from './action-compare.js';
import * as approvalHead from './approval-head.js';
import * as headLines from './head-lines.js';
import * as sourceChips from './source-chips.js';
import * as logView from './log-view.js';
import * as rowList from './row-list.js';
import * as queryLine from './query-line.js';
import * as staleLine from './stale-line.js';
import * as aiApplied from './ai-applied.js';

export const components = {
  appFrame, sidebar, section, sectionHeader, sidebarRow, pinnedTiles, tabPreview, topbar, pathSegmentSwitcher, contentCard,
  messageList, userBubble, answerText, codeBlock, messageTable, stepGroup, stepRow, summaryBar, changeTimeline, questionPanel, actionRow, contextChip,
  composer, composerToolbar, toolbarButton, menu, menuItem, submenu, popover, contextMenu, palette, settingsNav, settingsSection,
  settingsGroup, settingsRow, toggle, select, splitButton, listRow, button, iconButton, badge, kbd, dataTable,
  chartCard, chartLayer, statusFlow, flowGraph, pillTabs, timeRange, underlineTabs, emptyState, searchInput, scrollArea, tooltip, toast, skeleton,
  checkbox, avatar, iconStack, stateMotion, notice, reportCanvas, pageHeader, progress, introCard, accordion, fileTree, fileViewer, textInput, field, disclosure, dialog, shortcut, choiceCards, windowLook, listToolbar, recordList, statusDot, statusIcon, flowStatus, elapsed, connectionRow, pageColumn, layoutGrid, pager, subHeader, value, propertyGrid, zoomIndicator, tabGroup, tabChooser, firstRun, terminalPanel, detailBar,
  ref, reasoningChain, verifyCard, actionCompare, approvalHead, headLines, sourceChips, logView, rowList, queryLine, staleLine, aiApplied,
};

export function addAllStyles(doc = document) { addStyles(Object.values(components), doc); }

/**
 * Attach behavior. ctx: { emit(name, payload, opts), resolveMenu(id, arg, el), resolveContext(kind, arg, el), resolveDialog?(id, arg, el), resolvePreview?(tabId), nativeMenu?, nativeSurface?(def, pos), openSide?(def, rect), closeSide?(), onOverlay?(on, el, { focus, owner }) }
 * The returned ctx gains the menu, palette, toast and dialog APIs. kit.dialog.* actions and the dialog's select lists are served by the dialog.
 */
export function attachAll(root, ctx) {
  const emit = ctx.emit, resolveMenu = ctx.resolveMenu;
  ctx.emit = (name, payload = {}, opts) => (name.startsWith('kit.dialog.') && ctx.dialog.handle(name, payload)) || emit(name, payload, opts);
  ctx.resolveMenu = (id, arg, el) => id === 'kit.dialog.select' ? ctx.dialog.menu(arg) : resolveMenu(id, arg, el);
  ctx.dialog = dialog.attach(root, ctx);
  ctx.menu = menu.attach(root, ctx);
  ctx.palette = palette.attach(root, ctx);
  ctx.toast = toast.attach(root, ctx);
  ctx.notice = notice.attach(root, ctx);
  for (const c of [contextMenu, tooltip, tabPreview, section, sidebarRow, pinnedTiles, toggle, composer, questionPanel, stepGroup, pillTabs, timeRange, underlineTabs, chartCard, chartLayer, summaryBar, scrollArea, accordion, fileTree, disclosure, shortcut, flowGraph, firstRun, searchInput, codeBlock, elapsed, dataTable, connectionRow, propertyGrid, changeTimeline, reportCanvas]) c.attach(root, ctx);
  return ctx;
}
