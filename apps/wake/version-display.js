export function formatToolVersion(version) {
  const value = version == null ? '' : String(version);
  return value.replace(/^v*(\d+(?:\.\d+)+(?:-[\w.-]+)?(?:\+[\w.-]+)?)$/i, 'v$1');
}
