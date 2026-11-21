import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { surveyZa36RopeStay, mountZa36RopeStay } from '../tools/voxel-tavern/town-blockout/town-za36-rope-stay';
import { surveyZa31CraterWinch } from '../tools/voxel-tavern/town-blockout/town-za31-crater-winch';

test('ZA-36 stable rope point is a unique nonblocking prop beside accepted U-1 winch', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const stay = mountZa36RopeStay(road);
  assert.ok(stay);
  const { group, site } = stay;
  const incumbent = surveyZa31CraterWinch(road);
  assert.ok(incumbent);
  assert.equal(site.actionKey, 'hold-E');
  assert.deepEqual(site.intendedRate, { onePlayer: 1, twoPlayers: 1.8 });
  assert.equal(site.pendingAuthority, true, 'B window must explicitly wire authoritative hold state');
  assert.ok(Math.hypot(site.steady.east - incumbent.plinth.east,
    site.steady.north - incumbent.plinth.north) >= 2.25);
  assert.ok(Math.hypot(site.steady.east - incumbent.useFoot.east,
    site.steady.north - incumbent.useFoot.north) >= 2.2);
  assert.ok(Math.hypot(site.steady.east - incumbent.snakeStoneReservation.east,
    site.steady.north - incumbent.snakeStoneReservation.north) >
    incumbent.snakeStoneReservation.radius + site.radius + .4);
  assert.ok(Math.hypot(site.steady.east - road.anchor.east,
    site.steady.north - road.anchor.north) > 4.4, 'never fill the accepted shaft opening');
  assert.equal(site.steady.height, road.heightAt(site.steady.east, site.steady.north));
  assert.equal(group.name, 'za36-winch-rope-stay');
  assert.ok(group.children.some(node => node.name === 'za36-stay-working-rope'));
  assert.ok(group.children.some(node => node.name === 'za36-stay-working-rope-return'));
  assert.ok(group.children.some(node => node.name === 'za36-winch-to-shaft-rope'));
  assert.equal(group.userData.ropeTaut, false);
  const sagged = group.getObjectByName('za36-stay-working-rope');
  assert.ok(sagged);
  const before = sagged.position.y;
  stay.setTension(true);
  assert.equal(group.userData.ropeTaut, true);
  assert.ok(sagged.position.y > before, 'accepted hold must visibly lift the sagging midpoint');
  stay.setTension(false);
  assert.equal(group.userData.ropeTaut, false);
  assert.ok(Math.abs(sagged.position.y - before) < 1e-8, 'released hand restores the original sag');
  assert.deepEqual(site.intendedRate, { onePlayer: 1, twoPlayers: 1.8 }, 'visuals cannot change B-window rates');
  assert.ok(group.children.every(node => (node as {isMesh?:boolean}).isMesh));
  assert.equal(group.userData.steadyRopeAnchor.pendingAuthority, true);
  assert.ok(road.group.getObjectByName('za36-winch-rope-stay'),
    'default west-domain host includes the one rope stay');
  assert.deepEqual(surveyZa36RopeStay(road), site);
});
