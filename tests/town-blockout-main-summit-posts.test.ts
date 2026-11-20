import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Mesh, Raycaster, Vector3 } from 'three';
import { createMainSummitApproach, mountMainSummitApproachSigns } from '../tools/voxel-tavern/town-blockout/main-summit-approach';
import {
  cloudTerminal, cloudTerraceTurnNorth, mountMainSummitAssembly, summitAssemblyAnchor, summitWorldPoint, supportsCloudTerrace,
} from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { mainSummitBounds, mainSummitSpec } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { cloudPavilionSites } from '../tools/voxel-tavern/town-blockout/main-summit-pavilion-site';
import { createMainSummitRegistrationLandmarks } from '../tools/voxel-tavern/town-blockout/main-summit-registration';
import { mountMainSummitPosts } from '../tools/voxel-tavern/town-blockout/main-summit-posts';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

type Point = { east: number; north: number; height: number };
type Box = { min: [number, number, number]; max: [number, number, number] };
const radius = .27;
const bodyHeight = 1.8;
const probeSpacing = .02;
const maxStep = .43;

function fixture() {
  const owner = new Group();
  const assembly = mountMainSummitAssembly(owner, Date.UTC(2026, 11, 31, 6));
  const { summit, cloudDeck } = createMainSummitRegistrationLandmarks(assembly.arrivalHeight);
  const approach = createMainSummitApproach({
    terminal: cloudTerminal, terraceTurnNorth: cloudTerraceTurnNorth,
    gateArrival: assembly.stations.gate.to,
    frontStamp: {
      east: cloudDeck.stampPoint.east - summitAssemblyAnchor.east,
      north: cloudDeck.stampPoint.north - summitAssemblyAnchor.north,
    },
    stampInteractionRadius: 1.1,
  });
  function groundAt(east: number, north: number, padding = 0) {
    if (north < mainSummitBounds.south) {
      return supportsCloudTerrace(east, north, padding) ? assembly.frontRidgeAt(east, north) : undefined;
    }
    return assembly.block.heightAt(east, north);
  }
  const signs = mountMainSummitApproachSigns(assembly.group, approach, groundAt);
  const site = cloudPavilionSites[1];
  const pavilionModel = assembly.group.getObjectByName('cloud-pavilion-upper-cloud') as Group | undefined;
  assert.ok(pavilionModel?.isGroup);
  const pavilion: Group = pavilionModel;
  const bridgeObject = pavilion.getObjectByName('trail-approach') as Mesh | undefined;
  assert.ok(bridgeObject?.isMesh);
  const bridge: Mesh = bridgeObject;
  const newPosts = mountMainSummitPosts(assembly.group, {
    approach, gate: assembly.stations.gate, stations: assembly.stations.stations, summit,
    upperPavilion: { model: pavilion, approach: { east: site.approachEast, north: site.approachNorth } },
  });
  const trail = createMainSummitTrail(assembly.block.heightAt, assembly.arrivalHeight);
  owner.updateMatrixWorld(true);
  const geometry = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 5);

  function pavilionFloor(east: number, north: number) {
    const world = summitWorldPoint(east, north, site.height);
    const local = pavilion.worldToLocal(new Vector3(world.east, world.height, -world.north));
    const floors = pavilion.userData.floors as Box[];
    const deck = floors.find(({ min, max }) =>
      local.x >= min[0] && local.x <= max[0] && local.z >= min[2] && local.z <= max[2]);
    if (deck) return world.height + deck.max[1] - local.y;
    geometry.ray.origin.set(world.east, world.height + 2, -world.north);
    const bridgeHit = geometry.intersectObject(bridge, false)[0];
    return bridgeHit?.point.y ?? trail.sampleSurface(east, north);
  }

  function pavilionBlocked(east: number, north: number, height: number) {
    const world = summitWorldPoint(east, north, height);
    const local = pavilion.worldToLocal(new Vector3(world.east, world.height, -world.north));
    return (pavilion.userData.colliders as Box[]).some(({ min, max }) => {
      if (local.y >= max[1] || local.y + bodyHeight <= min[1]) return false;
      const dx = Math.max(min[0] - local.x, local.x - max[0], 0);
      const dz = Math.max(min[2] - local.z, local.z - max[2], 0);
      return Math.hypot(dx, dz) < radius;
    });
  }
  function blocked(east: number, north: number, height: number) {
    return assembly.blocked(east, north, height, radius, bodyHeight) ||
      signs.blocked(east, north, height, radius, bodyHeight) ||
      pavilionBlocked(east, north, height) || newPosts.blocked(east, north, height, radius, bodyHeight);
  }

  return { assembly, signs, newPosts, trail, pavilion, pavilionFloor, groundAt, blocked,
    dispose() { newPosts.dispose(); signs.dispose(); assembly.dispose(); } };
}

function survey(item: ReturnType<typeof fixture>, label: string, path: readonly Point[], onPavilion = false) {
  let length = 0;
  let samples = 0;
  let highestStep = 0;
  let highestCrossfall = 0;
  let minNewFurnitureClearance = Infinity;
  let lastHeight: number | undefined;
  const floor = onPavilion ? item.pavilionFloor : item.groundAt;
  const offsets = [0, 1, 2, 3, 4, 5, 6, 7].map(i => [
    radius * Math.cos(i * Math.PI / 4), radius * Math.sin(i * Math.PI / 4),
  ] as const);
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1]!, to = path[index]!;
    const span = Math.hypot(to.east - from.east, to.north - from.north);
    length += span;
    const count = Math.max(1, Math.ceil(span / probeSpacing));
    for (let k = index === 1 ? 0 : 1; k <= count; k++) {
      const u = k / count;
      const east = from.east + u * (to.east - from.east);
      const north = from.north + u * (to.north - from.north);
      const at = `${label} at E${east.toFixed(3)} N${north.toFixed(3)}`;
      const height = floor(east, north);
      assert.ok(height !== undefined && Number.isFinite(height), `${at} has no support`);
      assert.equal(item.blocked(east, north, height), false, `${at} blocked at Y${height}`);
      for (const [dx, dn] of offsets) {
        const edge = floor(east + dx, north + dn);
        assert.ok(edge !== undefined && Number.isFinite(edge), `${at} has no foot support at offset ${dx}, ${dn}`);
        highestCrossfall = Math.max(highestCrossfall, Math.abs(edge - height));
      }
      if (lastHeight !== undefined) highestStep = Math.max(highestStep, Math.abs(lastHeight - height));
      lastHeight = height;
      samples++;
      minNewFurnitureClearance = Math.min(minNewFurnitureClearance,
        item.newPosts.clearance({ east, north, height }, radius, bodyHeight));
    }
  }
  assert.ok(highestStep <= maxStep && highestCrossfall <= maxStep, `${label} has an unwalkable tread`);
  return { length, samples, highestStep, highestCrossfall, minNewFurnitureClearance };
}

test('C-10 mounts exactly three staffed positions and leaves the original summit desk unstaffed', context => {
  const item = fixture();
  context.after(item.dispose);
  const { newPosts, assembly } = item;
  assert.deepEqual(newPosts.posts.map(({ id, title }) => [id, title]),
    [['gatekeeper', '门房'], ['dispatcher', '调度员'], ['pavilion-keeper', '守亭人']]);
  assert.deepEqual(newPosts.group.children.filter(child => child !== newPosts.connectors).map(child => child.name),
    newPosts.posts.map(post => post.id));
  assert.deepEqual(newPosts.summitRegistry, { east: 62.5, north: 1014, height: 800 });
  assert.ok(newPosts.connectors.getObjectByName('summit-cabin-entry-inlay'));
  assert.equal(newPosts.posts.some(post => post.stand.height === 800), false);
  assert.deepEqual(newPosts.routes.gatekeeper.at(-1), newPosts.posts[0].visitor);
  assert.deepEqual(newPosts.routes.dispatcher.at(-1), newPosts.posts[1].visitor);
  assert.deepEqual(newPosts.routes.pavilionKeeper.at(-1), newPosts.posts[2].visitor);
  assert.equal(newPosts.group.parent, assembly.group);
  assert.ok(newPosts.group.getObjectByName('dispatch-counter-top'));
  assert.ok(newPosts.group.getObjectByName('pavilion-service-top'));
  assert.equal(newPosts.blocked(-4.5, 9, 347, radius, bodyHeight), true, 'New dispatch counter is solid');
  assert.equal(assembly.interact(62.5, 1014, 800).action, 'register-summit');
  assert.equal(assembly.interact(62.5, 1014, 800).changed, false);
  newPosts.dispose();
  newPosts.dispose();
  assert.equal(newPosts.group.parent, null);
  assert.equal(newPosts.blocked(-4.5, 9, 347, radius, bodyHeight), false);
  assert.equal(assembly.mountedParts().length, 6);
});

test('P-5 round trips retain support and avoid real P-4, P-7, P-9 and P-11 structures', context => {
  const item = fixture();
  context.after(item.dispose);
  const { newPosts: { routes, staffRoutes, posts, summitRegistry }, assembly, trail } = item;
  assert.deepEqual(routes.summitFromTrail[0], trail.points.at(-1));
  assert.deepEqual(routes.summitFromTrail.at(-1), summitRegistry);
  assert.ok(routes.summitFromCable.every(lane => lane.path.at(-1) === summitRegistry));
  for (const [index, lane] of assembly.stations.stations.summit.routes.entries()) {
    assert.equal(routes.summitFromCable[index]?.path[0], lane.approach);
  }
  assert.equal(staffRoutes.pavilionKeeper.at(-1), posts[2].stand);

  const walks: ReadonlyArray<readonly [string, readonly Point[], boolean?]> = [
    ['terminal to gatekeeper', routes.gatekeeper], ['terminal to dispatcher', routes.dispatcher],
    ['terminal to original front stamp', routes.frontStamp], ['trail to pavilion keeper', routes.pavilionKeeper, true],
    ['trail top to summit registry', routes.summitFromTrail], ['gatekeeper staff stand', staffRoutes.gatekeeper],
    ['dispatcher staff stand', staffRoutes.dispatcher], ['pavilion staff stand', staffRoutes.pavilionKeeper, true],
    ...routes.cloudBoarding.map(lane => [`lower boarding ${lane.mark}`, lane.path] as const),
    ...routes.summitFromCable.map(lane => [`upper arrival ${lane.mark} to summit registry`, lane.path] as const),
  ];
  for (const [label, path, onPavilion] of walks) {
    const forward = survey(item, label, path, onPavilion);
    const reverse = survey(item, `${label} return`, [...path].reverse(), onPavilion);
    assert.equal(forward.samples, reverse.samples);
    context.diagnostic(JSON.stringify({ label, ...forward, returnSamples: reverse.samples }));
  }
  const stamp = routes.frontStamp.at(-1)!;
  assert.equal(assembly.interact(stamp.east, stamp.north, stamp.height).action, 'cloud-stamp');
  assert.deepEqual(routes.gatekeeper[0], { ...cloudTerminal, height: assembly.arrivalHeight });
  assert.equal(assembly.block.heightAt(mainSummitSpec.width, 0), undefined);
});
