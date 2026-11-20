import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flightFuelCanFullPowerMs } from '../tools/voxel-tavern/town-blockout/flight-fuel-display.ts';
import {
  createUndergroundOreDistribution, crystalCaveOreCandidateReferences, stardustFullPowerMs,
  type UndergroundOreAnchor, type UndergroundOreFallTraceBand, type UndergroundOrePoint,
} from '../tools/voxel-tavern/town-blockout/underground-ore-distribution.ts';

const waterline: UndergroundOreAnchor = {
  id: 'fixture-waterline', depth: -90, region: 'pre-gate-waterline', evidence: 'test-survey',
  contains: ([east, north, height]) => east >= 100 && east <= 105 && north >= 200 && north <= 212 &&
    height >= -94 && height <= -89,
};
const fallTrace: UndergroundOreFallTraceBand = {
  id: 'fixture-fall-trace', anchorId: waterline.id, evidence: 'test-track',
  centreline: [[102, 201, -90], [102, 205, -90.5], [102, 210, -91]], radius: .6,
};
const stardust: UndergroundOrePoint = {
  id: 'fixture-first-stardust', anchorId: waterline.id, depth: -90,
  position: [102.3, 207, -90.7], amount: 2, mineral: 'stardust', fallTraceBandId: fallTrace.id, firstFind: true,
};

test('the four absolute layers expose missing production points without promoting surveyed cave references', () => {
  const distribution = createUndergroundOreDistribution();
  assert.deepEqual(distribution.layers.map(layer => layer.depth), [-90, -140, -165, -190]);
  for (const layer of distribution.layers) {
    assert.equal(layer.missingWorldAnchors, true);
    assert.equal(layer.missingOrePoints, true);
    assert.equal(layer.missingFallTrace, true);
    assert.deepEqual(layer.markers, []);
  }
  assert.equal(crystalCaveOreCandidateReferences.depth, -140);
  assert.match(crystalCaveOreCandidateReferences.source, /^25ff934/);
  assert.deepEqual(crystalCaveOreCandidateReferences.sites.map(site => site.localEN),
    [[-11.6, 21.8], [11.65, 42.6], [22, 30.55], [25.1, 33.54]]);
  for (const site of crystalCaveOreCandidateReferences.sites) {
    assert.equal(distribution.availablePoint(site.id, new Set()), undefined);
  }
});

test('a registered marker uses the confirmed anchor and finite trace, independently of host depletion', () => {
  const mutablePosition: [number, number, number] = [...stardust.position];
  const distribution = createUndergroundOreDistribution({ anchors: [waterline], fallTraceBands: [fallTrace],
    points: [{ ...stardust, position: mutablePosition }] });
  const firstLayer = distribution.layers[0];
  assert.deepEqual(firstLayer.anchorIds, [waterline.id]);
  assert.deepEqual(firstLayer.fallTraceBandIds, [fallTrace.id]);
  assert.equal(firstLayer.missingOrePoints, false);
  assert.equal(firstLayer.missingFallTrace, false);
  mutablePosition[0] = 0;
  const available = distribution.availablePoint(stardust.id, new Set());
  assert.equal(available, firstLayer.markers[0]);
  assert.equal(available?.anchorEvidence, waterline.evidence);
  assert.deepEqual(available?.position, stardust.position);
  assert.equal(distribution.availablePoint(stardust.id, new Set([stardust.id])), undefined);
});

test('stardust rejects unsupported coordinates, unconfirmed or wrong-zone bands and off-track positions', () => {
  function validate(point: UndergroundOrePoint, anchor = waterline, band = fallTrace) {
    return () => createUndergroundOreDistribution({ anchors: [anchor], fallTraceBands: [band], points: [point] });
  }
  assert.throws(() => createUndergroundOreDistribution({ points: [stardust] }), /outside its confirmed underground anchor/);
  assert.throws(validate({ ...stardust, depth: -140 }), /outside its confirmed underground anchor/);
  assert.throws(validate({ ...stardust, position: [102, 207, .25] }), /outside its confirmed underground anchor/);
  assert.throws(validate({ ...stardust, position: [NaN, 207, -90.7] }), /outside its confirmed underground anchor/);
  assert.throws(validate(stardust, { ...waterline, region: 'camp' }), /inside its confirmed fall trace band/);
  assert.throws(validate(stardust, waterline, { ...fallTrace, evidence: '' }), /Invalid confirmed fall trace/);
  assert.throws(validate(stardust, waterline, { ...fallTrace, centreline: [[102, 210, -91], [102, 210, -91]] }),
    /Invalid confirmed fall trace/);
  assert.throws(validate({ ...stardust, fallTraceBandId: 'unregistered' }), /inside its confirmed fall trace band/);
  for (const position of [[104, 207, -90.7], [102, 207, -93], [102, 211, -91]] as const) {
    assert.throws(validate({ ...stardust, position }), /inside its confirmed fall trace band/);
  }
  assert.throws(validate({ ...stardust, amount: 3 }), /First stardust/);
});

test('stable IDs and locations are unique and only one 1–2-piece first find can be registered', () => {
  const validate = (otherPoint: UndergroundOrePoint) => () => createUndergroundOreDistribution({
    anchors: [waterline], fallTraceBands: [fallTrace], points: [stardust, otherPoint],
  });
  const second = { ...stardust, id: 'fixture-repeat', position: [102, 208, -90.8], firstFind: false } as const;
  assert.throws(validate({ ...second, id: stardust.id }), /duplicate ore ID/);
  assert.throws(validate({ ...second, position: stardust.position }), /share the same position/);
  assert.throws(validate({ ...second, firstFind: true }), /First stardust/);
  assert.doesNotThrow(validate(second));
});

test('crystal types stay in their respective cave bands and rich deposits avoid the main route', () => {
  const node = { id: 'fixture-rich', anchorId: 'fixture-hall', depth: -140,
    position: [110, 211, -141.2], amount: 1, mineral: 'blue-crystal', grade: 'deposit' } as const;
  const anchor: UndergroundOreAnchor = { id: node.anchorId, depth: -140, region: 'crystal-hall',
    evidence: 'test-hall-survey', contains: ([, , height]) => height >= -143 && height <= -140,
    distanceFromMainRoute: () => 10.43 };
  assert.equal(createUndergroundOreDistribution({ anchors: [anchor], points: [node] }).layers[1].markers.length, 1);
  assert.throws(() => createUndergroundOreDistribution({ anchors: [anchor], points: [{ ...node, mineral: 'moonstone' }] }),
    /outside its crystal cave region/);
  assert.throws(() => createUndergroundOreDistribution({ anchors: [{ ...anchor, region: 'dark-passage' }], points: [node] }),
    /dark passage has no mining points/);
  const shallow = { ...anchor, distanceFromMainRoute: () => 10 };
  assert.throws(() => createUndergroundOreDistribution({ anchors: [shallow], points: [node] }), /more than 10 m/);
  assert.doesNotThrow(() => createUndergroundOreDistribution({ anchors: [shallow], points: [{ ...node, grade: 'scatter' }] }));
});

test('C-14 fuel conversion shares the fixed full-power can and rejects invalid ore counts', () => {
  assert.equal(stardustFullPowerMs(0), 0);
  assert.equal(stardustFullPowerMs(1), flightFuelCanFullPowerMs);
  assert.equal(stardustFullPowerMs(1) / 1000, 600);
  assert.equal(stardustFullPowerMs(2), 1_200_000);
  for (const invalid of [-1, .1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => stardustFullPowerMs(invalid), /non-negative whole ore count in range/);
  }
});
