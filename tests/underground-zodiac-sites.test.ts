import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUndergroundZodiacSites, undergroundZodiacSites } from '../src/shared/underground-zodiac-sites.js';

test('underground origins and reachable approaches use the four shared star-stone IDs', () => {
  const { origins, stands } = resolveUndergroundZodiacSites((scene, point) => ({
    layer: 'accepted/' + scene, east: 200 - point.north, north: 300 + point.east, height: point.height + 8,
  }));
  assert.deepEqual(Object.keys(origins), ['horse', 'monkey', 'rooster', 'dog']);
  assert.deepEqual(Object.keys(stands), Object.keys(origins));
  assert.deepEqual(Object.values(undergroundZodiacSites).map(site => site.number), [7, 8, 9, 10]);
  assert.deepEqual(origins.horse, { layer: 'accepted/mine-camp', east: 236.8, north: 302.9, height: -83 });
  for (const id of Object.keys(undergroundZodiacSites) as (keyof typeof undergroundZodiacSites)[]) {
    const origin = origins[id]!;
    const stand = stands[id]!;
    assert.equal(origin.layer, stand.layer);
    assert.ok(Math.hypot(stand.east - origin.east, stand.north - origin.north) < 1.2);
  }
});

test('an unsettled domain or partially resolved pair is not registered', () => {
  const { origins, stands } = resolveUndergroundZodiacSites((scene, point) => scene === 'palace' &&
    point === undergroundZodiacSites.dog.base ? { ...point, layer: scene } : undefined);
  assert.deepEqual(origins, {});
  assert.deepEqual(stands, {});
});

test('a cross-domain pair or invalid coordinates cannot become a pickup origin', () => {
  assert.throws(() => resolveUndergroundZodiacSites((scene, point) => ({
    ...point, layer: scene + ':' + point.east,
  })), /Invalid underground star-stone anchor: horse/);
  assert.throws(() => resolveUndergroundZodiacSites(() => ({
    east: NaN, north: 0, height: 0, layer: 'mine',
  })), /Invalid underground star-stone anchor: horse/);
});
