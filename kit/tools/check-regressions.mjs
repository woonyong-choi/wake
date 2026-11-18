export function readRegressionsInPage() {
  const shown = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert]');
  const cells = [...document.querySelectorAll('.dt th, .dt td')].filter(shown);
  const icons = [...document.querySelectorAll('.sti')].filter(shown);
  const failures = [], alignment = [];
  let emptyCells = 0, unmeasuredCells = 0;
  // CSS pixels: allow one border pixel plus subpixel text/layout rounding, never column centering.
  const alignmentTolerance = 2;
  const firstContent = (node, textOnly = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = node.textContent.search(/\S/);
      if (start < 0) return null;
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, node.textContent.trimEnd().length);
      const rect = range.getBoundingClientRect();
      return rect.width && rect.height ? rect.left : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return null;
    if (style.display !== 'contents' && !node.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return null;
    if (node.matches('svg, img, canvas, input, .dt-dot, .dot')) return textOnly ? null : node.getBoundingClientRect().left;
    for (const child of node.childNodes) { const left = firstContent(child, textOnly); if (left !== null) return left; }
    return null;
  };
  const hasValue = node => {
    if (node.nodeType === Node.TEXT_NODE) return /\S/.test(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    if (node.matches('svg, img, canvas, input, .dt-dot, .dot')) return true;
    if (node.childNodes.length) return [...node.childNodes].some(hasValue);
    return node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
  };
  for (const cell of cells) {
    if (!['left', 'start'].includes(getComputedStyle(cell).textAlign)) failures.push({ rule: 'J-105', text: cell.textContent, reason: 'cell alignment' });
    if (cell.matches('td') && cell.colSpan === 1) {
      const header = cell.closest('table').tHead?.rows[0]?.cells[cell.cellIndex];
      const headerLeft = header && shown(header) ? firstContent(header, true) : null;
      const contentLeft = firstContent(cell);
      if (headerLeft !== null && contentLeft !== null) {
        const delta = contentLeft - headerLeft;
        alignment.push({ column: header.textContent.trim(), text: cell.textContent.trim(), headerLeft, contentLeft, delta });
        if (Math.abs(delta) > alignmentTolerance) failures.push({ rule: 'J-105', text: cell.textContent, column: header.textContent.trim(), delta, reason: 'first visible content alignment' });
      } else if ([...cell.childNodes].some(hasValue)) {
        unmeasuredCells++;
      } else {
        emptyCells++;
      }
    }
    if (cell.matches('td.num') && cell.querySelector('.sti, .sti-text')) failures.push({ rule: 'J-109', text: cell.textContent, reason: 'number with status icon' });
  }
  for (const icon of icons) {
    const svg = icon.querySelector('svg');
    if (svg && getComputedStyle(svg).color !== getComputedStyle(icon).color) failures.push({ rule: 'J-104', reason: 'icon color overridden', kind: icon.className });
  }
  for (const icon of document.querySelectorAll('.sti-text.ok:not([data-status-subject])')) {
    if (shown(icon) && icon.textContent.trim()) failures.push({ rule: 'J-104', reason: 'visible normal words', text: icon.textContent });
  }
  for (const group of document.querySelectorAll('.cc-card .sg-card')) {
    if (!shown(group)) continue;
    const style = getComputedStyle(group);
    if (['Top', 'Right', 'Bottom', 'Left'].some(side => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none' && !/rgba\([^)]*,\s*0\)|transparent|\/\s*0\)/.test(style[`border${side}Color`]))) failures.push({ rule: 'J-108', reason: 'settings group border' });
  }
  for (const row of document.querySelectorAll('.pills-fold')) {
    if (!shown(row)) continue;
    const selected = row.querySelector('[aria-selected="true"]');
    if (row.scrollWidth > row.clientWidth + 1 || selected?.hidden) failures.push({ rule: 'B-022', reason: 'tab overflow or hidden selection' });
  }
  return {
    failures, alignment, emptyCells, unmeasuredCells, cells: cells.length, numericCells: cells.filter(cell => cell.matches('td.num')).length,
    icons: icons.map(icon => ({ kind: icon.className, color: getComputedStyle(icon).color, stroke: icon.querySelector('svg') ? getComputedStyle(icon.querySelector('svg')).strokeWidth : null })),
    groups: document.querySelectorAll('.sg-card').length,
  };
}

export function readScrollEndInPage({ scroll = true } = {}) {
  const excluded = '[aria-hidden="true"], .menu, .tip, .sa-bar, svg, [inert], details:not([open]) > :not(summary)';
  let last = null, bottom = 0;
  for (const element of document.querySelectorAll('button,input,textarea,select,td,pre,summary,.sr-row,.pager')) {
    if (element.closest(excluded) || !element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width && rect.height && rect.bottom >= bottom) { last = element; bottom = rect.bottom; }
  }
  if (!last) return { applicable: false };
  const moved = [];
  let wheelTarget = null;
  for (let parent = last.parentElement; parent; parent = parent.parentElement) {
    if (!['auto', 'scroll'].includes(getComputedStyle(parent).overflowY) && parent !== document.scrollingElement) continue;
    if (parent.scrollHeight <= parent.clientHeight + 1) continue;
    if (!wheelTarget) {
      const rect = parent.getBoundingClientRect();
      wheelTarget = { x: rect.x + rect.width / 2, y: Math.max(1, Math.min(innerHeight - 1, rect.y + rect.height / 2)), distance: parent.scrollHeight };
    }
    if (scroll) parent.scrollTop = parent.scrollHeight;
    moved.push({ class: parent.className, top: parent.scrollTop, maximum: parent.scrollHeight - parent.clientHeight });
  }
  const rect = last.getBoundingClientRect();
  let boundary = innerHeight;
  for (let parent = last.parentElement; parent; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowY !== 'visible') boundary = Math.min(boundary, parent.getBoundingClientRect().bottom);
  }
  return { applicable: true, reachable: rect.bottom <= boundary + 1, bottom: rect.bottom, boundary, moved, wheelTarget, last: last.textContent.slice(0, 100) };
}
