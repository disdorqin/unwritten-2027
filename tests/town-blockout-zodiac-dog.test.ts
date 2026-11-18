import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { buildExtensionStreets } from '../tools/voxel-tavern/town-blockout/extension-streets.ts';
import { addForestDensity } from '../tools/voxel-tavern/town-blockout/forest-density.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { addStreetscape } from '../tools/voxel-tavern/town-blockout/streetscape.ts';
import { canEnter, createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { extensionRoadClearance, extensionStreetClearance } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { townResidentPostcards } from '../tools/voxel-tavern/town-blockout/town-resident-postcards.ts';
import { createZodiacDogPostcard, zodiacDogHouseId } from '../tools/voxel-tavern/town-blockout/town-zodiac-dog.ts';

const { Group, Matrix4, PerspectiveCamera } =
  createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three') as typeof import('three');

type GroundPoint = readonly [east: number, north: number];

test('the dog pickup and resident postcard have distinct walkable disks beside a real district mailbox', t => {
  const grid = createTerrainGrid();
  const track = createTownRailway(grid);
  const landscape = new Group();
  const district = addDistrictHousing(landscape, grid, () => false, track.keepClear);
  const streetscape = addStreetscape(landscape, grid, (x, n, r) =>
    district.keepClear(x, n, r) || extensionRoadClearance(x, n, r));
  const forest = addForestDensity(landscape, grid,
    (x, n, r) => district.keepClear(x, n, r) || streetscape.occupied(x, n, r),
    (x, n, r) => extensionRoadClearance(x, n, r) || track.keepClear(x, n, r) || extensionStreetClearance(x, n, r));
  const extensions = buildExtensionStreets(grid, track.keepClear, district.keepClear);
  const portal = extensions.housePortals.find(({ id }) => id === zodiacDogHouseId);
  const site = extensions.dogMailbox;
  assert.ok(portal && site);
  assert.equal(site.charm.id, 'dog');

  const [mailX, mailGround, mailZ] = site.mailbox;
  const [dogX, dogGround, dogZ] = site.charm.stand;
  const colliders = readWalkGeometry(extensions.group).colliders;
  function blocked(east: number, north: number) {
    const feet = grid.heightAt(east, north);
    return colliders.some(({ min, max }) => {
      const dx = Math.max(min[0] - east, east - max[0], 0);
      const dz = Math.max(min[2] + north, -north - max[2], 0);
      return Math.hypot(dx, dz) < .27 && feet + .025 < max[1] && feet + 1.8 > min[1];
    });
  }
  assert.ok(blocked(mailX, -mailZ), 'the mailbox has an explicit movement collider');
  assert.equal(mailGround, grid.heightAt(mailX, -mailZ));

  let opened: [title: string, description: string] | undefined;
  const postcard = createZodiacDogPostcard(site, { open(title, description) {
    opened = [title, description];
    return {} as HTMLElement;
  } });
  const dog = { x: dogX, n: -dogZ, ground: dogGround, range: site.charm.range, label: 'dog', run() {} };
  assert.ok(Math.hypot(postcard.x - dog.x, postcard.n - dog.n) > postcard.range + dog.range);
  assert.equal(nearestTownActivity([postcard, dog], dog.x, dog.n, dog.ground), dog);
  assert.equal(nearestTownActivity([dog, postcard], postcard.x, postcard.n, postcard.ground), postcard);
  postcard.run();
  const card = townResidentPostcards.find(({ author }) => author === '纪守信')!;
  assert.deepEqual(opened, [card.author + ' · ' + card.place, card.body]);

  let samples = 0;
  function assertLegal(east: number, north: number) {
    assert.ok(canEnter(east, north) && !isWater(east, north), 'dry ground');
    assert.ok(!track.keepClear(east, north, .27) && !district.blocked(east, north) &&
      !streetscape.blocked(east, north) && !forest.blocked(east, north) && !blocked(east, north),
      `walking capsule stays clear at E${east.toFixed(2)} N${north.toFixed(2)}`);
    samples++;
  }
  for (const center of [dog, postcard]) {
    assert.equal(center.ground, grid.heightAt(center.x, center.n));
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      assertLegal(center.x + center.range * Math.cos(angle), center.n + center.range * Math.sin(angle));
    }
  }
  const path: GroundPoint[] = [[portal.x, portal.n], [dog.x, portal.n], [postcard.x, postcard.n], [dog.x, dog.n]];
  for (let i = 1; i < path.length; i++) {
    const [x, n] = path[i - 1];
    const [endX, endN] = path[i];
    const steps = Math.ceil(Math.hypot(endX - x, endN - n) / .05);
    let previous = grid.heightAt(x, n);
    for (let j = 0; j <= steps; j++) {
      const atX = x + (endX - x) * j / steps;
      const atN = n + (endN - n) * j / steps;
      const next = grid.heightAt(atX, atN);
      assert.ok(Math.abs(next - previous) <= .43);
      assertLegal(atX, atN);
      previous = next;
    }
  }

  const camera = new PerspectiveCamera();
  camera.position.set(dog.x, dogGround + 1.61, dogZ);
  for (let i = 0; i < 48; i++) extensions.update(camera, false);
  const transform = new Matrix4();
  let pieces = 0;
  extensions.group.traverse(node => {
    if (!('isInstancedMesh' in node)) return;
    const batch = node as import('three').InstancedMesh;
    for (let i = 0; i < batch.count; i++) {
      batch.getMatrixAt(i, transform);
      const { elements } = transform;
      if (elements[12] >= mailX - .06 && elements[12] <= mailX + .19 &&
          elements[13] >= mailGround && elements[13] <= mailGround + 1.03 &&
          Math.abs(elements[14] - mailZ) < .01) pieces++;
    }
  });
  assert.equal(pieces, 8, 'eight mailbox boxes are emitted in the existing district trim batch');
  t.diagnostic(`validated ${samples} dry route and disk samples; eight trim boxes add 96 triangles without a dedicated draw`);
});
