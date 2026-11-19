import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrbitalReview } from '../tools/voxel-tavern/town-blockout/town-expansion-review-orbital.ts';
import type { ExpansionView } from '../tools/voxel-tavern/town-blockout/town-expansion-review-renderer.ts';
import { createUndergroundReview } from '../tools/voxel-tavern/town-blockout/town-expansion-review-underground.ts';

test('review actions take the covered shaft through first fall, camp checks and repeat cage travel', () => {
  let view: ExpansionView;
  const review = createUndergroundReview(next => { view = next; });
  const current = () => view!;
  const trigger = (name: string) => {
    const action = current().actions.find(([label]) => label === name);
    assert.ok(action);
    action[1]();
  };
  review.show();
  assert.match(current().location, /三层环台/);
  trigger('查看坑底绞盘');
  assert.match(current().status, /和平模式/);
  trigger('转绞盘并走查首坠');
  assert.match(current().location, /井底潭/);
  assert.match(current().status, /坠落伤害 0/);
  trigger('检查主巷至营地');
  assert.match(current().status, /198 个脚点通过/);
  assert.match(current().location, /营地/);
  trigger('返回井底潭走查点');
  assert.match(current().status, /回程 198 个脚点通过.*低缝蹲行/);
  assert.match(current().location, /井底潭/);
  trigger('乘吊笼返回坑底');
  assert.match(current().status, /盖板保持开启/);
  trigger('乘吊笼下井');
  assert.match(current().status, /吊笼下行/);
});

test('review actions use the gate guards and distinct arrivals for both orbital routes', () => {
  let view: ExpansionView;
  const review = createOrbitalReview(next => { view = next; });
  const current = () => view!;
  const trigger = (name: string) => {
    const action = current().actions.find(([label]) => label === name);
    assert.ok(action);
    action[1]();
  };
  review.show();
  trigger('经当前门进入气闸');
  assert.match(current().status, /仍锁定/);
  trigger('打开试验门旗标');
  trigger('经当前门进入气闸');
  assert.match(current().status, /星港太空门抵达/);
  const starportArrival = current().target.x;
  trigger('检视驾驶舱');
  assert.match(current().status, /航行日志原件留空/);
  trigger('检视星港侧门前点');
  trigger('返回地宫');
  assert.match(current().status, /不在对应门口/);
  trigger('返回星港');
  assert.match(current().status, /星港太空门返回/);
  trigger('选取另一外门夹具');
  trigger('经当前门进入气闸');
  assert.match(current().status, /地宫核心舱门抵达/);
  assert.ok(starportArrival < 0 && current().target.x > 0);
  trigger('检视地宫侧门前点');
  trigger('返回地宫');
  assert.match(current().status, /地宫核心舱门返回/);
});

test('the crater well shows concealing debris until the authority reveals the shaft', () => {
  let view: ExpansionView;
  const review = createUndergroundReview(next => { view = next; });
  const trigger = (label: string) => {
    const action = view!.actions.find(([name]) => name === label);
    assert.ok(action);
    action[1]();
  };
  review.show();
  const crater = view!.group;
  const cover = crater.getObjectByName('crater-well-concealment');
  const shaft = crater.getObjectByName('crater-well-open-shaft');
  const winch = crater.getObjectByName('crater-well-winch');
  const base = crater.getObjectByName('crater-broken-crane-base');
  assert.ok(cover && shaft && winch && base);
  assert.ok(cover.getObjectByName('crater-well-cap'));
  assert.ok(cover.getObjectByName('crater-well-rubble'));
  assert.equal(cover.children.filter(part => part.name.startsWith('crater-well-ore-')).length, 3);
  assert.equal(winch.parent, base.parent);
  assert.ok(winch.position.distanceTo(base.position) < 1.5);
  assert.equal(cover.visible, true);
  assert.equal(shaft.visible, false);

  trigger('查看坑底绞盘');
  assert.equal(cover.visible, true);
  trigger('转绞盘并走查首坠');
  assert.match(view!.status, /坠落伤害 0/);
  assert.equal(cover.visible, false);
  assert.equal(shaft.visible, true);
  trigger('乘吊笼返回坑底');
  assert.equal(view!.group, crater);
  assert.equal(cover.visible, false);
  assert.equal(shaft.visible, true);
  assert.equal(winch.visible, true);
});
