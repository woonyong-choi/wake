/*
 * Tool tab sign-in (main process). An external tool tab has its own persistent session (partition persist:<app>-tool-<id>), so a sign-in
 * done once in the tab is kept across tab close and app restart. An app may also give a tool a token (services hooks.toolHeaders(id),
 * for example from the keychain): its headers are added only to requests whose origin is the tool's own origin, never to any other site
 * the tool page loads, and the value never reaches a page or a log.
 */

/** headers to add for one request, or null: only for the tool's own origin */
function headersFor(url, origin, headersOf) {
  let o; try { o = new URL(url).origin; } catch { return null; }
  if (o !== origin) return null;
  const h = headersOf(); return h && Object.keys(h).length ? h : null;
}
/** on a tool tab's session: add the app's headers to requests to the tool's origin (one listener per session) */
function attachToolAuth(ses, origin, headersOf) {
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    const extra = headersFor(d.url, origin, headersOf);
    cb({ requestHeaders: extra ? { ...d.requestHeaders, ...extra } : d.requestHeaders });
  });
}
module.exports = { attachToolAuth, headersFor };
