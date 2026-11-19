import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Scene } from 'three';
import { marketStalls } from '../tools/voxel-tavern/town-blockout/market-fair';
import { createMarketResidentStationLookup } from '../tools/voxel-tavern/town-blockout/market-resident-stations';
import { nearestTownActivity, type TownActivitySpot } from '../tools/voxel-tavern/town-blockout/town-activity';
import { createTownNpcActivity } from '../tools/voxel-tavern/town-blockout/town-npc';
import { marketResidentNames, registerTownResidentStations } from '../tools/voxel-tavern/town-blockout/town-npc-stations';

const boothIndices = [13, 15, 16];
const fairSpots: TownActivitySpot[] = marketStalls.map(stall => ({
  ...stall.spot, label: stall.kind, run() {},
}));

test('the three vendors wait for the exact booths and matching live interaction registrations', () => {
  let market: Group | undefined;
  const activities = [...fairSpots];
  let walkable = false;
  const stall = createMarketResidentStationLookup({
    market: () => market, fairSpots: activities,
    standableGround: (_east, _north, hint) => walkable ? hint : undefined,
  });

  assert.ok(marketResidentNames.every(name => stall(name) === undefined));
  market = new Group();
  market.userData.marketStallIds = ['market-stall-0', 'market-stall-10'];
  walkable = true;
  assert.ok(marketResidentNames.every(name => stall(name) === undefined));

  market.userData.marketStallIds = boothIndices.map(index => marketStalls[index].id);
  walkable = false;
  assert.ok(marketResidentNames.every(name => stall(name) === undefined));
  walkable = true;
  activities[13] = fairSpots[10];
  assert.equal(stall('贾明灯'), undefined);
  activities[13] = fairSpots[13];
  marketResidentNames.forEach((name, person) => {
    const index = boothIndices[person];
    const registered = stall(name);
    assert.ok(registered);
    assert.equal(registered.activity, fairSpots[index]);
    assert.equal(stall(name)?.station, registered.station);
    const { actor: [east, north], talk: [talkEast, talkNorth] } = registered.station;
    const { east: centerEast, north: centerNorth, spot } = marketStalls[index];
    assert.ok(Math.abs(Math.hypot(east - centerEast, north - centerNorth) - .25) < 1e-6);
    assert.ok(Math.abs(Math.hypot(talkEast - spot.x, talkNorth - spot.n) - 1.05) < 1e-6);
  });
});

test('vendor E prompts stay separate from the fair spots and use a registered vendor activity if present', () => {
  const market = new Group();
  market.userData.marketStallIds = marketStalls.map(({ id }) => id);
  const scene = new Scene();
  const npc = createTownNpcActivity({ scene, open: () => { throw Error('not needed'); }, announce() {}, face() {}, sit() {} },
    () => 10);
  const game = { ...fairSpots[16], label: '套圈' };
  const marketStall = createMarketResidentStationLookup({
    market: () => market, fairSpots,
    standableGround: (_east, _north, hint) => hint,
    vendorActivity: name => name === '胡六环' ? game : undefined,
  });
  const residentSpots = registerTownResidentStations(npc, {
    campfires: [], canStand: () => true, isNight: () => false,
    forestChop: () => undefined, mainFishing: () => undefined, marketStall,
  });
  assert.equal(scene.children.length, 1);
  assert.equal(marketStall('胡六环')?.activity, game);
  for (const [person, name] of marketResidentNames.entries()) {
    const vendor = residentSpots[person + 3];
    const activity = fairSpots[boothIndices[person]];
    const all = [...fairSpots, ...residentSpots];
    assert.equal(vendor.available?.(), true);
    assert.equal(vendor.label, `和${name}聊天`);
    assert.equal(nearestTownActivity(all, vendor.x, vendor.n, vendor.ground), vendor);
    assert.equal(nearestTownActivity(all, activity.x, activity.n, activity.ground), activity);
  }
  market.userData.marketStallIds = [];
  npc.update?.(0);
  assert.ok(residentSpots.every(spot => spot.available?.() === false));
});
