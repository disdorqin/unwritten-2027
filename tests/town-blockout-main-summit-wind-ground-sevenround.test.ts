import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, InstancedMesh, Mesh, PointLight } from 'three';
import { summitGustFactorAt } from '../tools/voxel-tavern/town-blockout/town-summit-gust';
import { createMainSummitWindGround, summitWindGroundCopy } from '../tools/voxel-tavern/town-blockout/main-summit-wind-ground';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { mountMainSummitExtras } from '../tools/voxel-tavern/town-blockout/main-summit-extras';

const site = { east: 62.5, north: 975, height: 800 } as const;
const approved = {
  weather: 'wind', startedAt: 1_000_000, nextChangeAt: 4_000_000,
  windEast: .6, windNorth: .8, windStrength: .78,
} as const;
function fixture(context: { after(dispose: () => void): void }) {
  const owner = new Group();
  const model = createMainSummitWindGround(site);
  owner.add(model.group);
  context.after(() => model.dispose());
  return { model, owner };
}

test('R1/R2: ref-m64 physically finished 18×12m gauge pad, hollow cloth tube and four copper turbine crowns', context => {
  const { model, owner } = fixture(context);
  assert.equal(model.group.parent, owner);
  assert.equal(model.group.name, 'main-summit-wind-ground');
  assert.deepEqual(model.stationSize, { eastMetres: 18, northMetres: 12 });
  assert.ok(model.pieceCount > 800, 'Ref-m64 must have actual stone tiling and distinct machinery');
  assert.ok(model.drawBudget <= 26, 'Weather scene with separate real flags/sock must remain under 26 draws');
  assert.equal(model.lights.length, 2);
  assert.ok(model.lights.every(light => light instanceof PointLight && light.intensity > 0));
  assert.equal(model.group.getObjectByName('windsock-layered-original-cloth') instanceof InstancedMesh, true);
  assert.equal((model.group.getObjectByName('windsock-layered-original-cloth') as InstancedMesh).count, 120);
  assert.equal(model.group.getObjectByName('weather-synchronous-brass-vanes') instanceof InstancedMesh, true);
  assert.equal((model.group.getObjectByName('weather-synchronous-brass-vanes') as InstancedMesh).count, 72);
  assert.ok(model.group.getObjectByName('wind-sock-frame') instanceof Mesh);
  assert.ok(model.group.getObjectByName('wind-measure-flag-pole') instanceof Mesh);
  for (let i = 0; i < 5; i++) assert.ok(model.group.getObjectByName('wind-measure-flag-' + i) instanceof Mesh);
  assert.ok(model.group.getObjectByName('compass-burnished-moving-needle') instanceof Mesh);
  assert.ok(model.group.getObjectByName('summit-wind-ground-finished-sign') instanceof Mesh);
  assert.ok(summitWindGroundCopy.ledger.includes('布筒'));
  assert.equal(model.hasTextTexture, false, 'Headless Node lacks canvas; native browser must check actual glyph texture');
});

test('R3: no blocked 3.5m arrival lane, but tower mast and corner fencing have real colliders', context => {
  const { model } = fixture(context);
  assert.equal(model.surfaceAt(site.east, site.north), 800.03);
  assert.equal(model.surfaceAt(site.east + 20, site.north), undefined);
  assert.equal(model.blocked(site.east, site.north, 800.03, .27, 1.75), false);
  assert.equal(model.blocked(site.east - 5.23, site.north + 2.56, 800.03, .27, 1.75), true,
    'The windsock mast must have a physical collision core');
  assert.equal(model.blocked(site.east - 5.23, site.north + 2.56, 809, .27, 1.75), false);
  assert.equal(model.blocked(site.east + 30, site.north, 800, .27, 1.75), false);
  assert.equal(model.surfaceAt(Number.NaN, site.north), undefined);
});

test('R3: actual P-1 drop needs stone support piers, unlike the unsupported older standing pole', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(block.dispose);
  const windGround = createMainSummitWindGround(site, block.heightAt);
  context.after(windGround.dispose);
  assert.ok(windGround.supportCount >= 8,
    'Southern terrace falls below the 800m plateau and needs genuine masonry piers');
  assert.ok(windGround.pieceCount > 800);
  assert.equal(windGround.surfaceAt(site.east, site.north), site.height + .03);
  assert.equal(block.heightAt(site.east, site.north), 800);
  assert.ok(block.heightAt(site.east,site.north-5)! < 799,
    'A natural P-1 drop exists where the rear supports must contact rock');
  assert.throws(()=>createMainSummitWindGround(site,()=>undefined),RangeError);
});

test('R3/R7: actual ZA-22 summit domain mounts the real rock supports and does not obstruct the old cable station', context => {
  const world = mountMainSummitAssembly(new Group(), 0);
  const extras = mountMainSummitExtras(world);
  context.after(() => { extras.dispose(); world.dispose(); });
  assert.ok(extras.windGround.group.parent === world.group);
  assert.ok(extras.windGround.supportCount >= 8);
  assert.equal(extras.windGround.report.source,'calm-no-authority');
  assert.equal(extras.windGround.surfaceAt(62.5,975), 800.03);
  assert.equal(extras.blocked(62.5,975,800,.27,1.8),false);
  assert.equal(world.blocked(-17,7,347,.27,1.8),false);
});

test('R6: absent, malformed or expired weather never becomes invented wind', context => {
  const { model } = fixture(context);
  model.update(45.5);
  assert.deepEqual(model.report, {
    accepted: false, visibleGustFactor: 0, windEast: 0, windNorth: 0,
    source: 'calm-no-authority', pulseAtMs: null,
  });
  assert.equal(model.setOfficialWind({ ...approved, windEast: .5 }, 1_050_000), false);
  assert.equal(model.setOfficialWind({ ...approved, windStrength: 4 }, 1_050_000), false);
  assert.equal(model.setOfficialWind({ ...approved, nextChangeAt: 500 }, 1_050_000), false);
  assert.equal(model.setOfficialWind(approved, 500), false);
  assert.equal(model.setOfficialWind(approved, 4_500_000), false);
  assert.equal(model.setOfficialWind(approved, 1_050_000, 36), false);
  assert.equal(model.report.source, 'calm-no-authority');
});

test('R6: exact G-09/ZB-20 gust and direction drive visible wind tube + turbine gear + five actual cloth flags', context => {
  const { model } = fixture(context);
  const now = 1_018_000;
  assert.equal(model.setOfficialWind(approved, now), true);
  const expected = summitGustFactorAt(approved, now);
  assert.ok(Math.abs(model.report.visibleGustFactor - expected) <= 1e-12);
  assert.equal(model.report.source, 'official-zb20');
  assert.equal(model.report.windEast, .6);
  assert.equal(model.report.windNorth, .8);
  assert.equal(model.report.pulseAtMs, now);
  assert.equal(model.setOfficialWind(approved, now), false,
    'A replayed or stale snapshot cannot rewind the moving indicators');
  assert.ok(expected > 0);
  const windDirection = Math.atan2(approved.windNorth, approved.windEast);
  assert.ok(Math.abs(model.sock.rotation.y - windDirection) < 1e-9);
  const vane = model.group.getObjectByName('weather-synchronous-brass-vanes') as InstancedMesh;
  const previous = vane.instanceMatrix.array.slice(0, 16).join(',');
  model.update((now + 8_000) / 1_000);
  const next = vane.instanceMatrix.array.slice(0, 16).join(',');
  assert.notEqual(next, previous);
  assert.ok(Math.abs(model.report.visibleGustFactor - summitGustFactorAt(approved,now + 8_000)) < 1e-12);
  const pennant = model.group.getObjectByName('wind-measure-flag-0') as Mesh;
  assert.notEqual(pennant.rotation.z, 0);
  model.update(approved.nextChangeAt/1000);
  assert.equal(model.report.source, 'calm-no-authority',
    'A client that missed the next official weather frame must return to calm');
  assert.equal(model.report.visibleGustFactor, 0);
});

test('R6: only physically present authorized player can operate V/L/E without changing the wind rule', context => {
  const { model } = fixture(context);
  const player = site;
  assert.equal(model.interact({kind:'touch',player,authorized:false}).accepted, false);
  assert.equal(model.interact({kind:'touch',player:{...site, east:site.east+9},authorized:true}).accepted, false);
  assert.equal(model.compassTouches,0);
  for (const kind of ['view','listen','touch'] as const) {
    const response = model.interact({kind,player,authorized:true});
    assert.equal(response.accepted, true);
    assert.ok(response.message.length > 6);
  }
  assert.equal(model.compassTouches,1);
  assert.equal(model.report.source,'calm-no-authority','Touching the bronze compass must not create wind');
  assert.ok(model.compassSeal.rotation.y > 0);
  model.dispose();
  model.dispose();
});
