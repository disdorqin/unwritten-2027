import {
  bridgeAt, canEnter, createTerrainGrid, gridStep, isWater, layout,
} from './voxel-tavern/town-blockout/terrain.ts';
import { createTownWater } from './voxel-tavern/town-blockout/town-water.ts';
import { longHallSledRoute } from './voxel-tavern/town-blockout/sled-route.ts';

type MapPoint = readonly [east: number, north: number];
type Route = { label: string; points: readonly MapPoint[]; bridgeDeck?: boolean };
type Probe = { point: MapPoint; distance: number; grade: number | undefined; rise: number | undefined; wet: boolean };

const saddle: MapPoint = [405, 320];
const saddleExit: MapPoint = [430, 180];

// Design §3 waypoints. The second route has no named waypoint between the peaks and its
// finish; use the proposed takeoff lip (405, 320) as the provisional turn in this survey.
const routes: readonly Route[] = [
  { label: '长厅大下坡（旧线）', points: [[378, 316], [337, 277], [251, 212]] },
  { label: '长厅大下坡（S1 v1.1）', points: longHallSledRoute, bridgeDeck: true },
  { label: '双峰连滑', points: [[418, 369], saddle, saddleExit] },
  { label: '林间缓降', points: [[91, 271], [150, 190]] },
];

const probeStep = gridStep / 4;
const slopeLookahead = 1.5;
const curbLookahead = .8;
const grid = createTerrainGrid();
const water = createTownWater(grid);
const round = (value: number) => Number(value.toFixed(3));

function ground(point: MapPoint, bridgeDeck = false) {
  return bridgeDeck ? grid.heightAt(...point) : grid.groundHeightAt(...point);
}

function mark(point: MapPoint, bridgeDeck = false) {
  const [east, north] = point;
  const plot = layout.plots.find(({ origin: [x, n], footprint: [width, depth] }) =>
    Math.abs(east - x) <= width / 2 && Math.abs(north - n) <= depth / 2);
  return {
    east: round(east), north: round(north), ground: round(ground(point, bridgeDeck)),
    plot: plot?.id ?? null, bridge: bridgeAt(...point)?.id ?? null,
  };
}

function markProbe(probe: Probe, bridgeDeck: boolean) {
  return { distance: round(probe.distance), ...mark(probe.point, bridgeDeck) };
}

function peak(probes: readonly Probe[], measure: (point: Probe) => number | undefined, direction: 1 | -1, bridgeDeck: boolean) {
  let best: { probe: Probe; value: number } | undefined;
  for (const probe of probes) {
    const value = measure(probe);
    if (value !== undefined && (!best || direction * value > direction * best.value)) {
      best = { probe, value };
    }
  }
  return best ? { ...markProbe(best.probe, bridgeDeck), value: round(best.value) } : null;
}

function runs(probes: readonly Probe[], bridgeDeck: boolean, matches: (probe: Probe) => boolean) {
  const spans: { from: ReturnType<typeof markProbe>; to: ReturnType<typeof markProbe> }[] = [];
  let first: Probe | undefined;
  for (let index = 0; index < probes.length; index++) {
    const probe = probes[index];
    const hit = matches(probe);
    if (hit) {
      first ??= probe;
      if (index < probes.length - 1) continue;
    }
    if (first) {
      const last = hit ? probe : probes[index - 1];
      spans.push({ from: markProbe(first, bridgeDeck), to: markProbe(last, bridgeDeck) });
      first = undefined;
    }
  }
  return spans;
}

function transect(start: MapPoint, end: MapPoint, offset: number, bridgeDeck: boolean) {
  const [de, dn] = [end[0] - start[0], end[1] - start[1]];
  const length = Math.hypot(de, dn);
  const pointAt = (distance: number): MapPoint => [
    start[0] + de * distance / length, start[1] + dn * distance / length,
  ];
  const riseAt = (distance: number, lookahead: number) => distance + lookahead <= length + 1e-9
    ? ground(pointAt(Math.min(length, distance + lookahead)), bridgeDeck) - ground(pointAt(distance), bridgeDeck)
    : undefined;

  const count = Math.ceil(length / probeStep);
  const probes: Probe[] = Array.from({ length: count + 1 }, (_, index) => {
    const distance = Math.min(length, index * probeStep);
    const point = pointAt(distance);
    const drop = riseAt(distance, slopeLookahead);
    return {
      point, distance: offset + distance,
      grade: drop === undefined ? undefined : 100 * drop / slopeLookahead,
      rise: riseAt(distance, curbLookahead),
      wet: !bridgeAt(...point) && (isWater(...point) || water.at(...point) !== undefined),
    };
  });
  const grades10m = Array.from({ length: Math.ceil(length / 10) }, (_, index) => {
    const distance = index * 10;
    const span = Math.min(10, length - distance);
    return { point: pointAt(distance), distance: round(offset + distance), span: round(span),
      grade: round(100 * riseAt(distance, span)! / span) };
  });
  const bands = {
    water: runs(probes, bridgeDeck, probe => probe.wet),
    outsideDryPassage: runs(probes, bridgeDeck, probe => !canEnter(...probe.point)),
    downhillOver55Percent: runs(probes, bridgeDeck, probe => probe.grade !== undefined && probe.grade < -55),
    uphillOver55Percent: runs(probes, bridgeDeck, probe => probe.grade !== undefined && probe.grade > 55),
    lowSpeedClimbOver8Percent: runs(probes, bridgeDeck, probe => probe.grade !== undefined && probe.grade > 8),
    curbRiseOver90Cm: runs(probes, bridgeDeck, probe => probe.rise !== undefined && probe.rise > .9),
    curbRiseOver25Cm: runs(probes, bridgeDeck, probe => probe.rise !== undefined && probe.rise > .25),
    launchCandidateOver43Cm: runs(probes, bridgeDeck, probe => probe.grade !== undefined && probe.grade < -100 * .43 / slopeLookahead),
  };
  return {
    length, probeCount: probes.length,
    start: mark(start, bridgeDeck), end: mark(end, bridgeDeck),
    drop: round(ground(start, bridgeDeck) - ground(end, bridgeDeck)),
    descent10m: Math.min(...grades10m.map(probe => probe.grade)),
    grades10m,
    descent: peak(probes, probe => probe.grade, -1, bridgeDeck),
    climb: peak(probes, probe => probe.grade, 1, bridgeDeck),
    curbRise: peak(probes, probe => probe.rise, 1, bridgeDeck),
    bands,
  };
}

function survey({ label, points, bridgeDeck = false }: Route) {
  let distance = 0;
  const legs = points.slice(1).map((end, index) => {
    const profile = transect(points[index], end, distance, bridgeDeck);
    distance += profile.length;
    return { ...profile, length: round(profile.length) };
  });
  const drop = ground(points[0], bridgeDeck) - ground(points[points.length - 1], bridgeDeck);
  return {
    label, length: round(distance), drop: round(drop), averageGrade: round(-100 * drop / distance),
    legs,
  };
}

const routesSurvey = routes.map(survey);
const memorial = layout.plots.find(plot => plot.id === 'memorial')!;
const memorialNorthEdge = memorial.origin[1] + memorial.footprint[1] / 2;
const memorialEast = memorial.origin[0];
const exitLength = Math.hypot(saddleExit[0] - saddle[0], saddleExit[1] - saddle[1]);
const lipEnd = [
  saddle[0] + (saddleExit[0] - saddle[0]) * 2.5 / exitLength,
  saddle[1] + (saddleExit[1] - saddle[1]) * 2.5 / exitLength,
] as const;
const worksSurvey = [
  { label: '长厅出发台至南缘门口', points: [[378, 316], [378, 306]] },
  { label: '长厅南缘沿南 8m', points: [[378, 306], [378, 298]] },
  { label: '纪念馆北缘建议点沿南 5m', points: [[337, 292], [337, 287]] },
  { label: '纪念馆布局北界内外各 5m', points: [[memorialEast, memorialNorthEdge + 5], [memorialEast, memorialNorthEdge - 5]] },
  { label: '鞍部起跳唇沿出鞍方向 2.5m', points: [saddle, lipEnd] },
] as const;
const s1 = routesSurvey.find(({ label }) => label.includes('S1 v1.1'))!;
const summary = {
  length: s1.length, drop: s1.drop, averageGrade: s1.averageGrade,
  probeCount: s1.legs.reduce((sum, leg) => sum + leg.probeCount, 0),
  steepestGrade: Math.min(...s1.legs.map(leg => leg.descent?.value ?? 0)),
  highestRise: Math.max(...s1.legs.map(leg => leg.curbRise?.value ?? 0)),
  water: s1.legs.flatMap(leg => leg.bands.water),
  blocked: s1.legs.flatMap(leg => leg.bands.outsideDryPassage),
};
console.log(JSON.stringify(process.argv.includes('--s1-summary') ? summary : {
  method: { gridStep, probeStep, slopeLookahead, curbLookahead, sign: 'downhill negative' },
  s1: summary, routes: routesSurvey, works: worksSurvey.map(survey),
}, null, process.argv.includes('--compact') ? 0 : 2));
