import { flightFuelCanFullPowerMs } from './flight-fuel-display';

export * from '../../../src/shared/underground-ore-distribution.js';

// U-9 survey points are untransformed. U-10 street crystal and U-11 vault geometry record no deposits.
export const crystalCaveOreCandidateReferences = {
  depth: -140,
  source: '25ff93454c93777d16583cdac1de9f36b9c277ba:tools/voxel-tavern/town-blockout/underground-crystal-cave.ts',
  sites: [
    { id: 'hall-west-rich', region: 'crystal-hall', mineral: 'blue-crystal', localEN: [-11.6, 21.8] },
    { id: 'hall-east-rich', region: 'crystal-hall', mineral: 'blue-crystal', localEN: [11.65, 42.6] },
    { id: 'vein-south-seam', region: 'moonstone-vein', mineral: 'moonstone', localEN: [22, 30.55] },
    { id: 'vein-north-seam', region: 'moonstone-vein', mineral: 'moonstone', localEN: [25.1, 33.54] },
  ],
} as const;

export function stardustFullPowerMs(oreCount: number) {
  const fullPowerMs = oreCount * flightFuelCanFullPowerMs;
  if (!Number.isSafeInteger(oreCount) || oreCount < 0 || !Number.isSafeInteger(fullPowerMs)) {
    throw new RangeError('Stardust fuel conversion requires a non-negative whole ore count in range');
  }
  return fullPowerMs;
}
