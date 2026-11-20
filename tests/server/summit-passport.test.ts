import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket, type RawData } from 'ws';
import { createPresenceServer } from '../../src/presence/server.js';
import { summitPassportSites, type SummitPassportPosition } from '../../src/presence/summit-passport-authority.js';
import { readSummitPassportReply, type SummitPassportAction } from '../../src/shared/summit-passport.js';

type Frame = Record<string, unknown>;

function receiveWs<T>(socket: WebSocket, select: (frame: Frame) => T | undefined) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for the WS passport response.'));
    }, 2_500);
    function onMessage(data: RawData, binary: boolean) {
      if (binary) return;
      const result = select(JSON.parse(data.toString()) as Frame);
      if (result === undefined) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(result);
    }
    socket.on('message', onMessage);
  });
}

function packet(action: SummitPassportAction, extra = {}) {
  return JSON.stringify({ type: 'event', kind: 'summit-passport', action, ...extra });
}

const noStamps = { cloudStamped: false, summitStamped: false, summitRegistered: false, snowWingEligible: false };
const firstStamp = { ...noStamps, cloudStamped: true };
const bothStamps = { ...firstStamp, summitStamped: true };
const registered = { ...bothStamps, summitRegistered: true, snowWingEligible: true };

async function joinPoll(base: string, name: string) {
  const response = await fetch(`${base}/presence/poll/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
  });
  assert.equal(response.status, 200);
  const joined = await response.json() as { session: string; id: number; messages: { t: string; d: string }[] };
  return {
    id: joined.id,
    self: joined.messages.filter(frame => frame.t === 'text').map(frame => JSON.parse(frame.d) as Frame)
      .find(frame => frame.type === 'join' && frame.self === true),
    async poll(request?: string) {
      const response = await fetch(`${base}/presence/poll`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-presence-session': joined.session },
        body: JSON.stringify(request === undefined ? {} : { events: [{ t: 'text', d: request }] }),
      });
      assert.equal(response.status, 200);
      const received = await response.json() as { messages: { t: string; d: string }[] };
      return received.messages.flatMap(frame => {
        if (frame.t !== 'text') return [];
        const result = readSummitPassportReply(JSON.parse(frame.d));
        return result ? [result] : [];
      });
    },
  };
}

test('the server carries independent ordered P-10 progress over real WS and HTTP polling', async t => {
  const positions = new Map<number, SummitPassportPosition>();
  const sites = summitPassportSites(347);
  const server = await createPresenceServer({
    connectionLog() {}, summitPassportHost: { cloudDeckHeight: 347, resolvePosition: peer => positions.get(peer) },
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/presence`);
  t.after(() => socket.terminate());
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const self = receiveWs(socket, frame => frame.type === 'join' && frame.self ? frame : undefined);
  socket.send(JSON.stringify({ type: 'join', name: '同名来客' }));
  const actor = await self;
  assert.equal(actor.summitPassport, true);
  assert.equal(typeof actor.id, 'number');
  const wsId = actor.id as number;

  const poll = await joinPoll(base, '同名来客');
  assert.equal(poll.self?.summitPassport, true);
  assert.notEqual(wsId, poll.id);
  const wsRequest = (action: SummitPassportAction, extra?: object) => {
    const reply = receiveWs(socket, frame => readSummitPassportReply(frame));
    socket.send(packet(action, extra));
    return reply;
  };
  const pollRequest = async (action: SummitPassportAction, extra?: object) => {
    const frames = await poll.poll(packet(action, extra));
    assert.equal(frames.length, 1, 'Only one private reply belongs in this polling turn.');
    return frames[0]!;
  };

  assert.deepEqual((await wsRequest('status')).progress, noStamps);
  const pose = Buffer.alloc(12);
  pose.writeUInt16LE(30600, 2);
  pose.writeUInt16LE(50000, 4);
  pose.writeUInt16LE(34700, 6);
  pose.writeUInt16LE(1, 10);
  socket.send(pose);
  const forged = await wsRequest('cloud-stamp', { ...sites['cloud-stamp'], peerId: poll.id, progress: registered });
  assert.equal(forged.result, 'position');
  assert.deepEqual(forged.progress, noStamps);
  assert.deepEqual(await poll.poll(), [], 'A passport reply must not be broadcast to another player.');

  positions.set(wsId, sites['summit-stamp']);
  assert.equal((await wsRequest('summit-stamp')).result, 'previous-stamp');
  positions.set(wsId, { ...sites['cloud-stamp'], area: 'summit' });
  assert.equal((await wsRequest('cloud-stamp')).result, 'position', 'Use the authoritative coordinate frame for the area.');
  positions.set(wsId, sites['cloud-stamp']);
  assert.deepEqual((await wsRequest('cloud-stamp')).progress, firstStamp);
  assert.deepEqual((await pollRequest('status')).progress, noStamps, 'Identical nicknames do not share passports.');

  positions.set(wsId, sites['register-summit']);
  assert.equal((await wsRequest('register-summit')).result, 'previous-stamp');
  positions.set(wsId, sites['summit-stamp']);
  assert.deepEqual((await wsRequest('summit-stamp')).progress, bothStamps);
  positions.set(wsId, { ...sites['register-summit'], height: 799.5 });
  assert.equal((await wsRequest('register-summit')).result, 'position');
  positions.set(wsId, sites['register-summit']);
  assert.deepEqual((await wsRequest('register-summit')).progress, registered);
  assert.deepEqual((await wsRequest('register-summit')).progress, registered, 'Retrying is idempotent.');
  assert.deepEqual((await wsRequest('status')).progress, registered);

  positions.set(poll.id, sites['cloud-stamp']);
  assert.deepEqual((await pollRequest('cloud-stamp')).progress, firstStamp);
  positions.set(poll.id, sites['summit-stamp']);
  assert.deepEqual((await pollRequest('summit-stamp')).progress, bothStamps);
  positions.set(poll.id, sites['register-summit']);
  assert.deepEqual((await pollRequest('register-summit')).progress, registered);
  assert.deepEqual((await pollRequest('status')).progress, registered);
  const rejoin = await joinPoll(base, '同名来客');
  assert.deepEqual((await rejoin.poll(packet('status')))[0]?.progress, noStamps);
});

test('an ordinary presence server cannot grant P-10 progress before the domain host is mounted', async t => {
  const server = await createPresenceServer({ connectionLog() {} });
  t.after(() => server.close());
  const poll = await joinPoll(`http://127.0.0.1:${server.address().port}`, '旧镇游客');
  assert.equal(poll.self?.summitPassport, undefined);
  const response = await poll.poll(packet('register-summit', { ...summitPassportSites(347)['register-summit'], progress: registered }));
  assert.deepEqual(response.map(frame => [frame.result, frame.progress]), [['unavailable', noStamps]]);
  assert.equal(readSummitPassportReply({ type: 'event', kind: 'summit-passport-result', action: 'status', result: 'ok',
    progress: { ...noStamps, snowWingEligible: true },
  }), undefined);
});
