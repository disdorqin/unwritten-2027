import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, cloud-pavilion approach (2026-11-27 four-sector sprint,
 * atlas cell `pavilion-approach`).
 *
 * The lower-cloud pavilion at (773.257, 739.208) and its trail-approach bridge
 * and pavilion-pier base are D2 canonical assets; this module never touches
 * them. It only adds the surrounding stone landform the canonical summit field
 * does not draw: a short flight of approach steps climbing from the south
 * toward the pavilion, a square stone viewing platform on the gentle south
 * slope, a retaining bank on the platform's downhill (north) edge, and a stone
 * guard rail of posts and bars around the platform perimeter.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. All pieces sit
 * outside the pavilion's 16 m reserved zone; the pavilion body, bridge and
 * piers stay clear.
 */

export type PavilionApproachHeightAt = (east: number, north: number) => number | undefined;

export const c2SummitEastPavilionApproachSpec = Object.freeze({
  // Stone landform around the D2 lower-cloud pavilion.
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  reserved: [
    { east: 773.257, north: 739.208, radius: 16 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Stone palette for steps, platform, bank and guard rail.
  palette: [
    '#d9d4c1', // 0 step slab
    '#e8e2cf', // 1 platform slab
    '#b8b4a5', // 2 platform shade
    '#929891', // 3 bank stone
    '#7d8583', // 4 bank shade
    '#aaa38f', // 5 rail post
    '#cddde6', // 6 rail bar
    '#fff7e4', // 7 step light
  ] as const,
});

export type PavilionApproachPiece = Readonly<{
  family: 'steps' | 'platform' | 'bank' | 'rail';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2SummitEastPavilionApproachSpec.sectorWest && n >= c2SummitEastPavilionApproachSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2SummitEastPavilionApproachSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2SummitEastPavilionApproachSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/**
 * Plan is derived from the authored layout and the canonical sampler alone.
 * Nothing is emitted where the host has no ground, where the seam is not
 * converged, or where a neighbouring owner's site lives.
 */
export function planC2SummitEastPavilionApproach(heightAt: PavilionApproachHeightAt): readonly PavilionApproachPiece[] {
  const out: PavilionApproachPiece[] = [];
  const s = c2SummitEastPavilionApproachSpec;
  // Each piece seats on the canonical ground at its own centre; the caller
  // passes a y-offset so nothing buries into a sloping surface.
  const push = (
    family: PavilionApproachPiece['family'], e: number, n: number, yOffset: number,
    w: number, h: number, d: number, yaw: number, shade: number,
  ) => {
    if (!inSector(e, n) || boundaryWeight(e, n) < .999) return;
    if (reservedDistance(e, n) < 2) return;
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground)) return;
    const y = ground + yOffset;
    if (!Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return;
    out.push({ family, east: e, north: n, y, w, h, d, yaw, shade });
  };

  // a) Approach steps: a 4-step flight on the south slope, each step seated
  // on the canonical ground at its own position, long axis along the tangent
  // toward the pavilion (north).
  for (let i = 0; i < 4; i++) {
    const north = 758 + i * 1.5;
    push('steps', 773, north, 0, 3, .5, 1.5, 0, i % 2 === 0 ? 0 : 7);
  }

  // b) Viewing platform: a square 8x8 stone platform 20 m south of the
  // pavilion, split into four 4x4 slabs, each seated on its own ground.
  for (const row of [759, 763]) {
    for (const east of [771, 775]) {
      const k = (row === 759 ? 0 : 1) + (east === 771 ? 0 : 1);
      push('platform', east, row, 0, 4, .5, 4, 0, k % 2 === 0 ? 1 : 2);
    }
  }

  // c) Retaining bank: the platform's downhill side is its north edge (the
  // canonical ground descends toward the pavilion). Stone bank along that
  // edge, seated on the ground and rising 1.5 m.
  for (let i = 0; i < 4; i++) {
    push('bank', 770 + i * 2, 757.5, 0, 2, 1.5, 1, 0, i % 2 === 0 ? 3 : 4);
  }

  // d) Guard rail: stone posts and bars around the platform perimeter.
  // Posts at the corners, edge midpoints and the north-edge centre; bars run
  // between neighbouring posts at rail height.
  const posts: ReadonlyArray<readonly [number, number]> = [
    [769, 757.5], [773, 757.5], [777, 757.5],
    [769, 761.25], [777, 761.25],
    [769, 765], [773, 765], [777, 765],
  ];
  for (const [e, n] of posts) {
    push('rail', e, n, 0, .4, 1.2, .4, 0, 5);
  }
  const bars: ReadonlyArray<readonly [number, number, number, number]> = [
    // e, n, w (along edge), d (across edge)
    [771, 757.5, 3.8, .2], [775, 757.5, 3.8, .2],
    [771, 765, 3.8, .2], [775, 765, 3.8, .2],
    [769, 759.375, .2, 3.5], [769, 763.125, .2, 3.5],
    [777, 759.375, .2, 3.5], [777, 763.125, .2, 3.5],
  ];
  for (const [e, n, w, d] of bars) {
    push('rail', e, n, 1.0, w, .18, d, 0, 6);
  }

  return out;
}

function makePaletteTexture() {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = ((x * 7 + y * 11 + (x >> 2) * (y >> 3)) % 19) - 9;
      const seam = x === 0 || y === 0 ? -14 : 0;
      const value = 255 + grain + seam;
      pixels[i] = Math.min(255, Math.max(0, value));
      pixels[i + 1] = Math.min(255, Math.max(0, value - 2));
      pixels[i + 2] = Math.min(255, Math.max(0, value - 6));
      pixels[i + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mountC2SummitEastPavilionApproach(
  heightAt: PavilionApproachHeightAt,
  pieces: readonly PavilionApproachPiece[] = planC2SummitEastPavilionApproach(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-pavilion-approach';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-summit-east-pavilion-approach-boxes';
  const transform = new Object3D();
  const tint = new Color();
  const box = new Matrix4();
  let index = 0;
  for (const piece of pieces) {
    transform.position.set(piece.east, piece.y + piece.h / 2, -piece.north);
    transform.rotation.set(0, piece.yaw, 0);
    transform.scale.set(piece.w, piece.h, piece.d);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tint.set(c2SummitEastPavilionApproachSpec.palette[piece.shade % 8]!));
    index++;
  }
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  const colliders = pieces.map(p => ({
    west: p.east - Math.max(p.w, p.d) / 2, east: p.east + Math.max(p.w, p.d) / 2,
    south: p.north - Math.max(p.w, p.d) / 2, north: p.north + Math.max(p.w, p.d) / 2,
    bottom: p.y, top: p.y + p.h,
  }));
  function blocked(east: number, north: number, feet: number, radius = .27, body = 1.8) {
    for (const c of colliders) {
      const dx = Math.max(c.west - east, 0, east - c.east);
      const dn = Math.max(c.south - north, 0, north - c.north);
      if (Math.hypot(dx, dn) < radius && feet + body > c.bottom && feet < c.top) return true;
    }
    return false;
  }
  function dispose() {
    group.removeFromParent();
    mesh.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }
  return { group, mesh, pieces, colliders, blocked, dispose,
    stats: () => ({
      pieces: pieces.length, batches: 1, lights: 0,
      steps: pieces.filter(p => p.family === 'steps').length,
      platform: pieces.filter(p => p.family === 'platform').length,
      bank: pieces.filter(p => p.family === 'bank').length,
      rail: pieces.filter(p => p.family === 'rail').length,
    }) };
}
