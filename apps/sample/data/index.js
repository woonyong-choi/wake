/* Folio data source: get(key, params) -> Promise, now(key, params) -> value (sample data) */
import * as S from './sample.js';

const read = {
  shelves: () => S.SHELVES.map(s => ({ ...s, count: S.DOCS.filter(d => d.shelf === s.id).length })),
  docs: p => S.DOCS.filter(d => !p?.shelf || p.shelf === 'all' || d.shelf === p.shelf),
  doc: p => S.DOCS.find(d => d.id === p.id),
  goal: () => S.GOAL,
};

export function createDataSource() {
  return {
    now: (key, params) => structuredClone(read[key](params)),
    get: async (key, params) => structuredClone(read[key](params)),
  };
}
