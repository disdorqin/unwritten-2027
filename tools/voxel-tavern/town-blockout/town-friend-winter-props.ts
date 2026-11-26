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
 * FR-02: 冬日街景道具库 (10 classes)
 *
 * Designed for snowy street dressing with clear separation between solid
 * obstacle colliders and walk-through / low decorative props, plus an
 * InstancedMesh batching helper for distant streetscapes.
 */

export interface WinterPropEntry {
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

function finalizeProp(
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
    meta.id.length * 73,
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

export const FR02_WINTER_PROPS_CATALOG: readonly WinterPropEntry[] = [
  // 1. 木质分岔路牌 (Wooden Signpost)
  {
    meta: {
      id: 'fr02-wooden-signpost',
      name: '木质分岔路牌',
      pack: 'FR-02',
      category: '导览路牌',
      dimensions: [0.92, 2.25, 0.36],
      colliders: [{ center: [0, 1.1, 0], size: [0.34, 2.2, 0.34], solid: true, label: 'signpost-pole' }],
      lod: { nearDistance: 16, farDistance: 44, cullDistance: 80, instancingReady: true },
      clearanceNote: '牌面高度 ≥ 1.65m，不阻挡行人肩部通行',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const dark = libs.get('wood_dark');
      const plank = libs.get('wood_plank');
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(0.38, 0.22, 0.38, stone, 'stone-base'), 0, 0.11, 0);
      addPart(g, makeScaledBox(0.14, 2.02, 0.14, dark, 'post'), 0, 1.22, 0);
      addPart(g, makeScaledBox(0.76, 0.2, 0.07, plank, 'blade-top'), 0.12, 1.96, 0.08);
      addPart(g, makeScaledBox(0.7, 0.18, 0.07, plank, 'blade-mid'), -0.1, 1.68, -0.08);
      addPart(g, makeScaledBox(0.24, 0.06, 0.24, snow, 'cap-snow'), 0, 2.24, 0, 'detail');
      addPart(g, makeScaledBox(0.72, 0.04, 0.08, snow, 'blade-snow'), 0.12, 2.08, 0.08, 'detail');

      return finalizeProp(g, this.meta, [0.4, 2.25, 0.4], 0x4b3326);
    },
  },

  // 2. 冬日街灯笼柱 (Street Lantern Post)
  {
    meta: {
      id: 'fr02-street-lantern',
      name: '冬日街灯笼柱',
      pack: 'FR-02',
      category: '街景照明',
      dimensions: [0.68, 2.55, 0.44],
      colliders: [{ center: [-0.14, 1.25, 0], size: [0.32, 2.5, 0.32], solid: true, label: 'lantern-pole' }],
      lod: { nearDistance: 18, farDistance: 55, cullDistance: 95, instancingReady: true },
      clearanceNote: '灯笼悬挑高度 2.0m 以上，行人可在灯下通过',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('cobble');
      const dark = libs.get('wood_dark');
      const iron = libs.get('iron');
      const red = libs.get('cloth_red');
      const glow = libs.get('glow_amber');
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(0.38, 0.24, 0.38, stone, 'base'), -0.14, 0.12, 0);
      addPart(g, makeScaledBox(0.15, 2.25, 0.15, dark, 'pole'), -0.14, 1.36, 0);
      addPart(g, makeScaledBox(0.56, 0.1, 0.1, dark, 'arm'), 0.08, 2.38, 0);
      addPart(g, makeScaledBox(0.04, 0.16, 0.04, iron, 'hook'), 0.26, 2.25, 0, 'detail');
      addPart(g, makeScaledBox(0.24, 0.3, 0.24, glow, 'lantern-glow'), 0.26, 2.02, 0);
      addPart(g, makeScaledBox(0.28, 0.06, 0.28, red, 'lantern-rim-top'), 0.26, 2.18, 0, 'detail');
      addPart(g, makeScaledBox(0.26, 0.05, 0.26, red, 'lantern-rim-bot'), 0.26, 1.85, 0, 'detail');
      addPart(g, makeScaledBox(0.58, 0.05, 0.16, snow, 'arm-snow'), 0.08, 2.455, 0, 'detail');

      return finalizeProp(g, this.meta, [0.45, 2.55, 0.45], 0xffcf77);
    },
  },

  // 3. 路边积雪堆 (Snow Drift Mound)
  {
    meta: {
      id: 'fr02-snow-drift',
      name: '路边积雪堆',
      pack: 'FR-02',
      category: '冬日地景',
      dimensions: [1.5, 0.42, 1.1],
      colliders: [{ center: [0, 0.21, 0], size: [1.5, 0.42, 1.1], solid: false, label: 'snow-drift-soft' }],
      lod: { nearDistance: 14, farDistance: 45, cullDistance: 90, instancingReady: true },
      clearanceNote: '非阻挡软雪装饰（solid: false），可踩踏穿过不卡脚',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(1.5, 0.18, 1.1, snow, 'drift-base'), 0, 0.09, 0);
      addPart(g, makeScaledBox(1.06, 0.16, 0.78, snow, 'drift-mid'), -0.08, 0.24, 0.04);
      addPart(g, makeScaledBox(0.58, 0.12, 0.46, snow, 'drift-peak'), -0.14, 0.36, 0.06, 'detail');

      return finalizeProp(g, this.meta, [1.5, 0.42, 1.1], 0xeef5fb);
    },
  },

  // 4. 冬日街边木长凳 (Winter Park Bench)
  {
    meta: {
      id: 'fr02-winter-bench',
      name: '冬日街边木长凳',
      pack: 'FR-02',
      category: '街区休憩',
      dimensions: [1.62, 0.88, 0.58],
      colliders: [{ center: [0, 0.44, 0], size: [1.62, 0.88, 0.58], solid: true, label: 'bench-body' }],
      lod: { nearDistance: 14, farDistance: 38, cullDistance: 70, instancingReady: true },
      clearanceNote: '座高 0.45m，沿街贴边摆放留足主路宽度',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const iron = libs.get('iron');
      const warm = libs.get('wood_warm');
      const snow = libs.get('snow');

      for (const sx of [-0.66, 0.66]) {
        addPart(g, makeScaledBox(0.08, 0.45, 0.52, iron, `leg-${sx}`), sx, 0.225, 0);
        addPart(g, makeScaledBox(0.07, 0.46, 0.08, iron, `back-post-${sx}`), sx, 0.65, -0.22);
      }
      addPart(g, makeEdgedPanelBox(1.62, 0.08, 0.46, 0x8f5b38, 204, 'seat-plank'), 0, 0.45, 0.03);
      addPart(g, makeScaledBox(1.58, 0.24, 0.07, warm, 'back-plank'), 0, 0.72, -0.22);
      addPart(g, makeScaledBox(1.5, 0.04, 0.09, snow, 'back-snow'), 0, 0.86, -0.22, 'detail');

      return finalizeProp(g, this.meta, [1.62, 0.88, 0.58], 0x8f5b38);
    },
  },

  // 5. 松柏木盆栽 (Evergreen Planter)
  {
    meta: {
      id: 'fr02-evergreen-planter',
      name: '松柏木盆栽',
      pack: 'FR-02',
      category: '街景绿化',
      dimensions: [0.76, 1.48, 0.76],
      colliders: [{ center: [0, 0.74, 0], size: [0.76, 1.48, 0.76], solid: true, label: 'planter-box' }],
      lod: { nearDistance: 16, farDistance: 45, cullDistance: 85, instancingReady: true },
      clearanceNote: '落地木花箱 0.76m 方，适合门廊两侧成对摆放',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');
      const pine = libs.get('pine_green');
      const snow = libs.get('snow');

      addPart(g, makeEdgedPanelBox(0.68, 0.46, 0.68, 0x8f5b38, 205, 'planter-tub'), 0, 0.23, 0);
      addPart(g, makeScaledBox(0.76, 0.07, 0.76, dark, 'planter-rim'), 0, 0.46, 0);
      addPart(g, makeScaledBox(0.14, 0.34, 0.14, dark, 'trunk'), 0, 0.64, 0);
      // Tiered pine canopy + snow
      addPart(g, makeScaledBox(0.68, 0.28, 0.68, pine, 'pine-tier-1'), 0, 0.84, 0);
      addPart(g, makeScaledBox(0.5, 0.26, 0.5, pine, 'pine-tier-2'), 0, 1.1, 0);
      addPart(g, makeScaledBox(0.28, 0.22, 0.28, pine, 'pine-tier-3'), 0, 1.33, 0);
      addPart(g, makeScaledBox(0.3, 0.05, 0.3, snow, 'pine-snow-top'), 0, 1.46, 0, 'detail');
      addPart(g, makeScaledBox(0.7, 0.04, 0.7, warm, 'soil-rim'), 0, 0.48, 0, 'detail');

      return finalizeProp(g, this.meta, [0.76, 1.48, 0.76], 0x2f5e42);
    },
  },

  // 6. 新年邮包堆 (Wrapped Parcel Stack)
  {
    meta: {
      id: 'fr02-parcel-stack',
      name: '新年邮包堆',
      pack: 'FR-02',
      category: '街景道具',
      dimensions: [0.92, 0.82, 0.82],
      colliders: [{ center: [0, 0.41, 0], size: [0.92, 0.82, 0.82], solid: true, label: 'parcel-stack' }],
      lod: { nearDistance: 12, farDistance: 32, cullDistance: 56, instancingReady: true },
      clearanceNote: '木托盘垫底防浸雪，适合邮局与驿站门口',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const paper = libs.get('paper_warm');
      const red = libs.get('cloth_red');
      const teal = libs.get('ceramic_teal');

      addPart(g, makeScaledBox(0.92, 0.08, 0.82, dark, 'pallet'), 0, 0.04, 0);
      addPart(g, makeEdgedPanelBox(0.48, 0.38, 0.46, 0xd8be94, 206, 'parcel-large'), -0.14, 0.27, 0);
      addPart(g, makeScaledBox(0.5, 0.05, 0.08, red, 'ribbon-1'), -0.14, 0.47, 0, 'detail');
      addPart(g, makeScaledBox(0.32, 0.3, 0.34, paper, 'parcel-right'), 0.24, 0.23, 0.06);
      addPart(g, makeScaledBox(0.34, 0.26, 0.32, teal, 'parcel-top'), -0.1, 0.59, -0.02);
      addPart(g, makeScaledBox(0.36, 0.05, 0.07, red, 'ribbon-top'), -0.1, 0.73, -0.02, 'detail');

      return finalizeProp(g, this.meta, [0.92, 0.82, 0.82], 0xd8be94);
    },
  },

  // 7. 雪夜邮筒柱 (Winter Mailbox)
  {
    meta: {
      id: 'fr02-mailbox',
      name: '雪夜邮筒柱',
      pack: 'FR-02',
      category: '街景设施',
      dimensions: [0.46, 1.34, 0.46],
      colliders: [{ center: [0, 0.67, 0], size: [0.46, 1.34, 0.46], solid: true, label: 'mailbox-body' }],
      lod: { nearDistance: 14, farDistance: 36, cullDistance: 64, instancingReady: true },
      clearanceNote: '投信口高度 1.05m，正面留 0.8m 交互空间',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const pine = libs.get('pine_green');
      const iron = libs.get('iron');
      const brass = libs.get('brass');
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(0.46, 0.2, 0.46, stone, 'plinth'), 0, 0.1, 0);
      addPart(g, makeScaledBox(0.34, 0.96, 0.34, pine, 'mailbox-body'), 0, 0.68, 0);
      addPart(g, makeScaledBox(0.4, 0.1, 0.4, iron, 'cap'), 0, 1.21, 0);
      addPart(g, makeScaledBox(0.36, 0.06, 0.36, snow, 'cap-snow'), 0, 1.29, 0, 'detail');
      addPart(g, makeScaledBox(0.22, 0.05, 0.06, brass, 'mail-slot'), 0, 1.02, 0.18, 'detail');

      return finalizeProp(g, this.meta, [0.46, 1.34, 0.46], 0x2f5e42);
    },
  },

  // 8. 檐下木柴架 (Firewood Rack)
  {
    meta: {
      id: 'fr02-firewood-rack',
      name: '檐下木柴架',
      pack: 'FR-02',
      category: '冬日生活',
      dimensions: [1.24, 0.98, 0.48],
      colliders: [{ center: [0, 0.49, 0], size: [1.24, 0.98, 0.48], solid: true, label: 'firewood-rack' }],
      lod: { nearDistance: 14, farDistance: 34, cullDistance: 60, instancingReady: true },
      clearanceNote: '靠墙垛放，深 0.48m 不侵占人行道',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');
      const plank = libs.get('wood_plank');
      const snow = libs.get('snow');

      addPart(g, makeScaledBox(1.24, 0.07, 0.46, dark, 'rack-base'), 0, 0.035, 0);
      addPart(g, makeScaledBox(0.08, 0.92, 0.44, dark, 'rack-l'), -0.58, 0.49, 0);
      addPart(g, makeScaledBox(0.08, 0.92, 0.44, dark, 'rack-r'), 0.58, 0.49, 0);
      addPart(g, makeScaledBox(1.24, 0.06, 0.48, dark, 'rack-roof'), 0, 0.92, 0);
      addPart(g, makeScaledBox(1.2, 0.05, 0.44, snow, 'roof-snow'), 0, 0.975, 0, 'detail');

      // Stacked split logs
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          const mat = (row + col) % 2 === 0 ? warm : plank;
          addPart(
            g,
            makeScaledBox(0.19, 0.17, 0.38, mat, `log-${row}-${col}`),
            -0.4 + col * 0.2,
            0.16 + row * 0.18,
            0,
            'detail',
          );
        }
      }

      return finalizeProp(g, this.meta, [1.24, 0.98, 0.48], 0x8f5b38);
    },
  },

  // 9. 铸铁暖手火盆 (Cast-Iron Brazier)
  {
    meta: {
      id: 'fr02-brazier',
      name: '铸铁暖手火盆',
      pack: 'FR-02',
      category: '街景照明',
      dimensions: [0.64, 0.86, 0.64],
      colliders: [{ center: [0, 0.43, 0], size: [0.64, 0.86, 0.64], solid: true, label: 'brazier-body' }],
      lod: { nearDistance: 14, farDistance: 40, cullDistance: 72, instancingReady: true },
      clearanceNote: '带底座高度 0.86m，周围保持 0.6m 安全间距',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const iron = libs.get('iron');
      const glow = libs.get('glow_amber');

      addPart(g, makeScaledBox(0.54, 0.14, 0.54, stone, 'hearth-stone'), 0, 0.07, 0);
      addPart(g, makeScaledBox(0.14, 0.42, 0.14, iron, 'pedestal'), 0, 0.35, 0);
      addPart(g, makeScaledBox(0.64, 0.22, 0.64, iron, 'fire-bowl'), 0, 0.66, 0);
      addPart(g, makeScaledBox(0.46, 0.12, 0.46, glow, 'ember-core'), 0, 0.78, 0);

      return finalizeProp(g, this.meta, [0.64, 0.86, 0.64], 0x3b4046);
    },
  },

  // 10. 节日红绸灯笼门架 (Festive Arch Banner)
  {
    meta: {
      id: 'fr02-festive-arch',
      name: '节日灯笼门架',
      pack: 'FR-02',
      category: '节日装饰',
      dimensions: [2.5, 2.85, 0.42],
      colliders: [
        { center: [-1.06, 1.42, 0], size: [0.28, 2.84, 0.36], solid: true, label: 'arch-post-l' },
        { center: [1.06, 1.42, 0], size: [0.28, 2.84, 0.36], solid: true, label: 'arch-post-r' },
      ],
      lod: { nearDistance: 20, farDistance: 56, cullDistance: 100, instancingReady: true },
      clearanceNote: '中央净宽 1.84m × 净高 2.42m，行人可直接穿行',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const dark = libs.get('wood_dark');
      const red = libs.get('cloth_red');
      const glow = libs.get('glow_amber');
      const snow = libs.get('snow');

      for (const sx of [-1.06, 1.06]) {
        addPart(g, makeScaledBox(0.32, 0.24, 0.36, stone, `base-${sx}`), sx, 0.12, 0);
        addPart(g, makeScaledBox(0.18, 2.48, 0.18, dark, `post-${sx}`), sx, 1.48, 0);
      }
      addPart(g, makeScaledBox(2.5, 0.2, 0.24, dark, 'top-beam'), 0, 2.68, 0);
      addPart(g, makeScaledBox(2.44, 0.06, 0.26, snow, 'beam-snow'), 0, 2.81, 0, 'detail');
      addPart(g, makeScaledBox(1.8, 0.16, 0.06, red, 'bunting-banner'), 0, 2.46, 0, 'detail');

      for (const lx of [-0.62, 0.62]) {
        addPart(g, makeScaledBox(0.2, 0.26, 0.2, glow, `lantern-${lx}`), lx, 2.26, 0);
        addPart(g, makeScaledBox(0.24, 0.05, 0.24, red, `lantern-cap-${lx}`), lx, 2.4, 0, 'detail');
      }

      return finalizeProp(g, this.meta, [2.5, 2.85, 0.42], 0xa83b36);
    },
  },
];

/**
 * Helper for distant streetscapes: batch repeated simple prop proxies
 * into a single InstancedMesh draw call.
 */
export function buildInstancedPropProxies(
  transforms: Array<{ position: [number, number, number]; scale?: [number, number, number] }>,
  size: [number, number, number],
  libs: FriendMaterialLibrary,
  materialKind: 'snow' | 'glow_amber' | 'pine_green' = 'snow',
): InstancedMesh {
  const geo = new BoxGeometry(size[0], size[1], size[2]);
  const mesh = new InstancedMesh(geo, libs.get(materialKind), transforms.length);
  const mat4 = new Matrix4();

  transforms.forEach((t, i) => {
    const sx = t.scale?.[0] ?? 1;
    const sy = t.scale?.[1] ?? 1;
    const sz = t.scale?.[2] ?? 1;
    mat4.makeScale(sx, sy, sz);
    mat4.setPosition(t.position[0], t.position[1] + (size[1] * sy) / 2, t.position[2]);
    mesh.setMatrixAt(i, mat4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
