import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSnowMaze, createSnowMazeChallenge, loadOwnSnowMaze } from '../src/presence/snow-maze';
import { CAPTURE_MS, WALL_BLOCK_HP, WALL_TOWN_CAP } from '../src/presence/snowfight';

// Synthetic course from the same clear west-plaza test area as the fortress fixture.
// These coordinates and the capture setting are test inputs, not official map data.
const entry = { east: 130.25, north: 189.75, radius: .4 };
const bell = { east: 130.25, north: 187.25, radius: .4 };
const column = { gx: 260, gy: 376 };
const blueprint = { columns: [column], entry, bell };
const rules = {
  bounds: [127, 184, 134, 194] as const,
  captureMs: CAPTURE_MS,
  bodyRadius: .27,
  ownerId: 1,
  wallTeam: 0 as const,
  canUseSite: () => true,
};

test('maze uses two existing WallField blocks and keeps them intact against a race shortcut', t => {
  const maze = compileSnowMaze(blueprint, rules)!;
  assert.ok(maze);
  assert.deepEqual(maze.wallBlocks().map(({ layer, hp }) => [layer, hp]), [[0, WALL_BLOCK_HP], [1, WALL_BLOCK_HP]]);
  const [snapshot] = maze.wallBlocks();
  snapshot.hp = 0;
  assert.equal(maze.wallBlocks()[0].hp, WALL_BLOCK_HP);
  assert.equal(maze.canMove(entry, bell), false);
  assert.equal(maze.canMove({ east: 130.75, north: 189.75 }, { east: 130.75, north: 187.75 }), false);
  assert.equal(maze.canMove({ east: 130.78, north: 189.75 }, { east: 130.78, north: 187.75 }), true);
  assert.equal(maze.canMove({ east: 130.76, north: 188.70 }, { east: 130.76, north: 188.70 }), true);
  assert.equal(maze.canMove(entry, { east: 140, north: 188 }), false);
  t.diagnostic('fixture wall is 2 blocks at 3 HP each; direct shortcut rejected; 0.25m edge gap blocked, 0.28m gap clear');
});

test('solo trial requires validated entry, lawful route and continuous bell hold', t => {
  const maze = compileSnowMaze(blueprint, rules)!;
  assert.equal(maze.begin(0, bell), undefined);
  const run = maze.begin(1000, entry)!;
  assert.equal(run.update(2000, bell), false);
  assert.equal(run.update(1500, { east: 132, north: 189.75 }), true);
  assert.equal(run.update(2000, { east: 132, north: 187.25 }), true);
  assert.equal(run.update(2500, bell), true);
  assert.equal(run.update(2500 + CAPTURE_MS - 1, bell), true);
  assert.deepEqual(run.state(), { heldMs: CAPTURE_MS - 1, elapsedMs: undefined });
  assert.equal(run.update(2500 + CAPTURE_MS, { east: 132, north: 187.25 }), true);
  assert.deepEqual(run.state(), { heldMs: 0, elapsedMs: undefined });
  assert.equal(run.update(8000, bell), true);
  assert.equal(run.update(7999, bell), false);
  assert.equal(run.update(13_016, bell), true);
  assert.deepEqual(run.state(), { heldMs: CAPTURE_MS, elapsedMs: 12_000 });
  assert.equal(run.update(13_017, bell), false);
  t.diagnostic('fixture hold at 4,999ms pending; leaving zeroes hold; re-entry held 5,000ms; elapsed 12,000ms');
});

test('blueprint compilation rejects duplicates, cap overflow, forbidden walls and invalid course inputs', () => {
  const road = { gx: 322, gy: 404 };
  const sparseColumns = new Array<typeof column>(2);
  sparseColumns[0] = column;
  assert.equal(compileSnowMaze({ ...blueprint, columns: sparseColumns }, rules), undefined);
  assert.equal(compileSnowMaze({ ...blueprint, columns: [column, column] }, rules), undefined);
  assert.equal(compileSnowMaze({ ...blueprint, columns: Array.from({ length: WALL_TOWN_CAP / 2 + 1 }, () => column) }, rules), undefined);
  assert.equal(compileSnowMaze({ ...blueprint, columns: [road] },
    { ...rules, bounds: [120, 180, 170, 210] }), undefined);
  assert.equal(compileSnowMaze(blueprint, { ...rules, captureMs: Infinity }), undefined);
  assert.equal(compileSnowMaze(blueprint, { ...rules, canUseSite: p => p.north !== 188.25 }), undefined);
  assert.equal(compileSnowMaze({ ...blueprint, bell: entry }, rules), undefined);
});

test('a compiled self-authored blueprint round-trips without mutating its walls, and malformed data is rejected', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  assert.equal(loadOwnSnowMaze(storage), undefined);
  const maze = compileSnowMaze(blueprint, rules)!;
  assert.equal(maze.saveOwn(storage), true);
  assert.deepEqual(loadOwnSnowMaze(storage), blueprint);
  const reread = compileSnowMaze(loadOwnSnowMaze(storage), rules)!;
  assert.deepEqual(reread.wallBlocks(), maze.wallBlocks());
  assert.equal(loadOwnSnowMaze({ ...storage, getItem: () => '{"columns":"corrupt"}' }), undefined);
  assert.equal(maze.saveOwn({ ...storage, setItem: () => { throw new Error('quota'); } }), false);
});

test('an invited player finishes an authored course and only its author receives their result', t => {
  const maze = compileSnowMaze(blueprint, rules)!;
  const invitees = [7];
  const challenge = createSnowMazeChallenge(maze, 'sample-a', 1, invitees)!;
  invitees.push(8);

  assert.equal(challenge.start(8, 0, entry), false);
  assert.equal(challenge.start(7, 0, bell), false);
  assert.equal(challenge.start(7, 0, entry), true);
  assert.equal(challenge.start(7, 0, entry), false);
  assert.equal(challenge.move(7, 200, bell), false);
  assert.equal(challenge.move(7, 250, { east: 132, north: entry.north }), true);
  assert.equal(challenge.move(7, 500, { east: 132, north: bell.north }), true);
  assert.equal(challenge.move(7, 1000, bell), true);
  assert.equal(challenge.move(7, 1000 + CAPTURE_MS - 1, bell), true);
  assert.deepEqual(challenge.reportFor(1), { challengeId: 'sample-a', personalBestMs: undefined, guestResults: [] });
  assert.equal(challenge.move(7, 1000 + CAPTURE_MS, bell), true);
  assert.equal(challenge.move(7, 1000 + CAPTURE_MS + 1, bell), false);
  assert.equal(challenge.reportFor(7), undefined);
  assert.equal(challenge.reportFor(8), undefined);
  const report = challenge.reportFor(1)!;
  assert.deepEqual(report.guestResults, [{ runnerId: 7, elapsedMs: 6000 }]);
  report.guestResults[0].elapsedMs = 0;
  assert.equal(challenge.reportFor(1)!.guestResults[0].elapsedMs, 6000);
  t.diagnostic('fixture shortest successful bell hold in this run: 5,000 ms; author received one guest result of 6,000 ms; other views returned no report');
});

test('author times are kept out of guest ranking and separate challenges keep independent reports', t => {
  const maze = compileSnowMaze(blueprint, rules)!;
  assert.equal(createSnowMazeChallenge(maze, '', 1, [7]), undefined);
  assert.equal(createSnowMazeChallenge(maze, 'sample-a', 0, [7]), undefined);
  assert.equal(createSnowMazeChallenge(maze, 'sample-a', 1, [NaN]), undefined);
  const first = createSnowMazeChallenge(maze, 'sample-a', 1, [7, 8])!;
  const second = createSnowMazeChallenge(maze, 'sample-b', 1, [7])!;

  function run(challenge: NonNullable<ReturnType<typeof createSnowMazeChallenge>>, runnerId: number, at: number, bellAt: number) {
    assert.equal(challenge.start(runnerId, at, entry), true);
    assert.equal(challenge.move(runnerId, at + 250, { east: 132, north: entry.north }), true);
    assert.equal(challenge.move(runnerId, at + 500, { east: 132, north: bell.north }), true);
    assert.equal(challenge.move(runnerId, at + bellAt, bell), true);
    assert.equal(challenge.move(runnerId, at + bellAt + CAPTURE_MS, bell), true);
  }

  run(first, 1, 0, 750);
  run(first, 7, 100, 1500);
  run(first, 8, 250, 1250);
  run(first, 7, 7000, 1000);
  run(first, 7, 14_000, 2000);
  assert.deepEqual(first.reportFor(1), {
    challengeId: 'sample-a',
    personalBestMs: 5750,
    guestResults: [{ runnerId: 7, elapsedMs: 6000 }, { runnerId: 8, elapsedMs: 6250 }],
  });
  assert.deepEqual(second.reportFor(1), { challengeId: 'sample-b', personalBestMs: undefined, guestResults: [] });
  assert.equal(second.move(7, 15_000, bell), false);
  t.diagnostic('fixture author 5,750 ms kept separate; guests 6,000/6,250 ms sorted, slower retry discarded, second challenge had 0 results');
});
