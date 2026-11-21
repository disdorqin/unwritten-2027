import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NearestFilter, PlaneGeometry, PointLight, SRGBColorSpace, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
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
export function buildCraterOuterWorks(road: CraterRoad) {
  const { anchor, heightAt } = road;
  const group = new Group();
  group.name = 'crater-outer-works';
  const sites: CraterOuterSite[] = [];
  const interiorEntrances: { id:string; east:number; north:number; height:number; yaw:number; clearWidth:number }[] = [];
  type InteriorMechanism = { id:'smelter-cold-valve'|'instrument-calibration';
    east:number; north:number; foot:number; range:number; state:number; handle:Group };
  const mechanisms:InteriorMechanism[]=[];
  function addMechanicalDial(id:InteriorMechanism['id'],position:{east:number;north:number},
    foot:number,y:number,yaw:number) {
    const dial=new Group();
    dial.name='za36-manual-'+id;
    dial.position.set(position.east,y,-position.north);
    dial.rotation.y=yaw;
    const face=new Mesh(new BoxGeometry(.82,.12,.12),brass);
    face.name='za36-turning-mechanical-indicator';
    dial.add(face);
    group.add(dial);
    mechanisms.push({id,east:position.east,north:position.north,foot,
      range:1.7,state:0,handle:dial});
  }

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
  const slag = new MeshStandardMaterial({ color: 0x2e2c30, roughness: 1, flatShading: true });
  const brass = new MeshStandardMaterial({ color: palette.brass, roughness: .45, metalness: .65 });
  const glow = new MeshStandardMaterial({
    color: palette.windowWarm, emissive: palette.ember, emissiveIntensity: 1.25, roughness: .8,
  });

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

  /** A text-bearing board: batched backing plus a canvas face. All crater
   * signage text is 《文本-坑区牌面-2026-11-21》 verbatim — never paraphrased. */
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
    // On current live heightAt the shop pad must not submerge the visitor.
    put(stone, 0, g + .07, 0, 28, .14, 11);
    // R1 structural build: a *hollow* 28x11m factory, not the former solid
    // corrugated cuboid that blocked the entire interior volume.
    put(corrugated, 0, g + 4.55, -5.36, 27.8, 8.9, .28);
    for (const side of [-1,1]) {
      put(corrugated, side*13.86, g + 4.55, 0, .28, 8.9, 10.8);
    }
    // Open 3.5m freight door at dx=-4. Main wall is split; overhead lintel
    // stops rain but leaves the visitor's full 4m headroom.
    put(corrugated, -9.875, g + 4.55, 5.36, 8.25, 8.9, .28);
    put(corrugated, 5.875, g + 4.55, 5.36, 16.25, 8.9, .28);
    put(corrugated, -4, g + 7.15, 5.36, 3.8, 3.7, .28);
    const smelterDoor = fr.at(-4,5.58);
    interiorEntrances.push({id:'smelter-plant',...smelterDoor,height:g+.14,yaw:fr.yaw,clearWidth:3.5});
    for (const dx of [-13.5, -6.75, 0, 6.75, 13.5]) put(timber, dx, g + 5.1, 5.45, .45, 7.8, .3);
    put(slate, -7.05, g + 10.6, 0, 14.6, .28, 12.6, 0, .5);
    put(slate, 7.05, g + 10.6, 0, 14.6, .28, 12.6, 0, -.5);
    put(timber, 0, g + 12.3, 0, 28.6, .4, .5);
    // R4 industrial-voxel style: each corrugated sheet is visibly fastened
    // at 1.8m intervals; fine rust seams stay within the inherited palette.
    for(let dx=-12.8;dx<=12.8;dx+=1.6) {
      if(dx>-5.82 && dx<-2.18)continue; // keep the 3.5m freight aperture
      put(rustIron,dx,g+7.8,5.54,.09,2.00,.08);
      put(iron,dx,g+1.75,5.56,.12,.12,.11);
      put(iron,dx,g+6.15,5.56,.12,.12,.11);
    }
    for(const side of [-1,1]) for(let dz=-4.3;dz<=4.3;dz+=1.65){
      put(rustIron,side*14.04,g+7.3,dz,.075,2.0,.10);
      put(timberWarm,side*14.04,g+1.45,dz,.13,.14,.15);
    }
    for(let dx=-11.6;dx<=12.0;dx+=2.6) {
      put(snow,dx,g+12.52,0,1.20,.12,.24);
      put(rustIron,dx,g+10.54,5.82,.36,.12,.16);
    }
    // The furnace door swings aside; a black panel across the opening was
    // removed because it visually defeated the new enterable ground floor.
    for (const side of [-1,1]) put(iron, -4+side*1.78, g+2.65,5.64,.12,5.1,.16);
    put(iron,-4,g+5.03,5.64,3.6,.14,.16);
    // Shallow outside threshold reduces the one-metre plinth step.
    put(stone,-4,g+.08,6.08,3.45,.16,1.02);
    const doorP = fr.at(-2.1, 5.75);
    box(iron, doorP.east, g + 2.1, doorP.north, 1.7, 4.2, .14, fr.yaw + .5);
    // Tall brick chimney, cold.
    put(rustIron, 10.5, g + 9.5, -2, 1.5, 13, 1.5);
    put(stoneDark, 10.5, g + 16.2, -2, 1.9, .5, 1.9);
    // Ingot stacks and crates left where the last shift dropped them.
    for (let s = 0; s < 3; s++) {
      for (let layer = 0; layer < 3 - s; layer++) {
        for (let i = 0; i < 4 - layer; i++) {
          put(iron, 6 + s * 2.6, g + .45 + layer * .62, 9.5, 1.9, .55, .8);
        }
      }
    }
    put(timberWarm, -9, g + .8, 9, 1.6, 1.6, 1.6);
    put(timberWarm, -7.2, g + .7, 9.4, 1.4, 1.4, 1.4, 0, .2);
    // First-pass interior: two working aisles with visible production tools.
    // Keep the central dx=-4 aisle from the public door to the back free.
    for(const x of [-11.25,10.35]) {
      for(const z of [-3.6,-.75,2.2]) {
        put(timberWarm,x,g+2.2,z,3.0,.16,1.15);
        for(const sx of [-1.18,1.18]) for(const sz of [-.36,.36])
          put(timber,x+sx,g+1.55,z+sz,.17,1.9,.17);
      }
    }
    // Cold furnace body, casting mouth, two heat shields, and twelve valves.
    put(stoneDark,7.1,g+3.0,-2.4,4.2,3.8,2.45);
    put(dark,7.1,g+3.1,-1.12,2.5,2.5,.08);
    for(const x of [4.8,9.4])put(iron,x,g+3.15,-2.4,.20,4.2,2.1);
    for(let i=0;i<12;i++){
      const x=4.0+(i%6)*1.13,z=-3.9+Math.floor(i/6)*.65;
      put(brass,x,g+1.5+(i%3)*.30,z,.36,.20,.24);
    }
    // Logbooks and gauges remain an unpowered industrial set, not invented lore.
    for(let i=0;i<9;i++) {
      const x=-11.2+(i%3)*1.0,z=-3.35+Math.floor(i/3)*.78;
      put(iron,x,g+2.5,z,.66,.16,.58);
      put(brass,x,g+2.65,z,.35,.05,.24);
    }
    // Freight bridge and suspended chain hang inside the actual roof volume.
    put(iron,0,g+8.25,0,26,.25,.32);
    for(const x of [-6.5,4.8,9.8]){
      put(iron,x,g+7.45,0,.11,1.4,.11);
      put(rustIron,x,g+6.65,0,.58,.21,.58);
    }
    // R5 retained detail: tie-downs, hand tools, cold ash and rust waterlines.
    for(const side of [-1,1])for(let j=0;j<10;j++){
      const z=-4.3+j*.87;
      put(iron,side*13.37,g+2.72,z,.38,.12,.13);
      if(j%3===0)put(rustIron,side*13.34,g+1.2,z,.12,2.0,.11);
    }
    for(let j=0;j<14;j++){
      const x=-11.3+(j%7)*.35,z=-3.0+Math.floor(j/7)*.78;
      put(iron,x,g+2.43,z,.23,.08,.1);
    }
    const valvePosition=fr.at(7.1,-1.02);
    addMechanicalDial('smelter-cold-valve',valvePosition,g,g+3.06,fr.yaw);
    // Blast-furnace tower, independent at the west end: tapered iron stack, cold mouth.
    const bf = fr.at(-19.5, 0);
    cyl(rustIron, bf.east, g + 5, bf.north, 1.9, 2.7, 10, 12);
    cyl(iron, bf.east, g + 10.3, bf.north, 2.15, 2.15, .6, 12);
    const bfDoor = fr.at(-19.5, 2.55);
    box(dark, bfDoor.east, g + 1.1, bfDoor.north, 1.6, 2.2, .2, fr.yaw);
    cone(slag, fr.at(-19.5, 6.5).east, g + 1.1, fr.at(-19.5, 6.5).north, 3.4, 2.2, 10);
    cone(slag, fr.at(-24, -5).east, g + .9, fr.at(-24, -5).north, 2.8, 1.8, 10);
    // Reference ref-09: the old furnace needs real block-by-block brickwork,
    // soot streaks, drooping eave ice and a manual ore bucket on a side jib.
    // The smithy stays COLD per the canonical abandoned-worksite story.
    for(let row=0;row<12;row++){
      const y=g+1.2+row*.79;
      const stagger=row%2?.34:0;
      for(let col=0;col<4;col++){
        const p=fr.at(9.70+((col*1.12+stagger)%3.5),-1.20);
        put(row%3===0?stoneDark:rustIron,9.55+col*.24,y,-1.19,.12,.12,.11);
      }
      put(stoneDark,10.5,g+1.2+row*.88,-.88,2.05,.11,.22);
    }
    for(let i=0;i<20;i++){
      const dx=-12.5+i*1.3;
      const length=.42+(i%5)*.17;
      const p=fr.at(dx,5.8);
      cone(snow,p.east,g+9.95-length*.5,p.north,.14,length,6,fr.yaw,Math.PI);
      if(i%3===0)put(snow,dx,g+10.35,5.83,.75,.16,.46);
    }
    // An exposed hoist, cold slag basket, and riveted workshop tooling.
    const hoist=fr.at(-19.6,10.7);
    box(timber,hoist.east,g+2.9,hoist.north,.45,5.8,.45,fr.yaw);
    const jib=fr.at(-17.4,10.7);
    box(timber,jib.east,g+5.65,jib.north,4.8,.35,.43,fr.yaw,0,-.09);
    for(let j=0;j<6;j++){
      const p=fr.at(-15.6,10.7);
      box(iron,p.east,g+5.0-j*.42,p.north,.06,.32,.07,fr.yaw);
    }
    const bucket=fr.at(-15.6,10.7);
    cyl(rustIron,bucket.east,g+2.55,bucket.north,.57,.34,.88,8);
    cyl(iron,bucket.east,g+2.07,bucket.north,.44,.48,.08,8);
    for(let k=0;k<7;k++){
      const p=fr.at(-18.8+k*.62,8.85);
      put(iron,-18.8+k*.62,g+.61,8.85,.37,.35,.72);
    }
    // Hand cart, handles down, mid-yard.
    const cart = fr.at(2, 8);
    box(timber, cart.east, g + .75, cart.north, 1.7, .18, 1.05, fr.yaw);
    for (const s of [-1, 1]) {
      const w = fr.at(2 + s * .95, 8);
      cyl(iron, w.east, g + .42, w.north, .42, .42, .12, 10, fr.yaw, Math.PI / 2);
    }
    // Works signage (牌面 §五): cast-iron name plate right of the furnace
    // mouth; the chalk duty board left of it, its last line trailing off.
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
      c.fillText('一班　白望山　到', 40, h * .37);
      c.fillText('二班　石　沉　到', 40, h * .59);
      c.font = '37px "Noto Sans SC", sans-serif';
      c.fillText('三班　炉火看住，莫等我——', 40, h * .81);
      // The stroke drags a little past the last dash and stops.
      c.fillStyle = 'rgba(232, 226, 210, .3)';
      c.fillRect(452, h * .815, 42, 3);
      c.fillStyle = 'rgba(232, 226, 210, .16)';
      c.fillRect(452, h * .835, 26, 2);
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
    // R1: real two-storey, hollow instrument repair shop. A solid 20x10x8
    // brick from the former blockout was preventing all interior exploration.
    put(stone, 0, g + .06, 0, 20, .12, 10);
    put(stone, 0, g + 2.18, -4.86, 19.8, 4.04, .28);
    for(const side of [-1,1])put(stone,side*9.86,g+2.18,0,.28,4.04,9.8);
    put(stone,-6.1,g+2.18,4.86,7.6,4.04,.28);
    put(stone,6.1,g+2.18,4.86,7.6,4.04,.28);
    put(stone,0,g+3.93,4.86,4.35,.54,.28);
    // Upper floor / stairwell: a real opening remains on the east side.
    put(timberWarm,-3.05,g+4.21,0,13.8,.20,9.4);
    put(timberWarm,8.65,g+4.21,0,2.0,.20,9.4);
    put(timberWarm,5.5,g+4.21,-3.55,5.2,.20,2.25);
    put(timberWarm,0,g+6.4,-4.86,19.8,4.1,.28);
    for(const side of [-1,1])put(timberWarm,side*9.86,g+6.4,0,.28,4.1,9.8);
    put(timberWarm,-5.90,g+6.4,4.86,8.1,4.1,.28);
    put(timberWarm,5.90,g+6.4,4.86,8.1,4.1,.28);
    put(timberWarm,0,g+8.13,4.86,3.72,.54,.28);
    const instrumentDoor = fr.at(0,5.0);
    interiorEntrances.push({id:'instrument-plant',...instrumentDoor,
      height:g+.12,yaw:fr.yaw,clearWidth:4.2});
    put(slate, -5.05, g + 9.6, 0, 10.6, .26, 11.4, 0, .48);
    put(slate, 5.05, g + 9.6, 0, 10.6, .26, 11.4, 0, -.48);
    // R4: 16px wood-and-brass glazing with proper dark mullions. The bottom
    // centre panes were part of the old solid cuboid; REMOVE them so that
    // the newly built door has its full, physically clear four-metre span.
    for (const dx of [-8, -4.8, -1.6, 1.6, 4.8, 8]) {
      for(const level of [2.6,6.8]){
        if(level<4&&Math.abs(dx)<3)continue;
        const tall=level<4?1.9:1.7;
        put(dark,dx,g+level,5.03,1.7,tall,.10);
        for(const side of [-1,1]){
          put(timberWarm,dx+side*.91,g+level,5.14,.12,tall+.18,.16);
          put(timberWarm,dx,g+level+side*(tall/2+.065),5.15,1.82,.12,.16);
        }
        put(iron,dx,g+level,5.18,.075,tall,.14);
        put(iron,dx,g+level-.16,5.18,1.74,.075,.14);
      }
    }
    for(const side of [-1,1]){
      put(timber,side*2.35,g+1.55,5.12,.22,2.85,.16);
      put(iron,side*2.2,g+3.13,5.14,.18,.13,.18);
    }
    put(timberWarm,0,g+3.46,5.16,4.8,.16,.20);
    for (const dx of [-4.8, 4.8]) {
      put(timber, dx, g + 6.8, 5.12, 1.9, .28, .08, 0, .6);
      put(timber, dx, g + 6.8, 5.12, 1.9, .28, .08, 0, -.6);
    }
    // Thin slate seams and snow shelves break up otherwise flat roof blocks.
    for(let dx=-8.7;dx<=8.7;dx+=1.45){
      put(rustIron,dx,g+9.62,0,.10,.18,10.2);
      put(snow,dx,g+10.07,-4.05,.74,.10,.36);
    }
    for(const side of [-1,1]) for(const dz of [-3.6,-1.8,0,1.8,3.6]) {
      put(timber,side*10.0,g+8.13,dz,.18,.20,.30);
      put(rustIron,side*10.02,g+6.75,dz,.12,1.55,.10);
    }
    // Chimney twice the ridge height above the roof.
    put(rustIron, -8, g + 11, -2, 1.1, 13, 1.1);
    put(stoneDark, -8, g + 17.7, -2, 1.5, .45, 1.5);
    // R2: genuinely modelled visitor stair (twelve treads + side rail),
    // with a separate upper landing. The avatar floor authority is a later
    // integration step; we do not claim these steps are walkable yet.
    for(let i=0;i<12;i++) {
      const z=3.33-i*.53,top=.34+i*.326;
      put(timberWarm,6.55,g+top,z,1.63,.14,.56);
      put(timber,7.42,g+top*.5,z,.12,top,.12);
    }
    for(let z=-2.5;z<=3.5;z+=1.5)
      put(iron,7.55,g+3.30,z,.09,2.2,.09);
    put(iron,7.55,g+4.38,.30,.11,.13,7.4);
    // Calibration bench and upper-floor storeroom.
    for(const x of [-7.3,-4.8,-2.3]) {
      put(timberWarm,x,g+1.50,-1.65,2.20,.16,1.25);
      for(const sx of [-1.03,1.03])put(timber,x+sx,g+1.12,-1.65,.14,.93,.16);
      for(let k=0;k<6;k++){
        const px=x-1.0+(k%3)*.78,pz=-1.75+Math.floor(k/3)*.42;
        put(iron,px,g+1.67,pz,.36,.12,.33);
        put(brass,px,g+1.80,pz,.21,.15,.20);
      }
    }
    for(const x of [-6.6,-3.2,0.2]){
      put(timber,x,g+5.27,-3.05,2.5,1.42,.55);
      for(let i=0;i<4;i++)
        put(iron,x-1.0+i*.68,g+6.10,-3.08,.40,.36,.38);
    }
    // R5 detailed repairs: screwed gauges, paper slips, braces and shelving.
    for(let i=0;i<24;i++) {
      const x=-7.4+(i%8)*.78,z=-3.8+Math.floor(i/8)*.48;
      put(brass,x,g+1.96,z,.11,.07,.10);
      if(i%4===0)put(iron,x,g+2.03,z,.25,.07,.16);
    }
    for(const x of [-8.9,-6.9,-4.9])for(const h of [1.4,2.1,2.8])
      put(timberWarm,x,g+h,-4.48,1.2,.12,.22);
    const repairDial=fr.at(-4.8,-1.45);
    addMechanicalDial('instrument-calibration',repairDial,g,g+2.0,fr.yaw);
    // Loading platform, crates, and a burst instrument crate spilling brass parts.
    put(stone, 0, g + .45, 6.8, 8, .9, 2.6);
    put(timberWarm, 2.5, g + 1.6, 6.8, 1.5, 1.5, 1.5);
    put(timber, -2.8, g + 1.35, 7.1, 1.3, 1.1, 1.3, 0, .35);
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
    cyl(corrugated, wt.east, g + 8.4, wt.north, 2.3, 2.3, 3.2, 12);
    cone(slate, wt.east, g + 10.9, wt.north, 2.7, 1.8, 12);
    // Works signage (牌面 §六): brass name plate between the ground-floor
    // windows; the brittle paper notice nailed beside where the door reads.
    const plateP = fr.at(0, 5.16);
    siteAt('instrument-sign', plateP.east, plateP.north, 1);
    sign(plateP.east, g + 2.5, plateP.north, fr.yaw, 1.9, .62, brass, (c, w, h) => {
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
    // ref-06: water tank corrosion is splotched and the timber X bracing
    // crosses the entire trestle, not just four isolated stilts.
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const p=fr.at(15.5+sx*.95,-1+sz*1.55);
      box(iron,p.east,g+3.15,p.north,.17,5.9,.15,fr.yaw,sx*.31,sz*.27);
    }
    for(let j=0;j<8;j++){
      const a=d2r(j*45),p=fr.at(15.5+2.31*Math.cos(a),-1+2.31*Math.sin(a));
      put(rustIron,15.5+2.3*Math.cos(a),g+8.0+(j%3)*.48,-1+2.3*Math.sin(a),.28,.75,.16);
    }
    // Supply pipes in the reference run BELOW the second-floor windows, so
    // no pipe is allowed across the real 4m shop entry or glass panes.
    for(const y of [1.35,4.43]){
      for(const [start,width] of [[-8.9,5.8],[6.7,2.1]] as const){
        put(rustIron,start,g+y,5.52,width,.16,.21);
        put(iron,start,g+y+.18,5.54,width*.83,.06,.12);
      }
    }
    for(const x of [-8.75,8.8]){
      put(rustIron,x,g+3.06,5.53,.22,4.02,.20);
      put(iron,x,g+1.78,5.68,.39,.15,.35);
    }
    for(const x of [7.25,8.45]){
      const p=fr.at(x,5.72);
      cyl(brass,p.east,g+2.28,p.north,.33,.33,.20,12,fr.yaw,Math.PI/2);
      put(iron,x,g+2.28,5.86,.30,.07,.12,0,(x>8?-.3:.35));
    }
    // Icicles use inverted cones so the tips visibly hang DOWN, as in ref-06.
    for(let i=0;i<22;i++){
      const x=-9.0+i*.85,len=.31+(i%6)*.13;
      const p=fr.at(x,5.16);
      cone(snow,p.east,g+8.71-len/2,p.north,.12,len,6,fr.yaw,Math.PI);
      if(i%4===0)put(snow,x,g+9.13,5.12,.53,.12,.46);
    }
    // Crates and pipe saddles hold the antique hand-built silhouette.
    for(let j=0;j<6;j++){
      const x=12.4+(j%3)*1.15,z=5.6+Math.floor(j/3)*1.15;
      const p=fr.at(x,z);
      box(timberWarm,p.east,g+.68,p.north,1.05,1.15,1.02,fr.yaw);
      box(iron,p.east,g+1.22,p.north,1.1,.11,1.1,fr.yaw);
      box(iron,p.east,g+.19,p.north,1.1,.11,1.1,fr.yaw);
    }
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
    const piles: [number, number, number, number][] = [[-6, -2, 3.6, 2.6], [-1, 3.5, 2.8, 2], [4.5, -3, 3.1, 2.2], [8, 2.5, 2.2, 1.5]];
    for (const [dx, dz, r, h] of piles) {
      const p = fr.at(dx, dz);
      cone(ore, p.east, g + h / 2, p.north, r, h, 10);
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
  function tower(origin: { east: number; north: number; height: number }, totalH: number,
    mode: 'active' | 'tilted' | 'broken-ladder', faceDeg: number) {
    const fr = frame(origin, faceDeg);
    const g = origin.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    const shaftH = totalH - 2.6;
    put(stone, 0, g + shaftH * .28, 0, 3.9, shaftH * .56, 3.9);
    put(stone, 0, g + shaftH * .78, 0, 3.3, shaftH * .44, 3.3);
    for (const fy of [.3, .62, .92]) put(iron, 0, g + shaftH * fy, 0, 4, .28, 4);
    put(stoneDark, 0, g + shaftH + .25, 0, 4.7, .5, 4.7);
    for (let m = 0; m < 8; m++) {
      const a = m * Math.PI / 4;
      const p = fr.at(Math.sin(a) * 2.15, Math.cos(a) * 2.15);
      box(stone, p.east, g + shaftH + .95, p.north, .85, .85, .4, fr.yaw + a);
    }
    // Cabin on the platform; the west tower's cabin lists where its frame gave.
    const tilt = mode === 'tilted' ? .13 : 0;
    put(timber, .6, g + shaftH + 1.55, -.5, 2.3, 2.1, 2.3, 0, tilt);
    const roofP = fr.at(.6, -.5);
    part(slate, new ConeGeometry(2, 1.1, 4), roofP.east, g + shaftH + 3.15, roofP.north, fr.yaw + Math.PI / 4, 0, tilt);
    // Ladder up the crater-facing side; the gate tower's ladder ends mid-shaft.
    const ladderTop = mode === 'broken-ladder' ? .55 : 1;
    const rungs = Math.floor(shaftH * ladderTop / .45);
    for (const s of [-1, 1]) put(iron, s * .42, g + shaftH * ladderTop / 2, 2.02, .07, shaftH * ladderTop, .07);
    for (let i = 0; i < rungs; i++) put(iron, 0, g + .3 + i * .45, 2.02, .9, .06, .06);
    if (mode === 'broken-ladder') {
      const fallen = fr.at(1.6, 3.4);
      box(iron, fallen.east, g + .25, fallen.north, .85, .08, 3.4, fr.yaw + .4, 0, .04);
    }
    if (mode === 'active') {
      const lampP = fr.at(-1.7, 1.7);
      box(iron, lampP.east, g + shaftH + 1.5, lampP.north, .1, 2, .1);
      box(glow, lampP.east, g + shaftH + 2.6, lampP.north, .34, .42, .34);
      const light = new PointLight(new Color(palette.ember), 14, 32, 2);
      light.position.set(lampP.east, g + shaftH + 2.6, -lampP.north);
      group.add(light);
      northTowerLight = light;
    }
  }
  const northTower = site('north-tower', 358, 67.5, 4, 13.5);
  if (northTower) tower(northTower, 13.5, 'active', 358 + 180);
  const westTower = site('west-tower', 262, 64, 4, 12.5);
  if (westTower) tower(westTower, 12.5, 'tilted', 262 + 180);
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
  }
  setNight(true);
  function actionAt(east:number,north:number,foot:number) {
    let nearest:InteriorMechanism|undefined;
    let d=Infinity;
    for(const mechanism of mechanisms){
      const distance=Math.hypot(east-mechanism.east,north-mechanism.north);
      if(distance<=mechanism.range&&distance<d&&Math.abs(foot-mechanism.foot)<1.65){
        nearest=mechanism;d=distance;
      }
    }
    return nearest?.id;
  }
  function turnMechanism(id:InteriorMechanism['id']) {
    const mechanism=mechanisms.find(item=>item.id===id);
    if(!mechanism)return undefined;
    mechanism.state=(mechanism.state+1)%4;
    mechanism.handle.rotation.z=mechanism.state*Math.PI/2;
    // These cold, unpowered indicators change only the local model; no
    // improvised generator, player reward, or server authority flag is set.
    return mechanism.state;
  }
  return {
    group, sites, fencePosts, interiorEntrances, mechanisms, actionAt, turnMechanism,
    setNight, wallLine: { east: wallEast, northStart: 13, northEnd: 307 },
  };
}
