/**
 * Common U-18/U-16 fuel clock for a lit camp or an inhabited forge.
 * Safety, temperature, monster exclusion and healing stay exclusively in U-13.
 */
export type UndergroundFirePhase = 'burning' | 'weak' | 'out';
export type UndergroundFireCycle = Readonly<{
  fuel: number;
  atMs: number;
}>;
export type UndergroundFireProfile = Readonly<{
  maximumFuel: number;
  weakBelowFuel: number;
  burnFuelPerMs: number;
}>;
export function validFireProfile(profile: UndergroundFireProfile) {
  return [profile.maximumFuel, profile.weakBelowFuel, profile.burnFuelPerMs]
    .every(v => Number.isFinite(v) && v > 0) &&
    profile.weakBelowFuel < profile.maximumFuel;
}
export function projectUndergroundFire(
  previous: UndergroundFireCycle, atMs: number, profile: UndergroundFireProfile,
): UndergroundFireCycle & Readonly<{ phase: UndergroundFirePhase }> {
  if (!validFireProfile(profile) || !Number.isFinite(previous.fuel) ||
      previous.fuel < 0 || previous.fuel > profile.maximumFuel ||
      !Number.isFinite(previous.atMs) || !Number.isFinite(atMs) ||
      atMs < previous.atMs) throw new RangeError('Invalid shared underground fire clock');
  const fuel = Math.max(0, previous.fuel - (atMs - previous.atMs) * profile.burnFuelPerMs);
  return {
    fuel,
    atMs,
    phase: fuel <= 0 ? 'out' : fuel <= profile.weakBelowFuel ? 'weak' : 'burning',
  };
}
export function addUndergroundFireFuel(
  previous: UndergroundFireCycle, amount: number, atMs: number, profile: UndergroundFireProfile,
) {
  if (!Number.isFinite(amount) || amount <= 0) throw new RangeError('Invalid fire fuel receipt');
  const current = projectUndergroundFire(previous, atMs, profile);
  const next = Math.min(profile.maximumFuel, current.fuel + amount);
  // Even a full fire refuses a charge, preventing consumption of inventory for nothing.
  if (next <= current.fuel) return;
  return projectUndergroundFire({ fuel: next, atMs }, atMs, profile);
}
