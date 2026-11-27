/**
 * Shareable, deterministic weather field for the Unwritten town map.
 *
 * The Presence host owns the single authoritative weather state (`clear-snow`,
 * `wind`, `whiteout`). This module never changes that state and never schedules
 * weather of its own: it only turns one authoritative state plus a world point
 * into local snow / fog / wind / cover values.
 *
 * The field is deliberately smooth and deterministic:
 * - no per-frame random, no per-position independent weather;
 * - identical inputs produce identical outputs on every client and on reconnect;
 * - one constant-time sample (no map traversal), safe to call once per frame.
 */

export type TownWeatherFieldBase = {
  intensity: number;
  fogNear: number;
  fogFar: number;
  pilingRate: number;
  targetCover: number;
  /** Null when the authoritative weather is not a whiteout. */
  visibilityMeters?: number | null;
  skyColor?: string;
};

export type TownWeatherFieldPosition = {
  east: number;
  north: number;
  elevation: number;
  /** Metres to the nearest town-map edge; computed from the map bounds when omitted. */
  edgeDistance?: number;
};

export type TownWeatherFieldInput = {
  base: TownWeatherFieldBase;
  position: TownWeatherFieldPosition;
  windEast?: number;
  windNorth?: number;
  windStrength?: number;
};

export type TownWeatherFieldRegion = 'town' | 'foothill' | 'alpine' | 'summit' | 'crater' | 'map-edge';

export type TownWeatherFieldSample = TownWeatherFieldBase & {
  /** 0 = sheltered town floor, 1 = the harshest exposed terrain. */
  severity: number;
  region: TownWeatherFieldRegion;
  windEast: number;
  windNorth: number;
  windStrength: number;
  /** Multiplier applied to the authoritative snow intensity. */
  snowIntensityScale: number;
  /** Multiplier applied to the authoritative fog distances. */
  fogScale: number;
  /** Practical visibility in metres, always finite for UI and audio. */
  visibilityMeters: number;
};

/** Mirrors `TOWN_BOUNDS`; tests assert the two stay in sync. */
export const townWeatherMapWidth = 640;
export const townWeatherMapDepth = 800;
/** The surveyed west crater anchor (meteor-crater rim radius is 55 m). */
export const townWeatherCrater = Object.freeze({ east: -120, north: 185, rimRadius: 55 });
export const townWeatherMapEdgeSoftnessMeters = 90;
export const townWeatherFoothillBandMeters = 20;
export const townWeatherAlpineBandMeters = 380;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Fixed-seed 2D value noise. No Math.random, so every client agrees. */
function hash2(east: number, north: number): number {
  let h = Math.imul(east | 0, 374_761_393) + Math.imul(north | 0, 668_265_263);
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

const weatherFieldNoiseCellMeters = 64;

function valueNoise(east: number, north: number): number {
  const x = east / weatherFieldNoiseCellMeters;
  const y = north / weatherFieldNoiseCellMeters;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const u = smoothstep(0, 1, x - x0), v = smoothstep(0, 1, y - y0);
  return mix(
    mix(hash2(x0, y0), hash2(x0 + 1, y0), u),
    mix(hash2(x0, y0 + 1), hash2(x0 + 1, y0 + 1), u),
    v,
  );
}

export function townWeatherEdgeDistance(position: Pick<TownWeatherFieldPosition, 'east' | 'north' | 'edgeDistance'>): number {
  if (position.edgeDistance !== undefined && Number.isFinite(position.edgeDistance)) {
    return Math.max(0, position.edgeDistance);
  }
  const { east, north } = position;
  if (!Number.isFinite(east) || !Number.isFinite(north)) return 0;
  return Math.max(0, Math.min(
    east, townWeatherMapWidth - east,
    north, townWeatherMapDepth - north,
  ));
}

export function townWeatherTerrainSeverity(position: Pick<TownWeatherFieldPosition, 'east' | 'north' | 'elevation' | 'edgeDistance'>): number {
  const east = Number.isFinite(position.east) ? position.east : 0;
  const north = Number.isFinite(position.north) ? position.north : 0;
  const elevation = Number.isFinite(position.elevation) ? position.elevation : 0;

  const elevationFactor = smoothstep(townWeatherFoothillBandMeters, townWeatherAlpineBandMeters, elevation);
  const summitFactor = smoothstep(600, 780, elevation);
  const craterDistance = Math.hypot(east - townWeatherCrater.east, north - townWeatherCrater.north);
  const craterFactor = 1 - smoothstep(townWeatherCrater.rimRadius, townWeatherCrater.rimRadius + 95, craterDistance);
  const edgeFactor = 1 - smoothstep(0, townWeatherMapEdgeSoftnessMeters, townWeatherEdgeDistance(position));

  // Take the harshest influence instead of stacking them: stacking would make
  // a mountain edge reach absurd values while the plaza stayed artificial.
  const relief = Math.max(
    .1,
    .9 * elevationFactor + .08 * summitFactor,
    1.0 * craterFactor,
    .97 * edgeFactor,
  );
  return clamp01(relief);
}

function regionFor(severity: number, position: TownWeatherFieldPosition): TownWeatherFieldRegion {
  const east = position.east, north = position.north;
  const craterDistance = Math.hypot(east - townWeatherCrater.east, north - townWeatherCrater.north);
  if (1 - smoothstep(townWeatherCrater.rimRadius, townWeatherCrater.rimRadius + 95, craterDistance) > .5) return 'crater';
  if (1 - smoothstep(0, townWeatherMapEdgeSoftnessMeters, townWeatherEdgeDistance(position)) > .5) return 'map-edge';
  if (position.elevation >= 700) return 'summit';
  if (severity >= .55) return 'alpine';
  if (severity >= .22) return 'foothill';
  return 'town';
}

/**
 * Samples the local weather field. `base` must be the authoritative conversion
 * (snow amount / fog / cover) for the current Presence weather; this function
 * only applies the terrain's smooth regional modulation.
 */
export function townWeatherFieldAt(input: TownWeatherFieldInput): TownWeatherFieldSample {
  const { base } = input;
  const position: TownWeatherFieldPosition = {
    east: Number.isFinite(input.position.east) ? input.position.east : 0,
    north: Number.isFinite(input.position.north) ? input.position.north : 0,
    elevation: Number.isFinite(input.position.elevation) ? input.position.elevation : 0,
    edgeDistance: input.position.edgeDistance,
  };
  const severity = townWeatherTerrainSeverity(position);

  const snowIntensityScale = .6 + .95 * severity;
  const snowIntensity = Math.max(0, base.intensity * snowIntensityScale);

  const whiteout = Number.isFinite(base.visibilityMeters);
  let fogFar: number, fogNear: number, visibilityMeters: number;
  if (whiteout) {
    // The high mountain keeps the approved ~12 m whiteout. Sheltered town sees
    // a much wider but still snow-choked range, so the mountain stays the
    // dangerous place without inventing a second weather state.
    visibilityMeters = mix(78, 11, smoothstep(.08, .9, severity));
    fogFar = visibilityMeters * 1.15;
    fogNear = Math.max(0, base.fogNear, visibilityMeters * .06);
  } else {
    visibilityMeters = base.fogFar * mix(1.08, .58, severity);
    fogFar = base.fogFar * mix(1.04, .55, severity);
    fogNear = Math.max(1, base.fogNear * mix(.98, .72, severity));
  }

  const edgeFactor = 1 - smoothstep(0, townWeatherMapEdgeSoftnessMeters, townWeatherEdgeDistance(position));
  const craterDistance = Math.hypot(position.east - townWeatherCrater.east, position.north - townWeatherCrater.north);
  const craterFactor = 1 - smoothstep(townWeatherCrater.rimRadius, townWeatherCrater.rimRadius + 95, craterDistance);

  const baseWindEast = Number.isFinite(input.windEast) ? input.windEast! : 0;
  const baseWindNorth = Number.isFinite(input.windNorth) ? input.windNorth! : -1;
  const exposure = Math.max(severity, .85 * edgeFactor, .9 * craterFactor);
  const baseStrength = clamp01(Number.isFinite(input.windStrength) ? input.windStrength! : 0);
  const windStrength = clamp01(Math.max(baseStrength * (.5 + .6 * exposure), .38 * exposure));
  const deflect = (valueNoise(position.east + 911, position.north - 377) - .5) * .45;
  const baseLength = Math.hypot(baseWindEast, baseWindNorth) || 1;
  const angle = Math.atan2(baseWindNorth / baseLength, baseWindEast / baseLength) + deflect;
  const windEast = Math.cos(angle);
  const windNorth = Math.sin(angle);

  const targetCover = clamp01(base.targetCover * (.7 + .55 * severity));
  const pilingRate = Math.max(0, base.pilingRate * (.75 + .5 * severity));

  return {
    ...base,
    intensity: snowIntensity,
    fogNear,
    fogFar,
    pilingRate,
    targetCover,
    severity,
    region: regionFor(severity, position),
    windEast,
    windNorth,
    windStrength,
    snowIntensityScale,
    fogScale: base.fogFar > 0 ? fogFar / base.fogFar : 1,
    visibilityMeters: Math.max(1, visibilityMeters),
  };
}
