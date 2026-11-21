import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, PointLight } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { mountMainSummitExpeditionSites } from '../tools/voxel-tavern/town-blockout/main-summit-expedition-sites';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

test('R1: actual P-1/P-3 survey anchors twelve rock tower clusters, two full shelters, icefall and observatory', t => {
  const terrain = createMainSummitBlock(mainSummitLayout, 347, 100);
  t.after(terrain.dispose);
  const foot = terrain.heightAt;
  const path = createMainSummitTrail(foot, 347);
  const scene = new Group();
  const model = mountMainSummitExpeditionSites(scene, foot, path.points);
  t.after(model.dispose);
  const towers = model.sites.filter(site => site.kind === 'stone-towers');
  const shelters = model.sites.filter(site => site.kind === 'shelter');
  const markers = model.sites.filter(site => site.kind === 'waymark');
  assert.equal(towers.length, 12);
  assert.equal(shelters.length, 2);
  assert.ok(markers.length > 35);
  assert.equal(model.sites.filter(site => site.kind === 'icefall').length, 1);
  assert.equal(model.sites.filter(site => site.kind === 'observatory').length, 1);
  assert.equal(model.sites.filter(site => site.kind === 'summit-flag').length, 1);
  assert.ok(model.pieceCount >= 1800, 'No token blockouts: real voxel detail count should dominate');
  assert.ok(model.drawBudget <= 9, 'Instanced artwork should cost <= 9 material draws');
  assert.ok(model.familyCounts.ice >= 380);
  assert.ok(model.familyCounts.rock >= 400);
  assert.ok(model.familyCounts.timber >= 100);
  assert.equal(model.group.parent, scene);
  assert.equal(model.lights.filter(lamp => lamp instanceof PointLight).length, 6);
  assert.ok(model.contact.length >= 8);
  assert.ok(model.group.children.filter(child => child instanceof InstancedMesh).length >= 8);
  for (const site of [...towers, ...shelters]) {
    assert.ok(Number.isFinite(site.height));
    assert.ok(Math.abs(foot(site.east, site.north)! - site.height) < 1e-5,
      'All mountain structures are anchored on real P-1 terrain');
    assert.ok(site.distanceToTrail >= 10);
  }
  for (const shelter of shelters) {
    const expected = shelter.height + .065;
    assert.equal(model.surfaceAt(shelter.east, shelter.north), expected);
    assert.equal(model.blocked(shelter.east, shelter.north, shelter.height, .27, 1.8), false,
      'An open shelter interior must remain walkable');
  }
  model.dispose();
  assert.equal(scene.children.length, 0);
});

test('R3: full P-3 centerline is not blocked by added shelter walls, and route surface remains authoritative', t => {
  const terrain = createMainSummitBlock(mainSummitLayout, 347, 100);
  t.after(terrain.dispose);
  const path = createMainSummitTrail(terrain.heightAt, 347);
  const model = mountMainSummitExpeditionSites(new Group(), terrain.heightAt, path.points);
  t.after(model.dispose);
  for (const [index, point] of path.points.entries()) {
    if (index % 9 !== 0) continue;
    assert.equal(model.blocked(point.east, point.north, point.height, .27, 1.8),
      false, 'Blocked at centerline index ' + index);
  }
  assert.equal(model.surfaceAt(Number.NaN, 1), undefined);
  assert.equal(model.surfaceAt(0, 0, -.1), undefined);
});
