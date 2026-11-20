import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Color, Group, Matrix4, Raycaster, Vector3 } from 'three';
import type { BoxGeometry, InstancedMesh, MeshLambertMaterial } from 'three';
import { createWarriorSquare } from '../tools/voxel-tavern/town-blockout/underground-warrior-square';
import {
  mountUndergroundWarriorSpirits, type WarriorSpiritSite,
} from '../tools/voxel-tavern/town-blockout/underground-warrior-spirits';

const layer = 'warrior-review';
const sites: readonly WarriorSpiritSite[] = [
  { id: 'resident-0', position: [12, -165, 8], yaw: 0 },
  { id: 'resident-1', position: [15, -165, 11], yaw: Math.PI / 2 },
];

test('only the authorized warrior-city viewer sees the crowd while the cold flame stays in the same scene', t => {
  const parent = new Group();
  const square = createWarriorSquare();
  parent.add(square.group);
  const crowd = mountUndergroundWarriorSpirits({ parent, layer, sites });
  t.after(() => {
    crowd.dispose();
    square.dispose();
  });
  const soup = square.group.getObjectByName('warrior-cook-soup');
  assert.equal(soup?.visible, true);
  assert.equal(crowd.group.visible, false);
  crowd.sync({ layer });
  assert.equal(crowd.group.visible, false);
  crowd.sync({ layer, soulSightGranted: false });
  assert.equal(crowd.group.visible, false);
  crowd.sync({ layer: 'elsewhere', soulSightGranted: true });
  assert.equal(crowd.group.visible, false);
  crowd.sync({ layer, soulSightGranted: true });
  assert.equal(crowd.group.visible, true);
  assert.equal(soup?.visible, true);
  crowd.sync({ soulSightGranted: true });
  assert.equal(crowd.group.visible, false);
  assert.equal(square.group.visible, true);
  assert.equal(square.group.parent, parent);
  assert.equal(square.fireTone, 'cold');
  assert.equal(crowd.group.parent, parent);
});

test('the batch stays grounded, subtly varies residents, and cannot intercept a pick ray', t => {
  const parent = new Group();
  const crowd = mountUndergroundWarriorSpirits({ parent, layer, sites });
  t.after(() => crowd.dispose());
  crowd.sync({ layer, soulSightGranted: true });
  parent.updateMatrixWorld(true);
  assert.equal(crowd.group.children.length, 1);
  const child = crowd.group.children[0];
  assert.ok(child && 'isInstancedMesh' in child && child.isInstancedMesh);
  const batch = child as InstancedMesh<BoxGeometry, MeshLambertMaterial>;
  assert.equal(batch.material.emissive.getHex(), 0);
  assert.ok(batch.count > sites.length && batch.count <= 16 * sites.length);
  const perResident = batch.count / sites.length;
  const localBox = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5));
  const matrix = new Matrix4();
  for (const [index, site] of sites.entries()) {
    const bounds = new Box3();
    for (let part = 0; part < perResident; part++) {
      batch.getMatrixAt(index * perResident + part, matrix);
      bounds.union(localBox.clone().applyMatrix4(matrix));
    }
    assert.ok(Math.abs(bounds.min.y - site.position[1]) < .0001);
    assert.ok(bounds.max.y - bounds.min.y > 1.5 && bounds.max.y - bounds.min.y < 1.9);
    batch.getMatrixAt(index * perResident, matrix);
    const leftBoot = new Vector3().setFromMatrixPosition(matrix);
    batch.getMatrixAt(index * perResident + 1, matrix);
    const widthDirection = new Vector3().setFromMatrixPosition(matrix).sub(leftBoot).normalize();
    assert.ok(widthDirection.dot(new Vector3(Math.cos(site.yaw), 0, -Math.sin(site.yaw))) > .9999);
    const ray = new Raycaster(new Vector3(site.position[0], site.position[1] + 1, site.position[2] + 2),
      new Vector3(0, 0, -1));
    assert.deepEqual(ray.intersectObject(crowd.group, true), []);
  }
  const firstCoat = new Color();
  const secondCoat = new Color();
  batch.getColorAt(4, firstCoat);
  batch.getColorAt(perResident + 4, secondCoat);
  assert.notEqual(firstCoat.getHex(), secondCoat.getHex());
});

test('invalid sites fail before attachment and the owned render batch is disposed once', () => {
  const parent = new Group();
  assert.throws(() => mountUndergroundWarriorSpirits({ parent, layer, sites: [sites[0]!, sites[0]!] }),
    /distinct finite sites/);
  assert.throws(() => mountUndergroundWarriorSpirits({
    parent, layer, sites: [{ ...sites[0]!, position: [12, NaN, 8] }],
  }), /distinct finite sites/);
  assert.equal(parent.children.length, 0);
  const crowd = mountUndergroundWarriorSpirits({ parent, layer, sites });
  const batch = crowd.group.children[0] as InstancedMesh;
  let disposals = 0;
  batch.geometry.addEventListener('dispose', () => disposals++);
  crowd.dispose();
  crowd.dispose();
  crowd.sync({ layer, soulSightGranted: true });
  assert.equal(disposals, 1);
  assert.equal(crowd.group.visible, false);
  assert.equal(parent.children.length, 0);
});
