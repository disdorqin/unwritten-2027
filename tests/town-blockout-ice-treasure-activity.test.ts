import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIceTreasure } from '../src/shared/ice-treasure';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity';
import { createTownIceTreasureActivity, type IceTreasureBellView } from '../tools/voxel-tavern/town-blockout/town-ice-treasure-activity';

function fixture() {
  const game = createIceTreasure<'north' | 'south'>('round');
  const pedestal = { x: 0, n: 0, ground: 10, bellHeight: 10.8 };
  let local = { x: 0, n: 0, ground: 10, id: 1 };
  let now = 0;
  let requests = 0;
  let releases = 0;
  let visibleRink = true;
  let bell: IceTreasureBellView = { kind: 'release' };
  const activity = createTownIceTreasureActivity({
    pedestal,
    pickupRadius: 1,
    treasure: () => visibleRink ? game.snapshot().treasure : undefined,
    now: () => now,
    localSkater: () => local,
    groundAt: (x, n) => Math.abs(x) < 10 && Math.abs(n) < 10 ? 10 : undefined,
    carrierBellPosition: id => id === 1 ? { x: 3, n: 4, height: 11 } : undefined,
    presentBell: view => {
      bell = view;
      if (view.kind === 'release') releases++;
    },
    requestPickup: () => { requests++; },
  });
  const spot = activity.spots[0];
  return {
    activity, bell: () => bell, spot, game,
    requests: () => requests,
    releases: () => releases,
    setTime: (value: number) => { now = value; },
    setLocal: (x: number, n: number, ground = 10, id = 1) => { local = { x, n, ground, id }; },
    closeRink: () => { visibleRink = false; },
  };
}

test('the bell is reachable through the usual world activity and a pickup request never predicts a holder', () => {
  const { activity, bell, spot, game, requests, setLocal } = fixture();
  assert.deepEqual(bell(), { kind: 'visible', position: { x: 0, n: 0, height: 10.8 }, frost: 0 });
  assert.equal(nearestTownActivity(activity.spots, 0, 0, 10), spot);
  assert.equal(nearestTownActivity(activity.spots, 1.01, 0, 10), undefined);
  assert.equal(nearestTownActivity(activity.spots, 0, 0, 11), undefined);

  setLocal(1.01, 0);
  spot.run();
  setLocal(0, 0, 11);
  spot.run();
  assert.equal(requests(), 0);
  setLocal(1, 0);
  nearestTownActivity(activity.spots, 1, 0, 10)?.run();
  assert.equal(requests(), 1);
  assert.equal(activity.isCarrying(), false);
  assert.equal(game.pickup(1, 0), true);
  spot.run(); // The action must reread room state even if invoked from an older spot selection.
  assert.equal(requests(), 1);
  assert.equal(activity.isCarrying(), true);
  assert.equal(spot.available?.(), false);
  assert.deepEqual(bell(), { kind: 'visible', position: { x: 3, n: 4, height: 11 }, frost: 0 });
  setLocal(1, 0, 10, 2);
  assert.equal(activity.isCarrying(), false);
});

test('confirmed drops move the action from the pedestal and unlock it at exactly three seconds', () => {
  const { activity, bell, spot, game, requests, setTime, setLocal } = fixture();
  game.pickup(1, 0);
  const point = { east: 3, north: 4 };
  assert.equal(game.snowballHit(1, point, 100), 'hit');
  activity.update();
  assert.equal(activity.isCarrying(), true);
  assert.equal(game.snowballHit(1, point, 500), 'drop');
  setTime(3499);
  setLocal(3, 4, 10, 2);
  activity.update();
  assert.equal(activity.isCarrying(), false);
  assert.equal(nearestTownActivity(activity.spots, 3, 4, 10), undefined);
  assert.deepEqual(bell(), { kind: 'visible', position: { x: 3, n: 4, height: 10 }, frost: 1 / 3000 });
  spot.run();
  assert.equal(requests(), 0);

  setTime(3500);
  activity.update();
  assert.equal(nearestTownActivity(activity.spots, 0, 0, 10), undefined);
  assert.equal(nearestTownActivity(activity.spots, 3, 4, 10), spot);
  nearestTownActivity(activity.spots, 3, 4, 10)?.run();
  assert.equal(requests(), 1);
  assert.equal(activity.isCarrying(), false);
  assert.equal(game.pickup(2, 3500), true);
  activity.update();
  assert.equal(activity.isCarrying(), true);
  assert.deepEqual(bell(), { kind: 'hidden' }, 'no foreign or guessed carrier anchor');
});

test('a missing rink and teardown release the shared bell and disable team actions', () => {
  const { activity, bell, spot, requests, releases, closeRink } = fixture();
  closeRink();
  spot.run();
  assert.deepEqual(bell(), { kind: 'release' });
  assert.equal(releases(), 1);
  assert.equal(spot.available?.(), false);
  activity.dispose();
  activity.dispose();
  assert.deepEqual(bell(), { kind: 'release' });
  assert.equal(releases(), 1, 'later team ticks and teardown do not interrupt the solo bell');
  spot.run();
  assert.equal(requests(), 0);
  assert.equal(activity.isCarrying(), false);
});
