/* 화면 문구가 완성된 제품의 말인지(결정 D-USR-2026-11-18-7): 개발 중 메모·내부 식별자·상태 원어가 사전 값에 남지 않는다.
 * wake.gallery.*는 저장소의 부품 모음 화면(components.html)용이라 패키지에 들어가지 않아 뺀다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ko from './ko.js';
import en from './en.js';

const BANNED = {
  ko: [/확인 전/, /조회 전/, /미검증/, /미설정/, /서비스 호스트/, /아직 (지원|적용)/, /식별 불일치/, /UID(가| 일치|와|별| 근거)/, /숨겨진 도구 모음/],
  en: [/unverified/i, /service host/i, /not (supported|applied) yet/i, /\bUID (match|evidence|changed)|matching UID|Pod UID/, /^Owner /, /Hidden toolbar/, /^Not requested$/, /^not checked$/],
};

test('screen_words_carry_no_development_notes_or_internal_terms', () => {
  const found = [];
  for (const [lang, dict] of [['ko', ko], ['en', en]]) {
    for (const [key, value] of Object.entries(dict)) {
      if (key.startsWith('wake.gallery.') || typeof value !== 'string') continue;
      for (const re of BANNED[lang]) if (re.test(value)) found.push(`${lang} ${key}: ${value}`);
    }
  }
  assert.deepEqual(found, [], 'user-facing words read like a finished product');
});

/* B3-15: the new tab read "New Tab" in its title and "New tab" in the sidebar row: one casing (sentence case, as every English label) */
test('english_new_tab_has_one_casing_across_the_kit_and_the_app', async () => {
  const kit = (await import('../../../kit/locale/en.js')).default;
  const found = [...Object.entries(kit), ...Object.entries(en)].filter(([, v]) => typeof v === 'string' && /New Tab|new Tab/.test(v));
  assert.deepEqual(found, []);
});
