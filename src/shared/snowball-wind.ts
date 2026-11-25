/** G-09 authority-safe wind model shared by the server and town viewer.
 * Map east/north are positive map axes; the Three.js ballistic adapter
 * applies north as -Z. Call with the authoritative launch-phase weather.
 */
export type SnowballWindWeather = Readonly<{
  weather: 'clear-snow' | 'wind' | 'whiteout';
  windEast: number;
  windNorth: number;
  windStrength: number;
}>;

/** Horizontal acceleration in map coordinates (m/s²). Never trusts client-supplied weather. */
export function snowballWindAcceleration(state: SnowballWindWeather, exposure: number) {
  if (state.weather === 'clear-snow' || !Number.isFinite(exposure)) return { east: 0, north: 0 };
  const strength = Number.isFinite(state.windStrength) ? Math.min(1, Math.max(0, state.windStrength)) : 0;
  const area = Math.min(1, Math.max(0, exposure));
  // Candidate strength pending gameplay numerical approval; below ±2 m/s² wire cap.
  const acceleration = 1.6 * strength * area;
  return {
    east: Number.isFinite(state.windEast) ? state.windEast * acceleration : 0,
    north: Number.isFinite(state.windNorth) ? state.windNorth * acceleration : 0,
  };
}
