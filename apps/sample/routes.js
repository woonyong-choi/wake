/* Folio routes (pure data). The desktop main process and app.config.js both read it */
export const ROUTES = [
  { id: 'shelf', pattern: 'shelf/:shelf', page: 'shelf' },
  { id: 'doc', pattern: 'doc/:id', page: 'doc' },
  { id: 'details', pattern: 'doc/:id/details', page: 'details' },
  { id: 'settings', pattern: 'settings/:page', page: 'settings', kind: 'settings' },
];
