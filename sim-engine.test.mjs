import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, CADENCE, NEED, ME, S1_CRASH, crashTimes, GENERAL_NODES, PROD_NODES, PR_POLICY, DETECT, INC_BASE, burnRate, linksOf, useClock } from './sim-data.js';
import { world, eventSummary, batchRun, nodeGroups, memoryOf, clusterCpu, errorRate, impactNumbers, userImpactOf, evidenceSnapshot, evidenceSeries, prevContainer, logsOf, alertText, incidentList, pastOf, TOOL_LATENCY, DOWN_AT, incOf, netOf } from './sim-world.js';
import { createEngine, incidentStart, verifyCounts, causeStatus } from './sim-engine.js';
import { pvcs, podVolume, actionsFor, planFromOption, ownerApp, jobs } from './sim-gaps.js';
import { T0, hms } from './sim-format.js';

const sc = sid => SCENARIOS.find(x => x.id === sid);
const run = (sid, conn = 'ok') => {
  const S = { ...incidentStart(), conn, cid: 'wake-prod' };
  const E = createEngine({ scenario: () => sc(sid), world: () => world(sid, S.t, E.phase(), S.conn, S.cid), speed: () => 5, sid: () => sid });
  E.bind(S);
  const until = (ph, max = 4000) => { for (let n = 0; E.phase() !== ph && n < max; n++) E.tick(); return E.phase(); };
  return { S, E, until };
};
const approve = ({ E }, pick = 0) => { const o = E.optionsNow().filter(x => !x.disabled)[pick]; assert.ok(E.approve(o.id)); };
const tickN = (r, n) => { for (let i = 0; i < n; i++) r.E.tick(); };
const lineCount = s => Number(String(s).replace(/[^0-9]/g, ''));

test('incident_moves_from_scoping_to_judged_before_any_person_acts', () => {
  const r = run('s1');
  assert.equal(r.E.phase(), 'idle');
  assert.equal(r.until('judged'), 'judged');
  assert.ok(r.S.t >= r.E.judgedAt());
});

test('quiet_day_only_moves_the_clock', () => {
  const r = run('s7'), t0 = r.S.t;
  r.E.tick(); r.E.tick();
  assert.equal(r.E.phase(), 'quiet');
  assert.equal(r.S.t, t0 + 2);
});

test('approved_pr_is_reviewed_by_someone_else_merged_minutes_later_then_syncs_rolls_out_and_resolves', () => {
  const r = run('s1');
  r.until('judged'); approve(r);
  assert.equal(r.E.phase(), 'merge-wait');
  tickN(r, 5);
  const made = r.S.history.find(h => h.kind === 'prcreate');
  assert.ok(made);
  assert.ok(r.E.merge());
  const review = r.S.history.find(h => h.kind === 'review'), merge = r.S.history.find(h => h.kind === 'merge'), ready = r.S.history.find(h => h.kind === 'ready');
  assert.ok(ready.at < review.at && review.at < merge.at, 'ready for review, then review, then merge');
  assert.notEqual(review.actor.name, ME, 'the reviewer is not the approver');
  assert.notEqual(merge.actor.name, ME, 'the approver does not merge (the policy has the reviewer merge)');
  assert.ok(merge.at - made.at >= PR_POLICY.reviewAfter + PR_POLICY.mergeAfter, 'the merge comes minutes after the PR, not seconds');
  assert.match(merge.link, /^https:\/\/github\.com\/acme\/payments-deploy\/pull\/\d+$/);
  assert.equal(r.until('resolved'), 'resolved');
  assert.deepEqual(r.S.history.filter(h => ['sync', 'rollout', 'resolve'].includes(h.kind)).map(h => h.kind), ['sync', 'rollout', 'resolve']);
  assert.ok(r.S.resolvedAt - r.S.verifyFrom >= NEED);
  assert.equal(r.S.history.find(h => h.kind === 'resolve').recovery, 'service');
});

test('injected_failure_fails_in_its_window_and_keeps_the_option_out', () => {
  const r = run('s1');
  r.until('judged'); approve(r);
  tickN(r, 5);
  r.E.merge(); r.S.failInjected = true;
  assert.equal(r.until('failed'), 'failed');
  assert.equal((r.S.failAt - r.S.verifyFrom) % CADENCE, 0);
  assert.equal(r.E.optionsNow().at(-1).disabled, true);
});

test('manual_actions_go_request_then_external_execution_then_observed_recovery_then_done', () => {
  for (const sid of ['s3', 's4']) {
    const r = run(sid);
    r.until('judged'); approve(r);
    assert.equal(r.E.phase(), 'handoff');
    tickN(r, 25);
    const req = r.S.history.find(h => h.kind === 'request');
    assert.ok(req?.ticket, `${sid} request carries its ticket`);
    assert.ok(r.E.done());
    const ext = r.S.history.find(h => h.kind === 'external'), seen = r.S.history.find(h => h.kind === 'observed'), done = r.S.history.find(h => h.kind === 'done');
    const o = sc(sid).options[0];
    assert.ok(ext.at >= r.S.approvedAt + o.external.after, `${sid} the team acts minutes after the request`);
    assert.notEqual(ext.actor.name, ME, `${sid} a named external actor runs it`);
    assert.equal(ext.ticket, o.external.ticket);
    assert.ok(req.at < ext.at && ext.at < seen.at && seen.at < done.at, `${sid} request → execution → observed → done`);
    assert.ok(done.at - r.S.approvedAt > 300, `${sid} never done seconds after approval`);
    assert.equal(r.until('resolved'), 'resolved');
    assert.ok(r.S.verifyFrom >= done.at);
    assert.equal(r.E.fixAt(), seen.at, `${sid} the symptom drops when the effect is observed`);
  }
});

test('recovery_is_classed_per_scenario_and_a_watch_does_not_close_in_minutes', () => {
  const want = { s1: 'service', s2: 'service', s3: 'service', s4: 'service', s5: 'bypassed', s6: 'mitigated' };
  for (const [sid, kind] of Object.entries(want)) {
    const r = run(sid);
    r.until('judged'); approve(r); tickN(r, 25);
    if (r.E.phase() === 'merge-wait') r.E.merge(); else r.E.done();
    assert.equal(r.until('resolved'), 'resolved', sid);
    const res = r.S.history.find(h => h.kind === 'resolve');
    assert.equal(res.recovery, kind, sid);
    if (sid === 's6') { assert.ok(r.E.recovery().watching); assert.ok(res.watchUntil - r.S.verifyFrom >= 7 * 86400); }
  }
});

test('pass_counts_keep_required_conditions_apart_from_unjudged_ones', () => {
  const c = verifyCounts([{ state: 'pass' }, { state: 'pass' }, { state: 'unknown', optional: true }]);
  assert.deepEqual(c, { required: 2, passed: 2, unjudged: 1, optional: 1 });
  assert.equal(causeStatus(sc('s3').chain, sc('s3').rule), 'hypothesis');
  assert.equal(causeStatus(sc('s5').chain, sc('s5').rule), 'hypothesis');
  assert.equal(causeStatus(sc('s1').chain, sc('s1').rule), 'judged');
});

test('burn_rate_is_the_error_ratio_over_the_budget_on_every_screen_and_report', () => {
  for (const sid of ['s1', 's3']) {
    const s = sc(sid), now = errorRate(sid)(0), x = impactNumbers(sid, s.impact.from, 0);
    assert.equal(now, s.impact.during, 'the home figure is the scenario figure');
    assert.equal(x.mean, s.impact.during, 'the report mean is the same figure');
    assert.equal(Math.round(burnRate(now) * 10) / 10, 31, 'home burn rate');
    const burnIncident = x.burns.find(b => b.id === 'incident').value;
    assert.equal(burnIncident, 31, 'report burn rate');
    assert.equal(x.burnNow, burnIncident);
    const ui = userImpactOf(sid, 0).find(i => i.id === 'burn-incident');
    assert.match(ui.value, /^31\.0×/);
    assert.ok(userImpactOf(sid, 0).filter(i => /^burn/.test(i.id)).every(i => i.from != null && i.to != null && /burn rate /.test(i.label)), 'every burn rate names its window');
  }
  assert.equal(Math.round(burnRate(.42) * 10) / 10, 4.2);
});

test('impact_queries_filter_their_service_and_requests_come_from_the_same_window', () => {
  for (const sid of ['s1', 's3']) {
    const s = sc(sid), x = impactNumbers(sid, s.impact.from, 0);
    assert.match(s.impact.query, new RegExp(`namespace="${s.impact.ns}"`));
    assert.match(s.impact.query, new RegExp(`service="${s.impact.service}"`));
    assert.equal(x.requests, s.impact.rps * (0 - s.impact.from));
    assert.equal(x.failed, Math.round(x.requests * s.impact.during / 100));
    const w = world(sid, 0, 'judged');
    assert.equal(netOf(w, sid, 0).find(v => v.name === s.impact.service).rps, s.impact.rps, 'the network page serves the same request rate');
    const e = s.evidence.find(v => v.metric === 'error_ratio');
    if (e) assert.equal(e.query, s.impact.query, 'the evidence reads the impact query');
  }
});

test('evidence_carries_its_metric_target_window_and_collection_time_before_the_judgement', () => {
  for (const s of SCENARIOS.filter(x => !x.quiet)) {
    useClock(s.id);
    const judged = s.script.find(x => x[0] === 'judged')[1];
    for (const e of s.evidence) {
      assert.ok(e.got != null && e.got < judged, `${s.id}[${e.id}] read before the judgement`);
      if (e.to != null) assert.ok(e.to <= e.got, `${s.id}[${e.id}] window ends before it was read`);
      if (e.kind === 'Prometheus' && !e.blocked) {
        assert.ok(e.metric && e.target && e.from != null && e.to != null, `${s.id}[${e.id}] metric, target, window`);
        const x = evidenceSeries(s.id, e.id);
        assert.equal(x.metric, e.metric);
        assert.equal(typeof x.fn, 'function');
      }
    }
  }
  const e5xx = evidenceSeries('s3', 1);
  assert.equal(e5xx.metric, 'error_ratio', 'a 5xx evidence opens a 5xx series');
});

test('every_evidence_series_value_at_its_collection_matches_its_text_and_the_cause_cites_it', () => {
  for (const s of SCENARIOS.filter(x => !x.quiet)) {
    useClock(s.id);
    const series = sc(s.id).evidence.filter(e => e.kind === 'Prometheus' && !e.blocked);
    assert.ok(series.length >= 1, `${s.id} has a key time series`);
    for (const e of series) {
      const x = evidenceSeries(s.id, e.id), raw0 = x.fn(e.got), v = raw0 == null ? null : Math.round(raw0 * 100) / 100;
      assert.equal(x.value, v);
      assert.ok(e.raw.includes(x.valueText), `${s.id}[${e.id}] states ${x.valueText}: ${e.raw}`);
      if (v == null) { assert.equal(x.valueText, '수집 없음 (재시작 대기)'); assert.ok(e.raw.includes(`종료 직전 마지막 수집값 ${x.lastText}`), 'a gap states the last sample before the kill'); }
      assert.ok((x.refs?.length || x.lines) && x.refs.every(r => ['threshold', 'limit', 'desired', 'request'].includes(r.kind) && r.label), `${s.id}[${e.id}] reference lines (or named lines) say what they are`);
      const cited = Object.values(sc(s.id).chain.cells).flat().some(c => (c.refs ?? []).includes(e.id));
      assert.ok(cited, `${s.id}[${e.id}] is used by the cause`);
    }
  }
});

test('a_crash_looping_container_has_no_samples_while_it_waits_its_back_off', () => {
  useClock('s1');
  const x = evidenceSeries('s1', 5), runs = crashTimes(S1_CRASH);
  assert.equal(x.value, null);
  assert.ok(Math.abs(x.last - 498) < 1 && x.lastAt <= S1_CRASH.lastEnd && x.lastAt > S1_CRASH.lastEnd - 15, 'about 498Mi at the scrape before the kill');
  assert.equal(x.refs.find(r => r.kind === 'limit').label, 'limits.memory 512Mi');
  for (let i = 1; i < runs.length; i++) { const mid = (runs[i - 1].end + runs[i].start) / 2; assert.equal(x.fn(mid), null, `back-off ${i} is a gap`); }
  for (const r of runs) assert.ok(x.fn((r.start + r.end) / 2) > 0, 'each run is a fresh segment');
  assert.ok(runs[0].start > sc('s1').changes.find(c => c.id === 'c1').at, 'the loop starts after the rollout');
  assert.equal(evidenceSeries('s2', 5).refs[0].label, 'Desired 4');
});

test('redis_connections_climb_to_the_limit_then_the_fix_brings_them_down', () => {
  useClock('s6');
  const x = evidenceSeries('s6', 3), fix = 600, fn = evidenceSeries('s6', 3, fix).fn;
  const pts = []; for (let t = -7 * 86400; t <= -300; t += 3600) pts.push(x.fn(t));
  for (let i = 24; i < pts.length; i += 24) assert.ok(pts[i] > pts[i - 24], 'grows day by day');
  assert.equal(x.fn(-299), 10000); assert.equal(x.fn(0), 10000);
  assert.ok(x.fn(-3600) > 9000 && x.fn(-3600) < 10000, 'close to the limit an hour before, not a jump');
  assert.ok(fn(fix + 450) < 10000 && fn(fix + 450) > 4100, 'comes down over minutes');
  assert.ok(Math.abs(fn(fix + 3600) - 4100) < 400, 'settles near 41%');
});

test('the_oom_log_is_one_snapshot_for_the_evidence_the_logs_page_and_the_reports', () => {
  useClock('s1');
  const s = sc('s1'), e = s.evidence.find(x => x.kind === '로그');
  const snapOpen = evidenceSnapshot('s1', e.id);
  const wJudged = world('s1', 30, 'judged'), p = wJudged.pods.find(x => x.name === e.target.name), pc = prevContainer(p, 's1');
  assert.equal(pc.start, e.from); assert.equal(pc.end, e.to);
  const page = logsOf(p, 's1', pc.end, pc.life, true);
  assert.equal(page.length, snapOpen.total, 'the logs page shows the same lines');
  assert.deepEqual(page.map((l, i) => (l.level === 'ERROR' ? i + 1 : 0)).filter(Boolean), snapOpen.hits, 'the same ERROR line numbers');
  assert.equal(lineCount(e.count), snapOpen.total, 'the evidence count is the snapshot');
  useClock('s2'); useClock('s1');
  world('s1', 900, 'resolved');
  const snapResolved = evidenceSnapshot('s1', e.id);
  assert.equal(snapResolved.total, snapOpen.total);
  assert.deepEqual(snapResolved.hits, snapOpen.hits);
  assert.equal(snapResolved.from, snapOpen.from); assert.equal(snapResolved.to, snapOpen.to);
  assert.equal(snapResolved.container, snapOpen.container);
  assert.ok(s.evidence.find(x => x.id === 1).raw.includes(new Date((T0 + e.to) * 1000).toISOString().replace('.000', '')), 'the pod says it was killed when the log ends');
  const mem = evidenceSnapshot('s1', 5);
  assert.ok(mem.series.lastAt <= e.to && mem.series.lastAt > e.to - 15, 'the memory evidence is the scrape before the kill');
});

test('the_checkout_log_evidence_is_the_same_before_and_after_resolution', () => {
  useClock('s3');
  const open = evidenceSnapshot('s3', 2), s = sc('s3');
  assert.equal(`${open.total.toLocaleString('en-US')}줄`, s.evidence.find(x => x.id === 2).count);
  assert.ok(s.chain.cells.observe.some(c => c.text.includes(open.total.toLocaleString('en-US'))), 'the cause quotes the same count');
  useClock('s1'); useClock('s3'); world('s3', 1200, 'resolved');
  const later = evidenceSnapshot('s3', 2);
  assert.equal(later.total, open.total);
  assert.deepEqual(later.lines.slice(0, 5), open.lines.slice(0, 5));
});

test('world_counts_agree_across_screens', () => {
  for (const sid of ['s1', 's4', 's7']) {
    const w = world(sid, 30, 'judged');
    assert.equal(w.nodes.filter(n => n.pool === 'general' && n.status[0] !== 'idle').length, GENERAL_NODES, 'NodeGroup general size');
    assert.equal(w.nodes.filter(n => n.status[0] !== 'idle').length, PROD_NODES);
    for (const n of w.nodes) {
      assert.ok(n.pods <= n.podCap, `${n.name} ${n.pods} pods within ${n.podCap}`);
      assert.equal(n.pods, w.pods.filter(p => p.node === n.name && !/Pending/.test(p.status[1])).length, `${n.name} pod count is its pods`);
    }
    const argo = w.tools.find(x => x.id === 'argocd');
    assert.ok(argo.detail.includes(`Application ${w.apps.length.toLocaleString('en-US')}개`), 'Argo CD count is the apps listed');
    for (const x of w.tools.filter(y => y.latencyMs != null && TOOL_LATENCY[y.id])) { assert.equal(x.latencyMs, TOOL_LATENCY[x.id]); if (/지연/.test(x.detail)) assert.ok(x.detail.includes(`${x.latencyMs.toLocaleString('en-US')}ms`), x.id); }
    const pv = pvcs(w).find(c => c.name === 'data-orders-db-0'), db = w.pods.find(p => p.name === 'orders-db-0');
    assert.equal(pv.used, 91);
    assert.equal(podVolume(w, db).used, pv.used, 'the StatefulSet and the PVC show one use');
    assert.equal(podVolume(w, db).size, pv.size);
  }
  const s4 = sc('s4');
  useClock('s4');
  assert.ok(s4.evidence.find(e => e.id === 2).raw.includes(`Node ${GENERAL_NODES}개`));
});

test('incident_list_counts_every_row_and_numbers_grow_with_time', () => {
  const w = world('s6', 30, 'judged'), l = incidentList('s6', 30, 'judged');
  assert.ok(w);
  assert.equal(l.total, l.all.length);
  assert.equal(l.all.length, l.open.length + l.past.length);
  const nums = l.all.map(x => Number(x.id.replace(/\D/g, ''))), ats = l.all.map(x => x.at);
  for (let i = 1; i < nums.length; i++) { assert.ok(nums[i] < nums[i - 1], 'newest first'); assert.ok(ats[i] <= ats[i - 1], 'numbers follow time'); }
  assert.equal(incOf('s6'), `INC-${INC_BASE + 6}`);
  assert.ok(pastOf().some(p => p.scenario === 's1'), 'earlier scenarios are past incidents');
});

test('each_scenario_has_its_own_detection_time_in_number_order', () => {
  const at = SCENARIOS.map(s => Date.parse(DETECT[s.id]));
  for (let i = 1; i < at.length; i++) assert.ok(at[i] > at[i - 1]);
  assert.equal(new Set(SCENARIOS.map(s => DETECT[s.id].slice(11, 19))).size, SCENARIOS.length, 'no shared time of day');
  useClock('s3'); assert.equal(hms(0), '11:38:40');
  useClock('s1'); assert.equal(hms(0), '10:47:20');
});

test('links_are_https_and_stored_once', () => {
  for (const s of SCENARIOS.filter(x => !x.quiet)) {
    const l = linksOf(s, incOf(s.id)), a = alertText(s.id);
    for (const k of ['incident', 'alert', 'runbook', 'dashboard']) assert.match(l[k], /^https:\/\//, `${s.id} ${k}`);
    assert.match(l.pr(1), /^https:\/\/github\.com\//);
    assert.equal(a.annotations.dashboard_url, l.dashboard, 'the alert names the dashboard the report links');
    assert.equal(a.annotations.runbook_url, l.runbook);
  }
});

test('scenario_specific_user_impact_or_its_owner_and_next_check', () => {
  const kinds = {};
  for (const s of SCENARIOS.filter(x => !x.quiet)) { const u = userImpactOf(s.id, 30); assert.ok(u.length, s.id); kinds[s.id] = u; for (const i of u.filter(x => x.state === 'unknown')) assert.ok(i.owner && i.next != null, `${s.id} unknown impact names its owner and next check`); }
  assert.ok(kinds.s4.some(i => i.id === 'run') && kinds.s4.some(i => i.id === 'deadline'), 'a batch says its delayed run and deadline');
  assert.ok(kinds.s6.some(i => i.id === 'login'), 'auth says its login failures');
  assert.ok(kinds.s2.some(i => i.id === 'ready'), 'a stuck rollout says the capacity left');
});

test('disconnected_sources_carry_their_last_collection_and_are_never_current', () => {
  const dev = world('s7', 0, 'quiet', 'ok', 'wake-dev');
  assert.equal(dev.stale, true);
  assert.ok(dev.asOf < -86400, 'the dev cluster is as of two days ago');
  assert.equal(dev.sources.kubernetes.stale, true);
  const down = world('s1', 120, 'judged', 'tools-down');
  assert.equal(down.sources.prometheus.stale, true);
  assert.ok(down.sources.prometheus.last <= DOWN_AT);
  assert.equal(down.sources.kubernetes.stale, false);
  const ok = world('s1', 120, 'judged');
  assert.equal(ok.sources.prometheus.stale, false);
  assert.ok(ok.sources.prometheus.last > 100);
});

test('ai_plans_follow_ownership_and_never_restart_an_oom_killed_workload_or_blame_a_pdb', () => {
  const w = world('s1', 30, 'judged'), dep = w.workloads.find(x => x.kind === 'Deployment' && x.name === 'payments');
  const acts = actionsFor(dep, w);
  assert.ok(!acts.some(a => a.id === 'restart'), 'no rollout restart for an OOMKilled workload');
  assert.ok(acts.every(a => a.mode === 'pr' && !/kubectl/.test(a.cmd)), 'an Argo CD auto-synced Deployment is changed through a Draft PR only');
  assert.deepEqual(acts.find(a => a.id === 'rollback'), planFromOption(sc('s1'), sc('s1').options[0]), 'the resource view proposes the incident\'s own plan');
  assert.match(acts.find(a => a.id === 'rollback').change, /-Xmx480m → -Xmx384m.*requests\.cpu 420m → 300m/, 'the change is the revision diff, not an image');
  const copy = { ...dep, status: [...dep.status] };
  assert.equal(actionsFor(copy, w).length, acts.length, 'ownership is found by namespace, kind and name, not object identity');
  const free = w.workloads.find(x => x.kind === 'Deployment' && !ownerApp(w, x)?.auto && w.pods.every(p => p.owner !== x || (!p.lastReason && p.status[0] === 'ok')));
  assert.ok(actionsFor(free, w).some(a => a.id === 'rollback' && a.mode === 'command' && !/이미지/.test(a.reach)), 'an unmanaged one may use kubectl, with no made-up image change');
  const calm = w.workloads.find(x => x.kind === 'Deployment' && x.replicas > 2 && !ownerApp(w, x)?.auto && w.pods.every(p => p.owner !== x || (!p.lastReason && p.status[0] === 'ok')));
  const other = actionsFor(calm, w).find(a => a.id === 'restart');
  assert.ok(other.checks.every(c => !/PDB .*교체가 멈출/.test(c)), 'a rollout is not blocked by a PDB');
});

test('every_choice_lists_follow_ups_with_a_team_owner_a_dated_due_and_a_detection_gap_when_the_alert_was_late', () => {
  for (const s of SCENARIOS.filter(x => !x.quiet)) {
    useClock(s.id);
    const sc0 = sc(s.id), first = Math.min(...sc0.changes.filter(c => c.lane === 'symptom' && c.kind !== '알림').map(c => c.at));
    for (const o of sc0.options.filter(x => !x.disabled)) {
      assert.ok(o.followUps.length >= 2, `${s.id}/${o.id}`);
      for (const f of o.followUps) {
        assert.match(f.owner, /팀$/, `${s.id}/${o.id} team owner`);
        assert.match(f.dueDate, /^\d{4}-\d{2}-\d{2}$/, 'due date with its year');
        assert.ok(['cause', 'detection', 'process'].includes(f.from));
      }
      assert.ok(o.followUps.some(f => f.from === 'process'), `${s.id}/${o.id} process follow-up`);
      if (-first > 300) assert.ok(o.followUps.some(f => f.from === 'detection'), `${s.id}/${o.id} detection gap ${-first}s`);
    }
  }
  assert.ok(sc('s1').options[0].followUps.some(f => f.from === 'detection' && /\d+분 \d+초 걸림/.test(f.title)));
});

test('scenario_events_keep_their_own_times_instead_of_collapsing_to_one_minute', async () => {
  const { eventsIn } = await import('./sim-world.js');
  const w = world('s1', 0, 'judged');
  const own = eventsIn(w, 's1', -3600, 0).filter(e => e.scenario);
  const at = Object.fromEntries(own.map(e => [`${e.name}|${e.reason}`, e.at]));
  assert.equal(at['payments|ScalingReplicaSet'] != null, true);
  assert.ok(new Set(own.map(e => e.at)).size >= 4, 'scenario events sit at more than one time');
  assert.equal(Math.max(...own.filter(e => e.name === 'payments').map(e => e.at)), -1020);
});

test('masking_hides_tokens_passwords_keys_cards_and_emails_but_not_plain_log_text', async () => {
  const { maskCount } = await import('./sim-mask.js');
  for (const s of ['password=hunter2', 'Authorization: Bearer abcdefghijklmnop', 'AKIAIOSFODNN7EXAMPLE', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdefghijk', 'ghp_abcdefghijklmnopqrstuvwxyz0123', '4111-1111-1111-1111', 'kim@acme.io'])
    assert.equal(maskCount(s).n, 1, s);
  assert.equal(maskCount('GET /api/v1/orders 200 38ms · 5xx 3.1% · 2026-11-12 14:02:16').n, 0);
});

test('a_person_acks_then_reads_the_judgement_before_approving', () => {
  for (const s0 of SCENARIOS.filter(x => !x.quiet)) {
    const r = run(s0.id); r.until('judged'); approve(r);
    const ack = r.S.history.find(h => h.kind === 'ack'), ok = r.S.history.find(h => h.kind === 'approve');
    assert.ok(ack && ack.at < ok.at, `${s0.id} ack first`);
    assert.ok(ok.at - r.E.judgedAt() >= 60 && ok.at - r.E.judgedAt() <= 300, `${s0.id} approval 1–5 minutes after the judgement`);
    assert.ok(['critical', 'warning', 'info'].includes(s0.severity), `${s0.id} severity`);
    assert.notEqual(DETECT[s0.id].slice(17, 19), '00', `${s0.id} not on a round time`);
  }
});

test('the_db_reply_is_numbered_evidence_that_supports_the_cause', () => {
  const r = run('s3'); r.until('judged'); approve(r); tickN(r, 25);
  assert.equal(causeStatus(r.E.chainNow(), sc('s3').rule), 'hypothesis');
  r.E.done();
  const reply = r.E.evidenceNow().find(e => e.added);
  assert.equal(reply.id, 6); assert.match(reply.raw, /198/); assert.match(reply.raw, /64개/);
  assert.equal(reply.got, r.S.history.find(h => h.kind === 'external').at);
  assert.equal(causeStatus(r.E.chainNow(), sc('s3').rule), 'supported');
  assert.ok(Object.values(r.E.chainNow().cells).flat().some(c => (c.refs ?? []).includes(6)));
  assert.equal(r.E.fixAt(), r.S.history.find(h => h.kind === 'observed').at, 'recovery is the observed time');
});

test('final_impact_after_resolve_reads_the_end_state', () => {
  const end = (sid, pick = 0) => { const r = run(sid); r.until('judged'); approve(r, pick); tickN(r, 25); if (r.E.phase() === 'merge-wait') r.E.merge(); else r.E.done(); r.until('resolved'); return r; };
  const r2 = end('s2'), f2 = userImpactOf('s2', r2.S.t, r2.S.resolvedAt, r2.E.fixAt(), true).find(i => i.id === 'ready');
  assert.equal(f2.ready, 4); assert.equal(f2.desired, 4); assert.equal(f2.readyDuring, 3); assert.doesNotMatch(f2.value, /Ready Pod Ready/);
  const r1 = end('s1'), f1 = userImpactOf('s1', r1.S.t, r1.S.resolvedAt, r1.E.fixAt(), true);
  assert.equal(f1.find(i => i.id === 'ratio').peak, 3.1); assert.equal(f1.find(i => i.id === 'ratio').to, r1.E.fixAt());
  assert.ok(f1.find(i => i.id === 'budget').budgetUsed > 0);
  const r4 = end('s4'), run4 = batchRun('s4', r4.S.t, r4.E.fixAt()), f4 = userImpactOf('s4', r4.S.t, r4.S.resolvedAt, r4.E.fixAt(), true).find(i => i.id === 'run');
  assert.ok(run4.complete && run4.processed === 1240, 'the batch completed and processed its items before it is called recovered');
  assert.equal(run4.waited, run4.resumed - run4.due, 'the wait stops at resumption');
  assert.match(f4.value, /Complete/);
  assert.equal(r4.S.history.find(h => h.kind === 'resolve').recovery, 'service');
  const mid = run('s4'); mid.until('judged'); approve(mid); tickN(mid, 25); mid.E.done(); tickN(mid, 3);
  assert.equal(mid.E.recovery().kind, 'resumed', 'before Job Complete the batch has only resumed');
  const r6 = end('s6'), f6 = userImpactOf('s6', r6.S.t, r6.S.resolvedAt, r6.E.fixAt(), true).find(i => i.id === 'ready');
  assert.equal(f6.ready, 5);
  const r5 = end('s5'), d5 = userImpactOf('s5', r5.S.t, r5.S.resolvedAt, r5.E.fixAt(), true).find(i => i.id === 'dep');
  assert.ok(d5.due && !('next' in d5), 'an unknown impact after close is handed to a dated follow-up, not a past check time');
});

test('event_rows_warning_count_and_badges_come_from_one_filtered_result', () => {
  const w = world('s1', 30, 'judged'), all = eventSummary(w, 's1', -3600, 30), warn = eventSummary(w, 's1', -3600, 30, { type: 'Warning' });
  assert.equal(all.objects, all.rows.length);
  assert.equal(warn.objects, all.warning, 'the Warning filter lists exactly the head count');
  assert.equal(warn.rows.length, warn.warning);
  assert.ok(warn.occurrences >= warn.objects, 'occurrences are counted apart from objects');
});

test('a_suspended_cronjob_creates_no_jobs_after_it_was_suspended', () => {
  const w = world('s7', 0, 'quiet'), sus = w.workloads.filter(x => x.kind === 'CronJob' && x.suspend);
  assert.ok(sus.length);
  for (const c of sus) for (const j of jobs(w, 0).filter(x => x.owner === c)) { assert.ok(j.start <= c.suspendedAt, `${j.name} before suspension`); assert.equal(Number(j.name.split('-').pop()), Math.floor((T0 + j.start) / 60), 'the Job name is its schedule minute'); }
});

test('nodegroup_desired_nodes_and_ready_are_separate_and_the_action_matches_the_gap', () => {
  useClock('s4');
  const x = evidenceSeries('s4', 5, 900), at = x.valueAt;
  assert.equal(at.desired, GENERAL_NODES); assert.equal(at.nodes, GENERAL_NODES); assert.equal(at.ready, GENERAL_NODES);
  assert.match(sc('s4').options[0].external.did, new RegExp(`desiredSize ${GENERAL_NODES} → ${GENERAL_NODES + 1}`), 'the action raises the desiredSize that was lowered');
  assert.ok(x.lines.desired(800) === GENERAL_NODES + 1 && x.lines.ready(800) === GENERAL_NODES, 'desired rises before the new Node is Ready');
  assert.ok(x.view == null && evidenceSeries('s4', 5, 900, 1500).view.to === 1500, 'a resolved document reads the series through the recovery check');
  const w = world('s4', 30, 'judged');
  assert.equal(nodeGroups(w).find(g => g.name === 'general').nodes, GENERAL_NODES);
});

test('s5_keeps_its_user_path_unjudged_and_names_what_it_read', () => {
  const s5 = sc('s5');
  assert.ok(s5.verify.some(c => c.userPath && c.unjudged));
  assert.equal(s5.evidence[0].kind, 'Kubernetes API');
  assert.match(s5.evidence[0].query, /apis\/argoproj\.io/);
  assert.ok(!/권한이 없어 지금 상태는 확인 안 됨/.test(s5.options[0].basis));
});

test('past_incident_numbers_come_from_one_list', () => {
  useClock('s6'); world('s6', 0, 'judged');
  const mem = memoryOf('s6'), ids = pastOf().filter(p => p.alert === 'AuthCrashLooping').map(p => p.id.toUpperCase());
  assert.deepEqual(mem.map(m => m.id), ids);
  for (const id of ids) assert.ok(sc('s6').evidence.find(e => e.kind === '과거 인시던트').raw.includes(id));
});

test('the_cluster_cpu_is_the_mean_of_its_nodes', () => {
  const w = world('s7', 0, 'quiet'), mean = clusterCpu('s7')(0), top = Math.max(...w.nodes.map(n => n.cpu));
  assert.ok(top >= mean, 'the top node is at least the cluster mean');
});

test('real_ports_and_tool_services', async () => {
  const { services } = await import('./sim-gaps.js');
  const w = world('s7', 0, 'quiet'), svc = services(w), port = n => svc.find(x => x.name === n)?.ports ?? '';
  assert.match(port('kube-dns'), /53\/UDP/); assert.match(port('prometheus-operated'), /9090/); assert.match(port('alertmanager'), /9093/); assert.match(port('grafana'), /3000/); assert.match(port('loki-gateway'), /^http 80/);
});

