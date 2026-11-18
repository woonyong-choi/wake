/*
 * kubeconfig exec 인증 명령의 사람 동의(userData/exec-consent.json, 0600). 열쇠는 k8s.cjs execConsentKey(찾은 명령의 실제 경로 + 인자).
 * 동의하지 않은 exec 명령은 실행하지 않는다(k8s.cjs가 needs_consent로 거절). 파일을 못 읽으면 동의 없음으로 본다.
 *   granted(key) -> bool   grant(key, { command, args })
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_ENTRIES = 256;

function createExecConsent({ userData, filename = 'exec-consent.json' }) {
  const file = path.join(userData, filename);
  let cache = null;
  function load() {
    if (cache) return cache;
    try {
      const stat = fs.lstatSync(file);
      /* 다른 사용자 소유이거나 남이 쓸 수 있는 파일의 동의는 믿지 않는다 */
      if (!stat.isFile() || stat.uid !== process.geteuid() || (stat.mode & 0o022)) return (cache = {});
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      cache = value && typeof value === 'object' && !Array.isArray(value) && value.entries && typeof value.entries === 'object' ? value.entries : {};
    } catch { cache = {}; }
    return cache;
  }
  return {
    granted: key => typeof key === 'string' && Object.hasOwn(load(), key),
    grant(key, { command, args }) {
      const entries = { ...load(), [key]: { command: String(command), args: (args || []).map(String), at: new Date().toISOString() } };
      const keys = Object.keys(entries);
      for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete entries[old];
      fs.mkdirSync(userData, { recursive: true });
      const temporary = path.join(userData, `.${filename}-${randomUUID()}.tmp`);
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, entries }, null, 1), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
      cache = entries;
    },
  };
}

module.exports = { createExecConsent };
