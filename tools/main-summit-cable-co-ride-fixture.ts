import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { createMainSummitCable, type SummitCablePoint } from './voxel-tavern/town-blockout/main-summit-cable';
import { createSummitCableRideRoster } from './voxel-tavern/town-blockout/main-summit-cable-ride-roster';

const path = '/p2-co-ride';

function validFeet(feet: unknown): feet is SummitCablePoint {
  if (!feet || typeof feet !== 'object') return false;
  return 'east' in feet && 'north' in feet && 'height' in feet &&
    Number.isFinite(feet.east) && Number.isFinite(feet.north) && Number.isFinite(feet.height);
}

/** A loopback-only transport for the two-browser P-2 walk-through. */
export function mountSummitCableCoRideServer(server: Server) {
  const transport = new WebSocketServer({ noServer: true, maxPayload: 512, perMessageDeflate: false });
  const roster = createSummitCableRideRoster(createMainSummitCable(0, 10_000, 347));
  const clients = new Map<WebSocket, string>();
  let nowMs = 0;
  let nextId = 1;
  let closing: Promise<void> | undefined;

  type Exit = NonNullable<ReturnType<typeof roster.exit>>;
  type Reply = { exit?: Exit; rejected?: boolean };

  function send(socket: WebSocket, selfId: string, riders = roster.snapshot(), reply: Reply = {}) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ kind: 'snapshot', nowMs, selfId, riders, ...reply }));
    }
  }

  function broadcast(issuer?: WebSocket, reply?: Reply) {
    const riders = roster.snapshot();
    for (const [socket, selfId] of clients) send(socket, selfId, riders, socket === issuer ? reply : undefined);
  }

  transport.on('connection', socket => {
    const selfId = String(nextId++);
    clients.set(socket, selfId);
    socket.on('message', (data, binary) => {
      if (binary || !Buffer.isBuffer(data)) return;
      let action: unknown;
      try {
        action = JSON.parse(data.toString('utf8'));
      } catch {
        send(socket, selfId, undefined, { rejected: true });
        return;
      }
      if (action && typeof action === 'object' && 'kind' in action) {
        if (action.kind === 'board' && 'cabinIndex' in action && 'feet' in action &&
          (action.cabinIndex === 0 || action.cabinIndex === 1) && validFeet(action.feet)) {
          if (roster.board(selfId, nowMs, action.cabinIndex, action.feet)) {
            broadcast();
            return;
          }
        } else if (action.kind === 'exit') {
          const exit = roster.exit(selfId, nowMs);
          if (exit) {
            broadcast(socket, { exit });
            return;
          }
        }
      }
      send(socket, selfId, undefined, { rejected: true });
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clients.delete(socket);
      roster.disconnect(selfId);
      if (!closing) broadcast();
    });
    send(socket, selfId);
  });

  function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    if (request.url !== path) return;
    const remote = request.socket.remoteAddress;
    if (remote !== '::1' && !remote?.startsWith('127.') && !remote?.startsWith('::ffff:127.')) {
      socket.destroy();
      return;
    }
    transport.handleUpgrade(request, socket, head, client => transport.emit('connection', client, request));
  }
  server.on('upgrade', upgrade);

  return {
    setTime(timeMs: number) {
      if (!Number.isFinite(timeMs)) throw new RangeError('Invalid P-2 fixture time.');
      nowMs = timeMs;
      broadcast();
    },
    close() {
      if (closing) return closing;
      server.off('upgrade', upgrade);
      closing = new Promise((resolve, reject) => {
        transport.close(error => error ? reject(error) : resolve());
      });
      for (const socket of clients.keys()) socket.terminate();
      return closing;
    },
  };
}
