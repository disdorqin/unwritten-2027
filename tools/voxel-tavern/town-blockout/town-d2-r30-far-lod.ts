import {
  BufferGeometry, FrontSide, Group, Mesh, MeshLambertMaterial,
} from 'three';
import { buildR30TownSkyline, TOWN_D2_R30_SKYLINE_MAX_HAZE, townD2R30SkylineContract } from './town-d2-r30-skyline';
import { sampleTownD2R30Height } from './town-d2-r30-domain';

/**
 * D33-1: the production-ready distant replacement for window A's R31 faux
 * apron (`town-r31-public-skyline.ts`, toe=-6 + a 444 m hand-drawn slope + a
 * 70% flat colour lerp). That apron is the live cause of "the rear mountain is
 * visible from town but the near field is blank": it is a *different* height
 * story from the walkable ground, so walking up never meets the silhouette.
 *
 * This module wraps D2's closed, same-source skyline geometry into a single
 * mountable far LOD layer. Every top vertex is sampled from the SAME canonical
 * field as the walking collision; only the far vertex colour is tempered by a
 * bounded haze, so no ridge is flattened into a monochrome plane. It is a
 * FrontSide fogged mesh — no DoubleSide curtain, no sub-floor spike.
 *
 * Ownership: A writes the public viewer/terrain (single writer). This module
 * only *offers* the layer; A/总控 chooses to mount it INSTEAD OF the R31 apron.
 * Mounting both would double-draw the far silhouette — `replacesR31Apron`
 * records that contract for reviewers and for an automated guard.
 */
export const townD2R30FarLodContract = Object.freeze({
  owner: 'D2',
  source: 'sampleTownD2R30Height',
  replacesR31Apron: true,
  mutuallyExclusiveWith: 'town-r31-public-skyline',
  spacing: townD2R30SkylineContract.spacing,
  south: townD2R30SkylineContract.south,
  maxHaze: TOWN_D2_R30_SKYLINE_MAX_HAZE,
  material: Object.freeze({ side: 'front', fog: true, vertexColors: true }),
});

export type TownD2R30FarLodStats = Readonly<{
  vertices: number;
  triangles: number;
  topVertices: number;
  heightDrift: number;
  monochrome: boolean;
  hasSkirt: boolean;
  hasBottomCap: boolean;
}>;

/**
 * Verify the far layer against the canonical field before it is offered.
 * A far mesh whose top drifted off `heightAt` is exactly the fake slope this
 * rework exists to remove, so it fails closed here rather than shipping.
 */
function auditSameSource(geometry: BufferGeometry, heightAt: (e: number, n: number) => number | undefined) {
  const position = geometry.getAttribute('position');
  const topCount = Number(geometry.userData.r30TopVertexCount ?? 0);
  let worst = 0, checked = 0;
  for (let index = 0; index < topCount; index++) {
    const east = position.getX(index);
    const north = -position.getZ(index);
    const height = position.getY(index);
    const canonical = heightAt(east, north);
    if (canonical === undefined) continue;
    worst = Math.max(worst, Math.abs(height - canonical));
    checked++;
  }
  return { worst, checked };
}

function auditNotMonochrome(geometry: BufferGeometry) {
  const color = geometry.getAttribute('color');
  const topCount = Number(geometry.userData.r30TopVertexCount ?? 0);
  let min = Infinity, max = -Infinity;
  for (let index = 0; index < topCount; index++) {
    const luminance = color.getX(index) * .3 + color.getY(index) * .59 + color.getZ(index) * .11;
    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
  }
  // A bounded haze must still leave a readable luminance range on the far
  // field. A flat apron would collapse this to ~0.
  return max - min > .06;
}

export function createTownD2R30FarLod(
  heightAt: (east: number, north: number) => number | undefined =
    (east, north) => sampleTownD2R30Height(east, north),
) {
  const group = new Group();
  group.name = 'town-d2-r30-far-lod';
  const geometry = buildR30TownSkyline();
  const material = new MeshLambertMaterial({
    vertexColors: true,
    fog: true,
    side: FrontSide, // A closed shell never needs a DoubleSide curtain.
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'town-d2-r30-same-source-far';
  mesh.userData.farLodContract = townD2R30FarLodContract;
  group.add(mesh);

  const { worst, checked } = auditSameSource(geometry, heightAt);
  if (checked === 0 || worst > 1e-3) {
    geometry.dispose();
    material.dispose();
    throw new RangeError(`Far LOD drifted from the canonical field (drift ${worst}, checked ${checked}).`);
  }
  const notMonochrome = auditNotMonochrome(geometry);
  if (!notMonochrome) {
    geometry.dispose();
    material.dispose();
    throw new RangeError('Far LOD collapsed into a monochrome apron.');
  }

  const stats: TownD2R30FarLodStats = Object.freeze({
    vertices: geometry.getAttribute('position').count,
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
    topVertices: Number(geometry.userData.r30TopVertexCount),
    heightDrift: worst,
    monochrome: !notMonochrome,
    hasSkirt: geometry.userData.r30ClosedShell === true,
    hasBottomCap: geometry.userData.r30ClosedShell === true,
  });
  group.userData.stats = stats;
  group.userData.contract = townD2R30FarLodContract;

  let disposed = false;
  return {
    group,
    mesh,
    stats: () => stats,
    setNight(value: boolean) {
      if (disposed) throw new Error('D2 far LOD is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      // Distant fog already darkens the shell at night; no extra tint means
      // day/night share the exact same vertices and material, never a second mesh.
      material.color.setRGB(value ? .82 : 1, value ? .86 : 1, value ? .95 : 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
