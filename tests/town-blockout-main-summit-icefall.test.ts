import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitIcefall, icefallSpec } from '../tools/voxel-tavern/town-blockout/main-summit-icefall';

test('icefall drapes the surveyed face with six rope stakes and a high top anchor', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(() => block.dispose());
  const icefall = createMainSummitIcefall(block.heightAt);
  context.after(() => icefall.dispose());
  assert.equal(icefall.stakes.length, icefallSpec.stakeCount);
  const first = icefall.stakes[0]!;
  const last = icefall.stakes.at(-1)!;
  assert.ok(last.height > first.height + 30, 'stakes climb the fall');
  assert.ok(icefall.topAnchor.height > last.height, 'top anchor crowns the fall');
  assert.ok(icefall.topAnchor.north === icefallSpec.northTo);
  const sheet = icefall.group.getObjectByName('icefall-sheet');
  assert.ok(sheet, 'ice sheet mounted');
  const rope = icefall.group.getObjectByName('icefall-rope');
  assert.ok(rope, 'rope line mounted');
});
