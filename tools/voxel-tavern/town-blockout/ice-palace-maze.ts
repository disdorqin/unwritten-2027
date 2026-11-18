import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Box } from './landmark-kit';

type Cell = readonly [number, number];
const cellSize = 1.5;
const wallHeight = 2.2;
const wallThickness = .4;
const entry: Cell = [0, 3];
const grotto: Cell = [10, 5];

function segment(path: Cell[], to: Cell) {
  const [x, n] = path.at(-1)!;
  const dx = Math.sign(to[0] - x), dn = Math.sign(to[1] - n);
  for (let i = 1; i <= Math.abs(to[0] - x) + Math.abs(to[1] - n); i++) path.push([x + i * dx, n + i * dn]);
}

export const icePalaceMazeMainline: readonly Cell[] = (() => {
  const path: Cell[] = [entry];
  for (const next of [[9, 3], [9, 1], [2, 1], [2, 0], [14, 0], [14, 5], grotto] as const) segment(path, next);
  return path;
})();

const branches: readonly (readonly Cell[])[] = [
  [[1, 3], [1, 4], [1, 5]],
  [[7, 3], [7, 4], [7, 5], [7, 6]],
  [[9, 2], [10, 2], [11, 2]],
  [[5, 1], [5, 2]],
  [[8, 0], [8, 1], [8, 2]],
  [[14, 3], [15, 3], [15, 4]],
  [[4, 3], [4, 4], [5, 4], [6, 4], [6, 3]],
  [[12, 0], [12, 1], [13, 1], [14, 1]],
  [[10, 5], [10, 6], [11, 6], [11, 5], [10, 5]],
];
const key = ([x, n]: Cell) => `${x}:${n}`;
const edge = (a: Cell, b: Cell) => [key(a), key(b)].sort().join('/');
const connect = new Set([edge(entry, [-1, 3])]);
const cells = new Map<string, Cell>();
for (const path of [icePalaceMazeMainline, ...branches]) {
  path.forEach((cell, i) => {
    cells.set(key(cell), cell);
    if (i > 0) connect.add(edge(path[i - 1], cell));
  });
}

const directions: readonly Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
type MazeWall = { x: number; z: number; w: number; d: number };
export const icePalaceMazeWalls: readonly MazeWall[] = (() => {
  const edges = new Map<string, MazeWall>();
  for (const cell of cells.values()) {
    const [x, n] = cell;
    for (const [dx, dn] of directions) {
      const side = edge(cell, [x + dx, n + dn]);
      if (connect.has(side)) continue;
      const centreX = Math.min(24 - wallThickness / 2, Math.max(wallThickness / 2, (x + .5 + dx / 2) * cellSize));
      const centreZ = Math.min(12 - wallThickness / 2, Math.max(wallThickness / 2, (n + .5 + dn / 2) * cellSize));
      const halfWidth = (dx === 0 ? cellSize + wallThickness : wallThickness) / 2;
      const halfDepth = (dx === 0 ? wallThickness : cellSize + wallThickness) / 2;
      const west = Math.max(0, centreX - halfWidth), east = Math.min(24, centreX + halfWidth);
      const north = Math.max(0, centreZ - halfDepth), south = Math.min(12, centreZ + halfDepth);
      edges.set(side, { x: (west + east) / 2, z: (north + south) / 2, w: east - west, d: south - north });
    }
  }
  return [...edges.values()];
})();

export function buildIcePalaceMaze() {
  // Origin at the northwest corner of the new forecourt grid (E484/N53).
  const group = new Group();
  const geometry = new BoxGeometry();
  const walls = new InstancedMesh(geometry, new MeshLambertMaterial(), icePalaceMazeWalls.length * 3);
  const pose = new Object3D();
  const color = new Color();
  const colliders: Box[] = [];
  for (let i = 0; i < icePalaceMazeWalls.length; i++) {
    const { x, z, w, d } = icePalaceMazeWalls[i];
    const colors = ['#5e97b3', i % 3 ? '#7eb5d1' : '#70aac7', '#acd5e6'];
    const layers = [[.44, .88], [1.42, 1.08], [2.08, .24]];
    layers.forEach(([y, h], layer) => {
      pose.position.set(x, y, z);
      pose.scale.set(w, h, d);
      pose.updateMatrix();
      walls.setMatrixAt(3 * i + layer, pose.matrix);
      walls.setColorAt(3 * i + layer, color.set(colors[layer]));
    });
    colliders.push({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, wallHeight, z + d / 2] });
  }
  walls.name = 'Ice palace maze wall batch';
  group.add(walls);
  group.userData.colliders = colliders;
  return group;
}
