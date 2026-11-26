import { Group, Mesh } from 'three';
import {
  FriendMaterialLibrary,
  applyAssetLod,
  makeEdgedPanelBox,
  makeScaledBox,
  type FriendAssetMeta,
} from './town-friend-materials.js';

/**
 * FR-01: 木石生活构件库 (12 classes)
 *
 * All assets are built at 1 unit = 1 metre human scale (door 2.1m, table 0.76m,
 * chair seat 0.45m), sharing FriendMaterialLibrary textures, simplified AABB
 * colliders, and high/low LOD roles. Zero modifications to existing town buildings.
 */

export interface WoodStoneAssetEntry {
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

function finalizeAsset(root: Group, meta: FriendAssetMeta, proxyBounds: [number, number, number], proxyColor: number): Group {
  // Add a simplified low-LOD proxy box so distant scenes can switch cleanly
  const proxy = makeEdgedPanelBox(proxyBounds[0], proxyBounds[1], proxyBounds[2], proxyColor, meta.id.length * 97, `${meta.id}-lod-proxy`);
  proxy.position.set(0, proxyBounds[1] / 2, 0);
  proxy.userData.lodRole = 'proxy';
  proxy.visible = false;
  root.add(proxy);

  root.userData.assetId = meta.id;
  root.userData.meta = meta;
  root.userData.setLod = (level: 'high' | 'low') => applyAssetLod(root, level);
  return root;
}

export const FR01_WOOD_STONE_CATALOG: readonly WoodStoneAssetEntry[] = [
  // 1. 木格窗框 (Lattice Window)
  {
    meta: {
      id: 'fr01-lattice-window',
      name: '木格窗框',
      pack: 'FR-01',
      category: '建筑构件',
      dimensions: [1.3, 1.45, 0.24],
      colliders: [{ center: [0, 0.725, 0], size: [1.3, 1.45, 0.24], solid: true, label: 'window-frame' }],
      lod: { nearDistance: 14, farDistance: 36, cullDistance: 64, instancingReady: true },
      clearanceNote: '嵌墙安装，窗台外挑 0.08m',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');
      const paper = libs.get('paper_warm');
      const snow = libs.get('snow');

      // Outer frame (left, right, top, bottom sill)
      addPart(g, makeScaledBox(0.11, 1.36, 0.16, dark, 'frame-l'), -0.54, 0.74, 0);
      addPart(g, makeScaledBox(0.11, 1.36, 0.16, dark, 'frame-r'), 0.54, 0.74, 0);
      addPart(g, makeScaledBox(1.24, 0.12, 0.18, dark, 'frame-top'), 0, 1.38, 0);
      addPart(g, makeScaledBox(1.3, 0.1, 0.24, warm, 'window-sill'), 0, 0.08, 0.02);

      // Warm translucent paper pane (double-sided visible front & back)
      addPart(g, makeScaledBox(0.98, 1.18, 0.03, paper, 'paper-pane'), 0, 0.73, 0);

      // Inner lattice mullions (detail)
      addPart(g, makeScaledBox(0.04, 1.18, 0.06, warm, 'mullion-v1'), -0.18, 0.73, 0, 'detail');
      addPart(g, makeScaledBox(0.04, 1.18, 0.06, warm, 'mullion-v2'), 0.18, 0.73, 0, 'detail');
      addPart(g, makeScaledBox(0.98, 0.04, 0.06, warm, 'mullion-h1'), 0, 0.52, 0, 'detail');
      addPart(g, makeScaledBox(0.98, 0.04, 0.06, warm, 'mullion-h2'), 0, 0.94, 0, 'detail');
      // Snow cap on sill
      addPart(g, makeScaledBox(1.22, 0.04, 0.14, snow, 'sill-snow'), 0, 0.15, 0.04, 'detail');

      return finalizeAsset(g, this.meta, [1.3, 1.45, 0.24], 0x4b3326);
    },
  },

  // 2. 厚木门组 (Panel Door)
  {
    meta: {
      id: 'fr01-panel-door',
      name: '厚木门组',
      pack: 'FR-01',
      category: '建筑构件',
      dimensions: [1.24, 2.22, 0.26],
      colliders: [
        { center: [-0.55, 1.11, 0], size: [0.14, 2.22, 0.26], solid: true, label: 'jamb-left' },
        { center: [0.55, 1.11, 0], size: [0.14, 2.22, 0.26], solid: true, label: 'jamb-right' },
        { center: [0, 1.05, 0], size: [0.96, 2.08, 0.08], solid: true, label: 'door-leaf' },
      ],
      lod: { nearDistance: 16, farDistance: 42, cullDistance: 72, instancingReady: true },
      clearanceNote: '净门洞 0.96m × 2.08m，符合角色通行尺度',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const plank = libs.get('wood_plank');
      const iron = libs.get('iron');
      const brass = libs.get('brass');

      // Jambs & lintel
      addPart(g, makeScaledBox(0.14, 2.16, 0.24, dark, 'jamb-l'), -0.55, 1.08, 0);
      addPart(g, makeScaledBox(0.14, 2.16, 0.24, dark, 'jamb-r'), 0.55, 1.08, 0);
      addPart(g, makeScaledBox(1.24, 0.14, 0.26, dark, 'lintel'), 0, 2.15, 0);
      addPart(g, makeScaledBox(1.22, 0.05, 0.26, dark, 'threshold'), 0, 0.025, 0);

      // Door leaf (solid planked core + recessed rails front & back)
      addPart(g, makeEdgedPanelBox(0.96, 2.05, 0.08, 0x9b643b, 202, 'door-leaf'), 0, 1.05, 0);
      addPart(g, makeScaledBox(0.86, 0.1, 0.11, plank, 'cross-brace-top'), 0, 1.72, 0, 'detail');
      addPart(g, makeScaledBox(0.86, 0.1, 0.11, plank, 'cross-brace-bot'), 0, 0.42, 0, 'detail');

      // Iron hinges & brass handles on BOTH sides (front & back inspection)
      for (const y of [0.46, 1.68]) {
        addPart(g, makeScaledBox(0.32, 0.06, 0.12, iron, `hinge-${y}`), -0.3, y, 0, 'detail');
      }
      addPart(g, makeScaledBox(0.06, 0.14, 0.16, brass, 'handle-pair'), 0.34, 1.02, 0, 'detail');

      return finalizeAsset(g, this.meta, [1.24, 2.22, 0.26], 0x8f5b38);
    },
  },

  // 3. 榫卯木梁柱 (Timber Beam & Post)
  {
    meta: {
      id: 'fr01-timber-beam',
      name: '榫卯木梁柱',
      pack: 'FR-01',
      category: '建筑构件',
      dimensions: [2.2, 2.6, 0.36],
      colliders: [
        { center: [-0.9, 1.3, 0], size: [0.24, 2.6, 0.24], solid: true, label: 'post-left' },
        { center: [0.9, 1.3, 0], size: [0.24, 2.6, 0.24], solid: true, label: 'post-right' },
      ],
      lod: { nearDistance: 18, farDistance: 48, cullDistance: 85, instancingReady: true },
      clearanceNote: '柱间净跨 1.56m、梁底净高 2.26m，可直接穿行',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const stone = libs.get('stone_block');
      const iron = libs.get('iron');

      // Stone plinths + vertical posts
      for (const sx of [-0.9, 0.9]) {
        addPart(g, makeScaledBox(0.34, 0.22, 0.34, stone, `plinth-${sx}`), sx, 0.11, 0);
        addPart(g, makeScaledBox(0.22, 2.28, 0.22, dark, `post-${sx}`), sx, 1.36, 0);
        addPart(g, makeScaledBox(0.25, 0.08, 0.25, iron, `collar-${sx}`), sx, 2.22, 0, 'detail');
      }
      // Main tie beam & upper purlin
      addPart(g, makeScaledBox(2.2, 0.22, 0.24, dark, 'main-beam'), 0, 2.46, 0);
      // Angled knee braces (stepped voxel corbels)
      for (const sx of [-1, 1]) {
        addPart(g, makeScaledBox(0.18, 0.16, 0.16, dark, `corbel-1-${sx}`), sx * 0.72, 2.28, 0, 'detail');
        addPart(g, makeScaledBox(0.16, 0.12, 0.14, dark, `corbel-2-${sx}`), sx * 0.56, 2.34, 0, 'detail');
      }

      return finalizeAsset(g, this.meta, [2.2, 2.6, 0.36], 0x4b3326);
    },
  },

  // 4. 方木长桌 (Dining Table)
  {
    meta: {
      id: 'fr01-dining-table',
      name: '方木长桌',
      pack: 'FR-01',
      category: '室内家具',
      dimensions: [1.5, 0.76, 0.86],
      colliders: [{ center: [0, 0.38, 0], size: [1.5, 0.76, 0.86], solid: true, label: 'table-body' }],
      lod: { nearDistance: 12, farDistance: 32, cullDistance: 55, instancingReady: true },
      clearanceNote: '标准餐桌高度 0.76m，四周留 0.7m 抽椅通道',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');

      // Table top (edged clay panel)
      addPart(g, makeEdgedPanelBox(1.5, 0.08, 0.86, 0x9b643b, 404, 'table-top'), 0, 0.72, 0);
      // Apron rails
      addPart(g, makeScaledBox(1.3, 0.08, 0.68, dark, 'apron'), 0, 0.64, 0, 'detail');
      // Four legs
      for (const lx of [-0.62, 0.62]) {
        for (const lz of [-0.32, 0.32]) {
          addPart(g, makeScaledBox(0.09, 0.68, 0.09, dark, `leg-${lx}-${lz}`), lx, 0.34, lz);
        }
      }
      // Lower stretcher beam
      addPart(g, makeScaledBox(1.24, 0.06, 0.07, warm, 'stretcher'), 0, 0.18, 0, 'detail');

      return finalizeAsset(g, this.meta, [1.5, 0.76, 0.86], 0x8f5b38);
    },
  },

  // 5. 高背木椅 (Wooden Chair)
  {
    meta: {
      id: 'fr01-wooden-chair',
      name: '高背木椅',
      pack: 'FR-01',
      category: '室内家具',
      dimensions: [0.5, 0.96, 0.5],
      colliders: [{ center: [0, 0.48, 0], size: [0.5, 0.96, 0.5], solid: true, label: 'chair-body' }],
      lod: { nearDistance: 10, farDistance: 28, cullDistance: 48, instancingReady: true },
      clearanceNote: '座高 0.45m，可与方木长桌成套摆放',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const plank = libs.get('wood_plank');

      // Seat
      addPart(g, makeEdgedPanelBox(0.48, 0.06, 0.46, 0xa26b42, 505, 'seat'), 0, 0.44, 0);
      // Front legs
      addPart(g, makeScaledBox(0.06, 0.42, 0.06, dark, 'leg-fl'), -0.19, 0.21, 0.18);
      addPart(g, makeScaledBox(0.06, 0.42, 0.06, dark, 'leg-fr'), 0.19, 0.21, 0.18);
      // Rear posts (full height to backrest)
      addPart(g, makeScaledBox(0.06, 0.96, 0.06, dark, 'post-bl'), -0.19, 0.48, -0.19);
      addPart(g, makeScaledBox(0.06, 0.96, 0.06, dark, 'post-br'), 0.19, 0.48, -0.19);
      // Backrest slats
      addPart(g, makeScaledBox(0.42, 0.1, 0.05, plank, 'back-top'), 0, 0.9, -0.19);
      addPart(g, makeScaledBox(0.05, 0.36, 0.04, plank, 'back-slat-l'), -0.08, 0.66, -0.19, 'detail');
      addPart(g, makeScaledBox(0.05, 0.36, 0.04, plank, 'back-slat-r'), 0.08, 0.66, -0.19, 'detail');

      return finalizeAsset(g, this.meta, [0.5, 0.96, 0.5], 0x8f5b38);
    },
  },

  // 6. 三层木书柜 (Bookshelf)
  {
    meta: {
      id: 'fr01-bookshelf',
      name: '三层木书柜',
      pack: 'FR-01',
      category: '室内家具',
      dimensions: [1.16, 1.88, 0.42],
      colliders: [{ center: [0, 0.94, 0], size: [1.16, 1.88, 0.42], solid: true, label: 'bookshelf-body' }],
      lod: { nearDistance: 14, farDistance: 35, cullDistance: 60, instancingReady: true },
      clearanceNote: '靠墙放置，背部完整封板，可作隔断使用',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');
      const red = libs.get('cloth_red');
      const teal = libs.get('ceramic_teal');
      const paper = libs.get('paper_warm');

      // Sides, back, top, base
      addPart(g, makeScaledBox(0.07, 1.84, 0.4, dark, 'side-l'), -0.54, 0.92, 0);
      addPart(g, makeScaledBox(0.07, 1.84, 0.4, dark, 'side-r'), 0.54, 0.92, 0);
      addPart(g, makeScaledBox(1.04, 1.8, 0.04, dark, 'back-board'), 0, 0.92, -0.18);
      addPart(g, makeScaledBox(1.16, 0.08, 0.42, dark, 'crown'), 0, 1.84, 0);
      for (const sy of [0.1, 0.64, 1.18]) {
        addPart(g, makeScaledBox(1.04, 0.05, 0.36, warm, `shelf-${sy}`), 0, sy, 0.01);
      }
      // Books & ceramic jar details
      const bookMats = [red, teal, paper, dark];
      for (let i = 0; i < 6; i++) {
        const h = 0.22 + (i % 3) * 0.05;
        addPart(
          g,
          makeScaledBox(0.07, h, 0.22, bookMats[i % bookMats.length]!, `book-top-${i}`),
          -0.36 + i * 0.09,
          1.2 + h / 2,
          0.02,
          'detail',
        );
      }
      addPart(g, makeScaledBox(0.16, 0.22, 0.16, teal, 'ceramic-jar'), 0.3, 0.78, 0.03, 'detail');
      addPart(g, makeScaledBox(0.28, 0.18, 0.22, paper, 'scroll-stack'), -0.22, 0.22, 0.03, 'detail');

      return finalizeAsset(g, this.meta, [1.16, 1.88, 0.42], 0x4b3326);
    },
  },

  // 7. 木条货箱 (Cargo Crate)
  {
    meta: {
      id: 'fr01-cargo-crate',
      name: '木条货箱',
      pack: 'FR-01',
      category: '仓储道具',
      dimensions: [0.86, 0.86, 0.86],
      colliders: [{ center: [0, 0.43, 0], size: [0.86, 0.86, 0.86], solid: true, label: 'crate-cube' }],
      lod: { nearDistance: 12, farDistance: 36, cullDistance: 64, instancingReady: true },
      clearanceNote: '标准 0.86m 模数箱体，支持叠放与贴墙成组',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const iron = libs.get('iron');

      addPart(g, makeEdgedPanelBox(0.78, 0.78, 0.78, 0x9f6b43, 707, 'crate-core'), 0, 0.43, 0);
      // Outer corner battens
      for (const sx of [-0.39, 0.39]) {
        for (const sz of [-0.39, 0.39]) {
          addPart(g, makeScaledBox(0.08, 0.86, 0.08, dark, `batten-${sx}-${sz}`), sx, 0.43, sz, 'detail');
        }
      }
      // Top & bottom perimeter ribs + corner iron brackets
      addPart(g, makeScaledBox(0.86, 0.07, 0.86, dark, 'rim-bot'), 0, 0.035, 0, 'detail');
      addPart(g, makeScaledBox(0.86, 0.07, 0.86, dark, 'rim-top'), 0, 0.825, 0, 'detail');
      addPart(g, makeScaledBox(0.88, 0.04, 0.14, iron, 'strap-x'), 0, 0.43, 0, 'detail');

      return finalizeAsset(g, this.meta, [0.86, 0.86, 0.86], 0x9f6b43);
    },
  },

  // 8. 铁箍木酒桶 (Oak Barrel)
  {
    meta: {
      id: 'fr01-oak-barrel',
      name: '铁箍木酒桶',
      pack: 'FR-01',
      category: '仓储道具',
      dimensions: [0.74, 0.94, 0.74],
      colliders: [{ center: [0, 0.47, 0], size: [0.74, 0.94, 0.74], solid: true, label: 'barrel-body' }],
      lod: { nearDistance: 12, farDistance: 34, cullDistance: 60, instancingReady: true },
      clearanceNote: '直径 0.74m、高 0.94m，适合酒馆与补给站角落',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const warm = libs.get('wood_warm');
      const dark = libs.get('wood_dark');
      const iron = libs.get('iron');
      const brass = libs.get('brass');

      // Stepped voxel barrel bulge (bottom/mid/top)
      addPart(g, makeScaledBox(0.62, 0.94, 0.62, warm, 'barrel-core'), 0, 0.47, 0);
      addPart(g, makeScaledBox(0.72, 0.56, 0.56, warm, 'barrel-bulge-x'), 0, 0.47, 0);
      addPart(g, makeScaledBox(0.56, 0.56, 0.72, warm, 'barrel-bulge-z'), 0, 0.47, 0);
      // Iron hoops
      for (const hy of [0.16, 0.78]) {
        addPart(g, makeScaledBox(0.68, 0.07, 0.68, iron, `hoop-${hy}`), 0, hy, 0, 'detail');
      }
      addPart(g, makeScaledBox(0.74, 0.06, 0.74, iron, 'hoop-mid'), 0, 0.47, 0, 'detail');
      // Top bung & front spigot
      addPart(g, makeScaledBox(0.08, 0.04, 0.08, dark, 'bung'), 0.12, 0.95, 0.12, 'detail');
      addPart(g, makeScaledBox(0.06, 0.06, 0.14, brass, 'spigot'), 0, 0.24, 0.36, 'detail');

      return finalizeAsset(g, this.meta, [0.74, 0.94, 0.74], 0x8f5b38);
    },
  },

  // 9. 木石矮凳 (Stone & Wood Bench Stool)
  {
    meta: {
      id: 'fr01-stone-hearth-bench',
      name: '木石矮凳',
      pack: 'FR-01',
      category: '室内家具',
      dimensions: [1.18, 0.46, 0.44],
      colliders: [{ center: [0, 0.23, 0], size: [1.18, 0.46, 0.44], solid: true, label: 'hearth-bench' }],
      lod: { nearDistance: 12, farDistance: 30, cullDistance: 52, instancingReady: true },
      clearanceNote: '座面高 0.46m，无靠背可双面落座',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const cobble = libs.get('cobble');

      // Stone pedestals
      for (const sx of [-0.42, 0.42]) {
        addPart(g, makeScaledBox(0.24, 0.36, 0.38, stone, `stone-leg-${sx}`), sx, 0.18, 0);
        addPart(g, makeScaledBox(0.28, 0.08, 0.42, cobble, `stone-foot-${sx}`), sx, 0.04, 0, 'detail');
      }
      // Thick timber slab seat
      addPart(g, makeEdgedPanelBox(1.18, 0.1, 0.44, 0x9b643b, 909, 'timber-seat'), 0, 0.41, 0);

      return finalizeAsset(g, this.meta, [1.18, 0.46, 0.44], 0x7c8288);
    },
  },

  // 10. 块石矮墙段 (Stone Wall Section)
  {
    meta: {
      id: 'fr01-stone-wall-section',
      name: '块石矮墙段',
      pack: 'FR-01',
      category: '建筑构件',
      dimensions: [2.0, 1.05, 0.46],
      colliders: [{ center: [0, 0.525, 0], size: [2.0, 1.05, 0.46], solid: true, label: 'stone-wall' }],
      lod: { nearDistance: 18, farDistance: 48, cullDistance: 85, instancingReady: true },
      clearanceNote: '2.0m 模块化矮墙，高 1.05m 保持视线通透',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const cobble = libs.get('cobble');
      const stone = libs.get('stone_block');
      const snow = libs.get('snow');
      const dark = libs.get('wood_dark');

      addPart(g, makeEdgedPanelBox(1.88, 0.88, 0.4, 0x6c727a, 1010, 'wall-core'), 0, 0.44, 0);
      // Coping stone cap + timber end post
      addPart(g, makeScaledBox(2.0, 0.12, 0.46, stone, 'coping-cap'), 0, 0.94, 0);
      addPart(g, makeScaledBox(1.94, 0.05, 0.42, snow, 'snow-cap'), 0, 1.025, 0, 'detail');
      addPart(g, makeScaledBox(0.24, 1.04, 0.44, dark, 'end-post'), -0.88, 0.52, 0, 'detail');
      addPart(g, makeScaledBox(0.32, 0.24, 0.44, cobble, 'base-plinth'), 0.64, 0.12, 0, 'detail');

      return finalizeAsset(g, this.meta, [2.0, 1.05, 0.46], 0x676d75);
    },
  },

  // 11. 壁挂木药柜 (Wall Cabinet)
  {
    meta: {
      id: 'fr01-wall-cabinet',
      name: '壁挂木药柜',
      pack: 'FR-01',
      category: '室内家具',
      dimensions: [0.96, 0.92, 0.34],
      colliders: [{ center: [0, 0.46, 0], size: [0.96, 0.92, 0.34], solid: true, label: 'wall-cabinet' }],
      lod: { nearDistance: 12, farDistance: 30, cullDistance: 50, instancingReady: true },
      clearanceNote: '建议挂高 1.15m 以上，不阻挡地面行走',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');
      const brass = libs.get('brass');

      addPart(g, makeEdgedPanelBox(0.92, 0.82, 0.3, 0x73492f, 1111, 'cabinet-box'), 0, 0.45, 0);
      addPart(g, makeScaledBox(0.96, 0.07, 0.34, dark, 'cabinet-crown'), 0, 0.885, 0.01);
      // Twin recessed doors & brass knobs
      addPart(g, makeScaledBox(0.38, 0.68, 0.04, warm, 'door-left'), -0.21, 0.45, 0.16, 'detail');
      addPart(g, makeScaledBox(0.38, 0.68, 0.04, warm, 'door-right'), 0.21, 0.45, 0.16, 'detail');
      addPart(g, makeScaledBox(0.04, 0.09, 0.04, brass, 'knob-l'), -0.06, 0.45, 0.19, 'detail');
      addPart(g, makeScaledBox(0.04, 0.09, 0.04, brass, 'knob-r'), 0.06, 0.45, 0.19, 'detail');

      return finalizeAsset(g, this.meta, [0.96, 0.92, 0.34], 0x73492f);
    },
  },

  // 12. 木座铁提灯架 (Oil Lamp Stand)
  {
    meta: {
      id: 'fr01-lamp-stand',
      name: '木座铁提灯架',
      pack: 'FR-01',
      category: '照明陈设',
      dimensions: [0.46, 1.62, 0.46],
      colliders: [{ center: [0, 0.81, 0], size: [0.38, 1.62, 0.38], solid: true, label: 'lamp-stand' }],
      lod: { nearDistance: 14, farDistance: 36, cullDistance: 64, instancingReady: true },
      clearanceNote: '占地 0.46m × 0.46m，可置于门口、桌旁或阶梯转角',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const iron = libs.get('iron');
      const glow = libs.get('glow_amber');

      // Heavy timber base
      addPart(g, makeScaledBox(0.42, 0.12, 0.42, dark, 'base-foot'), 0, 0.06, 0);
      addPart(g, makeScaledBox(0.12, 1.38, 0.12, dark, 'stand-post'), -0.06, 0.81, 0);
      // Iron arm & hanging lantern
      addPart(g, makeScaledBox(0.32, 0.06, 0.06, iron, 'iron-arm'), 0.06, 1.5, 0);
      addPart(g, makeScaledBox(0.04, 0.12, 0.04, iron, 'chain'), 0.18, 1.41, 0, 'detail');
      addPart(g, makeScaledBox(0.18, 0.22, 0.18, glow, 'lantern-core'), 0.18, 1.24, 0);
      addPart(g, makeScaledBox(0.24, 0.05, 0.24, iron, 'lantern-cap'), 0.18, 1.37, 0, 'detail');
      addPart(g, makeScaledBox(0.22, 0.04, 0.22, iron, 'lantern-base'), 0.18, 1.11, 0, 'detail');

      return finalizeAsset(g, this.meta, [0.46, 1.62, 0.46], 0x4b3326);
    },
  },
];
