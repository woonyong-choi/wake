import config from '../app.config.js';
import { bootPage, components as C, html, service } from '../../../kit/page/index.js';
import { hms } from './incident-parts.js';
import { clusterNameOf, viewHeader } from './view-parts.js';
import { toolKind } from '../data/tool-kinds.js';

/* API 화면이 있는 도구와 그 기본 경로. 이름과 아이콘은 도구 종류 표(tool-kinds.js) */
const PATHS = { loki: ['/loki/api/v1/labels?since=1h', '/ready'], tempo: ['/api/search?limit=25', '/api/search/tags', '/ready'] };
const TOOLS = Object.fromEntries(Object.entries(PATHS).map(([id, paths]) => [id, { ...toolKind(id), paths }]));

bootPage(config, ctx => {
  const { params, t } = ctx, tool = Object.hasOwn(TOOLS, params.tool) ? TOOLS[params.tool] : null;
  if (!tool) return { render: () => C.emptyState.render({ icon: 'globe', title: t('wake.tool.api.target'),
    action: C.button.render({ label: t('wake.tools.manage'), size: 'sm', variant: 'secondary', action: 'kit.navigate', arg: { address: 'wake://settings/tools' } }) }) };
  const target = { id: params.cluster, kind: params.tool };
  let route = tool.paths[0], accept = 'application/json', result = null, requestError = null, resultRoute = '', receivedAt = '';
  let pending = false, cancelling = false, disposed = false, requestTab = 'params', responseTab = 'body';
  async function send() {
    if (pending || disposed) return;
    route = document.querySelector('[data-field="tool-api-path"]')?.value.trim() || '';
    const sentRoute = route;
    pending = true; requestError = null; ctx.update();
    let reply;
    try { reply = await service('tool.query', { ...target, route: sentRoute, accept }); }
    catch { reply = { error: 'connection' }; }
    if (disposed) return;
    pending = false; cancelling = false;
    if (!reply || reply.error) requestError = reply?.error || 'connection';
    else {
      result = reply; resultRoute = sentRoute; receivedAt = hms(Date.now()); responseTab = 'body';
      if (reply.status === 401 || reply.status === 403) requestTab = 'auth';
    }
    ctx.update();
  }
  async function cancel() {
    if (!pending || cancelling) return;
    cancelling = true; ctx.update();
    try { await service('tool.query', { ...target, cancel: true }); }
    catch { cancelling = false; if (!disposed) ctx.update(); }
  }
  globalThis.addEventListener('pagehide', () => { disposed = true; }, { once: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing && event.target.matches?.('[data-field="tool-api-path"]')) {
      event.preventDefault(); void send();
    }
  });
  document.addEventListener('change', event => {
    if (event.target.matches?.('[data-field="tool-api-path"]')) {
      route = event.target.value; ctx.update();
    }
  });
  const requestTabs = ['params', 'headers', 'auth'];
  const parameters = () => {
    const queryStart = route.indexOf('?');
    const queryParams = queryStart === -1 ? [] : [...new URLSearchParams(route.slice(queryStart + 1))];
    const rows = queryParams.map(([name, value], id) => ({ id, name, value: C.value.render({ text: value, reveal: true }) }));
    return rows.length ? C.dataTable.render({ rowKey: 'id', rows, columns: [
      { id: 'name', label: t('wake.tool.api.parameter') },
      { id: 'value', label: t('wake.tool.api.value') },
    ] }) : C.value.render({ text: t('wake.tool.api.noParams') });
  };
  const request = () => {
    const sameEndpoint = resultRoute === route && route.split('?')[0] !== '/ready';
    const status = sameEndpoint ? result?.status : null;
    const rejected = status === 401 || status === 403;
    const auth = status === 401 ? 'credentials' : status === 403 ? 'denied'
      : status >= 200 && status < 300 ? 'readAllowed' : 'authUnchecked';
    return C.settingsSection.render({ title: t('wake.tool.api.request'), children: html`
      ${C.listToolbar.render({
        start: C.pillTabs.render({ id: 'tool-api-request', tabs: requestTabs.map(id => ({ id, label: t('wake.tool.api.' + id) })), value: requestTab, action: 'wake.tool.api.requestTab' }),
        end: C.select.render({ label: t('wake.tool.api.presets'), value: t('wake.tool.api.presets'), menu: 'wake.tool.api.presets' }),
      })}
      ${requestTab === 'params' ? parameters() : requestTab === 'headers' ? C.settingsRow.render({
        title: t('wake.tool.api.acceptHeader'), control: C.select.render({ label: t('wake.tool.api.acceptHeader'), value: accept, menu: 'wake.tool.api.accept', disabled: pending }),
      }) : C.settingsRow.render({
        title: t('wake.tool.api.' + auth), description: t('wake.tool.api.authMode'), revealText: true,
        lead: C.statusIcon.render({ kind: rejected ? 'perm' : auth === 'readAllowed' ? 'ok' : 'unknown' }),
        control: rejected ? C.button.render({ label: t('wake.home.tools'), size: 'sm', variant: 'secondary', action: 'kit.navigate',
          arg: { address: 'wake://cluster/' + encodeURIComponent(params.cluster) } }) : null,
      })}` });
  };
  const response = () => {
    /* 'target' = 이 페이지/소유자/대상 검증 실패(네트워크 아님). 모르는 코드는 연결 문제로 취급 */
    if (requestError === 'unconfigured') return C.emptyState.render({ icon: tool.icon, plainIcon: true, title: t('wake.tool.api.unconfigured'),
      action: C.button.render({ label: t('wake.tools.manage'), size: 'sm', variant: 'secondary', action: 'kit.navigate', arg: { address: 'wake://settings/tools' } }) });
    const errorKey = ['target', 'header', 'route', 'permission', 'busy', 'timeout', 'cancelled'].includes(requestError) ? requestError : 'connection';
    const notice = requestError ? C.statusIcon.render({ kind: requestError === 'cancelled' ? 'idle' : 'error', text: t('wake.tool.api.' + (errorKey === 'target' ? 'targetRejected' : errorKey)) }) : '';
    if (!result) return notice || C.emptyState.render({ icon: tool.icon, plainIcon: true, title: t(pending ? 'wake.res.loading' : 'wake.tool.api.emptyHint') });
    const json = /\bjson\b/i.test(result.type || '');
    let body = result.body;
    if (json && !result.truncated) {
      try { body = JSON.stringify(JSON.parse(body), null, 2); } catch { /* Keep the server's text. */ }
    }
    return html`${notice}${C.listToolbar.render({
      start: C.pillTabs.render({ id: 'tool-api-response', tabs: [{ id: 'body', label: t('wake.tool.api.body') }, { id: 'headers', label: t('wake.tool.api.headers') }], value: responseTab, action: 'wake.tool.api.tab' }),
      end: html`${pending ? C.statusIcon.render({ kind: 'busy', text: t('wake.res.loading') }) : ''}${C.badge.render({ label: `HTTP ${result.status}`, tone: result.status < 300 ? 'ok' : 'danger' })}${C.value.render({ text: `${result.elapsedMs} ms · ${result.bytes} B` })}`,
    })}${(pending || requestError || resultRoute !== route) ? C.value.render({ text: [t('wake.tool.api.lastResponse'), receivedAt, resultRoute].join(' · '), reveal: true }) : ''}${result.truncated ? C.value.render({ text: t('wake.tool.api.truncated') }) : ''}${C.codeBlock.render({ text: responseTab === 'headers' ? Object.entries(result.headers).map(([name, value]) => name + ': ' + value).join('\n') : body, syntax: responseTab === 'body' && json ? 'json' : undefined, fold: false, wrap: true, scroll: true })}`;
  };
  return {
    meta: () => ({ title: tool.name + ' API', icon: tool.icon }),
    render: () => C.pageColumn.render({ width: 'home', children: html`
      ${viewHeader(tool.icon, tool.name + ' API', [tool.name, clusterNameOf(ctx, params.cluster)])}
      ${requestError === 'unconfigured' && !result ? response() : html`      ${C.listToolbar.render({
        fill: true,
        start: html`${C.badge.render({ label: 'GET', tone: 'neutral' })}${C.textInput.render({ key: 'tool-api-path', label: t('wake.tool.api.path'), value: route })}`,
        end: pending
          ? C.button.render({ label: t('wake.flow.a.cancel'), action: 'wake.tool.api.cancel', variant: 'secondary', disabled: cancelling })
          : C.button.render({ label: t('composer.send'), action: 'wake.tool.api.send', disabled: !ctx.desktop }),
      })}
      ${C.layoutGrid.render({ fit: true, children: html`${request()}${C.settingsSection.render({ title: t('wake.tool.api.response'), children: response() })}` })}`}` }),
    menus: {
      'wake.tool.api.presets': () => C.select.menuDef({ options: tool.paths.map(id => ({ id, label: { raw: id.split('?')[0] } })), value: route, action: 'wake.tool.api.preset' }),
      'wake.tool.api.accept': () => C.select.menuDef({ options: ['application/json', '*/*'].map(id => ({ id, label: { raw: id } })), value: accept, action: 'wake.tool.api.setAccept' }),
    },
    actions: {
      'wake.tool.api.send': () => send(),
      'wake.tool.api.preset': ({ arg }) => { if (tool.paths.includes(arg.value)) { route = arg.value; ctx.update(); } },
      'wake.tool.api.cancel': () => cancel(),
      'wake.tool.api.setAccept': ({ arg }) => { if (!pending) { accept = arg.value; ctx.update(); } },
      'wake.tool.api.requestTab': ({ arg }) => { requestTab = arg; ctx.update(); },
      'wake.tool.api.tab': ({ arg }) => { responseTab = arg; ctx.update(); },
    },
  };
});
