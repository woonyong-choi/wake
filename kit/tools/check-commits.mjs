#!/usr/bin/env node
/*
 * Commit check: every commit in a range has the right message form, the configured author and committer, no AI authoring traces,
 * no banned names and no secrets in what it adds. Run before every push (and by the integrator after every merge).
 * Exit code 1 on any finding.
 *   node kit/tools/check-commits.mjs [--range <rev-range>]   default: origin/main..HEAD
 *
 * Settings (kept out of the repository):
 *  - identity: author email must match git config user.email; committer email may also be noreply@github.com. Names may differ.
 *  - banned names: one name per line in the required file named by KIT_BANNED_NAMES. No default file is read.
 *    Matched case-sensitively in messages and added lines (so an HTML element of the same spelling in lower case is not a match).
 *    A missing file is reported as a finding.
 * This file is left out of the added-line scan because it lists the patterns it looks for.
 * Secret patterns skip lines that say they hold an example, fake, dummy or test value.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/\n$/, '');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

const range = arg('--range') || 'origin/main..HEAD';
const commits = git('rev-list', '--reverse', range).split('\n').filter(Boolean);

const findings = [];
const email = git('config', 'user.email');
const bannedFile = process.env.KIT_BANNED_NAMES;
let banned = null;
if (!bannedFile) findings.push('KIT_BANNED_NAMES must name a banned names file');
else {
  try { banned = readFileSync(bannedFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean); }
  catch (error) { findings.push(`cannot read KIT_BANNED_NAMES file (${error.code})`); }
}

const TYPES = 'feat|fix|docs|chore|refactor|test|perf|style|build|ci|revert';
const SUBJECT = new RegExp(`^(?:${TYPES})\\([a-z][a-z0-9-]*\\)!?: (.+)$`, 'u');
const ENDING = /(?:\ucd94\uac00|\uc81c\uac70|\uc218\uc815|\ubcc0\uacbd|\uac1c\uc120|\ubd84\ub9ac|\ud1b5\ud569|\uc774\ub3d9|\uc815\ub9ac|\uac31\uc2e0|\uc801\uc6a9|\ub3c4\uc785|\ub418\ub3cc\ub9bc)$/u;
const AI = [/co-authored-by:/i, /generated with/i, /claude-session/i, /claude\.ai\/code/i, /noreply@anthropic\.com/i, /\u{1F916}/u];
const SECRET = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'], [/\bgh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, 'Slack token'], [/\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}/, 'API key'], [/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/, 'Slack webhook'],
  [/\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'JWT'],
];
const has = (text, list) => list.find(n => text.includes(n));
const TRAILER = [/^\+\s*co-authored-by:.*<[^>]+@[^>]+>/im, /generated with \[/i, /claude-session:/i, /claude\.ai\/code\/session/i];
const PLACEHOLDER = /example|fake|dummy|sample|test|placeholder|xxxx/i;

for (const c of commits) {
  const short = c.slice(0, 7);
  const [ae, ce] = git('show', '-s', '--format=%ae%x00%ce', c).split('\0');
  const msg = git('show', '-s', '--format=%B', c);
  const subject = msg.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u)
    .find(l => /[^\p{White_Space}\x1c-\x1f]/u.test(l) && !l.startsWith('#')) || '';
  const description = SUBJECT.exec(subject.replace(/ \(#\p{Decimal_Number}+\)$/u, ''))?.[1] || '';
  if (git('show', '-s', '--format=%P', c).split(' ').length > 1) continue; // merge commits carry no authored content
  if (ae !== email) findings.push(`${short}: author email does not match git config user.email`);
  if (ce !== email && ce !== 'noreply@github.com') findings.push(`${short}: committer email is neither git config user.email nor noreply@github.com`);
  if (!description || [...description].length > 72 || !/[\uAC00-\uD7A3]/u.test(description) || !ENDING.test(description)) {
    findings.push(`${short}: subject must use type(scope): <Korean summary>, at most 72 characters with an approved ending`);
  }
  for (const l of msg.split('\n').slice(1)) if (/^\s*-\s.*\u{B2E4}\.?$/u.test(l)) findings.push(`${short}: body line ends as a sentence, not a noun: ${l.trim()}`);
  for (const re of AI) if (re.test(msg)) findings.push(`${short}: AI authoring trace in message (${re.source})`);
  const added = git('show', '--format=', '--unified=0', '--no-color', c, '--', ':/', ':(exclude,glob)**/check-commits.mjs').split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  const b = banned && (has(msg, banned) || has(added, banned));
  if (b) findings.push(`${short}: banned name in message or added lines`);
  for (const re of TRAILER) if (re.test(added)) findings.push(`${short}: AI authoring trace in added lines (${re.source})`);
  const real = added.split('\n').filter(l => !PLACEHOLDER.test(l)).join('\n');
  for (const [re, what] of SECRET) if (re.test(real)) findings.push(`${short}: possible ${what} in added lines`);
}

if (findings.length) { console.log(findings.map(f => `- ${f}`).join('\n')); console.log(`check-commits: ${findings.length} finding(s) in ${commits.length} commit(s)`); process.exit(1); }
console.log(`check-commits: ok (${commits.length} commit(s))`);
