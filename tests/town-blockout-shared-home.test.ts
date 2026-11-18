import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { townResidentPostcards } from '../tools/voxel-tavern/town-blockout/town-resident-postcards.ts';

test('the shared home includes the twelve manuscript postcards verbatim', () => {
  const manuscript = readFileSync(new URL('../docs/交流区/Muse/NPC补供稿-小二明信片生肖线索-v1.md', import.meta.url), 'utf8');
  const cards = [...manuscript.matchAll(/^\|\s*\d+\s*\|\s*(.*?)\s*·\s*(.*?)\s*\|\s*(.*?)（\d+）\s*\|/gm)]
    .map(([, author, place, body]) => ({ author, place, body }));
  assert.equal(cards.length, 12);
  assert.deepEqual(townResidentPostcards, cards);
  assert.ok(cards.every(({ body }) => [...body].length <= 40));
});
import {
  buildSharedHome, createSharedHomeSpots, sharedHomeHearthWarmth, sharedHomeSpawn, sharedHomeWalkable,
} from '../tools/voxel-tavern/town-blockout/landmark-shared-home.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import type { TownSeat } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { isSharedHomePosition, sharedHomeLayer } from '../src/presence/shared-home-space.ts';
import type { InstancedMesh } from 'three';

test('shared home has one enclosed floor and two untextured drawing batches', () => {
  const room = buildSharedHome();
  const batches = room.children as InstancedMesh[];
  const { colliders, floors } = readWalkGeometry(room);
  assert.equal(batches.length, 2);
  assert.ok(batches.every(mesh => mesh.isInstancedMesh && mesh.layers.isEnabled(sharedHomeLayer)));
  assert.equal(batches[0].geometry, batches[1].geometry);
  const triangles = batches.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index!.count / 3, 0);
  assert.ok(triangles < 10_000);
  assert.equal(floors.length, 1);
  assert.equal(floors[0].max[1], sharedHomeSpawn.ground);
  assert.equal(floors[0].max[0] - floors[0].min[0], 14);
  assert.equal(floors[0].max[2] - floors[0].min[2], 12);
  assert.ok(colliders.length > 20);
  assert.equal(isSharedHomePosition(sharedHomeSpawn.x, sharedHomeSpawn.n, sharedHomeSpawn.ground), true);
  assert.equal(isSharedHomePosition(sharedHomeSpawn.x, sharedHomeSpawn.n, 15), false);
});

test('the entrance connects to every seat, hearth, photograph and exit on walkable floor', () => {
  const room = buildSharedHome();
  const { colliders } = readWalkGeometry(room);
  const stand = (x: number, n: number) => sharedHomeWalkable(x, n) && !colliders.some(({ min, max }) => {
    if (min[1] >= sharedHomeSpawn.ground + 1.775 || max[1] <= sharedHomeSpawn.ground + .025) return false;
    const dx = Math.max(min[0] - x, x - max[0], 0);
    const dz = Math.max(min[2] + n, -n - max[2], 0);
    return dx ** 2 + dz ** 2 < .27 ** 2;
  });

  const step = .15;
  const reached = new Set<string>();
  const pending = [[0, 0]];
  for (let i = 0; i < pending.length; i++) {
    const [ie, inorth] = pending[i];
    const key = `${ie},${inorth}`;
    if (reached.has(key) || !stand(sharedHomeSpawn.x + ie * step, sharedHomeSpawn.n + inorth * step)) continue;
    reached.add(key);
    pending.push([ie + 1, inorth], [ie - 1, inorth], [ie, inorth + 1], [ie, inorth - 1]);
  }

  const seated: TownSeat[] = [];
  const messages: string[] = [];
  let exited = false;
  let doorBookOpened = false;
  let filename = '';
  const spots = createSharedHomeSpots({
    sit: seat => seated.push(seat), face() {}, announce: message => messages.push(message),
    open() { throw new Error('The postcard form is exercised in Chrome.'); },
  }, () => { exited = true; }, name => { filename = name; }, room, () => { doorBookOpened = true; });
  assert.equal(spots.length, 20);
  for (const spot of spots) {
    assert.equal(stand(spot.x, spot.n), true, spot.label);
    const ex = Math.round((spot.x - sharedHomeSpawn.x) / step);
    const nx = Math.round((spot.n - sharedHomeSpawn.n) / step);
    assert.ok(reached.has(`${ex},${nx}`), spot.label);
    if (spot.label !== '翻看或写明信片') spot.run();
  }
  assert.equal(seated.length, 14);
  assert.equal(exited, true);
  assert.equal(doorBookOpened, true);
  assert.equal(filename, 'UNWRITTEN-2027-shared-home.png');
  assert.deepEqual(messages, ['靠近壁炉，冻纹会慢慢消退。', '窗边的台灯熄了。']);
  assert.equal(room.toggleDeskLamp(), true);
  const hearth = spots.find(spot => spot.label.startsWith('烤火'))!;
  assert.equal(sharedHomeHearthWarmth(hearth.x, hearth.n, hearth.ground), true);
  const hearthSeat = seated[spots.findIndex(spot => spot.label.includes('壁炉旁单椅'))];
  assert.equal(sharedHomeHearthWarmth(hearthSeat.x, hearthSeat.n, sharedHomeSpawn.ground), true);
  assert.equal(sharedHomeHearthWarmth(hearth.x, hearth.n, 15), false);
  assert.equal(sharedHomeHearthWarmth(sharedHomeSpawn.x, sharedHomeSpawn.n, sharedHomeSpawn.ground), false);
});
