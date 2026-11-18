import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway';
import { createRailHorseCharm } from '../tools/voxel-tavern/town-blockout/town-zodiac-rail';
import { createZodiacProgress, sealedGoldenGoatClue, zodiacStorageKey } from '../tools/voxel-tavern/town-blockout/town-zodiac';

test('the first zodiac pickup is personal, persistent and not repeatable', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const one = createZodiacProgress(['mouse'], storage);
  const another = createZodiacProgress(['mouse']);
  assert.equal(one.rows().length, 12);
  assert.equal(one.rows()[0].clue, '夜半信堆沙沙响，小影蹲在邮袋旁。');
  assert.equal(one.rows()[1].clue, '尚未现身');
  assert.equal(one.rows()[7].clue, sealedGoldenGoatClue);
  assert.equal(one.collect('ox'), false);
  assert.equal(one.collect('mouse', new Date(2026, 10, 18)), true);
  assert.equal(one.collect('mouse'), false);
  assert.equal(another.count(), 0);
  assert.equal(createZodiacProgress(['mouse'], storage).rows()[0].date, '2026-11-18');
  assert.equal(data.has(zodiacStorageKey), true);
});

test('even an old save with the other eleven charms stays sealed while the palace is unavailable', () => {
  const ids = ['mouse', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'monkey', 'rooster', 'dog', 'pig'];
  const storage = { getItem: () => JSON.stringify({ collected: Object.fromEntries(ids.map(id => [id, '2026-11-18'])) }),
    setItem: () => { throw new Error('storage is read only'); } };
  const later = createZodiacProgress(['mouse'], storage);
  assert.equal(later.count(), 11);
  assert.equal(later.rows()[7].sealed, true);
  assert.equal(later.collect('goat'), false);
});

test('the Horse is attached to the moving coach and can be picked at a stop or underway', () => {
  for (const underway of [false, true]) {
    let now = Date.UTC(2026, 0, 1);
    const railway = createTownRailway(createTerrainGrid(), () => now);
    const zodiac = createZodiacProgress(['horse']);
    let celebrations = 0;
    const horse = createRailHorseCharm(railway, zodiac, () => celebrations++);
    const anchor = railway.coachCharmAnchor;
    const start = anchor.getWorldPosition(new Vector3());
    const camera = new PerspectiveCamera();
    const coach = anchor.parent!;
    const target = new Vector3();
    function lookUnderBench(side = -.5, row = 1.55) {
      camera.position.copy(coach.localToWorld(new Vector3(side, 2.46, row)));
      camera.lookAt(anchor.getWorldPosition(target));
    }

    lookUnderBench();
    assert.equal(horse.visibleTo(camera), false);
    horse.action.run();
    assert.equal(zodiac.count(), 0);
    assert.ok(railway.board(railway.stops[0].id));
    if (underway) {
      now += (railway.dwellSeconds + 8) * 1_000;
      railway.update(.1);
      assert.ok(anchor.getWorldPosition(new Vector3()).distanceTo(start) > 10);
    }
    assert.equal(railway.atPlatform, !underway);
    coach.updateWorldMatrix(true, true);
    for (const side of [-.5, .5]) for (let row = 0; row < 6; row++) {
      lookUnderBench(side, (row - 2.5) * .62);
      const ray = new Raycaster(camera.position, target.clone().sub(camera.position).normalize());
      assert.equal(ray.intersectObject(coach)[0]?.object, anchor.children[0], `seat ${side}/${row} has a clear view`);
      assert.equal(horse.visibleTo(camera), true);
    }
    camera.lookAt(camera.position.clone().add(new Vector3(0, 1, 0)));
    assert.equal(horse.visibleTo(camera), false);
    lookUnderBench();
    horse.action.run();
    assert.equal(zodiac.rows().find(row => row.id === 'horse')?.location, '环镇列车 · 车厢');
    assert.equal(horse.visibleTo(camera), false);
    horse.action.run();
    assert.equal(celebrations, 1);
    assert.equal(anchor.children[0].visible, false);
  }
});
