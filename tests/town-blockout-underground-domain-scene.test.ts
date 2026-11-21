import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, PointLight, Vector3 } from 'three';
import { resolveUndergroundShaftRegistration } from '../src/presence/underground-shaft-registration.js';
import { createUndergroundMineLayout, type UndergroundMineSpec } from '../tools/voxel-tavern/town-blockout/underground-mine-layout.js';
import { mountUndergroundMineDomain } from '../tools/voxel-tavern/town-blockout/underground-domain-scene.js';
import { resolveUndergroundCampPickaxeSite, undergroundCampPickaxe } from '../src/shared/underground-camp-pickaxe.js';

const spec: UndergroundMineSpec = {
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8,
  gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right', extension: 5, openBackForExpansion: true, crystalGate: true },
  walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
};
function fixture() {
  const parent = new Group();
  const mine = createUndergroundMineLayout(spec);
  const pool = { domainId: 'underground/mine', east: -119, north: 189, height: -90 };
  const registration = resolveUndergroundShaftRegistration({
    crater: { domainId: 'west', fixtureRim: { east: 0, north: 0, height: 0, yaw: 0 },
      liveRim: { east: -120, north: 185, rimHeight: 10.7773, yaw: 0 } },
    fixtureShaftFoot: { east: 0, north: 0, height: -35, yaw: 0 },
    liveWinchFoot: { domainId: 'west', east: -121.08, north: 181.73, height: -24.2227,
      horizontalReach: .7, verticalReach: .3 },
    mineLanding: pool, depthLine: -73,
  }, { supportsFoot: () => true, acceptsShaftHandoff: () => true });
  assert.equal(registration.kind, 'ready');
  let acceptance = true;
  let checks = 0;
  let readLights = 0;
  let lightCount = 0;
  const host: Parameters<typeof mountUndergroundMineDomain>[0] = {
    parent, registration, mine, camp: spec.camp, walker: spec.walker, mineYaw: Math.PI / 6,
    acceptsMineGeometry(placement) {
      checks++;
      return acceptance && placement.domainId === pool.domainId &&
        placement.landing.height === -90 && placement.localPool[1] === -90;
    },
    readLights() {
      readLights++;
      return { litNicheIds: new Set(), extraCampLightCount: lightCount, remainingBudget: 3 };
    },
  };
  return {
    host, parent, mine, pool,
    setAcceptance(value: boolean) { acceptance = value; },
    setLightCount(value: number) { lightCount = value; },
    get checks() { return checks; },
    get reads() { return readLights; },
  };
}

test('an unregistered B-01 shaft or absent host geometry cannot mount or update a cave', () => {
  const f = fixture();
  const unregistered = mountUndergroundMineDomain({ ...f.host, registration: { kind: 'unregistered' } });
  assert.deepEqual(unregistered, { kind: 'unregistered' });
  assert.equal(f.checks, 0);
  assert.equal(f.reads, 0);
  assert.equal(f.parent.children.length, 0);
  for (const overrides of [
    { mineYaw: undefined }, { mineYaw: NaN }, { acceptsMineGeometry: undefined },
    { mine: undefined }, { camp: undefined }, { walker: undefined },
  ]) {
    assert.deepEqual(mountUndergroundMineDomain({ ...f.host, ...overrides }), { kind: 'unregistered' });
  }
  f.setAcceptance(false);
  assert.deepEqual(mountUndergroundMineDomain(f.host), { kind: 'unsupported-mine' });
  assert.equal(f.parent.children.length, 0);
  assert.equal(f.reads, 0);
});

test('certified mine foot anchors rock, rail, water, filled camp and live lamps to one ENY transform', () => {
  const f = fixture();
  const mounted = mountUndergroundMineDomain(f.host);
  assert.equal(mounted.kind, 'ready');
  if (mounted.kind !== 'ready') assert.fail('expected a registered mine');
  assert.equal(f.checks, 1);
  assert.equal(f.parent.children.length, 1);
  assert.equal(mounted.group.parent, f.parent);
  assert.equal(mounted.group.children.filter(child => 'isMesh' in child && child.isMesh === true).length, 3);
  for (const name of ['rock', 'rail', 'water']) {
    const mesh = mounted.group.getObjectByName('underground-mine-' + name);
    assert.ok(mesh && 'isMesh' in mesh && mesh.isMesh === true, name);
    assert.ok((mesh as any).geometry.attributes.position.count > 0);
  }
  const camp = mounted.group.children.find(child => child.name.includes('camp'));
  assert.ok(camp, 'camp is not a placeholder box');
  assert.ok(camp.children.length > 0);
  assert.deepEqual(mounted.poolWorld, { east: f.pool.east, north: f.pool.north, height: f.pool.height });
  const at = mounted.toWorld(f.mine.anchors.poolLanding);
  assert.ok(at);
  for (const key of ['east', 'north', 'height'] as const)
    assert.ok(Math.abs(at[key] - f.pool[key]) < 1e-7);
  assert.equal(f.reads, 0, 'no light is added without live receipts');
  mounted.sync();
  assert.equal(f.reads, 1);
  const lamps: PointLight[] = [];
  mounted.group.traverse(object => {
    if ('isPointLight' in object && object.isPointLight === true) lamps.push(object as PointLight);
  });
  assert.ok(lamps.length > 0);
  assert.ok(lamps.every(light => light.visible === false));
  f.setLightCount(3);
  mounted.sync();
  assert.ok(lamps.some(light => light.visible));
  mounted.dispose();
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
  assert.equal(mounted.toWorld(f.mine.anchors.poolLanding), undefined);
});

test('wrong mine domain, wrong surveyed depth and invalid geometry never register as playable space', () => {
  const f = fixture();
  const good = f.host.registration;
  assert.equal(good.kind, 'ready');
  if (good.kind !== 'ready') assert.fail();
  const wrongDomain = { ...good, connection: { ...good.connection,
    firstFallLanding: { ...good.connection.firstFallLanding, domainId: good.connection.shaftFoot.domainId } } };
  assert.deepEqual(mountUndergroundMineDomain({ ...f.host, registration: wrongDomain }), { kind: 'invalid-landing' });
  const wrongDepth = { ...good, connection: { ...good.connection,
    firstFallLanding: { ...good.connection.firstFallLanding, height: -88 } } };
  assert.deepEqual(mountUndergroundMineDomain({ ...f.host, registration: wrongDepth }), { kind: 'invalid-landing' });
  const bogusPool = createUndergroundMineLayout(spec);
  bogusPool.mesh.rock[0] = NaN;
  assert.throws(() => mountUndergroundMineDomain({ ...f.host, mine: bogusPool }), /validated rock/);
  assert.equal(f.parent.children.length, 0);
});

test('the mounted U-15 iron gate uses only this mine shell and the accepted stage', () => {
  const f = fixture();
  let stage: 'closed' | 'ajar' | 'open' | undefined;
  const mounted = mountUndergroundMineDomain({ ...f.host, readGateStage: () => stage });
  assert.equal(mounted.kind, 'ready');
  if (mounted.kind !== 'ready') assert.fail('expected mine domain');
  const gate = mounted.group.getObjectByName('mine-crystal-gate');
  const leaf = mounted.group.getObjectByName('mine-crystal-gate-leaf');
  assert.ok(gate && leaf && f.mine.expansion?.gate);
  assert.deepEqual(gate.position.toArray(), f.mine.expansion.gate.position);
  assert.equal(leaf.visible, true, 'missing authority snapshot is closed, never open');
  mounted.sync();
  assert.equal(leaf.visible, true);
  const heightBefore = leaf.scale.y;
  stage = 'ajar';
  mounted.sync();
  assert.ok(leaf.scale.y < heightBefore && leaf.scale.y > 0, 'ajar gap comes from same collision shell');
  stage = 'open';
  mounted.sync();
  assert.equal(leaf.visible, false);
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('the U-2 camp in the certified mine denies absent footing and permits real receipt-backed pickaxe actions', async () => {
  const f = fixture();
  let foot: readonly [number, number, number] | undefined;
  let aimed = false;
  let claimed = 0;
  let notices = 0;
  const mounted = mountUndergroundMineDomain({ ...f.host, campRuntime: {
    actions: {
      promptRange: 1.15, restAfterMs: 2500, now: () => 10,
      readFooting: () => foot, sit: () => true, stand: () => true,
      setSeatedAmbience: () => undefined, lookAtBowl: () => true,
      recordRelic: () => 'recorded' as const,
    },
    pickaxe: {
      available: () => true, aimedAt: () => aimed,
      async claim() { claimed++; return 'granted' as const; },
      showPickupNotice() { notices++; },
    },
  } });
  assert.equal(mounted.kind, 'ready');
  if (mounted.kind !== 'ready') assert.fail();
  const site = resolveUndergroundCampPickaxeSite(f.mine, spec.camp);
  assert.ok(site);
  assert.equal(mounted.campPrompt(), undefined);
  assert.equal(await mounted.pressCamp(undergroundCampPickaxe.siteId), 'unavailable');
  foot = site.approach;
  mounted.sync();
  assert.equal(mounted.campPrompt(), undefined);
  aimed = true;
  assert.equal(mounted.campPrompt()?.id, undergroundCampPickaxe.siteId);
  assert.equal(await mounted.pressCamp(undergroundCampPickaxe.siteId), 'granted');
  assert.equal(claimed, 1);
  assert.equal(notices, 1);
  assert.equal(mounted.campPrompt()?.id, undefined);
  assert.equal(await mounted.pressCamp(undergroundCampPickaxe.siteId), 'unavailable');
  foot = mounted.camp?.rooms[0].approach;
  assert.ok(foot);
  assert.equal(mounted.campPrompt()?.kind, 'bed');
  assert.equal(await mounted.pressCamp(mounted.campPrompt()?.id ?? ''), 'sat');
  foot = undefined;
  mounted.sync();
  assert.equal(mounted.campPrompt(), undefined);
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('U-8 ore veins require registered wall support and stay hidden without accepted mineral snapshots', () => {
  const f = fixture();
  const id = 'mine/registered-stardust';
  const target = {
    id, kind: 'ore' as const, mineral: 'stardust',
    at: { layer: f.pool.domainId, east: f.pool.east + 2, north: f.pool.north + 4, height: -90 },
    surface: 'rock' as const, strikes: 4, hits: 0, open: false,
  };
  const site = { target, normal: { east: 1, north: 0, height: 0 } };
  let allowed = true;
  let targets: typeof target[] = [];
  const runtime = {
    sites: [site],
    supportsFace: () => allowed,
    readTargets: () => targets,
  };
  allowed = false;
  assert.deepEqual(mountUndergroundMineDomain({ ...f.host, oreRuntime: runtime }),
    { kind: 'unsupported-ores' });
  assert.equal(f.parent.children.length, 0);
  allowed = true;
  const mounted = mountUndergroundMineDomain({ ...f.host, oreRuntime: runtime });
  assert.equal(mounted.kind, 'ready');
  if (mounted.kind !== 'ready') assert.fail();
  const ore = mounted.group.getObjectByName('ore-vein:' + id);
  assert.ok(ore);
  assert.equal(ore.visible, false);
  mounted.sync();
  assert.equal(ore.visible, false);
  targets = [target];
  mounted.sync();
  assert.equal(ore.visible, true);
  assert.equal(ore.children[0].visible, true);
  targets = [{ ...target, hits: 2 }];
  mounted.sync();
  assert.equal(ore.children[1].visible, true);
  targets = [{ ...target, open: true, hits: 4 }];
  mounted.sync();
  assert.equal(ore.children[0].visible, false);
  assert.equal(ore.children[2].visible, true);
  targets = [{ ...target, at: { ...target.at, layer: 'town' } }];
  mounted.sync();
  assert.equal(ore.visible, false);
  targets = [{ ...target, mineral: 'ordinary-ore' }];
  mounted.sync();
  assert.equal(ore.visible, false);
  targets = [target];
  mounted.sync();
  assert.equal(ore.visible, true);
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('U-8 rejects duplicate sites, malformed normals and arbitrary unseen mineral surfaces', () => {
  const f = fixture();
  const target = {
    id: 'ores/mine', kind: 'ore' as const, mineral: 'ordinary-ore', surface: 'rock' as const,
    at: { layer: f.pool.domainId, east: -119, north: 180, height: -90 },
    strikes: 3, hits: 0, open: false,
  };
  const site = { target, normal: { east: 1, north: 0, height: 0 } };
  for (const sites of [
    [site, site],
    [{ ...site, normal: { east: 0, north: 0, height: 0 } }],
    [{ ...site, target: { ...target, at: { ...target.at, layer: 'town' } } }],
    [{ ...site, target: { ...target, id: '' } }],
    [{ ...site, normal: { east: Infinity, north: 0, height: 0 } }],
  ]) {
    assert.deepEqual(mountUndergroundMineDomain({ ...f.host, oreRuntime: {
      sites, supportsFace: () => true, readTargets: () => [],
    } }), { kind: 'unsupported-ores' });
    assert.equal(f.parent.children.length, 0);
  }
});

test('U-13 mine fire rings use only confirmed host fires and brighten only for accepted same-layer contact', () => {
  const f = fixture();
  const site = {
    fire: {
      id: 'fire/safe-mine', point: { layer: f.pool.domainId, east: f.pool.east + 2,
        north: f.pool.north + 4, height: -90 },
      healPerSecond: 6, recovery: true,
    }, radius: 2.5, tone: 'warm' as const,
  };
  let supported = false;
  let contact: { fireId: string; layer: string } | undefined;
  const runtime = {
    sites: [site],
    supportsFire: () => supported,
    readConfirmedContact: () => contact,
  };
  assert.deepEqual(mountUndergroundMineDomain({ ...f.host, recoveryRuntime: runtime }),
    { kind: 'unsupported-fires' });
  supported = true;
  const mounted = mountUndergroundMineDomain({ ...f.host, recoveryRuntime: runtime });
  assert.equal(mounted.kind, 'ready');
  if (mounted.kind !== 'ready') assert.fail();
  const ring = mounted.group.getObjectByName('recovery-fire/fire/safe-mine');
  assert.ok(ring && 'isMesh' in ring && ring.isMesh === true);
  const mesh = ring as typeof ring & { material: { opacity: number } };
  mounted.sync();
  assert.equal(mesh.material.opacity, .2);
  contact = { fireId: site.fire.id, layer: 'town' };
  mounted.sync();
  assert.equal(mesh.material.opacity, .2);
  contact = { fireId: 'other', layer: f.pool.domainId };
  mounted.sync();
  assert.equal(mesh.material.opacity, .2);
  contact = { fireId: site.fire.id, layer: f.pool.domainId };
  mounted.sync();
  assert.equal(mesh.material.opacity, .8);
  mounted.group.updateWorldMatrix(true, true);
  const actual = ring.getWorldPosition(new Vector3());
  assert.ok(Math.abs(actual.x - site.fire.point.east) < .00001);
  assert.ok(Math.abs(actual.z + site.fire.point.north) < .00001);
  assert.ok(Math.abs(actual.y - site.fire.point.height - .02) < .00001);
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('U-13 refuses recovery rings across domains, zero radii and unconfirmed physical fires', () => {
  const f = fixture();
  const site = { fire: { id: 'one', point: { layer: f.pool.domainId,
    east: -119, north: 189, height: -90 }, healPerSecond: 5 },
    radius: 2, tone: 'warm' as const };
  for (const candidate of [
    { ...site, fire: { ...site.fire, point: { ...site.fire.point, layer: 'town' } } },
    { ...site, radius: 0 },
    { ...site, fire: { ...site.fire, healPerSecond: -1 } },
    { ...site, fire: { ...site.fire, point: { ...site.fire.point, east: Infinity } } },
  ]) {
    assert.deepEqual(mountUndergroundMineDomain({ ...f.host, recoveryRuntime: {
      sites: [candidate], supportsFire: () => true, readConfirmedContact: () => undefined,
    } }), { kind: 'unsupported-fires' });
  }
  assert.equal(f.parent.children.length, 0);
});

test('world transform and collision registration remain host-owned and cannot be inferred from a fixture', () => {
  const f = fixture();
  const straight = mountUndergroundMineDomain({ ...f.host, mineYaw: 0 });
  assert.equal(straight.kind, 'ready');
  if (straight.kind !== 'ready') assert.fail();
  const local: [number, number, number] = [2, -91, 12];
  assert.deepEqual(straight.toWorld(local), {
    east: f.pool.east + 2, north: f.pool.north - (12 - f.mine.anchors.poolLanding[2]),
    height: -91,
  });
  assert.equal(straight.toWorld([Infinity, -90, 0]), undefined);
  straight.dispose();
});
