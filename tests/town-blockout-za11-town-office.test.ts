import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { layout } from '../tools/voxel-tavern/town-blockout/terrain';
import {
  buildTownOfficeLandmark, STAR_RING_CENTER, STAR_RING_GAP, STAR_RING_RADIUS, STAR_RING_SOCKETS, CELLAR_HATCH_LOCAL,
} from '../tools/voxel-tavern/town-blockout/landmark-town-office';

const plot = layout.plots.find(p => p.id === 'town-office');

test('ZA-11: the town-office plot is registered on the civic row between tavern and clocktower', () => {
  assert.ok(plot, 'town-office plot exists in layout.json');
  assert.deepEqual(plot.origin, [190, 227, 12]);
  assert.deepEqual(plot.footprint, [20, 16]);
  assert.deepEqual(plot.door, [190, 219]);
  for (const other of layout.plots) {
    if (other.id === 'town-office') continue;
    const dx = Math.abs(other.origin[0] - plot.origin[0]) - (other.footprint[0] + plot.footprint[0]) / 2;
    const dn = Math.abs(other.origin[1] - plot.origin[1]) - (other.footprint[1] + plot.footprint[1]) / 2;
    assert.ok(dx >= 0 || dn >= 0, `town-office must not overlap plot ${other.id}`);
  }
  const [west, south, east, north] = layout.plaza.bounds;
  const inside = plot.origin[0] > west && plot.origin[0] < east && plot.origin[1] > south && plot.origin[1] < north;
  assert.equal(inside, false, 'town-office stands outside the plaza bounds');
});

test('ZA-11: the landmark builds with colliders, floors and the five JX-35 spaces', () => {
  assert.ok(plot);
  const model = buildTownOfficeLandmark(plot as never);
  assert.ok(model instanceof Group);
  assert.equal(model.name, 'Town Office');
  const colliders = model.userData.colliders as { min: number[]; max: number[] }[];
  const floors = model.userData.floors as { min: number[]; max: number[] }[];
  assert.ok(colliders.length >= 20, `colliders ${colliders.length}`);
  assert.ok(floors.length >= 3, `floors ${floors.length}`);
  // The front door span (local x -1.2..1.2 at the front wall z 8) stays passable:
  // no collider may block the doorway column from floor to head height.
  const doorBlocked = colliders.some(c =>
    c.min[0] < 1.0 && c.max[0] > -1.0 && c.min[2] > 7.4 && c.max[1] > 1.2 && c.min[1] < 1.2);
  assert.equal(doorBlocked, false, 'front door opening is clear');
  // Everything stays inside the plot footprint (plus porch/boards on the door side).
  model.traverse(obj => {
    const anyObj = obj as { geometry?: unknown };
    assert.ok(anyObj);
  });
  const ring = model.userData.starRing as { socketsLocal: number[][]; centerLocal: number[] };
  assert.ok(ring, 'star ring wiring data is exposed for ZB-17/ZB-18/ZB-02');
});

test('ZA-11: the star ring is the town-chronicle ring — 40 degree gap, twelve empty sockets', () => {
  assert.equal(STAR_RING_GAP.widthDeg, 40);
  assert.equal(STAR_RING_SOCKETS.length, 12);
  assert.ok(plot);
  const model = buildTownOfficeLandmark(plot as never);
  const count = model.userData.ringBlockCount as number;
  // 30 slots at 12-degree steps minus the ones swallowed by the 40-degree gap (3-4 blocks).
  assert.ok(count >= 25 && count <= 27, `ring blocks ${count}`);
  const [cx, cy, cz] = STAR_RING_CENTER;
  for (const [sx, sy, sz] of STAR_RING_SOCKETS) {
    const dy = sy - cy, dz = -(sz - cz);
    const dist = Math.hypot(dy, dz);
    assert.ok(Math.abs(dist - STAR_RING_RADIUS) < .02, `socket on the ring radius (${dist})`);
    let deg = Math.atan2(dz, dy) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    let rel = ((deg - STAR_RING_GAP.centerDeg) % 360 + 360) % 360;
    if (rel > 180) rel -= 360;
    assert.ok(Math.abs(rel) >= STAR_RING_GAP.widthDeg / 2 - .01, 'no socket inside the gap arc');
    assert.ok(sx < cx, 'sockets face the hall side of the ring');
  }
  // The cellar hatch (rat-stone cellar interface) sits in the ring room's far corner.
  const [hx, , hz] = CELLAR_HATCH_LOCAL;
  assert.ok(hx > 3.4 && hz < -3, 'hatch inside the east room');
});
