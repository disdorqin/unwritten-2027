import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import { createPresenceServer } from '../../src/presence/server';
import { createCableLineAuthority } from '../../src/presence/cable-line-authority';

type CableState = {
  line: number; stage: string; version: number; impacts: number; brakePulled: boolean;
  cableAligned: boolean; cableTurns: number; carriedWeight: number | null;
  weightMounted: boolean[];
};
type Message = {
  type: string; kind?: string; name?: string; self?: boolean; cableLine?: boolean;
  line?: number; stage?: string; openedNow?: boolean;
  flags?: { cableLine1Open: boolean; cableLine2Open: boolean };
  state?: CableState;
  openedAt?:number|null;
};

async function connected(t: TestContext, server: Awaited<ReturnType<typeof createPresenceServer>>, name: string) {
  const socket = new WebSocket('ws://127.0.0.1:' + server.address().port + '/presence');
  const frames: Message[] = [];
  const wake = new Set<() => void>();
  socket.on('message', (raw, binary) => {
    if (binary) return;
    try { frames.push(JSON.parse(raw.toString())); } catch { return; }
    for (const listener of wake) listener();
  });
  t.after(() => socket.terminate());
  await once(socket, 'open');
  async function next(predicate: (frame: Message) => boolean, timeoutMs = 2_000) {
    const limit = Date.now() + timeoutMs;
    for (;;) {
      const index = frames.findIndex(predicate);
      if (index >= 0) return frames.splice(0, index + 1)[index]!;
      const left = limit - Date.now();
      if (left <= 0) throw Error('Timed out waiting for cable-line message; buffered ' + JSON.stringify(frames));
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const resume = () => { clearTimeout(timer); wake.delete(resume); resolve(); };
        wake.add(resume);
        timer = setTimeout(() => { wake.delete(resume); reject(Error('cable-line frame timeout')); }, left);
      });
    }
  }
  socket.send(JSON.stringify({ type: 'join', name }));
  const joined = await next(message => message.type === 'join' && message.self === true);
  return { socket, next, joined, pending: () => [...frames] };
}

const cableFrames = (frames: Message[]) => frames.filter(frame => frame.type === 'cable-line');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('cable repair events flow through the real server: hello, broadcast, full-line', { timeout: 15_000 }, async t => {
  const server = await createPresenceServer({ host: '127.0.0.1', port: 0, connectionLog() {} });
  t.after(() => server.close());
  const a = await connected(t, server, '修线甲');
  const b = await connected(t, server, '旁观乙');

  // Join advertises the authority and both hello frames carry full state.
  assert.equal(a.joined.cableLine, true);
  const hello1 = await a.next(frame => frame.type === 'cable-line' && frame.line === 1);
  assert.equal(hello1.stage, 'dormant');
  assert.equal(hello1.state?.line, 1);
  assert.equal(hello1.state?.version, 0);
  assert.deepEqual(hello1.flags, { cableLine1Open: false, cableLine2Open: false });
  const hello2 = await a.next(frame => frame.type === 'cable-line' && frame.line === 2);
  assert.equal(hello2.state?.stage, 'dormant');
  await b.next(frame => frame.type === 'cable-line' && frame.line === 1);
  await b.next(frame => frame.type === 'cable-line' && frame.line === 2);

  const send = (line: unknown, event: unknown) =>
    a.socket.send(JSON.stringify({ type: 'event', kind: 'cable-repair', line, event }));

  // Malformed or out-of-order events broadcast nothing.
  send(3, { kind: 'wake', impact: 'sled' });
  send(1, { kind: 'bogus' });
  send(1, { kind: 'wake', impact: 'feather' });
  send(1, { kind: 'pull-brake' });
  send(1, { kind: 'pry-cable', effort: 2 });
  await sleep(350);
  assert.deepEqual(cableFrames(a.pending()), [], 'rejected events must not broadcast');
  assert.deepEqual(cableFrames(b.pending()), [], 'rejected events must not broadcast');

  // Wake: both clients receive the frame with the full snapshot.
  send(1, { kind: 'wake', impact: 'sled' });
  const woken = await a.next(frame => frame.type === 'cable-line' && frame.line === 1);
  assert.equal(woken.stage, 'one-station');
  assert.equal(woken.openedNow, false);
  assert.equal(woken.state?.version, 1);
  const wokenB = await b.next(frame => frame.type === 'cable-line' && frame.line === 1);
  assert.equal(wokenB.state?.stage, 'one-station');

  // The whole repair, one broadcast per accepted event.
  const repair: unknown[] = [
    ...Array.from({ length: 9 }, () => ({ kind: 'strike-rust' })),
    { kind: 'pull-brake' },
    { kind: 'pry-cable', effort: 1 },
    ...Array.from({ length: 3 }, () => ({ kind: 'tighten-cable' })),
    ...[0, 1, 2, 3].flatMap(index => [{ kind: 'take-weight', index }, { kind: 'hang-weight', index }]),
  ];
  let last: Message | undefined;
  for (const event of repair) {
    send(1, event);
    last = await a.next(frame => frame.type === 'cable-line' && frame.line === 1);
  }
  assert.equal(last?.stage, 'full-line');
  assert.equal(last?.openedNow, true, 'openedNow fires on the completing frame');
  assert.equal(last?.flags?.cableLine1Open, true);
  assert.equal(last?.flags?.cableLine2Open, false);
  assert.equal(last?.state?.impacts, 9);
  assert.equal(last?.state?.brakePulled, true);
  assert.equal(last?.state?.cableAligned, true);
  assert.equal(last?.state?.cableTurns, 3);
  assert.deepEqual(last?.state?.weightMounted, [true, true, true, true]);
  assert.equal(last?.state?.carriedWeight, null);

  // The observer saw the same completion.
  let lastB: Message | undefined;
  for (let i = 0; i < repair.length; i++) {
    lastB = await b.next(frame => frame.type === 'cable-line' && frame.line === 1);
  }
  assert.equal(lastB?.stage, 'full-line');
  assert.equal(lastB?.openedNow, true);

  // A late joiner is told the current truth by the hello frame.
  const late = await connected(t, server, '晚到丙');
  const lateHello = await late.next(frame => frame.type === 'cable-line' && frame.line === 1);
  assert.equal(lateHello.stage, 'full-line');
  assert.equal(lateHello.state?.stage, 'full-line');
  assert.equal(lateHello.flags?.cableLine1Open, true);
});

test('town and mountain rooms share both cable versions, without duplicate broadcasts, through reconnect', {timeout:15000}, async t=>{
 const authority=createCableLineAuthority();
 const town=await createPresenceServer({cableLineAuthority:authority,connectionLog(){}});
 t.after(()=>town.close());
 const mountain=await createPresenceServer({cableLineAuthority:authority,connectionLog(){}});
 t.after(()=>mountain.close());
 const a=await connected(t,town,'镇上甲'), b=await connected(t,mountain,'山上乙');
 for(const p of [a,b])for(const line of [1,2])await p.next(f=>f.type==='cable-line'&&f.line===line);
 const send=async(p:typeof a,line:number,event:unknown,version:number)=>{
  p.socket.send(JSON.stringify({type:'event',kind:'cable-repair',line,event}));
  const frames=await Promise.all([a,b].map(p=>p.next(f=>f.type==='cable-line'&&f.line===line&&f.state?.version===version)));
  assert.deepEqual(frames[0],frames[1]);return frames[0]!;
 };
 await send(a,1,{kind:'wake',impact:'sled'},1);
 await send(b,2,{kind:'wake',impact:'sled'},1);
 const events=[...Array.from({length:9},()=>({kind:'strike-rust'})),{kind:'pull-brake'},{kind:'pry-cable',effort:1},...Array.from({length:3},()=>({kind:'tighten-cable'})),...[0,1,2,3].flatMap(index=>[{kind:'take-weight',index},{kind:'hang-weight',index}])];
 let version=1;for(const event of events)await send(b,2,event,++version);
 assert.equal(authority.flags().cableLine2Open,true);assert.equal(authority.flags().cableLine1Open,false);
 await sleep(100);assert.equal(cableFrames(a.pending()).length,0);assert.equal(cableFrames(b.pending()).length,0);
 b.socket.terminate();const rejoined=await connected(t,mountain,'山上乙');
 const first=await rejoined.next(f=>f.type==='cable-line'&&f.line===1);
 const second=await rejoined.next(f=>f.type==='cable-line'&&f.line===2);
 assert.equal(first.state?.version,1);assert.equal(first.openedAt,null);assert.equal(second.state?.version,version);assert.equal(second.stage,'full-line');assert.equal(second.openedNow,false);assert.equal(second.openedAt,authority.hello(2).openedAt);assert.ok(typeof second.openedAt==='number'&&Number.isSafeInteger(second.openedAt));
 await mountain.close();a.socket.send(JSON.stringify({type:'event',kind:'cable-repair',line:1,event:{kind:'strike-rust'}}));
 assert.equal((await a.next(f=>f.type==='cable-line'&&f.line===1)).state?.version,2);
});
