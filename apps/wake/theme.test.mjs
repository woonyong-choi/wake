import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }

const css = ['../../kit/tokens.css', './theme.css'].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
/* RULE-TONE: warning words and icons are amber-700 in the light theme and amber-400 in the dark theme */
const AMBER = { light: [0.555, 0.163, 48.998], dark: [0.828, 0.189, 84.429] }; /* lightness, chroma, hue */

test('warning_words_are_amber_700_in_light_and_amber_400_in_dark_on_the_page_body', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    const seen = {};
    for (const theme of ['light', 'dark']) {
      await page.setContent('');
      await page.addStyleTag({ content: css });
      seen[theme] = await page.evaluate(name => {
        document.documentElement.dataset.theme = name; document.body.dataset.kind = 'page';
        const word = document.body.appendChild(document.createElement('span'));
        word.style.color = 'var(--warning-content)';
        return getComputedStyle(word).color;
      }, theme);
    }
    const near = (got, want) => {
      const a = (/\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(got) ?? []).slice(1).map(Number);
      return a.length === 3 && Math.abs(a[0] - want[0]) < 0.005 && Math.abs(a[1] - want[1]) < 0.005 && Math.abs(a[2] - want[2]) < 0.5;
    };
    assert.ok(near(seen.light, AMBER.light) && near(seen.dark, AMBER.dark), `warning words follow amber-700 / amber-400: ${JSON.stringify(seen)}`);
  } finally { await browser.close(); }
});
