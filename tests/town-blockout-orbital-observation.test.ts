import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Raycaster, Vector3, type Mesh } from 'three';
import {
  createOrbitalObservationCabin, orbitalObservationCabinSpec,
} from '../tools/voxel-tavern/town-blockout/orbital-observation-cabin';

test('the S-6 single-room geometry exposes a clear S-1-sized local port', () => {
  const scene = new Group();
  const cabin = createOrbitalObservationCabin();
  scene.add(cabin.group);
  assert.deepEqual(cabin.port, {
    frame: { x: 0, n: 0, ground: 0 },
    approach: { x: 0, n: -.85, ground: 0 },
    arrival: { x: 0, n: .75, ground: 0, yaw: 0 },
  });
  assert.equal(orbitalObservationCabinSpec.portWidth, 3.4);
  assert.equal(orbitalObservationCabinSpec.portHeight, 2.5);
  const path = [cabin.port.approach, cabin.port.arrival, { x: 0, n: 3.4 }, cabin.viewPoint, { x: 2.9, n: 5.8 }];
  let walked = 0;
  for (const [i, to] of path.slice(1).entries()) {
    const from = path[i]!;
    const count = Math.ceil(Math.hypot(to.x - from.x, to.n - from.n) / .025);
    for (let j = 0; j <= count; j++) {
      const x = from.x + (to.x - from.x) * j / count;
      const n = from.n + (to.n - from.n) * j / count;
      assert.equal(cabin.floorHeightAt(x, n), 0, `floor at ${x},${n}`);
      assert.ok(cabin.isWalkable(x, n), `standing capsule at ${x},${n}`);
      walked++;
    }
  }
  assert.ok(walked > 380);
  assert.ok(cabin.isWalkable(1.41, -.1));
  assert.ok(!cabin.isWalkable(1.46, -.1));
  assert.ok(!cabin.isWalkable(0, -.4, .27, 2.51));
  assert.equal(cabin.floorHeightAt(3, -.1), undefined);
  assert.ok(!cabin.isWalkable(3, .01));
  assert.ok(!cabin.isWalkable(5.17, 3.4));
  assert.ok(!cabin.isWalkable(4.49, 3.4));
  assert.ok(cabin.isWalkable(-2.38, 3.4));
  assert.ok(!cabin.isWalkable(-2.43, 3.4));
  assert.ok(!cabin.isWalkable(-3.55, 3.4));
  assert.ok(!cabin.isWalkable(0, -.85, NaN));
  cabin.dispose();
  assert.equal(scene.children.length, 0);
});

test('the authored window, old marks, bench and star chart survive a real mount', () => {
  const cabin = createOrbitalObservationCabin();
  const names: string[] = [];
  cabin.group.traverse(child => names.push(child.name));
  for (const feature of [
    'observation-single-side-window', 'observation-old-glass-scratches', 'observation-single-long-bench',
    'observation-red-cord-binoculars', 'observation-mirror-lake', 'observation-double-ridge-silhouette',
    'observation-distant-town-lights', 'observation-star-chart-table', 'observation-star-chart-face',
    'observation-star-chart-lines',
  ]) {
    assert.equal(names.filter(name => name === feature).length, 1, feature);
  }
  assert.equal(names.filter(name => name === 'observation-faded-red-cord').length, 3);
  assert.equal(names.filter(name => name === 'observation-star-chart-dot').length, 8);
  assert.equal(names.filter(name => name === 'observation-height-notch').length, cabin.heightMarks.length);
  assert.ok(cabin.heightMarks.every((height, index) => index === 0 || height < cabin.heightMarks[index - 1]!));
  cabin.group.updateMatrixWorld(true);
  const eye = new Vector3(-2.38, 1.65, -3.4);
  const chartFace = new Vector3(-3.55, .975, -3.4);
  const sightline = new Raycaster(eye, chartFace.sub(eye).normalize());
  const firstSolid = sightline.intersectObject(cabin.group, true).find(({ object }) => object.type === 'Mesh');
  assert.equal(firstSolid?.object.name, 'observation-star-chart-face');
  const pane = cabin.group.getObjectByName('observation-single-side-window') as Mesh;
  let released = 0;
  pane.geometry.addEventListener('dispose', () => released++);
  cabin.dispose();
  cabin.dispose();
  assert.equal(released, 1);
});
