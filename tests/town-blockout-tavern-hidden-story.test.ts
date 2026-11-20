import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene, Vector3, type InstancedMesh } from 'three';
import { layout } from '../tools/voxel-tavern/town-blockout/terrain';
import { createTavernStory, type TavernHotWineReceipt } from '../tools/voxel-tavern/town-blockout/tavern-story';
import { mountTavernAncestorGlimpse } from '../tools/voxel-tavern/town-blockout/tavern-ancestor-glimpse';
import { tavernSeatPlacements } from '../tools/voxel-tavern/town-blockout/tavern-seats';

test('the NPC witness grants exactly one role fragment and keeps unsupplied story lines blank', () => {
  let inTavern = true;
  let innkeeperHasDrunk = false;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
  const host = {
    inTavern: () => inTavern,
    npcHasDrunk: (role: string) => role === 'waiter' || innkeeperHasDrunk,
    canOrderHotWine: () => false,
    orderHotWine: () => assert.fail('a lore action must not order a drink'),
    showAncestors: () => assert.fail('a lore action must not trigger the glimpse'),
  };
  const story = createTavernStory(host, storage);
  const otherTab = createTavernStory(host, storage);
  const noLine = () => assert.fail('the unapproved fragment must have no dialogue');
  assert.deepEqual(story.conversationActions('innkeeper', noLine), []);
  innkeeperHasDrunk = true;
  const hear = story.conversationActions('innkeeper', noLine)[0];
  assert.ok(hear);
  inTavern = false;
  assert.equal(hear.run(), false);
  inTavern = true;
  innkeeperHasDrunk = false;
  assert.equal(hear.run(), false);
  innkeeperHasDrunk = true;
  assert.equal(hear.run(), true);
  assert.equal(hear.run(), false);
  assert.equal(otherTab.conversationActions('waiter', noLine)[0]?.run(), true);
  assert.deepEqual(createTavernStory(host, storage).journal(), [
    { id: 'tavern-drunk-talk-innkeeper', text: '' },
    { id: 'tavern-drunk-talk-waiter', text: '' },
  ]);
  assert.equal(values.size, 2);
});

test('menu viewing, leaving the room and duplicate receipts cannot present the hidden scene', () => {
  let inTavern = true;
  let mayOrder = true;
  let orders = 0, glimpses = 0;
  const story = createTavernStory({
    inTavern: () => inTavern, npcHasDrunk: () => false, canOrderHotWine: () => mayOrder,
    orderHotWine: () => { orders++; }, showAncestors: () => { glimpses++; },
  });
  const noLine = () => assert.fail('menu actions are not story copy');
  assert.deepEqual(story.conversationActions('waiter', noLine), []);
  const order = story.conversationActions('innkeeper', noLine)[0];
  assert.equal(order?.label, '点一杯热酒');
  assert.equal(glimpses, 0);
  assert.equal(order?.run(), true);
  mayOrder = false;
  assert.equal(order?.run(), false);
  assert.equal(orders, 1);
  assert.equal(glimpses, 0);
  const receipt = (id: string): TavernHotWineReceipt => ({ kind: 'tavern-hot-wine-consumed', id });
  assert.equal(story.hotWineConsumed(receipt(' ')), false);
  assert.equal(story.hotWineConsumed({ kind: 'regular-drink', id: 'sip' } as unknown as TavernHotWineReceipt), false);
  assert.equal(story.hotWineConsumed(receipt('first')), true);
  assert.equal(story.hotWineConsumed(receipt(' first ')), false);
  inTavern = false;
  assert.equal(story.hotWineConsumed(receipt('second')), false);
  inTavern = true;
  assert.equal(story.hotWineConsumed(receipt('second')), false);
  assert.equal(glimpses, 1);
});

test('the glimpse is one unlabelled, non-colliding batch on the existing seats and disappears on time or exit', () => {
  const tavern = layout.plots.find(({ id }) => id === 'tavern')!;
  const scene = new Scene();
  let now = 100;
  const glimpse = mountTavernAncestorGlimpse(scene, tavern, () => now);
  assert.equal(scene.children.length, 1);
  const visual = scene.children[0] as InstancedMesh;
  assert.equal(visual?.isInstancedMesh, true);
  assert.ok(!Array.isArray(visual.material) && 'isMeshBasicMaterial' in visual.material && visual.material.isMeshBasicMaterial);
  assert.equal(visual.visible, false);
  assert.equal(visual.userData.colliders, undefined);
  assert.equal(visual.material.depthWrite, false);
  const seats = tavernSeatPlacements(tavern);
  assert.equal(seats.length, 18);
  const center = visual.boundingSphere!.center;
  for (const { pose, seatY } of seats) {
    assert.ok(visual.boundingSphere!.containsPoint(new Vector3(pose.x, seatY + 1.1, -pose.n)), JSON.stringify(center));
  }
  glimpse.reveal();
  assert.equal(visual.visible, true);
  now = 1_200;
  glimpse.update(false);
  assert.equal(visual.visible, false);
  glimpse.update(true);
  assert.equal(visual.visible, false);
  glimpse.reveal();
  now = 2_700;
  glimpse.update(true);
  assert.equal(visual.visible, false);
  glimpse.dispose();
  glimpse.dispose();
  glimpse.reveal();
  assert.equal(scene.children.length, 0);
  assert.equal(visual.visible, false);
});
