/*
 * Banned-term scan of one kit file (check-deps rule 3): a term matches as a whole word, case-insensitive, comments included.
 * allow: the entries of kit/tools/banned-allow.json, { file, term, lines }; an entry excuses that term in that file only, on exactly
 * `lines` lines (one more line with the term is a finding again), and only in third-party code kept as published (kit/vendor/).
 */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} file  repo-relative path ('kit/...')
 * @param {string} text  the file's contents
 * @param {Iterable<string>} terms  lower-case terms
 * @param {{file: string, term: string, lines: number}[]} allow
 * @returns {{findings: string[], excused: object[]}}  excused: the allow entries that kept a match out of the findings
 */
export function bannedTerms(file, text, terms, allow = []) {
  const findings = [], excused = new Set(), seen = new Map();
  const patterns = [...terms].map(term => [term, new RegExp(`(^|[^a-z0-9])${esc(term)}($|[^a-z0-9])`, 'i')]);
  text.split('\n').forEach((line, i) => {
    for (const [term, re] of patterns) {
      if (!re.test(line)) continue;
      const entry = allow.find(a => a.file === file && a.term === term && file.startsWith('kit/vendor/'));
      if (entry) { excused.add(entry); seen.set(entry, (seen.get(entry) ?? 0) + 1); } else findings.push(`${file}:${i + 1}: banned term "${term}"`);
    }
  });
  for (const [entry, n] of seen) if (n !== entry.lines) findings.push(`${file}: banned term "${entry.term}" excused on ${entry.lines} line(s), found on ${n}`);
  return { findings, excused: [...excused] };
}
