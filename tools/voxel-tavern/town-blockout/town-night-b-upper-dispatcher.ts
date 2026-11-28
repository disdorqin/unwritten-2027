import {BoxGeometry,CanvasTexture,Color,Group,InstancedMesh,Mesh,MeshBasicMaterial,MeshLambertMaterial,Object3D,PlaneGeometry,SRGBColorSpace} from 'three';
import {voxelPersonParts,type VoxelPersonPart} from './town-voxel-person';
import type {createTownD2R30Ropeway} from './town-d2-r30-ropeway';
import type {createNightBLine2Service} from './town-night-b-summit-line2-service';
import type {Za36CableRepairState} from './town-za36-cable-repair';
type Ropeway=ReturnType<typeof createTownD2R30Ropeway>;
type Service=ReturnType<typeof createNightBLine2Service>;
type Foot={east:number;north:number;height:number};
type Copy={title:string;lines:readonly string[]};
const palette=['#d9a377','#233147','#36536b','#e4d29b','#2e3748','#e0b558','#efd3a0','#6e4939'];
const extra:readonly VoxelPersonPart[]=[[[0,1.91,.12],[.50,.12,.46],1],[[0,1.855,.30],[.46,.055,.19],1],[[0,1.92,.33],[.09,.065,.025],5],[[0,1.14,.21],[.05,.32,.03],5]];
export function nightBUpperDispatchCopy(service:Pick<Service,'serviceOpen'|'cabinStates'|'firstRun'>,state:Za36CableRepairState|undefined,synchronized:boolean,rideMs:number):Copy{
 const duration=Math.round(rideMs/1000),time=Math.floor(duration/60)+'分'+String(duration%60).padStart(2,'0')+'秒';
 if(!synchronized||!state||state.line!==2)return {title:'主峰线 · 等待同步',lines:['尚未收到权威班次','请在站内等候','不可跨越护栏']};
 if(state.stage==='dormant')return {title:'主峰线 · 未启用',lines:['两厢停在绝顶','沿合法山路登顶后放下首厢','返回云海台检修机房']};
 const cabins=service.cabinStates();
 const first=service.firstRun();
 if(state.stage==='one-station'&&first?.phase!=='first')return {title:'主峰线 · 待检修',lines:[`锈闸 ${state.impacts}/9 · 紧缆 ${state.cableTurns}/3`,`配重 ${state.weightMounted.filter(Boolean).length}/4 · 单程约${time}`,'三处检修完成后按钟运行']};
 if(!cabins)return {title:'主峰线 · 暂停发车',lines:['等待权威班次','乘客到站后方可下车','夜间停运，暴雪不停运']};
 const text=cabins.map(c=>`${c.index===0?'A':'B'}厢：${c.station?c.station==='cloud-deck'?'云海台停靠':'绝顶停靠':c.direction==='up'?'上行':'下行'}`);
 return {title:first?.phase==='first'?'主峰线 · 首次下行':service.serviceOpen()?'主峰线 · 正常运营':'主峰线 · 停车等候',lines:[text.join('   '),`单程约${time} · 8m/s`,'站停按E登乘/下车 · 暴雪不停运']};
}
/** Reuse the original C-10 dispatcher stand/visitor relative to the real
 * cloud-station hall; one static instanced batch for person and counter.
 * Both physical boards reflect the sole B service, not a separate schedule. */
export function mountNightBUpperDispatcher(ropeway:Ropeway){
 const low=ropeway.stations.stations['cloud-deck'],high=ropeway.stations.stations.summit,hall=low.hall;
 const stand:Foot={east:hall.east+2.72,north:hall.north+3,height:hall.height};
 const visitor:Foot={east:hall.east+1.25,north:hall.north+3,height:hall.height};
 const counter={east:hall.east+2,north:hall.north+3,height:hall.height};
 const group=new Group();group.name='night-b-upper-dispatcher';low.group.add(group);
 const cube=new BoxGeometry(),material=new MeshLambertMaterial({color:'#ffffff'}),parts=[...voxelPersonParts,...extra];
 const batch=new InstancedMesh(cube,material,parts.length+3);batch.name='night-b-dispatcher-person-counter';
 const obj=new Object3D(),col=new Color();
 parts.forEach(([[x,y,z],size,c],i)=>{obj.position.set(stand.east-z,stand.height+y,-stand.north+x);obj.rotation.set(0,-Math.PI/2,0);obj.scale.set(...size);obj.updateMatrix();batch.setMatrixAt(i,obj.matrix);batch.setColorAt(i,col.set(palette[c]??palette[0]!));});
 for(const [i,y,w,d,r,c] of [[0,.44,.50,1.15,.88,'#614a3a'],[1,.93,.62,1.36,.10,'#9b7251'],[2,1.015,.33,.43,.07,'#4b606d']] as const){obj.position.set(counter.east,counter.height+y,-counter.north);obj.rotation.set(0,0,0);obj.scale.set(w,r,d);obj.updateMatrix();batch.setMatrixAt(parts.length+i,obj.matrix);batch.setColorAt(parts.length+i,col.set(c));}
 batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();group.add(batch);
 const signs:{mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;tex:CanvasTexture}[]=[];
 if(typeof document!=='undefined')for(const s of [low,high]){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');if(!ctx)continue;
  const tex=new CanvasTexture(canvas);tex.colorSpace=SRGBColorSpace;
  const mesh=new Mesh(new PlaneGeometry(2.4,1.2),new MeshBasicMaterial({map:tex}));mesh.name='night-b-line2-timetable';
  mesh.rotation.y=-Math.PI/2;mesh.position.set(s.bounds.east-.355,s.hall.height+1.95,-(s.hall.north+4.6));s.group.add(mesh);signs.push({mesh,canvas,ctx,tex});
 }
 let copy:Copy|undefined,signature='',disposed=false;
 function update(service:Service,state:Za36CableRepairState|undefined,sync:boolean){
  if(disposed)return;const next=nightBUpperDispatchCopy(service,state,sync,ropeway.cable.rideMs),key=JSON.stringify(next);if(key===signature)return;signature=key;copy=next;group.userData.timetable=copy;
  for(const {canvas,ctx,tex} of signs){const w=canvas.width,h=canvas.height;ctx.fillStyle='#26343c';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#cfad73';ctx.lineWidth=10;ctx.strokeRect(12,12,w-24,h-24);ctx.textAlign='center';ctx.fillStyle='#f8e8c5';ctx.font='bold 63px Microsoft YaHei,sans-serif';ctx.fillText(next.title,w/2,105,w-70);ctx.font='42px Microsoft YaHei,sans-serif';next.lines.forEach((v,i)=>ctx.fillText(v,w/2,225+i*103,w-70));tex.needsUpdate=true;}
 }
 function blocked(e:number,n:number,h:number,r=.27,b=1.8){
  if(h+b<=hall.height||h>=hall.height+1.98)return false;
  return Math.hypot(Math.max(0,Math.abs(e-stand.east)-.20),Math.max(0,Math.abs(n-stand.north)-.50))<r||
    h<hall.height+1.05&&Math.hypot(Math.max(0,Math.abs(e-counter.east)-.31),Math.max(0,Math.abs(n-counter.north)-.68))<r;
 }
 function available(p:Foot){return !disposed&&Math.abs(p.height-visitor.height)<=.43&&Math.hypot(p.east-visitor.east,p.north-visitor.north)<=.8&&!blocked(p.east,p.north,p.height);}
 return {group,stand,visitor,blocked,available,update,notice:()=>copy?copy.title+'：'+copy.lines.join('；'):undefined,dispose(){if(disposed)return;disposed=true;group.removeFromParent();batch.dispose();cube.dispose();material.dispose();for(const s of signs){s.mesh.removeFromParent();s.mesh.geometry.dispose();s.mesh.material.dispose();s.tex.dispose();}}};
}
