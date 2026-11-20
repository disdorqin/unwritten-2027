import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createOrbitalEarlyRooms } from '../tools/voxel-tavern/town-blockout/orbital-early-rooms';
import { mountOrbitalStatusDisplay, orbitalStatusSemantics } from '../tools/voxel-tavern/town-blockout/orbital-status-display';

test('an S-2 host keeps its original eighteen lamps and receives only one unlit berth marker', () => {
  const { group, collisions, isWalkable } = createOrbitalEarlyRooms();
  const wall = group.getObjectByName('orbital-status-wall');
  const teleport = group.getObjectByName('status-teleport');
  const support = group.getObjectByName('status-life-support');
  const airlockCollision = collisions.find(item => item.kind === 'status-panel');
  const walkability = isWalkable(0, -.42);
  const status = mountOrbitalStatusDisplay(group);
  assert.deepEqual(status.counts, { red: 16, green: 2, off: 1 });
  assert.equal(group.getObjectByName('orbital-status-wall'), wall);
  assert.equal(group.getObjectByName('status-teleport'), teleport);
  assert.equal(group.getObjectByName('status-life-support'), support);
  assert.equal(collisions.find(item => item.kind === 'status-panel'), airlockCollision);
  assert.equal(isWalkable(0, -.42), walkability);

  const off = group.getObjectByName('off-lens');
  assert.ok(off instanceof Mesh);
  assert.ok(off.material instanceof MeshBasicMaterial);
  assert.equal(off.material.color.getHex(), 0x17222b);
  assert.deepEqual(off.userData, { state: 'off' });
  const labeled: string[] = [];
  group.traverse(object => { if (typeof object.userData.text === 'string') labeled.push(object.userData.text); });
  assert.deepEqual(labeled, ['三号泊位']);
  const vent = group.getObjectByName('orbital-life-support-vent');
  assert.ok(vent);
  assert.equal(vent.userData.output, 'minimum');
  assert.ok(vent.position.y > 1.95);
  assert.throws(() => mountOrbitalStatusDisplay(group), RangeError);

  group.updateMatrixWorld(true);
  const eye = new Vector3(0, 1.65, .42);
  const offPosition = off.getWorldPosition(new Vector3());
  assert.ok(offPosition.y < 1);
  const facing = offPosition.sub(eye).normalize();
  assert.equal(new Raycaster(eye, facing).intersectObject(group, true)[0]?.object, off);
  const ventEye = new Vector3(2.55, 1.65, 1.44);
  const ventDirection = vent.getWorldPosition(new Vector3()).sub(ventEye).normalize();
  assert.equal(new Raycaster(ventEye, ventDirection).intersectObject(group, true)[0]?.object.parent, vent);
  status.dispose();
  assert.equal(group.getObjectByName('off-lens'), undefined);
  assert.equal(group.getObjectByName('orbital-status-wall'), wall);
});

test('seeing the final log page turns off its small lamp while the two local services stay operational', () => {
  const { group } = createOrbitalEarlyRooms();
  const pageLamp = group.getObjectByName('log-page-lamp');
  assert.ok(pageLamp instanceof Mesh);
  const original = pageLamp.material;
  const status = mountOrbitalStatusDisplay(group);
  const localLights = ['navigation-log-status', 'orbit-keeping-status'].map(id => group.getObjectByName(id));
  assert.equal(status.pageReached, false);
  status.setLastLogPageReached(true);
  assert.equal(status.pageReached, true);
  assert.notEqual(pageLamp.material, original);
  assert.ok(pageLamp.material instanceof MeshBasicMaterial);
  assert.equal(pageLamp.visible, true);
  assert.equal(pageLamp.material.color.getHex(), 0x17222b);
  for (const lamp of localLights) {
    assert.ok(lamp instanceof Mesh);
    assert.ok(lamp.material instanceof MeshBasicMaterial);
    assert.equal(lamp.material.color.getHex(), 0x82d9a9);
    assert.equal(lamp.userData.state, 'green');
  }
  status.setLastLogPageReached(false);
  assert.equal(pageLamp.material, original);
  status.setLastLogPageReached(true);
  status.dispose();
  assert.equal(pageLamp.material, original);
  assert.equal(group.getObjectByName('navigation-log-status'), undefined);
  assert.equal(group.getObjectByName('orbit-keeping-status'), undefined);
  status.dispose();
});

test('the display semantics distinguish all five cabins and navigation markers', () => {
  assert.deepEqual(orbitalStatusSemantics.airlock.green, ['teleport', 'minimum-life-support']);
  assert.deepEqual(orbitalStatusSemantics.cockpit.green, ['navigation-log', 'orbit-keeping']);
  assert.equal(orbitalStatusSemantics.observatory.indicators, 'none');
  assert.equal(orbitalStatusSemantics.living.systems, 'mostly-offline');
  assert.equal(orbitalStatusSemantics.teleport.anchors, 'warm-white-after-physical-visit');
});
