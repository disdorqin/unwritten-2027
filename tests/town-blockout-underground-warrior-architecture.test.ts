import assert from 'node:assert/strict';
import test from 'node:test';
import { warriorDistrictHouses } from '../src/shared/underground-warrior-district.js';
import { warriorDistrictArchitecture } from '../tools/voxel-tavern/town-blockout/underground-warrior-architecture.js';

const { pieces, tally } = warriorDistrictArchitecture;
const byZone = (zone: typeof pieces[number]['zone']) =>
  pieces.filter(piece => piece.zone === zone);

test('YS4 mass modeling actually builds twelve complete houses, four furnished homes, seven bazaars and the missing ruin', () => {
  assert.equal(tally.homes, 12);
  assert.equal(tally.accessible, 4);
  assert.equal(tally.marketBays, 7);
  assert.equal(tally.ruination, 1);
  assert.equal(tally.wallMeters, 90);
  assert.ok(tally.architecturePieces > 6800,
    'round 1 must produce real buildings rather than a tiny API/test-only patch');
  assert.ok(tally.facadePieces >= 4700);
  assert.ok(tally.roomPieces >= 270);
  assert.ok(tally.marketPieces >= 1000);
  assert.ok(tally.ruinedHousePieces >= 70);
  assert.ok(tally.wallPieces >= 700);
  assert.equal(pieces.length,
    tally.facadePieces + tally.roomPieces + tally.marketPieces +
    tally.ruinedHousePieces + tally.wallPieces);
});

test('YS4 each stone house has continuous front/rear courses, roof tiles and a readable complete door', () => {
  for (const house of warriorDistrictHouses) {
    const props = byZone('home-facade').filter(piece => piece.name.startsWith(house.id + '/'));
    assert.ok(props.length >= 300, 'missing the majority of masonry on ' + house.id);
    assert.ok(props.some(piece => piece.name.includes('/door-head')));
    assert.ok(props.some(piece => piece.name.includes('/jamb--1')));
    assert.ok(props.some(piece => piece.name.includes('/jamb-1')));
    assert.ok(props.filter(piece => piece.name.includes('/roof-tile-')).length >= 24);
    assert.equal(props.filter(piece => piece.name.includes('/pitched-roof-course-')).length, 18,
      'the first screenshot showed an over-flat roof: stepped roof courses must now be visible');
    assert.equal(props.filter(piece => piece.name.includes('/stepped-roof-gable-')).length, 18);
    assert.ok(props.filter(piece => piece.name.includes('/rear-course-')).length >= 80);
    assert.ok(props.filter(piece => piece.name.includes('/front-course-')).length >= 60);
    assert.ok(props.every(piece => !piece.name.includes('sign') && !piece.name.includes('placeholder')));
    if (house.accessible) {
      const rooms = byZone('home-interior').filter(piece => piece.name.startsWith(house.id + '/'));
      assert.ok(rooms.length >= 65,
        'an accessible home needs real rooms/furnishings, not only a facade: ' + house.id);
    } else {
      assert.equal(byZone('home-interior').filter(piece => piece.name.startsWith(house.id + '/')).length, 0,
        'the source design permits only four open interiors, not phantom routes through sealed homes');
      assert.ok(props.filter(piece => piece.name.includes('/blocked-approach-rubble-')).length >= 14);
    }
  }
});

test('YS4 seven market bays have vault ribs, physical-looking ware clusters and no text boards', () => {
  const market = byZone('arcade-market');
  for (let bay = 0; bay < 7; bay++) {
    const prefix = 'u10/arcade-bay-' + bay + '/';
    const props = market.filter(piece => piece.name.startsWith(prefix));
    assert.ok(props.length >= 140, prefix);
    assert.equal(props.filter(piece => piece.name.includes('/coffer-')).length, 30);
    assert.equal(props.filter(piece => piece.name.includes('/wares-')).length, 29);
    assert.equal(props.filter(piece => piece.name.includes('/visible-vault-')).length, 16);
    assert.equal(props.filter(piece => piece.name.includes('/floor-course-')).length, 28);
    assert.equal(props.filter(piece => piece.name.includes('/counter-slats-')).length, 9);
    assert.ok(props.filter(piece => piece.solid).length <= 2,
      'market aisle should not be filled with invisible impassable furniture');
  }
  assert.ok(!market.some(piece => /sign|text|price|label|unapproved-story/.test(piece.name)));
});

test('YS4 collapsed end building is visible and forms a full courtyard boundary, not a flat marker', () => {
  const ruin = byZone('arcade-ruin');
  assert.ok(ruin.length >= 70);
  assert.ok(ruin.some(piece => piece.name.endsWith('/floor')));
  assert.ok(ruin.some(piece => piece.name.endsWith('/back')));
  assert.equal(ruin.filter(piece => piece.name.includes('/side-')).length, 22);
  assert.ok(ruin.filter(piece => piece.name.includes('/roof-')).length >= 8);
  assert.ok(ruin.filter(piece => piece.name.includes('/rubble-')).length >= 30);
  assert.ok(ruin.every(piece => piece.center[0] > 170 && piece.center[0] < 180),
    'ice-golem visual anchor must not invade the existing square or the existing forge');
  assert.ok(ruin.filter(piece => piece.solid).length >= 22,
    'the roof ruin cannot be an entirely ghost-shaped decoration');
});

test('YS5 supporting battlement courses follow the certified 90m range without fake invisible gates', () => {
  const wall = byZone('battlement');
  assert.ok(wall.length >= 700);
  assert.ok(wall.some(piece => piece.name.startsWith('citywall/abandoned-defense-')));
  assert.ok(wall.filter(piece => piece.name.startsWith('citywall/exterior-buttress-')).length >= 350);
  assert.ok(wall.every(piece => piece.center[0] >= 79 && piece.center[0] <= 170));
  assert.ok(wall.every(piece => !piece.solid),
    'extension ornaments may not create new unregistered walls on the 90m walk');
});

test('YS4/YS5 full architecture stays finite and batched into the eight approved stone palettes', () => {
  const names = new Set<string>();
  const families = new Set<string>();
  for (const piece of pieces) {
    assert.ok(!names.has(piece.name), 'duplicate instance ID: ' + piece.name);
    names.add(piece.name);
    families.add(piece.family);
    assert.ok([...piece.center, ...piece.size].every(Number.isFinite));
    assert.ok(piece.size.every(n => n > 0));
    assert.ok(piece.center[1] >= -.45 && piece.center[1] < 10);
    assert.ok(!piece.name.startsWith('story/'));
    assert.ok(!piece.name.includes('/fake-hitbox'));
  }
  assert.ok(families.size >= 6);
  assert.ok(families.size <= 8);
  assert.ok(tally.architecturePieces <= 7500, 'avoid exploding the mobile draw/tris budget');
  assert.ok(tally.architecturePieces * 12 <= 90000,
    'new cuboids must keep the high-density expansion inside 90k nominal triangles');
  assert.ok(tally.structuralSolids < 120, 'avoid registering thousands of tiny physics obstacles');
});
