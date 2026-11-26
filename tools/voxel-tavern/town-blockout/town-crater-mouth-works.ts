import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, PlaneGeometry, PointLight, Quaternion,
  RepeatWrapping, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { meteorCraterRimRadius } from './meteor-crater';
import { createZa36StrataTexture } from './town-za36-crater-ejecta';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { orientedSupportBox } from './town-a-r30-oriented-support';

type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
export type CraterMouthSite = Readonly<{
  id: string; east: number; north: number; height: number; radius: number;
}>;

/** E-action spots (salvage ①, ported from lane-a 976ab6d): ids mirror the viewer switch. */
export type CraterActionId = 'registration' | 'map' | 'telescope' | 'firewood' | 'survey';
export type CraterActionSpot = Readonly<{
  id: CraterActionId; label: string; east: number; north: number; height: number; range: number;
}>;

const palette = {
  stone: '#8a8378', stoneDark: '#5d564c', ochre: '#a98a56', earth: '#5d4630',
  timberLight: '#a36b48', pine: '#44503c', night: '#2c3648', snow: '#e8ecf0',
  ember: '#e08a3c', windowWarm: '#ffa455', crystal: '#7fd4c8', rust: '#8a4a34',
  slate: '#4b5066', paper: '#e8e0cc', brass: '#c68d4d',
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

/** Low-contrast joined planks/shingles for the supply cabin (ref-01).
 * A board is a continuous strip, not a 16x16 hash of square dark flecks.
 * The narrow seams and staggered joints remain readable at a normal player distance.
 */
function supplyWoodMaterial(name: string, tones: readonly [number, number, number], roofing = false) {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / 8);
    const phase = (x + (row % 2) * 16) % 32;
    const seam = y % 8 === 0 || (roofing && phase === 0);
    const grain = (Math.floor(x / 8) + row * 3) % 4 === 2 && y % 8 >= 2 && y % 8 <= 4;
    const tone = tones[seam ? 1 : grain ? 2 : 0]!;
    data.set([tone >>> 16, (tone >>> 8) & 255, tone & 255, 255], (y * size + x) * 4);
  }
  const map = new DataTexture(data, size, size);
  map.magFilter = map.minFilter = NearestFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  const material = new MeshStandardMaterial({ map, roughness: 1 });
  map.wrapS=map.wrapT=RepeatWrapping;
  material.name=name;
  material.userData.metricSpan=roofing?.72:1.12;
  return material;
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const d2r = (deg: number) => deg * Math.PI / 180;

/**
 * Crater-mouth works (crater book §三.8/9/10 + §六 outside segment, revisions 1–3):
 * assembly ground with the ZB-35 flagpole anchor, the supply station as the core
 * anchor building, the north-rim guard shed, the iron fence's main-gate segment,
 * the wreckage ring on the OUTER rim slope only, and the rim lamp chain.
 * Everything samples the road's heightAt; nothing here blocks a path — the
 * ZB-28 guards (people) do the turning-back, never a wall.
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

/** World-space AABB of a yaw-rotated box centred at (east, north): the sx axis
 * lies along the frame right, sz along the facing bearing (sign-free). */
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

export function buildCraterMouthWorks(road: CraterRoad) {
  const { anchor, heightAt } = road;
  const group = new Group();
  group.name = 'crater-mouth-works';
  const sites: CraterMouthSite[] = [];
  // S-1 collision (分支窗 A): structural wall boxes + standable floors in
  // world coordinates, exported for the za22 top group's userData. Only
  // load-bearing walls are recorded — props, roofs and lintels above head
  // height stay walk-through-free by omission, door gaps stay open.
  const colliders: CraterHitBox[] = [];
  const floors: CraterHitBox[] = [];
  const ramps: CraterHitRamp[] = [];

  const stone = pixelMaterial(palette.stone, palette.stoneDark, 41, palette.earth);
  const stoneDark = pixelMaterial(palette.stoneDark, palette.night, 87, palette.stone);
  const supplyPlanks = supplyWoodMaterial('supply-cabin-joined-timber', [0x795038, 0x4b3024, 0x876047]);
  const supplyGlass=new MeshStandardMaterial({color:0xb9a684,emissive:0xffb767,emissiveIntensity:.16,roughness:.36,transparent:true,opacity:.52,depthWrite:false});
  supplyGlass.name='A-R03-supply-real-glazing';
  const supplyWindows:{east:number;north:number;low:number;high:number;sx:number;sz:number;yaw:number}[]=[];
  const supplyWindowControls:{id:string;east:number;north:number;height:number;useEast:number;useNorth:number;useHeight:number;isOpen():boolean;toggle():boolean}[]=[];
  const supplyShingles = supplyWoodMaterial('supply-cabin-continuous-shingles', [0x493e33, 0x322b25, 0x5c4b3d], true);
  // Structural beams and signage share continuous metre-scaled wood;
  // the old high-contrast square noise obscured the near-field joinery.
  const timber=supplyWoodMaterial('mouth-structural-timber',[0x543b2b,0x3b281d,0x624735]);
  const timberWarm=supplyWoodMaterial('mouth-warm-timber',[0x9b724a,0x725034,0xa98156]);
  const slate = pixelMaterial(palette.slate, palette.night, 133, palette.stone);
  const iron = pixelMaterial(palette.night, palette.rust, 151, palette.earth);
  const rustIron = pixelMaterial(palette.rust, palette.night, 177, palette.earth);
  const snow = pixelMaterial(palette.snow, palette.stone, 199);
  const paper = pixelMaterial(palette.paper, palette.ochre, 211, palette.stone);
  const brass = new MeshStandardMaterial({ color: palette.brass, roughness: .45, metalness: .65 });
  const glow = new MeshStandardMaterial({
    color: palette.windowWarm, emissive: palette.ember, emissiveIntensity: 1.25, roughness: .8,
  });
  // A-3: wreckage-ring boulders use the same continuous strata as outer
  // ejecta and basalt, not a featureless rust-black metal surface.
  const wreck = new MeshStandardMaterial({
    map: createZa36StrataTexture(0x8a8378, 0x5d4630, 0xa98a56, 23, 0x8a4a34),
    roughness: .97, metalness: 0, flatShading: true,
  });

  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  function part(mat: MeshStandardMaterial, geo: BufferGeometry, east: number, h: number, north: number,
    yaw = 0, pitch = 0, roll = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    // Compose roll -> pitch -> yaw (yaw outermost), matching Euler 'YXZ'.
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
    const geo=new BoxGeometry(sx,sy,sz),span=mat.userData.metricSpan;
    if(typeof span==='number'){
      const uv=geo.getAttribute('uv'),normal=geo.getAttribute('normal');
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

  /** A ground site on the crater surroundings, or undefined where the survey has no ground. */
  function site(id: string, bearingDeg: number, radius: number, clear: number) {
    const b = d2r(bearingDeg);
    const east = anchor.east + radius * Math.sin(b);
    const north = anchor.north + radius * Math.cos(b);
    const height = heightAt(east, north);
    if (height === undefined) return undefined;
    const found = { id, east, north, height, radius: clear };
    sites.push(found);
    return found;
  }

  /** Local frame: +dz toward the facing bearing (the crater), +dx to the right of it. */
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

  function sign(east: number, h: number, north: number, yaw: number, w: number, hh: number,
    draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    box(timber, east, h, north, w + .16, hh + .16, .06, yaw);
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, 512, 320);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plane = new Mesh(new PlaneGeometry(w, hh), new MeshBasicMaterial({ map: texture }));
    const off = .055;
    plane.position.set(east + Math.sin(yaw) * off, h, -north + Math.cos(yaw) * off);
    plane.rotation.y = yaw;
    group.add(plane);
  }

  function lampLight(east: number, h: number, north: number, intensity: number, distance: number) {
    const light = new PointLight(new Color(palette.ember), intensity, distance, 2);
    light.position.set(east, h, -north);
    group.add(light);
    return light;
  }

  /** The three real light pools of the outside warm chain (§六). */
  let yardLight: PointLight | undefined;
  let doorLamp: PointLight | undefined;
  let brazierLight: PointLight | undefined;
  const actions: CraterActionSpot[] = [];
  const supplyDeckRoute: {east:number;north:number;height:number}[]=[];
  const supplyInteriorRoute: {east:number;north:number;height:number}[]=[];
  const guardShedRoutes:{id:string;points:{east:number;north:number;height:number}[]}[]=[];
  const assemblyRoutes:{id:string;points:{east:number;north:number;height:number}[]}[]=[];
  const guardShedSeats:{east:number;north:number;height:number;useEast:number;useNorth:number;yaw:number}[]=[];
  /** Iron-fence main-gate segment posts, for the ejecta keep-out list. */
  const gateFencePosts: { bearing: number; radius: number }[] = [];

  // ---------- §三.8 assembly ground (south rim, outside the haul gap) ----------
  const assembly = site('assembly-ground', 168, 70, 10);
  if (assembly) {
    const fr = frame(assembly, 168 + 180);
    const g = assembly.height;
    // Grounded rectangular assembly court with a clear central aisle.
    // The old floating circular slab is replaced by a real low deck.
    const pad=fr.at(0,0),padY=g+.18;
    const base=Math.min(g-.08,...[-8,0,8].flatMap(x=>[-6,0,6].map(z=>{
      const p=fr.at(x,z);return heightAt(p.east,p.north)??g;
    })))-.06;
    box(stoneDark,pad.east,(base+padY-.055)/2,pad.north,16,padY-.055-base,12,fr.yaw);
    // Two tone paving courses and an unobstructed centre aisle. The
    // stone surface, not an invisible raised floor, carries the player.
    for(let i=0;i<8;i++)for(let j=0;j<6;j++){
      const p=fr.at(-7+i*2,-5+j*2);
      box((i+j)%4===0?stoneDark:stone,p.east,padY-.0275,p.north,1.997,.055,1.997,fr.yaw);
    }
    floors.push(orientedSupportBox(pad.east,pad.north,fr.yaw,16,12,base,padY));
    const solid=(x:number,z:number,w:number,d:number,y0:number,y1:number,yaw=fr.yaw)=>{
      const p=fr.at(x,z);colliders.push(orientedSupportBox(p.east,p.north,yaw,w,d,y0,y1));
    };
    const point=(x:number,z:number,height:number)=>({...fr.at(x,z),height});
    for(const side of [-1,1]){
      const p=fr.at(side*7.8,0);
      box(stone,p.east,g+.13,p.north,.32,.26,12,fr.yaw);
      floors.push(orientedSupportBox(p.east,p.north,fr.yaw,.32,12,g,g+.26));
      for(const z of [-5.7,5.7]){
        const q=fr.at(side*5.5,z);
        box(stone,q.east,g+.13,q.north,4.8,.26,.32,fr.yaw);
        floors.push(orientedSupportBox(q.east,q.north,fr.yaw,4.8,.32,g,g+.26));
      }
    }
    // Flagpoles: town flag + survey pennant. The ZB-35 anchor ring sits at the main pole's foot.
    for (const [dx, tall] of [[-1.6, 7.2], [1.6, 5.6]] as const) {
      const p = fr.at(dx, 3.4);
      cyl(timber, p.east, g + tall / 2, p.north, .09, .13, tall, 7);
      box(timber, p.east, g + tall - .3, p.north, .8, .07, .07, fr.yaw);
      solid(dx,3.4,.26,.26,padY,g+tall);
      cyl(iron,p.east,g+.58,p.north,.16,.19,.31,8,fr.yaw);
      cyl(stone,p.east,g+.28,p.north,.42,.48,.23,8,fr.yaw);
    }
    const flagPole = fr.at(-1.6, 3.4);
    const flag=fr.at(-1.6+.55,3.4),pennant=fr.at(1.6+.34,3.4);
    box(new MeshStandardMaterial({ color: 0x883738, roughness: .9 }),flag.east,g+6.55,flag.north,1.05,.68,.05,fr.yaw);
    box(timberWarm,pennant.east,g+5.05,pennant.north,.62,.3,.04,fr.yaw);
    cyl(stone, flagPole.east, g + .22, flagPole.north, 1.05, 1.25, .44, 12);
    solid(-1.6,3.4,2.15,2.15,padY,g+.44);
    solid(1.6,3.4,.84,.84,padY,g+.40);
    sites.push({ id: 'zb35-anchor', east: flagPole.east, north: flagPole.north, height: g + .44, radius: 1.3 });
    // Notice board with the settled text and its empty duty grid.
    const board = fr.at(-4.6, 2.2);
    for (const s of [-1, 1]) {
      const p = fr.at(-4.6 + s * 1.15, 2.2);
      box(timber, p.east, g + .95, p.north, .14, 1.9, .14, fr.yaw);
      solid(-4.6+s*1.15,2.2,.14,.14,padY,g+1.9);
      box(stone,p.east,padY+.10,p.north,.32,.20,.32,fr.yaw);
    }
    solid(-4.6,2.2,2.66,.12,g+.79,g+2.45);
    sign(board.east, g + 1.62, board.north, fr.yaw, 2.5, 1.5, (c, w, h) => {
      c.fillStyle = '#d9c69c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28);
      c.fillStyle = '#3d2c1c'; c.textAlign = 'center';
      c.font = 'bold 54px "Noto Sans SC", sans-serif';
      c.fillText('入坑登记 · 天黑前出坑', w / 2, 92, w-54);
      c.lineWidth = 3; c.strokeStyle = 'rgba(61,44,28,.75)';
      for (let row = 0; row < 3; row++) {
        const y = 140 + row * 54;
        c.strokeRect(60, y, w - 120, 40);
        c.beginPath(); c.moveTo(150, y); c.lineTo(150, y + 40); c.stroke();
      }
    });
    const boardStand=point(-4.6,4.25,padY);
    actions.push({id:'registration',label:'阅读入坑告示',...boardStand,range:1.05});
    const entry=fr.at(0,7.2);
    assemblyRoutes.push({id:'assembly-registration',points:[
      {...entry,height:heightAt(entry.east,entry.north)??g},
      point(0,5.25,padY),point(-4.6,4.95,padY),boardStand
    ]});
    // K-39 (《设计-全图文字件总表》卡15; 分册: 速降榜小牌挂告示牌侧):
    // descent leaderboard head board beside the notice board.
    for (const s of [-1, 1]) {
      const p = fr.at(-2.2 + s * .55, 2.2);
      box(timber, p.east, g + .8, p.north, .12, 1.6, .12, fr.yaw);
      solid(-2.2+s*.55,2.2,.12,.12,padY,g+1.6);
    }
    solid(-2.2,2.2,1.46,.12,g+.99,g+1.71);
    const lb = fr.at(-2.2, 2.2);
    sign(lb.east, g + 1.35, lb.north, fr.yaw, 1.3, .55, (c, w, h) => {
      c.fillStyle = '#d9c69c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 6; c.strokeRect(12, 12, w - 24, h - 24);
      c.fillStyle = '#3d2c1c'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 44px "Noto Sans SC", sans-serif';
      c.fillText('坑沿速降 · 个人最佳', w / 2, h / 2 + 2);
    });
    // Sled slots: six stake pairs with a rope line.
    for (let i = 0; i < 6; i++) {
      const p = fr.at(-5 + i * 1.7, -2.8);
      box(timber, p.east, g + .42, p.north, .12, .84, .12, fr.yaw);
      const q = fr.at(-5 + i * 1.7, -4.1);
      box(timber, q.east, g + .42, q.north, .12, .84, .12, fr.yaw);
      solid(-5+i*1.7,-2.8,.12,.12,padY,g+.84);
      solid(-5+i*1.7,-4.1,.12,.12,padY,g+.84);
      // Open front, actual timber wheel-rest on the rear of each stall.
      const rest=fr.at(-5+i*1.7,-4.42);
      box(timberWarm,rest.east,padY+.055,rest.north,1.18,.11,.22,fr.yaw);
      floors.push(orientedSupportBox(rest.east,rest.north,fr.yaw,1.18,.22,padY,padY+.11));
    }
    // Crate stacks, three groups, one rope coil.
    for (const [dx, dz, n] of [[4.9, 1.8, 3], [6.1, .4, 2], [5.2, -3.6, 2]] as const) {
      for (let i = 0; i < n; i++) {
        const p = fr.at(dx + (i % 2) * .15, dz - Math.floor(i / 2) * .1);
        const y=padY+.4+i*.8,yaw=fr.yaw+i*.13;
        box(i%2?timberWarm:supplyPlanks,p.east,y,p.north,.92,.8,.92,yaw);
        solid(dx+(i%2)*.15,dz-Math.floor(i/2)*.1,.92,.92,padY+i*.8,padY+(i+1)*.8,yaw);
        for(const s of [-1,1])box(iron,p.east+Math.cos(yaw)*s*.29,y,p.north+Math.sin(yaw)*s*.29,.08,.82,.94,yaw);
      }
    }
    const coil = fr.at(4.9, 3.1);
    part(timberWarm,new TorusGeometry(.42,.10,6,14),coil.east,padY+.11,coil.north,fr.yaw,Math.PI/2);
    // Two yard lamps; one carries a real light (chain link toward the rim lamps).
    for (const dx of [-7.6, 7.6]) {
      const p = fr.at(dx, 1.2);
      box(timber, p.east, g + 1.05, p.north, .16, 2.1, .16, fr.yaw);
      solid(dx,1.2,.16,.16,padY,g+2.1);
      box(stone,p.east,padY+.10,p.north,.34,.20,.34,fr.yaw);
      box(glow, p.east, g + 2.2, p.north, .3, .38, .3, fr.yaw);
      box(iron, p.east, g + 2.48, p.north, .44, .08, .44, fr.yaw);
    }
    const lampP = fr.at(-7.6, 1.2);
    yardLight = lampLight(lampP.east, g + 2.2, lampP.north, 5.5, 9);
  }

  // ---------- §三.9 supply station (core anchor, per ref-01) ----------
  const supply = site('supply-station', 150, 74, 8);
  if (supply) {
    const fr = frame(supply, 150 + 180);
    const g = supply.height;
    const W = 7.4, D = 5.6, wallH = 2.7, foundH = .85;
    // Stone foundation and floor.
    const c0 = fr.at(0, 0);
    box(stone, c0.east, g + foundH / 2 - .1, c0.north, W + .5, foundH, D + .5, fr.yaw);
    box(supplyPlanks,c0.east,g+foundH+.03,c0.north,W,.06,D,fr.yaw);
    // Real front and side window apertures. Solid wall panels stop at
    // every jamb, sill and lintel; the closed translucent glazing carries
    // its own narrow collision instead of hiding a full wall behind a lamp.
    const wallY=g+foundH+wallH/2;
    const wallBase=g+foundH;
    type Aperture={center:number;width:number;low:number;high:number;door?:boolean};
    const buildWall=(axis:'x'|'z',fixed:number,min:number,max:number,holes:readonly Aperture[])=>{
      const at=(u:number)=>axis==='x'?fr.at(u,fixed):fr.at(fixed,u);
      const piece=(mat:MeshStandardMaterial,u:number,w:number,t:number,lo:number,hi:number,solid=true)=>{
        const p=at(u),sx=axis==='x'?w:t,sz=axis==='x'?t:w;
        box(mat,p.east,wallBase+(lo+hi)/2,p.north,sx,hi-lo,sz,fr.yaw);
        if(solid)colliders.push(orientedSupportBox(p.east,p.north,fr.yaw,sx,sz,wallBase+lo,wallBase+hi));
      };
      const cuts=[min,max,...holes.flatMap(o=>[o.center-o.width/2,o.center+o.width/2])].sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++){
        const a=cuts[i-1]!,b=cuts[i]!,u=(a+b)/2;
        const aperture=holes.find(o=>Math.abs(u-o.center)<o.width/2);
        if(!aperture)piece(supplyPlanks,u,b-a,.22,0,wallH);
        else{
          if(aperture.low>0)piece(supplyPlanks,u,b-a,.22,0,aperture.low);
          if(aperture.high<wallH)piece(supplyPlanks,u,b-a,.22,aperture.high,wallH);
        }
      }
      for(const o of holes){
        if(o.door)continue;
        const p=at(o.center);
        const sx=axis==='x'?o.width:.055,sz=axis==='x'?.055:o.width;
        const operable=axis==='x'&&fixed>0;
        if(!operable)piece(supplyGlass,o.center,o.width,.055,o.low,o.high);
        else{
          // Front casements open outward, away from the interior aisle.
          // Their moving frame and glazing share a single real hinge and
          // collision footprint. The fixed reveals never move.
          const side=Math.sign(o.center),h=o.high-o.low,y=wallBase+(o.high+o.low)/2;
          const hinge=fr.at(o.center+side*o.width/2,fixed);
          const leaf=new Group();leaf.name='supply-casement-'+side;
          leaf.position.set(hinge.east,y,-hinge.north);
          const cx=side*o.width/2;
          const pane=new Mesh(new BoxGeometry(o.width-.06,h-.06,.055),supplyGlass);
          pane.position.x=cx;leaf.add(pane);
          const bars:BufferGeometry[]=[];
          const bar=(x:number,y:number,w:number,hh:number,d:number)=>{
            const geo=new BoxGeometry(w,hh,d);geo.translate(x,y,0);bars.push(geo);
          };
          for(const s of [-1,1]){
            bar(cx+s*(o.width/2-.025),0,.05,h,.07);
            bar(cx,s*(h/2-.025),o.width,.05,.07);
          }
          bar(cx,0,.045,h,.07);bar(cx,0,o.width,.045,.07);
          const frameGeo=mergeGeometries(bars);
          for(const b of bars)b.dispose();
          if(frameGeo)leaf.add(new Mesh(frameGeo,timber));
          group.add(leaf);
          const body=orientedSupportBox(p.east,p.north,fr.yaw,o.width,.07,wallBase+o.low,wallBase+o.high);
          colliders.push(body);
          const use=fr.at(o.center,1.90);
          let open=false;
          const pose=()=>{
            const angle=fr.yaw-(open?side*1.30:0);
            leaf.rotation.y=angle;leaf.updateMatrixWorld(true);
            const e=hinge.east+cx*Math.cos(angle),n=hinge.north+cx*Math.sin(angle);
            Object.assign(body,orientedSupportBox(e,n,angle,o.width,.07,wallBase+o.low,wallBase+o.high));
          };
          pose();
          supplyWindowControls.push({id:side<0?'supply-window-left':'supply-window-right',...p,height:y,
            useEast:use.east,useNorth:use.north,useHeight:g+foundH+.06,
            isOpen:()=>open,toggle:()=>{open=!open;pose();return open;}});
        }
        supplyWindows.push({...p,low:wallBase+o.low,high:wallBase+o.high,sx,sz,yaw:fr.yaw});
        // Deep reveals, cross muntins and a projecting sill are visible
        // from both the exterior and the interior.
        for(const s of [-1,1]){
          piece(timber,o.center+s*(o.width/2-.035),.09,.31,o.low-.065,o.high+.065,false);
          const y=s<0?o.low:o.high;
          piece(timberWarm,o.center,o.width+.14,.33,y-.055,y+.055,false);
        }
        if(!operable){
          piece(timber,o.center,.065,.20,o.low,o.high,false);
          piece(timber,o.center,o.width,.20,(o.low+o.high)/2-.032,(o.low+o.high)/2+.032,false);
        }
      }
    };
    buildWall('x',D/2,-W/2,W/2,[
      {center:-2.55,width:.92,low:1.125,high:2.175},
      {center:0,width:2.8,low:0,high:2.0,door:true},
      {center:2.55,width:.92,low:1.125,high:2.175},
    ]);
    buildWall('x',-D/2,-W/2,W/2,[]);
    for(const s of [-1,1])buildWall('z',s*W/2,-D/2,D/2,[
      {center:-1.4,width:.90,low:1.13,high:2.01},
      {center:1.15,width:.90,low:1.13,high:2.01},
    ]);
    // Framed open door and four corner posts; the pre-existing clear opening
    // is unchanged. These sit on the wall line, outside the doorway centre.
    for (const s of [-1, 1]) {
      const jamb = fr.at(s * 1.43, D / 2 + .07);
      box(timberWarm, jamb.east, g + foundH + 1.10, jamb.north, .16, 2.2, .20, fr.yaw);
      for (const side of [-1, 1]) {
        const post = fr.at(s * (W / 2 - .07), side * (D / 2 - .04));
        box(timber, post.east, wallY, post.north, .19, wallH + .08, .19, fr.yaw);
      }
    }
    // S-1 collision: foundation ledge + interior slab as standable floors
    // (a doorway ramp bridges the .91 rise — three plain steps would each
    // exceed the .43 step height), the four walls as colliders; the 2.8 m
    // doorway between the front segments stays open, the lintel above it
    // is above head height.
    floors.push(orientedSupportBox(c0.east,c0.north,fr.yaw,W+.5,D+.5,g-.1,g+foundH-.1));
    floors.push(orientedSupportBox(c0.east,c0.north,fr.yaw,W,D,g+foundH-.1,g+foundH+.06));
    // Four visible stone treads connect ground to the actual interior slab.
    // Use the same oriented support as the exterior stair; no hidden ramp.
    const entry=fr.at(0,D/2+3.25);
    const entryY=heightAt(entry.east,entry.north)??g;
    supplyInteriorRoute.push({...entry,height:entryY});
    for(let i=0;i<4;i++){
      const p=fr.at(0,D/2+(3.5-i)*.65);
      const top=entryY+(g+foundH+.06-entryY)*(i+1)/4;
      const low=Math.min(top-.12,(heightAt(p.east,p.north)??g)-.06);
      box(stone,p.east,(low+top)/2,p.north,2.25,top-low,.66,fr.yaw);
      floors.push(orientedSupportBox(p.east,p.north,fr.yaw,2.25,.66,low,top));
      supplyInteriorRoute.push({...p,height:top});
    }
    for(const z of [2.25,0,-.65])supplyInteriorRoute.push({...fr.at(0,z),height:g+foundH+.06});
    // The wall pieces above already own the exact solid collision.
    // A-4: replace the two huge glossy dark planes (solar-panel reading)
    // with short overlapping timber shingles, warm eaves and snow-frost ridge.
    // Keep the approved front half as an actual lookout deck.
    const roofY = g + foundH + wallH;
    // Ref-01: real gabled timber cabin, with a separate forward lookout deck.
    // The two roof planes meet at one ridge; shingles sit on the SAME plane
    // (along-slope overlap), instead of unrelated tilted boards in the air.
    const halfRun = W / 2 + .43, rise = 1.52;
    const slope = Math.atan2(rise, halfRun);
    const slant = Math.hypot(halfRun, rise);
    const roofNorthSouth = D / 2 + .54;
    const rearZ = -D / 4 - .09;
    for (const side of [-1, 1]) {
      // The box yaw uses Three's +X opposite frame.at's +dx, so roll
      // must have this sign for the high edges to meet at local x=0.
      const pitchRoll = side * slope;
      const base = fr.at(side * halfRun / 2, rearZ);
      box(supplyShingles, base.east, roofY + rise / 2 + .10, base.north,
        slant + .08, .16, roofNorthSouth, fr.yaw, 0, pitchRoll);
      for (let row = 0; row < 6; row++) {
        const t = (row + .5) / 6;
        const dx = side * halfRun * (1 - t);
        for (let strip = 0; strip < 3; strip++) {
          const dz = rearZ + (strip - 1) * roofNorthSouth / 3;
          const p = fr.at(dx, dz);
          box(row === 5 && strip !== 1 ? snow : supplyShingles,
            p.east, roofY + rise * t + .22, p.north,
            slant / 6 + .11, .09, roofNorthSouth / 3 + .04, fr.yaw, 0, pitchRoll);
        }
      }
      const fascia = fr.at(side * (halfRun - .04), rearZ);
      box(timberWarm, fascia.east, roofY + .11, fascia.north,
        .16, .22, roofNorthSouth + .08, fr.yaw);
    }
    // Cut every vertical gable plank to the actual roof profile. The
    // old five horizontal steps left triangular daylight gaps below
    // both eaves; the new top edges share the roof pitch.
    const gableTop=(x:number)=>rise*(1-Math.abs(x)/halfRun)+.055;
    const plankCount=16,pw=W/plankCount;
    for(const dz of [-D/2+.02,-.12]){
      for(let i=0;i<plankCount;i++){
        const x=-W/2+(i+.5)*pw;
        const p=fr.at(x,dz);
        const geo=new BoxGeometry(pw+.002,1,.21);
        const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv');
        const normal=geo.getAttribute('normal'),span=supplyPlanks.userData.metricSpan??1;
        for(let k=0;k<pos.count;k++){
          const lx=pos.getX(k),isTop=pos.getY(k)>0;
          const y=isTop?gableTop(x-lx):0;
          pos.setY(k,y);
          uv.setXY(k,uv.getX(k)*(Math.abs(normal.getX(k))>.5?.21:pw)/span,Math.abs(normal.getY(k))>.5?uv.getY(k)*.21/span:y/span);
        }
        geo.computeVertexNormals();
        part(supplyPlanks,geo,p.east,roofY,p.north,fr.yaw);
      }
      const beam=fr.at(0,dz);
      box(timberWarm,beam.east,roofY+.10,beam.north,W+.06,.19,.28,fr.yaw);
      const king=fr.at(0,dz);
      box(timberWarm,king.east,roofY+rise*.51,king.north,.16,rise*.90,.26,fr.yaw);
      for(const side of [-1,1]){
        const p=fr.at(side*halfRun/2,dz);
        box(timberWarm,p.east,roofY+rise/2+.12,p.north,slant+.09,.16,.28,fr.yaw,0,side*slope);
      }
    }
    // Exposed rafter tails and a continuous cross tie above the interior
    // head clearance, under the same roof plane.
    for(let i=0;i<5;i++){
      const dz=rearZ-roofNorthSouth*.40+i*roofNorthSouth*.20;
      for(const side of [-1,1]){
        const p=fr.at(side*halfRun/2,dz);
        box(timber,p.east,roofY+rise/2-.005,p.north,slant+.08,.13,.12,fr.yaw,0,side*slope);
      }
      const tie=fr.at(0,dz);
      box(timber,tie.east,roofY-.035,tie.north,W+.06,.13,.14,fr.yaw);
    }
    const ridgeP = fr.at(0, rearZ);
    box(timberWarm, ridgeP.east, roofY + rise + .23, ridgeP.north,
      .30, .16, roofNorthSouth + .07, fr.yaw);
    box(snow, ridgeP.east, roofY + rise + .34, ridgeP.north,
      .24, .09, roofNorthSouth * .74, fr.yaw);
    const deckY=roofY+.12;
    const floor=(dx:number,dz:number,w:number,d:number,top:number,thick=.12)=>{
      const p=fr.at(dx,dz);
      box(supplyPlanks,p.east,top-thick/2,p.north,w,thick,d,fr.yaw);
      floors.push(orientedSupportBox(p.east,p.north,fr.yaw,w,d,top-thick,top));
    };
    const guard=(dx:number,dz:number,w:number,d:number,top:number)=>{
      const p=fr.at(dx,dz);
      box(supplyPlanks,p.east,top+.49,p.north,w,.98,d,fr.yaw);
      box(timberWarm,p.east,top+.94,p.north,w,.08,d,fr.yaw);
      colliders.push(orientedSupportBox(p.east,p.north,fr.yaw,w,d,top,top+.98));
    };
    floor(0,D/4,W,D/2,deckY);
    // Real support and guarded deck; leave the east landing opening only.
    const frontGuard=fr.at(0,D/2-.12);
    colliders.push(orientedSupportBox(frontGuard.east,frontGuard.north,fr.yaw,W,.10,deckY,deckY+.95));
    const backGuard=fr.at(0,.06);
    colliders.push(orientedSupportBox(backGuard.east,backGuard.north,fr.yaw,W,.15,deckY,deckY+1.6));
    // Front viewing rail and the higher rear safety screen follow the
    // existing collision strip. Closed rear rails make the roof boundary
    // readable instead of presenting a walkable-looking invisible edge.
    for (const [z,h] of [[D/2-.12,.95],[.06,1.6]] as const) {
      for (let i=0;i<9;i++) {
        const p=fr.at(-W/2+.10+i*(W-.20)/8,z);
        box(supplyPlanks,p.east,deckY+h/2,p.north,.10,h,.10,fr.yaw);
        box(iron,p.east,deckY+.075,p.north,.10,.15,.10,fr.yaw);
      }
      const p=fr.at(0,z);
      for(const y of [.19,h*.51,h-.045])
        box(supplyPlanks,p.east,deckY+y,p.north,W,.09,.10,fr.yaw);
    }
    for (const s of [-1, 1]) {
      // Gap on the east edge at the raised stair landing, not a railing
      // across the player's route. Solid low timber guards match collision.
      if(s<0)guard(s*(W/2-.12),D/4,.12,D/2,deckY);
      else {
        guard(s*(W/2-.12),.38,.12,.76,deckY);
        guard(s*(W/2-.12),2.50,.12,.60,deckY);
      }
      // Support the front deck on the solid jamb strip, not through glazing.
      const pillar = fr.at(s * (W / 2 - .07), 2.12);
      box(timberWarm, pillar.east, wallY, pillar.north, .17, wallH, .17, fr.yaw);
    }
    // Exterior stair: 15 real treads, 0.245m rise / 0.56m run, supported
    // by timber posts. Exact rotated footprints prevent diagonal ghost walls.
    const steps=15,run=.56,stairX=W/2+.83,stairW=1.65,endZ=1.40,startZ=endZ-steps*run;
    const wp=(dx:number,dz:number,height:number)=>({...fr.at(dx,dz),height});
    supplyDeckRoute.push(wp(stairX,startZ-.55,g));
    // Physical approach markers make the side-to-rear turn readable without
    // exposing a second false doorway through the stair rail. No story text.
    for(const [dx,dz,angle] of [[7.25,1.5,0],[7.8,startZ-3.3,Math.PI/2]] as const){
      const p=fr.at(dx,dz),h=heightAt(p.east,p.north);
      if(h===undefined)continue;
      box(stone,p.east,h+.11,p.north,.38,.22,.38,fr.yaw);
      box(timber,p.east,h+.64,p.north,.12,1.15,.12,fr.yaw);
      const arrowYaw=fr.yaw+angle;
      box(timberWarm,p.east,h+1.16,p.north,.72,.27,.12,arrowYaw);
      // Chevron made from two physical inset brass strips.
      const arrowFace={east:p.east+Math.sin(arrowYaw)*.075,north:p.north-Math.cos(arrowYaw)*.075};
      for(const tilt of [-.6,.6])box(brass,arrowFace.east,h+1.16+(tilt>0?.048:-.048),arrowFace.north,.25,.045,.035,arrowYaw,0,tilt);
      colliders.push(orientedSupportBox(p.east,p.north,fr.yaw,.38,.38,h,h+1.3));
    }
    for(let i=0;i<steps;i++){
      const z=startZ+(i+.5)*run,top=g+(deckY-g)*(i+1)/steps;
      floor(stairX,z,stairW,run+.008,top,.16);
      if(i%3===2){
        for(const s of [-1,1]){
          const p=fr.at(stairX+s*.65,z);
          box(timber,p.east,(g+top-.16)/2,p.north,.15,Math.max(.1,top-g-.16),.15,fr.yaw);
        }
      }
      guard(stairX+stairW/2-.06,z,.12,run+.012,top);
      if(i<steps-1)guard(stairX-stairW/2+.06,z,.12,run+.012,top);
      supplyDeckRoute.push(wp(stairX,z,top));
    }
    floor(W/2+.78,1.84,1.72,.90,deckY);
    guard(W/2+1.55,1.84,.12,.90,deckY);
    guard(W/2+.78,2.27,1.72,.12,deckY);
    supplyDeckRoute.push(wp(stairX,1.84,deckY),wp(2.85,1.84,deckY),wp(0,1.84,deckY));
    // Brass telescope on the deck, trained on the crater centre.
    const scope = fr.at(-1.8, D / 4 + .4);
    // Three anchored feet, diagonal legs and an actual optical pivot.
    // The legs' lower ends meet the deck and the upper ends share one hub.
    const pivotY=roofY+.94;
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3;
      const fx=Math.sin(a)*.27,fn=Math.cos(a)*.27;
      const foot=new Vector3(scope.east+fx,deckY+.045,-scope.north-fn);
      const hub=new Vector3(scope.east,pivotY,-scope.north);
      const dir=hub.clone().sub(foot);
      const geo=new BoxGeometry(.075,dir.length(),.075);
      geo.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),dir.normalize()));
      const mid=foot.clone().add(hub).multiplyScalar(.5);
      part(brass,geo,mid.x,mid.y,-mid.z);
      box(iron,foot.x,deckY+.035,-foot.z,.13,.07,.13,fr.yaw);
    }
    cyl(iron,scope.east,pivotY,scope.north,.135,.135,.11,10);
    box(brass,scope.east,roofY+1.025,scope.north,.21,.18,.17,fr.yaw);
    const pivot=fr.at(-1.8-.18,D/4+.4);
    cyl(iron,pivot.east,roofY+1.035,pivot.north,.11,.11,.08,10,fr.yaw,0,Math.PI/2);
    cyl(brass, scope.east, roofY + 1.12, scope.north, .11, .16, 1.25, 9, fr.yaw, Math.PI / 2 - .18);
    // Separate focus collars share the exact barrel axis. No second scope
    // or interaction, and no extra floor obstruction at the use point.
    for(const t of [-.38,.29]){
      const p=fr.at(-1.8,D/4+.4+t*Math.cos(.18));
      cyl(iron,p.east,roofY+1.12+t*Math.sin(.18),p.north,.175,.175,.075,10,fr.yaw,Math.PI/2-.18);
    }
    // Front objective and rear eye cup lie on the same inclined axis.
    for(const [t,r]of [[.65,.14],[-.65,.10]] as const){
      const p=fr.at(-1.8,D/4+.4+t*Math.cos(.18));
      const h=roofY+1.12+t*Math.sin(.18);
      cyl(brass,p.east,h,p.north,r,r,.10,10,fr.yaw,Math.PI/2-.18);
      const d=t+Math.sign(t)*.052,q=fr.at(-1.8,D/4+.4+d*Math.cos(.18));
      cyl(iron,q.east,roofY+1.12+d*Math.sin(.18),q.north,r*.77,r*.77,.012,10,fr.yaw,Math.PI/2-.18);
    }
    // Reuse the existing optical affordance, not a new story/ledger event.
    const scopeUse=fr.at(-.85,1.84);
    actions.push({id:'telescope',label:'使用屋顶望筒观坑',...scopeUse,height:deckY,range:1.15});
    colliders.push(orientedSupportBox(scope.east,scope.north,fr.yaw,.65,.65,deckY,deckY+1.65));
    // Door lanterns (one real light) and the doorway step.
    for (const s of [-1, 1]) {
      const lp = fr.at(s * 1.05, D / 2 + .3);
      box(glow, lp.east, g + foundH + 2.15, lp.north, .2, .3, .2, fr.yaw);
    }
    const doorLight = fr.at(0, D / 2 + .6);
    doorLamp = lampLight(doorLight.east, g + foundH + 2.1, doorLight.north, 5, 8.5);
    // Entry treads above already provide the visible doorway support.
    // Interior: shelves with dry goods / rope / oil lamps, counter, hand-drawn map.
    for(const s of [-1,1]){
      // Lower side cabinets leave the real side panes unobstructed; the
      // tall stock shelves move to the rear wall, outside the map and aisle.
      const sh=fr.at(s*(W/2-.55),-.25);
      box(supplyPlanks,sh.east,g+foundH+.43,sh.north,.50,.86,3.22,fr.yaw);
      box(timberWarm,sh.east,g+foundH+.89,sh.north,.58,.08,3.28,fr.yaw);
      colliders.push(orientedSupportBox(sh.east,sh.north,fr.yaw,.58,3.28,g+foundH,g+foundH+.93));
      for(let j=0;j<4;j++){
        const z=-1.45+j*.78,face=fr.at(s*(W/2-.84),z);
        box(timberWarm,face.east,g+foundH+.45,face.north,.07,.65,.70,fr.yaw);
        const handle=fr.at(s*(W/2-.885),z);
        box(iron,handle.east,g+foundH+.66,handle.north,.08,.055,.22,fr.yaw);
      }
      const rack=fr.at(s*2.52,-2.35);
      colliders.push(orientedSupportBox(rack.east,rack.north,fr.yaw,1.56,.49,g+foundH,g+foundH+2.05));
      for(const x of [-.72,.72])for(const z of [-.19,.19]){
        const p=fr.at(s*2.52+x,-2.35+z);
        box(timberWarm,p.east,g+foundH+1.025,p.north,.10,2.05,.10,fr.yaw);
      }
      for(let lvl=0;lvl<3;lvl++){
        box(supplyPlanks,rack.east,g+foundH+.48+lvl*.62,rack.north,1.56,.08,.49,fr.yaw);
        for(let j=0;j<3;j++){
          const gp=fr.at(s*2.52-.49+j*.49,-2.35);
          if((j+lvl)%3===2)cyl(glow,gp.east,g+foundH+.68+lvl*.62,gp.north,.07,.09,.22,6);
          else box(timberWarm,gp.east,g+foundH+.68+lvl*.62,gp.north,.34,.30,.38,fr.yaw+j*.2);
        }
      }
    }
    const counter=fr.at(1.9,1.1);
    box(supplyPlanks,counter.east,g+foundH+.5,counter.north,1.9,1,.6,fr.yaw);
    box(timberWarm,counter.east,g+foundH+1.06,counter.north,2.0,.12,.72,fr.yaw);
    colliders.push(orientedSupportBox(counter.east,counter.north,fr.yaw,2.0,.72,g+foundH,g+foundH+1.12));
    const mapP=fr.at(0,-D/2+.25);
    // The map face points into the room, away from the rear wall.
    sign(mapP.east,g+foundH+1.65,mapP.north,fr.yaw,2.1,1.35, (c, w, h) => {
      c.fillStyle = '#e3d3a8'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 5; c.strokeRect(12, 12, w - 24, h - 24);
      c.lineWidth = 4; c.beginPath(); c.arc(w * .42, h * .46, 88, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2.5; c.beginPath(); c.arc(w * .42, h * .46, 52, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(w * .42, h * .46, 20, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#3d2c1c'; c.font = 'bold 30px "Noto Sans SC", sans-serif'; c.textAlign = 'center';
      c.fillText('井口', w * .42, h * .46 + 10);
      c.fillText('栈道', w * .68, h * .3);
      c.fillText('黑石带', w * .2, h * .78);
      c.strokeStyle = 'rgba(61,44,28,.6)'; c.lineWidth = 3;
      c.strokeRect(w * .74, h * .62, 88, 66);
    });
    const mapStand=fr.at(0,-.65);
    actions.push({id:'map',label:'查看坑区手绘图',...mapStand,height:g+foundH+.06,range:1.25});
    // K-01/02/03 (《设计-全图文字件总表》，总控裁定 批58 追补六）：牌匾挂门楣、
    // 登记台告示立柜台、值班室门牌挂右窗上——总表逐字，不改字。K-03 注：本栋为
    // 一间通房，无独立值班室门；牌挂右前窗上方作房间标牌，不另隔墙。
    const plaqueP = fr.at(0, D / 2 + .16);
    sites.push({ id: 'supply-station-plaque', east: plaqueP.east, north: plaqueP.north, height: g + 3.2, radius: 1 });
    sign(plaqueP.east, g + 3.2, plaqueP.north, fr.yaw, 2.2, .55, (c, w, h) => {
      c.fillStyle = '#3b3835'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.font = 'bold 72px "Noto Sans SC", sans-serif';
      c.fillStyle = '#d3cbb9'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('坑口补给站', w / 2, h / 2 + 2);
    });
    const noticeP = fr.at(1.9, 1.1);
    sites.push({ id: 'supply-registration-notice', east: noticeP.east, north: noticeP.north, height: g + foundH + 1.35, radius: 1 });
    sign(noticeP.east, g + foundH + 1.35, noticeP.north, fr.yaw, 1.1, .7, (c, w, h) => {
      c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = '#3d2c1c'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '38px "Noto Sans SC", sans-serif';
      c.fillText('入坑先登记，领灯一盏。', w / 2, h * .32);
      c.fillText('出坑销名，灯还灯房。', w / 2, h * .68);
    });
    const dutyP = fr.at(2.55, D / 2 + .16);
    sites.push({ id: 'supply-duty-room-plate', east: dutyP.east, north: dutyP.north, height: g + foundH + 2.45, radius: 1 });
    sign(dutyP.east, g + foundH + 2.45, dutyP.north, fr.yaw, .9, .3, (c, w, h) => {
      c.fillStyle = '#3a352d'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(232, 226, 210, .4)'; c.lineWidth = 3;
      c.strokeRect(6, 6, w - 12, h - 12);
      c.font = 'bold 56px "Noto Sans SC", sans-serif';
      c.fillStyle = '#e8e2d2'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('值班室', w / 2, h / 2 + 2);
    });
  }

  // ---------- 地面三脚望筒（抢救包 ②，移植自 lane-a 453422e） ----------
  // 屋顶筒仍为剪影道具（甲板无正式登顶验收）；这架地面三脚架站在补给站
  // 东侧外路旁，E 可达，FOV 58→25，离座自动退出（viewer 侧）。
  if (supply) {
    const scopeE = supply.east + 7.2, scopeN = supply.north + 2.8;
    const scopeH = heightAt(scopeE, scopeN);
    if (scopeH !== undefined) {
      box(stone, scopeE, scopeH + .12, scopeN, .78, .12, .78);
      for (const s of [-1, 0, 1]) {
        box(timber, scopeE + s * .34, scopeH + .68, scopeN + .12, .13, 1.12, .13, 0, 0, s * .14);
      }
      box(iron, scopeE, scopeH + 1.35, scopeN, .28, .45, .28);
      const tubeYaw = Math.PI - Math.atan2(anchor.east - scopeE, anchor.north - scopeN);
      cyl(brass, scopeE, scopeH + 1.71, scopeN, .1, .15, 1.15, 9, tubeYaw, Math.PI / 2 - .18);
      const backBearing = Math.atan2(anchor.east - scopeE, anchor.north - scopeN) + Math.PI;
      box(iron, scopeE + Math.sin(backBearing) * .45, scopeH + 1.6, scopeN + Math.cos(backBearing) * .45,
        .36, .08, .12, tubeYaw);
      actions.push({ id: 'telescope', label: '使用望筒观坑', east: scopeE - .25, north: scopeN - .65, height: scopeH, range: 1.75 });
    }
  }

  // ---------- §三.10 guard shed (north rim high point, per ref-03) ----------
  const shed = site('guard-shed', 358, 64, 5);
  if (shed) {
    const fr = frame(shed, 358 + 180);
    const g = shed.height;
    const deckY=g+.16;
    const footHeights=[-2,0,2].flatMap(x=>[-1.5,0,1.5].map(z=>{
      const p=fr.at(x,z);return heightAt(p.east,p.north)??g;
    }));
    const low=Math.min(...footHeights,g-.05)-.08;
    box(stone,shed.east,(low+deckY-.08)/2,shed.north,4.0,deckY-.08-low,3.0,fr.yaw);
    box(supplyPlanks,shed.east,deckY-.04,shed.north,4.0,.08,3.0,fr.yaw);
    floors.push(orientedSupportBox(shed.east,shed.north,fr.yaw,4,3,low,deckY));
    const point=(dx:number,dz:number,height:number)=>({...fr.at(dx,dz),height});
    const solid=(dx:number,dz:number,w:number,d:number,bottom:number,top:number)=>{
      const p=fr.at(dx,dz);
      colliders.push(orientedSupportBox(p.east,p.north,fr.yaw,w,d,bottom,top));
    };
    for (const [dx, dz] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]] as const) {
      const p = fr.at(dx, dz);
      box(timber, p.east, g + 1.25, p.north, .18, 2.5, .18, fr.yaw);
    }
    // Actual two-pitched roof with purlins and grounded pier foundations.
    const run=2.15,rise=.92,slope=Math.atan2(rise,run),slant=Math.hypot(run,rise);
    for(const side of [-1,1]){
      const p=fr.at(side*run/2,0);
      box(supplyShingles,p.east,g+2.58+rise/2,p.north,slant,.15,3.4,fr.yaw,0,side*slope);
      box(snow,p.east,g+2.70+rise/2,p.north,slant-.12,.085,3.2,fr.yaw,0,side*slope);
      const q=fr.at(side*1.7,0);
      box(supplyPlanks,q.east,g+2.47,q.north,.22,.21,2.8,fr.yaw);
      for(const z of [-1.2,0,1.2]){
        const r=fr.at(side*run/2,z);
        box(timber,r.east,g+2.46+rise/2,r.north,slant,.14,.16,fr.yaw,0,side*slope);
      }
    }
    box(timberWarm,shed.east,g+3.59,shed.north,.24,.15,3.5,fr.yaw);
    for(const z of [-1.2,1.2])for(const x of [-1.7,1.7]){
      const p=fr.at(x,z),h=heightAt(p.east,p.north)??g;
      box(stone,p.east,(h+g+.22)/2,p.north,.36,g+.22-h,.36,fr.yaw);
      colliders.push(orientedSupportBox(p.east,p.north,fr.yaw,.36,.36,h,g+.22));
    }
    const backW = fr.at(0, -1.25);
    box(supplyPlanks, backW.east, g + 1.1, backW.north, 3.6, 2.2, .14, fr.yaw);
    for(const y of [.25,2.12])box(timberWarm,backW.east,g+y,backW.north,3.62,.15,.21,fr.yaw);
    for(const x of [-1.65,0,1.65]){
      const p=fr.at(x,-1.16);
      box(timber,p.east,g+1.1,p.north,.13,2.2,.15,fr.yaw);
    }
    // S-1 collision: back wall + the four corner posts; the shed is open on
    // the other three sides by design.
    hitBox(colliders, backW.east, backW.north, fr.yaw, 3.6, .14, g, g + 2.2);
    for (const [dx, dz] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]] as const) {
      const p = fr.at(dx, dz);
      hitBox(colliders, p.east, p.north, fr.yaw, .18, .18, g, g + 2.5);
    }
    // Real iron brazier on a stone hearth, with its original local
    // light control. Player stands on the clear deck, not in the flame.
    const brz = fr.at(.85, .25);
    box(stone,brz.east,deckY+.045,brz.north,1.13,.09,1.13,fr.yaw);
    cyl(iron, brz.east, deckY + .34, brz.north, .49, .33, .42, 9);
    cyl(rustIron,brz.east,deckY+.55,brz.north,.53,.53,.09,9);
    cyl(stoneDark,brz.east,deckY+.60,brz.north,.40,.40,.035,9);
    for(const s of [-1,1]){
      const p=fr.at(.85+s*.32,.25);
      box(iron,p.east,deckY+.13,p.north,.13,.26,.54,fr.yaw);
    }
    for(let i=0;i<4;i++){
      const p=fr.at(.85+(i%2-.5)*.32,.25+(Math.floor(i/2)-.5)*.28);
      box(timber,p.east,deckY+.64,p.north,.16,.13,.57,fr.yaw+i*.77);
      part(glow,new ConeGeometry(.105+i*.018,.30-i*.025,5),p.east,deckY+.79,p.north);
    }
    solid(.85,.25,1.06,1.06,deckY,deckY+.88);
    brazierLight = lampLight(brz.east, deckY + .98, brz.north, 6, 9.5);
    const fireStand=point(.15,1.15,deckY);
    actions.push({ id:'firewood',label:'给哨棚火盆添柴',...fireStand,range:.68 });
    // Bench has a real backrest and seated view; logs are racked beneath
    // the bench rather than scattered across the approach aisle.
    const bench = fr.at(-.95, -.70);
    box(supplyPlanks,bench.east,deckY+.455,bench.north,1.45,.09,.43,fr.yaw);
    solid(-.95,-.70,1.45,.43,deckY,deckY+.50);
    const back=fr.at(-.95,-.94);
    box(supplyPlanks,back.east,deckY+.79,back.north,1.45,.36,.11,fr.yaw);
    solid(-.95,-.94,1.45,.11,deckY+.50,deckY+.97);
    for(const s of [-1,1]){
      const p=fr.at(-.95+s*.61,-.70);
      box(timber,p.east,deckY+.24,p.north,.12,.44,.34,fr.yaw);
      const q=fr.at(-.95+s*.61,-.94);
      box(timber,q.east,deckY+.49,q.north,.11,.98,.11,fr.yaw);
    }
    for(let i=0;i<4;i++){
      const p=fr.at(-1.43+i*.27,-.70);
      cyl(timberWarm,p.east,deckY+.12,p.north,.10,.10,.38,7,fr.yaw,Math.PI/2);
    }
    const seatStand=point(-.95,.10,deckY);
    guardShedSeats.push({...bench,height:deckY,useEast:seatStand.east,useNorth:seatStand.north,yaw:fr.yaw+Math.PI});
    const table = fr.at(.95, -.94);
    box(supplyPlanks,table.east,deckY+.63,table.north,.76,.09,.50,fr.yaw);
    for(const x of [-.28,.28])for(const z of [-.17,.17]){
      const p=fr.at(.95+x,-.94+z);
      box(timber,p.east,deckY+.30,p.north,.085,.6,.085,fr.yaw);
    }
    solid(.95,-.94,.76,.50,deckY,deckY+.675);
    cyl(paper,table.east,deckY+.74,table.north,.07,.055,.13,8);
    const approach=(x:number)=>{const p=fr.at(x,3.5);return {...p,height:heightAt(p.east,p.north)??g};};
    guardShedRoutes.push({id:'guard-firewood',points:[approach(.15),fireStand]},
      {id:'guard-seat',points:[approach(-.95),point(-.95,1.25,deckY),seatStand]});
    // Steam wisp over the half cup (§三.10): a still column of soft spheres.
    const steam = new MeshStandardMaterial({ color: 0xdfe8ee, transparent: true, opacity: .32, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const p = fr.at(.95 + Math.sin(i * 1.2) * .05 + i * .02, -.94);
      part(steam, new SphereGeometry(.035 + i * .012, 6, 5), p.east, deckY + .88 + i * .13, p.north);
    }
    // Hanging paper lantern under the roof edge.
    const lant = fr.at(-1.5, 1.35);
    cyl(paper, lant.east, g + 2.05, lant.north, .17, .17, .34, 8);
    box(glow, lant.east, g + 2.05, lant.north, .07, .2, .07, fr.yaw);
    // Duty board — format kept from the museum shift board. Names were
    // BLANKED per 总控裁定 批55 (K-24/25: 白望山/石沉 are souls and may not
    // appear on a living duty board), then REFILLED per 名册定版 批64
    // (K-25): 一班 罗大年 / 二班 田守义 / 三班 孙小山 — living guards from
    // the settled second-line roster. Third row per 总控回话 (2026-11-22):
    // the row reads 「三班 孙小山」 with 「夜里不入」 kept as the night-shift
    // note at the row's end — the note never replaces the name.
    const boardP = fr.at(1.95, -.4);
    sign(boardP.east, g + 1.5, boardP.north, fr.yaw - Math.PI / 2, 1.35, 1.5, (c, w, h) => {
      c.fillStyle = '#d9c69c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 6; c.strokeRect(12, 12, w - 24, h - 24);
      c.fillStyle = '#3d2c1c'; c.textAlign = 'center';
      c.font = 'bold 44px "Noto Sans SC", sans-serif';
      c.fillText('班次牌', w / 2, 66);
      c.font = '30px "Noto Sans SC", sans-serif';
      c.textAlign = 'left';
      const x0 = w / 2 - 190;
      c.fillText('一班 辰入午出 · 班头', x0, 128);
      c.fillText('二班 午入酉出 · 班头', x0, 178);
      // Roster names on their ruled slots (批64 fill).
      c.strokeStyle = 'rgba(61, 44, 28, .55)'; c.lineWidth = 2;
      for (const y of [128, 178]) {
        c.beginPath(); c.moveTo(x0 + 330, y + 10); c.lineTo(x0 + 420, y + 10); c.stroke();
      }
      c.fillText('罗大年', x0 + 330, 128);
      c.fillText('田守义', x0 + 330, 178);
      // Third row: name in the row, 「夜里不入」 as the trailing note.
      c.fillText('三班 孙小山', x0, 228);
      c.fillText('夜里不入', x0 + 330, 228);
    });
  }

  // ---------- iron fence main-gate segment (works-boundary line, assembly side) ----------
  // Per 修订一/修订三 the fence ring follows the enlarged works boundary, bowing
  // outside the industrial belt on the south arc; the full ring lands in mainline 2.
  const fenceR = 90;
  {
    const gateB = 165;
    const segStart=146,segEnd=184;
    const gb=d2r(gateB),gEast=anchor.east+fenceR*Math.sin(gb),gNorth=anchor.north+fenceR*Math.cos(gb);
    const gH=heightAt(gEast,gNorth);
    const survey=(bearing:number)=>{
      const b=d2r(bearing),e=anchor.east+fenceR*Math.sin(b),n=anchor.north+fenceR*Math.cos(b);
      const h=heightAt(e,n);return h===undefined?undefined:{e,n,h,bearing};
    };
    const bearings=[...Array.from({length:20},(_,i)=>segStart+i*2).filter(b=>Math.abs(b-gateB)>2.6),gateB-2.6,gateB+2.6].sort((a,b)=>a-b);
    const posts=bearings.map(survey);
    const panel=(a:{e:number;n:number;h:number},b:{e:number;n:number;h:number},gate:boolean)=>{
      const de=b.e-a.e,dn=b.n-a.n,dh=b.h-a.h,run=Math.hypot(de,dn);
      const yaw=Math.atan2(dn,de),roll=Math.atan2(dh,run),length=Math.hypot(run,dh)+.08;
      const material=gate?iron:rustIron,e=(a.e+b.e)/2,n=(a.n+b.n)/2,h=(a.h+b.h)/2;
      for(const y of gate?[.70,2.3,3.9]:[1.15,2.6,4.05])box(material,e,h+y,n,length,gate?.16:.12,.09,yaw,0,roll);
      const count=Math.ceil(run/.52);
      for(let i=1;i<count;i++){
        const t=i/count,pe=a.e+t*de,pn=a.n+t*dn,ph=a.h+t*dh;
        box(material,pe,ph+2.25,pn,.08,4.3,.08,yaw);
      }
      if(gate)box(material,e,h+2.3,n,Math.hypot(run,3.2),.12,.12,yaw,0,Math.atan2(dh+3.2,run));
    };
    for(let i=0;i<posts.length;i++){
      const p=posts[i];if(!p)continue;
      const gatePost=Math.abs(Math.abs(p.bearing-gateB)-2.6)<.01;
      gateFencePosts.push({bearing:p.bearing,radius:fenceR});
      box(gatePost?iron:rustIron,p.e,p.h+(gatePost?2.5:2.35),p.n,gatePost?.30:.14,gatePost?5:4.7,gatePost?.30:.14,-d2r(p.bearing));
      if(!gatePost)part(rustIron,new ConeGeometry(.11,.42,5),p.e,p.h+4.9,p.n,-d2r(p.bearing));
      const q=posts[i+1];
      if(q&&!(p.bearing<gateB&&q.bearing>gateB))panel(p,q,false);
    }
    if(gH!==undefined){
      sites.push({id:'fence-main-gate',east:gEast,north:gNorth,height:gH,radius:3.2});
      const center={e:gEast,n:gNorth,h:gH};
      const left=survey(gateB-2.6),right=survey(gateB+2.6);
      if(left)panel(left,center,true);
      if(right)panel(center,right,true);
      box(iron,gEast,gH+2.25,gNorth,.15,4.4,.15,-gb);
      box(iron, gEast, gH + 2.2, gNorth, .34, .42, .14, -gb);
      part(iron, new TorusGeometry(.3, .05, 5, 10), gEast, gH + 2.55, gNorth, -gb);
      // Rusted iron warning plate on the right leaf, seen from the approach
      // (《文本-坑区牌面》 §二, verbatim). The plate guards on paper only —
      // no system check hangs on it; people do the turning-back.
      const rc = d2r(gateB - 1.3);
      const re = anchor.east + fenceR * Math.sin(rc);
      const rn = anchor.north + fenceR * Math.cos(rc);
      const rh = heightAt(re, rn) ?? gH;
      sites.push({ id: 'fence-gate-sign', east: re, north: rn, height: rh, radius: .9 });
      box(iron, re, rh + 2.35, rn, 1.78, 1.06, .07, -rc);
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 300;
        const c = canvas.getContext('2d');
        if (c) {
          let seed = 11;
          const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          c.fillStyle = '#403931'; c.fillRect(0, 0, 512, 300);
          for (let i = 0; i < 260; i++) {
            c.fillStyle = `rgba(138, 74, 52, ${.12 + rnd() * .3})`;
            c.beginPath();
            c.arc(rnd() * 512, rnd() * 300, 1.5 + rnd() * 7, 0, 7);
            c.fill();
          }
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.font = 'bold 55px "Noto Sans SC", sans-serif';
          c.fillStyle = '#ded3bf';
          c.fillText('封存重地 · 非工勿入', 256, 108);
          c.font = '29px "Noto Sans SC", sans-serif';
          c.fillStyle = '#c9bda4';
          c.fillText('入内者须持工牌，于集结地登记。', 256, 208);
          for (let i = 0; i < 46; i++) {
            c.fillStyle = `rgba(138, 74, 52, ${.1 + rnd() * .16})`;
            c.fillRect(rnd() * 512, rnd() * 300, 2 + rnd() * 5, 6 + rnd() * 26);
          }
          const texture = new CanvasTexture(canvas);
          texture.colorSpace = SRGBColorSpace;
          const plane = new Mesh(new PlaneGeometry(1.7, 1),
            new MeshBasicMaterial({ map: texture }));
          const yaw = Math.PI - rc, off = .075;
          plane.position.set(re + Math.sin(yaw) * off, rh + 2.35, -rn + Math.cos(yaw) * off);
          plane.rotation.y = yaw;
          group.add(plane);
        }
      }
    }
    // One older wooden stretch patched in beside the gate (two generations).
    for (let i = 0; i < 4; i++) {
      const b = d2r(188 + i * 1.9);
      const east = anchor.east + fenceR * Math.sin(b);
      const north = anchor.north + fenceR * Math.cos(b);
      const h = heightAt(east, north);
      if (h === undefined) continue;
      box(timber, east, h + 1.15 - (i === 2 ? .3 : 0), north, .16, 2.3 - (i === 2 ? .6 : 0), .1, -b, 0, i === 1 ? .06 : 0);
    }
  }

  // S-1 collision for the works-boundary fence above: one segment box per
  // 2° of arc across the whole 146–184° span, INCLUDING the gate bearing —
  // the double gate is chained shut (its warning plate says so), so the
  // fence line is continuous; the arc's two ends stay open as the passages.
  {
    let prevPt: { e: number; n: number; h: number } | undefined;
    for (let bDeg = 146; bDeg <= 184; bDeg += 2) {
      const b = d2r(bDeg);
      const e = anchor.east + fenceR * Math.sin(b);
      const n = anchor.north + fenceR * Math.cos(b);
      const h = heightAt(e, n);
      if (h === undefined) { prevPt = undefined; continue; }
      if (prevPt) {
        hitSegment(colliders, prevPt.e, prevPt.n, e, n, .3,
          Math.min(prevPt.h, h), Math.max(prevPt.h, h) + 4.7);
      }
      prevPt = { e, n, h };
    }
  }

  // ---------- §六 rim lamp chain, outside segment (10 lamps at r=61) ----------
  const lampSites: CraterMouthSite[] = [];
  for (let i = 0; i < 10; i++) {
    const bDeg = 15 + i * 36;
    const b = d2r(bDeg);
    const east = anchor.east + 61 * Math.sin(b);
    const north = anchor.north + 61 * Math.cos(b);
    const h = heightAt(east, north);
    if (h === undefined) continue;
    box(timber, east, h + .75, north, .15, 1.5, .15);
    box(glow, east, h + 1.68, north, .26, .34, .26);
    box(iron, east, h + 1.92, north, .4, .07, .4);
    lampSites.push({ id: `rim-lamp-${i + 1}`, east, north, height: h, radius: .5 });
  }
  sites.push(...lampSites);

  // ---------- wreckage ring: outer slope only, never the walls or floor ----------
  let debrisCount = 0;
  {
    const geo = new DodecahedronGeometry(1, 0);
    geo.scale(1.25, .62, .9);
    const inst = new InstancedMesh(geo, wreck, 110);
    const dummy = new Matrix4();
    const quat = new Quaternion();
    const eul = new Euler();
    const pos = new Vector3();
    const scl = new Vector3();
    let placed = 0;
    // Six asymmetric deposits outside the shared R59 seam. The earlier
    // independent polar scatter formed a visually uniform belt of boulders.
    // Low partly buried fragments leave the spaces between deposits open.
    const deposits=[[6,84],[39,76],[232,88],[268,86],[305,79],[333,87]] as const;
    for(const [ci,[bearing,radius]] of deposits.entries()){
      for(let j=0;j<12;j++){
        const i=ci*17+j,bDeg=(bearing+(hash(i*3+1)-.5)*9+360)%360;
        const r=radius+(hash(i*7+2)-.5)*7;
        const b=d2r(bDeg),east=anchor.east+r*Math.sin(b),north=anchor.north+r*Math.cos(b);
        const h=heightAt(east,north);
        if(h===undefined||sites.some(s=>Math.hypot(east-s.east,north-s.north)<s.radius+1))continue;
        const size=.55+hash(i*17+3)*.78;
        eul.set((hash(i)-.5)*.15,hash(i*5)*Math.PI,(hash(i*11)-.5)*.15);
        quat.setFromEuler(eul);
        pos.set(east,h+.02,-north);
        scl.set(size,size*.32,size*.78);
        dummy.compose(pos,quat,scl);
        inst.setMatrixAt(placed++,dummy);
      }
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.name = 'crater-wreckage-ring';
    group.add(inst);
    debrisCount = placed;
  }

  for (const [mat, parts] of batches) {
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, mat);
    group.add(mesh);
  }

  // ---------- E 动作接线 + 夜间点亮（抢救包 ①） ----------
  // 坑外三盏实灯是 §六暖光链的坑外段：夜间点亮，白天熄灭（此前常亮）。
  // 添柴只调火盆亮度，不改变昼夜开关。
  let night = true;
  let fireFed = false;
  function applyLighting() {
    supplyGlass.emissiveIntensity=night?.32:.045;
    if (yardLight) yardLight.intensity = night ? 5.5 : 0;
    if (doorLamp) doorLamp.intensity = night ? 5 : 0;
    if (brazierLight) brazierLight.intensity = night ? (fireFed ? 10 : 6) : 0;
  }
  function setNight(value: boolean) { night = !!value; applyLighting(); }
  const firewood = () => { fireFed = !fireFed; applyLighting(); return fireFed; };
  function actionAt(east: number, north: number, height: number) {
    let nearest: CraterActionSpot | undefined; let best = Infinity;
    for (const spot of actions) {
      const horizontal = Math.hypot(east - spot.east, north - spot.north);
      const heightTolerance=spot.id==='telescope'||spot.id==='map'||spot.id==='firewood'||spot.id==='registration'?.65:3.3;
      if (horizontal > spot.range || Math.abs(height - spot.height) > heightTolerance || horizontal >= best) continue;
      best = horizontal; nearest = spot;
    }
    return nearest;
  }
  applyLighting();

  return {
    group, sites, debrisCount, rimRadius: meteorCraterRimRadius,
    actions, actionAt, firewood, setNight, fencePosts: gateFencePosts,supplyDeckRoute,supplyInteriorRoute,supplyWindows,supplyWindowControls,guardShedRoutes,guardShedSeats,assemblyRoutes,
    colliders, floors, ramps,
  };
}
