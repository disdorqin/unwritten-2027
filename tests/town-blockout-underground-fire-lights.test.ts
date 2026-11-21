import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Scene, type Mesh, type MeshBasicMaterial, type PointLight, type RingGeometry } from 'three';
import { mountUndergroundRecoveryFireLights } from '../tools/voxel-tavern/town-blockout/underground-fire-lights.ts';
import type { UndergroundRecoveryFireSite } from '../tools/voxel-tavern/town-blockout/underground-recovery-fires.ts';

const mine: UndergroundRecoveryFireSite = {
  fire: { id: 'camp', point: { layer: 'mine', east: 4, north: 7, height: -90 }, healPerSecond: 5 },
  radius: 2.5,
  tone: 'warm',
};
const city: UndergroundRecoveryFireSite = {
  fire: { id: 'cold-flame', point: { layer: 'city', east: 8, north: 12, height: -165 }, healPerSecond: 5 },
  radius: 4,
  tone: 'cold',
};
const transform = ({ east, north, height }: typeof mine.fire.point) => [east + 1, height + 100, -north] as const;
const emitterHeightFor = (id: string) => id === mine.fire.id ? .8 : 1.4;

function createLights(sites = [mine, city]) {
  const parent = new Scene();
  const view = mountUndergroundRecoveryFireLights({
    parent, sites, toScene: transform, intensityFor: id => id === mine.fire.id ? 9 : 2, emitterHeightFor,
  });
  const light = (id: string) => view.group.getObjectByName('recovery-fire/' + id + '/light') as PointLight;
  const ring = (id: string) => view.group.getObjectByName('recovery-fire/' + id) as Mesh<RingGeometry, MeshBasicMaterial>;
  return { parent, view, light, ring };
}

test('the elevated point light cuts off at the original U-12 ring radius on the ground', t => {
  const { view, light, ring } = createLights();
  t.after(view.dispose);
  assert.deepEqual(view.fires, [mine.fire, city.fire]);
  for (const site of [mine, city]) {
    const id = site.fire.id;
    const pointLight = light(id), circle = ring(id);
    const height = emitterHeightFor(id);
    const [x, y, z] = transform(site.fire.point);
    assert.equal(pointLight.isPointLight, true);
    assert.equal(pointLight.distance, Math.hypot(site.radius, height));
    assert.ok(Math.abs(Math.sqrt(pointLight.distance ** 2 - height ** 2) - site.radius) < 1e-12);
    assert.equal(circle.geometry.parameters.outerRadius * circle.scale.x, site.radius);
    assert.deepEqual(pointLight.position.toArray(), [x, y + height, z]);
    assert.deepEqual(circle.position.toArray(), [x, y + .02, z]);
    assert.equal(pointLight.visible, false);
    assert.equal(circle.visible, false);
  }
  assert.deepEqual([light('camp').intensity, light('cold-flame').intensity], [9, 2]);
  assert.notEqual(light('camp').color.getHexString(), light('cold-flame').color.getHexString());
});

test('only the current layer uses the remaining scene light budget and switching clears prior pools', t => {
  const secondCamp = { ...mine, fire: { ...mine.fire, id: 'tunnel-fire' } };
  const { view, light, ring } = createLights([mine, secondCamp, city]);
  t.after(view.dispose);
  assert.deepEqual(view.sync({ layer: 'mine', availableLightSlots: 1, confirmedFireId: 'camp' }), ['tunnel-fire']);
  assert.equal(light('camp').visible, true);
  assert.equal(ring('camp').visible, true);
  assert.equal(ring('camp').material.opacity, .8);
  assert.equal(light('tunnel-fire').visible, false);
  assert.equal(ring('tunnel-fire').visible, false);
  assert.equal(light('cold-flame').visible, false);
  assert.deepEqual(view.sync({ layer: 'city', availableLightSlots: 1, confirmedFireId: 'camp' }), []);
  assert.equal(light('camp').visible, false);
  assert.equal(ring('camp').visible, false);
  assert.equal(light('cold-flame').visible, true);
  assert.equal(ring('cold-flame').material.opacity, .2);
  assert.deepEqual(view.sync({ availableLightSlots: 3 }), []);
  const lights = view.group.children.filter(child => (child as PointLight).isPointLight === true);
  assert.equal(lights.length, 3);
  assert.ok(lights.every(child => !child.visible));
});

test('invalid host inputs are rejected and disposal removes only this mount', () => {
  const { view, parent } = createLights();
  const otherSceneObject = new Group();
  parent.add(otherSceneObject);
  assert.throws(() => view.sync({ layer: 'mine', availableLightSlots: -1 }), /fire light budget/);
  assert.throws(() => mountUndergroundRecoveryFireLights({
    parent, sites: [mine], toScene: transform, intensityFor: () => 0, emitterHeightFor,
  }), /fire light intensity/);
  assert.throws(() => mountUndergroundRecoveryFireLights({
    parent, sites: [mine], toScene: transform, intensityFor: () => 1, emitterHeightFor: () => 0,
  }), /fire emitter height/);
  assert.throws(() => mountUndergroundRecoveryFireLights({
    parent, sites: [mine], toScene: () => [0, 0, Infinity], intensityFor: () => 1, emitterHeightFor,
  }), /fire scene position/);
  view.dispose();
  view.dispose();
  assert.deepEqual(parent.children, [otherSceneObject]);
  assert.equal(view.group.children.length, 0);
  assert.deepEqual(view.sync({ layer: 'city', availableLightSlots: 1 }), []);
});
