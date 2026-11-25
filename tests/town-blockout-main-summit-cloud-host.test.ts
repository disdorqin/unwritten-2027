import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, type Material } from 'three';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { createZa22CloudRoute, createZa22NorthRidgeLine, cloudTerminal,
  za22StationApproach } from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';

test('P-8 clouds live in the actual ZA-22 mountain assembly, use two batches and dispose on exit', t => {
  const owner = new Group();
  const epoch = Date.UTC(2026, 0, 1);
  let official = { east: 0, north: 0 };
  const assembly = mountMainSummitAssembly(owner, epoch, () => official);
  t.after(() => { if (assembly.group.parent) assembly.dispose(); });
  assert.ok(assembly.mountedParts().includes('P-8'));
  const cloud = assembly.group.getObjectByName('main-summit-cloud-layer') as Group | undefined;
  assert.ok(cloud && cloud.parent === assembly.group);
  const banks = cloud.getObjectByName('main-summit-cloud-banks') as InstancedMesh;
  const streamer = cloud.getObjectByName('main-summit-shoulder-banner-clouds') as InstancedMesh;
  assert.ok(banks && streamer);
  assert.ok(banks.count >= 80 && banks.count <= 126);
  assert.equal(streamer.count, 0);
  assert.equal(cloud.children.length, 2);
  const prior = banks.material as Material;
  let disposedMaterials = 0;
  prior.addEventListener('dispose', () => disposedMaterials++);
  assert.equal(assembly.update(epoch + 3_000).length, 2, 'same P-2 two-cabin update contract');
  official = { east: 8, north: 0 };
  assembly.update(epoch + 10_000);
  assert.ok(streamer.count >= 0 && streamer.count <= 12);
  official = { east: 0, north: 0 };
  assembly.update(epoch + 11_000);
  assert.equal(streamer.count, 0);
  assembly.dispose();
  assert.equal(cloud.parent, null);
  assert.ok(!assembly.mountedParts().includes('P-8'));
  assert.equal(owner.children.length, 0);
  assert.equal(disposedMaterials, 1, 'cloud shader GPU material must release exactly once');
});

test('P-8 is transitively reachable from the town cloud cable path when the mountain is mounted', t => {
  let now = Date.UTC(2026, 0, 1);
  const route = createZa22CloudRoute({ now: () => now, enterOrExit() {}, view() {} });
  route.action(za22StationApproach)?.run();
  route.update(za22StationApproach);
  const layer = route.scene.getObjectByName('main-summit-cloud-layer');
  assert.ok(layer, 'mountMountain in the ordinary cloud route must instantiate P-8');
  assert.ok(layer.getObjectByName('main-summit-cloud-banks'));
  // Take the real published return action; the host owns cleanup on return.
  now += createZa22NorthRidgeLine(26).legMs;
  route.update(za22StationApproach);
  assert.equal(route.active(), true);
  route.action(cloudTerminal)?.run();
  route.update(cloudTerminal);
  now += createZa22NorthRidgeLine(26).legMs;
  route.update(cloudTerminal);
  assert.equal(route.active(), false);
  assert.equal(route.scene.getObjectByName('main-summit-cloud-layer'), undefined);
});
