/*
 * Internal addresses and screens. Addresses look like '<scheme>://<path>' and are never shown to people.
 * route.pattern looks like 'a/:x/b/:y'. Segment values are encoded with encodeURIComponent and read with decodeURIComponent.
 */
export function createRouter(config) {
  const scheme = config.scheme;
  const routes = config.routes.map(r => ({ ...r, parts: r.pattern.split('/') }));
  const strip = address => {
    const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/.exec(address);
    if (!m || m[1] !== scheme) return null;
    const [path, query = ''] = m[2].split('?');
    return { path: path.replace(/\/+$/, ''), query: Object.fromEntries(new URLSearchParams(query)) };
  };
  function parse(address) {
    const s = strip(address);
    if (!s) return null;
    const segs = s.path.split('/');
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (ok) return { route: r, params, query: s.query };
    }
    return { route: null, params: {}, query: s.query, notFound: true };
  }
  function build(routeId, params = {}, query) {
    const r = routes.find(x => x.id === routeId);
    if (!r) throw new Error(`unknown route: ${routeId}`);
    const path = r.parts.map(p => p.startsWith(':') ? encodeURIComponent(params[p.slice(1)] ?? '') : p).join('/');
    const q = query && Object.keys(query).length ? '?' + new URLSearchParams(query) : '';
    return `${scheme}://${path}${q}`;
  }
  const isInternal = address => !!strip(address);
  return { parse, build, isInternal, routes };
}
