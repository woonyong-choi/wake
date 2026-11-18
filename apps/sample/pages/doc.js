/*
 * Document (reader page): title, author line, reading progress and the text as plain blocks.
 */
import config from '../app.config.js';
import { bootPage, components as C, html, formatNumber, formatPercent } from '../../../kit/page/index.js';

bootPage(config, async ctx => {
  const { t, params, data } = ctx;
  const d = await data.get('doc', params);
  return {
    render: () => C.pageColumn.render({ width: 'chat', children: html`
      ${C.pageHeader.render({ title: d.title, size: 'home' })}
      ${C.listRow.render({ icon: 'document', title: t('folio.doc.meta', { author: d.author, words: formatNumber(d.words) }), end: C.progress.render({ value: d.progress, size: 'inline', tone: 'neutral', label: formatPercent(d.progress / 100) }) })}
      ${C.answerText.render({ blocks: d.body.map(p => ({ p: [p] })) })}` }),
    meta: () => ({ title: d.title, icon: 'document', context: { icon: 'document', title: d.title, sub: d.author } }),
  };
});
