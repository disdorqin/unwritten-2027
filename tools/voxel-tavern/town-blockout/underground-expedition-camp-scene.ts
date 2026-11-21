import {
  BoxGeometry, CanvasTexture, DataTexture, DoubleSide, Group, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, Object3D, PlaneGeometry, PointLight, SRGBColorSpace,
} from 'three';
import type { createUndergroundExpeditionCamps } from '../../../src/presence/underground-expedition-camps.js';

type Camp = ReturnType<ReturnType<typeof createUndergroundExpeditionCamps>['visibleCamps']>[number];
type Point = Camp['at'];
type Role = 'build' | 'stoke' | 'sit' | 'read-ashes';
const canon = { stone: 0x8a8378, earth: 0xa98a56, wood: 0x5d4630,
  green: 0x44503c, midnight: 0x2c3648, ember: 0xe08a3c, rust: 0x8a4a34 } as const;
export const expeditionCampWords = Object.freeze({
  marker: '前进营地 · 守火而行',
  remains: '旧灰印：有人在这里守过上一班火，灰里还有未燃尽的松针与生锈的铁钉。',
  seat: '坐下歇脚，暖意只按真实火圈受理',
  fuel: '添柴守火 · 火灭后可从残烬复燃',
  sign: '木炭、火种、空炉膛。路再深，也要留一盏灯。',
});
type Viewer = Readonly<{ id: string; layer: string; foot: Point }>;
type Options = Readonly<{
  parent: Group;
  readCamps(): readonly Camp[];
  readRevision(): number;
  /** An authoritative world support check: missing site is never drawn. */
  supportsCamp(site: Camp): boolean;
  /** Reuse U-13 approved scene-light budget, not new independent lights. */
  readLightBudget(): number;
  readViewer(): Viewer | undefined;
  canReach(playerId: string, site: Camp, role: Role): boolean;
  /** User input forwarding only; host must validate accepted feet and G-11 stock. */
  dispatch(command: Readonly<{ playerId: string; revision: number; campId?: string;
    role: Role; chosen?: Point }>): void;
  /** A fresh construction point can only come from an already accepted, supported foot. */
  supportsBuildFoot(point: Point): boolean;
}>;
type Model = Readonly<{
  group: Group; flames: Group; light: PointLight; ash: Group;
  update(phase: Camp['fire']['phase']): void; dispose(): void;
}>;
const sharedShapes: readonly [name: string, color: number, local: readonly [number, number, number],
  size: readonly [number, number, number]][] = [
  ['old-ash/stone', canon.stone, [2.06, .08, -1.55], [.52, .15, .40]],
  ['old-ash/coal', canon.midnight, [2.18, .16, -1.58], [.36, .08, .30]],
  ['old-ash/char', canon.wood, [2.29, .21, -1.53], [.14, .16, .38]],
  ['wooden-sign/post', canon.wood, [-1.92, .63, -1.95], [.17, 1.25, .16]],
  ['wooden-sign/face', canon.earth, [-1.92, 1.29, -1.95], [1.18, .46, .16]],
  ['wooden-sign/cap', canon.wood, [-1.92, 1.55, -1.95], [1.38, .08, .20]],
  ['supply-table/top', canon.wood, [-1.86, .73, 1.18], [1.11, .15, .72]],
  ['supply-table/l1', canon.wood, [-2.30, .35, 1.18], [.11, .66, .1]],
  ['supply-table/l2', canon.wood, [-1.47, .35, 1.18], [.11, .66, .1]],
  ['supply-table/crock', canon.rust, [-1.84, .89, 1.1], [.3, .22, .28]],
  ['supply-table/wick', canon.ember, [-1.84, 1.02, 1.1], [.09, .07, .07]],
];
const familyColors: readonly number[] = [canon.stone, canon.earth, canon.wood, canon.green, canon.midnight,
  canon.ember, canon.rust];
function grainTexture(a: number, b: number) {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const color = (x * 7 + y * 19 + Math.floor(y / 3) * 11) % 17 < 3 ? b : a;
    pixels.set([color >> 16, (color >> 8) & 255, color & 255, 255], (y * 16 + x) * 4);
  }
  const texture = new DataTexture(pixels, 16, 16);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
function createPrefab(camp: Camp): Model {
  const group = new Group();
  group.name = 'u18-expedition-camp/' + camp.id;
  group.position.set(camp.at.east, camp.at.height, -camp.at.north);
  const geometry = new BoxGeometry();
  const perFamily = new Map<number, Array<{ pos: readonly [number, number, number]; size: readonly [number, number, number] }>>();
  const box = (color: number, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const list = perFamily.get(color) ?? [];
    list.push({ pos: [x, y, z], size: [w, h, d] });
    perFamily.set(color, list);
  };
  // Outer hearth and a second ring of worn stones: no naked glowing floor disc.
  for (let i = 0; i < 16; i++) {
    const angle = i / 16 * Math.PI * 2;
    box(i % 5 ? canon.stone : canon.rust, Math.cos(angle) * .66, .13,
      Math.sin(angle) * .66, .36, .24, .30);
    box(i % 3 ? canon.earth : canon.midnight, Math.cos(angle) * .92, .04,
      Math.sin(angle) * .92, .22, .1, .24);
  }
  for (let i = 0; i < 5; i++) {
    const z = -.30 + i * .15;
    box(canon.wood, (i % 2 ? .12 : -.12), .16 + i * .03, z, .23, .12, .79);
    box(canon.rust, -.2 + i * .12, .10, z, .12, .08, .36);
  }
  // Benches, firewood stacks, lamp stakes, climbing rope and living supplies.
  for (const sign of [-1, 1]) {
    box(canon.wood, sign * 1.55, .51, -.10, .45, .18, 1.45);
    box(canon.wood, sign * 1.55, .24, -.70, .24, .45, .20);
    box(canon.wood, sign * 1.55, .24, .50, .24, .45, .20);
    box(canon.green, sign * 1.55, .64, -.10, .34, .07, 1.1);
    for (let row = 0; row < 3; row++) {
      box(canon.wood, sign * (1.78 + .19 * row), .16 + .13 * row, 1.08,
        .2, .19, .93 - row * .12);
    }
  }
  for (let i = 0; i < 8; i++) {
    const x = -2.32 + i * .09;
    box(i % 3 ? canon.rust : canon.midnight, x, .06, 1.6, .1, .12, .22);
    box(canon.earth, x, .14, 1.7, .05, .06, .14);
  }
  for (const [name, color, p, s] of sharedShapes) {
    box(color, p[0], p[1], p[2], s[0], s[1], s[2]);
  }
  for (let i = 0; i < 9; i++) {
    const x = 2.18 + (i % 3 - 1) * .28;
    const z = -1.6 + Math.floor(i / 3) * .2;
    box(i % 2 ? canon.stone : canon.midnight, x, .04, z, .17, .08, .2);
  }
  // An inherited tools-and-kindling cache surrounds the older spent-ash footprint.
  // Group it in two clusters: wood shavings by the bench, ore dust beside the memorial.
  for (let i = 0; i < 14; i++) {
    const x = -1.10 + (i % 7) * .13;
    const z = 1.45 + Math.floor(i / 7) * .18;
    box(i % 4 ? canon.wood : canon.earth, x, .045, z, .07, .06, .23);
  }
  for (let i = 0; i < 14; i++) {
    const x = 1.83 + (i % 7) * .13;
    const z = -2.15 + Math.floor(i / 7) * .18;
    box(i % 3 ? canon.midnight : canon.rust, x, .027, z, .09, .05, .11);
  }
  const materials: MeshStandardMaterial[] = [];
  const maps: DataTexture[] = [];
  const batches: InstancedMesh[] = [];
  const pose = new Object3D();
  for (const [color, pieces] of perFamily) {
    const map = grainTexture(color, color === canon.stone ? canon.midnight :
      color === canon.wood ? canon.earth : canon.wood);
    const material = new MeshStandardMaterial({ map, roughness: .94, metalness: 0,
      flatShading: true });
    const mesh = new InstancedMesh(geometry, material, pieces.length);
    mesh.name = 'u18-camp-voxels/' + familyColors.indexOf(color);
    pieces.forEach((piece, i) => {
      pose.position.fromArray(piece.pos);
      pose.scale.fromArray(piece.size);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    materials.push(material); maps.push(map); batches.push(mesh);
  }
  const flames = new Group();
  flames.name = 'u18-flame-stack';
  group.add(flames);
  const flameMat = new MeshStandardMaterial({ color: canon.ember, emissive: canon.ember,
    emissiveIntensity: 1.45, transparent: true, opacity: .86 });
  for (let i = 0; i < 9; i++) {
    const m = new Mesh(geometry, flameMat);
    m.position.set((i % 3 - 1) * .17, .4 + Math.floor(i / 3) * .14, (i % 2 - .5) * .14);
    m.rotation.z = (i % 3 - 1) * .18;
    m.scale.set(.17, .33 - Math.floor(i / 3) * .045, .18);
    flames.add(m);
  }
  const ash = new Group();
  ash.name = 'u18-old-expedition-ash';
  ash.position.set(2.17, .12, -1.57);
  group.add(ash);
  const ashes = new Mesh(geometry, new MeshBasicMaterial({ color: canon.midnight }));
  ashes.scale.set(.52, .07, .39);
  ash.add(ashes);
  // The old expedition sign has real fixed copy on its physical board, not only an inventory label.
  let sign: Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#5d4630';
      context.fillRect(0, 0, 1024, 256);
      context.strokeStyle = '#a98a56';
      context.lineWidth = 14;
      context.strokeRect(10, 10, 1004, 236);
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.font = 'bold 74px "Microsoft YaHei","Noto Sans CJK SC",sans-serif';
      context.fillStyle = '#e8ecf0';
      context.fillText(expeditionCampWords.marker, 512, 120, 970);
      const map = new CanvasTexture(canvas);
      map.minFilter = map.magFilter = NearestFilter;
      map.colorSpace = SRGBColorSpace;
      const material = new MeshBasicMaterial({ map, side: DoubleSide });
      sign = new Mesh(new PlaneGeometry(1.15, .42), material);
      sign.name = 'u18-expedition-engraved-wooden-sign';
      sign.position.set(-1.92, 1.29, -1.85);
      group.add(sign);
    }
  }
  const light = new PointLight(canon.ember, 8, 8, 2);
  light.name = 'u18-shared-authority-fire-light';
  light.position.set(0, .85, 0);
  group.add(light);
  light.visible = false;
  let disposed = false;
  function update(phase: Camp['fire']['phase']) {
    if (disposed) return;
    flames.visible = phase !== 'out';
    flames.scale.setScalar(phase === 'weak' ? .45 : 1);
    const material = flameMat;
    material.opacity = phase === 'weak' ? .45 : .86;
    ash.visible = true;
  }
  update(camp.fire.phase);
  return {
    group, flames, light, ash, update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const batch of batches) batch.dispose();
      for (const material of materials) material.dispose();
      for (const map of maps) map.dispose();
      geometry.dispose();
      flameMat.dispose();
      ashes.material.dispose();
      sign?.material.map?.dispose();
      sign?.material.dispose();
      sign?.geometry.dispose();
      group.clear();
    },
  };
}

/** Render accepted U-18 site snapshots. Safety/HP/monster/spawn always read U-13, not this renderer. */
export function mountUndergroundExpeditionCampScene(host: Options) {
  const group = new Group();
  group.name = 'u18-shared-underground-expedition-camps';
  const models = new Map<string, Model>();
  const known = new Map<string, Camp>();
  host.parent.add(group);
  let disposed = false;
  function sync() {
    if (disposed) return;
    const sites = host.readCamps();
    const current = new Set<string>();
    const seen = new Set<string>();
    for (const site of sites) {
      if (!site.id.trim() || seen.has(site.id) || !site.at.layer.trim() ||
          ![site.at.east, site.at.north, site.at.height].every(Number.isFinite) ||
          host.supportsCamp(site) !== true) continue;
      seen.add(site.id);
      current.add(site.id);
      let model = models.get(site.id);
      const before = known.get(site.id);
      if (before && (before.at.layer !== site.at.layer ||
          before.at.east !== site.at.east || before.at.north !== site.at.north ||
          before.at.height !== site.at.height)) {
        model?.dispose();
        models.delete(site.id);
        model = undefined;
      }
      if (!model) {
        model = createPrefab(site);
        group.add(model.group);
        models.set(site.id, model);
      }
      model.update(site.fire.phase);
      known.set(site.id, site);
    }
    for (const [id, model] of models) if (!current.has(id)) {
      model.dispose(); models.delete(id); known.delete(id);
    }
    const lightBudget = Math.max(0, Math.floor(host.readLightBudget()));
    let lights = 0;
    for (const [id, model] of models) {
      const available = known.get(id)?.fire.phase !== 'out' && lights < lightBudget;
      model.light.visible = available;
      if (available) lights++;
    }
  }
  sync();
  type VisitRole = 'stoke' | 'sit' | 'read-ashes';
  function prompt(role: VisitRole = 'stoke') {
    const player = host.readViewer();
    if (!player || !player.id.trim() || disposed) return;
    const labels = { stoke: expeditionCampWords.fuel, sit: expeditionCampWords.seat,
      'read-ashes': expeditionCampWords.remains } as const;
    for (const [id, site] of known) {
      if (site.at.layer !== player.layer || ![player.foot.east, player.foot.north,
          player.foot.height].every(Number.isFinite)) continue;
      const target = role === 'stoke' ? site.at : role === 'sit' ?
        { ...site.at, east: site.at.east + 1.55 } :
        { ...site.at, east: site.at.east + 2.17, north: site.at.north + 1.57 };
      const distance = Math.hypot(player.foot.east - target.east,
        player.foot.north - target.north, player.foot.height - target.height);
      if (distance <= 1.6 && host.canReach(player.id, site, role))
        return { id: 'u18/' + id + '/' + role, role, campId: id, label: labels[role] };
    }
  }
  function pressRole(role: VisitRole, expectedCampId: string) {
    const player = host.readViewer();
    const current = prompt(role);
    if (!player || !current || current.campId !== expectedCampId) return false;
    // The host authorizes sitting/recovery and persists memorial discovery. No local HP grant.
    host.dispatch({ playerId: player.id, revision: host.readRevision(),
      campId: expectedCampId, role });
    return true;
  }
  function pressStoke(expectedCampId: string) {
    return pressRole('stoke', expectedCampId);
  }
  function chooseBuild(point: Point) {
    const player = host.readViewer();
    if (!player || player.layer !== point.layer || !host.supportsBuildFoot(point) ||
        Math.hypot(point.east - player.foot.east, point.north - player.foot.north,
          point.height - player.foot.height) > 1.8) return false;
    host.dispatch({ playerId: player.id, revision: host.readRevision(), role: 'build',
      chosen: { ...point } });
    return true;
  }
  return {
    group, known, prompt, pressRole, pressStoke, chooseBuild, sync, words: expeditionCampWords,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const model of models.values()) model.dispose();
      models.clear(); known.clear();
      group.removeFromParent(); group.clear();
    },
  };
}
