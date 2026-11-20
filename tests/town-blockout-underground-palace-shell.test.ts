import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundPalaceShell, undergroundPalacePlan } from '../tools/voxel-tavern/town-blockout/underground-palace-shell';

test('U-11 palace route walks the descent and bypass to the vault, and permits the full reverse return', t => {
  const palace = createUndergroundPalaceShell();
  t.after(() => palace.dispose());
  const route = [...palace.route];
  for (const direction of [route, [...route].reverse()]) {
    const [entryEast, entryNorth] = direction[0]!;
    let previousHeight = palace.floorAt(entryEast, entryNorth);
    let samples = 0;
    for (const [index, to] of direction.slice(1).entries()) {
      const from = direction[index]!;
      const count = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / .15);
      for (let sample = 1; sample <= count; sample++) {
        const east = from[0] + (to[0] - from[0]) * sample / count;
        const north = from[1] + (to[1] - from[1]) * sample / count;
        assert.ok(palace.canStand(east, north), `blocked at E${east} N${north}`);
        const height = palace.floorAt(east, north)!;
        assert.ok(Math.abs(height - previousHeight!) <= .15000001, 'the route misses a tread or has a step lip');
        previousHeight = height;
        samples++;
      }
    }
    t.diagnostic(`${samples} standing samples`);
  }
  assert.equal(palace.canStand(0, 54), false, 'the straight passage must end at the collapse');
  assert.equal(palace.canStand(12, 57), true, 'the east bypass continues past the collapse');
  assert.equal(palace.canStand(0, 81), false, 'walking cannot go through the empty throne dais');
  assert.ok(palace.canStand(8, 81));
});

test('U-11 vault forecourt keeps two staggered cover arcs, an open southern approach and a blind door reserve', t => {
  const palace = createUndergroundPalaceShell();
  t.after(() => palace.dispose());
  const { arena, vaultOpening, columnBaseHeight } = undergroundPalacePlan;
  assert.equal(arena.radius, 22);
  assert.equal(vaultOpening.height, 9);
  assert.equal(vaultOpening.north, arena.centre[1]);
  assert.equal(columnBaseHeight, .95);
  const coverAngles = new Set<number>();
  for (const [kind, radius] of [['inner', 9], ['outer', 16]] as const) {
    const arc = palace.cover.filter(item => item.arc === kind);
    assert.equal(arc.length, 3);
    for (const { east, north } of arc) {
      assert.ok(Math.abs(Math.hypot(east, north - arena.centre[1]) - radius) < 1e-10);
      assert.equal(palace.floorAt(east, north), arena.floor);
      assert.equal(palace.canStand(east, north), false);
      coverAngles.add(Math.atan2(east, arena.centre[1] - north));
    }
  }
  assert.equal(coverAngles.size, 6);
  for (let north = 100; north < vaultOpening.north - .3; north += .2) {
    assert.ok(palace.canStand(0, north), 'the retreat lane must stay open');
  }
  assert.equal(palace.floorAt(22.01, 126), undefined);
  assert.equal(palace.canStand(0, 126.1), false);
});

test('U-11 renders grouped masonry and releases the shell assets', () => {
  const palace = createUndergroundPalaceShell();
  const masonry = palace.group.getObjectByName('palace-masonry');
  const slab = palace.group.getObjectByName('vault-forecourt-slab');
  assert.ok(masonry && 'isInstancedMesh' in masonry && masonry.isInstancedMesh);
  assert.ok(slab && 'isMesh' in slab && slab.isMesh);
  palace.dispose();
  palace.dispose();
  assert.equal(palace.group.children.length, 0);
});
