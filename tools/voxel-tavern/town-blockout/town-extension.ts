import layout from './layout.json';

export const worldBounds = { width: 640, depth: 512 };

export const northernRiver = [[231, 512], [239, 470], [225, 429], layout.river[0]];

type Point = [east: number, north: number, height: number];
type Road = { id: string; width: number; points: Point[] };
type Plot = { id: string; origin: Point; footprint: [width: number, depth: number] };

export const extensionRoads: Road[] = [
  // Curve south around the existing house at (410, 219), keeping a full-width walking lane.
  { id: 'coaster-approach', width: 6, points: [[382, 220, 20], [398, 207, 17.43], [410, 207, 16.26], [427, 214, 15.52], [445, 221, 15.92], [456, 222, 19], [464, 224, 19]] },
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

export function extensionRoadClearance(x: number, north: number, margin: number) {
  return roadSegments.some(({ ax, an, dx, dn, lengthSquared, halfWidth }) => {
    const px = x - ax, pn = north - an;
    const t = clampUnit((px * dx + pn * dn) / lengthSquared);
    return Math.hypot(px - t * dx, pn - t * dn) < halfWidth + margin;
  });
}
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
    // Give pedestrians a broad snow shoulder before each flat landmark apron.
    elevation += (height - elevation) * smooth(distanceOutside / transitionWidth) * (1 - smooth(outside / 14));
    plot ||= outside === 0;
  }
  if (!plot) elevation += (roadHeight - elevation) * blend * (1 - smooth(roadEdge / 5));
  return { elevation, road: roadEdge < 0, plot };
}

export type DistrictName = 'forest' | 'memorial' | 'market' | 'lakeside';

// District street centrelines and house parcels of the expanded districts.
// This data used to live inside extension-streets.ts; it is kept here, next to
// extensionRoads, so the forest-clearance predicate below can reach it without
// statically importing the lazily loaded extension-streets module.
export const districtStreets: { district: DistrictName; width: number; points: [number, number][] }[] = [
  { district: 'forest', width: 4.6, points: [[104,415],[111,433],[134,449],[165,453],[182,467],[202,486]] },
  { district: 'forest', width: 3.2, points: [[111,433],[98,442],[91,457],[110,480],[128,485],[153,481],[173,475],[182,467]] },
  { district: 'memorial', width: 4.8, points: [[373,296],[393,309],[410,323],[427,344],[446,357],[461,368],[493,383],[523,400],[546,427]] },
  { district: 'memorial', width: 3.6, points: [[461,368],[467,392],[485,417],[507,427],[546,427]] },
  { district: 'market', width: 5.5, points: [[506,286],[534,282],[562,292],[581,311],[588,337],[573,359],[551,365],[532,373],[506,378],[493,383]] },
  { district: 'market', width: 3.6, points: [[555,304],[562,310],[581,311]] },
  { district: 'lakeside', width: 4, points: [[446,99],[472,97],[496,97],[521,97],[535,104],[553,128],[550,138]] },
  { district: 'lakeside', width: 4.2, points: [[521,156],[507,174],[526,191],[549,202],[579,190],[601,176],[604,155]] },
  { district: 'lakeside', width: 3.6, points: [[574,165],[587,158],[604,155],[609,136],[598,123],[574,118],[553,128]] },
];

export const districtParcels: Record<DistrictName, [number, number, number, number][]> = {
  forest: [[80,416,9,9],[94,431,10,9],[76,449,11,10],[104,458,10,10],[92,477,12,10],
    [125,470,13,11],[134,436,10,9],[145,467,10,9],[151,493,11,10],[163,441,13,10],
    [168,489,10,9],[187,485,10,9],[194,453,12,11],[211,491,11,9]],
  memorial: [[410,343,11,10],[421,363,15,11],[441,381,14,12],[462,420,13,10],[479,398,16,12],
    [489,438,11,10],[502,400,11,10],[522,418,14,12],[549,413,13,11],[555,438,13,11],
    [503,451,13,10],[532,448,13,11]],
  market: [[516,273,11,10],[535,267,12,10],[554,272,13,11],[572,280,13,10],
    [589,295,13,11],[566,322,11,12],[603,314,15,12],[603,338,12,10],[590,362,13,12],
    [571,376,11,10],[548,352,11,8],[551,385,12,11],[526,358,13,10],[513,366,10,9]],
  lakeside: [[428,94,11,9],[431,115,12,10],[521,82,12,10],[539,85,13,11],[551,65,10,9],
    [560,85,13,10],[570,133,13,11],[586,136,11,10],[607,117,12,10],[619,146,12,11],
    [601,163,10,9],[620,175,12,10],[596,192,12,10],[576,207,11,10],[552,216,13,10],
    [528,207,12,11],[519,178,10,9],[510,103,11,9]],
};

type ClearSegment = { ax: number; an: number; dx: number; dn: number; lengthSquared: number; halfWidth: number };

const districtSegments: ClearSegment[] = districtStreets.flatMap(({ points, width }) =>
  points.slice(1).map((b, i) => {
    const a = points[i];
    const dx = b[0] - a[0], dn = b[1] - a[1];
    return { ax: a[0], an: a[1], dx, dn, lengthSquared: dx * dx + dn * dn, halfWidth: width / 2 };
  }));

function segmentDistance(x: number, north: number, { ax, an, dx, dn, lengthSquared }: DoorSegment) {
  const t = clampUnit(((x - ax) * dx + (north - an) * dn) / lengthSquared);
  return Math.hypot(x - (ax + t * dx), north - (an + t * dn));
}

// Door geometry of the extension houses, replicated from extension-streets.ts
// (parcel loop + buildHouse): a house faces the projection of its parcel
// centre on the nearest route segment (approach roads + district streets),
// yaw snapped to a cardinal direction, and its door sits at
// at(0, depth / 2 + 1.14) in house space. buildExtensionStreets later rejects
// some parcels (rail/legacy clearance, overlap, slope); clearing a fan for a
// rejected parcel only costs the trees inside that one fan, so the static
// list deliberately covers every parcel.
type DoorSegment = { ax: number; an: number; dx: number; dn: number; lengthSquared: number };
const doorPaths: DoorSegment[] = [];
const doorFans: DoorSegment[] = [];
{
  const routes: ClearSegment[] = [...roadSegments, ...districtSegments];
  for (const positions of Object.values(districtParcels)) {
    for (const [px0, pn0, , pd] of positions) {
      let near = routes[0];
      let nearDistance = Infinity;
      for (const seg of routes) {
        const d = segmentDistance(px0, pn0, seg);
        if (d < nearDistance) { nearDistance = d; near = seg; }
      }
      const t = clampUnit(((px0 - near.ax) * near.dx + (pn0 - near.an) * near.dn) / near.lengthSquared);
      const projX = near.ax + t * near.dx, projN = near.an + t * near.dn;
      const yaw = Math.abs(projX - px0) > Math.abs(projN - pn0)
        ? Math.sign(projX - px0) * Math.PI / 2 : projN > pn0 ? Math.PI : 0;
      const front = pd / 2 + 1.14;
      const outX = Math.sin(yaw), outN = -Math.cos(yaw);
      const doorX = px0 + front * outX, doorN = pn0 + front * outN;
      const pathDx = projX - doorX, pathDn = projN - doorN;
      if (pathDx * pathDx + pathDn * pathDn > 1) {
        doorPaths.push({ ax: doorX, an: doorN, dx: pathDx, dn: pathDn, lengthSquared: pathDx * pathDx + pathDn * pathDn });
      }
      // Door fan: the straight apron a visitor walks when approaching the
      // door head-on (e.g. due south of the memorial house at [421, 363]).
      doorFans.push({ ax: doorX, an: doorN, dx: outX * 6.5, dn: outN * 6.5, lengthSquared: 6.5 * 6.5 });
    }
  }
}

// Forest clearance for the expanded districts (D3): the district streets get
// the same treatment as the approach roads in extensionRoadClearance
// (centreline distance < street half width + caller margin), and each house
// door gets its footpath (door -> street projection, the sparsePath drawn by
// buildExtensionStreets) plus a 6.5 m head-on fan. Path/fan margins are
// capped: a 2.18 m footpath needs trunk room, not full crown clearance, so
// the wide crown radius forest-density passes in must not clear a ~10 m
// swath to every door.
export function extensionStreetClearance(x: number, north: number, margin: number) {
  if (districtSegments.some(seg => segmentDistance(x, north, seg) < seg.halfWidth + margin)) return true;
  const capped = Math.min(margin, 1);
  if (doorPaths.some(seg => segmentDistance(x, north, seg) < 1.09 + capped + .3)) return true;
  return doorFans.some(seg => segmentDistance(x, north, seg) < 1.5 + capped);
}
