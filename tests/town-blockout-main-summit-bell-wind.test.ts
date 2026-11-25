import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { createMainSummitBellPosts } from '../tools/voxel-tavern/town-blockout/main-summit-bell-posts';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { createMainSummitWindGround } from '../tools/voxel-tavern/town-blockout/main-summit-wind-ground';

test('bell posts: nine posts at 30 m spacing inside the cloud band', context => {
  const owner = new Group();
  const assembly = mountMainSummitAssembly(owner, Date.UTC(2026, 0, 1));
  context.after(() => assembly.dispose());
  const trail = createMainSummitTrail(assembly.block.heightAt, assembly.arrivalHeight);
  const bellPosts = createMainSummitBellPosts(trail.points);
  context.after(() => bellPosts.dispose());
  assert.equal(bellPosts.posts.length, 9);
  for (let i = 1; i < 9; i++) {
    assert.equal(bellPosts.posts[i]!.arc - bellPosts.posts[i - 1]!.arc, 30, 'spacing 25–35 m band');
  }
  for (const post of bellPosts.posts) {
    assert.ok(post.height >= 380 && post.height <= 560,
      `post ${post.index} inside the cloud band, got ${post.height}`);
  }
  for (const part of ['bell-post-base', 'bell-post-pole', 'bell-post-arm', 'bell-post-bell', 'bell-post-lamp']) {
    const mesh = bellPosts.group.getObjectByName(part) as { count?: number } | undefined;
    assert.equal(mesh?.count, 9, `${part} instanced ×9`);
  }
  assert.ok(bellPosts.group.getObjectByName('bell-post-lamp-core'), 'lamp cores present');
  bellPosts.setLamp(0, true);
  bellPosts.setAllLamps(false);
});

test('wind ground: windsock and measuring flag pole stand at the launch point', context => {
  const wind = createMainSummitWindGround({ east: 62.5, north: 975, height: 800 });
  context.after(() => wind.dispose());
  assert.ok(wind.group.getObjectByName('wind-sock-frame'), 'sock frame present');
  assert.ok(wind.group.getObjectByName('wind-sock-cloth'), 'cloth sock present');
  assert.ok(wind.group.getObjectByName('wind-measure-flag-pole'), 'measuring pole present');
  for (let i = 0; i < 5; i++) {
    assert.ok(wind.group.getObjectByName(`wind-measure-flag-${i}`), `pennant ${i} present`);
  }
  wind.update(0);
  wind.update(12.5);
  assert.ok(Number.isFinite(wind.sock.rotation.y), 'sock sways without error');
});
