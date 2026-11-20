import { AdditiveBlending, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial, type Group } from 'three';
import { mirrorLake } from '../../../src/shared/mirror-lake';

export type MirrorLakeConfirmedConditions = Readonly<{ frozen: boolean; showUnderIceGlow: boolean }>;

export function createMirrorLakeUnderIceGlow(parent: Group) {
  const geometry = new PlaneGeometry(1, 1);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float falloff = max(0.0, 1.0 - length(vUv * 2.0 - 1.0));
        gl_FragColor = vec4(0.39, 0.73, 0.89, 0.24 * falloff * falloff);
      }`,
  });
  // A texture-free ice-surface projection makes light through the opaque ice
  // readable without a transparent terrain pass or new per-instance draws.
  const count = 14;
  const glow = new InstancedMesh(geometry, material, count);
  glow.name = 'Mirror Lake under-ice glow';
  glow.visible = false;
  const pose = new Object3D();
  const [centerEast, centerNorth] = mirrorLake.center;
  for (let i = 0; i < count; i++) {
    const turn = i * Math.PI * (3 - Math.sqrt(5));
    const ring = Math.sqrt((i + .5) / count);
    pose.position.set(centerEast + 13 * ring * Math.cos(turn), mirrorLake.height + .016,
      -(centerNorth - 6 + 25 * ring * Math.sin(turn)));
    pose.scale.set(1.1 + (i % 4) * .5, .57 + (i % 3) * .26, 1);
    pose.rotation.set(-Math.PI / 2, 0, turn);
    pose.updateMatrix();
    glow.setMatrixAt(i, pose.matrix);
  }
  glow.instanceMatrix.needsUpdate = true;
  glow.computeBoundingSphere();
  parent.add(glow);

  return {
    sync(conditions: MirrorLakeConfirmedConditions | undefined) {
      glow.visible = conditions?.frozen === true && conditions.showUnderIceGlow === true;
    },
    dispose() {
      glow.removeFromParent();
      glow.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
