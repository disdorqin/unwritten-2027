import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three';
import { addOpaqueMuseumLabels, type OpaqueMuseumLabel } from './museum-label-atlas';

export const marketBannerCopy = {
  '吃食（烤肠/炸串）': ['热乎吃食', '刚出炉 · 趁热吃'],
  '糖葫芦': ['冰糖葫芦', '酸甜裹糖稀'],
  '热饮（姜茶/热汤）': ['热汤姜茶', '喝一碗 · 暖手暖心'],
  '灯笼': ['手工灯笼', '红灯高挂 · 喜庆过年'],
  '杂货': ['南北杂货', '缺啥少啥 · 这儿都有'],
  '布匹/围巾': ['布匹围巾', '新到花布 · 软和保暖'],
  '干果炒货': ['炒货干果', '现炒现卖 · 嗑着过年'],
  '玩具/套圈': ['套圈玩具', '套中啥 · 拿啥走'],
  '春联年画': ['春联年画', '现写现卖 · 福字到家'],
} as const;

type StallKind = keyof typeof marketBannerCopy;
export type MarketStallLayout = readonly [x: number, z: number, width: number, color: string, kind?: string];

const bannerWidth = 1;
const bannerHeight = 1.14;
const canvasWidth = 512;

function createBannerCanvas([title, subtitle]: readonly [string, string]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = Math.round(canvasWidth * bannerHeight / bannerWidth);
  const ink = canvas.getContext('2d')!;
  const gradient = ink.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#742725');
  gradient.addColorStop(.4, '#a13b31');
  gradient.addColorStop(1, '#752925');
  ink.fillStyle = gradient;
  ink.fillRect(0, 0, canvas.width, canvas.height);
  ink.strokeStyle = '#d9944f';
  ink.lineWidth = 5;
  ink.strokeRect(17, 21, 478, canvas.height - 42);
  ink.fillStyle = '#ffdc8d';
  ink.fillRect(0, 0, canvas.width, 14);
  ink.fillRect(0, canvas.height - 13, canvas.width, 13);
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  ink.font = '700 93px "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
  Array.from(title).forEach((glyph, index) => ink.fillText(glyph, canvas.width / 2, 86 + index * 112));
  ink.fillRect(67, 484, 378, 3);
  ink.font = '700 41px "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
  ink.fillText(subtitle, canvas.width / 2, 526, canvas.width - 66);
  return canvas;
}

export function addMarketStallBanners(
  parent: Group, stalls: readonly MarketStallLayout[], entrance: Mesh<PlaneGeometry, MeshStandardMaterial>,
) {
  const previousMap = entrance.material.map;
  const source = previousMap?.image as HTMLCanvasElement | undefined;
  if (!source || typeof document === 'undefined') {
    parent.add(entrance);
    return;
  }

  const tiles = new Map<StallKind, HTMLCanvasElement>();
  const labels: OpaqueMuseumLabel[] = [];
  for (const [x, z, width, , kind] of stalls) {
    if (kind === undefined || !Object.hasOwn(marketBannerCopy, kind)) continue;
    const key = kind as StallKind;
    let tile = tiles.get(key);
    if (!tile) {
      tile = createBannerCanvas(marketBannerCopy[key]);
      tiles.set(key, tile);
    }
    // The pennant lies on the front face of the existing right-hand post.
    labels.push({ source: tile, parent, x: x + width / 2 - .2, y: 2.18, z: z + 2.32,
      width: bannerWidth, height: bannerHeight, yaw: 0 });
  }
  if (!labels.length) {
    parent.add(entrance);
    return;
  }

  const { width, height } = entrance.geometry.parameters;
  labels.push({ source, parent, x: entrance.position.x, y: entrance.position.y,
    z: entrance.position.z, width, height, yaw: entrance.rotation.y });
  // Both heights use the atlas's small-label batch. All nine tiles and the entry sign fit on one page.
  const batches: Mesh[] = [];
  addOpaqueMuseumLabels(labels, batches);
  for (const batch of batches) {
    const atlasMaterial = batch.material as MeshBasicMaterial;
    const material = entrance.material.clone();
    material.map = atlasMaterial.map;
    material.emissiveMap = atlasMaterial.map;
    batch.material = material;
    atlasMaterial.dispose();
  }

  // The old entry surface and its texture are replaced by the shared batch.
  entrance.geometry.dispose();
  entrance.material.dispose();
  previousMap?.dispose();
}
