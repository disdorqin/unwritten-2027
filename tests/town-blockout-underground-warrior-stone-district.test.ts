import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, NearestFilter } from 'three';
import { warriorSquarePlan } from '../tools/voxel-tavern/town-blockout/underground-warrior-square.js';
import { warriorForgeHallSite } from '../tools/voxel-tavern/town-blockout/underground-warrior-forge-hall.js';
import {
  mountWarriorStoneDistrict, warriorDistrictCanon, type WarriorDistrictFoot,
  type WarriorDistrictSite,
} from '../tools/voxel-tavern/town-blockout/underground-warrior-stone-district.js';

const surveyFixture: WarriorDistrictSite = {
  domainId: 'underground/warrior-city', east: -200, north: 360,
  height: -165, yaw: Math.PI / 7,
}; // Test-only: NOT the production -165m anchor.
type MountHost = Parameters<typeof mountWarriorStoneDistrict>[0];
function setup() {
  const parent = new Group();
  let siteAccepted = true;
  let acceptedFoot = true;
  let acceptedSolid = true;
  let allowed = true;
  let viewer: ReturnType<MountHost['readViewer']>;
  let budget = 3;
  const records: Array<{ playerId: string; role: string; locationId: string }> = [];
  const seen: WarriorDistrictFoot[] = [];
  const solids: Array<Readonly<{ name: string; min: readonly number[]; max: readonly number[] }>> = [];
  const host: MountHost = {
    parent, site: surveyFixture,
    supportsDistrict: () => siteAccepted,
    supportsFoot(foot) { seen.push(foot); return acceptedFoot; },
    acceptsSolidWorldBox(box) { solids.push(box); return acceptedSolid; },
    readViewer: () => viewer,
    canUse: () => allowed,
    dispatch(intent) { records.push(intent); },
    readLightBudget: () => budget,
  };
  return { host, parent, seen, solids, records,
    allow(v: boolean) { allowed = v; },
    acceptSite(v: boolean) { siteAccepted = v; },
    acceptFoot(v: boolean) { acceptedFoot = v; },
    acceptSolid(v: boolean) { acceptedSolid = v; },
    setViewer(v: typeof viewer) { viewer = v; },
    setBudget(v: number) { budget = v; },
  };
}
test('U-10 round 1 must fail closed on absent site or uncertified movement volume with no scene leaks', () => {
  const f = setup();
  assert.deepEqual(mountWarriorStoneDistrict({ ...f.host, site: undefined }), { kind: 'unregistered' });
  assert.deepEqual(mountWarriorStoneDistrict({ ...f.host, site: { ...surveyFixture, height: NaN } }),
    { kind: 'unsupported-site' });
  f.acceptSite(false);
  assert.deepEqual(mountWarriorStoneDistrict(f.host), { kind: 'unsupported-site' });
  f.acceptSite(true);
  f.acceptFoot(false);
  assert.deepEqual(mountWarriorStoneDistrict(f.host), { kind: 'unsupported-foot' });
  f.acceptFoot(true);
  f.acceptSolid(false);
  assert.deepEqual(mountWarriorStoneDistrict(f.host), { kind: 'unsupported-collider' });
  assert.equal(f.parent.children.length, 0);
});

test('U-10 round 1/2 creates 12 differentiated stone homes, exactly four single-entry shelters and readable blocked paths', () => {
  const f = setup();
  const mounted = mountWarriorStoneDistrict(f.host);
  assert.equal(mounted.kind, 'ready');
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(mounted.houses.length, warriorDistrictCanon.houseCount);
  assert.equal(mounted.houses.filter(home => home.accessible).length,
    warriorDistrictCanon.accessibleHomes);
  assert.equal(mounted.houses.filter(home => !home.accessible).length, 8);
  assert.deepEqual(new Set(mounted.houses.filter(h => !h.accessible).map(h => h.blockedBy)),
    new Set(['rubble', 'grille', 'fallen-slab']));
  assert.ok(mounted.houses.every(home => home.accessible
    ? home.workFeet.length === 2 && home.blockedBy === undefined
    : home.workFeet.length === 0 && home.blockedBy !== undefined));
  const doors = mounted.colliders.filter(collider => collider.name.endsWith('/door-wing'));
  assert.equal(doors.length, 24);
  assert.ok(mounted.colliders.some(collider => collider.name.includes('/stone-grille')));
  assert.ok(mounted.colliders.some(collider => collider.name.includes('/fallen-slab')));
  assert.ok(mounted.colliders.some(collider => collider.name.includes('/rubble')));
  assert.ok(!mounted.colliders.some(collider => collider.name.includes('/back-exit') ||
    collider.name.includes('/second-door')), 'never create extra home exits');
  assert.equal(mounted.feet.filter(foot => foot.role === 'search-room').length, 4);
  assert.equal(mounted.feet.filter(foot => foot.role === 'take-cover').length, 4);
  mounted.dispose();
});

test('U-10 round 2 marketplace creates real stone-column looping path and exactly zero text signs or menu loot', () => {
  const f = setup();
  const mounted = mountWarriorStoneDistrict(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(warriorDistrictCanon.marketStallCount, 7);
  assert.equal(warriorDistrictCanon.arcadeSignCount, 0);
  const columns = mounted.colliders.filter(item => item.name.startsWith('arcade/column'));
  const stands = mounted.colliders.filter(item => item.name.startsWith('arcade/stand'));
  assert.equal(columns.length, 14);
  assert.equal(stands.length, 7);
  assert.equal(mounted.sampledRoute.filter(item => item.name.startsWith('arcade/aisle')).length, 7);
  assert.equal(mounted.sampledRoute.filter(item => item.name.startsWith('arcade/columns')).length, 7);
  assert.ok(!mounted.group.children.some(item => /sign|label|text|font/i.test(item.name)),
    'ancient market is communicated by pots and counter silhouettes, never written price banners');
  assert.ok(mounted.story.arcade.includes('无字'));
  mounted.dispose();
});

test('U-10 round 3 has a continuous 90m walkable battlement, 26 small steps and physical blocked-end rubble', () => {
  const f = setup();
  const mounted = mountWarriorStoneDistrict(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(warriorDistrictCanon.wallWalkLength, 90);
  assert.ok(warriorDistrictCanon.wallWalkWidth >= 3.6);
  const stairs = mounted.sampledRoute.filter(item => item.name.startsWith('citywall/stair-foot-'));
  assert.equal(stairs.length, 26);
  assert.ok(stairs.every((foot, i) => i === 0 ||
    foot.foot[1] - stairs[i - 1].foot[1] < .30),
    'no half-meter impassable steps');
  const top = mounted.sampledRoute.filter(item => item.name.startsWith('citywall/top-foot-'));
  assert.ok(top.length >= 40);
  assert.ok(top.every(point => point.foot[1] >= 7.05));
  assert.ok(mounted.colliders.filter(item => item.name.startsWith('citywall/broken-end')).length >= 12,
    'ends have actual rubble, not invisible barriers');
  assert.ok(mounted.sampledRoute.every(item => mounted.isClearLocal(item.foot)),
    'all stair and wall walking positions clear the same physical props registered to the host');
  assert.ok(mounted.feet.every(item => mounted.isClearLocal(item.foot)));
  assert.ok(f.seen.length >= 75, 'every stair and battlement segment has accepted real support feet');
  assert.ok(f.solids.length >= 300, 'host sees the full building and wall collision volumes');
  mounted.dispose();
});

test('U-10 the certified local ENY transform drives both site props and colliders, no world-frame double transform', () => {
  const f = setup();
  const mounted = mountWarriorStoneDistrict(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(f.parent.children.length, 1);
  assert.deepEqual(mounted.group.position.toArray(),
    [surveyFixture.east, surveyFixture.height, -surveyFixture.north]);
  assert.equal(mounted.group.rotation.y, surveyFixture.yaw);
  const at = mounted.toWorld([0, 0, 0]);
  assert.deepEqual(at, { east: surveyFixture.east, north: surveyFixture.north, height: surveyFixture.height });
  const p = mounted.toWorld([5, 7, 2]);
  assert.ok(Number.isFinite(p.east + p.north + p.height));
  assert.notEqual(p.east, surveyFixture.east + 5, 'rotation must apply to the same world and visible pieces');
  assert.ok(mounted.colliders.every(item => item.min.length === 3 && item.max.length === 3 &&
    item.min.every((v,i) => Number.isFinite(v) && v < item.max[i])));
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('U-10 moonstone lamps are real cold physical fixtures under the host lighting budget', () => {
  const f = setup();
  const mounted = mountWarriorStoneDistrict(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(mounted.lamps.length, 6);
  assert.equal(mounted.lamps.filter(light => light.visible).length, 3);
  assert.ok(mounted.lamps.every(light => light.name === 'u10-certified-moonstone-lamp'));
  assert.equal(mounted.colliders.filter(item => item.name === 'u10/moonstone-street-lamp').length, 6);
  f.setBudget(0);
  mounted.sync();
  assert.equal(mounted.lamps.filter(light => light.visible).length, 0);
  f.setBudget(9);
  mounted.sync();
  assert.equal(mounted.lamps.filter(light => light.visible).length, 6);
  mounted.dispose();
});

test('U-10 room line and bazaar do not engulf the pre-existing statue square or north forge site', () => {
  const f = setup();
  const mounted = mountWarriorStoneDistrict({ ...f.host,
    site: { domainId: 'warrior/local', east: 0, north: 0, height: -165, yaw: 0 },
  });
  if (mounted.kind !== 'ready') assert.fail();
  const statue = warriorSquarePlan.statue;
  const square = { minE: statue.east - 20, maxE: statue.east + 20,
    minN: statue.north - 20, maxN: statue.north + 20 };
  const encroaches = (box: (typeof mounted.colliders)[number], area: typeof square) => {
    const minE = box.min[0], maxE = box.max[0];
    const minN = -box.max[2], maxN = -box.min[2];
    return maxE > area.minE && minE < area.maxE && maxN > area.minN && minN < area.maxN;
  };
  assert.equal(mounted.colliders.filter(box => encroaches(box, square)).length, 0,
    'real 40m centre square must stay clear for existing statue and cold-fire assembly');
  const forge = { minE: warriorForgeHallSite.east - 5.2,
    maxE: warriorForgeHallSite.east + 5.2,
    minN: warriorForgeHallSite.north -.4,
    maxN: warriorForgeHallSite.north + 10 };
  assert.equal(mounted.colliders.filter(box => encroaches(box, forge)).length, 0,
    'do not cover the only warm forge and its existing U-16 approach');
  mounted.dispose();
});

test('U-10 round 4 returns host-only search, single-door cover, arcade tactics and upper-wall lookout', () => {
  const f = setup();
  const mounted = mountWarriorStoneDistrict(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(mounted.getPrompts().length, 0);
  assert.equal(mounted.press('search-room', mounted.houses[1].id), false);
  const sample = mounted.feet.find(item => item.role === 'search-room');
  assert.ok(sample);
  f.setViewer({ playerId: 'miner', domainId: surveyFixture.domainId, foot: sample.world });
  assert.equal(mounted.getPrompts('search-room')[0]?.id, sample.id);
  assert.equal(mounted.press('search-room', sample.id), true);
  assert.deepEqual(f.records[0], { playerId: 'miner', role: 'search-room', locationId: sample.id });
  assert.equal(mounted.press('lookout', 'u10/wall-lookout'), false);
  f.allow(false);
  assert.equal(mounted.press('search-room', sample.id), false);
  f.allow(true);
  f.setViewer({ playerId: 'miner', domainId: 'town', foot: sample.world });
  assert.equal(mounted.getPrompts('search-room').length, 0);
  const lookout = mounted.feet.find(item => item.role === 'lookout');
  assert.ok(lookout);
  f.setViewer({ playerId: 'miner', domainId: surveyFixture.domainId, foot: lookout.world });
  assert.equal(mounted.getPrompts('lookout')[0]?.id, lookout.id);
  assert.equal(mounted.press('lookout', lookout.id), true);
  assert.equal(mounted.story.wall.includes('黑暗'), true);
  mounted.dispose();
  assert.equal(mounted.press('lookout', lookout.id), false);
});

test('U-10 all clay stone families render as batched 16px nearest-neighbor swatches and dispose once', () => {
  const f = setup();
  const mounted = mountWarriorStoneDistrict(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  assert.ok(mounted.batches >= 6);
  assert.ok(mounted.voxelCount >= 1800, 'dense homes, arcade and 90m wall are not placeholder boxes');
  const batches = mounted.group.children.filter(item => 'isInstancedMesh' in item &&
    item.isInstancedMesh === true);
  assert.equal(batches.length, mounted.batches);
  for (const batch of batches) {
    assert.ok('material' in batch);
    const material = batch.material as { map?: { image?: { width?: number; height?: number };
      minFilter?: number; magFilter?: number } };
    const tex = material.map;
    assert.equal(tex?.image?.width, 16);
    assert.equal(tex?.image?.height, 16);
    assert.equal(tex?.minFilter, NearestFilter);
    assert.equal(tex?.magFilter, NearestFilter);
  }
  mounted.dispose();
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
  assert.equal(mounted.group.children.length, 0);
});
