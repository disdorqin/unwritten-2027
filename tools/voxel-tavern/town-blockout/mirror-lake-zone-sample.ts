import { BoxGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, Object3D } from 'three';
import { isMirrorLakeIce, mirrorLake, mirrorLakeIceInset } from '../../../src/shared/mirror-lake';

export type LakePoint = readonly [east: number, north: number];
export type MirrorZoneLayout = {
  fishing: readonly LakePoint[];
  westShorePavilionProbe: LakePoint;
  skateLines: readonly [readonly LakePoint[], readonly LakePoint[]];
  scoreCenters: readonly [LakePoint, LakePoint];
  prize: LakePoint;
  island: { center: LakePoint; radius: number };
};

const [cx, cn] = mirrorLake.center;
const [rx, rn] = mirrorLake.radius;
const iceScale = 1 - mirrorLakeIceInset / rn;
const probeCount = 8192;
export const mirrorScoreCenterSpacing = 44;
export const mirrorIslandNominalRadius = 6;
export const mirrorLanternSpacing = 15;

export function ellipseLoop(center: LakePoint, radii: LakePoint, count: number): LakePoint[] {
  const [east, north] = center;
  const [ax, an] = radii;
  return Array.from({ length: count }, (_, index) => {
    const theta = index * Math.PI * 2 / count;
    return [east + ax * Math.cos(theta), north + an * Math.sin(theta)];
  });
}

function distance(a: LakePoint, b: LakePoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distanceToLoop(point: LakePoint, loop: readonly LakePoint[]) {
  let best = Infinity;
  for (const [index, a] of loop.entries()) {
    const b = loop[(index + 1) % loop.length];
    const dx = b[0] - a[0], dn = b[1] - a[1];
    const px = point[0] - a[0], pn = point[1] - a[1];
    const ratio = Math.min(1, Math.max(0, (px * dx + pn * dn) / (dx * dx + dn * dn)));
    best = Math.min(best, Math.hypot(px - ratio * dx, pn - ratio * dn));
  }
  return best;
}

const iceEdge = ellipseLoop(mirrorLake.center, [rx * iceScale, rn * iceScale], probeCount);

export function signedIceClearance(point: LakePoint) {
  return distanceToLoop(point, iceEdge) * (isMirrorLakeIce(...point) ? 1 : -1);
}

export function northSouthIceChord(east: number) {
  const remaining = iceScale ** 2 - ((east - cx) / rx) ** 2;
  return 2 * rn * Math.sqrt(Math.max(0, remaining));
}

export function eastOpportunity(spacing = mirrorScoreCenterSpacing) {
  const half = spacing / 2;
  const remaining = iceScale ** 2 - (half / rn) ** 2;
  return { eastHalfWidth: rx * iceScale, furthestEast: cx + rx * Math.sqrt(Math.max(remaining, 0)) };
}

export function surveyMirrorZoneLayout(layout: MirrorZoneLayout) {
  const { skateLines, island, fishing, scoreCenters, prize } = layout;
  return {
    scoreSpacing: distance(...scoreCenters),
    scoreCenterGaps: scoreCenters.map(center => ({
      iceEdge: signedIceClearance(center),
      skateLine: Math.min(...skateLines.map(line => distanceToLoop(center, line))),
      islandEdge: distance(center, island.center) - island.radius,
    })),
    prizeIceGap: signedIceClearance(prize),
    islandIceGap: signedIceClearance(island.center) - island.radius,
    islandSkateGaps: skateLines.map(line => distanceToLoop(island.center, line) - island.radius),
    fishing: fishing.map(point => ({
      iceEdge: signedIceClearance(point),
      skateLine: Math.min(...skateLines.map(line => distanceToLoop(point, line))),
    })),
    skateIceGaps: skateLines.map(line => Math.min(...line.map(signedIceClearance))),
  };
}

// Place lamps by arc length on the approved shoreline ellipse. The last segment
// back to the anchor is measured separately; it does not redefine the spacing.
export function surveyMirrorShoreLanterns() {
  const shore = ellipseLoop(mirrorLake.center, mirrorLake.radius, probeCount);
  const lanterns: LakePoint[] = [shore[0]];
  let length = 0;
  let next = mirrorLanternSpacing;
  shore.forEach((start, index) => {
    const end = shore[(index + 1) % shore.length];
    const segment = distance(start, end);
    if (length + segment >= next) {
      const fraction = (next - length) / segment;
      lanterns.push([start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction]);
      next += mirrorLanternSpacing;
    }
    length += segment;
  });
  return { lanterns, length, closingGap: length - mirrorLanternSpacing * (lanterns.length - 1) };
}

type Tile = { point: LakePoint; y: number; width: number; height: number; depth: number; color: string; yaw?: number };

/** Isolation-only four-zone sample. The caller supplies survey geometry, not live destinations. */
export function buildMirrorLakeZoneSample(layout: MirrorZoneLayout, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'Mirror Lake four-zone survey';
  const tiles: Tile[] = [];
  const iceY = mirrorLake.height;
  function mark(point: LakePoint, width: number, depth: number, color: string, y = iceY + .03, height = .03, yaw = 0) {
    tiles.push({ point, y, width, height, depth, color, yaw });
  }

  // Equal-width colour bands are illustrative only. No terrain or production shader is modified.
  for (let n = cn - rn; n <= cn + rn; n++) for (let e = cx - rx; e <= cx + rx; e++) {
    const point: LakePoint = [e, n];
    if (!isMirrorLakeIce(...point)) continue;
    const radial = Math.hypot((e - cx) / rx, (n - cn) / rn);
    const tint = radial < iceScale / 3 ? '#3f859b' : radial < 2 * iceScale / 3 ? '#7dafc7' : '#deeff3';
    mark(point, 1, 1, tint, iceY, .03);
  }

  // Each visible overlay is a flat box in the same sample batch.
  const fractureAngles = [-.63, -.33, .37, .78];
  fractureAngles.forEach((angle, index) => {
    const point: LakePoint = [cx + Math.cos(angle) * 13, cn + (index - 1.5) * 15];
    if (isMirrorLakeIce(...point)) mark(point, 2.9, .09, '#c9e4ec', iceY + .024, .011, angle);
  });
  layout.skateLines.forEach((line, i) => line.forEach(point =>
    mark(point, .26, .26, i === 0 ? '#b4f4ff' : '#f7efd6')));
  const shore = surveyMirrorShoreLanterns();
  shore.lanterns.forEach(point => {
    const y = heightAt(...point);
    mark(point, .17, .17, '#60464b', y + .76, 1.52);
    mark(point, .39, .36, '#ba4849', y + 1.68, .25);
  });

  const [pavilionEast, pavilionNorth] = layout.westShorePavilionProbe;
  const pavilionY = heightAt(pavilionEast, pavilionNorth);
  mark(layout.westShorePavilionProbe, 2.1, 1.5, '#8e7060', pavilionY + .12, .24);
  mark(layout.westShorePavilionProbe, 2.25, 1.65, '#c5dde7', pavilionY + 1.26, .13);
  for (const [east, north] of layout.fishing) {
    mark([east, north], 1.05, .84, '#183f52', iceY + .04);
    const offset = (north - cn) / rn;
    const bank = cx - rx * Math.sqrt(Math.max(0, 1 - offset * offset));
    for (const delta of [-.32, 0, .32]) {
      const stem: LakePoint = [bank - .4, north + delta];
      mark(stem, .09, .09, '#897b56', heightAt(...stem) + .22, .44);
    }
  }

  // Display the whole-metre capacity of these provisional centers. The approved
  // rules provide a center interval and leave the playable ring radii unspecified.
  const { scoreCenterGaps } = surveyMirrorZoneLayout(layout);
  const capacity = Math.min(...scoreCenterGaps.flatMap(gap => [gap.iceEdge, gap.skateLine, gap.islandEdge]));
  const probeRadius = Math.floor(Math.max(0, capacity));
  layout.scoreCenters.forEach(point => {
    mark(point, 1.15, 1.15, '#edbe71', iceY + .045);
    if (probeRadius > 0) ellipseLoop(point, [probeRadius, probeRadius], 64).forEach(marker =>
      mark(marker, .25, .25, '#edbe71', iceY + .038));
  });
  mark(layout.prize, .95, .95, '#a7664a', iceY + .26, .50);
  const island = layout.island;
  const [east, north] = island.center;
  for (let n = north - island.radius; n <= north + island.radius; n++) {
    for (let e = east - island.radius; e <= east + island.radius; e++) {
      if (distance([e, n], island.center) <= island.radius) mark([e, n], 1, 1, '#daedf5', iceY + .11, .20);
    }
  }
  mark(island.center, .94, .70, '#b8e0ed', iceY + .68, .91);
  mark([east, north + .43], .44, .42, '#d4f3fc', iceY + 1.15, .42);

  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  const mesh = new InstancedMesh(geometry, material, tiles.length);
  mesh.name = 'Mirror Lake survey flat boxes';
  const shape = new Object3D();
  const color = new Color();
  tiles.forEach(({ point, y, width, height, depth, color: tint, yaw = 0 }, index) => {
    shape.position.set(point[0], y, -point[1]);
    shape.scale.set(width, height, depth);
    shape.rotation.y = yaw;
    shape.updateMatrix();
    mesh.setMatrixAt(index, shape.matrix);
    mesh.setColorAt(index, color.set(tint));
  });
  mesh.computeBoundingSphere();
  group.add(mesh);
  return {
    group, instances: mesh.count, triangles: mesh.count * geometry.index!.count / 3,
    dispose() {
      group.removeFromParent();
      group.clear();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
