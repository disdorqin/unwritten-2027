import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, third-round east-gully downstream drop and steps
 * (2026-11-27 four-sector sprint, atlas cell `gully-drop`).
 *
 * A stone dropway down the east gully's downstream flank: a run of channel
 * steps, flanking stone banks, a short end stair and a plunge pool at the
 * gully mouth. It extends the E01 gully end downstream and adds the visible
 * watercourse furniture the canonical summit field does not draw.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. It stays clear
 * of the E01 gully rectangle, the E02 camp, the E05 sled chute, and any D2
 * site; those stay clear.
 */

export type GullyDropHeightAt = (east: number, north: number) => number | undefined;

export const c2EastGullyDropSpec = Object.freeze({
  // East gully downstream dropway: from the E01 gully end down the flank.
  dropFrom: { east: 760, north: 590 },
  dropTo: { east: 784, north: 532 },
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  // E01 gully rectangle (upstream owner); the dropway is its downstream
  // extension and must not overlap it.
  upstreamGully: { west: 678, east: 842, south: 560, north: 620 },
  upstreamClear: 1.0,
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Stone palette.
  palette: [
    '#d9d4c1', // 0 channel step
    '#b8b4a5', // 1 stone shade
    '#929891', // 2 stone
    '#e8e2cf', // 3 light step
    '#aaa38f', // 4 bank shade
    '#7d8583', // 5 dark stone
    '#fff7e4', // 6 plunge light
    '#cddde6', // 7 step shade
  ] as const,
});

export type GullyDropPiece = Readonly<{
  family: 'drop' | 'bank' | 'step' | 'pool';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastGullyDropSpec.sectorWest && n >= c2EastGullyDropSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastGullyDropSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastGullyDropSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/** Distance from a point to the E01 gully rectangle (0 inside it). */
function upstreamGullyDistance(e: number, n: number) {
  const g = c2EastGullyDropSpec.upstreamGully;
  const dx = Math.max(g.west - e, 0, e - g.east);
  const dy = Math.max(g.south - n, 0, n - g.north);
  return Math.hypot(dx, dy);
}

/** Sample the dropway centreline into a dense polyline (~one point per 5 m). */
function sampleDrop() {
  const s = c2EastGullyDropSpec;
  const a = s.dropFrom, b = s.dropTo;
  const len = Math.hypot(b.east - a.east, b.north - a.north);
  const steps = Math.max(2, Math.round(len / 5));
  const out: { east: number; north: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    out.push({ east: a.east + (b.east - a.east) * t, north: a.north + (b.north - a.north) * t });
  }
  out.push({ east: b.east, north: b.north });
  return out;
}

/**
 * Plan is derived from the canonical sampler alone. Nothing is emitted where
 * the host has no ground, where the seam is not converged, where the E01
 * gully rectangle lives, or where a neighbouring owner's site lives.
 */
export function planC2EastGullyDrop(heightAt: GullyDropHeightAt): readonly GullyDropPiece[] {
  const out: GullyDropPiece[] = [];
  const s = c2EastGullyDropSpec;
  // Each piece seats on the canonical ground at its own centre; the caller
  // passes a y-offset so nothing buries into a sloping surface.
  const push = (
    family: GullyDropPiece['family'], e: number, n: number, yOffset: number,
    w: number, h: number, d: number, yaw: number, shade: number,
  ) => {
    if (!inSector(e, n) || boundaryWeight(e, n) < .999) return;
    if (reservedDistance(e, n) < 2) return;
    if (upstreamGullyDistance(e, n) < s.upstreamClear) return;
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground)) return;
    const y = ground + yOffset;
    if (!Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return;
    out.push({ family, east: e, north: n, y, w, h, d, yaw, shade });
  };

  const samples = sampleDrop();
  const yaw = Math.atan2(
    s.dropTo.north - s.dropFrom.north, s.dropTo.east - s.dropFrom.east,
  );
  const ne = Math.sin(yaw), nn = -Math.cos(yaw);

  // Channel steps and flanking banks for every segment. Steps ride the real
  // surface at the segment midpoint; banks ride the surface on both sides.
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!, b = samples[i + 1]!;
    const de = b.east - a.east, dn = b.north - a.north;
    const len = Math.hypot(de, dn);
    if (len < .2) continue;
    const segYaw = Math.atan2(dn, de);
    const mx = (a.east + b.east) / 2, my = (a.north + b.north) / 2;
    // Channel drop step.
    push('drop', mx, my, 0, len * 1.05, .5, 3, segYaw, i % 2 === 0 ? 0 : 2);
    // Flanking stone banks, higher than the step so the channel reads as cut.
    for (const side of [-1, 1]) {
      const be = mx + side * ne * 1.8;
      const bn = my + side * nn * 1.8;
      push('bank', be, bn, 0, len * .9, 2.0, 1.2, segYaw, side < 0 ? 4 : 5);
    }
  }

  // End steps: three stone steps at the gully mouth, lined along the path.
  const end = s.dropTo;
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  for (let k = 0; k < 3; k++) {
    const e = end.east - cosYaw * 1.8 * k;
    const n = end.north - sinYaw * 1.8 * k;
    push('step', e, n, 0, 3, .5, 1.5, yaw, k % 2 === 0 ? 3 : 7);
  }
  // Plunge pool at the gully mouth.
  push('pool', end.east, end.north, 0, 6, .5, 6, yaw, 6);

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

export function mountC2EastGullyDrop(
  heightAt: GullyDropHeightAt,
  pieces: readonly GullyDropPiece[] = planC2EastGullyDrop(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-gully-drop';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-gully-drop-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastGullyDropSpec.palette[piece.shade % 8]!));
    index++;
  }
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  // Collider is generated from the same pieces and the same bottom semantics.
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
      drop: pieces.filter(p => p.family === 'drop').length,
      bank: pieces.filter(p => p.family === 'bank').length,
      step: pieces.filter(p => p.family === 'step').length,
      pool: pieces.filter(p => p.family === 'pool').length,
    }) };
}
