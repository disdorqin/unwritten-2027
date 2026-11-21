import {
  BoxGeometry, CanvasTexture, Color, DataTexture, Group, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, Object3D, PlaneGeometry, PointLight, SRGBColorSpace,
} from 'three';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type Road = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'lip' | 'heightAt'>;
type Loc = Readonly<{ east: number; north: number; height: number }>;
type BoxKind = 'foundation' | 'wall' | 'timber' | 'iron' | 'rust' | 'roof' | 'ash' | 'ochre' | 'ember';
type Area = 'perimeter' | 'fence' | 'tower' | 'supply' | 'assembly' | 'guard' | 'smelter' | 'instruments' | 'yard' | 'wreckage';
export type Za36OuterworksAction = 'registration' | 'map' | 'telescope' | 'firewood' | 'survey';
export type Za36OuterworksSpot = Readonly<Loc & {
  id: Za36OuterworksAction; label: string; range: number;
}>;
export type Za36CraterOuterworksSite = Readonly<Loc & {
  id: string; area: Area; footprint: readonly [number, number]; structureHeight: number;
}>;
const palette = {
  foundation: [0x777b7e, 0x4b535d, 0x958f7f],
  wall: [0x8a8378, 0x6f716f, 0x5d4630],
  timber: [0x5d4630, 0x8a4a34, 0x44503c],
  iron: [0x2c3648, 0x5d4630, 0x8a8378],
  rust: [0x8a4a34, 0x5d4630, 0xa98a56],
  roof: [0x44503c, 0x2c3648, 0x8a8378],
  ash: [0x2c3648, 0x5d4630, 0x8a4a34],
  ochre: [0xa98a56, 0x8a8378, 0x8a4a34],
  ember: [0xe08a3c, 0xa98a56, 0x8a4a34],
} as const satisfies Record<BoxKind, readonly [number, number, number]>;

function pixelMaterial(kind: BoxKind) {
  const [base, vein, chip] = palette[kind];
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const grain = (Math.imul(x + 3, 103) ^ Math.imul(z + 9, 47)) & 31;
    const band = (x * 3 + z * 7) % 19 === 0;
    const pigment = band || grain < 5 ? vein : grain > 27 ? chip : base;
    pixels.set([pigment >>> 16, pigment >>> 8 & 255, pigment & 255, 255],
      (z * 16 + x) * 4);
  }
  const map = new DataTexture(pixels, 16, 16);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = map.magFilter = NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 1, flatShading: true,
    emissive: kind === 'ember' ? new Color(0xe08a3c) : new Color(0),
    emissiveIntensity: kind === 'ember' ? .32 : 0 });
}
const geometry = new BoxGeometry();
const tex: Record<BoxKind, MeshStandardMaterial> = {
  foundation: pixelMaterial('foundation'), wall: pixelMaterial('wall'),
  timber: pixelMaterial('timber'), iron: pixelMaterial('iron'), rust: pixelMaterial('rust'),
  roof: pixelMaterial('roof'), ash: pixelMaterial('ash'), ochre: pixelMaterial('ochre'),
  ember: pixelMaterial('ember'),
};
function distanceToLine(east: number, north: number, a: {east:number; north:number},
  b: {east:number; north:number}) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const q = Math.max(0, Math.min(1, ((east-a.east)*dx+(north-a.north)*dn) / (dx*dx+dn*dn)));
  return Math.hypot(east - a.east - q*dx, north - a.north - q*dn);
}
function circleDistance(a: {east:number; north:number}, b: {east:number; north:number}) {
  return Math.hypot(a.east-b.east, a.north-b.north);
}
function signMap(text: string) {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#5d4630'; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#a98a56'; ctx.lineWidth = 8; ctx.strokeRect(7, 7, 242, 114);
  ctx.fillStyle = '#e8ecf0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 24px sans-serif';
  if (text === '坑区手绘图') {
    // No hidden lore: the publicly mapped three landmarks and one blank cell.
    ctx.strokeStyle = '#a98a56'; ctx.lineWidth=3;
    for (const r of [19,35,47]) {
      ctx.beginPath();ctx.ellipse(98,65,r,r*.66,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(157,65);ctx.lineTo(98,65);ctx.lineTo(86,78);ctx.stroke();
    ctx.font='15px sans-serif';ctx.fillText('井口',98,63);
    ctx.fillText('栈道',173,43);ctx.fillText('黑石带',177,81);
    ctx.strokeStyle='#a98a56';ctx.strokeRect(169,92,53,20); // blank survey cell
  } else {
    const rows = text.split(' · ');
    rows.forEach((row, i) => ctx.fillText(row, 128, 64 + (i - (rows.length-1)/2)*35, 240));
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = map.magFilter = NearestFilter;
  map.generateMipmaps = false;
  return map;
}

/**
 * ZA-36 revised outside industrial belt. Visual-only barrier parts do not
 * create any player colliders; ZB-28 guard authority remains separate.
 * There are intentionally zero objects in the B-01 accepted crater bowl.
 */
export function mountZa36CraterOuterworks(road: Road) {
  const group = new Group();
  group.name = 'za36-crater-outside-complex';
  const sites: Za36CraterOuterworksSite[] = [];
  const actions: Za36OuterworksSpot[] = [];
  const matrices = new Map<BoxKind, Object3D[]>();
  const wallParts: { east: number; north: number; width: number }[] = [];
  const fenceParts: { east: number; north: number; radius: number; gate: boolean }[] = [];
  const { east: cx, north: cn } = road.anchor;
  const mouth: Loc = { east: road.lip.east, north: road.lip.north, height: road.lip.height };
  const town = { east: 0, north: 159 };
  function ground(east: number, north: number): Loc {
    const height = road.heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) {
      throw new RangeError('ZA36 outerwork falls outside real west terrain: ' + east + ',' + north);
    }
    return { east, north, height };
  }
  function part(kind: BoxKind, east: number, north: number, bottom: number,
    width: number, tall: number, depth: number, yaw = 0, tilt = 0) {
    if (!(width > 0 && tall > 0 && depth > 0)) throw new RangeError('invalid crate dimension');
    const at = ground(east,north);
    const transform = new Object3D();
    transform.position.set(east, at.height + bottom + tall/2, -north);
    transform.rotation.set(0, yaw, tilt, 'YZX');
    transform.scale.set(width,tall,depth);
    transform.updateMatrix();
    const found = matrices.get(kind) ?? [];
    found.push(transform);
    matrices.set(kind,found);
  }
  function buildingSite(id: string,area: Area,east: number,north: number,
    width: number,depth: number,tall: number) {
    const place = { ...ground(east,north), id, area,
      footprint: [width,depth] as const,structureHeight: tall };
    sites.push(place);
    return place;
  }
  function addAction(id: Za36OuterworksAction, label: string, east: number, north: number, range=2.1) {
    actions.push({ ...ground(east,north), id,label,range });
  }
  function board(text: string, east:number,north:number,base:number) {
    part('timber',east,north,base,.15,1.05,2.9);
    const map=signMap(text);
    const mesh = new Mesh(new PlaneGeometry(2.65,.85),
      new MeshBasicMaterial(map?{map,transparent:false}:{color:0x5d4630}));
    mesh.name = 'za36-written-sign';
    mesh.userData.publicText = text;
    const at=ground(east,north);
    mesh.position.set(east + .09,at.height+base+.57,-north);
    mesh.rotation.y=Math.PI/2;
    group.add(mesh);
  }

  // ROUND 1 · massive silhouette and physical entrances.
  // A 310 m high wall cuts across the approach valley east of the 110 m pit.
  // Only the broad 11 m gate at the actual E0 approach remains open.
  const gateN = 159, gateHalf = 5.6;
  for (let north=26;north<336;north+=4) {
    const middle = north+2;
    if (Math.abs(middle-gateN)<gateHalf+2.5) continue;
    // Keep the intact masonry continuous; displaced rubble, not the wall,
    // gives way at the eastbound impact ray crossing.
    const wallEast=-11.8;
    part('foundation',wallEast,middle,0,1.45,1.25,4.03);
    part('wall',wallEast,middle,1.25,1.05,4.25,3.96);
    if (north%20===6) part('rust',wallEast-.62,middle,1.7,.07,3.1,.33);
    wallParts.push({east:wallEast,north:middle,width:4});
  }
  sites.push({ ...ground(-11.8,159),id:'town-outer-wall-gate',area:'perimeter',
    footprint:[11.2,11.2],structureHeight:5.5});
  for(const side of [-1,1]) {
    const n=159 + side*6.2;
    part('foundation',-11.8,n,0,2,1.2,2.0);
    part('timber',-11.8,n,1.2,1.1,5.8,1.1);
    part('rust',-11.8,n,6.65,1.6,.22,1.6);
  }
  part('timber',-11.8,159,7.15,1.8,.48,13.35); // visible lintel: open below
  board('',-12.7,172,1.1); // outer-wall warning copy is pending 总控 approval

  // Mid-layer 4.8m fence on r 82, two broken stretches and one 12m gate
  // aligned with the certified mouth. Old timber alternates with newer iron.
  const fenceRadius = 82;
  const crossingEast = cx+Math.sqrt(fenceRadius*fenceRadius-(town.north-cn)**2);
  const gateAngle = Math.atan2(town.north-cn,crossingEast-cx);
  const excluded = [gateAngle, 2.34, -2.62];
  for(let i=0;i<124;i++) {
    const a = -Math.PI+Math.PI*2*(i+.5)/124;
    const delta = (b:number) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
    const gate = Math.abs(delta(excluded[0]!))<.095;
    const broken = excluded.slice(1).some(t=>Math.abs(delta(t))<.06);
    if(gate||broken) continue;
    const e = cx + fenceRadius*Math.cos(a),n=cn+fenceRadius*Math.sin(a);
    if(e<-235 || e>-.2 || n<6 || n>520) continue;
    if(distanceToLine(e,n,mouth,town)<7.0) continue;
    if([[ -104,270 ],[ -206,199 ]].some(([te,tn])=>Math.hypot(e-te,n-tn)<5.6))continue;
    const timber = i%7===0 || i%7===1;
    part(timber?'timber':'iron',e,n,0,.27,4.8,.27);
    if(i%7!==0) {
      part(timber?'timber':'rust',e,n,1.10,.1,.12,3.8,a);
      part(timber?'timber':'iron',e,n,3.80,.13,.14,3.8,a);
    }
    fenceParts.push({east:e,north:n,radius:.42,gate:false});
  }
  const gateE = cx+fenceRadius*Math.cos(gateAngle), gateNorth=cn+fenceRadius*Math.sin(gateAngle);
  sites.push({...ground(gateE,gateNorth),id:'sealed-fence-gate',area:'fence',
    footprint:[12,6],structureHeight:4.8});
  for(const side of [-1,1]){
    const a=gateAngle+side*.115,e=cx+fenceRadius*Math.cos(a),n=cn+fenceRadius*Math.sin(a);
    part('rust',e,n,0,.55,5,.55);
    part('iron',e,n,4.92,.9,.15,.9);
  }

  function watchTower(id:string,e:number,n:number,alive:boolean,tilted:boolean) {
    const h=alive?14.6:13.3;
    buildingSite(id,'tower',e,n,5.4,5.4,h);
    part('foundation',e,n,0,6.0,.85,6);
    for(const x of [-2.15,2.15])for(const z of [-2.15,2.15]) {
      part(alive?'timber':'rust',e+x,n+z,.85,.45,h-1.25,.45,0,tilted?.035:0);
    }
    part('foundation',e,n,h-.5,6.2,.55,6.2,0,tilted?.03:0);
    for(let i=0;i<13;i++){
      part('iron',e-1.55,n-1.85,1.15+i*.83,.2,.11,1.4);
    }
    for(const side of [-1,1]) {
      part('timber',e+side*2.6,n,h+.05,.18,1.04,5.9);
      part('timber',e,n+side*2.6,h+.05,5.9,1.04,.18);
    }
    // A 5m cabin, pierced door, old repair scars and flag.
    for(const side of [-1,1]) {
      part('wall',e+side*2.38,n,h+.55,.26,1.9,4.3);
      part('wall',e,n+side*2.38,h+.55,4.25,1.9,.26);
    }
    part('roof',e,n,h+2.42,5.35,.28,5.35,0,tilted?.065:0);
    if(alive){
      const lamp=new PointLight(new Color('#e08a3c'),.72,18,2);
      lamp.position.set(e,ground(e,n).height+h+3.0,-n);
      lamp.name='za36-north-watch-night-lamp';
      group.add(lamp);
    }
  }
  watchTower('ancient-gate-tower',-24,180,false,false);
  watchTower('north-watch-tower',-104,270,true,false);
  watchTower('fallen-west-tower',-206,199,false,true);

  // The small central supply house remains the eye-catcher; the much larger
  // factories sit on a more distant arc and never replace the crater horizon.
  const supply=buildingSite('core-supply-station','supply',-24,136,10.8,8.6,7.9);
  part('foundation',supply.east,supply.north,0,11.8,.64,9.6);
  // Solid west rear, framed north/south sides, east doorway genuinely open.
  part('timber',supply.east-5.25,supply.north,.64,.38,4.3,8.1);
  for(const side of [-1,1]) {
    part('wall',supply.east,supply.north+side*4.15,.64,10.2,4.1,.34);
  }
  // Break the town-facing wall into two structural piers, preserving the
  // actual 2.4m doorway and a 3m sightline into the furnished ground floor.
  for(const offset of [-3.45,3.45]) {
    part('timber',supply.east+5.2,supply.north+offset,.64,.36,4.05,2.58);
    part('iron',supply.east+5.41,supply.north+offset,1.9,.035,1.37,1.45);
    part('ember',supply.east+5.45,supply.north+offset,2.01,.032,1.1,1.12);
    for (const mullion of [-.48,.48])
      part('timber',supply.east+5.46,supply.north+offset+mullion,1.89,.05,1.4,.07);
  }
  part('timber',supply.east+5.2,supply.north,3.56,.32,1.0,2.5);
  for(const side of [-1,1]) {
    part('roof',supply.east+side*2.65,supply.north,5.23,6.15,.38,10.0,0,side*.23);
    part('iron',supply.east+side*5.1,supply.north,4.16,.13,.28,9.4);
    for (let shingle=0;shingle<7;shingle++) {
      part(shingle%3?'roof':'rust',supply.east+side*2.45,
        supply.north-4.2+shingle*1.4,5.48,5.8,.055,.15,0,side*.23);
    }
  }
  // Roof viewing deck, guardrails and telescope; access geometry shown,
  // real step/collision acceptance remains a separate required test.
  part('timber',supply.east-2.9,supply.north,5.75,4.25,.23,5.0);
  for(const z of [-2.25,2.25])
    part('timber',supply.east-2.9,supply.north+z,5.85,4.3,.24,.15);
  part('iron',supply.east-2.9,supply.north,6.04,.18,1.05,.18);
  part('ochre',supply.east-2.9,supply.north,7.05,.45,.32,.9,-.6);
  // First-round furnished interior: shelves, two rows of rope, lamps, rations.
  part('timber',supply.east-3.4,supply.north,1.0,1.2,2.35,6.2);
  for(const z of [-2.2,-.4,1.5])
    part('ochre',supply.east-3.3,supply.north+z,1.30,1.05,.4,1.0);
  part('timber',supply.east+.3,supply.north-.6,.66,1.2,1.1,3.6);
  for(let i=0;i<7;i++)
    part(i%3===0?'rust':'ochre',supply.east-3.0,supply.north-2.1+i*.58,3.2,.47,.35,.42);
  board('坑区手绘图',supply.east-4.65,supply.north+2.8,1.7);
  const supplyLamp=new PointLight(0xe08a3c,.8,13,2);
  supplyLamp.name='za36-supply-night-window';
  supplyLamp.position.set(supply.east,supply.height+2.6,-supply.north);
  group.add(supplyLamp);
  addAction('map','查看坑区手绘图',supply.east+1.9,supply.north+1.4);
  addAction('telescope','使用望筒观坑',supply.east-2.9,supply.north-1.1,2.6);

  const assembly=buildingSite('crater-assembly-ground','assembly',-25,110,18,18,8.3);
  // 2 flagpoles, 6 sled parking rails, 3 stacked-supply groups, 1 notice
  for(const east of [assembly.east-6,assembly.east+6]){
    part('timber',east,assembly.north+4.5,0,.23,8.3,.23);
    part('ochre',east+.65,assembly.north+4.5,7.2,1.15,.06,.62);
  }
  for(let i=0;i<6;i++){
    const e=assembly.east-6.8+i*2.7;
    part('timber',e,assembly.north-3.5,0,.15,1.45,.15);
    part('timber',e,assembly.north-1.5,.4,.19,.15,4.3);
  }
  for(let i=0;i<3;i++)for(let j=0;j<4;j++){
    part(j%3===0?'rust':'timber',assembly.east-6+i*5,assembly.north+5.0+j*.84,
      0,1.12,1.01,.75);
  }
  board('入坑登记 · 天黑前出坑',assembly.east+6.8,assembly.north+3.3,.85);
  addAction('registration','阅读入坑告示',assembly.east+6.8,assembly.north+3.2);

  const guard=buildingSite('north-watch-shelter','guard',-102,260,7.4,5.6,4.5);
  part('foundation',guard.east,guard.north,0,7.7,.6,5.8);
  for(let i=0;i<4;i++){
    const x=guard.east+(i%2?3.35:-3.35),n=guard.north+(i>1?2.5:-2.5);
    part('timber',x,n,.6,.35,3.9,.35);
  }
  part('roof',guard.east,guard.north,4.25,8.2,.29,6.0);
  part('iron',guard.east+1.8,guard.north,1.2,1.45,.55,1.6);
  const fire=new PointLight(0xe08a3c,.34,12,2);
  fire.name='za36-empty-north-shelter-night-brazier';
  fire.position.set(guard.east+1.8,guard.height+1.1,-guard.north);
  group.add(fire);
  part('ochre',guard.east-2,guard.north,1.05,.4,.18,.4); // tea cup
  board('夜里不入',guard.east-3.15,guard.north-2.2,1.1);
  addAction('firewood','给哨棚火盆添柴',guard.east+1.0,guard.north-1.1);
  addAction('survey','查看北塔测绘位',-104,267,2.8);

  function factory(id:string,e:number,n:number,w:number,d:number,h:number,chimneyH:number) {
    const isFurnace=id==='abandoned-smeltery';
    buildingSite(id,isFurnace?'smelter':'instruments',e,n,w,d,h);
    part('foundation',e,n,0,w+1,.75,d+1);
    for(const side of [-1,1]){
      part('wall',e,n+side*(d/2-.35),.75,w,h-.75,.7);
      // Short walls split around a real 4m freight doorway.
      for(const z of [-1,1])
        part('wall',e+side*(w/2-.35),n+z*(d/4+1.0),.75,.7,h-.75,d/2-2.2);
      part('timber',e+side*w/3,n,.75,.26,h-.35,d);
    }
    part('roof',e,n,h,w+1.8,.38,d+1.4);
    for(let i=0;i<Math.round(w/3);i++)
      part('rust',e-w/2+1.6+i*3,n-d/2-.15,h-2.65,1.4,1.05,.11);
    part('rust',e-w/2+4,n+d/2-.85,.75,2.1,chimneyH,2.1);
    for(let i=0;i<(isFurnace?9:7);i++){
      const x=e-w/2+3+i*2.7;
      part(i%2?'rust':'iron',x,n+2.1,.75,.95,.7,2.15);
    }
    if(!isFurnace){
      // A real second level, separately observable through an open side.
      part('timber',e,n,4.35,w-1,.22,d-.9);
      part('iron',e+w/2+2,n-d/3,0,2.3,9.2,2.3); // water tower
      for(const side of [-1,1])
        part('timber',e+w/2+2+side*.84,n-d/3,0,.17,5.0,.17);
    } else {
      // Separate ten-metre furnace tower and a cold, unused smelting mouth.
      part('rust',e-w/2-4,n+2.6,0,4.1,10.6,4.1);
      part('ash',e-w/2-1.9,n+2.6,1.55,.07,2.05,1.85);
    }
  }
  factory('abandoned-smeltery',-61,76,28,17,8.8,10.4);
  factory('instrument-workshop',-133,75,21,15,8.3,16.8);
  const yard=buildingSite('cold-material-stockyard','yard',-100,54,35,15,3.7);
  for(let i=0;i<20;i++){
    const e=yard.east-17+(i%10)*3.8,n=yard.north-4+Math.floor(i/10)*6.3;
    part(i%4?'iron':'ash',e,n,0,1.5,.8+(i%3)*.24,1.35);
  }

  // Exterior wreckage forms a sparse 60–105m ring, never the bowl / shaft.
  // Its irregular slabs differ materially from the large black stone ejecta.
  for(let i=0;i<46;i++){
    const theta=(i*.61803398875%1)*Math.PI*2;
    const radius=59+(i%7)*6.2;
    const e=cx+radius*Math.cos(theta),n=cn+radius*Math.sin(theta);
    if(e<-232||e>-.8||n<9||n>515)continue;
    if(distanceToLine(e,n,mouth,town)<8)continue;
    const h=ground(e,n);
    if(circleDistance(h,road.anchor)<56.5) continue;
    const size=1.15+i%4*.56;
    part(i%5?'rust':'iron',e,n,-.22,size,.72+i%3*.36,size*.45,theta);
  }

  for(const [kind,transforms] of matrices){
    const mesh=new InstancedMesh(geometry,tex[kind],transforms.length);
    mesh.name='za36-outerworks-'+kind;
    transforms.forEach((transform,i)=>mesh.setMatrixAt(i,transform.matrix));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  let warmed=false,night=true;
  const northLight=group.getObjectByName('za36-north-watch-night-lamp') as PointLight;
  function applyLighting(){
    supplyLamp.intensity=night?.8:0;
    fire.intensity=night?(warmed?1.25:.34):0;
    northLight.intensity=night?.72:0;
  }
  function setNight(value:boolean){night=!!value;applyLighting();}
  const firewood = () => {
    warmed=!warmed;
    applyLighting();
    return warmed;
  };
  applyLighting();
  // Collision is strictly registered for the visible 5.5m outer stone wall.
  // The iron fence remains permeable through its physical gaps by canon;
  // guards, not invisible walls, decide whether a visitor can continue.
  function wallBlocks(east:number,north:number,feet:number,radius:number) {
    if(![east,north,feet,radius].every(Number.isFinite) || radius<0) return false;
    if(Math.abs(east+11.8)>1.05+radius || north<23-radius || north>339+radius)return false;
    return wallParts.some(w=>{
      if(Math.abs(east-w.east)>.75+radius || Math.abs(north-w.north)>w.width/2+radius)return false;
      const surface=road.heightAt(w.east,w.north);
      return surface!==undefined && feet<surface+5.5 && feet+1.5>surface;
    });
  }
  function actionAt(east:number,north:number,height:number) {
    let nearest:Za36OuterworksSpot|undefined, best=Infinity;
    for(const spot of actions){
      const horizontal=Math.hypot(east-spot.east,north-spot.north);
      if(horizontal>spot.range || Math.abs(height-spot.height)>3.3 || horizontal>=best)continue;
      best=horizontal;nearest=spot;
    }
    return nearest;
  }
  return {
    group,sites,actions,wallParts,fenceParts,gate:{east:-11.8,north:159,halfWidth:gateHalf},
    fenceGate:{east:gateE,north:gateNorth},
    pointLights:[supplyLamp,fire,northLight],
    actionAt,wallBlocks,firewood,setNight,isFireFed:()=>warmed,
    statistics:()=>({
      instances:[...matrices.entries()].reduce((total,[,items])=>total+items.length,0),
      batches:matrices.size,signs:group.children.filter(node=>node.name==='za36-written-sign').length,
      towers:sites.filter(site=>site.area==='tower').length,
    }),
  };
}
