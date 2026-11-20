import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial } from 'three';
import type { Box } from './landmark-kit';

export const mainSummitSpec = {
  width: 2_200, depth: 1_800, baseHeight: 150, summitHeight: 800,
  summitPlateau: [70, 50], cloudBand: [380, 560],
  gateLength: 10, arrivalPlaza: [60, 40], frontRidgeArrivalBand: [347, 350],
} as const;

// Local (0, 0) is the inner face of the gate, independent of the town's frame.
export const mainSummitBounds = {
  west: -mainSummitSpec.width / 2, east: mainSummitSpec.width / 2,
  south: -mainSummitSpec.gateLength, north: mainSummitSpec.depth - mainSummitSpec.gateLength,
} as const;

type Peak = { east: number; north: number; eastRun: number; northRun: number };
type Shoulder = Peak & { height: number };

export type MainSummitBlockLayout = {
  summit: Peak;
  shoulders: readonly [Shoulder, Shoulder];
  ridgeHalfWidth: number;
  arrivalBlend: number;
  gate: { clearWidth: number; clearHeight: number; jamb: number; lintel: number };
};

// Local coordinates proposed for the P-1 terrain and the downstream station survey.
export const mainSummitLayout = {
  summit: { east: 50, north: 1_000, eastRun: 1_300, northRun: 1_375 },
  shoulders: [
    { east: -550, north: 900, height: 560, eastRun: 260, northRun: 300 },
    { east: 590, north: 1_080, height: 610, eastRun: 240, northRun: 280 },
  ],
  ridgeHalfWidth: 180,
  arrivalBlend: 45,
  gate: { clearWidth: 4, clearHeight: 5, jamb: 1.5, lintel: 1.2 },
} as const satisfies MainSummitBlockLayout;

const outside = (value: number, lower: number, upper: number) => Math.max(lower - value, value - upper, 0);

function sampleAxis(min: number, max: number, spacing: number, anchors: readonly number[]) {
  const positions = new Set([min, max, ...anchors]);
  for (let value = min + spacing; value < max; value += spacing) positions.add(value);
  return [...positions].sort((a, b) => a - b);
}

/**
 * Builds a self-owned candidate. Mount the coarse mesh separately from the gate;
 * entering/leaving the gate does not change the parent's terrain or coarse view.
 */
export function createMainSummitBlock(layout: MainSummitBlockLayout, arrivalHeight: number, coarseSpacing: number) {
  const { baseHeight, summitHeight, gateLength, summitPlateau, arrivalPlaza, frontRidgeArrivalBand } = mainSummitSpec;
  const { west, east, south, north } = mainSummitBounds;
  const { ridgeHalfWidth, arrivalBlend } = layout;
  const summit = { ...layout.summit };
  const shoulders = layout.shoulders.map(shoulder => ({ ...shoulder }));
  const gate = { ...layout.gate };
  const halfPlateauWidth = summitPlateau[0] / 2, halfPlateauDepth = summitPlateau[1] / 2;
  const halfPlazaWidth = arrivalPlaza[0] / 2, plazaEnd = arrivalPlaza[1];
  if (!Number.isInteger(coarseSpacing) || coarseSpacing < 1) throw new RangeError('Invalid coarse sampling spacing.');
  if (!Number.isFinite(arrivalHeight) || outside(arrivalHeight, ...frontRidgeArrivalBand) > 0) {
    throw new RangeError('The gate floor must meet the front ridge plateau.');
  }
  if (![ridgeHalfWidth, arrivalBlend, gate.clearWidth, gate.clearHeight, gate.jamb, gate.lintel]
    .every(value => Number.isFinite(value) && value > 0) ||
      gate.clearWidth + gate.jamb * 2 > arrivalPlaza[0]) throw new RangeError('Invalid main summit geometry.');
  // Keep the 0.27 m radius and 1.8 m standing player clear of both jambs and lintel.
  if (gate.clearWidth <= .54 || gate.clearHeight < 1.8) {
    throw new RangeError('Main summit gate clearance is too small for a standing player.');
  }
  const summitPeak = { ...summit, height: summitHeight };
  for (const [i, peak] of [summitPeak, ...shoulders].entries()) {
    const halfWidth = i === 0 ? halfPlateauWidth : 0;
    const halfDepth = i === 0 ? halfPlateauDepth : 0;
    if (!Object.values(peak).every(Number.isFinite) || peak.eastRun <= 0 || peak.northRun <= 0 ||
        peak.height <= baseHeight || (i > 0 && peak.height >= summitHeight) ||
        peak.east - halfWidth < west || peak.east + halfWidth > east ||
        peak.north - halfDepth < south || peak.north + halfDepth > north) {
      throw new RangeError('A main summit peak is outside its bounds or height range.');
    }
  }
  if (new Set([summitPeak, ...shoulders].map(peak => `${peak.east}:${peak.north}`)).size !== 3 ||
      (Math.abs(summit.east) < halfPlazaWidth + halfPlateauWidth + arrivalBlend &&
        summit.north - halfPlateauDepth < plazaEnd + arrivalBlend)) {
    throw new RangeError('The summit, shoulders and gate need distinct positions.');
  }

  function distanceFromPlaza(e: number, n: number) {
    return Math.hypot(outside(e, -halfPlazaWidth, halfPlazaWidth), outside(n, south, plazaEnd));
  }

  function heightAt(e: number, n: number): number | undefined {
    if (!Number.isFinite(e) || !Number.isFinite(n) || outside(e, west, east) > 0 || outside(n, south, north) > 0) return;
    const summitDistance = Math.hypot(
      outside(e, summit.east - halfPlateauWidth, summit.east + halfPlateauWidth) / summit.eastRun,
      outside(n, summit.north - halfPlateauDepth, summit.north + halfPlateauDepth) / summit.northRun,
    );
    let height = baseHeight + (summitHeight - baseHeight) * Math.max(0, 1 - summitDistance);
    for (const shoulder of shoulders) {
      const dx = shoulder.east - summit.east, dn = shoulder.north - summit.north;
      const along = Math.max(0, Math.min(1, ((e - summit.east) * dx + (n - summit.north) * dn) / (dx * dx + dn * dn)));
      const peakDistance = Math.hypot((e - shoulder.east) / shoulder.eastRun, (n - shoulder.north) / shoulder.northRun);
      const ridgeDistance = Math.hypot(e - summit.east - dx * along, n - summit.north - dn * along);
      const ridgeHeight = summitHeight + (shoulder.height - summitHeight) * along;
      height = Math.max(height, baseHeight + (shoulder.height - baseHeight) * Math.max(0, 1 - peakDistance),
        baseHeight + (ridgeHeight - baseHeight) * Math.max(0, 1 - ridgeDistance / ridgeHalfWidth));
    }
    const distance = distanceFromPlaza(e, n);
    if (distance === 0) return arrivalHeight;
    const weight = Math.max(0, 1 - distance / arrivalBlend);
    return height + (arrivalHeight - height) * weight;
  }

  // The caller supplies the old terrace's normalized depth. Domain strength runs
  // from 1 to 5. The existing snow movement thresholds consume depth from 0 to 1.
  function snowDepthAt(e: number, n: number, terraceDepth: number) {
    const height = heightAt(e, n);
    if (height === undefined || !Number.isFinite(terraceDepth) || terraceDepth < 0 || terraceDepth > 1) return;
    const accumulated = 1 + 4 * Math.max(0, Math.min(1, (height - 210) / 410));
    const exposed = 2 + 3 * Math.max(0, Math.min(1, (775 - height) / 115));
    const depth = Math.min(accumulated, exposed) / 5;
    const blend = Math.min(1, distanceFromPlaza(e, n) / arrivalBlend);
    return terraceDepth + (depth - terraceDepth) * blend;
  }

  const xs = sampleAxis(west, east, coarseSpacing, [-halfPlazaWidth, 0, halfPlazaWidth, summit.east - halfPlateauWidth,
    summit.east, summit.east + halfPlateauWidth, ...shoulders.map(shoulder => shoulder.east)]);
  const ns = sampleAxis(south, north, coarseSpacing, [0, plazaEnd, summit.north - halfPlateauDepth,
    summit.north, summit.north + halfPlateauDepth, ...shoulders.map(shoulder => shoulder.north)]);
  const vertices = new Float32Array(xs.length * ns.length * 3);
  const triangles: number[] = [];
  for (const [row, n] of ns.entries()) {
    for (const [column, e] of xs.entries()) {
      const here = row * xs.length + column;
      vertices.set([e, heightAt(e, n)!, -n], here * 3);
      if (column + 1 === xs.length || row + 1 === ns.length) continue;
      const nextRow = here + xs.length;
      triangles.push(here, here + 1, nextRow, here + 1, nextRow + 1, nextRow);
    }
  }
  const terrain = new BufferGeometry();
  terrain.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  terrain.setIndex(triangles);
  terrain.computeVertexNormals();
  terrain.computeBoundingBox();
  const coarse = new Mesh(terrain, new MeshLambertMaterial({ color: '#4b5e74', fog: false }));
  coarse.name = 'main-summit-coarse';

  let arrival: ReturnType<typeof buildMainSummitGate> | undefined;
  let disposed = false;
  function leave() {
    arrival?.dispose();
    arrival = undefined;
  }
  return {
    heightAt, snowDepthAt, coarse,
    enter(owner: Group) {
      if (disposed) throw new Error('The main summit block is disposed.');
      arrival ??= buildMainSummitGate(gate, arrivalHeight);
      if (arrival.group.parent !== owner) owner.add(arrival.group);
      return { group: arrival.group, colliders: arrival.colliders };
    },
    leave,
    dispose() {
      if (disposed) return;
      disposed = true;
      leave();
      coarse.removeFromParent();
      terrain.dispose();
      coarse.material.dispose();
    },
  };
}

function buildMainSummitGate(gate: MainSummitBlockLayout['gate'], floor: number) {
  const group = new Group();
  group.name = 'main-summit-gate';
  const stone = new MeshLambertMaterial({ color: '#687378' });
  const depth = mainSummitSpec.gateLength;
  const colliders: Box[] = [];
  const solids: BoxGeometry[] = [];
  function block(center: number, above: number, width: number, height: number) {
    const geometry = new BoxGeometry(width, height, depth);
    const mesh = new Mesh(geometry, stone);
    const lower = floor + above;
    mesh.position.set(center, lower + height / 2, depth / 2);
    group.add(mesh);
    solids.push(geometry);
    colliders.push({ min: [center - width / 2, lower, 0], max: [center + width / 2, lower + height, depth] });
  }
  const jambCenter = (gate.clearWidth + gate.jamb) / 2;
  block(-jambCenter, 0, gate.jamb, gate.clearHeight);
  block(jambCenter, 0, gate.jamb, gate.clearHeight);
  block(0, gate.clearHeight, gate.clearWidth + gate.jamb * 2, gate.lintel);
  return {
    group, colliders,
    dispose() {
      group.removeFromParent();
      group.clear();
      colliders.length = 0;
      for (const geometry of solids) geometry.dispose();
      stone.dispose();
    },
  };
}
