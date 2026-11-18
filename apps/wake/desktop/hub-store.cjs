/*
 * 허브 로컬 저장소(spec/backend.md#F-BE-010): userData/hub 아래 한 곳(폴더 0700, 파일 0600)에 인시던트, 근거 스냅샷, 감사 기록, 승인, AI 대화,
 * AI 연결 클라이언트, 도구 항목 목록을 둔다. 의존성 없이 JSON과 JSONL만 쓴다.
 *   log(name)  덧붙이기만 하는 기록(JSONL 한 줄에 한 행: 감사 기록, 근거 스냅샷)
 *   docs(name) id로 고치는 문서 묶음(JSON 한 파일: 인시던트, 승인, 대화, 클라이언트). 쓰기는 임시 파일 + rename(원자적)
 * 보관 정책(spec/data-policy.md, data-policy.cjs): 묶음 이름마다 선언한 등급·모양·기간·크기 상한을 따른다. 선언 없는 이름은 열지 않는다.
 * 무엇이든 저장하기 전에 글 값 전부를 maskText(data/mask.js)로 가리고(가린 수는 그 행의 masked), 저장 금지 검사(guard)에 걸리면 쓰지 않고 never_store로 던진다.
 * prune()은 기간(RULE-RETENTION, wake.archive.keep), 인시던트를 따라 남는 행, cache·reference의 크기 상한(오래된 행부터)을 적용하고 파일을 다시 쓴다(압축).
 * 경계 시각의 행은 남긴다. log 덧붙이기가 상한의 1.25배를 넘기면 그 자리에서 정리한다.
 * 식별 필드(id, cluster, scope, target, incident, contextId)는 가리지 않는다(K-01): eksctl context 이름(admin@prod.us-west-2.eksctl.io)이 이메일처럼 가려지면 행을 찾을 수 없다.
 * 문서 파일이 깨졌으면(K-12) 그 내용을 <이름>.json.corrupt-<해시>로 옮겨 두고, 그 묶음 쓰기를 store_corrupt로 거절한다(빈 묶음으로 덮어써 남은 기록을 잃지 않게).
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { POLICY, ARCHIVE_DAYS, DAY, guard, policyOf } = require('./data-policy.cjs');

const RETENTION_DAYS = ARCHIVE_DAYS;
const NAME = /^[a-z][a-z0-9-]{0,40}$/;
const OPEN_PHASES = new Set(['open', 'mitigated']);
/* 인시던트가 먼저: 다른 archive 행은 정리 뒤 남은 인시던트를 본다 */
const ORDER = name => (name === 'incidents' ? 0 : 1);

const IDENT = new Set(['id', 'cluster', 'scope', 'target', 'incident', 'contextId']);
/** 글 값 전부를 가린 사본과 가린 수(키 이름은 그대로, 식별 필드는 그대로) */
function maskDeep(value, maskText) {
  let n = 0;
  const walk = v => {
    if (typeof v === 'string') { const r = maskText(v); n += r.n; return r.text; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, IDENT.has(k) ? x : walk(x)]));
    return v;
  };
  return { value: walk(value), n };
}

function writeAtomic(file, text) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}.tmp`);
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } catch (error) { fs.rmSync(tmp, { force: true }); throw error; }
  /* 이름 바꾸기도 디스크에 남도록 폴더를 fsync(지원하지 않는 파일 시스템은 넘어감) */
  try { const d = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { /* 폴더 fsync 미지원 */ }
}
const refuse = (name, found) => Object.assign(new Error(`never_store: ${name} ${found.reason} at ${found.at}`), { kind: 'never_store', reason: found.reason, at: found.at, collection: name });
const sizeOf = file => { try { return fs.statSync(file).size; } catch (e) { if (e.code === 'ENOENT') return 0; throw e; } };

/** policy: 시험 전용 덮어쓰기({ 이름: 정책 }) */
function createHubStore({ userData, maskText, now = Date.now, policy = {} }) {
  if (typeof maskText !== 'function') throw new TypeError('maskText required');
  const dir = path.join(userData, 'hub');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const declared = name => { if (!NAME.test(name)) throw new Error(`invalid collection: ${name}`); return policyOf(name, policy); };
  const file = (name, ext) => path.join(dir, `${name}.${ext}`);
  /** 이 시각보다 이른 행은 기간 밖(null: 기간으로 지우지 않음) */
  function cutoff(name) {
    const p = declared(name);
    if (p.days === null) return null;
    if (p.days !== 'setting') return now() - p.days * DAY;
    let settings;
    try { settings = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') return null;
    }
    const selected = String(settings?.['wake.archive.keep'] ?? '365');
    if (selected === '0') return null;
    return now() - (selected === '90' ? 90 : 365) * DAY;
  }
  /* 인시던트의 기준 시각: 해결됐으면 해결 시각, 열린 동안은 보호(Infinity), 단계가 없으면 마지막 저장 시각 */
  const anchorOf = (name, row) => {
    if (declared(name).anchor !== 'incident') return row.at;
    if (OPEN_PHASES.has(row.phase)) return row.orphanedAt ?? Infinity;
    return row.phase === 'resolved' ? row.resolvedAt ?? row.at : row.at;
  };
  const logs = new Map(), docSets = new Map();
  /* withIncident 행이 기대는 인시던트 id(정리 순서상 인시던트를 먼저 정리한 뒤 읽음) */
  const liveIncidents = () => new Set(Object.keys(readDocs(file('incidents', 'json'))));
  const keepRow = (name, before, live) => row => {
    if (before === null) return true;
    if (declared(name).withIncident && row.incident && live.has(row.incident)) return true;
    return !(anchorOf(name, row) < before);
  };
  /* 크기 상한: 오래된(at) 행부터 빼서 직렬화 크기가 상한 안에 들 때까지 */
  function fit(rows, maxBytes, bytesOf) {
    if (!maxBytes) return rows;
    let total = rows.reduce((a, r) => a + bytesOf(r), 0);
    const sorted = [...rows].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)), drop = new Set();
    for (const r of sorted) { if (total <= maxBytes) break; drop.add(r); total -= bytesOf(r); }
    return rows.filter(r => !drop.has(r));
  }
  /** 저장 직전 검사: 가린 뒤 값으로(가리기가 지운 것은 통과) */
  function admit(name, value) {
    const found = guard(value, declared(name).recordBytes);
    if (found) throw refuse(name, found);
    return value;
  }

  const readLog = f => { let text; try { text = fs.readFileSync(f, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return text.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); };
  /* 깨진 문서 파일: 내용을 격리 사본으로(같은 내용은 한 번만) 두고 그 파일은 쓰기 거절 */
  const corrupt = new Set();
  function quarantine(f, text) {
    const copy = `${f}.corrupt-${createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
    if (!fs.existsSync(copy)) fs.writeFileSync(copy, text, { mode: 0o600 });
    corrupt.add(f);
  }
  function readDocs(f) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { if (e.code === 'ENOENT') { corrupt.delete(f); return {}; } throw e; }
    let v;
    try { v = JSON.parse(text); } catch (e) { if (!(e instanceof SyntaxError)) throw e; quarantine(f, text); return {}; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { quarantine(f, text); return {}; }
    corrupt.delete(f);
    return v;
  }
  const writable = (name, f) => { if (corrupt.has(f) || (fs.existsSync(f) && (readDocs(f), corrupt.has(f)))) throw Object.assign(new Error(`store_corrupt: ${name}`), { kind: 'store_corrupt', collection: name }); };

  function log(name) {
    if (logs.has(name)) return logs.get(name);
    const p = declared(name);
    if (p.shape !== 'log') throw new Error(`collection ${name} is declared as ${p.shape}`);
    const f = file(name, 'jsonl'), read = () => readLog(f);
    const write = rows => writeAtomic(f, rows.map(r => JSON.stringify(r) + '\n').join(''));
    const api = {
      /** 가린 뒤 한 줄 덧붙임: 저장한 행(id, at, masked 포함). 저장 금지 값이면 never_store로 던지고 쓰지 않음 */
      append(record) {
        const { value, n } = maskDeep(record, maskText);
        const row = admit(name, { id: value.id ?? randomUUID(), at: value.at ?? now(), ...value, masked: (value.masked || 0) + n });
        fs.appendFileSync(f, JSON.stringify(row) + '\n', { mode: 0o600 });
        if (p.maxBytes && sizeOf(f) > p.maxBytes * 1.25) api.prune();
        return row;
      },
      list: (filter = () => true) => read().filter(filter),
      /** 기간·인시던트·크기 상한 정리와 압축: 지운 행 수 */
      prune() {
        const rows = read(), kept = fit(rows.filter(keepRow(name, cutoff(name), p.withIncident ? liveIncidents() : null)), p.maxBytes, r => Buffer.byteLength(JSON.stringify(r)) + 1);
        if (kept.length !== rows.length) write(kept);
        return rows.length - kept.length;
      },
      /** 조건에 맞는 행 지우기(연결 해제·클러스터 삭제): 지운 수 */
      removeWhere(match) { const rows = read(), kept = rows.filter(r => !match(r)); if (kept.length !== rows.length) write(kept); return rows.length - kept.length; },
    };
    logs.set(name, api);
    return api;
  }

  function docs(name) {
    if (docSets.has(name)) return docSets.get(name);
    const p = declared(name);
    if (p.shape !== 'docs') throw new Error(`collection ${name} is declared as ${p.shape}`);
    const f = file(name, 'json'), read = () => readDocs(f);
    const api = {
      get: id => read()[id] ?? null,
      all: () => Object.values(read()),
      /** 가린 뒤 저장(덮어씀): 저장한 문서. 저장 금지 값이면 never_store로 던지고 쓰지 않음 */
      put(id, doc) {
        writable(name, f);
        const { value, n } = maskDeep(doc, maskText), all = read();
        const saved = admit(name, { ...value, id, at: value.at ?? now(), ...(n ? { masked: (value.masked || 0) + n } : {}) });
        all[id] = saved; writeAtomic(f, JSON.stringify(all));
        return saved;
      },
      remove(id) { writable(name, f); const all = read(); if (!(id in all)) return false; delete all[id]; writeAtomic(f, JSON.stringify(all)); return true; },
      prune() {
        if (corrupt.has(f) || (read(), corrupt.has(f))) return 0;
        const all = read(), rows = Object.values(all), keep = keepRow(name, cutoff(name), p.withIncident ? liveIncidents() : null);
        const kept = fit(rows.filter(keep), p.maxBytes, r => Buffer.byteLength(JSON.stringify(r.id)) + Buffer.byteLength(JSON.stringify(r)) + 2);
        if (kept.length !== rows.length) writeAtomic(f, JSON.stringify(Object.fromEntries(kept.map(r => [r.id, r]))));
        return rows.length - kept.length;
      },
      removeWhere(match) { writable(name, f); const all = read(), gone = Object.keys(all).filter(id => match(all[id])); for (const id of gone) delete all[id]; if (gone.length) writeAtomic(f, JSON.stringify(all)); return gone.length; },
    };
    docSets.set(name, api);
    return api;
  }

  const collectionOf = name => (declared(name).shape === 'log' ? log(name) : docs(name));
  /* 파일로 있는 묶음(선언된 것만: 선언에서 빠진 옛 파일은 그대로 둔다) */
  const present = () => fs.readdirSync(dir).flatMap(entry => { const m = /^([a-z][a-z0-9-]*)\.(jsonl|json)$/.exec(entry); return m && Object.hasOwn({ ...POLICY, ...policy }, m[1]) ? [m[1]] : []; })
    .sort((a, b) => ORDER(a) - ORDER(b));

  /** 보관 정책 적용(시작할 때와 하루 한 번, hub.cjs): 모든 묶음의 기간·인시던트·크기 상한 정리. 지운 행 수 */
  function prune() {
    let removed = 0;
    for (const name of present()) removed += collectionOf(name).prune();
    return removed;
  }
  /** 도구 연결 해제: 그 클러스터·출처의 cache·reference 행(목록, 출처 확인). archive(근거 스냅샷)는 남는다 */
  function forgetSource(cluster, source) {
    let removed = 0;
    for (const name of present()) {
      const p = declared(name);
      if ((p.class === 'cache' || p.class === 'reference') && p.cluster && p.source) removed += collectionOf(name).removeWhere(r => r[p.cluster] === cluster && r[p.source] === source);
    }
    return removed;
  }
  /** 클러스터 삭제: 그 클러스터의 cache·reference 행 전부. archive는 보관 기간 동안 남고, 열린 인시던트는 그 시각부터 기간을 센다(다시 닫힐 수 없으므로) */
  function forgetCluster(cluster) {
    let removed = 0;
    for (const name of present()) {
      const p = declared(name);
      if ((p.class === 'cache' || p.class === 'reference') && p.cluster) removed += collectionOf(name).removeWhere(r => r[p.cluster] === cluster);
    }
    const incidents = docs('incidents');
    for (const inc of incidents.all()) if (inc.cluster === cluster && OPEN_PHASES.has(inc.phase) && !inc.orphanedAt) incidents.put(inc.id, { ...inc, orphanedAt: now() });
    return removed;
  }
  /** 내 자료 내보내기: archive·config 묶음 전부(이미 가린 값). cache·reference는 원본에서 다시 만들 수 있어 빼고, 저장 금지 값은 처음부터 없다 */
  function exportAll() {
    const collections = {};
    for (const name of present()) {
      const p = declared(name);
      if (p.class !== 'archive' && p.class !== 'config') continue;
      const c = collectionOf(name);
      collections[name] = p.shape === 'log' ? c.list() : c.all();
    }
    return { at: new Date(now()).toISOString(), policy: Object.fromEntries(Object.entries({ ...POLICY, ...policy }).map(([k, v]) => [k, { class: v.class, days: v.days }])), collections };
  }
  /** 내 자료 지우기: 허브 폴더의 파일 전부(선언 밖 옛 파일과 임시 파일 포함). 지운 파일 수 */
  function deleteAll() {
    let n = 0;
    for (const entry of fs.readdirSync(dir)) { fs.rmSync(path.join(dir, entry), { force: true, recursive: true }); n++; }
    return n;
  }
  /** 묶음마다 등급과 크기(설정 화면의 보관 자료, 진단) */
  const stats = () => present().map(name => { const p = declared(name); return { name, class: p.class, bytes: sizeOf(file(name, p.shape === 'log' ? 'jsonl' : 'json')), maxBytes: p.maxBytes, days: p.days }; });

  return { dir, log, docs, prune, forgetSource, forgetCluster, exportAll, deleteAll, stats, mask: value => maskDeep(value, maskText) };
}

module.exports = { createHubStore, RETENTION_DAYS };
