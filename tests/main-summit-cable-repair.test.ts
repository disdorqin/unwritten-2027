import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitCableRepair, initialSummitCableRepairState,
  type SummitCableRepairAction, type SummitCableRepairState,
} from '../src/shared/main-summit-cable-repair';

function rig() {
  let state: SummitCableRepairState = initialSummitCableRepairState();
  let time = 1_000_000;
  let approved = true;
  let site: 'summit' | 'brake' | 'cable' | 'weight' = 'summit';
  let beforeCommit: () => void = () => {};
  let arrived = false;
  let releasedCabin: 0 | 1 | undefined = 1;
  let commits = 0;
  function actionSite(action: SummitCableRepairAction) {
    switch (action.kind) {
      case 'release-summit':
      case 'confirm-single-trip': return 'summit';
      case 'strike-rust':
      case 'pull-brake': return 'brake';
      case 'pry-cable':
      case 'release-cable':
      case 'crank-cable': return 'cable';
      case 'pick-weight':
      case 'hang-weight': return 'weight';
    }
  }
  const repair = createMainSummitCableRepair({
    read: () => state, now: () => time,
    releasableCabin: () => releasedCabin,
    singleTripArrived: () => arrived,
    authorize: (player, action) => !!player && approved && actionSite(action) === site,
    commit(expected, next, guard) {
      beforeCommit();
      if (state.revision !== expected || !guard()) return false;
      state = next;
      commits++;
      return true;
    },
  });
  async function act(action: SummitCableRepairAction, player = 'alice') {
    site = actionSite(action);
    return repair.act(player, action);
  }
  async function releaseAndArrive() {
    assert.equal((await act({ kind: 'release-summit' })).kind, 'applied');
    arrived = true;
    assert.equal((await act({ kind: 'confirm-single-trip' })).kind, 'applied');
  }
  return {
    repair, act, releaseAndArrive,
    state: () => state, commits: () => commits, setTime: (t: number) => time = t,
    advanceTime: (ms: number) => time += ms,
    setApproval: (value: boolean) => approved = value,
    setArrival: (value: boolean) => arrived = value,
    setReleasedCabin: (value: 0 | 1 | undefined) => releasedCabin = value,
    setSite: (value: typeof site) => site = value,
    beforeCommit: (fn: () => void) => beforeCommit = fn,
  };
}

test('P-2 must be released at summit after first foot ascent; no ordinary operation before descent', async () => {
  const t = rig();
  assert.equal(t.state().stage, 'dormant');
  assert.equal(t.repair.canMakeSingleDownhillTrip(t.state()), false);
  assert.equal((await t.act({ kind: 'strike-rust' })).kind, 'not-ready');
  assert.equal((await t.act({ kind: 'release-summit' })).kind, 'applied');
  assert.equal(t.state().stage, 'single-trip');
  assert.equal(t.state().singleTripCabin, 1);
  assert.equal(t.repair.canMakeSingleDownhillTrip(t.state()), true);
  assert.equal((await t.act({ kind: 'release-summit' })).kind, 'already-done');
  assert.equal((await t.act({ kind: 'pull-brake' })).kind, 'not-ready');
  assert.equal((await t.act({ kind: 'confirm-single-trip' })).kind, 'not-ready',
    'only actual first-leg arrival may consume the release permit');
  t.setArrival(true);
  assert.equal((await t.act({ kind: 'confirm-single-trip' })).kind, 'applied');
  assert.equal(t.state().stage, 'halted');
  assert.equal(t.state().singleTripCabin, null);
  assert.equal(t.repair.canMakeSingleDownhillTrip(t.state()), false);
  assert.equal(t.repair.canRun(t.state(), true), false);
});

test('nine real rust strikes followed by a separate handle pull permanently repair the brake', async () => {
  const t = rig();
  await t.releaseAndArrive();
  assert.equal((await t.act({ kind: 'pull-brake' })).kind, 'not-ready');
  for (let i = 1; i <= 9; i++) {
    assert.equal((await t.act({ kind: 'strike-rust' })).kind, 'applied');
    assert.equal(t.state().rustStrikes, i);
  }
  assert.equal((await t.act({ kind: 'strike-rust' })).kind, 'already-done');
  assert.equal((await t.act({ kind: 'pull-brake' })).kind, 'applied');
  assert.equal(t.state().brakeReleased, true);
  assert.equal((await t.act({ kind: 'pull-brake' })).kind, 'already-done');
});

test('pry cable for eight server-timed seconds, release loses half, then crank exactly three times', async () => {
  const t = rig();
  await t.releaseAndArrive();
  assert.equal((await t.act({ kind: 'crank-cable' })).kind, 'not-ready');
  assert.equal((await t.act({ kind: 'pry-cable' })).kind, 'applied');
  for (let i = 0; i < 16; i++) {
    t.advanceTime(250);
    assert.equal((await t.act({ kind: 'pry-cable' })).kind, 'applied');
  }
  assert.ok(Math.abs(t.state().cableLift - .5) < 1e-8);
  assert.equal((await t.act({ kind: 'release-cable' })).kind, 'applied');
  assert.ok(Math.abs(t.state().cableLift - .25) < 1e-8);
  assert.equal((await t.act({ kind: 'pry-cable' })).kind, 'applied');
  for (let i = 0; i < 24; i++) {
    t.advanceTime(250);
    assert.equal((await t.act({ kind: 'pry-cable' })).kind, 'applied');
  }
  assert.equal(t.state().cableLift, 1);
  assert.equal((await t.act({ kind: 'pry-cable' })).kind, 'already-done');
  for (let i = 0; i < 3; i++) {
    assert.equal((await t.act({ kind: 'crank-cable' })).kind, 'applied');
    assert.equal(t.state().cableCranks, i + 1);
  }
  assert.equal((await t.act({ kind: 'crank-cable' })).kind, 'already-done');
});

test('server time never grants pry progress on same tick and long gaps halve work instead of jumping', async () => {
  const t = rig();
  await t.releaseAndArrive();
  await t.act({ kind: 'pry-cable' });
  await t.act({ kind: 'pry-cable' });
  assert.equal(t.state().cableLift, 0);
  t.advanceTime(250);
  await t.act({ kind: 'pry-cable' });
  assert.equal(t.state().cableLift, .03125);
  t.advanceTime(20_000);
  await t.act({ kind: 'pry-cable' });
  assert.equal(t.state().cableLift, .015625);
  t.setTime(0);
  assert.equal((await t.act({ kind: 'pry-cable' })).kind, 'unavailable');
});

test('all four weights must actually be carried by their owner and hung without double counting', async () => {
  const t = rig();
  await t.releaseAndArrive();
  assert.equal((await t.act({ kind: 'pick-weight', index: -1 })).kind, 'invalid-action');
  assert.equal((await t.act({ kind: 'pick-weight', index: 0 })).kind, 'applied');
  assert.equal((await t.act({ kind: 'pick-weight', index: 1 })).kind, 'not-ready');
  assert.equal((await t.act({ kind: 'hang-weight', index: 0 }, 'bob')).kind, 'not-ready');
  assert.equal((await t.act({ kind: 'hang-weight', index: 0 })).kind, 'applied');
  assert.equal((await t.act({ kind: 'hang-weight', index: 0 })).kind, 'not-ready');
  for (let index = 1; index < 4; index++) {
    assert.equal((await t.act({ kind: 'pick-weight', index }, 'bob')).kind, 'applied');
    assert.equal((await t.act({ kind: 'hang-weight', index }, 'bob')).kind, 'applied');
  }
  assert.deepEqual(t.state().weights.map(w => w.status), ['hung', 'hung', 'hung', 'hung']);
  assert.equal(t.state().stage, 'halted', 'one repair class cannot unlock the cable alone');
});

test('finishing all three fault repairs opens daylight service; it must stop at night', async () => {
  const t = rig();
  await t.releaseAndArrive();
  for (let i = 0; i < 9; i++) await t.act({ kind: 'strike-rust' });
  await t.act({ kind: 'pull-brake' });
  await t.act({ kind: 'pry-cable' });
  for (let i = 0; i < 32; i++) {
    t.advanceTime(250);
    await t.act({ kind: 'pry-cable' });
  }
  assert.equal(t.state().cableLift, 1);
  await t.act({ kind: 'crank-cable' });
  await t.act({ kind: 'crank-cable' });
  await t.act({ kind: 'crank-cable' });
  for (let i = 0; i < 4; i++) {
    await t.act({ kind: 'pick-weight', index: i });
    await t.act({ kind: 'hang-weight', index: i });
  }
  assert.equal(t.state().stage, 'open');
  assert.equal(t.repair.canRun(t.state(), true), true);
  assert.equal(t.repair.canRun(t.state(), false), false);
  assert.equal(t.repair.canMakeSingleDownhillTrip(t.state()), false);
  assert.equal((await t.act({ kind: 'release-summit' })).kind, 'already-done');
});

test('malformed network commands never advance revision or invoke authorization', async () => {
  const t = rig();
  for (const payload of [null, undefined, {}, { kind: 'teleport-to-summit' },
    { kind: 'hang-weight', index: NaN }, { kind: 'pick-weight', index: -1 },
    { kind: 'pick-weight', index: 1.5 }, { kind: 'pick-weight', index: 999 }]) {
    assert.equal((await t.repair.act('alice', payload)).kind, 'invalid-action');
  }
  assert.equal(t.state().revision, 0);
  assert.equal(t.commits(), 0);
});

test('CAS, out-of-reach, retracted authorization and malicious state cannot silently advance', async () => {
  const t = rig();
  t.setApproval(false);
  assert.equal((await t.act({ kind: 'release-summit' })).kind, 'unauthorized');
  t.setApproval(true);
  t.beforeCommit(() => t.setApproval(false));
  assert.equal((await t.act({ kind: 'release-summit' })).kind, 'conflict');
  assert.equal(t.state().stage, 'dormant');
  t.setApproval(true);
  t.beforeCommit(() => {});
  const simultaneous = await Promise.all([
    t.act({ kind: 'release-summit' }), t.act({ kind: 'release-summit' }),
  ]);
  assert.equal(simultaneous.filter(result => result.kind === 'applied').length, 1);
  assert.equal(t.state().revision, 1);
  assert.equal(t.commits(), 1);
  const snapshot = await t.repair.snapshot();
  assert.ok(snapshot);
  (snapshot.weights[0] as { status: string }).status = 'hung'; // adversarial caller mutates its defensive copy
  assert.equal(t.state().weights[0]!.status, 'ground');
});
