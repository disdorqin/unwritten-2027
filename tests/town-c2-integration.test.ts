import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PointLight } from 'three';
import { meteorCraterDepth } from '../tools/voxel-tavern/town-blockout/meteor-crater';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

test('C2-01～05 mount through the existing ZA-22 road and share its height/collider/night channels', () => {
  const terrain = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));

  assert.equal(road.centralMound.group.parent, road.group);
  assert.equal(road.brokenCircle.group.parent, road.group);
  assert.equal(road.moltenBeads.group.parent, road.group);
  assert.equal(road.inscription.group.parent, road.group);
  assert.equal(road.warmLightChain.group.parent, road.group);

  const floor = road.anchor.rimHeight - meteorCraterDepth;
  assert.ok(Math.abs(road.heightAt(-120, 196)! - (floor + 7.5)) < 1e-9);
  assert.ok(Math.abs(road.heightAt(-120, 185)! - floor) < 1e-9);
  assert.equal(road.centralMound.stats.materialFamilies, 3);
  assert.equal(road.brokenCircle.features.length, 8);
  assert.equal(road.moltenBeads.stats.beadCount, 768);
  assert.equal(road.inscription.stats.hasText, false);
  assert.equal(road.warmLightChain.data.lampCount, 16);

  const colliders = road.group.userData.colliders as unknown[];
  assert.ok(colliders.includes(road.inscription.colliders[0]));
  const legacyLights = road.group.getObjectByName('c2-physical-worklights-authority-free');
  assert.ok(legacyLights);
  assert.equal(legacyLights.children.filter(child => child instanceof PointLight).length, 6);

  road.craterActions.setNight(true);
  assert.equal(road.warmLightChain.isNightLit, true);
  assert.equal(road.warmLightChain.lights.filter(light => light.visible).length, 16);
  road.moltenBeads.update({
    cameraPosition: { x: -88, y: road.heightAt(-88, 168)! + 1.6, z: -168 }, night: true,
  });
  assert.equal(road.moltenBeads.stats.beadsVisible, true);
  assert.equal(road.moltenBeads.stats.emissiveIntensity, .3);
  road.craterActions.setNight(false);
  assert.equal(road.warmLightChain.isNightLit, false);
});
