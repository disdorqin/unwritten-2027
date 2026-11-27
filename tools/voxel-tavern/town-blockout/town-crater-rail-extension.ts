import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Group, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, PlaneGeometry, PointLight, Quaternion,
  RepeatWrapping, SRGBColorSpace, Vector3, CatmullRomCurve3, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {mountAR30StaticBatches} from './town-a-r30-static-batches';
import type { createTerrainGrid } from './terrain';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { craterBeltTrackCorridor } from './town-crater-outer-works';
import { orientedSupportBox, supportFootprintOverlaps, type OrientedSupportBox } from './town-a-r30-oriented-support';
import { railSections, buildRailStrip, buildTurnoutRailStrips, buildTurnoutBallast, distanceToRail, surveyRailGrade, repairBoundedRailGrade, capRepairedRailProfile, surveyRailJunction, type RailSection } from './town-a-r30-rail-strip';
import { craterBranchControlLine, freightSidingControlLine, sampleRailCenterline } from './town-a-r30-rail-network';
export { craterBranchControlLine } from './town-a-r30-rail-network';
import { buildRailCrossings, mainPedestrianCrossings, freightPedestrianCrossings, narrowPedestrianCrossings } from './town-a-r30-rail-crossings';
import { inscriptionAccessFootway } from './town-a-r30-west-landscape';

type Terrain = ReturnType<typeof createTerrainGrid>;
type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt' | 'inscription'>;

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
// The canonical control line is now shared with the corridor reservation.

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
export function buildCraterRailExtension(grid: Terrain, road: CraterRoad, loop?:readonly {x:number;y:number;z:number}[]) {
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
  const railBearings:{east:number;north:number;low:number;high:number;cornerMinimum:number;slope:number}[]=[];
  let stringerSegments=0;
  let valleyRepair:ReturnType<typeof repairBoundedRailGrade>|undefined;
  let eastValleyRepair:ReturnType<typeof repairBoundedRailGrade>|undefined;
  let eastValleyEnvelope:ReturnType<typeof capRepairedRailProfile>|undefined;
  let northRampEnvelope:ReturnType<typeof capRepairedRailProfile>|undefined;
  const eastValleyBridgeSpans:{index:number;length:number;bearings:number;startY:number;endY:number}[]=[];
  let closedHead:{index:number;removedLength:number;east:number;north:number;y:number;box:OrientedSupportBox;reason:string}|undefined;
  const valleyBridgeSpans:{index:number;length:number;bearings:number;startY:number;endY:number}[]=[];
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
    const g = geo;
    if (roll) g.rotateZ(roll);
    if (pitch) g.rotateX(pitch);
    if (yaw) g.rotateY(yaw);
    g.translate(east, h, -north);
    push(mat, g);
    // Transferred to the static batch; release after merging.
  }
  function box(mat: MeshStandardMaterial, east: number, h: number, north: number,
    sx: number, sy: number, sz: number, yaw = 0, pitch = 0, roll = 0) {
    part(mat, metricBox(mat,sx,sy,sz), east, h, north, yaw, pitch, roll);
  }
  function segBox(mat: MeshStandardMaterial, center: Vector3, quat: Quaternion,
    lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) {
    const geo = metricBox(mat,sx,sy,sz);
    geo.translate(lx, ly, lz);
    geo.applyQuaternion(quat);
    geo.translate(center.x, center.y, center.z);
    push(mat, geo);
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
      flatten?: readonly { east: number; north: number; half: number }[]; stock?:readonly RailSection[]; repairValley?:boolean },
  ): { samples: Sample[]; length: number; minRadius: number; stationY: Map<string, number> } {
    const {length,count,step,points}=sampleRailCenterline(control);
    const samples: Sample[] = points.map(point => {
      const {east,north}=point;
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
    // A-R04 independent low-valley repair. Keep both existing endpoints,
    // both stations, the loop junction and D's mountain-side profile.
    let bridgeFirst=-1,bridgeLast=-1,eastBridgeFirst=-1,eastBridgeLast=-1;
    if(opts.repairValley){
      const first=samples.findIndex(p=>p.east<267&&p.north>495);
      const last=samples.findIndex(p=>p.east<196&&p.north>515);
      valleyRepair=repairBoundedRailGrade(samples,first,last);
      if(!valleyRepair.blocked&&valleyRepair.changed.length){
        valleyRepair.profile.forEach((p,i)=>{samples[i]!.y=p.y;});
        bridgeFirst=valleyRepair.changed[0]!-1;
        bridgeLast=valleyRepair.changed.at(-1)!+1;
      }
    }
    // Independent eastern low valley, outside either station platform.
    // Keep the existing horizontal survey and downstream anchor. No D
    // high-ground substitution or new service is authorized here.
    if(opts.repairValley){
      const first=samples.findIndex(p=>p.east<449.5&&p.north>451);
      const last=samples.findIndex(p=>p.east<397&&p.north>492);
      eastValleyRepair=repairBoundedRailGrade(samples,first,last);
      if(!eastValleyRepair.blocked&&eastValleyRepair.changed.length){
        eastValleyRepair.profile.forEach((p,i)=>{samples[i]!.y=p.y;});
        eastBridgeFirst=eastValleyRepair.changed[0]!-1;eastBridgeLast=eastValleyRepair.changed.at(-1)!+1;
        // Keep the built bridge footprint; reduce the repaired profile
        // only where a 1.1m structural clearance remains under its girders.
        eastValleyEnvelope=capRepairedRailProfile(samples,first,last,2.6,1.1);
        if(!eastValleyEnvelope.blocked)eastValleyEnvelope.profile.forEach((p,i)=>{samples[i]!.y=p.y;});
      }
    }
    // Remove residual grade overshoots on the north ramp between the
    // closed throat and the genuinely steep mountain segment. Keep
    // both physical endpoints; do not change the horizontal alignment.
    if(opts.repairValley){
      const first=samples.findIndex(p=>p.north>370),last=samples.findIndex(p=>p.north>401);
      northRampEnvelope=capRepairedRailProfile(samples,first,last);
      if(!northRampEnvelope.blocked)northRampEnvelope.profile.forEach((p,i)=>{samples[i]!.y=p.y;});
    }
    // Shared cross sections: the rail head, base and ballast are all
    // continuous strips with the same station and curve samples.
    const sections=railSections(samples);
    // Preserve the full survey, but never draw a disconnected branch
    // through the live ring's stock rails. Physical closure only.
    let renderStart=0;
    if(opts.repairValley&&loop){
      const audit=surveyRailJunction(samples,loop);
      if(!audit.geometryReady&&audit.overlapRuns.length){
        const stop=audit.overlapRuns.at(-1)!.to+6;
        let along=0;
        for(let i=1;i<samples.length;i++){
          const a=samples[i-1]!,b=samples[i]!;along+=Math.hypot(b.east-a.east,b.north-a.north);
          if(along>=stop){renderStart=i;break;}
        }
        if(renderStart<=0||renderStart>=samples.length-2)throw Error('Missing safe closed branch head');
        const p=samples[renderStart]!,q=samples[renderStart+1]!,yaw=Math.atan2(q.east-p.east,p.north-q.north);
        for(const side of [-1,1]){
          const e=p.east+side*.83*Math.cos(yaw),n=p.north+side*.83*Math.sin(yaw);
          box(iron,e,p.y+.45,n,.24,1.16,.28,yaw);
          box(rustIron,e,p.y-.18,n,.42,.24,.46,yaw);
        }
        box(timberWarm,p.east,p.y+.76,p.north,2.60,.24,.35,yaw);
        box(iron,p.east,p.y+.76,p.north,.24,.27,.38,yaw);
        box(rustIron,p.east,p.y+.99,p.north,.68,.20,.13,yaw);
        const solid=orientedSupportBox(p.east,p.north,yaw,2.60,.46,p.y-.30,p.y+1.12);
        colliders.push(solid);closedHead={index:renderStart,removedLength:along,east:p.east,north:p.north,y:p.y,box:solid,reason:'unapproved stock rail junction'};
      }
    }
    const activeSections=sections.slice(renderStart);
    for(const [first,last] of [[bridgeFirst,bridgeLast],[eastBridgeFirst,eastBridgeLast]])if(first>=0){
      const bridgeSections=sections.slice(Math.max(first,renderStart),last+1);
      for(const side of [-1,1]){
        const offset=side*.76;
        push(iron,buildRailStrip(bridgeSections,offset,.28,-1.02,-.655));
        push(darkSteel,buildRailStrip(bridgeSections,offset,.48,-1.02,-.955));
        push(darkSteel,buildRailStrip(bridgeSections,offset,.48,-.69,-.625));
      }
    }
    for(const side of [-1,1]){
      const offset=side*opts.gauge/2;
      if(opts.stock){
        for(const g of buildTurnoutRailStrips(activeSections,opts.stock,offset,.15,opts.gauge,-.08-opts.railH/2,-.08+opts.railH/2))push(steel,g);
        for(const g of buildTurnoutRailStrips(activeSections,opts.stock,offset,.30,opts.gauge,-.255,-.185))push(darkSteel,g);
      }else{
        push(steel,buildRailStrip(activeSections,offset,.15,-.08-opts.railH/2,-.08+opts.railH/2));
        push(darkSteel,buildRailStrip(activeSections,offset,.30,-.255,-.185));
      }
    }
    if(opts.stock){
      const bed=buildTurnoutBallast(activeSections,opts.stock,opts.ballastWidth);
      if(bed)push(stoneDark,bed);
    }else push(stoneDark,buildRailStrip(activeSections,0,opts.ballastWidth,-.63,-.37,1));
    const orientation = new Matrix4();
    let stringerStart=-1;
    for (let i = renderStart; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      const va = new Vector3(a.east, a.y, -a.north);
      const vb = new Vector3(b.east, b.y, -b.north);
      const center = new Vector3().lerpVectors(va, vb, .5);
      const quat = new Quaternion().setFromRotationMatrix(orientation.lookAt(vb, va, up));
      const segLen = va.distanceTo(vb);
      if(opts.stock){
        const extra=Math.min(opts.sleeperWidth,Math.max(0,distanceToRail(opts.stock,center.x,-center.z)-.01));
        if(extra>.04)segBox(timber,center,quat,-opts.sleeperWidth/2+extra/2,-.32,0,extra,.15,.36);
      }else segBox(timber, center, quat, 0, -.32, 0, opts.sleeperWidth, .15, .36);
      // The bearing head follows the actual longitudinal bed plane; its
      // footing is buried at the lowest sampled corner, not the centre soil.
      // Elevated segments also receive a continuous load-bearing stringer.
      const e=center.x,n=-center.z,soil=groundAt(e,n),underside=center.y-.63;
      const horizontal=Math.hypot(b.east-a.east,b.north-a.north);
      const yaw=Math.atan2(vb.x-va.x,vb.z-va.z);
      const slope=(b.y-a.y)/horizontal;
      const westBridge=bridgeFirst>=0&&i>=bridgeFirst&&i<bridgeLast;
      const eastBridge=eastBridgeFirst>=0&&i>=eastBridgeFirst&&i<eastBridgeLast;
      const bridge=westBridge||eastBridge;
      const activeFirst=eastBridge?eastBridgeFirst:bridgeFirst,activeLast=eastBridge?eastBridgeLast:bridgeLast;
      if(bridge){
        // Two continuous iron girders, cross ties and bonded stone piers.
        // All share the same rail sections rather than freestanding props.
        for(const side of [-1,1]){
          const offset=side*.76;
          const q={east:e+Math.cos(yaw)*offset,north:n+Math.sin(yaw)*offset};
          colliders.push(orientedSupportBox(q.east,q.north,yaw,.48,horizontal,Math.min(a.y,b.y)-1.02,Math.max(a.y,b.y)-.625));
        }
        segBox(iron,center,quat,0,-.84,0,1.85,.18,.16);
        let bearings=0;
        if(i===activeFirst||i===activeLast-1||(i-activeFirst)%3===0){
          const w=2.55,len=1.42,c=Math.cos(yaw),s=Math.sin(yaw);
          const hs=[-1,0,1].flatMap(x=>[-1,0,1].map(z=>groundAt(e+c*x*w/2+s*z*len/2,n+s*x*w/2-c*z*len/2)));
          const head=center.y-1.00;
          const low=Math.min(...hs,head-Math.abs(slope)*len/2-.12)-.10;
          const high=head+Math.abs(slope)*len/2;
          const pier=metricBox(stone,w,1,len),pos=pier.getAttribute('position');
          for(let k=0;k<pos.count;k++)pos.setY(k,pos.getY(k)>0?head+slope*pos.getZ(k)-low:0);
          pier.computeVertexNormals();part(stone,pier,e,low,n,yaw);
          colliders.push(orientedSupportBox(e,n,yaw,w,len,low,high));
          railBearings.push({east:e,north:n,low,high,cornerMinimum:Math.min(...hs),slope});
          // Cap rests on the sloping masonry head and the two lower flanges.
          segBox(stoneDark,center,quat,0,-1.045,0,2.67,.11,1.48);
          bearings=1;
        }
        (eastBridge?eastValleyBridgeSpans:valleyBridgeSpans).push({index:i,length:horizontal,bearings,startY:a.y,endY:b.y});
      }
      if(!bridge&&underside>soil+.12&&(!opts.stock||distanceToRail(opts.stock,e,n)>opts.ballastWidth)){
        if(i%3===0||underside-soil<.85&&i%2===0){
          const length=underside-soil<.85?Math.min(horizontal*1.85,3.1):1.35;
          const width=opts.ballastWidth-.24;
          const c=Math.cos(yaw),s=Math.sin(yaw);
          const cornerHeights=[-1,0,1].flatMap(x=>[-1,0,1].map(z=>groundAt(e+c*x*width/2+s*z*length/2,n+s*x*width/2-c*z*length/2)));
          const low=Math.min(...cornerHeights,underside-Math.abs(slope)*length/2-.09)-.10;
          const top=underside+.018,high=top+Math.abs(slope)*length/2;
          const pier=metricBox(stone,width,1,length),pos=pier.getAttribute('position');
          for(let k=0;k<pos.count;k++)pos.setY(k,pos.getY(k)>0?top+slope*pos.getZ(k)-low:0);
          pier.computeVertexNormals();
          part(stone,pier,e,low,n,yaw);
          const collider=orientedSupportBox(e,n,yaw,width,length,low,high);
          colliders.push(collider);
          railBearings.push({east:e,north:n,low,high,cornerMinimum:Math.min(...cornerHeights),slope});
        }
      }
      if(!bridge&&!opts.stock&&underside-soil>.85&&a.y-.63-groundAt(a.east,a.north)>.55&&b.y-.63-groundAt(b.east,b.north)>.55){
        // No duplicate coplanar tops: the stringer sits below the ballast
        // and runs across the entire section between the actual pier heads.
        const width=opts.ballastWidth*.54;
        if(stringerStart<0)stringerStart=i;
        colliders.push(orientedSupportBox(e,n,yaw,width,horizontal,Math.min(a.y,b.y)-.89,Math.max(a.y,b.y)-.625));
        stringerSegments++;
      }else if(stringerStart>=0){
        push(iron,buildRailStrip(sections.slice(stringerStart,i+1),0,opts.ballastWidth*.54,-.89,-.625));
        stringerStart=-1;
      }
    }
    if(stringerStart>=0)push(iron,buildRailStrip(sections.slice(stringerStart),0,opts.ballastWidth*.54,-.89,-.625));
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
      // Lanterns hang beside posts, not in the central head clearance.
      // Reuse the existing emissive glass; no new point lights.
      for(const side of [-1,1]){
        const p=at(side*2.4,3.0);
        box(iron,p.east,deckY+2.39,p.north,.065,.38,.065,rotation);
        box(glow,p.east,deckY+2.13,p.north,.24,.25,.24,rotation);
        for(const y of [2.0,2.27])box(iron,p.east,deckY+y,p.north,.32,.065,.32,rotation);
        for(const x of [-.13,.13])for(const z of [-.13,.13])
          box(iron,p.east+x,deckY+2.13,p.north+z,.035,.25,.035,rotation);
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
    gauge: 1.66, sleeperWidth: 2.5, ballastWidth: 2.9, railH: .18, repairValley:true,
    flatten: [
      { east: 296, north: 502, half: 11 },
      { east: -44.5, north: 168, half: 10 },
    ],
  });
  const junctionAudit=loop?surveyRailJunction(main.samples,loop):undefined;
  const verticalSurvey=surveyRailGrade(main.samples);
  // Neither a matching junction nor a grade pass alone authorizes
  // passenger service. Keep the old single loop clock and movement host.
  const serviceGeometryReady=!!junctionAudit?.geometryReady&&verticalSurvey.violations.length===0;
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
      // Posts meet the underside of the board rather than crossing the
      // visible chalk surface. Short rear cleats carry the actual frame.
      const bottom=g+1.545;
      box(timber,e,(h+bottom+.035)/2,bn-.075,.14,bottom+.035-h,.14);
      box(iron,e,bottom+.08,bn-.075,.22,.24,.14);
      colliders.push(orientedSupportBox(e,bn,0,.35,.35,h-.06,h+.2));
      colliders.push(orientedSupportBox(e,bn-.075,0,.14,.14,h,bottom+.035));
    }
    // Face the north arrival shoulder rather than the track.
    colliders.push(orientedSupportBox(bx,bn,0,2.18,.07,g+1.545,g+2.855));
    timetableReads.push({east:bx,north:bn+2.1,height:groundAt(bx,bn+2.1),title:'山口站时刻牌',description:'环镇线：晨一班、午一班、暮一班、夜一班。北行 · 往坑口：晨一班，其余三格尚未填写。此为站牌记载，北延支线实际乘车服务尚未接通。'+(junctionAudit&&!serviceGeometryReady?'道岔连接、轨道净空或纵坡尚未通过实际线路核验。':'')});
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
  // Stop the freight siding beyond the cargo shed, before the instrument
  // plant stair. The former extra 9m passed through its front approach.
  const siding = buildTrackway(freightSidingControlLine(main.samples), {
    gauge: 1.66, sleeperWidth: 2.5, ballastWidth: 2.9, railH: .18,
    stock:railSections(main.samples).filter(s=>s.east< -30&&s.north>=130&&s.north<=250),
  });
  {
    // Ore hopper car standing on the siding.
    let car = siding.samples[0], best = Infinity;
    for (const s of siding.samples) {
      const d = (s.east + 54.5) ** 2 + (s.north - 155) ** 2;
      if (d < best) { best = d; car = s; }
    }
    const idx=siding.samples.indexOf(car),a=siding.samples[Math.max(0,idx-1)]!,b=siding.samples[Math.min(siding.samples.length-1,idx+1)]!;
    const yaw=Math.atan2(b.north-a.north,b.east-a.east),cy=car.y;
    const at=(x:number,z:number)=>({e:car.east+Math.cos(yaw)*x+Math.sin(yaw)*z,n:car.north+Math.sin(yaw)*x-Math.cos(yaw)*z});
    const put=(mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number,roll=0)=>{
      const p=at(x,z);box(mat,p.e,cy+y,p.n,w,h,d,yaw,0,roll);
    };
    // Retired full-gauge hopper with a separate chassis, four rail-aligned
    // wheelsets and genuinely open freight bin. Gauge is the track's 1.66m.
    put(iron,0,.95,0,5.9,.28,2.25);
    for(const z of [-.83,.83])put(darkSteel,0,.68,z,5.8,.18,.16);
    for(const x of [-2.2,-1.45,1.45,2.2]){
      const axle=at(x,0);
      part(darkSteel,new CylinderGeometry(.095,.095,1.92,8),axle.e,cy+.43,axle.n,yaw,Math.PI/2);
      for(const z of [-.83,.83]){
        const w=at(x,z);
        part(darkSteel,new CylinderGeometry(.42,.42,.16,12),w.e,cy+.43,w.n,yaw,Math.PI/2);
        part(iron,new CylinderGeometry(.20,.20,.20,10),w.e,cy+.43,w.n,yaw,Math.PI/2);
      }
    }
    for(const side of [-1,1]){
      put(rustIron,0,1.92,side*1.16,5.7,1.8,.15);
      put(iron,0,2.87,side*1.16,5.9,.14,.22);
      put(rustIron,side*2.78,1.92,0,.15,1.8,2.45);
      for(const x of [-2.35,-1.17,0,1.17,2.35])put(iron,x,1.93,side*1.24,.12,1.8,.09);
      put(iron,side*3.03,.97,0,.4,.18,.36);
    }
    put(rustIron,0,1.10,0,5.55,.17,2.3);
    // Ore stays below the rim; no cone protruding through the hopper top.
    for(let i=0;i<7;i++){
      const p=at(-2.1+i*.70,0);
      part(ore,new DodecahedronGeometry(.62,0),p.e,cy+1.62+(i%3)*.15,p.n,yaw+i*.7);
    }
    colliders.push(orientedSupportBox(car.east,car.north,yaw,5.9,2.45,cy+.01,cy+2.94));
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
    const run=3.1,rise=1.22,pitch=Math.atan2(rise,run),slant=Math.hypot(run,rise);
    for(const side of [-1,1]){
      box(slate,sx,g+3.30+rise/2,sn+side*run/2,8.4,.17,slant,0,-side*pitch);
      box(snow,sx,g+3.44+rise/2,sn+side*run/2,8.15,.09,slant-.15,0,-side*pitch);
      box(timber,sx,g+3.29,sn+side*run,8.45,.20,.19);
      for(const dx of [-3.4,-1.7,0,1.7,3.4])box(timberWarm,sx+dx,g+3.19+rise/2,sn+side*run/2,.14,.16,slant,0,-side*pitch);
    }
    box(timber,sx,g+4.62,sn,8.48,.17,.27);
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
  const narrow = buildTrackway(corridorWorld, {
    gauge: .9, sleeperWidth: 1.7, ballastWidth: 2, railH: .13,
    flatten: [{ east: corridorWorld.at(-1)![0], north: corridorWorld.at(-1)![1], half: 6 }],
  });
  {
    // One ore skip standing by the ore yard, and the buffer stop at the smelter door.
    let skip = narrow.samples[0], best = Infinity;
    for (const s of narrow.samples) {
      const d = (s.east + 122.5) ** 2 + (s.north - 109.9) ** 2;
      if (d < best) { best = d; skip = s; }
    }
    const idx = narrow.samples.indexOf(skip);
    const next = narrow.samples[Math.min(idx + 1, narrow.samples.length - 1)];
    const yaw=Math.atan2(next.north-skip.north,next.east-skip.east);
    const at=(x:number,z:number)=>({e:skip.east+Math.cos(yaw)*x+Math.sin(yaw)*z,n:skip.north+Math.sin(yaw)*x-Math.cos(yaw)*z});
    const put=(mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number)=>{const p=at(x,z);box(mat,p.e,skip.y+y,p.n,w,h,d,yaw);};
    put(iron,0,.55,0,2.3,.18,1.22);
    for(const x of [-.78,.78]){
      const p=at(x,0);part(darkSteel,new CylinderGeometry(.07,.07,1.10,8),p.e,skip.y+.26,p.n,yaw,Math.PI/2);
      for(const z of [-.45,.45]){const w=at(x,z);part(darkSteel,new CylinderGeometry(.27,.27,.11,10),w.e,skip.y+.26,w.n,yaw,Math.PI/2);}
    }
    for(const s of [-1,1]){
      put(rustIron,0,.98,s*.62,2.2,.7,.12);
      put(iron,0,1.36,s*.62,2.35,.10,.16);
      put(rustIron,s*1.08,.98,0,.12,.7,1.35);
      for(const x of [-.7,0,.7])put(iron,x,.98,s*.68,.075,.7,.065);
    }
    put(rustIron,0,.70,0,2.1,.10,1.14);
    for(const x of [-.65,0,.65]){const p=at(x,0);part(ore,new DodecahedronGeometry(.36,0),p.e,skip.y+.91,p.n,yaw);}
    colliders.push(orientedSupportBox(skip.east,skip.north,yaw,2.3,1.36,skip.y,skip.y+1.41));
    // The ore skip is now parked beside its actual yard loading platform.
    // Terminal buffers are built below from the same track sample frame.
  }

  function bufferStop(samples:readonly Sample[],gauge:number){
    const end=samples.at(-1)!,prev=samples.at(-2)!;
    const yaw=Math.atan2(end.north-prev.north,end.east-prev.east);
    const at=(x:number,z:number)=>({east:end.east+Math.cos(yaw)*x+Math.sin(yaw)*z,north:end.north+Math.sin(yaw)*x-Math.cos(yaw)*z});
    const put=(mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number,roll=0)=>{
      const p=at(x,z);box(mat,p.east,end.y+y,p.north,w,h,d,yaw,0,roll);
    };
    for(const side of [-1,1]){
      const z=side*gauge/2;
      put(iron,-.22,.18,z,.18,1.08,.19);
      put(timber,-.75,.12,z,1.14,.20,.19,.69);
      put(iron,-.22,-.32,z,.36,.10,.36);
    }
    put(timber,-.22,.62,0,.28,.38,gauge+.66);
    put(iron,-.38,.62,0,.08,.28,gauge+.35);
    const p=at(-.22,0);
    colliders.push(orientedSupportBox(p.east,p.north,yaw,.31,gauge+.66,end.y-.36,end.y+.82));
  }
  // Static switch stand at the real turnout toe, outside the stock clearance.
  // No interaction is advertised until the common train authority owns it.
  {
    const toe=railSections(siding.samples)[0]!;
    const e=toe.east-toe.me*2.55,n=toe.north-toe.mn*2.55;
    const g=groundAt(e,n),yaw=Math.atan2(toe.mn,toe.me);
    box(stone,e,g+.13,n,.76,.36,.62,yaw);
    box(iron,e,g+.55,n,.15,.80,.15,yaw);
    box(iron,e,g+.96,n,.32,.16,.22,yaw);
    box(iron,e,g+1.16,n,.075,.66,.075,yaw,0,-.55);
    box(timberWarm,e-.17,g+1.44,n,.24,.12,.12,yaw);
    box(iron,e+toe.me*.52,g+.16,n+toe.mn*.52,1.02,.065,.065,yaw);
    colliders.push(orientedSupportBox(e,n,yaw,.76,.62,g-.05,g+1.50));
  }
  bufferStop(siding.samples,1.66);
  bufferStop(narrow.samples,.9);
  bufferStop([...narrow.samples].reverse(),.9);

  // True crossing decks use the same rail samples and register walk floors.
  const crossings=[
    ...buildRailCrossings(main.samples,mainPedestrianCrossings,1.66,2.9,g=>push(timberWarm,g),g=>push(stone,g),floors),
    ...buildRailCrossings(siding.samples,freightPedestrianCrossings,1.66,2.9,g=>push(timberWarm,g),g=>push(stone,g),floors),
    ...buildRailCrossings(narrow.samples,narrowPedestrianCrossings,.9,2,g=>push(timberWarm,g),g=>push(stone,g),floors),
  ];
  // The freight aisle now joins the real step at the edge of the grade
  // crossing. Export the visible support, rather than the former snow Y.
  const freightRoute=stationWalkRoutes.find(r=>r.id==='freight-shed');
  if(freightRoute){
    const entry=freightRoute.points[0]!;
    entry.height=Math.max(entry.height,...crossings.flatMap(c=>c.floors)
      .filter(f=>supportFootprintOverlaps(entry.east,entry.north,f,.27)).map(f=>f.max[1]));
  }

  // Industrial transfer platforms are actual mounted floors with stepped
  // approaches. They are not a second vehicle/event authority.
  function loadingDeck(e:number,n:number,w:number,d:number,rise:number){
    const g=groundAt(e,n),top=g+rise;
    const low=Math.min(...[-1,1].flatMap(s=>[-1,1].map(t=>groundAt(e+s*w/2,n+t*d/2))))-.08;
    box(stone,e,(low+top-.12)/2,n,w,top-.12-low,d);
    box(timberWarm,e,top-.06,n,w,.12,d);
    floors.push(orientedSupportBox(e,n,0,w,d,low,top));
    const count=Math.ceil(rise/.23),run=.67,edge=n-d/2;
    const points:{east:number;north:number;height:number}[]=[];
    for(let i=0;i<count;i++){
      const pn=edge-(count-i-.5)*run,h=g+rise*(i+1)/count,bottom=Math.min(h-.10,groundAt(e,pn)-.04);
      box(stone,e,(h+bottom)/2,pn,Math.min(1.65,w-.16),h-bottom,run+.01);
      floors.push(orientedSupportBox(e,pn,0,Math.min(1.65,w-.16),run+.01,bottom,h));
      points.push({east:e,north:pn,height:h});
    }
    points.push({east:e,north:n,height:top});
    return {g,top,points};
  }
  {
    // Freight-side transfer landing between the two physically separate
    // gauges. The gantry serves both tracks without crossing head clearance.
    const e=-55.3,n=171,w=2.2,d=5.0,deck=loadingDeck(e,n,w,d,.90),g=deck.g;
    for(const side of [-1,1]){
      const x=e+side*.82;
      box(timber,x,deck.top+1.78,n+1.55,.24,3.56,.27);
      colliders.push(orientedSupportBox(x,n+1.55,0,.24,.27,deck.top,deck.top+3.56));
      box(stone,x,deck.top+.12,n+1.55,.36,.24,.40);
      box(iron,x,deck.top+3.35,n+1.55,.38,.26,.36);
      box(timber,x+side*.43,deck.top+2.95,n+1.55,1.12,.18,.21,0,0,side*.74);
    }
    box(timber,e,deck.top+3.6,n+1.55,6.45,.28,.35);
    box(iron,e,deck.top+3.39,n+1.55,6.35,.10,.17);
    box(iron,e-2.05,deck.top+3.24,n+1.55,.44,.34,.38);
    box(iron,e-2.05,deck.top+2.53,n+1.55,.055,1.05,.055);
    part(iron,new TorusGeometry(.18,.05,6,10),e-2.05,deck.top+1.92,n+1.55,0);
    // A real north exit, replacing the old closed transverse rail.
    // Keep a central walking lane and place the rail posts at its sides.
    for(const x of [-.82,.82]){
      box(timber,e+x,deck.top+.55,n+2.25,.14,1.10,.14);
      colliders.push(orientedSupportBox(e+x,n+2.25,0,.14,.14,deck.top,deck.top+1.1));
      box(timberWarm,e+x,deck.top+1.02,n+1.92,.14,.14,.80);
      colliders.push(orientedSupportBox(e+x,n+1.92,0,.14,.80,deck.top+.95,deck.top+1.09));
    }
    const rear:{east:number;north:number;height:number}[]=[];
    const count=4,run=.67,edge=n+d/2;
    for(let i=0;i<count;i++){
      const pn=edge+(i+.5)*run,soil=groundAt(e,pn);
      const top=g+.90*(1-(i+1)/count),low=Math.min(top-.12,soil-.06);
      box(stone,e,(low+top)/2,pn,1.65,top-low,run+.008);
      floors.push(orientedSupportBox(e,pn,0,1.65,run+.008,low,top));
      rear.push({east:e,north:pn,height:top});
      if(i<count-1)for(const s of [-1,1]){
        box(timber,e+s*.75,top+.43,pn,.10,.86,.12);
        box(timberWarm,e+s*.75,top+.82,pn,.095,.12,run+.015,0,-Math.atan2(.225,run));
        colliders.push(orientedSupportBox(e+s*.75,pn,0,.12,run+.015,top,top+.94));
      }
    }
    const start=freightRoute?.points[0];
    if(start){
      const approach=[[-58.7,148],[-58.3,153],[-57.8,159],[-56.3,163],[-55.3,165.4]].map(([east,north])=>({east,north,height:groundAt(east,north)}));
      stationWalkRoutes.push({id:'transfer-dock',points:[{...start},...approach,...deck.points]});
      // Actual support heights, not the old ground-only survey. Start on
      // the same existing transfer approach and end at the original foot.
      const useFoot=road.inscription.layout.useFoot;
      const end=inscriptionAccessFootway.at(-1)!;
      const accessStart={east:-55.44285714285714,north:165.05714285714285,height:g};
      if(Math.hypot(useFoot.east-end[0],useFoot.north-end[1])<.015&&
         Math.abs(useFoot.height-groundAt(end[0],end[1]))<.02){
        stationWalkRoutes.push({id:'inscription-access',points:[
          accessStart,...deck.points,{east:e,north:173.18,height:deck.top},
          ...rear,...inscriptionAccessFootway.map(([east,north])=>({east,north,height:groundAt(east,north)}))
        ]});
      }
    }
  }
  {
    // Ore yard unloading dock: a real small platform on the south of the
    // narrow rail and adjacent to the parked ore skip.
    const e=-122.5,n=107.55,deck=loadingDeck(e,n,4.0,1.65,.60);
    for(const x of [-1.55,1.55]){
      box(timber,e+x,deck.top+.38,n,.62,.76,.76);
      colliders.push(orientedSupportBox(e+x,n,0,.62,.76,deck.top,deck.top+.76));
      for(const s of [-1,1])box(iron,e+x+s*.24,deck.top+.38,n,.07,.78,.78);
    }
    const mast=e+1.5;
    box(timber,mast,deck.top+1.5,n+.40,.18,3,.18);
    colliders.push(orientedSupportBox(mast,n+.4,0,.18,.18,deck.top,deck.top+3));
    box(timber,mast,deck.top+2.82,n+1.45,.23,.25,2.35);
    box(iron,mast,deck.top+2.18,n+2.35,.06,1.16,.06);
    part(iron,new TorusGeometry(.14,.04,5,10),mast,deck.top+1.55,n+2.35,0);
    const approach=[[-123,100],[-123.5,100.25],[-122.5,104.65]].map(([east,north])=>({east,north,height:groundAt(east,north)}));
    stationWalkRoutes.push({id:'ore-yard-dock',points:[...approach,...deck.points]});
  }

  // ---------- merge batches ----------
  mountAR30StaticBatches(group,batches,'crater-rail',320,20);

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
  return { group, alignment, samples: main.samples, narrowSamples: narrow.samples, sidingSamples:siding.samples,
    verticalSurvey,junctionAudit,serviceGeometryReady,closedHead,valleyRepair,valleyBridgeSpans,eastValleyRepair,eastValleyEnvelope,northRampEnvelope,eastValleyBridgeSpans,sidingMinRadius:siding.minRadius,railBearings,stringerSegments,crossings,stationWalkRoutes,benchSeats,shankouArrival,timetableReads };
}
