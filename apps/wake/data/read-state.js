export function readIdentity(cluster, source, query, range) {
  const window = range?.preset ? { preset: range.preset }
    : range ? { from: range.from, to: range.to, live: range.live === true } : null;
  return JSON.stringify([cluster, source, query, window]);
}

export function retainRead(previous, { before, after, error, target, sourceState } = {}) {
  if (!previous || before !== after) return null;
  if (['unconfigured', 'identity_changed', 'cancelled'].includes(error?.kind)) return null;
  if (sourceState?.previous || sourceState?.state === 'unconfigured') return null;
  if (target?.uid && sourceState?.target?.uid && target.uid !== sourceState.target.uid) return null;
  return previous;
}

export function createReadGuard() {
  let generation = 0;
  return () => {
    const started = ++generation;
    return () => started === generation;
  };
}

export function matchesReadTarget(target, sourceState) {
  if (sourceState?.state === 'unconfigured') return false;
  if (sourceState?.previous && (!target?.uid || target.uid !== sourceState.target?.uid)) return false;
  return !target?.uid || !sourceState?.target?.uid || target.uid === sourceState.target.uid;
}
