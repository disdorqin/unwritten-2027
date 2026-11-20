import type { UndergroundSurvivalPoint as Point } from './underground-survival.js';

type Activity = 'walk' | 'run' | 'mining' | 'combat';
type Climate = Readonly<{ ambient: number; degreesPerSecond: number }>;
type Light = Readonly<{ id: string; at: Point } & (
  { kind: 'campfire' | 'cold-flame' | 'mine-lamp' } | { kind: 'torch'; expiresAt: number }
)>;
type Noise = Readonly<{ actorId: string; activity: Activity; sequence: number; at: Point; expiresAt: number }>;
type Settings = Readonly<{
  now(): number;
  readPlayer(id: string): Readonly<{ at: Point; hotDrink?: boolean }> | undefined;
  readLights(layer: string): readonly Light[];
  reaches(from: Point, to: Point, sense: 'light' | 'sound'): boolean;
  climates: Readonly<Record<string, Climate>>;
  initialTemperature: number;
  coldBelow: number;
  warmDegreesPerSecond: number;
  coldWalkScale: number;
  coldStrikeScale: number;
  darknessDamageScale: number;
  torchRadius: number;
  noiseLifetimeMs: number;
  noiseRadius: Readonly<Record<Activity, number>>;
}>;
type Body = { temperature: number; target: number; rate: number; updatedAt: number };

const ambientRadius = { campfire: 8, 'cold-flame': 8, 'mine-lamp': 4 } as const;
const headLampRadius = 6;
const unit = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
const positive = (v: number) => Number.isFinite(v) && v > 0;
const distance = (a: Point, b: Point) => Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height);
const validPoint = (at: Point) => Boolean(at.layer) && [at.east, at.north, at.height].every(Number.isFinite);

/** Consume accepted player positions, light fixtures and action edges from the underground host. */
export function createUndergroundVitals(settings: Settings) {
  const climates = new Map(Object.entries(settings.climates));
  const { initialTemperature, coldBelow, warmDegreesPerSecond, coldWalkScale, coldStrikeScale,
    darknessDamageScale, torchRadius, noiseLifetimeMs, noiseRadius } = settings;
  if (!climates.size || [...climates].some(([layer, c]) => !layer || !unit(c.ambient) || !positive(c.degreesPerSecond)) ||
      !unit(initialTemperature) || !unit(coldBelow) || !positive(warmDegreesPerSecond) ||
      !unit(coldWalkScale) || !positive(coldWalkScale) || !unit(coldStrikeScale) || !positive(coldStrikeScale) ||
      !Number.isFinite(darknessDamageScale) || darknessDamageScale < 1 ||
      !positive(torchRadius) || !positive(noiseLifetimeMs) ||
      !nonnegative(noiseRadius.walk) || !nonnegative(noiseRadius.run) ||
      !nonnegative(noiseRadius.mining) || !nonnegative(noiseRadius.combat) ||
      noiseRadius.walk > Math.min(noiseRadius.run, noiseRadius.mining, noiseRadius.combat)) {
    throw new RangeError('Invalid underground climate, light or noise settings');
  }
  const bodies = new Map<string, Body>();
  const noises = new Map<string, Map<Activity, Noise>>();
  let lastTime = -Infinity;

  function now() {
    const value = settings.now();
    if (!Number.isFinite(value)) throw new RangeError('Invalid underground vitals clock');
    lastTime = Math.max(lastTime, value);
    return lastTime;
  }

  function readLight(at: Point, time: number) {
    return settings.readLights(at.layer).flatMap(light => {
      if (!validPoint(light.at) || light.at.layer !== at.layer) return [];
      const separation = distance(at, light.at);
      const radius = light.kind === 'torch' ? torchRadius : ambientRadius[light.kind];
      if (light.kind === 'torch' && (!Number.isFinite(light.expiresAt) || light.expiresAt <= time)) return [];
      if (separation > radius || !settings.reaches(light.at, at, 'light')) return [];
      return [{ light, separation, radius }];
    });
  }

  return {
    sample(id: string) {
      const time = now();
      const player = settings.readPlayer(id);
      const body = bodies.get(id);
      const climate = player && climates.get(player.at.layer);
      if (!player || !climate || !validPoint(player.at)) {
        if (body) body.updatedAt = time;
        return;
      }
      const lights = readLight(player.at, time);
      const safe = lights.some(({ light }) => light.kind === 'campfire' || light.kind === 'cold-flame');
      let temperature = initialTemperature;
      if (body) {
        const delta = body.target - body.temperature;
        const step = body.rate * (time - body.updatedAt) / 1000;
        temperature = body.temperature + Math.sign(delta) * Math.min(Math.abs(delta), step);
      }
      const warming = safe || player.hotDrink === true;
      bodies.set(id, { temperature, updatedAt: time, target: warming ? 1 : climate.ambient,
        rate: warming ? warmDegreesPerSecond : climate.degreesPerSecond });
      const cold = temperature < coldBelow;
      const environmentLit = lights.length !== 0;
      return {
        temperature, walkScale: cold ? coldWalkScale : 1, strikeSpeedScale: cold ? coldStrikeScale : 1,
        damageScale: environmentLit ? 1 : darknessDamageScale,
        safe, environmentLit, headLampRadius,
        // One always-on head lamp plus the four nearest visible world lights.
        worldLights: lights.sort((a, b) => a.separation - b.separation).slice(0, 4)
          .map(({ light, radius }) => ({ id: light.id, radius, at: { ...light.at } })),
      };
    },

    recordNoise(actorId: string, activity: Activity, sequence: number): boolean {
      const player = settings.readPlayer(actorId);
      if (!player || !climates.has(player.at.layer) || !validPoint(player.at) ||
          !Object.hasOwn(noiseRadius, activity) || !Number.isSafeInteger(sequence) || sequence <= 0) return false;
      const byActivity = noises.get(actorId) ?? new Map<Activity, Noise>();
      const previous = byActivity.get(activity);
      if (previous && previous.sequence >= sequence) return false;
      byActivity.set(activity, { actorId, activity, sequence, at: { ...player.at }, expiresAt: now() + noiseLifetimeMs });
      noises.set(actorId, byActivity);
      return true;
    },

    heardBy(at: Point): readonly Noise[] {
      if (!validPoint(at) || !climates.has(at.layer)) return [];
      const time = now();
      const heard: Noise[] = [];
      for (const byActivity of noises.values()) for (const cue of byActivity.values()) {
        if (cue.at.layer === at.layer && cue.expiresAt > time && noiseRadius[cue.activity] > 0 &&
            distance(cue.at, at) <= noiseRadius[cue.activity] && settings.reaches(cue.at, at, 'sound')) {
          heard.push({ ...cue, at: { ...cue.at } });
        }
      }
      return heard;
    },

    forget(id: string) {
      bodies.delete(id);
      noises.delete(id);
    },
  };
}

function nonnegative(v: number) {
  return Number.isFinite(v) && v >= 0;
}
