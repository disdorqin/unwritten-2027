import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {crystalCavernTrailEast,crystalCavernTrailHeight,CRYSTAL_CAVERN_CANT_RAD} from './underground-crystal-cavern.js';
import {crystalRoutePassage,r30CrystalReturnSwitch} from './town-c-r30-crystal-support.js';
type Family='wood'|'iron'|'rock'|'crystal';
type Piece={family:Family;e:number;n:number;y:number;w:number;h:number;d:number;angle:number;color:number};
type Bounds={e:number;n:number;minY:number;maxY:number;w:number;d:number};
/** Actual U3 entry threshold: mine-era bolted timber gives way to old dry
 * stone arches and unmineable crystal inclusions. No inscriptions, new loot,
 * teleport, gate stage, or extra light source. */
export function mountR30CrystalVestibule(parent:Group){
 const group=new Group();group.name='r30-crystal-vestibule';parent.add(group);
 const parts:Piece[]=[],bounds:Bounds[]=[];
 const put=(family:Family,e:number,n:number,y:number,w:number,h:number,d:number,color:number,angle=0)=>{
  parts.push({family,e,n,y,w,h,d,color,angle});
 };
 const floor=(n:number)=>crystalCavernTrailHeight(n);
 const centre=(n:number)=>crystalCavernTrailEast(n);
 const support=(e:number,n:number)=>!!crystalRoutePassage(e,n,.04,.1);
 for(const [i,n] of [-9.35,-5.2,2.4,11.5,19.5].entries()){
  const c=centre(n),y=floor(n),sideOffset=i===0?1.73:i===1?2.28:2.88;
  const early=i<2,postW=early?.24:.32;
  if(![-1,1].every(s=>support(c+s*sideOffset,n)))continue;
  for(const s of [-1,1]){
   const e=c+s*sideOffset;
   bounds.push({e,n,minY:y,maxY:y+3.1,w:postW+.16,d:.53});
   put('rock',e,n,y+.17,postW+.14,.34,.51,0x505258);
   if(early){
    put('wood',e,n,y+1.69,postW,2.76,.28,0x70543e);
    for(const h of [.48,1.52,2.78]){
     put('iron',e,n,y+h,postW+.07,.13,.35,0x80563d);
     for(const dz of [-.184,.184])put('iron',e,n+dz,y+h,.045,.047,.025,0xa08866);
    }
   }else{
    for(let row=0;row<8;row++){
     const width=postW+.075+(row%3)*.025;
     put('rock',e+s*(row%2)*.018,n,y+.36+row*.32,width,.306,.46,row%3?0x5a605e:0x41464b);
     if(row%2===1)put('rock',e-s*.05,n+.241,y+.33+row*.32,width*.72,.07,.038,0x77746a);
    }
   }
   // Mineral inclusions are inset high on the outer pier, not rewards or
   // separate pointed obstacles at foot height.
   if(i>=2)for(let k=0;k<4;k++){
    const h=.19+k*.08,angle=CRYSTAL_CAVERN_CANT_RAD;
    put('crystal',e+s*.075-Math.sin(angle)*h/2,n+.27,y+2.15+k*.14,.075,h,.085,0x79b7b2,angle);
   }
  }
  const beamY=y+3.18;
  if(early){
   put('wood',c,n,beamY,sideOffset*2+.34,.30,.39,0x604735);
   for(const e of [c-sideOffset,c,c+sideOffset]){
    put('iron',e,n,beamY,.15,.34,.44,0x80563d);
    put('iron',e,n+.235,beamY,.065,.065,.028,0xa08866);
   }
  }else{
   // Corbelled ancient lintel, deliberately a different construction
   // language from the mine's wood frame. No modern writing.
   for(const s of [-1,1])for(let k=0;k<3;k++)
    put('rock',c+s*(sideOffset-k*.36),n,y+2.86+k*.23,.77,.22,.58,k===1?0x686c65:0x505258);
   const span=(sideOffset-.72)*2-.60;
   for(let k=0;k<Math.ceil(span/.58);k++){
    const count=Math.ceil(span/.58),w=span/count;
    put('rock',c-span/2+(k+.5)*w,n,y+3.40,w-.012,.27,.57,k%3?0x686c65:0x505258);
   }
  }
 }
 // Low worn curbs define the actual playable trail edges beyond the
 // mouth; leave the return lever and the transition foot unobstructed.
 for(let n=23;n<96;n+=2.25){
  const c=centre(n),y=floor(n);
  for(const s of [-1,1]){
   if(s===1&&n>=72&&n<=80)continue; // real quay junction
   if(s===-1&&n>=53&&n<=59)continue; // real west alcove junction
   const e=c+s*3.02;
   if(!support(e,n))continue;
   const w=.29,d=1.42;
   bounds.push({e,n,minY:y-.05,maxY:y+.205,w,d});
   put('rock',e,n,y+.055,w,.19,d,0x505258);
   put('rock',e+s*.045,n-.20,y+.167,.16,.07,.68,0x6b7068);
   if(Math.round(n)%3===0)put('rock',e-s*.045,n+.39,y+.173,.13,.06,.34,0x686b5e);
  }
 }
 // Return lever gets a real protective top/collar and floor plate.
 // The existing switch mesh and authority still own handle/state.
 const sw=r30CrystalReturnSwitch;
 put('iron',sw.east,sw.north,sw.height+.025,.41,.05,.42,0x505258);
 for(const dx of [-.16,.16])for(const dn of [-.16,.16])put('iron',sw.east+dx,sw.north+dn,sw.height+.055,.044,.035,.044,0xa08866);
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map?:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['wood','iron','rock','crystal'] as const){
  const map=family==='crystal'?undefined:makeCampGrain(family);
  const mat=new MeshLambertMaterial({...(map?{map}:{}), ...(family==='crystal'?{emissive:0x365c59,emissiveIntensity:.38}:{})});
  for(let n=-11;n<100;n+=24){
   const list=parts.filter(p=>p.family===family&&p.n>=n&&p.n<n+24);if(!list.length)continue;
   const mesh=new InstancedMesh(geo,mat,list.length),m=new Matrix4(),q=new Quaternion(),c=new Color(),axis=new Vector3(0,0,1);
   list.forEach((p,i)=>{m.compose(new Vector3(p.e,p.y,-p.n),q.setFromAxisAngle(axis,p.angle),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
   mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
  }
  if(!resources.some(r=>r.mat===mat)){mat.dispose();map?.dispose()}
 }
 function blocks(e:number,n:number,y:number,r:number,h:number){
  return bounds.some(b=>b.maxY>y+.025&&b.minY<y+h&&Math.hypot(Math.max(0,Math.abs(e-b.e)-b.w/2),Math.max(0,Math.abs(n-b.n)-b.d/2))<r);
 }
 return {group,parts,bounds,blocks,dispose(){group.removeFromParent();resources.forEach(r=>r.mesh.dispose());new Set(resources.map(r=>r.mat)).forEach(m=>m.dispose());new Set(resources.map(r=>r.map)).forEach(t=>t?.dispose());geo.dispose();group.clear()}};
}
