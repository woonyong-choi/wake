/* Wake 화면 조각: kit 구성 요소를 Wake 데이터에 맞춰 묶는 도우미(Wake에만 있는 것) */
import { components as C } from '../../../kit/page/index.js';
import { isLive, KIND_LIST } from '../data/kinds.js';

/** 상태 표시 하나: [색조, 원문, 진행 중] -> 모든 상태는 상태 아이콘을 가짐. 정상(ok)은 아이콘만(원문은 보조 기술용 이름),
    지금 진행 중인 상태는 도는 고리 + 흐린 글자, 그 밖은 그 아이콘 + 상태 색 글자(배지 바탕 없음): warn 주황 삼각형, danger 빨강 원, neutral 회색 빈 원 + 흐린 글자.
    표와 설정형 행이 같음 */
const KIND = { warn: 'warn', danger: 'error', neutral: 'idle' };
export function status([tone, text, live]) {
  if (tone === 'ok') return C.statusIcon.render({ kind: 'ok', label: text });
  if (tone !== 'danger' && (live ?? isLive(tone, text))) return C.statusIcon.render({ kind: 'busy', text });
  return C.statusIcon.render({ kind: KIND[tone] || 'idle', text });
}
function detailAddress(cluster, namespace, plural, name, query) {
  const address = 'wake://' + ['cluster', cluster, 'ns', namespace, plural, name].map(encodeURIComponent).join('/');
  const search = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  return address + (search.size ? '?' + search : '');
}

export function eventAddress(event, cluster, at, eventAt = event.at) {
  return event.ns && event.name && event.uid ? detailAddress(cluster, event.ns, 'events', event.name, { uid: event.uid, at, eventAt }) : '';
}

export function eventSubjectAddress(event, cluster, at, eventAt = event.at) {
  const ref = event.object;
  const kind = KIND_LIST.find(item => item.kind === ref?.kind && (!ref.apiVersion || ref.apiVersion === item.api));
  if (!kind || kind.plural === 'events' || !ref.uid || !ref.name || !kind.cluster && !ref.ns) return '';
  const query = { uid: ref.uid, at, tab: kind.tabs.includes('events') ? 'events' : undefined, event: event.uid, eventAt };
  return detailAddress(cluster, kind.cluster ? '_all' : ref.ns, kind.plural, ref.name, query);
}

/** 사람이 읽는 개수(사용자 지역 형식의 자릿수 구분) */
export const num = n => Number(n).toLocaleString();

/* 사람이 읽는 로컬 시각(YYYY-MM-DD HH:mm:ss). 정확한 UTC 값은 전체 보기(툴팁)로 */
const pad = n => String(n).padStart(2, '0');
export const localTime = value => { const d = new Date(value); return Number.isFinite(d.getTime())
  ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : null; };

/* Kubernetes values people read, shared by every page */
/* a value people read: bytes in Ki as MiB or GiB, a recorded time as date and minutes (the recorded form stays in the YAML) */
export const readableBytes = value => { const m = /^(\d+)Ki$/.exec(value); if (!m) return value; const mib = Number(m[1]) / 1024; return mib >= 1024 ? `${(mib / 1024).toFixed(1)}GiB` : `${Math.round(mib)}MiB`; };
/** 바이트/초 -> MiB/s · KiB/s, 1KiB 아래는 B/s(시뮬레이션 bytes). 네트워크 화면과 상세 Network 막대가 같이 쓴다: 작은 값이 "0 KiB/s"·"0.00MiB/s"로 보이지 않는다 */
export const byteRate = v => { if (v == null) return ''; const { unit, size } = rateUnit(v), x = v / size; return `${size > 1 && x < 10 ? String(Math.round(x * 10) / 10) : Math.round(x)} ${unit}`; }; /* 단위의 10 미만은 소수 한 자리(축·요청 수와 같은 유효 숫자 둘, A3-08) */
/** 표의 한 열: 같은 단위의 값은 같은 소수 자리(그 단위의 값 하나라도 10 미만에서 소수가 필요하면 그 단위 모두 한 자리). 값마다 제 단위(R4-17) */
export const byteRates = values => {
  const digits = {};
  for (const v of values) { if (v == null) continue; const { unit, size } = rateUnit(v), x = v / size; if (size > 1 && x < 10 && Math.round(x * 10) % 10 !== 0) digits[unit] = 1; }
  return v => { if (v == null) return ''; const { unit, size } = rateUnit(v), d = digits[unit] ?? 0; return `${(v / size).toFixed(d)} ${unit}`; };
};
/** 바이트/초 값(차트의 가장 큰 값)에 맞는 단위와 나눌 크기: MiB/s · KiB/s · B/s(byteRate와 같은 경계) */
export const rateUnit = v => (v >= 1048576 ? { unit: 'MiB/s', size: 1048576 } : v >= 1024 ? { unit: 'KiB/s', size: 1024 } : { unit: 'B/s', size: 1 });
/* every recorded time reads as the local date and minutes, as in the event list (the exact UTC value stays in the YAML and in the tooltip) */
export const shownTime = value => localTime(value)?.slice(0, 16) ?? value;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
export const readableFact = f => typeof f.value !== 'string' ? f : /Memory$/.test(f.label) ? { ...f, value: readableBytes(f.value) } : ISO_TIME.test(f.value) ? { ...f, value: shownTime(f.value) } : f;

/* 접힌 펼침(kit disclosure)의 내용은 초점이 가지 않게(inert) 둠: 설정·시작·대화 페이지 */
const disclosures = new WeakSet();
export const withDisclosures = page => ({ ...page, afterRender: root => {
  for (const button of root.querySelectorAll('[data-dsc]')) {
    const sync = () => { button.nextElementSibling.inert = button.getAttribute('aria-expanded') !== 'true'; };
    sync();
    if (!disclosures.has(button)) { disclosures.add(button); button.addEventListener('click', () => setTimeout(sync, 0)); }
  }
  page.afterRender?.(root);
} });
