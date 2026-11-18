const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const vm = require('node:vm');
const { create } = require('./terminal.cjs');

/* node-pty is an optional native dependency (kit/package.json): sessions that spawn a real pty run only where it loads */
let ptyMissing = false;
try { require('node-pty'); } catch (error) { ptyMissing = `node-pty unavailable: ${error.message.split('\n')[0]}`; }
const realPty = shell => ({ skip: !fs.existsSync(shell) ? `${shell} missing` : ptyMissing });

function fixture(shell, custom = false, startup = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-startup-'));
  const home = path.join(root, 'home');
  const cwd = path.join(root, "target ' space");
  const changed = path.join(root, 'changed');
  const config = path.join(root, "synthetic ' config");
  const dotdir = custom ? path.join(root, 'custom config') : home;
  for (const dir of [home, cwd, changed, dotdir]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config, 'synthetic fixture only\n');
  const q = v => `'${v.replace(/'/g, "'\\''")}'`;
  const override = `export KUBECONFIG=overrode APP_TARGET_SCOPE=overrode; cd ${q(changed)}\n`;
  const prompt = `PS1='KIT_READY> '; PROMPT='KIT_READY> '\n`;
  if (shell.endsWith('zsh')) {
    fs.writeFileSync(path.join(dotdir, '.zshenv'), 'export STARTUP_ORDER=e\n');
    fs.writeFileSync(path.join(dotdir, '.zprofile'), 'STARTUP_ORDER+=p\n');
    fs.writeFileSync(path.join(dotdir, '.zshrc'), `${prompt}STARTUP_ORDER+=r\n${override}`);
    fs.writeFileSync(path.join(dotdir, '.zlogin'), `STARTUP_ORDER+=l\n${override}${startup}`);
    if (custom) fs.writeFileSync(path.join(home, '.zshrc'), 'export UNRELATED_HOME=read\n');
    if (custom === 'redirect') {
      fs.writeFileSync(path.join(home, '.zshenv'), `export STARTUP_ORDER=e; export ZDOTDIR=${q(dotdir)}\n`);
    }
  } else {
    fs.writeFileSync(path.join(home, '.bashrc'), `${prompt}export STARTUP_ORDER=rc\n${override}${startup}`);
    fs.writeFileSync(path.join(home, '.bash_profile'), 'source "$HOME/.bashrc"; STARTUP_ORDER+=profile\n');
  }
  return { root, home, cwd: fs.realpathSync(cwd), config, dotdir };
}

function sessionFixture(t, { root, env, send, createTerminal = create }) {
  const saved = process.env;
  let terminal, sessionId, hasStarted = false, hasExited = false, resolveExit;
  const exit = new Promise(resolve => { resolveExit = resolve; });
  t.after(async () => {
    let timer;
    try {
      terminal?.closeAll();
      if (hasStarted && !hasExited) {
        await Promise.race([exit, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`fixture session did not exit: ${sessionId}`)), 5000);
        })]);
      }
      fs.rmSync(root, { recursive: true, force: true });
    } finally {
      clearTimeout(timer);
      process.env = saved;
    }
  });
  process.env = env;
  terminal = createTerminal({ userData: path.join(root, 'data'), send(owner, kind, id, value) {
    if (kind === 'pty-exit' && id === sessionId) { hasExited = true; resolveExit(); }
    send(owner, kind, id, value);
  } });
  return { terminal, start(mode, args, owner) {
    sessionId = args.id;
    const result = terminal[mode]({ ...args, mode: 'local' }, owner);
    hasStarted = !result.error;
    return result;
  } };
}

async function checkSession(t, shell, mode, custom = false, startup = '', expectedExit = 0) {
  const f = fixture(shell, custom, startup);
  const events = [];
  let output = '';
  const { terminal, start } = sessionFixture(t, { root: f.root,
    env: { HOME: f.home, SHELL: shell, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TERM: 'xterm-256color', ...(custom && custom !== 'redirect' ? { ZDOTDIR: f.dotdir } : {}) },
    send(_owner, kind, id, value) {
      events.push({ kind, value });
      if (kind === 'pty-data') output += value;
    } });
  const env = { KUBECONFIG: f.config, APP_TARGET_SCOPE: "target ' scope $literal" };
  const command = `printf '\\nRESULT=<%s>|<%s>|<%s>|<%s>|<%s>\\n' "$PWD" "$KUBECONFIG" "$APP_TARGET_SCOPE" "$STARTUP_ORDER" "\${UNRELATED_HOME-unread}"; (exit ${expectedExit})`;
  const result = start(mode, { id: 'fixture', cwd: f.cwd, env, command }, 'owner');
  assert.equal(result.error, undefined, JSON.stringify(result));
  async function until(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(predicate(), output);
  }
  if (mode === 'open') {
    await until(() => output.includes('KIT_READY> '));
    terminal.write('fixture', `${command}\r`, 'owner');
    await until(() => events.some(e => e.kind === 'pty-command'));
  } else await until(() => events.some(e => e.kind === 'pty-exit'));
  assert.ok(output.includes(`RESULT=<${f.cwd}>|<${f.config}>|<${env.APP_TARGET_SCOPE}>`), output);
  assert.ok(output.includes(shell.endsWith('zsh') ? '|<eprl>|<unread>' : mode === 'open' ? '|<rc>|<unread>' : '|<rcprofile>|<unread>'), output);
  if (mode === 'open') {
    assert.deepEqual(events.filter(e => e.kind === 'pty-command').map(e => e.value), [{ command, exit: expectedExit }]);
  } else assert.equal(events.find(e => e.kind === 'pty-exit').value, expectedExit);
}

function captureSyntheticLaunch(f, shell) {
  let captured, onExit;
  const proc = { onData() {}, onExit(callback) { onExit = callback; }, kill() { onExit?.({ exitCode: 0 }); } };
  const mockRequire = name => {
    if (name === 'node-pty') return { spawn(file, args, options) { captured = { file, args, options }; return proc; } };
    if (name === 'node:os') return { homedir: () => f.home, userInfo: () => ({ username: 'synthetic', homedir: f.home }) };
    if (name === 'node:fs') return fs;
    if (name === 'node:path') return path;
    if (name === 'node:child_process') {
      const unexpected = () => assert.fail('local startup must not execute remote commands');
      return { execFile: unexpected, execFileSync: unexpected };
    }
    throw new Error(`unexpected synthetic dependency: ${name}`);
  };
  mockRequire.resolve = () => path.join(f.root, 'absent-package.json');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'terminal.cjs'), 'utf8'), {
    module, require: mockRequire, Buffer, setTimeout, clearTimeout,
    process: { platform: process.platform, env: {
      HOME: f.home, SHELL: shell, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SYNTHETIC_CWD: f.cwd,
    } },
  }, { filename: 'terminal.cjs' });
  const terminal = module.exports.create({ userData: path.join(f.root, 'data'), send() {} });
  return { terminal, launch: () => captured };
}

function runSyntheticSession(t, { shell, mode, startup = '', commandStatus = 0 }) {
  const f = fixture(shell, false, startup);
  const { terminal, launch } = captureSyntheticLaunch(f, shell);
  t.after(() => {
    terminal.closeAll();
    fs.rmSync(f.root, { recursive: true, force: true });
    assert.equal(fs.existsSync(f.root), false);
  });
  const env = { KUBECONFIG: f.config, APP_TARGET_SCOPE: "target ' scope $literal", APP_EMPTY: '' };
  const marker = path.join(f.root, 'command-ran');
  const command = `: > '${marker}'; \\builtin printf '\\nSYNTHETIC_RESULT=<%s>|<%s>|<%s>|<%s>\\n' "$(/bin/pwd -P)" "$KUBECONFIG" "$APP_TARGET_SCOPE" "$APP_EMPTY"; \\builtin alias builtin exit; (\\builtin exit ${commandStatus})`;
  const link = path.join(f.root, 'target-link');
  fs.symlinkSync(f.cwd, link);
  const result = terminal[mode]({ mode: 'local', id: 'synthetic', cwd: link, env, command }, 'synthetic');
  assert.equal(result.error, undefined);
  const { file, args, options } = launch();
  const inputFile = path.join(f.root, 'shell-input');
  fs.writeFileSync(inputFile, mode === 'open' ? `${command}\n__synthetic_status=$?; \\builtin exit "$__synthetic_status"\n` : '');
  const input = fs.openSync(inputFile, 'r');
  let child;
  try {
    child = spawnSync(file, args, {
      cwd: options.cwd, env: options.env, encoding: 'utf8', timeout: 5000,
      stdio: [input, 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
    });
  } finally {
    fs.closeSync(input);
  }
  t.diagnostic(JSON.stringify({ shell, mode, startup, commandStatus, status: child.status, signal: child.signal,
    error: child.error?.message, stdout: child.stdout, stderr: child.stderr, commandRan: fs.existsSync(marker) }));
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  return { child, commandRan: fs.existsSync(marker), expected: `SYNTHETIC_RESULT=<${f.cwd}>|<${f.config}>|<${env.APP_TARGET_SCOPE}>|<>` };
}

test('terminal_alias_synthetic_restores_literals_and_preserves_command_status', async t => {
  for (const shell of ['/bin/zsh', '/bin/bash']) {
    for (const mode of ['open', 'run']) {
      for (const aliases of ['', 'alias builtin=true\n', 'alias exit=true\n', 'alias builtin=true exit=true\n']) {
        for (const commandStatus of [0, 7]) {
          await t.test(`${shell} ${mode} ${aliases.trim() || 'no aliases'} exit ${commandStatus}`, { skip: !fs.existsSync(shell) }, t => {
            const { child, commandRan, expected } = runSyntheticSession(t, {
              shell, mode, commandStatus, startup: `${aliases}export APP_EMPTY=overrode\n`,
            });

            assert.equal(commandRan, true);
            assert.ok(child.stdout.includes(expected), child.stdout);
            assert.equal(child.status, commandStatus);
            for (const name of ['builtin', 'exit']) {
              if (aliases.includes(`${name}=true`)) assert.match(child.stdout, new RegExp(`${name}=.*true`));
            }
          });
        }
      }
    }
  }
});

test('terminal_alias_synthetic_restore_failures_stop_before_command', async t => {
  const failures = [
    ['readonly', 'readonly APP_TARGET_SCOPE=overrode\n'],
    ['cd', '/bin/mv -- "$SYNTHETIC_CWD" "$SYNTHETIC_CWD-moved"\n'],
    ['value mismatch', 'function builtin { if [[ $1 == exit ]]; then \\exit "$2"; else return 0; fi; }\n'],
    ['cwd mismatch', 'function builtin { if [[ $1 == export ]]; then export "${@:2}"; elif [[ $1 == cd ]]; then return 0; else \\exit "$2"; fi; }\n'],
  ];
  for (const shell of ['/bin/zsh', '/bin/bash']) {
    for (const mode of ['open', 'run']) {
      for (const [name, failure] of failures) {
        await t.test(`${shell} ${mode} ${name}`, { skip: !fs.existsSync(shell) }, t => {
          const { child, commandRan } = runSyntheticSession(t, {
            shell, mode, startup: `alias builtin=true exit=true\n${failure}`,
          });

          assert.equal(commandRan, false, child.stdout);
          assert.equal(child.status, 125, child.stderr);
          assert.ok(!child.stderr.includes('KIT_READY> '), child.stderr);
        });
      }
    }
  }
});

test('terminal_alias_synthetic_startup_exit_keeps_original_status', async t => {
  for (const shell of ['/bin/zsh', '/bin/bash']) {
    for (const mode of ['open', 'run']) {
      await t.test(`${shell} ${mode}`, { skip: !fs.existsSync(shell) }, t => {
        const { child, commandRan } = runSyntheticSession(t, { shell, mode, startup: '\\exit 23\n' });

        assert.equal(commandRan, false, child.stdout);
        assert.equal(child.status, 23, child.stderr);
      });
    }
  }
});

test('terminal_alias_synthetic_zsh_rcs_failure_uses_unaliased_exit', t => {
  const { child, commandRan } = runSyntheticSession(t, {
    shell: '/bin/zsh', mode: 'open', startup: 'alias builtin=true exit=true\nunsetopt rcs\n',
  });

  assert.equal(commandRan, false, child.stdout);
  assert.equal(child.status, 125, child.stderr);
  assert.ok(!child.stderr.includes('KIT_READY> '), child.stderr);
});

for (const shell of ['/bin/zsh', '/bin/bash']) {
  for (const mode of ['open', 'run']) {
    test(`${mode} ${path.basename(shell)} restores target and cwd after startup`, realPty(shell), t => checkSession(t, shell, mode));
  }
}
test('open zsh respects custom ZDOTDIR without reading home config', realPty('/bin/zsh'), t => checkSession(t, '/bin/zsh', 'open', true));

for (const shell of ['/bin/zsh', '/bin/bash']) {
  for (const mode of ['open', 'run']) {
    test(`${mode} ${path.basename(shell)} preserves nonzero command status`, realPty(shell), t => checkSession(t, shell, mode, false, '', 7));
  }
}
test('run zsh respects custom ZDOTDIR', realPty('/bin/zsh'), t => checkSession(t, '/bin/zsh', 'run', true));

test('unsupported shell and invalid environment fail before spawning', t => {
  const saved = process.env.SHELL;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-reject-'));
  t.after(() => { if (saved === undefined) delete process.env.SHELL; else process.env.SHELL = saved; fs.rmSync(root, { recursive: true, force: true }); });
  const events = [];
  const terminal = create({ userData: root, send: (...event) => events.push(event) });
  t.after(() => terminal.closeAll());
  process.env.SHELL = '/bin/sh';
  for (const mode of ['open', 'run']) assert.equal(terminal[mode]({ mode: 'local', id: 'reject', command: 'echo SHOULD_NOT_RUN' }, 'reject-owner').error, 'unsupported shell');
  process.env.SHELL = '/bin/bash';
  for (const mode of ['open', 'run']) assert.equal(terminal[mode]({ mode: 'local', id: 'reject', env: { 'bad;key': 'x' }, command: 'echo SHOULD_NOT_RUN' }, 'reject-owner').error, 'invalid environment');
  assert.deepEqual(events, []);
  assert.deepEqual(fs.readdirSync(root), []);
});

for (const [shell, startup] of [['/bin/zsh', 'readonly APP_TARGET_SCOPE=overrode\n'], ['/bin/bash', 'readonly APP_TARGET_SCOPE=overrode\n'], ['/bin/zsh', 'unsetopt rcs\n']]) {
  for (const mode of (startup.startsWith('unsetopt') ? ['open'] : ['open', 'run'])) {
    test(`${mode} ${path.basename(shell)} refuses startup enforcement failure: ${startup.trim()}`, realPty(shell), async t => {
      const f = fixture(shell, false, startup);
      let output = '', exited = false, status;
      const { start } = sessionFixture(t, { root: f.root,
        env: { HOME: f.home, SHELL: shell, PATH: '/usr/bin:/bin' },
        send(_owner, kind, _id, value) {
          if (kind === 'pty-data') output += value;
          if (kind === 'pty-exit') { exited = true; status = value; }
        } });
      const result = start(mode, { id: 'readonly', cwd: f.cwd, env: { APP_TARGET_SCOPE: 'target' }, command: 'printf SHOULD_NOT_RUN' }, 'owner');
      assert.equal(result.error, undefined, JSON.stringify(result));
      const deadline = Date.now() + 2000;
      while (!exited && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      assert.ok(exited, output);
      assert.notEqual(status, 0);
      assert.ok(!output.includes('SHOULD_NOT_RUN'), output);
    });
  }
}

test('open zsh follows ZDOTDIR changed by user zshenv', realPty('/bin/zsh'), t => checkSession(t, '/bin/zsh', 'open', 'redirect'));

test('sessionFixture_delayed_exit_keeps_parent_until_child_cleanup', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-lifecycle-'));
  const child = path.join(root, 'session');
  fs.mkdirSync(child);
  const saved = process.env;
  let cleanup, finishExit, hasClosed = false, hasCleaned = false;
  t.after(() => { process.env = saved; fs.rmSync(root, { recursive: true, force: true }); });
  const { start } = sessionFixture({ after(fn) { cleanup = fn; } }, {
    root, env: { HOME: path.join(root, 'home') }, send() {},
    createTerminal({ send }) {
      finishExit = id => {
        fs.writeFileSync(path.join(child, 'last-write'), 'child cleanup');
        fs.rmSync(child, { recursive: true });
        send('owner', 'pty-exit', id, 0);
      };
      return { open() { return { id: 'owned' }; }, closeAll() { hasClosed = true; } };
    },
  });
  start('open', { id: 'owned' }, 'owner');

  const cleaning = cleanup().then(() => { hasCleaned = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(hasClosed);
    assert.ok(fs.existsSync(child));
    assert.equal(hasCleaned, false);
    finishExit('unrelated');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hasCleaned, false);
  } finally {
    fs.mkdirSync(child, { recursive: true });
    finishExit('owned');
    await cleaning;
  }
  assert.equal(fs.existsSync(root), false);
  assert.equal(process.env, saved);
});

test('sessionFixture_inactive_or_failed_start_cleans_without_exit', async t => {
  for (const boundary of ['already-exited', 'rejected', 'spawn-throws', 'create-throws']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-lifecycle-'));
    const saved = process.env;
    let cleanup;
    t.after(() => { process.env = saved; fs.rmSync(root, { recursive: true, force: true }); });
    const failure = new Error(boundary);
    try {
      const { start } = sessionFixture({ after(fn) { cleanup = fn; } }, {
        root, env: { HOME: path.join(root, 'home') }, send() {},
        createTerminal({ send }) {
          if (boundary === 'create-throws') throw failure;
          return { open({ id }) {
            if (boundary === 'spawn-throws') throw failure;
            if (boundary === 'rejected') return { error: 'synthetic rejection' };
            send('owner', 'pty-exit', id, 0);
            return { id };
          }, closeAll() {} };
        },
      });
      start('open', { id: 'owned' }, 'owner');
      assert.ok(['already-exited', 'rejected'].includes(boundary));
    } catch (error) {
      assert.equal(error, failure);
      assert.ok(['spawn-throws', 'create-throws'].includes(boundary));
    }
    const cleaning = cleanup();
    assert.equal(fs.existsSync(root), false, boundary);
    await cleaning;
    assert.equal(process.env, saved, boundary);
  }
});

test('sessionFixture_cleanup_error_restores_environment_and_keeps_failure', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-lifecycle-'));
  const saved = process.env;
  let cleanup;
  const failure = new Error('synthetic close failure');
  t.after(() => { process.env = saved; fs.rmSync(root, { recursive: true, force: true }); });
  sessionFixture({ after(fn) { cleanup = fn; } }, {
    root, env: { HOME: path.join(root, 'home') }, send() {},
    createTerminal() { return { closeAll() { throw failure; } }; },
  });

  await assert.rejects(cleanup(), error => error === failure);
  assert.equal(process.env, saved);
  assert.ok(fs.existsSync(root));
});
