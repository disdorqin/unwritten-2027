import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Color, Group, Matrix4, Quaternion, Vector3, type InstancedMesh, type Mesh, type MeshLambertMaterial } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { surveyZa31CraterWinch } from '../tools/voxel-tavern/town-blockout/town-za31-crater-winch';
import { createAtlasSpeciesRegistry } from '../tools/voxel-tavern/town-blockout/town-atlas-species';
import {
  c2CraterMoltenBeadsPlan, disposeC2CraterMoltenBeads, k47StarTearsAtlasEntry,
  k47StarTearsCopy, mountC2CraterMoltenBeads, updateC2CraterMoltenBeads,
  type MoltenBeadsScene,
} from '../tools/voxel-tavern/town-blockout/town-c2-crater-molten-beads';

const grid = createTerrainGrid();
const road = mountWestCraterRoad(worldBounds.depth, north => grid.groundHeightAt(0, north));
const survey = surveyZa31CraterWinch(road);
assert.ok(survey, 'the live road must expose its winch and snake-stone survey');
const scenes: MoltenBeadsScene[] = [];
after(() => {
  for (const scene of scenes) disposeC2CraterMoltenBeads(scene);
});

function mount(options: Parameters<typeof mountC2CraterMoltenBeads>[1] = {}) {
  const scene = mountC2CraterMoltenBeads(road, options);
  scenes.push(scene);
  return scene;
}

function beadMatrices(scene: MoltenBeadsScene) {
  const mesh = scene.group.getObjectByName('c2-molten-beads-impact-glass') as InstancedMesh;
  assert.ok(mesh?.isInstancedMesh);
  const matrix = new Matrix4();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    return matrix.clone();
  });
}

test('C2-03 fixes the 20×15 m east-west beach and exactly 640 instanced voxel beads across three material families', () => {
  const scene = mount();
  const mesh = scene.group.getObjectByName('c2-molten-beads-impact-glass') as InstancedMesh;
  assert.ok(mesh?.isInstancedMesh);
  assert.equal(c2CraterMoltenBeadsPlan.east, -88);
  assert.equal(c2CraterMoltenBeadsPlan.north, 168);
  assert.equal(c2CraterMoltenBeadsPlan.beadCount, 640);
  assert.equal(scene.stats.width, 20);
  assert.equal(scene.stats.depth, 15);
  assert.equal(scene.stats.longAxis, 'east-west');
  assert.equal(scene.stats.beadCount, 640);
  assert.equal(mesh.count, 640);
  assert.deepEqual(scene.stats.materialFamilies, ['charred-earth', 'impact-glass', 'basalt-gravel']);
  assert.equal(scene.stats.drawCalls, 3);
  assert.ok(scene.stats.triangles < 80_000);
  const earth = scene.group.getObjectByName('c2-molten-beads-scorched-earth') as Mesh | undefined;
  const gravel = scene.group.getObjectByName('c2-molten-beads-basalt-gravel') as InstancedMesh | undefined;
  assert.ok(earth?.isMesh);
  assert.ok(gravel?.isInstancedMesh);
  const earthColors = earth.geometry.getAttribute('color');
  assert.equal(earthColors.count, earth.geometry.getAttribute('position').count);
  assert.equal((earth.material as MeshLambertMaterial).vertexColors, true);
  assert.ok(new Set(Array.from({ length: earthColors.count }, (_, index) =>
    [earthColors.getX(index), earthColors.getY(index), earthColors.getZ(index)].map(value => value.toFixed(3)).join(','),
  )).size >= 5, 'scorched earth needs broad tonal patches as well as texel grain');
  assert.equal(scene.group.getObjectsByProperty('isLight', true).length, 0);

  const position = new Vector3(), scale = new Vector3(), rotation = new Quaternion();
  let minEast = Infinity, maxEast = -Infinity, minNorth = Infinity, maxNorth = -Infinity;
  let observedMin = Infinity, observedMax = 0;
  for (const matrix of beadMatrices(scene)) {
    matrix.decompose(position, rotation, scale);
    observedMin = Math.min(observedMin, scale.x);
    observedMax = Math.max(observedMax, scale.x);
    assert.ok(scale.x >= .06 - 1e-7 && scale.x <= .18 + 1e-7);
    assert.ok(Math.abs(scale.x - scale.y) < 1e-7 && Math.abs(scale.x - scale.z) < 1e-7);
    assert.ok(position.x >= -98 - 1e-7 && position.x <= -78 + 1e-7);
    const north = -position.z;
    assert.ok(north >= 160.5 - 1e-7 && north <= 175.5 + 1e-7);
    minEast = Math.min(minEast, position.x); maxEast = Math.max(maxEast, position.x);
    minNorth = Math.min(minNorth, north); maxNorth = Math.max(maxNorth, north);
  }
  assert.ok(maxEast - minEast > maxNorth - minNorth, 'the occupied long axis must run east-west');
  assert.ok(observedMin >= .06 && observedMax <= .18);
});

test('C2-03 restrains night emission and hides all near-read beads beyond 15 m and at the crater lip', () => {
  const scene = mount();
  const mesh = scene.group.getObjectByName('c2-molten-beads-impact-glass') as InstancedMesh;
  assert.ok(mesh?.isInstancedMesh);
  const material = mesh.material as MeshLambertMaterial;
  assert.equal(material.emissive.getHex(), 0x65c9ad);
  assert.equal(scene.stats.beadsVisible, false, 'no camera has been supplied at mount time');

  const centreHeight = road.heightAt(-88, 168)!;
  updateC2CraterMoltenBeads(scene, {
    cameraPosition: { x: -88, y: centreHeight + 1.6, z: -168 }, night: false,
  });
  assert.equal(scene.stats.beadsVisible, true);
  assert.equal(scene.stats.emissiveIntensity, 0, 'daylight glass has no emissive read');

  scene.update({ cameraPosition: { x: -88, y: centreHeight + 1.6, z: -168 }, night: true });
  assert.equal(scene.stats.emissiveIntensity, .3);
  assert.ok(scene.stats.emissiveIntensity <= .35, 'no lamp-like glow');

  // Exactly 15 m outside the north edge remains in the inclusive near-read envelope,
  // while staying inside the crater rim rather than testing from the lip itself.
  scene.update({ cameraPosition: { x: -88, y: centreHeight + 1.6, z: -190.5 }, night: true });
  assert.equal(scene.stats.footprintDistance, 15);
  assert.equal(scene.stats.beadsVisible, true);
  scene.update({ cameraPosition: { x: -88, y: centreHeight + 1.6, z: -190.501 }, night: true });
  assert.equal(scene.stats.beadsVisible, false);

  scene.update({ cameraPosition: { x: road.lip.east, y: road.lip.height + 1.6, z: -road.lip.north }, night: true });
  assert.equal(scene.stats.beadsVisible, false,
    `the rim cannot expose the beach glow: lip=${JSON.stringify(road.lip)} distance=${scene.stats.footprintDistance}`);

  // The per-fragment gate also covers beads at the far side while the batch itself is near.
  const shader = {
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
  } as unknown as Parameters<NonNullable<MeshLambertMaterial['onBeforeCompile']>>[0];
  material.onBeforeCompile(shader, {} as never);
  assert.match(shader.fragmentShader, /smoothstep\(14\.5, 15\.0, distance\(vMoltenBeadWorld, cameraPosition\)\)/);
  assert.match(shader.fragmentShader, /moltenCore = 1\.0 - smoothstep\(0\.06, 0\.46, length\(vMoltenBeadLocal\.xz\)\)/);
  assert.match(shader.fragmentShader, /mix\(moltenEdgeTint, moltenCoreTint, moltenLayer\)/);
  assert.match(shader.vertexShader, /vMoltenBeadLocal = transformed/);
  assert.match(shader.vertexShader, /instanceMatrix \* moltenWorldPosition/);
});

test('C2-03 layers cool glass, sparse warm inclusions and basalt tints without extra draw calls', () => {
  const scene = mount();
  const glass = scene.group.getObjectByName('c2-molten-beads-impact-glass') as InstancedMesh;
  const gravel = scene.group.getObjectByName('c2-molten-beads-basalt-gravel') as InstancedMesh;
  assert.ok(glass.instanceColor);
  assert.ok(gravel.instanceColor);
  const glassTones = new Set<string>(), gravelTones = new Set<string>();
  const color = new Color();
  let warmInclusions = 0, coolGlass = 0;
  for (let index = 0; index < glass.count; index++) {
    glass.getColorAt(index, color);
    glassTones.add(color.getHexString());
    if (color.r > color.b * 1.4) warmInclusions++;
    else coolGlass++;
  }
  for (let index = 0; index < gravel.count; index++) {
    gravel.getColorAt(index, color);
    gravelTones.add(color.getHexString());
  }
  assert.ok(glassTones.size >= 7);
  assert.ok(gravelTones.size >= 4);
  assert.ok(warmInclusions > 0 && warmInclusions < glass.count * .2);
  assert.ok(coolGlass > glass.count * .8);
  assert.equal(scene.stats.drawCalls, 3);
  assert.equal(scene.group.children.length, 3);
  assert.equal(scene.group.getObjectsByProperty('isLight', true).length, 0);
});

test('C2-03 leaves the winch workface, snake-stone reservation and caller exclusions untouched', () => {
  const scene = mount({ reservedSites: [{ east: -87, north: 168, radius: .8 }] });
  assert.ok(scene.stats.reservedSites.some(site => site.source === 'workface'));
  assert.ok(scene.stats.reservedSites.some(site => site.source === 'snake-stone'));
  const reserved = scene.stats.reservedSites;
  const position = new Vector3(), scale = new Vector3(), rotation = new Quaternion();
  for (const matrix of beadMatrices(scene)) {
    matrix.decompose(position, rotation, scale);
    for (const site of reserved) {
      const clearance = Math.hypot(position.x - site.east, -position.z - site.north);
      assert.ok(clearance >= site.radius + scale.x * Math.sqrt(3) / 2 - 1e-7,
        `bead enters ${site.source}`);
    }
  }

  const earth = scene.group.getObjectByName('c2-molten-beads-scorched-earth') as Mesh;
  assert.ok(earth?.isMesh);
  const vertices = earth.geometry.getAttribute('position');
  const index = earth.geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    for (let corner = 0; corner < 3; corner++) {
      const at = index.getX(i + corner);
      const east = vertices.getX(at), north = -vertices.getZ(at);
      minE = Math.min(minE, east); maxE = Math.max(maxE, east);
      minN = Math.min(minN, north); maxN = Math.max(maxN, north);
    }
    for (const site of reserved) {
      const nearestE = Math.max(minE, Math.min(maxE, site.east));
      const nearestN = Math.max(minN, Math.min(maxN, site.north));
      assert.ok(Math.hypot(nearestE - site.east, nearestN - site.north) >= site.radius - 1e-7,
        `scorched-earth triangle enters ${site.source}`);
    }
  }
  assert.equal(scene.stats.beadCount, c2CraterMoltenBeadsPlan.beadCount,
    'small protected footprints do not reduce the approved density');
});

test('C2-03 exposes only a frozen first-pickup host marker and forwards accepted pickup to the existing atlas interface', () => {
  const registry = createAtlasSpeciesRegistry(k47StarTearsCopy);
  assert.equal(registry.register(k47StarTearsAtlasEntry), true);
  const received: unknown[] = [];
  const scene = mount({
    onFirstPickup(marker) {
      received.push(marker);
      registry.record(marker.atlasSpeciesId, marker.atlasDiscovery);
    },
  });
  const marker = scene.firstPickupHostMarker;
  assert.ok(Object.isFrozen(marker));
  assert.equal(marker.kind, 'first-pickup');
  assert.equal(marker.atlasSpeciesId, 'crater-star-tears');
  assert.equal(marker.atlasDiscovery, 'seen');
  assert.equal(marker.range, 2.4);
  assert.equal('inventory' in marker, false);
  assert.equal('collected' in marker, false);
  assert.equal(registry.page(marker.atlasSpeciesId)!.stage, 'unknown');

  scene.update({ cameraPosition: { x: -88, y: road.heightAt(-88, 168)! + 1.6, z: -168 }, night: true });
  assert.equal(received.length, 0, 'camera updates never invent a pickup');
  scene.notifyFirstPickup();
  assert.deepEqual(received, [marker]);
  const page = registry.page(marker.atlasSpeciesId)!;
  assert.equal(page.stage, 'seen');
  assert.equal(page.name, k47StarTearsCopy['atlas.k47.star-tears.name']);
  assert.deepEqual(page.lines, [
    k47StarTearsCopy['atlas.k47.star-tears.form'],
    k47StarTearsCopy['atlas.k47.star-tears.habit'],
    k47StarTearsCopy['atlas.k47.star-tears.folk'],
  ]);

  // Disposal detaches only this visual group; it owns no authority channels.
  const host = new Group();
  host.add(scene.group);
  scene.dispose();
  assert.equal(scene.group.parent, null);
  assert.equal(scene.group.children.length, 0);
  scene.dispose();
});
