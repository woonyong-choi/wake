const PRESET_SECONDS = { '15m': 900, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };

function validateCaptureRange(identity) {
  const charts = (identity.charts ?? []).filter(chart => chart.timeAxis);
  if (!charts.length) return;
  const range = identity.range;
  if (!range) throw new Error('missing selected range');
  if (!range.preset && (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.to <= range.from)) throw new Error('invalid selected interval');
  for (const { timeAxis: axis } of charts) {
    if (!Number.isFinite(axis.from) || !Number.isFinite(axis.to) || axis.to <= axis.from) throw new Error('invalid chart interval');
    if (range.preset) {
      const seconds = PRESET_SECONDS[range.preset];
      if (!seconds || Math.abs(axis.to - axis.from - seconds) > 1) throw new Error('selected range and chart interval mismatch');
    } else if (Math.abs(axis.from - range.from) > 1 || (!range.live && Math.abs(axis.to - range.to) > 1)) {
      throw new Error('selected range and chart interval mismatch');
    }
  }
}

module.exports = { validateCaptureRange };
