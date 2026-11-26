import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND3_DECOR_ANCHORS,
  FRIEND3_DECOR_VARIANT_COLORS,
  FRIEND3_DECOR_VARIANT_LABELS,
  createFriend3DecorBoard,
} from '../tools/voxel-tavern/town-blockout/town-friend3-decor.js';

test('FR-08 anchor catalog has five lantern and five postcard hooks', () => {
  assert.equal(FRIEND3_DECOR_ANCHORS.length, 10);
  assert.equal(FRIEND3_DECOR_ANCHORS.filter(anchor => anchor.kind === 'lantern').length, 5);
  assert.equal(FRIEND3_DECOR_ANCHORS.filter(anchor => anchor.kind === 'postcard').length, 5);
  assert.equal(new Set(FRIEND3_DECOR_ANCHORS.map(anchor => anchor.id)).size, 10);
  assert.equal(new Set(FRIEND3_DECOR_ANCHORS.map(anchor => anchor.label)).size, 10);
  for (const anchor of FRIEND3_DECOR_ANCHORS) {
    assert.ok(Number.isFinite(anchor.x));
    assert.ok(Number.isFinite(anchor.y));
    assert.ok(Number.isFinite(anchor.z));
    assert.equal(anchor.rotationY, 0);
  }
  assert.equal(FRIEND3_DECOR_VARIANT_LABELS.lantern.length, 3);
  assert.equal(FRIEND3_DECOR_VARIANT_LABELS.postcard.length, 3);
  assert.equal(FRIEND3_DECOR_VARIANT_COLORS.lantern.length, 3);
  assert.equal(FRIEND3_DECOR_VARIANT_COLORS.postcard.length, 3);
});

test('FR-08 places lanterns and postcards on matching anchors', () => {
  const board = createFriend3DecorBoard();
  const lantern = board.place('lantern-1', 'lantern', 0);
  assert.equal(lantern.kind, 'placed');
  if (lantern.kind !== 'placed') assert.fail('expected lantern placement');
  assert.equal(lantern.placement.anchorId, 'lantern-1');
  assert.equal(lantern.placement.kind, 'lantern');
  assert.equal(lantern.placement.variant, 0);
  assert.equal(lantern.placement.order, 1);

  const postcard = board.place('postcard-3', 'postcard', 2);
  assert.equal(postcard.kind, 'placed');
  const snapshot = board.snapshot();
  assert.equal(snapshot.counts.lantern, 1);
  assert.equal(snapshot.counts.postcard, 1);
  assert.deepEqual(snapshot.occupied, ['lantern-1', 'postcard-3']);
  assert.equal(board.isOccupied('lantern-1'), true);
  assert.equal(board.isOccupied('postcard-1'), false);
});

test('FR-08 rejects unknown anchors, wrong kinds, bad variants and occupied hooks', () => {
  const board = createFriend3DecorBoard();
  assert.deepEqual(board.place('missing', 'lantern', 0), { kind: 'rejected', reason: 'unknown-anchor' });
  assert.deepEqual(board.place('lantern-1', 'postcard', 0), { kind: 'rejected', reason: 'kind-mismatch' });
  assert.deepEqual(board.place('postcard-1', 'lantern', 0), { kind: 'rejected', reason: 'kind-mismatch' });
  assert.deepEqual(board.place('lantern-1', 'lantern', 3 as never), { kind: 'rejected', reason: 'invalid-variant' });
  assert.deepEqual(board.place('lantern-1', 'lantern', -1 as never), { kind: 'rejected', reason: 'invalid-variant' });
  assert.equal(board.place('lantern-1', 'lantern', 1).kind, 'placed');
  assert.deepEqual(board.place('lantern-1', 'lantern', 2), { kind: 'rejected', reason: 'occupied' });
  assert.equal(board.snapshot().counts.lantern, 1);
});

test('FR-08 remove, undo, clear and re-place keep order and counts honest', () => {
  const board = createFriend3DecorBoard();
  assert.equal(board.remove('lantern-1'), undefined);
  assert.equal(board.undo(), undefined);
  board.place('lantern-1', 'lantern', 0);
  board.place('lantern-2', 'lantern', 1);
  board.place('postcard-1', 'postcard', 2);

  const removed = board.remove('lantern-1');
  assert.equal(removed?.anchorId, 'lantern-1');
  assert.equal(board.isOccupied('lantern-1'), false);
  assert.equal(board.snapshot().counts.lantern, 1);

  const undone = board.undo();
  assert.equal(undone?.anchorId, 'postcard-1');
  assert.equal(board.snapshot().counts.postcard, 0);
  assert.equal(board.snapshot().counts.lantern, 1);

  assert.equal(board.clear(), 1);
  const empty = board.snapshot();
  assert.deepEqual(empty.placements, []);
  assert.deepEqual(empty.occupied, []);
  assert.deepEqual(empty.counts, { lantern: 0, postcard: 0 });

  board.place('lantern-1', 'lantern', 2);
  const snapshot = board.snapshot();
  assert.equal(snapshot.placements[0]?.variant, 2);
  assert.equal(snapshot.placements[0]?.order, 4);
});

test('FR-08 completed layout can fill all ten anchors', () => {
  const board = createFriend3DecorBoard();
  for (const anchor of FRIEND3_DECOR_ANCHORS) {
    const result = board.place(anchor.id, anchor.kind, 0);
    assert.equal(result.kind, 'placed');
  }
  const snapshot = board.snapshot();
  assert.equal(snapshot.placements.length, 10);
  assert.deepEqual(snapshot.counts, { lantern: 5, postcard: 5 });
  assert.equal(snapshot.occupied.length, 10);
  assert.equal(board.clear(), 10);
});