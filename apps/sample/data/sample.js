/* Folio sample library (content, not interface: titles and text stay as written) */
export const SHELVES = [
  { id: 'reading', icon: 'book-open', color: '--grp-green' },
  { id: 'saved', icon: 'bookmark', color: '--grp-blue' },
  { id: 'finished', icon: 'circle-check', color: null },
];

export const DOCS = [
  { id: 'd1', shelf: 'reading', title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', progress: 62, words: 182000, added: '2026-10-02', tags: ['systems', 'databases'],
    body: ['Reliable, scalable and maintainable applications share a few ideas that outlive any single tool.', 'Replication keeps a copy of the same data on several machines; partitioning splits a large dataset into smaller ones.', 'The hard part is deciding what happens when they disagree.'] },
  { id: 'd2', shelf: 'reading', title: 'The Art of Readable Code', author: 'Dustin Boswell', progress: 28, words: 64000, added: '2026-10-19', tags: ['craft'],
    body: ['Code should be written to minimize the time it would take for someone else to understand it.', 'Pack information into names, and make the layout match the meaning.'] },
  { id: 'd3', shelf: 'saved', title: 'A Philosophy of Software Design', author: 'John Ousterhout', progress: 0, words: 58000, added: '2026-10-27', tags: ['design'],
    body: ['Complexity is anything related to the structure of a system that makes it hard to understand and modify.', 'Deep modules hide a lot behind a small interface.'] },
  { id: 'd4', shelf: 'finished', title: 'Refactoring', author: 'Martin Fowler', progress: 100, words: 120000, added: '2026-08-11', tags: ['craft'],
    body: ['Refactoring changes the structure of code without changing what it does.', 'Small steps, each one tested, keep the change safe.'] },
];

export const GOAL = { minutes: 30, today: 18 };
