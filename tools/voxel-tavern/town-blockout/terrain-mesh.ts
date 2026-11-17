import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshLambertMaterial, type Object3D } from 'three';
import { gridStep, layout, waterHeight, type createTerrainGrid } from './terrain';

const terrainChunkCells = 64 / gridStep;
const palette = ['#d8e1ef', '#9a887c', '#bcac97', '#c7b795', '#78b8d9'].map(value => new Color(value));

export function addTerrainMeshes(parent: Object3D, grid: ReturnType<typeof createTerrainGrid>) {
  const { elevation, surfaces, gridWidth, gridDepth } = grid;
  const cellWidth = gridWidth - 1;
  const cellDepth = gridDepth - 1;
  const material = new MeshLambertMaterial({ vertexColors: true });
  const snowCover = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.townSnowCover = snowCover;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float snowRetention;\nuniform float townSnowCover;')
      .replace('#include <color_vertex>', `
        #include <color_vertex>
        // The baked retention mask preserves roads, stonework, water and ice.
        #ifdef USE_COLOR
          vColor.rgb = mix(vColor.rgb, vec3(.93, .96, 1.0), snowRetention * townSnowCover);
        #endif
      `);
  };

  const pending: { east: number; north: number }[] = [];
  const detailed = new Group();
  detailed.name = 'Walkable terrain';
  parent.add(detailed);
  let wideTerrain: Mesh | undefined;

  function createChunk(east: number, north: number, eastEnd: number, northEnd: number, stride = 1) {
    const length = Math.ceil((eastEnd - east) / stride) * Math.ceil((northEnd - north) / stride) * 18;
    const position = new Float32Array(length);
    const colors = new Float32Array(length);
    const retention = new Uint8Array(length / 3);
    let offset = 0;

    function vertex(index: number, color: Color, shade: number, snow: number) {
      position[offset] = (index % gridWidth) * gridStep;
      position[offset + 1] = elevation[index];
      position[offset + 2] = -Math.floor(index / gridWidth) * gridStep;
      colors[offset] = color.r * shade;
      colors[offset + 1] = color.g * shade;
      colors[offset + 2] = color.b * shade;
      retention[offset / 3] = elevation[index] > waterHeight + .08 ? snow : 0;
      offset += 3;
    }

    function triangle(a: number, b: number, c: number, variation: number) {
      const s0 = surfaces[a], s1 = surfaces[b], s2 = surfaces[c];
      const surface = s0 === s1 || s0 === s2 ? s0 : s1 === s2 ? s1 : 0;
      const color = palette[surface];
      const shade = 1 - variation * (surface === 0 ? .027 : .018);
      const snow = surface === 0 ? Math.round(211 + 17 * variation)
        : surface === 1 ? Math.round(43 + 12 * variation)
        : surface === 2 ? 27 : surface === 3 ? 18 : 0;
      vertex(a, color, shade, snow);
      vertex(b, color, shade, snow);
      vertex(c, color, shade, snow);
    }

    for (let j = north; j < northEnd; j += stride) {
      for (let i = east; i < eastEnd; i += stride) {
        const a = j * gridWidth + i;
        const b = a + Math.min(stride, eastEnd - i);
        const c = a + Math.min(stride, northEnd - j) * gridWidth;
        const d = c + (b - a);
        const variation = Math.sin(i * 83.01 + j * 39.17) + 1;
        // Same split as heightAt and same world-space shade on both sides of each chunk seam.
        triangle(a, b, c, variation);
        triangle(b, d, c, variation);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('snowRetention', new BufferAttribute(retention, 1, true));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    mesh.name = `Terrain ${east * gridStep},${north * gridStep}`;
    return mesh;
  }

  function addChunk(east: number, north: number) {
    detailed.add(createChunk(east, north, Math.min(east + terrainChunkCells, cellWidth), Math.min(north + terrainChunkCells, cellDepth)));
  }

  for (let north = 0; north < cellDepth; north += terrainChunkCells) {
    for (let east = 0; east < cellWidth; east += terrainChunkCells) {
      if (east * gridStep < layout.width && north * gridStep < layout.depth) addChunk(east, north);
      else pending.push({ east, north });
    }
  }

  return function prepareTerrain(x: number, n: number, overview: boolean, wide: boolean, cover = 0) {
    snowCover.value = cover;
    detailed.visible = !wide;
    if (wide) {
      if (!wideTerrain) {
        wideTerrain = createChunk(0, 0, cellWidth, cellDepth, 3);
        wideTerrain.name = 'Terrain panorama';
        parent.add(wideTerrain);
      }
      wideTerrain.visible = true;
      return;
    }
    if (wideTerrain) wideTerrain.visible = false;
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
