import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group,
  Mesh, MeshLambertMaterial,
} from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitTrail } from './main-summit-trail';
import {
  summitSledGateCount, summitSledLineLengthM,
} from './town-summit-sled-line';
import { sampleTownD2R30Height } from './town-d2-r30-domain';

/**
 * D2-R03: terrain-support audit + solid stands for the 12 surveyed sled gates.
 * The sled course is a canonical 6037.881 m / 12-gate 2D rule module; its gates
 * are derived from the P-1 walkway crosswalk and are NOT moved here. This
 * module samples each gate against the R30 massif and builds a stone stand
 * wherever the surveyed gate foot would otherwise float above the terrain.
 * No scoring, gate count, length or public viewer is changed.
 */
export type TownD2R30SledGateReport = Readonly<{
  gate: number;
  east: number;
  north: number;
  height: number;
  ground: number;
  delta: number;
  status: 'grounded' | 'stand';
}>;

export type TownD2R30SledGateSupportStats = Readonly<{
  gates: number;
  grounded: number;
  stands: number;
  maxGap: number;
  courseMetres: number;
  draws: number;
  triangles: number;
}>;

const DEFAULTS = Object.freeze({ groundedBand: 2, standRadius: 1.4, stoneColor: '#746b5e' });

/** R5: paint a vertical stone gradient onto a geometry so stone supports read
 *  as real cut rock rather than a flat fill. Costs no extra draw calls; the
 *  material colour stays a multiplier for the night tint. */
function applyStoneGradient(geometry: BufferGeometry, topHex: string, bottomHex: string) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const top = new Color(topHex), bottom = new Color(bottomHex);
  let minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY || 1;
  for (let index = 0; index < position.count; index++) {
    const t = (position.getY(index) - minY) / span;
    const c = top.clone().lerp(bottom, t);
    colors[index * 3] = c.r;
    colors[index * 3 + 1] = c.g;
    colors[index * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

/** Derives the 12 survey gates from the canonical P-1 walkway crosswalk. */
export function surveyTownD2R30SledGates(arrivalHeight: number) {
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
  try {
    const trail = createMainSummitTrail(block.heightAt, arrivalHeight);
    const cumulative = [0];
    for (let index = 1; index < trail.points.length; index++) {
      const a = trail.points[index - 1]!, b = trail.points[index]!;
      cumulative.push(cumulative[index - 1]! + Math.hypot(b.east - a.east, b.north - a.north, b.height - a.height));
    }
    const footpathM = cumulative.at(-1)!;
    const segmentM = summitSledLineLengthM / (summitSledGateCount + 1);
    const pointAt = (metresDownhill: number) => {
      const remaining = footpathM - metresDownhill;
      if (remaining < 0 || remaining > footpathM) throw new RangeError('Sled gate outside P-1 reference.');
      let lo = 0, hi = cumulative.length - 1;
      while (lo + 1 < hi) {
        const middle = (lo + hi) >>> 1;
        if (cumulative[middle]! > remaining) hi = middle; else lo = middle;
      }
      const fraction = (remaining - cumulative[lo]!) / (cumulative[hi]! - cumulative[lo]!);
      const a = trail.points[lo]!, b = trail.points[hi]!;
      return {
        east: a.east + (b.east - a.east) * fraction,
        north: a.north + (b.north - a.north) * fraction,
        height: a.height + (b.height - a.height) * fraction,
      };
    };
    return Array.from({ length: summitSledGateCount }, (_, index) => pointAt((index + 1) * segmentM));
  } finally {
    block.dispose();
  }
}

export function createTownD2R30SledGateSupport(options: {
  arrivalHeight?: number;
  heightAt?: (east: number, north: number, arrivalHeight?: number) => number | undefined;
  groundedBand?: number;
} = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const groundedBand = options.groundedBand ?? DEFAULTS.groundedBand;
  if (!Number.isFinite(arrivalHeight) || !Number.isFinite(groundedBand) || groundedBand < 0) {
    throw new RangeError('Invalid D2-R03 sled gate support parameters.');
  }
  const heightAt = options.heightAt ?? ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));
  const gates = surveyTownD2R30SledGates(arrivalHeight);

  const group = new Group();
  group.name = 'town-d2-r30-sled-gate-support';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshLambertMaterial>();
  const stone = new MeshLambertMaterial({ color: '#ffffff' });
  materials.add(stone);

  const reports: TownD2R30SledGateReport[] = [];
  for (const [index, gate] of gates.entries()) {
    const value = heightAt(gate.east, gate.north, arrivalHeight);
    if (value === undefined || !Number.isFinite(value)) {
      throw new RangeError(`D2-R03 sled gate ${index + 1} has no R30 ground.`);
    }
    const ground = value;
    const delta = gate.height - ground;
    const status = delta > groundedBand ? 'stand' : 'grounded';
    reports.push(Object.freeze({ gate: index + 1, east: gate.east, north: gate.north,
      height: gate.height, ground, delta, status }));
    if (status !== 'stand') continue;
    const stand = new Group();
    stand.name = `town-d2-r30-sled-stand-${index + 1}`;
    stand.position.set(gate.east, 0, -gate.north);
    const pillar = new CylinderGeometry(DEFAULTS.standRadius, DEFAULTS.standRadius * 1.2, delta, 8);
    pillar.translate(0, ground + delta / 2, 0);
    applyStoneGradient(pillar, '#8a8174', '#5c544a');
    geometries.add(pillar);
    stone.vertexColors = true;
    stand.add(new Mesh(pillar, stone));
    group.add(stand);
  }

  let triangles = 0;
  for (const geometry of geometries) {
    triangles += (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
  }
  const stats: TownD2R30SledGateSupportStats = Object.freeze({
    gates: reports.length,
    grounded: reports.filter(report => report.status === 'grounded').length,
    stands: reports.filter(report => report.status === 'stand').length,
    maxGap: Math.max(0, ...reports.map(report => report.delta)),
    courseMetres: summitSledLineLengthM,
    draws: geometries.size,
    triangles,
  });
  group.userData = {
    owner: 'D2-R03', visualOnly: true, includesWorldCollision: false,
    modifiesHeightAt: false, modifiesSledRules: false,
    reports: Object.freeze(reports), stats,
    coordinateConvention: 'x=east,y=height,z=-north',
  };

  let disposed = false;
  return {
    group,
    reports: () => Object.freeze(reports.map(report => ({ ...report }))),
    stats: () => stats,
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R03 sled gate stands are disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      // Vertex colours carry the stone gradient; white leaves it intact at day.
      stone.color.set(value ? '#3f3a33' : '#ffffff');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
