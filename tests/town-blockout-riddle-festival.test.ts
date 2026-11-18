import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene, type Points } from 'three';
import { createFestival } from '../tools/voxel-tavern/town-blockout/festival.ts';

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
