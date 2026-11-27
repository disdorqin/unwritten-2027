import {BoxGeometry,Group,InstancedMesh,Matrix4,MeshLambertMaterial,MeshBasicMaterial,Color,Vector3,Quaternion} from 'three';
import {r30ThinWalls} from '../../../src/shared/town-c-r30-thin-wall-plan.js';
import type {UndergroundMiningTargetView} from '../../../src/shared/underground-mining.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Point=Readonly<{east:number;north:number;height:number}>;
type P=readonly [number,number,number];
type Part={at:P;size:P;color:number;tilt?:number};
const layer='underground/mine';
const y=-91;
/** The model, collision and authoritative mining target all derive from the
 * same authored plane. No local mining counter or reward is minted here. */
export function mountR30ThinWallArt(parent:Group,toWorld:(p:P)=>Point,enabled:boolean){
 const root=new Group();root.name='r30-thin-wall-exploration';parent.add(root);
 const geo=new BoxGeometry(),map=makeCampGrain('rock'),stone=new MeshLambertMaterial({map}),glow=new MeshBasicMaterial();
 const matrix=new Matrix4(),color=new Color(),axis=new Vector3(0,0,1);
 let disposed=false;
 const batches:InstancedMesh[]=[];
 function batch(owner:Group,parts:Part[],material:MeshLambertMaterial|MeshBasicMaterial,name:string){
  const mesh=new InstancedMesh(geo,material,parts.length);mesh.name=name;
  for(const [i,p] of parts.entries()){
   matrix.compose(new Vector3(...p.at),new Quaternion().setFromAxisAngle(axis,p.tilt??0),new Vector3(...p.size));
   mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color.setHex(p.color));
  }
  mesh.computeBoundingSphere();owner.add(mesh);batches.push(mesh);return mesh;
 }
 const walls=enabled?r30ThinWalls.map(wall=>{
  const pivot=new Group();pivot.name=wall.id;pivot.position.set(wall.x,y,wall.z);
  if(wall.axis==='x')pivot.rotation.y=Math.PI/2;
  root.add(pivot);
  const closed=new Group();closed.name='intact-rock';pivot.add(closed);
  const chunks:Part[]=[],rim:Part[]=[],cracks:Part[][]=[[],[],[]];
  // A fully sealed backing face; decorative stone fragments never make
  // partial hits passable, and no bright leak implies an actual open hole.
  chunks.push({at:[0,wall.height/2,0],size:[wall.width,wall.height,wall.thickness],color:0x41454c});
  for(let j=0;j<9;j++){
   const h=wall.height/9,yy=(j+.5)*h,edges=[-wall.width/2];
   for(let i=1;i<8;i++)edges.push(-wall.width/2+i*wall.width/8+Math.sin(i*17+j*13)*.11);
   edges.push(wall.width/2);
   for(let i=0;i<8;i++){
    const x=(edges[i]+edges[i+1])/2,w=edges[i+1]-edges[i],depth=.035+((i*11+j*7)%5)*.006;
    const tint=[0x48484a,0x53504c,0x605b55,0x484a4e,0x585754][(j*7+i*3)%5];
    for(const side of [-1,1])chunks.push({at:[x,yy,side*(.16+depth/2)],size:[w-.008,h-.005,depth],color:tint});
   }
  }
  // Fine seams are visible as darker fracture lines on each face.
  for(let i=0;i<16;i++){
   const ya=.05+i*.21,yb=ya+.215,xa=.13*Math.sin(i*1.2),xb=.13*Math.sin((i+1)*1.2);
   const len=Math.hypot(xb-xa,yb-ya),tilt=-Math.atan2(xb-xa,yb-ya),x=(xa+xb)/2,yy=(ya+yb)/2;
   for(const side of [-1,1]){
    const crack={at:[x,yy,side*.220] as P,size:[.026,len+.02,.012] as P,tilt,color:0x181d22};
    chunks.push(crack);
    cracks[Math.min(2,Math.floor(i/6))].push({...crack,at:[x+.022,yy,side*.227],size:[.055,len+.025,.012],color:0x14191e});
   }
  }
  batch(closed,chunks,stone,'sealed-wall-chunks');
  const stages=cracks.map((p,i)=>{const m=batch(closed,p,stone,'damage-stage-'+(i+1));m.visible=false;return m});
  // Small flush debris survives the opening, below the walking support
  // tolerance. No residual collider after a confirmed final strike.
  for(let i=0;i<18;i++)rim.push({at:[(-.48+(i%9)*.12)*wall.width,.008,i<9?-.23:.23],size:[.14,.016,.13],color:0x6a655c});
  batch(pivot,rim,stone,'flat-rock-fragments');
  const site={id:wall.id,kind:'thin-wall' as const,strikes:wall.strikes,
    at:{layer,...toWorld([wall.x,y+1.05,wall.z])}};
  return {wall,site,closed,stages};
 }):[];
 // The secluded crystal room is a decorative pocket rather than new ore.
 // Keep all visible crystals against its far wall and outside the path.
 if(enabled){
  const crystals:Part[]=[],ridges:Part[]=[];
  for(const [i,z] of [55.65,57.8,60.1,63.05].entries()){
   const cx=18.75+(i%2)*.12;
   for(let k=0;k<12;k++){
    const a=k*Math.PI/6,rad=.20+(k%3)*.16;
    const x=cx+Math.cos(a)*rad,z0=z+Math.sin(a)*rad,h=.25+((k*17+i*7)%11)*.12;
    const tilt=Math.cos(a)*.16,w=.13+(k%4)*.035,tint=[0x3c666d,0x477e82,0x65a7a4,0x33545d][(i+k)%4];
    // Stepped taper and small facets, arranged in dense, irregular clusters.
    for(let j=0;j<4;j++)crystals.push({at:[x,y+.12+h*(j+.5)/4,z0],size:[w*(1-j*.15),h/4+.01,w*(1-j*.15)],color:j===3?0x8acbc3:tint,tilt});
    ridges.push({at:[x,y+.105,z0],size:[.34,.21,.31],color:0x343b45});
   }
   for(let k=0;k<10;k++)ridges.push({at:[cx+(k%3-1)*.22,y+.06+(k%4)*.02,z-.56+k*.12],size:[.43,.11+(k%3)*.06,.21],color:k%3?0x3e454c:0x4e5358});
  }
  batch(root,ridges,stone,'crystal-pocket-wall-foot');
  batch(root,crystals,glow,'decorative-crystal-pocket');
 }
 function sync(snapshot:readonly UndergroundMiningTargetView[]|undefined){
  const open=new Set<string>();
  if(disposed)return open;
  for(const w of walls){
   const matches=snapshot?.filter(t=>t.id===w.site.id)??[];
   const t=matches.length===1?matches[0]:undefined;
   const valid=t&&t.kind==='thin-wall'&&t.surface==='rock'&&t.strikes===w.site.strikes&&
    t.at.layer===layer&&[t.at.east,t.at.north,t.at.height].every(Number.isFinite)&&
    Math.hypot(t.at.east-w.site.at.east,t.at.north-w.site.at.north,t.at.height-w.site.at.height)<1e-6&&
    Number.isSafeInteger(t.hits)&&t.hits>=0&&t.hits<=t.strikes&&t.open===(t.hits===t.strikes);
   if(valid&&t.open)open.add(w.site.id);
   w.closed.visible=!open.has(w.site.id);
   w.stages.forEach((m,i)=>{m.visible=!!valid&&t.hits>i});
  }
  return open;
 }
 return {group:root,sites:walls.map(w=>w.site),sync,wallCount:walls.length,
  // Decorative cluster stays physically in the far strip, which is
  // blocked by this same local query, not by a reward/mining site.
  blocks(x:number,z:number,radius:number){return enabled&&x+radius>17.85&&x-radius<19.6&&z+radius>54.9&&z-radius<64.4},
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();batches.forEach(b=>b.dispose());geo.dispose();stone.dispose();glow.dispose();map.dispose()}};
}
