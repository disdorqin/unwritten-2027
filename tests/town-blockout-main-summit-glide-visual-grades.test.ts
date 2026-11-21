import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, MeshBasicMaterial, Scene } from 'three';
import { mountSummitGlideRingVisuals } from '../tools/voxel-tavern/town-blockout/main-summit-glide-ring-visuals';
import type { SummitGlideRing } from '../tools/voxel-tavern/town-blockout/main-summit-glide-rings';

const rings: readonly SummitGlideRing[] = [0, 30, 60].map((north, index) => ({
  id: 'ring-' + (index + 1),
  east: 0, north, height: 560 - index * 5,
  heading: 0, radius: 6,
}));

const colors = (view: ReturnType<typeof mountSummitGlideRingVisuals>) =>
  rings.map(ring => {
    const work = view.group.getObjectByName(ring.id)!;
    const light = work.getObjectByName('glide-ring-light') as Mesh;
    assert.ok(light);
    return (light.material as MeshBasicMaterial).color.getHex();
  });

test('ZD-08 graded rings distinguish clean, graze and miss in scene, without rebuilding mesh', () => {
  const scene = new Scene();
  const view = mountSummitGlideRingVisuals(scene, rings);
  const before = rings.map(ring => view.group.getObjectByName(ring.id)!);
  const neutral = colors(view);
  assert.notEqual(neutral[0], neutral[1], 'first unpassed ring is active');
  assert.equal(neutral[1], neutral[2], 'later unpassed rings share muted material');
  view.setProgress(3, ['clean', 'graze', 'miss']);
  const completed = colors(view);
  assert.equal(new Set(completed).size, 3, 'three accepted grades get different visible color families');
  assert.ok(completed.every((color, i) => color !== neutral[i]));
  view.setProgress(3, ['miss', 'graze', 'clean']);
  const edited = colors(view);
  assert.deepEqual(edited, [completed[2], completed[1], completed[0]],
    'same progress, different grade receipt must refresh the displayed result');
  for (let i = 0; i < rings.length; i++) assert.equal(view.group.getObjectByName(rings[i]!.id), before[i]);
  view.dispose();
  view.dispose();
  assert.equal(scene.children.length, 0);
});

test('ZD-01 original three-ring progress API still works, ignores invalid progress', () => {
  const scene = new Scene();
  const view = mountSummitGlideRingVisuals(scene, rings);
  view.setProgress(1);
  const one = colors(view);
  view.setProgress(-1);
  view.setProgress(Number.NaN);
  view.setProgress(4);
  assert.deepEqual(colors(view), one);
  view.setProgress(3);
  assert.equal(new Set(colors(view)).size, 1, 'default legacy passage stays all-cleared');
  view.dispose();
});
