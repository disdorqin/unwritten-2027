import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Vector3 } from 'three';
import { createUndergroundMineCartTrack, undergroundMineCartLocalTrack } from '../src/shared/underground-mine-cart-track.js';
import { mountUndergroundMineCartActivity } from '../tools/voxel-tavern/town-blockout/underground-mine-cart-activity.js';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity.js';

test('only an accepted same-domain snapshot moves and sounds the cart, even after replay and re-entry', () => {
  const parent = new Group();
  const track = createUndergroundMineCartTrack(undergroundMineCartLocalTrack);
  const requests: unknown[] = [];
  const sounds: unknown[] = [];
  const activity = mountUndergroundMineCartActivity({
    parent, track, domainId: 'mine', pushReach: .22, rollSeconds: .4,
    requestPush: request => { requests.push(request); },
    onRoll: point => { sounds.push(point); },
  });
  const from = track.approach(0, 1);
  const spot = () => nearestTownActivity(activity.spots, from.east, from.north, from.height);
  activity.sync({ revision: 0, step: 0 }, 'surface');
  assert.equal(spot(), undefined);
  activity.sync({ revision: 0, step: 0 }, 'mine');
  spot()?.run();
  assert.deepEqual(requests, [{ direction: 1, revision: 0 }]);
  assert.deepEqual(sounds, []);
  assert.equal(activity.group.position.z, 16);
  activity.sync({ revision: 1, step: 1 }, 'mine');
  activity.update(.2);
  assert.equal(activity.group.position.z, 16.35);
  activity.update(.2);
  assert.equal(activity.group.position.z, 16.7);
  activity.sync({ revision: 0, step: 0 }, 'mine');
  assert.equal(activity.group.position.z, 16.7);
  assert.equal(sounds.length, 1);
  activity.sync({ revision: 2, step: 2 }, 'surface');
  activity.sync({ revision: 2, step: 2 }, 'mine');
  assert.equal(activity.group.position.z, 17.4);
  assert.equal(sounds.length, 1);
  const front = new Vector3(0, 0, -1).applyEuler(activity.group.rotation);
  assert.ok(front.y < 0 && front.z > .99);
  activity.dispose();
  assert.equal(parent.children.length, 0);
});
