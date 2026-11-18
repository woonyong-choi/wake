import test from 'node:test';
import assert from 'node:assert/strict';
import { render, summaryItems, TONE, css } from './status-flow.js';

const labels = { listening: 'listening', event: 'event', result: 'result', source: 'source' };
const steps = (...states) => states.map((state, i) => ({ id: 's' + i, label: 'L' + i, icon: 'rocket', state, text: 'text' + i }));
const unit = (id, tone, o = {}) => ({ id, name: id, tool: 'Argo', headline: { tone, text: 'h-' + id }, event: { id: 1, kind: 'git', keyword: 'commit', at: '1m', active: true }, steps: steps('done', 'run', 'idle'), results: [{ id: 'sync', label: 'sync', tone: 'busy', text: 'applying' }, { id: 'health', label: 'health', tone: 'ok', text: 'fine' }], ...o });
const lbl = { apply: 'Apply', hold: 'Hold' };
const decision = { tone: 'warn', title: 'Approve?', text: 'why', actions: [{ id: 'a', label: lbl.apply, variant: 'default', action: 'x.act', arg: { id: 'p', act: 'approve' } }, { id: 'b', label: lbl.hold, action: 'x.act', arg: { id: 'p', act: 'hold' } }] };
const base = { label: 'L', labels, toggle: { action: 'x.open', arg: 'g' }, unit: unit('quiet', 'ok', { source: { repo: 'acme/quiet-deploy', ref: 'main', rev: 'abc' } }) };

test('the closed bar says which GitOps this is, which Git source it follows, what it is doing and how things stand: one unit, no count of others', () => {
  const items = summaryItems({ ...base, unit: unit('p', 'warn', { decision, toolIcon: 'brand-argo', source: { repo: 'acme/p-deploy', ref: 'main', rev: 'abc' } }) });
  assert.deepEqual(items.map(i => i.id), ['lead', 'source', 'job', 'result']);
  assert.equal(items[0].icon, 'brand-argo', 'the tool is its own mark, not its name');
  assert.equal(items[0].label, '');
  assert.equal(items[0].ariaLabel, 'Argo p', 'the name is for a screen reader');
  assert.equal(items[0].value, 'p');
  assert.equal(items[1].value, 'acme/p-deploy · main');
  assert.equal(items[2].value, 'text1', 'the step that is running is what is being done');
  assert.equal(items[2].dot, TONE.busy);
  assert.equal(items[2].dotState, 'run', 'the dot moves as the mark of the line does');
  assert.equal(items[3].value, 'applying · fine', 'the two results are one item');
  assert.equal(items[3].dotState, 'idle', 'the result is still to come while the job goes on');
  assert.equal(items[3].dot, TONE.idle, 'and its dot is as quiet as the last mark of the line is');
  assert.equal(summaryItems({ ...base, unit: unit('a', 'ok') })[0].label, 'Argo', 'without a mark of its own the tool is named');
  assert.equal(summaryItems({ ...base, unit: unit('a', 'ok', { source: undefined }) }).some(i => i.id === 'source'), false, 'a unit with no source says none');
  assert.deepEqual(summaryItems({ ...base, unit: undefined }), []);
});

test('open, the unit is one line: event, steps, result, with no row of other units', () => {
  const m = render({ ...base, open: true }).s;
  assert.match(m, /<details class="sbar"[^>]* open=""[^>]*data-sbar-toggle="x.open"/);
  assert.doesNotMatch(m, /sfl-unit/, 'a card is one GitOps: which one is the page\'s to choose');
  assert.equal((m.match(/class="sfl-node"/g) || []).length, 5, 'the event, the three steps and the result');
  assert.match(m, /data-kind="event" data-state="event" data-tone="busy"/);
  assert.match(m, /data-kind="step" data-state="done" data-tone="ok"/);
  assert.match(m, /data-kind="step" data-state="run" data-tone="busy"/);
  assert.match(m, /data-kind="step" data-state="idle" data-tone="idle"/);
  assert.match(m, /data-kind="end" data-state="idle"/, 'the result is not drawn as reached while the job is still going');
  assert.equal((m.match(/class="sfl-bd"/g) || []).length, 4, 'a band into every node but the first');
});

test('a band is filled once its node is reached, and empty before', () => {
  const m = render({ ...base, open: true }).s;
  const fills = [...m.matchAll(/<i style="--p:(\d)">/g)].map(x => x[1]);
  assert.deepEqual(fills, ['1', '1', '0', '0'], 'event to step 1 and step 1 to 2 are reached; the rest is not');
});

test('a change brings a new ripple: a ripple is keyed by the state it announces, and a step at rest has none', () => {
  const run = render({ ...base, open: true }).s, fail = render({ ...base, open: true, unit: unit('quiet', 'error', { steps: steps('done', 'fail', 'idle') }) }).s;
  assert.match(run, /class="sfl-ripple" data-key="\[&quot;sfl-ripple&quot;,&quot;event&quot;,&quot;e1&quot;\]"/, 'the event');
  assert.match(run, /sfl-ripple&quot;,&quot;step&quot;,&quot;s1&quot;,&quot;run&quot;/);
  assert.match(fail, /sfl-ripple&quot;,&quot;step&quot;,&quot;s1&quot;,&quot;fail&quot;/);
  assert.doesNotMatch(run, /sfl-ripple&quot;,&quot;step&quot;,&quot;s2&quot;/, 'an idle step has no ripple');
});

test('the result is reached when the job has ended, and it takes the state of the worse of its two results', () => {
  const ended = render({ ...base, open: true, unit: unit('quiet', 'error', { steps: steps('done', 'done', 'live'), results: [{ id: 'a', label: 'a', tone: 'ok', text: 'in sync' }, { id: 'b', label: 'b', tone: 'error', text: 'degraded' }] }) }).s;
  assert.match(ended, /data-kind="end" data-state="fail" data-tone="error"/);
  assert.equal((ended.match(/class="sfl-ln"/g) || []).length, 2, 'the two results are two lines of the last card');
  const calm = render({ ...base, open: true, unit: unit('quiet', 'ok', { event: { id: 1, kind: 'git', keyword: 'commit', active: false }, steps: steps('done', 'done', 'live'), results: [{ id: 'a', label: 'a', tone: 'ok', text: 'in sync' }] }) }).s;
  assert.match(calm, /data-kind="event" data-state="live"/);
  assert.match(calm, /data-kind="end" data-state="done"/);
});

test('a step nobody reports on is idle, never done', () => {
  const m = render({ ...base, open: true, unit: unit('quiet', 'ok', { steps: steps('mystery'), event: { id: 1, kind: 'something-new', keyword: 'odd', active: true } }) }).s;
  assert.match(m, /data-kind="step" data-state="idle" data-tone="idle"/);
  assert.doesNotMatch(m, /data-state="mystery"/);
});

test('a decision shows its buttons, each asking the page for its own action', () => {
  const m = render({ ...base, open: true, unit: unit('p', 'warn', { decision }) }).s;
  assert.match(m, /class="sfl-decide"[^>]*data-tone="warn"/);
  assert.match(m, /data-action="x.act" data-arg="\{&quot;id&quot;:&quot;p&quot;,&quot;act&quot;:&quot;approve&quot;\}"/);
  assert.match(m, /data-arg="\{&quot;id&quot;:&quot;p&quot;,&quot;act&quot;:&quot;hold&quot;\}"/);
  assert.equal((render({ ...base, open: true }).s.match(/class="sfl-decide"/g) || []).length, 0);
});

const sec = (id, o = {}) => ({ id, label: 'S-' + id, icon: 'clock', open: false, nodes: [], items: [{ id: 'a', label: 'a', value: '1' }], body: 'BODY-' + id, ...o });
const pts = { label: 'P', preview: { title: 'PV-TITLE', note: 'PV-NOTE', body: 'PV-BODY' }, items: [{ id: 'c1', rev: 'c1', pr: 9, title: 't-now', at: '1h', stat: '+3 −1', result: 'degraded', current: true }, { id: 'c0', rev: 'c0', pr: 8, title: 't-good', at: '1d', result: 'ok', recommended: true }, { id: 'cx', rev: 'cx', pr: 7, title: 't-bad', at: '2d', result: 'fail' }], selected: 'c0', select: 'x.pt',
  scope: { label: 'scope', value: 'all', tabs: [{ id: 'all', label: 'all' }, { id: 'one', label: 'one' }], action: 'x.scope' }, note: 'NOTE', actions: [{ id: 'pr', label: 'PR', variant: 'default', action: 'x.go', arg: { mode: 'pr' } }], labels: { current: 'now', recommended: 'good', fail: 'bad', degraded: 'deg' } };
const withSections = (sections, extra = {}) => ({ ...base, open: true, node: 'x.node', section: 'x.sec', unit: unit('quiet', 'ok', { sections, ...extra }) });

test('a node is a button only where there is something to open: it names its unit and node, and says what it is', () => {
  const m = render(withSections([sec('diff', { nodes: ['s0'] }), sec('log', { nodes: ['s1', 's2'] })])).s;
  assert.equal((m.match(/<button type="button" class="sfl-tile"/g) || []).length, 3, 'the event and the result have nothing to open');
  assert.match(m, /data-action="x.node" data-arg="\{&quot;unit&quot;:&quot;quiet&quot;,&quot;node&quot;:&quot;s1&quot;\}"/);
  assert.match(m, /aria-label="L1: text1"/);
  assert.doesNotMatch(render({ ...base, open: true }).s, /<button type="button" class="sfl-tile"/, 'without the action a node is only drawn');
  assert.doesNotMatch(render(withSections([])).s, /<button type="button" class="sfl-tile"/, 'and without a section neither');
});

test('stacked, the sections are the page\'s closed items: each toggle names the unit and the section, and what the page opened is open', () => {
  const m = render(withSections([sec('diff', { open: true, nodes: ['s0'] }), sec('log', { nodes: ['s1', 's2'] })])).s;
  assert.match(m, /data-sfl-sec="diff"/);
  assert.match(m, /data-sbar-toggle="x.sec" data-sbar-arg="\{&quot;unit&quot;:&quot;quiet&quot;,&quot;id&quot;:&quot;diff&quot;\}"/);
  assert.match(m, /<details class="sbar"[^>]* open=""[^>]*data-sbar-toggle="x.sec"/);
  assert.match(m, /<b>S-diff<\/b>/, 'a closed or open section names itself first, then says its gist');
  assert.doesNotMatch(m, /data-selected/, 'stacked, no node is the selected one');
  assert.doesNotMatch(m, /class="sfl-pane"/);
});

test('selecting, a press on a node shows that node\'s detail under the line, open, and nothing else is stacked', () => {
  const m = render({ ...withSections([sec('diff', { nodes: ['s0'] }), sec('log', { nodes: ['s1', 's2'] })]), detail: 'select', unit: unit('quiet', 'ok', { node: 's1', sections: [sec('diff', { nodes: ['s0'] }), sec('log', { nodes: ['s1', 's2'] })] }) }).s;
  assert.match(m, /data-key="\[&quot;sfl-node&quot;,&quot;step&quot;,&quot;s1&quot;\]"[^>]* data-selected=""/);
  assert.equal((m.match(/data-selected=""/g) || []).length, 1);
  assert.match(m, /class="sfl-pane"/);
  assert.match(m, /data-sfl-sec="log"[\s\S]*BODY-log/);
  assert.doesNotMatch(m, /BODY-diff/, 'the other node\'s detail is not shown');
  assert.equal((m.match(/<details class="sbar"/g) || []).length, 1, 'only the bar itself: no closed item to open first');
});

test('selecting, without a node from the page the one that needs a person or is working is shown, else the result', () => {
  const sections = [sec('diff', { nodes: ['s0'] }), sec('log', { nodes: ['s1'] }), sec('end', { nodes: ['end'] })];
  const shown = u => render({ ...withSections([]), detail: 'select', unit: u }).s.match(/data-sfl-sec="(\w+)"/)?.[1];
  assert.equal(shown(unit('quiet', 'ok', { sections })), 'log', 'the step that runs');
  assert.equal(shown(unit('quiet', 'ok', { sections, steps: steps('done', 'done', 'done') })), 'end');
  assert.equal(shown(unit('quiet', 'ok', { sections, steps: steps('wait', 'idle', 'idle') })), 'diff', 'the step that waits for a person');
});

test('a node is a round mark on the line with its name, what it says and a short line under it', () => {
  const m = render({ ...base, open: true, unit: unit('quiet', 'ok', { steps: [
    { id: 'a', label: 'A', state: 'done', text: 'x' },
    { id: 'b', label: 'B', state: 'run', text: 'x', meta: 'wave 2' },
    { id: 'c', label: 'C', state: 'fail', text: 'x' },
    { id: 'd', label: 'D', state: 'idle', text: 'x' }] }) }).s;
  assert.match(m, /<small>wave 2<\/small>/, 'what the step adds sits under it');
  assert.doesNotMatch(m, /class="(seg|pods|more|nums|bar)"/, 'no figure of marks: never a count drawn as dashes');
  assert.equal((m.match(/class="sfl-lb"/g) || []).length, 6, 'every node has its name');
  assert.match(m, /class="sfl-tile stm" data-motion="fail"/, 'a failed mark moves as every failed state mark does');
  assert.equal((m.match(/class="sfl-tile[^"]*"[^>]*>(?:<i class="sfl-ripple"[^>]*><\/i>)?<svg/g) || []).length, 3, 'the event (its kind), what is done (a tick) and what failed (a cross) say it; a step running or not yet started is drawn by its ring or left empty');
  assert.match(m, /data-icon="check"/); assert.match(m, /data-icon="cross-medium"/);
  assert.doesNotMatch(m, /sfl-bdg/, 'no badge on a mark: the colour of the mark, with the words under it, says how the step is');
});

test('the event mark carries the icon of whoever reported it, a step can carry a few characters in its mark instead of an icon', () => {
  const m = render({ ...base, open: true, unit: unit('quiet', 'ok', { event: { id: 1, kind: 'git', icon: 'bolt', keyword: 'commit', active: true }, steps: [{ id: 'a', label: 'A', glyph: '7', state: 'done', text: 'x' }], resultIcon: 'flag' }) }).s;
  assert.match(m, /data-kind="event"[\s\S]*?data-icon="bolt"/);
  assert.match(m, /<b class="sfl-gl" aria-hidden="true">7<\/b>/);
  assert.doesNotMatch(m, /data-icon="rocket"/, 'the characters take the place of the icon');
  assert.match(m, /data-kind="end"[\s\S]*?data-icon="flag"/);
});

test('a step that is given an icon of its own shows it, and one that waits says so with a clock', () => {
  const m = render({ ...base, open: true, unit: unit('quiet', 'ok', { steps: [{ id: 'a', label: 'A', icon: 'rocket', state: 'done', text: 'x' }, { id: 'b', label: 'B', state: 'wait', text: 'x' }] }) }).s;
  assert.match(m, /data-icon="rocket"/);
  assert.doesNotMatch(m, /data-icon="check"[^>]*>[\s\S]*data-kind="step" data-state="done"/);
  assert.match(m, /data-state="wait"[\s\S]*?data-icon="clock"/);
});

test('the places to go back to are a group of choices: the chosen one, the advised one and the failed ones are marked, and each way back is a button', () => {
  const m = render(withSections([sec('points', { open: true, points: pts })])).s;
  assert.match(m, /role="radiogroup"/);
  assert.equal((m.match(/role="radio"/g) || []).length, 3);
  assert.match(m, /aria-checked="true" data-action="x.pt" data-arg="\{&quot;unit&quot;:&quot;quiet&quot;,&quot;point&quot;:&quot;c0&quot;\}"/);
  assert.equal((m.match(/aria-checked="true"/g) || []).length, 1);
  assert.match(m, />now</); assert.match(m, />good</); assert.match(m, />bad</);
  assert.match(m, /data-action="x.go" data-arg="\{&quot;mode&quot;:&quot;pr&quot;\}"/);
  assert.match(m, /NOTE/);
  assert.match(m, /<span class="sfl-pt-s">\+3 −1<\/span>/, 'a point says how big its change was');
  assert.match(m, /<div class="sfl-pv-h"><b>PV-TITLE<\/b><span>PV-NOTE<\/span><\/div>PV-BODY/, 'what going back would change is shown under the list');
  assert.match(m, /data-tabs="sfl-scope-quiet"/);
});

test('a section can be the latest events of the unit, newest first in the tone of what each was, with how the jobs have gone and how many more the record has', () => {
  const m = render(withSections([sec('events', { events: { items: [{ id: 2, tone: 'error', label: 'broke', detail: 'd1', tool: 'Argo', toolAction: 'x.tool', toolArg: { unit: 'quiet' }, by: 'auto', at: '1m' }, { id: 1, tone: 'ok', label: 'worked' }], summary: [{ id: 'j', label: 'jobs', value: '3', tone: 'idle' }], more: 'MORE-4', empty: 'none' } })])).s;
  assert.equal((m.match(/<li data-key="[^"]*sfl-ev/g) || []).length, 2);
  assert.match(m, /<b>broke<\/b><small>d1<\/small><\/span><span class="w"><button[^>]*data-action="x.tool"[^>]*>[\s\S]*Argo[\s\S]*<\/button><small>auto<\/small><time>1m<\/time>/, 'the tool that did it is a button to its own page, then who, then when, on one line');
  assert.match(m, /class="sfl-ev-sum"[\s\S]*jobs<b>3<\/b>/);
  assert.match(m, /<li class="more"><span class="t"><small>MORE-4<\/small>/);
  assert.match(render(withSections([sec('events', { events: { items: [], empty: 'none-yet' } })])).s, /class="none">none-yet/);
});

test('what can be done to the whole run is offered in its head, whatever state it is in', () => {
  const m = render(withSections([], { actions: [{ id: 'r', label: 'again', icon: 'play', action: 'x.run', arg: { id: 'quiet' } }] })).s;
  assert.match(m, /class="sfl-acts"[\s\S]*data-action="x.run" data-arg="\{&quot;id&quot;:&quot;quiet&quot;\}"/);
  assert.doesNotMatch(render(withSections([])).s, /sfl-acts/);
});

test('the whole record has its own place: the unit only offers the ways to it', () => {
  const m = render(withSections([], { links: [{ id: 'ev', label: 'events', icon: 'clock', action: 'x.view', arg: { view: 'events' } }, { id: 'lg', label: 'logs', action: 'x.view', arg: { view: 'logs' } }] })).s;
  assert.match(m, /class="sfl-links"/);
  assert.match(m, /data-action="x.view" data-arg="\{&quot;view&quot;:&quot;events&quot;\}"/);
  assert.equal((m.match(/class="btn link/g) || []).length, 2);
  assert.doesNotMatch(render(withSections([])).s, /sfl-links/);
});

test('the stylesheet uses tokens only: no colour literal, no length literal outside a token (a container query cannot take one)', () => {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css.replace(/@property[^}]*}/, '').replace(/@container \([^)]*\)/, ''), /[^\w-]\d+(\.\d+)?(px|rem|em)\b/);
});


test('an action the decision offers is shown there only, not again in the head', () => {
  const L = { hold: 'hold-1', check: 'check-1' }; /* words of the test, not of a screen */
  const hold = { id: 'hold', label: L.hold, action: 'x', arg: 1 }, check = { id: 'check', label: L.check, action: 'x', arg: 2 };
  const m = render({ ...base, open: true, unit: unit('quiet', 'ok', { actions: [check, hold], decision: { tone: 'warn', title: 'T', text: 't', actions: [{ ...hold, variant: 'secondary' }] } }) }).s;
  assert.equal((m.match(/>hold-1</g) || []).length, 1, 'once, in the decision');
  assert.match(m, /class="sfl-acts"[\s\S]*check-1/);
  const quiet = render({ ...base, open: true, unit: unit('quiet', 'ok', { actions: [check, hold] }) }).s;
  assert.equal((quiet.match(/>hold-1</g) || []).length, 1, 'without a decision the head keeps it');
});

test('header false: inside a disclosure that names it, the open card draws no title row of its own, its actions stay; by default it draws one', () => {
  const run = [{ id: 'r', label: lbl.hold, action: 'x.run', arg: 1 }];
  const u = unit('quiet', 'ok', { actions: run });
  const plain = render({ ...base, unit: u, open: true }).s;
  assert.match(plain, /<div class="sfl-dh"><h3>quiet<\/h3>/);
  assert.match(plain, /class="sfl-dh-s"[^>]*>h-quiet/);
  const bare = render({ ...base, unit: u, open: true, header: false }).s;
  assert.doesNotMatch(bare, /<h3>quiet<\/h3>|class="sfl-dh-s"/);
  assert.match(bare, /<div class="sfl-dh"><span class="sfl-acts">[\s\S]*Hold/);
  assert.doesNotMatch(render({ ...base, unit: unit('quiet', 'ok'), open: true, header: false }).s, /class="sfl-dh"/, 'nothing left in the row: no row');
});

test('compact is opt-in: the line stays across on a narrow card and its sub lines carry their whole words for a tooltip shown only when cut', () => {
  const plain = String(render({ ...base, open: true })), compact = String(render({ ...base, open: true, compact: true }));
  assert.equal(plain.includes('data-compact'), false, 'without it nothing changes');
  assert.equal(plain.includes('data-tip-overflow'), false);
  assert.ok(compact.includes('data-sfl data-compact'));
  assert.ok(/class="sfl-tx" data-tip="text1" data-tip-overflow=""/.test(compact), 'a step line names its whole words');
  assert.ok(/:not\(\[data-compact\]\) \.sfl-rail \{ grid-template-columns: minmax\(0, 1fr\)/.test(css), 'only the plain line turns into a column when narrow');
});
