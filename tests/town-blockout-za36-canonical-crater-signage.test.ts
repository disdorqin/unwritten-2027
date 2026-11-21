import assert from 'node:assert/strict';
import { test } from 'node:test';
import { craterSignCopy, mountCraterSignage } from '../tools/voxel-tavern/town-blockout/town-crater-signage';
import { buildCraterOuterWorks } from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';
import { buildCraterMouthWorks } from '../tools/voxel-tavern/town-blockout/town-crater-mouth-works';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

const canon = {
  wall: '坑区年久失修，山路危险——\n乡亲们送到这里，就请回吧。\n夜里风大，莫要久留。\n未写镇公所',
  fence: '封存重地 · 非工勿入\n入内者须持工牌，于集结地登记。',
  collapse: '此处塌方，危险。\n绕行正门。',
  smelter: '腊月廿三\n一班　白望山　到\n二班　石　沉　到\n三班　炉火看住，莫等我——',
  instrument: '各表送修，先登记，后领取。\n急件敲窗，莫敲门。',
  station: '晨一班　午一班　暮一班　夜一班\n货运矿料，随正班附挂。\n夜车空驶，亦准点。乘车请至山口站换乘。',
};
const flat = { anchor: { east: -120, north: 185, rimHeight: 12, yaw: 1.364 }, heightAt: () => 12 };
function fixture() {
  const mouth = buildCraterMouthWorks(flat);
  const outer = buildCraterOuterWorks(flat);
  return { mouth, outer, signage: mountCraterSignage(flat, { mouth: mouth.sites, outer: outer.sites }) };
}
test('ZA-36 full canonical copy on built plaques is exact, unfinished sentence stays unfinished', () => {
  const { signage: s } = fixture();
  const byId = new Map(s.panels.map(p => [p.id, p]));
  assert.equal(s.panels.length, 8);
  assert.deepEqual(s.pending, ['crater-station-name', 'crater-station-schedule']);
  for (const [id, expected] of [
    ['wall-notice', canon.wall],
    ['fence-warning', canon.fence],
    ['collapse-warning-1', canon.collapse],
    ['collapse-warning-2', canon.collapse],
    ['smelter-name', '冶炼工坊'],
    ['smelter-duty', canon.smelter],
    ['instrument-name', '仪器工坊'],
    ['instrument-notice', canon.instrument],
  ] as const) {
    assert.equal(byId.get(id)?.lines.join('\n'), expected, id);
  }
  assert.equal(craterSignCopy.stationBoard.join('\n'), canon.station);
  assert.equal(craterSignCopy.stationName.join('\n'), '坑口站');
  assert.ok(byId.get('smelter-duty')?.lines.at(-1)?.endsWith('——'));
  assert.ok(!JSON.stringify(s.panels).includes('飞船'));
  assert.ok(!JSON.stringify(s.panels).includes('真相'));
});
test('ZA-36 signs are a single face atlas and period-specific physical frames', () => {
  const { signage: s } = fixture();
  const names = s.group.children.map(x => x.name);
  assert.ok(names.includes('crater-signage-merged-faces'));
  for (const era of ['town', 'sealed', 'decay', 'factory', 'paper']) {
    assert.ok(names.includes('crater-signage-frame-' + era));
  }
  assert.ok(s.group.children.length <= 7);
  assert.equal(s.group.children.filter(x => x.name === 'crater-signage-merged-faces').length, 1);
  assert.equal(s.panels.filter(x => x.era === 'decay').length, 2);
  assert.equal(s.panels.filter(x => x.id.startsWith('collapse')).length, 2);
  assert.ok(s.panels.every(x => [x.east, x.north, x.foot, x.centerHeight].every(Number.isFinite)));
  assert.ok(s.panels.every(x => x.width > 0 && x.height > 0));
  assert.ok(s.panels.find(x => x.id === 'wall-notice')!.east < -18);
  s.dispose();
});
test('ZA-36 physical E spots reject remote interactions and reading through another floor', () => {
  const { signage: s } = fixture();
  for (const panel of s.panels) {
    assert.equal(s.actionAt(panel.east, panel.north, panel.foot)?.id, panel.id);
    assert.equal(s.actionAt(panel.east, panel.north, panel.foot + 1.8), undefined);
    assert.equal(s.actionAt(panel.east + 5, panel.north, panel.foot), undefined);
  }
  assert.equal(s.actionAt(0, 0, 12), undefined);
});
test('ZA-36 station text does not float before station construction', () => {
  const { mouth, outer } = fixture();
  const s = mountCraterSignage(flat, { mouth: mouth.sites, outer: outer.sites,
    station: { east: 42, north: 300, height: 12, outwardYaw: Math.PI },
  });
  assert.equal(s.panels.length, 10);
  assert.deepEqual(s.pending, []);
  assert.equal(s.panels.find(x => x.id === 'crater-station-name')?.lines.join('\n'), '坑口站');
  assert.equal(s.panels.find(x => x.id === 'crater-station-schedule')?.lines.join('\n'), canon.station);
  s.dispose();
});
test('ZA-36 live west crater mounts signs once and keeps legacy worksite meshes', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  assert.ok(road.group.getObjectByName('crater-mouth-works'));
  assert.ok(road.group.getObjectByName('crater-outer-works'));
  assert.equal(road.group.children.filter(x => x.name === 'za36-canonical-crater-signage').length, 1);
  assert.equal(road.signage.panels.length, 8);
  assert.deepEqual(road.signage.pending, ['crater-station-name', 'crater-station-schedule']);
});
