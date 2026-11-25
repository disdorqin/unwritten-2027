import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NearestFilter, PlaneGeometry, PointLight, SRGBColorSpace, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { industrialBuilder, type IndustryPoint, type IndustryWindow } from './town-a-r30-industrial-shell';

type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
export type CraterTowerWalkPoint = Readonly<{east:number;north:number;height:number}>;
export type CraterTowerRoute = Readonly<{id:string;entry:CraterTowerWalkPoint;stairs:readonly CraterTowerWalkPoint[];lookout:CraterTowerWalkPoint;rubbing:CraterTowerWalkPoint;rubbingUse:CraterTowerWalkPoint}>;
export type CraterOuterSite = Readonly<{
  id: string; east: number; north: number; height: number; radius: number;
  topHeight?: number;
}>;

const palette = {
  stone: '#8a8378', stoneDark: '#5d564c', ochre: '#a98a56', earth: '#5d4630',
  timberLight: '#a36b48', pine: '#44503c', night: '#2c3648', snow: '#e8ecf0',
  ember: '#e08a3c', windowWarm: '#ffa455', crystal: '#7fd4c8', rust: '#8a4a34',
  slate: '#4b5066', brass: '#c68d4d',
} as const;

function pixelMaterial(base: string, shade: string, seed: number, accent = shade) {
  const tones = [base, shade, accent].map(color => Number.parseInt(color.slice(1), 16));
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = (Math.imul(x + 11, 733) ^ Math.imul(y + 13, 199) ^ seed) & 15;
      const crack = (2 * y + x + Math.floor(x / 4)) % 17 === 0;
      const tone = tones[crack ? 2 : Number(grain < 4)];
      data.set([tone >>> 16, (tone >>> 8) & 255, tone & 255, 255], 4 * (y * size + x));
    }
  }
  const map = new DataTexture(data, size, size);
  map.magFilter = map.minFilter = NearestFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 1 });
}

/** Calm, continuous industrial surfaces. The random high-contrast legacy
 * pixels stay on the old props; walls and equipment use joined boards,
 * staggered brick courses or rolled sheet, with restrained tonal variation. */
function industrialSurface(kind:'wood'|'brick'|'sheet',base:number){
  const size=32,data=new Uint8Array(size*size*4);
  const r=base>>16&255,g=base>>8&255,b=base&255;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let tone=0;
    if(kind==='wood'){
      const board=Math.floor(x/8),seam=x%8===0;
      tone=seam?-23:((board*13)%15-7)+((x*7+Math.floor(y/9)*3)%7-3);
    }else if(kind==='brick'){
      const row=Math.floor(y/8),bx=(x+(row%2)*8)%16;
      tone=y%8===0||bx===0?-24:((row*17+Math.floor((x+(row%2)*8)/16)*11)%13-6);
    }else{
      tone=x%8===0?-18:x%8===1?8:((Math.floor(y/8)+x*3)%5-2);
    }
    const c=(v:number)=>Math.max(0,Math.min(255,v+tone));
    data.set([c(r),c(g),c(b),255],(y*size+x)*4);
  }
  const map=new DataTexture(data,size,size);
  map.magFilter=map.minFilter=NearestFilter;
  map.colorSpace=SRGBColorSpace;map.needsUpdate=true;
  return new MeshStandardMaterial({map,roughness:kind==='sheet'?.86:1});
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const d2r = (deg: number) => deg * Math.PI / 180;

/** Narrow-gauge corridor reserved for mainline 3: station (105°) along the belt's
 * inner edge to the smelter door (207°). Nothing in this module may intrude. */
export const craterBeltTrackCorridor: readonly (readonly [number, number])[] = [
  [100, 80], [120, 79], [140, 79], [150, 81.5], [160, 84], [176, 84], [190, 80], [207, 80],
];

/**
 * Crater outer works (mainline 2a industrial belt + 2b three-layer isolation and
 * outer-band retrofit; crater book revisions 1–3 + the tower ruling):
 * the salvage era's plant cluster built "as on the day work stopped", the town-era
 * rammed-earth wall across the approach valley, the full iron fence ring on the
 * works boundary, and the three stone-iron defense towers. Ground is sampled from
 * the road's heightAt everywhere; gates stand open or are guarded by people —
 * nothing here is a collision wall.
 */
export type CraterHitBox = { min: number[]; max: number[] };
export type CraterHitRamp = CraterHitBox & { axis: 'x' | 'z'; ascending: 1 | -1 };

/** A doorway ramp in a local frame (the landmark-culture door-ramp
 * precedent): rises from yLow at dzOuter to yHigh at dzInner along the
 * dominant world axis of the frame's facing bearing. */
function hitRamp(list: CraterHitRamp[], fr: { at(dx: number, dz: number): { east: number; north: number } },
  dzOuter: number, dzInner: number, halfW: number, yLow: number, yHigh: number) {
  const corners = [fr.at(-halfW, dzOuter), fr.at(halfW, dzOuter), fr.at(-halfW, dzInner), fr.at(halfW, dzInner)];
  const es = corners.map(p => p.east), ns = corners.map(p => p.north);
  const o = fr.at(0, dzOuter), i = fr.at(0, dzInner);
  const axis: 'x' | 'z' = Math.abs(i.east - o.east) > Math.abs(i.north - o.north) ? 'x' : 'z';
  const innerCoord = axis === 'x' ? i.east : -i.north;
  const outerCoord = axis === 'x' ? o.east : -o.north;
  list.push({
    min: [Math.min(...es), yLow, -Math.max(...ns)],
    max: [Math.max(...es), yHigh, -Math.min(...ns)],
    axis, ascending: innerCoord > outerCoord ? 1 : -1,
  });
}

/** World-space AABB of a yaw-rotated box centred at (east, north). */
function hitBox(list: CraterHitBox[], east: number, north: number, yaw: number,
  sx: number, sz: number, y0: number, y1: number) {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const hx = (sx * c + sz * s) / 2, hz = (sx * s + sz * c) / 2;
  list.push({ min: [east - hx, y0, -(north + hz)], max: [east + hx, y1, -(north - hz)] });
}

/** AABB covering the straight segment (e0, n0)-(e1, n1) padded on all sides. */
function hitSegment(list: CraterHitBox[], e0: number, n0: number, e1: number, n1: number,
  pad: number, y0: number, y1: number) {
  list.push({
    min: [Math.min(e0, e1) - pad, y0, -(Math.max(n0, n1) + pad)],
    max: [Math.max(e0, e1) + pad, y1, -(Math.min(n0, n1) - pad)],
  });
}

export function buildCraterOuterWorks(road: CraterRoad) {
  const { anchor, heightAt } = road;
  const group = new Group();
  group.name = 'crater-outer-works';
  const sites: CraterOuterSite[] = [];
  const towerRoutes: CraterTowerRoute[] = [];
  const industrialRoutes:{id:string;points:IndustryPoint[]}[]=[];
  // S-1 collision (分支窗 A): structural wall boxes + standable floors in
  // world coordinates, exported for the za22 top group's userData. Solid
  // shells get one mass box each; designed gaps (wall gate, fence-ring
  // crossings, the gatehouse doorway) stay open.
  const colliders: CraterHitBox[] = [];
  const floors: CraterHitBox[] = [];
  const ramps: CraterHitRamp[] = [];

  const stone = pixelMaterial(palette.stone, palette.stoneDark, 43, palette.earth);
  const stoneDark = pixelMaterial(palette.stoneDark, palette.night, 89, palette.stone);
  const concrete = pixelMaterial('#9a958a', palette.stoneDark, 97, palette.stone);
  const earthWall = pixelMaterial('#a98a56', palette.earth, 31, palette.stone);
  const timber = pixelMaterial(palette.earth, palette.night, 29, palette.stone);
  const timberWarm = pixelMaterial(palette.ochre, palette.earth, 67, palette.timberLight);
  const slate = pixelMaterial(palette.slate, palette.night, 139, palette.stone);
  const iron = pixelMaterial(palette.night, palette.rust, 157, palette.earth);
  const rustIron = pixelMaterial(palette.rust, palette.night, 181, palette.earth);
  const corrugated = pixelMaterial('#6a7076', palette.rust, 191, palette.night);
  const snow = pixelMaterial(palette.snow, palette.stone, 199);
  const dark = new MeshStandardMaterial({ color: 0x14100d, roughness: 1 });
  const ore = new MeshStandardMaterial({ color: 0x3d3a44, roughness: .95, flatShading: true });
  // Ore-pile families (card 05: piles sorted by material family — soot-black ore,
  // ochre timber, lime-grey slag); the K-18/19/20 plates name each pile.
  const oreOchre = new MeshStandardMaterial({ color: 0xa98a56, roughness: .95, flatShading: true });
  const oreGrey = new MeshStandardMaterial({ color: 0x8a8378, roughness: .95, flatShading: true });
  const slag = new MeshStandardMaterial({ color: 0x2e2c30, roughness: 1, flatShading: true });
  const brass = new MeshStandardMaterial({ color: palette.brass, roughness: .45, metalness: .65 });
  const glow = new MeshStandardMaterial({
    color: palette.windowWarm, emissive: palette.ember, emissiveIntensity: 1.25, roughness: .8,
  });

  const workshopWood=industrialSurface('wood',0x7b6148);
  const workshopBrick=industrialSurface('brick',0x74665d);
  const workshopSheet=industrialSurface('sheet',0x54575a);
  const frostedGlass=new MeshStandardMaterial({color:0x99846b,roughness:.6,emissive:0xffb767,emissiveIntensity:.24});
  const coldGlass=new MeshStandardMaterial({color:0x6c8291,roughness:.65,emissive:0x657786,emissiveIntensity:.06});
  const windowRows=(xs:readonly number[],width:number,low:number,high:number):IndustryWindow[]=>
    ([1,-1] as const).flatMap(side=>xs.map(x=>({side,x,width,low,high})));
  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  function part(mat: MeshStandardMaterial, geo: BufferGeometry, east: number, h: number, north: number,
    yaw = 0, pitch = 0, roll = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (roll) g.rotateZ(roll);
    if (pitch) g.rotateX(pitch);
    if (yaw) g.rotateY(yaw);
    g.translate(east, h, -north);
    const batch = batches.get(mat) ?? [];
    batch.push(g);
    batches.set(mat, batch);
    if (g !== geo) geo.dispose();
  }
  function box(mat: MeshStandardMaterial, east: number, h: number, north: number,
    sx: number, sy: number, sz: number, yaw = 0, pitch = 0, roll = 0) {
    part(mat, new BoxGeometry(sx, sy, sz), east, h, north, yaw, pitch, roll);
  }
  function cyl(mat: MeshStandardMaterial, east: number, h: number, north: number,
    rTop: number, rBottom: number, height: number, segments = 10, yaw = 0, pitch = 0, roll = 0) {
    part(mat, new CylinderGeometry(rTop, rBottom, height, segments), east, h, north, yaw, pitch, roll);
  }
  function cone(mat: MeshStandardMaterial, east: number, h: number, north: number,
    r: number, height: number, segments = 9, yaw = 0, pitch = 0, roll = 0) {
    part(mat, new ConeGeometry(r, height, segments), east, h, north, yaw, pitch, roll);
  }

  function site(id: string, bearingDeg: number, radius: number, clear: number, topHeight?: number) {
    const b = d2r(bearingDeg);
    const east = anchor.east + radius * Math.sin(b);
    const north = anchor.north + radius * Math.cos(b);
    const height = heightAt(east, north);
    if (height === undefined) return undefined;
    const found: CraterOuterSite = { id, east, north, height, radius: clear, topHeight };
    sites.push(found);
    return found;
  }
  function siteAt(id: string, east: number, north: number, clear: number, topHeight?: number) {
    const height = heightAt(east, north);
    if (height === undefined) return undefined;
    const found: CraterOuterSite = { id, east, north, height, radius: clear, topHeight };
    sites.push(found);
    return found;
  }

  /** Local frame: +dz toward the facing bearing, +dx to the right of it. */
  function frame(origin: { east: number; north: number; height: number }, faceDeg: number) {
    const f = d2r(faceDeg);
    const fwd = { e: Math.sin(f), n: Math.cos(f) };
    const right = { e: Math.cos(f), n: -Math.sin(f) };
    return {
      yaw: Math.PI - f,
      at(dx: number, dz: number) {
        return {
          east: origin.east + right.e * dx + fwd.e * dz,
          north: origin.north + right.n * dx + fwd.n * dz,
        };
      },
    };
  }

  /** A text-bearing board: batched backing plus a canvas face. Crater signage
   * text is 《文本-坑区牌面-2026-11-21》 verbatim — never paraphrased — except
   * K-06/07/09/10, which are 《设计-全图文字件总表-2026-11-22》 verbatim
   * (总控裁定 批55). */
  function sign(east: number, h: number, north: number, yaw: number, w: number, hh: number,
    back: MeshStandardMaterial,
    draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    box(back, east, h, north, w + .14, hh + .14, .06, yaw);
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.round(512 * hh / w);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plane = new Mesh(new PlaneGeometry(w, hh), new MeshBasicMaterial({ map: texture }));
    const off = .055;
    plane.position.set(east + Math.sin(yaw) * off, h, -north + Math.cos(yaw) * off);
    plane.rotation.y = yaw;
    group.add(plane);
  }

  // ================= 2a · industrial belt （停工那一天） =================

  // ---------- smelter plant (bearing 207°, main hall 28 m + blast-furnace tower) ----------
  const smelter = site('smelter-plant', 207, 88, 17, 19);
  if (smelter) {
    const fr = frame(smelter, 207 + 180);
    const g = smelter.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    // Yard pad and hall: stone base, corrugated walls, timber posts, slate gable.
    const pad = fr.at(0, 0);
    cyl(stoneDark, pad.east, g + .07, pad.north, 19.5, 20.5, .14, 4, fr.yaw);
    const hall=industrialBuilder(fr,g,put,colliders,floors);
    hall.slab(workshopBrick,0,0,28,11,1.2,1.2);
    // The cold-sealed furnace aperture remains decorative; a separate
    // service entrance at +4.7m gives the actual hall its walkable interior.
    hall.shell(workshopSheet,28,11,1.2,12.9,4.7,3.2,3.5,
      {openings:windowRows([-10.5,-3.5,3.5,10.5],2.25,9.4,11.1),frame:timber,glass:coldGlass});
    const access=hall.stairs(stone,4.7,8.30,'z',-1,5,.56,2.65,0,1.2);
    industrialRoutes.push({id:'smelter-plant',points:[hall.point(4.7,8.85,0),...access,hall.point(4.7,3.4,1.2),hall.point(4.7,0,1.2),hall.point(8,0,1.2)]});
    // Working hall: columns, riveted furnace mass, ducting, ingot bench
    // and overhead crossbeams. The center remains occupied by real equipment.
    for(const side of [-1,1])for(const dx of [-12,-6,6,12]){
      hall.piece(iron,dx,side*4.7,.38,.38,1.2,12.9);
      put(timber,dx,g+12.45,0,.3,.4,10.3);
    }
    hall.piece(stoneDark,0,-.3,3.2,3.1,1.2,2.1);
    hall.piece(rustIron,0,-.3,2.5,2.5,2.1,6.1);
    put(iron,0,g+7.25,-.3,1.25,2.3,1.25);
    put(rustIron,-4.7,g+8.6,-.3,10.5,.65,.65);
    for(const dx of [-9,-6,9,12]){
      hall.piece(timberWarm,dx,-3.6,2.0,1.2,1.2,2.35);
      for(let k=0;k<3;k++)put(iron,dx-.6+k*.6,g+2.48,-3.6,.45,.25,.7);
    }
    for(const dx of [3.1,6.3])put(iron,dx,g+3.0,5.5,.18,3.6,.34);
    put(iron,4.7,g+4.83,5.5,3.45,.22,.34);
    for (const dx of [-13.5, -6.75, 0, 6.75, 13.5]) put(timber, dx, g + 7.05, 5.45, .45, 11.7, .3);
    // The ridge runs along the 28m length, not across the hall.
    // Both roof halves and snow caps share the same pitch and ridge.
    const eaves = 12.9, roofRise = 5.55, roofRun = 6.35;
    const roofPitch = Math.atan2(roofRise, roofRun);
    const roofSlant = Math.hypot(roofRise, roofRun);
    for (const side of [-1, 1]) {
      put(slate, 0, g + eaves + roofRise / 2, side * roofRun / 2,
        29.2, .22, roofSlant + .05, side * roofPitch);
      for (let bay = 0; bay < 14; bay++) {
        const dx = -13.55 + bay * 2.08;
        for (let row = 0; row < 3; row++) {
          const t = (row + .5) / 3;
          put(row === 0 && bay % 4 === 0 ? rustIron : slate,
            dx, g + eaves + roofRise * t + .19, side * roofRun * (1 - t),
            2.13, .09, roofSlant / 3 + .14, side * roofPitch);
        }
        if (bay % 3 === 0) {
          const t = .22 + (bay % 2) * .13;
          put(snow, dx, g + eaves + roofRise * t + .29, side * roofRun * (1-t),
            1.85, .1, 1.45, side * roofPitch);
        }
      }
      put(timber, 0, g + eaves + .06, side * roofRun, 29.3, .3, .24);
    }
    // End walls meet the roof rather than leaving two open triangular gaps.
    for (const side of [-1, 1]) for (let course = 0; course < 10; course++) {
      const t = (course + 1) / 10;
      put(corrugated, side * 13.93, g + eaves + roofRise * (course + .5) / 10,
        0, .20, roofRise / 10 + .015, Math.max(.14, 11 * (1-t)));
    }
    put(timber, 0, g + 18.6, 0, 29.3, .24, .35);
    // Recessed stone lintels above actual glazing; no false dark window
    // plates over the newly constructed openings.
    for(const side of [-1,1])for(const dx of [-10.5,-3.5,3.5,10.5]){
      put(stoneDark,dx,g+11.23,side*5.52,2.58,.23,.27);
      put(stoneDark,dx,g+9.29,side*5.52,2.55,.18,.29);
    }
    for(const dx of [-10.5,-3.5,3.5,10.5]){
      // Visible timber trusses under the roof. They span both walls and meet
      // the ridge; the cold furnace has no animated fire or new authority.
      put(timber,dx,g+12.58,0,.25,.3,10.8);
      put(timber,dx,g+15.54,0,.22,5.9,.22);
      for(const side of [-1,1])put(timber,dx,g+15.4,side*2.85,.25,8.0,.25,side*.78);
    }
    // Small hoist and bucket at the original loading side, away from the
    // open service entrance. Structural footing and hook are separate.
    hall.piece(stoneDark,-12,8.5,1.15,1.15,0,.48);
    hall.piece(timber,-12,8.5,.36,.36,.48,4.6);
    put(timber,-10.5,g+4.50,8.5,3.4,.35,.35);
    put(timber,-11.1,g+3.35,8.5,2.55,.22,.25,0,.69);
    put(iron,-9.0,g+3.25,8.5,.07,2.2,.07);
    const bucket=fr.at(-9.0,8.5);
    cyl(rustIron,bucket.east,g+1.65,bucket.north,.5,.39,.72,10,fr.yaw);
    cyl(iron,bucket.east,g+2.03,bucket.north,.52,.52,.08,10,fr.yaw);
    hall.piece(timberWarm,-11.0,-2.7,1.8,1.0,1.2,2.3);
    // Roof snow is now generated on the sloped tile plane above.
    // Cold furnace mouth on the yard face: dark arch inset, iron door ajar.
    put(dark, -4, g + 2.2, 5.56, 3.4, 4.4, .18);
    const doorP = fr.at(-2.1, 5.75);
    box(iron, doorP.east, g + 2.1, doorP.north, 1.7, 4.2, .14, fr.yaw + .5);
    // Tall brick chimney, cold.
    put(rustIron, 10.5, g + 13.0, -2, 1.5, 18, 1.5);
    put(stoneDark, 10.5, g + 22.25, -2, 1.9, .5, 1.9);
    // Ingot stacks and crates left where the last shift dropped them.
    // Actual staggered billets on pallets rather than coincident meshes.
    // Preserve the center service lane.
    for(let s=0;s<3;s++){
      const x=7.6+s*2.65,z=10.35,levels=3-s;
      hall.piece(timber,x,z,2.05,2.3,0,.16);
      for(let layer=0;layer<levels;layer++){
        const count=4-layer;
        for(let i=0;i<count;i++){
          const q=z+(i-(count-1)/2)*.47;
          hall.piece(workshopSheet,x,q,1.75-layer*.19,.43,.16+layer*.32,.47+layer*.32);
        }
      }
    }
    hall.piece(timberWarm,-9,10.65,1.6,1.6,0,1.6);
    hall.piece(timber,-7.2,10.85,1.4,1.4,0,1.4);
    for(const side of [-1,1])for(let bay=0;bay<7;bay++){
      const x=-12.8+bay*4.25;
      put(snow,x,g+12.98,side*6.31,1.05,.11,.37);
      for(let j=0;j<3;j++){
        const h=.22+.14*((bay+j*2)%4);
        put(snow,x-.35+j*.25,g+12.90-h/2,side*6.42,.105,h,.105);
      }
    }
    // Blast-furnace tower, independent at the west end: tapered iron stack, cold mouth.
    const bf = fr.at(-19.5, 0);
    cyl(rustIron, bf.east, g + 5, bf.north, 1.9, 2.7, 10, 12);
    cyl(iron, bf.east, g + 10.3, bf.north, 2.15, 2.15, .6, 12);
    const bfDoor = fr.at(-19.5, 2.55);
    box(dark, bfDoor.east, g + 1.1, bfDoor.north, 1.6, 2.2, .2, fr.yaw);
    cone(slag, fr.at(-19.5, 6.5).east, g + 1.1, fr.at(-19.5, 6.5).north, 3.4, 2.2, 10);
    cone(slag, fr.at(-24, -5).east, g + .9, fr.at(-24, -5).north, 2.8, 1.8, 10);
    // The separate cold blast furnace stays a solid mass. Hall walls and
    // interior furniture are already registered with their actual footprints.
    hitBox(colliders, bf.east, bf.north, fr.yaw, 5.4, 5.4, g, g + 10);
    // Hand cart, handles down, mid-yard.
    const cart = fr.at(2, 8);
    box(timber, cart.east, g + .75, cart.north, 1.7, .18, 1.05, fr.yaw);
    for (const s of [-1, 1]) {
      const w = fr.at(2 + s * .95, 8);
      cyl(iron, w.east, g + .42, w.north, .42, .42, .12, 10, fr.yaw, Math.PI / 2);
    }
    // Works signage (牌面 §五): cast-iron name plate right of the furnace
    // mouth; the chalk duty board left of it, its last line trailing off.
    // K-06/K-07 (《设计-全图文字件总表》，总控裁定 批55)：炉膛口铁牌挂炉口
    // 正上方、料口木牌挂锭垛侧墙面。值班牌人名留空（总控裁定 批58 追补六：
    // 白望山/石沉皆灵魂，活人值班牌不许出现魂名；名册定版后填活人守卫名）。
    const plateP = fr.at(1.8, 5.58);
    siteAt('smelter-sign', plateP.east, plateP.north, 1);
    sign(plateP.east, g + 3.6, plateP.north, fr.yaw, 1.9, .62, iron, (c, w, h) => {
      c.fillStyle = '#3b3835'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.font = 'bold 92px "Noto Sans SC", sans-serif';
      c.fillStyle = '#d3cbb9'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('冶炼工坊', w / 2, h / 2 + 4);
    });
    const dutyP = fr.at(-8.6, 5.58);
    siteAt('smelter-duty-board', dutyP.east, dutyP.north, 1);
    sign(dutyP.east, g + 2.3, dutyP.north, fr.yaw, 1.5, 1.9, timber, (c, w, h) => {
      c.fillStyle = '#3a352d'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(0, 0, 0, .35)'; c.lineWidth = 2;
      for (const fy of [.25, .5, .75]) {
        c.beginPath(); c.moveTo(0, h * fy); c.lineTo(w, h * fy); c.stroke();
      }
      c.fillStyle = '#e8e2d2'; c.textBaseline = 'middle';
      c.font = '44px "Noto Sans SC", sans-serif'; c.textAlign = 'left';
      c.fillText('腊月廿三', 40, h * .15);
      // Roster fill (名册定版 批64): 一班 孙长炉 / 二班 焦二锤 take the
      // slots blanked by 批58 追补六; the trailing 到 stays in its old place.
      c.fillText('一班', 40, h * .37);
      c.fillText('孙长炉', 160, h * .37);
      c.fillText('到', 348, h * .37);
      c.fillText('二班', 40, h * .59);
      c.fillText('焦二锤', 160, h * .59);
      c.fillText('到', 348, h * .59);
      c.font = '37px "Noto Sans SC", sans-serif';
      c.fillText('三班　炉火看住，莫等我——', 40, h * .81);
      // The stroke drags a little past the last dash and stops.
      c.fillStyle = 'rgba(232, 226, 210, .3)';
      c.fillRect(452, h * .815, 42, 3);
      c.fillStyle = 'rgba(232, 226, 210, .16)';
      c.fillRect(452, h * .835, 26, 2);
    });
    // K-06 furnace-mouth iron plate, above the cold arch (总表定稿）.
    const furnaceP = fr.at(-4, 5.58);
    siteAt('smelter-furnace-plate', furnaceP.east, furnaceP.north, 1);
    sign(furnaceP.east, g + 5.0, furnaceP.north, fr.yaw, 1.5, .45, iron, (c, w, h) => {
      c.fillStyle = '#3b3835'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.font = 'bold 64px "Noto Sans SC", sans-serif';
      c.fillStyle = '#d3cbb9'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('一号炉 · 冷封', w / 2, h / 2 + 2);
    });
    // K-07 material-opening wooden plate, ingot-stack end of the yard face.
    const materialP = fr.at(9.5, 5.58);
    siteAt('smelter-material-plate', materialP.east, materialP.north, 1);
    sign(materialP.east, g + 2.2, materialP.north, fr.yaw, 1.1, .4, timber, (c, w, h) => {
      c.fillStyle = '#5d4630'; c.fillRect(0, 0, w, h);
      c.font = 'bold 56px "Noto Sans SC", sans-serif';
      c.fillStyle = '#e8e0cc'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('料不过夜', w / 2, h / 2 + 2);
    });
  }

  // ---------- instrument plant (bearing 127°, two-storey, tall chimney, water tower) ----------
  const instrument = site('instrument-plant', 127, 88, 14, 17.5);
  if (instrument) {
    const fr = frame(instrument, 127 + 180);
    const g = instrument.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    const pad = fr.at(0, 0);
    cyl(stoneDark, pad.east, g + .07, pad.north, 15, 16, .14, 4, fr.yaw);
    const hall=industrialBuilder(fr,g,put,colliders,floors);
    hall.slab(stone,0,0,20,10,.9,.9);
    hall.shell(workshopBrick,20,10,.9,4.2,0,2.8,2.8,
      {openings:windowRows([-8,-4.8,4.8,8],1.7,1.65,3.55),frame:timber,glass:coldGlass});
    // Upper shell is separate, with a genuine mezzanine and stair opening.
    hall.shell(workshopWood,20,10,4.2,12.6,0,0,0,
      {openings:windowRows([-8,-4.8,-1.6,1.6,4.8,8],1.7,5.95,7.65),frame:timber,glass:frostedGlass});
    hall.slab(workshopWood,0,1.05,19.5,7.45,4.2,.24);
    hall.slab(workshopWood,5.5,-3.55,8.5,2.15,4.2,.24);
    hall.slab(workshopWood,-9.1,-3.55,1.1,2.15,4.2,.24);
    const access=hall.stairs(stone,0,9.98,'z',-1,3,.56,2.4,0,.9);
    const stair=hall.stairs(timber,-8.05,-3.55,'x',1,12,.63,1.45,.9,4.2);
    hall.slab(timber,.3,-3.55,1.65,1.45,4.2,.20);
    hall.piece(iron,-4.45,-2.8,8.1,.12,4.2,5.2);
    hall.piece(iron,4.85,-2.8,7.1,.12,4.2,5.2);
    // Real calibration benches, instrument cases and stock shelves.
    for(const dx of [-6,-3,3,6]){
      hall.piece(workshopWood,dx,2.4,1.6,1.0,.9,1.85);
      for(let k=0;k<3;k++)put(brass,dx-.5+k*.5,g+2.02,2.4,.24,.32,.35);
    }
    hall.piece(iron,0,0,1.45,1.35,.9,2.7);
    for(const dx of [-5,0,5]){
      hall.piece(workshopWood,dx,2.75,2.0,1.05,4.2,5.5);
      put(brass,dx,g+5.65,2.75,.7,.25,.6);
    }
    industrialRoutes.push({id:'instrument-plant',points:[hall.point(0,10.5,0),...access,hall.point(0,6.2,.9),hall.point(0,3.4,.9),hall.point(-8,3.4,.9),hall.point(-8,-1.0,.9),hall.point(-8.05,-3.55,.9),...stair,hall.point(.3,-3.55,4.2),hall.point(.3,-1.6,4.2),hall.point(3,-1.6,4.2)]});
    // Longitudinal ridge, pitched panels and end infill share an actual roof
    // plane, distinct from the taller chimney. Repeat the bay structure on
    // both long elevations instead of a single unbroken upper mass.
    const eaves=12.6,rise=4.42,run=5.8,pitch=Math.atan2(rise,run),slant=Math.hypot(rise,run);
    for(const side of [-1,1]){
      put(slate,0,g+eaves+rise/2,side*run/2,21.1,.24,slant+.04,side*pitch);
      put(timber,0,g+eaves,side*run,21.2,.26,.2);
      for(let bay=0;bay<10;bay++){
        const x=-9.45+bay*2.1;
        for(let row=0;row<3;row++){
          const t=(row+.5)/3;
          put(slate,x,g+eaves+rise*t+.16,side*run*(1-t),2.15,.075,slant/3+.1,side*pitch);
        }
        if(bay%3!==1)put(snow,x,g+eaves+rise*.21+.24,side*run*.79,1.7,.09,1.3,side*pitch);
      }
      for(let course=0;course<8;course++){
        const t=(course+1)/8;
        put(timberWarm,side*9.96,g+eaves+rise*(course+.5)/8,0,.16,rise/8+.01,Math.max(.12,10*(1-t)));
      }
      for(const x of [-9.8,-6.4,-3.2,0,3.2,6.4,9.8])
        put(timber,x,g+8.4,side*5.08,.21,8.4,.19);
      put(stoneDark,0,g+4.25,side*5.08,20.2,.31,.22);
      put(timber,0,g+9.55,side*5.08,20.2,.18,.22);
    }
    put(timber,0,g+17.12,0,21.15,.27,.35);
    // Reference K08: copper pipework and banded structural bays.
    // Pipes are mounted outside the wall above entry head clearance.
    for(const side of [-1,1]){
      put(rustIron,0,g+4.84,side*5.36,19.4,.28,.28);
      for(const dx of [-8,-4.8,-1.6,1.6,4.8,8])
        put(iron,dx,g+4.84,side*5.36,.16,.39,.39);
      for(const dx of [-9.45,9.45]){
        put(rustIron,dx,g+7.5,side*5.37,.26,5.4,.28);
        put(rustIron,dx,g+10.18,side*5.37,.48,.48,.36);
      }
    }
    // A bank of brass analog instrument faces and trays on the real
    // worktables; decorative readouts, not counterfeit game objectives.
    for(const dx of [-6,-3,3,6]){
      const p=fr.at(dx,2.4);
      cyl(brass,p.east,g+2.31,p.north,.28,.28,.12,12,fr.yaw,Math.PI/2);
      put(iron,dx,g+2.31,2.35,.045,.34,.06,0,-.35);
      put(timber,dx,g+1.22,2.38,1.25,.1,.75);
    }
    for(const dx of [-5,0,5]){
      put(iron,dx,g+5.68,2.75,1.55,.14,.65);
      for(const j of [-1,0,1])put(brass,dx+j*.42,g+5.9,2.75,.22,.30,.22);
    }
    for(const side of [-1,1])for(const dx of [-9,-3,3,9]){
      put(timber,dx,g+12.40,0,.25,.34,9.8);
      put(timber,dx,g+14.68,side*2.6,.22,6.2,.22,side*.86);
    }
    for (const dx of [-4.8, 4.8]) {
      put(timber, dx, g + 6.8, 5.12, 1.9, .28, .08, 0, .6);
      put(timber, dx, g + 6.8, 5.12, 1.9, .28, .08, 0, -.6);
    }
    // Tall independent chimney: ~34m total, near twice the 17m roof ridge.
    put(rustIron, -8, g + 18.0, -2, 1.1, 31, 1.1);
    put(stoneDark, -8, g + 33.75, -2, 1.5, .45, 1.5);
    // Loading platform, crates, and a burst instrument crate spilling brass parts.
    hall.slab(stone,0,6.65,8,3.30,.9,.9);
    for(const dx of [-1.48,1.48])put(timber,dx,g+2.3,5.04,.16,2.8,.18);
    put(timber,0,g+3.78,5.04,3.1,.22,.18);
    // Collision follows framed crates. Leave the central stair lane clear.
    for(const [dx,dz,w,h] of [[2.8,6.8,1.4,1.35],[-2.9,7.0,1.3,1.0]] as const){
      hall.piece(workshopWood,dx,dz,w,w,.9,.9+h);
      for(const s of [-1,1]){
        put(timber,dx+s*w*.39,g+.9+h/2,dz,.12,h+.04,w+.05);
        put(iron,dx,g+.9+h*.32,dz+s*w*.5,w,.07,.06);
      }
    }
    for(const side of [-1,1])for(let bay=0;bay<5;bay++){
      const dx=-8.7+bay*4.3;
      put(snow,dx,g+12.67,side*5.81,1.1,.09,.33);
      for(let k=0;k<3;k++){
        const h=.18+.12*((bay+k)%4);
        put(snow,dx-.32+k*.24,g+12.59-h/2,side*5.91,.09,h,.09);
      }
    }
    for (let i = 0; i < 5; i++) {
      const p = fr.at(-3.6 + hash(i * 3) * 1.6, 8 + hash(i * 7) * .8);
      box(brass, p.east, g + 1.05, p.north, .34, .22, .34, hash(i) * 3);
    }
    // Water tower: four legs, tank, cone cap.
    const wt = fr.at(15.5, -1);
    for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      const p = fr.at(15.5 + lx, -1 + lz);
      box(timber, p.east, g + 3.4, p.north, .32, 6.8, .32, fr.yaw, lz > 0 ? .06 : -.06, lx > 0 ? -.06 : .06);
    }
    // The reference water tower has a proper ring base, tank bands and
    // crossing braces. Keep the original independent tower location.
    for(const side of [-1,1]){
      for(const dx of [-1.6,1.6]){
        const p=fr.at(15.5+dx,-1+side*1.6);
        colliders.push({min:[p.east-.24,g,-p.north-.24],max:[p.east+.24,g+6.8,-p.north+.24]});
      }
      put(timber,15.5,g+3.45,-1+side*1.6, .23,7.05,.20,0,side*.42);
      put(timber,15.5,g+3.45,-1+side*1.6, .23,7.05,.20,0,-side*.42);
    }
    cyl(iron,wt.east,g+6.82,wt.north,2.48,2.48,.26,12);
    cyl(corrugated, wt.east, g + 8.4, wt.north, 2.3, 2.3, 3.2, 12);
    for(const h of [7.05,8.45,9.82])cyl(iron,wt.east,g+h,wt.north,2.36,2.36,.14,12);
    put(rustIron,13.15,g+3.50,-1,.22,6.7,.22);
    put(rustIron,11.7,g+1.0,-1,2.9,.25,.25);
    cone(slate, wt.east, g + 10.9, wt.north, 2.7, 1.8, 12);
    // Works signage (牌面 §六): brass name plate between the ground-floor
    // windows; the brittle paper notice nailed beside where the door reads.
    const plateP = fr.at(0, 5.16);
    siteAt('instrument-sign', plateP.east, plateP.north, 1);
    sign(plateP.east, g + 3.89, plateP.north, fr.yaw, 1.9, .62, brass, (c, w, h) => {
      const grad = c.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#a3803c'); grad.addColorStop(1, '#86652c');
      c.fillStyle = grad; c.fillRect(0, 0, w, h);
      c.font = 'bold 92px "Noto Sans SC", sans-serif';
      c.fillStyle = '#2e2410'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('仪器工坊', w / 2, h / 2 + 4);
    });
    const noteP = fr.at(3.4, 5.16);
    siteAt('instrument-notice', noteP.east, noteP.north, 1);
    sign(noteP.east, g + 2.5, noteP.north, fr.yaw, 1.05, 1.25, timberWarm, (c, w, h) => {
      let seed = 23;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      c.fillStyle = '#d9c69c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        c.fillStyle = `rgba(150, 118, 66, ${.08 + rnd() * .12})`;
        c.beginPath();
        c.arc(rnd() * w, rnd() * h, 14 + rnd() * 42, 0, 7);
        c.fill();
      }
      c.fillStyle = '#3a3125'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '46px "Noto Sans SC", sans-serif';
      c.fillText('各表送修，', w / 2, h * .22);
      c.fillText('先登记，后领取。', w / 2, h * .47);
      c.fillText('急件敲窗，莫敲门。', w / 2, h * .72);
      c.fillStyle = '#5d564c';
      for (const [nx, ny] of [[.06, .05], [.94, .05]] as const) {
        c.beginPath(); c.arc(w * nx, h * ny, 5, 0, 7); c.fill();
      }
    });
    // K-09/K-10 (《设计-全图文字件总表》，总控裁定 批55)：卡03 一层工位区
    // （校准台/仪表墙/零件柜）在本栋无可入内景——两牌改挂立面：校准台标牌
    // 挂两排窗之间（仪表墙外立面），柜门小牌挂装台木箱面（零件柜代位）。
    const calibP = fr.at(0, 5.16);
    siteAt('instrument-calibration-plate', calibP.east, calibP.north, 1);
    sign(calibP.east, g + 4.7, calibP.north, fr.yaw, 1.2, .4, brass, (c, w, h) => {
      c.fillStyle = '#86652c'; c.fillRect(0, 0, w, h);
      c.font = 'bold 60px "Noto Sans SC", sans-serif';
      c.fillStyle = '#2e2410'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('校准台', w / 2, h / 2 + 2);
    });
    const cabinetP = fr.at(2.5, 7.56);
    siteAt('instrument-cabinet-plate', cabinetP.east, cabinetP.north, 1);
    sign(cabinetP.east, g + 1.7, cabinetP.north, fr.yaw, .8, .3, timberWarm, (c, w, h) => {
      c.fillStyle = '#a36b48'; c.fillRect(0, 0, w, h);
      c.font = 'bold 52px "Noto Sans SC", sans-serif';
      c.fillStyle = '#2e2410'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('精密件 · 轻放', w / 2, h / 2 + 2);
    });
    // K-11 second-floor duty roster (《设计-全图文字件总表》，名册定版
    // 批64：三班轮值：陆衡／周文测／陆箬）. The plant has no enterable
    // second floor, so the roster board hangs on the upper facade between
    // the second-row windows — the same facade precedent as K-09/K-10.
    const rosterP = fr.at(0, 5.16);
    siteAt('instrument-duty-roster', rosterP.east, rosterP.north, 1);
    sign(rosterP.east, g + 6.8, rosterP.north, fr.yaw, 1.5, 1.0, timber, (c, w, h) => {
      c.fillStyle = '#d9c69c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 5; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#3a3125'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 54px "Noto Sans SC", sans-serif';
      c.fillText('值班表', w / 2, h * .17);
      c.font = '42px "Noto Sans SC", sans-serif';
      c.fillText('一班 陆衡', w / 2, h * .44);
      c.fillText('二班 周文测', w / 2, h * .65);
      c.fillText('三班 陆箬', w / 2, h * .86);
    });
  }

  // ---------- ore yard (bearing 186°): piles, sorting shed, small derrick ----------
  const yard = site('ore-yard', 186, 86, 11, 8);
  if (yard) {
    const fr = frame(yard, 186 + 180);
    const g = yard.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    const piles: [number, number, number, number, MeshStandardMaterial][] = [
      [-6, -2, 3.6, 2.6, ore], [-1, 3.5, 2.8, 2, oreOchre], [4.5, -3, 3.1, 2.2, oreGrey], [8, 2.5, 2.2, 1.5, ore],
    ];
    for (const [dx, dz, r, h, mat] of piles) {
      const p = fr.at(dx, dz);
      cone(mat, p.east, g + h / 2, p.north, r, h, 10);
      // S-1 collision: a cone pile blocks as its base square.
      hitBox(colliders, p.east, p.north, fr.yaw, r * 2, r * 2, g, g + h);
    }
    // Sorting shed: four posts, flat roof, sorted boxes beneath.
    for (const [px, pz] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 2.2], [2.6, 2.2]]) {
      put(timber, -8 + px, g + 1.5, -6 + pz, .26, 3, .26);
    }
    put(corrugated, -8, g + 3.2, -6, 6.4, .22, 5.6);
    put(snow, -8, g + 3.42, -6, 6.2, .16, 5.4);
    for (let i = 0; i < 3; i++) put(timberWarm, -9.4 + i * 1.5, g + .55, -6, 1.25, 1.1, 1.25);
    // Derrick: two A-frames, crossbeam, hook hanging over the yard.
    for (const s of [-1, 1]) {
      const p = fr.at(7 + s * 2.2, -6);
      box(timber, p.east, g + 2.6, p.north, .3, 5.6, .3, fr.yaw, 0, s * .38);
    }
    const beam = fr.at(7, -6);
    box(timber, beam.east, g + 5.2, beam.north, 5.6, .34, .34, fr.yaw);
    const hook = fr.at(7, -6);
    box(iron, hook.east, g + 3.9, hook.north, .1, 1.1, .1, fr.yaw);
    part(iron, new TorusGeometry(.3, .06, 5, 10), hook.east, g + 3.2, hook.north, fr.yaw);
    // Loose ore chunks scattered at the pile feet.
    for (let i = 0; i < 14; i++) {
      const p = fr.at(-8 + hash(i * 13 + 1) * 17, -5 + hash(i * 7 + 3) * 10);
      const s = .3 + hash(i * 5) * .5;
      part(ore, new DodecahedronGeometry(s, 0), p.east, g + s * .4, p.north, hash(i) * 3);
    }
    // K-16 (总表）: shed plate on the sorting shed's roof fascia, yard side.
    const shedPlateP = fr.at(-8, -3.14);
    siteAt('ore-shed-plate', shedPlateP.east, shedPlateP.north, 1);
    sign(shedPlateP.east, g + 3.2, shedPlateP.north, fr.yaw, 1.2, .4, timber, (c, w, h) => {
      c.fillStyle = '#5d4630'; c.fillRect(0, 0, w, h);
      c.font = 'bold 64px "Noto Sans SC", sans-serif';
      c.fillStyle = '#e8e0cc'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('料棚', w / 2, h / 2 + 2);
    });
    // K-18/19/20 (总表）: one labelled post at each sorted pile, on the clear
    // side (measured ≥5 m off the narrow-gauge corridor), facing the yard centre.
    const faceYard = (east: number, north: number) => Math.atan2(yard.east - east, -(yard.north - north));
    const pileSigns: [string, string, number, number][] = [
      ['ore-pile-ore-sign', '矿料', -1.8, -2.0],
      ['ore-pile-timber-sign', '木料', -1, 0.1],
      ['ore-pile-slag-sign', '渣料', 8.2, -3.0],
    ];
    for (const [id, word, dx, dz] of pileSigns) {
      const p = fr.at(dx, dz);
      put(timber, dx, g + .55, dz, .12, 1.1, .12);
      siteAt(id, p.east, p.north, 1);
      sign(p.east, g + .95, p.north, faceYard(p.east, p.north), .8, .35, timber, (c, w, h) => {
        c.fillStyle = '#5d4630'; c.fillRect(0, 0, w, h);
        c.font = 'bold 56px "Noto Sans SC", sans-serif';
        c.fillStyle = '#e8e0cc'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(word, w / 2, h / 2 + 2);
      });
    }
    // K-17 (总表）: the sealed storehouse itself was never built (card 05
    // structure, crater-outside) — this package builds the closed hut and
    // hangs the plate above its iron door. The door is sealed with a white band.
    const store = fr.at(-1.5, -7.5);
    siteAt('sealed-storehouse', store.east, store.north, 3);
    put(stone, -1.5, g + .15, -7.5, 4.8, .3, 3.6);
    put(timber, -1.5, g + 1.6, -9.2, 4.6, 2.6, .2);
    put(timber, -3.7, g + 1.6, -7.5, .2, 2.6, 3.4);
    put(timber, 0.7, g + 1.6, -7.5, .2, 2.6, 3.4);
    put(timber, -2.95, g + 1.6, -5.8, 1.7, 2.6, .2);
    put(timber, -0.05, g + 1.6, -5.8, 1.7, 2.6, .2);
    put(timber, -1.5, g + 2.55, -5.8, 1.2, .7, .2);
    put(slate, -1.5, g + 3.15, -8.35, 5.0, .14, 2.0, -.42, 0);
    put(slate, -1.5, g + 3.15, -6.65, 5.0, .14, 2.0, .42, 0);
    put(iron, -1.5, g + 1.4, -5.76, 1.2, 2.2, .1);
    put(snow, -1.5, g + 1.15, -5.67, .9, .16, .06);
    // S-1 collision: the storehouse is sealed — the iron door fills the
    // front span flush between the two front segments, so the front reads
    // as one continuous wall. Four wall boxes, no opening.
    for (const [dx, dz, sx, sz] of [[-1.5, -9.2, 4.6, .2], [-3.7, -7.5, .2, 3.4], [0.7, -7.5, .2, 3.4], [-1.5, -5.8, 4.6, .2]] as const) {
      const p = fr.at(dx, dz);
      hitBox(colliders, p.east, p.north, fr.yaw, sx, sz, g + .3, g + 2.9);
    }
    const storePlateP = fr.at(-1.5, -5.64);
    siteAt('sealed-storehouse-plate', storePlateP.east, storePlateP.north, 1);
    sign(storePlateP.east, g + 2.45, storePlateP.north, fr.yaw, 1.1, .4, iron, (c, w, h) => {
      c.fillStyle = '#3b3835'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.font = 'bold 64px "Noto Sans SC", sans-serif';
      c.fillStyle = '#d3cbb9'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('封存仓', w / 2, h / 2 + 2);
    });
  }

  // ---------- salvage-era ruins layer （修订一 §五） ----------
  const shedRuins = site('ruined-shed', 196, 94, 6, 4);
  if (shedRuins) {
    const fr = frame(shedRuins, 196 + 180);
    const g = shedRuins.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    put(corrugated, 0, g + 1.3, -2.4, 5.4, 2.6, .14);
    put(corrugated, -2.65, g + 1.3, 0, .14, 2.6, 4.8);
    put(corrugated, 2.65, g + 1.05, 0, .14, 2.1, 4.8);
    // Roof half-collapsed: one end still on the walls, the other on the ground.
    put(corrugated, 0, g + 2.1, .4, 5.8, .16, 5.6, .62);
    put(timberWarm, -1, g + .6, .5, 1.3, 1.2, 1.3, 0, .2);
    put(timber, 1.2, g + .5, -.8, 1.1, 1, 1.1);
    // S-1 collision: the ruin's three standing walls (front is collapsed
    // open where the roof came down).
    for (const [dx, dz, sx, sz] of [[0, -2.4, 5.4, .14], [-2.65, 0, .14, 4.8], [2.65, 0, .14, 4.8]] as const) {
      const p = fr.at(dx, dz);
      hitBox(colliders, p.east, p.north, fr.yaw, sx, sz, g, g + 2.6);
    }
  }
  // Rusted pipe sections east of the smelter, one half-buried.
  for (let i = 0; i < 3; i++) {
    const p = site(`pipe-section-${i + 1}`, 198 + i * 2.2, 97 + (i % 2) * 3, 3);
    if (!p) continue;
    cyl(rustIron, p.east, p.height + (i === 1 ? .35 : .8), p.north, .85, .85, 5.2, 12, d2r(198 + i * 2.2) + Math.PI / 2, 0, Math.PI / 2);
  }
  // Concrete foundation stubs along the belt's outer edge.
  for (let i = 0; i < 6; i++) {
    const b = 112 + i * 19 + hash(i * 7) * 6;
    const p = site(`foundation-stub-${i + 1}`, b, 101 + hash(i * 3) * 6, 2.5);
    if (!p) continue;
    const s = 1.6 + hash(i * 11) * 1.8;
    box(concrete, p.east, p.height + .3 + hash(i) * .3, p.north, s, .6 + hash(i * 5) * .7, s * .8, hash(i * 13) * 3);
  }

  // ================= 2b · three-layer isolation + outer band =================

  // ---------- layer 1: the town-era rammed-earth wall across the approach valley ----------
  const wallEast = -18, wallGateNorth = 159;
  siteAt('wall-south-end', wallEast, 10, 3);
  siteAt('wall-gate', wallEast, wallGateNorth, 3.4);
  siteAt('wall-north-end', wallEast, 310, 3);
  for (let n = 13; n <= 307; n += 6) {
    if (Math.abs(n - wallGateNorth) < 4.2) continue;
    const g = heightAt(wallEast, n);
    if (g === undefined) continue;
    box(stone, wallEast, g + .6, n, 1.5, 1.2, 6.15);
    box(earthWall, wallEast, g + 3, n, 1.15, 3.6, 6.15);
    box(stoneDark, wallEast, g + 5.15, n, 1.45, .7, 6.3);
    box(snow, wallEast, g + 5.56, n, 1.3, .12, 6.2);
    // S-1 collision: base + rammed earth + cap read as one wall mass.
    hitBox(colliders, wallEast, n, 0, 1.5, 6.15, g, g + 5.5);
  }
  {
    // Gate frame and two leaves standing open — the guard turns you back, not the door.
    const g = heightAt(wallEast, wallGateNorth);
    if (g !== undefined) {
      for (const s of [-1, 1]) {
        box(stone, wallEast, g + 3.1, wallGateNorth + s * 3.4, 1.7, 6.2, 1.1);
        const leafN = wallGateNorth + s * 2.2;
        box(timber, wallEast - 1.1, g + 2.2, leafN, .14, 4.4, 2.7, s * .85);
        box(iron, wallEast - 1.1, g + 3.4, leafN, .18, .3, 2.7, s * .85);
      }
      // S-1 collision: gate posts and the two leaves standing open — the
      // guard turns you back, not the door (design), so the channel between
      // the leaves' inner edges (≈2.6 m) stays walkable.
      for (const s of [-1, 1]) {
        hitBox(colliders, wallEast, wallGateNorth + s * 3.4, 0, 1.7, 1.1, g, g + 6.2);
        hitBox(colliders, wallEast - 1.1, wallGateNorth + s * 2.2, s * .85, .14, 2.7, g, g + 4.4);
      }
      box(timber, wallEast, g + 6.35, wallGateNorth, 1.2, .45, 8.2);
      // Town-office notice, fresh paint, on the south post's passage face
      // (牌面 §一, verbatim — the town era still speaks gently).
      siteAt('wall-gate-notice', wallEast, 156.2, 1);
      sign(wallEast, g + 3.3, 156.18, Math.PI, 1.5, 1.9, timberWarm, (c, w, h) => {
        c.fillStyle = '#c9ae7e'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(90, 70, 40, .4)'; c.lineWidth = 2;
        for (const fy of [.25, .5, .75]) {
          c.beginPath(); c.moveTo(0, h * fy); c.lineTo(w, h * fy); c.stroke();
        }
        c.strokeStyle = '#8a6f42'; c.lineWidth = 5;
        c.strokeRect(14, 14, w - 28, h - 28);
        c.fillStyle = '#33291d'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '600 45px "Noto Sans SC", sans-serif';
        c.fillText('坑区年久失修，', w / 2, h * .17);
        c.fillText('山路危险——', w / 2, h * .33);
        c.fillText('乡亲们送到这里，', w / 2, h * .52);
        c.fillText('就请回吧。', w / 2, h * .66);
        c.fillText('夜里风大，莫要久留。', w / 2, h * .82);
        c.font = '600 36px "Noto Sans SC", sans-serif'; c.textAlign = 'right';
        c.fillText('未写镇公所', w - 40, h * .93);
      });
      // K-27 (《设计-全图文字件总表》卡08): direction board on the north
      // post's passage face, mirroring the town-office notice opposite.
      siteAt('wall-gate-direction', wallEast, 161.8, 1);
      sign(wallEast, g + 3.3, 161.82, Math.PI, 1.6, .48, timber, (c, w, h) => {
        c.fillStyle = '#3a352d'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
        c.strokeRect(10, 10, w - 20, h - 20);
        c.font = '600 46px "Noto Sans SC", sans-serif';
        c.fillStyle = '#e8e2d2'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('北行坑区 · 请走正门', w / 2, h / 2 + 2);
      });
    }
  }
  // Gatehouse: enterable stone-and-timber hut on the town side of the gate, door to the road.
  const gatehouse = siteAt('gatehouse', -13, 150.5, 4);
  if (gatehouse) {
    const fr = frame(gatehouse, 90);
    const g = gatehouse.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    put(stone, 0, g + .5, 0, 5, 1, 4);
    put(timber, 0, g + 2.2, -1.93, 5, 2.6, .16);
    put(timber, -2.43, g + 2.2, 0, .16, 2.6, 4);
    put(timber, 2.43, g + 2.2, 0, .16, 2.6, 4);
    put(timber, -1.55, g + 2.2, 1.93, 1.75, 2.6, .16);
    put(timber, 1.85, g + 2.2, 1.93, 1.15, 2.6, .16);
    put(timber, .15, g + 3.35, 1.93, 2.25, .35, .16);
    // K-26 (《设计-全图文字件总表》卡08): hut name board on the front wall
    // over the doorway, centred on the door gap (dx +0.3), under the lintel.
    const gateSignP = fr.at(.3, 2.02);
    siteAt('gatehouse-sign', gateSignP.east, gateSignP.north, 1);
    sign(gateSignP.east, g + 2.92, gateSignP.north, fr.yaw, .95, .32, timber, (c, w, h) => {
      c.fillStyle = '#3a352d'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.font = 'bold 92px "Noto Sans SC", sans-serif';
      c.fillStyle = '#e8e2d2'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('门房', w / 2, h / 2 + 4);
    });
    // S-1 collision: stone base as a standable floor (a doorway ramp
    // bridges the 1 m rise), walls as colliders; the front doorway
    // between the two segments stays 1.95 m open.
    { const c = fr.at(0, 0); hitBox(floors, c.east, c.north, fr.yaw, 5, 4, g, g + 1); }
    hitRamp(ramps, fr, 3.05, 1.45, .95, g, g + 1);
    for (const [dx, dz, sx, sz] of [[0, -1.93, 5, .16], [-2.43, 0, .16, 4], [2.43, 0, .16, 4], [-1.55, 1.93, 1.75, .16], [1.85, 1.93, 1.15, .16]] as const) {
      const p = fr.at(dx, dz);
      hitBox(colliders, p.east, p.north, fr.yaw, sx, sz, g + .9, g + 3.5);
    }
    put(slate, 0, g + 4.35, -1.05, 5.7, .2, 2.6, .5);
    put(slate, 0, g + 4.35, 1.05, 5.7, .2, 2.6, -.5);
    // Interior: table, bench, duty board; lamp by the door.
    put(timberWarm, 0, g + 1.35, -.6, 1.7, .12, .9);
    put(timber, -.8, g + 1.3, .6, 1.5, .1, .45);
    const lampP = fr.at(1.4, 2.6);
    box(timber, lampP.east, g + 1, lampP.north, .14, 2, .14);
    box(glow, lampP.east, g + 2.15, lampP.north, .3, .38, .3);
    box(iron, lampP.east, g + 2.42, lampP.north, .44, .08, .44);
  }

  // ---------- layer 2: the full iron fence ring on the works boundary ----------
  const fencePosts: { bearing: number; radius: number }[] = [];
  {
    const gaps: [number, number][] = [[18, 24], [283, 289]];
    const stationGap: [number, number] = [102, 109];
    const railGap: [number, number] = [53, 61];
    const inZone = (b: number, z: [number, number]) => b >= z[0] && b <= z[1];
    const ringRadius = (b: number) => {
      if (b >= 108 && b < 142) return 102;
      if (b >= 142 && b < 146) return 102 - (b - 142) / 4 * 12;
      if (b >= 184 && b < 190) return 90 + (b - 184) / 6 * 14;
      if (b >= 190 && b < 224) return 104;
      if (b >= 224 && b < 230) return 104 - (b - 224) / 6 * 7;
      return 97;
    };
    let prev: { b: number; east: number; north: number; h: number } | undefined;
    for (let b = 0; b < 360; b += 2) {
      if (b >= 146 && b < 184) { prev = undefined; continue; }
      if (inZone(b, stationGap)) { prev = undefined; continue; }
      if (inZone(b, railGap)) { prev = undefined; continue; }
      if (gaps.some(z => inZone(b, z))) { prev = undefined; continue; }
      const r = ringRadius(b);
      const rad = d2r(b);
      const east = anchor.east + r * Math.sin(rad);
      const north = anchor.north + r * Math.cos(rad);
      const h = heightAt(east, north);
      if (h === undefined) { prev = undefined; continue; }
      box(rustIron, east, h + 2.35, north, .14, 4.7, .14, -rad);
      part(rustIron, new ConeGeometry(.11, .42, 5), east, h + 4.9, north, -rad);
      fencePosts.push({ bearing: b, radius: r });
      if (prev && b - prev.b === 2) {
        const midB = d2r((b + prev.b) / 2);
        const midR = (r + ringRadius(prev.b)) / 2;
        const me = anchor.east + midR * Math.sin(midB);
        const mn = anchor.north + midR * Math.cos(midB);
        const mh = heightAt(me, mn);
        if (mh !== undefined) {
          const chord = 2 * midR * Math.sin(d2r(1)) + .15;
          for (const ry of [1.15, 2.6, 4.05]) box(rustIron, me, mh + ry, mn, chord, .12, .07, -midB);
          for (let bar = 0; bar < 4; bar++) {
            const bb = d2r(prev.b + .4 + bar * .4);
            const br = ringRadius(prev.b + .4 + bar * .4);
            const be = anchor.east + br * Math.sin(bb);
            const bn = anchor.north + br * Math.cos(bb);
            const bh = heightAt(be, bn);
            if (bh !== undefined) box(rustIron, be, bh + 2.3, bn, .07, 4.4, .07, -bb);
          }
        }
      }
      // S-1 collision: one segment box per drawn panel span. The skip
      // conditions above (station / rail / collapsed gaps and the
      // 146–184° arc owned by the mouth-works fence) break the chain, so
      // every designed crossing stays open.
      if (prev && b - prev.b === 2) {
        hitSegment(colliders, prev.east, prev.north, east, north, .3,
          Math.min(prev.h, h), Math.max(prev.h, h) + 4.7);
      }
      prev = { b, east, north, h };
    }
    // Fallen panels at the two collapsed gaps — passable at night, never walled.
    for (const [z0, z1] of gaps) {
      const mid = d2r((z0 + z1) / 2);
      const r = ringRadius((z0 + z1) / 2);
      const e = anchor.east + r * Math.sin(mid);
      const n = anchor.north + r * Math.cos(mid);
      const h = heightAt(e, n);
      if (h === undefined) continue;
      box(rustIron, e, h + .3, n, 3.4, .12, 1.6, -mid + .3, 0, .06);
      box(rustIron, e + 1.2, h + .18, n + .8, 3, .1, 1.4, -mid - .2, 0, -.05);
    }
    // Half-rotted warning boards outside both collapsed gaps (牌面 §三,
    // same text at both — the sealing era's boards outlasted its people).
    gaps.forEach(([z0, z1], gi) => {
      const midDeg = (z0 + z1) / 2;
      const mid = d2r(midDeg);
      const r = ringRadius(midDeg) + 2.6;
      const e = anchor.east + r * Math.sin(mid);
      const n = anchor.north + r * Math.cos(mid);
      const h = heightAt(e, n);
      if (h === undefined) return;
      siteAt(`collapse-sign-${gi + 1}`, e, n, 1);
      box(timber, e, h + .62, n, .13, 1.24, .13, -mid);
      sign(e, h + 1.66, n, Math.PI - mid, 1.15, .85, timber, (c, w, hh) => {
        let seed = 31 + gi * 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        c.fillStyle = '#6e6455'; c.fillRect(0, 0, w, hh);
        for (let i = 0; i < 8; i++) {
          c.fillStyle = `rgba(38, 32, 26, ${.14 + rnd() * .2})`;
          c.beginPath();
          c.arc(rnd() * w, rnd() * hh, 12 + rnd() * 38, 0, 7);
          c.fill();
        }
        c.fillStyle = '#ded4c2'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '600 47px "Noto Sans SC", sans-serif';
        c.fillText('此处塌方，危险。', w / 2, hh * .32);
        c.fillText('绕行正门。', w / 2, hh * .68);
      });
    });
    // Flanking posts at the station crossing gap and the railway gate (mainline 3).
    for (const b of [101, 110, 52, 62]) {
      const rad = d2r(b);
      const r = ringRadius(b);
      const e = anchor.east + r * Math.sin(rad);
      const n = anchor.north + r * Math.cos(rad);
      const h = heightAt(e, n);
      if (h === undefined) continue;
      box(iron, e, h + 2.6, n, .3, 5.2, .3, -rad);
      hitBox(colliders, e, n, -rad, .3, .3, h, h + 5.2);
      fencePosts.push({ bearing: b, radius: r });
    }
  }
  site('fence-station-crossing', 105.5, ringRadiusAt(105.5), 4);
  function ringRadiusAt(b: number) {
    if (b >= 108 && b < 142) return 102;
    if (b >= 190 && b < 224) return 104;
    return 97;
  }

  // ---------- layer 3: three stone-iron defense towers ----------
  /** The north tower's real lamp — the warm chain's only outer-works light. */
  let northTowerLight: PointLight | undefined;
  function tower(origin: CraterOuterSite, totalH: number,
    mode: 'active' | 'tilted' | 'broken-ladder', faceDeg: number) {
    // Batch 83: each original defense tower becomes a genuinely walkable
    // two-turn square spiral around a solid masonry core. Cardinal frames
    // keep the actual rendered wall/tread rectangles and AABB authority equal.
    const fr = frame(origin, faceDeg), g=origin.height;
    const put = (mat:MeshStandardMaterial,dx:number,h:number,dz:number,
      sx:number,sy:number,sz:number,pitch=0,roll=0)=>{
      const p=fr.at(dx,dz);box(mat,p.east,h,p.north,sx,sy,sz,fr.yaw,pitch,roll);
    };
    const solid=(mat:MeshStandardMaterial,x:number,z:number,w:number,d:number,low:number,high:number)=>{
      put(mat,x,g+(low+high)/2,z,w,high-low,d);
      const p=fr.at(x,z);hitBox(colliders,p.east,p.north,fr.yaw,w,d,g+low,g+high);
    };
    const slab=(mat:MeshStandardMaterial,x:number,z:number,w:number,d:number,top:number,thickness=.13)=>{
      put(mat,x,g+top-thickness/2,z,w,thickness,d);
      const p=fr.at(x,z);hitBox(floors,p.east,p.north,fr.yaw,w,d,g+top-thickness,g+top);
    };
    const wp=(x:number,z:number,y:number):CraterTowerWalkPoint=>({...fr.at(x,z),height:g+y});
    const shaftH=totalH-2.6, deck=shaftH+.5, half=2.3, c=1.48, width=1.2;
    // Keep a genuine load-bearing center (the former center-blocking test
    // remains valid), while all four stair lanes are now hollow.
    solid(stone,0,0,.88,.88,0,shaftH);
    const wall=.18, outer=half-wall/2;
    // Ground doorway, 1.28m clear, centred on the first stair corner.
    const doorL=-c-.64,doorR=-c+.64;
    solid(stone,(doorL-half)/2,outer,doorL+half,wall,0,deck);
    solid(stone,(doorR+half)/2,outer,half-doorR,wall,0,deck);
    solid(stone,-c,outer,1.28,wall,2.35,deck);
    // Side/back walls have repeated small narrow light slots. Their 0.30m
    // aperture is smaller than the .54m player diameter; no false passage.
    function flank(axis:'x'|'z',side:number){
      const slot=.30, bands=Math.floor(deck/2.4);
      const panel=(a:number,b:number,low:number,high:number)=>{
        if(axis==='x')solid(stone,side*outer,(a+b)/2,wall,b-a,low,high);
        else solid(stone,(a+b)/2,side*outer,b-a,wall,low,high);
      };
      let low=0;
      for(let k=0;k<bands;k++){
        const sill=k*2.4+1.02,head=sill+.62;
        panel(-half,half,low,sill);
        panel(-half,-slot/2,sill,head);
        panel(slot/2,half,sill,head);
        low=head;
      }
      panel(-half,half,low,deck);
    }
    flank('x',-1);flank('x',1);flank('z',-1);
    for(const y of [deck*.31,deck*.62,deck-.28]){
      for(const side of [-1,1]){
        put(iron,side*half,g+y,0,.08,.18,4.6);
        put(iron,0,g+y,side*half,4.6,.18,.08);
      }
    }
    // 8 straight flights, 5 treads per flight. Every tread is an actual
    // standable floor slab. Corner landings connect the next 90-degree run.
    const corners=[[-c,c],[c,c],[c,-c],[-c,-c]] as const;
    const rises=8, treads=5, climb=deck/rises;
    const stairs:CraterTowerWalkPoint[]=[wp(-c,c,0)];
    for(let flight=0;flight<rises;flight++){
      const a=corners[flight%4]!,b=corners[(flight+1)%4]!;
      const dx=Math.sign(b[0]-a[0]),dz=Math.sign(b[1]-a[1]);
      const startX=a[0]+dx*width/2,startZ=a[1]+dz*width/2;
      const length=2*c-width, depth=length/treads;
      for(let k=0;k<treads;k++){
        const dist=(k+.5)*depth, x=startX+dx*dist,z=startZ+dz*dist;
        const h=climb*(flight+(k+1)/treads);
        slab(k%2===0?stoneDark:stone,x,z,dx?depth+.006:width,dz?depth+.006:width,h);
        // Embedded contrasting nosing, never a second collision surface.
        put(iron,x+dx*(depth/2-.025),g+h-.016,z+dz*(depth/2-.025),
          dx?.045:width,.026,dz?.045:width);
      }
      const landing=climb*(flight+1);
      slab(stoneDark,b[0],b[1],width,width,landing);
      stairs.push(wp(b[0],b[1],landing));
      // Small visible warm fixtures do not add point-light budget.
      const lightX=b[0]*1.38,lightZ=b[1]*1.38;
      put(glow,lightX,g+landing+1.4,lightZ,.13,.24,.13);
    }
    // Open BOTH uppermost stair flights for player headroom: the rear
    // penultimate run and left-hand final run are uncovered until the top
    // landing. The deck occupies the inner/front quadrant and exit tongue.
    slab(stoneDark,.75,.75,3.1,3.1,deck,.22);
    slab(stoneDark,-1.55,1.57,1.5,1.46,deck,.22);
    solid(iron,-.80,.02,.10,1.64,deck,deck+1.02);
    solid(iron,.75,-.80,3.10,.10,deck,deck+1.02);
    for(const side of [-1,1]){
      solid(stone,side*2.23,0,.19,4.6,deck,deck+.92);
      solid(stone,0,side*2.23,4.6,.19,deck,deck+.92);
      for(const x of [-1.75,0,1.75]){
        put(stoneDark,x,g+deck+1.02,side*2.23,.48,.20,.35);
        put(stoneDark,side*2.23,g+deck+1.02,x,.35,.20,.48);
      }
    }
    // Open canopy, rather than an inaccessible cabin mass. Preserve the
    // three towers' active / tilted / damaged silhouettes.
    const tilt=mode==='tilted'?.10:0;
    for(const x of [-.58,2.06])for(const z of [-.54,.94])
      solid(timber,x,z,.12,.12,deck,deck+2.15);
    const roofP=fr.at(.74,.20);
    part(slate,new ConeGeometry(1.90,.65,4),roofP.east,g+deck+2.35,roofP.north,
      fr.yaw+Math.PI/4,0,tilt);
    // The different tower-number rubbings share the stone plinth form.
    solid(stone,1.55,.15,.66,.65,deck,deck+.83);
    put(stoneDark,1.55,g+deck+.89,.15,.74,.12,.73);
    const marks=mode==='active'?1:mode==='tilted'?2:3;
    for(let i=0;i<marks;i++)
      put(brass,1.55+(i-(marks-1)/2)*.14,g+deck+.96,.15,.07,.025,.37);
    if(mode==='broken-ladder'){
      const fallen=fr.at(1.55,3.1);
      box(iron,fallen.east,g+.15,fallen.north,.65,.08,2.6,fr.yaw+.4,0,.04);
    }
    if(mode==='active'){
      const lampP=fr.at(-1.96,1.98);
      box(iron,lampP.east,g+deck+1.5,lampP.north,.1,2,.1);
      box(glow,lampP.east,g+deck+2.45,lampP.north,.34,.42,.34);
      const light=new PointLight(new Color(palette.ember),14,32,2);
      light.position.set(lampP.east,g+deck+2.45,-lampP.north);
      group.add(light);northTowerLight=light;
      // K-29/K-30 (《设计-全图文字件总表》卡10, north tower only — the west
      // tower takes no board per K-31): name plate on the shaft's entrance
      // face, duty plate on the platform parapet.
      const nameP = fr.at(.20, 2.34);
      siteAt('north-tower-sign', nameP.east, nameP.north, 1);
      sign(nameP.east, g + 1.6, nameP.north, fr.yaw, .7, .3, iron, (c, w, h) => {
        c.fillStyle = '#3b3835'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
        c.strokeRect(8, 8, w - 16, h - 16);
        c.font = 'bold 100px "Noto Sans SC", sans-serif';
        c.fillStyle = '#d3cbb9'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('北塔', w / 2, h / 2 + 4);
      });
      const dutyP = fr.at(.6, 2.34);
      siteAt('north-tower-duty', dutyP.east, dutyP.north, 1);
      sign(dutyP.east, g + deck + .52, dutyP.north, fr.yaw, .8, .5, timber, (c, w, h) => {
        c.fillStyle = '#3a352d'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
        c.strokeRect(10, 10, w - 20, h - 20);
        c.font = 'bold 110px "Noto Sans SC", sans-serif';
        c.fillStyle = '#e8e2d2'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('守塔', w / 2, h / 2 + 4);
      });
    }
    const entry=wp(-c,3.25,0),lookout=wp(1.38,1.39,deck);
    const rubbing=wp(1.55,.15,deck),rubbingUse=wp(.16,.15,deck);
    stairs.push(wp(.1,1.48,deck),lookout,wp(.16,1.1,deck),rubbingUse);
    towerRoutes.push({id:origin.id,entry,stairs,lookout,rubbing,rubbingUse});
  }
  const northTower = site('north-tower', 358, 67.5, 4, 13.5);
  if (northTower) tower(northTower, 13.5, 'active', 0);
  const westTower = site('west-tower', 262, 64, 4, 12.5);
  if (westTower) tower(westTower, 12.5, 'tilted', 270);
  const gateTower = siteAt('gate-tower', -30, 174, 4, 12);
  if (gateTower) tower(gateTower, 12, 'broken-ladder', 90);

  // ---------- outer-band mid-ground clusters (north/west band + approach) ----------
  const clusterSpots: [number, number][] = [[232, 84], [258, 96], [288, 86], [315, 102], [340, 90], [22, 98], [48, 84], [72, 106]];
  clusterSpots.forEach(([b, r], ci) => {
    const p = site(`outer-cluster-${ci + 1}`, b, r, 7);
    if (!p) return;
    const g = p.height;
    for (let i = 0; i < 4; i++) {
      const e = p.east + (hash(ci * 31 + i * 7) - .5) * 11;
      const n = p.north + (hash(ci * 17 + i * 3) - .5) * 11;
      const h = heightAt(e, n);
      if (h === undefined) continue;
      const s = 1.2 + hash(i * 13 + ci) * 2.4;
      part(i % 2 ? stoneDark : stone, new DodecahedronGeometry(s, 0), e, h + s * .3, n, hash(i + ci) * 3);
    }
    // One or two dead pines per cluster, bare trunks leaning.
    for (let i = 0; i < 2; i++) {
      const e = p.east + (hash(ci * 7 + i * 19) - .5) * 9;
      const n = p.north + (hash(ci * 23 + i * 5) - .5) * 9;
      const h = heightAt(e, n);
      if (h === undefined) continue;
      const lean = .08 + hash(i * 3 + ci) * .12;
      cyl(timber, e, h + 3.4, n, .14, .24, 7, 7, 0, 0, lean);
      cone(timber, e, h + 6.4, n, 1.5, 2.6, 7, 0, 0, lean);
    }
  });
  for (const [e0, n0] of [[-6, 118], [-6, 208]] as const) {
    const p = siteAt(`approach-cluster-${n0}`, e0, n0, 6);
    if (!p) continue;
    for (let i = 0; i < 3; i++) {
      const e = p.east + (hash(i * 7 + n0) - .5) * 7;
      const n = p.north + (hash(i * 3 + 1) - .5) * 7;
      const h = heightAt(e, n);
      if (h === undefined) continue;
      const s = 1 + hash(i * 11) * 1.8;
      part(stone, new DodecahedronGeometry(s, 0), e, h + s * .3, n, hash(i) * 3);
    }
  }

  // ---------- merge batches ----------
  for (const [mat, geos] of batches) {
    const joined = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g));
    if (!joined) continue;
    joined.computeBoundingSphere();
    const mesh = new Mesh(joined, mat);
    mesh.name = `crater-outer-${(mat as MeshStandardMaterial).uuid.slice(0, 6)}`;
    group.add(mesh);
  }
  // North-tower lamp follows the warm chain: on at night, off by day
  // (previously always on — same correction as the mouth-works lights).
  function setNight(value: boolean) {
    if (northTowerLight) northTowerLight.intensity = value ? 14 : 0;
    frostedGlass.emissiveIntensity=value?.70:.24;
  }
  setNight(true);
  return {
    group, sites, fencePosts, setNight, towerRoutes,industrialRoutes,
    wallLine: { east: wallEast, northStart: 13, northEnd: 307 },
    colliders, floors, ramps,
  };
}
