import { BufferAttribute, BufferGeometry, Color, Mesh, MeshLambertMaterial, type Object3D } from 'three';
import { gridStep, layout, type createTerrainGrid } from './terrain';

const terrainChunkCells = 64 / gridStep;
const palette = ['#d8e1ef', '#9a887c', '#bcac97', '#c7b795', '#78b8d9'].map(value => new Color(value));

export function addTerrainMeshes(parent: Object3D, grid: ReturnType<typeof createTerrainGrid>) {
  const { elevation, surfaces, gridWidth, gridDepth } = grid;
  const cellWidth = gridWidth - 1;
  const cellDepth = gridDepth - 1;
  const material = new MeshLambertMaterial({ vertexColors: true });

  const pending: { east: number; north: number }[] = [];

  function addChunk(east: number, north: number) {
    const northEnd = Math.min(north + terrainChunkCells, cellDepth);
    const eastEnd = Math.min(east + terrainChunkCells, cellWidth);
    const length = (eastEnd - east) * (northEnd - north) * 18;
    const position = new Float32Array(length);
    const colors = new Float32Array(length);
    let offset = 0;

    function vertex(index: number, color: Color, shade: number) {
      position[offset] = (index % gridWidth) * gridStep;
      position[offset + 1] = elevation[index];
      position[offset + 2] = -Math.floor(index / gridWidth) * gridStep;
      colors[offset] = color.r * shade;
      colors[offset + 1] = color.g * shade;
      colors[offset + 2] = color.b * shade;
      offset += 3;
    }

    function triangle(a: number, b: number, c: number, variation: number) {
      const s0 = surfaces[a], s1 = surfaces[b], s2 = surfaces[c];
      const surface = s0 === s1 || s0 === s2 ? s0 : s1 === s2 ? s1 : 0;
      const color = palette[surface];
      const shade = 1 - variation * (surface === 0 ? .027 : .018);
      vertex(a, color, shade);
      vertex(b, color, shade);
      vertex(c, color, shade);
    }

    for (let j = north; j < northEnd; j++) {
      for (let i = east; i < eastEnd; i++) {
        const a = j * gridWidth + i;
        const b = a + 1;
        const c = a + gridWidth;
        const d = c + 1;
        const variation = Math.sin(i * 83.01 + j * 39.17) + 1;
        // Same split as heightAt and same world-space shade on both sides of each chunk seam.
        triangle(a, b, c, variation);
        triangle(b, d, c, variation);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    mesh.name = `Terrain ${east * gridStep},${north * gridStep}`;
    parent.add(mesh);
  }

  for (let north = 0; north < cellDepth; north += terrainChunkCells) {
    for (let east = 0; east < cellWidth; east += terrainChunkCells) {
      if (east * gridStep < layout.width && north * gridStep < layout.depth) addChunk(east, north);
      else pending.push({ east, north });
    }
  }

  return function prepareTerrain(x: number, n: number, overview: boolean) {
    for (let count = 0; count < (overview ? 3 : 1); count++) {
      let nearest = -1;
      let distance = overview ? Infinity : 128;
      for (let i = 0; i < pending.length; i++) {
        const { east, north } = pending[i];
        const dx = Math.max(east * gridStep - x, x - (east + terrainChunkCells) * gridStep, 0);
        const dn = Math.max(north * gridStep - n, n - (north + terrainChunkCells) * gridStep, 0);
        const candidate = Math.hypot(dx, dn);
        if (candidate >= distance) continue;
        nearest = i;
        distance = candidate;
      }
      if (nearest < 0) return;
      const [{ east, north }] = pending.splice(nearest, 1);
      addChunk(east, north);
    }
  };
}
