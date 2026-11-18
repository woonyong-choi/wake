/* Kit public entry (Electron main process) */
const { remoteTarget } = require('./terminal.cjs');

function start(...args) {
  return require('./main.cjs').start(...args);
}

/* the source state -> source chip table the pages use (kit/core/live.js), for main-process code that builds chip rows.
   Loaded on first use, so requiring this entry still loads only terminal.cjs */
function sourceView(state) {
  return require('../core/live.js').sourceView(state);
}

/* one gate in front of a server (kit/core/live.js createRequestGate): identical requests in flight shared, a cap of concurrent requests per lane */
function createRequestGate(options) {
  return require('../core/live.js').createRequestGate(options);
}

module.exports = { start, remoteTarget, sourceView, createRequestGate };
