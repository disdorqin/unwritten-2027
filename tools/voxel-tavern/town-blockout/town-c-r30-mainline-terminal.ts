import {BoxGeometry,CanvasTexture,Color,Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,MeshLambertMaterial,NearestFilter,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import type {createUndergroundMainlineTrack,UndergroundMainlinePoint as Point} from '../../../src/shared/underground-mainline-track.js';
import type {U19MineCartSnapshot} from '../../../src/presence/underground-mainline-cart.js';
type Route=ReturnType<typeof createUndergroundMainlineTrack>;
type Foot={role:string;p:Point;r:number;h:number};
type Family='wood'|'iron'|'rock'|'neutral';
type Part={p:Point;w:number;h:number;d:number;family:Family;color:number;y:number;yaw:number};
type Role='camp'|'gate';
type BoardState='unregistered'|'repairing'|'occupied'|'arriving'|'recalling'|'derailed'|'empty'|'loaded'|'away-empty'|'away-loaded';
/** Terminal physical bumper and two receipt-only station status boards.
 * This module never controls the cart, grants inventory, or changes the
 * crystal door's authority. */
export function mountR30MainlineTerminal(parent:Group,route:Route,supports:(p:Point,r:number,h:number)=>boolean,existing:readonly Foot[]){
 const root=new Group();root.name='r30-mainline-terminal-physical-and-receipt-status';parent.add(root);
 const parts:Part[]=[],boards:{role:Role;group:Group;state:BoardState;count:number;canvas?:HTMLCanvasElement;map?:CanvasTexture;material?:MeshBasicMaterial}[]=[];
 const end=route.sample(route.length),c=Math.cos(end.heading),s=Math.sin(end.heading);
 const offset=(p:Point,side:number,along:number,yaw=end.heading)=>({east:p.east+Math.cos(yaw)*side-Math.sin(yaw)*along,north:p.north+Math.sin(yaw)*side+Math.cos(yaw)*along,height:p.height});
 const at=(side:number,along:number)=>offset(end.position,side,along);
 const bbox={side:0,along:1.28,halfWidth:.77,halfDepth:.24,height:.66};
 const center=at(bbox.side,bbox.along);
 const valid=Array.from({length:7},(_,i)=>i/6*1.54-.77).every(x=>[-.24,0,.24].every(z=>supports(at(x,bbox.along+z),.05,.7)))&&existing.every(f=>Math.hypot(center.east-f.p.east,center.north-f.p.north)>f.r+.83);
 const put=(side:number,along:number,y:number,w:number,h:number,d:number,family:Family,color:number)=>parts.push({p:at(side,along),w,h,d,family,color,y,yaw:end.heading});
 if(valid){
  // Low bolted stop, beyond the wheel axle/rail endpoint, and with
  // a clear 1m pedestrian lane on either side. Static, not a brake rule.
  for(const side of [-.50,.50]){
   put(side,1.28,.105,.43,.21,.36,'rock',0x53504b);
   put(side,1.28,.33,.24,.43,.29,'wood',0x604735);
   put(side,1.27,.42,.30,.10,.34,'iron',0x80563d);
   for(const dx of [-.15,.15])for(const dz of [-.12,.12])put(side+dx,1.28+dz,.223,.045,.04,.045,'iron',0x988260);
  }
  put(0,1.28,.55,1.54,.21,.32,'wood',0x70543e);
  put(0,1.10,.55,1.47,.18,.055,'iron',0x535558);
  for(let i=0;i<9;i++)put(-.65+i*.162,1.065,.55,.12,.12,.018,'neutral',i%2?0x393836:0xa99161);
 }
 const boardGeo=new BoxGeometry(1.18,.43,.105),signGeo=new PlaneGeometry(1.13,.38),frameGeo=new BoxGeometry(.075,.45,.12);
 const boardMat=new MeshLambertMaterial({color:0x594735}),frameMat=new MeshLambertMaterial({color:0x80563d});
 for(const role of ['camp','gate'] as const){
  const station=existing.find(f=>f.role===role);if(!station)continue;
  const ref=route.work[role].position,p=station.p;
  const dx=ref.east-p.east,dn=ref.north-p.north,len=Math.hypot(dx,dn);if(len<.01)continue;
  const g=new Group();g.name='r30-station-status/'+role;
  // Mount on front of the existing workstand, within its registered
  // solid footprint. Faces the cart, not a speculative second station.
  g.position.set(p.east+dx/len*.46,p.height+1.30,-(p.north+dn/len*.46));
  g.rotation.y=Math.atan2(dx,-dn);root.add(g);
  const backing=new Mesh(boardGeo,boardMat);g.add(backing);
  for(const x of [-.56,.56]){const m=new Mesh(frameGeo,frameMat);m.position.x=x;g.add(m)}
  const entry:{role:Role;group:Group;state:BoardState;count:number;canvas?:HTMLCanvasElement;map?:CanvasTexture;material?:MeshBasicMaterial}={role,group:g,state:'unregistered',count:0};
  if(typeof document!=='undefined'){
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;
   const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.generateMipmaps=false;
   const material=new MeshBasicMaterial({map}),sign=new Mesh(signGeo,material);sign.position.z=.055;g.add(sign);Object.assign(entry,{canvas,map,material});
  }
  boards.push(entry);
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['wood','iron','rock','neutral'] as const){
  const rows=parts.filter(p=>p.family===family);if(!rows.length)continue;
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,rows.length),m=new Matrix4(),q=new Quaternion(),col=new Color();
  rows.forEach((p,i)=>{m.compose(new Vector3(p.p.east,p.p.height+p.y,-p.p.north),q.setFromAxisAngle(new Vector3(0,1,0),p.yaw),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,col.setHex(p.color))});
  mesh.computeBoundingSphere();root.add(mesh);resources.push({mesh,mat,map});
 }
 function stateFor(role:Role,snapshot?:U19MineCartSnapshot):{state:BoardState;count:number}{
  if(!snapshot)return {state:'unregistered',count:0};
  const count=snapshot.cargo.pieces,here=role==='camp'?snapshot.chainage<=2:snapshot.chainage>=route.length-2;
  if(snapshot.mode==='repairing')return {state:'repairing',count};
  if(snapshot.mode==='derailed')return {state:'derailed',count};
  if(snapshot.mode==='recalling')return {state:'recalling',count};
  if(snapshot.mode==='rolling')return {state:'arriving',count};
  if(snapshot.riderId)return {state:'occupied',count};
  return {state:here?(count?'loaded':'empty'):(count?'away-loaded':'away-empty'),count};
 }
 const messages:Record<BoardState,string>={unregistered:'未接入 · 停用',repairing:'待维修 · 禁止行车',occupied:'乘员占用 · 等待下车',arriving:'矿车行驶中',recalling:'空车回收中',derailed:'脱轨 · 等待扶正',empty:'空车在站',loaded:'载矿在站 · 待卸货', 'away-empty':'空车离站','away-loaded':'载矿离站 · 不可召回'};
 function sync(snapshot?:U19MineCartSnapshot){
  for(const board of boards){
   const {state,count}=stateFor(board.role,snapshot),key=state+'/'+count;
   if(board.group.userData.key===key)continue;
   board.group.userData.key=key;board.state=state;board.count=count;
   const ctx=board.canvas?.getContext('2d');if(!ctx||!board.map)continue;
   ctx.fillStyle='#41372d';ctx.fillRect(0,0,512,192);ctx.strokeStyle='#a08a65';ctx.lineWidth=7;ctx.strokeRect(7,7,498,178);
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 38px Microsoft YaHei,sans-serif';
   ctx.fillStyle=['empty','loaded'].includes(state)?'#c3c9a2':'#d4be99';
   ctx.fillText(messages[state],256,68,470);
   ctx.font='bold 32px Microsoft YaHei,sans-serif';ctx.fillStyle='#b8aa8b';
   ctx.fillText(state==='unregistered'?'等待权威回执':count>0?'车斗 '+count+' 件':'车斗 · 空',256,133,470);
   board.map.needsUpdate=true;
  }
 }
 sync();
 return {group:root,bufferBuilt:valid,bufferCenter:center,parts:parts.length+boards.length*3,boards,sync,
  blocks(e:number,n:number,y:number,r:number,h:number){
   if(!valid||y+h<=center.height||y>=center.height+bbox.height)return false;
   const dx=e-center.east,dn=n-center.north,side=dx*c+dn*s,along=-dx*s+dn*c;
   return Math.hypot(Math.max(0,Math.abs(side)-bbox.halfWidth),Math.max(0,Math.abs(along)-bbox.halfDepth))<r;
  },
  dispose(){root.removeFromParent();resources.forEach(r=>{r.mesh.dispose();r.mat.dispose();r.map.dispose()});boards.forEach(b=>{b.material?.dispose();b.map?.dispose()});geo.dispose();boardGeo.dispose();signGeo.dispose();frameGeo.dispose();boardMat.dispose();frameMat.dispose();root.clear()}};
}
