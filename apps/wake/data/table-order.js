const SEVERITIES = Object.freeze(['critical', 'high', 'warning', 'medium', 'low', 'info', 'none', 'unknown']);

export function compareText(first, second) {
  const a = Array.from(String(first ?? '')), b = Array.from(String(second ?? ''));
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (difference) return difference;
  }
  return a.length - b.length;
}

export function compareResources(first, second, tone = row => row.status?.[0]) {
  const rank = value => value === 'danger' || value === 'error' ? 0 : value === 'warn' ? 1 : 2;
  return rank(tone(first)) - rank(tone(second)) || compareText(first.ns, second.ns) || compareText(first.name, second.name) || compareText(identity(first), identity(second));
}

export function compareHistory(first, second, time = row => row.at) {
  const a = epoch(time(first)), b = epoch(time(second));
  if (a === null || b === null) return Number(a === null) - Number(b === null) || compareText(identity(first), identity(second));
  return b - a || compareText(identity(first), identity(second));
}

export function compareIncidents(first, second) {
  const rank = value => { const index = SEVERITIES.indexOf(value); return index < 0 ? SEVERITIES.length - 1 : index; };
  if (first.result && second.result) return compareHistory(first, second);
  return Number(Boolean(first.result)) - Number(Boolean(second.result)) || rank(first.sev) - rank(second.sev) || compareHistory(first, second);
}

function identity(row) {
  return row.uid ?? row.id ?? row.key ?? `${row.ns ?? ''}/${row.name ?? ''}`;
}

function epoch(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(number) ? number : null;
}
