export type CavePoint = readonly [east: number, north: number];
export type CaveRegion = 'crystal-forest' | 'crystal-hall' | 'moonstone-vein' | 'underground-pool' | 'dark-passage';
export type Mineral = 'ordinary-ice-crystal' | 'amethyst-cluster' | 'blue-crystal' | 'moonstone';

export type CrystalSite = {
  id: string;
  region: CaveRegion;
  point: CavePoint;
  mineral: Mineral;
  height: number;
  radius: number;
  role: 'scatter' | 'deposit' | 'column';
};

type RegionBox = { west: number; east: number; south: number; north: number; region: CaveRegion };
export const crystalCave = {
  depthMetres: -140,
  growthAngleRadians: 11 * Math.PI / 180,
  pulsePeriodSeconds: 20,
  bounds: { west: -13, east: 30, south: 0, north: 100 },
  pool: { centre: [-1, 57] as CavePoint, eastRadius: 6.5, northRadius: 5.2, depth: .44, waterY: -1.81 },
  entrance: [0, 1] as CavePoint,
  exit: [8.7, 98] as CavePoint,
  mirrorApproach: [28, 32] as CavePoint,
  hallFirePad: [-9.8, 37.5] as CavePoint,
  poolFirePad: [6.6, 62.4] as CavePoint,
} as const;

const rooms: readonly RegionBox[] = [
  { region: 'crystal-forest', west: -4, east: 4, south: 0, north: 18 },
  { region: 'crystal-hall', west: -13, east: 13, south: 18, north: 46 },
  { region: 'moonstone-vein', west: 13, east: 30, south: 30, north: 34 },
  { region: 'underground-pool', west: -6, east: 6, south: 46, north: 50 },
  { region: 'underground-pool', west: -10, east: 10, south: 50, north: 66 },
  { region: 'dark-passage', west: -2, east: 2, south: 66, north: 100 },
  { region: 'dark-passage', west: 2, east: 10, south: 96, north: 100 },
];

// E/N in the cave's own metres. The entrance and exit are host seam markers.
export const crystalCaveMainPath: readonly CavePoint[] = [
  crystalCave.entrance, [0, 2.5], [-1.7, 4.9], [-1.8, 7.2], [1.65, 10.1], [1.7, 12.6],
  [-1.6, 15.2], [-1.3, 17.4], [0, 19], [0, 27], [0, 31], [-2.15, 35], [-2.6, 39],
  [-1.5, 43], [0, 46], [0, 49], [5.2, 50.8], [7.8, 53], [7.9, 59.5], [5.7, 63.1],
  [0, 65.3], [0, 67], [0, 98], crystalCave.exit,
];
export const crystalCaveMoonstonePath: readonly CavePoint[] = [[0, 31], [10.5, 32], [17, 32], crystalCave.mirrorApproach];

function cluster(id: string, region: CaveRegion, mineral: Mineral, role: CrystalSite['role'], point: CavePoint,
  height: number, radius: number): CrystalSite {
  return { id, region, mineral, role, point, height, radius };
}

export const crystalCaveSites: readonly CrystalSite[] = [
  cluster('forest-inlet-left', 'crystal-forest', 'ordinary-ice-crystal', 'scatter', [-2.9, 2.3], .65, .39),
  cluster('forest-inlet-right', 'crystal-forest', 'ordinary-ice-crystal', 'scatter', [2.9, 3.2], .84, .43),
  cluster('forest-turn-1', 'crystal-forest', 'ordinary-ice-crystal', 'scatter', [.39, 5.4], 1.24, .61),
  cluster('forest-east-bank', 'crystal-forest', 'ordinary-ice-crystal', 'scatter', [2.95, 6.8], 1.13, .50),
  cluster('forest-west-bank', 'crystal-forest', 'ordinary-ice-crystal', 'scatter', [-3.12, 8.1], .58, .39),
  cluster('forest-turn-2', 'crystal-forest', 'amethyst-cluster', 'scatter', [-.5, 10.5], 1.45, .64),
  cluster('forest-south-shelf', 'crystal-forest', 'amethyst-cluster', 'scatter', [-2.9, 11.5], .92, .46),
  cluster('forest-north-shelf', 'crystal-forest', 'amethyst-cluster', 'scatter', [3.05, 12.45], .64, .38),
  cluster('forest-turn-3', 'crystal-forest', 'amethyst-cluster', 'scatter', [.56, 15.9], 1.40, .58),
  cluster('forest-exit', 'crystal-forest', 'amethyst-cluster', 'scatter', [2.98, 17.03], .79, .44),
  cluster('forest-exit-left', 'crystal-forest', 'amethyst-cluster', 'scatter', [-3.15, 17.15], 1.10, .44),
  cluster('hall-column-west', 'crystal-hall', 'blue-crystal', 'column', [-4.35, 27.5], 8.1, 1.02),
  cluster('hall-column-east', 'crystal-hall', 'blue-crystal', 'column', [4.55, 27.5], 7.8, 1.05),
  cluster('hall-column-north', 'crystal-hall', 'blue-crystal', 'column', [1.2, 37.4], 8.35, 1.02),
  cluster('hall-south-shelf', 'crystal-hall', 'blue-crystal', 'scatter', [3.6, 21.3], 1.15, .60),
  cluster('hall-west-rich', 'crystal-hall', 'blue-crystal', 'deposit', [-11.6, 21.8], 2.7, .91),
  cluster('hall-east-rich', 'crystal-hall', 'blue-crystal', 'deposit', [11.65, 42.6], 2.4, .88),
  cluster('hall-exit-shelf', 'crystal-hall', 'blue-crystal', 'scatter', [3.55, 44.3], .88, .45),
  cluster('vein-first-outcrop', 'moonstone-vein', 'moonstone', 'scatter', [15.5, 30.58], .88, .32),
  cluster('vein-south-seam', 'moonstone-vein', 'moonstone', 'deposit', [22, 30.55], 1.45, .38),
  cluster('vein-north-seam', 'moonstone-vein', 'moonstone', 'deposit', [25.1, 33.54], 1.27, .41),
  cluster('pool-west-rim', 'underground-pool', 'ordinary-ice-crystal', 'scatter', [-8.1, 53.2], .76, .39),
  cluster('pool-east-rim', 'underground-pool', 'ordinary-ice-crystal', 'scatter', [9.14, 57.7], .59, .30),
  cluster('pool-outlet-rim', 'underground-pool', 'ordinary-ice-crystal', 'scatter', [-2.35, 64.1], .82, .43),
];

export function crystalCaveRegionAt(east: number, north: number): CaveRegion | undefined {
  return rooms.find(room => east >= room.west && east <= room.east && north >= room.south && north <= room.north)?.region;
}

function rockFloor(east: number, north: number) {
  if (north <= 18) return -.064 * north;
  if (east >= 13 && north >= 30 && north <= 34) return -1.152 - (east - 13) * .076;
  if (north <= 46) return -1.152;
  if (north <= 50) return -1.152 - (north - 46) * .084;
  if (north <= 66) {
    const { centre, eastRadius, northRadius, depth, waterY } = crystalCave.pool;
    const r = Math.hypot((east - centre[0]) / eastRadius, (north - centre[1]) / northRadius);
    const depression = Math.min(1, Math.max(0, (1.08 - r) / .43));
    return -1.488 + (waterY - depth + 1.488) * depression;
  }
  return -1.488 - (north - 66) * .046;
}

/** Identical triangular interpolation to the generated walk surface. */
export function crystalCaveFloorAt(east: number, north: number) {
  if (crystalCaveRegionAt(east, north) === undefined) return undefined;
  const x = Math.floor(east), n = Math.floor(north);
  const u = east - x, v = north - n;
  const a = rockFloor(x, n), b = rockFloor(x + 1, n), c = rockFloor(x, n + 1), d = rockFloor(x + 1, n + 1);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function crystalCaveRoofAt(east: number, north: number) {
  const floor = rockFloor(east, north);
  if (east >= -13 && east <= 13 && north >= 18 && north <= 46) {
    const dome = Math.min(1, 1 - Math.hypot(east / 17, (north - 32) / 21));
    return floor + 12 + 2.8 * Math.max(0, dome);
  }
  if (north >= 50 && north <= 66) return floor + 6.55 - .045 * Math.abs(east);
  if (north >= 66) return floor + 3.9;
  return floor + (east > 13 ? 3.8 : 4.15);
}

export function crystalCaveClusterClearance(site: CrystalSite) {
  return site.radius + site.height * Math.sin(crystalCave.growthAngleRadians) + .11;
}

/** Local standing capsule footprint; deposits and true crystals are static obstacles. */
export function crystalCaveCanStand(east: number, north: number, radius = .27) {
  if (!Number.isFinite(radius) || radius < 0 || crystalCaveFloorAt(east, north) === undefined) return false;
  for (let i = 0; i < 8; i++) {
    const theta = i * Math.PI / 4;
    if (crystalCaveRegionAt(east + radius * Math.cos(theta), north + radius * Math.sin(theta)) === undefined) return false;
  }
  return !crystalCaveSites.some(site => Math.hypot(east - site.point[0], north - site.point[1]) < crystalCaveClusterClearance(site) + radius);
}

export function crystalCaveDistanceToPath([east, north]: CavePoint, path: readonly CavePoint[]) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = path[i - 1]!;
    const [c, d] = path[i]!;
    const dx = c - a, dn = d - b;
    const mix = Math.max(0, Math.min(1, ((east - a) * dx + (north - b) * dn) / (dx ** 2 + dn ** 2)));
    best = Math.min(best, Math.hypot(east - a - dx * mix, north - b - dn * mix));
  }
  return best;
}
