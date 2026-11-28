import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';
import { middleEastNorthControls } from './town-d-r30-upper-roadbed.js';

/**
 * C2 east sector, third-round road markers and signage (2026-11-27
 * four-sector sprint, atlas cell `road-markers-signage`).
 *
 * The east-slope switchback centreline is already authored read-only by the
 * C2 production chain `town-d-r30-upper-roadbed` (`middleEastNorthControls`,
 * re-exported through the E03 road handoff contract). That chain only cuts and
 * fills the raster; the E07 switchback module draws the visible trail surface.
 * This module adds the road-side markers the trail does not draw: milestone
 * stones along the alignment, double-sided pivot sign posts at the two
 * sharpest bends, and kerb stones on the downhill edge of three segments.
 *
 * Every box is seated by the supplied `heightAt` (D2's canonical main-summit
 * sampler). This module never owns a height function, never grades terrain,
 * never declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. It does not
 * rebuild the roadbed, the D2 pavilion, the east-gully site or the skywatch
 * ruins; those stay clear. The kerbs sit inside the E07 guard rail (2.4 m vs
 * 2.8 m) so the two families never overlap.
 */

export type RoadMarkerHeightAt = (east: number, north: number) => number | undefined;

export const c2EastRoadMarkersSpec = Object.freeze({
  sectorWest: 300, sectorSouth: 480, boundary: 32,
  // Milestone count along the centreline arc, evenly spaced.
  milestoneCount: 5,
  // Curb offset from the centreline; inside the E07 guard rail at 2.8 m.
  curbOffset: 2.4,
  // Same half-width as E07 for downhill-side detection.
  halfWidth: 2.8,
  // Existing D2 sites that must stay clear.
  reserved: [
    { east: 773.257, north: 739.208, radius: 14 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 11 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 21 },        // skywatch ruins (D2)
  ],
  // Stone-and-timber palette. Light stele stays legible against the slate
  // summit shell at this 2.2 km mountain scale.
  palette: [
    '#d9d4c1', // 0 light stone (milestone stele)
    '#b8b4a5', // 1 stone shade
    '#929891', // 2 dark stone (milestone base)
    '#4a3827', // 3 dark timber (sign post)
    '#6b5035', // 4 timber (sign panel)
    '#e8e2cf', // 5 light stone accent
    '#7d8583', // 6 dark stone (curb)
    '#fff7e4', // 7 light accent
  ] as const,
});

export type RoadMarkerPiece = Readonly<{
  family: 'milestone' | 'sign' | 'curb';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function inSector(e: number, n: number) {
  return e >= c2EastRoadMarkersSpec.sectorWest && n >= c2EastRoadMarkersSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside our own sector. */
function boundaryWeight(e: number, n: number) {
  const s = c2EastRoadMarkersSpec;
  const fromWest = Math.min(1, Math.max(0, (e - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (n - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastRoadMarkersSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/** Sample the authored centreline into a dense polyline (~one point per 6 m). */
function sampleCentreline() {
  const pts = middleEastNorthControls;
  const out: { east: number; north: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const segLen = Math.hypot(b.east - a.east, b.north - a.north);
    const steps = Math.max(2, Math.round(segLen / 6));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      out.push({ east: a.east + (b.east - a.east) * t, north: a.north + (b.north - a.north) * t });
    }
  }
  out.push({ east: pts.at(-1)!.east, north: pts.at(-1)!.north });
  return out;
}

type ArcPoint = { east: number; north: number; arc: number };

/** Attach cumulative arc length to each sampled point. */
function buildArc(samples: readonly { east: number; north: number }[]): ArcPoint[] {
  let cum = 0;
  return samples.map((p, i) => {
    if (i > 0) cum += Math.hypot(p.east - samples[i - 1]!.east, p.north - samples[i - 1]!.north);
    return { east: p.east, north: p.north, arc: cum };
  });
}

/** Interpolate a position and tangent at a target arc length along the arc. */
function placeAtArc(arc: readonly ArcPoint[], target: number) {
  for (let i = 0; i < arc.length - 1; i++) {
    const a = arc[i]!, b = arc[i + 1]!;
    if (target <= b.arc) {
      const span = b.arc - a.arc;
      const t = span > 0 ? (target - a.arc) / span : 0;
      const east = a.east + (b.east - a.east) * t;
      const north = a.north + (b.north - a.north) * t;
      const yaw = Math.atan2(b.north - a.north, b.east - a.east);
      return { east, north, yaw };
    }
  }
  const last = arc.at(-1)!;
  const prev = arc.at(-2)!;
  return { east: last.east, north: last.north,
    yaw: Math.atan2(last.north - prev.north, last.east - prev.east) };
}

/**
 * Plan is derived from the authored centreline and the canonical sampler
 * alone. Nothing is emitted where the host has no ground, where the seam is
 * not converged, or where a neighbouring owner's site lives.
 */
export function planC2EastRoadMarkers(heightAt: RoadMarkerHeightAt): readonly RoadMarkerPiece[] {
  const out: RoadMarkerPiece[] = [];
  const s = c2EastRoadMarkersSpec;
  // Each piece seats on the canonical ground at its own centre. The caller
  // passes a y-offset so nothing buries into a sloping surface.
  const push = (
    family: RoadMarkerPiece['family'], e: number, n: number, yOffset: number,
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

  const raw = sampleCentreline();
  const arc = buildArc(raw);
  const totalArc = arc.at(-1)!.arc;

  // (a) Milestone stones: 5 stones evenly spaced along the centreline arc.
  // Each milestone is a dark-stone base plus a light-stone stele riding it,
  // yaw aligned to the local tangent so the face reads toward the road.
  for (let i = 0; i < s.milestoneCount; i++) {
    const target = totalArc * i / (s.milestoneCount - 1);
    const pos = placeAtArc(arc, target);
    push('milestone', pos.east, pos.north, 0, 1.4, .4, .5, pos.yaw, 2);      // base
    push('milestone', pos.east, pos.north, .4, 1.0, 2.5, .3, pos.yaw, 0);    // stele
  }

  // (b) Pivot sign posts: the two interior sample points where the tangent
  // swings the most. Each post is a dark timber upright with a double-sided
  // timber panel sign riding it at 2 m; the two panels face opposite
  // directions along the road, offset to either side of the post.
  const pivots: { east: number; north: number; yaw: number; diff: number }[] = [];
  for (let i = 1; i < raw.length - 1; i++) {
    const a = raw[i - 1]!, b = raw[i]!, c = raw[i + 1]!;
    const t1 = Math.atan2(b.north - a.north, b.east - a.east);
    const t2 = Math.atan2(c.north - b.north, c.east - b.east);
    let diff = Math.abs(t2 - t1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    pivots.push({ east: b.east, north: b.north, yaw: (t1 + t2) / 2, diff });
  }
  pivots.sort((p, q) => q.diff - p.diff);
  for (const pivot of pivots.slice(0, 2)) {
    const ne = Math.sin(pivot.yaw), nn = -Math.cos(pivot.yaw);
    push('sign', pivot.east, pivot.north, 0, .2, 3.0, .2, pivot.yaw, 3);    // post
    // Two panels on opposite sides of the post, facing opposite directions.
    push('sign', pivot.east + ne * .2, pivot.north + nn * .2, 2.0,
      1.6, .8, .1, pivot.yaw, 4);
    push('sign', pivot.east - ne * .2, pivot.north - nn * .2, 2.0,
      1.6, .8, .1, pivot.yaw + Math.PI, 4);
  }

  // (c) Kerb stones: three representative segments, kerb on the downhill
  // side (same two-side height sample as E07). The kerb sits 2.4 m from the
  // centreline, inside the E07 guard rail at 2.8 m, so the two never overlap.
  const segIdx = [0, Math.floor(raw.length / 2), raw.length - 2];
  for (const i of segIdx) {
    const a = raw[i]!, b = raw[i + 1]!;
    const de = b.east - a.east, dn = b.north - a.north;
    const len = Math.hypot(de, dn);
    if (len < .2) continue;
    const segYaw = Math.atan2(dn, de);
    const ne = dn / len, nn = -de / len;
    const mx = (a.east + b.east) / 2, my = (a.north + b.north) / 2;
    const ground = heightAt(mx, my);
    if (ground === undefined || !Number.isFinite(ground)) continue;
    const h1 = heightAt(mx + ne * s.halfWidth, my + nn * s.halfWidth);
    const h2 = heightAt(mx - ne * s.halfWidth, my - nn * s.halfWidth);
    // Downhill side: the lower sampled bank. If both banks are unknown, fall
    // back to the left normal so the kerb still lands on one side.
    const downSide = (h1 !== undefined && h2 !== undefined && h1 < h2) ? 1 : -1;
    const curbE = mx + downSide * ne * s.curbOffset;
    const curbN = my + downSide * nn * s.curbOffset;
    push('curb', curbE, curbN, 0, len, .5, .4, segYaw, 6);
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

export function mountC2EastRoadMarkers(
  heightAt: RoadMarkerHeightAt,
  pieces: readonly RoadMarkerPiece[] = planC2EastRoadMarkers(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-road-markers';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-road-markers-boxes';
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
    mesh.setColorAt(index, tint.set(c2EastRoadMarkersSpec.palette[piece.shade % 8]!));
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
      milestone: pieces.filter(p => p.family === 'milestone').length,
      sign: pieces.filter(p => p.family === 'sign').length,
      curb: pieces.filter(p => p.family === 'curb').length,
    }) };
}
