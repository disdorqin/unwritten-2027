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
 * FR-11: 坑区可复用工业小件库 (8 classes)
 *
 * Reusable small industrial dressing for the crater/pit zone: ore crates,
 * protective gear racks, tool chests, pipe manifolds, gauge boards,
 * old rope spools, hazard bollards, and oil canisters.
 * Strictly avoids duplicating B-lane's 5 major interactive machines and
 * defines no new world authority or story state.
 */

export interface PitPropEntry {
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

function finalizePitProp(
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
    meta.id.length * 67 + 19,
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

export const FR11_PIT_PROPS_CATALOG: readonly PitPropEntry[] = [
  // 1. 矿料木石箱 (Ore & Crushed Rock Crate)
  {
    meta: {
      id: 'fr11-ore-crate',
      name: '矿料木石箱',
      pack: 'FR-11',
      category: '坑区储运',
      dimensions: [0.96, 0.72, 0.78],
      colliders: [{ center: [0, 0.36, 0], size: [0.92, 0.7, 0.74], solid: true, label: 'ore-crate-body' }],
      lod: { nearDistance: 14, farDistance: 38, cullDistance: 72, instancingReady: true },
      clearanceNote: '低矮箱体 0.72m，贴墙或成组堆放时预留 ≥0.9m 通道',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const plank = libs.get('wood_plank');
      const iron = libs.get('iron');
      const rock = libs.get('dark_rock');
      const amber = libs.get('glow_amber');

      // Base skids and timber crate walls
      addPart(g, makeScaledBox(0.88, 0.08, 0.14, dark, 'skid-front'), 0, 0.04, 0.28);
      addPart(g, makeScaledBox(0.88, 0.08, 0.14, dark, 'skid-back'), 0, 0.04, -0.28);
      addPart(g, makeScaledBox(0.9, 0.42, 0.72, plank, 'crate-core'), 0, 0.29, 0);
      // Corner iron brackets
      for (const sx of [-0.43, 0.43]) {
        for (const sz of [-0.34, 0.34]) {
          addPart(g, makeScaledBox(0.08, 0.46, 0.08, iron, 'corner-bracket'), sx, 0.3, sz, 'detail');
        }
      }
      // Side iron handles
      addPart(g, makeScaledBox(0.06, 0.08, 0.24, iron, 'handle-l'), -0.47, 0.36, 0, 'detail');
      addPart(g, makeScaledBox(0.06, 0.08, 0.24, iron, 'handle-r'), 0.47, 0.36, 0, 'detail');
      // Heap of crushed ore blocks & mineral flecks
      addPart(g, makeScaledBox(0.68, 0.16, 0.52, rock, 'ore-bed'), 0, 0.56, 0);
      addPart(g, makeScaledBox(0.28, 0.16, 0.24, rock, 'ore-chunk-a'), -0.14, 0.64, 0.06, 'detail');
      addPart(g, makeScaledBox(0.24, 0.14, 0.22, rock, 'ore-chunk-b'), 0.16, 0.63, -0.08, 'detail');
      addPart(g, makeScaledBox(0.1, 0.08, 0.1, amber, 'ore-vein-gleam'), 0.04, 0.68, 0.08, 'detail');

      return finalizePitProp(g, this.meta, [0.94, 0.68, 0.76], 0xa66e44);
    },
  },

  // 2. 坑区护具挂架 (Protective Gear Rack)
  {
    meta: {
      id: 'fr11-gear-rack',
      name: '坑区护具挂架',
      pack: 'FR-11',
      category: '安全护具',
      dimensions: [1.18, 1.82, 0.52],
      colliders: [{ center: [0, 0.9, 0], size: [1.12, 1.8, 0.48], solid: true, label: 'gear-rack-frame' }],
      lod: { nearDistance: 14, farDistance: 36, cullDistance: 68, instancingReady: false },
      clearanceNote: '沿矿棚/通道侧壁靠放，正面预留 0.8m 穿戴空间',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const warm = libs.get('wood_warm');
      const iron = libs.get('iron');
      const yellow = libs.get('safety_yellow');
      const leather = libs.get('leather_brown');

      // Feet & uprights
      addPart(g, makeScaledBox(0.12, 0.08, 0.5, dark, 'foot-l'), -0.52, 0.04, 0);
      addPart(g, makeScaledBox(0.12, 0.08, 0.5, dark, 'foot-r'), 0.52, 0.04, 0);
      addPart(g, makeScaledBox(0.1, 1.72, 0.1, dark, 'post-l'), -0.52, 0.94, 0);
      addPart(g, makeScaledBox(0.1, 1.72, 0.1, dark, 'post-r'), 0.52, 0.94, 0);
      // Bottom boot bench & top helmet shelf
      addPart(g, makeScaledBox(1.12, 0.07, 0.36, warm, 'boot-shelf'), 0, 0.24, 0);
      addPart(g, makeScaledBox(1.14, 0.07, 0.34, warm, 'helmet-shelf'), 0, 1.56, 0);
      addPart(g, makeScaledBox(1.06, 0.12, 0.06, dark, 'hook-rail'), 0, 1.28, -0.02);

      // Two hard hats on top shelf
      for (const hx of [-0.28, 0.24]) {
        addPart(g, makeScaledBox(0.28, 0.05, 0.3, yellow, 'helmet-brim'), hx, 1.62, 0.02, 'detail');
        addPart(g, makeScaledBox(0.22, 0.14, 0.24, yellow, 'helmet-dome'), hx, 1.71, 0.02, 'detail');
      }
      // Hanging leather aprons & iron hooks
      for (const ax of [-0.3, 0.02, 0.32]) {
        addPart(g, makeScaledBox(0.04, 0.08, 0.08, iron, 'peg'), ax, 1.28, 0.04, 'detail');
        addPart(g, makeScaledBox(0.24, 0.72, 0.05, leather, 'apron'), ax, 0.88, 0.06, 'detail');
      }
      // Mining boots on bottom shelf
      addPart(g, makeScaledBox(0.14, 0.2, 0.24, leather, 'boot-l'), -0.26, 0.37, 0.02, 'detail');
      addPart(g, makeScaledBox(0.14, 0.2, 0.24, leather, 'boot-r'), -0.06, 0.37, 0.02, 'detail');

      return finalizePitProp(g, this.meta, [1.14, 1.8, 0.46], 0x4b3326);
    },
  },

  // 3. 便携铁木工具箱 (Portable Pit Tool Chest)
  {
    meta: {
      id: 'fr11-tool-chest',
      name: '便携铁木工具箱',
      pack: 'FR-11',
      category: '维修工具',
      dimensions: [0.76, 0.48, 0.44],
      colliders: [{ center: [0, 0.24, 0], size: [0.72, 0.46, 0.42], solid: false, label: 'tool-chest-low' }],
      lod: { nearDistance: 12, farDistance: 32, cullDistance: 60, instancingReady: true },
      clearanceNote: '低矮可跨过/摆台道具，solid=false 避免卡住工坊窄道',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const rust = libs.get('rust_iron');
      const iron = libs.get('iron');
      const brass = libs.get('brass');
      const warm = libs.get('wood_warm');

      // Lower chest & stepped lid
      addPart(g, makeScaledBox(0.7, 0.26, 0.38, rust, 'chest-base'), 0, 0.13, 0);
      addPart(g, makeScaledBox(0.72, 0.08, 0.4, iron, 'chest-rim'), 0, 0.28, 0);
      addPart(g, makeScaledBox(0.62, 0.1, 0.32, warm, 'chest-lid'), 0, 0.36, 0);
      // Brass clasps & top carry bar
      addPart(g, makeScaledBox(0.08, 0.1, 0.04, brass, 'clasp-l'), -0.18, 0.27, 0.2, 'detail');
      addPart(g, makeScaledBox(0.08, 0.1, 0.04, brass, 'clasp-r'), 0.18, 0.27, 0.2, 'detail');
      addPart(g, makeScaledBox(0.05, 0.07, 0.05, iron, 'handle-post-l'), -0.14, 0.43, 0, 'detail');
      addPart(g, makeScaledBox(0.05, 0.07, 0.05, iron, 'handle-post-r'), 0.14, 0.43, 0, 'detail');
      addPart(g, makeScaledBox(0.32, 0.04, 0.05, warm, 'handle-grip'), 0, 0.46, 0, 'detail');
      // Wrench resting beside chest
      addPart(g, makeScaledBox(0.32, 0.04, 0.07, iron, 'side-wrench'), 0.16, 0.02, 0.26, 'detail');

      return finalizePitProp(g, this.meta, [0.72, 0.42, 0.4], 0x6f4232);
    },
  },

  // 4. 工业管件与阀门组 (Industrial Pipe & Valve Manifold)
  {
    meta: {
      id: 'fr11-pipe-manifold',
      name: '工业管件与阀门组',
      pack: 'FR-11',
      category: '管路设施',
      dimensions: [1.34, 0.94, 0.46],
      colliders: [{ center: [0, 0.46, 0], size: [1.28, 0.92, 0.42], solid: true, label: 'pipe-manifold' }],
      lod: { nearDistance: 16, farDistance: 44, cullDistance: 80, instancingReady: true },
      clearanceNote: '适用于坑壁/支护柱旁装饰，阀门手轮朝向走廊侧',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const stone = libs.get('stone_block');
      const iron = libs.get('iron');
      const rust = libs.get('rust_iron');
      const red = libs.get('cloth_red');
      const brass = libs.get('brass');

      // Stone anchor blocks
      addPart(g, makeScaledBox(0.32, 0.24, 0.38, stone, 'plinth-l'), -0.44, 0.12, 0);
      addPart(g, makeScaledBox(0.32, 0.24, 0.38, stone, 'plinth-r'), 0.44, 0.12, 0);
      // Vertical risers & main horizontal pipe
      addPart(g, makeScaledBox(0.18, 0.46, 0.18, iron, 'riser-l'), -0.44, 0.47, 0);
      addPart(g, makeScaledBox(0.18, 0.46, 0.18, iron, 'riser-r'), 0.44, 0.47, 0);
      addPart(g, makeScaledBox(1.18, 0.18, 0.18, rust, 'main-pipe'), 0, 0.62, 0);
      // Flange collars
      for (const fx of [-0.44, -0.14, 0.18, 0.44]) {
        addPart(g, makeScaledBox(0.06, 0.24, 0.24, iron, 'flange'), fx, 0.62, 0, 'detail');
      }
      // Red handwheel valve + brass gauge
      addPart(g, makeScaledBox(0.08, 0.16, 0.08, brass, 'valve-stem'), -0.14, 0.78, 0, 'detail');
      addPart(g, makeScaledBox(0.24, 0.04, 0.24, red, 'valve-wheel'), -0.14, 0.88, 0, 'detail');
      addPart(g, makeScaledBox(0.06, 0.12, 0.06, brass, 'gauge-neck'), 0.22, 0.76, 0, 'detail');
      addPart(g, makeScaledBox(0.14, 0.14, 0.06, brass, 'gauge-dial'), 0.22, 0.86, 0, 'detail');

      return finalizePitProp(g, this.meta, [1.28, 0.88, 0.4], 0x3b4046);
    },
  },

  // 5. 坑区计量标牌 (Pit Gauge & Warning Board)
  {
    meta: {
      id: 'fr11-gauge-board',
      name: '坑区计量标牌',
      pack: 'FR-11',
      category: '计量警示',
      dimensions: [0.84, 1.86, 0.38],
      colliders: [{ center: [0, 0.92, 0], size: [0.76, 1.84, 0.34], solid: true, label: 'gauge-board-post' }],
      lod: { nearDistance: 16, farDistance: 44, cullDistance: 78, instancingReady: true },
      clearanceNote: '牌面距地 1.1m–1.8m，方便第一人称平视读数',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const iron = libs.get('iron');
      const dark = libs.get('wood_dark');
      const yellow = libs.get('safety_yellow');
      const paper = libs.get('paper_warm');
      const brass = libs.get('brass');

      addPart(g, makeScaledBox(0.46, 0.14, 0.36, iron, 'base-foot'), 0, 0.07, 0);
      addPart(g, makeScaledBox(0.1, 1.56, 0.1, iron, 'post-l'), -0.26, 0.92, 0);
      addPart(g, makeScaledBox(0.1, 1.56, 0.1, iron, 'post-r'), 0.26, 0.92, 0);
      // Backing board + yellow warning header
      addPart(g, makeScaledBox(0.76, 0.72, 0.08, dark, 'board-frame'), 0, 1.42, 0);
      addPart(g, makeScaledBox(0.68, 0.12, 0.09, yellow, 'warn-header'), 0, 1.72, 0.01);
      addPart(g, makeScaledBox(0.64, 0.46, 0.05, paper, 'meter-sheet'), 0, 1.38, 0.03);
      // Twin brass dial rims + indicator needles
      addPart(g, makeScaledBox(0.22, 0.22, 0.04, brass, 'dial-l'), -0.16, 1.44, 0.05, 'detail');
      addPart(g, makeScaledBox(0.22, 0.22, 0.04, brass, 'dial-r'), 0.16, 1.44, 0.05, 'detail');
      addPart(g, makeScaledBox(0.56, 0.08, 0.04, iron, 'scale-bar'), 0, 1.24, 0.05, 'detail');

      return finalizePitProp(g, this.meta, [0.78, 1.82, 0.36], 0xd8a334);
    },
  },

  // 6. 旧麻绳盘车 (Weathered Rope Spool)
  {
    meta: {
      id: 'fr11-rope-spool',
      name: '旧麻绳盘车',
      pack: 'FR-11',
      category: '索具储放',
      dimensions: [0.88, 0.82, 0.76],
      colliders: [{ center: [0, 0.41, 0], size: [0.84, 0.8, 0.72], solid: true, label: 'rope-spool-stand' }],
      lod: { nearDistance: 14, farDistance: 40, cullDistance: 74, instancingReady: true },
      clearanceNote: '可用于斜坡缆道旁或仓库角落，独立摆设不与主绞盘抢占通道',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const dark = libs.get('wood_dark');
      const plank = libs.get('wood_plank');
      const iron = libs.get('iron');
      const hemp = libs.get('rope_hemp');

      // A-frame stand
      addPart(g, makeScaledBox(0.84, 0.08, 0.68, dark, 'sled-base'), 0, 0.04, 0);
      addPart(g, makeScaledBox(0.1, 0.56, 0.14, dark, 'stanchion-l'), -0.34, 0.36, 0);
      addPart(g, makeScaledBox(0.1, 0.56, 0.14, dark, 'stanchion-r'), 0.34, 0.36, 0);
      // Spool axle & side flanges
      addPart(g, makeScaledBox(0.82, 0.08, 0.08, iron, 'axle'), 0, 0.46, 0);
      addPart(g, makeScaledBox(0.07, 0.62, 0.62, plank, 'flange-l'), -0.25, 0.46, 0);
      addPart(g, makeScaledBox(0.07, 0.62, 0.62, plank, 'flange-r'), 0.25, 0.46, 0);
      // Wound hemp rope core + stepped ribs + trailing tail
      addPart(g, makeScaledBox(0.42, 0.46, 0.46, hemp, 'rope-coil'), 0, 0.46, 0);
      addPart(g, makeScaledBox(0.38, 0.5, 0.28, hemp, 'rope-ridge-v'), 0, 0.46, 0, 'detail');
      addPart(g, makeScaledBox(0.38, 0.28, 0.5, hemp, 'rope-ridge-h'), 0, 0.46, 0, 'detail');
      addPart(g, makeScaledBox(0.12, 0.06, 0.34, hemp, 'rope-tail'), 0.16, 0.11, 0.3, 'detail');

      return finalizePitProp(g, this.meta, [0.84, 0.78, 0.68], 0xb59564);
    },
  },

  // 7. 坑道防撞警示桩 (Pit Hazard Bollard)
  {
    meta: {
      id: 'fr11-hazard-bollard',
      name: '坑道防撞警示桩',
      pack: 'FR-11',
      category: '安全边界',
      dimensions: [0.38, 1.02, 0.38],
      colliders: [{ center: [0, 0.5, 0], size: [0.34, 1.0, 0.34], solid: true, label: 'hazard-bollard' }],
      lod: { nearDistance: 16, farDistance: 46, cullDistance: 85, instancingReady: true },
      clearanceNote: '窄柱体 0.34m，用于边缘/轨侧安全隔离',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const iron = libs.get('iron');
      const yellow = libs.get('safety_yellow');
      const glow = libs.get('glow_amber');

      addPart(g, makeScaledBox(0.36, 0.12, 0.36, iron, 'bollard-base'), 0, 0.06, 0);
      addPart(g, makeScaledBox(0.2, 0.34, 0.2, iron, 'stem-lower'), 0, 0.29, 0);
      addPart(g, makeScaledBox(0.22, 0.22, 0.22, yellow, 'band-yellow'), 0, 0.57, 0);
      addPart(g, makeScaledBox(0.2, 0.22, 0.2, iron, 'stem-upper'), 0, 0.79, 0);
      addPart(g, makeScaledBox(0.16, 0.08, 0.16, glow, 'beacon-cap'), 0, 0.94, 0, 'detail');
      // Chain eyelets
      addPart(g, makeScaledBox(0.28, 0.05, 0.06, iron, 'chain-lugs'), 0, 0.72, 0, 'detail');

      return finalizePitProp(g, this.meta, [0.34, 0.98, 0.34], 0xd8a334);
    },
  },

  // 8. 铁皮润滑油桶组 (Iron Oil Canister & Funnel Set)
  {
    meta: {
      id: 'fr11-oil-canister',
      name: '铁皮润滑油桶组',
      pack: 'FR-11',
      category: '工坊耗材',
      dimensions: [0.68, 0.86, 0.58],
      colliders: [{ center: [0, 0.42, 0], size: [0.62, 0.84, 0.54], solid: true, label: 'oil-drum-set' }],
      lod: { nearDistance: 14, farDistance: 40, cullDistance: 72, instancingReady: true },
      clearanceNote: '圆角体素油桶+旁置铜壶，可成对放置在维修平台旁',
      license: 'Original-Procedural-MIT',
    },
    build(libs) {
      const g = new Group();
      const rust = libs.get('rust_iron');
      const iron = libs.get('iron');
      const brass = libs.get('brass');
      const dark = libs.get('wood_dark');

      // Timber drip pallet
      addPart(g, makeScaledBox(0.64, 0.06, 0.54, dark, 'drip-pallet'), 0, 0.03, 0);
      // Main tall drum
      addPart(g, makeScaledBox(0.42, 0.72, 0.42, rust, 'drum-body'), -0.06, 0.42, -0.02);
      addPart(g, makeScaledBox(0.45, 0.05, 0.45, iron, 'drum-rib-low'), -0.06, 0.28, -0.02, 'detail');
      addPart(g, makeScaledBox(0.45, 0.05, 0.45, iron, 'drum-rib-high'), -0.06, 0.58, -0.02, 'detail');
      addPart(g, makeScaledBox(0.1, 0.06, 0.1, brass, 'drum-bung'), -0.02, 0.81, -0.02, 'detail');
      // Small brass oil jug beside drum
      addPart(g, makeScaledBox(0.18, 0.24, 0.18, brass, 'oil-jug'), 0.22, 0.18, 0.14, 'detail');
      addPart(g, makeScaledBox(0.06, 0.1, 0.06, iron, 'jug-spout'), 0.28, 0.32, 0.18, 'detail');

      return finalizePitProp(g, this.meta, [0.64, 0.82, 0.54], 0x6f4232);
    },
  },
];

/**
 * Create an InstancedMesh batch of simplified pit prop proxies for far-range
 * crater dressing without per-prop draw calls.
 */
export function buildInstancedPitProxies(
  positions: ReadonlyArray<[number, number, number]>,
  color = 0x8b6a48,
): InstancedMesh {
  const geo = new BoxGeometry(0.72, 0.82, 0.62);
  const mat = new FriendMaterialLibrary().get('rust_iron');
  mat.color.setHex(color);
  mat.userData.friendSharedMaterial = false;
  const inst = new InstancedMesh(geo, mat, positions.length);
  inst.name = 'fr11-instanced-proxies';
  const m = new Matrix4();
  positions.forEach(([x, y, z], i) => {
    m.makeTranslation(x, y + 0.41, z);
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}
