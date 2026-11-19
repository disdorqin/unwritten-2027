import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createPresenceServer } from '../../src/presence/server.js';
import {
  decodeSnowballEvents, encodeSnowballHit, encodeSnowballThrow,
} from '../../src/presence/snowball-events.js';
import type { BellEndEvent, BellStateEvent, BellTitleEvent } from '../../src/presence/bell-game.js';

type Control = {
  type: string; id?: number; name?: string; self?: boolean; bell?: boolean;
  kind?: string; reason?: string;
};

type TextValue = Control | BellStateEvent | BellTitleEvent | BellEndEvent;

function inbox<T>(socket: WebSocket, binary: boolean, decode: (frame: Buffer) => T, accept = (_frame: Buffer) => true) {
  const frames: Buffer[] = [];
  let cursor = 0;
  const waiters: { predicate: (value: T) => boolean; resolve: (value: T) => void }[] = [];
  socket.on('message', (raw, isBinary) => {
    if (isBinary !== binary) return;
    const frame = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
    if (!accept(frame)) return;
    frames.push(frame);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].predicate(decode(frame))) {
        const waiter = waiters.splice(i, 1)[0];
        waiter.resolve(decode(frame));
      }
    }
  });
  type Next = {
    <U extends T>(predicate: (value: T) => value is U, timeout?: number): Promise<U>;
    (predicate: (value: T) => boolean, timeout?: number): Promise<T>;
  };
  const next = ((predicate: (value: T) => boolean, timeout = 5000): Promise<T> => {
    for (let i = cursor; i < frames.length; i++) {
      const value = decode(frames[i]);
      if (predicate(value)) {
        cursor = i + 1;
        return Promise.resolve(value);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeout);
      waiters.push({
        predicate,
        resolve: value => {
          cursor = frames.length;
          clearTimeout(timer);
          resolve(value);
        },
      });
    });
  }) as Next;
  return {
    total: (predicate: (value: T) => boolean) => frames.map(decode).filter(predicate).length,
    next,
  };
}

const bellConfig = {
  matchMs: 9_000,
  titleMs: [600, 1_300, 2_200],
  pickupDelayMs: 1_200,
  stealGraceMs: 150,
  stealRadius: 1.3,
  dropRollMetres: 2,
};

async function fixture(context: TestContext) {
  const server = await createPresenceServer({ host: '127.0.0.1', port: 0, bellConfig });
  const url = 'ws://127.0.0.1:' + server.address().port + '/presence';
  const sockets: WebSocket[] = [];
  context.after(async () => {
    for (const socket of sockets) socket.terminate();
    await server.close();
  });

  async function join(name: string) {
    const socket = new WebSocket(url);
    socket.on('error', () => undefined);
    sockets.push(socket);
    const text = inbox<TextValue>(socket, false, raw => JSON.parse(raw.toString()) as TextValue);
    const events = inbox(socket, true, frame => decodeSnowballEvents(frame)!, frame => frame[0] === 0xff);
    await once(socket, 'open');
    const joined = text.next(message => 'type' in message && message.type === 'join' && (message as Control).self === true);
    socket.send(JSON.stringify({ type: 'join', name }));
    const self = await joined as Control;
    assert.equal(self.bell, true, 'join advertises bell support');
    let seq = 0;
    const pose = (east: number, north: number, height = 12) => {
      seq++;
      const bytes = Buffer.alloc(12);
      [0, Math.round(east * 100), Math.round(north * 100), Math.round(height * 100), 0, seq]
        .forEach((value, index) => bytes.writeUInt16LE(value, index * 2));
      socket.send(bytes);
    };
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    return { socket, text, events, pose, send, id: self.id!, name: self.name! };
  }

  return { join };
}

const isBellState = (value: TextValue): value is BellStateEvent =>
  'kind' in value && value.kind === 'bell-state';
const stateWith = (predicate: (state: BellStateEvent) => boolean) =>
  (value: TextValue): value is BellStateEvent => isBellState(value) && predicate(value);

test('bell match runs start, pickup, steal, snowball drop, pickup window, titles and settlement over the wire',
  { timeout: 25_000 }, async context => {
    const { join } = await fixture(context);
    const jia = await join('抢铃甲');
    const yi = await join('抢铃乙');

    // 广场外开局被拒
    jia.pose(100, 100);
    await delay(60);
    jia.send({ type: 'event', kind: 'bell-start' });
    const rejected = await jia.text.next(value => 'type' in value && value.type === 'bell-rejected');
    assert.equal((rejected as Control).reason, 'position');

    // 广场内开局：铃散在徽记处（等过服务端 500ms 开局节流窗）
    jia.pose(224, 188);
    await delay(600);
    jia.send({ type: 'event', kind: 'bell-start' });
    const started = await jia.text.next(stateWith(state => state.phase === 'running'));
    assert.equal(started.holder, null);
    assert.deepEqual(started.loose, { east: 224, north: 188 });
    await yi.text.next(stateWith(state => state.phase === 'running'));

    // 远处触碰无效：无新状态广播
    yi.pose(100, 100);
    await delay(60);
    const statesBefore = jia.text.total(value => isBellState(value));
    yi.send({ type: 'event', kind: 'bell-touch' });
    await delay(250);
    assert.equal(jia.text.total(value => isBellState(value)), statesBefore);

    // 乙贴近拾铃
    yi.pose(224.5, 188);
    await delay(60);
    yi.send({ type: 'event', kind: 'bell-touch' });
    const picked = await jia.text.next(stateWith(state => state.holder?.id === yi.id));
    assert.equal(picked.holder?.name, '抢铃乙');

    // 甲贴身夺铃（过宽限后；甲站到乙东侧，方便验掉铃滚向）
    await delay(300);
    jia.pose(225.1, 188);
    await delay(60);
    jia.send({ type: 'event', kind: 'bell-touch' });
    await jia.text.next(stateWith(state => state.holder?.id === jia.id));

    // 乙掷雪球命中持铃的甲：铃沿投掷方向滚出 2 米
    yi.socket.send(encodeSnowballThrow({ ballId: 77, east: 224.9, north: 188, height: 13.5, dirX: 1, dirY: 0, dirZ: 0 }));
    await jia.events.next(events => events[0]?.kind === 'throw');
    jia.socket.send(encodeSnowballHit({ ballId: 77, throwerId: yi.id, zone: 'torso' }));
    const dropped = await jia.text.next(stateWith(state => state.holder === null && state.loose !== null));
    assert.ok(dropped.loose!.east > 226.8 && dropped.loose!.east < 227.4, `铃滚出落点 ${dropped.loose!.east}`);
    assert.equal(dropped.loose!.north, 188);
    assert.ok(dropped.pickableAt > Date.now() - 100, '掉铃带 1 秒拾取窗');

    // 拾取窗内站在铃上也拿不到
    yi.pose(dropped.loose!.east, dropped.loose!.north);
    await delay(60);
    const statesAtDrop = jia.text.total(value => isBellState(value));
    yi.send({ type: 'event', kind: 'bell-touch' });
    await delay(250);
    assert.equal(jia.text.total(value => isBellState(value)), statesAtDrop);

    // 窗口过后乙拾铃，并连持触发三档称号
    await delay(Math.max(0, dropped.pickableAt - Date.now()) + 80);
    yi.send({ type: 'event', kind: 'bell-touch' });
    await jia.text.next(stateWith(state => state.holder?.id === yi.id));
    for (const tier of [0, 1, 2]) {
      const title = await jia.text.next(
        value => 'kind' in value && value.kind === 'bell-title' && (value as BellTitleEvent).tier === tier, 4000);
      assert.equal((title as BellTitleEvent).id, yi.id);
      assert.equal((title as BellTitleEvent).name, '抢铃乙');
    }

    // 到点结算：乙累计最久夺冠
    const ended = await jia.text.next(value => 'kind' in value && value.kind === 'bell-end', 12_000) as BellEndEvent;
    assert.equal(ended.winner?.id, yi.id);
    assert.equal(ended.standings[0]?.id, yi.id);
    assert.ok((ended.winner?.ms ?? 0) > 2_000);
  });
