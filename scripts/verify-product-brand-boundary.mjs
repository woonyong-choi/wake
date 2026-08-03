#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const executeFile = promisify(execFile)
const root = path.resolve(import.meta.dirname, '..')
const legacyTerms = ['kube' + 'heal', 'dev' + 'preview']
const legacy = new RegExp(`\\b(?:${legacyTerms.join('|')})\\b`, 'i')

const { stdout } = await executeFile(
  'git',
  ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'],
  { encoding: 'buffer' },
)
const violations = []
for (const relativePath of stdout.toString('utf8').split('\0').filter(Boolean).sort()) {
  if (relativePath.startsWith('docs/advanced-course-plan/')) continue
  const content = await readFile(path.join(root, relativePath)).catch(() => null)
  if (content === null || content.includes(0)) continue
  const text = content.toString('utf8')
  const match = legacy.exec(`${relativePath}\n${text}`)
  if (!match) continue
  const line = `${relativePath}\n${text}`.slice(0, match.index).split('\n').length - 1
  violations.push(`${relativePath}:${Math.max(1, line)}:${match[0]}`)
}
if (violations.length) {
  process.stderr.write(`${violations.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('product brand boundary check passed\n')
}
