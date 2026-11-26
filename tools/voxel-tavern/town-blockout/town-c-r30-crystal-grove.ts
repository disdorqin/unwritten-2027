import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {CRYSTAL_CAVERN_CANT_RAD,crystalCavernTrailEast,crystalCavernTrailHeight} from './underground-crystal-cavern.js';
import {crystalRoutePassage} from './town-c-r30-crystal-support.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Family='root'|'crystal'|'facet';
type Part={family:Family;e:number;n:number;y:number;w:number;h:number;d:number;angle:number;color:number};
type Block=(e:number,n:number,y:number,r:number,h:number)=>boolean;
const angle=CRYSTAL_CAVERN_CANT_RAD,cs=Math.cos(angle),sn=Math.sin(angle);
/** Low geological growth along the -90 crystal side-pocket approach.
 * Pure environment: no mineable site, mimic, reward, or light entity. */
export function mountR30CrystalGrove(parent:Group,existingBlocks:Block){
 const group=new Group();group.name='r30-crystal-entry-low-grove';parent.add(group);
 const parts:Part[]=[],clusters:{e:number;n:number;height:number;spikes:number}[]=[];
 const solid:Part[]=[];
 function push(p:Part,blocks=false){parts.push(p);if(blocks)solid.push(p)}
 const blockedBy=(p:Part,e:number,n:number,y:number,r:number,h:number)=>{
  const c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle)),halfW=(c*p.w+s*p.h)/2,halfH=(s*p.w+c*p.h)/2;
  return p.y+halfH>y+.025&&p.y-halfH<y+h&&Math.hypot(Math.max(0,Math.abs(e-p.e)-halfW),Math.max(0,Math.abs(n-p.n)-p.d/2-(p.family==='crystal'?.015:0)))<r;
 };
 for(let i=0;i<15;i++){
  // Short groups and irregular gaps rather than two lines of equally
  // spaced lantern-like crystals. The central spine is kept free.
  const n=-2.25+i*1.59+[0,.22,-.39,.47,-.20][i%5],side=[1,-1,1,-1,-1,1,-1,1,1,-1,1,-1,1,-1,1][i],c=crystalCavernTrailEast(n);
  const e=c+side*(1.89+[.24,.47,.11,.35,.19,.43][i%6]),y=crystalCavernTrailHeight(n);
  if(!crystalRoutePassage(e,n,.49,.25)||existingBlocks(e,n,y,.52,1.55))continue;
  const count=3+i%3,maxH=[.78,1.23,.68,1.38,.92,1.09,.81][i%7];
  clusters.push({e,n,height:maxH,spikes:count});
  // Uneven socket chips anchor the crystal to the actual walking plane.
  for(let k=0;k<7;k++){
   const a=k*Math.PI*2/7+i*.31,ex=e+Math.cos(a)*.38,nx=n+Math.sin(a)*.32;
   if(!crystalRoutePassage(ex,nx,.06,.08))continue;
   push({family:'root',e:ex,n:nx,y:crystalCavernTrailHeight(nx)+.045+(k%3)*.015,w:.16+(k%2)*.05,h:.095,d:.15,angle:0,color:k%3?0x4f625e:0x3d4b4b},true);
  }
  for(let k=0;k<count;k++){
   const a=k*2.399963+i*.17,baseE=e+Math.cos(a)*.27,baseN=n+Math.sin(a)*.24,baseY=crystalCavernTrailHeight(baseN)+.055;
   const tall=maxH*(k===0?1:.45+((k*3+i*2)%5)*.09),width=.16+((k+i)%4)*.046;
   // Three nested taper segments have contiguous ends along the same
   // canonical 20 degree spine, and a subtle brighter inner facet.
   for(const [j,start,end,scale] of [[0,0,.42,1],[1,.42,.77,.75],[2,.77,1,.43]] as const){
    const mid=(start+end)*.5*tall,h=(end-start)*tall+.008;
    const p:Part={family:'crystal',e:baseE-sn*mid,n:baseN,y:baseY+cs*mid,w:width*scale,h,d:width*.83*scale,angle,color:i%4===0?0x7bb1ba:j===2?0x9ac9c5:0x70a8aa};
    push(p,true);
    push({...p,family:'facet',n:p.n-p.d/2-.002,w:p.w*.24,h:p.h*.77,d:.012,color:0xa3d4d1},false);
   }
  }
 }
 const geo=new BoxGeometry(),map=makeCampGrain('rock');
 const materials:Record<Family,MeshStandardMaterial>={
  root:new MeshStandardMaterial({map,roughness:.95,flatShading:true}),
  crystal:new MeshStandardMaterial({roughness:.40,metalness:.08,emissive:0x355f63,emissiveIntensity:.44,flatShading:true}),
  facet:new MeshStandardMaterial({roughness:.27,emissive:0x63948d,emissiveIntensity:.48,flatShading:true}),
 };
 const meshes:InstancedMesh[]=[];
 for(const family of ['root','crystal','facet'] as const){
  const list=parts.filter(p=>p.family===family);if(!list.length)continue;
  const mesh=new InstancedMesh(geo,materials[family],list.length),m=new Matrix4(),q=new Quaternion(),col=new Color(),axis=new Vector3(0,0,1);
  mesh.name='r30-grove-'+family;
  list.forEach((p,i)=>{m.compose(new Vector3(p.e,p.y,-p.n),q.setFromAxisAngle(axis,p.angle),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,col.setHex(p.color))});
  mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);
 }
 return {group,clusters,parts,solid,blocks:(e:number,n:number,y:number,r:number,h:number)=>solid.some(p=>blockedBy(p,e,n,y,r,h)),
  dispose(){group.removeFromParent();meshes.forEach(m=>m.dispose());Object.values(materials).forEach(m=>m.dispose());geo.dispose();map.dispose();group.clear()}};
}
