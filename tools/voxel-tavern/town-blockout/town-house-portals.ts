export type HouseDoorZone = 'central' | 'market' | 'memorial' | 'lakeside' | 'forest';

export type TownHousePortal = {
  id: string;
  zone: HouseDoorZone;
  x: number;
  n: number;
  ground: number;
  exitYaw: number;
};

// A green enamel plate with a cream doorway symbol.
export const housePortalPlaque = [
  { x: 0, y: 0, z: 0, w: .54, h: .47, d: .048, color: '#265e54' },
  { x: 0, y: -.015, z: .028, w: .19, h: .28, d: .025, color: '#fff0bb' },
] as const;
