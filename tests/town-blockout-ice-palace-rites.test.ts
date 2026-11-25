import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3, type Group } from 'three';
import { icePalaceBuildingOrigin } from '../src/presence/ice-throne-site';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit';
import { buildIceCastle } from '../tools/voxel-tavern/town-blockout/landmark-ice-castle';
import { createIcePalaceLandmarkActivity } from '../tools/voxel-tavern/town-blockout/ice-palace-landmark-activity';
import { icePalaceRites, type IcePalaceRiteState } from '../tools/voxel-tavern/town-blockout/landmark-ice-palace-rites';
import { icePalaceFragmentSite } from '../tools/voxel-tavern/town-blockout/landmark-ice-palace-wreckage';

test('ice palace rite footpoints connect to the original west entrance across supported and clear floors', () => {
  const palace = buildIceCastle();
  const { floors, colliders } = palace.userData as { floors: Box[]; colliders: Box[] };
  for (const { stand: [x, y, z] } of [...Object.values(icePalaceRites), icePalaceFragmentSite]) {
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

test('palace interactions follow the placed model and only reflect committed host state', async () => {
  const palace = buildIceCastle();
  const [originX, originN, originY] = icePalaceBuildingOrigin;
  palace.position.set(originX, originY, -originN);
  const notices: string[] = [];
  const pickupNotices: string[] = [];
  const context = { announce: (message: string) => notices.push(message), sit() {} };
  let state: IcePalaceRiteState = {
    frozen: false, leverAvailable: true, harvestAvailable: true, solsticeRite: 'closed',
  };
  let resolveLever: ((accepted: boolean) => void) | undefined;
  let acceptHarvest = false;
  const requested: string[] = [];
  const activity = createIcePalaceLandmarkActivity(palace, context, {
    notifyPickup: message => pickupNotices.push(message),
    rites: {
      read: () => state,
      request(rite) {
        requested.push(rite);
        if (rite === 'lever') return new Promise(resolve => { resolveLever = resolve; });
        if (rite === 'harvest') {
          if (acceptHarvest) state = { ...state, harvestAvailable: false };
          return Promise.resolve(acceptHarvest);
        }
        state = { ...state, solsticeRite: 'completed' };
        return Promise.resolve(true);
      },
    },
  });
  const get = (id: keyof typeof icePalaceRites) =>
    activity.spots.find(spot => spot.label === icePalaceRites[id].label)!;

  const lever = get('lever'), harvest = get('harvest'), solstice = get('solstice');
  assert.deepEqual([lever.x, lever.n, lever.ground], [471, 73.3, 12.12]);
  assert.equal(harvest.available?.(), true);
  assert.equal(solstice.available?.(), false);
  solstice.run();
  lever.run();
  lever.run();
  assert.deepEqual(requested, ['lever']);
  assert.equal(notices.length, 0);
  assert.equal(harvest.available?.(), false);
  state = { ...state, frozen: true };
  resolveLever!(true);
  await Promise.resolve();
  assert.equal(notices.at(-1), '镜湖坚冰开放');

  harvest.run();
  await Promise.resolve();
  assert.equal(notices.at(-1), '现在不能进行这项交互');
  assert.equal(pickupNotices.length, 0);

  acceptHarvest = true;
  harvest.run();
  await Promise.resolve();
  assert.equal(pickupNotices.at(-1), '冰晶片入包');
  assert.equal(notices.at(-1), '现在不能进行这项交互');
  assert.equal(harvest.available?.(), false);

  state = { ...state, solsticeRite: 'ready' };
  assert.equal(solstice.available?.(), true);
  solstice.run();
  await Promise.resolve();
  assert.equal(notices.at(-1), '安雪礼已完成');
  assert.equal(solstice.available?.(), false);
  assert.deepEqual(requested, ['lever', 'harvest', 'harvest', 'solstice']);
});

test('wreckage is mounted at the palace origin and the loose plate uses one aimed pickup through the bag', async () => {
  const palace = buildIceCastle();
  const [originX, originN, originY] = icePalaceBuildingOrigin;
  palace.position.set(originX, originY, -originN);
  const fragment = palace.userData.palaceFragment as Group;
  const notices: string[] = [];
  const fallback: string[] = [];
  const context = { announce: (message: string) => fallback.push(message), sit() {} };
  const withoutBag = createIcePalaceLandmarkActivity(palace, context);
  assert.ok(palace.getObjectByName('霜封残骸堆'));
  assert.equal(fragment.visible, true);
  assert.ok(!withoutBag.spots.some(spot => spot.label === icePalaceFragmentSite.label));

  let aimed = false;
  let present = true;
  let commitPickup: ((success: boolean) => void) | undefined;
  const pickupIds: string[] = [];
  const configured = createIcePalaceLandmarkActivity(palace, context, {
    notifyPickup: message => notices.push(message),
    fragmentPickup: {
      present: () => present,
      isTargeted(target) {
        assert.equal(target.object, fragment);
        return aimed;
      },
      pickUpOne(id) {
        pickupIds.push(id);
        return new Promise(resolve => { commitPickup = resolve; });
      },
    },
  });
  const spot = configured.spots.find(candidate => candidate.label === icePalaceFragmentSite.label)!;
  const modelPoint = fragment.getWorldPosition(new Vector3());
  assert.deepEqual([spot.x, spot.n, spot.ground], [484.35, 77.47, 12.12]);
  assert.deepEqual([modelPoint.x, -modelPoint.z, modelPoint.y], [484.35, 78.47, 12.12]);
  palace.updateMatrixWorld(true);
  const eye = new Vector3(spot.x, spot.ground + 1.65, -spot.n);
  const sight = modelPoint.clone();
  sight.y += .13;
  const ray = new Raycaster(eye, sight.sub(eye).normalize());
  assert.equal(ray.intersectObject(palace, true)[0]?.object.parent, fragment);
  assert.equal(spot.available?.(), false);
  spot.run();
  assert.equal(pickupIds.length, 0);
  aimed = true;
  assert.equal(spot.available?.(), true);
  spot.run();
  spot.run();
  assert.deepEqual(pickupIds, [icePalaceFragmentSite.id]);
  assert.equal(notices.length, 0);
  assert.equal(fragment.visible, true);

  commitPickup!(false);
  await Promise.resolve();
  assert.equal(notices.length, 0);
  assert.equal(fragment.visible, true);
  spot.run();
  present = false;
  commitPickup!(true);
  await Promise.resolve();
  assert.deepEqual(notices, ['船件碎片 ×1']);
  assert.equal(fragment.visible, false);
  assert.equal(spot.available?.(), false);
  assert.equal(fallback.length, 0);
});
