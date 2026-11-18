import type { Box } from './landmark-kit';
import { hotSpringPools } from './hot-spring-soak';

type DecorPaint = 'snow' | 'slate' | 'granite' | 'lightStone' | 'timber' | 'pine' | 'frame' | 'water' | 'trim' | 'glass';

export const hotSpringTeaStand = [16.4, .18, -3.74] as const;
export const hotSpringPhotoStand = [19.5, 0, -12.3] as const;

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

  for (const { x, z, depth, width } of hotSpringPools) {
    const front = z + depth / 2;
    const alongRim = (offset: number) => x + (width < 6 ? 1 + .27 * offset : offset);
    bucket(alongRim(2.38), front, .945, .16, .26, true);
    // Ladle and folded linen rest on the rim, beside the stair opening.
    box(alongRim(2.42), 1.223, front - .04, .15, .05, .135, 'pine', 0, -.19);
    box(alongRim(2.61), 1.22, front - .09, .32, .033, .048, 'timber', 0, -.30);
    box(alongRim(1.61), .966, front, .35, .038, .24, 'snow');
    box(alongRim(1.59), 1.007, front - .025, .31, .043, .21, 'snow');
    box(alongRim(1.60), 1.013, front + .08, .305, .012, .022, 'lightStone');
    for (const offset of [-.115, .115]) {
      const at = alongRim(2.10) + offset;
      box(at, .208, front + .56, .155, .045, .26, 'frame', 0, -.18);
      box(at - .012, .251, front + .60, .159, .058, .11, 'pine', 0, -.18);
    }
  }

  // The rinse corner sits beside the rock-pool entrance, away from all four tread centerlines.
  bucket(-10.5, -6.72, .18, .23, .38, true);
  bucket(-9.74, -6.68, .18, .20, .33, false);
  for (const dx of [-.21, .21]) solid(-9.03 + dx, -6.71, .12, .22, .32, 'timber', .18);
  solid(-9.03, -6.71, .59, .10, .41, 'pine', .40);
  box(-9.05, .55, -6.77, .40, .03, .04, 'frame');
  box(-8.88, .55, -6.77, .14, .037, .13, 'pine');

  for (const z of [8.5, 10.8]) {
    solid(20.65, z, .10, 2.0, 1.45, 'timber', .26);
    for (const side of [-1, 1]) {
      const wallZ = z + side * .70;
      solid(19.91, wallZ, 1.59, 2.0, .09, 'timber', .26);
      for (const x of [19.21, 19.57, 19.93, 20.29, 20.65]) {
        box(x, 1.30, wallZ + .05, .046, 1.99, .025, 'pine');
      }
    }
    box(20.54, 1.66, z, .14, .12, .66, 'frame');
    for (const dz of [-.21, 0, .21]) box(20.44, 1.69, z + dz, .12, .067, .05, 'trim');
    box(20.46, .73, z, .30, .12, .65, 'pine');
    box(20.45, .82, z, .27, .053, .35, 'snow');
  }

  for (const z of [6.56, 7.24]) solid(20.36, z, .20, 1.62, .09, 'frame', .26);
  for (const [i, height] of [.79, 1.14, 1.48].entries()) {
    box(20.28, height, 6.90, .08, .06, .76, 'timber');
    box(20.21, height - .15, 6.88, .038, .30, .39, i % 2 ? 'pine' : 'snow');
  }
  box(20.78, 1.67, 6.17, .14, 1.18, .76, 'timber');
  box(20.69, 1.67, 6.17, .042, 1.08, .66, 'glass');

  solid(16.4, -4.8, 1.21, .60, .57, 'slate', .18);
  box(16.4, .84, -4.8, 1.50, .13, .81, 'lightStone');
  box(16.21, 1.06, -4.89, .32, .27, .26, 'slate');
  box(16.02, 1.06, -4.89, .19, .068, .076, 'slate', .16);
  box(16.21, 1.22, -4.89, .28, .07, .22, 'trim');
  for (const x of [16.07, 16.38, 16.69]) {
    box(x, .98, -4.55, .132, .14, .13, 'lightStone');
    box(x, 1.055, -4.55, .086, .015, .082, 'water');
  }
  box(16.84, 1.023, -4.88, .37, .23, .24, 'pine');
  box(16.84, 1.16, -4.88, .40, .06, .26, 'trim');
}
