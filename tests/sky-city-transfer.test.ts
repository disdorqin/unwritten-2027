import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSkyCityTransferAuthority, skyTransferEndpoints,
  type SkyTransferRecord } from '../src/shared/sky-city-transfer';
import { starportAssemblyParts, type StarportAssemblyState } from '../src/shared/starport-assembly';

const atPad = () => ({ ...skyTransferEndpoints.summit, north: skyTransferEndpoints.summit.north - .3 });
const skyArrival = () => ({ east: -14, north: -40, height: 750 });
const readyAssembly = (): StarportAssemblyState => ({
  revision: 3, ignited: true, carried: [], installed: [...starportAssemblyParts],
});

function rig() {
  let record: SkyTransferRecord = { revision: 10, domain: 'summit' };
  let foot = atPad();
  let assembly = readyAssembly();
  let key = true, window = true, mounted = true, legal = true;
  let landingSky = skyArrival();
  let committed = 0;
  let beforeCommit = () => {};
  const host = {
    read: () => record,
    pose: (_player: string, domain: string) => domain === record.domain ? foot : undefined,
    assembly: () => assembly,
    ignition: () => ({ keyOne: key, layersOverlap: window }),
    ready: () => mounted,
    landing(domain: string) { return domain === 'sky' ? landingSky : atPad(); },
    canStand: () => legal,
    commit(_player: string, revision: number, next: SkyTransferRecord,
      arrival: typeof foot, guard: () => boolean) {
      beforeCommit();
      if (revision !== record.revision || !guard()) return false;
      record = next;
      foot = arrival;
      committed++;
      return true;
    },
  };
  const authority = createSkyCityTransferAuthority(host);
  return { authority, read: () => record, foot: () => foot, committed: () => committed,
    move(point: typeof foot) { foot = point; },
    setAssembly(next: StarportAssemblyState) { assembly = next; },
    setFlags(nextKey: boolean, nextWindow: boolean) { key = nextKey; window = nextWindow; },
    setReady(next: boolean) { mounted = next; },
    setLegal(next: boolean) { legal = next; },
    setLanding(next: typeof foot) { landingSky = next; },
    setBeforeCommit(next: () => void) { beforeCommit = next; },
  };
}

test('ZD-05 ignition, one first-minute entry and a safe return form one server-authoritative cycle', async () => {
  const t = rig();
  const entered = await t.authority.enter('pilot');
  assert.equal(entered.kind, 'entered');
  assert.deepEqual(t.read(), { revision: 11, domain: 'sky' });
  assert.deepEqual(t.foot(), skyArrival());
  assert.equal((await t.authority.enter('pilot')).kind, 'wrong-domain');
  t.move({ ...skyTransferEndpoints.sky });
  const returned = await t.authority.returnToStarport('pilot');
  assert.equal(returned.kind, 'returned');
  assert.deepEqual(t.read(), { revision: 12, domain: 'summit' });
  assert.deepEqual(t.foot(), atPad());
  assert.equal((await t.authority.returnToStarport('pilot')).kind, 'wrong-domain');
  assert.equal(t.committed(), 2);
});

test('ZD-05 requires a real assembled craft, key one and live overlap; never accepts missing parts', async () => {
  const t = rig();
  t.setAssembly({ ...readyAssembly(), ignited: false });
  assert.equal((await t.authority.enter('pilot')).kind, 'not-ignited');
  t.setAssembly({ ...readyAssembly(), installed: ['snow-wing', 'booster'] });
  assert.equal((await t.authority.enter('pilot')).kind, 'not-ignited');
  t.setAssembly(readyAssembly());
  t.setFlags(false, true);
  assert.equal((await t.authority.enter('pilot')).kind, 'missing-key');
  t.setFlags(true, false);
  assert.equal((await t.authority.enter('pilot')).kind, 'window-closed');
  assert.equal(t.committed(), 0);
});

test('ZD-05 forbids disconnected rooms, false player feet, back-side ignition and spoofed destinations', async () => {
  const t = rig();
  t.setReady(false);
  assert.equal((await t.authority.enter('pilot')).kind, 'unavailable');
  t.setReady(true);
  t.move({ ...atPad(), east: 400 });
  assert.equal((await t.authority.enter('pilot')).kind, 'out-of-reach');
  t.move({ ...atPad(), north: skyTransferEndpoints.summit.north + .1 });
  assert.equal((await t.authority.enter('pilot')).kind, 'out-of-reach');
  t.move(atPad());
  t.setLanding({ ...skyArrival(), height: 655.35 });
  assert.equal((await t.authority.enter('pilot')).kind, 'unsafe-landing');
  t.setLanding({ ...skyArrival(), east: NaN });
  assert.equal((await t.authority.enter('pilot')).kind, 'unsafe-landing');
  t.setLanding(skyArrival());
  t.setLegal(false);
  assert.equal((await t.authority.enter('pilot')).kind, 'unsafe-landing');
  assert.equal(t.committed(), 0);
});

test('ZD-05 checks the key and standing clearance again at the atomic write boundary', async () => {
  const t = rig();
  t.setBeforeCommit(() => t.setFlags(true, false));
  assert.equal((await t.authority.enter('pilot')).kind, 'conflict');
  assert.deepEqual(t.read(), { revision: 10, domain: 'summit' });
  t.setFlags(true, true);
  t.setBeforeCommit(() => t.setLegal(false));
  assert.equal((await t.authority.enter('pilot')).kind, 'conflict');
  assert.equal(t.committed(), 0);
});

test('ZD-05 return does not require an ignition window but still requires the sky departure foot', async () => {
  const t = rig();
  assert.equal((await t.authority.enter('pilot')).kind, 'entered');
  t.setFlags(false, false);
  assert.equal((await t.authority.returnToStarport('pilot')).kind, 'out-of-reach');
  t.move({ ...skyTransferEndpoints.sky });
  assert.equal((await t.authority.returnToStarport('pilot')).kind, 'returned');
});

test('ZD-05 concurrent entry requests cannot commit two transitions at one revision', async () => {
  const t = rig();
  const results = await Promise.all([t.authority.enter('pilot'), t.authority.enter('pilot')]);
  assert.equal(results.filter(r => r.kind === 'entered').length, 1);
  assert.ok(results.some(r => r.kind !== 'entered'), 'a stale concurrent attempt cannot transit twice');
  assert.equal(t.committed(), 1);
});
