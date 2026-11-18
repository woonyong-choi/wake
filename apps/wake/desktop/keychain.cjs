/*
 * 비밀 값 보관: 운영체제 키체인(Electron safeStorage: macOS 키체인, Windows DPAPI, Linux libsecret/kwallet)으로 암호화한 값만 파일에 둔다.
 * 키체인을 쓸 수 없으면(Linux에 키링이 없어 basic_text로 떨어진 경우 포함) 저장을 거절한다. 평문으로 남기지 않는다.
 * 참조 이름(ref)만 설정·kubeconfig 사본에 들어가고, 값은 이 모듈 밖으로 나가지 않는다(get은 메인 프로세스 안에서만 씀).
 * 쓰기는 같은 폴더의 임시 파일(0600)에 쓰고 fsync 뒤 rename(원자적). 파일을 읽을 수 없으면(JSON 깨짐·객체 아님) 그 위에 쓰지 않고
 * kind 'keychain_corrupt'로 거절하며, 처음 한 번 secrets.json.corrupt-<시각> 사본(0600)을 남긴다. 읽기는 아무것도 돌려주지 않는다.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/** @param {{ safeStorage, userData, fsImpl? }} deps  fsImpl: 시험용 fs 대역 */
function createKeychain({ safeStorage, userData, fsImpl = fs }) {
  const file = path.join(userData, 'secrets.json');
  let backedUp = false;
  const corrupt = () => Object.assign(new Error('keychain file unreadable'), { kind: 'keychain_corrupt' });
  /* 읽기: 없으면 {}, 깨졌으면 사본을 한 번 남기고 null */
  const read = () => {
    let text;
    try { text = fsImpl.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    try { const v = JSON.parse(text); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* 아래에서 사본 */ }
    if (!backedUp) { backedUp = true; const copy = `${file}.corrupt-${Date.now()}`; fsImpl.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL); fsImpl.chmodSync(copy, 0o600); }
    return null;
  };
  const load = () => read() ?? {};
  const loadForWrite = () => { const all = read(); if (!all) throw corrupt(); return all; };
  const save = all => {
    fsImpl.mkdirSync(userData, { recursive: true });
    const tmp = path.join(userData, `.secrets.json-${crypto.randomUUID()}.tmp`);
    const fd = fsImpl.openSync(tmp, 'wx', 0o600);
    try { fsImpl.writeFileSync(fd, JSON.stringify(all)); fsImpl.fsyncSync(fd); } finally { fsImpl.closeSync(fd); }
    try { fsImpl.renameSync(tmp, file); } catch (error) { fsImpl.rmSync(tmp, { force: true }); throw error; }
  };
  const usable = () => {
    if (!safeStorage?.isEncryptionAvailable()) return false;
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') return false;
    return true;
  };
  return {
    usable,
    /** 값을 암호화해 저장하고 참조 이름을 돌려준다 */
    set(value, prefix = 'secret') {
      if (!usable()) throw Object.assign(new Error('keychain unavailable'), { kind: 'keychain' });
      const ref = `wake-keychain:${prefix}:${crypto.randomUUID()}`, all = loadForWrite();
      all[ref] = safeStorage.encryptString(String(value)).toString('base64');
      save(all);
      return ref;
    },
    get(ref) { const v = load()[ref]; if (!v || !usable()) return undefined; return safeStorage.decryptString(Buffer.from(v, 'base64')); },
    has: ref => !!load()[ref],
    delete(ref) { const all = loadForWrite(); if (!Object.hasOwn(all, ref)) return; delete all[ref]; save(all); },
    list: () => Object.keys(load()).map(ref => ({ ref, kind: ref.split(':')[1] })),
  };
}
module.exports = { createKeychain };
