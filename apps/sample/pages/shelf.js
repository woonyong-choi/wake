/*
 * Shelf (list page): title with the document count, filter pills by progress, one-line table (title, author, progress, added).
 */
import config from '../app.config.js';
import { bootPage, components as C, html, formatDate, formatPercent } from '../../../kit/page/index.js';

bootPage(config, async ctx => {
  const { t, params, data } = ctx;
  const rows = await data.get('docs', params);
  const st = { filter: 'all' };
  const shown = () => rows.filter(d => st.filter === 'all' || (st.filter === 'open' ? d.progress < 100 : d.progress === 100));
  const columns = [
    { id: 'title', label: t('folio.col.title'), width: '44%', strong: true },
    { id: 'author', label: t('folio.col.author'), width: '24%', muted: true },
    { id: 'progress', label: t('folio.col.progress'), width: '18%', cell: d => C.progress.render({ value: d.progress, size: 'inline', tone: 'neutral', label: formatPercent(d.progress / 100) }) },
    { id: 'added', label: t('folio.col.added'), align: 'center', width: '14%', muted: true, cell: d => formatDate(d.added, { month: 'short', day: 'numeric' }) },
  ];
  const open = id => ctx.api.navigate((ctx.settings()['folio.openIn'] || 'doc') === 'details' ? `folio://doc/${id}/details` : `folio://doc/${id}`);
  return {
    render: () => C.pageColumn.render({ width: 'list', children: html`
      ${C.pageHeader.render({ title: t(`folio.shelf.${params.shelf}`), after: C.badge.count({ value: rows.length }), size: 'sm' })}
      ${C.listToolbar.render({ start: C.pillTabs.render({ id: 'filter', tabs: [
        { id: 'all', label: t('folio.shelf.all'), count: rows.length },
        { id: 'open', label: t('folio.shelf.reading'), count: rows.filter(d => d.progress < 100).length },
        { id: 'done', label: t('folio.shelf.finished'), count: rows.filter(d => d.progress === 100).length },
      ], value: st.filter, action: 'folio.list.filter' }) })}
      ${shown().length ? C.dataTable.render({ columns, rows: shown(), rowKey: 'id', rowAction: 'folio.list.open' }) : C.emptyState.render({ icon: 'book-open', title: t('folio.list.empty') })}` }),
    meta: () => ({ title: t(`folio.shelf.${params.shelf}`), icon: 'book-open', context: { icon: 'book-open', title: t(`folio.shelf.${params.shelf}`), sub: t('folio.list.count', { count: rows.length }) } }),
    actions: {
      'folio.list.filter': a => { st.filter = a.arg; ctx.update(); },
      'folio.list.open': a => open(a.arg),
    },
  };
});
