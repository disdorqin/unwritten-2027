import {BoxGeometry,Mesh,Group,Color,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3,PointLight,CanvasTexture,PlaneGeometry,MeshBasicMaterial,NearestFilter,SRGBColorSpace,DoubleSide} from 'three';
import type {createUndergroundMainlineTrack,UndergroundMainlinePoint} from '../../../src/shared/underground-mainline-track.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Route=ReturnType<typeof createUndergroundMainlineTrack>;
type Part={family:'wood'|'iron'|'rock'|'neutral';x:number;y:number;z:number;w:number;h:number;d:number;yaw:number;color:number};
export function mountR30MainlineDressing(parent:Group,route:Route,supports:(p:UndergroundMainlinePoint,r:number,h:number)=>boolean){
 const root=new Group();root.name='r30-haulage-stations';parent.add(root);
 const parts:Part[]=[],footprints:{role:string;p:UndergroundMainlinePoint;r:number;h:number}[]=[],lamps:PointLight[]=[];
 const roles=['camp','sleepers','gauge','turnout-rust','turnout','gate'] as const;
 let switchLever:Group|undefined,recallWheel:Group|undefined;
 let sidingBuilt=false;
 const signs:Mesh<PlaneGeometry,MeshBasicMaterial>[]=[];
 const words={camp:'营地站 · 唤回空车',sleepers:'塌枕段 · 搬换枕木',gauge:'偏轨段 · 撬正钢轨', 'turnout-rust':'锈岔段 · 敲锈上油',turnout:'道岔 · 停车下车再扳',gate:'矿门站 · 停车卸矿'} as const;
 const point=(p:ReturnType<Route['sample']>,side:number,along:number)=>({east:p.position.east+Math.cos(p.heading)*side-Math.sin(p.heading)*along,
  north:p.position.north+Math.sin(p.heading)*side+Math.cos(p.heading)*along,height:p.position.height});
 for(const role of roles){
  const m=route.work[role].chainage,p=route.sample(m);
  // Keep the whole physical footprint clear of every accepted rail section.
  let slot:{p:UndergroundMainlinePoint;side:number;along:number}|undefined;
  for(const side of [-2.4,2.4,-2.9,2.9])for(const along of [0,1.3,-1.3]){
   const q=point(p,side,along),r=.88;
   if(!supports(q,r,2.6)||footprints.some(f=>Math.hypot(f.p.east-q.east,f.p.north-q.north)<f.r+r))continue;
   let near=false;
   for(let a=Math.max(0,m-12);a<=Math.min(route.length,m+12);a+=.2){
    const f=route.sample(a).position;
    if(Math.hypot(f.east-q.east,f.north-q.north)<r+route.clearanceRadius+.10){near=true;break}
   }
   if(!near){slot={p:q,side,along};break}
  }
  if(!slot)continue;
  const q=slot.p;
  if(typeof document!=='undefined'){
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
   const c=canvas.getContext('2d');
   if(c){
    c.fillStyle='#493b30';c.fillRect(0,0,512,128);c.strokeStyle='#a88c67';c.lineWidth=7;c.strokeRect(5,5,502,118);
    c.fillStyle='#e3d2b0';c.font='bold 34px Microsoft YaHei, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(words[role],256,64,484);
    const map=new CanvasTexture(canvas);map.minFilter=map.magFilter=NearestFilter;map.colorSpace=SRGBColorSpace;
    const sign=new Mesh(new PlaneGeometry(1.16,.29),new MeshBasicMaterial({map,side:DoubleSide}));
    const a=point(p,slot.side-Math.sign(slot.side)*.47,slot.along);
    sign.position.set(a.east,a.height+1.82,-a.north);sign.rotation.y=p.heading-Math.sign(slot.side)*Math.PI/2;
    sign.name='r30-station-sign/'+role;root.add(sign);signs.push(sign);
   }
  }
  footprints.push({role,p:q,r:.88,h:2.6});
  const add=(family:Part['family'],x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>{
   const v=point(p,slot!.side+x,slot!.along+z);
   parts.push({family,x:v.east,y:v.height+y,z:-v.north,w,h,d,yaw:p.heading,color});
  };
  // Workstand: tied slate plinth, old timber, iron braces and role-specific contents.
  add('rock',0,.09,0,.9,.18,1.35,0x53504b);
  for(const x of [-.31,.31])for(const z of [-.48,.48]){
   add('wood',x,.47,z,.14,.76,.16,0x604735);
   add('iron',x,.30,z,.18,.085,.19,0x80563d);
  }
  for(let k=0;k<6;k++)add('wood',0,.88,-.55+k*.22,.86,.12,.215,0x70543e);
  add('wood',-.34,1.53,0,.12,1.26,1.25,0x604735);
  for(let k=0;k<6;k++)add('wood',-.26,1.4,-.5+k*.2,.075,.7,.19,0x70543e);
  if(role==='sleepers'){
   for(let k=0;k<4;k++)add('wood',.03,1.00+k*.105,.02,.72,.10,1.12,0x70543e);
  }else if(role==='gauge'){
   for(const z of [-.36,0,.36]){add('iron',0,1.01,z,.71,.11,.08,0x80563d);add('iron',.26,1.10,z,.13,.16,.12,0x947346)}
  }else if(role==='turnout-rust'){
   for(const z of [-.39,-.03,.33]){add('iron',.02,1.07,z,.26,.26,.25,0x80563d);add('iron',.02,1.23,z,.12,.07,.12,0x947346)}
  }else if(role==='turnout'){
   add('iron',0,1.04,0,.46,.22,.43,0x505258);
   switchLever=new Group();switchLever.position.set(q.east,q.height+1.15,-q.north);switchLever.rotation.y=p.heading;root.add(switchLever);
   const g=new BoxGeometry(.075,.55,.075),mat=new MeshLambertMaterial({color:0x80563d});
   const mesh=new Mesh(g,mat);mesh.position.y=.24;switchLever.add(mesh);
   const knob=new Mesh(g,mat);knob.scale.set(2.2,.17,2.2);knob.position.y=.52;switchLever.add(knob);
   switchLever.userData.resources=[g,mat];
  }else{
   if(role==='camp'){
    recallWheel=new Group();recallWheel.name='r30-actual-recall-wheel';recallWheel.position.set(q.east,q.height+1.40,-q.north);recallWheel.rotation.y=p.heading;
    const g=new BoxGeometry(),mat=new MeshLambertMaterial({color:0x70543e});
    for(let k=0;k<8;k++){const a=k*Math.PI/4,m=new Mesh(g,mat);m.rotation.z=a;m.position.set(.19*Math.cos(a),.19*Math.sin(a),0);m.scale.set(.37,.08,.12);recallWheel.add(m)}
    root.add(recallWheel);recallWheel.userData.resources=[g,mat];
   }
   for(let k=0;k<3;k++){add('wood',.02,1.05,-.37+k*.37,.65,.22,.34,0x70543e);add('iron',.35,1.06,-.37+k*.37,.05,.25,.36,0x80563d)}
  }
  // One warm lantern per actual station. Budget remains in existing U19 sync.
  add('iron',-.31,2.03,.44,.105,1.07,.105,0x80563d);
  add('iron',-.31,2.52,.44,.33,.1,.33,0x505258);
  for(const x of [-.40,-.22])for(const z of [.35,.53])add('iron',x,2.32,z,.035,.32,.035,0x505258);
  add('neutral',-.31,2.31,.44,.13,.24,.13,0x99784d);
  const lp=point(p,slot.side-.31,slot.along+.44),light=new PointLight(0xe4ad72,6,8,2);
  light.position.set(lp.east,lp.height+2.31,-lp.north);light.visible=false;root.add(light);lamps.push(light);
 }
 // Short blocked siding at the real turnout: two rails and a buffer.
 // It is not a registered driveable branch and never extends the authority.
 const turn=route.sample(route.turnoutMetres);
 for(const side of [1,-1]){
  const pts=Array.from({length:13},(_,i)=>point(turn,side*2.35*(i/12)**2,i*.49));
  if(!pts.every(p=>supports(p,.82,2.4)))continue;
  const end=pts.at(-1)!;
  if(footprints.some(f=>Math.hypot(f.p.east-end.east,f.p.north-end.north)<f.r+.65))continue;
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i],heading=Math.atan2(a.east-b.east,b.north-a.north),e=(a.east+b.east)/2,n=(a.north+b.north)/2,len=Math.hypot(b.east-a.east,b.north-a.north);
   parts.push({family:'wood',x:e,y:a.height-.005,z:-n,w:1.62,h:.018,d:.17,yaw:heading,color:0x594536});
   for(const s of [-.5,.5])parts.push({family:'iron',x:e+Math.cos(heading)*s,y:a.height+.009,z:-n-Math.sin(heading)*s,w:.085,h:.032,d:len+.025,yaw:heading,color:0x80563d});
  }
  const heading=Math.atan2(pts[11].east-end.east,end.north-pts[11].north);
  for(const s of [-.5,.5])parts.push({family:'wood',x:end.east+Math.cos(heading)*s,y:end.height+.28,z:-end.north-Math.sin(heading)*s,w:.28,h:.56,d:.36,yaw:heading,color:0x70543e});
  parts.push({family:'iron',x:end.east,y:end.height+.52,z:-end.north,w:1.36,h:.16,d:.25,yaw:heading,color:0x80563d});
  footprints.push({role:'dead-siding-buffer',p:end,r:.72,h:.65});sidingBuilt=true;break;
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['wood','iron','rock','neutral'] as const){
  const rows=parts.filter(p=>p.family===family);if(!rows.length)continue;
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,rows.length),m=new Matrix4(),c=new Color();
  rows.forEach((p,i)=>{m.compose(new Vector3(p.x,p.y,p.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.yaw),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
  mesh.computeBoundingSphere();root.add(mesh);resources.push({mesh,mat,map});
 }
 return {group:root,parts:parts.length,footprints,lamps,sidingBuilt,
  blocks(e:number,n:number,y:number,r:number,h:number){return footprints.some(f=>Math.abs(y-f.p.height)<h&&y<f.p.height+f.h&&Math.hypot(e-f.p.east,n-f.p.north)<r+f.r)},
  syncTurnout(value:'unset'|'gate'|'branch'){if(switchLever)switchLever.rotation.z=value==='gate'?-.55:value==='branch'?.55:0},
  syncRecall(chainage:number){if(recallWheel)recallWheel.rotation.z=(route.length-chainage)*.45},
  dispose(){root.removeFromParent();for(const r of resources){r.mesh.dispose();r.mat.dispose();r.map.dispose()}geo.dispose();for(const sign of signs){sign.material.map?.dispose();sign.material.dispose();sign.geometry.dispose()}for(const g of [switchLever,recallWheel])g?.userData.resources?.forEach((r:{dispose():void})=>r.dispose());root.clear()}};
}
