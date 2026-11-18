/*
 * 포트 포워딩(kubectl port-forward와 같은 방식): 내 컴퓨터 127.0.0.1의 빈 포트 -> 쿠버네티스 API -> Pod 포트.
 * 내 kubeconfig 권한 그대로 쓰며 에이전트를 통로로 쓰지 않는다(8-11).
 * 들어오는 TCP 연결마다 API 서버에 WebSocket(v4.channel.k8s.io) 하나를 열어 이어 준다. 채널 0은 자료, 1은 오류,
 * 서버가 채널마다 처음 보내는 2바이트(포트 번호)는 버린다. 연결이 끊기면 다음 연결이 새 WebSocket을 열고,
 * Pod가 바뀌어 열리지 않으면 Pod를 다시 찾아 한 번 더 연다(자동 재연결).
 */
const net = require('node:net');
const { TOOL_REQUEST_TIMEOUT_MS } = require('../data/tool-connection-limits.js');
const crypto = require('node:crypto');

const PROTOCOL = 'v4.channel.k8s.io';

/* WebSocket 프레임(클라이언트 -> 서버는 마스크 필수) */
function frame(opcode, payload) {
  const len = payload.length, mask = crypto.randomBytes(4);
  const head = len < 126 ? Buffer.from([0x80 | opcode, 0x80 | len]) : len < 65536 ? Buffer.from([0x80 | opcode, 0x80 | 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
  const body = Buffer.alloc(len); for (let i = 0; i < len; i++) body[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([head, mask, body]);
}
/** 서버 프레임 해석기: onMessage(opcode, payload) */
function reader(onMessage) {
  let buf = Buffer.alloc(0), parts = [], first = 0;
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const key = masked ? buf.subarray(off, off + 4) : null; if (masked) off += 4;
      if (buf.length < off + len) return;
      let data = buf.subarray(off, off + len); buf = buf.subarray(off + len);
      if (key) data = Buffer.from(data.map((b, i) => b ^ key[i & 3]));
      if (op >= 8) { onMessage(op, data); continue; }
      if (op) first = op;
      parts.push(data);
      if (fin) { onMessage(first, Buffer.concat(parts)); parts = []; }
    }
  };
}

/** 하나의 TCP 연결을 Pod 포트로 잇는다 */
async function bridge(client, local, { ns, pod, port }, scopeProvider) {
  const scope = scopeProvider?.();
  scope?.signal?.throwIfAborted();
  const remaining = scope?.deadline === undefined ? TOOL_REQUEST_TIMEOUT_MS : scope.deadline - Date.now();
  if (remaining <= 0) throw new Error('port forward operation expired');
  const route = `/api/v1/namespaces/${encodeURIComponent(ns)}/pods/${encodeURIComponent(pod)}/portforward?ports=${port}`;
  /* the operation's signal bounds the handshake only. The TCP connection it opens outlives that operation: an HTTP client keeps it alive and sends the next
     request (another operation, with its own limit) on it, so a socket tied to the first operation's signal was cut when that one's limit ran out, in the
     middle of a later request that had not reached its own (seen as a dropped connection at ~20 s while the tool was only slow). Each request's limit closes
     its own connection from the local side, which tears this stream down too */
  let handshake = null, follow = null;
  if (scope?.signal) { handshake = new AbortController(); follow = () => handshake.abort(scope.signal.reason); scope.signal.addEventListener('abort', follow, { once: true }); }
  let upgraded;
  try {
    upgraded = scope
      ? await client.upgrade(route, PROTOCOL, { signal: handshake?.signal, timeout: Math.min(TOOL_REQUEST_TIMEOUT_MS, remaining) })
      : await client.upgrade(route, PROTOCOL);
  } finally { if (follow) scope.signal.removeEventListener('abort', follow); }
  const { socket, head } = upgraded;
  const seen = [false, false];
  const read = reader((op, data) => {
    if (op === 8) { local.destroy(); socket.destroy(); return; }
    if (op === 9) { socket.write(frame(10, data)); return; }
    if (op !== 2 || !data.length) return;
    const ch = data[0]; let body = data.subarray(1);
    if (ch > 1) return;
    if (!seen[ch]) { seen[ch] = true; body = body.subarray(2); } // 처음 프레임의 포트 번호
    if (ch === 0 && body.length) local.write(body);
    if (ch === 1 && body.length) { local.destroy(); socket.destroy(); }
  });
  if (head?.length) read(head);
  socket.on('data', read);
  socket.on('close', () => local.destroy());
  socket.on('error', () => local.destroy());
  local.on('data', d => socket.write(frame(2, Buffer.concat([Buffer.from([0]), d]))));
  local.on('close', () => { try { socket.write(frame(8, Buffer.alloc(0))); } catch { /* closed */ } socket.end(); });
  local.on('error', () => socket.destroy());
}

/**
 * 포워더: target()은 { ns, pod, port }를 돌려줌(준비된 Pod를 찾는 함수, Pod가 바뀌면 다시 부름).
 * guard(선택): 새 TCP 연결을 열기 전에 부르며, 던지면 그 연결을 닫는다(신원 확인이 멈춘 동안 새 연결을 막는 용도).
 * 돌려주는 값: { port, close() }
 */
async function forward(client, target, scopeProvider, initialTarget, guard) {
  scopeProvider?.()?.signal?.throwIfAborted();
  let cur = initialTarget ?? await target();
  const server = net.createServer(local => {
    local.pause();
    const admitted = guard ? Promise.resolve().then(guard).then(() => true, () => false) : Promise.resolve(true);
    admitted.then(async ok => {
      if (!ok) { local.destroy(); return; }
      try { await bridge(client, local, cur, scopeProvider); }
      catch { scopeProvider?.()?.signal?.throwIfAborted(); cur = await target(); await bridge(client, local, cur, scopeProvider); }
    }).catch(() => local.destroy()).finally(() => local.resume());
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).on('error', reject));
  return { port: server.address().port, close: () => server.close() };
}

module.exports = { forward, frame, reader };
