import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Group, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, PlaneGeometry, PointLight, Quaternion,
  RepeatWrapping, SRGBColorSpace, Vector3, CatmullRomCurve3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { createTerrainGrid } from './terrain';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { craterBeltTrackCorridor } from './town-crater-outer-works';
import { orientedSupportBox, type OrientedSupportBox } from './town-a-r30-oriented-support';

type Terrain = ReturnType<typeof createTerrainGrid>;
type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;

export type RailExtensionAlignment = Readonly<{
  length: number;
  minRadius: number;
  stations: readonly { id: string; label: string; east: number; north: number; railY: number }[];
  boards: readonly { id: string; east: number; north: number }[];
  whistlePoints: readonly { id: string; east: number; north: number }[];
  divergence: Readonly<{ east: number; north: number }>;
}>;

const palette = {
  stone: '#8a8378', stoneDark: '#5d564c', ochre: '#a98a56', earth: '#5d4630',
  timberLight: '#a36b48', night: '#2c3648', snow: '#e8ecf0',
  ember: '#e08a3c', windowWarm: '#ffa455', rust: '#8a4a34',
  slate: '#4b5066', paper: '#e8e0cc',
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

// Continuous low-contrast construction material; preserve the existing
// material count while replacing the stretched random-pixel surfaces.
function railFinish(base:string,kind:'wood'|'stone'|'metal'|'snow'){
  const value=Number.parseInt(base.slice(1),16),size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const row=Math.floor(y/8),bx=(x+(row%2)*8)%16;
    const tone=kind==='wood'?(x%8===0?-19:((Math.floor(x/8)*7)%11-5)+(x*3+y/12|0)%5)
      :kind==='stone'?(y%8===0||bx===0?-17:((row*7+Math.floor((x+(row%2)*8)/16)*13)%11-5))
      :kind==='metal'?(x%8===0?-13:x%8===1?6:0):Math.round(3*Math.sin(x*.4+y*.25));
    const c=(v:number)=>Math.max(0,Math.min(255,v+tone));
    data.set([c(value>>16&255),c(value>>8&255),c(value&255),255],(y*size+x)*4);
  }
  const map=new DataTexture(data,size,size);
  map.magFilter=map.minFilter=NearestFilter;map.wrapS=map.wrapT=RepeatWrapping;
  map.colorSpace=SRGBColorSpace;map.needsUpdate=true;
  const mat=new MeshStandardMaterial({map,roughness:1});
  mat.userData.metricSpan=kind==='snow'?1.6:kind==='stone'?1.0:.84;
  return mat;
}
function metricBox(mat:MeshStandardMaterial,sx:number,sy:number,sz:number){
  const geo=new BoxGeometry(sx,sy,sz),span=mat.userData.metricSpan;
  if(typeof span==='number'){
    const uv=geo.getAttribute('uv'),normal=geo.getAttribute('normal');
    for(let i=0;i<uv.count;i++){
      const x=Math.abs(normal.getX(i))>.5,y=Math.abs(normal.getY(i))>.5;
      uv.setXY(i,uv.getX(i)*(x?sz:sx)/span,uv.getY(i)*(y?sz:sy)/span);
    }
  }
  return geo;
}

const up = new Vector3(0, 1, 0);
const smooth01 = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

/** Branch control line, town frame [east, north]. The divergence sits on the loop's
 * northern segment where the surveyed loop is at grade (477,335: track 33.7 over
 * ground 32.0, rise 1.6 m); the Beiling stretch of the loop flies 50+ m over its
 * ground on piers, so no ground-hugging branch can meet it there — the survey
 * table registers that finding for the pathing integration. From the junction the
 * line runs north-west to Shankou station, west along the northern skirt, then
 * south down the west side to the crater-mouth station. */
export const craterBranchControlLine: readonly (readonly [number, number])[] = [
  [492, 318], [477, 335], [468, 392], [452, 448], [420, 482], [372, 500], [326, 508],
  [296, 502], [262, 506], [200, 522], [140, 532], [80, 539], [20, 536], [-8, 524],
  [-24, 470], [-32, 395], [-36, 318], [-38, 248], [-41, 196], [-46, 158], [-52, 138],
];

/**
 * Railway north extension (crater book §五, mainline 3): the physical plant of the
 * branch — ground-hugging track built with the loop line's own idiom (spline
 * samples, ground envelope, grade limiting, station flattening), Shankou station
 * with its fake tunnel portal, crater-mouth station with freight siding and an ore
 * hopper car, and the narrow-gauge mine track along the corridor reserved in
 * mainline 2 to the smelter door. Train pathing (alternating loop/branch service,
 * night empty runs) integrates on this alignment via the exported survey data;
 * the loop's closed-route system is untouched here.
 */
export function buildCraterRailExtension(grid: Terrain, road: CraterRoad) {
  const group = new Group();
  group.name = 'crater-rail-extension';

  const stone=railFinish(palette.stone,'stone');
  const stoneDark=railFinish(palette.stoneDark,'stone');
  const timber=railFinish(palette.earth,'wood');
  const timberWarm=railFinish(palette.timberLight,'wood');
  const slate=railFinish(palette.slate,'metal');
  const iron=railFinish(palette.night,'metal');
  const rustIron=railFinish(palette.rust,'metal');
  const snow=railFinish(palette.snow,'snow');
  const paper = pixelMaterial(palette.paper, palette.ochre, 217, palette.stone);
  const steel = new MeshStandardMaterial({ color: 0x8e9eae, roughness: .45, metalness: .6 });
  const darkSteel = new MeshStandardMaterial({ color: 0x33323a, roughness: .8, metalness: .3 });
  const dark = new MeshStandardMaterial({ color: 0x100d0b, roughness: 1 });
  const ore = new MeshStandardMaterial({ color: 0x3d3a44, roughness: .95, flatShading: true });
  const glow = new MeshStandardMaterial({
    color: palette.windowWarm, emissive: palette.ember, emissiveIntensity: 1.25, roughness: .8,
  });

  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  const colliders:OrientedSupportBox[]=[],floors:OrientedSupportBox[]=[];
  const stationWalkRoutes:{id:string;points:{east:number;north:number;height:number}[]}[]=[];
  const benchSeats:{id:string;east:number;north:number;height:number;useEast:number;useNorth:number;yaw:number}[]=[];
  const shankouArrival={east:296,north:520,height:groundAt(296,520)};
  const timetableReads:{east:number;north:number;height:number;title:string;description:string}[]=[];
  function push(mat: MeshStandardMaterial, g: BufferGeometry) {
    const batch = batches.get(mat) ?? [];
    batch.push(g);
    batches.set(mat, batch);
  }
  function part(mat: MeshStandardMaterial, geo: BufferGeometry, east: number, h: number, north: number,
    yaw = 0, pitch = 0, roll = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (roll) g.rotateZ(roll);
    if (pitch) g.rotateX(pitch);
    if (yaw) g.rotateY(yaw);
    g.translate(east, h, -north);
    push(mat, g);
    if (g !== geo) geo.dispose();
  }
  function box(mat: MeshStandardMaterial, east: number, h: number, north: number,
    sx: number, sy: number, sz: number, yaw = 0, pitch = 0, roll = 0) {
    part(mat, metricBox(mat,sx,sy,sz), east, h, north, yaw, pitch, roll);
  }
  function segBox(mat: MeshStandardMaterial, center: Vector3, quat: Quaternion,
    lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) {
    const geo = metricBox(mat,sx,sy,sz);
    geo.translate(lx, ly, lz);
    const g = geo.toNonIndexed();
    g.applyQuaternion(quat);
    g.translate(center.x, center.y, center.z);
    push(mat, g);
    geo.dispose();
  }

  function groundAt(east: number, north: number): number {
    if (east >= 0) return grid.heightAt(east, north);
    const craterSide = road.heightAt(east, north);
    return craterSide ?? grid.heightAt(0, north);
  }

  type Sample = { east: number; north: number; y: number; ground: number };
  function buildTrackway(
    control: readonly (readonly [number, number])[],
    opts: { gauge: number; sleeperWidth: number; ballastWidth: number; railH: number;
      flatten?: readonly { east: number; north: number; half: number }[] },
  ): { samples: Sample[]; length: number; minRadius: number; stationY: Map<string, number> } {
    const curve = new CatmullRomCurve3(
      control.map(([x, n]) => new Vector3(x, 0, -n)), false, 'centripetal');
    curve.arcLengthDivisions = 2400;
    const length = curve.getLength();
    const count = Math.max(8, Math.ceil(length / 1.7));
    const step = length / count;
    const raw = Array.from({ length: count + 1 }, (_, i) => curve.getPointAt(i / count));
    const samples: Sample[] = raw.map(point => {
      const east = point.x, north = -point.z;
      const ground = Math.max(
        groundAt(east, north), groundAt(east - 1.4, north), groundAt(east + 1.4, north),
        groundAt(east, north - 1.4), groundAt(east, north + 1.4));
      return { east, north, y: ground + .62, ground };
    });
    const maxGrade = .12;
    const spans = samples.map((s, i) => i === 0 ? step
      : Math.hypot(s.east - samples[i - 1].east, s.north - samples[i - 1].north));
    for (const dir of [1, -1]) {
      const order = samples.map((_, i) => dir > 0 ? i : samples.length - 1 - i);
      for (let k = 1; k < order.length; k++) {
        const here = order[k], prev = order[k - 1];
        samples[here].y = Math.max(samples[here].y, samples[prev].y - maxGrade * spans[Math.max(here, prev)]);
      }
    }
    const stationY = new Map<string, number>();
    for (const flat of opts.flatten ?? []) {
      let nearest = 0, best = Infinity;
      samples.forEach((s, i) => {
        const d = (s.east - flat.east) ** 2 + (s.north - flat.north) ** 2;
        if (d < best) { best = d; nearest = i; }
      });
      const target = samples[nearest].y;
      stationY.set(`${flat.east},${flat.north}`, target);
      samples.forEach((s, i) => {
        const along = Math.abs(i - nearest) * step;
        const w = 1 - smooth01((along - flat.half) / 7);
        if (w > 0) s.y = s.y + (target - s.y) * w;
      });
    }
    const smoothed = samples.map((s, i) => {
      let acc = 0;
      for (let o = -5; o <= 5; o++) {
        const j = Math.max(0, Math.min(samples.length - 1, i + o));
        acc += samples[j].y * (6 - Math.abs(o)) / 36;
      }
      return Math.max(s.ground + .5, Math.min(s.ground + 2.4, acc + .1));
    });
    samples.forEach((s, i) => { s.y = smoothed[i]; });
    // Geometry: rails, rail bases, sleepers, ballast per segment.
    const orientation = new Matrix4();
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      const va = new Vector3(a.east, a.y, -a.north);
      const vb = new Vector3(b.east, b.y, -b.north);
      const center = new Vector3().lerpVectors(va, vb, .5);
      const quat = new Quaternion().setFromRotationMatrix(orientation.lookAt(vb, va, up));
      const segLen = va.distanceTo(vb);
      for (const side of [-1, 1]) {
        segBox(steel, center, quat, side * opts.gauge / 2, -.08, 0, .15, opts.railH, segLen + .07);
        segBox(darkSteel, center, quat, side * opts.gauge / 2, -.22, 0, .3, .07, segLen + .07);
      }
      segBox(timber, center, quat, 0, -.32, 0, opts.sleeperWidth, .15, .36);
      segBox(stoneDark, center, quat, 0, -.5, 0, opts.ballastWidth, .26, segLen + .08);
      // Physical bearing below the existing rail bed, including the many
      // 1–2m rises that the former >2.2m pier threshold left floating.
      // Keep the surveyed alignment; a future grade redesign can reuse these
      // foundations. Short spans are stone plinths, taller ones masonry piers.
      const e=center.x,n=-center.z,soil=groundAt(e,n),underside=center.y-.63;
      if(underside>soil+.12){
        const yaw=Math.atan2(vb.x-va.x,vb.z-va.z);
        if(i%3===0||underside-soil<.85&&i%2===0){
          const length=underside-soil<.85?Math.min(segLen*1.85,3.1):1.35;
          const width=opts.ballastWidth-.24;
          const low=soil-.12;
          box(stone,e,(low+underside)/2,n,width,underside-low,length,yaw);
          colliders.push(orientedSupportBox(e,n,yaw,width,length,low,underside));
        }
      }
    }
    let minRadius = Infinity;
    for (let i = 1; i < samples.length - 1; i++) {
      const a = samples[i - 1], b = samples[i], c = samples[i + 1];
      const ab = Math.hypot(b.east - a.east, b.north - a.north);
      const bc = Math.hypot(c.east - b.east, c.north - b.north);
      const ac = Math.hypot(c.east - a.east, c.north - a.north);
      const area2 = Math.abs((b.east - a.east) * (c.north - a.north) - (c.east - a.east) * (b.north - a.north));
      if (area2 < 1e-6) continue;
      minRadius = Math.min(minRadius, ab * bc * ac / (2 * area2));
    }
    return { samples, length, minRadius, stationY };
  }

  function sign(east: number, h: number, north: number, yaw: number, w: number, hh: number,
    draw?: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    box(timber, east, h, north, w + .18, hh + .18, .07, yaw);
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.round(512 * hh / w);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#e8e0cc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (draw) draw(ctx, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plane = new Mesh(new PlaneGeometry(w, hh), new MeshBasicMaterial({ map: texture }));
    const off = .06;
    plane.position.set(east + Math.sin(yaw) * off, h, -north + Math.cos(yaw) * off);
    plane.rotation.y = yaw;
    group.add(plane);
  }
  function stationSign(east: number, h: number, north: number, yaw: number, label: string) {
    box(timber, east, h - 1.15, north, .14, 2.3, .14, yaw);
    sign(east, h, north, yaw, 1.9, .62, (c, w, hh) => {
      c.fillStyle = '#2c3648'; c.fillRect(0, 0, w, hh);
      c.font = `bold ${Math.round(hh * .68)}px "Noto Sans SC", sans-serif`;
      c.fillStyle = '#e8e0cc'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, w / 2, hh / 2 + 2);
    });
  }
  function shelter(east: number, north: number, ground: number, topY: number, yaw: number, label: string) {
    const fr = { e: Math.sin(yaw), n: Math.cos(yaw) };
    const at = (dx: number, dz: number) => ({
      east: east + Math.cos(yaw) * dx + fr.e * dz,
      north: north - Math.sin(yaw) * dx + fr.n * dz,
    });
    // at() uses clockwise bearings in EN; Three's +Y yaw is the inverse.
    // Keep the original station anchors and timetable positions, but align
    // platform, roof and colliders with the actual station frame.
    const rotation=-yaw,deckY=topY-.105;
    const pc=at(0,2.6);
    const slabBottom=Math.min(...[-6.5,0,6.5].flatMap(x=>[1.05,2.6,4.15].map(z=>{
      const p=at(x,z);return groundAt(p.east,p.north);
    })))-.08;
    const base=Math.min(deckY-.10,slabBottom);
    box(stone,pc.east,(base+deckY-.07)/2,pc.north,13,deckY-.07-base,3.1,rotation);
    box(snow,pc.east,deckY-.035,pc.north,13,.07,3.1,rotation);
    floors.push(orientedSupportBox(pc.east,pc.north,rotation,13,3.1,base,deckY));
    // Three or more broad entrance steps along the outside face. Each tread
    // samples real ground, with <= 0.24m rise from the surveyed approach.
    const start=at(0,7.35),startY=groundAt(start.east,start.north);
    const steps=Math.max(3,Math.ceil(Math.abs(deckY-startY)/.20));
    const run=.64,edge=4.15;
    const points=[{...start,height:startY}];
    for(let i=0;i<steps;i++){
      const z=edge+(steps-i-.5)*run,p=at(0,z);
      const h=startY+(deckY-startY)*(i+1)/steps;
      const low=Math.min(h-.14,groundAt(p.east,p.north)-.03);
      box(stone,p.east,(h+low)/2,p.north,2.3,h-low,run+.008,rotation);
      floors.push(orientedSupportBox(p.east,p.north,rotation,2.3,run+.008,low,h));
      points.push({...p,height:h});
      for(const s of [-1,1]){
        const edgeP=at(s*1.07,z);
        box(timber,edgeP.east,h+.44,edgeP.north,.11,.88,run+.01,rotation);
        colliders.push(orientedSupportBox(edgeP.east,edgeP.north,rotation,.11,run+.01,h,h+.88));
      }
    }
    // The platform bench is split so the middle arrival lane is not blocked.
    points.push({...at(0,3.4),height:deckY},{...at(0,2.6),height:deckY});
    stationWalkRoutes.push({id:label==='坑口站'?'kengkou-station':'shankou-station',points});
    for (const [px,pz] of [[-2.4,1.6],[2.4,1.6],[-2.4,4.4],[2.4,4.4]] as const) {
      const p=at(px,pz);
      box(timber,p.east,deckY+1.2,p.north,.2,2.4,.2,rotation);
      colliders.push(orientedSupportBox(p.east,p.north,rotation,.2,.2,deckY,deckY+2.4));
    }
    const rc = at(0, 3);
    if (label === '坑口站') {
      // A-4 canonical terminal: low rustic two-leaf canopy, visible timber
      // ridge and uneven snow caps. No roof/awning collider added to paths.
      for (const side of [-1, 1]) {
        const half = at(side * 1.7, 3);
        box(timberWarm, half.east, topY + 2.48, half.north, 3.8, .17, 4.9, rotation, 0, -side * .16);
        box(snow, half.east, topY + 2.61, half.north, 3.6, .09, 4.7, rotation, 0, -side * .16);
      }
      box(timber, rc.east, topY + 2.92, rc.north, .16, .28, 5.15, rotation);
      for (const s of [-1, 1]) {
        const lamp = at(s * 2.4, 1.65);
        box(glow, lamp.east, topY + 2.08, lamp.north, .25, .30, .25, yaw);
      }
    } else {
      // Two actual pitched leaves, ridge and end beams.
      for(const side of [-1,1]){
        const p=at(side*1.66,3);
        box(slate,p.east,deckY+2.72,p.north,3.46,.18,4.85,rotation,0,-side*.22);
        box(snow,p.east,deckY+2.84,p.north,3.30,.10,4.68,rotation,0,-side*.22);
        const eave=at(side*3.28,3);
        box(timber,eave.east,deckY+2.32,eave.north,.18,.23,4.94,rotation);
      }
      box(timber,rc.east,deckY+3.12,rc.north,.19,.22,5.04,rotation);
      for(const z of [1.6,4.4]){
        const p=at(0,z);
        box(timber,p.east,deckY+2.35,p.north,5.05,.20,.22,rotation);
      }
    }
    for(const side of [-1,1]){
      const bc=at(side*3.8,3.45);
      box(timberWarm,bc.east,deckY+.44,bc.north,2.2,.12,.52,rotation);
      for(const offset of [-.85,.85]){
        const p=at(side*3.8+offset,3.45);
        box(timber,p.east,deckY+.19,p.north,.13,.38,.45,rotation);
      }
      colliders.push(orientedSupportBox(bc.east,bc.north,rotation,2.2,.52,deckY,deckY+.50));
      const back=at(side*3.8,3.68);
      box(timberWarm,back.east,deckY+.82,back.north,2.2,.44,.10,rotation);
      colliders.push(orientedSupportBox(back.east,back.north,rotation,2.2,.10,deckY+.50,deckY+1.04));
      for(const offset of [-.85,.85]){
        const p=at(side*3.8+offset,3.68);
        box(timber,p.east,deckY+.72,p.north,.11,.58,.12,rotation);
      }
      const use=at(side*3.8,2.60);
      benchSeats.push({id:label+'-'+side,east:bc.east,north:bc.north,height:deckY,useEast:use.east,useNorth:use.north,yaw:yaw+Math.PI});
    }
    const sc = at(-4.6, 2.6);
    stationSign(sc.east, topY + 1.7, sc.north, rotation, label);
    return at;
  }

  // ---------- the branch line ----------
  const main = buildTrackway(craterBranchControlLine, {
    gauge: 1.66, sleeperWidth: 2.5, ballastWidth: 2.9, railH: .18,
    flatten: [
      { east: 296, north: 502, half: 11 },
      { east: -44.5, north: 168, half: 10 },
    ],
  });
  const shankouY = main.stationY.get('296,502')!;
  const kengkouY = main.stationY.get('-44.5,168')!;

  // Portal stub: the line's scenic continuation into the ridge face north of
  // Shankou station (the fake tunnel mouth of §五.21).
  // Scenic dead-end portal branch leaves west of the passenger platform,
  // not through its middle approach. It is not a passenger service line.
  buildTrackway([[282, 504], [285, 514], [289, 530], [293, 540]], {
    gauge: 1.66, sleeperWidth: 2.5, ballastWidth: 2.9, railH: .18,
  });
  {
    const g = groundAt(293, 546);
    for (const s of [-1, 1]) box(stone, 293 + s * 2.9, g + 3.4, 546.5, 1.3, 6.8, 1.6);
    box(stone, 293, g + 7.3, 546.5, 7.2, 1.5, 1.7);
    box(stoneDark, 293, g + 8.3, 546.5, 7.6, .6, 1.9);
    // Scenic tunnel is an explicitly sealed portal, not an invisible
    // walk-through black plane. Threshold, masonry and beam share colliders.
    box(dark,293,g+2.9,546.2,4.7,5.8,.5);
    colliders.push(orientedSupportBox(293,546.2,0,4.7,.5,g,g+5.8));
    for(const side of [-1,1]){
      colliders.push(orientedSupportBox(293+side*2.9,546.5,0,1.3,1.6,g,g+6.8));
      for(const h of [1.15,3.0,4.85])box(stoneDark,293+side*2.9,g+h,545.65,1.40,.15,.13);
    }
    box(timber,293,g+4.75,545.88,4.66,.27,.22);
    box(timber,293,g+1.25,545.88,4.66,.20,.22);
    for(const x of [-1.7,0,1.7])box(timber,293+x,g+2.95,545.88,.20,5.4,.22);
    for (const [dx, dn, s] of [[-3.4, 3.4, 3.2], [3.6, 3, 2.7], [0, 4.6, 3.8], [-1.5, 2.6, 2.2]] as const) {
      part(stoneDark, new DodecahedronGeometry(s, 0), 293 + dx, g + s * .42, 546.5 + dn, dx * 1.3);
      part(snow, new DodecahedronGeometry(s * .82, 0), 293 + dx, g + s * .42 + s * .48, 546.5 + dn, dx * 1.3);
    }
  }

  // ---------- Shankou station (platform on the north side, at the pass node's foot) ----------
  shelter(296, 502, groundAt(296, 502), shankouY, 0, '山口站');
  // A real, open arrival lane from the north. Four low wooden waymarkers
  // sit beside the walking channel; each uses the actual carrier height.
  for(const n of [513,518])for(const side of [-1,1]){
    const e=296+side*1.8,g=groundAt(e,n);
    box(stone,e,g+.08,n,.36,.28,.36);
    box(timber,e,g+.49,n,.14,.78,.14);
    box(snow,e,g+.92,n,.23,.09,.23);
    colliders.push(orientedSupportBox(e,n,0,.36,.36,g-.06,g+.22));
    colliders.push(orientedSupportBox(e,n,0,.14,.14,g+.10,g+.88));
  }
  {
    // Timetable board: text landed per 《文本-山口站时刻牌-2026-11-21》
    // (two chalk columns; the northbound column keeps three blank cells —
    // blank is content, the branch has only just opened).
    const bx = 308, bn = 506;
    const g = groundAt(bx, bn);
    for(const s of [-1,1]){
      const e=bx+s*.8,h=groundAt(e,bn);
      box(stone,e,h+.07,bn,.35,.26,.35);
      box(timber,e,(h+g+2.2)/2,bn,.14,g+2.2-h,.14);
      colliders.push(orientedSupportBox(e,bn,0,.35,.35,h-.06,h+.2));
      colliders.push(orientedSupportBox(e,bn,0,.14,.14,h,g+2.2));
    }
    // Face the north arrival shoulder rather than the track.
    colliders.push(orientedSupportBox(bx,bn,0,2.18,.07,g+1.545,g+2.855));
    timetableReads.push({east:bx,north:bn+2.1,height:groundAt(bx,bn+2.1),title:'山口站时刻牌',description:'环镇线：晨一班、午一班、暮一班、夜一班。北行 · 往坑口：晨一班，其余三格尚未填写。此为站牌记载，北延支线实际乘车服务尚未接通。'});
    sign(bx, g + 2.2, bn, Math.PI, 2, 1.15, (c, w, h) => {
      c.fillStyle = '#35312b'; c.fillRect(0, 0, w, h);
      // Column heads + grid: header rule, vertical divider, four row rules.
      const gridTop = h * .26, gridBottom = h * .78;
      c.strokeStyle = 'rgba(231, 225, 207, .7)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(w * .06, gridTop); c.lineTo(w * .94, gridTop); c.stroke();
      c.beginPath(); c.moveTo(w * .5, gridTop); c.lineTo(w * .5, gridBottom); c.stroke();
      for (let row = 0; row < 4; row++) {
        const y = gridTop + (gridBottom - gridTop) * (row + 1) / 4;
        c.beginPath(); c.moveTo(w * .06, y); c.lineTo(w * .94, y); c.stroke();
      }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#e7e1cf';
      c.font = `${Math.round(h * .095)}px "Noto Sans SC", sans-serif`;
      c.fillText('环镇线', w * .28, h * .16);
      c.fillText('北行 · 往坑口', w * .72, h * .16);
      // Loop line: all four cells filled, neat chalk.
      c.font = `${Math.round(h * .085)}px "Noto Sans SC", sans-serif`;
      for (const [row, text] of ['晨一班', '午一班', '暮一班', '夜一班'].entries()) {
        const y = gridTop + (gridBottom - gridTop) * (row + .5) / 4;
        c.fillText(text, w * .28, y);
      }
      // Northbound: only the first cell filled, older chalk; the night cell
      // keeps an erasure smear — written once, wiped, unexplained.
      c.fillStyle = '#b9b2a0';
      c.fillText('晨一班', w * .72, gridTop + (gridBottom - gridTop) * .125);
      c.strokeStyle = 'rgba(231, 225, 207, .16)'; c.lineWidth = 5;
      for (let s = 0; s < 3; s++) {
        const y = gridTop + (gridBottom - gridTop) * (.875 + (s - 1) * .03);
        c.beginPath(); c.moveTo(w * .56, y); c.lineTo(w * .88, y); c.stroke();
      }
      // Newer hand under the board.
      c.fillStyle = '#e7e1cf';
      c.font = `${Math.round(h * .075)}px "Noto Sans SC", sans-serif`;
      c.fillText('北行余班，通车后填。急事找守山口的。', w / 2, h * .9);
    });
  }

  // ---------- Crater-mouth station, freight siding, hopper car, freight shed ----------
  const kengkouAt = shelter(-44.5, 168, groundAt(-44.5, 168), kengkouY, 1.7, '坑口站');
  const boards: { id: string; east: number; north: number }[] = [];
  boards.push({ id: 'shankou-timetable', east: 308, north: 506 });
  {
    // Timetable board at the shelter's east end — reworded per 总控裁定 批55
    // (《设计-全图文字件总表》K-15)：班次行改为班距文案，与墙表 K-15 同文；
    // 「夜车空驶，亦准点。乘车请至山口站换乘。」保留作第二行。
    // 「货运矿料，随正班附挂。」一行随改字撤下（其义已由「货列过站」承接）。
    const bp = kengkouAt(4.9, 2.6);
    const g = groundAt(bp.east, bp.north);
    boards.push({ id: 'kengkou-timetable', east: bp.east, north: bp.north });
    for (const s of [-1, 1]) {
      const pp = kengkouAt(4.9 + s * .9, 2.6);
      box(timber, pp.east, g + 1.6, pp.north, .13, 3.2, .13);
    }
    sign(bp.east, g + 2.35, bp.north, 1.7, 2.3, 1.5, (c, w, h) => {
      c.fillStyle = '#35312b'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(0, 0, 0, .35)'; c.lineWidth = 2;
      for (const fy of [.33, .66]) {
        c.beginPath(); c.moveTo(0, h * fy); c.lineTo(w, h * fy); c.stroke();
      }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#e7e1cf';
      c.font = '30px "Noto Sans SC", sans-serif';
      c.fillText('货列过站 · 每班约隔六分半', w / 2, h * .17);
      c.fillText('首班随晨钟 · 夜班照走（空车）', w / 2, h * .5);
      c.font = '26px "Noto Sans SC", sans-serif';
      c.fillText('夜车空驶，亦准点。乘车请至山口站换乘。', w / 2, h * .83);
    });
  }
  {
    // Timetable WALL (《设计-区域分册-陨石坑区》卡04 结构件，文字件 K-14/15)：
    //此前未建（仓内无「北延支线」文本），本次按卡04 新建于站棚西端，与东端
    //粉笔板对称。表头＋列头＋班距文案——总控 2026-11-22 裁定：不刻钟点，
    //以班距文案落字（与列车实测班次 392.3 秒对表）。
    const wp = kengkouAt(-4.9, 2.6);
    const g = groundAt(wp.east, wp.north);
    boards.push({ id: 'kengkou-timetable-wall', east: wp.east, north: wp.north });
    for (const s of [-1, 1]) {
      const pp = kengkouAt(-4.9 + s * 1.1, 2.6);
      box(timber, pp.east, g + 1.6, pp.north, .13, 3.2, .13);
    }
    sign(wp.east, g + 2.35, wp.north, 1.7, 2.6, 1.6, (c, w, h) => {
      c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3d2c1c'; c.lineWidth = 3;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = '#3d2c1c'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 34px "Noto Sans SC", sans-serif';
      c.fillText('北延支线 · 坑口站', w / 2, h * .14);
      c.strokeStyle = 'rgba(61, 44, 28, .6)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(w * .06, h * .28); c.lineTo(w * .94, h * .28); c.stroke();
      c.beginPath(); c.moveTo(w * .06, h * .44); c.lineTo(w * .94, h * .44); c.stroke();
      c.font = '28px "Noto Sans SC", sans-serif';
      c.fillText('班次', w * .2, h * .36);
      c.fillText('开往', w * .5, h * .36);
      c.fillText('开车', w * .8, h * .36);
      c.font = '28px "Noto Sans SC", sans-serif';
      c.fillText('货列过站 · 每班约隔六分半', w / 2, h * .6);
      c.fillText('首班随晨钟 · 夜班照走（空车）', w / 2, h * .78);
    });
  }
  {
    // Platform lamp: the station's one real light.
    const lx = -39.5, ln = 176;
    const g = groundAt(lx, ln);
    box(timber, lx, g + 1.5, ln, .15, 3, .15);
    box(glow, lx, g + 3.15, ln, .3, .4, .3);
    box(iron, lx, g + 3.45, ln, .46, .08, .46);
    const light = new PointLight(new Color(palette.ember), 7, 13, 2);
    light.position.set(lx, g + 3.15, -ln);
    group.add(light);
  }
  const siding = buildTrackway([[-50, 184], [-54, 158], [-57, 134]], {
    gauge: 1.66, sleeperWidth: 2.5, ballastWidth: 2.9, railH: .18,
  });
  {
    // Ore hopper car standing on the siding.
    let car = siding.samples[0], best = Infinity;
    for (const s of siding.samples) {
      const d = (s.east + 54.5) ** 2 + (s.north - 155) ** 2;
      if (d < best) { best = d; car = s; }
    }
    const yaw = Math.atan2(50, -7) + Math.PI / 2;
    const cy = car.y;
    box(iron, car.east, cy + .55, car.north, 5.9, .3, 2.3, yaw);
    // Empty-looking hopper shell now has an actual rim and wheel frame.
    for(const side of [-1,1]){
      const e=car.east+Math.sin(yaw)*side*1.16,n=car.north-Math.cos(yaw)*side*1.16;
      box(rustIron,e,cy+1.75,n,5.7,1.9,.15,yaw);
      box(iron,e,cy+2.73,n,5.9,.14,.22,yaw);
    }
    for(const side of [-1,1]){
      const e=car.east+Math.cos(yaw)*side*2.78;
      // Match the Three yaw used by the actual boxes.
      box(rustIron,e,cy+1.75,car.north+Math.sin(yaw)*side*2.78,.15,1.9,2.45,yaw);
    }
    box(rustIron,car.east,cy+.85,car.north,5.55,.17,2.3,yaw);
    colliders.push(orientedSupportBox(car.east,car.north,yaw,5.9,2.45,cy-.2,cy+2.8));
    part(rustIron, new CylinderGeometry(.75, 1.55, 1.15, 4), car.east, cy + .95, car.north, yaw + Math.PI / 4);
    part(ore, new ConeGeometry(1.05, .85, 8), car.east, cy + 3.1, car.north, yaw);
    for (const [lx, lz] of [[-2.2, -0.95], [2.2, -0.95], [-2.2, 0.95], [2.2, 0.95]] as const) {
      const wx = car.east + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
      const wn = car.north - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      part(darkSteel, new CylinderGeometry(.42, .42, .14, 10), wx, cy + .18, wn, yaw, Math.PI / 2);
    }
  }
  {
    // Freight shed west of the siding.
    const sx = -64, sn = 146;
    const g = groundAt(sx, sn);
    // A real freight staging area: raised timber surface, exposed braces,
    // a clear aisle facing the siding and a low unloading apron.
    const deck=g+.24;
    box(stoneDark,sx,g+.06,sn,7.8,.20,5.4);
    box(timberWarm,sx,deck-.08,sn,7.8,.16,5.4);
    floors.push(orientedSupportBox(sx,sn,0,7.8,5.4,g-.04,deck));
    const apronX=sx+4.75;
    box(timber,apronX,g+.095,sn,1.7,.19,2.2);
    floors.push(orientedSupportBox(apronX,sn,0,1.7,2.2,g,g+.19));
    for (const [px, pz] of [[-3.4, -2.4], [3.4, -2.4], [-3.4, 2.4], [3.4, 2.4]] as const) {
      box(timber, sx + px, g + 1.6, sn + pz, .26, 3.2, .26);
      colliders.push(orientedSupportBox(sx+px,sn+pz,0,.26,.26,g,g+3.2));
      box(timberWarm,sx+px,g+2.78,sn+pz,.17,.9,.18,0,0,px>0?.55:-.55);
    }
    for(const dn of [-2.35,2.35])box(timber,sx,g+3.05,sn+dn,7.6,.23,.24);
    box(slate, sx, g + 3.45, sn, 8.4, .22, 6.2, 0, .05);
    box(snow, sx, g + 3.62, sn, 8.2, .14, 6, 0, .05);
    box(timber, sx, g + 1.5, sn - 2.55, 7.2, 3, .14);
    colliders.push(orientedSupportBox(sx,sn-2.55,0,7.2,.14,g,g+3));
    // Stock goes on the back wall, leaving a 2m east-west cargo aisle.
    for(const [dx,dn,w,h] of [[-2.2,-1.3,1.5,1.25],[-.4,-1.4,1.3,1.1]] as const){
      box(timberWarm,sx+dx,deck+h/2,sn+dn,w,h,w);
      colliders.push(orientedSupportBox(sx+dx,sn+dn,0,w,w,deck,deck+h));
      for(const side of [-1,1])box(iron,sx+dx+side*w*.36,deck+h/2,sn+dn,.07,h+.025,w+.025);
    }
    part(ore,new ConeGeometry(.9,1.15,9),sx+2.25,deck+.575,sn-1.4,0);
    colliders.push(orientedSupportBox(sx+2.25,sn-1.4,0,1.8,1.8,deck,deck+1.15));
    stationWalkRoutes.push({id:'freight-shed',points:[{east:sx+6.1,north:sn,height:groundAt(sx+6.1,sn)},{east:apronX,north:sn,height:g+.19},{east:sx+3.1,north:sn,height:deck},{east:sx,north:sn,height:deck}]});
    // K-13 (《设计-全图文字件总表》卡04): shed name board under the roof
    // edge on the east face, toward the siding.
    sign(sx + 3.55, g + 2.8, sn, Math.PI / 2, 1.1, .42, (c, w, h) => {
      c.fillStyle = '#3a352d'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(211, 203, 185, .35)'; c.lineWidth = 3;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.font = 'bold 92px "Noto Sans SC", sans-serif';
      c.fillStyle = '#e8e2d2'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('货棚', w / 2, h / 2 + 4);
    });
  }

  // ---------- narrow-gauge mine track along the reserved belt corridor ----------
  const corridorWorld = craterBeltTrackCorridor.map(([b, r]) => {
    const rad = b * Math.PI / 180;
    return [road.anchor.east + r * Math.sin(rad), road.anchor.north + r * Math.cos(rad)] as const;
  });
  const narrow = buildTrackway([[-54, 140], ...corridorWorld], {
    gauge: .9, sleeperWidth: 1.7, ballastWidth: 2, railH: .13,
    flatten: [{ east: corridorWorld.at(-1)![0], north: corridorWorld.at(-1)![1], half: 6 }],
  });
  {
    // One ore skip standing by the ore yard, and the buffer stop at the smelter door.
    let skip = narrow.samples[0], best = Infinity;
    for (const s of narrow.samples) {
      const d = (s.east + 118) ** 2 + (s.north - 101.5) ** 2;
      if (d < best) { best = d; skip = s; }
    }
    const idx = narrow.samples.indexOf(skip);
    const next = narrow.samples[Math.min(idx + 1, narrow.samples.length - 1)];
    const yaw = Math.atan2(-(next.east - skip.east), -(next.north - skip.north)) + Math.PI / 2;
    box(iron, skip.east, skip.y + .5, skip.north, 2.3, .75, 1.35, yaw);
    part(ore, new ConeGeometry(.62, .55, 8), skip.east, skip.y + 1.05, skip.north, yaw);
    const end = narrow.samples.at(-1)!;
    const prev = narrow.samples.at(-2)!;
    const eyaw = Math.atan2(-(end.east - prev.east), -(end.north - prev.north)) + Math.PI / 2;
    box(timber, end.east, end.y + .55, end.north, 1.7, .3, .3, eyaw, 0, .5);
    box(timber, end.east, end.y + .55, end.north, 1.7, .3, .3, eyaw, 0, -.5);
    box(iron, end.east, end.y + .6, end.north, 1.5, .5, .12, eyaw);
  }

  // ---------- merge batches ----------
  for (const [mat, geos] of batches) {
    const joined = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g));
    if (!joined) continue;
    joined.computeBoundingSphere();
    const mesh = new Mesh(joined, mat);
    mesh.name = `crater-rail-${mat.uuid.slice(0, 6)}`;
    group.add(mesh);
  }

  const alignment: RailExtensionAlignment = {
    length: main.length,
    minRadius: main.minRadius,
    stations: [
      { id: 'shankou-station', label: '山口站', east: 296, north: 502, railY: shankouY },
      { id: 'kengkou-station', label: '坑口站', east: -44.5, north: 168, railY: kengkouY },
    ],
    boards,
    whistlePoints: [
      { id: 'shankou-portal', east: 293, north: 542 },
      { id: 'kengkou-approach', east: -43.5, north: 190 },
    ],
    divergence: { east: 477, north: 335 },
  };
  group.userData.colliders=colliders;
  group.userData.floors=floors;
  return { group, alignment, samples: main.samples, narrowSamples: narrow.samples, stationWalkRoutes,benchSeats,shankouArrival,timetableReads };
}
