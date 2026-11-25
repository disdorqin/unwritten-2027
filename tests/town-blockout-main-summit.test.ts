import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Frustum, Group, Matrix4, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import {
  createMainSummitBlock, mainSummitBounds, mainSummitSpec, mainSummitLayout,
} from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import { northRidgeSummit, sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain.ts';

const fixture = mainSummitLayout;
const spacing = 100;

test('the summit and both shoulders have their own terrain inside the independent extent', t => {
  const candidate = createMainSummitBlock(fixture, northRidgeSummit.height, spacing);
  try {
    const { west, east, south, north } = mainSummitBounds;
    const box = candidate.coarse.geometry.boundingBox!;
    assert.equal(box.max.x - box.min.x, 2200);
    assert.equal(box.max.z - box.min.z, 1800);
    assert.equal(box.min.y, 150);
    assert.equal(box.max.y, 800);
    assert.equal(candidate.heightAt(west - .1, 0), undefined);
    assert.equal(candidate.heightAt(east + .1, 0), undefined);
    assert.equal(candidate.heightAt(0, south - .1), undefined);
    assert.equal(candidate.heightAt(0, north + .1), undefined);
    assert.equal(candidate.heightAt(NaN, 0), undefined);
    const { east: x, north: n } = fixture.summit;
    const [width, depth] = mainSummitSpec.summitPlateau;
    let terraceSamples = 0;
    for (let e = x - width / 2; e <= x + width / 2; e++) {
      for (let no = n - depth / 2; no <= n + depth / 2; no++) {
        assert.equal(candidate.heightAt(e, no), 800);
        terraceSamples++;
      }
    }
    for (const shoulder of fixture.shoulders) {
      assert.equal(candidate.heightAt(shoulder.east, shoulder.north), shoulder.height);
      const ridgeEast = (x + shoulder.east) / 2, ridgeNorth = (n + shoulder.north) / 2;
      assert.equal(candidate.heightAt(ridgeEast, ridgeNorth), (800 + shoulder.height) / 2);
    }
    const position = candidate.coarse.geometry.getAttribute('position');
    t.diagnostic(JSON.stringify({ terrain: [2200, 1800], y: [box.min.y, box.max.y], plateauSamples: terraceSamples,
      vertices: position.count, triangles: candidate.coarse.geometry.index!.count / 3 }));
  } finally {
    candidate.dispose();
  }
});

test('the local gate is open for ten metres and meets the cloud terrace without a floor step', t => {
  const candidate = createMainSummitBlock(fixture, northRidgeSummit.height, spacing);
  const stage = new Group();
  try {
    const { colliders } = candidate.enter(stage);
    assert.equal(colliders.length, 3);
    assert.ok(colliders.every(({ min, max }) => min[2] === 0 && max[2] === mainSummitSpec.gateLength));
    let floorPoints = 0;
    for (let e = -30; e <= 30; e++) for (let n = -10; n <= 40; n++) {
      assert.equal(candidate.heightAt(e, n), northRidgeSummit.height);
      floorPoints++;
    }
    let walkProbes = 0;
    for (let n = -10; n <= 40; n += .25) {
      const floor = candidate.heightAt(0, n)!;
      assert.ok(!colliders.some(({ min, max }) => floor + 1.8 > min[1] && floor < max[1] &&
        Math.hypot(Math.max(min[0], -max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .27));
      walkProbes++;
    }
    t.diagnostic(JSON.stringify({ gateLength: 10, plaza: [60, 40], floor: northRidgeSummit.height,
      seamStep: candidate.heightAt(0, -10)! - northRidgeSummit.height, floorPoints, capsuleProbes: walkProbes }));
  } finally {
    candidate.dispose();
  }
});

test('front ridge survey distinguishes a level deck from a crest that cuts through the gate width', t => {
  const candidate = createMainSummitBlock(fixture, 347, spacing);
  try {
    const bodyRadius = .27;
    const halfGate = fixture.gate.clearWidth / 2;
    const lateralOffsets = [-halfGate - bodyRadius, -halfGate, 0, halfGate, halfGate + bodyRadius];
    for (const e of lateralOffsets) {
      for (const n of [654, 660, 666]) {
        assert.equal(sampleNorthRidge350(300 + e, n), candidate.heightAt(e, -10));
      }
      assert.equal(candidate.heightAt(e, 0), 347);
      assert.equal(candidate.heightAt(e, 40), 347);
    }
    const crestStep = sampleNorthRidge350(320, 650) - sampleNorthRidge350(320 - halfGate, 650);
    assert.equal(crestStep, 3);
    assert.ok(crestStep > .43);
    t.diagnostic(JSON.stringify({ levelDeck: [300, 660, 347], crest: [320, 650, 350], crestStep }));
  } finally {
    candidate.dispose();
  }
});

test('the terrain and gate retain the layout validated during construction', () => {
  const layout = {
    ...fixture, summit: { ...fixture.summit },
    shoulders: [{ ...fixture.shoulders[0] }, { ...fixture.shoulders[1] }] as const,
    gate: { ...fixture.gate },
  };
  const candidate = createMainSummitBlock(layout, 350, spacing);
  try {
    Object.assign(layout.summit, { east: 700 });
    Object.assign(layout.shoulders[0], { height: 300 });
    Object.assign(layout.gate, { clearWidth: .01, clearHeight: .01 });
    assert.equal(candidate.heightAt(fixture.summit.east, fixture.summit.north), 800);
    const shoulder = fixture.shoulders[0];
    assert.equal(candidate.heightAt(shoulder.east, shoulder.north), shoulder.height);
    const [left, right, roof] = candidate.enter(new Group()).colliders;
    assert.equal(right.min[0] - left.max[0], fixture.gate.clearWidth);
    assert.equal(roof.min[1] - 350, fixture.gate.clearHeight);
  } finally {
    candidate.dispose();
  }
});

test('the gate rejects openings smaller than the standing player', () => {
  for (const opening of [{ clearWidth: .52 }, { clearHeight: 1.7 }]) {
    assert.throws(() => createMainSummitBlock({
      ...fixture, gate: { ...fixture.gate, ...opening },
    }, 350, spacing), /clearance/);
  }
});

test('the module can release and rebuild the gate without removing any other scene', () => {
  const candidate = createMainSummitBlock(fixture, northRidgeSummit.height, spacing);
  const stage = new Group(), unrelated = new Group();
  stage.add(unrelated, candidate.coarse);
  let coarseDisposals = 0;
  candidate.coarse.geometry.addEventListener('dispose', () => coarseDisposals++);
  const first = candidate.enter(stage);
  let gateDisposals = 0;
  first.group.traverse(object => {
    if ('geometry' in object && object.geometry instanceof candidate.coarse.geometry.constructor) {
      (object.geometry as typeof candidate.coarse.geometry).addEventListener('dispose', () => gateDisposals++);
    }
  });
  assert.equal(candidate.enter(stage).group, first.group);
  candidate.leave();
  assert.deepEqual(stage.children, [unrelated, candidate.coarse]);
  assert.equal(first.colliders.length, 0);
  assert.equal(gateDisposals, 3);
  assert.equal(coarseDisposals, 0);
  assert.notEqual(candidate.enter(stage).group, first.group);
  candidate.dispose();
  candidate.dispose();
  assert.deepEqual(stage.children, [unrelated]);
  assert.equal(coarseDisposals, 1);
  assert.throws(() => candidate.enter(stage), /disposed/);
});

test('main summit terrain has broad slopes and gives the coarse proxy its own fog treatment', t => {
  const candidate = createMainSummitBlock(fixture, northRidgeSummit.height, spacing);
  try {
    assert.equal(candidate.coarse.material.fog, false);
    assert.equal(candidate.coarse.material.color.getHexString(), '4b5e74');
    let slopeSum = 0;
    let count = 0;
    const { west, east, south, north } = mainSummitBounds;
    for (let e = west + 25; e <= east - 25; e += 25) {
      for (let n = south + 25; n < north; n += 25) {
        if (candidate.heightAt(e, n)! <= mainSummitSpec.baseHeight + 5) continue;
        const eastRise = candidate.heightAt(e + 1, n)! - candidate.heightAt(e - 1, n)!;
        const northRise = candidate.heightAt(e, n + 1)! - candidate.heightAt(e, n - 1)!;
        slopeSum += Math.atan(Math.hypot(eastRise, northRise) / 2) * 180 / Math.PI;
        count++;
      }
    }
    const averageDegrees = slopeSum / count;
    assert.ok(count > 6_000 && averageDegrees >= 25 && averageDegrees <= 27);
    t.diagnostic(JSON.stringify({ samples: count, samplingStep: 25, averageDegrees }));
  } finally {
    candidate.dispose();
  }
});

test('the peak is in view from four local far-field cameras', t => {
  const candidate = createMainSummitBlock(fixture, northRidgeSummit.height, spacing);
  try {
    const { east, north } = fixture.summit;
    const target = new Vector3(east, mainSummitSpec.summitHeight, -north);
    const [plateauWidth, plateauDepth] = mainSummitSpec.summitPlateau;
    const camera = new PerspectiveCamera(50, 1.55, .1, 2_400);
    const ray = new Raycaster();
    const frustum = new Frustum();
    const projection = new Matrix4();
    const diagnostics = [];
    candidate.coarse.updateMatrixWorld(true);
    for (const [side, offsetEast, offsetZ] of [
      ['east', 1_600, 0], ['west', -1_600, 0], ['north', 0, -1_600], ['south', 0, 1_600],
    ] as const) {
      camera.position.set(east + offsetEast, 350, -north + offsetZ);
      const approachEdge = target.clone().add(new Vector3(
        Math.sign(offsetEast) * (plateauWidth / 2 - .1), 0, Math.sign(offsetZ) * (plateauDepth / 2 - .1),
      ));
      camera.lookAt(approachEdge);
      camera.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      assert.ok(frustum.containsPoint(target), `${side} peak is inside the fixture camera's far plane`);
      assert.ok(frustum.intersectsObject(candidate.coarse));
      ray.setFromCamera(new Vector2(0, 0), camera);
      const hit = ray.intersectObject(candidate.coarse)[0];
      assert.ok(hit && hit.distance > 1_300 && hit.point.y >= 780,
        `${side} ray reaches the upper silhouette (${hit?.distance}, ${hit?.point.y})`);
      diagnostics.push({ side, meters: +hit.distance.toFixed(3), elevation: +hit.point.y.toFixed(3) });
    }
    t.diagnostic(JSON.stringify(diagnostics));
  } finally {
    candidate.dispose();
  }
});

test('snow depth follows the high mountain and exposed summit and joins the old terrace', () => {
  const candidate = createMainSummitBlock(fixture, northRidgeSummit.height, spacing);
  try {
    const fromTerrace = .36;
    assert.equal(candidate.snowDepthAt(0, -10, fromTerrace), fromTerrace);
    assert.equal(candidate.snowDepthAt(0, 40, fromTerrace), fromTerrace);
    assert.ok(Math.abs(candidate.snowDepthAt(0, 40.01, fromTerrace)! - fromTerrace) <= .2);
    const { east, north } = fixture.summit;
    assert.equal(candidate.snowDepthAt(east, north, fromTerrace), .4);
    const highMountainDepth = candidate.snowDepthAt(east, north - 370, fromTerrace)!;
    assert.ok(highMountainDepth >= .8 && highMountainDepth <= 1);
    assert.equal(candidate.snowDepthAt(east, north, NaN), undefined);
    assert.equal(candidate.snowDepthAt(east, north, 1.1), undefined);
    assert.equal(candidate.snowDepthAt(east, mainSummitBounds.north + 1, fromTerrace), undefined);
  } finally {
    candidate.dispose();
  }
});
