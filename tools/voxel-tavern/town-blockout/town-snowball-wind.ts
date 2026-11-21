/** G-09 phase-two standalone wind leaf. The host supplies authoritative weather
 * and its already-approved area exposure coefficient; no weather/schedule or
 * scene module is imported so this remains safe on a partially assembled tree.
 */
export type SnowballWindWeather = Readonly<{
  weather: 'clear-snow' | 'wind' | 'whiteout';
  windEast: number;
  windNorth: number;
  windStrength: number;
}>;

export function townSnowballWindAcceleration(state: SnowballWindWeather, exposure: number) {
  if (state.weather === 'clear-snow' || !Number.isFinite(exposure)) return { east: 0, north: 0 };
  const strength = Number.isFinite(state.windStrength) ? Math.min(1, Math.max(0, state.windStrength)) : 0;
  const area = Math.min(1, Math.max(0, exposure));
  // Candidate strength pending gameplay number review; hard-capped by the simulator.
  const acceleration = 1.6 * strength * area;
  return {
    east: Number.isFinite(state.windEast) ? state.windEast * acceleration : 0,
    north: Number.isFinite(state.windNorth) ? state.windNorth * acceleration : 0,
  };
}
