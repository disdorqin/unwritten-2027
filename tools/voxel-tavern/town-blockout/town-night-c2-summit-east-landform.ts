import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, first-round landform (2026-11-27 four-sector sprint).
 *
 * The east shoulder at (590,1080,610 m) belongs to the one canonical summit
 * field. This module never owns a height function: every box is seated on the
 * supplied `heightAt`, which is D2's main-summit block sampler. It adds only
 * the exposed stone work that the summit field does not already draw:
 * stratified rock benches around the east shoulder, a dry gully floor and
 * banks, and a stepped connection toward the central ridge.
 *
 * Strictly east of the sector seam: nothing is emitted at E<300 or N<480,
 * and each family fades to zero inside the 32 m shared boundary.
 */

export type EastHeightAt = (east: number, north: number) => number | undefined;

export const c2EastLandformSpec = Object.freeze({
  east: 590, north: 1080, shoulderHeight: 610,
  gully: { east: 760, north: 590 },
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  // Existing D2 sites that must stay clear; the pavilion, east-gully site and
  // the skywatch ruins are built by their own owner.
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 },
    { east: 760, north: 590, radius: 11 },
    { east: 390, north: 1120, radius: 21 },
  ],
  // Eight sampled stone tones. Light enough to stay legible against the
  // slate summit shell from a standing camera at this 2.2 km mountain scale.
  palette: ['#b8b4a5', '#d9d4c1', '#929891', '#e8e2cf', '#aaa38f', '#f0ebd9', '#7d8583', '#fff7e4'] as const,
});

export type EastLandformPiece = Readonly<{
  family: 'bench' | 'gully' | 'stair';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

const TAU = Math.PI * 2;

function inSector(e: number, n: number) {
  return e >= c2EastLandformSpec.sectorWest && n >= c2EastLandformSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastLandformSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastLandformSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/**
 * Plan is derived from the canonical sampler alone. Nothing is emitted where
 * the host has no ground, where the seam is not converged, or where a
 * neighbouring owner's site lives.
 */
export function planC2EastLandform(heightAt: EastHeightAt): readonly EastLandformPiece[] {
  const out: EastLandformPiece[] = [];
  const push = (
    family: EastLandformPiece['family'], e: number, n: number,
    w: number, h: number, d: number, yaw: number, shade: number,
  ) => {
    if (!inSector(e, n) || boundaryWeight(e, n) < .999) return;
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground) || reservedDistance(e, n) < 3) return;
    out.push({ family, east: e, north: n, y: ground, w, h, d, yaw, shade });
  };

  // Three rock benches on the east shoulder's downhill flank. Each course is
  // keyed to the sampled surface, so the masonry follows the real mountain
  // rather than an invented offset plane.
  const shoulder = c2EastLandformSpec;
  // A strata shelf, not a ring: three broken runs on the downhill (south and
  // east) flank only. Missing blocks are deliberate erosion, and each block's
  // width/height varies against the sampled slope so the runs never read as a
  // drawn circle of identical cubes.
  for (let ring = 0; ring < 3; ring++) {
    const radius = 46 + ring * 22;
    const runs = [
      { from: .08, to: 1.02 },   // east face
      { from: Math.PI * .86, to: Math.PI * 1.52 }, // south flank
    ];
    const tone = [0, 2, 4][ring]!;
    for (const [runIndex, run] of runs.entries()) {
      const count = Math.max(6, Math.round((run.to - run.from) * radius / 9));
      for (let i = 0; i <= count; i++) {
        if ((i + ring + runIndex) % 7 === 3) continue; // eroded gap
        const theta = run.from + (run.to - run.from) * (i / count);
        const wobble = 1 + Math.sin(i * 2.3 + ring) * .06;
        const e = shoulder.east + Math.cos(theta) * radius * 1.06 * wobble;
        const n = shoulder.north + Math.sin(theta) * radius * 1.25 * wobble;
        if (n > shoulder.north + 34) continue;
        const step = (run.to - run.from) * radius / count;
        const w = step * (1.15 + (i % 3) * .18);
        const d = 10 + ring * 2 + (i % 4) * 1.5;
        const h = 2.0 + ring * .6 + (i % 5) * .4;
        push('bench', e, n, w, h, d, -theta + Math.PI / 2, tone + (i % 6 === 0 ? 1 : 0));
        if (i % 3 === 1) push('bench', e, n, w * .78, .55, d * .76, -theta + Math.PI / 2, 7);
      }
    }
  }

  // East gully: a dry stone floor with two facing banks. The floor lies on
  // the sampled ground; the banks sit at sampled ground plus their own height
  // and never invent a bridge across the channel.
  const g = shoulder.gully;
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const e = g.east - 82 + t * 164;
    const n = g.north + Math.sin(t * Math.PI) * 30;
    push('gully', e, n, 8, .5, 10, .18 * Math.sin(t * Math.PI), i % 6);
    for (const side of [-1, 1]) {
      const be = e + side * 9;
      const bn = n + side * 3;
      if (i % 2 === 0) push('gully', be, bn, 4.2, 3.4, 6.5, .18 * Math.sin(t * Math.PI), (i + 3) % 6);
    }
  }

  // Stepped shoulder link: from the east shoulder's lower flank toward the
  // central ridge approach (E≈360, N≈1010). Steps are separate low boxes on
  // the canonical surface, not a graded road authority.
  const from = { east: 540, north: 1075 };
  const to = { east: 368, north: 1000 };
  const steps = 22;
  const yaw = Math.atan2(to.north - from.north, to.east - from.east);
  const span = Math.hypot(to.east - from.east, to.north - from.north) / steps;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = from.east + (to.east - from.east) * t;
    const n = from.north + (to.north - from.north) * t + Math.sin(t * Math.PI) * 10;
    // Overlap each tread along the route so the line reads as a path.
    push('stair', e, n, span * 1.25, .85, 8, yaw, i % 4 === 0 ? 2 : 4);
    if (i % 4 === 0) push('stair', e, n, span * 1.35, .35, 9.2, yaw, 1);
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

export function mountC2EastLandform(heightAt: EastHeightAt, pieces: readonly EastLandformPiece[] = planC2EastLandform(heightAt)) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-landform';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-landform-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastLandformSpec.palette[piece.shade % 8]!));
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
    stats: () => ({ pieces: pieces.length, batches: 1, lights: 0,
      benches: pieces.filter(p => p.family === 'bench').length,
      gully: pieces.filter(p => p.family === 'gully').length,
      stairs: pieces.filter(p => p.family === 'stair').length }) };
}
