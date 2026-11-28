import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, third-round east-subpeak summit viewing rock (2026-11-27
 * four-sector sprint, atlas cell `summit-rock`).
 *
 * A ring stone viewing platform on the east subpeak summit: eight arc slabs
 * around the peak centre, stone guard columns and crossbars on the ring edge,
 * a central marker stone, and a three-step entry stair on the south side. It
 * adds the visible summit furniture the canonical summit field does not draw.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. It does not
 * touch the E01 south-east rock band (radius 46-90 around the subpeak), the
 * E02 camp, the E05 sled chute, or any D2 site; those stay clear.
 */

export type SummitRockHeightAt = (east: number, north: number) => number | undefined;

export const c2EastSummitRockSpec = Object.freeze({
  // East subpeak summit centre (D2 canonical shoulder peak, height 610).
  centreEast: 590, centreNorth: 1080,
  ringRadius: 8,
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Stone palette. Light slabs stay legible against the slate summit shell
  // at this 2.2 km mountain scale.
  palette: [
    '#d9d4c1', // 0 slab
    '#b8b4a5', // 1 slab shade
    '#929891', // 2 stone
    '#e8e2cf', // 3 light slab
    '#aaa38f', // 4 stone shade
    '#7d8583', // 5 dark stone
    '#fff7e4', // 6 marker light
    '#cddde6', // 7 step
  ] as const,
});

export type SummitRockPiece = Readonly<{
  family: 'platform' | 'rail' | 'marker' | 'step';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastSummitRockSpec.sectorWest && n >= c2EastSummitRockSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastSummitRockSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastSummitRockSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/**
 * Plan is derived from the canonical sampler alone. Nothing is emitted where
 * the host has no ground, where the seam is not converged, or where a
 * neighbouring owner's site lives.
 */
export function planC2EastSummitRock(heightAt: SummitRockHeightAt): readonly SummitRockPiece[] {
  const out: SummitRockPiece[] = [];
  const s = c2EastSummitRockSpec;
  // Each piece seats on the canonical ground at its own centre; the caller
  // passes a y-offset so nothing buries into a sloping surface.
  const push = (
    family: SummitRockPiece['family'], e: number, n: number, yOffset: number,
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

  const { centreEast: ce, centreNorth: cn, ringRadius: r } = s;
  // Arc length of one of the 8 ring segments.
  const arcLen = (2 * Math.PI * r) / 8;

  // Ring platform: 8 arc slabs around the summit centre, each centred on the
  // radius ring with its yaw along the counterclockwise tangent.
  for (let k = 0; k < 8; k++) {
    const theta = (k * Math.PI) / 4;
    const e = ce + r * Math.cos(theta);
    const n = cn + r * Math.sin(theta);
    push('platform', e, n, 0, arcLen * .98, .6, 4, theta + Math.PI / 2, k % 2 === 0 ? 0 : 3);
  }

  // Guard columns on the ring edge plus crossbars riding the arc between
  // adjacent columns. The crossbar sits at the column mid-height on the
  // authored surface plus a fixed rise.
  for (let k = 0; k < 8; k++) {
    const theta = (k * Math.PI) / 4;
    const e = ce + r * Math.cos(theta);
    const n = cn + r * Math.sin(theta);
    push('rail', e, n, 0, .5, 1.2, .5, theta + Math.PI / 2, 5);
    const mid = (theta + ((k + 1) * Math.PI) / 4) / 2;
    const be = ce + r * Math.cos(mid);
    const bn = cn + r * Math.sin(mid);
    push('rail', be, bn, .6, arcLen * .9, .2, .3, mid + Math.PI / 2, 2);
  }

  // Central marker stone on the summit centre.
  push('marker', ce, cn, 0, 2, 4, 2, 0, 6);

  // Entry steps on the south side, leading up to the ring edge.
  for (let i = 0; i < 3; i++) {
    const n = 1088 + i * 3.5;
    push('step', ce, n, 0, 3, .5, 1.5, 0, 7);
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

export function mountC2EastSummitRock(
  heightAt: SummitRockHeightAt,
  pieces: readonly SummitRockPiece[] = planC2EastSummitRock(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-summit-rock';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-summit-rock-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastSummitRockSpec.palette[piece.shade % 8]!));
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
      platform: pieces.filter(p => p.family === 'platform').length,
      rail: pieces.filter(p => p.family === 'rail').length,
      marker: pieces.filter(p => p.family === 'marker').length,
      step: pieces.filter(p => p.family === 'step').length,
    }) };
}
