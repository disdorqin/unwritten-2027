import { BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4, MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat, StaticDrawUsage } from 'three';

/**
 * C32-P1: the east-sector physical share of the canonical 5.4 km summit trail.
 *
 * The canonical survey (`createMainSummitTrail`, 5528 points / 5590.1 m) is
 * built on the coarse 100 m summit block. Its east-sector share is 889
 * stations and 1243.9 m, running from (688.4, 480.5) at 418.3 m to
 * (300.3, 801.3) at 664.6 m. Measured against the rendered 8 m triangles that
 * every player actually sees, that survey drifts by up to **37.21 m** and 499
 * of its 888 intervals exceed a 12% face grade (worst 101.5%).
 *
 * So a path cannot simply be draped on the ground and still be a 12% trail.
 * Until D2 re-cuts the canonical profile on the live field, this module builds
 * the honest physical artifact: a stone path that follows the canonical plan,
 * sits on the rendered faces, and turns into **stone steps** wherever the
 * ground is steeper than the trail's grade bound. Every step is counted and
 * reported, so nobody can read the ramp length as a 12% trail.
 */

export type EastTrailHeightAt = (east: number, north: number) => number | undefined;
export type TrailPlanPoint = Readonly<{ east: number; north: number; height: number }>;

export const c2EastTrailSpec = Object.freeze({
  sectorWest: 300,
  sectorSouth: 480,
  boundary: 32,
  width: 3,
  halfWidth: 1.5,
  maxGrade: .12,
  stationStep: 1,
  stepRise: .28,
  railEvery: 2,
  markerEvery: 100,
  palette: ['#b9b4a4', '#d8d2bf', '#9a9689', '#e6e0cd', '#aaa38f'] as const,
});

export type EastTrailPiece = Readonly<{
  family: 'tread' | 'riser' | 'rail' | 'post' | 'marker';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

const TAU = Math.PI * 2;

function inSector(east: number, north: number) {
  return east >= c2EastTrailSpec.sectorWest && north >= c2EastTrailSpec.sectorSouth;
}

/** 0 at the seam, 1 well inside the sector. */
function boundaryWeight(east: number, north: number) {
  const s = c2EastTrailSpec;
  const fromWest = Math.min(1, Math.max(0, (east - s.sectorWest) / s.boundary));
  const fromSouth = Math.min(1, Math.max(0, (north - s.sectorSouth) / s.boundary));
  return fromWest * fromSouth;
}

/** The canonical trail clipped to the east sector, at 1 m stations. */
export function clipC2EastTrail(points: readonly TrailPlanPoint[]) {
  const out: { east: number; north: number; height: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    if (!inSector(point.east, point.north)) continue;
    if (out.length === 0) { out.push({ ...point }); continue; }
    const previous = out[out.length - 1]!;
    const length = Math.hypot(point.east - previous.east, point.north - previous.north);
    const steps = Math.max(1, Math.ceil(length / c2EastTrailSpec.stationStep));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      out.push({
        east: previous.east + (point.east - previous.east) * t,
        north: previous.north + (point.north - previous.north) * t,
        height: previous.height + (point.height - previous.height) * t,
      });
    }
  }
  return out;
}

/**
 * Plan the stone path on the rendered faces. Nothing is emitted on ground the
 * host does not own, and every family converges inside the 32 m seam.
 */
export function planC2EastTrail(heightAt: EastTrailHeightAt, trail: readonly TrailPlanPoint[]) {
  const spec = c2EastTrailSpec;
  const stations = clipC2EastTrail(trail);
  const out: EastTrailPiece[] = [];
  let distance = 0, steps = 0, treads = 0, rails = 0;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]!;
    if (i > 0) {
      const previous = stations[i - 1]!;
      distance += Math.hypot(station.east - previous.east, station.north - previous.north);
    }
    const ground = heightAt(station.east, station.north);
    if (ground === undefined || !Number.isFinite(ground)) continue;
    if (boundaryWeight(station.east, station.north) < .999) continue;
    const ahead = stations[Math.min(i + 1, stations.length - 1)]!;
    const behind = stations[Math.max(i - 1, 0)]!;
    const de = ahead.east - behind.east, dn = ahead.north - behind.north;
    const run = Math.hypot(de, dn);
    const yaw = run > 1e-9 ? Math.atan2(de, dn) : 0;
    // Downhill side decides where the rail goes: sample across the path normal.
    const normalEast = run > 1e-9 ? -dn / run : 0;
    const normalNorth = run > 1e-9 ? de / run : 1;
    const left = heightAt(station.east + normalEast * spec.halfWidth, station.north + normalNorth * spec.halfWidth);
    const right = heightAt(station.east - normalEast * spec.halfWidth, station.north - normalNorth * spec.halfWidth);
    const drop = left !== undefined && right !== undefined ? (left - right) : 0;

    out.push({
      family: 'tread', east: station.east, north: station.north, y: ground,
      w: 1.0, h: .16, d: 1.0, yaw, shade: treads++ % spec.palette.length,
    });

    // Where the rendered ground climbs faster than the trail bound, the path
    // becomes steps instead of pretending to be a 12% ramp.
    if (i > 0) {
      const previous = stations[i - 1]!;
      const previousGround = heightAt(previous.east, previous.north);
      const horizontal = Math.hypot(station.east - previous.east, station.north - previous.north);
      if (previousGround !== undefined && horizontal > 1e-6) {
        const grade = (ground - previousGround) / horizontal;
        if (grade > spec.maxGrade) {
          const risers = Math.min(6, Math.max(1, Math.round((ground - previousGround) / spec.stepRise)));
          for (let riser = 0; riser < risers; riser++) {
            const t = (riser + 1) / (risers + 1);
            out.push({
              family: 'riser',
              east: previous.east + (station.east - previous.east) * t,
              north: previous.north + (station.north - previous.north) * t,
              y: previousGround + (ground - previousGround) * t - spec.stepRise,
              w: 1.0, h: spec.stepRise, d: .34, yaw, shade: steps++ % spec.palette.length,
            });
          }
        }
      }
    }

    // Rail on the downhill side only, every second station. The lateral
    // offset can push a post back across the seam, so the emitted position -
    // not the centreline - is what has to stay 32 m inside.
    if (Math.abs(drop) > .35 && i % spec.railEvery === 0) {
      const side = drop > 0 ? 1 : -1;
      const east = station.east + normalEast * spec.halfWidth * side;
      const north = station.north + normalNorth * spec.halfWidth * side;
      if (boundaryWeight(east, north) < .999) continue;
      const edge = heightAt(east, north) ?? ground;
      out.push({
        family: 'post', east, north, y: edge, w: .12, h: 1.0, d: .12, yaw, shade: rails++ % spec.palette.length,
      });
      out.push({
        family: 'rail', east, north, y: edge + .92, w: 1.9, h: .1, d: .1, yaw, shade: rails % spec.palette.length,
      });
    }

    if (i > 0 && distance >= (out.filter(piece => piece.family === 'marker').length + 1) * spec.markerEvery) {
      out.push({
        family: 'marker', east: station.east, north: station.north, y: ground,
        w: .3, h: .8, d: .3, yaw, shade: 0,
      });
    }
  }
  return {
    pieces: out,
    stations: stations.length,
    metres: distance,
    treads,
    steps,
    rails: rails / 2,
  };
}

function paletteTexture() {
  const data = new Uint8Array(c2EastTrailSpec.palette.length * 16);
  for (let i = 0; i < c2EastTrailSpec.palette.length; i++) {
    const color = new Color(c2EastTrailSpec.palette[i]!);
    for (let texel = 0; texel < 16; texel++) {
      const offset = i * 16 + texel * 4;
      data[offset] = Math.round(color.r * 255);
      data[offset + 1] = Math.round(color.g * 255);
      data[offset + 2] = Math.round(color.b * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, 4, c2EastTrailSpec.palette.length, RGBAFormat);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mountC2EastTrail(heightAt: EastTrailHeightAt, trail: readonly TrailPlanPoint[]) {
  const plan = planC2EastTrail(heightAt, trail);
  const group = new Group();
  group.name = 'town-night-c2-summit-east-trail';
  const texture = paletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, plan.pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-trail-boxes';
  const transform = new Object3D();
  const tint = new Color();
  let index = 0;
  for (const piece of plan.pieces) {
    transform.position.set(piece.east, piece.y + piece.h / 2, -piece.north);
    transform.rotation.set(0, piece.yaw, 0);
    transform.scale.set(piece.w, piece.h, piece.d);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tint.set(c2EastTrailSpec.palette[piece.shade % c2EastTrailSpec.palette.length]!));
    index++;
  }
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  const colliders = plan.pieces
    .filter(piece => piece.family === 'post' || piece.family === 'marker')
    .map(piece => ({
      west: piece.east - Math.max(piece.w, piece.d) / 2, east: piece.east + Math.max(piece.w, piece.d) / 2,
      south: piece.north - Math.max(piece.w, piece.d) / 2, north: piece.north + Math.max(piece.w, piece.d) / 2,
      bottom: piece.y, top: piece.y + piece.h,
    }));

  function blocked(east: number, north: number, feet: number, radius = .27, body = 1.8) {
    for (const collider of colliders) {
      const dx = Math.max(collider.west - east, 0, east - collider.east);
      const dn = Math.max(collider.south - north, 0, north - collider.north);
      if (Math.hypot(dx, dn) < radius && feet + body > collider.bottom && feet < collider.top) return true;
    }
    return false;
  }
  function dispose() {
    group.removeFromParent();
    mesh.dispose(); geometry.dispose(); material.dispose(); texture.dispose();
  }
  return {
    group, mesh, plan, colliders, blocked, dispose,
    stats: () => ({
      pieces: plan.pieces.length,
      stations: plan.stations,
      metres: plan.metres,
      treads: plan.treads,
      steps: plan.steps,
      rails: plan.rails,
      batches: 1,
      lights: 0,
    }),
  };
}
