import type { Box } from './landmark-kit';
import { hotSpringPools } from './hot-spring-soak';

type DecorPaint = 'snow' | 'slate' | 'granite' | 'lightStone' | 'timber' | 'pine' | 'frame' | 'water';

type HotSpringDecorBuilder = {
  box(x: number, y: number, z: number, w: number, h: number, d: number,
    paint: DecorPaint, pitch?: number, yaw?: number): void;
  solid(x: number, z: number, w: number, h: number, d: number, paint: DecorPaint, bottom: number): void;
  colliders: Box[];
};

export function addHotSpringDetails({ box, solid, colliders }: HotSpringDecorBuilder) {
  function bucket(x: number, z: number, floor: number, radius: number, height: number, filled: boolean) {
    box(x, floor + .035, z, radius * 1.56, .07, radius * 1.56, filled ? 'water' : 'frame');
    for (let side = 0; side < 8; side++) {
      const yaw = side * Math.PI / 4;
      const sideX = x + Math.sin(yaw) * radius;
      const sideZ = z + Math.cos(yaw) * radius;
      const width = 2 * radius * Math.tan(Math.PI / 8);
      box(sideX, floor + height / 2, sideZ, width, height, .05, side % 2 ? 'pine' : 'timber', 0, yaw);
      box(sideX, floor + height * .8, sideZ, width + .02, .045, .07, 'frame', 0, yaw);
    }
    colliders.push({ min: [x - radius, floor, z - radius], max: [x + radius, floor + height, z + radius] });
  }

  // Double-tier sauna seating on the west wall leaves the center of the doorway clear.
  for (const [x, top] of [[-13.58, 1.14], [-12.89, .73]]) {
    for (const dz of [-1.5, 0, 1.5]) solid(x, 9.42 + dz, .66, top - .36, .13, 'timber', .25);
    solid(x, 9.42, .65, .09, 3.68, 'timber', top - .12);
    for (const dx of [-.25, -.085, .085, .25]) box(x + dx, top - .027, 9.42, .144, .054, 3.73, 'pine');
  }
  for (const [dx, dz, width, height, depth, yaw] of [
    [-.34, -.05, .33, .20, .37, .27], [.30, -.06, .29, .26, .34, -.32],
    [-.17, .24, .27, .19, .26, .64], [.23, .24, .34, .16, .22, -.17],
    [-.02, -.29, .32, .18, .28, -.38], [.02, .02, .32, .26, .36, .51],
  ]) {
    box(-6.42 + dx, 1.36 + height / 2, 12.52 + dz, width, height, depth,
      yaw > 0 ? 'granite' : 'slate', .12, yaw);
  }
  bucket(-5.52, 8.42, .25, .36, .46, false);
  bucket(-13.64, 11.82, .25, .31, .39, true);

  for (const { x, z, depth } of hotSpringPools) {
    const front = z + depth / 2;
    bucket(x + 2.38, front, .945, .16, .26, true);
    // Ladle and folded linen rest on the rim, beside the stair opening.
    box(x + 2.42, 1.223, front - .04, .15, .05, .135, 'pine', 0, -.19);
    box(x + 2.61, 1.22, front - .09, .32, .033, .048, 'timber', 0, -.30);
    box(x + 1.61, .966, front, .35, .038, .24, 'snow');
    box(x + 1.59, 1.007, front - .025, .31, .043, .21, 'snow');
    box(x + 1.60, 1.013, front + .08, .305, .012, .022, 'lightStone');
    for (const offset of [-.115, .115]) {
      const at = x + 2.10 + offset;
      box(at, .208, front + .56, .155, .045, .26, 'frame', 0, -.18);
      box(at - .012, .251, front + .60, .159, .058, .11, 'pine', 0, -.18);
    }
  }
}
