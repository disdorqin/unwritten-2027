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
 * FR-13: 地下营地/勇士城生活陈设库 (8 classes)
 *
 * Underground camp & Warrior City living props styled after the voxel tavern:
 * dark rock, warm timber, iron fittings, terracotta pottery, cloth sacks,
 * oil lamp hoods, tableware, and scroll racks.
 * Does not build C/C2 scenes or grant item pickup / story authority.
 */

export interface UndergroundPropEntry {
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

function finalizeUndergroundProp(
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
    meta.id.length * 83 + 47,
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

export const FR13_UNDERGROUND_PROPS_CATALOG: readonly UndergroundPropEntry[] = [
  // 1. 双联陶罐与密封塞 (Twin Terracotta Storage Jars)
  {
    meta: {
      id: 'fr13-terracotta-jars',
      name: '双联陶罐与密封塞',
      pack: 'FR-13',
      category: '陶器储藏',
      dimensions: [0.84, 0.78, 0.56],
      colliders: [{ center: [0, 0.39, 0], size: [0.8, 0.76, 0.52], solid: true, label: 'terracotta-jars' }],
      lod: { nearDistance: 12, farDistance: 34, cullDistance: 64, instancingReady: true },
      clearanceNote: '带木托垫的储水/谷物陶罐组，靠岩壁或货架旁摆设',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const terra = libs.get('terracotta');
      const teal = libs.get('ceramic_teal');
      const hemp = libs.get('rope_hemp');
      const warm = libs.get('wood_warm');

      addPart(g, makeScaledBox(0.8, 0.06, 0.5, dark, 'jar-pallet'), 0, 0.03, 0);
      // Tall terracotta jar
      addPart(g, makeScaledBox(0.36, 0.52, 0.36, terra, 'jar-tall-body'), -0.18, 0.32, 0);
      addPart(g, makeScaledBox(0.24, 0.12, 0.24, terra, 'jar-tall-neck'), -0.18, 0.64, 0, 'detail');
      addPart(g, makeScaledBox(0.2, 0.08, 0.2, warm, 'jar-tall-bung'), -0.18, 0.72, 0, 'detail');
      addPart(g, makeScaledBox(0.38, 0.06, 0.38, hemp, 'jar-rope-band'), -0.18, 0.42, 0, 'detail');
      // Shorter glazed teal-clay jar
      addPart(g, makeScaledBox(0.28, 0.36, 0.28, teal, 'jar-small-body'), 0.22, 0.24, 0.04);
      addPart(g, makeScaledBox(0.18, 0.08, 0.18, warm, 'jar-small-lid'), 0.22, 0.46, 0.04, 'detail');

      return finalizeUndergroundProp(g, this.meta, [0.8, 0.72, 0.5], 0x9c553b);
    },
  },

  // 2. 石木储物货架 (Stone & Timber Camp Shelf)
  {
    meta: {
      id: 'fr13-stone-wood-shelf',
      name: '石木储物货架',
      pack: 'FR-13',
      category: '营地家具',
      dimensions: [1.38, 1.66, 0.5],
      colliders: [{ center: [0, 0.82, 0], size: [1.34, 1.64, 0.46], solid: true, label: 'stone-wood-shelf' }],
      lod: { nearDistance: 14, farDistance: 40, cullDistance: 74, instancingReady: true },
      clearanceNote: '石柱承重防潮货架，适合营地帐边或地下仓库贴墙摆放',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const rock = libs.get('dark_rock');
      const plank = libs.get('wood_plank');
      const terra = libs.get('terracotta');
      const hemp = libs.get('rope_hemp');
      const brass = libs.get('brass');

      // Stone side pillars
      addPart(g, makeScaledBox(0.16, 1.56, 0.44, rock, 'pillar-l'), -0.58, 0.78, 0);
      addPart(g, makeScaledBox(0.16, 1.56, 0.44, rock, 'pillar-r'), 0.58, 0.78, 0);
      // 3 timber shelves
      for (const sy of [0.24, 0.82, 1.4]) {
        addPart(g, makeScaledBox(1.32, 0.07, 0.44, plank, `shelf-${sy}`), 0, sy, 0);
      }
      // Props on shelves
      addPart(g, makeScaledBox(0.24, 0.3, 0.24, terra, 'shelf-jar-a'), -0.32, 0.42, 0, 'detail');
      addPart(g, makeScaledBox(0.32, 0.24, 0.28, hemp, 'shelf-sack'), 0.22, 0.39, 0, 'detail');
      addPart(g, makeScaledBox(0.2, 0.26, 0.2, brass, 'shelf-kettle'), -0.24, 0.98, 0.02, 'detail');
      addPart(g, makeScaledBox(0.36, 0.22, 0.28, terra, 'shelf-crate'), 0.24, 0.96, 0, 'detail');

      return finalizeUndergroundProp(g, this.meta, [1.34, 1.6, 0.44], 0x8f5b38);
    },
  },

  // 3. 铸铁防风油灯罩 (Iron-Hooded Oil Lamp)
  {
    meta: {
      id: 'fr13-oil-lamp-hood',
      name: '铸铁防风油灯罩',
      pack: 'FR-13',
      category: '地下照明',
      dimensions: [0.42, 0.76, 0.42],
      colliders: [{ center: [0, 0.38, 0], size: [0.38, 0.74, 0.38], solid: false, label: 'oil-lamp-hood' }],
      lod: { nearDistance: 12, farDistance: 36, cullDistance: 72, instancingReady: true },
      clearanceNote: '可置桌面、石台或营地门口地面，琥珀光源仅做外观自发光',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const rock = libs.get('dark_rock');
      const iron = libs.get('iron');
      const brass = libs.get('brass');
      const glow = libs.get('glow_amber');

      addPart(g, makeScaledBox(0.38, 0.14, 0.38, rock, 'lamp-plinth'), 0, 0.07, 0);
      addPart(g, makeScaledBox(0.26, 0.1, 0.26, brass, 'oil-reservoir'), 0, 0.19, 0);
      addPart(g, makeScaledBox(0.18, 0.26, 0.18, glow, 'lamp-flame'), 0, 0.37, 0);
      // Four corner cage bars
      for (const sx of [-0.12, 0.12]) {
        for (const sz of [-0.12, 0.12]) {
          addPart(g, makeScaledBox(0.04, 0.3, 0.04, iron, 'cage-bar'), sx, 0.38, sz, 'detail');
        }
      }
      // Tiered iron storm hood
      addPart(g, makeScaledBox(0.34, 0.08, 0.34, iron, 'hood-brim'), 0, 0.56, 0);
      addPart(g, makeScaledBox(0.22, 0.08, 0.22, iron, 'hood-cap'), 0, 0.64, 0, 'detail');
      addPart(g, makeScaledBox(0.08, 0.07, 0.08, brass, 'top-ring'), 0, 0.71, 0, 'detail');

      return finalizeUndergroundProp(g, this.meta, [0.38, 0.72, 0.38], 0x3b4046);
    },
  },

  // 4. 营地木盘餐具组 (Camp Tableware Tray)
  {
    meta: {
      id: 'fr13-camp-tableware',
      name: '营地木盘餐具组',
      pack: 'FR-13',
      category: '生活器具',
      dimensions: [0.68, 0.3, 0.5],
      colliders: [{ center: [0, 0.14, 0], size: [0.64, 0.28, 0.46], solid: false, label: 'tableware-tray' }],
      lod: { nearDistance: 10, farDistance: 28, cullDistance: 54, instancingReady: true },
      clearanceNote: '低矮桌面摆件，solid=false',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const warm = libs.get('wood_warm');
      const dark = libs.get('wood_dark');
      const teal = libs.get('ceramic_teal');
      const brass = libs.get('brass');
      const terra = libs.get('terracotta');

      addPart(g, makeScaledBox(0.64, 0.05, 0.46, dark, 'tray-base'), 0, 0.025, 0);
      addPart(g, makeScaledBox(0.66, 0.06, 0.04, warm, 'tray-rim-f'), 0, 0.06, 0.21, 'detail');
      addPart(g, makeScaledBox(0.66, 0.06, 0.04, warm, 'tray-rim-b'), 0, 0.06, -0.21, 'detail');
      // Ceramic bowl + brass tankard + wooden plate + loaf
      addPart(g, makeScaledBox(0.2, 0.1, 0.2, teal, 'soup-bowl'), -0.16, 0.1, 0.04);
      addPart(g, makeScaledBox(0.14, 0.18, 0.14, brass, 'brass-mug'), 0.18, 0.14, -0.06);
      addPart(g, makeScaledBox(0.2, 0.04, 0.16, terra, 'bread-plate'), 0.12, 0.07, 0.11, 'detail');
      addPart(g, makeScaledBox(0.14, 0.08, 0.1, warm, 'bread-loaf'), 0.12, 0.13, 0.11, 'detail');

      return finalizeUndergroundProp(g, this.meta, [0.64, 0.24, 0.46], 0x8f5b38);
    },
  },

  // 5. 粗麻粮袋与束口布袋 (Grain & Cloth Supply Sacks)
  {
    meta: {
      id: 'fr13-grain-sacks',
      name: '粗麻粮袋与束口布袋',
      pack: 'FR-13',
      category: '补给堆叠',
      dimensions: [0.92, 0.72, 0.78],
      colliders: [{ center: [0, 0.35, 0], size: [0.88, 0.7, 0.74], solid: true, label: 'grain-sacks' }],
      lod: { nearDistance: 14, farDistance: 38, cullDistance: 72, instancingReady: true },
      clearanceNote: '堆叠补给袋，高 0.72m，可作营地低矮掩体或角落装饰',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const hemp = libs.get('rope_hemp');
      const red = libs.get('cloth_red');
      const dark = libs.get('wood_dark');
      const leather = libs.get('leather_brown');

      // Low dunnage boards
      addPart(g, makeScaledBox(0.88, 0.05, 0.72, dark, 'dunnage'), 0, 0.025, 0);
      // Bottom twin sacks
      addPart(g, makeScaledBox(0.42, 0.34, 0.62, hemp, 'sack-l'), -0.22, 0.22, 0);
      addPart(g, makeScaledBox(0.42, 0.34, 0.62, hemp, 'sack-r'), 0.22, 0.22, 0);
      // Top leaning red-trimmed pouch sack
      addPart(g, makeScaledBox(0.46, 0.28, 0.44, red, 'sack-top'), -0.02, 0.51, -0.04);
      addPart(g, makeScaledBox(0.16, 0.09, 0.16, leather, 'sack-tie'), -0.02, 0.66, -0.04, 'detail');

      return finalizeUndergroundProp(g, this.meta, [0.88, 0.68, 0.7], 0xb59564);
    },
  },

  // 6. 旧卷轴与石筒架 (Scrolls & Stone Cubby Rack)
  {
    meta: {
      id: 'fr13-scroll-basket',
      name: '旧卷轴与石筒架',
      pack: 'FR-13',
      category: '文书陈设',
      dimensions: [0.64, 0.88, 0.48],
      colliders: [{ center: [0, 0.44, 0], size: [0.6, 0.86, 0.44], solid: true, label: 'scroll-rack' }],
      lod: { nearDistance: 12, farDistance: 34, cullDistance: 64, instancingReady: true },
      clearanceNote: '仅作纯静态文书摆件，不带任何可读剧情文本或拾取权限',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const rock = libs.get('dark_rock');
      const warm = libs.get('wood_warm');
      const paper = libs.get('paper_warm');
      const brass = libs.get('brass');
      const red = libs.get('cloth_red');

      addPart(g, makeScaledBox(0.58, 0.14, 0.44, rock, 'stone-foot'), 0, 0.07, 0);
      addPart(g, makeScaledBox(0.54, 0.54, 0.4, warm, 'cubby-box'), 0, 0.41, 0);
      // Protruding parchment scrolls
      const scrollCoords: Array<[number, number, number]> = [
        [-0.14, 0.72, 0.06],
        [0.02, 0.76, -0.05],
        [0.16, 0.71, 0.04],
      ];
      scrollCoords.forEach(([sx, sy, sz], i) => {
        addPart(g, makeScaledBox(0.11, 0.36, 0.11, paper, `scroll-${i}`), sx, sy, sz, 'detail');
        addPart(g, makeScaledBox(0.13, 0.04, 0.13, brass, `scroll-cap-${i}`), sx, sy + 0.16, sz, 'detail');
        addPart(g, makeScaledBox(0.12, 0.05, 0.12, red, `scroll-ribbon-${i}`), sx, sy - 0.02, sz, 'detail');
      });

      return finalizeUndergroundProp(g, this.meta, [0.58, 0.82, 0.44], 0xf1dfb8);
    },
  },

  // 7. 营地小炭盆与水壶 (Camp Brazier & Iron Kettle)
  {
    meta: {
      id: 'fr13-brazier-kettle',
      name: '营地小炭盆与水壶',
      pack: 'FR-13',
      category: '取暖炊具',
      dimensions: [0.74, 0.96, 0.74],
      colliders: [{ center: [0, 0.46, 0], size: [0.68, 0.92, 0.68], solid: true, label: 'camp-brazier' }],
      lod: { nearDistance: 14, farDistance: 40, cullDistance: 76, instancingReady: true },
      clearanceNote: '带石砌隔热盘，碰撞包覆铁架防走入炭火',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const rock = libs.get('dark_rock');
      const iron = libs.get('iron');
      const glow = libs.get('glow_amber');
      const brass = libs.get('brass');

      addPart(g, makeScaledBox(0.7, 0.1, 0.7, rock, 'hearth-slab'), 0, 0.05, 0);
      addPart(g, makeScaledBox(0.48, 0.16, 0.48, iron, 'fire-bowl'), 0, 0.18, 0);
      addPart(g, makeScaledBox(0.36, 0.08, 0.36, glow, 'ember-bed'), 0, 0.28, 0);
      // Tripod arch & hanging kettle
      addPart(g, makeScaledBox(0.06, 0.8, 0.06, iron, 'tripod-l'), -0.28, 0.5, 0);
      addPart(g, makeScaledBox(0.06, 0.8, 0.06, iron, 'tripod-r'), 0.28, 0.5, 0);
      addPart(g, makeScaledBox(0.62, 0.06, 0.06, iron, 'crossbar'), 0, 0.88, 0);
      addPart(g, makeScaledBox(0.04, 0.22, 0.04, iron, 'chain'), 0, 0.76, 0, 'detail');
      addPart(g, makeScaledBox(0.24, 0.22, 0.24, brass, 'kettle-body'), 0, 0.56, 0, 'detail');
      addPart(g, makeScaledBox(0.12, 0.05, 0.12, iron, 'kettle-lid'), 0, 0.68, 0, 'detail');

      return finalizeUndergroundProp(g, this.meta, [0.7, 0.9, 0.7], 0x3b4046);
    },
  },

  // 8. 行军睡毯与木箱床 (Bedroll & Camp Supply Chest)
  {
    meta: {
      id: 'fr13-wool-bedroll-crate',
      name: '行军睡毯与木箱床',
      pack: 'FR-13',
      category: '宿营休息',
      dimensions: [1.48, 0.58, 0.82],
      colliders: [{ center: [0, 0.28, 0], size: [1.44, 0.56, 0.78], solid: true, label: 'bedroll-crate' }],
      lod: { nearDistance: 14, farDistance: 38, cullDistance: 72, instancingReady: true },
      clearanceNote: '低矮营地卧具箱，高 0.58m，适合作营帐内核心陈设',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const plank = libs.get('wood_plank');
      const red = libs.get('cloth_red');
      const hemp = libs.get('rope_hemp');
      const leather = libs.get('leather_brown');

      addPart(g, makeScaledBox(1.44, 0.34, 0.76, dark, 'bunk-base'), 0, 0.17, 0);
      addPart(g, makeScaledBox(1.4, 0.08, 0.72, plank, 'bunk-deck'), 0, 0.37, 0);
      // Folded wool blanket + rolled pillow
      addPart(g, makeScaledBox(1.06, 0.1, 0.66, red, 'wool-blanket'), 0.14, 0.46, 0);
      addPart(g, makeScaledBox(0.28, 0.14, 0.56, hemp, 'pillow-roll'), -0.52, 0.48, 0, 'detail');
      addPart(g, makeScaledBox(0.18, 0.12, 0.22, leather, 'side-satchel'), -0.54, 0.16, 0.42, 'detail');

      return finalizeUndergroundProp(g, this.meta, [1.44, 0.52, 0.76], 0xa83b36);
    },
  },
];

/**
 * Instanced proxy batching helper for distant underground camp dressing.
 */
export function buildInstancedUndergroundProxies(
  positions: ReadonlyArray<[number, number, number]>,
  color = 0x7b563c,
): InstancedMesh {
  const geo = new BoxGeometry(0.76, 0.76, 0.58);
  const mat = new FriendMaterialLibrary().get('terracotta');
  mat.color.setHex(color);
  mat.userData.friendSharedMaterial = false;
  const inst = new InstancedMesh(geo, mat, positions.length);
  inst.name = 'fr13-instanced-proxies';
  const m = new Matrix4();
  positions.forEach(([x, y, z], i) => {
    m.makeTranslation(x, y + 0.38, z);
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}
