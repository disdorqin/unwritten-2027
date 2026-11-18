import {
  Box3, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Frustum, Group, Matrix4, Mesh,
  MeshLambertMaterial, type Camera, type Object3D,
} from 'three';
import { gridStep, layout, waterHeight, type createTerrainGrid } from './terrain';

const terrainChunkCells = 64 / gridStep;
const aerialTileCells = 4 / gridStep;
type TerrainSpan = { start: number; count: number; bounds: Box3 };
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
  const aerialTiles: TerrainSpan[] = [];
  const totalVertices = cellWidth * cellDepth * 6;
  const positions = new BufferAttribute(new Float32Array(totalVertices * 3), 3).setUsage(DynamicDrawUsage);
  const vertexColors = new BufferAttribute(new Float32Array(totalVertices * 3), 3).setUsage(DynamicDrawUsage);
  const normals = new BufferAttribute(new Float32Array(totalVertices * 3), 3).setUsage(DynamicDrawUsage);
  const retentionMask = new BufferAttribute(new Uint8Array(totalVertices), 1, true).setUsage(DynamicDrawUsage);
  const detailAttributes = { position: positions, color: vertexColors, normal: normals, snowRetention: retentionMask };
  let nextVertex = 0;
  let aerialTerrain: Mesh | undefined;
  let aerialIndex: BufferAttribute | undefined;
  const frustum = new Frustum();
  const viewProjection = new Matrix4();
  const previousProjection = new Matrix4();
  let visibleTiles: TerrainSpan[] = [];
  let priorTiles: TerrainSpan[] = [];
  let processedVertices = -1;

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

    const tile = stride === 1 ? aerialTileCells : Math.max(eastEnd - east, northEnd - north);
    for (let tileNorth = north; tileNorth < northEnd; tileNorth += tile) {
      for (let tileEast = east; tileEast < eastEnd; tileEast += tile) {
        const first = offset;
        for (let j = tileNorth; j < Math.min(tileNorth + tile, northEnd); j += stride) {
          for (let i = tileEast; i < Math.min(tileEast + tile, eastEnd); i += stride) {
            const a = j * gridWidth + i;
            const b = a + Math.min(stride, eastEnd - i);
            const c = a + Math.min(stride, northEnd - j) * gridWidth;
            const d = c + (b - a);
            const variation = Math.sin(i * 83.01 + j * 39.17) + 1;
            // The detailed and walking paths use the same triangles, colors and retention.
            triangle(a, b, c, variation);
            triangle(b, d, c, variation);
          }
        }
        if (stride === 1) {
          const bounds = new Box3();
          bounds.min.set(tileEast * gridStep, Infinity, -Math.min(tileNorth + tile, northEnd) * gridStep);
          bounds.max.set(Math.min(tileEast + tile, eastEnd) * gridStep, -Infinity, -tileNorth * gridStep);
          for (let y = first + 1; y < offset; y += 3) {
            bounds.min.y = Math.min(bounds.min.y, position[y]);
            bounds.max.y = Math.max(bounds.max.y, position[y]);
          }
          aerialTiles.push({ bounds, start: nextVertex + first / 3, count: (offset - first) / 3 });
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('snowRetention', new BufferAttribute(retention, 1, true));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    if (stride === 1) {
      const first = nextVertex;
      const vertices = offset / 3;
      for (const [name, target] of Object.entries(detailAttributes)) {
        const start = first * target.itemSize;
        const original = geometry.getAttribute(name);
        target.array.set(original.array, start);
        target.addUpdateRange(start, original.array.length);
        target.needsUpdate = true;
        geometry.setAttribute(name, target);
      }
      geometry.setDrawRange(first, vertices);
      nextVertex += vertices;
    }
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

  function renderAerialTerrain(camera: Camera) {
    if (!aerialTerrain || !aerialIndex) {
      const geometry = new BufferGeometry();
      for (const [name, attribute] of Object.entries(detailAttributes)) geometry.setAttribute(name, attribute);
      aerialIndex = new BufferAttribute(new Uint32Array(totalVertices), 1).setUsage(DynamicDrawUsage);
      geometry.setIndex(aerialIndex);
      geometry.setDrawRange(0, 0);
      aerialTerrain = new Mesh(geometry, material);
      aerialTerrain.frustumCulled = false;
      aerialTerrain.name = 'Walkable terrain visible tiles';
      parent.add(aerialTerrain);
    }
    aerialTerrain.visible = true;
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (processedVertices === nextVertex && previousProjection.equals(viewProjection)) return;
    processedVertices = nextVertex;
    previousProjection.copy(viewProjection);
    frustum.setFromProjectionMatrix(viewProjection);
    visibleTiles.length = 0;
    for (const tile of aerialTiles) if (frustum.intersectsBox(tile.bounds)) visibleTiles.push(tile);
    if (visibleTiles.length === priorTiles.length && visibleTiles.every((tile, index) => tile === priorTiles[index])) return;
    [priorTiles, visibleTiles] = [visibleTiles, priorTiles];
    const index = aerialIndex.array;
    let offset = 0;
    for (const tile of priorTiles) {
      const end = tile.start + tile.count;
      for (let vertex = tile.start; vertex < end; vertex++) index[offset++] = vertex;
    }
    aerialTerrain.geometry.setDrawRange(0, offset);
    aerialIndex.clearUpdateRanges();
    aerialIndex.addUpdateRange(0, offset);
    aerialIndex.needsUpdate = true;
  }

  return function prepareTerrain(x: number, n: number, overview: boolean, wide: boolean, cover = 0, camera?: Camera) {
    snowCover.value = cover;
    detailed.visible = !wide && !(overview && camera);
    if (aerialTerrain) aerialTerrain.visible = false;
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
      if (nearest < 0) break;
      const [{ east, north }] = pending.splice(nearest, 1);
      addChunk(east, north);
    }
    if (overview && camera) renderAerialTerrain(camera);
  };
}
