import assert from 'node:assert/strict';
import test from 'node:test';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { townD2CloudTerraceContract } from '../tools/voxel-tavern/town-blockout/town-d2-cloud-terrace-transform';
import {
  classifyTownD2R30WorldPoint, decodeTownD2R30Point, encodeTownD2R30Point,
  TOWN_D2_R30_DOMAIN_FRAME, TOWN_D2_R30_DOMAIN_ID, TOWN_D2_R30_DOMAIN_VERSION,
  townD2R30ToLocal, townD2R30ToWorld,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain-codec';
import {
  sampleTownD2R30Height, townD2R30Anchors, townD2R30Spec, type TownD2R30Point,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

const seam = townD2CloudTerraceContract.seamNorthLocal;

test('D2-R30 codec fixes its identity and round-trips all four corners and canonical anchors within tolerance', () => {
  assert.equal(TOWN_D2_R30_DOMAIN_ID, 'town-d2-r30-main-summit');
  assert.equal(TOWN_D2_R30_DOMAIN_FRAME, 'd2-r30-summit-local-east-north-height');
  assert.equal(TOWN_D2_R30_DOMAIN_VERSION, 1);
  assert.equal(seam, -12.75);
  const { west, east, south, north } = mainSummitBounds;
  const corners: TownD2R30Point[] = [];
  for (const pointEast of [west, east]) {
    for (const pointNorth of [south, north]) {
      for (const height of [townD2R30Spec.floorHeight, townD2R30Spec.summitHeight]) {
        corners.push({ east: pointEast, north: pointNorth, height });
      }
    }
  }
  const anchors: TownD2R30Point[] = [
    { east: townD2R30Anchors.gate.east, north: townD2R30Anchors.gate.north, height: townD2R30Anchors.gate.height },
    { east: townD2R30Anchors.summit.east, north: townD2R30Anchors.summit.north, height: townD2R30Anchors.summit.height },
    ...townD2R30Anchors.shoulders.map(shoulder => ({
      east: shoulder.east, north: shoulder.north, height: shoulder.height,
    })),
    { ...townD2R30Anchors.southPass, height: sampleTownD2R30Height(40, 690)! },
  ];
  for (const local of [...corners, ...anchors]) {
    const encoded = encodeTownD2R30Point(local);
    assert.equal(encoded.domainId, TOWN_D2_R30_DOMAIN_ID);
    assert.equal(encoded.frame, TOWN_D2_R30_DOMAIN_FRAME);
    assert.equal(encoded.version, TOWN_D2_R30_DOMAIN_VERSION);
    assert.equal(encoded.seamNorthLocal, seam);
    assert.deepEqual(encoded.local, local);
    assert.deepEqual(encoded.world, townD2R30ToWorld(local));
    assert.deepEqual(townD2R30ToLocal(encoded.world), local);
    assert.deepEqual(decodeTownD2R30Point(encoded), local);
    assert.deepEqual(decodeTownD2R30Point(JSON.parse(JSON.stringify(encoded))), local);
    assert.ok(Object.isFrozen(encoded) && Object.isFrozen(encoded.local) && Object.isFrozen(encoded.world));
  }
});

test('D2-R30 codec rejects non-finite, out-of-bounds and non-reversible local input', () => {
  const valid = { east: 0, north: 0, height: 347 };
  for (const key of ['east', 'north', 'height'] as const) {
    for (const value of [NaN, Infinity, -Infinity]) {
      assert.throws(() => encodeTownD2R30Point({ ...valid, [key]: value }), RangeError);
    }
  }
  for (const local of [
    { ...valid, east: mainSummitBounds.west - .01 },
    { ...valid, east: mainSummitBounds.east + .01 },
    { ...valid, north: mainSummitBounds.south - .01 },
    { ...valid, north: mainSummitBounds.north + .01 },
    { ...valid, height: 129.999 },
    { ...valid, height: -1 },
    { ...valid, height: 800.001 },
  ]) assert.throws(() => encodeTownD2R30Point(local), RangeError);
  assert.throws(() => encodeTownD2R30Point(null as unknown as TownD2R30Point), /finite/);
  assert.deepEqual(decodeTownD2R30Point(encodeTownD2R30Point({ east: .1, north: .2, height: 347 })),
    { east: .1, north: .2, height: 347 });
  assert.throws(() => townD2R30ToWorld({ ...valid, east: NaN }), RangeError);
  assert.throws(() => townD2R30ToLocal({ ...valid, north: Infinity }), RangeError);
});

test('D2-R30 decoder fails closed on wrong identity, frame, version, seam and non-finite fields', () => {
  const valid = encodeTownD2R30Point({ east: 0, north: 0, height: 347 });
  for (const changes of [
    { domainId: 'front-ridge' },
    { frame: 'front-ridge-local' },
    { version: 2 },
    { seamNorthLocal: -10 },
    { seamNorthLocal: NaN },
  ]) assert.throws(() => decodeTownD2R30Point({ ...valid, ...changes }), RangeError);
  for (const group of ['local', 'world'] as const) {
    for (const key of ['east', 'north', 'height'] as const) {
      assert.throws(() => decodeTownD2R30Point({
        ...valid, [group]: { ...valid[group], [key]: NaN },
      }), /finite/);
      assert.throws(() => decodeTownD2R30Point({
        ...valid, [group]: { ...valid[group], [key]: Infinity },
      }), /finite/);
    }
  }
  for (const value of [null, undefined, [], {}, { ...valid, local: null }, { ...valid, world: null }]) {
    assert.throws(() => decodeTownD2R30Point(value), RangeError);
  }
});

test('D2-R30 decoder rejects inconsistent transforms and invalid local bounds or heights', () => {
  const valid = encodeTownD2R30Point({ east: 0, north: 0, height: 347 });
  for (const key of ['east', 'north', 'height'] as const) {
    assert.throws(() => decodeTownD2R30Point({
      ...valid, world: { ...valid.world, [key]: valid.world[key] + 1 },
    }), /round-trip/);
  }
  for (const local of [
    { ...valid.local, east: mainSummitBounds.west - .01 },
    { ...valid.local, east: mainSummitBounds.east + .01 },
    { ...valid.local, north: mainSummitBounds.south - .01 },
    { ...valid.local, north: mainSummitBounds.north + .01 },
    { ...valid.local, height: -1 },
    { ...valid.local, height: 801 },
  ]) {
    assert.throws(() => decodeTownD2R30Point({ ...valid, local, world: townD2R30ToWorld(local) }), RangeError);
  }
  const shifted = { ...valid.local, east: valid.local.east + .01 };
  assert.throws(() => decodeTownD2R30Point({ ...valid, local: shifted }), /round-trip within tolerance/);
});

test('D2-R30 world classification uses the canonical seam tolerance and fails closed outside both footprints', () => {
  const at = (north: number, height = 347) => townD2R30ToWorld({ east: 0, north, height });
  assert.equal(classifyTownD2R30WorldPoint(at(seam - 2e-9)), 'front-ridge');
  assert.equal(classifyTownD2R30WorldPoint(at(seam - 1e-9)), 'seam');
  assert.equal(classifyTownD2R30WorldPoint(at(seam)), 'seam');
  assert.equal(classifyTownD2R30WorldPoint(at(seam + 1e-9)), 'seam');
  assert.equal(classifyTownD2R30WorldPoint(at(seam + 2e-9)), 'summit');
  assert.equal(classifyTownD2R30WorldPoint(townD2R30ToWorld(townD2R30Anchors.gate)), 'summit');
  assert.equal(classifyTownD2R30WorldPoint(townD2R30ToWorld(townD2R30Anchors.summit)), 'summit');
  assert.equal(classifyTownD2R30WorldPoint(townD2R30ToWorld({
    ...townD2CloudTerraceContract.cableTerminalLocal, height: 347,
  })), 'front-ridge');
  for (const world of [
    { east: NaN, north: 663.25, height: 347 },
    { east: 300, north: Infinity, height: 347 },
    { east: 300, north: 663.25, height: 129.999 },
    { east: 300, north: 663.25, height: -1 },
    { east: 300, north: 663.25, height: 800.001 },
    { east: -800.001, north: 900, height: 347 },
    { east: 1_400.001, north: 900, height: 347 },
    { east: 300, north: 2_466.001, height: 347 },
    { east: 300, north: 539.999, height: 347 },
  ]) assert.equal(classifyTownD2R30WorldPoint(world), 'outside');
  assert.equal(classifyTownD2R30WorldPoint(null as unknown as TownD2R30Point), 'outside');
});
