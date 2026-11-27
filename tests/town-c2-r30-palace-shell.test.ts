import assert from 'node:assert/strict';
import test from 'node:test';
import { InstancedMesh, Matrix4 } from 'three';
import {
  c2R30PalacePlan, createTownC2R30PalaceShell, type C2R30PalaceShell,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-palace-shell.js';
import { c2R30DeepMouths } from '../tools/voxel-tavern/town-blockout/town-c2-r30-deep-mouths.js';

// InstancedMesh matrices are Float32; authored dimensions are checked at GPU precision.
const epsilon = 1e-5;
const mouth = c2R30DeepMouths['minus165-to-minus190'].to;

type Masonry = Readonly<{
  east: number; bottom: number; north: number;
  width: number; height: number; depth: number;
}>;

function masonry(shell: C2R30PalaceShell) {
  const mesh = shell.group.children.find((child): child is InstancedMesh => child instanceof InstancedMesh);
  assert.ok(mesh);
  const matrix = new Matrix4();
  const pieces: Masonry[] = [];
  for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    const values = matrix.elements;
    pieces.push(Object.freeze({
      east: values[12]!, bottom: values[13]! - values[5]! / 2, north: -values[14]!,
      width: values[0]!, height: values[5]!, depth: values[10]!,
    }));
  }
  return pieces;
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('C2 palace restores the pinned shell and adds only the 44-course N0 receiving wall', () => {
  const shell = createTownC2R30PalaceShell();
  try {
    assert.equal(shell.group.userData.sourceBlob, '9ab161e8691ea32662f389527ebb57f1d3fe0947');
    assert.equal(shell.group.userData.owner, 'C2-R04');
    assert.equal(shell.group.userData.coordinateFrame, 'palace-shell-local-east-height-north');
    assert.deepEqual(c2R30PalacePlan.entry, { east: 0, north: .5, height: 0 });
    assert.equal(shell.route.length, 14);
    assert.equal(shell.cover.length, 6);

    const pieces = masonry(shell);
    assert.equal(pieces.length, 6501, '6457 pinned masonry pieces plus 44 N0 courses');
    assert.equal(shell.group.children.length, 2, 'one masonry batch and the original apron');
    const wall = pieces.filter(piece => Math.abs(piece.north) <= epsilon && Math.abs(piece.depth - .48) <= epsilon);
    assert.equal(wall.length, 44);
    const left = wall.filter(piece => piece.east + piece.width / 2 <= -1.7 + epsilon);
    const right = wall.filter(piece => piece.east - piece.width / 2 >= 1.7 - epsilon);
    const lintel = wall.filter(piece => piece.east - piece.width / 2 >= -1.7 - epsilon &&
      piece.east + piece.width / 2 <= 1.7 + epsilon && piece.bottom >= 3.24 - epsilon);
    assert.equal(left.length, 14);
    assert.equal(right.length, 14);
    assert.equal(lintel.length, 16);
    for (const piece of [...left, ...right]) {
      near(piece.width, 1.15);
      near(piece.height, 1);
      assert.ok(piece.bottom >= -epsilon && piece.bottom + piece.height <= 7 + epsilon);
    }
    for (const piece of lintel) {
      near(piece.width, .85);
      near(piece.height, .94);
      assert.ok(piece.bottom + piece.height <= 7 + epsilon);
    }
    near(Math.min(...right.map(piece => piece.east - piece.width / 2)) -
      Math.max(...left.map(piece => piece.east + piece.width / 2)), 3.4);
    near(Math.min(...lintel.map(piece => piece.bottom)), 3.24);
    near(Math.max(...lintel.map(piece => piece.bottom + piece.height)), 7);
    assert.equal(wall.some(piece => piece.east - piece.width / 2 < 1.7 - epsilon &&
      piece.east + piece.width / 2 > -1.7 + epsilon && piece.bottom < 3.24 - epsilon), false);

    assert.ok(pieces.some(piece => Math.abs(piece.east) <= epsilon && Math.abs(piece.north - 126.74) <= epsilon &&
      Math.abs(piece.bottom + 2.4) <= epsilon && Math.abs(piece.width - 7.2) <= epsilon &&
      Math.abs(piece.height - 9) <= epsilon && Math.abs(piece.depth - .36) <= epsilon),
    'the sealed vault backing door must remain visible geometry');
  } finally {
    shell.dispose();
  }
});

test('entry datum, body-height lintel collision, finite inputs and stair semantics share the shell', () => {
  const shell = createTownC2R30PalaceShell();
  try {
    assert.equal(shell.floorAt(0, .5), 0);
    assert.equal(shell.floorAt(0, 0), 0);
    assert.equal(shell.floorAt(0, 1), -.15);
    assert.equal(shell.floorAt(0, 16), -2.4);
    assert.equal(shell.canStand(0, .5), true);
    assert.equal(shell.canStand(-2, .5), false);
    assert.equal(shell.canStand(2, .5), false);
    const entry = shell.passageLocal(0, .5);
    assert.ok(entry);
    assert.equal(entry.floor, 0);
    near(entry.clearance, 3.24);
    assert.equal(shell.canStand(0, .5, .27, 3.24), true);
    assert.equal(shell.canStand(0, .5, .27, 3.3), false, '3.3m body intersects the real lintel');
    assert.equal(shell.passageLocal(0, .5, .27, 3.3), undefined);
    assert.equal(shell.passageLocal(0, .5, 0, 1.8)?.floor, 0);

    for (const invalid of [NaN, Infinity, -Infinity]) {
      assert.equal(shell.canStand(invalid, .5), false);
      assert.equal(shell.canStand(0, invalid), false);
      assert.equal(shell.canStand(0, .5, invalid), false);
      assert.equal(shell.canStand(0, .5, .27, invalid), false);
      assert.equal(shell.passageLocal(invalid, .5), undefined);
      assert.equal(shell.passageLocal(0, invalid), undefined);
      assert.equal(shell.passageLocal(0, .5, invalid), undefined);
      assert.equal(shell.passageLocal(0, .5, .27, invalid), undefined);
    }
    assert.equal(shell.canStand(0, .5, -.01), false);
    assert.equal(shell.canStand(0, .5, .27, 0), false);
    assert.equal(shell.canStand(0, .5, .27, -1), false);
    for (let north = .5; north <= 16 + epsilon; north += .5) {
      assert.equal(shell.canStand(0, north), true, `stairs blocked at N${north}`);
    }
  } finally {
    shell.dispose();
  }
});

test('all original route stations, the antechamber and the arena exit retain their support', () => {
  const shell = createTownC2R30PalaceShell();
  try {
    for (const [east, north] of shell.route) {
      assert.equal(shell.canStand(east, north), true, `route blocked at E${east}/N${north}`);
    }
    assert.equal(shell.floorAt(0, 105.7), -2.4);
    assert.equal(shell.canStand(0, 105.7), true);
    assert.equal(shell.canStand(0, 125.4), true);
    assert.equal(shell.floorAt(0, 125.4), -2.4);
    assert.equal(shell.canStand(0, 125.8), false, 'the capsule crosses the arena floor edge');
    assert.equal(shell.passageLocal(0, 125.8), undefined);
  } finally {
    shell.dispose();
  }
});

test('only the exact minus165-to-minus190 receiving mouth is certified by real geometry and clearance', () => {
  const shell = createTownC2R30PalaceShell();
  try {
    assert.equal(shell.acceptsMouth(mouth), true);
    assert.equal(shell.acceptsMouth({ ...mouth }), true);
    for (const wrong of [
      c2R30DeepMouths['minus165-to-minus190'].from,
      c2R30DeepMouths['minus140-to-minus165'].to,
      { ...mouth, width: 3.6 }, { ...mouth, width: 3.41 },
      { ...mouth, height: 3.25 }, { ...mouth, height: 3.2 },
      { ...mouth, layer: 'minus165' }, { ...mouth, axis: 'east' },
      { ...mouth, at: .1 }, { ...mouth, centre: .1 }, null, undefined,
    ]) assert.equal(shell.acceptsMouth(wrong), false, JSON.stringify(wrong));
    for (let lateral = -1.65; lateral <= 1.65 + epsilon; lateral += .06) {
      const passage = shell.passageLocal(lateral, .25, .01, 3.24);
      assert.ok(passage, `mouth lacks headroom at E${lateral}`);
      assert.equal(passage.floor, 0);
      assert.ok(passage.clearance + epsilon >= 3.24);
    }
    assert.equal(shell.canStand(-2, .25, .05), false);
    assert.equal(shell.canStand(2, .25, .05), false);
  } finally {
    shell.dispose();
  }
});

test('dispose is idempotent and closes every walking and mouth query', () => {
  const shell = createTownC2R30PalaceShell();
  shell.dispose();
  assert.doesNotThrow(() => shell.dispose());
  assert.equal(shell.group.children.length, 0);
  assert.equal(shell.group.parent, null);
  assert.equal(shell.canStand(0, .5), false);
  assert.equal(shell.passageLocal(0, .5), undefined);
  assert.equal(shell.acceptsMouth(mouth), false);
  assert.equal(shell.acceptsMouth({ ...mouth }), false);
});
