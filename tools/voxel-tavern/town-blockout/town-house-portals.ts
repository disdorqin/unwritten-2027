export type TownHousePortal = {
  id: string;
  x: number;
  n: number;
  ground: number;
  exitYaw: number;
};

// A small green enamel plate with a cream voxel roof and doorway.
export const housePortalPlaque = [
  { x: 0, y: 0, z: 0, w: .54, h: .47, d: .048, color: '#265e54' },
  { x: 0, y: .12, z: .028, w: .12, h: .075, d: .025, color: '#fff0bb' },
  { x: 0, y: .046, z: .028, w: .25, h: .073, d: .025, color: '#fff0bb' },
  { x: 0, y: -.054, z: .028, w: .35, h: .134, d: .025, color: '#fff0bb' },
  { x: 0, y: -.078, z: .044, w: .08, h: .094, d: .014, color: '#265e54' },
] as const;
