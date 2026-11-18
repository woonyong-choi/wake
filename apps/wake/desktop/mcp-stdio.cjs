#!/usr/bin/env node
/*
 * stdio MCP 다리: stdio로 MCP 서버를 띄우는 클라이언트가 이 파일을 실행하면, 한 줄에 하나인 JSON-RPC 메시지를 데스크톱 허브의 /mcp(127.0.0.1)로
 * 보내고 응답을 stdout에 쓴다. 도구는 모두 허브(데스크톱 앱 메인 프로세스)에 있다. 데스크톱 앱이 켜져 있고 설정 › AI 연결에서 MCP가 켜져 있어야 한다.
 *   환경: WAKE_MCP_TOKEN(클라이언트 토큰, 필수), WAKE_MCP_URL(기본 http://127.0.0.1:47821/mcp)
 *   예: { "command": "node", "args": ["<Wake>/apps/wake/desktop/mcp-stdio.cjs"], "env": { "WAKE_MCP_TOKEN": "wake_…" } }
 */
const readline = require('node:readline');
const { DEFAULT_PORT, HOST } = require('./hub-server.cjs');

const url = process.env.WAKE_MCP_URL || `http://${HOST}:${DEFAULT_PORT}/mcp`;
const token = process.env.WAKE_MCP_TOKEN;
const out = msg => process.stdout.write(JSON.stringify(msg) + '\n');
if (!token) { process.stderr.write('WAKE_MCP_TOKEN is required\n'); process.exit(2); }

let pending = Promise.resolve();
readline.createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return;
  pending = pending.then(async () => {
    let msg;
    try { msg = JSON.parse(line); } catch { out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); return; }
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` }, body: line });
      if (r.status === 202) return;
      const body = await r.json().catch(() => null);
      if (r.ok && body) { for (const m of [].concat(body)) out(m); return; }
      if (msg.id !== undefined) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `wake hub: ${body?.error ?? r.status}` } });
    } catch (error) {
      if (msg.id !== undefined) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `wake hub unreachable: ${error.cause?.code ?? error.message}` } });
    }
  });
}).on('close', () => { pending.then(() => process.exit(0)); });
