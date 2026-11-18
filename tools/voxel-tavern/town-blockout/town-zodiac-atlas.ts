import {
  BoxGeometry, CanvasTexture, CylinderGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh,
  Matrix4, MeshBasicMaterial, Object3D, SRGBColorSpace, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TownActivitySpot } from './town-activity';
import type { ZodiacProgress } from './town-zodiac';

type Point = readonly [number, number, number];
export type CharmSite = { id: SiteId; stand: Point; object: Point; yaw: number; range: number };
const faces = {
  rabbit: ['兔', '#a58cbd'],
  dragon: ['龙', '#6b9b87'],
  pig: ['猪', '#b97283'],
  monkey: ['猴', '#ba815e'],
  snake: ['蛇', '#6b9b87'],
  ox: ['牛', '#a57a59'],
  tiger: ['虎', '#c58a47'],
  dog: ['狗', '#a58f76'],
} as const;
type SiteId = keyof typeof faces;
const tiles = Object.keys(faces) as SiteId[];
const tileSide = 96;
const visibilityRadius = 26;

function charmAtlas() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = tileSide * tiles.length;
  canvas.height = tileSide;
  const ink = canvas.getContext('2d');
  if (!ink) return null;
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  ink.font = '700 44px "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
  tiles.forEach((id, tile) => {
    const [glyph, paint] = faces[id];
    const left = tile * tileSide;
    const center = left + tileSide / 2;
    ink.fillStyle = '#8c633c';
    ink.fillRect(left, 0, tileSide, tileSide);
    ink.beginPath();
    ink.arc(center, 48, 44, 0, 2 * Math.PI);
    ink.fillStyle = paint;
    ink.fill();
    ink.beginPath();
    ink.arc(center, 48, 39, 0, 2 * Math.PI);
    ink.strokeStyle = '#f3d7a7';
    ink.lineWidth = 3;
    ink.stroke();
    ink.fillStyle = '#fff0cb';
    ink.fillText(glyph, center, 51);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function charmGeometry() {
  const disc = new CylinderGeometry(.149, .149, .047, 10, 1).rotateX(Math.PI / 2).translate(0, .155, 0);
  const rope = new BoxGeometry(.039, .058, .03).translate(0, .318, 0);
  disc.clearGroups();
  rope.clearGroups();
  const ropeUv = rope.getAttribute('uv');
  for (let i = 0; i < ropeUv.count; i++) ropeUv.setXY(i, .035, .055);
  const merged = mergeGeometries([disc, rope])!;
  disc.dispose();
  rope.dispose();
  return merged;
}

type MountedCharm = { id: SiteId; position: Vector3; yaw: number; tile: number };

export function createTownZodiacSites(zodiac: ZodiacProgress, celebrate: (label: string) => void) {
  const geometry = charmGeometry();
  const atlasIndex = new InstancedBufferAttribute(new Float32Array(tiles.length), 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('charmTile', atlasIndex);
  const material = new MeshBasicMaterial({ map: charmAtlas() });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float charmTile;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv.x = (clamp(vMapUv.x, .01, .99) + charmTile) / ' + tiles.length.toFixed(1) + ';\n#endif',
    );
  };
  material.customProgramCacheKey = () => 'town-zodiac-atlas';
  const mesh = new InstancedMesh(geometry, material, tiles.length);
  mesh.name = '生肖挂件 · 地标共用图集';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const charmById = new Map<SiteId, MountedCharm>();
  const model = new Object3D();
  const matrix = new Matrix4();
  let renderedMask = -1;

  function mount(parent: Group, site: CharmSite): TownActivitySpot {
    const { id } = site;
    const position = parent.localToWorld(new Vector3(...site.object));
    const stand = parent.localToWorld(new Vector3(...site.stand));
    const label = faces[id][0];
    charmById.set(id, { id, position, yaw: parent.rotation.y + site.yaw, tile: tiles.indexOf(id) });
    zodiac.registerPickup(id);
    renderedMask = -1;
    return {
      x: stand.x, n: -stand.z, ground: stand.y, range: site.range,
      label: '拾取生肖挂件 · ' + label,
      available: () => zodiac.canCollect(id),
      run() {
        if (zodiac.collect(id)) celebrate(label);
      },
    };
  }

  function update(eye: Vector3, active: boolean) {
    let mask = 0;
    if (active) {
      for (const charm of charmById.values()) {
        if (zodiac.canCollect(charm.id) && eye.distanceToSquared(charm.position) <= visibilityRadius ** 2) {
          mask |= 1 << charm.tile;
        }
      }
    }
    if (mask === renderedMask) return;
    renderedMask = mask;
    mesh.count = 0;
    for (const charm of charmById.values()) {
      if (!(mask & (1 << charm.tile))) continue;
      model.position.copy(charm.position);
      model.rotation.y = charm.yaw;
      model.updateMatrix();
      mesh.setMatrixAt(mesh.count, matrix.copy(model.matrix));
      atlasIndex.setX(mesh.count, charm.tile);
      mesh.count++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    atlasIndex.needsUpdate = true;
  }

  return { mesh, mount, update };
}
