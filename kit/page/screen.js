/*
 * Screen declaration of a page (createPage may return `screen`): the state the screen reads, which of it the AI may set, its search and range
 * fields and the actions that set one key each. bootPage keeps the state and redraws on every change; the page reads it with ctx.state().
 *   screen = { state: { key: default }, ai?: key[], search?: { key, scope?, reset? }, range?: { key, retention? },
 *              set?: { actionName: [key, 'text'|'pick'|'page'|(payload) => value, reset?] } }
 *   text   the typed value (payload.value, '' when empty)        pick  the chosen id (payload.arg.value ?? payload.arg, as a string)
 *   page   a page number (payload.arg.value ?? payload.arg, as a number)                     reset  keys set back with it ({ page: 1 })
 *   search.scope is the page's own word for where the field looks ('list' filters the screen's list; another word finds across everything): kept, never read here
 * Built-in actions (wired only when the page declares a screen):
 *   kit.screen.search    the search field: sets search.key from the typed value and applies search.reset
 *   kit.screen.range     the time range: sets range.key to the time-range value ({ preset } or { from, to, live })
 *   kit.screen.ai-reset  the AI applied row's chip: puts the key it names back as it was before the AI (ai-applied.js)
 * The AI sets keys with setState(patch, { ai: true }): only the keys in `ai` (and the search key) are taken; each keeps the value it had
 * before the AI first set it, until resetAi(key) puts it back or resetAi() puts them all back.
 */

const READ = {
  text: a => a?.value ?? '',
  pick: a => String(a?.arg?.value ?? a?.arg ?? ''),
  page: a => Number(a?.arg?.value ?? a?.arg),
};

/** @param {{state?: object, ai?: string[], search?: {key: string, scope?: string, reset?: object}, range?: {key: string, retention?: number}, set?: object}} decl */
export function createScreen(decl, update = () => {}) {
  if (!decl || typeof decl !== 'object') throw new TypeError('screen: a declaration object is required');
  const state = structuredClone(decl.state || {});
  const aiKeys = new Set([...(decl.ai || []), ...(decl.search?.key ? [decl.search.key] : [])]);
  const before = new Map(); // key -> the value it had before the AI first set it, in the order the AI set them
  const set = (patch, reset) => { Object.assign(state, patch, reset || {}); update(); };

  const setState = (patch = {}, o = {}) => {
    if (!o.ai) { set(patch); return Object.keys(patch); }
    const taken = Object.keys(patch).filter(k => aiKeys.has(k));
    for (const k of taken) if (!before.has(k)) before.set(k, structuredClone(state[k]));
    set(Object.fromEntries(taken.map(k => [k, patch[k]])));
    return taken;
  };
  const resetAi = key => {
    const keys = key == null ? [...before.keys()] : before.has(key) ? [key] : [];
    if (!keys.length) return false;
    for (const k of keys) { state[k] = before.get(k); before.delete(k); }
    update();
    return true;
  };

  const actions = {};
  for (const [name, entry] of Object.entries(decl.set || {})) {
    const [key, how, reset] = Array.isArray(entry) ? entry : [];
    const read = typeof how === 'function' ? how : READ[how];
    if (typeof key !== 'string' || !read) throw new TypeError(`screen: action ${name} needs [key, 'text'|'pick'|'page', reset?]`);
    actions[name] = a => set({ [key]: read(a) }, reset);
  }
  const builtIn = {
    'kit.screen.search': a => { if (decl.search?.key) set({ [decl.search.key]: READ.text(a) }, decl.search.reset); },
    'kit.screen.range': a => { if (decl.range?.key) set({ [decl.range.key]: a?.preset ? { preset: a.preset } : { from: a?.from, to: a?.to, live: !!a?.live } }); },
    'kit.screen.ai-reset': a => resetAi(a?.arg?.value ?? a?.arg),
  };

  return {
    decl,
    state: () => ({ ...state }),
    setState,
    resetAi,
    /** what the AI set and has not been put back: { key, value, before }[] in the order it was set */
    aiApplied: () => [...before].map(([key, was]) => ({ key, value: state[key], before: was })),
    actions: { ...builtIn, ...actions },
  };
}
