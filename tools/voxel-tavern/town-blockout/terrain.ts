import layout from './layout.json';
import { marketStallLayouts, marketStallLocalPoint } from './market-stall-layout';
import { northernRiver, sampleExtension, worldBounds } from './town-extension';

export { layout, worldBounds };

type Point = { x: number; north: number; height: number };
type Segment = { a: Point; dx: number; dn: number; dh: number; lengthSquared: number; halfWidth: number };

const [west, south, east, north] = layout.plaza.bounds;
const clocktower = layout.plots.find(plot => plot.id === 'clocktower')!;
const [towerEast] = clocktower.origin;
const towerHalfWidth = clocktower.footprint[0] / 2;
const memorial = layout.plots.find(plot => plot.id === 'memorial')!;
const [memorialEast, memorialNorth, memorialLevel] = memorial.origin;
const [marketEast, marketNorth] = layout.plots.find(plot => plot.id === 'market-stalls')!.origin;
const gradedMarketCounters = new Set([5, 6, 7, 13, 14, 15, 16].map(index => `market-stall-${index}`));
const marketCounterAprons = marketStallLayouts.filter(stall => gradedMarketCounters.has(stall.id)).map(stall => {
  const [x, z] = marketStallLocalPoint(stall, 0, 2.6);
  const [nearX, nearZ] = marketStallLocalPoint(stall, 1.05, 2.6);
  return {
    east: marketEast + x,
    north: marketNorth - z,
    eastRadius: Math.abs(nearX - x) + 1,
    northRadius: Math.abs(nearZ - z) + 1,
    level: stall.counterGround,
  };
});

// Extend the paved apron datum below a full terrain grid cell at the south lip.
const memorialApron = [memorialEast - 11, memorialNorth - memorial.footprint[1] / 2 - 1,
  memorialEast + 11, memorial.door[1] + 1];
const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);
const fade = (t: number) => {
  const s = clamp(t, 0, 1);
  return s * s * (3 - 2 * s);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function segments(points: number[][], width: number): Segment[] {
  return points.slice(1).map(([x, north, height], i) => {
    const [ax, an, ah] = points[i];
    const dx = x - ax;
    const dn = north - an;
    return { a: { x: ax, north: an, height: ah }, dx, dn, dh: height - ah, lengthSquared: dx * dx + dn * dn, halfWidth: width / 2 };
  });
}

const roads = [
  ...layout.roads.flatMap(road => segments(road.points, road.width)),
  ...layout.plots.flatMap(plot => segments([plot.connect, [...plot.door, plot.origin[2]]], 4)),
];

function nearestRoad(x: number, north: number) {
  let distance = Infinity;
  let height = 0;
  let edge = Infinity;
  for (const { a, dx, dn, dh, lengthSquared, halfWidth } of roads) {
    const px = x - a.x;
    const pn = north - a.north;
    const t = clamp((px * dx + pn * dn) / lengthSquared, 0, 1);
    const d = Math.hypot(px - dx * t, pn - dn * t);
    if (d < distance) {
      distance = d;
      height = a.height + dh * t;
      edge = d - halfWidth;
    }
  }
  return { height, edge };
}

export function riverX(north: number) {
  const points = north > layout.depth ? northernRiver : layout.river;
  for (let i = 1; i < points.length; i++) {
    const [x0, n0] = points[i - 1];
    const [x1, n1] = points[i];
    if (north >= n1) return mix(x1, x0, clamp((north - n1) / (n0 - n1), 0, 1));
  }
  return points.at(-1)![0];
}

function lakeDistance(x: number, north: number) {
  const [cx, cn] = layout.lake.center;
  const [rx, rn] = layout.lake.radius;
  return (Math.hypot((x - cx) / rx, (north - cn) / rn) - 1) * rn;
}

export const waterHeight = 5;

export function isWater(x: number, north: number) {
  const [[ax, an], [bx, bn]] = layout.lake.inlet;
  const t = clamp((x - ax) / (bx - ax), 0, 1);
  const inlet = x >= ax && x <= bx && Math.abs(north - mix(an, bn, t)) < 4;
  return Math.abs(x - riverX(north)) < 8 || inlet;
}

export function bridgeAt(x: number, north: number) {
  return layout.bridges.find(b => x >= b.west && x <= b.east && Math.abs(north - b.north) <= 4);
}

function boxDistance(x: number, north: number, bounds: number[]) {
  const [x0, n0, x1, n1] = bounds;
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(n0 - north, 0, north - n1));
}

function raisedHill(x: number, north: number, cx: number, cn: number, rx: number, rn: number, height: number) {
  const distance = ((x - cx) / rx) ** 2 + ((north - cn) / rn) ** 2;
  return height * Math.exp(-distance);
}

export const gridStep = 1;
const gridWidth = worldBounds.width / gridStep + 1;
const gridDepth = worldBounds.depth / gridStep + 1;

function sample(x: number, n: number) {
  const r = Math.abs(x - riverX(n));
  const ld = lakeDistance(x, n);
  const road = nearestRoad(x, n);
  const plazaDistance = boxDistance(x, n, [west, south, east, north]);
  let elevation = 8.6 + 1.25 * Math.sin(x * .079 + n * .009) * Math.cos(n * .092)
    + raisedHill(x, n, 91, 275, 110, 112, 16)
    + raisedHill(x, n, 386, 313, 93, 91, 30)
    + raisedHill(x, n, 65, 353, 85, 49, 29)
    + raisedHill(x, n, 418, 369, 88, 66, 26);
  elevation = mix(3, elevation, fade((r - 6.8) / 18));
  elevation = mix(layout.lake.height, elevation, fade(ld / 13));
  elevation = mix(elevation, layout.plaza.height, 1 - fade(plazaDistance / 10));
  let plotSurface = false;
  for (const plot of layout.plots) {
    const [cx, cn, level] = plot.origin;
    const [w, d] = plot.footprint;
    const dist = boxDistance(x, n, [cx - w / 2, cn - d / 2, cx + w / 2, cn + d / 2]);
    elevation = mix(elevation, level, 1 - fade(dist / 5));
    plotSurface ||= dist === 0;
  }
  elevation = mix(elevation, road.height, 1 - fade(road.edge / 5));
  const apronDistance = boxDistance(x, n, memorialApron);
  elevation = mix(elevation, memorialLevel, 1 - fade(apronDistance / 5));
  for (const apron of marketCounterAprons) {
    const dx = Math.max(0, Math.abs(x - apron.east) - apron.eastRadius);
    const dn = Math.max(0, Math.abs(n - apron.north) - apron.northRadius);
    const distance = Math.hypot(dx, dn);
    if (distance < 1.5) elevation = mix(elevation, apron.level, 1 - fade(distance / 1.5));
  }
  // The tower apron is a level walking slab. Keep the terrain beneath its pavers,
  // leaving the shared boundary with the plaza at the original datum.
  if (Math.abs(x - towerEast) <= towerHalfWidth && n > clocktower.connect[1] && n <= clocktower.door[1]) {
    elevation = Math.min(elevation, layout.plaza.height - 1 / 32);
  }
  if (plazaDistance === 0) elevation = layout.plaza.height;
  if (isWater(x, n)) elevation = Math.min(elevation, 3.4);
  return { elevation, plaza: plazaDistance === 0, road: road.edge < 0, plot: plotSurface, ice: ld < -.5 && !isWater(x, n) };
}

export function createTerrainGrid() {
  const elevation = new Float32Array(gridWidth * gridDepth);
  const surfaces = new Uint8Array(elevation.length);
  for (let j = 0; j < gridDepth; j++) {
    for (let i = 0; i < gridWidth; i++) {
      const east = i * gridStep, north = j * gridStep;
      const cell = sample(east, north);
      const outsideLegacy = east > layout.width || north > layout.depth;
      const extension = outsideLegacy && !isWater(east, north) ? sampleExtension(east, north, cell.elevation) : cell;
      const index = j * gridWidth + i;
      elevation[index] = extension.elevation;
      surfaces[index] = cell.ice ? 4 : cell.plaza ? 2 : extension.road ? 1 : extension.plot ? 3 : 0;
    }
  }
  function groundHeightAt(x: number, north: number) {
    const gx = clamp(x / gridStep, 0, gridWidth - 1);
    const gn = clamp(north / gridStep, 0, gridDepth - 1);
    const i = Math.min(Math.floor(gx), gridWidth - 2);
    const j = Math.min(Math.floor(gn), gridDepth - 2);
    const a = elevation[j * gridWidth + i];
    const b = elevation[j * gridWidth + i + 1];
    const c = elevation[(j + 1) * gridWidth + i];
    const d = elevation[(j + 1) * gridWidth + i + 1];
    const u = gx - i;
    const v = gn - j;
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  function heightAt(x: number, north: number) {
    return bridgeAt(x, north)?.height ?? groundHeightAt(x, north);
  }
  return { elevation, surfaces, gridWidth, gridDepth, heightAt, groundHeightAt };
}

export function canEnter(x: number, n: number) {
  if (x < 1 || x > worldBounds.width - 1 || n < 1 || n > worldBounds.depth - 1) return false;
  const bridge = bridgeAt(x, n);
  if (bridge && Math.abs(n - bridge.north) > 3.55 + 1e-9) return false;
  return !!bridge || !isWater(x, n);
}
