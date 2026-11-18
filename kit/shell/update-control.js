const HIDDEN_STATES = new Set(['idle', 'unconfigured', 'unsupported']);
const ACTIVE_STATES = new Set(['checking', 'downloading', 'installing']);
const POLL_INTERVAL_MS = 1000;

/** Convert native update state to a presentation; percentages use byte counters only. */
export function updatePresentation(snapshot, pending = false) {
  if (!snapshot || HIDDEN_STATES.has(snapshot.state)) return null;
  const common = { disabled: pending, progress: null, busy: false };
  switch (snapshot.state) {
    case 'checking': return { ...common, label: 'update.checking', busy: true, disabled: true };
    case 'available': return { ...common, label: snapshot.reason === 'download_approval_required' ? 'update.approvalRequired' : 'update.download', icon: 'download', action: 'download' };
    case 'downloading': {
      const received = snapshot.receivedBytes, total = snapshot.totalBytes;
      const known = Number.isSafeInteger(received) && received >= 0 && Number.isSafeInteger(total) && total > 0 && received <= total;
      return { ...common, label: 'update.cancel', status: 'update.downloading', icon: 'cross-small', action: 'cancel', busy: !known, progress: known ? received / total * 100 : null };
    }
    case 'downloaded': return { ...common, label: snapshot.canInstall === true ? 'update.restartBlocked' : 'update.restartUnavailable', icon: 'arrow-rotate-clockwise', disabled: true };
    case 'installing': return { ...common, label: 'update.installing', busy: true, disabled: true };
    case 'error': return { ...common, label: 'update.retry', icon: 'arrow-rotate-clockwise', action: 'details', retry: snapshot.releaseVersion ? 'download' : 'check' };
    default: return null;
  }
}

/** Own state requests without manufacturing native success or accepting renderer URLs. */
export function createUpdateControl({ call, onChange, onError, schedule = setTimeout, cancelSchedule = clearTimeout }) {
  let snapshot = null, timer = null, stopped = false, reading = null, readFailed = false;
  const pending = new Set();
  const publish = () => {
    const view = updatePresentation(snapshot, pending.has('cancel') || (pending.size > 0 && snapshot?.state !== 'downloading'));
    onChange(readFailed && view && snapshot.state === 'downloading' ? { ...view, progress: null, busy: true, status: 'update.refreshFailed' } : view);
  };
  const clearPoll = () => { if (timer !== null) cancelSchedule(timer); timer = null; };
  function poll() {
    clearPoll();
    if (!stopped && (pending.size || ACTIVE_STATES.has(snapshot?.state))) {
      timer = schedule(() => { timer = null; void refresh().then(poll); }, POLL_INTERVAL_MS);
    }
  }
  function failed() {
    if (!stopped) { if (!readFailed) onError(); readFailed = true; publish(); }
  }
  async function refresh() {
    if (stopped) return;
    if (reading) return reading;
    reading = (async () => {
      try {
        const next = await call('kit.update.state', {});
        if (!stopped) { snapshot = next; readFailed = false; publish(); }
      } catch { failed(); }
    })();
    try { await reading; } finally { reading = null; }
  }
  async function request(method) {
    if (stopped || pending.has(method)) return;
    pending.add(method); publish();
    try {
      // A download may resolve only after streaming; read state and allow cancel while it runs.
      const result = call('kit.update.' + method, {});
      poll();
      await result;
      if (reading) await reading;
      await refresh();
    } catch { failed(); }
    finally { pending.delete(method); if (!stopped) { publish(); poll(); } }
  }
  return {
    get status() { return snapshot ? { ...snapshot } : null; },
    async start() { await refresh(); if (!stopped && snapshot?.state === 'idle') await request('check'); else poll(); },
    run(method) {
      const view = updatePresentation(snapshot, pending.has('cancel') || (pending.size > 0 && snapshot?.state !== 'downloading'));
      return view && !view.disabled && (view.action === method || view.retry === method) && method !== 'details' ? request(method) : Promise.resolve();
    },
    stop() { stopped = true; clearPoll(); },
  };
}
