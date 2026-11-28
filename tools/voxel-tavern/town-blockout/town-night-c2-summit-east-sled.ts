import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, second-round sled-start ramp and wind sock (2026-11-27
 * four-sector sprint, atlas cells `sled-start-ramp` / `wind-sock-point` /
 * `avalanche-chute`).
 *
 * The sled lines owned by the production handoff are in the A sector (the
 * long-hall route at N≈192-303 and the surveyed (1100,203) descent). This
 * package does NOT touch them, nor B's cable, D2's ropeway or the pavilion.
 * It adds only the high-east-slope start furniture: a solid masonry launch
 * deck on the east shoulder, a snow chute with guide poles down the real
 * downhill flank, a stone runestone and an orange wind sock.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary.
 */

export type SledHeightAt = (east: number, north: number) => number | undefined;

export const c2EastSledSpec = Object.freeze({
  // Launch deck on the east shoulder's south-east flank, above the gully.
  start: { east: 648, north: 1040 },
  // Downhill snow chute: sampled height falls 518.41 -> 453.07 m.
  chuteFrom: { east: 668, north: 1016 },
  chuteTo: { east: 772, north: 872 },
  // Wind sock on the shoulder rim, clear of the skywatch ruins.
  sock: { east: 620, north: 1058 },
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  reserved: [
    { east: 773.257, north: 739.208, radius: 18 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 14 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 22 },        // skywatch ruins (D2)
    { east: 742, north: 802, radius: 17 },         // C2-E02 wind-sheltered camp
  ],
  palette: [
    '#f4f7f8', // 0 packed snow
    '#cddde6', // 1 snow shade
    '#8d938a', // 2 masonry
    '#4a3827', // 3 dark timber
    '#6b5035', // 4 rail timber
    '#8a6a45', // 5 light timber
    '#d4622e', // 6 orange cloth
    '#e6dfc0', // 7 rune inlay
  ] as const,
});

export type SledPiece = Readonly<{
  family: 'deck' | 'rail' | 'chute' | 'pole' | 'sock' | 'stone' | 'rune';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastSledSpec.sectorWest && n >= c2EastSledSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastSledSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastSledSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

export function planC2EastSled(heightAt: SledHeightAt): readonly SledPiece[] {
  const out: SledPiece[] = [];
  const push = (
    family: SledPiece['family'], e: number, n: number, y: number,
    w: number, h: number, d: number, yaw: number, shade: number,
  ) => {
    if (!inSector(e, n) || boundaryWeight(e, n) < .999) return;
    if (reservedDistance(e, n) < 2) return;
    if (!Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return;
    out.push({ family, east: e, north: n, y, w, h, d, yaw, shade });
  };

  const s = c2EastSledSpec;
  const centre = heightAt(s.start.east, s.start.north);
  if (centre === undefined || !Number.isFinite(centre)) return out;

  // Solid masonry launch deck. The datum is the highest sampled cell plus a
  // small lip: on this slope the centre alone would bury the uphill half of
  // the deck. Every cell gets stacked courses sunk below the sampled surface
  // (the E02 lesson: no stilts on a coarse summit LOD), then a timber plank
  // whose bottom sits exactly on the common datum.
  const cells = [-6, -2, 2, 6];
  let datum = centre;
  for (const de of cells) for (const dn of cells) {
    const g = heightAt(s.start.east + de, s.start.north + dn);
    if (g !== undefined && Number.isFinite(g)) datum = Math.max(datum, g + .6);
  }
  for (const de of cells) for (const dn of cells) {
    const e = s.start.east + de, n = s.start.north + dn;
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground)) continue;
    const foot = ground - 4;
    const courses = Math.max(1, Math.ceil((datum - foot) / 1.6));
    const rise = (datum - foot) / courses;
    for (let k = 0; k < courses; k++) {
      push('stone', e, n, foot + rise * k, 3.7 - k * .04, rise + .02, 3.7 - k * .04, 0, 2);
    }
    push('deck', e, n, datum, 3.8, .9, 3.8, 0, 3 + (Math.abs(de + dn) % 3 === 0 ? 1 : 0));
  }

  // Two side rails and their cross beams, sized to read at mountain scale.
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 4; i++) {
      const t = -8 + i * 4;
      push('rail', s.start.east + t, s.start.north + side * 8, datum, .8, 3, .8, 0, 3);
      push('rail', s.start.east + side * 8, s.start.north + t, datum, .8, 3, .8, 0, 3);
    }
    push('rail', s.start.east, s.start.north + side * 8, datum + 2, 16, .5, .5, 0, 4);
    push('rail', s.start.east + side * 8, s.start.north, datum + 2, .5, .5, 16, 0, 4);
  }

  // Orange launch flags at the downhill lip of the deck.
  for (const side of [-1, 1]) {
    const e = s.start.east + side * 7, n = s.start.north - 7;
    push('pole', e, n, datum, .6, 12, .6, 0, 3);
    push('pole', e + side * 2.2, n, datum + 8, 4.4, 2.6, .25, 0, 6);
  }

  // Runestone with a light inlay so the inscription survives the dark shell.
  const rsE = s.start.east, rsN = s.start.north + 8;
  push('rune', rsE, rsN, datum, 5, 1, 2.4, 0, 2);
  push('rune', rsE, rsN, datum + 1, 4.6, 6.5, 1.8, 0, 2);
  push('rune', rsE, rsN, datum + 3.2, 3.2, 2.6, 2.05, 0, 7);

  // Wind sock: stone footing, tall mast and three tapering orange segments.
  const sock = s.sock;
  const sockGround = heightAt(sock.east, sock.north);
  if (sockGround !== undefined && Number.isFinite(sockGround)) {
    push('sock', sock.east, sock.north, sockGround - 2, 5, 3, 5, 0, 2);
    push('sock', sock.east, sock.north, sockGround, .8, 22, .8, 0, 3);
    for (let k = 0; k < 3; k++) {
      push('sock', sock.east + 3 + k * 3, sock.north, sockGround + 18 - k * .8,
        3.4, 2.6 - k * .4, 2.6 - k * .4, 0, 6);
    }
  }

  // Snow chute laid on the real downhill flank, with paired guide poles. The
  // chute is furniture on the canonical surface, never a regraded road.
  const from = s.chuteFrom, to = s.chuteTo;
  const dx = to.east - from.east, dn = to.north - from.north;
  const length = Math.hypot(dx, dn);
  const yaw = Math.atan2(dn, dx);
  const nx = -dn / length, nn = dx / length;
  // Fewer, longer, thicker beds: short thin beds on this 30% slope read as a
  // row of white saw teeth, while overlapping beds read one continuous chute.
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = from.east + dx * t, n = from.north + dn * t;
    const g = heightAt(e, n);
    if (g === undefined || !Number.isFinite(g)) continue;
    // yaw aligns the LOCAL X axis with the route, so the along-path length is
    // w and the cross-path width is d. Swapping these leaves visible gaps.
    push('chute', e, n, g - .8, length / steps * 2.4, 1.6, 6.4, yaw, i % 3 === 0 ? 1 : 0);
    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const pe = e + nx * side * 5.5, pn = n + nn * side * 5.5;
        const pg = heightAt(pe, pn);
        if (pg === undefined || !Number.isFinite(pg)) continue;
        push('pole', pe, pn, pg, .55, 5, .55, 0, 3);
        push('pole', pe + side * .9, pn, pg + 3.6, 1.8, 1.1, .2, 0, 6);
      }
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

export function mountC2EastSled(heightAt: SledHeightAt, pieces: readonly SledPiece[] = planC2EastSled(heightAt)) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-sled';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-sled-boxes';
  const transform = new Object3D();
  const tint = new Color();
  let index = 0;
  for (const piece of pieces) {
    transform.position.set(piece.east, piece.y + piece.h / 2, -piece.north);
    transform.rotation.set(0, piece.yaw, 0);
    transform.scale.set(piece.w, piece.h, piece.d);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tint.set(c2EastSledSpec.palette[piece.shade % 8]!));
    index++;
  }
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  // C33-3: only upright bodies a rider can hit are colliders. The packed
  // snow chute, the launch deck and its buried stone courses are the floor
  // under the rider; treating a 28 m-long chute slab as a square wall made
  // 170 of 179 ride stations falsely "blocked". Visible instances are
  // unchanged and still share the same authored bottoms.
  const solidFamilies = new Set(['rail', 'pole', 'rune', 'sock']);
  const colliders = pieces.filter(p => solidFamilies.has(p.family) && p.h >= 1).map(p => ({
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
      deck: pieces.filter(p => p.family === 'deck').length,
      chute: pieces.filter(p => p.family === 'chute').length,
      pole: pieces.filter(p => p.family === 'pole').length,
      sock: pieces.filter(p => p.family === 'sock').length,
      stone: pieces.filter(p => p.family === 'stone').length }) };
}
