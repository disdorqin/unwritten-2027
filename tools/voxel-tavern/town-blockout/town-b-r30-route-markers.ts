import {BoxGeometry,BufferGeometry,CanvasTexture,ExtrudeGeometry,Group,Mesh,MeshStandardMaterial,NearestFilter,PlaneGeometry,Shape,SRGBColorSpace} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Box} from './landmark-kit';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater';
import {townC2CraterCentralMoundProtectedSites as protectedSites} from './town-c2-crater-central-mound';

type Road=Pick<ReturnType<typeof mountWestCraterRoad>,'anchor'|'heightAt'|'group'>;
type EN={east:number;north:number};
const fixture=createMeteorCrater(meteorCraterFixturePlan);
// Four surveyed sites, not one marker on every turn or a second route.
const plans=[{t:.20,side:-1},{t:.485,side:1},{t:.75,side:1},{t:.93,side:1}] as const;
const gap=(p:EN,b:Box)=>Math.hypot(Math.max(b.min[0]-p.east,0,p.east-b.max[0]),Math.max(b.min[2]+p.north,0,-p.north-b.max[2]));
export function surveyBR30RouteMarkers(road:Road){
 const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw);
 const world=(t:number):EN=>{const p=fixture.mainTrailPoint(t);return {east:a.east+p.east*c+p.north*s,north:a.north+p.north*c-p.east*s}};
 const trail=Array.from({length:2001},(_,i)=>world(i/2000));
 const walls=road.group.userData.colliders as Box[];
 if(!Array.isArray(walls))throw Error('R30 wayfinding requires the same west collision channel');
 const sites=plans.map(({t,side},i)=>{
  const foot=world(t),before=world(t-.001),after=world(t+.001);
  const len=Math.hypot(after.east-before.east,after.north-before.north),de=(after.east-before.east)/len,dn=(after.north-before.north)/len;
  const east=foot.east-side*dn*1.75,north=foot.north+side*de*1.75;
  const height=road.heightAt(east,north),roadHeight=road.heightAt(foot.east,foot.north);
  if(height===undefined||roadHeight===undefined||Math.abs(height-roadHeight)>.85)throw Error('R30 marker detached from road '+i);
  const samples=[-.16,0,.16].flatMap(x=>[-.16,0,.16].map(z=>road.heightAt(east+x,north+z)));
  if(samples.some(h=>h===undefined||!Number.isFinite(h)))throw Error('R30 marker missing ground '+i);
  const low=Math.min(...samples as number[]),high=Math.max(...samples as number[]);
  if(high-low>.4)throw Error('R30 marker foundation too steep '+i);
  if(Object.values(protectedSites).some(p=>Math.hypot(p.east-east,p.north-north)<p.radius+.5))throw Error('R30 marker at protected site '+i);
  const post={east,north,height:high};
  const yaw=Math.atan2(dn,de);
  const cos=Math.abs(Math.cos(yaw)),sin=Math.abs(Math.sin(yaw));
  const hw=.42*cos+.072*sin,hd=.42*sin+.072*cos;
  const boxes:Box[]=[
   {min:[east-.22,low-.05,-north-.22],max:[east+.22,high+.13,-north+.22]},
   {min:[east-.10,high,-north-.10],max:[east+.10,high+1.78,-north+.10]},
   {min:[east-hw,high+1.15,-north-hd],max:[east+hw,high+1.75,-north+hd]},
  ];
  const clearance=Math.min(...boxes.flatMap(b=>trail.map(p=>gap(p,b))));
  if(clearance<1.27)throw Error('R30 marker narrows haul tread '+i+' '+clearance);
  const obstacle=Math.min(...walls.filter(b=>b.min[1]<high+1.85&&b.max[1]>low-.05).map(b=>gap(post,b)));
  if(obstacle<1.05)throw Error('R30 marker overlaps an existing object '+i);
  const viewFeet=[world(t-.006),world(t+.006)].map(p=>({...p,height:road.heightAt(p.east,p.north)!}));
  let sight=Infinity;
  for(const p of viewFeet)for(let j=1;j<20;j++){
   const u=j/20,h=road.heightAt(p.east+(east-p.east)*u,p.north+(north-p.north)*u);
   if(h===undefined)throw Error('R30 marker missing sight ground '+i);
   sight=Math.min(sight,p.height+1.65+(high+1.56-p.height-1.65)*u-h);
  }
  if(sight<.25)throw Error('R30 marker not visible from its tread '+i);
  return {id:'haul-marker-'+(i+1),progress:t,post,low,yaw,boxes,clearance,obstacle,sight,viewFeet,direction:{east:de,north:dn}};
 });
 return sites;
}
type Site=ReturnType<typeof surveyBR30RouteMarkers>[number];
/** Static visual navigation only. No hotspot, reward, unlock, fast travel,
 * or second shaft. Arrow silhouettes follow the actual B01 tangent. */
export function installBR30RouteMarkers(road:Road){
 const sites=surveyBR30RouteMarkers(road);
 const group=new Group();group.name='b-r30-haul-wayfinding';
 const wood=new MeshStandardMaterial({color:0x73583f,roughness:.97});
 const iron=new MeshStandardMaterial({color:0x6b5543,roughness:.93});
 const stone=new MeshStandardMaterial({color:0x756f65,roughness:1});
 const inlay=new MeshStandardMaterial({color:0xc3aa7b,roughness:.9});
 const materials=[wood,iron,stone,inlay],batches=new Map<MeshStandardMaterial,BufferGeometry[]>();
 function part(site:Site,mat:MeshStandardMaterial,g:BufferGeometry,x:number,y:number,z:number){
  g.translate(x,y,z).rotateY(site.yaw).translate(site.post.east,site.post.height,-site.post.north);
  const list=batches.get(mat)??[];list.push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();batches.set(mat,list);
 }
 function box(site:Site,mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number){part(site,mat,new BoxGeometry(w,h,d),x,y,z)}
 function board(site:Site,down:boolean){
  const dir=down?1:-1,y=down?1.59:1.30;
  const sh=new Shape();
  const path=[[-.40,-.108],[.23,-.108],[.23,-.149],[.42,0],[.23,.149],[.23,.108],[-.40,.108]];
  for(const [i,p] of path.entries())i?sh.lineTo(dir*p[0],p[1]):sh.moveTo(dir*p[0],p[1]);
  sh.closePath();
  const geo=new ExtrudeGeometry(sh,{depth:.09,bevelEnabled:false});geo.translate(0,0,-.045);
  part(site,wood,geo,0,y,0);
  for(const x of [-.26,.08])for(const z of [-.052,.052])box(site,iron,x*dir,y,z,.052,.052,.016);
  // Paint the actual arrow tip (no glow or invisible UI).
  box(site,inlay,dir*.26,y,0,.045,.15,.096);
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.fillStyle='#72563d';ctx.fillRect(0,0,256,96);
  ctx.fillStyle='#ead7ab';ctx.font='bold 64px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(down?'井口':'坑口',128,49);
  const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.generateMipmaps=false;
  const mat=new MeshStandardMaterial({map,roughness:.96});materials.push(mat);
  for(const sign of [-1,1]){
   const mesh=new Mesh(new PlaneGeometry(.43,.16),mat);
   mesh.rotation.y=site.yaw+(sign<0?Math.PI:0);
   const x=-dir*.075,z=sign*.053;
   mesh.position.set(site.post.east+Math.cos(site.yaw)*x+Math.sin(site.yaw)*z,site.post.height+y,-site.post.north-Math.sin(site.yaw)*x+Math.cos(site.yaw)*z);
   group.add(mesh);
  }
 }
 for(const site of sites){
  const depth=site.post.height-site.low;
  box(site,stone,0,.04-depth/2,0,.36,.14+depth,.36);
  box(site,wood,0,.89,0,.145,1.78,.145);
  for(const y of [.18,1.12])box(site,iron,0,y,0,.18,.10,.18);
  for(const z of [-.085,.085])box(site,iron,0,1.07,z,.075,.33,.025);
  board(site,true);board(site,false);
 }
 for(const [mat,parts] of batches){
  const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());
  if(!g)throw Error('R30 wayfinding batching failed');g.computeBoundingSphere();group.add(new Mesh(g,mat));
 }
 const boxes=sites.flatMap(s=>s.boxes);
 road.group.add(group);
 road.group.userData.colliders=[...road.group.userData.colliders,...boxes];
 let disposed=false;
 return {group,sites,boxes,dispose(){if(disposed)return;disposed=true;group.removeFromParent();
  road.group.userData.colliders=(road.group.userData.colliders as Box[]).filter(b=>!boxes.includes(b));
  group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose()});
  for(const mat of materials){mat.map?.dispose();mat.dispose();}
 }};
}
