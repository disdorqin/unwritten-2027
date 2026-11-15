import type { Box } from "./level.js";
import type { SimulationLayout } from "./simulation.js";
import { MUSEUM_BOXES } from "./museum.js";

export const TOWN = {
  tower: [0, 0, -7] as const,
  spawn: [0, 1, 12] as const,
  radius: 30,
};
export const BENCHES = [
  [-9, 0.32, 3], [9, 0.32, 3], [-9, 0.32, -6], [9, 0.32, -6],
] as const;
export const LANTERNS = [
  [-12, 0, 8], [12, 0, 8], [-12, 0, -10], [12, 0, -10],
] as const;
export const POST_DESK = [17, 0, -5] as const;
const level: Box[] = [
  ...MUSEUM_BOXES,
  { p: [0, -0.3, 0], s: [60, 0.6, 60], color: "#e3eaf0" },
  // First walk-in building: the post office, with an open two-metre doorway.
  { p: [17, 0.05, -4], s: [8, 0.1, 7], color: "#98734c" },
  { p: [13, 1.8, -4], s: [0.2, 3.6, 7], color: "#d0b99a" },
  { p: [21, 1.8, -4], s: [0.2, 3.6, 7], color: "#d0b99a" },
  { p: [17, 1.8, -7.5], s: [8, 3.6, 0.2], color: "#d0b99a" },
  { p: [14.5, 1.8, -0.5], s: [3, 3.6, 0.2], color: "#d0b99a" },
  { p: [19.5, 1.8, -0.5], s: [3, 3.6, 0.2], color: "#d0b99a" },
  { p: [17, 3.2, -0.5], s: [2, 0.8, 0.2], color: "#785439" },
  { p: [17, 3.7, -4], s: [8.5, 0.2, 7.5], color: "#70533e" },
  { p: [17, 0.65, -5], s: [3, 1.3, 1.1], color: "#805438" },
  { p: [20, 0.85, 0], s: [0.65, 1.35, 0.65], color: "#a6402e", kind: "collision" },
  // Exact tower origin shared with rendering. Interior remains closed in this slice.
  { p: [0, 3, -7], s: [4, 6, 4], color: "#665345", kind: "collision" },
  ...[0, 1, 2].map((n): Box => ({
    p: [0, 0.12 + n * 0.22, -6.95],
    s: [5 - n * 0.32, 0.24, 4.6 - n * 0.32],
    color: "#a5a6a5", kind: "collision",
  })),
  ...BENCHES.map(([x, , z]): Box => ({
    p: [x, 0.75, z], s: [3.1, 1.5, 0.75], color: "#6b442b", kind: "collision",
  })),
  ...LANTERNS.map(([x, , z]): Box => ({
    p: [x, 1.6, z], s: [0.28, 3.2, 0.28], color: "#6b442b", kind: "collision",
  })),
  // Low visible snowbanks mark the limits of the playable square.
  ...([-1, 1] as const).flatMap((sign): Box[] => [
    { p: [sign * 29, 1.2, 0], s: [2, 2.4, 60], color: "#cedae6" },
    { p: [0, 1.2, sign * 29], s: [60, 2.4, 2], color: "#cedae6" },
  ]),
];
export const TOWN_LAYOUT: SimulationLayout = {
  level, doors: [], props: [], spawns: [
    TOWN.spawn, [-2, 1, 12], [2, 1, 12], [-4, 1, 12],
    [4, 1, 12], [-2, 1, 15], [0, 1, 15], [2, 1, 15],
  ],
};
