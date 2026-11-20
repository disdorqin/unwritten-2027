import type { Box } from './landmark-kit';

type AddPiece = (color: string, x: number, y: number, z: number, width: number, height: number, depth: number) => void;

// Stage-local coordinates. Positive z runs south, behind the performance area.
export const stageBackstage = {
  west: 6.42, east: 8.88, front: 3.32, back: 6.10,
  deck: .52,
  entrance: { x: 6.42, front: 3.82, back: 5.12, head: 2.78 },
  inside: { x: 7.55, z: 4.47 },
} as const;

export function addStageBackstage(add: AddPiece, colliders: Box[]) {
  const { west, east, front, back, deck, entrance } = stageBackstage;
  const timber = '#533730', plank = '#81553d', warmWood = '#976446';
  const red = '#873533', gold = '#c68d4d', rafter = '#45404a';
  const thickness = .16, ceiling = 3.25;
  function solid(color: string, x: number, y: number, z: number, width: number, height: number, depth: number) {
    add(color, x, y, z, width, height, depth);
    colliders.push({
      min: [x - width / 2, y - height / 2, z - depth / 2],
      max: [x + width / 2, y + height / 2, z + depth / 2],
    });
  }
  function partition(x1: number, x2: number, z1: number, z2: number, bottom: number = deck, top = ceiling) {
    solid(timber, (x1 + x2) / 2, (bottom + top) / 2, (z1 + z2) / 2, x2 - x1, top - bottom, z2 - z1);
  }

  partition(west, east, front, front + thickness);
  partition(east - thickness, east, front, back);
  partition(west, east, back - thickness, back);
  partition(west, west + thickness, front, entrance.front);
  partition(west, west + thickness, entrance.back, back);
  partition(west, west + thickness, entrance.front, entrance.back, entrance.head);
  partition(west, east, front, back, ceiling, ceiling + .12);

  const boards = 12;
  const span = (east - west - .2) / boards;
  for (let i = 0; i < boards; i++) {
    add(i % 3 ? plank : warmWood, west + .1 + (i + .5) * span, 1.86, front - .012, span - .017, 2.49, .024);
  }
  for (const y of [.70, 2.83, 3.13]) {
    add(rafter, (west + east) / 2, y, front - .028, east - west, .12, .068);
  }
  // Rolled curtains and frame stay on the two jambs.
  for (const z of [entrance.front - .077, entrance.back + .077]) {
    add(rafter, west - .026, 1.66, z, .11, 2.28, .12);
    add(red, west + .082, 1.79, z, .12, 1.93, .11);
    add(gold, west + .082, 1.52, z, .13, .10, .12);
  }
  add(red, west - .035, 2.88, (entrance.front + entrance.back) / 2, .12, .17, 1.56);
  add(gold, west - .101, 2.835, (entrance.front + entrance.back) / 2, .025, .055, 1.50);

  // Costume chest sits beside the opening. The centre passage stays clear.
  const chestX = 8.34, chestZ = 3.82;
  solid(plank, chestX, .79, chestZ, .70, .54, .52);
  add(warmWood, chestX, 1.08, chestZ, .71, .08, .54);
  for (const x of [8.09, 8.59]) add(timber, x, .80, chestZ + .268, .06, .48, .04);
  add(gold, chestX, .87, chestZ + .278, .13, .10, .055);

  // The costume rack stands along the east wall past the doorway.
  solid(timber, 8.55, 1.38, 5.13, .30, 1.72, 1.24);
  for (const [i, color] of ['#a75243', '#6b7f79', '#aa7e4f'].entries()) {
    const z = 4.74 + i * .39;
    add(gold, 8.355, 1.98, z, .08, .12, .30);
    add(color, 8.36, 1.43, z, .13, .91, .25);
    add(color, 8.34, 1.77, z, .18, .22, .32);
    add(gold, 8.282, 1.08, z, .026, .06, .24);
  }

  // Masks are carved blocks on the inner wall and carry no text or interactions.
  for (const [i, color] of ['#d9ad7b', '#a74b47', '#7d9b90'].entries()) {
    const x = 7.06 + i * .59, y = 1.92, z = front + thickness + .038;
    add(rafter, x, y, z - .013, .43, .48, .05);
    add(color, x, y, z + .03, .26, .33, .09);
    add(color, x, y - .16, z + .038, .16, .13, .09);
    for (const offset of [-.07, .07]) add(timber, x + offset, y + .035, z + .082, .051, .037, .02);
    add(gold, x, y + .132, z + .081, .13, .034, .021);
  }
  add(rafter, 8.42, 2.96, 4.47, .07, .32, .07);
  add(red, 8.42, 2.76, 4.47, .27, .11, .26);
  add('#ffa455', 8.42, 2.62, 4.47, .22, .22, .22);
  add(gold, 8.42, 2.477, 4.47, .05, .10, .05);
}
