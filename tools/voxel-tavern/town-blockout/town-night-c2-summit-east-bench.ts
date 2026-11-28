import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, second-round hairpin bench (2026-11-27 four-sector sprint,
 * atlas cell `hairpin-bench`). A half-masonry rest seat on the concave side of
 * the E01 shoulder stair, where the graded step line bends at (454,1037).
 *
 * Seated entirely on D2's canonical `heightAt`. No terrain grading, no road
 * authority, no duplicate pavilion / facility / station, no world anchor.
 * Nothing is emitted at E<300 / N<480 or inside the 32 m shared boundary.
 */

export type BenchHeightAt = (east: number, north: number) => number | undefined;

export const c2EastBenchSpec = Object.freeze({
  centre: { east: 454, north: 1037 },
  radius: 11,
  // Back wall faces north-west; the seat opens toward the stair and the view.
  arcFrom: 20 * Math.PI / 180,
  arcTo: 200 * Math.PI / 180,
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  reserved: [
    { east: 773.257, north: 739.208, radius: 18 },
    { east: 760, north: 590, radius: 14 },
    { east: 390, north: 1120, radius: 22 }, // skywatch ruins
    { east: 742, north: 802, radius: 17 }, // C2-E02 camp
  ],
  palette: [
    '#b8b4a5', // 0 masonry
    '#d9d4c1', // 1 light stone
    '#929891', // 2 shaded stone
    '#e8e2cf', // 3 pale cap
    '#4a3827', // 4 dark timber
    '#6b5035', // 5 seat timber
    '#8a6a45', // 6 light timber
    '#fff7e4', // 7 highlight
  ] as const,
});

export type BenchPiece = Readonly<{
  family: 'platform' | 'back' | 'seat' | 'post' | 'step';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastBenchSpec.sectorWest && n >= c2EastBenchSpec.sectorSouth;
}

function boundaryWeight(e: number, n: number) {
  const s = c2EastBenchSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastBenchSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

export function planC2EastBench(heightAt: BenchHeightAt): readonly BenchPiece[] {
  const out: BenchPiece[] = [];
  const push = (
    family: BenchPiece['family'], e: number, n: number, y: number,
    w: number, h: number, d: number, yaw: number, shade: number,
  ) => {
    if (!inSector(e, n) || boundaryWeight(e, n) < .999) return;
    if (reservedDistance(e, n) < 2) return;
    if (!Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return;
    out.push({ family, east: e, north: n, y, w, h, d, yaw, shade });
  };

  const s = c2EastBenchSpec;
  const c = s.centre;
  // Datum is the highest sampled cell on the bench footprint plus a lip.
  // Taking the centre alone would bury the uphill half of the seat.
  let datum = heightAt(c.east, c.north) ?? -Infinity;
  if (!Number.isFinite(datum)) return out;
  for (let radius = 3; radius <= s.radius; radius += 4) {
    for (let deg = 0; deg < 360; deg += 30) {
      const a = deg * Math.PI / 180;
      const g = heightAt(c.east + Math.cos(a) * radius, c.north + Math.sin(a) * radius);
      if (g !== undefined && Number.isFinite(g)) datum = Math.max(datum, g + .5);
    }
  }

  // Fan-shaped stone landing. Each cell is a solid course stack sunk below
  // the sampled ground, then a pale cap on the common datum.
  const radii = [3, 6.5, 10];
  for (const radius of radii) {
    const count = Math.max(8, Math.round(radius * 1.9));
    for (let i = 0; i <= count; i++) {
      const a = s.arcFrom + (s.arcTo - s.arcFrom) * i / count;
      const e = c.east + Math.cos(a) * radius;
      const n = c.north + Math.sin(a) * radius;
      const ground = heightAt(e, n);
      if (ground === undefined || !Number.isFinite(ground)) continue;
      const foot = ground - 3;
      const courses = Math.max(1, Math.ceil((datum - foot) / 1.6));
      const rise = (datum - foot) / courses;
      for (let k = 0; k < courses; k++) {
        push('platform', e, n, foot + rise * k, 3.4 - k * .05, rise + .02, 3.4 - k * .05, a + Math.PI / 2, k % 3);
      }
      push('platform', e, n, datum, 3.5, .45, 3.5, a + Math.PI / 2, 3);
    }
  }

  // Half-masonry back wall: three offset courses of stone along the arc,
  // with a pale coping course so the wall reads at mountain scale.
  const wallCount = 19;
  for (let i = 0; i <= wallCount; i++) {
    const a = s.arcFrom + (s.arcTo - s.arcFrom) * i / wallCount;
    const e = c.east + Math.cos(a) * (s.radius - 1);
    const n = c.north + Math.sin(a) * (s.radius - 1);
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground)) continue;
    const foot = ground - 2;
    const courses = Math.max(2, Math.ceil((datum + 2.6 - foot) / 1.3));
    const rise = (datum + 2.6 - foot) / courses;
    for (let k = 0; k < courses; k++) {
      const shade = k === courses - 1 ? 1 : (i + k) % 3;
      push('back', e, n, foot + rise * k, 3.2, rise + .02, 2.2, a + Math.PI / 2, shade);
    }
  }

  // Curved timber seat on low stone plinths, inset from the back wall.
  const seatCount = 15;
  for (let i = 0; i <= seatCount; i++) {
    const a = s.arcFrom + (s.arcTo - s.arcFrom) * i / seatCount;
    const r = s.radius - 3.6;
    const e = c.east + Math.cos(a) * r;
    const n = c.north + Math.sin(a) * r;
    push('seat', e, n, datum + .45, 2.4, .55, 1.9, a + Math.PI / 2, 5);
    if (i % 3 === 0) push('seat', e, n, datum, 1.1, .45, 1.1, a + Math.PI / 2, 4);
  }

  // Iron-banded posts at the two arc ends and the opening lip.
  for (const a of [s.arcFrom, s.arcTo, s.arcFrom - .28, s.arcTo + .28]) {
    const e = c.east + Math.cos(a) * (s.radius - 1);
    const n = c.north + Math.sin(a) * (s.radius - 1);
    push('post', e, n, datum, .8, 4.2, .8, 0, 4);
    push('post', e, n, datum + 2.4, 1.1, .35, 1.1, 0, 6);
  }

  // Three approach treads on the canonical surface toward the stair.
  for (let i = 0; i < 3; i++) {
    const e = c.east - 12 - i * 3;
    const n = c.north - 9 - i * 2;
    const g = heightAt(e, n);
    if (g === undefined || !Number.isFinite(g)) continue;
    push('step', e, n, g - .3, 4.2, 1.1, 5, Math.atan2(-9, -12), i % 2);
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

export function mountC2EastBench(heightAt: BenchHeightAt, pieces: readonly BenchPiece[] = planC2EastBench(heightAt)) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-bench';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-bench-boxes';
  const transform = new Object3D();
  const tint = new Color();
  let index = 0;
  for (const piece of pieces) {
    transform.position.set(piece.east, piece.y + piece.h / 2, -piece.north);
    transform.rotation.set(0, piece.yaw, 0);
    transform.scale.set(piece.w, piece.h, piece.d);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tint.set(c2EastBenchSpec.palette[piece.shade % 8]!));
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
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    mesh.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }
  return { group, mesh, pieces, colliders, blocked, dispose,
    stats: () => ({ pieces: pieces.length, batches: 1, lights: 0,
      platform: pieces.filter(p => p.family === 'platform').length,
      back: pieces.filter(p => p.family === 'back').length,
      seat: pieces.filter(p => p.family === 'seat').length,
      post: pieces.filter(p => p.family === 'post').length,
      step: pieces.filter(p => p.family === 'step').length }) };
}
