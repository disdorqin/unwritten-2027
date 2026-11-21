import { BufferAttribute, Color, type Mesh } from 'three';

/**
 * ZA-34 / eleventh-round A distant-readability candidate.
 *
 * Color the EXISTING B-01 walk-mesh vertices, without adding rings, blocking
 * paths, replacing triangles or changing the physical height authority.
 * Large-scale alternating rock/snow strata keep the bowl legible when the
 * individual rocks/lanterns disappear into distance fog.
 *
 * This is an opt-in look-development treatment. A real first-person
 * day/night screenshot comparison and D/C sign-off are required before
 * enabling it by default.
 */
export type CraterDistantPaletteAudit = Readonly<{
  vertices: number;
  indices: number;
  materialBands: Readonly<Record<'rimSnow' | 'upperRock' | 'middleRock' | 'lowerRock' | 'floor', number>>;
  minLuminance: number;
  maxLuminance: number;
}>;

const rim = new Color('#cee0e6');
const snow = new Color('#9ebbc9');
const rock = new Color('#7d8589');
const rockDusk = new Color('#626a72');
const dark = new Color('#4a505b');
const cinder = new Color('#655752');
const cold = new Color('#a4c9ce');

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};

/** A stronger topographic pattern, not an artificial series of flat circles. */
function craterDistanceColor(east: number, height: number, south: number, target: Color) {
  const radius = Math.hypot(east, south);
  const bearing = Math.atan2(east, -south);
  const natural = 0.7 * Math.sin(bearing * 7 + radius * .13)
    + 0.35 * Math.sin(bearing * 11 - radius * .28);
  const jitter = natural * .54;
  const r = radius + jitter;
  let band: keyof CraterDistantPaletteAudit['materialBands'];
  if (r >= 48.5) {
    // Snow lip: a pale crown around the bowl breaks the black-disc silhouette.
    target.copy(rock).lerp(rim, smooth((r - 47.0) / 8.5));
    band = 'rimSnow';
  } else if (r >= 39.6) {
    target.copy(rockDusk).lerp(snow, .31 + .28 * smooth((r - 39.6) / 6.3));
    band = 'upperRock';
  } else if (r >= 29.3) {
    target.copy(dark).lerp(rock, .49 * smooth((r - 29.3) / 10.3));
    band = 'middleRock';
  } else if (r >= 20.3) {
    target.copy(cinder).lerp(rockDusk, .28 + .38 * smooth((r - 20.3) / 9));
    band = 'lowerRock';
  } else {
    // Floor remains darker than the lip, but is not a solid black disk.
    const floorPatch = .15 + .31 * smooth((height + 35) / 10)
      + .08 * Math.sin(east * .25 + south * .17);
    target.copy(dark).lerp(cold, clamp(floorPatch));
    band = 'floor';
  }
  // Soft diagonal material striations read at 50–200m; no high-frequency
  // checker noise and no new per-pixel shader or additional draw call.
  const streak = .92 + .065 * Math.sin((east * .26 + south * .17) + bearing * 2)
    + .025 * Math.sin(east * .57 - south * .34);
  target.multiplyScalar(clamp(streak));
  return band;
}

/**
 * Owns one color attribute; geometry index, positions, normals and renderer
 * draw count remain exactly as in B-01. Mutates only when explicitly invoked.
 */
export function applyCraterDistancePalette(mesh: Mesh): CraterDistantPaletteAudit {
  if (mesh.name !== 'meteor-crater-walk-mesh') {
    throw new Error('Crater distance palette must be applied only to the B-01 walk surface');
  }
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const previous = geometry.getAttribute('color');
  if (!previous || !positions || positions.count !== previous.count) {
    throw new Error('Expected the existing B-01 vertex-color mesh');
  }
  const colors = new Float32Array(positions.count * 3);
  const counts: Record<keyof CraterDistantPaletteAudit['materialBands'], number> = {
    rimSnow: 0, upperRock: 0, middleRock: 0, lowerRock: 0, floor: 0,
  };
  const tone = new Color();
  let minLuminance = Infinity, maxLuminance = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const band = craterDistanceColor(positions.getX(i), positions.getY(i), positions.getZ(i), tone);
    counts[band]++;
    const luminance = .2126 * tone.r + .7152 * tone.g + .0722 * tone.b;
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
    tone.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return {
    vertices: positions.count,
    indices: geometry.index?.count ?? 0,
    materialBands: counts,
    minLuminance,
    maxLuminance,
  };
}
