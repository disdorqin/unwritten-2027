import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NearestFilter, type Mesh, type MeshStandardMaterial, type PointLight } from 'three';
import { createMeteorCrater, meteorCraterDepth, meteorCraterFixturePlan } from '../tools/voxel-tavern/town-blockout/meteor-crater';
import { craterWestSurvey, mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { mountZa31CraterCamp } from '../tools/voxel-tavern/town-blockout/town-za31-crater-camp';

test('the crater camp, warm markers and cut faces use surveyed ground and stay out of the playable spiral and shaft', () => {
  const road = mountWestCraterRoad(540, () => 10.7773);
  const terrain = createMeteorCrater(meteorCraterFixturePlan);
  const { yaw, east, north, rimHeight } = road.anchor;
  const trail = Array.from({ length: 2049 }, (_, i) => {
    const local = terrain.mainTrailPoint(i / 2048);
    return {
      east: east + local.east * Math.cos(yaw) + local.north * Math.sin(yaw),
      north: north + local.north * Math.cos(yaw) - local.east * Math.sin(yaw),
    };
  });
  const { placements } = mountZa31CraterCamp(road);
  assert.deepEqual(placements.filter(site => site.kind === 'camp').map(site => site.id),
    ['collapsed-tent', 'fire-ring', 'open-toolbox', 'broken-railhead']);
  const bands = placements.filter(site => site.kind === 'strata');
  assert.equal(bands.length, 9);
  assert.ok(bands[0].height > bands[3].height && bands[3].height > bands[6].height);
  const lamps = placements.filter(site => site.kind === 'lamp');
  assert.equal(lamps.length, 8);
  assert.equal(lamps.at(-1)?.height, rimHeight - meteorCraterDepth);
  assert.ok(lamps.every((lamp, i) => i === 0 || lamp.height < lamps[i - 1].height));
  for (const site of placements) {
    assert.equal(site.height, road.heightAt(site.east, site.north), site.id);
    assert.ok(Math.hypot(site.east - craterWestSurvey.east, site.north - craterWestSurvey.north) - site.radius >= 8, site.id);
    const clear = Math.min(...trail.map(p => Math.hypot(site.east - p.east, site.north - p.north))) - site.radius;
    assert.ok(clear > 2.2, `${site.id}: ${clear} m clearance`);
    // The unified triangulated floor includes sub-millimetre mound blend.
    // Exact equality to the actual road sampler remains asserted above.
    if (site.kind === 'camp') assert.ok(Math.abs(site.height-(rimHeight-meteorCraterDepth))<.001);
  }
  for (const [i, a] of placements.entries()) {
    for (const b of placements.slice(i + 1)) {
      assert.ok(Math.hypot(a.east - b.east, a.north - b.north) >= a.radius + b.radius, `${a.id}, ${b.id}`);
    }
  }
  assert.equal(road.heightAt(east, north), rimHeight - meteorCraterDepth);
});

test('pixel materials use the approved palette and warm light pools stay local', () => {
  const camp = mountZa31CraterCamp(mountWestCraterRoad(540, () => 10.7773));
  // Different dependency trees ship distinct Three constructors: use the
  // built-in runtime type flag, while keeping the original object-count checks.
  const meshes = camp.group.children.filter((child): child is Mesh => (child as Mesh).isMesh === true);
  assert.equal(meshes.length, 8);
  const approved = new Set([0x8a8378, 0xa98a56, 0x5d4630, 0x44503c, 0x2c3648, 0xe8ecf0, 0xe08a3c, 0x7fd4c8, 0x8a4a34]);
  for (const mesh of meshes) {
    const material = mesh.material as MeshStandardMaterial;
    assert.equal(material.isMeshStandardMaterial, true);
    if (!material.map) {
      assert.ok(approved.has(material.color.getHex()));
      continue;
    }
    const { minFilter, magFilter } = material.map;
    const image = material.map.image as { width: number; height: number; data: Uint8Array };
    assert.equal(minFilter, NearestFilter);
    assert.equal(magFilter, NearestFilter);
    assert.equal(image.width, 16);
    assert.equal(image.height, 16);
    for (let i = 0; i < image.data.length; i += 4) {
      assert.ok(approved.has(image.data[i] * 65536 + image.data[i + 1] * 256 + image.data[i + 2]));
    }
  }
  const lights = camp.group.children.filter((child): child is PointLight =>
    (child as PointLight).isPointLight === true);
  assert.equal(lights.length, 3);
  for (const light of lights) {
    assert.equal(light.color.getHex(), 0xe08a3c);
    assert.ok(light.distance < 6);
  }
  const before = lights.map(light => light.intensity);
  camp.update(.53);
  assert.notDeepEqual(lights.map(light => light.intensity), before);
  assert.ok(lights.every((light, i) => Math.abs(light.intensity / before[i] - 1) <= .12));
});
