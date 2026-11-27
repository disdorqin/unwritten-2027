import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, third-round avalanche chute (2026-11-27 four-sector
 * sprint, atlas cell `avalanche-chute`).
 *
 * A natural snow chute down the east subpeak's south-east flank: a packed
 * snow runway, two snow banks flanking it, and a fan of deposited snow and
 * exposed rock at the run-out. It adds the visible snow-landform furniture
 * the canonical summit field does not draw.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. It does not
 * touch the E01 ridge benches and gully, the E02 camp, the E05 sled chute,
 * or any D2 site; those stay clear.
 */

export type AvalancheHeightAt = (east: number, north: number) => number | undefined;

export const c2EastAvalancheChuteSpec = Object.freeze({
  // Snow chute down the east subpeak south-east flank.
  chuteFrom: { east: 680, north: 990 },
  chuteTo: { east: 760, north: 910 },
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  // Wider than a footway: a chute is a open snow channel.
  halfWidth: 4.0,
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Snow-and-rock palette.
  palette: [
    '#f4f7f8', // 0 packed snow (chute floor)
    '#cddde6', // 1 snow shade
    '#e6eef2', // 2 snow bank
    '#d8e2e8', // 3 snow fan
    '#929891', // 4 rock
    '#7d8583', // 5 dark rock
    '#b8c4cc', // 6 snow bank shade
    '#fff7e4', // 7 snow light
  ] as const,
});

export type AvalanchePiece = Readonly<{
  family: 'floor' | 'bank' | 'fan' | 'rock';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastAvalancheChuteSpec.sectorWest && n >= c2EastAvalancheChuteSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastAvalancheChuteSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastAvalancheChuteSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/** Sample the chute centreline into a dense polyline (~one point per 6 m). */
function sampleChute() {
  const s = c2EastAvalancheChuteSpec;
  const a = s.chuteFrom, b = s.chuteTo;
  const len = Math.hypot(b.east - a.east, b.north - a.north);
  const steps = Math.max(2, Math.round(len / 6));
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
 * the host has no ground, where the seam is not converged, or where a
 * neighbouring owner's site lives.
 */
export function planC2EastAvalancheChute(heightAt: AvalancheHeightAt): readonly AvalanchePiece[] {
  const out: AvalanchePiece[] = [];
  const s = c2EastAvalancheChuteSpec;
  // Each piece seats on the canonical ground at its own centre.
  const push = (
    family: AvalanchePiece['family'], e: number, n: number, yOffset: number,
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

  const samples = sampleChute();
  const yaw = Math.atan2(
    s.chuteTo.north - s.chuteFrom.north, s.chuteTo.east - s.chuteFrom.east,
  );
  const ne = Math.sin(yaw), nn = -Math.cos(yaw);

  // Chute floor and flanking snow banks for every segment. Banks ride the
  // real surface on both sides; the floor is a thin packed-snow course.
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!, b = samples[i + 1]!;
    const de = b.east - a.east, dn = b.north - a.north;
    const len = Math.hypot(de, dn);
    if (len < .2) continue;
    const segYaw = Math.atan2(dn, de);
    const mx = (a.east + b.east) / 2, my = (a.north + b.north) / 2;
    // Packed-snow floor.
    push('floor', mx, my, 0, len * 1.05, .3, 2 * s.halfWidth, segYaw, i % 2 === 0 ? 0 : 1);
    // Flanking snow banks, higher than the floor so the channel reads as cut.
    for (const side of [-1, 1]) {
      const be = mx + side * ne * (s.halfWidth + 1.5);
      const bn = my + side * nn * (s.halfWidth + 1.5);
      push('bank', be, bn, 0, len * .95, 2.0, 3.0, segYaw, side < 0 ? 2 : 6);
    }
  }

  // Run-out fan: deposited snow and exposed rock where the chute flattens.
  const end = s.chuteTo;
  const fanYaw = yaw + Math.PI / 2;
  for (let k = 0; k < 4; k++) {
    const ang = fanYaw + (k - 1.5) * .5;
    const e = end.east + Math.cos(ang) * (5 + k * 2);
    const n = end.north + Math.sin(ang) * (5 + k * 2);
    push('fan', e, n, 0, 5, 1.5, 5, ang, k % 2 === 0 ? 3 : 7);
  }
  // Exposed rock at the run-out edge.
  for (let k = 0; k < 3; k++) {
    const ang = fanYaw + (k - 1) * .7;
    const e = end.east + Math.cos(ang) * 9;
    const n = end.north + Math.sin(ang) * 9;
    push('rock', e, n, 0, 4, 3, 4, ang, k === 1 ? 4 : 5);
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

export function mountC2EastAvalancheChute(
  heightAt: AvalancheHeightAt,
  pieces: readonly AvalanchePiece[] = planC2EastAvalancheChute(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-avalanche-chute';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-avalanche-chute-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastAvalancheChuteSpec.palette[piece.shade % 8]!));
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
      floor: pieces.filter(p => p.family === 'floor').length,
      bank: pieces.filter(p => p.family === 'bank').length,
      fan: pieces.filter(p => p.family === 'fan').length,
      rock: pieces.filter(p => p.family === 'rock').length,
    }) };
}
