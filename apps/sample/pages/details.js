/*
 * Document details (detail page): grouped key and value rows, the same settings-row parts as any detail.
 */
import config from '../app.config.js';
import { bootPage, components as C, html, formatDate, formatPercent } from '../../../kit/page/index.js';

bootPage(config, async ctx => {
  const { t, params, data } = ctx;
  const d = await data.get('doc', params);
  const row = (k, v) => C.settingsRow.render({ title: t(k), control: v, wideControl: true });
  const val = v => C.value.render({ text: String(v) });
  return {
    render: () => html`${C.subHeader.render({ sticky: true, icon: 'document', title: d.title })}
      ${C.pageColumn.render({ width: 'chat', children: html`
        ${C.settingsSection.render({ title: t('folio.d.about'), children: C.settingsGroup.render({ children: [
          row('folio.d.author', val(d.author)), row('folio.d.shelf', val(t(`folio.shelf.${d.shelf}`))), row('folio.d.added', val(formatDate(d.added, { dateStyle: 'long' }))),
          row('folio.d.tags', html`${d.tags.map(x => C.badge.render({ tone: 'neutral', label: x }))}`),
        ] }) })}
        ${C.settingsSection.render({ title: t('folio.d.reading'), children: C.settingsGroup.render({ children: [
          row('folio.d.words', val(t('folio.d.words.value', { count: d.words }))),
          row('folio.d.progress', C.progress.render({ value: d.progress, size: 'inline', tone: 'neutral', label: formatPercent(d.progress / 100) })),
        ] }) })}` })}`,
    meta: () => ({ title: d.title, icon: 'circle-info', context: { icon: 'circle-info', title: d.title, sub: t('folio.details') } }),
  };
});
