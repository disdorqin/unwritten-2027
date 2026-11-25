import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { mountMainSummitAssembly, summitAssemblyAnchor } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { mountZa22MountainGate, za22GateSeamNorth } from '../tools/voxel-tavern/town-blockout/town-za22-mountain-gate';
import { mountZa29GuardPost } from '../tools/voxel-tavern/town-blockout/town-za29-guard-scenes';
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

test('the mounted mountain guard covers both legal edges and a jump at the N666 gate seam', () => {
  const owner = new Group();
  const assembly = mountMainSummitAssembly(owner, 0);
  const gate = mountZa22MountainGate(assembly, { open() {} });
  const post = mountZa29GuardPost(owner, 'mountain', (east, north) => north < za22GateSeamNorth
    ? assembly.frontRidgeAt(east - summitAssemblyAnchor.east, north - summitAssemblyAnchor.north)
    : gate.surfaceAt(east, north, 0));
  const lines: string[] = [];
  const duty = createZa29GuardDuty('mountain', post.anchors, line => lines.push(line));
  duty.updateDuty(true);
  try {
    assert.equal(za22GateSeamNorth, 666);
    assert.equal(duty.blocksStep(foot(300, 664.9, 347), foot(300, 665.1, 347)), false);
    for (const east of [298.28, 300, 301.72]) {
      assert.equal(gate.acceptsStep(east, 665.9, east, 666.1, .27), true);
      for (const height of [347, 348.26]) {
        const from = foot(east, 665.9, height);
        const to = foot(east, 666.1, height);
        assert.equal(duty.interceptsStep(from, to), true);
        assert.equal(duty.blocksStep(to, from), false);
      }
    }
    assert.equal(duty.blocksStep(foot(304, 665.9, 347), foot(304, 666.1, 347)), false);
    assert.equal(duty.blocksStep(foot(300, 665.9, 350), foot(300, 666.1, 350)), false);
    assert.deepEqual(lines, []);
    assert.equal(duty.blocksStep(foot(300, 665.9, 347), foot(300, 666.1, 347)), true);
    assert.equal(lines.length, 1);
    duty.updateDuty(false);
    assert.equal(duty.blocksStep(foot(300, 665.9, 347), foot(300, 666.1, 347)), false);
  } finally {
    post.dispose();
    gate.dispose();
    assembly.dispose();
  }
});

test('ZB-28 phase mapping: day on post, dusk empty without signs, night window signs', async () => {
  const { za29GuardDutyForPhase } = await import('../tools/voxel-tavern/town-blockout/town-za29-guard-duty');
  assert.deepEqual(za29GuardDutyForPhase(undefined), { guardPresent: true, showNightSigns: false });
  assert.deepEqual(za29GuardDutyForPhase('day'), { guardPresent: true, showNightSigns: false });
  assert.deepEqual(za29GuardDutyForPhase('awaiting-beacon'), { guardPresent: false, showNightSigns: false });
  assert.deepEqual(za29GuardDutyForPhase('night-window'), { guardPresent: false, showNightSigns: true });
});

test('ZB-28 crater interception is the fence opening slot (half-width 2.07), not a disc', () => {
  const height = 10.7773;
  const approach = foot(-68.4, 159, height);
  const guard = foot(-68.4, 161.1, height);
  const duty = createZa29GuardDuty('crater', { guard, approach }, () => {});
  duty.updateDuty(true);
  // Inside the slot near its edge (2.0 north of centre): still covered.
  assert.equal(duty.blocksStep(foot(-66, 161, height), foot(-70.5, 161, height)), true);
  // Just outside the slot (2.2 north of centre): the guard does not cover it.
  assert.equal(duty.blocksStep(foot(-66, 161.2, height), foot(-70.5, 161.2, height)), false);
  // A jump-height crossing inside the slot stays free above the envelope.
  assert.equal(duty.blocksStep(foot(-66, 159, height + 1.5), foot(-70.5, 159, height + 1.5)), false);
});
