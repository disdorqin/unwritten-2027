import layout from './layout.json';
import { icePalaceSite } from './ice-palace-site';
import { b1BuildProtection } from './terrain-undulations';

/**
 * ZA-34 / R2 lake-east snowfield. A zero-allocation deterministic relief
 * offset only: its sole consumer is the SAME createTerrainGrid() on client
 * and server. No separate visual snow mounds, camera-only height, or fake
 * collider geometry.
 *
 * B1 was completed on another isolated lane. This function intentionally
 * touches ONLY B2, so those two terrain deliveries can be reviewed separately.
 */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};

// Surveyed existing objects in town-fill-lake-east.ts. We retain a pure,
// Three.js-free register here to keep the authoritative height sampler light.
// The regression test cross-checks every point against the live object table.
export const b2ExistingLandmarks: readonly Readonly<{
  east: number; north: number; radius: number;
}>[] = [
  { east: 414, north: 64, radius: 1.8 }, { east: 408, north: 68, radius: 1.8 },
  { east: 404, north: 84, radius: 1.8 }, { east: 416, north: 60, radius: 2.2 },
  { east: 416, north: 76, radius: 2.2 }, { east: 420, north: 44, radius: .6 },
  { east: 420, north: 92, radius: .6 }, { east: 398, north: 46, radius: .7 },
  { east: 398, north: 90, radius: .7 }, { east: 424, north: 58, radius: 1.2 },
  { east: 428, north: 82, radius: .8 }, { east: 412, north: 44, radius: 1.0 },
  { east: 402, north: 36, radius: 2.2 }, { east: 478, north: 108, radius: 1.4 },
  { east: 492, north: 116, radius: 1.4 }, { east: 466, north: 118, radius: 1.4 },
  { east: 536, north: 128, radius: 1.6 }, { east: 550, north: 116, radius: 1.6 },
  { east: 520, north: 60, radius: 2.2 }, { east: 540, north: 48, radius: 2.2 },
  { east: 600, north: 80, radius: 2.2 }, { east: 452, north: 146, radius: 2.2 },
  { east: 630, north: 140, radius: 2.2 }, { east: 590, north: 20, radius: 1.6 },
  { east: 500, north: 14, radius: 1.6 }, { east: 528, north: 78, radius: 2.4 },
  { east: 610, north: 130, radius: 2.4 }, { east: 472, north: 12, radius: 2.4 },
  { east: 530, north: 105, radius: 1.1 }, { east: 575, north: 100, radius: 1.2 },
  { east: 486, north: 124, radius: .6 }, { east: 615, north: 55, radius: .6 },
];

const [lakeEast, lakeNorth] = layout.lake.center;
const [radiusEast, radiusNorth] = layout.lake.radius;
function lakeShoreDistance(e: number, n: number) {
  const metric = Math.hypot((e - lakeEast) / radiusEast, (n - lakeNorth) / radiusNorth);
  return (metric - 1) * radiusNorth;
}

/** Zero at wet/frozen lake and the east-shore boardwalk; smoothly fade inland. */
export function b2LakeShoreMask(e: number, n: number) {
  return smooth((lakeShoreDistance(e, n) - 4) / 32);
}

/**
 * A 5m stable pad and 20m soft shoulder for every already-built B2 scene
 * object; no "props standing half under the hill" at the old Y.
 */
export function b2LandmarkMask(e: number, n: number) {
  let clearance = Infinity;
  for (const point of b2ExistingLandmarks) {
    if (Math.abs(e - point.east) > 34 || Math.abs(n - point.north) > 34) continue;
    clearance = Math.min(clearance,
      Math.hypot(e - point.east, n - point.north) - point.radius);
  }
  return smooth((clearance - 4) / 21);
}

/** The palace terrain includes its SOUTH forecourt, not just its building
 * blockout. Its original 12m apron must remain bit-identical on all grid
 * vertices, with a 35m eased shoulder past the real footing rectangle. */
export function b2PalaceProtection(e: number, n: number) {
  const [east, north, level] = icePalaceSite.terrain.origin;
  const [width, depth] = icePalaceSite.terrain.footprint;
  const de=Math.max(0, Math.abs(e-east)-width/2);
  const dn=Math.max(0, Math.abs(n-north)-depth/2);
  return smooth((Math.hypot(de,dn)-3)/35);
}

/** B2 gradual 40m boundary rolloff, never a zero-width cliff or seam. */
export function b2TerrainEnvelope(e: number, n: number) {
  return smooth((e - 404) / 40) * smooth((640 - e) / 32)
    * smooth((n - 0) / 40) * smooth((173 - n) / 38);
}

export function b2TerrainReliefOffset(e: number, n: number) {
  if (e <= 404 || e >= 640 || n <= 0 || n >= 173) return 0;
  const envelope = b2TerrainEnvelope(e, n);
  if (envelope === 0) return 0;
  // The B1 road/rail/cottage zero-elevation mask also protects all B2 roads.
  // It is pure and applies to both regions; zero near a built station is exact.
  const protection = b1BuildProtection(e, n);
  if (protection === 0) return 0;
  const lake = b2LakeShoreMask(e, n);
  const scenery = b2LandmarkMask(e, n);
  const palace = b2PalaceProtection(e, n);
  if (lake === 0 || scenery === 0 || palace === 0) return 0;
  const theta = 2 * Math.PI;
  // Two 161/181m and 147m roll components, plus the 100m scale open-field
  // wind scoop at E616/N37, where cleared skiing ground has no built props.
  // Its broad Gaussian shoulder leaves no sharp local dune or hidden ledge.
  const snowScoop = -2.95 * Math.exp(-(((e - 616) / 55) ** 2) - (((n - 37) / 57) ** 2));
  const wave = 2.65 * Math.sin(theta * (e - 505) / 161)
      * Math.cos(theta * (n - 73) / 181)
    + .84 * Math.sin(theta * (e * .88 + n * .32) / 147 + .37)
    + snowScoop;
  return Math.max(-6, Math.min(6, wave)) * envelope * protection * lake * scenery * palace;
}
