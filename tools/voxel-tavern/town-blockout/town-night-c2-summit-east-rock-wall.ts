import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, third-round east-subpeak south-east rock-wall detail
 * (2026-11-27 four-sector sprint, atlas cell `summit-east-rock-wall`).
 *
 * Rock-wall detail on the east subpeak's south-east rock wall: rock
 * outcrops on the wall face, thin fissure slabs in the rock seams and low
 * wall-base courses at the wall foot. It adds the visible rock-wall
 * furniture the canonical summit field does not draw.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. It stays on
 * the wall's inner face (inside the E01 south-east rock band's radius 46 in
 * the band's stretched frame) so it never overlaps the E01 rock band
 * (radius 46-90), the E05 sled chute, or any D2 site; those stay clear.
 */

export type RockWallHeightAt = (east: number, north: number) => number | undefined;

export const c2EastSummitEastRockWallSpec = Object.freeze({
  // East subpeak south-east rock wall detail anchor.
  centreEast: 620, centreNorth: 1050,
  // E01 south-east rock band: centre (590,1080) and the anisotropic stretch
  // its three bench rings use (radius 46, 68, 90 in this stretched frame).
  bandCentreEast: 590, bandCentreNorth: 1080,
  bandStretchEast: 1.06, bandStretchNorth: 1.25,
  bandInnerRadius: 46,
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Rock palette.
  palette: [
    '#8a8478', // 0 wall base
    '#6f6a60', // 1 dark rock
    '#9a9388', // 2 outcrop
    '#7d7669', // 3 outcrop shade
    '#b0a899', // 4 fissure
    '#5f5a51', // 5 dark fissure
    '#a49c8e', // 6 wall light
    '#c9c2b4', // 7 wall bright
  ] as const,
});

export type RockWallPiece = Readonly<{
  family: 'outcrop' | 'fissure' | 'base';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastSummitEastRockWallSpec.sectorWest && n >= c2EastSummitEastRockWallSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastSummitEastRockWallSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastSummitEastRockWallSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/**
 * Radius in the E01 band's stretched frame. The E01 bench rings sit at
 * radius 46, 68, 90 here, so the rock wall detail stays at radius below 46
 * (the wall's inner face and broken sections) and never overlaps the band.
 */
function bandRadius(e: number, n: number) {
  const s = c2EastSummitEastRockWallSpec;
  return Math.hypot((e - s.bandCentreEast) / s.bandStretchEast, (n - s.bandCentreNorth) / s.bandStretchNorth);
}

/**
 * Plan is derived from the authored rock-wall anchors and the canonical
 * sampler alone. Nothing is emitted where the host has no ground, where the
 * seam is not converged, where a neighbouring owner's site lives, or where
 * the point would enter the E01 rock band.
 */
export function planC2EastSummitEastRockWall(heightAt: RockWallHeightAt): readonly RockWallPiece[] {
  const out: RockWallPiece[] = [];
  const s = c2EastSummitEastRockWallSpec;
  // Each piece seats on the canonical ground at its own centre; the caller
  // passes a y-offset so nothing buries into a sloping surface.
  const push = (
    family: RockWallPiece['family'], e: number, n: number, yOffset: number,
    w: number, h: number, d: number, yaw: number, shade: number,
  ) => {
    if (!inSector(e, n) || boundaryWeight(e, n) < .999) return;
    if (reservedDistance(e, n) < 2) return;
    if (bandRadius(e, n) > s.bandInnerRadius - .5) return;
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground)) return;
    const y = ground + yOffset;
    if (!Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return;
    out.push({ family, east: e, north: n, y, w, h, d, yaw, shade });
  };

  // Rock outcrops on the wall face: broken rock bulges standing on the
  // sampled surface, each with its own height so the wall reads as a
  // fractured rock face rather than a level course.
  const outcrops: ReadonlyArray<readonly [number, number, number, number]> = [
    [620, 1050, 5.0, 3.2],
    [624, 1052, 4.6, 2.6],
    [616, 1046, 5.4, 4.0],
    [628, 1050, 4.4, 2.2],
    [612, 1042, 5.2, 3.6],
    [622, 1044, 4.8, 2.8],
    [618, 1042, 5.0, 3.4],
  ];
  for (let i = 0; i < outcrops.length; i++) {
    const [e, n, w, h] = outcrops[i]!;
    push('outcrop', e, n, 0, w, h, w, 0, i % 2 === 0 ? 2 : 3);
  }

  // Fissures: thin slabs laid along the wall's fracture lines, low on the
  // surface so they read as cracks rather than blocks.
  const fissures: ReadonlyArray<readonly [number, number, number, number]> = [
    [626, 1044, 8.0, 1.4],
    [621, 1040, 7.0, 1.3],
    [614, 1050, 8.0, 1.5],
    [628, 1046, 7.0, 1.3],
  ];
  for (let i = 0; i < fissures.length; i++) {
    const [e, n, w, d] = fissures[i]!;
    push('fissure', e, n, 0, w, 1, d, .5, i % 2 === 0 ? 4 : 5);
  }

  // Wall bases: low, wide courses at the wall foot, anchoring the outcrops
  // and fissures to the rock wall.
  const bases: ReadonlyArray<readonly [number, number, number, number]> = [
    [629, 1048, 8.0, 6.0],
    [624, 1048, 7.0, 5.5],
    [616, 1050, 8.0, 6.0],
  ];
  for (let i = 0; i < bases.length; i++) {
    const [e, n, w, d] = bases[i]!;
    push('base', e, n, 0, w, 1.5, d, 0, i % 2 === 0 ? 0 : 6);
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

export function mountC2EastSummitEastRockWall(
  heightAt: RockWallHeightAt,
  pieces: readonly RockWallPiece[] = planC2EastSummitEastRockWall(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-rock-wall';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-summit-east-rock-wall-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastSummitEastRockWallSpec.palette[piece.shade % 8]!));
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
      outcrop: pieces.filter(p => p.family === 'outcrop').length,
      fissure: pieces.filter(p => p.family === 'fissure').length,
      base: pieces.filter(p => p.family === 'base').length,
    }) };
}
