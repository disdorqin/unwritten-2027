import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZodiacStarStoneAuthority } from '../src/presence/zodiac-star-stone-authority.js';
import { resolveAlpineStarStoneSite, type AlpineStarStoneId, type AlpineStarStoneMount } from '../src/shared/zodiac-alpine-star-sites.js';

const sampleMount: AlpineStarStoneMount = {
  mode: 'production',
  origin: { east: 8, north: 9, height: 40 },
  approach: { east: 8, north: 8, height: 40 },
  toWorld: ({ east, north, height }) => ({ layer: 'fixture-host', east: 300 - north, north: 670 + east, height }),
  supports: ({ north, height }) => north === 678 && height === 40,
  canPickUpFrom: (from, to) => Math.hypot(from.east - to.east, from.north - to.north) <= 1,
};

test('each alpine stone asks for its own scene entity and uses the host transform and layer', () => {
  const cases = [
    ['rabbit', 'r2-halfway-lookout'],
    ['dragon', 'starport-flight-site'],
    ['pig', 'main-summit-hut-and-registration'],
  ] as const;
  for (const [id, entity] of cases) {
    const site = resolveAlpineStarStoneSite(id, name => {
      assert.equal(name, entity);
      return sampleMount;
    });
    assert.deepEqual(site, {
      origin: { layer: 'fixture-host', east: 291, north: 678, height: 40 },
      approach: { layer: 'fixture-host', east: 292, north: 678, height: 40 },
    });
  }
});

test('preview, skyline, absent entities, and unusable landings never supply a location', () => {
  const never = () => assert.fail('inactive entities must not be transformed');
  for (const mode of ['preview', 'skyline'] as const) {
    assert.equal(resolveAlpineStarStoneSite('pig', () => ({ ...sampleMount, mode, toWorld: never })), undefined);
  }
  assert.equal(resolveAlpineStarStoneSite('rabbit', () => undefined), undefined);
  for (const invalid of [
    { supports: () => false },
    { canPickUpFrom: () => false },
    { toWorld: (p: AlpineStarStoneMount['origin']) => ({ ...p, layer: p.north === 9 ? 'one' : 'two' }) },
    { toWorld: (p: AlpineStarStoneMount['origin']) => ({ ...p, height: Infinity, layer: 'fixture-host' }) },
  ]) {
    assert.equal(resolveAlpineStarStoneSite('dragon', () => ({ ...sampleMount, ...invalid })), undefined);
  }
});

test('the town authority publishes and serves only the registered site in its exact layer', () => {
  const resolve = (id: AlpineStarStoneId) => resolveAlpineStarStoneSite(id, name =>
    name === 'starport-flight-site' ? sampleMount : undefined);
  const site = resolve('dragon')!;
  let localPlayer = { ...site.approach, layer: 'ground-town' };
  const authority = createZodiacStarStoneAuthority({
    nowMs: () => 0,
    origin: id => id === 'dragon' ? site.origin : undefined,
    playerPosition: () => localPlayer,
    canPickup: (_id, from, at) => sampleMount.canPickUpFrom(from, at),
    canDeposit: () => true,
    xiaoweiScene: () => ({ atRingPassage: false, atNewYearsEveWitness: false, bellHandoffConfirmed: false }),
  }, { load: () => undefined, save: () => undefined });
  assert.deepEqual(authority.snapshot('ground-town').stones, []);
  assert.equal(authority.snapshot(site.origin.layer).stones[0]?.origin?.north, 678);
  assert.equal(authority.pickup(1, 'dragon', 0), false);
  localPlayer = site.approach;
  assert.equal(authority.pickup(1, 'dragon', 0), true);
  assert.equal(authority.pickup(2, 'dragon', 0), false);
});
