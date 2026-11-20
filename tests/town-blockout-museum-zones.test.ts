import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMuseumLandmark } from '../tools/voxel-tavern/town-blockout/landmark-museum';
import { MUSEUM_MINE_TUNNEL, MUSEUM_SPECIMEN_COUNT } from '../tools/voxel-tavern/town-blockout/museum-zones';

type Box = { min: number[]; max: number[] };
const SCALE = 9 / 8;

function blockedAt(colliders: Box[], x: number, z: number) {
  return colliders.some(c => c.min[1] < 1.9 && c.max[1] > 0.35 &&
    x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2]);
}

test('ZA-06 zones: mine tunnel run is walkable end to end and at least 10 m long', () => {
  const group = buildMuseumLandmark();
  const colliders = group.userData.colliders as Box[];
  const xPost = MUSEUM_MINE_TUNNEL.x * SCALE;
  assert.ok((MUSEUM_MINE_TUNNEL.from - MUSEUM_MINE_TUNNEL.to) * SCALE >= 10, 'tunnel length');
  for (let bz = MUSEUM_MINE_TUNNEL.from - 1; bz > MUSEUM_MINE_TUNNEL.to; bz -= 1.6) {
    assert.equal(blockedAt(colliders, xPost, bz * SCALE), false, `tunnel walkway blocked at builder z=${bz}`);
  }
  assert.equal(MUSEUM_SPECIMEN_COUNT, 8);
});

test('ZA-06 zones: sand table occupies the zone-one centre and the hall keeps its floors', () => {
  const group = buildMuseumLandmark();
  const colliders = group.userData.colliders as Box[];
  assert.equal(blockedAt(colliders, -5.5 * SCALE, 7.1 * SCALE), true, 'sand table collider missing');
  assert.equal(blockedAt(colliders, 0, 7.1 * SCALE), false, 'centre spine must stay walkable');
  assert.equal((group.userData.floors as Box[]).length, 7, 'museum floors changed');
  assert.ok(colliders.length > 176, 'zone colliders were not added');
});
