import { formatNumber } from '../../../kit/page/index.js';

export function costAddress(cluster, query = {}) {
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value != null && value !== ''));
  return 'wake://cluster/' + encodeURIComponent(cluster) + '/costs' + (params.size ? '?' + params : '');
}

export function costValue(value, currency) {
  if (!Number.isFinite(value)) return '';
  const digits = Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 6 : 2;
  return [formatNumber(value, { maximumFractionDigits: digits }), currency].filter(Boolean).join(' ');
}
