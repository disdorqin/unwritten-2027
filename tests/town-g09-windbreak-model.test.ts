import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import {
  buildTownWindbreakCourt, windbreakEntranceClear, windbreakModelAudit, windbreakVoxelStep,
} from '../tools/voxel-tavern/town-blockout/town-g09-windbreak-model';

test('R1/R2 windbreak court is a complete independently batched scene, not a single facade', () => {
  const audit = windbreakModelAudit();
  assert.ok(audit.total > 350, 'main hall/roof/interior/warning board/hearth should carry real geometry');
  const required = [
    'hall-stone-footing', 'hall-timber-floor', 'hall-post', 'hall-back-wall',
    'amber-back-window', 'window-vertical-mullion', 'window-horizontal-mullion',
    'hall-side-bays', 'hall-front-lintel', 'tiled-roof-course',
    'snowy-roof-tiles', 'ridge-beam', 'ridge-snowcap',
    'rest-table-top', 'rest-bench-seat', 'stacked-logs', 'warm-ceremony-lamp',
    'weather-board-pillars', 'weather-board-panel', 'weather-board-screen',
    'wind-vane-shaft', 'weather-roof-snow', 'hearth-stone-ring',
    'hearth-roof-snow', 'new-year-lantern', 'lantern-tassel', 'roadside-drift',
  ];
  for (const tag of required) assert.ok(audit.tags[tag] > 0, 'missing modeled part: ' + tag);
  const obj = buildTownWindbreakCourt();
  assert.equal(obj.blocks, audit.total);
  assert.equal(obj.group.children.length, obj.drawBatches);
  assert.ok(obj.drawBatches <= 16, 'fine voxel details must be batched by palette');
  assert.ok(obj.group.children.every(child => child instanceof InstancedMesh));
  assert.equal(obj.interactions.length, 4);
  assert.ok(obj.solids.length > 100);
  obj.dispose();
});

test('R3 every model block and primitive scale is snapped to 1/16 metres', () => {
  assert.equal(windbreakVoxelStep, 1/16);
  const model = buildTownWindbreakCourt();
  const mat = new Matrix4(), q = new Quaternion(), position = new Vector3(), scale = new Vector3();
  for (const child of model.group.children) {
    const instanced = child as InstancedMesh;
    for (let k = 0; k < instanced.count; k++) {
      instanced.getMatrixAt(k, mat);
      mat.decompose(position, q, scale);
      for (const coordinate of [position.x, position.y, position.z, scale.x, scale.y, scale.z]) {
        assert.ok(Math.abs(coordinate / windbreakVoxelStep -
          Math.round(coordinate / windbreakVoxelStep)) < 1e-7,
        'off-grid voxel coordinate = ' + coordinate);
      }
      assert.ok(Math.min(scale.x, scale.y, scale.z) >= windbreakVoxelStep);
    }
  }
  model.dispose();
});

test('R3 windbreak hall entry retains at least 2.5m width and 3m headroom', () => {
  assert.equal(windbreakEntranceClear(), true);
  assert.equal(windbreakEntranceClear(2.5, 3), true);
  const model = buildTownWindbreakCourt();
  assert.ok(model.solids.some(solid => solid.tag === 'hall-back-wall'));
  assert.ok(model.solids.some(solid => solid.tag === 'hall-post'));
  assert.ok(model.solids.every(solid => solid.size.every(n => n > 0)));
  model.dispose();
});

test('R6 anchor data is physically grounded but not falsely represented as installed gameplay', () => {
  const model = buildTownWindbreakCourt();
  const ids = model.interactions.map(item => item.id);
  assert.deepEqual(ids, [
    'windbreak-rest', 'windbreak-warmth', 'windbreak-weather-board', 'windbreak-photo',
  ]);
  assert.equal(model.interactions.find(item => item.kind === 'warmth')?.reach, 3);
  assert.ok(model.interactions.every(item => item.reach >= 1.5));
  model.dispose();
});

test('one court can be independently mounted and unmounted without touching other scenes', () => {
  const scene = new Group();
  const first = buildTownWindbreakCourt({east:222,north:185,ground:12,yaw:Math.PI/2});
  const second = buildTownWindbreakCourt({east:343,north:75,ground:6});
  scene.add(first.group,second.group);
  assert.equal(first.group.position.x,222);
  assert.equal(first.group.position.z,-185);
  assert.equal(second.group.position.x,343);
  assert.equal(second.group.position.z,-75);
  assert.equal(scene.children.length,2);
  first.dispose();
  assert.equal(scene.children.length,1);
  assert.equal(scene.children[0],second.group);
  second.dispose();
  assert.equal(scene.children.length,0);
});
