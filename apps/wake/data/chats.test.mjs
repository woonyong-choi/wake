import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toMarkdown } from './chats.js';

/* an exported answer keeps its own Markdown: the role label is its own line, so a table or a list in the answer stays a table or a list */
test('exported_answer_puts_the_role_label_on_its_own_line_so_a_table_stays_a_table', () => {
  const t = key => ({ 'wake.md.cluster': 'Cluster', 'wake.md.ai': 'AI', 'wake.md.user': 'You' })[key] ?? key;
  const md = toMarkdown({ title: 'Restarts', cluster: 'lab', messages: [{ role: 'user', text: 'which?' }, { role: 'ai', parts: [{ type: 'text', blocks: [{ p: ['| Pod | Restarts |\n|---|---|\n| api | 13 |'] }] }] }] }, t);
  assert.match(md, /\*\*AI\*\*\n\n\| Pod \| Restarts \|\n\|---\|---\|\n\| api \| 13 \|/, 'the table starts a line of its own');
});
