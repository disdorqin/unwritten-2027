import {
  Box3, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Frustum, Group, Matrix4, Mesh,
  MeshLambertMaterial, Quaternion, Vector3, type Camera, type Object3D,
} from 'three';
import { gridStep, layout, waterHeight, type createTerrainGrid } from './terrain';

const terrainChunkCells = 64 / gridStep;
const aerialTileCells = 4 / gridStep;
const clipTolerance = .0001;
type TerrainSpan = { start: number; count: number; bounds: Box3 };
type WalkingChunk={mesh:Mesh;first:number;count:number;spans:TerrainSpan[];index?:BufferAttribute};
const palette = ['#d8e1ef', '#9a887c', '#bcac97', '#c7b795', '#78b8d9'].map(value => new Color(value));

export function addTerrainMeshes(parent: Object3D, grid: ReturnType<typeof createTerrainGrid>, ridgeOwnsCell?: (east:number,north:number)=>boolean) {
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
  const walkingChunks:WalkingChunk[]=[];
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
  let processedVertices = -1;

  function createChunk(east: number, north: number, eastEnd: number, northEnd: number, stride = 1) {
    const length = Math.ceil((eastEnd - east) / stride) * Math.ceil((northEnd - north) / stride) * 18;
    const position = new Float32Array(length);
    const colors = new Float32Array(length);
    const retention = new Uint8Array(length / 3);
    let offset = 0;
    const firstTile=aerialTiles.length;

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
            if(stride===1&&ridgeOwnsCell?.(i*gridStep,j*gridStep))continue;
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
        if (stride === 1 && offset>first) {
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
    geometry.setAttribute('position', new BufferAttribute(position.subarray(0,offset), 3));
    geometry.setAttribute('color', new BufferAttribute(colors.subarray(0,offset), 3));
    geometry.setAttribute('snowRetention', new BufferAttribute(retention.subarray(0,offset/3), 1, true));
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
        // A walking draw uploads only this chunk's view. Keep the shared
        // backing arrays and global vertex offsets for the aerial tile index.
        const local = target.array.subarray(start, start + original.array.length);
        geometry.setAttribute(name, new BufferAttribute(local, target.itemSize, target.normalized));
      }
      geometry.setDrawRange(0, vertices);
      nextVertex += vertices;
    }
    const mesh = new Mesh(geometry, material);
    mesh.name = `Terrain ${east * gridStep},${north * gridStep}`;
    if(stride===1&&offset)walkingChunks.push({mesh,first:nextVertex-offset/3,count:offset/3,spans:aerialTiles.slice(firstTile)});
    return mesh;
  }

  function addChunk(east: number, north: number) {
    const mesh=createChunk(east, north, Math.min(east + terrainChunkCells, cellWidth), Math.min(north + terrainChunkCells, cellDepth));
    if(mesh.geometry.getAttribute('position').count)detailed.add(mesh);else mesh.geometry.dispose();
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
    const index = aerialIndex.array;
    const coords = positions.array;
    const planes = frustum.planes;
    let offset = 0;
    // Keep the original triangles. A boundary triangle is outside only if
    // one camera plane strictly excludes all three of its vertices.
    for (const { bounds, start, count } of aerialTiles) {
      let crossings = 0;
      for (let side = 0; side < planes.length; side++) {
        const { normal: { x, y, z }, constant } = planes[side];
        const nearX = x < 0 ? bounds.max.x : bounds.min.x;
        const nearY = y < 0 ? bounds.max.y : bounds.min.y;
        const nearZ = z < 0 ? bounds.max.z : bounds.min.z;
        const farX = x < 0 ? bounds.min.x : bounds.max.x;
        const farY = y < 0 ? bounds.min.y : bounds.max.y;
        const farZ = z < 0 ? bounds.min.z : bounds.max.z;
        if (x * farX + y * farY + z * farZ + constant < -clipTolerance) {
          crossings = -1;
          break;
        }
        if (x * nearX + y * nearY + z * nearZ + constant < -clipTolerance) crossings |= 1 << side;
      }
      if (crossings < 0) continue;
      const end = start + count;
      if (!crossings) {
        for (let vertex = start; vertex < end; vertex++) index[offset++] = vertex;
        continue;
      }
      for (let vertex = start; vertex < end; vertex += 3) {
        const at = vertex * 3;
        let visible = true;
        for (let bits = crossings; bits; bits &= bits - 1) {
          const { normal: { x, y, z }, constant } = planes[31 - Math.clz32(bits & -bits)];
          const cutoff = -constant - clipTolerance;
          if (x * coords[at] + y * coords[at + 1] + z * coords[at + 2] < cutoff &&
              x * coords[at + 3] + y * coords[at + 4] + z * coords[at + 5] < cutoff &&
              x * coords[at + 6] + y * coords[at + 7] + z * coords[at + 8] < cutoff) {
            visible = false;
            break;
          }
        }
        if (visible) {
          index[offset++] = vertex;
          index[offset++] = vertex + 1;
          index[offset++] = vertex + 2;
        }
      }
    }
    aerialTerrain.geometry.setDrawRange(0, offset);
    aerialIndex.clearUpdateRanges();
    aerialIndex.addUpdateRange(0, offset);
    aerialIndex.needsUpdate = true;
  }

  // Normal walking uses the same original per-chunk attributes and
  // triangle ranges as the aerial stream, without uploading the full
  // aggregate buffer on entry. Only the index of a partly visible chunk
  // changes. Padded frusta make reuse safe while the eye translates or
  // rotates slightly; newly loaded chunks stay fully visible until refresh.
  const walkingEye=new Vector3(),walkingRotation=new Quaternion(),eye=new Vector3(),rotation=new Quaternion(),walkingProjection=new Matrix4();
  let walkingActive=false,walkingVertices=-1,walkingLastUpdate=-Infinity;
  function restoreWalking(){
    if(!walkingActive)return;
    walkingActive=false;
    for(const c of walkingChunks){
      c.mesh.visible=true;
      if(c.mesh.geometry.index){c.mesh.geometry.setIndex(null);c.mesh.geometry.setDrawRange(0,c.count);}
    }
  }
  function renderWalkingTerrain(camera:Camera){
    camera.updateMatrixWorld();
    eye.setFromMatrixPosition(camera.matrixWorld);
    rotation.setFromRotationMatrix(camera.matrixWorld);
    const now=performance.now();
    if(walkingActive&&walkingProjection.equals(camera.projectionMatrix)&&walkingEye.distanceToSquared(eye)<=9&&walkingRotation.angleTo(rotation)<=.065&&
       (walkingVertices===nextVertex||now-walkingLastUpdate<250))return;
    walkingActive=true;walkingEye.copy(eye);walkingRotation.copy(rotation);walkingProjection.copy(camera.projectionMatrix);
    walkingVertices=nextVertex;walkingLastUpdate=now;
    viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
    for(const c of walkingChunks){
      let count=0;
      const selected:TerrainSpan[]=[];
      for(const tile of c.spans){
        const {min,max}=tile.bounds;
        const distance=Math.hypot(Math.max(Math.abs(min.x-eye.x),Math.abs(max.x-eye.x)),
          Math.max(Math.abs(min.y-eye.y),Math.abs(max.y-eye.y)),Math.max(Math.abs(min.z-eye.z),Math.abs(max.z-eye.z)));
        // Plane normal rotation <= 2 sin(theta/2). Include the 3m
        // cache translation and additional head/camera motion margin.
        const pad=4+.11*distance;
        let visible=true;
        for(const p of frustum.planes){
          const n=p.normal;
          if(n.x*(n.x<0?min.x:max.x)+n.y*(n.y<0?min.y:max.y)+n.z*(n.z<0?min.z:max.z)+p.constant < -pad){visible=false;break;}
        }
        if(visible){selected.push(tile);count+=tile.count;}
      }
      c.mesh.visible=count>0;
      if(!count||count>=c.count*.88){
        if(c.mesh.geometry.index){c.mesh.geometry.setIndex(null);c.mesh.geometry.setDrawRange(0,c.count);}
        continue;
      }
      c.index??=new BufferAttribute(new Uint32Array(c.count),1).setUsage(DynamicDrawUsage);
      const indices=c.index.array;let offset=0;
      for(const tile of selected)for(let v=tile.start-c.first;v<tile.start-c.first+tile.count;v++)indices[offset++]=v;
      if(c.mesh.geometry.index!==c.index)c.mesh.geometry.setIndex(c.index);
      c.mesh.geometry.setDrawRange(0,count);
      c.index.clearUpdateRanges();c.index.addUpdateRange(0,count);c.index.needsUpdate=true;
    }
  }

  return function prepareTerrain(x: number, n: number, overview: boolean, wide: boolean, cover = 0, camera?: Camera, walkingCull=false) {
    snowCover.value = cover;
    // A masked terrain uses the exact disjoint ridge/town mesh partition;
    // never draw the coarse unmasked panorama on top of the ridge.
    if(ridgeOwnsCell&&wide){wide=false;overview=true;}
    if(!walkingCull||overview||wide||!camera)restoreWalking();
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
    else if(walkingCull&&camera)renderWalkingTerrain(camera);
  };
}

