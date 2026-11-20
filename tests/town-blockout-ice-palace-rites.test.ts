import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3, type Group } from 'three';
import { icePalaceBuildingOrigin } from '../src/presence/ice-throne-site';
import { createIcePalaceLandmarkActivity } from '../tools/voxel-tavern/town-blockout/ice-palace-landmark-activity';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit';
import { buildIceCastle } from '../tools/voxel-tavern/town-blockout/landmark-ice-castle';
import { icePalaceRiteSites } from '../tools/voxel-tavern/town-blockout/landmark-ice-palace-rites';
import { icePalaceFragmentSite } from '../tools/voxel-tavern/town-blockout/landmark-ice-palace-wreckage';

test('ice palace fixture footpoints connect to the west entrance across supported and clear floors', () => {
  const palace = buildIceCastle();
  const { floors, colliders } = palace.userData as { floors: Box[]; colliders: Box[] };
  for (const { stand: [x, y, z] } of [...Object.values(icePalaceRiteSites), icePalaceFragmentSite]) {
    const clearAndSupported = (east: number, south: number) => {
      assert.ok(floors.some(({ min, max }) => east >= min[0] && east <= max[0] &&
        south >= min[2] && south <= max[2] && Math.abs(max[1] - y) < .05), `${east},${south}: no floor`);
      assert.ok(!colliders.some(({ min, max }) => y + .04 < max[1] && y + 1.72 > min[1] &&
        east + .23 > min[0] && east - .23 < max[0] &&
        south + .23 > min[2] && south - .23 < max[2]), `${east},${south}: obstructed`);
    };
    for (let east = -23; east <= x; east += .05) clearAndSupported(east, 0);
    for (let south = 0; Math.abs(south) < Math.abs(z); south += Math.sign(z) * .05) clearAndSupported(x, south);
    clearAndSupported(x, z);
  }
});

test('palace fixtures are visible geometry before the live authority enables interactions', () => {
  const palace = buildIceCastle();
  const [originX, originN, originY] = icePalaceBuildingOrigin;
  palace.position.set(originX, originY, -originN);
  for (const name of ['引寒机关', '采晶冰柱', '安雪礼仪式点', '霜封残骸堆']) {
    assert.ok(palace.getObjectByName(name)?.children.length, name);
  }

  const fragment = palace.userData.palaceFragment as Group;
  assert.equal(fragment.visible, true);
  const foot = palace.localToWorld(new Vector3(...icePalaceFragmentSite.stand));
  const modelPoint = fragment.getWorldPosition(new Vector3());
  assert.deepEqual([foot.x, -foot.z, foot.y], [484.35, 77.47, 12.12]);
  assert.deepEqual([modelPoint.x, -modelPoint.z, modelPoint.y], [484.35, 78.47, 12.12]);
  palace.updateMatrixWorld(true);
  const eye = foot.clone();
  eye.y += 1.65;
  const sight = modelPoint.clone();
  sight.y += .13;
  const ray = new Raycaster(eye, sight.sub(eye).normalize());
  assert.equal(ray.intersectObject(palace, true)[0]?.object.parent, fragment);

  const activity = createIcePalaceLandmarkActivity(palace, { announce() {}, sit() {} });
  for (const label of ['拨动引寒机关', '采集冰晶片', '行安雪礼', '拾取船件碎片']) {
    assert.ok(!activity.spots.some(spot => spot.label === label), label);
  }
});
