/*
 * 로그 발췌(순수 함수). 저장된 근거의 줄에서 찾은 줄과 그 앞뒤만 남긴다. 줄 번호는 원본 번호 그대로이고 다시 매기지 않는다(N15).
 * 빠진 줄은 { gap: 수 } 행 하나로 돌려준다(화면의 "⋯ N줄 생략" 글은 locale이 만든다).
 */

const matcher = key => (key == null || key === '' ? null : key instanceof RegExp ? new RegExp(key.source, key.flags.replace(/[gy]/g, '')) : null);

/**
 * The excerpt of a log: the lines that match and `around` lines on each side, with gap rows between kept lines that are not consecutive.
 *  lines: [{ n, at, level, text, … }] in original order, n the original line number (when absent, the position + 1 in this list);
 *  key: a string (found as written) or a RegExp; level: a level whose lines count as found (e.g. 'ERROR'); around: lines kept on each side.
 * Without key and level every line is kept. Returns { rows: [{ n, …line, hit } | { gap }], hits: [n], total, last (the time of the last hit) }.
 * A gap counts the original lines left out between two kept lines (from their numbers), so a list that was already filtered keeps its true gaps.
 */
export function logExcerpt(lines, { key = null, level = null, around = 2 } = {}) {
  const list = (lines ?? []).map((l, i) => ({ ...l, n: Number.isInteger(l.n) ? l.n : i + 1 }));
  const re = matcher(key), find = !re && key != null && key !== '' ? String(key) : null;
  const all = !re && !find && !level;
  const isHit = l => all || (re ? re.test(l.text ?? '') : false) || (find ? String(l.text ?? '').includes(find) : false) || (level ? l.level === level : false);
  const hitAt = list.map(isHit), keep = new Set();
  hitAt.forEach((h, i) => { if (h) for (let k = Math.max(0, i - around); k <= Math.min(list.length - 1, i + around); k++) keep.add(k); });
  const rows = [];
  let prev = null;
  for (const i of [...keep].sort((a, b) => a - b)) {
    const l = list[i];
    if (prev != null && l.n - prev.n > 1) rows.push({ gap: l.n - prev.n - 1 });
    rows.push({ ...l, hit: hitAt[i] });
    prev = l;
  }
  const hits = list.filter((_, i) => hitAt[i]);
  return { rows, hits: hits.map(l => l.n), total: list.length, last: hits.at(-1)?.at ?? null };
}
