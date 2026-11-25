import { ConeGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial } from 'three';
import type { MainSummitTrailPoint } from './main-summit-trail';

type HeightAt = (east: number, north: number) => number | undefined;

export type RockTowerCluster = {
  name: string; east: number; north: number; height: number; radius: number;
};

// Cluster names for the survey table (§2.8); wording is D-window draft,
// pending the control desk's text pass.
const clusterNames = [
  '迎客塔', '三塔', '独塔', '双子塔', '望云塔', '断剑塔',
  '驼峰塔', '守门塔', '飞来塔', '棋盘塔', '回音塔', '绝顶前塔',
] as const;

/**
 * Rock tower clusters (§2.8): mid-ground landmarks along the summit trail.
 * Twelve clusters sit 18-30 m off the tread so they read as wayfinding
 * silhouettes without ever blocking the walk. One instanced mesh total.
 */
export function createMainSummitRockTowers(
  trailPoints: readonly MainSummitTrailPoint[], heightAt: HeightAt,
) {
  const group = new Group();
  group.name = 'main-summit-rock-towers';
  let seed = 29;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const clusters: RockTowerCluster[] = [];
  const placements: { east: number; north: number; base: number; height: number; radius: number }[] = [];
  const step = Math.floor(trailPoints.length / (clusterNames.length + 2));
  for (let c = 0; c < clusterNames.length; c++) {
    const anchor = trailPoints[step * (c + 1)]!;
    const next = trailPoints[Math.min(trailPoints.length - 1, step * (c + 1) + 8)]!;
    const dx = next.east - anchor.east, dn = next.north - anchor.north;
    const length = Math.hypot(dx, dn) || 1;
    const side = c % 2 === 0 ? 1 : -1;
    const offset = 18 + rand() * 12;
    const east = anchor.east + (-dn / length) * offset * side;
    const north = anchor.north + (dx / length) * offset * side;
    const base = heightAt(east, north);
    if (base === undefined) continue;
    const spires = 3 + Math.floor(rand() * 3);
    let tallest = 0;
    let footprint = 0;
    for (let s = 0; s < spires; s++) {
      const height = 5 + rand() * 13;
      const radius = 1.6 + rand() * 1.8;
      const px = east + (rand() - .5) * 7;
      const pn = north + (rand() - .5) * 7;
      const pBase = heightAt(px, pn) ?? base;
      placements.push({ east: px, north: pn, base: pBase, height, radius });
      tallest = Math.max(tallest, height);
      footprint = Math.max(footprint, Math.hypot(px - east, pn - north) + radius);
    }
    clusters.push({ name: clusterNames[c]!, east, north, height: base + tallest, radius: footprint });
  }

  const geometry = new ConeGeometry(1, 1, 7);
  const material = new MeshLambertMaterial({ color: '#5d6066' });
  const mesh = new InstancedMesh(geometry, material, placements.length);
  mesh.name = 'main-summit-rock-tower-spires';
  const matrix = new Matrix4();
  for (const [i, spire] of placements.entries()) {
    matrix.makeScale(spire.radius, spire.height, spire.radius);
    matrix.setPosition(spire.east, spire.base + spire.height / 2 - .5, -spire.north);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  let disposed = false;
  return {
    group, clusters,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      return placements.some(spire =>
        feet + bodyHeight > spire.base && feet < spire.base + spire.height &&
        Math.hypot(east - spire.east, north - spire.north) < spire.radius + radius);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
