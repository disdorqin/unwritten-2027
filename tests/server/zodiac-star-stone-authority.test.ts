import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createZodiacStarStoneAuthority, type ZodiacStarStoneHost,
} from '../../src/presence/zodiac-star-stone-authority.js';
import { createZodiacStarStoneFileStore } from '../../src/presence/zodiac-star-stone-store.js';
import { zodiacStarStoneIds, type ScatteredStarStoneId, type StarStoneLocation,
  type ZodiacStarStoneSave, type ZodiacStarStoneStore } from '../../src/shared/zodiac-star-stones.js';

// Synthetic layers and positions. Official placements are injected separately by the host.
const point = (layer: string, east: number, height = 0) => ({ layer, east, north: 0, height });
const mouse = point('town', 1);
const ring = point('town', 100);
const caveDrop = point('cave', 1, -30);
const first = 1;
const second = 2;
const scattered = zodiacStarStoneIds.filter(id => id !== 'goat');
const same = (a: StarStoneLocation, b: StarStoneLocation) =>
  a.layer === b.layer && a.east === b.east && a.north === b.north && a.height === b.height;

function fixture(store?: ZodiacStarStoneStore, allInstalled = false) {
  let saved: ZodiacStarStoneSave | undefined;
  let time = 10_000;
  let failSave = false;
  let saveCount = 0;
  const positions = new Map<number, StarStoneLocation>();
  const origins = new Map<ScatteredStarStoneId, StarStoneLocation>([['mouse', mouse]]);
  if (allInstalled) scattered.forEach((id, i) => origins.set(id, point('town', i + 1)));
  const scene = { atRingPassage: false, atNewYearsEveWitness: false, bellHandoffConfirmed: false };
  const host: ZodiacStarStoneHost = {
    nowMs: () => time,
    origin: id => origins.get(id),
    playerPosition: player => positions.get(player),
    canPickup: (_player, from, at) => same(from, at),
    canDeposit: (_player, from) => same(from, ring),
    xiaoweiScene: () => scene,
  };
  const storage = store ?? {
    load: () => saved,
    save(next: ZodiacStarStoneSave) {
      if (failSave) throw new Error('save failed');
      saved = JSON.parse(JSON.stringify(next)) as ZodiacStarStoneSave;
      saveCount++;
      return undefined;
    },
  };
  const start = () => createZodiacStarStoneAuthority(host, storage);
  return {
    start, authority: start(), positions, origins, scene, saveCount: () => saveCount,
    failSave(value: boolean) { failSave = value; },
    now(value: number) { time = value; },
  };
}

function seatFirstEleven(f: ReturnType<typeof fixture>) {
  scattered.forEach((id, i) => {
    f.positions.set(first, f.origins.get(id)!);
    assert.equal(f.authority.pickup(first, id, 0), true);
    f.positions.set(first, ring);
    assert.deepEqual(f.authority.deposit(first, id, 1), { ringCount: i + 1, completedNow: false });
    assert.equal(f.authority.snapshot().firstKeyLit, false);
  });
}

test('only installed seat surfaces become visible and one concurrent pickup wins', async () => {
  const f = fixture();
  f.positions.set(first, mouse);
  f.positions.set(second, mouse);
  assert.deepEqual(f.authority.snapshot('town').stones, [{
    id: 'mouse', revision: 0, phase: 'origin', origin: { area: 'town', east: 1, north: 0, height: 0 },
  }]);
  assert.deepEqual(f.authority.snapshot().stones, []);
  assert.equal(f.authority.pickup(first, 'ox', 0), false);
  assert.equal(f.authority.pickup(first, 'goat', 0), false);
  const results = await Promise.all([first, second].map(player =>
    Promise.resolve().then(() => f.authority.pickup(player, 'mouse', 0))));
  assert.deepEqual(results, [true, false]);
  assert.deepEqual(f.authority.carriedBy(first), [{ id: 'mouse', revision: 1 }]);
  assert.deepEqual(f.authority.carriedBy(second), []);
  assert.deepEqual(f.authority.snapshot('town').stones, [{
    id: 'mouse', revision: 1, phase: 'held', origin: { area: 'town', east: 1, north: 0, height: 0 },
  }]);
});

test('server resolves live position and area and requires current carrier and revision at the ring', () => {
  const f = fixture();
  assert.equal(f.authority.pickup(first, 'mouse', 0), false);
  f.positions.set(first, { ...mouse, layer: 'cave' });
  assert.equal(f.authority.pickup(first, 'mouse', 0), false);
  f.positions.set(first, mouse);
  assert.equal(f.authority.pickup(first, 'mouse', 1), false);
  assert.equal(f.authority.pickup(first, 'mouse', 0), true);
  assert.equal(f.authority.deposit(first, 'mouse', 1), undefined);
  f.positions.set(first, ring);
  f.positions.set(second, ring);
  assert.equal(f.authority.deposit(second, 'mouse', 1), undefined);
  assert.equal(f.authority.deposit(first, 'mouse', 0), undefined);
  assert.deepEqual(f.authority.deposit(first, 'mouse', 1), { ringCount: 1, completedNow: false });
  assert.deepEqual(f.authority.releaseCarrier(first), []);
  assert.equal(f.authority.deposit(first, 'mouse', 1), undefined);
  assert.deepEqual(f.start().snapshot('cave').stones, [{ id: 'mouse', revision: 2, phase: 'ring' }]);
});

test('disconnect uses the last verified point, releases only once, and redacts remote drops', () => {
  const f = fixture();
  f.positions.set(first, mouse);
  f.authority.pickup(first, 'mouse', 0);
  f.positions.set(first, caveDrop);
  f.authority.trackCarrier(first);
  f.positions.delete(first);
  assert.deepEqual(f.authority.releaseCarrier(first), ['mouse']);
  assert.deepEqual(f.authority.releaseCarrier(first), []);
  assert.equal(f.authority.snapshot('town').stones[0]?.dropPosition, undefined);
  assert.deepEqual(f.authority.snapshot('cave').stones, [{
    id: 'mouse', revision: 2, phase: 'dropped',
    dropPosition: { area: 'cave', east: 1, north: 0, height: -30 }, pickupLockedUntilMs: 13_000,
  }]);
  f.positions.set(first, caveDrop);
  f.positions.set(second, caveDrop);
  f.now(12_999);
  assert.equal(f.authority.pickup(first, 'mouse', 2), false);
  assert.equal(f.authority.pickup(second, 'mouse', 2), false);
  f.now(13_000);
  assert.equal(f.authority.pickup(second, 'mouse', 2), true);
});

test('underground death uses the pre-respawn point and restores the origin at the ten-minute boundary', () => {
  const f = fixture();
  f.positions.set(first, mouse);
  f.authority.pickup(first, 'mouse', 0);
  f.positions.set(first, ring);
  assert.deepEqual(f.authority.releaseCarrier(first, caveDrop), ['mouse']);
  f.now(609_999);
  assert.equal(f.authority.snapshot('cave').stones[0]?.phase, 'dropped');
  f.now(610_000);
  f.positions.set(second, caveDrop);
  assert.equal(f.authority.pickup(second, 'mouse', 2), false);
  assert.deepEqual(f.authority.snapshot('cave').stones, []);
  f.positions.set(second, mouse);
  assert.equal(f.authority.pickup(second, 'mouse', 3), true);
});

test('restart releases old connection holds and preserves an already dropped deadline', () => {
  const f = fixture(undefined, true);
  f.positions.set(first, mouse);
  f.authority.pickup(first, 'mouse', 0);
  f.authority.releaseCarrier(first, caveDrop);
  f.positions.set(first, f.origins.get('ox')!);
  f.authority.pickup(first, 'ox', 0);
  f.positions.set(first, caveDrop);
  f.authority.trackCarrier(first);
  f.now(11_000);
  f.authority.tick();
  f.positions.clear();
  f.now(20_000);
  const revived = f.start();
  assert.deepEqual(revived.carriedBy(first), []);
  assert.deepEqual(revived.snapshot('cave').stones.map(stone => [stone.id, stone.pickupLockedUntilMs]), [
    ['mouse', 13_000], ['ox', 23_000],
  ]);
  f.now(610_000);
  assert.deepEqual(revived.snapshot('cave').stones.map(stone => stone.id), ['ox']);
  f.now(619_999);
  assert.deepEqual(f.start().snapshot('cave').stones.map(stone => stone.id), ['ox']);
  f.now(620_000);
  assert.deepEqual(f.start().snapshot('cave').stones, []);
});

test('many accepted positions use one town checkpoint, disconnect immediately uses its unflushed position', () => {
  const f = fixture(undefined, true);
  f.positions.set(first, mouse);
  f.positions.set(second, f.origins.get('ox')!);
  f.authority.pickup(first, 'mouse', 0);
  f.authority.pickup(second, 'ox', 0);
  const afterPickups = f.saveCount();
  for (let elapsed = 100; elapsed < 1_000; elapsed += 100) {
    f.now(10_000 + elapsed);
    f.positions.set(first, point('cave', elapsed, -30));
    f.positions.set(second, point('town', elapsed));
    f.authority.trackCarrier(first);
    f.authority.trackCarrier(second);
    f.authority.tick();
  }
  assert.equal(f.saveCount(), afterPickups);
  f.now(11_000);
  f.authority.tick();
  assert.equal(f.saveCount(), afterPickups + 1);
  f.now(11_001);
  f.positions.set(first, point('cave', 999, -31));
  f.authority.trackCarrier(first);
  f.positions.delete(first);
  f.authority.tick();
  assert.equal(f.saveCount(), afterPickups + 1);
  assert.deepEqual(f.authority.releaseCarrier(first), ['mouse']);
  assert.equal(f.saveCount(), afterPickups + 2);
  assert.deepEqual(f.authority.snapshot('cave').stones[0]?.dropPosition,
    { area: 'cave', east: 999, north: 0, height: -31 });
});

test('a stopped placement does not expose or enable a saved drop after restart', () => {
  const f = fixture();
  f.positions.set(first, mouse);
  f.authority.pickup(first, 'mouse', 0);
  f.authority.releaseCarrier(first, caveDrop);
  f.origins.delete('mouse');
  f.now(13_000);
  const restarted = f.start();
  f.positions.set(second, caveDrop);
  assert.deepEqual(restarted.snapshot('cave').stones, []);
  assert.equal(restarted.pickup(second, 'mouse', 2), false);
});

test('a failed file save never issues the reveal or finale edge, and a valid restart reads the key', async context => {
  const folder = mkdtempSync(join(tmpdir(), 'zodiac-stars-'));
  context.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, 'town.json');
  const real = createZodiacStarStoneFileStore(path);
  let failSave = false;
  const f = fixture({
    load: real.load,
    save(state) { if (failSave) throw new Error('fixture write failure'); return real.save(state); },
  }, true);
  f.scene.atRingPassage = true;
  assert.equal(f.authority.recordXiaoweiResonance(), false);
  seatFirstEleven(f);
  assert.equal(f.authority.inlayGoatAtFinale(), undefined);
  failSave = true;
  assert.throws(() => f.authority.recordXiaoweiResonance(), /fixture write failure/);
  assert.equal(f.authority.snapshot().goatRevealed, false);
  failSave = false;
  assert.equal(f.authority.recordXiaoweiResonance(), true);
  assert.equal(f.start().recordXiaoweiResonance(), false);
  assert.equal(f.authority.snapshot().stones.some(stone => stone.id === 'goat'), false);
  f.scene.atNewYearsEveWitness = true;
  assert.equal(f.authority.inlayGoatAtFinale(), undefined);
  f.scene.bellHandoffConfirmed = true;
  failSave = true;
  assert.throws(() => f.authority.inlayGoatAtFinale(), /fixture write failure/);
  assert.equal(f.authority.snapshot().firstKeyLit, false);
  failSave = false;
  const results = await Promise.all([first, second].map(() => Promise.resolve().then(() => f.authority.inlayGoatAtFinale())));
  assert.deepEqual(results, [{ ringCount: 12, completedNow: true }, undefined]);
  assert.equal(f.start().snapshot().firstKeyLit, true);
  assert.equal(f.start().inlayGoatAtFinale(), undefined);
  assert.deepEqual(readdirSync(folder), ['town.json']);
  writeFileSync(path, '{');
  assert.throws(() => f.start(), SyntaxError);
});
