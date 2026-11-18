import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene, type Points } from 'three';
import { createFestival, makeTestFireworksTable } from '../tools/voxel-tavern/town-blockout/festival.ts';

test('the workshop reward uses the plaza particles without starting or interrupting the main show', () => {
  const scene = new Scene();
  const messages: string[] = [];
  let shows = 0;
  const festival = createFestival(scene, message => messages.push(message), () => shows++);
  const particles = scene.children[0] as Points;

  assert.ok(particles.isPoints);
  assert.equal(scene.children.length, 1);
  assert.equal(festival.launchWorkshopBurst(116.25, 15.4, -115), true);
  assert.equal(festival.launchWorkshopBurst(116.25, 15.4, -115), false);
  festival.update(.4);
  assert.equal(festival.active(), false);
  assert.equal(particles.visible, true);
  assert.ok(particles.geometry.drawRange.count > 0 && particles.geometry.drawRange.count <= 108);
  assert.deepEqual(messages, []);

  assert.equal(festival.start(), true);
  festival.update(.4);
  assert.equal(particles.visible, true);
  assert.equal(festival.active(), true);
  assert.equal(messages.at(-1), '3');
  festival.update(3);
  assert.equal(messages.at(-1), '新年快乐！');
  festival.update(16);
  assert.equal(shows, 1);
  assert.equal(festival.active(), false);
  assert.equal(particles.visible, false);
  assert.equal(scene.children.length, 1);
});

test('configured test fireworks stay on one atlas and both peers render the same seeded positions', () => {
  const table = makeTestFireworksTable(0x5530020f);
  assert.deepEqual(table, makeTestFireworksTable(0x5530020f));
  assert.notDeepEqual(table, makeTestFireworksTable(0x55300210));
  assert.equal(table.duration, 36);
  assert.equal(table.bursts.length,22);
  assert.deepEqual(table.launchPoints.map(({ id }) => id), ['plaza','lake']);
  const scenes = [new Scene(), new Scene()];
  const peers = scenes.map(scene => createFestival(scene));
  const points = scenes.map(scene => scene.children[0] as Points);
  let now = 5000;
  for (const peer of peers) {
    assert.equal(peer.startShow(table,{ ageSeconds: -.25, clockMs: () => now }),true);
    assert.equal(peer.start(),false);
    peer.update(.1);
  }
  assert.ok(points.every(object => !object.visible));
  now += 700;
  peers.forEach(peer => peer.update(0));
  assert.ok(points.every(object => object.visible && object.geometry.drawRange.count === 12));
  const pointsAtFrame = points.map(object => Array.from(object.geometry.getAttribute('position').array.slice(0,36)));
  assert.deepEqual(pointsAtFrame[0],pointsAtFrame[1]);
  assert.ok(pointsAtFrame[0][0] < 250);
  assert.ok(pointsAtFrame[0][18] > 300);
  assert.equal(points[0].geometry.getAttribute('position').count,2592);
  now += 36_000;
  peers.forEach(peer => peer.update(0));
  assert.ok(points.every(object => !object.visible));
  assert.ok(peers.every(peer => !peer.active()));
});
