/*
 * AI 연결 확인.
 *   API 키: 키체인에 둔 키로 공급자의 모델 목록을 한 번 읽어 확인(키 오류, 한도·결제, 닿지 않음, 알 수 없음).
 * 모델 목록(models): 연결 확인과 같은 읽기로 공급자의 모델 이름을 돌려준다(Claude API).
 */

async function fetchJson(url, headers = {}, timeout = 8000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, { headers, signal: ctl.signal }); const body = await r.json().catch(() => ({})); return { status: r.status, body }; }
  finally { clearTimeout(t); }
}
const ENDPOINTS = {
  anthropic: key => fetchJson('https://api.anthropic.com/v1/models', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
  openai: key => fetchJson('https://api.openai.com/v1/models', { authorization: `Bearer ${key}` }),
  google: key => fetchJson('https://generativelanguage.googleapis.com/v1beta/models', { 'x-goog-api-key': key }),
};
/** 결과: { state: ok|keyError|quota|unreachable|unknown, models?, error? } */
async function verifyKey(provider, key) {
  try {
    const { status, body } = await ENDPOINTS[provider](key);
    if (status === 200) return { state: 'ok', models: (body.data || body.models || []).length };
    if (status === 400 && /API_KEY_INVALID|API key not valid/.test(JSON.stringify(body))) return { state: 'keyError', error: body?.error?.message || String(status) };
    if (status === 401 || status === 403) return { state: 'keyError', error: body?.error?.message || String(status) };
    if (status === 402 || status === 429) return { state: 'quota', error: body?.error?.message || String(status) };
    return { state: 'unknown', error: `${status} ${JSON.stringify(body).slice(0, 300)}` };
  } catch (e) { return { state: 'unreachable', error: e.name === 'AbortError' ? 'timed out' : String(e.cause?.code || e.message) }; }
}
/** 공급자의 모델 목록: [{ id, label }] (읽지 못하면 오류) */
async function models(provider, key) {
  const { status, body } = await ENDPOINTS[provider](key);
  if (status !== 200) throw Object.assign(new Error(String(status)), { status });
  return (body.data || []).map(m => ({ id: m.id, label: m.display_name || m.id }));
}
module.exports = { verifyKey, models };
