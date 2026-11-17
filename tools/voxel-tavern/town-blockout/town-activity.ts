import type { Scene } from 'three';

export type TownSeat = { x: number; n: number; eyeY: number; yaw: number };
export type TownActivitySpot = {
  x: number;
  n: number;
  ground: number;
  range: number;
  label: string;
  run(): void;
};
export type TownActivity = {
  spots: TownActivitySpot[];
  update?(dt: number): void;
  blocked?(x: number, n: number, ground: number): boolean;
};
export type TownActivityContext = {
  scene: Scene;
  open(title: string, description: string): HTMLElement;
  announce(message: string): void;
  sit(seat: TownSeat): void;
  face(x: number, n: number, height?: number): void;
};

export function nearestTownActivity(
  spots: readonly TownActivitySpot[], x: number, n: number, ground: number,
): TownActivitySpot | undefined {
  let nearest: TownActivitySpot | undefined;
  let bestDistance = Infinity;
  for (const spot of spots) {
    if (Math.abs(ground - spot.ground) > .55) continue;
    const distance = Math.hypot(x - spot.x, n - spot.n);
    if (distance <= spot.range && distance < bestDistance) {
      nearest = spot;
      bestDistance = distance;
    }
  }
  return nearest;
}
