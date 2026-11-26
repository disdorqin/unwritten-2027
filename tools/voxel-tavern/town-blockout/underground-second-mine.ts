import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,InstancedMesh,Mesh,MeshStandardMaterial,Matrix4,Quaternion,Vector3,PointLight,DataTexture,RGBAFormat,NearestFilter} from 'three';
import {secondMineRooms,secondMineRoomAt,secondMineBed,secondMineAnchors,canStandSecondMine,secondMineFloor,type MineRiverState} from '../../../src/shared/underground-second-mine-layout.js';
import {dressSecondMineDryWings} from './underground-second-mine-dry-dressing.js';
import {c2R30DeepMouths} from './town-c2-r30-deep-mouths.js';
import {buildTownC2R30Enclosure,c2R30EnclosureRooms} from './town-c2-r30-enclosure.js';
import {buildTownC2R30WaterworksTrace} from './town-c2-r30-waterworks-trace.js';
import {mountTownC2R30Ferry} from './town-c2-r30-ferry.js';
import {mountTownC2R30RiverTerrace} from './town-c2-r30-river-terrace.js';
import {mountTownC2PumpHouseAdapter,type C2PumpHouseAdapterHost} from './town-c2-r30-pump-house-adapter.js';
import type {AcceptedWaterReader} from '../../../src/shared/town-c-water-snapshot-port.js';
import {createStaticFootIndex,type StaticBox} from './town-c-static-foot-index.js';
type Part={x:number;n:number;y:number;w:number;d:number;h:number;rz:number};
type Solid=Readonly<{x:number;n:number;y:number;w:number;d:number;h:number}>;
export type LiftApertureRect=Readonly<{minE:number;maxE:number;minN:number;maxN:number}>;
export type SecondMineLiftApertureSite=Readonly<{lower:LiftApertureRect;height:number;ceiling:number}>;
export type SecondMineLiftAperturePort=Readonly<{site:SecondMineLiftApertureSite;split:(rect:LiftApertureRect,hole:LiftApertureRect)=>readonly LiftApertureRect[];readOpen:()=>boolean}>;
export type SecondMineSceneOptions=Readonly<{
  liftAperture?:SecondMineLiftAperturePort;
  r30Enclosure?:boolean;
  r30Waterworks?:boolean;
  r30Ferry?:boolean;
  r30RiverTerrace?:boolean;
  pumpHouse?:Readonly<{readAcceptedWater:AcceptedWaterReader;host?:C2PumpHouseAdapterHost}>;
}>;
type EntryRoom=Readonly<{x0:number;x1:number;n0:number;n1:number;ceiling:number}>;
const colors={rock:0x555b62,basalt:0x353b44,iron:0x777b82,rust:0x815b44,wood:0x71553c,crystal:0x82c5d6,ember:0xe5a05a,gravel:0x66645d} as const;
type Kind=keyof typeof colors;
function isApertureRect(value:unknown):value is LiftApertureRect{
  if(!value||typeof value!=='object')return false;
  const r=value as Partial<LiftApertureRect>;
  return typeof r.minE==='number'&&typeof r.maxE==='number'&&typeof r.minN==='number'&&typeof r.maxN==='number'&&
    [r.minE,r.maxE,r.minN,r.maxN].every(Number.isFinite)&&r.minE<r.maxE&&r.minN<r.maxN;
}
function rectArea(r:LiftApertureRect){return (r.maxE-r.minE)*(r.maxN-r.minN);}
function rectsOverlap(a:LiftApertureRect,b:LiftApertureRect){
  return Math.min(a.maxE,b.maxE)>Math.max(a.minE,b.minE)&&Math.min(a.maxN,b.maxN)>Math.max(a.minN,b.minN);
}
const exitWall={north:198,depth:.68,halfWidth:1.7,lintelBottom:3.24,ceiling:5} as const;
const geometryEpsilon=1e-9;
type WallBox=Readonly<{x:number;n:number;y:number;w:number;d:number;h:number}>;
function sameBox(a:WallBox,b:WallBox){
  return [a.x,a.n,a.y,a.w,a.d,a.h].every((value,i)=>Math.abs(value-[b.x,b.n,b.y,b.w,b.d,b.h][i])<=geometryEpsilon);
}
/** Exact union coverage, so touching masonry rows cannot hide a gap. */
function coversWallRange(boxes:readonly WallBox[],minE:number,maxE:number,minY:number,maxY:number){
  const covering=boxes.filter(b=>Math.abs(b.n-exitWall.north)<=geometryEpsilon&&Math.abs(b.d-exitWall.depth)<=geometryEpsilon&&
    b.x+b.w/2>minE+geometryEpsilon&&b.x-b.w/2<maxE-geometryEpsilon&&b.y+b.h/2>minY+geometryEpsilon&&b.y-b.h/2<maxY-geometryEpsilon);
  const edges=[...new Set([minE,maxE,...covering.flatMap(b=>[Math.max(minE,b.x-b.w/2),Math.min(maxE,b.x+b.w/2)])])].sort((a,b)=>a-b);
  for(let i=1;i<edges.length;i++){
    const left=edges[i-1],right=edges[i];if(right-left<=geometryEpsilon)continue;
    const mid=(left+right)/2,spans=covering.filter(b=>b.x-b.w/2<mid&&b.x+b.w/2>mid)
      .map(b=>({minY:Math.max(minY,b.y-b.h/2),maxY:Math.min(maxY,b.y+b.h/2)})).filter(s=>s.maxY>s.minY).sort((a,b)=>a.minY-b.minY);
    let cursor=minY;
    for(const span of spans){if(span.minY>cursor+geometryEpsilon)return false;cursor=Math.max(cursor,span.maxY);if(cursor>=maxY-geometryEpsilon)break;}
    if(cursor<maxY-geometryEpsilon)return false;
  }
  return edges.length>1;
}
function blocksDoorway(boxes:readonly WallBox[]){
  const minN=exitWall.north-exitWall.depth/2,maxN=exitWall.north+exitWall.depth/2;
  return boxes.some(b=>b.n+b.d/2>minN+geometryEpsilon&&b.n-b.d/2<maxN-geometryEpsilon&&b.x+b.w/2>-exitWall.halfWidth+geometryEpsilon&&
    b.x-b.w/2<exitWall.halfWidth-geometryEpsilon&&b.y-b.h/2<exitWall.lintelBottom-geometryEpsilon&&b.y+b.h/2>geometryEpsilon);
}
function matchesExitMouth(value:unknown){
  if(!value||typeof value!=='object')return false;
  const expected=c2R30DeepMouths['minus140-to-minus165'].from,mouth=value as Record<string,unknown>;
  return mouth.layer===expected.layer&&mouth.axis===expected.axis&&mouth.at===expected.at&&mouth.centre===expected.centre&&
    mouth.width===expected.width&&mouth.height===expected.height;
}
/** Validate the host split as an exact, non-overlapping roof-minus-hole partition. */
function prepareLiftAperture(port:SecondMineLiftAperturePort|undefined,entry:EntryRoom|undefined){
  if(!port||!entry||typeof port.split!=='function'||typeof port.readOpen!=='function')return null;
  const site=port.site as Partial<SecondMineLiftApertureSite>|undefined;
  if(!site||!isApertureRect(site.lower)||typeof site.height!=='number'||!Number.isFinite(site.height)||site.height!==0||
    typeof site.ceiling!=='number'||!Number.isFinite(site.ceiling)||site.ceiling!==entry.ceiling)return null;
  const lower=site.lower;
  if(lower.minE<entry.x0||lower.maxE>entry.x1||lower.minN<entry.n0||lower.maxN>entry.n1)return null;
  const rect:LiftApertureRect={minE:entry.x0,maxE:entry.x1,minN:entry.n0,maxN:entry.n1};
  let candidate:unknown;
  try{candidate=port.split({...rect},{...lower});}catch{return null;}
  if(!Array.isArray(candidate)||candidate.length<1||candidate.length>4)return null;
  const pieces:LiftApertureRect[]=[];
  for(const value of candidate){
    if(!isApertureRect(value))return null;
    const p={...value};
    if(p.minE<rect.minE||p.maxE>rect.maxE||p.minN<rect.minN||p.maxN>rect.maxN||rectsOverlap(p,lower))return null;
    if(pieces.some(other=>rectsOverlap(p,other)))return null;
    pieces.push(p);
  }
  const expected=rectArea(rect)-rectArea(lower),actual=pieces.reduce((sum,p)=>sum+rectArea(p),0);
  if(Math.abs(actual-expected)>1e-9*Math.max(1,expected))return null;
  return {site:Object.freeze({lower:Object.freeze({...lower}),height:site.height,ceiling:site.ceiling}),
    hole:Object.freeze({...lower}),pieces:Object.freeze(pieces.map(p=>Object.freeze({...p}))),readOpen:()=>port.readOpen()};
}
/** Physical local scene; the existing underground host must approve its placement and water state. */
export function createSecondMineScene(options:SecondMineSceneOptions={}){
  const group=new Group();group.name='second-mine-local-candidate';
  const parts=new Map<Kind,Part[]>(),solids:Solid[]=[],exitWallParts:Part[]=[];
  let disposed=false;
  const meshGeometry=new BoxGeometry();
  const material=new Map<Kind,MeshStandardMaterial>();
  const textures:DataTexture[]=[];
  for(const [k,color] of Object.entries(colors) as [Kind,number][]){
    const bytes=new Uint8Array(16*16*4);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const i=(y*16+x)*4, shade=((x*19+y*31+(x*y)%17)%19-9)*1.5;
      for(let c=0;c<3;c++)bytes[i+c]=Math.max(0,Math.min(255,((color>>(16-c*8))&255)+shade));
      bytes[i+3]=255;
    }
    const t=new DataTexture(bytes,16,16,RGBAFormat);t.magFilter=NearestFilter;t.minFilter=NearestFilter;t.needsUpdate=true;textures.push(t);
    material.set(k,new MeshStandardMaterial({map:t,roughness:k==='iron'?.65:.94,metalness:k==='iron'?.45:0,...(k==='crystal'?{emissive:0x216070,emissiveIntensity:.8}:k==='ember'?{emissive:0xc57837,emissiveIntensity:1.4}:{})}));
  }
  const entryRoom=secondMineRooms.find(r=>r.id==='entry'&&r.n0===0&&r.n1===24);
  const exitRoom=secondMineRooms.find(r=>r.id==='exit'&&r.n0===182&&r.n1===198);
  const entryRoofRect:LiftApertureRect|undefined=entryRoom&&{minE:entryRoom.x0,maxE:entryRoom.x1,minN:entryRoom.n0,maxN:entryRoom.n1};
  const lift=prepareLiftAperture(options?.liftAperture,entryRoom);
  const entryRoofPieces:readonly LiftApertureRect[]=lift?.pieces??(entryRoofRect?[entryRoofRect]:[]);
  const enclosure=options.r30Enclosure===false?undefined:buildTownC2R30Enclosure({
    entryRoofPieces,entryRoofOpening:lift?.hole,
  });
  if(enclosure){
    group.add(enclosure.group);
    for(const part of enclosure.boxes)solids.push({x:part.x,n:part.n,y:part.y,w:part.w,d:part.d,h:part.h});
  }
  const waterworks=options.r30Waterworks===false?undefined:buildTownC2R30WaterworksTrace(group);
  if(waterworks)for(const collider of waterworks.colliders){
    const box=collider.box;
    solids.push({x:box.x,n:box.n,y:box.y+box.h/2,w:box.w,d:box.d,h:box.h});
  }
  const riverTerrace=options.r30RiverTerrace===false?undefined:mountTownC2R30RiverTerrace({
    parent:group,site:{domainId:'underground/mine-2',east:0,north:0,height:0,yaw:0},supportsSite:()=>true,
  });
  if(riverTerrace)for(const box of riverTerrace.colliders){
    solids.push({x:(box.min[0]+box.max[0])/2,n:-(box.min[2]+box.max[2])/2,y:(box.min[1]+box.max[1])/2,
      w:box.max[0]-box.min[0],d:box.max[2]-box.min[2],h:box.max[1]-box.min[1]});
  }
  let liftPlate:Mesh|null=null,liftOpen=false;
  if(lift){
    liftPlate=new Mesh(meshGeometry,material.get('iron'));liftPlate.name='second-mine-lift-closure';
    liftPlate.position.set((lift.hole.minE+lift.hole.maxE)/2,entryRoom!.ceiling+.12,-(lift.hole.minN+lift.hole.maxN)/2);
    liftPlate.scale.set(lift.hole.maxE-lift.hole.minE,.24,lift.hole.maxN-lift.hole.minN);group.add(liftPlate);
  }
  function box(k:Kind,x:number,n:number,y:number,w:number,d:number,h:number,rz=0,solid=false){
    const b={x,n,y,w,d,h,rz};const list=parts.get(k)??[];list.push(b);parts.set(k,list);
    if(solid)solids.push({x,n,y,w,d,h});
  }
  function exitWallBox(k:Kind,x:number,y:number,w:number,h:number){
    box(k,x,exitWall.north,y,w,exitWall.depth,h,0,true);
    exitWallParts.push(parts.get(k)![parts.get(k)!.length-1]);
  }
  const riverGeometries:BufferGeometry[]=[];
  // Rock chambers share exact floor and wall footprints with the passage query.
  const enclosedRoomIds=new Set(c2R30EnclosureRooms.map(room=>room.id));
  for(const r of secondMineRooms){
    if(enclosure&&enclosedRoomIds.has(r.id))continue;
    const w=r.x1-r.x0,d=r.n1-r.n0;
    if(!r.river)box('rock',(r.x0+r.x1)/2,(r.n0+r.n1)/2,-.4,w,d,.8);
    if(r===entryRoom){
      for(const p of entryRoofPieces)box('basalt',(p.minE+p.maxE)/2,(p.minN+p.maxN)/2,r.ceiling+.5,p.maxE-p.minE,p.maxN-p.minN,1);
    }else{
      box('basalt',(r.x0+r.x1)/2,(r.n0+r.n1)/2,r.ceiling+.5,w,d,1);
    }
    for(const side of [-1,1]){
      const x=side===-1?r.x0:r.x1,n=side===-1?r.n0:r.n1;
      for(let p=r.n0;p<r.n1;p+=2){
        const len=Math.min(2,r.n1-p),mid=p+len/2;
        if(secondMineRoomAt(x+side*.05,mid))continue;
        for(let y=0;y<r.ceiling;y+=1.4)box((Math.round(p+y)%3===0?'rock':'basalt'),x+side*.34,mid,y+.7,.68,len,1.4);
      }
      if(r===exitRoom&&side===1){
        // C-R04's receiving mouth is on the N198 boundary. Replace only this
        // wall: two full-height jambs and a lintel with an exact 3.4 x 3.24 hole.
        for(const [minE,maxE] of [[r.x0,-exitWall.halfWidth],[exitWall.halfWidth,r.x1]] as const){
          for(let y=0;y<exitWall.lintelBottom;y+=1.08){
            const h=Math.min(1.08,exitWall.lintelBottom-y);
            for(let e=minE;e<maxE;e+=2){
              const w=Math.min(2,maxE-e),x=e+w/2;
              exitWallBox(Math.round(e+y)%3===0?'rock':'basalt',x,y+h/2,w,h);
            }
          }
        }
        exitWallBox('basalt',0,(exitWall.lintelBottom+exitWall.ceiling)/2,exitWall.halfWidth*2,exitWall.ceiling-exitWall.lintelBottom);
      }else for(let p=r.x0;p<r.x1;p+=2){
        const len=Math.min(2,r.x1-p),mid=p+len/2;
        if(secondMineRoomAt(mid,n+side*.05))continue;
        for(let y=0;y<r.ceiling;y+=1.4)box((Math.round(p+y)%3===0?'rock':'basalt'),mid,n+side*.34,y+.7,len,.68,1.4);
      }
    }
  }
  // Actual sloped exposed riverbed at low water, not a separate floating floor.
  for(const [a,b] of [[128,132],[132,142],[142,146]]){
    const g=new BufferGeometry(),y1=secondMineBed(a),y2=secondMineBed(b);
    g.setAttribute('position',new Float32BufferAttribute([-48,y1,-a,48,y1,-a,48,y2,-b,-48,y1,-a,48,y2,-b,-48,y2,-b],3));g.computeVertexNormals();
    group.add(new Mesh(g,material.get('gravel')));riverGeometries.push(g);
  }
  // Iron galleries: old mine rail stops at the entry; no track through the river.
  for(let n=4;n<24;n+=1.2){box('wood',0,n,.06,3.4,.28,.12);for(const x of [-1.15,1.15])box('iron',x,n,.15,.14,1.2,.12);}
  for(let n=6;n<=92;n+=6){
    const x=n<24?5.45:3.45, h=n<24?4.6:4.1;
    for(const s of [-1,1]){
      box('iron',s*x,n,h/2,.27,.34,h,0,true);
      box('rust',s*x,n,.2,.68,.75,.4);
      box('rust',s*x,n,h-.3,.42,.48,.42);
      for(let y=.55;y<h-.35;y+=.64)box('iron',s*(x-.16),n-.19,y,.09,.07,.1);
    }
    box('iron',0,n,h,2*x+.5,.38,.34);
    for(const s of [-1,1])box('iron',s*(x-.35),n,h-.35,.18,.25,1, s*.65);
  }
  // Shore masonry, aged bollards, timber quays and a single pole ferry.
  for(const [n,sgn] of [[126,1],[148,-1]]){
    for(let x=-4.5;x<4.6;x+=.48)box('wood',x,n,.1,.44,3.6,.20);
    for(const x of [-4.2,4.2]){
      for(const dn of [-1.35,1.35])box('wood',x,n+dn,.65,.28,.28,1.3,0,true);
      box('wood',x,n,1.12,.18,3.2,.16);
      box('iron',x,n+sgn*1.35,1.34,.32,.32,.16);
    }
    for(let x=-44;x<=44;x+=2)if(Math.abs(x)>5)box('basalt',x,n+sgn*1.5,.14,1.7,.55,.28);
  }
  const ferry=options.r30Ferry===false?undefined:mountTownC2R30Ferry({parent:group});
  let boat:Group;
  if(ferry){
    boat=ferry.boat;
  }else{
    boat=new Group();boat.name='single-pole-ferry';
    const boatPart=(k:Kind,x:number,n:number,y:number,w:number,d:number,h:number,angle=0)=>{
      const m=new Mesh(meshGeometry,material.get(k));m.position.set(x,y,-n);m.scale.set(w,h,d);m.rotation.z=angle;boat.add(m);
    };
    for(let n=-2.3;n<=2.3;n+=.34)boatPart('wood',0,n,0,2.1,.32,.18);
    for(const x of [-1.05,1.05])for(let n=-2.25;n<=2.3;n+=.5)boatPart('wood',x,n,.38,.17,.49,.58);
    for(const n of [-2.55,2.55])boatPart('wood',0,n,.36,2.1,.18,.58);
    for(const n of [-1.4,0,1.4])boatPart('wood',0,n,.58,1.96,.3,.14);
    boatPart('wood',.82,0,1.75,.07,.07,3,.2);
    boat.position.set(0,-.18,-137);group.add(boat);
  }
  // Dry east bypass, above the bed in every water phase; railings do not cross the route.
  for(let n=113;n<164;n+=1.5){
    for(const x of [48.38,54.62]){
      if(x<50&&(n<129||n>145))continue;
      box('iron',x,n,.65,.18,.18,1.3,0,true);
      box('iron',x,n,1.15,.15,1.55,.15);
    }
    box('gravel',51.5,n,.022,5.8,1.45,.044);
  }
  // Sparse near-bank rubble, then distinct larger crystal clusters after crossing.
  for(const side of [-1,1])for(let i=0;i<15;i++){
    const x=side*(11+(i%5)*7.4),n=99+Math.floor(i/5)*9.2;
    for(let j=0;j<9;j++)box(j%3===0?'gravel':'rock',x+(j%3-1)*.55,n+Math.floor(j/3)*.48,.35+(j%4)*.16,.62,.58,.7+(j%4)*.32,0,true);
  }
  for(const s of [-1,1])for(let i=0;i<14;i++){
    const x=s*(11+(i%5)*7.3),n=151+Math.floor(i/5)*11.6;
    for(let j=0;j<7;j++){
      const px=x+(j%3-1)*.64,pn=n+Math.floor(j/3)*.62,h=1.1+((i*7+j*3)%12)*.24;
      box('basalt',px,pn,.3,.9,.86,.6,0,true);
      box('crystal',px,pn,.6+h/2,.39,.45,h,(j%3-1)*.18);
      box('crystal',px,pn,.6+h,.28,.29,.24);
    }
  }
  // Functional silhouettes at two fire anchors; no invented ore or rewards.
  for(const camp of [secondMineAnchors.supportCamp,secondMineAnchors.riverCamp]){
    for(let i=0;i<12;i++){const a=i*Math.PI/6;box('rock',camp.east+Math.cos(a)*.8,camp.north+Math.sin(a)*.8,.18,.38,.35,.36);}
    for(let i=0;i<5;i++){box('wood',camp.east+(i-2)*.19,camp.north,.18,.17,.78,.22);box('ember',camp.east+(i-2)*.15,camp.north,.52,.13,.18,.7);}
    const light=new PointLight(0xffb277,24,16,2);light.position.set(camp.east,1.4,-camp.north);group.add(light);
  }
  dressSecondMineDryWings(box);
  const pumpHouse=options.pumpHouse?mountTownC2PumpHouseAdapter({
    parent:group,readAcceptedWater:options.pumpHouse.readAcceptedWater,
    host:{...options.pumpHouse.host,supportsSite:site=>options.pumpHouse?.host?.supportsSite?.(site)===true},
  }):undefined;
  if(pumpHouse)for(const box of pumpHouse.colliders){
    solids.push({x:(box.min[0]+box.max[0])/2,n:-(box.min[2]+box.max[2])/2,y:(box.min[1]+box.max[1])/2,
      w:box.max[0]-box.min[0],d:box.max[2]-box.min[2],h:box.max[1]-box.min[1]});
  }
  const overheadBoxes:StaticBox[]=[];
  for(const items of parts.values())for(const part of items){
    const bottom=part.y-part.h/2;
    if(bottom<=0+geometryEpsilon)continue;
    overheadBoxes.push({min:[part.x-part.w/2,bottom,-part.n-part.d/2],max:[part.x+part.w/2,part.y+part.h/2,-part.n+part.d/2]});
  }
  for(const part of enclosure?.boxes??[]){
    const bottom=part.y-part.h/2;
    if(bottom<=0+geometryEpsilon)continue;
    overheadBoxes.push({min:[part.x-part.w/2,bottom,-part.n-part.d/2],max:[part.x+part.w/2,part.y+part.h/2,-part.n+part.d/2]});
  }
  for(const placement of waterworks?.placements??[]){
    if(placement.y<=.3||placement.part==='wet-mark'||placement.part==='wall-wet-streak'||
      placement.part==='pipe-wet-streak'||placement.part==='pipe-pillar')continue;
    overheadBoxes.push({min:[placement.x-placement.w/2,placement.y,-placement.n-placement.d/2],
      max:[placement.x+placement.w/2,placement.y+placement.h,-placement.n+placement.d/2]});
  }
  for(const box of pumpHouse?.colliders??[])if(box.min[1]>geometryEpsilon)overheadBoxes.push(box);
  for(const piece of riverTerrace?.pieces??[]){
    if(piece.y<=.3||piece.role==='stain'||piece.role==='waterline'||piece.role==='mark')continue;
    overheadBoxes.push({min:[piece.e-piece.w/2,piece.y,-piece.n-piece.d/2],max:[piece.e+piece.w/2,piece.y+piece.h,-piece.n+piece.d/2]});
  }
  const overheadIndex=createStaticFootIndex(overheadBoxes);
  const solidIndex=createStaticFootIndex(solids.map(s=>({min:[s.x-s.w/2,s.y-s.h/2,-s.n-s.d/2],max:[s.x+s.w/2,s.y+s.h/2,-s.n+s.d/2]})));
  const dummy=new Matrix4(),q=new Quaternion(),v=new Vector3(),scale=new Vector3(),axis=new Vector3(0,0,1);
  for(const [kind,items] of parts){
    const m=new InstancedMesh(meshGeometry,material.get(kind),items.length);
    items.forEach((p,i)=>{dummy.compose(v.set(p.x,p.y,-p.n),q.setFromAxisAngle(axis,p.rz),scale.set(p.w,p.h,p.d));m.setMatrixAt(i,dummy);});
    m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();group.add(m);
  }
  const waterGeo=new BoxGeometry(96,.035,18),waterMat=new MeshStandardMaterial({color:0x142d3d,metalness:.38,roughness:.23,transparent:true,opacity:.86});
  const water=new Mesh(waterGeo,waterMat);water.position.set(0,-.24,-137);group.add(water);
  let state:MineRiverState='middle';
  function setRiverState(next:MineRiverState){
    state=next;water.visible=next!=='low';water.position.y=next==='high'?-.025:-.24;
    if(ferry)ferry.sync(next);else boat.visible=next==='middle';
    waterworks?.setWaterState(next);
    riverTerrace?.setWaterState(next);
    pumpHouse?.sync();
  }
  function syncLiftAperture(){
    liftOpen=false;
    if(lift){try{liftOpen=lift.readOpen()===true;}catch{liftOpen=false;}}
    if(liftPlate)liftPlate.visible=!liftOpen;
    return liftOpen;
  }
  /** Local floor and vertical headroom share the visible geometry; body-height
   * collision remains restricted to the explicit solid set. */
  function passageLocal(e:number,n:number,radius=.27,height=1.8){
    if(disposed||![e,n,radius,height].every(Number.isFinite)||radius<0||height<=0)return;
    const floor=secondMineFloor(e,n,state);
    if(floor===undefined||!canStandSecondMine(e,n,state,radius))return;
    if(liftOpen&&lift){
      const de=Math.max(0,lift.hole.minE-e,e-lift.hole.maxE),dn=Math.max(0,lift.hole.minN-n,n-lift.hole.maxN);
      if(Math.hypot(de,dn)<=radius)return;
    }
    if(radius>0&&solidIndex.blocks(e,n,floor,radius,height))return;
    let clearance=Infinity;
    for(const box of overheadIndex.candidates(e,n,radius)){
      const dx=Math.max(0,box.min[0]-e,e-box.max[0]),dz=Math.max(0,box.min[2]+n,-n-box.max[2]);
      if(Math.hypot(dx,dz)<radius)clearance=Math.min(clearance,box.min[1]-floor);
    }
    if(lift&&liftPlate&&!liftOpen){
      const de=Math.max(0,lift.hole.minE-e,e-lift.hole.maxE),dn=Math.max(0,lift.hole.minN-n,n-lift.hole.maxN);
      if(Math.hypot(de,dn)<=radius)clearance=Math.min(clearance,lift.site.ceiling-floor);
    }
    return {floor,clearance};
  }
  function canStand(e:number,n:number,r=.27,height=1.8){
    const passage=passageLocal(e,n,r,height);
    return !!passage&&passage.clearance+geometryEpsilon>=height;
  }
  function acceptsMouth(mouth:unknown){
    if(disposed||!matchesExitMouth(mouth))return false;
    if(enclosure)return enclosure.acceptsMouth(c2R30DeepMouths['minus140-to-minus165'].from)&&canStand(0,197.5,.27,1.8);
    const northParts=[...parts.values()].flat().filter(p=>Math.abs(p.n-exitWall.north)<=geometryEpsilon);
    if(northParts.length!==exitWallParts.length||northParts.some(p=>!exitWallParts.some(wall=>sameBox(p,wall))))return false;
    const wallSolids:Solid[]=[];
    for(const p of exitWallParts){
      const solid=solids.find(s=>sameBox(p,s));
      if(!solid)return false;
      wallSolids.push(solid);
    }
    if(blocksDoorway(northParts)||blocksDoorway(solids))return false;
    if(!coversWallRange(wallSolids,exitRoom?.x0??-6,-exitWall.halfWidth,0,exitWall.lintelBottom)||
      !coversWallRange(wallSolids,exitWall.halfWidth,exitRoom?.x1??6,0,exitWall.lintelBottom))return false;
    const lintels=wallSolids.filter(s=>s.x+s.w/2>-exitWall.halfWidth+geometryEpsilon&&s.x-s.w/2<exitWall.halfWidth-geometryEpsilon&&
      s.y+s.h/2>exitWall.lintelBottom+geometryEpsilon);
    if(!lintels.length||!coversWallRange(lintels,-exitWall.halfWidth,exitWall.halfWidth,exitWall.lintelBottom,exitWall.ceiling))return false;
    if(Math.abs(Math.min(...lintels.map(s=>s.y-s.h/2))-exitWall.lintelBottom)>geometryEpsilon||
      Math.abs(Math.max(...lintels.map(s=>s.y+s.h/2))-exitWall.ceiling)>geometryEpsilon)return false;
    if(wallSolids.some(s=>s.y-s.h/2<-geometryEpsilon||s.y+s.h/2>exitWall.ceiling+geometryEpsilon))return false;
    const expected=c2R30DeepMouths['minus140-to-minus165'].from;
    const probeNorth=expected.at-.5;
    const passage=passageLocal(expected.centre,probeNorth,.27,expected.height);
    return !!passage&&passage.floor===0&&passage.clearance+geometryEpsilon>=expected.height&&canStand(expected.centre,probeNorth,.27,1.8);
  }
  setRiverState('middle');syncLiftAperture();
  return {group,boat,water,solids,r30Enclosure:enclosure,waterworks,ferry,riverTerrace,pumpHouse,anchors:secondMineAnchors,setRiverState,canStand,passageLocal,acceptsMouth,floor:(e:number,n:number)=>secondMineFloor(e,n,state),
    liftPlate,liftRoofPieces:entryRoofPieces,syncLiftAperture,get liftOpen(){return liftOpen;},
    get riverState(){return state;},pieces:[...parts.values()].reduce((a,b)=>a+b.length,0)+(enclosure?.stats().pieceCount??0)+(waterworks?.placements.length??0)+(ferry?.stats().pieceCount??boat.children.length)+(riverTerrace?.pieces.length??0)+(pumpHouse?.stats().modelPieceCount??0)+3+(liftPlate?1:0),
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();pumpHouse?.dispose();riverTerrace?.dispose();ferry?.dispose();waterworks?.dispose();enclosure?.dispose();meshGeometry.dispose();waterGeo.dispose();waterMat.dispose();riverGeometries.forEach(g=>g.dispose());material.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
