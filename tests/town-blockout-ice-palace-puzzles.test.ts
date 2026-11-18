import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIcePalacePuzzles, icePalaceProgressKey } from '../tools/voxel-tavern/town-blockout/ice-palace-puzzles.ts';
import { buildIcePalaceMaze, icePalaceMazeMainline, icePalaceMazeWalls } from '../tools/voxel-tavern/town-blockout/ice-palace-maze.ts';
import { createIceThrone } from '../tools/voxel-tavern/town-blockout/ice-palace-throne.ts';
import { createIcePalaceRace, icePalaceBalconyRace } from '../tools/voxel-tavern/town-blockout/ice-palace-race.ts';
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

test('puzzle, balcony race and existing palace markers share one save without overwriting one another', () => {
  let saved = JSON.stringify({ race: { balconyBestMs: 62_000 }, enthronement: { count: 1 } });
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  const puzzle = createIcePalacePuzzles(storage);
  let now = 1;
  const race = createIcePalaceRace(storage, () => now);

  puzzle.setPlateContact(now, false, true);
  assert.equal(puzzle.collectKey(now), true);
  assert.equal(JSON.parse(saved).race.balconyBestMs, 62_000);

  race.update(...icePalaceBalconyRace.start, true);
  now += 42_000;
  race.update(...icePalaceBalconyRace.finish, true);
  assert.equal(puzzle.openThroneRoom(), true);
  assert.deepEqual(JSON.parse(saved).race, { balconyBestMs: 42_000 });
  assert.deepEqual(JSON.parse(saved).enthronement, { count: 1 });
  assert.equal(createIcePalacePuzzles(storage).state(now).throneRoom, true);
});

test('puzzle progress remains playable when storage access throws', () => {
  const deny = () => { throw new Error('Storage unavailable'); };
  const puzzle = createIcePalacePuzzles({ getItem: deny, setItem: deny });
  puzzle.setPlateContact(0, false, true);
  assert.equal(puzzle.collectKey(1), true);
  assert.equal(puzzle.openThroneRoom(), true);
  assert.equal(puzzle.state(2).key, true);
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
  throne.update(25_002, true);
  assert.equal(throne.owned(), false);
  throne.update(25_003, false);
  throne.update(26_000, true);
  throne.update(29_000, true);
  throne.update(329_000, true);
  assert.deepEqual(events, [true, false, true, false, true, false]);
});

test('maze collision gives solo players a shortest 60 m route, six cul-de-sacs and two loops outside the grotto', () => {
  const maze = buildIcePalaceMaze();
  const { colliders } = readWalkGeometry(maze);
  const spacing = 1.5;
  const playerRadius = .27;
  const gridWidth = 16;
  const gridDepth = 8;
  const offsets = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;
  const index = (x: number, z: number) => x + z * gridWidth;
  const adjacencies = new Map<number, number[]>();

  assert.equal(icePalaceMazeMainline.length, 41);
  assert.equal(colliders.length, icePalaceMazeWalls.length);
  assert.equal(maze.children.length, 1);
  assert.ok(colliders.every(box => box.max[1] === 2.2));
  for (let z = 0; z < gridDepth; z++) {
    for (let x = 0; x < gridWidth; x++) {
      const neighbors: number[] = [];
      adjacencies.set(index(x, z), neighbors);
      for (const [dx, dz] of offsets) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nx >= gridWidth || nz < 0 || nz >= gridDepth) continue;
        const clear = Array.from({ length: 21 }, (_, sample) => sample / 20).every(t => {
          const sx = (x + .5 + dx * t) * spacing, sz = (z + .5 + dz * t) * spacing;
          return colliders.every(({ min, max }) => Math.hypot(
            Math.max(min[0] - sx, sx - max[0], 0), Math.max(min[2] - sz, sz - max[2], 0),
          ) >= playerRadius);
        });
        if (clear) neighbors.push(index(nx, nz));
      }
    }
  }
  for (let i = 1; i < icePalaceMazeMainline.length; i++) {
    assert.ok(adjacencies.get(index(...icePalaceMazeMainline[i - 1]))?.includes(index(...icePalaceMazeMainline[i])));
  }
  const start = index(...icePalaceMazeMainline[0]);
  const goal = index(...icePalaceMazeMainline.at(-1)!);
  const open = [start];
  const distances = new Map([[start, 0]]);
  for (const cell of open) {
    for (const next of adjacencies.get(cell)!) {
      if (distances.has(next)) continue;
      distances.set(next, distances.get(cell)! + 1);
      open.push(next);
    }
  }
  assert.equal((distances.get(goal) ?? 0) * spacing, 60);
  const degree = (cell: number) => adjacencies.get(cell)!.length;
  assert.equal(open.filter(cell => cell !== start && degree(cell) === 1).length, 6);
  const edges = open.reduce((sum, cell) => sum + degree(cell), 0) / 2;
  assert.equal(edges - open.length + 1, 3); // Two side loops, plus the walk around the four grotto cells.
});
