import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D,PointLight,Mesh,PlaneGeometry,MeshBasicMaterial,CanvasTexture,SRGBColorSpace} from 'three';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {za22CloudSurfaceAt,za07CloudLookouts,cloudTerminal,za22CloudRunway} from './town-za22-cloud-route';
import {summitAssemblyAnchor} from './main-summit-assembly';
import {za22GateSeamNorth} from './town-za22-mountain-gate';
import {mountCloudTerraceArt} from './main-summit-cloud-terrace-art';
import {mountC2FrontSeam} from './town-night-c2-front-seam';
import {mountMainSummitRegistration,createMainSummitRegistrationLandmarks} from './main-summit-registration';
import {mountStarportAssemblySite} from './starport-assembly-site';
import {townD2CloudTerraceContract} from './town-d2-cloud-terrace-transform';
import {sampleTownD2R30Height} from './town-d2-r30-domain';

export type TerraceFoot={east:number;north:number;height:number};
export const ridgeCloudHandoff=Object.freeze({
 terminal:cloudTerminal,assembly:{east:324,north:657,height:347},assemblyVisitor:{east:324,north:655,height:347},
 runway:{start:{east:za22CloudRunway.start,north:za22CloudRunway.north,height:347},end:{east:za22CloudRunway.end,north:za22CloudRunway.north,height:347},width:za22CloudRunway.width},
 gate:{east:summitAssemblyAnchor.east,north:za22GateSeamNorth,height:347},
 lookouts:za07CloudLookouts,
});
/** I3 candidate: canonical mask AND physical raster must both agree.
 * No new entrance permission, no authority change, no sky-domain shortcut. */
export function ridgeCloudFootAt(field:FrontRidgeR30Field,e:number,n:number,r=.27){
 if(![e,n,r].every(Number.isFinite)||r<0)return;
 const canonical=za22CloudSurfaceAt(e,n,r),h=field.heightAt(e,n);
 // This pre-existing cloud apron is a level 347m walking surface.
 // Reject even tiny crest intrusions instead of rounding a non-level foot.
 if(canonical===undefined||h===undefined||Math.abs(h-canonical)>.08||Math.abs(h-347)>1e-6)return;
 for(const [dx,dn]of [[r,0],[-r,0],[0,r],[0,-r]]){
  const y=field.heightAt(e+dx!,n+dn!);
  if(y===undefined||Math.abs(y-h)>.09)return;
 }
 return h;
}
type Obstacle=(e:number,n:number,y:number,r:number)=>boolean;
/** Finite path survey over the actual supported apron. Each grid link
 * also checks its midpoint, so it cannot hop over a narrow blocked strip. */
export function surveyCloudFootpath(field:FrontRidgeR30Field,start:TerraceFoot,target:TerraceFoot,blocked:Obstacle,reach=.65){
 const scale=4,ix=(e:number,n:number)=>Math.round(e*scale)+','+Math.round(n*scale);
 const origin={east:Math.round(start.east*scale)/scale,north:Math.round(start.north*scale)/scale};
 const queue=[origin],prev=new Map<string,string|null>([[ix(origin.east,origin.north),null]]);
 const valid=(e:number,n:number)=>{const y=ridgeCloudFootAt(field,e,n);return y!==undefined&&!blocked(e,n,y,.27)};
 if(!valid(origin.east,origin.north))return [];
 for(let k=0;k<queue.length;k++){
  const a=queue[k]!,key=ix(a.east,a.north);
  if(Math.hypot(a.east-target.east,a.north-target.north)<=reach){
   const path:TerraceFoot[]=[];for(let p:string|null=key;p!==null;p=prev.get(p)??null){
    const [x,z]=p.split(',').map(Number),e=x!/scale,n=z!/scale;path.push({east:e,north:n,height:field.heightAt(e,n)!});
   }
   return path.reverse();
  }
  for(const [dx,dn]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const e=a.east+dx!/scale,n=a.north+dn!/scale,id=ix(e,n);
   if(prev.has(id)||!valid(e,n)||!valid((e+a.east)/2,(n+a.north)/2))continue;
   prev.set(id,key);queue.push({east:e,north:n});
  }
 }
 return [];
}
export const productionCloudSeam=Object.freeze({east:townD2CloudTerraceContract.worldAnchor.east,
 north:townD2CloudTerraceContract.worldAnchor.north+townD2CloudTerraceContract.seamNorthLocal,
 height:townD2CloudTerraceContract.arrivalHeight,gateNorth:za22GateSeamNorth});
export function auditProductionCloudSeam(field:FrontRidgeR30Field){
 const s=productionCloudSeam;let samples=0,maxError=0;
 for(let e=s.east-5.5;e<=s.east+5.5;e+=.25)for(let n=654.5;n<=s.gateNorth;n+=.25){
  const h=field.heightAt(e,n);samples++;maxError=Math.max(maxError,Math.abs((h??Infinity)-s.height));
 }
 const gateHeight=sampleTownD2R30Height(0,-10);
 return {samples,maxError,gateHeight,seamNorth:s.north,gateNorth:s.gateNorth,physicalReady:maxError<=.025&&gateHeight===s.height,domainReady:false as const};
}
export function mountRidgeCloudTerrace(owner:Object3D,field:FrontRidgeR30Field,extraBlocked:Obstacle=()=>false,closedSeam=false){
 const group=new Group();group.name='d-r30-cloud-terrace-physical';owner.add(group);
 const local=new Group();local.position.set(summitAssemblyAnchor.east,0,-summitAssemblyAnchor.north);group.add(local);
 const art=mountCloudTerraceArt(local);
 const starport=mountStarportAssemblySite(group,ridgeCloudHandoff.assembly);
 const seam=closedSeam&&auditProductionCloudSeam(field).physicalReady?mountC2FrontSeam(field.heightAt,true):undefined;
 if(seam)group.add(seam.group);
 const registration=mountMainSummitRegistration(group,createMainSummitRegistrationLandmarks(),'cloud-deck');
 let closedSign:Mesh<PlaneGeometry,MeshBasicMaterial>|undefined;
 const geo=new BoxGeometry(),mat=new MeshLambertMaterial({color:'#ffffff'}),glow=new MeshLambertMaterial({color:'#f6cb8a'});
 const tmp=new Object3D(),tint=new Color(),parts:{matrix:import('three').Matrix4;shade:string}[]=[],cores:typeof parts=[];
 const solids:{e:number;n:number;y:number;w:number;d:number;h:number}[]=[],lights:PointLight[]=[],boards:Mesh<PlaneGeometry,MeshBasicMaterial>[]=[];
 const add=(e:number,n:number,y:number,w:number,d:number,h:number,shade:string,solid=false,light=false)=>{
  tmp.position.set(e,y,-n);tmp.rotation.set(0,0,0);tmp.scale.set(w,h,d);tmp.updateMatrix();(light?cores:parts).push({matrix:tmp.matrix.clone(),shade});
  if(solid)solids.push({e,n,y,w,d,h});
 };
 const physicalBlocked=(e:number,n:number,y:number,r=.27)=>{
  const stampBlocked=registration.colliders.some(b=>y+1.8>b.min[1]&&y<b.max[1]&&Math.hypot(Math.max(b.min[0]-e,e-b.max[0],0),Math.max(b.min[2]+n,-n-b.max[2],0))<r);
  return stampBlocked||!!seam?.blocked(e,n,y,r)||art.blocked(e-summitAssemblyAnchor.east,n-summitAssemblyAnchor.north,y,r,1.8)||
   starport.blocked({east:e,north:n,height:y},r,1.8)||solids.some(s=>y+1.8>s.y-s.h/2&&y<s.y+s.h/2&&Math.hypot(Math.max(0,Math.abs(e-s.e)-s.w/2),Math.max(0,Math.abs(n-s.n)-s.d/2))<r);
 };
 const blocked=(e:number,n:number,y:number,r=.27)=>physicalBlocked(e,n,y,r)||extraBlocked(e,n,y,r);
 const flat=(e:number,n:number)=>Math.abs((field.heightAt(e,n)??0)-347)<.025;
 const stone=['#858b82','#96978a','#6f7979','#a3a090','#78837e'];
 // Real terrace snow remains the physical support. Thin paving gives
 // the formerly bare terminal spine a stone-and-brass visual language.
 let paving=0;
 for(let n=644;n<=664;n+=.66)for(let e=316;e<=351;e+=.66){
  if(e>=310&&n>=659.2&&n<=664.8)continue; // full aircraft swept lane
  if(e>=320&&e<=328&&n>=653.5&&n<=659.8)continue; // existing rack/staging
  if(!ridgeCloudFootAt(field,e,n,.08)||!flat(e,n)||blocked(e,n,347,.4))continue;
  const k=Math.abs(Math.round(e*17+n*31))%stone.length;
  add(e,n,347+.014,.615,.615,.028,stone[k]!);
  if(k===4)add(e+.12,n+.10,347+.033,.19,.22,.018,'#d5e0e2');
  paving++;
 }
 // Two exposed directions receive real low parapets with open view
 // above them, outside the authorized foot corridor; west/north use
 // existing ring/arrival art instead of overlapping it.
 for(const [i,p]of za07CloudLookouts.entries()){
  if(!flat(p.east,p.north))continue;
  add(p.east,p.north,347+.022,.67,.67,.044,'#aa936a');
  add(p.east,p.north,347+.047,.38,.38,.014,'#52666a');
  if(i>1)continue;
  for(let j=-2;j<=2;j++){
   const e=i===0?p.east+j*.82:p.east+1.35,n=i===0?p.north-1.45:p.north+j*.82;
   if(!flat(e,n))continue;
   add(e,n,347+.26,.77,.77,.52,stone[(j+7)%stone.length]!,true);
   add(e,n,347+.56,.82,.82,.10,'#a4acac',true);
   if(Math.abs(j)===2){
    add(e,n,347+.82,.19,.19,.45,'#6d4d39',true);
    add(e,n,348.08,.42,.42,.11,'#465158');
    add(e,n,348.26,.29,.29,.27,'#f5c58c',false,true);
    add(e,n,348.46,.45,.45,.12,'#465158');
    for(const x of [-.18,.18])for(const z of [-.18,.18])add(e+x,n+z,348.26,.037,.037,.35,'#465158');
    const lamp=new PointLight('#ffc78b',0,6,2);lamp.position.set(e,348.25,-n);group.add(lamp);lights.push(lamp);
   }
  }
  // Bronze direction plaque, oriented toward a visitor on the lookout.
  const e=i===0?p.east+1.1:p.east+1.28,n=i===0?p.north-1.25:p.north+1.1;
  if(typeof document==='undefined'||!flat(e,n))continue;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=224;const ctx=canvas.getContext('2d');if(!ctx)continue;
  ctx.fillStyle='#3b4343';ctx.fillRect(0,0,512,224);ctx.strokeStyle='#c8a46c';ctx.lineWidth=10;ctx.strokeRect(10,10,492,204);
  ctx.textAlign='center';ctx.fillStyle='#f5e4c9';ctx.font='bold 48px Microsoft YaHei,sans-serif';ctx.fillText(p.title,256,92,475);
  ctx.font='30px Microsoft YaHei,sans-serif';ctx.fillText(i===0?'远眺未写镇':'远眺冰晶宫',256,157,475);
  const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;
  const board=new Mesh(new PlaneGeometry(1.28,.56),new MeshBasicMaterial({map}));
  board.rotation.y=i===0?Math.PI:-Math.PI/2;board.position.set(e,347+.98,-n);group.add(board);boards.push(board);
 }
 // The canonical swap is 2.75m before the main-summit mesh. Its
 // walking datum is real terrain, not an elevated teleport pad.
 // While the independent authority is absent, show a physical closed
 // gate across the surveyed approach instead of an invisible domain wall.
 if(closedSeam){
  const s=productionCloudSeam;
  if(auditProductionCloudSeam(field).physicalReady){
   for(const e of [s.east-5.6,s.east-2,s.east+2,s.east+5.6]){
    add(e,s.north,347+.55,.48,.55,1.1,'#78848c',true);
    add(e,s.north,348.18,.26,.26,.65,'#48555b',true);
    add(e,s.north,348.53,.48,.48,.12,'#ccd6db');
   }
   // Central old fixed bar is replaced by the real C2 controlled bar.
   for(const e of [s.east-3.8,s.east+3.8]){
    add(e,s.north,347+.62,e===s.east?3.75:3.35,.16,1.24,'#5b625f',true);
    add(e,s.north,348.04,e===s.east?3.75:3.35,.2,.14,'#bca06b');
   }
   for(const e of [s.east-2,s.east+2])add(e,s.north,349.4,.45,.48,2.2,'#56636a',true);
   add(s.east,s.north,350.55,4.5,.6,.40,'#6d5240');
   if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;const ctx=canvas.getContext('2d');
    if(ctx){ctx.fillStyle='#343e43';ctx.fillRect(0,0,768,256);ctx.strokeStyle='#c6a675';ctx.lineWidth=10;ctx.strokeRect(8,8,752,240);
     ctx.fillStyle='#f6e9d3';ctx.textAlign='center';ctx.font='bold 58px Microsoft YaHei,sans-serif';ctx.fillText('主峰山门 · 暂闭',384,102);
     ctx.font='36px Microsoft YaHei,sans-serif';ctx.fillText('跨域线路验收中 · 请返回云海台',384,191,720);
     const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;
     const board=new Mesh(new PlaneGeometry(3.6,1.2),new MeshBasicMaterial({map}));
     board.position.set(s.east,349.35,-s.north+.34);group.add(board);boards.push(board);closedSign=board;}
   }
  }
 }
 // Preserve original runway direction and width; markings are only visual.
 for(let e=za22CloudRunway.start+2;e<za22CloudRunway.end-1;e+=4)add(e,za22CloudRunway.north,347+.018,1.6,.16,.036,'#b39a69');
 const batches:InstancedMesh[]=[];
 for(const [m,list]of [[mat,parts],[glow,cores]]as const){
  if(!list.length)continue;const mesh=new InstancedMesh(geo,m,list.length);
  list.forEach((p,i)=>{mesh.setMatrixAt(i,p.matrix);if(m===mat)mesh.setColorAt(i,tint.set(p.shade))});
  mesh.computeBoundingSphere();group.add(mesh);batches.push(mesh);
 }
 function action(p:TerraceFoot){
  if(ridgeCloudFootAt(field,p.east,p.north)===undefined||blocked(p.east,p.north,p.height))return;
  if(seam?.closed()&&Math.hypot(p.east-productionCloudSeam.east,p.north-(productionCloudSeam.north-1.2))<1.6)
   return {title:'主峰山门 · 暂闭',message:'云海台与主峰接驳地表已对齐。独立主峰联机房间尚未认证，请沿云海台原路返回。'};
  const q=za07CloudLookouts.find(a=>Math.hypot(a.east-p.east,a.north-p.north)<=1.35&&Math.abs(a.height-p.height)<.55);
  if(q)return {title:q.title,message:q.message};
 }
 let disposed=false;
 let seamFailure:string|undefined;
 function certifySeam(rear:(e:number,n:number)=>number|undefined){
  seamFailure=undefined;
  if(!seam||!seam.plan.supported)return false;
  // The actual replacement is tested in its open pose in one synchronous
  // transaction; refusal restores both the rendered and collision bar.
  seam.open();let accepted=false;
  try{
   for(let n=662.5;n<=669;n+=.25)for(let e=298.75;e<=301.25;e+=.25){
    const h=field.heightAt(e,n);
    if(h===undefined||Math.abs(h-347)>.08||blocked(e,n,h,.27)){seamFailure=`front ${e},${n},${h}`;return false;}
    if(n>=666.5){const rh=rear(e,n);if(rh===undefined||Math.abs(rh-h)>.08){seamFailure=`rear ${e},${n},${rh}`;return false;}}
   }
   // A real terrace foot must reach the open corridor. No standalone gate.
   // Use the certified terminal apron, not the moving cabin's centre.
   const path=surveyCloudFootpath(field,{east:324,north:655,height:347},{east:300,north:662.5,height:347},blocked,.4);
   if(!path.length){seamFailure='terminal apron disconnected';return false;}
   accepted=true;return true;
  }finally{if(!accepted)seam.close();if(closedSign)closedSign.visible=!accepted;}
 }
 return {group,art,starport,paving,blocked,physicalBlocked,action,seam,certifySeam,get seamFailure(){return seamFailure;},
  footAt:(e:number,n:number,r=.27)=>ridgeCloudFootAt(field,e,n,r),
  survey:(a:TerraceFoot,b:TerraceFoot,reach=.65)=>surveyCloudFootpath(field,a,b,blocked,reach),
  setNight(night:boolean){art.setNight(night);glow.emissive.set(night?'#f6cb8a':'#000000');glow.emissiveIntensity=night?.7:0;lights.forEach(l=>l.intensity=night?5:0)},
  dispose(){if(disposed)return;disposed=true;art.dispose();starport.dispose();registration.dispose();seam?.dispose();batches.forEach(b=>b.dispose());geo.dispose();mat.dispose();glow.dispose();boards.forEach(b=>{b.geometry.dispose();b.material.map?.dispose();b.material.dispose()});group.removeFromParent();group.clear()}};
}
