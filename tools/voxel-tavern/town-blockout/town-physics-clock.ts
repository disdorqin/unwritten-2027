export const townPhysicsDelta = 1 / 60;
const maximumSteps = 2;
const timeEpsilon = 1e-9;

export function createTownPhysicsClock() {
  let remainder = 0;
  return {
    advance(seconds: number, step: () => void) {
      remainder += seconds;
      const available = Math.floor((remainder + timeEpsilon) / townPhysicsDelta);
      // Discard full steps beyond the catch-up budget. Keep the interpolation fraction.
      remainder = Math.max(0, remainder - available * townPhysicsDelta);
      const steps = Math.min(available, maximumSteps);
      for (let i = 0; i < steps; i++) step();
      return remainder / townPhysicsDelta;
    },
    reset() {
      remainder = 0;
    },
  };
}
