import { Frustum, Matrix4, Mesh, Texture, type PerspectiveCamera, type Scene, type Vector3, type WebGLRenderer } from 'three';

/** Upload each cold texture separately during the existing portal conceal animation. */
export async function prewarmHouseDoorTextures(
  renderer: Pick<WebGLRenderer, 'initTexture' | 'properties'>,
  scene: Scene,
  camera: PerspectiveCamera,
  position: Vector3,
  heading: number,
  stillInside: () => boolean,
) {
  if (!stillInside()) return;
  const view = camera.clone();
  view.layers.set(0);
  view.position.copy(position);
  view.lookAt(position.x + Math.sin(heading), position.y, position.z - Math.cos(heading));
  view.updateMatrixWorld();
  scene.updateMatrixWorld();

  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse),
  );
  const textures = new Set<Texture>();
  scene.traverseVisible(object => {
    if (!(object instanceof Mesh) || !view.layers.test(object.layers) ||
        (object.frustumCulled && !frustum.intersectsObject(object))) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material.visible) continue;
      for (const value of Object.values(material)) {
        if (!(value instanceof Texture)) continue;
        // A properties record can exist before the first actual texture upload.
        const state = renderer.properties.has(value)
          ? renderer.properties.get(value) as { __webglInit?: boolean }
          : undefined;
        if (!state?.__webglInit) textures.add(value);
      }
    }
  });

  // Leave room to finish the last upload before the existing 300 ms conceal ends.
  const deadline = performance.now() + 260;
  for (const texture of textures) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (!stillInside() || performance.now() >= deadline) return;
    renderer.initTexture(texture);
  }
}
