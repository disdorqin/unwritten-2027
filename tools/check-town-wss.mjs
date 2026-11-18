import { get } from 'node:https';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const site = new URL(process.argv[2] ?? 'https://town.disdorqin.cn/');
if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) {
  throw new Error('Expected an HTTPS site origin, such as https://town.disdorqin.cn/');
}
const timeoutMs = 10_000;
const targetTimeMs = 60_000;
const page = new Promise(resolve => {
  const request = get(site, { timeout: timeoutMs, headers: { 'Cache-Control': 'no-cache' } }, response => {
    response.setEncoding('utf8');
    let text = '';
    response.on('data', chunk => { if (text.length < 65_536) text += chunk.slice(0, 65_536 - text.length); });
    response.on('end', () => resolve({ status: response.statusCode, townPage: text.includes('id="scene"') && text.includes('id="walk"') }));
    response.on('error', error => resolve({ status: response.statusCode, error: error.message }));
  });
  request.on('timeout', () => request.destroy(new Error('HTTPS timeout')));
  request.on('error', error => resolve({ status: null, error: error.message }));
});

const websocket = new Promise(resolve => {
  const url = new URL('/presence', site);
  url.protocol = 'wss:';
  const socket = new WebSocket(url, { origin: site.origin, handshakeTimeout: timeoutMs });
  const marker = randomUUID().slice(0, 8);
  let status = null, started = null, selfJoined = false, pings = 0, pongs = 0, lastPong = 0, expected = '';
  let finished = false;
  let heartbeat;
  const deadline = setTimeout(() => finish('60 秒保活检查超时'), targetTimeMs + timeoutMs + 6_000);
  function finish(error) {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    clearInterval(heartbeat);
    const elapsedMs = started === null ? 0 : Math.round(performance.now() - started);
    socket.terminate();
    resolve({ status, selfJoined, elapsedMs, pings, pongs, passed60s: !error && status === 101 && selfJoined && lastPong >= targetTimeMs, ...(error && { error }) });
  }
  socket.on('upgrade', response => { status = response.statusCode; });
  socket.on('unexpected-response', (_request, response) => {
    status = response.statusCode;
    response.resume();
    finish('WebSocket upgrade refused');
  });
  socket.on('open', () => {
    started = performance.now();
    socket.send(JSON.stringify({ type: 'join', name: '联机诊断 ' + marker }));
    heartbeat = setInterval(() => {
      expected = marker + '/' + (++pings);
      socket.ping(expected);
    }, 10_000);
  });
  socket.on('message', (data, binary) => {
    if (!binary) {
      try { selfJoined ||= JSON.parse(data.toString()).self === true; } catch {}
    }
  });
  socket.on('pong', data => {
    if (data.toString() !== expected) return;
    ++pongs;
    lastPong = performance.now() - started;
    if (lastPong >= targetTimeMs && selfJoined) finish(pongs < 6 || pings !== pongs ? '直连 pong 不完整' : undefined);
  });
  socket.on('error', error => finish(error.message));
  socket.on('close', (code, reason) => finish('WebSocket closed ' + code + ' ' + reason.toString()));
});

const [pageResult, websocketResult] = await Promise.all([page, websocket]);
const result = { at: new Date().toISOString(), origin: site.origin, page: pageResult, websocket: websocketResult };
console.log(JSON.stringify(result));
if (pageResult.status !== 200 || !pageResult.townPage || !websocketResult.passed60s) process.exitCode = 1;
