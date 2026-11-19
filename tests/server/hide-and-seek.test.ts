import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHideAndSeekAuthority, HideAndSeekRound, type HideSeekNotice, type HideSeekPosition,
} from '../../src/presence/hide-and-seek.ts';

const start = 10_000;
const [seeker, hiderA, hiderB, hiderC, hiderD, hiderE] = [1, 2, 3, 4, 5, 6];
const plaza = { east: 0, north: 0, height: 0 };
const sceneA = { east: 1, north: 1, height: 0 };
const sceneA2 = { east: 2, north: 2, height: 0 };
const sceneB = { east: -1, north: 1, height: 0 };
// Deliberately fictional fixture. Real town regions and touch behavior are
// supplied by the integration host and aren't approximated in round rules.
const rules = {
  isInPlaza: ({ east, north }: HideSeekPosition) => east === 0 && north === 0,
  isTouching: (a: HideSeekPosition, b: HideSeekPosition) =>
    a.east === b.east && a.north === b.north && a.height === b.height,
  regionAt: ({ east }: HideSeekPosition) => east > 0 ? 'A' : east < 0 ? 'B' : 'plaza',
};

const round = (...hiders: number[]) => new HideAndSeekRound(seeker, hiders, start, rules);

test('hide-and-seek admits two to five distinct hiders and one separate seeker', () => {
  for (const ids of [[hiderA], [hiderA, hiderA], [seeker, hiderA], [hiderA, hiderB, hiderC, hiderD, hiderE, 7]]) {
    assert.throws(() => round(...ids), RangeError);
  }
  assert.doesNotThrow(() => round(hiderA, hiderB));
  assert.doesNotThrow(() => round(hiderA, hiderB, hiderC, hiderD, hiderE));
});

test('hide-and-seek locks the seeker in the plaza until 90 seconds and then judges real touch', () => {
  const session = round(hiderA, hiderB);
  const positions = new Map([[seeker, plaza], [hiderA, plaza], [hiderB, { ...plaza, height: 1 }]]);
  assert.equal(session.phase(start + 89_999), 'hiding');
  assert.equal(session.canMove(seeker, sceneA, start + 89_999), false);
  assert.equal(session.canMove(seeker, plaza, start + 89_999), true);
  assert.equal(session.canMove(hiderA, sceneA, start + 89_999), true);
  assert.deepEqual(session.advance(start + 89_999, positions).captures, []);
  assert.equal(session.phase(start + 90_000), 'seeking');
  assert.equal(session.canMove(seeker, sceneA, start + 90_000), true);
  assert.deepEqual(session.advance(start + 90_000, positions), { captures: [hiderA], finished: false });
  assert.deepEqual(session.advance(start + 90_001, positions).captures, []);
  positions.set(hiderB, plaza);
  assert.deepEqual(session.advance(start + 95_000, positions), { captures: [hiderB], finished: true });
  assert.equal(session.phase(start + 95_000), 'ended');
  assert.deepEqual(session.scores(start + 99_000), {
    captures: 2,
    hiders: [{ hiderId: hiderA, survivedMs: 90_000 }, { hiderId: hiderB, survivedMs: 95_000 }],
  });
  assert.equal(session.advance(start + 99_001, positions).finished, false);
});

test('hide-and-seek reports a three-minute anonymous area histogram to the seeker', () => {
  const session = round(hiderA, hiderB, hiderC, hiderD);
  const positions = new Map([
    [seeker, plaza], [hiderA, sceneA], [hiderB, sceneA2], [hiderC, sceneB], [hiderD, plaza],
  ]);
  assert.deepEqual(session.advance(start + 90_000, positions).captures, [hiderD]);
  assert.equal(session.advance(start + 179_999, positions).areas, undefined);
  assert.deepEqual(session.advance(start + 180_000, positions).areas, {
    privateReports: [
      { hiderId: hiderA, region: 'A' }, { hiderId: hiderB, region: 'A' }, { hiderId: hiderC, region: 'B' },
    ],
    seekerReport: [{ region: 'A', hiders: 2 }, { region: 'B', hiders: 1 }],
  });
  assert.equal(session.advance(start + 180_001, positions).areas, undefined);
  assert.equal(session.advance(start + 359_999, positions).areas, undefined);
  assert.deepEqual(session.advance(start + 360_000, positions).areas?.seekerReport,
    [{ region: 'A', hiders: 2 }, { region: 'B', hiders: 1 }]);
});

test('after hiding, a successful cross-region door journey reveals only the destination region', () => {
  const session = round(hiderA, hiderB);
  assert.equal(session.doorTravel(hiderA, sceneA, sceneB, start + 89_999), undefined);
  assert.deepEqual(session.doorTravel(hiderA, sceneA, sceneB, start + 90_000), { region: 'B' });
  assert.equal(session.doorTravel(hiderA, sceneA, sceneA2, start + 95_000), undefined);
  assert.equal(session.doorTravel(seeker, sceneA, sceneB, start + 95_000), undefined);
  assert.equal(session.doorTravel(hiderC, sceneA, sceneB, start + 95_000), undefined);
  const positions = new Map([[seeker, plaza], [hiderA, plaza], [hiderB, sceneA]]);
  assert.deepEqual(session.advance(start + 100_000, positions).captures, [hiderA]);
  assert.equal(session.doorTravel(hiderA, sceneA, sceneB, start + 100_001), undefined);
  assert.deepEqual(session.doorTravel(hiderB, sceneB, sceneA, start + 100_001), { region: 'A' });
  assert.equal(session.doorTravel(hiderB, sceneB, sceneA, start + 720_000), undefined);
});

test('at 12 minutes the round ends without allowing a late capture and freezes scores', () => {
  const session = round(hiderA, hiderB);
  const positions = new Map([[seeker, plaza], [hiderA, plaza], [hiderB, sceneA]]);
  const at = start + 720_000;
  assert.deepEqual(session.advance(at, positions), { captures: [], finished: true });
  assert.deepEqual(session.scores(at + 1000), {
    captures: 0,
    hiders: [{ hiderId: hiderA, survivedMs: 720_000 }, { hiderId: hiderB, survivedMs: 720_000 }],
  });
});

test('resident direction lookup is only available to uncaught hiders in a live round', () => {
  const session = round(hiderA, hiderB);
  const positions = new Map([[seeker, sceneB], [hiderA, sceneA], [hiderB, sceneB]]);
  assert.deepEqual(session.seekerDirection(hiderA, start + 90_000, positions), { east: -2, north: 0 });
  assert.equal(session.seekerDirection(seeker, start + 90_000, positions), undefined);
  assert.equal(session.seekerDirection(hiderC, start + 90_000, positions), undefined);
  session.advance(start + 90_000, positions);
  assert.equal(session.seekerDirection(hiderB, start + 90_001, positions), undefined);
  assert.equal(session.seekerDirection(hiderA, start + 720_000, positions), undefined);
});

function authorityFixture(startingPose = plaza) {
  let now = start;
  const outsider = 99;
  const positions = new Map([
    [seeker, startingPose], [hiderA, sceneB], [hiderB, sceneA], [hiderC, sceneA2],
    [hiderD, plaza], [outsider, sceneB],
  ]);
  const sent: { recipient: number; notice: HideSeekNotice }[] = [];
  const host = {
    now: () => now,
    positions: () => positions,
    sendTo: (recipient: number, notice: HideSeekNotice) => sent.push({ recipient, notice }),
  };
  return { host, positions, sent, at: (offset: number) => { now = start + offset; } };
}

test('host requires accepted starting poses and provides the seeker plaza gate', () => {
  const outside = authorityFixture(sceneA);
  assert.throws(() => createHideAndSeekAuthority(seeker, [hiderA, hiderB], rules, outside.host), RangeError);
  const fixture = authorityFixture();
  assert.throws(() => createHideAndSeekAuthority(seeker, [hiderA, hiderE], rules, fixture.host), RangeError);
  const session = createHideAndSeekAuthority(seeker, [hiderA, hiderB], rules, fixture.host);
  fixture.at(89_999);
  assert.equal(session.canMove(seeker, sceneA), false);
  assert.equal(session.canMove(seeker, plaza), true);
  assert.equal(session.canMove(hiderA, sceneA), true);
  fixture.at(90_000);
  assert.equal(session.canMove(seeker, sceneA), true);
});

test('host routes each region notice privately and anonymizes the seeker histogram independently of roster order', () => {
  const fixture = authorityFixture();
  const session = createHideAndSeekAuthority(seeker, [hiderA, hiderB, hiderC, hiderD], rules, fixture.host);
  fixture.at(179_999);
  assert.deepEqual(session.tick().captures, [hiderD]);
  assert.deepEqual(fixture.sent, []);
  fixture.at(180_000);
  session.tick();
  assert.deepEqual(fixture.sent, [
    { recipient: hiderA, notice: { kind: 'own-region', region: 'B' } },
    { recipient: hiderB, notice: { kind: 'own-region', region: 'A' } },
    { recipient: hiderC, notice: { kind: 'own-region', region: 'A' } },
    { recipient: seeker, notice: { kind: 'region-counts', counts: [{ region: 'A', hiders: 2 }, { region: 'B', hiders: 1 }] } },
  ]);
  fixture.at(180_001);
  session.tick();
  assert.equal(fixture.sent.length, 4);
});

test('host reveals only the accepted cross-region door destination of an uncaught hider', () => {
  const fixture = authorityFixture();
  const session = createHideAndSeekAuthority(seeker, [hiderA, hiderB], rules, fixture.host);
  fixture.at(89_999);
  session.doorArrival(hiderA, { status: 'settled', entry: sceneA });
  fixture.at(90_000);
  session.doorArrival(hiderA, { status: 'fallback' });
  session.doorArrival(hiderA, { status: 'cancelled' });
  session.doorArrival(hiderA, { status: 'settled', entry: sceneB });
  session.doorArrival(hiderC, { status: 'settled', entry: sceneB });
  assert.deepEqual(fixture.sent, []);
  // The host's accepted position has changed to scene A although the requested door was in scene B.
  fixture.positions.set(hiderA, sceneA2);
  session.doorArrival(hiderA, { status: 'settled', entry: sceneB });
  const expected = [seeker, hiderA, hiderB].map(recipient => ({
    recipient, notice: { kind: 'door-region', region: 'A' },
  }));
  assert.deepEqual(fixture.sent, expected);

  fixture.at(90_001);
  fixture.positions.set(seeker, sceneA2);
  assert.deepEqual(session.tick().captures, [hiderA]);
  fixture.at(90_002);
  fixture.positions.set(hiderA, sceneB);
  session.doorArrival(hiderA, { status: 'settled', entry: sceneA2 });
  assert.deepEqual(fixture.sent, expected);
});

test('host keeps the existing NPC direction private and returns final scores only once', () => {
  const fixture = authorityFixture();
  const session = createHideAndSeekAuthority(seeker, [hiderA, hiderB], rules, fixture.host);
  fixture.at(90_000);
  assert.deepEqual(session.residentDirection(hiderA), { east: 1, north: -1 });
  assert.equal(session.residentDirection(seeker), undefined);
  assert.equal(session.residentDirection(hiderD), undefined);
  assert.deepEqual(fixture.sent, []);
  fixture.at(720_000);
  assert.deepEqual(session.tick(), {
    captures: [], finished: true,
    scores: { captures: 0, hiders: [{ hiderId: hiderA, survivedMs: 720_000 }, { hiderId: hiderB, survivedMs: 720_000 }] },
  });
  assert.equal(session.residentDirection(hiderA), undefined);
  assert.equal(session.tick().scores, undefined);
});
