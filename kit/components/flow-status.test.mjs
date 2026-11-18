import assert from 'node:assert/strict';
import test from 'node:test';
import { body } from './flow-status.js';

/* B3-06: a stop with no output (the agent image is not in this version) showed its cause only next to an output box holding an internal code.
   With the code gone the row still opens for the cause sentence when the flow asks it to (explain), and stays one line otherwise */
test('a_stop_with_no_output_opens_for_its_cause_sentence_only_when_asked', () => {
  const stopped = { steps: [{ id: 'perm', state: 'fail' }], kind: 'error', cause: { raw: 'cannot install' } };
  assert.equal(String(body(stopped)), '', 'a plain stop with no output stays one line');
  const out = String(body({ ...stopped, explain: true }));
  assert.match(out, /fs-cause[^>]*>cannot install</);
  assert.doesNotMatch(out, /data-c="code-block"/, 'no output box');
});
