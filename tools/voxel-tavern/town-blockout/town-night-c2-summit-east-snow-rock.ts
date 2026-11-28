import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, third-round snow-rock and ice-fall group (2026-11-27
 * four-sector sprint, atlas cell `snow-rock`).
 *
 * A natural snow-rock and ice-fall group on the east snow slope, east of the
 * E09 avalanche chute: a cluster of snow-rock boulders, ice falls hung from
 * their rims, and flat snow ledges. It adds the visible snow-landform
 * furniture the canonical summit field does not draw.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. The group
 * sits on the lower snow slope, below the E04 forest belt floor, so it never
 * overlaps the E04 vegetation or the E09 avalanche chute, and it leaves every
 * D2 site clear.
 */

export type SnowRockHeightAt = (east: number, north: number) => number | undefined;

export const c2EastSnowRockSpec = Object.freeze({
  // Snow-rock and ice-fall group on the east snow slope, east of the E09
  // avalanche chute.
  cluster: { east: 650, north: 950 },
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  // The E04 forest belt plants only at ground >= 528; keeping the group on
  // the lower snow slope (ground < 528) keeps the two from ever overlapping.
  forestFloor: 528,
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Snow-rock palette: white, gray and blue-white.
  palette: [
    '#f4f7f8', // 0 snow white
    '#e6eef2', // 1 light snow
    '#cddde6', // 2 gray white
    '#d8e2e8', // 3 blue white
    '#b8c4cc', // 4 gray
    '#a8b8c4', // 5 blue gray
    '#fff7e4', // 6 warm white
    '#9fb0c0', // 7 blue white shade
  ] as const,
});

export type SnowRockFamily = 'rock' | 'icefall' | 'ledge';

export type SnowRockPiece = Readonly<{
  family: SnowRockFamily;
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastSnowRockSpec.sectorWest && n >= c2EastSnowRockSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastSnowRockSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastSnowRockSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/**
 * Plan is derived from the canonical sampler alone. Nothing is emitted where
 * the host has no ground, where the seam is not converged, where the ground
 * rises into the E04 forest belt, or where a neighbouring owner's site lives.
 */
export function planC2EastSnowRock(heightAt: SnowRockHeightAt): readonly SnowRockPiece[] {
  const out: SnowRockPiece[] = [];
  const s = c2EastSnowRockSpec;
  // Each piece seats on the canonical ground at its own centre; the ice fall
  // rides the rock-top height (yOffset) of the boulder it hangs from.
  const push = (
    family: SnowRockFamily, e: number, n: number, yOffset: number,
    w: number, h: number, d: number, yaw: number, shade: number,
  ) => {
    if (!inSector(e, n) || boundaryWeight(e, n) < .999) return false;
    if (reservedDistance(e, n) < 2) return false;
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground)) return false;
    // Keep the group on the lower snow slope, below the E04 forest belt.
    if (ground >= s.forestFloor) return false;
    const y = ground + yOffset;
    if (!Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return false;
    out.push({ family, east: e, north: n, y, w, h, d, yaw, shade });
    return true;
  };

  // Snow-rock boulders: six around the cluster centre on the lower slope.
  const rockLayout = [
    { ang: 0.0, r: 8, w: 5.5, d: 5.0, h: 3.0, shade: 0 },
    { ang: 1.047, r: 12, w: 6.5, d: 6.0, h: 4.0, shade: 2 },
    { ang: 2.094, r: 7, w: 5.0, d: 4.5, h: 2.5, shade: 4 },
    { ang: 3.141, r: 13, w: 7.0, d: 6.5, h: 3.5, shade: 1 },
    { ang: 4.188, r: 9, w: 6.0, d: 5.5, h: 4.0, shade: 3 },
    { ang: 5.235, r: 11, w: 5.5, d: 5.0, h: 3.0, shade: 5 },
  ];
  const placedRocks: { east: number; north: number; h: number; yaw: number }[] = [];
  for (const rk of rockLayout) {
    const e = s.cluster.east + Math.cos(rk.ang) * rk.r;
    const n = s.cluster.north + Math.sin(rk.ang) * rk.r;
    if (push('rock', e, n, 0, rk.w, rk.h, rk.d, rk.ang, rk.shade)) {
      placedRocks.push({ east: e, north: n, h: rk.h, yaw: rk.ang });
    }
  }

  // Ice falls hung from four boulder rims, offset outward so the rock top
  // stays walkable. The ice fall base sits on the boulder's top.
  const iceIndices = [0, 2, 4, 5];
  const iceShades = [3, 5, 2, 4];
  let iceIdx = 0;
  for (const i of iceIndices) {
    const rk = placedRocks[i];
    if (!rk) continue;
    const e = rk.east + Math.cos(rk.yaw) * 1.8;
    const n = rk.north + Math.sin(rk.yaw) * 1.8;
    push('icefall', e, n, rk.h, 0.8, 1.5, 0.8, rk.yaw, iceShades[iceIdx++] ?? 3);
  }

  // Flat snow ledges between the boulders.
  const ledgeLayout = [
    { ang: 0.523, r: 14, w: 7.0, d: 5.0, shade: 0 },
    { ang: 2.618, r: 10, w: 6.0, d: 4.0, shade: 1 },
    { ang: 4.712, r: 16, w: 8.0, d: 5.5, shade: 6 },
  ];
  for (const lg of ledgeLayout) {
    const e = s.cluster.east + Math.cos(lg.ang) * lg.r;
    const n = s.cluster.north + Math.sin(lg.ang) * lg.r;
    push('ledge', e, n, 0, lg.w, 0.8, lg.d, lg.ang, lg.shade);
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

export function mountC2EastSnowRock(
  heightAt: SnowRockHeightAt,
  pieces: readonly SnowRockPiece[] = planC2EastSnowRock(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-snow-rock';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-snow-rock-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastSnowRockSpec.palette[piece.shade % 8]!));
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
      rock: pieces.filter(p => p.family === 'rock').length,
      icefall: pieces.filter(p => p.family === 'icefall').length,
      ledge: pieces.filter(p => p.family === 'ledge').length,
    }) };
}
