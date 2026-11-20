import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Group, Vector3, type BufferGeometry, type Material, type Mesh } from 'three';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { createMainSummitBlock, mainSummitLayout, mainSummitSpec } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { mountMainSummitOutlook } from '../tools/voxel-tavern/town-blockout/main-summit-outlook';
import { createMainSummitRegistrationLandmarks } from '../tools/voxel-tavern/town-blockout/main-summit-registration';

type PlanPoint = Readonly<{ east: number; north: number }>;

const radius = .27;
const bodyHeight = 1.8;
const summitHeight = mainSummitSpec.summitHeight;

function* sampleWalk(route: readonly PlanPoint[]) {
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!;
    const to = route[i]!;
    const east = to.east - from.east;
    const north = to.north - from.north;
    const count = Math.max(1, Math.ceil(Math.hypot(east, north) / .2));
    for (let step = 0; step <= count; step++) {
      yield { east: from.east + east * step / count, north: from.north + north * step / count };
    }
  }
}

test('ZD-01 mounts the east outlook on supported P-1 ground and releases its scenery once', context => {
  const terrain = createMainSummitBlock(mainSummitLayout, 347, 50);
  const owner = new Group();
  const existingScene = new Group();
  owner.add(existingScene);
  const outlook = mountMainSummitOutlook(owner, terrain.heightAt);
  context.after(() => { outlook.dispose(); terrain.dispose(); });

  assert.equal(outlook.group.parent, owner);
  assert.equal(outlook.group.name, 'main-summit-outlook');
  assert.deepEqual(outlook.anchor, { east: 81, north: 998, height: summitHeight });
  assert.deepEqual(outlook.stand, { east: 80, north: 998, height: summitHeight });
  const deck = outlook.group.getObjectByName('summit-outlook-deck');
  const rail = outlook.group.getObjectByName('summit-outlook-rail');
  const telescope = outlook.group.getObjectByName('summit-outlook-telescope');
  assert.ok(deck && rail && telescope);

  const deckBounds = new Box3().setFromObject(deck);
  assert.ok(deckBounds.min.x >= 77.49 && deckBounds.max.x <= 84.51);
  assert.ok(-deckBounds.max.z >= 995.49 && -deckBounds.min.z <= 1000.51);
  assert.ok(deckBounds.max.y >= summitHeight && deckBounds.max.y <= summitHeight + .06);
  assert.ok(deckBounds.containsPoint(new Vector3(outlook.stand.east, summitHeight, -outlook.stand.north)));
  for (const east of [deckBounds.min.x, deckBounds.max.x]) {
    for (const north of [-deckBounds.max.z, -deckBounds.min.z]) {
      assert.equal(terrain.heightAt(east, north), summitHeight, 'Deck corners remain on the real summit plateau');
    }
  }

  const railBounds = new Box3().setFromObject(rail);
  const telescopeBounds = new Box3().setFromObject(telescope);
  assert.ok(railBounds.max.x > telescopeBounds.max.x, 'The railing lies east of the telescope');
  assert.ok(telescopeBounds.min.x > outlook.stand.east && telescopeBounds.max.y > summitHeight + 1);
  const objective = telescope.getObjectByName('outlook-telescope-objective');
  const eyepiece = telescope.getObjectByName('outlook-telescope-eyepiece');
  assert.ok(objective && eyepiece);
  const front = objective.getWorldPosition(new Vector3());
  const rear = eyepiece.getWorldPosition(new Vector3());
  assert.ok(front.x > rear.x && front.y > rear.y && Math.abs(front.z - rear.z) < 1e-7,
    'The optical axis faces due east and angles up toward the dawn horizon');

  for (const { east, north } of sampleWalk([{ east: 84.1, north: 996.2 }, { east: 84.1, north: 999.8 }])) {
    assert.equal(outlook.blocked(east, north, summitHeight, radius, bodyHeight), true,
      `The east rail blocks a standing player continuously at N${north.toFixed(2)}`);
  }
  assert.equal(outlook.blocked(82, 998, summitHeight, radius, bodyHeight), true, 'The telescope pedestal blocks a player');
  assert.equal(outlook.blocked(82, 998, summitHeight + 3, radius, bodyHeight), false,
    'The ground prop leaves airspace clear above it');

  const releases = new Map<BufferGeometry | Material, number>();
  outlook.group.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    for (const resource of [mesh.geometry, ...[mesh.material].flat()]) {
      if (releases.has(resource)) continue;
      releases.set(resource, 0);
      resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource)! + 1));
    }
  });
  assert.ok(releases.size >= 4);
  outlook.dispose();
  outlook.dispose();
  assert.deepEqual(owner.children, [existingScene]);
  assert.equal(outlook.blocked(82, 998, summitHeight, radius, bodyHeight), false);
  for (const releaseCount of releases.values()) assert.equal(releaseCount, 1);
});

test('ZD-01 assembly allows the outlook approach while preserving P-4 and F-1 paths', context => {
  const owner = new Group();
  const assembly = mountMainSummitAssembly(owner, 0);
  context.after(assembly.dispose);
  const { outlook } = assembly;
  const { entry, routes, registry } = createMainSummitRegistrationLandmarks(assembly.arrivalHeight).summit;
  assert.equal(outlook.group.parent, assembly.group);
  assert.equal(assembly.blocked(82, 998, summitHeight, radius, bodyHeight), true, 'The assembly uses the outlook colliders');

  const outlookPath = [entry, { east: 72, north: entry.north }, { east: 72, north: 998 }, outlook.stand];
  for (const route of [outlookPath, [...outlookPath].reverse(), routes.fromTrail, routes.fromCable]) {
    for (const { east, north } of sampleWalk(route)) {
      const point = `E${east.toFixed(2)} N${north.toFixed(2)}`;
      assert.equal(assembly.block.heightAt(east, north), summitHeight, `The path stays on the summit plateau at ${point}`);
      assert.equal(assembly.blocked(east, north, summitHeight, radius, bodyHeight), false,
        `The path stays open for a standing player at ${point}`);
    }
  }

  // F-1 walks out from the cabin on the registry meridian before launching south.
  const southEdge = mainSummitLayout.summit.north - mainSummitSpec.summitPlateau[1] / 2;
  const launchPath = [entry, { east: registry.east, north: southEdge - 40 }];
  for (const { east, north } of sampleWalk(launchPath)) {
    assert.equal(outlook.blocked(east, north, summitHeight, radius, bodyHeight), false,
      `The outlook clears the F-1 launch corridor at N${north.toFixed(2)}`);
  }
  assert.ok(summitHeight - assembly.block.heightAt(registry.east, southEdge - 40)! > 15);
});
