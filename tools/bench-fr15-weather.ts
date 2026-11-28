/**
 * FR-15 R3 budget evidence: how much CPU one full weather-field sample costs
 * per frame. Run with:
 *   node --import tsx tools/bench-fr15-weather.ts
 */
import { performance } from 'node:perf_hooks';
import { townWeatherFieldAt } from '../src/shared/town-weather-field';
import { townOutdoorWeatherFieldAt } from '../tools/voxel-tavern/town-blockout/town-weather-field-outdoor';
import { townWeatherParticleScale } from '../tools/voxel-tavern/town-blockout/town-weather-visual-budget';
import type { TownOutdoorWeatherState } from '../src/shared/town-outdoor-weather';

const state: TownOutdoorWeatherState = {
  weather: 'whiteout',
  startedAt: Date.UTC(2026, 0, 1),
  nextChangeAt: Date.UTC(2026, 0, 1) + 300_000,
  windEast: .6,
  windNorth: -.8,
  windStrength: 1,
};

const positions = [
  { east: 206, north: 182, elevation: 30, name: 'town' },
  { east: 300, north: 430, elevation: 150, name: 'foothill' },
  { east: 300, north: 560, elevation: 420, name: 'alpine' },
  { east: 350, north: 676, elevation: 800, name: 'summit' },
  { east: -120, north: 185, elevation: 60, name: 'crater' },
  { east: 8, north: 400, elevation: 30, name: 'map-edge' },
];

const base = {
  intensity: 4, fogNear: 112, fogFar: 620, pilingRate: 1.25, targetCover: 1,
  visibilityMeters: 12, skyColor: '#d8e2e9',
};

function time(label: string, iterations: number, run: (index: number) => void): number {
  for (let warm = 0; warm < 20_000; warm += 1) run(warm);
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) run(index);
  const elapsed = performance.now() - started;
  const perSample = (elapsed * 1000) / iterations;
  return perSample;
}

const fieldOnly = time('field', 400_000, (index) => {
  const position = positions[index % positions.length];
  townWeatherFieldAt({ base, position, windEast: .6, windNorth: -.8, windStrength: 1 });
});

const adapter = time('adapter', 200_000, (index) => {
  const position = positions[index % positions.length];
  townOutdoorWeatherFieldAt(state, position, { exposure: .4 });
});

const budget = time('budget', 400_000, (index) => {
  const position = positions[index % positions.length];
  const sample = townWeatherFieldAt({ base, position, windEast: .6, windNorth: -.8, windStrength: 1 });
  townWeatherParticleScale(sample);
});

console.log(JSON.stringify({
  iterations: { field: 400_000, adapter: 200_000, budget: 400_000 },
  microsecondsPerSample: {
    field: +fieldOnly.toFixed(4),
    adapter: +adapter.toFixed(4),
    fieldPlusBudget: +budget.toFixed(4),
  },
  frameOverheadAt60FpsMicroseconds: +budget.toFixed(4),
  note: 'one sample per frame; no allocation after warm-up; values are machine-local evidence, not a guarantee',
}, null, 2));
