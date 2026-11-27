import {BoxGeometry,CanvasTexture,Group,Mesh,MeshBasicMaterial,MeshLambertMaterial,NearestFilter,PlaneGeometry,Raycaster,SRGBColorSpace,Vector3} from 'three';
import type {UndergroundWater90Stats} from './town-c2-underground-water-minus90.js';
import type {mountR30DeepBank} from './town-c-r30-deep-bank.js';
type Bank=ReturnType<typeof mountR30DeepBank>;
/** Read the *already adapted* C2 water overlay. No new reader, clock,
 * flood threshold, ore, path permission or actual wading physics. */
export function mountR30WaterReadout(parent:Group,bank:Bank){
 const root=new Group();root.name='r30-waterline-readout';parent.add(root);
 const geo=new BoxGeometry(),wood=new MeshLambertMaterial({color:0x594735}),iron=new MeshLambertMaterial({color:0x80563d}),bronze=new MeshLambertMaterial({color:0xb49b66});
 const boards:{group:Group;canvas?:HTMLCanvasElement;map?:CanvasTexture;mat?:MeshBasicMaterial;geo?:PlaneGeometry;hint:string}[]=[];
 let baseline:number|undefined,pointer:Mesh|undefined,range:number|undefined,face:{x:number;z:number}|undefined;
 const box=(parent:Group,mat:MeshLambertMaterial,x:number,y:number,z:number,w:number,h:number,d:number)=>{
  const m=new Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;
 };
 const sign=(g:Group,y:number,w:number,h:number,hint:string)=>{
  box(g,wood,0,y,0,w+.065,h+.065,.075);
  for(const x of [-w*.46,w*.46])box(g,iron,x,y,.038,.045,h+.065,.04);
  const b:{group:Group;canvas?:HTMLCanvasElement;map?:CanvasTexture;mat?:MeshBasicMaterial;geo?:PlaneGeometry;hint:string}={group:g,hint};
  if(typeof document!=='undefined'){
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=224;
   const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.generateMipmaps=false;
   const mat=new MeshBasicMaterial({map}),geom=new PlaneGeometry(w,h),m=new Mesh(geom,mat);
   m.position.set(0,y,.043);g.add(m);Object.assign(b,{canvas,map,mat,geo:geom});
  }
  boards.push(b);
 };
 const wall=bank.faces.filter(f=>f.nx===-1&&f.nz===0&&Math.abs(f.x-7.4)<.01).sort((a,b)=>Math.abs(a.z-119)-Math.abs(b.z-119))[0];
 if(wall){
  const water=parent.getObjectByName('underground-mine-water');
  parent.updateWorldMatrix(true,true);
  const origin=parent.localToWorld(new Vector3(5.8,-89,wall.z));
  const hit=water&&new Raycaster(origin,new Vector3(0,-1,0),0,4).intersectObject(water)[0];
  if(hit){
   baseline=parent.worldToLocal(hit.point.clone()).y;face={x:wall.x,z:wall.z};range=1.4;
   // Mount flat against the actual surveyed rock face, not a new post
   // in the flooded route. Scale is a visual gauge only.
   const g=new Group();g.name='r30-water-staff';g.position.set(wall.x-.033,baseline,wall.z);g.rotation.y=-Math.PI/2;root.add(g);
   box(g,wood,0,.65,0,.24,1.60,.06);
   for(let i=0;i<=14;i++){
    const y=i*.1;box(g,bronze,i%5===0?.015:.045,y,.034,i%5===0?.19:.115,.014,.018);
   }
   pointer=box(g,bronze,-.15,0,.055,.13,.045,.045);pointer.name='r30-accepted-visual-waterline';pointer.visible=false;
   // This readout gives levels, not depth or playable water guarantees.
   const panel=new Group();panel.position.set(wall.x-.045,baseline,wall.z+.78);panel.rotation.y=-Math.PI/2;root.add(panel);
   sign(panel,1.63,1.13,.50,'水位变化 · 不久留');
  }
 }
 for(const [x,z,normal,hint] of [[-17,126.2,1,'沿主巷返营地'],[47,117.3,-1,'东侧干道 · 绕行']] as const){
  if(!bank.piers.some(p=>p.x===x&&p.z===z))continue;
  const g=new Group();g.name='r30-water-pier-sign';
  // Fastened to the existing pier, within its actual base projection.
  g.position.set(x+(x>0?-.12:0),-91,z+(x>0?0:normal*.16));g.rotation.y=x>0?-Math.PI/2:0;root.add(g);
  sign(g,1.68,.55,.48,hint);
 }
 let current:{level:'low'|'mid'|'high'|undefined;phase:'rise'|'level'|'fall'|undefined;visualRise:number|undefined;configured:boolean}={level:undefined,phase:undefined,visualRise:undefined,configured:false};
 let last='';
 function sync(stats?:UndergroundWater90Stats){
  const valid=stats?.configuration==='host'&&!stats.disposed&&['low','mid','high'].includes(stats.level)&&Number.isFinite(stats.surfaceRiseM);
  current=valid?{level:stats.level,phase:stats.phase,visualRise:stats.surfaceRiseM,configured:true}:{level:undefined,phase:undefined,visualRise:undefined,configured:false};
  const key=JSON.stringify(current);if(key===last)return;last=key;
  if(pointer){
   pointer.visible=!!valid&&stats.waterMode!=='hidden'&&stats.surfaceRiseM>=0&&stats.surfaceRiseM<=(range??0);
   if(pointer.visible)pointer.position.y=stats!.surfaceRiseM;
  }
  for(const b of boards){
   const ctx=b.canvas?.getContext('2d');if(!ctx||!b.map)continue;
   ctx.fillStyle='#42392d';ctx.fillRect(0,0,512,224);ctx.strokeStyle='#a99265';ctx.lineWidth=8;ctx.strokeRect(8,8,496,208);
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#d8c49d';ctx.font='bold 56px Microsoft YaHei,sans-serif';
   const level=current.level==='high'?'高':current.level==='mid'?'中':current.level==='low'?'低':'待定';
   ctx.fillText('水位 · '+level,256,68,470);ctx.font='bold 38px Microsoft YaHei,sans-serif';
   const phase=current.phase==='rise'?'涨':current.phase==='level'?'平':current.phase==='fall'?'落':'—';
   ctx.fillText(current.configured?'今夜自然相 '+phase:'等待水态回执',256,125,470);ctx.font='bold 34px Microsoft YaHei,sans-serif';
   ctx.fillText(b.hint,256,179,470);b.map.needsUpdate=true;
  }
 }
 sync();
 return {group:root,face,baseline,boards,pointer,sync,state:()=>({...current}),
 blocks(x:number,z:number,y:number,r:number,h:number){
  if(!face||baseline===undefined)return false;
  const boxes=[{minZ:face.z-.24,maxZ:face.z+.16,lo:baseline-.15,hi:baseline+1.46},
   {minZ:face.z+.18,maxZ:face.z+1.38,lo:baseline+1.345,hi:baseline+1.915}];
  return boxes.some(b=>y+h>b.lo&&y<b.hi&&Math.hypot(Math.max(0,face!.x-.14-x,x-face!.x),Math.max(0,b.minZ-z,z-b.maxZ))<r);
 },dispose(){root.removeFromParent();boards.forEach(b=>{b.map?.dispose();b.mat?.dispose();b.geo?.dispose()});geo.dispose();wood.dispose();iron.dispose();bronze.dispose();root.clear()}};
}
