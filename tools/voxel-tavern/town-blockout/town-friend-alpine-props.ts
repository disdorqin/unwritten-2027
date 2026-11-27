import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
} from 'three';
import {
  FriendMaterialLibrary,
  applyAssetLod,
  makeEdgedPanelBox,
  makeScaledBox,
  type FriendAssetMeta,
} from './town-friend-materials.js';

/**
 * FR-12: 高山旅行与缆车陈设库 (8 classes)
 *
 * Weathered & snow-capped alpine props for mountain trails and cableway
 * platforms: backpacks, ski-pole racks, trail wayposts, snowcap railings,
 * cable repair boxes, thermos benches, wind-sock masts, and ice-cleat bins.
 * Does not build D/D2 routes, stations, or world authority.
 */

export interface AlpinePropEntry {
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

function finalizeAlpineProp(
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
    meta.id.length * 79 + 31,
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

export const FR12_ALPINE_PROPS_CATALOG: readonly AlpinePropEntry[] = [
  // 1. 登山帆布背包 (Alpine Expedition Backpack)
  {
    meta: {
      id: 'fr12-alpine-backpack',
      name: '登山帆布背包',
      pack: 'FR-12',
      category: '旅行装备',
      dimensions: [0.54, 0.72, 0.42],
      colliders: [{ center: [0, 0.36, 0], size: [0.5, 0.7, 0.38], solid: false, label: 'backpack-soft' }],
      lod: { nearDistance: 12, farDistance: 32, cullDistance: 60, instancingReady: true },
      clearanceNote: '摆放在长凳/墙角旁，solid=false 避免窄栈道卡脚',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const blue = libs.get('alpine_blue');
      const leather = libs.get('leather_brown');
      const hemp = libs.get('rope_hemp');
      const iron = libs.get('iron');
      const brass = libs.get('brass');
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(0.46, 0.52, 0.3, blue, 'pack-body'), 0, 0.26, 0);
      addPart(g, makeScaledBox(0.48, 0.14, 0.32, blue, 'pack-flap'), 0, 0.56, 0.01);
      // Bedroll tied on top
      addPart(g, makeScaledBox(0.42, 0.14, 0.14, hemp, 'bedroll'), 0, 0.66, -0.04, 'detail');
      // Leather straps & brass buckles
      addPart(g, makeScaledBox(0.06, 0.42, 0.04, leather, 'strap-l'), -0.14, 0.34, 0.16, 'detail');
      addPart(g, makeScaledBox(0.06, 0.42, 0.04, leather, 'strap-r'), 0.14, 0.34, 0.16, 'detail');
      addPart(g, makeScaledBox(0.08, 0.06, 0.05, brass, 'buckle-l'), -0.14, 0.28, 0.17, 'detail');
      addPart(g, makeScaledBox(0.08, 0.06, 0.05, brass, 'buckle-r'), 0.14, 0.28, 0.17, 'detail');
      // Aluminum frame & side pockets
      addPart(g, makeScaledBox(0.38, 0.58, 0.04, iron, 'back-frame'), 0, 0.3, -0.17, 'detail');
      addPart(g, makeScaledBox(0.08, 0.26, 0.18, leather, 'pocket-l'), -0.26, 0.24, 0, 'detail');
      addPart(g, makeScaledBox(0.08, 0.26, 0.18, leather, 'pocket-r'), 0.26, 0.24, 0, 'detail');
      // Light snow dusting on top
      addPart(g, makeScaledBox(0.38, 0.04, 0.14, snow, 'snow-cap'), 0, 0.72, -0.03, 'detail');

      return finalizeAlpineProp(g, this.meta, [0.48, 0.7, 0.36], 0x386a92);
    },
  },

  // 2. 雪杖与雪板立架 (Ski & Pole Rack)
  {
    meta: {
      id: 'fr12-ski-poles-rack',
      name: '雪杖与雪板立架',
      pack: 'FR-12',
      category: '雪具陈设',
      dimensions: [1.08, 1.56, 0.52],
      colliders: [{ center: [0, 0.76, 0], size: [1.02, 1.52, 0.46], solid: true, label: 'ski-rack' }],
      lod: { nearDistance: 14, farDistance: 38, cullDistance: 72, instancingReady: true },
      clearanceNote: '靠站台棚柱摆设，底座 0.46m 深',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');
      const red = libs.get('cloth_red');
      const blue = libs.get('alpine_blue');
      const iron = libs.get('iron');
      const snow = libs.get('snow');

      // Timber rack base + cross rail
      addPart(g, makeScaledBox(1.04, 0.1, 0.48, dark, 'rack-base'), 0, 0.05, 0);
      addPart(g, makeScaledBox(0.08, 0.92, 0.1, dark, 'post-l'), -0.46, 0.56, -0.14);
      addPart(g, makeScaledBox(0.08, 0.92, 0.1, dark, 'post-r'), 0.46, 0.56, -0.14);
      addPart(g, makeScaledBox(1.0, 0.08, 0.1, warm, 'top-rail'), 0, 0.96, -0.14);

      // Pair of wooden skis
      addPart(g, makeScaledBox(0.12, 1.48, 0.04, red, 'ski-l'), -0.26, 0.79, 0.02);
      addPart(g, makeScaledBox(0.12, 1.48, 0.04, red, 'ski-r'), -0.1, 0.79, 0.02);
      // Pair of ski poles + snow baskets
      for (const px of [0.16, 0.32]) {
        addPart(g, makeScaledBox(0.04, 1.32, 0.04, iron, 'pole-shaft'), px, 0.72, 0.04, 'detail');
        addPart(g, makeScaledBox(0.06, 0.14, 0.06, blue, 'pole-grip'), px, 1.36, 0.04, 'detail');
        addPart(g, makeScaledBox(0.12, 0.03, 0.12, iron, 'pole-basket'), px, 0.16, 0.04, 'detail');
      }
      addPart(g, makeScaledBox(0.96, 0.04, 0.1, snow, 'rail-snow'), 0, 1.02, -0.14, 'detail');

      return finalizeAlpineProp(g, this.meta, [1.04, 1.5, 0.46], 0x8f5b38);
    },
  },

  // 3. 风化高山路标柱 (Weathered Alpine Waypost)
  {
    meta: {
      id: 'fr12-trail-waypost',
      name: '风化高山路标柱',
      pack: 'FR-12',
      category: '路径导览',
      dimensions: [0.98, 2.28, 0.48],
      colliders: [{ center: [0, 1.12, 0], size: [0.44, 2.24, 0.44], solid: true, label: 'waypost-cairn' }],
      lod: { nearDistance: 16, farDistance: 46, cullDistance: 88, instancingReady: true },
      clearanceNote: '指示牌底缘 ≥1.68m，石堆基座直径 0.44m',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const dark = libs.get('wood_dark');
      const blue = libs.get('alpine_blue');
      const yellow = libs.get('safety_yellow');
      const snow = libs.get('snow');

      // Cairn stone base
      addPart(g, makeScaledBox(0.46, 0.22, 0.46, stone, 'cairn-low'), 0, 0.11, 0);
      addPart(g, makeScaledBox(0.34, 0.18, 0.34, stone, 'cairn-top'), 0, 0.31, 0);
      addPart(g, makeScaledBox(0.14, 1.88, 0.14, dark, 'waypost-pole'), 0, 1.24, 0);
      // Directional blades
      addPart(g, makeScaledBox(0.82, 0.2, 0.06, yellow, 'blade-yellow'), 0.14, 1.98, 0.07);
      addPart(g, makeScaledBox(0.76, 0.18, 0.06, blue, 'blade-blue'), -0.12, 1.72, -0.07);
      // Wind-packed snow cap
      addPart(g, makeScaledBox(0.24, 0.08, 0.24, snow, 'pole-snow'), 0, 2.22, 0, 'detail');
      addPart(g, makeScaledBox(0.78, 0.05, 0.07, snow, 'blade-snow'), 0.14, 2.1, 0.07, 'detail');

      return finalizeAlpineProp(g, this.meta, [0.46, 2.24, 0.46], 0x4b3326);
    },
  },

  // 4. 雪帽站台栏杆段 (Snow-Capped Platform Railing)
  {
    meta: {
      id: 'fr12-snowcap-railing',
      name: '雪帽站台栏杆段',
      pack: 'FR-12',
      category: '站台围护',
      dimensions: [2.0, 1.16, 0.32],
      colliders: [{ center: [0, 0.56, 0], size: [1.96, 1.12, 0.28], solid: true, label: 'snowcap-railing' }],
      lod: { nearDistance: 16, farDistance: 48, cullDistance: 92, instancingReady: true },
      clearanceNote: '标准 2.0m 模数栏杆，高 1.16m，可连续拼接围护站台边沿',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');
      const iron = libs.get('iron');
      const snow = libs.get('snow');

      // Stone plinth posts
      for (const px of [-0.9, 0.9]) {
        addPart(g, makeScaledBox(0.24, 0.28, 0.26, stone, 'post-base'), px, 0.14, 0);
        addPart(g, makeScaledBox(0.16, 0.78, 0.16, dark, 'post-shaft'), px, 0.67, 0);
        addPart(g, makeScaledBox(0.2, 0.06, 0.2, iron, 'post-collar'), px, 0.98, 0, 'detail');
      }
      // Horizontal rails + balusters
      addPart(g, makeScaledBox(1.96, 0.1, 0.14, warm, 'top-rail'), 0, 1.04, 0);
      addPart(g, makeScaledBox(1.84, 0.08, 0.1, warm, 'mid-rail'), 0, 0.56, 0);
      for (const bx of [-0.45, 0, 0.45]) {
        addPart(g, makeScaledBox(0.08, 0.74, 0.08, dark, 'baluster'), bx, 0.62, 0, 'detail');
      }
      // Thick alpine snow cap along top rail
      addPart(g, makeScaledBox(1.94, 0.09, 0.16, snow, 'top-snow'), 0, 1.13, 0, 'detail');

      return finalizeAlpineProp(g, this.meta, [1.96, 1.14, 0.26], 0xeef5fb);
    },
  },

  // 5. 缆车维保应急箱 (Cableway Maintenance Box)
  {
    meta: {
      id: 'fr12-cable-repair-box',
      name: '缆车维保应急箱',
      pack: 'FR-12',
      category: '站台维护',
      dimensions: [0.86, 0.62, 0.54],
      colliders: [{ center: [0, 0.31, 0], size: [0.82, 0.6, 0.5], solid: true, label: 'cable-repair-box' }],
      lod: { nearDistance: 14, farDistance: 38, cullDistance: 72, instancingReady: true },
      clearanceNote: '站台角落独立维修箱，含备用小滑轮，不占用缆车通行净宽',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const blue = libs.get('alpine_blue');
      const iron = libs.get('iron');
      const yellow = libs.get('safety_yellow');
      const brass = libs.get('brass');
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(0.82, 0.08, 0.5, iron, 'box-skid'), 0, 0.04, 0);
      addPart(g, makeScaledBox(0.8, 0.4, 0.48, blue, 'box-hull'), 0, 0.28, 0);
      addPart(g, makeScaledBox(0.82, 0.08, 0.5, iron, 'box-lid'), 0, 0.52, 0);
      addPart(g, makeScaledBox(0.74, 0.08, 0.04, yellow, 'stripe-front'), 0, 0.34, 0.25, 'detail');
      addPart(g, makeScaledBox(0.1, 0.08, 0.05, brass, 'latch'), 0, 0.48, 0.26, 'detail');
      // Spare sheave wheel resting on top
      addPart(g, makeScaledBox(0.22, 0.06, 0.22, iron, 'spare-pulley'), -0.18, 0.59, 0, 'detail');
      addPart(g, makeScaledBox(0.36, 0.04, 0.24, snow, 'lid-snow'), 0.18, 0.58, -0.06, 'detail');

      return finalizeAlpineProp(g, this.meta, [0.82, 0.58, 0.5], 0x386a92);
    },
  },

  // 6. 保温壶与歇脚长凳 (Thermos & Alpine Rest Bench)
  {
    meta: {
      id: 'fr12-thermos-bench',
      name: '保温壶与歇脚长凳',
      pack: 'FR-12',
      category: '候车休憩',
      dimensions: [1.32, 0.78, 0.48],
      colliders: [{ center: [0, 0.28, 0], size: [1.28, 0.54, 0.44], solid: true, label: 'thermos-bench' }],
      lod: { nearDistance: 14, farDistance: 38, cullDistance: 70, instancingReady: true },
      clearanceNote: '座面高 0.46m，可贴站台墙边摆设',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const plank = libs.get('wood_plank');
      const red = libs.get('cloth_red');
      const iron = libs.get('iron');
      const snow = libs.get('snow');

      // Legs & seat planks
      addPart(g, makeScaledBox(0.12, 0.4, 0.4, dark, 'leg-l'), -0.52, 0.2, 0);
      addPart(g, makeScaledBox(0.12, 0.4, 0.4, dark, 'leg-r'), 0.52, 0.2, 0);
      addPart(g, makeScaledBox(1.28, 0.07, 0.44, plank, 'seat-plank'), 0, 0.43, 0);
      // Red insulated thermos flask + steel mug
      addPart(g, makeScaledBox(0.14, 0.28, 0.14, red, 'thermos-body'), 0.36, 0.6, 0.04, 'detail');
      addPart(g, makeScaledBox(0.12, 0.07, 0.12, iron, 'thermos-cap'), 0.36, 0.76, 0.04, 'detail');
      addPart(g, makeScaledBox(0.1, 0.1, 0.1, iron, 'camp-mug'), 0.18, 0.51, 0.06, 'detail');
      // Snow patch on left corner of bench
      addPart(g, makeScaledBox(0.38, 0.04, 0.32, snow, 'bench-snow'), -0.4, 0.48, -0.02, 'detail');

      return finalizeAlpineProp(g, this.meta, [1.28, 0.52, 0.44], 0xa66e44);
    },
  },

  // 7. 高山风向标短杆 (Alpine Windsock Mast)
  {
    meta: {
      id: 'fr12-wind-sock-mast',
      name: '高山风向标短杆',
      pack: 'FR-12',
      category: '气象标识',
      dimensions: [0.76, 2.38, 0.44],
      colliders: [{ center: [0, 1.18, 0], size: [0.36, 2.34, 0.36], solid: true, label: 'windsock-mast' }],
      lod: { nearDistance: 18, farDistance: 52, cullDistance: 96, instancingReady: true },
      clearanceNote: '风向袋高度 ≥1.95m，下方仅占 0.36m 石座',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const iron = libs.get('iron');
      const red = libs.get('cloth_red');
      const snow = libs.get('snow');
      const brass = libs.get('brass');

      addPart(g, makeScaledBox(0.38, 0.22, 0.38, stone, 'mast-base'), 0, 0.11, 0);
      addPart(g, makeScaledBox(0.08, 2.12, 0.08, iron, 'mast-pole'), -0.14, 1.24, 0);
      addPart(g, makeScaledBox(0.24, 0.05, 0.05, brass, 'boom-arm'), 0, 2.16, 0, 'detail');
      // Segmented red & white windsock
      addPart(g, makeScaledBox(0.2, 0.18, 0.18, red, 'sock-1'), 0.18, 2.12, 0);
      addPart(g, makeScaledBox(0.18, 0.15, 0.15, snow, 'sock-2'), 0.36, 2.1, 0);
      addPart(g, makeScaledBox(0.16, 0.12, 0.12, red, 'sock-3'), 0.52, 2.08, 0, 'detail');

      return finalizeAlpineProp(g, this.meta, [0.38, 2.34, 0.38], 0xa83b36);
    },
  },

  // 8. 防滑冰爪与融雪盐箱 (Ice Cleat & Salt Bin)
  {
    meta: {
      id: 'fr12-ice-cleat-bin',
      name: '防滑冰爪与融雪盐箱',
      pack: 'FR-12',
      category: '防滑保障',
      dimensions: [0.92, 0.78, 0.62],
      colliders: [{ center: [0, 0.38, 0], size: [0.88, 0.76, 0.58], solid: true, label: 'salt-cleat-bin' }],
      lod: { nearDistance: 14, farDistance: 38, cullDistance: 72, instancingReady: true },
      clearanceNote: '斜顶防雪箱 0.78m 高，可摆在栈道/缆车台阶入口旁',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const plank = libs.get('wood_plank');
      const yellow = libs.get('safety_yellow');
      const iron = libs.get('iron');
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(0.88, 0.56, 0.54, plank, 'bin-body'), 0, 0.28, 0);
      addPart(g, makeScaledBox(0.92, 0.1, 0.58, yellow, 'bin-lid'), 0, 0.6, 0);
      addPart(g, makeScaledBox(0.86, 0.06, 0.5, snow, 'lid-snow'), 0, 0.68, -0.02, 'detail');
      // Snow shovel leaning on side + crampon cleats on front ledge
      addPart(g, makeScaledBox(0.06, 0.68, 0.06, dark, 'shovel-handle'), 0.48, 0.38, 0.12, 'detail');
      addPart(g, makeScaledBox(0.2, 0.22, 0.04, iron, 'shovel-blade'), 0.48, 0.12, 0.12, 'detail');
      addPart(g, makeScaledBox(0.18, 0.06, 0.14, iron, 'cleat-pair'), -0.2, 0.67, 0.14, 'detail');

      return finalizeAlpineProp(g, this.meta, [0.88, 0.72, 0.56], 0xd8a334);
    },
  },
];

/**
 * Instanced proxy helper for distant alpine props along mountain ridges.
 */
export function buildInstancedAlpineProxies(
  positions: ReadonlyArray<[number, number, number]>,
  color = 0x9cb3c9,
): InstancedMesh {
  const geo = new BoxGeometry(0.66, 0.96, 0.44);
  const mat = new FriendMaterialLibrary().get('stone_block');
  mat.color.setHex(color);
  mat.userData.friendSharedMaterial = false;
  const inst = new InstancedMesh(geo, mat, positions.length);
  inst.name = 'fr12-instanced-proxies';
  const m = new Matrix4();
  positions.forEach(([x, y, z], i) => {
    m.makeTranslation(x, y + 0.48, z);
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}
