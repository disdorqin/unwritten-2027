import type { Box } from "./level.js";
import type { SimulationLayout } from "./simulation.js";

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
const level: Box[] = [
  { p: [0, -0.3, 0], s: [60, 0.6, 60], color: "#e3eaf0" },
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
  level, doors: [], props: [], spawns: [TOWN.spawn],
};
