import { warriorDistrictHouses } from '../../../src/shared/underground-warrior-district.js';

/**
 * YS4/YS5 bulk architecture, local ENY; the scene host alone decides whether
 * these pieces can be mounted in an official -165m walking/lighting volume.
 * No gameplay flags, loot tables or fake world anchors are created here.
 */
export type WarriorArchitectureFamily =
  'wall' | 'shade' | 'tan' | 'wood' | 'moss' | 'rust' | 'crystal' | 'moon';
export type WarriorArchitectureZone = 'home-facade' | 'home-interior' |
  'arcade-market' | 'arcade-ruin' | 'battlement';
export type WarriorArchitecturePiece = Readonly<{
  name: string;
  zone: WarriorArchitectureZone;
  family: WarriorArchitectureFamily;
  center: readonly [east: number, height: number, north: number];
  size: readonly [width: number, height: number, depth: number];
  solid: boolean;
}>;

type Pieces = WarriorArchitecturePiece[];
const entries: Pieces = [];
function block(
  zone: WarriorArchitectureZone, name: string, family: WarriorArchitectureFamily,
  east: number, height: number, north: number,
  width: number, tall: number, depth: number, solid = false,
) {
  entries.push({
    zone, name, family, center: [east, height, north], size: [width, tall, depth], solid,
  });
}

function buildStoneHomes() {
  for (const [index, house] of warriorDistrictHouses.entries()) {
    const [x] = house.localEntrance;
    const side = house.side === 'north' ? 1 : -1;
    const front = side * 8.15, rear = side * 16.55;
    const mid = (front + rear) * .5;
    const h = 3.5 + index % 4 * .27;
    const w = index % 3 === 0 ? 7.3 : index % 3 === 1 ? 7.7 : 8.1;
    const prefix = house.id;

    // Pass 1: full facade mass, not a three-box house. Each horizontal stone
    // course has interlocking offset joints, chips, and weathering patches.
    for (let row = 0; row < 8; row++) {
      const y = .18 + row * .405;
      for (let col = 0; col < 11; col++) {
        const offset = row % 2 ? .19 : -.19;
        const e = x - w / 2 + .45 + col * (w - .9) / 10 + offset;
        const nearDoor = Math.abs(e - x) < 1.28 && row < 7;
        const family: WarriorArchitectureFamily =
          (index * 13 + row * 3 + col * 5) % 17 === 0 ? 'moss' :
          (row + col + index) % 4 ? 'tan' : 'shade';
        if (!nearDoor) block('home-facade', prefix + '/front-course-' + row + '-' + col,
          family, e, y, front - side * .31, .44, .29, .09);
        block('home-facade', prefix + '/rear-course-' + row + '-' + col,
          family, e, y, rear + side * .31, .44, .29, .09);
      }
      for (const wallSide of [-1, 1]) {
        for (let n = 0; n < 7; n++) {
          block('home-facade', prefix + '/side-course-' + wallSide + '-' + row + '-' + n,
            (row + n) % 3 ? 'wall' : 'shade',
            x + wallSide * (w / 2 + .26), y, front + side * (.55 + n * 1.17),
            .09, .32, .88);
        }
      }
    }

    // Complete stone doorway: stacked jambs, keystone, shadowed rebates and a
    // 2.52m wide physical entrance. Do not put a collision box across that gap.
    for (const edge of [-1, 1]) {
      for (let course = 0; course < 7; course++) {
        block('home-facade', prefix + '/jamb-' + edge + '-' + course,
          course % 3 === 0 ? 'shade' : 'tan',
          x + edge * 1.29, .24 + course * .42,
          front - side * .45, .27, .40, .24);
      }
      block('home-facade', prefix + '/door-step-' + edge, 'wall',
        x + edge * 1.7, .045, front - side * .77, 1.38, .09, 1.1);
      block('home-facade', prefix + '/buttress-foot-' + edge, 'shade',
        x + edge * (w / 2 + .23), .45, front + side * .46,
        .68, .86, 1.2, true);
      // Slim blind stone lantern/recess: no fake light, no unapproved writing.
      block('home-facade', prefix + '/window-recess-' + edge, 'shade',
        x + edge * (w / 2 - .8), 2.0, front - side * .38,
        .57, .82, .11);
      for (const slit of [-1, 1]) block('home-facade',
        prefix + '/window-brow-' + edge + '-' + slit, 'tan',
        x + edge * (w / 2 - .8) + slit * .4, 2.2,
        front - side * .48, .17, 1.05, .16);
    }
    for (let stone = 0; stone < 7; stone++)
      block('home-facade', prefix + '/door-head-' + stone,
        stone % 2 ? 'wall' : 'shade',
        x - 1.2 + stone * .4, 3.32, front - side * .45,
        .39, .23, .25);

    // Multiple stepped roof courses, gable ornaments, drainage and damage.
    // Sparse broken tiles intentionally expose timber rafters beneath them.
    for (let r = 0; r < 4; r++) {
      const n = front + side * (1.1 + r * 2.0);
      for (let col = 0; col < 10; col++) {
        const broken = (index * 7 + r * 11 + col * 3) % 13 === 0;
        const e = x - w / 2 + .46 + col * (w - .92) / 9;
        if (!broken) block('home-facade', prefix + '/roof-tile-' + r + '-' + col,
          (r + col + index) % 7 ? 'wall' : 'moss',
          e, h + .51 + (col % 2) * .05, n, .62, .18, 1.83);
        else {
          block('home-facade', prefix + '/roof-hole-' + r + '-' + col,
            'shade', e, h + .37, n, .24, .11, 1.44);
          block('home-facade', prefix + '/exposed-rafter-' + r + '-' + col,
            'wood', e, h + .4, n, .18, .22, 1.78);
        }
      }
    }
    for (const edge of [-1, 1]) for (let r = 0; r < 7; r++) {
      block('home-facade', prefix + '/eave-stone-' + edge + '-' + r,
        r % 3 === 0 ? 'shade' : 'tan',
        x + edge * (w / 2 + .1), h + .21, front + side * (.60 + r * 1.25),
        .27, .21, 1.15);
    }
    for (let r = 0; r < 3; r++) {
      block('home-facade', prefix + '/roof-ridge-' + r, 'shade',
        x, h + .62, front + side * (1.35 + r * 2.75),
        .38, .24, 2.6);
    }
    // The eight sealed doors still have complete facades and readable debris,
    // but no invisible working inside or player-through-wall route.
    if (!house.accessible) {
      for (let pile = 0; pile < 14; pile++) {
        const e = x + ((pile * 7 + index * 3) % 13 - 6) * .18;
        const n = front - side * (.22 + pile % 4 * .19);
        block('home-facade', prefix + '/blocked-approach-rubble-' + pile,
          pile % 5 ? 'wall' : 'moss',
          e, .12 + Math.floor(pile / 7) * .16,
          n, .22 + pile % 3 * .08, .16, .3);
      }
      continue;
    }

    // Pass 2: fully furnished interiors in the four genuinely accessible homes.
    // Keep the central doorway->search/cover axis 1.4m clear for the avatar.
    for (const edge of [-1, 1]) {
      const wallE = x + edge * (w / 2 - .73);
      for (let plank = 0; plank < 8; plank++)
        block('home-interior', prefix + '/woven-stone-bench-' + edge + '-' + plank,
          plank % 3 ? 'wood' : 'shade',
          wallE, .22 + plank % 2 * .04,
          mid + side * (-2.55 + plank * .71), .73, .30, .52,
          plank % 4 === 0);
      // Open wall niches, jars and enclosed storage, well out of the player path.
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
        block('home-interior', prefix + '/shelf-bin-' + edge + '-' + row + '-' + col,
          row === 0 ? 'wood' : col === 2 ? 'tan' : 'shade',
          wallE - edge * .20, .65 + row * .43,
          mid + side * (-1.7 + col * 1.65),
          .37, .10, 1.10);
        if (row % 2 === 1) block('home-interior',
          prefix + '/shelf-urn-' + edge + '-' + row + '-' + col,
          (row + col) % 3 === 0 ? 'rust' : 'wall',
          wallE - edge * .17, .88 + row * .43,
          mid + side * (-1.7 + col * 1.65), .27, .35, .31);
      }
      for (let post = 0; post < 3; post++)
        block('home-interior', prefix + '/hanging-tool-' + edge + '-' + post,
          post === 1 ? 'rust' : 'wood',
          wallE + edge * .07, 1.8, mid + side * (1.45 + post * .43),
          .1, .85, .17);
    }
    // Archaeology without text or active story flags: different household
    // identities from real props, not just recoloured bare boxes.
    const household = index % 4;
    if (household === 1) {
      // Water-carrier: jug, trough, carved drainage behind a standing stool.
      for (let i = 0; i < 13; i++) {
        block('home-interior', prefix + '/carrier-vessel-' + i,
          i % 5 ? 'tan' : 'shade',
          x - 2.4 + (i % 3) * .21, .17 + Math.floor(i / 3) * .23,
          rear - side * (1.55 + Math.floor(i / 3) * .11),
          .19, .19, .21);
      }
    } else if (household === 2) {
      // Stone tailor: two laid-out slabs and remnants of a small frame loom.
      for (let i = 0; i < 12; i++)
        block('home-interior', prefix + '/loom-' + i, i % 4 ? 'wood' : 'rust',
          x - 2.45 + (i % 3) * .23, .30 + (i % 4) * .28,
          rear - side * (1.45 + Math.floor(i / 4) * .22),
          .15, .19, .39);
    } else if (household === 3) {
      // Surveyor: stone compass spokes, tile quadrants and blank relief.
      for (let i = 0; i < 12; i++)
        block('home-interior', prefix + '/map-blank-' + i, i % 3 ? 'wall' : 'moss',
          x + 2.15 - (i % 4) * .27, .06,
          rear - side * (1.38 + Math.floor(i / 4) * .31),
          .22, .10, .24);
    } else {
      for (let i = 0; i < 12; i++)
        block('home-interior', prefix + '/meal-table-vessels-' + i,
          i % 4 ? 'tan' : 'wood', x + 2.55 - (i % 3) * .22,
          .24 + Math.floor(i / 3) * .16,
          rear - side * (1.25 + i % 2 * .18),
          .2, .16, .19);
    }
  }
}

function buildArcade() {
  // Pass 2: every bay actually has a dense arch/coffer/counter arrangement.
  // The aisle is left continuous along north ~ -20.4 for players to circle.
  for (let bay = 0; bay < 7; bay++) {
    const x = 122 + bay * 6.5;
    const name = 'u10/arcade-bay-' + bay;
    for (let side = 0; side < 2; side++) {
      const n = side === 0 ? -17 : -24.8;
      for (let course = 0; course < 10; course++) {
        block('arcade-market', name + '/column-flutes-' + side + '-' + course,
          course % 3 === 0 ? 'tan' : 'shade',
          x + (course % 2 ? .44 : -.44), .27 + course * .36, n,
          .12, .25, .18);
      }
      for (let step = 0; step < 6; step++) {
        const e = x + (step - 2.5) * .47;
        block('arcade-market', name + '/stone-vault-' + side + '-' + step,
          step % 2 ? 'shade' : 'tan',
          e, 3.57 + (step === 2 || step === 3 ? .38 : .15),
          n + (side ? .2 : -.2), .4, .38, .83);
      }
    }
    // Curved-appearance stepped ceiling formed by offset voxel courses.
    for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
      const e = x - 2.53 + col * 1.0;
      block('arcade-market', name + '/coffer-' + row + '-' + col,
        (bay + col + row) % 9 ? 'wall' : 'moss',
        e, 4.39 + (row % 2 ? .045 : 0), -17.6 - row * 1.65,
        .69, .12, 1.0);
    }
    // Distinct ancient wares: jar, stone scale, boxes, frame-stones, tool bar.
    // No writing/price labels, names are solely for code diagnostics.
    for (let i = 0; i < 29; i++) {
      const e = x - .2 + (i % 6) * .35;
      const n = -22.3 + Math.floor(i / 6) * .23;
      const shelf = Math.floor(i / 6) % 3;
      block('arcade-market', name + '/wares-' + i,
        i % 11 === 0 ? 'rust' : i % 5 === 0 ? 'wood' : i % 2 ? 'tan' : 'shade',
        e, .88 + (shelf === 1 ? .20 : shelf === 2 ? .32 : 0),
        n, .2 + i % 3 * .06, .19 + (i % 5) * .055, .21);
    }
    for (let rail = 0; rail < 9; rail++) {
      block('arcade-market', name + '/counter-slats-' + rail,
        rail % 3 === 0 ? 'rust' : 'wood',
        x - 1.20 + rail * .36, .55, -22.88,
        .31, .15, .22);
    }
    for (const edge of [-1, 1]) {
      block('arcade-market', name + '/counter-foot-' + edge, 'shade',
        x + edge * 1.18, .28, -23.1, .31, .55, .42, true);
    }
  }
  // Pass 1/2: the missing half-collapsed guard/storehouse at the end of the
  // arcade. It is the *visual* ice-golem arena marker; spawning remains U-14.
  // The entrance faces the existing market rather than inventing a side portal.
  const cx = 174.75, cn = -21.1;
  block('arcade-ruin', 'u10/ruined-market-house/floor', 'wall',
    cx, -.16, cn, 8.1, .32, 8.0);
  block('arcade-ruin', 'u10/ruined-market-house/back', 'shade',
    cx + 3.96, 2.25, cn, .48, 4.5, 7.7, true);
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      block('arcade-ruin', 'u10/ruined-market-house/side-' + dir + '-' + i,
        i % 3 ? 'wall' : 'moss',
        cx - 3.4 + i * .68, 1.65 + i % 5 * .19,
        cn + dir * 3.82, .61, 3.3 - i % 4 * .16, .54,
        true);
    }
    // Roof open on its market-facing side, showing the missing masonry.
    for (let tile = 0; tile < 7; tile++)
      if ((tile + (dir + 1)) % 3 !== 0)
        block('arcade-ruin', 'u10/ruined-market-house/roof-' + dir + '-' + tile,
          tile % 3 ? 'shade' : 'wood', cx - 3.2 + tile * .93,
          4.6 - tile % 3 * .12, cn + dir * 2.15,
          .91, .3, 2.72);
    for (let j = 0; j < 15; j++) {
      const e = cx + 2.6 + (j % 5) * .24;
      const n = cn + dir * (1.4 + Math.floor(j / 5) * .38);
      block('arcade-ruin', 'u10/ruined-market-house/rubble-' + dir + '-' + j,
        j % 3 ? 'wall' : 'shade', e, .14 + j % 3 * .12, n, .34, .23, .33);
    }
  }
  // Ruin open approach, keep path from last market bay navigable.
  for (let j = 0; j < 12; j++)
    block('arcade-ruin', 'u10/ruined-market-house/threshold-' + j,
      j % 4 ? 'tan' : 'shade',
      cx - 3.4 + j * .48, .045,
      cn - 3.5, .43, .09, .62);
}

function buildBattlement() {
  // Pass 1: battlement's south-looking identity, supporting corbels and
  // cracked-but-intact outer buttresses; no new invisible collision wall.
  for (let x = 80; x <= 167; x += 4) {
    for (const edge of [-1, 1]) {
      const n = 27 + edge * 2.65;
      for (let tier = 0; tier < 8; tier++) {
        block('battlement', 'citywall/exterior-buttress-' + x + '-' + edge + '-' + tier,
          tier % 3 === 0 ? 'shade' : tier % 4 === 0 ? 'moss' : 'wall',
          x, .55 + tier * .78, n + edge * (tier > 4 ? -.12 : .12),
          1.13 - tier * .05, .68, .74);
      }
      for (let notch = 0; notch < 4; notch++) {
        block('battlement', 'citywall/slot-' + x + '-' + edge + '-' + notch,
          notch % 2 ? 'shade' : 'tan',
          x + .64, 2.3 + notch * .91,
          n - edge * .10, .17, .56, .15);
      }
    }
    // Displaced cracked paving across the 90m walk, deliberately below foot Y7.12.
    for (let slab = 0; slab < 6; slab++) {
      const north = 25.43 + slab * .61;
      block('battlement', 'citywall/pavement-' + x + '-' + slab,
        (slab + x) % 7 ? 'tan' : 'moss',
        x + .65, 7.11, north, .63, .018, .5);
    }
  }
  // Pass 5: no text, only old guards' physical traces in short isolated clusters.
  for (const base of [104, 121, 144, 159]) {
    for (let i = 0; i < 13; i++) {
      block('battlement', 'citywall/abandoned-defense-' + base + '-' + i,
        i % 4 === 0 ? 'rust' : i % 3 ? 'shade' : 'wood',
        base + (i % 5) * .28, 7.25 + Math.floor(i / 5) * .12,
        28.17 + (i % 3) * .18,
        .19 + i % 3 * .08, .14 + i % 4 * .04, .22);
    }
  }
}

buildStoneHomes();
buildArcade();
buildBattlement();

const pieces = Object.freeze(entries.map(piece => Object.freeze(piece)));
const tally = Object.freeze({
  homes: warriorDistrictHouses.length,
  accessible: warriorDistrictHouses.filter(home => home.accessible).length,
  marketBays: 7,
  ruination: 1,
  wallMeters: 90,
  architecturePieces: pieces.length,
  facadePieces: pieces.filter(piece => piece.zone === 'home-facade').length,
  roomPieces: pieces.filter(piece => piece.zone === 'home-interior').length,
  marketPieces: pieces.filter(piece => piece.zone === 'arcade-market').length,
  ruinedHousePieces: pieces.filter(piece => piece.zone === 'arcade-ruin').length,
  wallPieces: pieces.filter(piece => piece.zone === 'battlement').length,
  structuralSolids: pieces.filter(piece => piece.solid).length,
});
export const warriorDistrictArchitecture = Object.freeze({ pieces, tally });
