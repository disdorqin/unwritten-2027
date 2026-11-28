import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,MeshStandardMaterial,NearestFilter,Object3D,RGBAFormat} from 'three';
import type {Box} from './landmark-kit';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater';
import {townC2CraterCentralMoundProtectedSites} from './town-c2-crater-central-mound';
type Road=ReturnType<typeof mountWestCraterRoad>;
type EN={east:number;north:number};
type Route=readonly EN[];
type Stone={id:string;zone:'north'|'west'|'floor';box:Box;color:number};
const palette=[0x69615a,0x80766b,0x544d48,0x9a8264,0x755d48,0xb0b9bd,0x91877a];
const clamp=(t:number)=>Math.max(0,Math.min(1,t));
function gap(p:EN,a:EN,b:EN){const x=b.east-a.east,z=b.north-a.north,t=clamp(((p.east-a.east)*x+(p.north-a.north)*z)/(x*x+z*z||1));return Math.hypot(p.east-a.east-t*x,p.north-a.north-t*z);}
function boxGap(e:number,n:number,b:Box){return Math.hypot(Math.max(b.min[0]!-e,e-b.max[0]!,0),Math.max(b.min[2]!+n,-n-b.max[2]!,0));}
const stable=(i:number)=>{const v=Math.sin(i*71.37+13.19)*43758.5453;return v-Math.floor(v);};
/** Only the existing B crater interior. Every physical instance is described
 * by the same world-space box as the sole host collision channel. No second
 * ground shell, no new rail or well. Preserve real routes in both directions. */
export function installBR32CraterInfill(road:Road,tracks:readonly Route[],routes:readonly Route[]=[],external:readonly Box[]=[]){
 const owner=road.group,name='b-r32-crater-infill';
 if(owner.getObjectByName(name))throw Error('B33 crater already mounted');
 const original=owner.userData.colliders as Box[];
 if(!Array.isArray(original))throw Error('B33 needs actual collider channel');
 const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw),fixture=createMeteorCrater(meteorCraterFixturePlan);
 const world=(p:EN)=>({east:a.east+p.east*c+p.north*s,north:a.north+p.north*c-p.east*s});
 const haul=Array.from({length:1201},(_,i)=>world(fixture.mainTrailPoint(i/1200)));
 const protectedRoutes=[{points:haul,width:3.1},...tracks.map(points=>({points,width:2.1})),...routes.map(points=>({points,width:1.55}))];
 const protectedSites=Object.values(townC2CraterCentralMoundProtectedSites);
 const solids=[...original,...external],stones:Stone[]=[];
 function accept(id:string,zone:Stone['zone'],east:number,north:number,w:number,d:number,rise:number,shade:number,maxRelief:number){
  const extent=Math.hypot(w,d)/2,r=Math.hypot(east-a.east,north-a.north);
  if(r+extent>49||r-extent<5.5)return false;
  if(protectedSites.some(p=>Math.hypot(east-p.east,north-p.north)<p.radius+extent+.8))return false;
  const p={east,north};
  for(const route of protectedRoutes)for(let i=1;i<route.points.length;i++)if(gap(p,route.points[i-1]!,route.points[i]!)<route.width+extent)return false;
  const hs=[-1,0,1].flatMap(x=>[-1,0,1].map(z=>road.heightAt(east+x*w/2,north+z*d/2)));
  if(hs.some(h=>h===undefined||!Number.isFinite(h)))return false;
  const low=Math.min(...hs as number[]),high=Math.max(...hs as number[]);
  if(high-low>maxRelief)return false;
  const bottom=low-.055,top=high+rise;
  if([...solids,...stones.map(s=>s.box)].some(b=>b.min[1]!<top+.1&&b.max[1]!>bottom&&boxGap(east,north,b)<extent+.24))return false;
  stones.push({id,zone,box:{min:[east-w/2,bottom,-north-d/2],max:[east+w/2,top,-north+d/2]},color:palette[shade%palette.length]!});
  return true;
 }
 // Discontinuous north-west strata: follow contours in overlapping short
 // lenses, rather than a radial ring or a uniform decorative scatter.
 for(let band=0;band<7;band++)for(let i=0;i<65;i++){
  const theta=-Math.PI*.57+i*Math.PI*.63/64,r=23.8+band*3.8+1.2*Math.sin(theta*5+band*.8);
  const e=a.east+Math.sin(theta)*r,n=a.north+Math.cos(theta)*r;
  const seed=band*73+i,zone=theta<-.68?'west':'north';
  if(stable(seed)<.16)continue;
  accept('ledge-'+band+'-'+i,zone,e,n,1.0+.95*stable(seed+3),.62+.50*stable(seed+7),.21+.54*stable(seed+13),band%2?i%3:3+i%2,2.0);
 }
 // Low mineral heaps in floor pockets. Three clustered rings are candidates,
 // not an obligation to fill protected walkable space; preserve open egress.
 for(let ring=0;ring<4;ring++)for(let i=0;i<60;i++){
  const angle=i*Math.PI/30+ring*.27,r=7.5+ring*3.1;
  if(Math.sin(angle)>.65||stable(i+ring*43)<.32)continue;
  const e=a.east+Math.sin(angle)*r,n=a.north+Math.cos(angle)*r;
  const seed=200+ring*43+i;
  accept('floor-spoil-'+ring+'-'+i,'floor',e,n,.60+stable(seed)*.60,.56+stable(seed+1)*.56,.20+stable(seed+2)*.49,i%5,.40);
 }
 // Each accepted cluster is a physically joined assembly. Split the
 // vertical envelope into a load-bearing bed, unequal ledges/ore blocks
 // and a cap, using individual visible boxes as colliders.
 const sites=stones.splice(0);
 for(const site of sites){
  const b=site.box,w=b.max[0]!-b.min[0]!,d=b.max[2]!-b.min[2]!,h=b.max[1]!-b.min[1]!,e=(b.max[0]!+b.min[0]!)/2,z=(b.max[2]!+b.min[2]!)/2,y=b.min[1]!;
  const part=(id:string,x:number,z0:number,base:number,width:number,depth:number,height:number,color:number)=>{
   stones.push({id:site.id+'/'+id,zone:site.zone,color,box:{min:[x-width/2,base,z0-depth/2],max:[x+width/2,base+height,z0+depth/2]}});
  };
  const bed=site.zone==='floor'?h*.38:h*.62;
  part('bed',e,z,y,w,d,bed,site.color);
  if(site.zone==='floor'){
   // Existing ore transport pockets: low timber spoil cribs are contained
   // inside the accepted rock envelope, never in the rail or walking lane.
   const rim=Math.min(.12,(h-bed)*.24),board=Math.min(.07,w*.09,d*.09),wood=0x795438;
   if(stable(e*31+z*17)>.34){
    for(const k of [-1,1]){
     part('crib-side-'+k,e+k*(w-board)/2,z,y+bed,board,d,rim,wood);
     part('crib-end-'+k,e,z+k*(d-board)/2,y+bed,w-2*board,board,rim,wood);
    }
   }
   for(let i=0;i<4;i++){
    const dx=(i%2?1:-1)*w*.22,dz=(i<2?1:-1)*d*.22,th=(h-bed)*(.50+.5*stable(i+w*100+d*50));
    part('ore-'+i,e+dx,z+dz,y+bed,w*.40,d*.40,th,palette[(i+2)%5]!);
   }
  }else{
   const ledge=(h-bed)*.57;
   part('lamina',e-w*.035,z+d*.035,y+bed,w*.87,d*.84,ledge,palette[3]!);
   part('broken-crown',e+w*.085,z-d*.08,y+bed+ledge,w*.66,d*.57,h-bed-ledge,palette[1]!);
   part('seam',e-w*.36,z,y+bed,w*.11,d*.65,ledge*.28,palette[4]!);
   if(stable(e*19+z*13)>.72){
    // Short visible retaining timbers sit on the stone bed and terminate
    // below the lip; no invented climbable step or invisible floor.
    const timberH=Math.min(.28,h-bed),timberW=Math.min(.10,w*.08),wood=0x795438;
    for(const k of [-1,1])part('retaining-post-'+k,e+k*w*.39,z-d*.39,y+bed,timberW,d*.13,timberH,wood);
    part('retaining-crossbeam',e,z-d*.39,y+bed+timberH*.70,w*.86,d*.14,timberH*.30,wood);
   }
  }
 }
 const group=new Group();group.name=name;group.userData.owner='B';group.userData.revision='B33-1-r3';group.userData.coordinateFrame='town-world-metres';group.userData.static=true;
 const geometry=new BoxGeometry(),textureSize=32,bytes=new Uint8Array(textureSize*textureSize*4);
 for(let y=0;y<textureSize;y++)for(let x=0;x<textureSize;x++){const l=Math.round(175+40*stable(x+32*y)+18*Math.sin(y*.56));bytes.set([l,l,l,255],4*(y*32+x));}
 const map=new DataTexture(bytes,32,32,RGBAFormat);map.minFilter=map.magFilter=NearestFilter;map.needsUpdate=true;
 const material=new MeshStandardMaterial({map,roughness:1}),matrix=new Object3D(),color=new Color();
 for(const zone of ['north','west','floor'] as const){
  const list=stones.filter(s=>s.zone===zone);if(!list.length)continue;
  const mesh=new InstancedMesh(geometry,material,list.length);mesh.name='b33-crater-'+zone;mesh.userData.chunkId='crater/B/'+zone;
  mesh.userData.static=true;
  list.forEach(({box:b,color:t},i)=>{matrix.position.set((b.min[0]!+b.max[0]!)/2,(b.min[1]!+b.max[1]!)/2,(b.min[2]!+b.max[2]!)/2);matrix.scale.set(b.max[0]!-b.min[0]!,b.max[1]!-b.min[1]!,b.max[2]!-b.min[2]!);matrix.updateMatrix();mesh.setMatrixAt(i,matrix.matrix);mesh.setColorAt(i,color.setHex(t));});
  mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.userData.bounds=mesh.boundingBox?.clone();group.add(mesh);
 }
 const boxes=stones.map(s=>s.box);group.userData.colliders=boxes;owner.add(group);owner.userData.colliders=[...original,...boxes];
 let disposed=false;
 return {group,sites,stones,boxes,stats:()=>({clusters:sites.length,north:stones.filter(s=>s.zone==='north').length,west:stones.filter(s=>s.zone==='west').length,floor:stones.filter(s=>s.zone==='floor').length,batches:group.children.length}),dispose(){
  if(disposed)return;disposed=true;group.removeFromParent();owner.userData.colliders=(owner.userData.colliders as Box[]).filter(b=>!boxes.includes(b));for(const m of group.children)(m as InstancedMesh).dispose();group.clear();geometry.dispose();material.dispose();map.dispose();
 }};
}
