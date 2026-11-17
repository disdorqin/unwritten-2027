import layout from './layout.json';
import { extensionRoadClearance } from './town-extension';

const bridgeMouthRadius = 3.5;
const approachStep = 1;
const roadCorridorHalfWidth = 3;

const roads = layout.roads.flatMap(({ points, width }) => points.slice(1).map(([bx, bn], index) => {
  const [ax, an] = points[index];
  const dx = bx - ax;
  const dn = bn - an;
  return { ax, an, dx, dn, lengthSquared: dx * dx + dn * dn, halfWidth: Math.max(roadCorridorHalfWidth, width / 2) };
}));

// Keep the bridge deck ends and their first landward metre clear of prop footprints.
export function bridgeMouthKeepClear(x: number, n: number, footprintRadius: number) {
  const limit = bridgeMouthRadius + footprintRadius;
  return layout.bridges.some(({ west, east, north }) => {
    const dn = Math.abs(n - north);
    if (dn >= limit) return false;
    const westDistance = Math.max(west - approachStep - x, x - west, 0);
    const eastDistance = Math.max(east - x, x - east - approachStep, 0);
    return Math.min(westDistance, eastDistance) ** 2 + dn ** 2 < limit ** 2;
  });
}

// Check the whole footprint before placing optional road furniture and scenery.
export function roadCorridorKeepClear(x: number, n: number, footprintRadius: number) {
  if (bridgeMouthKeepClear(x, n, footprintRadius)) return true;
  if (extensionRoadClearance(x, n, footprintRadius)) return true;
  return roads.some(({ ax, an, dx, dn, lengthSquared, halfWidth }) => {
    const east = x - ax;
    const north = n - an;
    const t = Math.min(1, Math.max(0, (east * dx + north * dn) / lengthSquared));
    const limit = halfWidth + footprintRadius;
    return (east - t * dx) ** 2 + (north - t * dn) ** 2 < limit ** 2;
  });
}
