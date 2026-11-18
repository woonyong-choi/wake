/*
 * Raw values in one line of code (unused-check rule 1), comments already removed: px lengths other than 0px/1px and color literals
 * (#hex, rgb(), hsl(), oklch(), oklab()). Not raw:
 *   - a line with @media or @container (breakpoints cannot use custom properties);
 *   - an HTML character reference (&#x2014;).
 * A line that only writes out a color the code computed (a canvas pixel read back for a chart engine) is excused one by one in
 * kit/tools/raw-allow.json, { file, line, why }: the exact line text (trimmed); the entry must match exactly one line (unused-check).
 */
const RAW = /(?<![\w.-])(\d*\.?\d+)px\b|#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g;

/** @param {string} line @returns {string[]} the raw values in the line, in order */
export function rawValues(line) {
  if (/@media|@container/.test(line)) return [];
  const out = [];
  for (const m of line.matchAll(RAW)) {
    if (m[1] !== undefined && (parseFloat(m[1]) === 0 || parseFloat(m[1]) === 1)) continue;
    if (/&#x?[0-9a-f]+;?$/i.test(line.slice(0, m.index + m[0].length + 1))) continue;
    out.push(m[0]);
  }
  return out;
}
