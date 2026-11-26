import {BoxGeometry,CanvasTexture,Color,Group,InstancedMesh,Line,LineBasicMaterial,BufferGeometry,Mesh,MeshBasicMaterial,MeshLambertMaterial,Object3D,PlaneGeometry,PointLight,SRGBColorSpace,Vector3,Quaternion} from 'three';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {northRidgeCableAnchors} from './north-ridge-350-terrain';
import {createNorthRidgeCableClock} from './north-ridge-cable-clock';
import {STATION_BOARD_TEXTS} from './front-ridge-switchback-road';

type P={east:number;north:number;height:number};
type Tower=P&{ground:number;station?:boolean};
const stations=[26,140,347] as const;
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
/** Survey physical cable spans against the actual R01 raster.
 * Not a new clock or server authority; A must also check building envelope
 * and the existing rail-station boarding gate before swapping the line. */
export const externalCableDock=Object.freeze({east:526,north:354,height:26,approachNorth:346,halfWidth:3.5,halfDepth:3});
/** Support for the proposed actual deck only; does not grant access to it. */
export function externalCableDockSupport(e:number,n:number,r=.27){
 const p=externalCableDock;
 if(![e,n,r].every(Number.isFinite)||r<0||Math.abs(e-p.east)>p.halfWidth-r||n<p.approachNorth||n>p.north+p.halfDepth-r)return;
 return p.height;
}
export function surveyRidgeCableSpans(field:FrontRidgeR30Field,externalDock=false){
 const anchors=externalDock?[[externalCableDock.east,externalCableDock.north],northRidgeCableAnchors[1]!,northRidgeCableAnchors[2]!] as const:northRidgeCableAnchors;
 const towers:Tower[]=[];
 const ground=(e:number,n:number)=>Math.max(...[-2.65,0,2.65].flatMap(x=>[-1.45,0,1.45].map(z=>field.heightAt(e+x,n+z)??Infinity)));
 for(let part=0;part<2;part++){
  const [ae,an]=anchors[part]!,[be,bn]=anchors[part+1]!;
  const span=Math.hypot(be-ae,bn-an),count=Math.ceil(span/36);
  const points:Tower[]=Array.from({length:count+1},(_,i)=>{
   const t=i/count,east=mix(ae,be,t),north=mix(an,bn,t),g=ground(east,north);
   return {east,north,ground:g,height:i===0?stations[part]!:i===count?stations[part+1]!:Math.max(mix(stations[part]!,stations[part+1]!,t),g+4),station:i===0||i===count};
  });
  for(let pass=0;pass<3;pass++)for(let j=1;j<points.length;j++){
   const a=points[j-1]!,b=points[j]!,len=Math.hypot(b.east-a.east,b.north-a.north),steps=Math.ceil(len);
   for(let k=1;k<steps;k++){
    const t=k/steps,along=(j-1+t)*span/count,clear=Math.min(3,Math.min(along,span-along)*.3);
    const required=ground(mix(a.east,b.east,t),mix(a.north,b.north,t))+clear;
    const need=required-mix(a.height,b.height,t);
    if(need>0){if(!a.station&&!b.station){a.height+=need;b.height+=need}
      else if(!a.station)a.height+=need/(1-t);else if(!b.station)b.height+=need/t}
   }
  }
  towers.push(...points.slice(part?1:0));
 }
 let minClearance=Infinity,maxTower=0,length=0,lowerMetres=0;
 const measure:number[]=[0];
 const path:P[]=[];
 for(let j=0;j<towers.length;j++){
  const a=towers[j]!;
  if(!a.station)maxTower=Math.max(maxTower,a.height+2.7-a.ground);
  if(!j){path.push(a);continue}
  const b=towers[j-1]!,len=Math.hypot(a.east-b.east,a.north-b.north),steps=Math.ceil(len*2);
  length+=Math.hypot(len,a.height-b.height);
  for(let k=1;k<=steps;k++){
   const t=k/steps,p={east:mix(b.east,a.east,t),north:mix(b.north,a.north,t),height:mix(b.height,a.height,t)};
   const previous=path.at(-1)!;measure.push(measure.at(-1)!+Math.hypot(p.east-previous.east,p.north-previous.north,p.height-previous.height));
   path.push(p);minClearance=Math.min(minClearance,p.height-ground(p.east,p.north));
  }
  if(a.station&&a.east===440&&a.north===520)lowerMetres=length;
 }
 return {towers,path,measure,length,lowerMetres,minClearance,maxTower};
}
/** Separate a docking contact from a collision during travel. This is a
 * measured candidate envelope, never a grant of operating authority.
 * External buildings/railway obstacles must be supplied by their owner. */
export function auditRidgeCableSweep(field:FrontRidgeR30Field,survey:ReturnType<typeof surveyRidgeCableSpans>,obstacle?:(foot:P,halfWidth:number,halfDepth:number,top:number)=>boolean){
 let minMoving=Infinity,minDock=Infinity,groundHits=0,obstacleHits=0,samples=0;
 let firstGround:P|undefined,firstObstacle:P|undefined;
 const stops=survey.towers.filter(p=>p.station);
 for(const p of survey.path){
  const dock=stops.some(s=>Math.hypot(s.east-p.east,s.north-p.north)<=4);
  for(const side of [-1,1]){
   const foot={east:p.east+side*1.55,north:p.north,height:p.height};
   // Include actual carriage corners and all one-metre raster vertices
   // lying under the box. The half-metre route samples are retained.
   const es=[foot.east-1.12,foot.east+1.12],ns=[foot.north-1.475,foot.north+1.475];
   for(let e=Math.ceil(es[0]!);e<es[1]!;e++)es.push(e);
   for(let n=Math.ceil(ns[0]!);n<ns[1]!;n++)ns.push(n);
   let margin=Infinity;
   for(const e of es)for(const n of ns){
    const h=field.heightAt(e,n);samples++;margin=Math.min(margin,h===undefined?-Infinity:foot.height-h);
   }
   if(dock)minDock=Math.min(minDock,margin);else minMoving=Math.min(minMoving,margin);
   if(margin<-.001){groundHits++;firstGround??=foot}
   if(obstacle?.(foot,1.12,1.475,2.78)){obstacleHits++;firstObstacle??=foot}
  }
 }
 return {samples,minMoving,minDock,groundHits,obstacleHits,firstGround,firstObstacle,externalSurveyed:!!obstacle,
  candidateEnvelopeClear:!!obstacle&&groundHits===0&&obstacleHits===0&&minMoving>=.25,productionReady:false as const};
}
type Part={m:MeshLambertMaterial;matrix:import('three').Matrix4};
type Solid={e:number;n:number;bottom:number;top:number;w:number;d:number;yaw:number};
export function mountRidgeCableFacilities(owner:Object3D,field:FrontRidgeR30Field,externalDock=false){
 const group=new Group();group.name='d-r30-front-cable-facilities';owner.add(group);
 const geometry=new BoxGeometry(),tmp=new Object3D(),parts:Part[]=[],solids:Solid[]=[];
 const stone=new MeshLambertMaterial({color:'#78818a'}),ash=new MeshLambertMaterial({color:'#9ba9af'}),wood=new MeshLambertMaterial({color:'#73523b'}),oak=new MeshLambertMaterial({color:'#ad8966'}),iron=new MeshLambertMaterial({color:'#384c58'}),brass=new MeshLambertMaterial({color:'#b9a074'}),snow=new MeshLambertMaterial({color:'#dce5eb'}),glass=new MeshLambertMaterial({color:'#7fa3a3'}),lamp=new MeshLambertMaterial({color:'#e9c58e'});
 const materials=[stone,ash,wood,oak,iron,brass,snow,glass,lamp],batches:InstancedMesh[]=[],boards:Mesh<PlaneGeometry,MeshBasicMaterial>[]=[];
 // Upper shelter faces the actual incoming diagonal, not world north.
 const E=336,N=640,Y=347,heading=Math.atan2(-104,120);
 let upperFrame=false;
 const place=(e:number,n:number)=>upperFrame?{
  e:E+Math.cos(heading)*(e-E)+Math.sin(heading)*(n-N),
  n:N-Math.sin(heading)*(e-E)+Math.cos(heading)*(n-N)
 }:{e,n};
 function box(m:MeshLambertMaterial,e:number,n:number,y:number,w:number,d:number,h:number,solid=false,yaw=0){
  const p=place(e,n);yaw+=upperFrame?-heading:0;
  tmp.position.set(p.e,y,-p.n);tmp.scale.set(w,h,d);tmp.rotation.set(0,yaw,0);tmp.updateMatrix();parts.push({m,matrix:tmp.matrix.clone()});
  if(solid)solids.push({e:p.e,n:p.n,bottom:y-h/2,top:y+h/2,w,d,yaw});
 }
 function beam(m:MeshLambertMaterial,a:P,b:P,w:number,d=w){
  const ap=place(a.east,a.north),bp=place(b.east,b.north);
  const va=new Vector3(ap.e,a.height,-ap.n),vb=new Vector3(bp.e,b.height,-bp.n),delta=vb.clone().sub(va);
  tmp.position.copy(va).lerp(vb,.5);tmp.quaternion.setFromUnitVectors(new Vector3(0,1,0),delta.clone().normalize());tmp.scale.set(w,delta.length(),d);tmp.updateMatrix();parts.push({m,matrix:tmp.matrix.clone()});
 }
 function board(id:'S-12'|'S-19',e:number,n:number,y:number,yaw:number){
  const copy=STATION_BOARD_TEXTS.find(b=>b.id===id)!;
  box(wood,e,n,y,2.9,.12,1.35,false,yaw);
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=540;const c=canvas.getContext('2d');if(!c)return;
  c.fillStyle='#483b2c';c.fillRect(0,0,1152,540);c.strokeStyle='#bfa879';c.lineWidth=14;c.strokeRect(10,10,1132,520);
  c.fillStyle='#f2e8d0';c.textAlign='center';c.font='bold 79px Microsoft YaHei,sans-serif';c.fillText(copy.title,576,125,1080);
  c.font='47px Microsoft YaHei,sans-serif';copy.lines.forEach((line,i)=>c.fillText(line,576,231+i*106,1075));
  const tex=new CanvasTexture(canvas);tex.colorSpace=SRGBColorSpace;
  const m=new Mesh(new PlaneGeometry(2.82,1.30),new MeshBasicMaterial({map:tex}));
  const p=place(e,n);yaw+=upperFrame?-heading:0;
  m.name='ridge-cable-board-'+id;m.userData.text=copy;m.rotation.y=yaw;m.position.set(p.e+Math.sin(yaw)*.07,y,-p.n+Math.cos(yaw)*.07);boards.push(m);group.add(m);
 }
 // Upper terminal: replacement candidate for the old sparse gate, not a
 // second terminal layered into the public scene. Cabin lanes remain open.
 upperFrame=true;
 // Flush platform grain uses a thin decorative skin, never a competing
 // walking height. The plateau itself supplies the actual floor.
 for(let i=0;i<14;i++)for(let j=0;j<8;j++){
  box((i+j)%5===0?ash:(i+j)%3===0?oak:wood,E-3.25+i*.50,N-3.5+j,Y+.012,.48,.96,.024);
 }
 for(const s of [-1,1]){
  box(brass,E+s*3.42,N,Y+.035,.12,8.0,.045);
  for(const n of [N-4.0,N+4.0]){
   box(stone,E+s*3.62,n,Y+.29,.58,.65,.58,true);
   box(iron,E+s*3.62,n,Y+1.91,.22,.22,2.66,true);
   box(brass,E+s*3.62,n,Y+3.31,.35,.35,.18);
  }
 }
 // Elevated terminal portal leaves the original two cabin lanes clear.
 // The incoming (south) side is deliberately open above the cabin sweep.
 for(const n of [N+4]){
  box(wood,E,n,Y+3.48,7.65,.32,.30);
  box(iron,E,n,Y+3.71,7.85,.43,.16);
  box(snow,E,n,Y+3.83,7.65,.44,.10);
  for(const s of [-1,1]){
   beam(iron,{east:E+s*3.62,north:n,height:Y+2.70},{east:E+s*2.96,north:n,height:Y+3.46},.12);
   box(brass,E+s*1.55,n,Y+3.23,.40,.25,.18);
  }
 }
 const lights=[-1,1].map(s=>{const p=new PointLight('#f6ba78',0,9,2);const at=place(E+s*5.1,N);p.position.set(at.e,Y+2.65,-at.n);group.add(p);return p;});
 for(const sign of [-1,1]){
  const x=E+sign*5.25;
  box(stone,x,N,Y-.20,3.25,8.2,.40);
  for(let i=0;i<8;i++)box(i%3?wood:oak,x,N-3.5+i,Y+.018,3.05,.94,.036);
  for(const n of [N-3.7,N+3.7])for(const e of [x-1.38,x+1.38]){
   box(stone,e,n,Y+.26,.55,.55,.52,true);
   box(iron,e,n,Y+1.99,.20,.20,2.94,true);
   box(brass,e,n,Y+3.48,.34,.34,.18);
  }
  // Side wall and glazed windbreak. Central waiting and cabin aisle open.
  const out=E+sign*6.71;
  for(const n of [N-2.6,N+2.6])box(oak,out,n,Y+1.36,.20,2.32,2.55,true);
  box(glass,out,N,Y+1.76,.12,2.65,1.31,true);
  for(let i=-1;i<=1;i++)box(iron,out,N+i*.88,Y+1.76,.20,.075,1.43);
  for(const y of [Y+1.04,Y+2.46])box(wood,out,N,y,.28,2.85,.17);
  box(wood,x,N,Y+3.61,3.68,8.65,.25);
  for(let row=0;row<4;row++)box(snow,x,N,Y+3.81+row*.12,3.69-row*.62,8.72-row*.14,.15);
  for(let n=N-3.8;n<N+4;n+=.85)box(iron,x,n,Y+3.41,3.39,.095,.16);
  for(let n=N-2.7;n<N+2.9;n+=.54)box(oak,out-sign*.49,n,Y+.55,.59,.52,.14,true);
  box(stone,out-sign*.49,N,Y+.23,.47,5.6,.46,true);
  for(const n of [N-3.25,N+3.25]){
   box(iron,out-sign*.34,n,Y+2.70,.31,.31,.56);
   box(lamp,out-sign*.34,n,Y+2.69,.25,.25,.35);
  }
  for(let n=N-3.0;n<=N+3;n+=1.0)box(brass,E+sign*3.35,n,Y+.033,.12,.67,.045);
 }
 board('S-19',E+6.56,N+2.1,Y+2.07,-Math.PI/2);
 upperFrame=false;
 // The known base is the old 26m railway building. Its S-12 sign
 // is a separately mounted candidate; never create a duplicate base hall.
 board('S-12',522.2,324.2,28.0,0);
 if(externalDock){
  // Separate proposed dock, not a replacement of the railway hall or gate.
  // The host must explicitly accept every bearing and the pedestrian seam.
  const p=externalCableDock,back=p.approachNorth,front=p.north+p.halfDepth;
  // Continuous floor under decorative wood courses, so seams do not become holes.
  box(wood,p.east,(back+front)/2,p.height-.15,7,front-back,.30);
  for(let n=back+.25;n<front;n+=.5){
   for(let i=0;i<14;i++)box(i%3===0?oak:wood,p.east-3.25+i*.5,n,p.height-.08,.48,.49,.16);
  }
  for(const sign of [-1,1]){
   const e=p.east+sign*3.35;
   for(const n of [350,353,356]){
    const h=field.heightAt(e,n);if(h===undefined||h>p.height-.3)continue;
    const top=p.height-.16;
    box(stone,e,n,h+.14,.88,.88,.6,true);
    box(iron,e,n,(h+top)/2,.32,.32,top-h,true);
    box(iron,e,n,top-.12,.62,.62,.24);
    box(wood,e,n,p.height+.50,.15,.15,1.0,true);
    box(brass,e,n,p.height+1.03,.23,.23,.12);
   }
   for(const n of [351.5,354.5])for(const dh of [.45,.96])box(wood,e,n,p.height+dh,.13,3,.13,true);
  }
  for(const n of [350,353,356])box(iron,p.east,n,p.height-.24,7.1,.28,.24);
 }
 const survey=surveyRidgeCableSpans(field,externalDock);
 for(const p of survey.towers){
  if(p.station)continue;
  const top=p.height+2.7,base=p.ground;
  if(!Number.isFinite(top)||top<base+.8)continue;
  // Outer two tower legs never cross the opposing cabin swept lanes.
  // Individual feet sit on the sampled ground, not the higher opposite foot.
  for(const s of [-1,1]){
   const e=p.east+s*3.65,g=field.heightAt(e,p.north)??base;
   const a={east:e,north:p.north,height:g},b={east:p.east+s*3.15,north:p.north,height:top+.6};
   beam(iron,a,b,.27);
   box(stone,a.east,a.north,g+.18,1.05,1.05,.76,true);
   for(const sign of [-1,1]){
    const n=a.north+sign*1.25,gy=field.heightAt(e,n)??g;
    beam(iron,{...a,north:n,height:gy},{...b,north:b.north+sign*.20},.20);
    box(stone,e,n,gy+.14,.68,.68,.50,true);
   }
   for(let y=g+1.2;y<top-1;y+=2.4){
    box(iron,e,p.north,y,.17,2.4,.15);
    if(y+1.6<top)beam(iron,{east:e,north:p.north-1.05,height:y},{east:e,north:p.north+1.05,height:y+1.6},.11);
   }
   // Outer access ladder does not enter the carriage envelope.
   for(let y=g+.6;y<top-.2;y+=.43)box(ash,e+s*.20,p.north,y,.16,.48,.075);
   for(const n of [p.north-.25,p.north+.25])box(iron,e+s*.22,n,(g+top)/2,.09,.09,top-g);
   box(brass,p.east+s*1.55,p.north,top+.23,.62,.44,.28);
  }
  box(iron,p.east,p.north,top+.51,7.0,.40,.27);
  box(ash,p.east,p.north,top+.79,3.8,.95,.16);
 }
 // Presentation uses the same existing three-stop clock, with the
 // measured candidate spans. The public authority remains unchanged.
 const clock=createNorthRidgeCableClock(survey.lowerMetres,survey.length-survey.lowerMetres,0);
 const cabinGroups=[-1,1].map(side=>{
   const car=new Group();car.name='d-r30-cable-cabin-'+side;group.add(car);
   function local(m:MeshLambertMaterial,x:number,y:number,z:number,w:number,h:number,d:number){
    const mesh=new Mesh(geometry,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);car.add(mesh);
   }
   // The station datum is the actual bottom support, not the centre of
   // the floor board. Never sink the moving floor below that datum.
   local(wood,0,.09,0,2.2,.18,2.90);
   local(iron,0,2.22,0,2.24,.18,2.95);
   local(snow,0,2.36,0,2.14,.10,2.76);
   for(const s of [-1,1]){
    for(const z of [-1.35,1.35])local(iron,s*1.02,1.07,z,.12,2.14,.12);
    local(wood,s*1.02,.38,0,.13,.76,2.72);
    local(brass,s*1.07,.78,0,.14,.08,2.72);
    local(oak,s*.72,.43,0,.52,.11,2.25);
    for(const z of [-.8,0,.8])local(iron,s*1.02,1.46,z,.045,1.22,.05);
   }
   local(brass,0,2.55,0,.18,.39,.18);
   local(iron,0,2.70,0,.31,.16,.42);
   return {car,side};
 });
 function update(nowMs:number){
  const states=clock.cabinsAt(nowMs);
  return cabinGroups.map(({car,side},i)=>{
   const state=states[i]!,along=state.distanceMetres;
   let lo=0,hi=survey.measure.length-1;
   while(hi-lo>1){const mid=(lo+hi)>>1;if(survey.measure[mid]!<=along)lo=mid;else hi=mid}
   const a=survey.path[lo]!,b=survey.path[hi]!,t=Math.max(0,Math.min(1,(along-survey.measure[lo]!)/Math.max(1e-8,survey.measure[hi]!-survey.measure[lo]!)));
   car.position.set(mix(a.east,b.east,t)+side*1.55,mix(a.height,b.height,t),-mix(a.north,b.north,t));
   return {...state,east:car.position.x,north:-car.position.z,height:car.position.y};
  });
 }
 update(0);
 const lines:Line[]=[];
 for(const side of [-1,1]){
  const g=new BufferGeometry().setFromPoints(survey.towers.map(p=>new Vector3(p.east+side*1.55,p.height+2.7,-p.north)));
  const rope=new Line(g,new LineBasicMaterial({color:'#414e58'}));rope.name='ridge-cable-survey-rope';group.add(rope);lines.push(rope);
 }
 for(const m of materials){
  const list=parts.filter(p=>p.m===m);if(!list.length)continue;
  const batch=new InstancedMesh(geometry,m,list.length);batch.name='ridge-cable-facilities-'+m.color.getHexString();
  list.forEach((p,i)=>batch.setMatrixAt(i,p.matrix));batch.computeBoundingSphere();group.add(batch);batches.push(batch);
 }
 return {group,survey,clock,update,blocked(e:number,n:number,y:number,r=.27){
  return solids.some(s=>{const dx=e-s.e,dn=n-s.n,c=Math.cos(s.yaw),a=Math.sin(s.yaw),x=dx*c+dn*a,z=-dx*a+dn*c;
   return y+1.8>s.bottom&&y<s.top&&Math.hypot(Math.max(0,Math.abs(x)-s.w/2),Math.max(0,Math.abs(z)-s.d/2))<r})
 },setNight(night:boolean){lamp.emissive.set(night?'#e9c58e':'#000000');lamp.emissiveIntensity=night?.65:0;lights.forEach(l=>l.intensity=night?8:0)},
 dispose(){group.removeFromParent();batches.forEach(b=>b.dispose());geometry.dispose();materials.forEach(m=>m.dispose());lines.forEach(l=>{l.geometry.dispose();(l.material as LineBasicMaterial).dispose()});boards.forEach(b=>{b.geometry.dispose();b.material.map?.dispose();b.material.dispose()})}};
}
