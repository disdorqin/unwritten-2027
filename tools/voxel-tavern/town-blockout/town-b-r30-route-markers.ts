import {BoxGeometry,BufferGeometry,CanvasTexture,Group,Mesh,MeshStandardMaterial,NearestFilter,PlaneGeometry,SRGBColorSpace} from 'three';
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
  const boardYaw=yaw+Math.PI/2;
  const cos=Math.abs(Math.cos(boardYaw)),sin=Math.abs(Math.sin(boardYaw));
  const hw=.40*cos+.075*sin,hd=.40*sin+.075*cos;
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
  return {id:'haul-marker-'+(i+1),progress:t,post,low,yaw,boardYaw,boxes,clearance,obstacle,sight,viewFeet,direction:{east:de,north:dn}};
 });
 return sites;
}
type Site=ReturnType<typeof surveyBR30RouteMarkers>[number];
/** Static visual navigation only. No hotspot, reward, unlock, fast travel,
 * or second shaft. The two faces point toward opposite B01 approaches. */
export function installBR30RouteMarkers(road:Road){
 const sites=surveyBR30RouteMarkers(road);
 const group=new Group();group.name='b-r30-haul-wayfinding';
 const wood=new MeshStandardMaterial({color:0x73583f,roughness:.97});
 const iron=new MeshStandardMaterial({color:0x6b5543,roughness:.93});
 const stone=new MeshStandardMaterial({color:0x756f65,roughness:1});
 const inlay=new MeshStandardMaterial({color:0xc3aa7b,roughness:.9});
 const materials=[wood,iron,stone,inlay],batches=new Map<MeshStandardMaterial,BufferGeometry[]>();
 function part(site:Site,mat:MeshStandardMaterial,g:BufferGeometry,x:number,y:number,z:number,rotation=site.yaw){
  g.translate(x,y,z).rotateY(rotation).translate(site.post.east,site.post.height,-site.post.north);
  const list=batches.get(mat)??[];list.push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();batches.set(mat,list);
 }
 function box(site:Site,mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number){part(site,mat,new BoxGeometry(w,h,d),x,y,z)}
 // Shared paint materials: four boards, two faces, only two text batches.
 function painted(label:string){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=160;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.fillStyle='#634831';ctx.fillRect(0,0,256,160);
  ctx.strokeStyle='#bda27c';ctx.lineWidth=7;ctx.strokeRect(9,9,238,142);
  ctx.fillStyle='#f3e3c0';ctx.font='bold 80px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(label,102,81);
  // Geometric forward arrow, independent of font glyph support.
  ctx.beginPath();ctx.moveTo(203,25);ctx.lineTo(177,65);ctx.lineTo(193,65);ctx.lineTo(193,131);ctx.lineTo(213,131);ctx.lineTo(213,65);ctx.lineTo(229,65);ctx.closePath();ctx.fill();
  const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.generateMipmaps=false;
  const mat=new MeshStandardMaterial({map,roughness:.96});materials.push(mat);return mat;
 }
 const towardWell=painted('井口'),towardRim=painted('坑口');
 function board(site:Site){
  const yaw=site.boardYaw,y=1.46;
  const panel=(mat:MeshStandardMaterial,x:number,h:number,z:number,w:number,hh:number,d:number)=>
   part(site,mat,new BoxGeometry(w,hh,d),x,h,z,yaw);
  panel(wood,0,y,0,.78,.48,.10);
  for(const h of [y-.228,y+.228])panel(inlay,0,h,0,.79,.035,.13);
  for(const x of [-.37,.37])panel(iron,x,y,0,.035,.47,.13);
  for(const x of [-.34,.34])for(const h of [y-.19,y+.19])for(const z of [-.062,.062])panel(iron,x,h,z,.028,.028,.014);
  // +Z faces the downstream traveller, who needs the upward return;
  // -Z faces the descending traveller. Both arrows mean continue ahead.
  for(const [sign,mat] of [[1,towardRim],[-1,towardWell]] as const){
   if(!mat)continue;
   const geo=new PlaneGeometry(.69,.39);
   if(sign<0)geo.rotateY(Math.PI);
   part(site,mat,geo,0,y,sign*.052,yaw);
  }
 }
 for(const site of sites){
  const depth=site.post.height-site.low;
  box(site,stone,0,.04-depth/2,0,.36,.14+depth,.36);
  box(site,wood,0,.89,0,.145,1.78,.145);
  for(const y of [.18,1.12])box(site,iron,0,y,0,.18,.10,.18);
  for(const z of [-.085,.085])box(site,iron,0,1.07,z,.075,.33,.025);
  board(site);
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
