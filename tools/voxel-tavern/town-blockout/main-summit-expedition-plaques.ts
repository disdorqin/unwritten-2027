import {
  BoxGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace,
} from 'three';
import type { SummitExpeditionSite } from './main-summit-expedition-sites';

export type SummitExpeditionPlaque = Readonly<{
  id: string;
  heading: string;
  lines: readonly [string, string, string, string];
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

const authoredCopy = Object.freeze({
  'expedition-cloud-shelter': ['云海守山人', '木火留给晚归客', '夜风压过山背时', '进屋添一截干柴'],
  'expedition-ice-shelter': ['冰瀑避风窝棚', '六枚旧绳桩仍在', '背风向里是火塘', '离去请掩好灯门'],
  'expedition-watch-ruins': ['南肩守天哨', '三块星图未合拢', '风过黄铜断架', '有人守望过今夜'],
  'expedition-icefall': ['主峰凝冰瀑', '青蓝裂纹藏着光', '四十米冰痕未消', '绳桩只认稳步人'],
  'expedition-summit-flag': ['绝顶经幡石圈', '一路雪岭都在脚下', '城灯落在云海后', '请记住这一年'],
  'expedition-cable-machine-room': ['缆车二线检修房', '先验锈闸与配重', '轮组稳妥才开车', '未修通请走山路'],
  'cloud-bell-1': ['云海九铃值守簿', '守山旧谱：短—长—短', '先敲首铃，留三段停顿', '雾灯亮后循铃回家'],
} satisfies Record<string, readonly [string, string, string, string]>);

export const summitExpeditionPlaqueCopy = authoredCopy;

function createSignTexture(lines: readonly string[]): CanvasTexture | undefined {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#463c35';
  context.fillRect(0, 0, 512, 288);
  context.fillStyle = '#302d30';
  context.fillRect(13, 10, 486, 268);
  context.strokeStyle = '#d1a878';
  context.lineWidth = 6;
  context.strokeRect(22, 20, 468, 248);
  context.fillStyle = '#eadcc5';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) {
    context.font = i === 0 ? 'bold 42px system-ui, sans-serif' : '29px system-ui, sans-serif';
    context.fillText(lines[i]!, 256, 55 + i * 60, 460);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * R4/R5 finalized legible story copy and physical signboards. No placeholder
 * lettering or invisible procedural metadata in the browser: actual canvas
 * glyphs are texture-mapped to a stand-up plank in the three-dimensional scene.
 */
export function mountSummitExpeditionPlaques(
  owner: Object3D, expeditionSites: readonly SummitExpeditionSite[],
) {
  const group = new Group();
  group.name = 'main-summit-expedition-plaque-stands';
  owner.add(group);
  const plaques: SummitExpeditionPlaque[] = [];
  const geometries: (BoxGeometry | PlaneGeometry)[] = [];
  const materials: (MeshBasicMaterial | MeshLambertMaterial)[] = [];
  const textures: CanvasTexture[] = [];
  const supports = new BoxGeometry(.17, 2.05, .17);
  const plank = new BoxGeometry(2.7, 1.51, .14);
  const inset = new PlaneGeometry(2.42, 1.31);
  const crest = new BoxGeometry(2.81, .115, .24);
  geometries.push(supports, plank, inset, crest);
  const cedar = new MeshLambertMaterial({ color: '#745142' });
  const brass = new MeshLambertMaterial({ color: '#c29d62' });
  materials.push(cedar, brass);

  const candidates = expeditionSites.filter(site => site.id in authoredCopy);
  const workshop: SummitExpeditionSite = {
    id: 'expedition-cable-machine-room', kind: 'machine-hall',
    east: -21, north: 7, height: 347, yaw: Math.PI / 2,
    trail: { east: 0, north: 7, height: 347 }, distanceToTrail: 21,
  };
  const all = [...candidates, workshop];
  for (const site of all) {
    const lines = authoredCopy[site.id as keyof typeof authoredCopy];
    if (!lines) continue;
    const x = site.kind === 'shelter' ? 3.65 : site.kind === 'icefall' ? 8.2
      : site.kind === 'observatory' ? 8.0 : site.kind === 'machine-hall' ? 3.65 : 5.2;
    const z = site.kind === 'shelter' ? 3.14 : site.kind === 'observatory' ? 4.1
      : site.kind === 'icefall' ? 3.5 : site.kind === 'machine-hall' ? 5.05 : 4.7;
    const east = site.east + x * Math.cos(site.yaw) + z * Math.sin(site.yaw);
    const north = site.north + x * Math.sin(site.yaw) - z * Math.cos(site.yaw);
    const stand = new Group();
    stand.name = site.id + '-plaque';
    stand.position.set(east, site.height, -north);
    stand.rotation.y = site.yaw;
    for (const side of [-1, 1]) {
      const leg = new Mesh(supports, cedar);
      leg.position.set(side * 1.05, 1.06, 0);
      stand.add(leg);
    }
    const timber = new Mesh(plank, cedar);
    timber.name = 'solid-framed-exhibit-board';
    timber.position.set(0, 2.24, 0);
    stand.add(timber);
    const metal = new Mesh(crest, brass);
    metal.position.set(0, 3.08, 0);
    stand.add(metal);
    const texture = createSignTexture(lines);
    if (texture) textures.push(texture);
    const paint = new MeshBasicMaterial({
      color: '#f4e7d5', side: DoubleSide, ...(texture ? { map: texture } : {}),
    });
    materials.push(paint);
    const visibleCopy = new Mesh(inset, paint);
    visibleCopy.name = site.id + '-authored-words';
    visibleCopy.position.set(0, 2.24, .078);
    stand.add(visibleCopy);
    group.add(stand);
    plaques.push({
      id: site.id, heading: lines[0], lines, east, north,
      height: site.height, yaw: site.yaw,
    });
  }
  let disposed = false;
  return {
    group, plaques: plaques as readonly SummitExpeditionPlaque[],
    allCopy: authoredCopy,
    hasRealTextures: textures.length === all.length,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
