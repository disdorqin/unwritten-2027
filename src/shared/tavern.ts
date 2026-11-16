import type { Box } from "./level.js";

export const TAVERN_ORIGIN = [17, 0, -20] as const;
const box = (p: [number, number, number], s: [number, number, number]): Box => ({
  p: [p[0] + TAVERN_ORIGIN[0], p[1], p[2] + TAVERN_ORIGIN[2]],
  s, color: "#765238", kind: "collision",
});
// In metres; matches tools/build-tavern.py. Visual detail stays in the GLB.
export const TAVERN_BOXES: Box[] = [
  box([0, .05, 0], [11, .1, 9]),
  ...[-5.5, 5.5].map(x => box([x, 3.45, 0], [.18, 6.9, 9])),
  box([0, 3.45, -4.5], [11, 6.9, .18]),
  ...[-3.35, 3.35].map(x => box([x, 3.45, 4.5], [4.3, 6.9, .18])),
  box([0, 3.2, 4.5], [2.4, .8, .2]),
  box([0, 6.6, 4.5], [2.4, .6, .2]),
  box([-1.05, 3.55, 0], [8.9, .2, 9]),
  box([4.45, 3.55, -3.6], [2.1, .2, 1.8]),
  box([4.45, 3.55, 3.6], [2.1, .2, 1.8]),
  box([0, 3.55, 5.25], [11.4, .2, 1.5]),
  box([0, 4.15, 5.94], [11.2, 1.1, .16]),
  ...[-5.5, 5.5].map(x => box([x, 4.15, 5.25], [.16, 1.1, 1.5])),
  box([3.45, 4.15, -.15], [.12, 1.1, 5.8]),
  ...Array.from({ length: 18 }, (_, n) => {
    const height = .05 + (n + 1) * .2;
    return box([4.4, height / 2, 2.35 - n * .30], [1.6, height, .30]);
  }),
  box([0, .65, -3], [5.5, 1.1, .9]),
  ...[-2.25, 2.25].flatMap(x => [
    box([x, .59, 1], [2.15, .98, 1.15]),
    ...[-1, 1].map(side => box([x, .40, 1 + side * .95], [2, .67, .4])),
  ]),
  box([-3.8, .25, -2.3], [2.9, .4, 2.2]),
  box([-3.8, .1, -.98], [2.9, .2, .44]),
  ...[-2.5, 1.1].map(x => box([x, 3.96, 1.2], [2.15, .6, 1.15])),
];
