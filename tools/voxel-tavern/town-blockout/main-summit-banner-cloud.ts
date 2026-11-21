import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial } from 'three';
import { mainSummitLayout, mainSummitSpec } from './main-summit-block';

/**
 * Banner cloud (§2.4): a voxel plume streaming east from the summit inside
 * the walkable domain, mirroring the town skyline shell's plume grammar.
 * Wind linkage (ZB-20) arrives with the interaction round; until then the
 * plume breathes on a slow local cycle. One instanced draw for all segments.
 */
export function createMainSummitBannerCloud() {
  const group = new Group();
  group.name = 'main-summit-banner-cloud';
  const material = new MeshLambertMaterial({ color: '#eef2f5', transparent: true, opacity: .92 });
  const geometry = new BoxGeometry(1, 1, 1);
  const { east, north } = mainSummitLayout.summit;
  const top = mainSummitSpec.summitHeight;
  const segments = new InstancedMesh(geometry, material, 9);
  segments.name = 'banner-cloud-segments';
  const matrix = new Matrix4();
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    matrix.makeScale(52 * (1 - t * .35), 22 * (1 - t * .55), 70 * (1 - t * .4));
    matrix.setPosition(east + t * 460, top - 6 - t * 34 + Math.sin(t * 9) * 5, -north + Math.sin(t * 5) * 12);
    segments.setMatrixAt(i, matrix);
  }
  segments.instanceMatrix.needsUpdate = true;
  group.add(segments);
  let disposed = false;
  return {
    group,
    update(seconds: number) {
      group.position.x = Math.sin(seconds * .05) * 8;
      const stretch = 1 + Math.sin(seconds * .11) * .04;
      group.scale.set(stretch, 1, 1);
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
