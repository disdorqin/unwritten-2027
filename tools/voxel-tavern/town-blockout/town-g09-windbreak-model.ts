import { BoxGeometry, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';

/**
 * ZB-20 / seven-round MODEL CANDIDATE: a fully formed G-09 windbreak court.
 *
 * B owns the reusable modeling source; A owns the public town viewer mount.
 * Deliberately no fixed global position, no fake independent weather clock,
 * and no second group of snow particles. Distinct building geometry can be
 * disposed with this module without welding it into the old town batch.
 *
 * Palette is taken from docs/ART.md and the existing post/tavern voxel assets;
 * exact screenshot-by-screenshot reference comparison remains an R4 gate.
 */
export const windbreakVoxelStep = 1 / 16;

export type WindbreakColor =
  | 'foundation' | 'timber' | 'timberDark' | 'woodWarm' | 'slate' | 'slateEdge'
  | 'snow' | 'snowShadow' | 'copper' | 'lantern' | 'amber' | 'glass' | 'banner' | 'coal' | 'pineDeep' | 'pineLight';
export type WindbreakSolid = Readonly<{
  tag: string;
  center: readonly [number, number, number];
  size: readonly [number, number, number];
}>;
export type WindbreakInteraction = Readonly<{
  id: 'windbreak-rest' | 'windbreak-warmth' | 'windbreak-weather-board' | 'windbreak-photo';
  kind: 'sit' | 'warmth' | 'read-weather' | 'photo';
  at: readonly [number, number, number];
  reach: number;
}>;
export type WindbreakBuild = Readonly<{
  group: Group;
  solids: readonly WindbreakSolid[];
  interactions: readonly WindbreakInteraction[];
  blocks: number;
  drawBatches: number;
  /** Caller owns and disposes the entire independent model package. */
  dispose(): void;
}>;

const palette: Readonly<Record<WindbreakColor, string>> = {
  foundation: '#818997',
  timber: '#64412d',
  timberDark: '#3e2a25',
  woodWarm: '#945934',
  slate: '#334c68',
  slateEdge: '#405b77',
  snow: '#cce7fa',
  snowShadow: '#a8c6d6',
  copper: '#d3a258',
  lantern: '#b64734',
  amber: '#ffe6ac',
  glass: '#ffd482',
  banner: '#a6362e',
  coal: '#292329',
  pineDeep: '#36534e',
  pineLight: '#497264',
};

type Voxel = Readonly<{
  color: WindbreakColor;
  centre: readonly [number, number, number];
  size: readonly [number, number, number];
  tag: string;
  collision: boolean;
}>;

const snap = (value: number) => Math.round(value / windbreakVoxelStep) * windbreakVoxelStep;
const shape = new BoxGeometry(1, 1, 1);

function winterWindbreakBlocks() {
  const parts: Voxel[] = [];
  const box = (
    color: WindbreakColor, tag: string,
    x: number, y: number, z: number, w: number, h: number, d: number,
    collision = false,
  ) => {
    const centre = [snap(x), snap(y), snap(z)] as const;
    const size = [snap(w), snap(h), snap(d)] as const;
    if (size.some(item => item < windbreakVoxelStep)) throw new RangeError('Invalid windbreak voxel');
    parts.push({ color, tag, centre, size, collision });
  };

  // R1. Windbreak hall: real walkable 3.0m high front opening rather than a
  // capped facade. A covered area, not a duplicate of the post office/tavern.
  box('foundation', 'hall-stone-footing', 0, .125, 0, 8.5, .25, 6.5, true);
  box('woodWarm', 'hall-timber-floor', 0, .3125, 0, 8, .125, 6, false);
  for (const x of [-3.875, 3.875]) {
    for (const z of [-2.875, 0, 2.875]) {
      box('timberDark', 'hall-post', x, 2.1875, z, .3125, 3.75, .3125, true);
      box('copper', 'post-foot-bracket', x, .5, z, .4375, .1875, .4375);
    }
  }
  // Back wall timber bays; every second slat is a warmer grain shade.
  for (let xi = 0; xi < 16; xi++) {
    const x = -3.75 + xi * .5 + .25;
    for (let yi = 0; yi < 7; yi++) {
      const y = .5625 + yi * .5;
      const isWindow = (xi >= 2 && xi <= 5 || xi >= 10 && xi <= 13) && yi >= 2 && yi <= 5;
      if (!isWindow) {
        box((xi + yi) % 4 === 0 ? 'woodWarm' : 'timber', 'hall-back-wall',
          x, y, 2.875, .5, .5, .1875, true);
      }
    }
  }
  for (const x of [-2, 2]) {
    box('glass', 'amber-back-window', x, 1.9375, 2.875, 1.875, 1.875, .0625);
    box('timberDark', 'window-vertical-mullion', x, 1.9375, 2.8125, .125, 1.9375, .1875);
    for (const y of [1.25, 2.625]) {
      box('woodWarm', 'window-horizontal-mullion', x, y, 2.8125, 1.9375, .125, .1875);
    }
    box('snow', 'window-snow-sill', x, 2.96875, 2.65625, 2.125, .125, .4375);
  }
  // Side walls with open windscreen slats: protected outside but no dead rooms.
  for (const side of [-1, 1]) {
    for (let zi = 0; zi < 9; zi++) {
      const z = -2.375 + zi * .5625;
      for (let yi = 0; yi < 6; yi++) {
        if (zi >= 3 && zi <= 5 && yi >= 2 && yi <= 4) continue;
        const y = .6875 + yi * .5;
        box(yi % 2 ? 'woodWarm' : 'timber', 'hall-side-bays',
          side * 3.875, y, z, .1875, .5, .5625, true);
      }
    }
  }
  // Open front lintel/rail, high enough to give 3.0m clear headroom.
  box('timberDark', 'hall-front-lintel', 0, 3.96875, -2.875, 8, .3125, .3125);
  for (const x of [-3.5, 3.5]) {
    box('lantern', 'front-festival-ribbon', x, 3.125, -3.1, .375, .875, .0625);
  }

  // R1/R2. Stepped 1/16m box-tiling, each side has actual courses, side
  // drip edges, layered eaves and snow; no oversized roof cube.
  for (let course = 0; course < 13; course++) {
    const rise = course * .1875;
    const side = 4.375 - course * .3125;
    const width = .4375;
    for (const sign of [-1, 1]) {
      const x = sign * side;
      box(course % 2 ? 'slate' : 'slateEdge', 'tiled-roof-course',
        x, 4.25 + rise, 0, width, .3125, 7.0, true);
      for (let strip = 0; strip < 11; strip++) {
        const z = -3.125 + strip * .625;
        box(strip % 3 === 0 ? 'snow' : 'snowShadow', 'snowy-roof-tiles',
          x, 4.46875 + rise, z, width, .0625, .5625);
      }
    }
  }
  box('timberDark', 'ridge-beam', 0, 6.75, 0, .5625, .3125, 7.25);
  box('snow', 'ridge-snowcap', 0, 6.96875, 0, .625, .125, 7.375);
  // R2 interior tables, resting bench, stacked firewood and ceiling fixtures.
  for (const x of [-2.125, .875]) {
    box('woodWarm', 'rest-table-top', x, .875, .75, 1.5, .125, .875);
    for (const leg of [-.5625, .5625]) {
      box('timber', 'rest-table-legs', x + leg, .5, .75, .125, .75, .625);
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = -2.75 + i * 1.125;
    box('woodWarm', 'rest-bench-seat', x, .59375, -1, 1, .125, .6875);
    box('timberDark', 'rest-bench-back', x, .96875, -.625, 1, .625, .125);
    for (const s of [-.3125, .3125]) {
      box('timber', 'bench-leg', x + s, .3125, -1, .125, .5, .5);
    }
  }
  for (let i = 0; i < 7; i++) {
    box('woodWarm', 'stacked-logs', 2.75 + (i % 2) * .25, .5 + Math.floor(i / 2) * .25,
      1.375, 1, .1875, .25);
  }
  for (const x of [-2.5, 2.5]) {
    box('timberDark', 'ceiling-pendant', x, 3.5, -.625, .125, 1.125, .125);
    box('amber', 'warm-ceremony-lamp', x, 2.9375, -.625, .625, .5625, .625);
    box('copper', 'lamp-crown', x, 3.21875, -.625, .75, .125, .75);
  }

  // R1. Separate raised weather notice & wind vane beside the hall.
  for (const x of [9.625, 12.875]) {
    box('timberDark', 'weather-board-pillars', x, 2.0, -.5, .3125, 4, .3125, true);
    box('foundation', 'weather-board-feet', x, .25, -.5, .6875, .5, .6875, true);
  }
  box('timber', 'weather-board-panel', 11.25, 2.3125, -.5, 3, 2.3125, .25);
  box('slate', 'weather-board-screen', 11.25, 2.3125, -.65625, 2.75, 1.875, .0625);
  for (const y of [1.75, 2.3125, 2.875]) {
    box('copper', 'weather-board-inscription-rule', 11.25, y, -.71875, 2.25, .0625, .0625);
  }
  box('lantern', 'weather-board-alert-ribbon', 12.5, 3.25, -.65625, .25, .75, .0625);
  for (const x of [9.625, 12.875]) {
    box('slate', 'weather-roof-slope', x, 4.3125, -.5, .875, .375, 1.625);
    box('snow', 'weather-roof-snow', x, 4.5625, -.5, .9375, .125, 1.6875);
  }
  box('timberDark', 'weather-roof-top', 11.25, 4.5, -.5, 3.75, .1875, 1.875);
  box('snow', 'weather-roof-cap', 11.25, 4.65625, -.5, 3.875, .125, 2.0);
  box('copper', 'wind-vane-shaft', 11.25, 5.25, -.5, .1875, 1.375, .1875);
  box('copper', 'wind-vane-flag', 11.75, 5.90625, -.5, 1.1875, .1875, .3125);

  // R1. Covered hearth courtyard 10m west of hall.
  box('foundation', 'hearth-plinth', -10, .15625, -.25, 3.625, .3125, 3.625, true);
  for (const x of [-10.875, -10, -9.125]) {
    for (const z of [-1.125, -.25, .625]) {
      if (x === -10 && z === -.25) continue;
      box('foundation', 'hearth-stone-ring', x, .5625, z, .75, .625, .75, true);
    }
  }
  box('coal', 'hearth-coal-bed', -10, .25, -.25, 1.25, .125, 1.25);
  for (const [x, z] of [[-10.25, -.25], [-9.75, -.25], [-10, -.5], [-10, 0]]) {
    box('amber', 'hearth-fire-emissive-slot', x, .6875, z, .3125, .6875, .3125);
  }
  for (const x of [-12.25, -7.75]) {
    box('timberDark', 'hearth-awning-support', x, 1.875, -.25, .3125, 3.75, .3125, true);
  }
  box('woodWarm', 'hearth-roof', -10, 3.75, -.25, 5, .25, 3.25, true);
  for (let i = 0; i < 7; i++) {
    box('slate', 'hearth-slate-tiles', -12 + i * .625, 3.953125, -.25, .5625, .125, 3.375);
    box('snow', 'hearth-roof-snow', -12 + i * .625, 4.03125, -.25, .5625, .0625, 3.4375);
  }
  // R4 provisional style against the actual asset library: sparse red
  // lantern accents, warm wood/glass, slate and heavy snow.
  for (const x of [-3.5, 3.5, -12.25]) {
    box('copper', 'lantern-upper-fitting', x, 2.96875, -3.0625, .8125, .125, .8125);
    box('lantern', 'new-year-lantern', x, 2.625, -3.0625, .6875, .625, .6875);
    box('amber', 'lantern-light-core', x, 2.625, -3.40625, .375, .375, .0625);
    box('copper', 'lantern-lower-fitting', x, 2.25, -3.0625, .8125, .125, .8125);
    box('banner', 'lantern-tassel', x, 1.9375, -3.0625, .125, .5, .125);
  }
  // R5 exterior hearth stools and snow piles; no props in the hall doorway.
  for (const x of [-13.25, -6.875]) {
    box('timber', 'hearth-stool', x, .5, -1.375, 1.0, .1875, .5625);
    for (const u of [-.3125, .3125]) {
      box('timberDark', 'hearth-stool-leg', x + u, .25, -1.375, .125, .4375, .4375, true);
    }
  }
  for (const [x, z] of [[-4.625, 2.625], [4.625, 2.5], [6.125, -1.125]]) {
    for (let layer = 0; layer < 4; layer++) {
      box(layer % 2 ? 'snowShadow' : 'snow', 'roadside-drift', x, .0625 + layer * .125,
        z, 1.875 - layer * .3125, .125, 1.375 - layer * .1875);
    }
  }
  // R4 reference-study polish: the town's existing voxel tavern facade has
  // visible bracket/crossbeam joinery, not flat color-sided cuboids.
  // Every detail remains snapped to 1/16 m and shares existing palette batches.
  for (const x of [-3.875, -1.9375, 0, 1.9375, 3.875]) {
    for (const z of [-3.125, 3.125]) {
      box('timberDark', 'eave-corbels', x, 3.9375, z, .875, .1875, .3125);
      box('woodWarm', 'eave-corbels-detail', x, 3.71875, z, .5625, .3125, .3125);
      box('copper', 'eave-fixing', x, 3.59375, z + Math.sign(z) * .1875, .125, .125, .0625);
    }
  }
  for (let i = 0; i < 17; i++) {
    const x = -4.0 + i * .5;
    for (const z of [-3.625, 3.625]) {
      box(i % 4 === 0 ? 'slateEdge' : 'slate', 'eave-endgrain', x, 4.03125, z, .4375, .375, .1875);
      if (i % 2 === 0) {
        box('snowShadow', 'eave-icicles', x, 3.75 - (i % 3) * .0625, z, .0625, .25, .0625);
      }
    }
  }
  for (const x of [-3.875, 3.875]) {
    for (let zIndex = 0; zIndex < 7; zIndex++) {
      const z = -2.875 + zIndex * .9375;
      box('timberDark', 'side-wall-vertical-lattice', x + Math.sign(x) * .0625,
        2.09375, z, .125, 2.875, .125);
    }
    for (const y of [1.0, 1.875, 2.75, 3.25]) {
      box('woodWarm', 'side-wall-horizontal-lattice', x + Math.sign(x) * .125,
        y, 0, .125, .125, 5.5);
    }
  }
  // Carved lower threshold + two supporting corner details; avoid the 2.5m
  // central doorway and leave the player collision corridor unobstructed.
  for (const x of [-3.0, 3.0]) {
    for (let level = 0; level < 3; level++) {
      box('woodWarm', 'front-lattice-column', x, 1.125 + level * .6875,
        -2.96875, .125, .5, .125);
    }
    box('copper', 'front-fastener', x, 2.75, -3.0625, .1875, .1875, .0625);
  }
  // Weather-board 1/16m geometric snowflake and three-arc wind icon. These
  // are non-text graphic symbols; formal station announcements belong to
  // the separately approved audio/copy work, not to this asset.
  for (const [x, y] of [[10.375,2.75],[10.375,2.5625],[10.375,2.375],[10.1875,2.5625],[10.5625,2.5625]]) {
    box('snow', 'snowflake-sign-pixel', x, y, -.78125, .125, .125, .0625);
  }
  for (let line = 0; line < 3; line++) {
    const y = 1.5625 + line * .25;
    for (let px = 0; px < 7; px++) {
      if (px < 2 && line === 1) continue;
      box('copper', 'wind-direction-pixel', 11.375 + px * .125, y, -.78125, .125, .0625, .0625);
    }
  }
  // Public shelter life: glazed tea shelf, pottery, firewood pile, warm
  // canteen and tools; all under existing floor and roof, not blocking door.
  box('timber', 'hearth-tea-shelf', 3.0625, 1.5, 1.875, 1.375, .125, .4375);
  for (const x of [2.625,3.0,3.375]) {
    box('coal', 'teapot-feet', x, 1.6875, 1.9375, .3125, .25, .25);
    box('copper', 'pottery-rim', x, 1.8125, 1.9375, .375, .0625, .3125);
  }
  for (let stack = 0; stack < 5; stack++) {
    const z = .875 + (stack % 2) * .3125;
    box('timberDark', 'split-firewood', -3.125, .5 + Math.floor(stack / 2) * .25,
      z, .9375, .25, .25);
  }
  box('woodWarm', 'small-tool-rail', -3.75, 2.3125, 1.625, .125, .125, 1.375);
  for (const z of [1.25,1.625,2]) {
    box('copper', 'hanging-fire-tongs', -3.5625, 1.96875, z, .0625, .6875, .0625);
  }
  // Street path and two snow-wrapped pine silhouettes are independent of
  // the main town's terrain grid. The court can be installed/removed as a unit.
  for (let step = 0; step < 9; step++) {
    const z = -4.0 - step * .6875;
    const x = step > 5 ? (step - 5) * .25 : 0;
    for (const lateral of [-1,0,1]) {
      box(lateral === 0 ? 'foundation' : 'snowShadow',
        'windbreak-entrance-footpath', x + lateral*.5625, .125,
        z, .4375, .25, .5625);
    }
  }
  for (const [treeX, treeZ, height] of [[-16.5,5,7.5], [17.5,5.5,9]] as const) {
    box('timberDark', 'windbreak-pine-trunk', treeX, height*.22, treeZ,
      .625, height*.44, .625, true);
    for (let tier = 0; tier < 5; tier++) {
      const width = 3.125 - tier*.5;
      const y = height*(.32 + tier*.135);
      box(tier % 2 ? 'pineLight' : 'pineDeep', 'windbreak-pine-crown',
        treeX, y, treeZ, width, .8125, width*.85);
      for (const strip of [-1,0,1]) {
        box('snow', 'windbreak-pine-branch-snow',
          treeX + strip*(width/4), y+.4375, treeZ,
          width*.2, .125, width*.75);
      }
    }
  }
  // The sheltered yard is enclosed by low sculptural piled snow, never a
  // full-height wall that would prevent players reaching hearth or board.
  for (const sign of [-1,1]) {
    for (let i = 0; i < 7; i++) {
      const z = -.375 + i*.5625;
      box(i % 2 ? 'snow' : 'snowShadow', 'court-snow-border',
        sign * 6.875, .25 + .0625 * (i % 3), z,
        .6875, .5 + .125*(i%3), .5);
    }
  }
  return parts;
}

/** Independent module: a dozen instanced batches regardless of fine voxel count. */
export function buildTownWindbreakCourt(
  at: Readonly<{ east: number; north: number; ground: number; yaw?: number }> = { east: 0, north: 0, ground: 0 },
): WindbreakBuild {
  const parts = winterWindbreakBlocks();
  const group = new Group();
  group.name = 'zb20-seven-round-windbreak-court-candidate';
  group.position.set(at.east, at.ground, -at.north);
  group.rotation.y = at.yaw ?? 0;
  const byMaterial = new Map<WindbreakColor, Voxel[]>();
  for (const voxel of parts) {
    const current = byMaterial.get(voxel.color) ?? [];
    current.push(voxel);
    byMaterial.set(voxel.color, current);
  }
  const rendered: InstancedMesh[] = [];
  const transform = new Object3D();
  for (const [color, batch] of byMaterial) {
    const material = new MeshLambertMaterial({ color: palette[color] });
    const mesh = new InstancedMesh(shape, material, batch.length);
    mesh.name = 'windbreak-' + color;
    mesh.frustumCulled = false;
    for (let i = 0; i < batch.length; i++) {
      const part = batch[i]!;
      transform.position.set(...part.centre);
      transform.scale.set(...part.size);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    rendered.push(mesh);
  }
  const solids: WindbreakSolid[] = parts
    .filter(item => item.collision)
    .map(item => ({ tag: item.tag, center: item.centre, size: item.size }));
  const interactions: WindbreakInteraction[] = [
    { id: 'windbreak-rest', kind: 'sit', at: [-2, .875, -1], reach: 1.6 },
    { id: 'windbreak-warmth', kind: 'warmth', at: [-10, .625, -.25], reach: 3 },
    { id: 'windbreak-weather-board', kind: 'read-weather', at: [11.25, 1.8, -1.5], reach: 2 },
    { id: 'windbreak-photo', kind: 'photo', at: [0, 1.8, -7], reach: 2.25 },
  ];
  return {
    group, solids, interactions,
    blocks: parts.length,
    drawBatches: rendered.length,
    dispose() {
      for (const mesh of rendered) (mesh.material as MeshLambertMaterial).dispose();
      group.clear();
      group.removeFromParent();
      // Shared unit-cube geometry remains reusable across other installations.
    },
  };
}

export function windbreakModelAudit() {
  const voxels = winterWindbreakBlocks();
  const counts = new Map<string, number>();
  for (const voxel of voxels) counts.set(voxel.tag, (counts.get(voxel.tag) ?? 0) + 1);
  return { total: voxels.length, tags: Object.fromEntries(counts) as Readonly<Record<string, number>> };
}

export function windbreakEntranceClear(width = 2.5, headroom = 3.0) {
  const voxels = winterWindbreakBlocks();
  const frontZ = -2.875;
  const solidEntranceBlocks = voxels.filter(part => part.collision).filter(part => {
    const [x, y, z] = part.centre, [w, h, d] = part.size;
    const intersectsDoorWidth = x - w / 2 < width / 2 && x + w / 2 > -width / 2;
    const intersectsDoorDepth = z - d / 2 < frontZ + .125 && z + d / 2 > frontZ - .125;
    return intersectsDoorWidth && intersectsDoorDepth && y - h / 2 < headroom && y + h / 2 > .5;
  });
  return solidEntranceBlocks.length === 0;
}
