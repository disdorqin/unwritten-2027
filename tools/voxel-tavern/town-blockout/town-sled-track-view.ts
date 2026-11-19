// 3.0 D2 长雪痕渲染：数据来自 H2 积雪统一场（town-snow-field 的雪痕登记），
// 本模块只负责把登记段画成双轨缎带（几何口径沿用 B3b sled-tracks：每段 12 顶点、
// 轨距 ±.29 m、顶点色带 alpha）。留存/积盖/上限全部由场决定，这里不计时。
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, MeshBasicMaterial, type Scene } from 'three';
import { snowFieldTrackCapacity, type TownSnowField } from './town-snow-field';

const verticesPerSlot = 12;
const spine = [-1, 1, -1, 1, 1, -1];
const ends = [0, 0, 1, 0, 1, 1];

export function createSledTrackView(scene: Scene, ground: (x: number, n: number) => number) {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(snowFieldTrackCapacity * verticesPerSlot * 3), 3)
    .setUsage(DynamicDrawUsage);
  const color = new BufferAttribute(new Float32Array(snowFieldTrackCapacity * verticesPerSlot * 4), 4)
    .setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  }));
  mesh.name = 'town-sled-tracks-field';
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  let lastCount = -1;
  let lastSync = -Infinity;

  return {
    /** 把场内雪痕同步进顶点缓冲；alpha 变化时也需周期调用（内部 .5 s 节流）。 */
    sync(field: TownSnowField, nowSeconds: number) {
      const count = field.trackCount();
      if (count === lastCount && nowSeconds - lastSync < .5) return;
      lastCount = count;
      lastSync = nowSeconds;
      const segments = field.trackSegments();
      for (let slot = 0; slot < segments.length; slot++) {
        const segment = segments[slot];
        const east = segment.x2 - segment.x1, north = segment.n2 - segment.n1;
        const distance = Math.hypot(east, north) || 1;
        const sideEast = north / distance, sideNorth = -east / distance;
        const deep = segment.strength >= .8;
        const shade = deep ? .29 : .43;
        const opacity = segment.alpha * .52;
        for (const rail of [-1, 1]) for (let i = 0; i < 6; i++) {
          const offset = rail * .29 + spine[i] * (deep ? .047 : .034);
          const px = segment.x1 + east * ends[i] + sideEast * offset;
          const pn = segment.n1 + north * ends[i] + sideNorth * offset;
          const vertex = slot * verticesPerSlot + (rail === -1 ? 0 : 6) + i;
          position.setXYZ(vertex, px, ground(px, pn) + .028, -pn);
          color.setXYZW(vertex, shade * .79, shade * .90, shade, opacity);
        }
      }
      geometry.setDrawRange(0, segments.length * verticesPerSlot);
      position.needsUpdate = true;
      color.needsUpdate = true;
      mesh.visible = segments.length > 0;
    },
    mesh,
  };
}

export type SledTrackView = ReturnType<typeof createSledTrackView>;
