import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// S-11 ship emblem (zone-2 self-build): the Weiyang emblem as ONE piece —
// crescent moon + descending arc sharing a single construction, never two
// separate arcs (the ZD-06 image-02 defect this piece exists to prevent).
// No ship-name text anywhere. Distinct from the town-chronicle ring
// (unclosed ring, gap upper-right, grey-cyan #68867e): this emblem is a
// gold mark on a dark plate, crescent opening upper-right, arc falling
// from the crescent's lower tip down to the right.
//
// Canonical form (any window modelling the emblem follows these numbers):
// - crescent: outer circle centre O=(0, 0.18) r=0.42, cut by inner circle
//   centre (0.17, 0.18) r=0.335 (plate-centre coordinates, metres).
// - descending arc: quadratic bezier from the crescent's lower tip
//   P0=(-0.259, -0.151) via P1=(0, -0.48) to P2=(0.44, -0.52); its first
//   cell IS the crescent's tip cell — one continuous mark.
// - cell pitch 0.11 m; plate 1.32 x 1.54 m dark bronze; mark gold.

const CELL = 0.11;
const GOLD = '#d8a83c';
const PLATE = '#2e3a42';
const POST = '#5a4632';

export type EmblemCell = { x: number; y: number; part: 'crescent' | 'arc' };

function buildCells(): EmblemCell[] {
  const cells = new Map<string, EmblemCell>();
  const put = (x: number, y: number, part: EmblemCell['part']) => {
    const key = `${Math.round(x / CELL)},${Math.round(y / CELL)}`;
    if (!cells.has(key)) cells.set(key, { x: Math.round(x / CELL) * CELL, y: Math.round(y / CELL) * CELL, part });
  };
  // Crescent: outer disc minus shifted inner disc.
  for (let gx = -5; gx <= 5; gx++) {
    for (let gy = -7; gy <= 7; gy++) {
      const x = gx * CELL, y = gy * CELL;
      const dOuter = Math.hypot(x - 0, y - 0.18);
      const dInner = Math.hypot(x - 0.17, y - 0.18);
      if (dOuter <= 0.42 && dInner > 0.335) put(x, y, 'crescent');
    }
  }
  // Descending arc: bezier from the crescent's lower tip, snapped to grid.
  const P0 = { x: -0.259, y: -0.151 }, P1 = { x: 0, y: -0.48 }, P2 = { x: 0.44, y: -0.52 };
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = (1 - t) * (1 - t) * P0.x + 2 * (1 - t) * t * P1.x + t * t * P2.x;
    const y = (1 - t) * (1 - t) * P0.y + 2 * (1 - t) * t * P1.y + t * t * P2.y;
    put(x, y, 'arc');
  }
  return [...cells.values()];
}

export const SHIP_EMBLEM_CELLS: readonly EmblemCell[] = buildCells();

const materials = new Map<string, MeshLambertMaterial>();
function mat(hex: string): MeshLambertMaterial {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}

const tmp = new Matrix4();
function box(list: BoxGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new BoxGeometry(w, h, d);
  tmp.makeTranslation(x, y, z);
  g.applyMatrix4(tmp);
  list.push(g);
}

export function createShipEmblemPiece(): Group {
  const piece = new Group();
  const plateGeos: BoxGeometry[] = [];
  const postGeos: BoxGeometry[] = [];
  const goldGeos: BoxGeometry[] = [];
  // Post and plate (plate centre at y=1.62, face toward +z).
  box(postGeos, 0.12, 1.0, 0.12, 0, 0.5, -0.1);
  box(plateGeos, 1.32, 1.54, 0.07, 0, 1.62, 0);
  for (const c of SHIP_EMBLEM_CELLS) {
    box(goldGeos, 0.104, 0.104, 0.03, c.x, 1.62 + c.y, 0.05);
  }
  const add = (geos: BoxGeometry[], hex: string) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    if (merged) piece.add(new Mesh(merged, mat(hex)));
  };
  add(postGeos, POST);
  add(plateGeos, PLATE);
  add(goldGeos, GOLD);
  return piece;
}

export type EmblemPlacement = { east: number; north: number; heading?: number };

export function mountShipEmblems(
  parent: Group,
  placements: readonly EmblemPlacement[],
  heightAt: (east: number, north: number) => number,
): { group: Group; placed: number; dispose: () => void } {
  const group = new Group();
  let placed = 0;
  for (const p of placements) {
    const piece = createShipEmblemPiece();
    piece.position.set(p.east, heightAt(p.east, p.north), -p.north);
    piece.rotation.y = p.heading ?? 0;
    group.add(piece);
    placed++;
  }
  parent.add(group);
  return {
    group,
    placed,
    dispose: () => {
      parent.remove(group);
      group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
  };
}
