import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Matrix4, Raycaster, Scene, Vector3, type InstancedMesh } from 'three';
import { mountUndergroundMineSpiritTraces } from '../tools/voxel-tavern/town-blockout/underground-mine-spirit-traces.ts';

const footprint = { east: 4, north: 7, height: -90, yaw: Math.PI / 2 };
const lamp = { east: 6, north: 8, height: -89.6 };
const silhouette = { east: 5, north: 7, height: -90 };

function mount(parent = new Scene()) {
  return mountUndergroundMineSpiritTraces({
    parent, domainId: 'mine', footprints: [footprint, footprint], lamps: [lamp], silhouettes: [silhouette],
  });
}

test('traces only show to a granted viewer in the same active domain', t => {
  const view = mount();
  t.after(view.dispose);
  assert.equal(view.group.visible, false);
  view.sync({ activeDomain: 'mine' });
  assert.equal(view.group.visible, false);
  view.sync({ activeDomain: 'city', soulSightGranted: true });
  assert.equal(view.group.visible, false);
  view.sync({ activeDomain: 'mine', soulSightGranted: true });
  assert.equal(view.group.visible, true);
  view.sync({ activeDomain: 'mine', soulSightGranted: false });
  assert.equal(view.group.visible, false);
  view.sync({ soulSightGranted: true });
  assert.equal(view.group.visible, false);
});

test('tracks, framed wicks and figures stay batched in ENY with no light or raycast obstruction', t => {
  const view = mount();
  t.after(view.dispose);
  view.sync({ activeDomain: 'mine', soulSightGranted: true });
  const batches = view.group.children as InstancedMesh[];
  assert.deepEqual(batches.map(batch => batch.name), [
    'mine-spirit-bootprints', 'mine-spirit-lamp-frames', 'mine-spirit-lamp-wicks', 'mine-spirit-silhouettes',
  ]);
  assert.ok(batches.every(batch => batch.isInstancedMesh && batch.count > 1));
  const first = new Matrix4();
  batches[0].getMatrixAt(0, first);
  const position = new Vector3().setFromMatrixPosition(first);
  assert.ok(Math.abs(position.x - (footprint.east - .081)) < 1e-5);
  assert.ok(Math.abs(position.y - (footprint.height + .015)) < 1e-5);
  assert.ok(Math.abs(position.z + footprint.north) < 1e-5);
  const ray = new Raycaster(new Vector3(silhouette.east, -89, -silhouette.north + 3), new Vector3(0, 0, -1));
  view.group.updateMatrixWorld(true);
  assert.deepEqual(ray.intersectObject(view.group, true), []);
});

test('invalid placements do not mount and disposal removes only the trace layer once', () => {
  const parent = new Scene();
  const unrelated = new Group();
  parent.add(unrelated);
  assert.throws(() => mountUndergroundMineSpiritTraces({
    parent, domainId: 'mine', footprints: [{ ...footprint, yaw: Infinity }], lamps: [], silhouettes: [],
  }), /trace placement/);
  assert.deepEqual(parent.children, [unrelated]);
  const view = mount(parent);
  const batch = view.group.children[0] as InstancedMesh;
  let releases = 0;
  batch.geometry.addEventListener('dispose', () => { releases++; });
  view.dispose();
  view.dispose();
  view.sync({ activeDomain: 'mine', soulSightGranted: true });
  assert.equal(releases, 1);
  assert.equal(view.group.visible, false);
  assert.deepEqual(parent.children, [unrelated]);
});
