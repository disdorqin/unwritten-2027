import { Vector3, type Camera } from 'three';

type TerrainHeight = (east: number, north: number) => number | undefined;

/** Test the rendered silhouette center against the player's camera and the corresponding world terrain. */
export function createSkyCityRevealSightline(terrainHeight: TerrainHeight) {
  const eye = new Vector3();
  const projected = new Vector3();

  return (camera: Camera, islandCenter: Vector3) => {
    camera.updateWorldMatrix(true, false);
    projected.copy(islandCenter).applyMatrix4(camera.matrixWorldInverse);
    if (!(projected.z < 0)) return false;
    projected.applyMatrix4(camera.projectionMatrix);
    if (!(projected.z >= -1 && projected.z <= 1 &&
        Math.abs(projected.x) <= .94 && Math.abs(projected.y) <= .91)) return false;

    eye.setFromMatrixPosition(camera.matrixWorld);
    for (let part = 1; part < 16; part++) {
      const weight = part / 16;
      const east = eye.x + (islandCenter.x - eye.x) * weight;
      const north = -(eye.z + (islandCenter.z - eye.z) * weight);
      const sightHeight = eye.y + (islandCenter.y - eye.y) * weight;
      if ((terrainHeight(east, north) ?? -Infinity) >= sightHeight) return false;
    }
    return true;
  };
}
