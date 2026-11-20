import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Group, Vector3, type InstancedMesh } from 'three';
import { createSnowWingVisual } from '../tools/voxel-tavern/town-blockout/flight-equipment-visuals';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  createMainSummitRegistrationLandmarks, mountMainSummitRegistration,
} from '../tools/voxel-tavern/town-blockout/main-summit-registration';
import { mountMainSummitWingRack, summitWingRackStand } from '../tools/voxel-tavern/town-blockout/main-summit-wing-rack';

const playerRadius = .27;
const standingHeight = 1.8;
const landmarks = createMainSummitRegistrationLandmarks();

test('the cabin door, P-4 registry and snow-wing rack stay reachable on the summit floor', t => {
  const scene = new Group();
  const terrain = createMainSummitBlock(mainSummitLayout, 347, 50);
  const lodge = mountMainSummitRegistration(scene, landmarks);
  const rack = mountMainSummitWingRack(scene);
  t.after(() => {
    rack.dispose();
    lodge.dispose();
    terrain.dispose();
  });

  const { hut, registry, routes } = landmarks.summit;
  const { stand } = rack;
  assert.deepEqual(stand, summitWingRackStand);
  assert.equal(rack.canReach(stand), true);
  assert.equal(rack.canReach(registry), false, 'Registration is outside pickup reach');
  assert.equal(rack.canReach({ ...stand, east: stand.east - 2 }), false, 'The aisle is outside pickup reach');
  assert.equal(rack.canReach({ ...stand, height: hut.height - 2 }), false, 'Pickup requires the cabin floor');
  assert.equal(rack.canReach({ ...stand, height: hut.height + 2 }), false, 'Pickup rejects a position above the floor');
  assert.equal(rack.blocked(67.63, stand.north, hut.height, playerRadius, standingHeight), true,
    'The rack itself stops a standing player');

  const rackPath = [
    { east: registry.east, north: 1006, height: hut.height },
    registry,
    { east: 65.55, north: registry.north, height: hut.height },
    { east: 65.55, north: stand.north, height: hut.height },
    stand,
  ];
  for (const route of [routes.fromTrail, routes.fromCable, rackPath, [...rackPath].reverse()]) {
    for (let index = 1; index < route.length; index++) {
      const from = route[index - 1];
      const to = route[index];
      const samples = Math.ceil(Math.hypot(to.east - from.east, to.north - from.north) / .1);
      for (let step = 0; step <= samples; step++) {
        const east = from.east + (to.east - from.east) * step / samples;
        const north = from.north + (to.north - from.north) * step / samples;
        const height = terrain.heightAt(east, north);
        const point = `E${east.toFixed(2)} N${north.toFixed(2)}`;
        assert.ok(height === hut.height, `The route stays on the summit floor at ${point}`);
        const hutBlocked = lodge.colliders.some(({ min, max }) => {
          if (height >= max[1] || height + standingHeight <= min[1]) return false;
          const dx = Math.max(min[0] - east, east - max[0], 0);
          const dz = Math.max(min[2] + north, -north - max[2], 0);
          return Math.hypot(dx, dz) < playerRadius;
        });
        assert.equal(hutBlocked, false, `The P-4 cabin clears a player at ${point}`);
        assert.equal(rack.blocked(east, north, height, playerRadius, standingHeight), false,
          `The rack clears a player at ${point}`);
      }
    }
  }
});

test('the rack shows the F-7 wing clear of cabin solids and empties on claim', t => {
  const scene = new Group();
  const rack = mountMainSummitWingRack(scene);
  const original = createSnowWingVisual();
  t.after(() => {
    rack.dispose();
    original.dispose();
  });

  const displayedWing = rack.group.getObjectByName('snow-wing-voxels') as InstancedMesh | undefined;
  const originalWing = original.group.getObjectByName('snow-wing-voxels') as InstancedMesh | undefined;
  assert.ok(displayedWing?.isInstancedMesh && originalWing?.isInstancedMesh);
  assert.equal(displayedWing.count, originalWing.count);

  rack.group.updateWorldMatrix(true, true);
  const wingBounds = new Box3().setFromObject(displayedWing);
  const originalSpan = original.bounds.getSize(new Vector3()).x;
  assert.ok(Math.abs(wingBounds.getSize(new Vector3()).z - originalSpan) < 1e-5,
    'The mounted wing spans the room north to south at full F-7 scale');
  assert.ok(wingBounds.min.y > landmarks.summit.hut.height, 'The wing is mounted above the floor');
  const rackBounds = new Box3().setFromObject(rack.group);
  for (const { min, max } of landmarks.summit.colliders) {
    const overlaps = rackBounds.min.x < max[0] && rackBounds.max.x > min[0] &&
      rackBounds.min.y < max[1] && rackBounds.max.y > min[1] &&
      rackBounds.min.z < max[2] && rackBounds.max.z > min[2];
    assert.equal(overlaps, false, `The rack clears the existing cabin solid at ${min.join(', ')}`);
  }

  function showsWing() {
    let visible = false;
    rack.group.traverseVisible(object => { if (object === displayedWing) visible = true; });
    return visible;
  }
  assert.equal(showsWing(), true);
  rack.setClaimed(true);
  rack.setClaimed(true);
  assert.equal(showsWing(), false, 'The F-7 wing disappears after claim');
  assert.equal(rack.group.parent, scene, 'The empty rack stays in the cabin');
  assert.equal(rack.blocked(67.63, rack.stand.north, rack.stand.height, playerRadius, standingHeight), true);

  let wingDisposals = 0;
  displayedWing.geometry.addEventListener('dispose', () => { wingDisposals++; });
  rack.dispose();
  rack.dispose();
  assert.deepEqual(scene.children, []);
  assert.equal(wingDisposals, 1);
});
