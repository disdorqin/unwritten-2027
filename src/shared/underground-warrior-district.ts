/**
 * U-10 warrior city, ancient YS4/YS5 sites.
 *
 * Single source of truth for BOTH the Three scene and Presence, with no runtime
 * Three import. Coordinates are in the local city ENY (east, height, north) frame.
 * A survey-registered world frame is required before any station is usable.
 */
export type WarriorDistrictAction =
  'search-room' | 'take-cover' | 'arcade-cover' | 'lookout' | 'trace';
export type WarriorDistrictPoint = Readonly<{ east: number; north: number; height: number }>;
export type WarriorDistrictFrame = WarriorDistrictPoint & Readonly<{ domainId: string; yaw: number }>;
export type WarriorDistrictHouse = Readonly<{
  id: string;
  side: 'north' | 'south';
  accessible: boolean;
  blockedBy?: 'rubble' | 'grille' | 'fallen-slab';
  workFeet: readonly WarriorDistrictAction[];
  localEntrance: readonly [east: number, y: number, north: number];
}>;
export type WarriorDistrictStation = Readonly<{
  id: string;
  role: WarriorDistrictAction;
  localFoot: readonly [east: number, y: number, north: number];
}>;
export const warriorDistrictHouses: readonly WarriorDistrictHouse[] = Object.freeze(
  Array.from({ length: 12 }, (_, index) => {
    const accessible = [1, 4, 7, 10].includes(index);
    const side = index < 6 ? 'north' as const : 'south' as const;
    return Object.freeze({
      id: 'u10/stone-home-' + String(index + 1).padStart(2, '0'),
      side, accessible,
      blockedBy: accessible ? undefined :
        (['rubble', 'grille', 'fallen-slab'] as const)[(index + Math.floor(index / 3)) % 3],
      workFeet: Object.freeze(accessible ? ['search-room', 'take-cover'] as const : [] as const),
      localEntrance: Object.freeze([29 + index % 6 * 8.75, 0,
        side === 'north' ? 8.15 : -8.15] as const),
    });
  }),
);
export const warriorDistrictStations: readonly WarriorDistrictStation[] = Object.freeze([
  ...warriorDistrictHouses.filter(house => house.accessible).flatMap(house => {
    const [x] = house.localEntrance;
    const side = house.side === 'north' ? 1 : -1;
    const front = side * 8.15, rear = side * 16.55;
    const center = (front + rear) / 2;
    return [
      Object.freeze({ id: house.id, role: 'search-room' as const,
        localFoot: Object.freeze([x - 1, 0, rear - side * 2.2] as const) }),
      Object.freeze({ id: house.id, role: 'take-cover' as const,
        localFoot: Object.freeze([x + 1.05, 0, center - side * 1.1] as const) }),
    ];
  }),
  Object.freeze({ id: 'u10/market-arcade', role: 'arcade-cover' as const,
    localFoot: Object.freeze([133, 0, -19.05] as const) }),
  Object.freeze({ id: 'u10/wall-lookout', role: 'lookout' as const,
    localFoot: Object.freeze([147, 7.12, 27] as const) }),
  Object.freeze({ id: 'u10/worn-stair', role: 'trace' as const,
    localFoot: Object.freeze([84.93, 7.12 / 26, 23.1] as const) }),
]);

export function warriorDistrictTransform(
  frame: WarriorDistrictFrame,
  local: readonly [east: number, y: number, north: number],
): WarriorDistrictPoint {
  const c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
  return {
    east: frame.east + c * local[0] - s * local[2],
    north: frame.north + s * local[0] + c * local[2],
    height: frame.height + local[1],
  };
}
export function warriorDistrictValidFrame(frame: WarriorDistrictFrame): boolean {
  return frame.domainId.trim().length > 0 &&
    [frame.east, frame.north, frame.height, frame.yaw].every(Number.isFinite);
}
export function warriorDistrictStation(id: string, role: WarriorDistrictAction):
    WarriorDistrictStation | undefined {
  return warriorDistrictStations.find(station => station.id === id && station.role === role);
}
