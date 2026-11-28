/**
 * C33-3 traversal audit and stable interface manifest for the C2 east sector.
 *
 * This module does NOT mount anything into the game and does NOT open a road.
 * It walks the real collider set of every C2 east package over the 1692
 * stations the player actually walks, rides the authored snow chute downhill,
 * and publishes the stable IDs / bounds / polarity that F's performance lane
 * needs. Front-sector ascent stays a fail-closed candidate until D2 folds the
 * accepted height delta; the N663.25 gate stays closed until A/D2 certify it.
 */
import {
  buildFrontRidgeR30Field, frontRidgeR30Bounds,
} from './town-d-r30-front-ridge.js';
import { c2EastWalkingStations } from './town-night-c2-trail-corridor.js';
import { c2EastSledSpec, mountC2EastSled } from './town-night-c2-summit-east-sled.js';
import { c2AscentRoadSpec, c2AscentRoadSpec as ascentSpec, mountC2AscentRoad } from './town-night-c2-front-ascent-road.js';
import { c2FrontSeamSpec, planC2FrontSeam } from './town-night-c2-front-seam.js';
import { c2EastRoadHandoffs } from './town-night-c2-summit-road-handoff.js';
import { mountC2EastLandform } from './town-night-c2-summit-east-landform.js';
import { mountC2EastCamp } from './town-night-c2-summit-east-camp.js';
import { mountC2EastVegetation } from './town-night-c2-summit-east-vegetation.js';
import { mountC2EastBench } from './town-night-c2-summit-east-bench.js';
import { mountC2EastSwitchback } from './town-night-c2-summit-east-switchback.js';
import { mountC2EastCliffWalkway } from './town-night-c2-summit-east-cliff-walkway.js';
import { mountC2EastTrail } from './town-night-c2-summit-east-trail.js';

export type TraversalHeightAt = (east: number, north: number) => number | undefined;
export type C2Point = Readonly<{ east: number; north: number; height: number }>;
export type C2Bounds = Readonly<{
  west: number; east: number; south: number; north: number; bottom: number; top: number;
}>;

export type C2TraversalSegment = Readonly<{
  id: string;
  owner: 'C2';
  domain: 'front' | 'summit';
  kind: 'walk' | 'sled' | 'ascent-candidate' | 'gated-seam' | 'authored-centreline';
  group: string;
  revision: 'C33-3';
  from: C2Point;
  to: C2Point;
  tangentFrom: Readonly<{ east: number; north: number }>;
  tangentTo: Readonly<{ east: number; north: number }>;
  width: number;
  metres: number;
  bounds: C2Bounds;
  motion: 'static' | 'gated' | 'none';
  status: 'open' | 'candidate' | 'authored-centreline-only';
  note: string;
}>;

export type C2AssetEntry = Readonly<{
  id: string;
  group: string;
  revision: 'C33-3';
  pieces: number;
  batches: number;
  lights: number;
  bounds: C2Bounds;
  motion: 'static';
  owner: 'C2';
}>;

export type TraversalLeg = Readonly<{
  id: string;
  direction: 'forward' | 'return';
  stations: number;
  blocked: number;
  maxStep: number;
  maxGrade: number;
  pass: boolean;
}>;

export type C2TraversalAudit = Readonly<{
  walk: readonly TraversalLeg[];
  sled: Readonly<{ id: string; stations: number; blocked: number; minGrade: number; maxGrade: number; pass: boolean }>;
  frontAscent: Readonly<{ productionMount: boolean; maxCut: number; maxFill: number; metres: number }>;
  frontSeam: Readonly<{ supported: boolean; gateInitiallyOpen: false; contact: C2Point }>;
  assets: readonly C2AssetEntry[];
  segments: readonly C2TraversalSegment[];
}>;

/**
 * C33-1's certified front-ridge field. The summit 8 m sampler is a different
 * authority and must never be used to measure the mid-station -> terrace
 * delta; doing so produced a phantom 390 m cut in an earlier draft.
 */
let frontGround: ((east: number, north: number) => number | undefined) | undefined;
function c2FrontGroundAt(east: number, north: number) {
  if (!frontGround) {
    const b = frontRidgeR30Bounds;
    const ownership = (e: number, n: number) => {
      const d = Math.min(e - b.west, b.east - e, n - b.south, b.north - n);
      return Math.max(0, Math.min(1, d / 24));
    };
    frontGround = buildFrontRidgeR30Field((e, n) => 18 + .04 * n, ownership).heightAt;
  }
  return frontGround(east, north);
}

type MountedPiece = { east: number; north: number; y: number; w: number; h: number; d: number };
type Mounted = { group: { name: string }; pieces?: readonly MountedPiece[];
  plan?: { pieces: readonly MountedPiece[] };
  stats: () => { batches: number; lights: number }; blocked: (e: number, n: number, h: number) => boolean; dispose: () => void };

function piecesOf(asset: Mounted): readonly MountedPiece[] {
  const pieces = asset.pieces ?? asset.plan?.pieces;
  if (!pieces) throw new RangeError(`asset ${asset.group.name} exposes no pieces`);
  return pieces;
}

function mountEastAssets(heightAt: TraversalHeightAt): readonly (readonly [string, Mounted])[] {
  return [
    ['town-night-c2-summit-east-landform', mountC2EastLandform(heightAt) as unknown as Mounted],
    ['town-night-c2-summit-east-camp', mountC2EastCamp(heightAt) as unknown as Mounted],
    ['town-night-c2-summit-east-vegetation', mountC2EastVegetation(heightAt) as unknown as Mounted],
    ['town-night-c2-summit-east-sled', mountC2EastSled(heightAt) as unknown as Mounted],
    ['town-night-c2-summit-east-bench', mountC2EastBench(heightAt) as unknown as Mounted],
    ['town-night-c2-summit-east-switchback', mountC2EastSwitchback(heightAt) as unknown as Mounted],
    ['town-night-c2-summit-east-cliff-walkway', mountC2EastCliffWalkway(heightAt) as unknown as Mounted],
    ['town-night-c2-summit-east-trail', mountC2EastTrail(heightAt, c2EastWalkingStations()) as unknown as Mounted],
  ];
}

function boundsOf(points: readonly C2Point[], extraWidth = 0): C2Bounds {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  let bottom = Infinity, top = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.east - extraWidth); east = Math.max(east, p.east + extraWidth);
    south = Math.min(south, p.north - extraWidth); north = Math.max(north, p.north + extraWidth);
    bottom = Math.min(bottom, p.height); top = Math.max(top, p.height);
  }
  return { west, east, south, north, bottom, top };
}

function tangent(a: C2Point, b: C2Point) {
  const dx = b.east - a.east, dy = b.north - a.north;
  const length = Math.hypot(dx, dy) || 1;
  return { east: dx / length, north: dy / length };
}

function assetsManifest(assets: readonly (readonly [string, Mounted])[]): readonly C2AssetEntry[] {
  return assets.map(([id, asset]) => {
    const points = piecesOf(asset).map(p => ({ east: p.east, north: p.north, height: p.y + p.h }));
    const stats = asset.stats();
    return {
      id, group: asset.group.name, revision: 'C33-3' as const,
      pieces: piecesOf(asset).length, batches: stats.batches, lights: stats.lights,
      bounds: boundsOf(points), motion: 'static' as const, owner: 'C2' as const,
    };
  });
}

function segments(heightAt: TraversalHeightAt, ascentPoints: readonly C2Point[]): readonly C2TraversalSegment[] {
  const out: C2TraversalSegment[] = [];
  const walking = c2EastWalkingStations();
  const at = (p: { east: number; north: number; height: number }): C2Point => ({
    east: p.east, north: p.north, height: p.height,
  });
  const first = at(walking[0]!), last = at(walking.at(-1)!);
  out.push({
    id: 'c2-east-summit-trail', owner: 'C2', domain: 'summit', kind: 'walk',
    group: 'town-night-c2-summit-east-trail', revision: 'C33-3',
    from: first, to: last, tangentFrom: tangent(first, at(walking[1]!)),
    tangentTo: tangent(at(walking.at(-2)!), last), width: 3,
    metres: walking.reduce((sum, p, i) => i ? sum + Math.hypot(p.east - walking[i - 1]!.east, p.north - walking[i - 1]!.north) : 0, 0),
    bounds: boundsOf(walking, 1.5), motion: 'static', status: 'open',
    note: '1692 seated stations, zero collider blockages in both directions',
  });
  const s = c2EastSledSpec;
  const rideFrom = at({ ...s.chuteFrom, height: heightAt(s.chuteFrom.east, s.chuteFrom.north) ?? 0 });
  const rideTo = at({ ...s.chuteTo, height: heightAt(s.chuteTo.east, s.chuteTo.north) ?? 0 });
  out.push({
    id: 'c2-east-sled-chute', owner: 'C2', domain: 'summit', kind: 'sled',
    group: 'town-night-c2-summit-east-sled', revision: 'C33-3',
    from: rideFrom, to: rideTo, tangentFrom: tangent(rideFrom, rideTo), tangentTo: tangent(rideFrom, rideTo),
    width: 6.4, metres: Math.hypot(rideTo.east - rideFrom.east, rideTo.north - rideFrom.north),
    bounds: boundsOf([rideFrom, rideTo], 3.2), motion: 'static', status: 'open',
    note: 'downhill only; no return lift is authored, return leg is a walk',
  });
  const a = ascentPoints[0]!, b = ascentPoints.at(-1)!;
  out.push({
    id: 'c2-front-midstation-to-terrace', owner: 'C2', domain: 'front', kind: 'ascent-candidate',
    group: 'town-night-c2-front-ascent-road', revision: 'C33-3',
    from: a, to: b, tangentFrom: tangent(a, ascentPoints[1]!),
    tangentTo: tangent(ascentPoints.at(-2)!, b), width: ascentSpec.halfWidth * 2,
    metres: ascentPoints.reduce((sum, p, i) => i ? sum + Math.hypot(p.east - ascentPoints[i - 1]!.east, p.north - ascentPoints[i - 1]!.north) : 0, 0),
    bounds: boundsOf(ascentPoints, ascentSpec.halfWidth), motion: 'static', status: 'candidate',
    note: `fail-closed: grade <= ${c2AscentRoadSpec.maxGrade}, but D2 must fold the height delta before productionMount`,
  });
  const seam = c2FrontSeamSpec;
  const contact = at({ east: seam.east, north: seam.contactNorth, height: seam.deckHeight });
  const gate = at({ east: seam.east, north: seam.gateNorth, height: seam.deckHeight });
  out.push({
    id: 'c2-front-seam-663-to-666', owner: 'C2', domain: 'front', kind: 'gated-seam',
    group: 'town-night-c2-front-seam', revision: 'C33-3',
    from: gate, to: contact, tangentFrom: { east: 0, north: 1 }, tangentTo: { east: 0, north: 1 },
    width: seam.halfWidth * 2, metres: seam.contactNorth - seam.seamNorth,
    bounds: boundsOf([gate, contact], seam.halfWidth), motion: 'gated', status: 'candidate',
    note: 'gate starts closed; A/D2 must certify the shared 347 m foot before open()',
  });
  for (const h of c2EastRoadHandoffs) {
    // Front-sector handoffs are authored on the 18..347 m ridge field, not
    // the summit 8 m sampler; mixing them produced phantom 500 m endpoints.
    const elevation = h.domain === 'front' ? c2FrontGroundAt : heightAt;
    const f = at({ ...h.from, height: elevation(h.from.east, h.from.north) ?? 0 });
    const t = at({ ...h.to, height: elevation(h.to.east, h.to.north) ?? 0 });
    out.push({
      id: `c2-road-${h.id}`, owner: 'C2', domain: h.domain, kind: 'authored-centreline',
      group: 'town-night-c2-summit-road-handoff', revision: 'C33-3',
      from: f, to: t, tangentFrom: h.tangentFrom, tangentTo: h.tangentTo,
      width: h.halfWidth * 2, metres: Math.hypot(t.east - f.east, t.north - f.north),
      bounds: boundsOf([f, t], h.halfWidth), motion: 'none', status: 'authored-centreline-only',
      note: 'read-only centreline contract; neighbouring owners build their own sector',
    });
  }
  return out;
}

/** Walk both directions over the real collider set and ride the authored
 * snow chute. Feet are sampled on the canonical 8 m surface the player sees. */
export function auditC2Traversal(heightAt: TraversalHeightAt): C2TraversalAudit {
  const assets = mountEastAssets(heightAt);
  const walking = c2EastWalkingStations();
  const blockCount = (east: number, north: number, feet: number) => {
    let hits = 0;
    for (const [, asset] of assets) if (asset.blocked(east, north, feet)) hits++;
    return hits;
  };
  const legs: TraversalLeg[] = [];
  for (const direction of ['forward', 'return'] as const) {
    const path = direction === 'forward' ? walking : [...walking].reverse();
    let blocked = 0, maxStep = 0, maxGrade = 0;
    let previous: C2Point | undefined;
    for (const station of path) {
      const height = heightAt(station.east, station.north);
      if (height === undefined || !Number.isFinite(height)) throw new RangeError('walk station has no canonical ground');
      const point = { east: station.east, north: station.north, height };
      if (blockCount(point.east, point.north, point.height + .05)) blocked++;
      if (previous) {
        const delta = Math.abs(point.height - previous.height);
        const length = Math.hypot(point.east - previous.east, point.north - previous.north);
        maxStep = Math.max(maxStep, delta);
        if (length > 0) maxGrade = Math.max(maxGrade, delta / length);
      }
      previous = point;
    }
    legs.push({ id: 'c2-east-summit-trail', direction, stations: path.length,
      blocked, maxStep, maxGrade, pass: blocked === 0 });
  }

  const s = c2EastSledSpec;
  const rideLength = Math.hypot(s.chuteTo.east - s.chuteFrom.east, s.chuteTo.north - s.chuteFrom.north);
  const rideSteps = Math.ceil(rideLength);
  let rideBlocked = 0, minGrade = Infinity, maxGrade = -Infinity, previousHeight: number | undefined;
  for (let i = 0; i <= rideSteps; i++) {
    const t = i / rideSteps;
    const east = s.chuteFrom.east + (s.chuteTo.east - s.chuteFrom.east) * t;
    const north = s.chuteFrom.north + (s.chuteTo.north - s.chuteFrom.north) * t;
    const height = heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) throw new RangeError('sled chute leaves the canonical field');
    if (blockCount(east, north, height + .05)) rideBlocked++;
    if (previousHeight !== undefined) {
      const grade = (height - previousHeight) / (rideLength / rideSteps);
      minGrade = Math.min(minGrade, grade); maxGrade = Math.max(maxGrade, grade);
    }
    previousHeight = height;
  }

  const ascent = mountC2AscentRoad(c2FrontGroundAt);
  const ascentPoints = ascent.points.map(p => ({ east: p.east, north: p.north, height: p.height }));
  const manifest = segments(heightAt, ascentPoints);
  const seam = c2FrontSeamSpec;
  const result: C2TraversalAudit = {
    walk: legs,
    sled: { id: 'c2-east-sled-chute', stations: rideSteps + 1, blocked: rideBlocked,
      minGrade, maxGrade, pass: rideBlocked === 0 && maxGrade < 0 },
    frontAscent: { productionMount: ascent.deltaReport.productionMount,
      maxCut: ascent.deltaReport.maxCut, maxFill: ascent.deltaReport.maxFill,
      metres: ascent.stats().metres },
    frontSeam: { supported: planC2FrontSeam(c2FrontGroundAt).supported, gateInitiallyOpen: false,
      contact: { east: seam.east, north: seam.contactNorth, height: seam.deckHeight } },
    assets: assetsManifest(assets),
    segments: manifest,
  };
  ascent.dispose();
  for (const [, asset] of assets) asset.dispose();
  return result;
}
