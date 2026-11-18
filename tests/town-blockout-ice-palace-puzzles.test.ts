import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIcePalacePuzzles, icePalaceProgressKey } from '../tools/voxel-tavern/town-blockout/ice-palace-puzzles.ts';
import { buildIcePalaceMaze, icePalaceMazeMainline, icePalaceMazeWalls } from '../tools/voxel-tavern/town-blockout/ice-palace-maze.ts';
import { createIceThrone } from '../tools/voxel-tavern/town-blockout/ice-palace-throne.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';

test('one player can carry a block through all six palace puzzle states and reload progress', () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem(key: string, value: string) { entries.set(key, value); },
  };
  const palace = createIcePalacePuzzles(storage);
  assert.equal(palace.collectKey(0), false);
  assert.equal(palace.finishVault(0), false);
  palace.setPlateContact(0, true, false);
  palace.setPlateContact(2_000, false, false);
  assert.equal(palace.plateOpen(3_499), true);
  assert.equal(palace.plateOpen(3_500), false);
  palace.setPlateContact(5_000, false, true);
  assert.equal(palace.collectKey(15_000), true);
  assert.equal(palace.openThroneRoom(), true);

  assert.equal(palace.pullGalleryLever('sailboat'), 'reset');
  assert.equal(palace.pullGalleryLever('pine'), 'progress');
  assert.equal(palace.pullGalleryLever('sailboat'), 'progress');
  assert.equal(palace.pullGalleryLever('lighthouse'), 'opened');
  assert.equal(palace.rotateMirror(0), 2);
  for (const stage of [2, 3, 4]) assert.equal(palace.rotateMirror(1), stage);
  assert.equal(palace.state(20_000).mirrorCache, true);

  assert.equal(palace.ringBell('low', 20_000), 'progress');
  assert.equal(palace.ringBell('mid', 21_000), 'progress');
  assert.equal(palace.ringBell('high', 22_000), 'reset');
  assert.equal(palace.ringBell('low', 30_000), 'progress');
  assert.equal(palace.ringBell('high', 35_000), 'progress');
  assert.equal(palace.ringBell('mid', 40_000), 'opened');
  assert.equal(palace.state(640_000).stairOpen, false);
  assert.equal(palace.pullVaultLever(41_000), true);
  assert.equal(palace.finishVault(61_000), false);
  assert.equal(palace.pullVaultLever(64_000), true);
  assert.equal(palace.finishVault(74_000), true);
  assert.deepEqual([...entries.keys()], [icePalaceProgressKey]);
  const reloaded = createIcePalacePuzzles(storage);
  assert.equal(reloaded.state(75_000).completed, true);
  assert.equal(reloaded.state(75_000).vaultOpen, false);
});

test('throne claims after 3 seconds and ends on the third hit, departure, or term limit', () => {
  const events: boolean[] = [];
  const throne = createIceThrone(owned => events.push(owned));
  throne.update(0, true);
  throne.update(2_999, true);
  assert.equal(throne.owned(), false);
  throne.update(3_000, true);
  for (let i = 0; i < 3; i++) throne.receiveConfirmedHit(true);
  throne.update(10_000, true);
  assert.equal(throne.owned(), false);
  throne.update(11_000, false);
  throne.update(12_000, true);
  throne.update(15_000, true);
  throne.update(15_001, false);
  throne.update(25_002, false);
  throne.update(26_000, true);
  throne.update(29_000, true);
  throne.update(329_000, true);
  assert.deepEqual(events, [true, false, true, false, true, false]);
});

test('40 walkable maze legs use the fixed 16 by 8 grid and a single wall batch', () => {
  const maze = buildIcePalaceMaze();
  const { colliders } = readWalkGeometry(maze);
  assert.equal(icePalaceMazeMainline.length, 41);
  assert.equal(colliders.length, icePalaceMazeWalls.length);
  assert.equal(maze.children.length, 1);
  assert.ok(colliders.every(box => box.max[1] === 2.2));
  for (let i = 1; i < icePalaceMazeMainline.length; i++) {
    const [x, z] = icePalaceMazeMainline[i];
    const [fromX, fromZ] = icePalaceMazeMainline[i - 1];
    assert.ok(x < 16 && z < 8 && Math.abs(x - fromX) + Math.abs(z - fromZ) === 1);
    const centre = [(x + fromX + 1) * .75, (z + fromZ + 1) * .75];
    assert.ok(!colliders.some(box => box.min[0] <= centre[0] && centre[0] <= box.max[0] &&
      box.min[2] <= centre[1] && centre[1] <= box.max[2]));
  }
});
