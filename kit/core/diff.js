/*
 * Line diff of two texts (longest common subsequence of lines): the result is the diff text the code view reads, each line led by
 * ' ' (in both), '-' (only in before) or '+' (only in after). Equal texts give only ' ' lines.
 */
export function lineDiff(before, after) {
  const a = before === '' ? [] : before.replace(/\n$/, '').split('\n'), b = after === '' ? [] : after.replace(/\n$/, '').split('\n');
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(' ' + a[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push('-' + a[i++]);
    else out.push('+' + b[j++]);
  }
  while (i < n) out.push('-' + a[i++]);
  while (j < m) out.push('+' + b[j++]);
  return out.join('\n');
}
