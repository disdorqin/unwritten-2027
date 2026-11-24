import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, Vector3, type BufferGeometry, type Material } from 'three';
import {
  createTownD2FrontRidgeRestStops, TOWN_D2_REST_STOP_TEXTS,
} from '../tools/voxel-tavern/town-blockout/town-d2-front-ridge-rest-stops';
import {
  buildSwitchbackCenterline, type SwitchbackPoint,
} from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import { sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';

function trueDistance(line: readonly SwitchbackPoint[]) {
  const cumulative = [0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.east - a.east, b.north - a.north, b.height - a.height));
  }
  return cumulative;
}

function distanceToSegment(point: { east: number; north: number; height: number }, line: readonly SwitchbackPoint[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = new Vector3(line[i - 1]!.east, line[i - 1]!.height, -line[i - 1]!.north);
    const b = new Vector3(line[i]!.east, line[i]!.height, -line[i]!.north);
    const p = new Vector3(point.east, point.height, -point.north);
    const segment = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(segment) / segment.lengthSq()));
    best = Math.min(best, p.distanceTo(a.addScaledVector(segment, t)));
  }
  return best;
}

function collectCopy(root: Group) {
  const copy: string[] = [];
  root.traverse(object => {
    const lines = object.userData.authoredCopy;
    if (Array.isArray(lines)) copy.push(...lines);
  });
  return copy;
}

test('D-5: exact 250 m 3D arc interpolation, metre copy and complete road sequence', () => {
  const line = buildSwitchbackCenterline();
  const cumulative = trueDistance(line);
  const length = cumulative.at(-1)!;
  const stops = createTownD2FrontRidgeRestStops({ centreline: line });
  try {
    assert.equal(typeof document, 'undefined', 'this gate must exercise the Node/no-document path');
    const expected = Array.from({ length: Math.floor(length / 250) }, (_, i) => (i + 1) * 250);
    assert.deepEqual(stops.mileposts.map(post => post.meters), expected);
    assert.deepEqual(stops.mileposts.map(post => post.distance), expected,
      'stations must sit on the exact 3D arc, not the first vertex after each threshold');
    for (const post of stops.mileposts) {
      assert.equal(post.faceLabel, `${post.meters} 米`);
      assert.equal(post.topLabel, '盘山道');
      assert.ok(!/公里|km/i.test(post.text), 'mileage faces are metres, never kilometres');
      assert.ok(distanceToSegment({ east: post.centreEast, north: post.centreNorth, height: post.centreHeight }, line) < 1e-8,
        `${post.meters} m station must interpolate on the road`);
    }
    const copy = collectCopy(stops.group);
    for (const post of stops.mileposts) {
      assert.ok(copy.includes(post.faceLabel));
      assert.ok(copy.includes(TOWN_D2_REST_STOP_TEXTS.milepostTop));
    }
    assert.ok(stops.mileposts.length >= 11, `full surveyed road has ${stops.mileposts.length} metre posts`);
  } finally { stops.dispose(); }
});

test('D-5: authored copy, measured lower/middle shelters and exact sampled lookout', () => {
  const line = buildSwitchbackCenterline();
  const cumulative = trueDistance(line);
  const length = cumulative.at(-1)!;
  const stops = createTownD2FrontRidgeRestStops({ centreline: line });
  try {
    assert.equal(stops.shelters.length, 2);
    assert.deepEqual(stops.shelters.map(shelter => shelter.section), ['lower-end', 'middle-cliff']);
    assert.ok(stops.shelters[0]!.distance < length / 2);
    assert.ok(stops.shelters[1]!.distance > stops.shelters[0]!.distance);
    // Lower end snaps to the measured line near the design card's 1050 m.
    assert.ok(Math.abs(stops.shelters[0]!.distance - 1050) <= 3.1);
    // Middle cliff uses the measured mid-terrace centreline, not the late gate.
    const nearestMiddle = line.reduce((best, point, i) =>
      Math.hypot(point.east - 440, point.north - 520) < Math.hypot(best.point.east - 440, best.point.north - 520)
        ? { point, i } : best, { point: line[0]!, i: 0 });
    assert.ok(Math.abs(stops.shelters[1]!.distance - cumulative[nearestMiddle.i]!) < 1e-8);
    assert.ok(stops.shelters[1]!.distance < length * 0.65);

    assert.equal(stops.viewpoint.east, 300);
    assert.equal(stops.viewpoint.north, 400);
    assert.equal(stops.viewpoint.height, sampleNorthRidge350(300, 400));
    assert.equal(stops.group.getObjectByName('town-d2-viewpoint-300-400')!.position.y,
      sampleNorthRidge350(300, 400));
    assert.equal(stops.group.userData.roadMoved, false);

    const copy = collectCopy(stops.group);
    for (const text of Object.values(TOWN_D2_REST_STOP_TEXTS)) assert.ok(copy.includes(text), text);
    for (const shelter of stops.shelters) assert.equal(shelter.text, TOWN_D2_REST_STOP_TEXTS.rest);
    assert.equal(stops.viewpoint.text, TOWN_D2_REST_STOP_TEXTS.viewpoint);
    assert.equal(stops.warnings.length, 1);
    assert.equal(stops.warnings[0]!.text, TOWN_D2_REST_STOP_TEXTS.warning);
    assert.ok(stops.warnings[0]!.distance > stops.shelters[1]!.distance);
    assert.ok(stops.warnings[0]!.distance < length * 0.65);
  } finally { stops.dispose(); }
});

test('D-5: hairpin benches exceed 120 degrees, stay >=120 m apart and sit on the uphill side', () => {
  const line = buildSwitchbackCenterline();
  const stops = createTownD2FrontRidgeRestStops({ centreline: line });
  try {
    assert.ok(stops.benches.length >= 4, `expected a real hairpin bench grid, got ${stops.benches.length}`);
    for (let i = 0; i < stops.benches.length; i++) {
      const bench = stops.benches[i]!;
      assert.ok(bench.turnDegrees > 120, `${bench.id}: ${bench.turnDegrees.toFixed(2)} degrees`);
      // Independently recover the nearest centreline vertex and its turn.
      const vertexIndex = line.reduce((best, point, index) =>
        Math.abs(cumulativeDistance(line, index) - bench.distance) < Math.abs(cumulativeDistance(line, best) - bench.distance)
          ? index : best, 0);
      const previous = line[Math.max(0, vertexIndex - 1)]!, point = line[vertexIndex]!, next = line[Math.min(line.length - 1, vertexIndex + 1)]!;
      const incoming = new Vector3(point.east - previous.east, 0, -(point.north - previous.north)).normalize();
      const outgoing = new Vector3(next.east - point.east, 0, -(next.north - point.north)).normalize();
      const turn = Math.acos(Math.max(-1, Math.min(1, incoming.dot(outgoing)))) * 180 / Math.PI;
      assert.ok(Math.abs(turn - bench.turnDegrees) < 1e-7);
      const inside = outgoing.clone().sub(incoming).normalize();
      if (inside.lengthSq() > 0) {
        const local = new Vector3(bench.east - point.east, 0, -(bench.north - point.north));
        assert.ok(local.dot(inside) > 0, `${bench.id} must be on the turn's inside`);
      }
      if (i > 0) assert.ok(bench.distance - stops.benches[i - 1]!.distance >= 120,
        `${bench.id} violates minimum 120 m spacing`);
    }
  } finally { stops.dispose(); }
});

function cumulativeDistance(line: readonly SwitchbackPoint[], index: number) {
  let result = 0;
  for (let i = 1; i <= index; i++) {
    const a = line[i - 1]!, b = line[i]!;
    result += Math.hypot(b.east - a.east, b.north - a.north, b.height - a.height);
  }
  return result;
}

test('D-5: three material families, finite transforms/vertices and idempotent complete disposal', () => {
  const parent = new Group();
  const stops = createTownD2FrontRidgeRestStops();
  parent.add(stops.group);
  try {
    assert.ok(stops.materials.timber && stops.materials.stone && stops.materials.snow);
    assert.ok(stops.benches.length > 0);
    let meshes = 0;
    stops.group.updateMatrixWorld(true);
    stops.group.traverse(object => {
      assert.ok([object.position.x, object.position.y, object.position.z,
        object.rotation.x, object.rotation.y, object.rotation.z,
        object.scale.x, object.scale.y, object.scale.z].every(Number.isFinite), object.name);
      assert.ok([...object.matrixWorld.elements].every(Number.isFinite), object.name);
      if (!(object instanceof Mesh)) return;
      meshes++;
      const positions = object.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) &&
          Number.isFinite(positions.getZ(i)), `${object.name} vertex ${i}`);
      }
    });
    assert.ok(meshes < 80, `static detail must be material-batched, got ${meshes} meshes`);
    assert.ok(stops.group.children.some(child => child.name.startsWith('town-d2-static-')));
    const resources = new Set<BufferGeometry | Material>();
    stops.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach(item => resources.add(item));
    });
    let disposed = 0;
    for (const resource of resources) resource.addEventListener('dispose', () => { disposed++; });
    stops.dispose();
    stops.dispose();
    assert.equal(disposed, resources.size, 'every unique geometry/material released exactly once');
    assert.equal(parent.children.length, 0);
    assert.equal(stops.group.children.length, 0);
    assert.equal(stops.group.userData.disposed, true);
  } finally { stops.dispose(); }
});

test('D-5: 3D interpolation differs from legacy planar cumulative and never drifts', () => {
  const custom: SwitchbackPoint[] = [
    { east: 0, north: 0, height: 0, cum: 999 },
    { east: 100, north: 0, height: 30, cum: 1 },
    { east: 100, north: 100, height: 30, cum: 2 },
    { east: 100, north: 200, height: 50, cum: 3 },
  ];
  const stops = createTownD2FrontRidgeRestStops({ centreline: custom, terrainAt: () => 20, gridAt: () => 20 });
  try {
    assert.equal(stops.mileposts.length, 1);
    const post = stops.mileposts[0]!;
    assert.equal(post.distance, 250);
    assert.equal(post.faceLabel, '250 米');
    assert.ok(distanceToSegment({ east: post.centreEast, north: post.centreNorth, height: post.centreHeight }, custom) < 1e-8);
    assert.ok(post.centreNorth > 140 && post.centreNorth < 150, `3D target interpolates at N${post.centreNorth.toFixed(3)}`);
    assert.ok(Math.abs(custom[2]!.cum - 2) < 1e-8, 'input is deliberately not mutated');
  } finally { stops.dispose(); }
});
