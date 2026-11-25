import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { SHIP_EMBLEM_CELLS, createShipEmblemPiece, mountShipEmblems } from '../tools/voxel-tavern/town-blockout/ship-emblem.ts';

test('S-11 emblem: crescent and descending arc form one continuous mark', () => {
  const crescent = SHIP_EMBLEM_CELLS.filter((c) => c.part === 'crescent');
  const arc = SHIP_EMBLEM_CELLS.filter((c) => c.part === 'arc');
  assert.ok(crescent.length >= 8, `crescent cells ${crescent.length}`);
  assert.ok(arc.length >= 8, `arc cells ${arc.length}`);
  // One-piece rule: every arc cell must chain (king-move adjacency) back to
  // the crescent through arc cells — no detached second arc.
  const key = (x: number, y: number) => `${Math.round(x / 0.11)},${Math.round(y / 0.11)}`;
  const all = new Set(SHIP_EMBLEM_CELLS.map((c) => key(c.x, c.y)));
  const seen = new Set<string>(crescent.map((c) => key(c.x, c.y)));
  const queue = [...crescent];
  while (queue.length) {
    const c = queue.pop()!;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${Math.round(c.x / 0.11) + dx},${Math.round(c.y / 0.11) + dy}`;
        if (all.has(k) && !seen.has(k)) {
          seen.add(k);
          const cell = SHIP_EMBLEM_CELLS.find((e) => key(e.x, e.y) === k)!;
          queue.push(cell);
        }
      }
    }
  }
  assert.equal(seen.size, all.size, 'emblem must be a single connected mark');
});

test('S-11 emblem: piece builds merged and mounts', () => {
  const piece = createShipEmblemPiece();
  assert.ok(piece.children.length >= 2 && piece.children.length <= 4, `merged meshes ${piece.children.length}`);
  const parent = new Group();
  const m = mountShipEmblems(parent, [{ east: 100, north: 200, heading: 0.5 }], () => 12);
  assert.equal(m.placed, 1);
  assert.equal(parent.children.length, 1);
  m.dispose();
  assert.equal(parent.children.length, 0);
});
