import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, type InstancedMesh } from 'three';
import {
  createMainSummitRegistration, createMainSummitRegistrationLandmarks, mountMainSummitRegistration,
} from '../tools/voxel-tavern/town-blockout/main-summit-registration';

const radius = 0.27;
const standingHeight = 1.8;
const landmarks = createMainSummitRegistrationLandmarks();
type Box = typeof landmarks.summit.colliders[number];

function standingBlocked(east: number, north: number, floor: number, boxes: readonly Box[]) {
  return boxes.some(({ min, max }) => {
    if (floor >= max[1] || floor + standingHeight <= min[1]) return false;
    const eastClear = Math.max(min[0] - east, east - max[0], 0);
    const northClear = Math.max(min[2] + north, -north - max[2], 0);
    return Math.hypot(eastClear, northClear) < radius;
  });
}

test('P-4 stays on the 800 m plateau and keeps the door, registration desk approach, and seam routes traversable', t => {
  const { summit } = landmarks;
  assert.deepEqual(summit.monument, { east: 50, north: 1000, height: 800 });
  assert.equal(summit.registry.height, 800);
  for (const { min, max } of summit.colliders) {
    assert.ok(min[0] >= 15 && max[0] <= 85 && min[2] >= -1025 && max[2] <= -975);
  }
  assert.equal(standingBlocked(57.5, 1007, 800, summit.colliders), true, 'Front wall blocks a player');
  assert.equal(standingBlocked(62.5, 1007, 800, summit.colliders), false, 'Door opening clears a player');
  assert.equal(standingBlocked(62.5, 1016.14, 800, summit.colliders), true, 'Desk blocks a player');
  assert.equal(standingBlocked(79, 1004, 800, summit.colliders), false, 'Snow course start remains clear');

  // Survey from P-2 arrival and P-3 finish. P-7's station building is
  // supplemental keep-out geometry for this candidate, not part of the P-4 mesh.
  const station: Box = { min: [31, 800, -1008], max: [39, 805, -990] };
  const obstacles = [...summit.colliders, station];
  let samples = 0;
  for (const route of Object.values(summit.routes)) {
    assert.deepEqual(route.at(-1), summit.registry);
    for (let index = 1; index < route.length; index++) {
      const start = route[index - 1];
      const finish = route[index];
      const count = Math.ceil(Math.hypot(finish.east - start.east, finish.north - start.north) / 0.25);
      for (let step = 0; step <= count; step++) {
        const progress = step / count;
        const east = start.east + progress * (finish.east - start.east);
        const north = start.north + progress * (finish.north - start.north);
        assert.equal(standingBlocked(east, north, 800, obstacles), false, `Blocked route at E${east} N${north}`);
        samples++;
      }
    }
  }
  t.diagnostic(`${samples} capsule probes across the cable and walking arrival routes`);
});

test('cloud-deck, summit passport, and summit registry remain separate, with idempotent registration', () => {
  const registration = createMainSummitRegistration(landmarks);
  assert.deepEqual(registration.snapshot(), {
    cloudStamped: false, summitStamped: false, summitRegistered: false, snowWingEligible: false,
  });
  assert.equal(registration.interact('summit', landmarks.cloudDeck.stampPoint).action, 'out-of-range');
  assert.equal(registration.interact('cloud-deck', landmarks.cloudDeck.stampPoint).action, 'cloud-stamp');
  assert.equal(registration.snapshot().snowWingEligible, false);
  assert.equal(registration.interact('summit', landmarks.summit.stampPoint).action, 'summit-stamp');
  assert.equal(registration.snapshot().snowWingEligible, false);
  assert.equal(registration.interact('summit', landmarks.summit.entry).action, 'out-of-range');
  assert.equal(registration.interact('summit', { ...landmarks.summit.registry, height: 347 }).action, 'out-of-range');
  const reply = registration.interact('summit', landmarks.summit.registry);
  assert.deepEqual(reply, {
    action: 'register-summit', changed: true,
    profile: { cloudStamped: true, summitStamped: true, summitRegistered: true, snowWingEligible: true },
  });
  reply.profile.summitRegistered = false;
  assert.equal(registration.snapshot().snowWingEligible, true, 'Snapshots do not mutate state');
  assert.equal(registration.interact('summit', landmarks.summit.registry).changed, false);
  assert.equal(createMainSummitRegistration(landmarks).snapshot().summitRegistered, false);
  assert.equal(createMainSummitRegistration(landmarks, registration.snapshot()).snapshot().snowWingEligible, true);
});

test('both monument levels mount and dispose independently with height-strict geometry', () => {
  assert.throws(() => createMainSummitRegistrationLandmarks(346), /347–350/);
  const raisedDeck = createMainSummitRegistrationLandmarks(350);
  assert.equal(raisedDeck.cloudDeck.monument.height, 350);
  assert.deepEqual(raisedDeck.summit.monument, landmarks.summit.monument);

  const owner = new Group();
  const summit = mountMainSummitRegistration(owner, landmarks, 'summit');
  const cloud = mountMainSummitRegistration(owner, raisedDeck, 'cloud-deck');
  assert.deepEqual(owner.children, [summit.group, cloud.group]);
  assert.equal(summit.colliders, landmarks.summit.colliders);
  assert.equal(cloud.colliders, raisedDeck.cloudDeck.colliders);
  assert.ok(summit.group.children.every(mesh => (mesh as InstancedMesh).isInstancedMesh === true));
  assert.equal(summit.group.children.reduce((count, mesh) => count + (mesh as InstancedMesh).count, 0),
    landmarks.summit.parts.length);
  assert.ok(cloud.group.children.length > 0 && cloud.group.children.length <= 4);
  summit.dispose();
  assert.deepEqual(owner.children, [cloud.group]);
  cloud.dispose();
  assert.deepEqual(owner.children, []);
});
