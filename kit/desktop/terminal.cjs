/*
 * Terminal sessions (main process): one pseudo terminal per session id, the user's own shell with the environment the app gives
 * (for example a fixed config file). node-pty (N-API, kit/package.json optional dependency) runs the shell; without it the terminal is
 * unavailable and open() says so.
 * Explicit remote mode resolves an expiring native-only SSM target and spawns AWS directly. Remote output never enters
 * the local command parser; no failed remote request opens a local shell. Cleanup signals only a verified owned group.
 *
 * Shell integration (zsh: a ZDOTDIR whose files source the user's own and then add hooks; bash: an rc file that sources ~/.bashrc):
 * after normal startup the app environment and cwd are restored. This is not a sandbox for hostile host scripts, and
 * each command line and its exit status are announced with private OSC 633 sequences (E: the command in base64, D: the status).
 * The parser here turns them into one { command, exit } per command for the shell document; output is never kept.
 *
 * run(): a command the app runs for the person (a button press), as its own process in a pseudo terminal shown in the panel: the user's
 * login shell runs it (-l -i -c, so the PATH and tools are the ones their own terminal has), its output streams like a session's and its
 * exit code comes from the process itself (pty-exit), never from reading the output. Closing it ends the process (cancel).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

let pty = null, loadError = null;
function load() {
  if (pty || loadError) return pty;
  try {
    pty = require('node-pty');
    // the macOS prebuild's spawn helper must be executable (some installs drop the bit)
    for (const arch of ['darwin-arm64', 'darwin-x64']) { const h = path.join(path.dirname(require.resolve('node-pty/package.json')), 'prebuilds', arch, 'spawn-helper'); try { if (fs.existsSync(h)) fs.chmodSync(h, 0o755); } catch { /* read-only install */ } }
  } catch (e) { loadError = e; }
  return pty;
}

const ZSH_HOOKS = `__kit_preexec() { printf '\\e]633;E;%s\\a' "$(printf '%s' "$1" | base64 | tr -d '\\n')"; __kit_ran=1; }
__kit_precmd() { local s=$?; [[ -n $__kit_ran ]] && printf '\\e]633;D;%s\\a' "$s"; unset __kit_ran; }
autoload -Uz add-zsh-hook; add-zsh-hook preexec __kit_preexec; add-zsh-hook precmd __kit_precmd
`;
/* bash: a DEBUG trap marks that a command line ran (armed only between the prompt and the first command, so the prompt's own
   commands and the later commands of the same line do not count); at the next prompt the line is read from history. A line the
   history did not take (HISTCONTROL ignoredups or erasedups repeating the last line, ignorespace, HISTIGNORE) still counts: when
   the history number did not move, the last history line is used if the command that ran is that line again, otherwise the
   command the trap saw. An empty line runs nothing and is not announced. A DEBUG trap the user sets (in startup files or later)
   keeps running inside this one, which is put back at each prompt; the trap is read and set at the top level of the prompt
   command, since inside a function bash does not see it and bash 3.2 undoes a change made there. */
const BASH = `__kit_keep() { [[ $1 == "trap -- '__kit_debug' DEBUG" ]] && return 0; __kit_user_trap=$(printf '%s' "$1" | sed "s/^trap -- '\\(.*\\)' DEBUG$/\\1/"); return 1; }
__kit_hist() { HISTTIMEFORMAT= history 1 | sed 's/^ *\\([0-9]*\\)\\*\\{0,1\\} *\\(.*\\)$/\\1 \\2/'; }
__kit_debug() { if [[ -n $__kit_armed && $BASH_COMMAND != __kit_cmd* ]]; then __kit_armed=; __kit_ran=1; __kit_first=$BASH_COMMAND; fi; [[ -n $__kit_user_trap ]] && eval "$__kit_user_trap"; return 0; }
__kit_cmd() { local s=$? h n c; __kit_armed=
  if [[ -n $__kit_ran ]]; then h=$(__kit_hist); n=\${h%% *}; c=\${h#* }
    if [[ $n == "$__kit_hn" && $c != "$__kit_first"* ]]; then c=$__kit_first; fi
    [[ -n $c ]] && printf '\\e]633;E;%s\\a\\e]633;D;%s\\a' "$(printf '%s' "$c" | base64 | tr -d '\\n')" "$s"
  fi; __kit_ran=; h=$(__kit_hist); __kit_hn=\${h%% *}; }
__kit_arm() { __kit_armed=1; }
__kit_keep "$(trap -p DEBUG)" || trap __kit_debug DEBUG
PROMPT_COMMAND="__kit_cmd\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"'; __kit_keep "$(trap -p DEBUG)" || trap __kit_debug DEBUG; __kit_arm'
`;
function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function restoreTarget(env, cwd, kind) {
  const stop = "'builtin' 'exit' 125";
  const checks = kind === 'zsh' ? Object.keys(env).map(key => `[[ \${(t)${key}} == *readonly* ]] && ${stop}`) : [];
  const values = Object.entries(env).map(([key, value]) => `[[ \${${key}-} == ${quote(value)} ]] || ${stop}`);
  return [...checks, ...Object.entries(env).map(([key, value]) => `'builtin' 'export' ${key}=${quote(value)} || ${stop}`),
    `'builtin' 'cd' -P -- ${quote(cwd)} || ${stop}`, ...values,
    `[[ $PWD == ${quote(cwd)} ]] || ${stop}`, ''].join('\n');
}

function userZdotdir() {
  return `if [[ -n $__kit_user_zdotdir_set ]]; then export ZDOTDIR="$__kit_user_zdotdir"; else unset ZDOTDIR; fi\n`;
}

function integration(dir, base, restore) {
  fs.mkdirSync(dir, { recursive: true });
  const root = fs.mkdtempSync(path.join(dir, 'session-'));
  const z = path.join(root, 'zsh');
  fs.mkdirSync(z, { mode: 0o700 });
  const initial = `__kit_user_zdotdir_set=${quote(Object.hasOwn(base, 'ZDOTDIR') ? '1' : '')}\n__kit_user_zdotdir=${quote(base.ZDOTDIR || '')}\n`;
  for (const file of ['.zshenv', '.zprofile', '.zshrc', '.zlogin']) {
    const body = (file === '.zshenv' ? initial : '') + userZdotdir()
      + `[[ -f "\${ZDOTDIR-$HOME}/${file}" ]] && source "\${ZDOTDIR-$HOME}/${file}"\n`
      + `[[ -o rcs && -o login ]] || 'builtin' 'exit' 125\n`
      + `__kit_user_zdotdir_set=\${ZDOTDIR+x}; __kit_user_zdotdir=\${ZDOTDIR-}\n`
      + (file === '.zlogin' ? userZdotdir() + restore + ZSH_HOOKS : `export ZDOTDIR=${quote(z)}\n`);
    fs.writeFileSync(path.join(z, file), body, { mode: 0o600 });
  }
  const bashrc = path.join(root, 'bashrc');
  fs.writeFileSync(bashrc, `[[ -f "$HOME/.bashrc" ]] && source "$HOME/.bashrc"\n${restore}${BASH}`, { mode: 0o600 });
  return { root, zdotdir: z, bashrc };
}

function launchTarget(env, cwd) {
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  const kind = path.basename(shell);
  if (!['zsh', 'bash'].includes(kind)) return { error: 'unsupported shell', detail: 'target restoration requires zsh or bash' };
  if (Object.keys(env).some(key => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))) return { error: 'invalid environment' };
  const actualCwd = fs.realpathSync(cwd || os.homedir());
  return { shell, kind, cwd: actualCwd, restore: restoreTarget(env, actualCwd, kind),
    base: { ...process.env, ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } };
}

/** a parser of the integration sequences in the output stream: calls onCommand({ command, exit }) once per command */
function commandParser(onCommand) {
  let buf = '', pending = null;
  return data => {
    buf = (buf + data).slice(-8192);
    const re = /\x1b\]633;([ED]);([^\x07]*)\x07/g;
    let m, last = 0;
    while ((m = re.exec(buf))) {
      last = re.lastIndex;
      if (m[1] === 'E') pending = Buffer.from(m[2], 'base64').toString('utf8');
      else if (pending != null) { onCommand({ command: pending, exit: Number(m[2]) }); pending = null; }
    }
    if (last) buf = buf.slice(last);
  };
}

const NATIVE_HOME = os.userInfo().homedir;
const ACCOUNT_TIMEOUT_MS = 10000;
const MAX_REMOTE_MS = 60 * 60 * 1000;
const REMOTE_STOP_MS = 2000;
const MAX_REMOTE_SESSIONS = 4;
const REMOTE_REAP_MS = 1000;
const REMOTE_REAP_POLL_MS = 100;

function terminalFailure(code) {
  return { error: code.toLowerCase().replaceAll('_', ' '), code };
}

function remoteTarget(config, contextId, nowMs = Date.now()) {
  if (!config || config.version !== 1 || !Array.isArray(config.targets)) return terminalFailure('REMOTE_UNCONFIGURED');
  const matches = config.targets.filter(target => target?.contextId === contextId);
  if (matches.length !== 1) return terminalFailure('REMOTE_UNCONFIGURED');
  const target = matches[0];
  const expiresAtMs = Date.parse(target.expiresAt), authExpiresAtMs = Date.parse(target.authExpiresAt);
  if (target.transport !== 'aws-ssm'
    || !target.session || typeof target.session !== 'object' || Array.isArray(target.session)
    || target.session.kind !== 'default-shell' || Object.keys(target.session).length !== 1
    || Object.hasOwn(target, 'document') || Object.hasOwn(target, 'parameters')
    || !/^[0-9]{12}$/.test(target.accountId || '') || !/^[a-z]{2}(?:-[a-z]+)+-[0-9]+$/.test(target.region || '')
    || !/^i-[0-9a-f]{17}$/.test(target.instanceId || '') || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(target.profile || '')
    || typeof contextId !== 'string' || !contextId.length || contextId.length > 256 || /[\x00-\x1f\x7f]/.test(contextId)
    || !/^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/.test(target.scope || '')
    || typeof target.remoteKubeconfigPath !== 'string' || !target.remoteKubeconfigPath.startsWith('/') || /[\x00-\x1f\x7f]/.test(target.remoteKubeconfigPath) || target.remoteKubeconfigPath.length > 1024
    || typeof target.remoteContext !== 'string' || !target.remoteContext.length || target.remoteContext.length > 256 || /[\x00-\x1f\x7f]/.test(target.remoteContext)
    || !/^[a-z_][a-z0-9_-]{0,63}$/.test(target.remoteUser || '')
    || target.interactiveVerified !== true || target.remoteContextVerified !== true || target.identityVerified !== true
    || !Number.isFinite(expiresAtMs) || !Number.isFinite(authExpiresAtMs)
    || !Number.isSafeInteger(target.maxDurationMs) || target.maxDurationMs < 1000 || target.maxDurationMs > MAX_REMOTE_MS
    || !Number.isSafeInteger(target.idleTimeoutMs) || target.idleTimeoutMs < 1000 || target.idleTimeoutMs > target.maxDurationMs) return terminalFailure('REMOTE_UNCONFIGURED');
  const deadlineMs = Math.min(expiresAtMs, authExpiresAtMs);
  if (deadlineMs <= nowMs) return terminalFailure('REMOTE_EXPIRED');
  return { mode: 'remote', contextId, transport: 'aws-ssm', accountId: target.accountId,
    region: target.region, instanceId: target.instanceId, profile: target.profile, session: { kind: 'default-shell' },
    scope: target.scope, remoteContext: target.remoteContext, remoteKubeconfigPath: target.remoteKubeconfigPath, remoteUser: target.remoteUser,
    expiresAt: new Date(deadlineMs).toISOString(), maxDurationMs: target.maxDurationMs, idleTimeoutMs: target.idleTimeoutMs };
}

/* the AWS CLI and the Session Manager plugin for remote mode: a path the remote config names (executables.aws,
   executables.sessionManagerPlugin) or the first valid one on PATH, then the standard install folders. A candidate must resolve to a
   regular executable file owned by root or this user and not writable by group or others; the resolved path is what runs. A configured
   path that fails is refused rather than replaced by a search */
const STANDARD_BIN = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
function findExecutables({ env = process.env, config = null, home = NATIVE_HOME, uid = process.getuid?.(), fsImpl = fs } = {}) {
  const valid = file => {
    try {
      const real = fsImpl.realpathSync(file), st = fsImpl.statSync(real), dir = fsImpl.statSync(path.dirname(real));
      if (!st.isFile() || !(st.uid === 0 || st.uid === uid) || (st.mode & 0o022) || (dir.mode & 0o022)) return null;
      fsImpl.accessSync(real, fs.constants.X_OK);
      return real;
    } catch { return null; }
  };
  const dirs = [...String(env.PATH || '').split(path.delimiter).filter(d => path.isAbsolute(d)), ...STANDARD_BIN];
  const find = (name, configured, extra) => {
    if (configured !== undefined) {
      const hit = typeof configured === 'string' && path.isAbsolute(configured) ? valid(configured) : null;
      if (!hit) throw new Error(`remote executable ${name} not usable`);
      return hit;
    }
    for (const d of [...new Set([...dirs, ...extra])]) { const hit = valid(path.join(d, name)); if (hit) return hit; }
    throw new Error(`remote executable ${name} not found`);
  };
  const named = config?.executables || {};
  return { aws: find('aws', named.aws, []),
    plugin: find('session-manager-plugin', named.sessionManagerPlugin, [path.join(home, '.local/share/aws-session-manager-plugin/bin'), '/usr/local/sessionmanagerplugin/bin']) };
}

function remoteEnvironment(plugin) {
  const home = NATIVE_HOME;
  return { HOME: home, PATH: path.dirname(plugin), LANG: 'C', LC_ALL: 'C', TMPDIR: '/tmp',
    TERM: 'xterm-256color', COLORTERM: 'truecolor', AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off',
    AWS_EC2_METADATA_DISABLED: 'true', AWS_CONFIG_FILE: path.join(home, '.aws/config'),
    AWS_SHARED_CREDENTIALS_FILE: path.join(home, '.aws/credentials') };
}

function awsAccount(target, executables, env, timeoutMs) {
  let child;
  const result = new Promise((resolve, reject) => {
    const argv = ['--profile', target.profile, '--region', target.region, 'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'];
    child = execFile(executables.aws, argv, { env, timeout: timeoutMs, maxBuffer: 1024, killSignal: 'SIGKILL', windowsHide: true }, (error, stdout) => {
      const accountId = typeof stdout === 'string' ? stdout.trim() : '';
      if (error || !/^[0-9]{12}$/.test(accountId)) { reject(new Error('remote identity check failed')); return; }
      resolve(accountId);
    });
    child.stdin?.end();
  });
  return { result, cancel() { child?.kill('SIGTERM'); } };
}

function processGroups() {
  function members(groupId) {
    const text = execFileSync('/bin/ps', ['-axo', 'pid=,pgid=,lstart='], { encoding: 'utf8', timeout: 1000, maxBuffer: 4 * 1024 * 1024 });
    return text.split('\n').flatMap(line => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
      return match && Number(match[2]) === groupId ? [{ pid: Number(match[1]), started: match[3] }] : [];
    });
  }
  return {
    capture(pid) {
      if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) throw new Error('remote process identity unavailable');
      const known = members(pid);
      if (!known.some(member => member.pid === pid)) throw new Error('remote process group unavailable');
      return { groupId: pid, known };
    },
    signal(identity, signal) {
      const current = members(identity.groupId);
      if (!current.length) return true;
      if (!current.some(member => identity.known.some(known => known.pid === member.pid && known.started === member.started))) return false;
      identity.known = current;
      try { process.kill(-identity.groupId, signal); } catch (error) { if (error.code !== 'ESRCH') return false; }
      return true;
    },
    empty(identity) { return members(identity.groupId).length === 0; },
  };
}

function create({ userData, send, remoteConfig, terminalProgram, ptyLoader = load, groups = processGroups(), accountClient = awsAccount, executableResolver = null, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  remoteConfig = remoteConfig ? structuredClone(remoteConfig) : null;
  executableResolver ??= () => findExecutables({ config: remoteConfig });
  const sessions = new Map();
  function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(id); }
  function owned(id, owner) {
    const session = sessions.get(id);
    return session && session.owner === owner ? session : null;
  }
  function clearRemoteTimers(session) { clearTimer(session.deadline); clearTimer(session.idle); }
  function finishRemote(session, state) {
    if (sessions.get(session.id) !== session) return;
    clearRemoteTimers(session); clearTimer(session.stopTimer);
    if (!['cleanup_failed', 'cleanup_pending'].includes(state)) sessions.delete(session.id);
    session.finished = true; session.finalState = state;
    session.complete({ id: session.id, state });
    send(session.owner, 'pty-exit', session.id, session.exitCode ?? null, { mode: 'remote', state, target: session.target });
  }
  function checkRemoteStopped(session, state, remainingMs) {
    try { if (groups.empty(session.group)) { finishRemote(session, state); return; } } catch { finishRemote(session, 'cleanup_failed'); return; }
    if (remainingMs <= 0) { finishRemote(session, 'cleanup_failed'); return; }
    session.stopTimer = setTimer(() => checkRemoteStopped(session, state, remainingMs - REMOTE_REAP_POLL_MS), REMOTE_REAP_POLL_MS);
  }
  function stopRemote(session, state) {
    if (session.closing || session.finished) return session.done;
    session.closing = true; clearRemoteTimers(session);
    if (session.phase === 'preflight') {
      let cancelled = true;
      try { session.account?.cancel(); } catch { cancelled = false; }
      finishRemote(session, cancelled ? state : 'cleanup_failed');
      return session.done;
    }
    let signalled = false;
    try { signalled = groups.signal(session.group, 'SIGTERM'); } catch { /* identity failure must not signal an unrelated group */ }
    if (!signalled) { finishRemote(session, 'cleanup_failed'); return session.done; }
    session.stopTimer = setTimer(() => {
      try { if (!groups.empty(session.group) && !groups.signal(session.group, 'SIGKILL')) { finishRemote(session, 'cleanup_failed'); return; } }
      catch { finishRemote(session, 'cleanup_failed'); return; }
      checkRemoteStopped(session, state, REMOTE_REAP_MS);
    }, REMOTE_STOP_MS);
    return session.done;
  }
  function armIdle(session) {
    clearTimer(session.idle);
    session.idle = setTimer(() => stopRemote(session, 'expired'), session.target.idleTimeoutMs);
  }
  async function openRemote(input, owner) {
    if (!Number.isInteger(input.cols ?? 80) || !Number.isInteger(input.rows ?? 24) || (input.cols ?? 80) < 1 || (input.rows ?? 24) < 1 || (input.cols ?? 80) > 1000 || (input.rows ?? 24) > 1000) return terminalFailure('REMOTE_ARGUMENTS_REJECTED');
    if (Object.keys(input).some(key => !['id', 'mode', 'contextId', 'cols', 'rows'].includes(key))) return terminalFailure('REMOTE_ARGUMENTS_REJECTED');
    const target = remoteTarget(remoteConfig, input.contextId, now());
    if (target.error) return target;
    const previous = sessions.get(input.id);
    if (previous) return previous.owner === owner && previous.mode === 'remote' && previous.target.contextId === target.contextId && !previous.closing
      ? { id: input.id, mode: 'remote', state: previous.phase === 'preflight' ? 'identity_checking' : 'connecting', accountVerified: previous.phase === 'pty', target: previous.target, reused: true } : terminalFailure('TERMINAL_SESSION_CONFLICT');
    if ([...sessions.values()].filter(session => session.mode === 'remote').length >= MAX_REMOTE_SESSIONS) return terminalFailure('REMOTE_SESSION_LIMIT');
    let executables;
    try { executables = executableResolver(); } catch { return terminalFailure('REMOTE_EXECUTABLE_UNAVAILABLE'); }
    const env = remoteEnvironment(executables.plugin);
    const session = { id: input.id, owner, mode: 'remote', target, phase: 'preflight', closing: false, finished: false };
    session.done = new Promise(resolve => { session.complete = resolve; });
    sessions.set(input.id, session);
    session.deadlineAtMs = Math.min(now() + target.maxDurationMs, Date.parse(target.expiresAt));
    session.deadline = setTimer(() => stopRemote(session, 'expired'), session.deadlineAtMs - now());
    armIdle(session);
    let accountId;
    try {
      session.account = accountClient(target, executables, env, Math.min(ACCOUNT_TIMEOUT_MS, target.maxDurationMs, Date.parse(target.expiresAt) - now()));
      accountId = await session.account.result;
    } catch {
      if (session.closing) return terminalFailure(session.finalState === 'expired' ? 'REMOTE_EXPIRED' : 'REMOTE_PREFLIGHT_CANCELLED');
      finishRemote(session, 'identity_failed');
      return terminalFailure('REMOTE_IDENTITY_FAILED');
    }
    if (session.closing || sessions.get(input.id) !== session) return terminalFailure(session.finalState === 'expired' ? 'REMOTE_EXPIRED' : 'REMOTE_PREFLIGHT_CANCELLED');
    if (session.deadlineAtMs <= now()) { finishRemote(session, 'expired'); return terminalFailure('REMOTE_EXPIRED'); }
    if (accountId !== target.accountId) { finishRemote(session, 'account_mismatch'); return terminalFailure('REMOTE_ACCOUNT_MISMATCH'); }
    const pty = ptyLoader();
    if (!pty) { finishRemote(session, 'unavailable'); return terminalFailure('REMOTE_PTY_UNAVAILABLE'); }
    const argv = ['--profile', target.profile, '--region', target.region, 'ssm', 'start-session', '--target', target.instanceId];
    let proc, group;
    try {
      // Recheck the resolved paths after credential resolution, immediately before the SSM process.
      const current = executableResolver();
      if (current.aws !== executables.aws || current.plugin !== executables.plugin) throw new Error('remote executable changed');
      proc = pty.spawn(executables.aws, argv, { name: 'xterm-256color', cols: input.cols || 80, rows: input.rows || 24, cwd: NATIVE_HOME, env });
      group = groups.capture(proc.pid);
    } catch {
      try { proc?.kill(); } catch { /* no fallback on spawn or identity failure */ }
      clearRemoteTimers(session);
      if (proc) {
        session.proc = proc; session.closing = true; session.finished = true;
        session.complete({ id: input.id, state: 'cleanup_failed' });
        return { ...terminalFailure('REMOTE_START_FAILED'), cleanup: 'unconfirmed' };
      }
      finishRemote(session, 'start_failed');
      return terminalFailure('REMOTE_START_FAILED');
    }
    session.proc = proc; session.group = group; session.phase = 'pty';
    proc.onData(data => { if (!session.closing) send(owner, 'pty-data', input.id, data); });
    proc.onExit(({ exitCode }) => { session.exitCode = exitCode; stopRemote(session, 'disconnected'); });
    return { id: input.id, mode: 'remote', state: 'connecting', accountVerified: true, target };
  }
  return {
    available: () => !!ptyLoader(),
    open(input, owner) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || !validId(input.id) || !owner) return terminalFailure('INVALID_TERMINAL_REQUEST');
      if (input.mode === 'remote') return openRemote(input, owner);
      if (input.mode === 'attached') {
        const { id, ticket, cols = 80, rows = 24 } = input;
        if (sessions.has(id) || typeof ticket !== 'string' || !/^[a-f0-9-]{36}$/.test(ticket)
          || Object.keys(input).some(key => !['id', 'ticket', 'mode', 'cols', 'rows'].includes(key))) return terminalFailure('INVALID_TERMINAL_REQUEST');
        if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 1000 || rows > 1000) return terminalFailure('INVALID_TERMINAL_REQUEST');
        const proc = terminalProgram?.(ticket, owner, cols, rows);
        if (!proc) return terminalFailure('TERMINAL_UNAVAILABLE');
        const session = { proc, owner, mode: 'attached' };
        sessions.set(id, session);
        proc.onData(data => send(owner, 'pty-data', id, data));
        proc.onExit(({ exitCode }) => { if (sessions.get(id) === session) sessions.delete(id); send(owner, 'pty-exit', id, exitCode); });
        return { id, mode: 'attached' };
      }
      if (input.mode !== 'local') return terminalFailure('TERMINAL_MODE_REQUIRED');
      const { id, env = {}, cols = 80, rows = 24, cwd } = input;
      if (sessions.has(id)) return owned(id, owner)?.mode === 'local' ? { id, user: os.userInfo().username, reused: true } : terminalFailure('TERMINAL_SESSION_CONFLICT');
      const target = launchTarget(env, cwd);
      if (target.error) return target;
      if (!ptyLoader()) return { error: 'unavailable', detail: String(loadError?.message || loadError) };
      const files = integration(path.join(userData, 'terminal'), target.base, target.restore);
      const args = target.kind === 'zsh' ? ['-l', '-i'] : ['--rcfile', files.bashrc, '-i'];
      if (target.kind === 'zsh') target.base.ZDOTDIR = files.zdotdir;
      let proc;
      try { proc = ptyLoader().spawn(target.shell, args, { name: 'xterm-256color', cols, rows, cwd: target.cwd, env: target.base }); }
      catch (error) { fs.rmSync(files.root, { recursive: true, force: true }); throw error; }
      const session = { proc, owner, mode: 'local' };
      const parse = commandParser(command => send(owner, 'pty-command', id, command));
      proc.onData(data => { parse(data); send(owner, 'pty-data', id, data); });
      proc.onExit(({ exitCode }) => { if (sessions.get(id) === session) sessions.delete(id); fs.rmSync(files.root, { recursive: true, force: true }); send(owner, 'pty-exit', id, exitCode); });
      sessions.set(id, session);
      return { id, mode: 'local', user: os.userInfo().username };
    },
    run(input, owner) {
      if (!input || input.mode !== 'local' || !validId(input.id) || !owner) return terminalFailure('TERMINAL_MODE_REQUIRED');
      const { id, command, env = {}, cols = 80, rows = 24, cwd, onExit } = input;
      const old = sessions.get(id);
      if (old && (old.owner !== owner || old.mode !== 'local')) return terminalFailure('TERMINAL_SESSION_CONFLICT');
      const target = launchTarget(env, cwd);
      if (target.error) return target;
      if (!ptyLoader()) return { error: 'unavailable', detail: String(loadError?.message || loadError) };
      if (old) { sessions.delete(id); try { old.proc.kill(); } catch { /* exited */ } }
      const proc = ptyLoader().spawn(target.shell, ['-l', '-i', '-c', target.restore + String(command)], { name: 'xterm-256color', cols, rows, cwd: target.cwd, env: target.base });
      const session = { proc, owner, mode: 'local' };
      proc.onData(data => send(owner, 'pty-data', id, data));
      /* onExit: the main process's own cleanup for this run (files it prepared for the command), called once the process ends */
      proc.onExit(({ exitCode, signal }) => { if (sessions.get(id) === session) sessions.delete(id); try { onExit?.(); } catch { /* best effort */ } send(owner, 'pty-exit', id, signal ? null : exitCode); });
      sessions.set(id, session);
      return { id, mode: 'local', user: os.userInfo().username };
    },
    write(id, data, owner) { const session = owned(id, owner); if (!session || session.closing || !session.proc) return false; session.proc.write(String(data)); if (session.mode === 'remote') armIdle(session); return true; },
    resize(id, cols, rows, owner) { const session = owned(id, owner); if (!session || session.closing || !session.proc || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 1000 || rows > 1000) return false; try { session.proc.resize(cols, rows); return true; } catch { return false; } },
    close(id, owner) { const session = owned(id, owner); if (!session) return false; if (session.mode === 'remote') stopRemote(session, 'cancelled'); else { sessions.delete(id); try { session.proc.kill(); } catch { /* exited */ } } return true; },
    closeAll(owner) { const pending = []; for (const [id, session] of sessions) if (!owner || session.owner === owner) { if (session.mode === 'remote') pending.push(stopRemote(session, 'disconnected')); else { sessions.delete(id); try { session.proc.kill(); } catch { /* exited */ } } } return Promise.all(pending); },
  };
}

module.exports = { create, commandParser, remoteTarget, findExecutables };
