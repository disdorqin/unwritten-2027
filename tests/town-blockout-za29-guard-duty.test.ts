import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZa29GuardDuty } from '../tools/voxel-tavern/town-blockout/town-za29-guard-duty';

const foot = (east: number, north: number, height: number) => ({ east, north, height });

test('a mounted and on-duty mountain guard warns, talks and stops a crossing of the real approach', () => {
  const approach = foot(300, 664.95, 347);
  const guard = foot(302.35, 665.1, 347);
  const outside = foot(300, 663.25, 347);
  const inside = foot(300, 666.1, 347);
  const lines: string[] = [];
  const duty = createZa29GuardDuty('mountain', { guard, approach }, line => lines.push(line));

  assert.equal(duty.action(outside), undefined);
  assert.equal(duty.blocksStep(outside, inside), false);
  duty.observeApproach(outside);
  assert.deepEqual(lines, []);

  duty.updateDuty(true);
  duty.observeApproach(outside);
  duty.observeApproach(outside);
  assert.deepEqual(lines, ['吃点，吃点再走，山上风大。']);
  const action = duty.action(outside);
  assert.equal(action?.label, '与赵满仓交谈');
  action?.run();
  assert.equal(duty.blocksStep(outside, inside), true);
  assert.equal(duty.blocksStep(outside, inside), true);
  assert.equal(lines.length, 3);
  assert.equal(duty.blocksStep(inside, outside), false);

  duty.updateDuty(false);
  action?.run();
  assert.equal(duty.action(outside), undefined);
  assert.equal(duty.blocksStep(outside, inside), false);
  assert.equal(lines.length, 3);
});

test('the crater guard intervenes on the approach without fencing off the western domain', () => {
  const height = 10.7773;
  const approach = foot(-68.4, 159, height);
  const guard = foot(-68.4, 161.1, height);
  const lines: string[] = [];
  const duty = createZa29GuardDuty('crater', { guard, approach }, line => lines.push(line));
  duty.updateDuty(true);

  const outside = foot(-66, 159, height);
  const inside = foot(-70.5, 159, height);
  assert.equal(duty.blocksStep(outside, inside), true);
  assert.equal(duty.blocksStep(approach, inside), true);
  assert.equal(duty.blocksStep(foot(-66, 160.7, height), foot(-70.5, 157.3, height)), true);
  assert.equal(duty.blocksStep(inside, outside), false);
  assert.equal(duty.blocksStep(inside, foot(-72, 159, height)), false);
  assert.equal(duty.blocksStep(foot(-66, 153, height), foot(-70.5, 153, height)), false);
  assert.equal(duty.blocksStep(foot(-66, 159, height + 3), foot(-70.5, 159, height + 3)), false);
  assert.equal(duty.action(foot(-72, 153, height)), undefined);
  assert.deepEqual(lines, ['井口的规矩，比命大。']);

  duty.observeApproach(foot(-65, 149, height));
  duty.observeApproach(outside);
  assert.equal(duty.blocksStep(outside, inside), true);
  assert.equal(lines.length, 3);
  duty.updateDuty(false);
  assert.equal(duty.blocksStep(outside, inside), false);
  assert.equal(duty.blocksStep(inside, outside), false);
});
