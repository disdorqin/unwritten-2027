import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
} from 'three';
import {
  FriendMaterialLibrary,
  applyAssetLod,
  makeEdgedPanelBox,
  makeScaledBox,
  type FriendAssetMeta,
} from './town-friend-materials.js';

/**
 * FR-03: 原创纪念品与展柜 (6 souvenirs + 1 showcase cabinet)
 *
 * Purely local decorative & inspectable props with zero coupling to global
 * collection, save data, or economy systems.
 */

export interface SouvenirEntry {
  meta: FriendAssetMeta;
  build: (libs: FriendMaterialLibrary) => Group;
}

function addPart(
  parent: Group,
  mesh: Mesh,
  x: number,
  y: number,
  z: number,
  lodRole?: 'detail' | 'proxy',
): Mesh {
  mesh.position.set(x, y, z);
  if (lodRole) mesh.userData.lodRole = lodRole;
  parent.add(mesh);
  return mesh;
}

function finalizeSouvenir(
  root: Group,
  meta: FriendAssetMeta,
  proxyBounds: [number, number, number],
  proxyColor: number,
): Group {
  const proxy = makeEdgedPanelBox(
    proxyBounds[0],
    proxyBounds[1],
    proxyBounds[2],
    proxyColor,
    meta.id.length * 61,
    `${meta.id}-lod-proxy`,
  );
  proxy.position.set(0, proxyBounds[1] / 2, 0);
  proxy.userData.lodRole = 'proxy';
  proxy.visible = false;
  root.add(proxy);

  root.userData.assetId = meta.id;
  root.userData.meta = meta;
  root.userData.setLod = (level: 'high' | 'low') => applyAssetLod(root, level);
  return root;
}

function makePostcardFaceMaterial(): MeshStandardMaterial {
  if (typeof document === 'undefined') {
    return new MeshStandardMaterial({ color: 0xecdcb8, roughness: 0.72 });
  }
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  // Night sky gradient
  ctx.fillStyle = '#142338';
  ctx.fillRect(0, 0, 96, 64);
  // Snow ground
  ctx.fillStyle = '#dce9f4';
  ctx.fillRect(0, 44, 96, 20);
  // Miniature clocktower silhouette
  ctx.fillStyle = '#4b3326';
  ctx.fillRect(20, 18, 14, 28);
  ctx.fillStyle = '#3b4046';
  ctx.fillRect(18, 12, 18, 6);
  ctx.fillStyle = '#ffcf77';
  ctx.fillRect(24, 22, 6, 6);
  // Tavern warm window
  ctx.fillStyle = '#73492f';
  ctx.fillRect(46, 28, 22, 18);
  ctx.fillStyle = '#ffb84d';
  ctx.fillRect(50, 33, 5, 5);
  ctx.fillRect(59, 33, 5, 5);
  // Stamp & 2027 text
  ctx.fillStyle = '#a83b36';
  ctx.fillRect(76, 6, 13, 15);
  ctx.fillStyle = '#fbe1b0';
  ctx.font = 'bold 9px monospace';
  ctx.fillText('2027', 6, 13);

  const tex = new CanvasTexture(c);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.colorSpace = SRGBColorSpace;
  return new MeshStandardMaterial({ map: tex, roughness: 0.7 });
}

export const FR03_SHOWCASE_META: FriendAssetMeta = {
  id: 'fr03-showcase-cabinet',
  name: '双层木石纪念展柜',
  pack: 'FR-03',
  category: '陈列展柜',
  dimensions: [1.9, 1.86, 0.62],
  colliders: [{ center: [0, 0.93, 0], size: [1.9, 1.86, 0.62], solid: true, label: 'showcase-cabinet' }],
  lod: { nearDistance: 14, farDistance: 36, cullDistance: 64, instancingReady: false },
  clearanceNote: '双层开放陈列格，背板封实、正面留 0.9m 观赏空间',
  license: 'Original-Procedural-MIT',
};

export function buildShowcaseCabinet(libs: FriendMaterialLibrary): Group {
  const g = new Group();
  const dark = libs.get('wood_dark');
  const warm = libs.get('wood_warm');
  const stone = libs.get('stone_block');
  const glow = libs.get('glow_amber');
  const glass = libs.get('glass_frosted');

  // Stone plinth + lower storage base
  addPart(g, makeScaledBox(1.9, 0.14, 0.62, stone, 'plinth'), 0, 0.07, 0);
  addPart(g, makeEdgedPanelBox(1.82, 0.56, 0.56, 0x4b3326, 300, 'base-chest'), 0, 0.42, 0);

  // Upper display frame (sides, back, crown, middle shelf)
  addPart(g, makeScaledBox(0.08, 1.12, 0.54, dark, 'side-l'), -0.87, 1.26, 0);
  addPart(g, makeScaledBox(0.08, 1.12, 0.54, dark, 'side-r'), 0.87, 1.26, 0);
  addPart(g, makeScaledBox(1.76, 1.12, 0.05, warm, 'back-panel'), 0, 1.26, -0.24);
  addPart(g, makeScaledBox(1.9, 0.1, 0.62, dark, 'crown'), 0, 1.81, 0);
  addPart(g, makeScaledBox(1.72, 0.05, 0.5, warm, 'mid-shelf'), 0, 1.22, 0);

  // Warm display light strip + thin glass front trim
  addPart(g, makeScaledBox(1.56, 0.04, 0.06, glow, 'top-light-bar'), 0, 1.74, 0.12, 'detail');
  addPart(g, makeScaledBox(1.66, 0.98, 0.02, glass, 'front-glass'), 0, 1.24, 0.25, 'detail');

  return finalizeSouvenir(g, FR03_SHOWCASE_META, [1.9, 1.86, 0.62], 0x4b3326);
}

export const FR03_SOUVENIRS_CATALOG: readonly SouvenirEntry[] = [
  // 1. 雪夜未写镇明信片
  {
    meta: {
      id: 'fr03-postcard',
      name: '雪夜未写镇明信片',
      pack: 'FR-03',
      category: '纸品纪念',
      dimensions: [0.34, 0.26, 0.12],
      colliders: [{ center: [0, 0.13, 0], size: [0.34, 0.26, 0.12], solid: false, label: 'postcard' }],
      lod: { nearDistance: 8, farDistance: 20, cullDistance: 36, instancingReady: false },
      clearanceNote: '桌面/展柜小摆件（solid: false），支持近景旋转查看',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const paper = libs.get('paper_warm');

      // Small wooden easel stand
      addPart(g, makeScaledBox(0.24, 0.03, 0.12, dark, 'stand-base'), 0, 0.015, 0);
      addPart(g, makeScaledBox(0.05, 0.22, 0.04, dark, 'stand-back'), 0, 0.12, -0.04);
      // Card backing + illustrated front
      addPart(g, makeScaledBox(0.32, 0.22, 0.02, paper, 'card-back'), 0, 0.14, 0);
      const art = new Mesh(new BoxGeometry(0.3, 0.2, 0.01), makePostcardFaceMaterial());
      art.name = 'postcard-art';
      addPart(g, art, 0, 0.14, 0.012);

      return finalizeSouvenir(g, this.meta, [0.34, 0.26, 0.12], 0xecdcb8);
    },
  },

  // 2. 2027 跨年纪念章
  {
    meta: {
      id: 'fr03-badge',
      name: '2027 跨年纪念章',
      pack: 'FR-03',
      category: '徽章纪念',
      dimensions: [0.24, 0.28, 0.12],
      colliders: [{ center: [0, 0.14, 0], size: [0.24, 0.28, 0.12], solid: false, label: 'badge' }],
      lod: { nearDistance: 8, farDistance: 20, cullDistance: 36, instancingReady: false },
      clearanceNote: '带红绸缎与铜星浮雕的立式徽章',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const brass = libs.get('brass');
      const red = libs.get('cloth_red');
      const glow = libs.get('glow_amber');

      addPart(g, makeScaledBox(0.18, 0.04, 0.12, dark, 'stand'), 0, 0.02, 0);
      addPart(g, makeScaledBox(0.22, 0.22, 0.04, brass, 'medal-disc'), 0, 0.15, 0);
      addPart(g, makeScaledBox(0.14, 0.14, 0.055, glow, 'star-emblem'), 0, 0.15, 0, 'detail');
      addPart(g, makeScaledBox(0.08, 0.1, 0.05, red, 'ribbon'), 0, 0.24, -0.01, 'detail');

      return finalizeSouvenir(g, this.meta, [0.24, 0.28, 0.12], 0xc99c4e);
    },
  },

  // 3. 微缩钟楼模型
  {
    meta: {
      id: 'fr03-mini-clocktower',
      name: '微缩钟楼模型',
      pack: 'FR-03',
      category: '微缩建筑',
      dimensions: [0.3, 0.56, 0.3],
      colliders: [{ center: [0, 0.28, 0], size: [0.3, 0.56, 0.3], solid: false, label: 'mini-clocktower' }],
      lod: { nearDistance: 10, farDistance: 24, cullDistance: 42, instancingReady: false },
      clearanceNote: '复刻广场钟楼三段轮廓与四面钟盘',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const dark = libs.get('wood_dark');
      const slate = libs.get('roof_slate');
      const glow = libs.get('glow_amber');
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(0.28, 0.1, 0.28, stone, 'tower-base'), 0, 0.05, 0);
      addPart(g, makeScaledBox(0.2, 0.22, 0.2, dark, 'tower-shaft'), 0, 0.21, 0);
      addPart(g, makeScaledBox(0.22, 0.12, 0.22, dark, 'belfry'), 0, 0.38, 0);
      // Clock faces front & back + sides
      addPart(g, makeScaledBox(0.12, 0.1, 0.23, glow, 'clock-face-z'), 0, 0.38, 0, 'detail');
      addPart(g, makeScaledBox(0.23, 0.1, 0.12, glow, 'clock-face-x'), 0, 0.38, 0, 'detail');
      // Stepped spire + snow
      addPart(g, makeScaledBox(0.24, 0.06, 0.24, slate, 'spire-1'), 0, 0.47, 0);
      addPart(g, makeScaledBox(0.14, 0.06, 0.14, slate, 'spire-2'), 0, 0.52, 0, 'detail');
      addPart(g, makeScaledBox(0.08, 0.04, 0.08, snow, 'spire-snow'), 0, 0.56, 0, 'detail');

      return finalizeSouvenir(g, this.meta, [0.3, 0.56, 0.3], 0x4b3326);
    },
  },

  // 4. 微缩未写酒馆
  {
    meta: {
      id: 'fr03-mini-tavern',
      name: '微缩未写酒馆',
      pack: 'FR-03',
      category: '微缩建筑',
      dimensions: [0.42, 0.38, 0.34],
      colliders: [{ center: [0, 0.19, 0], size: [0.42, 0.38, 0.34], solid: false, label: 'mini-tavern' }],
      lod: { nearDistance: 10, farDistance: 24, cullDistance: 42, instancingReady: false },
      clearanceNote: '复刻酒馆双层木构、灰瓦坡顶与暖窗灯笼',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('cobble');
      const warm = libs.get('wood_warm');
      const dark = libs.get('wood_dark');
      const slate = libs.get('roof_slate');
      const snow = libs.get('snow');
      const glow = libs.get('glow_amber');
      const red = libs.get('cloth_red');

      addPart(g, makeScaledBox(0.4, 0.05, 0.32, stone, 'plinth'), 0, 0.025, 0);
      addPart(g, makeScaledBox(0.36, 0.18, 0.28, warm, 'tavern-body'), 0, 0.14, 0);
      addPart(g, makeScaledBox(0.38, 0.03, 0.3, dark, 'mid-beam'), 0, 0.15, 0, 'detail');
      // Pitched stepped slate roof + snow
      addPart(g, makeScaledBox(0.42, 0.06, 0.34, slate, 'roof-lower'), 0, 0.26, 0);
      addPart(g, makeScaledBox(0.34, 0.06, 0.24, slate, 'roof-upper'), 0, 0.32, 0);
      addPart(g, makeScaledBox(0.36, 0.03, 0.26, snow, 'roof-snow'), 0, 0.36, 0, 'detail');
      // Warm windows & tiny red sign lantern
      addPart(g, makeScaledBox(0.08, 0.06, 0.29, glow, 'win-pair'), -0.07, 0.11, 0, 'detail');
      addPart(g, makeScaledBox(0.08, 0.06, 0.29, glow, 'win-pair-2'), 0.07, 0.11, 0, 'detail');
      addPart(g, makeScaledBox(0.04, 0.06, 0.04, red, 'mini-lantern'), 0.2, 0.19, 0.14, 'detail');

      return finalizeSouvenir(g, this.meta, [0.42, 0.38, 0.34], 0x8f5b38);
    },
  },

  // 5. 微缩雪夜风灯
  {
    meta: {
      id: 'fr03-mini-lantern',
      name: '微缩雪夜风灯',
      pack: 'FR-03',
      category: '微缩摆件',
      dimensions: [0.18, 0.32, 0.18],
      colliders: [{ center: [0, 0.16, 0], size: [0.18, 0.32, 0.18], solid: false, label: 'mini-lantern' }],
      lod: { nearDistance: 8, farDistance: 20, cullDistance: 36, instancingReady: false },
      clearanceNote: '桌面微缩暖光提灯摆件',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const iron = libs.get('iron');
      const glow = libs.get('glow_amber');
      const red = libs.get('cloth_red');

      addPart(g, makeScaledBox(0.16, 0.04, 0.16, dark, 'base'), 0, 0.02, 0);
      addPart(g, makeScaledBox(0.12, 0.18, 0.12, glow, 'core'), 0, 0.14, 0);
      addPart(g, makeScaledBox(0.15, 0.04, 0.15, red, 'top-cap'), 0, 0.25, 0, 'detail');
      addPart(g, makeScaledBox(0.06, 0.05, 0.04, iron, 'ring'), 0, 0.295, 0, 'detail');

      return finalizeSouvenir(g, this.meta, [0.18, 0.32, 0.18], 0xffcf77);
    },
  },

  // 6. 星尘许愿罐
  {
    meta: {
      id: 'fr03-stardust-jar',
      name: '星尘许愿罐',
      pack: 'FR-03',
      category: '微缩摆件',
      dimensions: [0.18, 0.26, 0.18],
      colliders: [{ center: [0, 0.13, 0], size: [0.18, 0.26, 0.18], solid: false, label: 'stardust-jar' }],
      lod: { nearDistance: 8, farDistance: 20, cullDistance: 36, instancingReady: false },
      clearanceNote: '纯装饰性微缩星尘罐，不接入背包或燃料逻辑',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const glass = libs.get('glass_frosted');
      const glow = libs.get('glow_amber');
      const warm = libs.get('wood_warm');

      addPart(g, makeScaledBox(0.16, 0.2, 0.16, glass, 'jar-glass'), 0, 0.1, 0);
      addPart(g, makeScaledBox(0.1, 0.12, 0.1, glow, 'stardust-core'), 0, 0.09, 0);
      addPart(g, makeScaledBox(0.11, 0.05, 0.11, warm, 'cork'), 0, 0.225, 0, 'detail');

      return finalizeSouvenir(g, this.meta, [0.18, 0.26, 0.18], 0xa7cde0);
    },
  },
];
