import layout from './layout.json';

export const worldBounds = { width: 640, depth: 512 };

export const northernRiver = [[231, 512], [239, 470], [225, 429], layout.river[0]];

type Point = [east: number, north: number, height: number];
type Road = { id: string; width: number; points: Point[] };
type Plot = { id: string; origin: Point; footprint: [width: number, depth: number] };

export const extensionRoads: Road[] = [
  { id: 'coaster-approach', width: 6, points: [[382, 220, 20], [411, 220, 20], [445, 221, 19], [456, 222, 19], [464, 224, 19]] },
  { id: 'station-approach', width: 7, points: [[456, 222, 19], [453, 254, 21], [473, 276, 22], [506, 286, 24], [526, 312, 26]] },
  { id: 'hot-spring-approach', width: 6, points: [[374, 129, 11], [402, 132, 11], [445, 136, 12], [479, 139, 13], [504, 150, 15], [524, 158, 15]] },
  { id: 'ice-castle-approach', width: 6, points: [[445, 136, 12], [446, 107, 12], [447, 80, 12], [460, 72, 12]] },
  { id: 'north-forest-approach', width: 6, points: [[121, 286, 23], [106, 313, 24], [92, 345, 27], [93, 384, 30], [104, 415, 31]] },
];

export const extensionPlots: Plot[] = [
  { id: 'railway-station', origin: [526, 329, 26], footprint: [58, 34] },
  { id: 'hot-spring', origin: [548, 158, 15], footprint: [48, 32] },
  { id: 'ice-castle', origin: [484, 72, 12], footprint: [48, 38] },
  { id: 'coaster-station', origin: [478, 224, 19], footprint: [28, 48] },
];

const roadSegments = extensionRoads.flatMap(({ points, width }) => points.slice(1).map(([bx, bn, bh], i) => {
  const [ax, an, ah] = points[i];
  const dx = bx - ax, dn = bn - an;
  return { ax, an, ah, dx, dn, dh: bh - ah, lengthSquared: dx * dx + dn * dn, halfWidth: width / 2 };
}));

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));
function smooth(value: number) {
  const t = clampUnit(value);
  return t * t * (3 - 2 * t);
}

export function sampleExtension(x: number, north: number, elevation: number) {
  // Legacy samples, including their edge vertices, come from the old sampler verbatim.
  const distanceOutside = Math.hypot(Math.max(0, x - layout.width), Math.max(0, north - layout.depth));
  const blend = smooth(distanceOutside / 24);
  let nearDistance = Infinity;
  let roadHeight = elevation;
  let roadEdge = Infinity;
  for (const { ax, an, ah, dx, dn, dh, lengthSquared, halfWidth } of roadSegments) {
    const px = x - ax, pn = north - an;
    const t = clampUnit((px * dx + pn * dn) / lengthSquared);
    const d = Math.hypot(px - t * dx, pn - t * dn);
    if (d < nearDistance) {
      nearDistance = d;
      roadHeight = ah + t * dh;
      roadEdge = d - halfWidth;
    }
  }

  let plot = false;
  for (const { origin: [cx, cn, height], footprint: [width, depth] } of extensionPlots) {
    const outside = Math.hypot(Math.max(0, Math.abs(x - cx) - width / 2), Math.max(0, Math.abs(north - cn) - depth / 2));
    const transitionWidth = Math.min(24, Math.max(cx - width / 2 - layout.width, cn - depth / 2 - layout.depth));
    elevation += (height - elevation) * smooth(distanceOutside / transitionWidth) * (1 - smooth(outside / 6));
    plot ||= outside === 0;
  }
  if (!plot) elevation += (roadHeight - elevation) * blend * (1 - smooth(roadEdge / 5));
  return { elevation, road: roadEdge < 0, plot };
}
