import { BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4, MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat, StaticDrawUsage } from 'three';
import { c2EastSector } from './town-night-c2-summit-canonical';

/**
 * C32-P1: the east-sector share of the summit sled network.
 *
 * `summitSledLineLengthM = 6037.881` is a *nominal* course length; the survey
 * baseline records that no placed route exists ("6037.881m 是标称全长，不是已
 * 落位路线"). This module therefore builds and measures C2's actual share
 * rather than repeating the nominal figure.
 *
 * Geometry: two descents from the 610 m east shoulder, marched downhill on the
 * rendered 8 m faces. The east flank drops hard - 602.8 m to 560 m within 28 m,
 * then to 380 m over roughly 315-480 m - so the network is cut into the three
 * designed stages by altitude: 云上 above the 560 m cloud top, 穿云 inside the
 * 380-560 m cloud band, 云下 below it.
 *
 * Course rules that the order names explicitly:
 * - 穿云 has no junction: the two runs stay separate through the cloud band and
 *   only merge at the 380 m contour, inside 云下. The shared lane is built once.
 * - 未允许的线路在暴雪期间关闭: every run carries its own permission and the
 *   gate closes the rest. Nothing here decides the weather - it only refuses.
 */

export type SledHeightAt = (east: number, north: number) => number | undefined;
export type SledStage = 'above-cloud' | 'through-cloud' | 'below-cloud';

export const c2EastSledSpec = Object.freeze({
  shoulder: Object.freeze({ east: 590, north: 1080 }),
  cloudBand: Object.freeze([380, 560] as const),
  floorMetres: 330,
  laneHalfWidth: 1.35,
  bermWidth: .6,
  gateEvery: 120,
  stationStep: 1,
  mergeTolerance: 2,
  palette: ['#dfe8ee', '#c9d7e0', '#b4c6d2', '#eef4f8', '#9fb3c1'] as const,
});

const BEARINGS = Object.freeze([
  { id: 'east-main', azimuthDegrees: 150, permittedInBlizzard: true },
  { id: 'east-branch', azimuthDegrees: 110, permittedInBlizzard: false },
] as const);

export type SledRun = Readonly<{
  id: string;
  permittedInBlizzard: boolean;
  points: readonly Readonly<{ east: number; north: number; height: number; metres: number }>[];
  stages: Readonly<Record<SledStage, Readonly<{ from: number; to: number; metres: number }>>>;
  metres: number;
}>;

function stageOf(height: number, band: readonly [number, number]): SledStage {
  if (height > band[1]) return 'above-cloud';
  if (height >= band[0]) return 'through-cloud';
  return 'below-cloud';
}

/** March one bearing down the rendered faces until the sector edge or the
 * floor. Nothing is invented where the host has no ground. */
export function surveyC2EastSledRun(heightAt: SledHeightAt, id: string, azimuthDegrees: number, permittedInBlizzard: boolean, steerTo?: Readonly<{ east: number; north: number }>): SledRun {
  const radians = azimuthDegrees * Math.PI / 180;
  const de = Math.sin(radians), dn = Math.cos(radians);
  let east = c2EastSledSpec.shoulder.east, north = c2EastSledSpec.shoulder.north;
  const points: { east: number; north: number; height: number; metres: number }[] = [];
  let metres = 0, previousHeight: number | undefined;
  while (metres < 3_000) {
    const height = heightAt(east, north);
    if (height === undefined) break;
    if (east < c2EastSector.west + 8 || east > c2EastSector.east - 8) break;
    if (north < c2EastSector.south + 8 || north > c2EastSector.north - 8) break;
    points.push({ east, north, height, metres });
    if (height <= c2EastSledSpec.floorMetres) break;
    if (previousHeight !== undefined && height > previousHeight + 2) break;
    previousHeight = height;
    // Below the cloud band a branch steers into the main lane instead of
    // running parallel forever: this is the 并轨 that makes it a network.
    if (steerTo && height < c2EastSledSpec.cloudBand[0]) {
      const toEast = steerTo.east - east, toNorth = steerTo.north - north;
      const length = Math.hypot(toEast, toNorth);
      if (length <= 1) break;
      east += toEast / length; north += toNorth / length; metres += 1;
      continue;
    }
    east += de; north += dn; metres += 1;
  }
  const stages: Record<SledStage, { from: number; to: number; metres: number }> = {
    'above-cloud': { from: 0, to: 0, metres: 0 },
    'through-cloud': { from: 0, to: 0, metres: 0 },
    'below-cloud': { from: 0, to: 0, metres: 0 },
  };
  for (const stage of ['above-cloud', 'through-cloud', 'below-cloud'] as const) {
    const stations = points.filter(point => stageOf(point.height, c2EastSledSpec.cloudBand) === stage);
    if (stations.length === 0) continue;
    stages[stage] = { from: stations[0]!.metres, to: stations.at(-1)!.metres, metres: stations.at(-1)!.metres - stations[0]!.metres };
  }
  return { id, permittedInBlizzard, points, stages, metres };
}

export type SledLanePiece = Readonly<{
  family: 'floor' | 'berm' | 'gate' | 'merge';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

export type SledNetworkPlan = Readonly<{
  runs: readonly SledRun[];
  pieces: readonly SledLanePiece[];
  merges: readonly Readonly<{ run: string; into: string; east: number; north: number; height: number; metres: number }>[];
  metres: number;
  sharedMetres: number;
  stages: Readonly<Record<SledStage, number>>;
  gates: number;
}>;

function boundaryWeight(east: number, north: number) {
  const fromWest = Math.min(1, Math.max(0, (east - c2EastSector.west) / c2EastSector.boundary));
  const fromSouth = Math.min(1, Math.max(0, (north - c2EastSector.south) / c2EastSector.boundary));
  return fromWest * fromSouth;
}

/**
 * Build the lane. The branch merges into the main run at the 380 m contour -
 * inside 云下, never inside 穿云 - and everything downstream of the merge is
 * emitted once, as a shared lane.
 */
export function planC2EastSledNetwork(heightAt: SledHeightAt): SledNetworkPlan {
  const spec = c2EastSledSpec;
  const runs = BEARINGS.map(bearing =>
    surveyC2EastSledRun(heightAt, bearing.id, bearing.azimuthDegrees, bearing.permittedInBlizzard));
  // Survey the branch a second time, steering it into the main lane once it is
  // below the cloud band, so the two runs really merge instead of running
  // parallel forever.
  const [first, branchSeed] = runs;
  if (first && branchSeed) {
    const belowMain = first.points.filter(point => point.height < spec.cloudBand[0]);
    if (belowMain.length) {
      const target = belowMain[0]!;
      const steered = surveyC2EastSledRun(heightAt, branchSeed.id, BEARINGS[1].azimuthDegrees,
        branchSeed.permittedInBlizzard, { east: target.east, north: target.north });
      runs[1] = steered;
    }
  }
  const [main, branch] = runs;
  if (!main || !branch) throw new RangeError('C2 east sled network needs both runs.');

  // The merge is the first branch station that lands on the main run, and it
  // is only legal below the cloud band.
  let merge: { east: number; north: number; height: number; metres: number; mainMetres: number } | undefined;
  for (const point of branch.points) {
    if (point.height >= spec.cloudBand[0]) continue;
    for (const target of main.points) {
      if (target.height >= spec.cloudBand[0]) continue;
      if (Math.hypot(target.east - point.east, target.north - point.north) <= spec.mergeTolerance) {
        merge = { east: point.east, north: point.north, height: point.height, metres: point.metres, mainMetres: target.metres };
        break;
      }
    }
    if (merge) break;
  }

  const pieces: SledLanePiece[] = [];
  let gates = 0;
  const emit = (run: SledRun, points: readonly SledRun['points'][number][]) => {
    for (let i = 0; i < points.length; i++) {
      const station = points[i]!;
      if (boundaryWeight(station.east, station.north) < .999) continue;
      const ahead = points[Math.min(i + 1, points.length - 1)]!;
      const behind = points[Math.max(i - 1, 0)]!;
      const de = ahead.east - behind.east, dn = ahead.north - behind.north;
      const run2 = Math.hypot(de, dn);
      const yaw = run2 > 1e-9 ? Math.atan2(de, dn) : 0;
      const normalEast = run2 > 1e-9 ? -dn / run2 : 0;
      const normalNorth = run2 > 1e-9 ? de / run2 : 1;
      pieces.push({
        family: 'floor', east: station.east, north: station.north, y: station.height,
        w: spec.laneHalfWidth * 2, h: .14, d: 1.1, yaw, shade: Math.round(station.metres) % spec.palette.length,
      });
      for (const side of [-1, 1]) {
        const east = station.east + normalEast * spec.laneHalfWidth * side;
        const north = station.north + normalNorth * spec.laneHalfWidth * side;
        if (boundaryWeight(east, north) < .999) continue;
        const edge = heightAt(east, north);
        if (edge === undefined) continue;
        pieces.push({
          family: 'berm', east, north, y: edge, w: spec.bermWidth, h: .42, d: 1.15,
          yaw, shade: (Math.round(station.metres) + 1) % spec.palette.length,
        });
      }
    }
    const gatesOfRun = Math.floor(run.metres / spec.gateEvery);
    for (let gate = 1; gate <= gatesOfRun; gate++) {
      const station = run.points.find(point => point.metres >= gate * spec.gateEvery);
      if (!station || boundaryWeight(station.east, station.north) < .999) continue;
      for (const side of [-1, 1]) {
        const normal = Math.atan2(station.east - run.points[0]!.east, station.north - run.points[0]!.north);
        const east = station.east + Math.cos(normal) * spec.laneHalfWidth * 1.1 * side;
        const north = station.north - Math.sin(normal) * spec.laneHalfWidth * 1.1 * side;
        if (boundaryWeight(east, north) < .999) continue;
        pieces.push({
          family: 'gate', east, north, y: heightAt(east, north) ?? station.height,
          w: .14, h: 1.6, d: .14, yaw: 0, shade: 3,
        });
      }
      gates++;
    }
  };

  if (merge) {
    pieces.push({
      family: 'merge', east: merge.east, north: merge.north, y: merge.height,
      w: spec.laneHalfWidth * 4, h: .12, d: 1.4, yaw: 0, shade: 2,
    });
    // Upstream main, the branch up to the junction, then the shared tail -
    // emitted exactly once, because past the merge it is one lane.
    emit(main, main.points.filter(point => point.metres <= merge!.mainMetres));
    // The junction station itself belongs to the main lane only.
    emit(branch, branch.points.filter(point => point.metres < merge!.metres));
    emit(main, main.points.filter(point => point.metres > merge!.mainMetres));
  } else {
    emit(main, main.points);
    emit(branch, branch.points);
  }

  const sharedMetres = merge ? main.metres - merge.mainMetres : 0;
  const metres = main.metres + (merge ? merge.metres : branch.metres);
  const stages: Record<SledStage, number> = {
    'above-cloud': main.stages['above-cloud'].metres + branch.stages['above-cloud'].metres,
    'through-cloud': main.stages['through-cloud'].metres + branch.stages['through-cloud'].metres,
    'below-cloud': main.stages['below-cloud'].metres + branch.stages['below-cloud'].metres,
  };
  return {
    runs,
    pieces,
    merges: merge ? [{ run: branch.id, into: main.id, east: merge.east, north: merge.north, height: merge.height, metres: merge.metres }] : [],
    metres,
    sharedMetres,
    stages,
    gates,
  };
}

/**
 * Which runs a player may start in the current weather. A blizzard closes
 * everything not explicitly permitted; this function never decides weather, it
 * only refuses.
 */
export function c2EastSledOpenRuns(plan: SledNetworkPlan, blizzard: boolean) {
  return plan.runs
    .filter(run => run.points.length > 1)
    .map(run => ({ id: run.id, open: !blizzard || run.permittedInBlizzard }));
}

function paletteTexture() {
  const data = new Uint8Array(c2EastSledSpec.palette.length * 16);
  for (let i = 0; i < c2EastSledSpec.palette.length; i++) {
    const color = new Color(c2EastSledSpec.palette[i]!);
    for (let texel = 0; texel < 16; texel++) {
      const offset = i * 16 + texel * 4;
      data[offset] = Math.round(color.r * 255);
      data[offset + 1] = Math.round(color.g * 255);
      data[offset + 2] = Math.round(color.b * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, 4, c2EastSledSpec.palette.length, RGBAFormat);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mountC2EastSledNetwork(heightAt: SledHeightAt) {
  const plan = planC2EastSledNetwork(heightAt);
  const group = new Group();
  group.name = 'town-night-c2-summit-east-sled-network';
  const texture = paletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, plan.pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-sled-boxes';
  const transform = new Object3D();
  const tint = new Color();
  let index = 0;
  for (const piece of plan.pieces) {
    transform.position.set(piece.east, piece.y + piece.h / 2, -piece.north);
    transform.rotation.set(0, piece.yaw, 0);
    transform.scale.set(piece.w, piece.h, piece.d);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tint.set(c2EastSledSpec.palette[piece.shade % c2EastSledSpec.palette.length]!));
    index++;
  }
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  const colliders = plan.pieces
    .filter(piece => piece.family === 'gate')
    .map(piece => ({
      west: piece.east - piece.w / 2, east: piece.east + piece.w / 2,
      south: piece.north - piece.d / 2, north: piece.north + piece.d / 2,
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
    /** Runs a player may start right now; a blizzard closes the rest. */
    openRuns: (blizzard: boolean) => c2EastSledOpenRuns(plan, blizzard),
    stats: () => ({
      pieces: plan.pieces.length,
      metres: plan.metres,
      sharedMetres: plan.sharedMetres,
      stages: plan.stages,
      merges: plan.merges.length,
      gates: plan.gates,
      batches: 1,
      lights: 0,
    }),
  };
}
