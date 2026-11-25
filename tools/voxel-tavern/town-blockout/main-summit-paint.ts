import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';
import { mainSummitBounds } from './main-summit-block';

type HeightAt = (east: number, north: number) => number | undefined;

const snow = new Color('#e8ecf0');
const ochre = new Color('#b08d4f');
const darkRock = new Color('#3a3f3d');
const stone = new Color('#8a8378');

/**
 * In-domain surface paint for the main summit (design book §2.4): the same
 * four-band grammar the town skyline shell already carries — snowfield with
 * rock on steep faces, an ochre rock band across the waist, dark rock above,
 * snow surviving only on ledges. Implemented as a lifted vertex-colour
 * overlay so the surveyed block geometry and material stay untouched.
 */
export function buildMainSummitPaint(heightAt: HeightAt, spacing = 20) {
  const { west, east, south, north } = mainSummitBounds;
  const columns = Math.floor((east - west) / spacing) + 1;
  const rows = Math.floor((north - south) / spacing) + 1;
  const positions = new Float32Array(columns * rows * 3);
  const colors = new Float32Array(columns * rows * 4);
  const tint = new Color();

  function sample(e: number, n: number) {
    return heightAt(e, n) ?? 150;
  }

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const e = west + column * spacing;
      const n = south + row * spacing;
      const h = sample(e, n);
      const index = row * columns + column;
      positions.set([e, h + .4, -n], index * 3);
      const gx = (sample(e + spacing / 2, n) - sample(e - spacing / 2, n)) / spacing;
      const gz = (sample(e, n + spacing / 2) - sample(e, n - spacing / 2)) / spacing;
      const steep = 1 - 1 / Math.hypot(1, gx, gz);
      // Thresholds calibrated to the surveyed cone: its faces run near
      // gradient 0.5 (steep ~0.11); only flats, the plateau and shoulder
      // crowns fall below 0.08, and only ridge flanks exceed 0.30.
      let alpha = 0;
      if (h >= 510) {
        if (steep < .08) { tint.copy(snow); alpha = .95; }
        else { tint.copy(darkRock); alpha = .92; }
      } else if (h >= 420) {
        if (steep > .30) { tint.copy(darkRock); alpha = .9; }
        else { tint.copy(ochre); alpha = .88; }
      } else if (h >= 300) {
        if (steep < .08) { tint.copy(snow); alpha = .8; }
        else { tint.copy(stone); alpha = .55; }
      }
      colors.set([tint.r, tint.g, tint.b, alpha], index * 4);
    }
  }

  const indices: number[] = [];
  for (let row = 0; row + 1 < rows; row++) {
    for (let column = 0; column + 1 < columns; column++) {
      const here = row * columns + column;
      const next = here + columns;
      indices.push(here, here + 1, next, here + 1, next + 1, next);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new MeshLambertMaterial({
    vertexColors: true, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'main-summit-paint';
  let disposed = false;
  return {
    mesh,
    /** Night version (§2.4): darken the paint so the massif never reads as a pale wall. */
    setNight(night: boolean) {
      material.color.set(night ? '#5f7186' : '#ffffff');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
