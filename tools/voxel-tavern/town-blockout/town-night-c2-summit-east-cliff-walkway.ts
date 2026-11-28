import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, third-round cliff-edge walkway (2026-11-27 four-sector
 * sprint, atlas cells `cliff-walkway` / `hairpin-bench`).
 *
 * A timber-and-stone walkway along the east subpeak's north flank, where the
 * summit drops away toward the central-ridge valley. It adds the visible
 * cliff-edge furniture the canonical summit field does not draw: a plank-and-
 * slab deck, a timber guard rail on the cliff side, a shallow stone ditch on
 * the uphill side, and fan stone platforms at the pivot bends.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. It does not
 * touch the E01 ridge steps (N1000-1075), the E02 camp, the E05 sled chute, or
 * any D2 site; those stay clear.
 */

export type CliffWalkwayHeightAt = (east: number, north: number) => number | undefined;

export const c2EastCliffWalkwaySpec = Object.freeze({
  // Cliff-edge walkway along the east subpeak north flank.
  controls: Object.freeze([
    { east: 575, north: 1100 },
    { east: 592, north: 1118 },
    { east: 610, north: 1132 },
    { east: 626, north: 1146 },
  ] as const),
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  // Narrower than the road: this is a footway, not a vehicle road.
  halfWidth: 2.0,
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Timber-and-stone palette.
  palette: [
    '#6b5035', // 0 plank deck
    '#4a3827', // 1 dark plank
    '#8d938a', // 2 ditch stone
    '#5a4632', // 3 guard-rail post
    '#7a5e3e', // 4 guard-rail rail
    '#d9d4c1', // 5 platform slab
    '#b8b4a5', // 6 platform shade
    '#e8e2cf', // 7 platform light
  ] as const,
});

export type CliffWalkwayPiece = Readonly<{
  family: 'deck' | 'rail' | 'ditch' | 'platform';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastCliffWalkwaySpec.sectorWest && n >= c2EastCliffWalkwaySpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastCliffWalkwaySpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastCliffWalkwaySpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/** Sample the authored control polyline into a dense footway (~one point per 6 m). */
function samplePath() {
  const pts = c2EastCliffWalkwaySpec.controls;
  const out: { east: number; north: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const len = Math.hypot(b.east - a.east, b.north - a.north);
    const steps = Math.max(2, Math.round(len / 6));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      out.push({ east: a.east + (b.east - a.east) * t, north: a.north + (b.north - a.north) * t });
    }
  }
  out.push({ east: pts.at(-1)!.east, north: pts.at(-1)!.north });
  return out;
}

/**
 * Plan is derived from the authored control polyline and the canonical
 * sampler alone. Nothing is emitted where the host has no ground, where the
 * seam is not converged, or where a neighbouring owner's site lives.
 */
export function planC2EastCliffWalkway(heightAt: CliffWalkwayHeightAt): readonly CliffWalkwayPiece[] {
  const out: CliffWalkwayPiece[] = [];
  const s = c2EastCliffWalkwaySpec;
  // Each piece seats on the canonical ground at its own centre; the caller
  // passes a y-offset so nothing buries into a sloping surface.
  const push = (
    family: CliffWalkwayPiece['family'], e: number, n: number, yOffset: number,
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

  const samples = samplePath();

  // Deck, guard rail and ditch for every segment. The downhill side (lower
  // sampled height across the footway) takes the guard rail; the uphill side
  // takes the drainage ditch. Both follow the real surface.
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!, b = samples[i + 1]!;
    const de = b.east - a.east, dn = b.north - a.north;
    const len = Math.hypot(de, dn);
    if (len < .2) continue;
    const yaw = Math.atan2(dn, de);
    const ne = dn / len, nn = -de / len;
    const mx = (a.east + b.east) / 2, my = (a.north + b.north) / 2;
    const h1 = heightAt(mx + ne * s.halfWidth, my + nn * s.halfWidth);
    const h2 = heightAt(mx - ne * s.halfWidth, my - nn * s.halfWidth);
    const downSide = (h1 !== undefined && h2 !== undefined && h1 < h2) ? 1 : -1;

    // Deck: plank-and-slab course over the cliff edge.
    push('deck', mx, my, 0, len * 1.05, .4, 2 * s.halfWidth, yaw, i % 2 === 0 ? 0 : 1);
    // Guard rail on the cliff (downhill) side.
    const railE = mx + downSide * ne * s.halfWidth;
    const railN = my + downSide * nn * s.halfWidth;
    push('rail', railE, railN, 0, .35, 1.1, .35, yaw, 3);
    push('rail', railE, railN, .6, len * .9, .18, .22, yaw, 4);
    // Drainage ditch on the uphill side.
    const ditchE = mx - downSide * ne * s.halfWidth;
    const ditchN = my - downSide * nn * s.halfWidth;
    push('ditch', ditchE, ditchN, 0, len * .8, .4, .8, yaw, 2);
  }

  // Fan stone platforms at the pivot bends so each turn reads as a built
  // viewing point rather than a bare corner.
  const pts = c2EastCliffWalkwaySpec.controls;
  for (let i = 1; i < pts.length - 1; i++) {
    const b = pts[i]!;
    const t1 = Math.atan2(b.north - pts[i - 1]!.north, b.east - pts[i - 1]!.east);
    const t2 = Math.atan2(pts[i + 1]!.north - b.north, pts[i + 1]!.east - b.east);
    const avgYaw = (t1 + t2) / 2;
    for (let k = 0; k < 3; k++) {
      const ang = avgYaw + (k - 1) * .6;
      const e = b.east + Math.cos(ang) * 3.5;
      const n = b.north + Math.sin(ang) * 3.5;
      push('platform', e, n, 0, 4, .5, 4, ang, k === 1 ? 5 : 6);
    }
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

export function mountC2EastCliffWalkway(
  heightAt: CliffWalkwayHeightAt,
  pieces: readonly CliffWalkwayPiece[] = planC2EastCliffWalkway(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-cliff-walkway';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-cliff-walkway-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastCliffWalkwaySpec.palette[piece.shade % 8]!));
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
      deck: pieces.filter(p => p.family === 'deck').length,
      rail: pieces.filter(p => p.family === 'rail').length,
      ditch: pieces.filter(p => p.family === 'ditch').length,
      platform: pieces.filter(p => p.family === 'platform').length,
    }) };
}
