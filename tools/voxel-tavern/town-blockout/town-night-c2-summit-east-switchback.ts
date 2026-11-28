import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';
import { middleEastNorthControls } from './town-d-r30-upper-roadbed.js';
import { c2BlocksTrail } from './town-night-c2-trail-corridor.js';

/**
 * C2 east sector, third-round switchback trail refinement (2026-11-27
 * four-sector sprint, atlas cells `switchbacks-aerial` / `switchback-trail`).
 *
 * The east-slope switchback centreline is already authored read-only by the
 * C2 production chain `town-d-r30-upper-roadbed` (`middleEastNorthControls`,
 * re-exported through the E03 road handoff contract). That chain only cuts and
 * fills the raster; it draws no visible road voxels. This module adds the
 * visible mountain-road furniture the raster does not render: paving slabs
 * along the alignment, a masonry-and-timber guard rail on the downhill side,
 * a shallow ditch on the uphill side, and fan paving at the switchback crests.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. It does not
 * rebuild the roadbed, the D2 pavilion, the east-gully site or the skywatch
 * ruins; those stay clear.
 */

export type SwitchbackHeightAt = (east: number, north: number) => number | undefined;

export const c2EastSwitchbackSpec = Object.freeze({
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  // Same half-width as the E03 road handoff contract so the visible paving
  // matches the authored alignment width exactly.
  halfWidth: 2.8,
  // Existing D2 sites that must stay clear.
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Stone-and-timber palette. Light slabs stay legible against the slate
  // summit shell at this 2.2 km mountain scale.
  palette: [
    '#d9d4c1', // 0 paving slab
    '#b8b4a5', // 1 paving shade
    '#929891', // 2 ditch stone
    '#4a3827', // 3 guard-rail post (dark timber)
    '#6b5035', // 4 guard-rail rail (timber)
    '#e8e2cf', // 5 crest apron (light stone)
    '#aaa38f', // 6 apron shade
    '#f0ebd9', // 7 snow edge
  ] as const,
});

export type SwitchbackPiece = Readonly<{
  family: 'paving' | 'rail' | 'ditch' | 'apron';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastSwitchbackSpec.sectorWest && n >= c2EastSwitchbackSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastSwitchbackSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastSwitchbackSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/** Sample the authored centreline into a dense polyline (~one point per 8 m). */
function sampleCentreline() {
  const pts = middleEastNorthControls;
  const out: { east: number; north: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const segLen = Math.hypot(b.east - a.east, b.north - a.north);
    const steps = Math.max(2, Math.round(segLen / 8));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      out.push({ east: a.east + (b.east - a.east) * t, north: a.north + (b.north - a.north) * t });
    }
  }
  out.push({ east: pts.at(-1)!.east, north: pts.at(-1)!.north });
  return out;
}

/**
 * Plan is derived from the authored centreline and the canonical sampler
 * alone. Nothing is emitted where the host has no ground, where the seam is
 * not converged, or where a neighbouring owner's site lives.
 */
export function planC2EastSwitchback(heightAt: SwitchbackHeightAt): readonly SwitchbackPiece[] {
  const out: SwitchbackPiece[] = [];
  const s = c2EastSwitchbackSpec;
  // Each piece seats on the canonical ground at its own centre. The caller
  // passes a y-offset (0 for base pieces, a small rise for the guard-rail
  // crossbar and snow lip) so nothing buries into a sloping surface.
  const push = (
    family: SwitchbackPiece['family'], e: number, n: number, yOffset: number,
    w: number, h: number, d: number, yaw: number, shade: number,
  ) => {
    if (!inSector(e, n) || boundaryWeight(e, n) < .999) return;
    if (reservedDistance(e, n) < 2) return;
    // C33-2: rails/ditches are solid bodies. Never place one across the
    // canonical 5.59 km walking lane (41 measured blockages in the audit).
    if (family === 'rail' && c2BlocksTrail(e, n, s.halfWidth)) return;
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground)) return;
    const y = ground + yOffset;
    if (!Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return;
    out.push({ family, east: e, north: n, y, w, h, d, yaw, shade });
  };

  const samples = sampleCentreline();

  // Paving, guard rail and ditch for every segment. The downhill side (lower
  // sampled height across the road) takes the guard rail; the uphill side takes
  // the drainage ditch. Both follow the real surface instead of a fixed side.
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!, b = samples[i + 1]!;
    const de = b.east - a.east, dn = b.north - a.north;
    const len = Math.hypot(de, dn);
    if (len < .2) continue;
    const yaw = Math.atan2(dn, de);
    // Unit normal (perpendicular to the tangent).
    const ne = dn / len, nn = -de / len;
    const mx = (a.east + b.east) / 2, my = (a.north + b.north) / 2;
    const ground = heightAt(mx, my);
    if (ground === undefined || !Number.isFinite(ground)) continue;
    const h1 = heightAt(mx + ne * s.halfWidth, my + nn * s.halfWidth);
    const h2 = heightAt(mx - ne * s.halfWidth, my - nn * s.halfWidth);
    // Downhill side: the lower sampled bank. If both banks are unknown, fall
    // back to the left normal so the rail still lands on one consistent side.
    const downSide = (h1 !== undefined && h2 !== undefined && h1 < h2) ? 1 : -1;

    // Paving slab: thin stone course over the roadbed, slightly oversized so
    // adjacent slabs overlap and read as a continuous surface.
    push('paving', mx, my, 0, len * 1.05, .5, 2 * s.halfWidth, yaw, i % 2 === 0 ? 0 : 1);
    // Snow edge on the uphill lip to keep the road legible against snow cover.
    const snowN = my - downSide * nn * s.halfWidth * .92;
    push('paving', mx, snowN, .02, len * .9, .18, .5, yaw, 7);

    // Guard rail on the downhill side: a timber post every segment plus a
    // continuous horizontal rail riding the post tops.
    const railE = mx + downSide * ne * s.halfWidth;
    const railN = my + downSide * nn * s.halfWidth;
    push('rail', railE, railN, 0, .4, 1.4, .4, yaw, 3);
    push('rail', railE, railN, .75, len * .92, .22, .28, yaw, 4);

    // Drainage ditch on the uphill side: a shallow stone channel.
    const ditchE = mx - downSide * ne * s.halfWidth;
    const ditchN = my - downSide * nn * s.halfWidth;
    push('ditch', ditchE, ditchN, 0, len * .85, .45, 1.0, yaw, 2);
  }

  // Fan paving at the switchback crests: where the tangent swings sharply,
  // lay a small cluster of slabs around the pivot so the turn reads as a
  // built platform rather than a bare bend.
  for (let i = 1; i < samples.length - 1; i++) {
    const a = samples[i - 1]!, b = samples[i]!, c = samples[i + 1]!;
    const t1 = Math.atan2(b.north - a.north, b.east - a.east);
    const t2 = Math.atan2(c.north - b.north, c.east - b.east);
    let diff = Math.abs(t2 - t1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff < .55) continue; // not a real switchback pivot
    const avgYaw = (t1 + t2) / 2;
    for (let k = 0; k < 3; k++) {
      const ang = avgYaw + (k - 1) * .55;
      const e = b.east + Math.cos(ang) * 3.2;
      const n = b.north + Math.sin(ang) * 3.2;
      push('apron', e, n, 0, 4, .5, 4, ang, k === 1 ? 5 : 6);
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

export function mountC2EastSwitchback(
  heightAt: SwitchbackHeightAt,
  pieces: readonly SwitchbackPiece[] = planC2EastSwitchback(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-switchback';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-switchback-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastSwitchbackSpec.palette[piece.shade % 8]!));
    index++;
  }
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  // Colliders from the same pieces and bottom semantics, but ONLY bodies a
  // walker can actually hit. C33-2 audit: the old `pieces.map` made the thin
  // paving slab and snow lip (0.18-0.5 m high) into blockers, so a player
  // standing on the road was told the road itself blocked him (10 stations).
  // Paving/apron/ditch are floor, not walls; only the rail is a solid body.
  const colliders = pieces.filter(p => p.family === 'rail' && p.h >= 1).map(p => ({
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
      paving: pieces.filter(p => p.family === 'paving').length,
      rail: pieces.filter(p => p.family === 'rail').length,
      ditch: pieces.filter(p => p.family === 'ditch').length,
      apron: pieces.filter(p => p.family === 'apron').length,
    }) };
}
