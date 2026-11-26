import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NearestFilter, PlaneGeometry, PointLight, RepeatWrapping, SRGBColorSpace, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { industrialBuilder, type IndustryPoint, type IndustryWindow } from './town-a-r30-industrial-shell';
import { orientedSupportBox } from './town-a-r30-oriented-support';
import { northFootwayPosts } from './town-a-r30-north-connector';
import { createZa36StrataTexture } from './town-za36-crater-ejecta';

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
function industrialSurface(kind:'wood'|'brick'|'sheet'|'plaster',base:number){
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
    }else if(kind==='plaster'){
      tone=Math.round(3*Math.sin(x*.47+y*.31)+2*Math.cos(y*.68-x*.16));
    }else{
      tone=x%8===0?-18:x%8===1?8:((Math.floor(y/8)+x*3)%5-2);
    }
    const c=(v:number)=>Math.max(0,Math.min(255,v+tone));
    data.set([c(r),c(g),c(b),255],(y*size+x)*4);
  }
  const map=new DataTexture(data,size,size);
  map.magFilter=map.minFilter=NearestFilter;
  map.wrapS=map.wrapT=RepeatWrapping;
  map.colorSpace=SRGBColorSpace;map.needsUpdate=true;
  const material=new MeshStandardMaterial({map,roughness:kind==='sheet'?.86:1});
  material.userData.metricTextureSpan=kind==='plaster'?1.6:.84;
  return material;
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
  const gatehouseSeats:{id:string;east:number;north:number;height:number;useEast:number;useNorth:number;yaw:number}[]=[];
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
  const workshopRust=industrialSurface('sheet',0x715044);
  const towerMasonry=industrialSurface('brick',0x686d62);
  const shoulderRock=new MeshStandardMaterial({map:createZa36StrataTexture(0x77716a,0x625a50,0xa08c70,37),roughness:1,flatShading:true});
  shoulderRock.name='A-R02-outer-shoulder-strata';
  const wallPlaster=industrialSurface('plaster',0x9b885f);
  const cleanSnow=new MeshStandardMaterial({color:0xdce5ee,roughness:1});
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
    const geo=new BoxGeometry(sx,sy,sz);
    const span=mat.userData.metricTextureSpan;
    if(typeof span==='number'&&span>0){
      const uv=geo.getAttribute('uv'),normal=geo.getAttribute('normal');
      // Constant physical texture size on different wall/prop dimensions.
      for(let i=0;i<uv.count;i++){
        const x=Math.abs(normal.getX(i))>.5,y=Math.abs(normal.getY(i))>.5;
        uv.setXY(i,uv.getX(i)*(x?sz:sx)/span,uv.getY(i)*(y?sz:sy)/span);
      }
    }
    part(mat,geo,east,h,north,yaw,pitch,roll);
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
      hall.piece(workshopSheet,dx,side*4.7,.38,.38,1.2,12.9);
      put(workshopWood,dx,g+12.45,0,.3,.4,10.3);
      put(workshopRust,dx,g+1.44,side*4.7,.60,.48,.60);
      put(workshopSheet,dx,g+12.7,side*4.7,.62,.25,.62);
    }
    hall.piece(workshopBrick,0,-.3,3.2,3.1,1.2,2.1);
    hall.piece(workshopRust,0,-.3,2.5,2.5,2.1,6.1);
    // Cold furnace: structural rings, bolted access cover and an overhead
    // duct. The cover remains closed; no heat, reward or process authority.
    for(const h of [2.24,3.64,5.89]){
      for(const s of [-1,1]){
        put(workshopSheet,s*1.26,g+h,-.3,.12,.18,2.64);
        put(workshopSheet,0,g+h,-.3+s*1.26,2.64,.18,.12);
      }
    }
    put(workshopSheet,0,g+3.25,1.01,1.42,1.78,.16);
    put(dark,0,g+3.25,1.10,1.05,1.41,.035);
    for(const x of [-.59,.59])for(const h of [2.49,3.12,3.90])
      put(brass,x,g+h,1.12,.10,.10,.075);
    put(workshopSheet,.35,g+3.2,1.18,.13,.13,.30);
    // Flush plates and pipework fit inside the masonry footing.
    for(const s of [-1,1]){
      put(workshopSheet,s*1.32,g+3.62,-.3,.14,2.0,1.72);
      put(workshopRust,s*1.40,g+3.62,-.3,.06,1.72,1.42);
      for(const z of [-.94,.34])for(const h of [2.86,3.62,4.38])
        put(workshopSheet,s*1.44,g+h,z,.07,.11,.11);
      put(workshopSheet,s*1.34,g+3.32,-.19,.21,.13,.58);
      for(const z of [-1.16,.56]){
        put(workshopSheet,s*1.36,g+4.22,z,.18,3.88,.18);
        for(const h of [2.48,4.68,5.72])put(workshopRust,s*1.40,g+h,z,.23,.15,.23);
      }
    }
    put(iron,0,g+7.25,-.3,1.25,2.3,1.25);
    put(workshopRust,-4.7,g+8.6,-.3,10.5,.65,.65);
    for(const x of [-8.9,-6.2,-3.5,-.8]){
      put(workshopSheet,x,g+8.6,-.3,.16,.80,.80);
      put(timber,x,g+10.65,-.3,.12,3.45,.12);
    }
    for(const dx of [-9,-6,9,12]){
      hall.piece(workshopWood,dx,-3.6,2.0,1.2,1.2,2.35);
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
    // Cold chimney: restrained masonry courses and a recessed dark flue.
    // All projecting detail is above the roof or within the existing stack.
    put(workshopBrick, 10.5, g + 13.0, -2, 1.5, 18, 1.5);
    for(const h of [19.0,20.15,21.3]){
      put(workshopRust,10.5,g+h,-2,1.59,.13,1.59);
      for(const x of [-.58,.58])for(const s of [-1,1])
        put(workshopSheet,10.5+x,g+h,-2+s*.80,.08,.08,.06);
    }
    put(stoneDark,10.5,g+22.10,-2,1.9,.20,1.9);
    for(const s of [-1,1]){
      put(workshopBrick,10.5+s*.78,g+22.36,-2,.34,.32,1.9);
      put(workshopBrick,10.5,g+22.36,-2+s*.78,1.22,.32,.34);
    }
    put(dark,10.5,g+22.215,-2,1.22,.025,1.22);
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
    cyl(workshopRust, bf.east, g + 5, bf.north, 1.9, 2.7, 10, 12);
    // Tapered load-bearing shell, restrained hoop reinforcement and riveted
    // seams. Bands stay inside the original 5.4m solid collision envelope.
    for(const h of [1.5,3.3,5.2,7.1,8.9]){
      const r=2.7-.08*h;
      cyl(workshopSheet,bf.east,g+h,bf.north,r+.06,r+.06,.18,12);
      for(let i=0;i<12;i++){
        const theta=i*Math.PI/6;
        const x=-19.5+Math.sin(theta)*(r+.03),z=Math.cos(theta)*(r+.03);
        put(workshopSheet,x,g+h,z,.12,.09,.12);
      }
    }
    cyl(workshopSheet, bf.east, g + 10.3, bf.north, 2.15, 2.15, .6, 12);
    const bfDoor = fr.at(-19.5, 2.55);
    box(dark, bfDoor.east, g + 1.1, bfDoor.north, 1.6, 2.2, .2, fr.yaw);
    cone(slag, fr.at(-19.5, 6.5).east, g + 1.1, fr.at(-19.5, 6.5).north, 3.4, 2.2, 10);
    cone(slag, fr.at(-24, -5).east, g + .9, fr.at(-24, -5).north, 2.8, 1.8, 10);
    // The separate cold blast furnace stays a solid mass. Hall walls and
    // interior furniture are already registered with their actual footprints.
    hitBox(colliders, bf.east, bf.north, fr.yaw, 5.4, 5.4, g, g + 10);
    // Hand cart, handles down, mid-yard.
    hall.piece(workshopWood,1.55,8,1.7,1.05,.62,.80);
    for(const s of [-1,1]){
      hall.piece(workshopWood,1.55+s*.79,8,.12,1.05,.80,1.05);
      const w=fr.at(1.55+s*.95,8);
      cyl(iron,w.east,g+.42,w.north,.42,.42,.12,10,fr.yaw,Math.PI/2);
      put(timber,1.55+s*.42,g+.73,9.04,.10,.12,1.2);
    }
    // Wheel axle and cart footprint match the solid body instead of
    // allowing a player to walk through the decorative vehicle.
    hall.piece(workshopSheet,1.55,8,2.10,.32,.22,.59);
    put(workshopWood,1.55,g+.91,7.54,1.58,.26,.12);
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
      const face=fr.at(dx,2.468);
      cyl(dark,face.east,g+2.31,face.north,.239,.239,.018,12,fr.yaw,Math.PI/2);
      for(let k=0;k<9;k++){
        const theta=-Math.PI*.70+k*Math.PI*.175;
        put(brass,dx+Math.sin(theta)*.19,g+2.31+Math.cos(theta)*.19,2.487,.026,.055,.012,0,theta);
      }
      put(brass,dx+.025,g+2.35,2.49,.025,.19,.016,0,-.35);
      put(iron,dx,g+2.31,2.505,.045,.045,.026);
      put(timber,dx,g+1.22,2.38,1.25,.1,.75);
      // Workbench cabinet face and small pull handles, within the existing
      // registered bench envelope; the aisle remains unobstructed.
      for(const x of [-.40,.40]){
        put(workshopSheet,dx+x,g+1.51,2.895,.70,.50,.012);
        put(brass,dx+x,g+1.62,2.901,.19,.035,.012);
      }
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
      if(mat===oreOchre){
        // Actual stacked timber, not an ochre cone masquerading as wood.
        for(let layer=0;layer<4;layer++){
          const count=7-layer, width=r*1.70-layer*.38;
          for(let j=0;j<count;j++){
            const x=dx+(j-(count-1)/2)*.49;
            put(workshopWood,x,g+.245+layer*.46,dz,.46,.46,width);
            for(const side of [-1,1])put(timberWarm,x,g+.245+layer*.46,dz+side*(width/2+.005),.38,.38,.012);
          }
        }
        for(const z of [-1.25,1.25])put(workshopRust,dx,g+.12,dz+z,3.8,.24,.15);
      }else{
        // Irregular faceted mounds, with buried edges and graded fragments.
        // Keep all exposed rock within the existing pile footprint.
        const geo=new ConeGeometry(r,h,13,3);
        const v=geo.getAttribute('position');
        for(let i=0;i<v.count;i++){
          const x=v.getX(i),y=v.getY(i),z=v.getZ(i);
          const angle=Math.atan2(z,x),factor=.84+.11*Math.cos(angle*3+dx)+.05*Math.sin(angle*5+dz);
          v.setXYZ(i,x*factor,y,z*factor);
        }
        geo.computeVertexNormals();part(mat,geo,p.east,g+h/2,p.north,fr.yaw);
        for(let i=0;i<22;i++){
          const a=i*2.39996,rr=r*(.52+.31*hash(i+dx*19)),s=.24+.19*hash(i*11+dz);
          const q=fr.at(dx+rr*Math.cos(a),dz+rr*Math.sin(a));
          part(i%4===0?stoneDark:mat,new DodecahedronGeometry(s,0),q.east,g+.24+s*.48,q.north,a);
        }
      }
      // S-1 collision: a cone pile blocks as its base square.
      hitBox(colliders, p.east, p.north, fr.yaw, r * 2, r * 2, g, g + h);
    }
    // Sorting shed: visible columns with exact player blockers; no solid
    // room-sized collider across the open shelter.
    const yardStructure=industrialBuilder(fr,g,put,colliders,floors);
    for (const [px, pz] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 2.2], [2.6, 2.2]]) {
      yardStructure.piece(workshopWood,-8+px,-6+pz,.26,.26,0,3);
      yardStructure.piece(workshopBrick,-8+px,-6+pz,.38,.38,0,.18);
    }
    // Sorting shelter: a real pitched roof, rafters, snow and framed bins.
    const shedPitch=Math.atan2(.72,2.8),shedSlant=Math.hypot(.72,2.8);
    for(const side of [-1,1]){
      put(workshopSheet,-8,g+3.49,-6+side*1.4,6.4,.14,shedSlant,side*shedPitch);
      put(snow,-8,g+3.60,-6+side*1.4,6.1,.09,shedSlant-.19,side*shedPitch);
      put(workshopWood,-8,g+3.04,-6+side*2.2,5.7,.21,.21);
      for(const x of [-10.6,-8,-5.4])put(workshopWood,x,g+3.43,-6+side*1.4,.13,.15,shedSlant,side*shedPitch);
    }
    put(workshopWood,-8,g+3.91,-6,6.45,.17,.21);
    for(const x of [-9.4,-7.9,-6.4]){
      yardStructure.piece(workshopWood,x,-6,1.25,1.25,0,1.1);
      for(const s of [-1,1]){
        put(timberWarm,x+s*.52,g+.55,-6,.10,1.12,1.27);
        put(workshopRust,x,g+.35,-6+s*.63,1.20,.09,.025);
      }
    }
    // Derrick: four anchored posts and overhead braces, with a clear
    // working bay underneath rather than disconnected floating legs.
    for(const s of [-1,1])for(const z of [-6.65,-5.35]){
      yardStructure.piece(workshopWood,7+s*2.2,z,.26,.26,0,5.2);
      yardStructure.piece(workshopBrick,7+s*2.2,z,.46,.46,0,.28);
      put(workshopRust,7+s*2.2,g+4.95,z,.35,.24,.35);
    }
    for(const z of [-6.65,-5.35]){
      put(workshopWood,7,g+4.9,z,4.7,.28,.26);
      for(const s of [-1,1])put(workshopWood,7+s*1.82,g+4.31,z,.19,1.40,.19,0,s*.59);
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
    const storeRun=1.92,storeRise=.76,storePitch=Math.atan2(storeRise,storeRun);
    for(const s of [-1,1]){
      put(slate,-1.5,g+2.98+storeRise/2,-7.5+s*storeRun/2,5.0,.14,Math.hypot(storeRun,storeRise),s*storePitch);
      put(snow,-1.5,g+3.09+storeRise/2,-7.5+s*storeRun/2,4.78,.09,Math.hypot(storeRun,storeRise)-.14,s*storePitch);
      for(let i=0;i<4;i++){
        const t=(i+.5)/4;
        put(workshopWood,-1.5+s*2.18,g+2.9+storeRise*t,-7.5,.17,storeRise/4+.012,3.4*(1-(i+1)/4)+.08);
      }
    }
    put(workshopWood,-1.5,g+3.84,-7.5,5.05,.14,.24);
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
    // Keep the three ruined walls, but expose their timber frames and
    // individual distorted metal sheets rather than one featureless slab.
    put(workshopSheet,0,g+1.3,-2.4,5.4,2.6,.14);
    put(workshopSheet,-2.65,g+1.3,0,.14,2.6,4.8);
    put(workshopSheet,2.65,g+1.05,0,.14,2.1,4.8);
    for(const x of [-2.48,-.82,.82,2.48]){
      put(workshopWood,x,g+1.3,-2.28,.18,2.6,.18);
      put(workshopRust,x,g+.22,-2.28,.22,.17,.20);
    }
    for(const s of [-1,1])for(const z of [-2.2,-.65,.95,2.2]){
      const h=s<0?2.6:2.1;
      put(workshopWood,s*2.55,g+h/2,z,.18,h,.17);
    }
    // Collapsed roof follows a continuous slope down to the old floor.
    // Visible narrow panels, split rafters and broken ends; omit the right
    // front panels to retain the original open approach.
    const roofRun=4.65,rise=2.38,pitch=Math.atan2(rise,roofRun);
    for(let i=0;i<7;i++){
      const x=-2.35+i*.77;
      const run=i>3?2.05:roofRun;
      const mid=-2.3+run/2;
      const top=2.63-rise*run/(2*roofRun);
      put(i%3===0?workshopRust:workshopSheet,x,g+top,mid,.74,.13,run/Math.cos(pitch),pitch);
      put(workshopWood,x-.31,g+top-.12,mid,.12,.14,run/Math.cos(pitch),pitch);
      for(let j=0;j<Math.floor(run/.75);j++){
        const z=-2.3+(j+.5)*.75,y=2.63-rise*(z+2.3)/roofRun;
        put(workshopRust,x,g+y+.07,z,.70,.045,.10,pitch);
      }
    }
    // Original interior debris now has actual obstruction bounds.
    const ruin=industrialBuilder(fr,g,put,colliders,floors);
    ruin.piece(workshopWood,-1,.5,1.3,1.3,0,1.2);
    ruin.piece(workshopWood,1.2,-.8,1.1,1.1,0,1);
    // Low fallen roof strips occupy the same existing ruin footprint.
    for(let i=0;i<7;i++){
      const run=i>3?2.05:roofRun,segments=Math.ceil(run/.72),step=run/segments;
      for(let j=0;j<segments;j++){
        const x=-2.35+i*.77,z=-2.3+(j+.5)*step;
        const y=2.63-rise*(z+2.3)/roofRun;
        const p=fr.at(x,z),dy=rise*step/(2*roofRun);
        hitBox(colliders,p.east,p.north,fr.yaw,.74,step,g+y-dy-.18,g+y+dy+.07);
      }
    }
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
    const yaw=d2r(198+i*2.2)+Math.PI/2,y=p.height+(i===1?.35:.8);
    // Open-ended pipe with genuine inner bore and rolled flanges.
    part(workshopRust,new CylinderGeometry(.85,.85,5.2,12,1,true),p.east,y,p.north,yaw,0,Math.PI/2);
    const inner=new CylinderGeometry(.73,.73,5.2,12,1,true);inner.scale(-1,1,1);inner.computeVertexNormals();
    part(workshopSheet,inner,p.east,y,p.north,yaw,0,Math.PI/2);
    for(const t of [-2.58,-.9,.9,2.58]){
      const e=p.east+Math.cos(yaw)*t,n=p.north+Math.sin(yaw)*t;
      part(workshopRust,new TorusGeometry(.79,.075,6,12),e,y,n,yaw+Math.PI/2);
    }
    hitBox(colliders,p.east,p.north,yaw,5.2,1.7,Math.max(p.height,y-.85),y+.85);
  }
  // Concrete foundation stubs along the belt's outer edge.
  for (let i = 0; i < 6; i++) {
    const b = 112 + i * 19 + hash(i * 7) * 6;
    const p = site(`foundation-stub-${i + 1}`, b, 101 + hash(i * 3) * 6, 2.5);
    if (!p) continue;
    const s = 1.6 + hash(i * 11) * 1.8;
    const yaw=hash(i*13)*3,hh=.6+hash(i*5)*.7;
    // Footing follows sampled ground corners and its flat top is actually
    // standable. Bolt stubs are short inlays, not invisible obstacles.
    const c=Math.cos(yaw),q=Math.sin(yaw);
    const soils=[-1,1].flatMap(x=>[-1,1].map(z=>heightAt(p.east+c*x*s/2+q*z*s*.4,p.north+q*x*s/2-c*z*s*.4)??p.height));
    const bottom=Math.min(p.height,...soils)-.10,top=p.height+hh;
    box(workshopBrick,p.east,(bottom+top)/2,p.north,s,top-bottom,s*.8,yaw);
    floors.push(orientedSupportBox(p.east,p.north,yaw,s,s*.8,bottom,top));
    for(const x of [-.28,.28])for(const z of [-.25,.25]){
      const e=p.east+c*x*s+q*z*s,n=p.north+q*x*s-c*z*s;
      box(workshopRust,e,top-.01,n,.13,.045,.13,yaw);
    }
  }

  // ================= 2b · three-layer isolation + outer band =================

  // ---------- layer 1: the town-era rammed-earth wall across the approach valley ----------
  const wallEast = -18, wallGateNorth = 159;
  siteAt('wall-south-end', wallEast, 10, 3);
  siteAt('wall-gate', wallEast, wallGateNorth, 3.4);
  siteAt('wall-north-end', wallEast, 310, 3);
  function wallBay(n:number,length:number,index:number){
    const g=heightAt(wallEast,n);
    if(g===undefined)return;
    // A footing reaches the lowest surveyed point along this real bay.
    // It cannot float over the town-height seam; the cap remains stepped.
    const soils=[-1,0,1].flatMap(side=>[-.5,0,.5].map(t=>heightAt(wallEast+side*.75,n+t*length)??g));
    const bottom=Math.min(...soils,g)-.12;
    const plinth=g+1.20;
    box(workshopBrick,wallEast,(bottom+plinth)/2,n,1.5,plinth-bottom,length);
    box(wallPlaster,wallEast,g+3,n,1.15,3.6,length);
    box(workshopBrick,wallEast,g+5.15,n,1.45,.7,length+.1);
    box(cleanSnow,wallEast,g+5.56,n,1.30,.12,length);
    hitBox(colliders,wallEast,n,0,1.5,length,bottom,g+5.62);
    // Weathered masonry blocks set into the plaster face. The shallow
    // relief stays inside the load-bearing stone plinth's footprint.
    for(const side of [-1,1]){
      for(let k=0;k<3;k++){
        const z=n+length*((k+.5)/3-.5);
        const y=g+1.54+((index+k)%3)*.28;
        box(workshopBrick,wallEast+side*.605,y,z,.12,.39,Math.min(.74,length/4));
      }
      if(length>4&&index%4===0){
        box(workshopBrick,wallEast+side*.65,g+2.78,n,.18,3.22,.66);
        box(stoneDark,wallEast+side*.65,g+4.47,n,.20,.23,.84);
      }
    }
  }
  for(let n=13;n<=307;n+=6){
    if(Math.abs(n-wallGateNorth)<4.2)continue;
    wallBay(n,6.15,Math.round((n-13)/6));
  }
  // Restore the two unequal side returns left by the old skipped bay
  // arithmetic. The only opening in this local span is the intended gate.
  wallBay((154.075+155.05)/2,155.05-154.075,24);
  wallBay((162.95+165.925)/2,165.925-162.95,25);
  {
    // Gate frame and two leaves standing open — the guard turns you back, not the door.
    const g = heightAt(wallEast, wallGateNorth);
    if (g !== undefined) {
      for (const s of [-1, 1]) {
        const postN=wallGateNorth+s*3.4;
        box(workshopBrick,wallEast,g+3.1,postN,1.7,6.2,1.1);
        box(stoneDark,wallEast,g+.34,postN,1.88,.68,1.30);
        for(let course=0;course<7;course++){
          const y=g+.82+course*.74;
          for(const side of [-1,1])
            box(workshopBrick,wallEast+side*.875,y,postN,.10,.52,.92);
        }
        box(stoneDark,wallEast,g+6.25,postN,1.92,.20,1.34);
        box(snow,wallEast,g+6.42,postN,1.85,.14,1.30);
        const leafN = wallGateNorth + s * 2.2;
        box(workshopWood,wallEast-1.1,g+2.2,leafN,.14,4.4,2.7,s*.85);
        for(const y of [1.02,3.4])box(workshopSheet,wallEast-1.1,g+y,leafN,.18,.22,2.7,s*.85);
      }
      // S-1 collision: gate posts and the two leaves standing open — the
      // guard turns you back, not the door (design), so the channel between
      // the leaves' inner edges (≈2.6 m) stays walkable.
      for (const s of [-1, 1]) {
        hitBox(colliders,wallEast,wallGateNorth+s*3.4,0,1.88,1.30,g,g+.68);
        hitBox(colliders,wallEast,wallGateNorth+s*3.4,0,1.85,1.1,g+.68,g+6.2);
        hitBox(colliders, wallEast - 1.1, wallGateNorth + s * 2.2, s * .85, .14, 2.7, g, g + 4.4);
      }
      box(workshopWood,wallEast,g+6.35,wallGateNorth,1.2,.45,8.2);
      // Reference gate's warm lantern and timber support, kept outside the
      // walking channel. Emissive glass uses the existing material budget.
      const lampN=wallGateNorth-3.4,lampE=wallEast+.99;
      box(timber,lampE,g+4.72,lampN,.13,.24,.66);
      box(iron,lampE+.13,g+4.41,lampN,.06,.48,.06);
      box(glow,lampE+.13,g+4.07,lampN,.30,.32,.30);
      for(const h of [3.88,4.27])box(iron,lampE+.13,g+h,lampN,.38,.06,.38);
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
  // Worn stone road flanks the gate, using the same batches as the wall.
  // Keep the swing leaves and pillar returns clear, and leave the north
  // station turn open. The individual stones are real low step supports,
  // with foundations sunk into the sampled surface, never floating decals.
  const roadStone=(e:number,n:number,w:number,d:number,rise:number)=>{
    const ys=[-1,1].flatMap(x=>[-1,1].map(z=>heightAt(e+x*w/2,n+z*d/2)??heightAt(e,n)??anchor.rimHeight));
    const bottom=Math.min(...ys)-.09,top=Math.max(...ys)+rise;
    box(workshopBrick,e,(bottom+top)/2,n,w,top-bottom,d);
    hitBox(floors,e,n,0,w,d,bottom,top);
  };
  for(const [start,end] of [[-14,-7],[-35,-23]] as const){
    for(let e=start+.35;e<end-.25;e+=.82){
      for(const side of [-1,1]){
        // Keep the exit to the passenger station free of curbs.
        if(side===1&&e<-28.5&&e>-34.5)continue;
        const n=wallGateNorth+side*(3.13+.07*Math.sin(e*2.1));
        roadStone(e,n,.74,.37,.10+.035*hash(e+side*13));
      }
      // Sparse exposed flagstones within the snow rather than a second
      // coplanar road sheet; the slight rise is comfortably walkable.
      for(let j=0;j<5;j++){
        const n=wallGateNorth+(j-2)*.95+.08*Math.sin(e*3+j);
        if(hash(e*11+j*23)>.48)
          roadStone(e+.08*Math.sin(j+e),n,.65,.80,.014);
      }
    }
  }

  // North pedestrian shoulder markers belong to the actual west carrier,
  // not to a separate road layer. Keep the 2m walking lane and rails clear.
  for(const p of northFootwayPosts){
    const g=heightAt(p.east,p.north);
    if(g===undefined)continue;
    box(workshopBrick,p.east,g+.10,p.north,.42,.36,.42);
    box(workshopWood,p.east,g+.65,p.north,.16,.92,.16);
    box(workshopSheet,p.east,g+1.03,p.north,.22,.12,.22);
    box(cleanSnow,p.east,g+1.13,p.north,.23,.08,.23);
    hitBox(colliders,p.east,p.north,0,.42,.42,g-.08,g+.28);
    hitBox(colliders,p.east,p.north,0,.23,.23,g+.28,g+1.17);
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
    const hut=industrialBuilder(fr,g,put,colliders,floors);
    hut.slab(workshopBrick,0,0,5,4,1,1.12);
    hut.shell(workshopWood,5,4,1,4.05,.3,1.95,2.35,{
      openings:[{side:-1,x:0,width:1.7,low:2.15,high:3.35}],
      frame:timber,glass:frostedGlass,
    });
    // Actual entry treads, not the old invisible ramp. Each tread extends
    // down to the local ground and the last meets the original stone floor.
    const entry=fr.at(.3,5.55);
    const low=(heightAt(entry.east,entry.north)??g)-g;
    const count=4,run=.68,doorZ=2.0;
    const path=[hut.point(.3,5.55,low)];
    for(let i=0;i<count;i++){
      const z=doorZ+(count-i-.5)*run,top=low+(1-low)*(i+1)/count;
      const p=fr.at(.3,z);
      const base=Math.min(top-.12,(heightAt(p.east,p.north)??g)-g-.07);
      hut.slab(workshopBrick,.3,z,1.85,run+.008,top,top-base);
      put(timber,.3,g+top+.018,z+run/2-.04,1.72,.036,.085);
      path.push(hut.point(.3,z,top));
    }
    path.push(hut.point(.3,1.35,1),hut.point(.3,.35,1));
    industrialRoutes.push({id:'gatehouse',points:path});
    for(const dx of [-2.36,2.36])for(const dz of [-1.86,1.86])
      put(timber,dx,g+2.53,dz,.20,3.06,.20);
    // K-26 (《设计-全图文字件总表》卡08): hut name board on the front wall
    // over the doorway, centred on the door gap (dx +0.3), under the lintel.
    const gateSignP = fr.at(.3, 2.02);
    siteAt('gatehouse-sign', gateSignP.east, gateSignP.north, 1);
    sign(gateSignP.east, g + 3.68, gateSignP.north, fr.yaw, .95, .32, timber, (c, w, h) => {
      c.fillStyle = '#3a352d'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.font = 'bold 92px "Noto Sans SC", sans-serif';
      c.fillStyle = '#e8e2d2'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('门房', w / 2, h / 2 + 4);
    });
    // A continuous pitched roof with real gable infill and exposed rafters.
    const eaves=4.05,rise=1.22,runRoof=2.30,pitch=Math.atan2(rise,runRoof);
    for(const side of [-1,1]){
      put(slate,0,g+eaves+rise/2,side*runRoof/2,5.7,.18,Math.hypot(rise,runRoof),side*pitch);
      put(cleanSnow,0,g+eaves+rise/2+.14,side*runRoof/2,5.55,.08,Math.hypot(rise,runRoof)-.1,side*pitch);
      put(timber,0,g+eaves,side*runRoof,5.75,.18,.18);
      for(let k=0;k<6;k++){
        const t=(k+.5)/6;
        put(workshopWood,side*2.42,g+eaves+rise*t,0,.18,rise/6+.01,4*(1-t)+.02);
      }
    }
    put(timber,0,g+eaves+rise+.12,0,5.8,.22,.31);
    for(const x of [-1.75,0,1.75])put(timber,x,g+3.97,0,.15,.18,4);
    // Furniture occupies its actual footprint. Keep the center walk lane
    // and a clear turning circle at the inside end of the stairs.
    hut.piece(workshopWood,-1.23,-.95,1.65,.68,1,1.77);
    put(timberWarm,-1.23,g+1.81,-.95,1.80,.10,.79);
    hut.piece(workshopWood,1.6,-.62,.48,1.7,1,1.48);
    put(timber,1.6,g+1.52,-.62,.56,.10,1.82);
    put(timber,1.86,g+1.86,-.62,.13,.62,1.8);
    const seat=fr.at(1.6,-.62),stand=fr.at(.72,-.62);
    gatehouseSeats.push({id:'gatehouse-bench',...seat,height:g+1,useEast:stand.east,useNorth:stand.north,yaw:0});
    hut.piece(workshopWood,-1.72,1.03,.64,.72,1,2.32);
    for(let y=0;y<3;y++)put(timberWarm,-1.72,g+1.28+y*.41,1.03,.72,.07,.8);
    put(timber,-1.23,g+2.59,-1.81,1.62,.72,.10);
    for(let k=0;k<3;k++)put(brass,-1.72+k*.48,g+2.52,-1.72,.035,.25,.035);
    put(glow,-1.23,g+2.05,-.95,.21,.36,.21);
    put(iron,-1.23,g+2.27,-.95,.27,.08,.27);
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
        // Fit the actual post-to-post chord, including the abrupt radius
        // transitions at the industrial reservations. Rails and the solid
        // collision segment now share the same centreline.
        const de=east-prev.east,dn=north-prev.north,dh=h-prev.h;
        const run=Math.hypot(de,dn),yaw=Math.atan2(dn,de),roll=Math.atan2(dh,run);
        const me=(east+prev.east)/2,mn=(north+prev.north)/2,mh=(h+prev.h)/2;
        const chord=Math.hypot(run,dh)+.13;
        for(const ry of [1.15,2.6,4.05])box(rustIron,me,mh+ry,mn,chord,.12,.07,yaw,0,roll);
        // Long diagonal transitions need more pickets, not wider holes.
        // Ground each picket and terminate it just below the sloped cap.
        const count=Math.max(4,Math.ceil(run/.70)-1);
        for(let bar=1;bar<=count;bar++){
          const t=bar/(count+1),be=prev.east+t*de,bn=prev.north+t*dn;
          const ground=heightAt(be,bn),line=prev.h+t*dh;
          if(ground===undefined)continue;
          const base=Math.min(ground+.10,line+.10),top=Math.max(ground+.25,line+4.50);
          box(rustIron,be,(base+top)/2,bn,.07,top-base,.07,yaw);
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
    solid(towerMasonry,0,0,.88,.88,0,shaftH);
    const wall=.18, outer=half-wall/2;
    // Ground doorway, 1.28m clear, centred on the first stair corner.
    const doorL=-c-.64,doorR=-c+.64;
    solid(towerMasonry,(doorL-half)/2,outer,doorL+half,wall,0,deck);
    solid(towerMasonry,(doorR+half)/2,outer,half-doorR,wall,0,deck);
    solid(towerMasonry,-c,outer,1.28,wall,2.35,deck);
    // Side/back walls have repeated small narrow light slots. Their 0.30m
    // aperture is smaller than the .54m player diameter; no false passage.
    function flank(axis:'x'|'z',side:number){
      const slot=.30, bands=Math.floor(deck/2.4);
      const panel=(a:number,b:number,low:number,high:number)=>{
        if(axis==='x')solid(towerMasonry,side*outer,(a+b)/2,wall,b-a,low,high);
        else solid(towerMasonry,(a+b)/2,side*outer,b-a,wall,low,high);
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
        put(workshopRust,side*half,g+y,0,.08,.18,4.6);
        put(workshopRust,0,g+y,side*half,4.6,.18,.08);
        for(const z of [-1.76,1.76]){
          put(workshopSheet,side*(half+.045),g+y,z,.065,.11,.14);
          put(workshopSheet,z,g+y,side*(half+.045),.14,.11,.065);
        }
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
        slab(k%2===0?workshopBrick:towerMasonry,x,z,dx?depth+.006:width,dz?depth+.006:width,h);
        // Embedded contrasting nosing, never a second collision surface.
        put(iron,x+dx*(depth/2-.025),g+h-.016,z+dz*(depth/2-.025),
          dx?.045:width,.026,dz?.045:width);
      }
      const landing=climb*(flight+1);
      slab(workshopBrick,b[0],b[1],width,width,landing);
      stairs.push(wp(b[0],b[1],landing));
      // Small visible warm fixtures do not add point-light budget.
      const lightX=b[0]*1.38,lightZ=b[1]*1.38;
      put(glow,lightX,g+landing+1.4,lightZ,.13,.24,.13);
    }
    // Open BOTH uppermost stair flights for player headroom: the rear
    // penultimate run and left-hand final run are uncovered until the top
    // landing. The deck occupies the inner/front quadrant and exit tongue.
    slab(workshopBrick,.75,.75,3.1,3.1,deck,.22);
    slab(workshopBrick,-1.55,1.57,1.5,1.46,deck,.22);
    solid(iron,-.80,.02,.10,1.64,deck,deck+1.02);
    solid(iron,.75,-.80,3.10,.10,deck,deck+1.02);
    for(const side of [-1,1]){
      solid(towerMasonry,side*2.23,0,.19,4.6,deck,deck+.92);
      solid(towerMasonry,0,side*2.23,4.6,.19,deck,deck+.92);
      put(cleanSnow,side*2.23,g+deck+.94,0,.17,.04,4.45);
      put(cleanSnow,0,g+deck+.94,side*2.23,4.45,.04,.17);
      for(const x of [-1.75,0,1.75]){
        put(workshopBrick,x,g+deck+1.02,side*2.23,.48,.20,.35);
        put(workshopBrick,side*2.23,g+deck+1.02,x,.35,.20,.48);
        put(cleanSnow,x,g+deck+1.145,side*2.23,.44,.045,.31);
        put(cleanSnow,side*2.23,g+deck+1.145,x,.31,.045,.44);
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

  // Four outlying lenses sit on the actual fractured carrier, separate
  // from the B-owned crater interior. Keep the south traverse at N51 free.
  const shoulderStacks:{east:number;north:number;bottom:number;top:number;width:number;depth:number}[]=[];
  const shoulderGroups=[
    [[-208,109],[-203,109],[-212,101],[-206,101]],
    [[-221,269],[-216,269],[-211,269],[-214,261]],
    [[-165,308],[-174,300],[-168,300]],
    [[-169,55],[-164,55],[-162,47],[-167,46]],
  ] as const;
  for(const [ci,cluster]of shoulderGroups.entries())for(const [i,[e,n]]of cluster.entries()){
    const w=1.6+hash(ci*37+i*11)*.95,d=.92+hash(ci*19+i*13)*.64;
    const samples=[-1,1].flatMap(x=>[-1,1].map(z=>heightAt(e+x*w/2,n+z*d/2)));
    if(samples.some(y=>y===undefined))continue;
    const base=Math.min(...samples as number[])-.12,ground=Math.max(...samples as number[]);
    if(colliders.some(b=>b.min[0]<e+w/2+.2&&b.max[0]>e-w/2-.2&&b.min[2]<-n+d/2+.2&&b.max[2]>-n-d/2-.2&&b.max[1]>base&&b.min[1]<ground+1.4))continue;
    const stackHeight=.62+hash(ci*13+i*17)*.52;
    const layers=[{e,n,w,d,low:base,high:ground+.32},
      {e:e+w*.07,n:n-d*.09,w:w*.81,d:d*.75,low:ground+.32,high:ground+stackHeight*.78},
      {e:e+w*.16,n:n-d*.13,w:w*.53,d:d*.54,low:ground+stackHeight*.78,high:ground+stackHeight}];
    // Stagger actual rectangular fragments instead of stacking three
    // identical slabs. Each visible fragment has its own matching support.
    function fragment(east:number,north:number,width:number,depth:number,bottom:number,top:number,snowCap=false){
      if(top<=bottom)return;
      box(shoulderRock,east,(bottom+top)/2,north,width,top-bottom,depth);
      hitBox(floors,east,north,0,width,depth,bottom,top);
      shoulderStacks.push({east,north,bottom,top,width,depth});
      if(snowCap){
        box(cleanSnow,east,top+.025,north,width*.83,.05,depth*.87);
        hitBox(floors,east,north,0,width*.83,depth*.87,top,top+.05);
      }
    }
    for(const [li,l]of layers.entries()){
      const seam=.065+.04*hash(ci*17+i*29+li*11);
      const split=.34+.30*hash(ci*43+i*19+li*23);
      const left=l.w*split-seam/2,right=l.w*(1-split)-seam/2;
      // Different break lines and depths on every layer; keep top pieces
      // seated inside the lower slab's bounds rather than hanging over air.
      fragment(l.e-l.w/2+left/2,l.n-.035*l.d,left,l.d*.94,l.low,l.high,li===2&&(ci+i)%3===0);
      fragment(l.e+l.w/2-right/2,l.n+.055*l.d,right,l.d*.83,l.low,l.high,li===2&&(ci+i)%4===1);
    }
    // Small detached chips, sunk into the carrier on the outer flank.
    const sign=n>=51?1:-1;
    for(let k=0;k<3;k++){
      const re=e+(k-1)*.64,rn=n+sign*(d*.65+.5+k*.31);
      const rw=.28+hash(ci*41+i*7+k*17)*.28,rd=.24+hash(ci*23+i*9+k*31)*.31;
      const heights=[-1,1].flatMap(x=>[-1,1].map(z=>heightAt(re+x*rw/2,rn+z*rd/2)));
      if(heights.some(h=>h===undefined))continue;
      const low=Math.min(...heights as number[])-.06,high=Math.max(...heights as number[])+.10+.13*hash(k+i*13+ci*19);
      if(Math.abs(rn-51)<2.8&&re>-175&&re<-150)continue;
      if(colliders.some(b=>b.min[0]<re+rw/2&&b.max[0]>re-rw/2&&b.min[2]<-rn+rd/2&&b.max[2]>-rn-rd/2&&b.max[1]>low&&b.min[1]<high))continue;
      fragment(re,rn,rw,rd,low,high,(k+ci+i)%4===0);
    }
  }
  // ---------- outer-band mid-ground clusters (north/west band + approach) ----------
  const clusterSpots: [number, number][] = [[232, 84], [258, 96], [288, 86], [315, 102], [340, 90], [22, 98], [48, 84], [72, 106]];
  const outerClusterPieces:{id:string;kind:'rock'|'pine';east:number;north:number;support:CraterHitBox}[]=[];
  // Preserve the already exercised public routes and north rail corridor.
  const protectedLines:number[][][]=[
    [[0,159],[-67,159]], [[-12,118],[-12,450]],
    [[-40,159],[-37,168],[-39,175],[-62,201],[-68,220],[-83,235],[-98,243],[-120,256],[-123.84,255.71]],
    [[-40,159],[-80,126],[-95,128],[-110,124],[-126,123],[-151,129],[-170,148],[-178,163],[-186.63,174.61]],
    [[-43,159],[-67,136],[-144,105],[-151.75,112.34]],
    [[-23,159],[-23,95],[-60,55],[-164,51]],
    [[-46,158],[-41,196],[-38,248],[-36,318]],
  ];
  const distanceTo=(e:number,n:number,a:number[],b:number[])=>{
    const dx=b[0]-a[0],dn=b[1]-a[1],t=Math.max(0,Math.min(1,((e-a[0])*dx+(n-a[1])*dn)/(dx*dx+dn*dn||1)));
    return Math.hypot(e-a[0]-dx*t,n-a[1]-dn*t);
  };
  function clearCluster(e:number,n:number,w:number,d:number){
    const margin=Math.hypot(w,d)/2+.65;
    if(e+w/2>=-1||e-w/2<=-240||n-d/2<=0||n+d/2>=336)return false;
    if(Math.hypot(e-anchor.east,n-anchor.north)<67+margin)return false;
    if(protectedLines.some(line=>line.slice(1).some((b,j)=>distanceTo(e,n,line[j]!,b)<margin+2.2)))return false;
    if(fencePosts.some(p=>Math.hypot(e-anchor.east-p.radius*Math.sin(d2r(p.bearing)),n-anchor.north-p.radius*Math.cos(d2r(p.bearing)))<margin+2.1))return false;
    if([...colliders,...floors].some(q=>q.min[0]<e+w/2+.45&&q.max[0]>e-w/2-.45&&q.min[2]<-n+d/2+.45&&q.max[2]>-n-d/2-.45))return false;
    return true;
  }
  clusterSpots.forEach(([b,r],ci)=>{
    const p=site(`outer-cluster-${ci+1}`,b,r,7);
    if(!p)return;
    let rocks=0,pines=0;
    for(let j=0;j<84&&(rocks<4||pines<2);j++){
      const pine=rocks>=4;
      const phase=j*2.399963+ci*.73;
      const radius=2.8+(j%11)*.68;
      const e=p.east+Math.cos(phase)*radius,n=p.north+Math.sin(phase)*radius;
      const w=pine?1.1:1.65+hash(ci*31+j*7)*1.9,d=pine?1.1:1.1+hash(ci*17+j*13)*1.3;
      if(!clearCluster(e,n,w,d))continue;
      const ys=[-1,1].flatMap(x=>[-1,1].map(z=>heightAt(e+x*w/2,n+z*d/2)));
      if(ys.some(y=>y===undefined))continue;
      const low=Math.min(...ys as number[])-.12,h=Math.max(...ys as number[]);
      const record=(kind:'rock'|'pine',q:CraterHitBox)=>outerClusterPieces.push({id:p.id,kind,east:e,north:n,support:q});
      if(!pine){
        const rise=.62+hash(ci*19+j*23)*1.08;
        box(shoulderRock,e,(low+h+.34)/2,n,w,h+.34-low,d);
        hitBox(floors,e,n,0,w,d,low,h+.34);record('rock',floors.at(-1)!);
        const x=e+.08*w,z=n-.10*d,tw=w*.72,td=d*.72;
        box(shoulderRock,x,h+(.34+rise)/2,z,tw,rise-.34,td);
        hitBox(floors,x,z,0,tw,td,h+.34,h+rise);
        if((ci+j)%2===0){
          box(cleanSnow,x,h+rise+.035,z,tw*.84,.07,td*.88);
          hitBox(floors,x,z,0,tw*.84,td*.88,h+rise,h+rise+.07);
        }
        rocks++;
      }else{
        const trunkH=4.5+hash(ci*31+j*17)*2.2;
        const stem=.28+hash(ci*13+j)*.09;
        // Box-section trunk and roots use exact visible collision; short
        // broken branches sit above player head height.
        box(workshopWood,e,(low+h+.24)/2,n,1.02,h+.24-low,.34);
        box(workshopWood,e,(low+h+.24)/2,n,.34,h+.24-low,1.02);
        hitBox(floors,e,n,0,1.02,.34,low,h+.24);
        hitBox(floors,e,n,0,.34,1.02,low,h+.24);
        // Taper the trunk above the walking envelope. Each section owns
        // a matching solid; bark plates and jagged splinters are visible.
        const joints=[{e,n,lo:low,hi:h+2.3,w:stem},
          {e:e+.045,n:n-.025,lo:h+2.3,hi:h+trunkH*.72,w:stem*.82},
          {e:e+.075,n:n-.055,lo:h+trunkH*.72,hi:h+trunkH,w:stem*.58}];
        for(const [k,s] of joints.entries()){
          box(workshopWood,s.e,(s.lo+s.hi)/2,s.n,s.w,s.hi-s.lo,s.w);
          hitBox(colliders,s.e,s.n,0,s.w,s.w,s.lo,s.hi);
          if(k===0)record('pine',colliders.at(-1)!);
        }
        for(const side of [-1,1]){
          box(timber,e+side*stem*.47,h+.94,n,.05,1.38,stem*.62);
          box(timber,e,h+1.24,n+side*stem*.47,stem*.52,1.74,.045);
        }
        const branchCount=3+((ci+j)%3);
        for(let k=0;k<branchCount;k++){
          const angle=ci*.89+j*.63+k*2.399963;
          const y=h+2.55+k*(trunkH-2.85)/branchCount;
          const len=(.78+hash(j*17+k*19+ci)*.88)*(1-k*.11);
          const dx=Math.cos(angle),dn=Math.sin(angle),slope=.23+.42*hash(ci*11+j+k*7);
          const bx=e+dx*len*.42,bn=n+dn*len*.42;
          // Local X follows the branch azimuth; positive local X rises.
          box(workshopWood,bx,y+len*.12,bn,len,.13,.16,angle,0,slope);
          if((ci+j+k)%2===0)box(cleanSnow,bx,y+len*.12+.09,bn,len*.55,.045,.11,angle,0,slope);
          const fx=e+dx*len*.79,fn=n+dn*len*.79;
          box(timber,fx,y+len*.23+.19,fn,.09,.47,.10,angle,0,-.22);
          if(k%2===0)box(timber,fx-dn*.15,y+len*.23+.12,fn+dx*.15,.37,.075,.08,angle+Math.PI/2,0,.45);
        }
        const crown=joints[2]!;
        for(const [k,side]of [-1,1].entries())
          box(workshopWood,crown.e+side*crown.w*.24,h+trunkH+.12+k*.08,crown.n,crown.w*.42,.24+k*.16,crown.w*.73);
        pines++;
      }
    }
  });
  // Rebuild the two old decorative approach clusters as low, grounded
  // fractured shelves. Both stay between the town seam and the E-12
  // north walking lane, with the existing site anchors unchanged.
  const approachRockSupports:CraterHitBox[]=[];
  for(const [e0,n0]of [[-6,118],[-6,208]] as const){
    const p=siteAt(`approach-cluster-${n0}`,e0,n0,6);
    if(!p)continue;
    for(const [i,[dx,dn,w,d,rise]]of [[-1.3,-2.9,1.7,1.3,.58],[1.0,.2,1.8,1.4,.82],[-1.6,2.6,1.45,1.1,.46]].entries()){
      const e=e0+dx,n=n0+dn;
      const groundSamples=[-1,1].flatMap(x=>[-1,1].map(z=>heightAt(e+x*w/2,n+z*d/2)));
      if(groundSamples.some(h=>h===undefined))continue;
      const bottom=Math.min(...groundSamples as number[])-.12,top=Math.max(...groundSamples as number[]);
      const before=approachRockSupports.length;
      const make=(ce:number,cn:number,cw:number,cd:number,lo:number,hi:number,mat:MeshStandardMaterial)=>{
        box(mat,ce,(lo+hi)/2,cn,cw,hi-lo,cd);
        hitBox(approachRockSupports,ce,cn,0,cw,cd,lo,hi);
      };
      make(e,n,w,d,bottom,top+.27,shoulderRock);
      make(e+w*.09,n-d*.08,w*.72,d*.76,top+.27,top+rise,shoulderRock);
      if(i%2===0)make(e+w*.09,n-d*.08,w*.62,d*.65,top+rise,top+rise+.06,cleanSnow);
      floors.push(...approachRockSupports.slice(before));
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
    group, sites, fencePosts, setNight, towerRoutes,industrialRoutes,gatehouseSeats,shoulderStacks,approachRockSupports,outerClusterPieces,
    wallLine: { east: wallEast, northStart: 13, northEnd: 307 },
    colliders, floors, ramps,
  };
}
