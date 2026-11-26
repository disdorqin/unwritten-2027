import {BoxGeometry,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3,Color} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import type {MineCreature} from '../../../src/shared/mine-bestiary.js';
type Family='rock'|'wood'|'iron'|'cloth'|'neutral';
type Part={family:Family;p:[number,number,number];s:[number,number,number];color:number;angle:number;head:boolean;eye:boolean};
export function createR30MineCreatureFactory(){
 const geo=new BoxGeometry(),families=['rock','wood','iron','cloth','neutral'] as const;
 const materials=families.map(f=>{const map=makeCampGrain(f);return {map,mat:new MeshLambertMaterial({map})}});
 const phosphor=new MeshLambertMaterial({color:0x59776b,emissive:0x244139,emissiveIntensity:.32});
 function create(species:MineCreature){
  const root=new Group(),body=new Group(),head=new Group();root.name='r30-creature/'+species;root.add(body,head);
  const parts:Part[]=[],b=(family:Family,x:number,y:number,z:number,w:number,h:number,d:number,color:number,angle=0,isHead=false,eye=false)=>parts.push({family,p:[x,y,z],s:[w,h,d],color,angle,head:isHead,eye});
  const bone=0xb9b7a2,dark=0x34393b,rust=0x805438,cloth=0x61675a;
  let headY=0;
  if(species==='snow-clump'){
   // Round stepped snowball silhouette with a separate square head.
   for(let y=0;y<5;y++)for(let z=-3;z<=3;z++){
    const dy=y-2.0,r2=11.1-dy*dy*1.35-z*z;
    if(r2<0)continue;
    const n=Math.floor(Math.sqrt(r2));
    b('neutral',0,.047+y*.096,z*.096,(2*n+1)*.096,.096,.096,(y+z)%4?0xc9d6dc:0xb7c8d1);
   }
   headY=.46;b('neutral',0,.115,0,.29,.23,.27,0xd9e2e4,0,true);
   for(const x of [-.12,.12])b('neutral',x,.16,-.125,.09,.10,.055,0xb0c0c8,0,true);
   for(const x of [-.065,.065]){b('rock',x,.133,-.139,.039,.052,.023,dark,0,true);b('neutral',x+.007,.149,-.153,.012,.014,.008,0xeeeeec,0,true)}
   b('rock',0,.065,-.141,.058,.020,.021,0x555b60,0,true);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;b('neutral',.24*Math.cos(a),.18+(i%3)*.035,.24*Math.sin(a),.105,.095,.065,0x99b3c5,.22*Math.sin(a))}
  }else if(species==='skeleton-miner'){
   // Individually readable bones, old helmet and dragged rusted pick.
   headY=1.42;
   b('neutral',0,.145,0,.28,.27,.27,bone,0,true);
   b('neutral',0,.005,-.015,.22,.10,.22,0xa5a28e,0,true);
   for(const x of [-.076,.076]){b('rock',x,.155,-.139,.091,.09,.027,dark,0,true);b('neutral',x,.155,-.158,.025,.03,.011,0x59776b,0,true,true)}
   b('rock',0,.09,-.14,.045,.054,.026,dark,0,true);
   for(let i=0;i<5;i++)b('rock',-.082+i*.041,.015,-.132,.013,.047,.02,dark,0,true);
   b('iron',0,.30,0,.34,.10,.34,0x6e6050,0,true);b('iron',0,.36,0,.23,.06,.26,0x73634c,0,true);
   b('iron',0,.29,-.177,.12,.11,.08,0x776a51,0,true);b('rock',0,.29,-.222,.072,.072,.018,0x36383a,0,true);
   for(let i=0;i<7;i++)b('neutral',0,.77+i*.088,0,.11,.075,.12,bone);
   for(let i=0;i<5;i++)for(const x of [-1,1]){
    b('neutral',x*.116,.91+i*.073,-.01,.17,.038,.19,bone,x*.13);
    b('neutral',x*.176,.90+i*.073,-.083,.037,.058,.10,0x9f9c88);
   }
   b('neutral',0,.75,0,.30,.12,.17,bone);
   for(const x of [-.13,.13]){
    b('neutral',x,.51,0,.075,.42,.085,bone,x*.06);b('neutral',x,.25,.02,.068,.38,.076,bone,-x*.08);
    b('neutral',x,.055,-.058,.105,.09,.20,0xa4a18d);
    b('neutral',x,.31,0,.095,.09,.11,bone);
   }
   for(const x of [-.25,.25]){
    b('neutral',x,1.23,0,.11,.09,.13,bone);b('neutral',x*1.12,1.05,0,.072,.31,.083,bone,x*.32);
    b('neutral',x*1.18,.81,-.06,.068,.25,.072,bone,-x*.4);b('neutral',x*1.18,.67,-.08,.10,.10,.095,bone);
   }
   b('wood',.34,.41,-.16,.07,.75,.075,0x6f5035,.18);b('iron',.36,.105,-.19,.40,.075,.075,rust,.1);
   for(const x of [.17,.55])b('iron',x,.07,-.19,.07,.10,.073,rust);
  }else if(species==='zombie-miner'){
   headY=1.41;
   b('neutral',0,.14,0,.34,.29,.30,0x7b8570,0,true);
   b('cloth',0,.265,0,.37,.10,.34,0x6f6350,0,true);
   b('cloth',0,.33,0,.29,.08,.28,0x6a604e,0,true);
   for(const x of [-.08,.08])b('rock',x,.14,-.155,.075,.045,.018,0x46514b,0,true);
   b('rock',0,.065,-.157,.096,.025,.02,0x444b42,0,true);
   b('cloth',0,1.09,0,.44,.55,.28,cloth);
   for(let i=0;i<5;i++)b('cloth',0,.86+i*.105,-.147,.42,.09,.045,[0x5e675b,0x707464,0x525b52][i%3]);
   b('iron',0,.86,-.168,.42,.07,.045,0x605244);
   b('cloth',-.126,1.17,-.179,.14,.14,.04,0x4f5c51);
   for(let i=0;i<4;i++)b('iron',.025,.98+i*.09,-.175,.03,.032,.018,rust);
   for(const side of [-1,1]){
    b('cloth',side*.28,1.20,-.06,.17,.33,.18,0x6b6f5e,side*.16);
    b('cloth',side*.30,1.04,-.23,.16,.17,.30,0x626958);
    b('neutral',side*.30,1.02,-.415,.15,.14,.14,0x808a74);
    b('cloth',side*.125,.48,0,.20,.66,.21,0x555c50,side*.04);
    b('iron',side*.125,.12,-.06,.22,.22,.32,0x46433c);
    for(let i=0;i<3;i++)b('cloth',side*.125,.36+i*.095,-.118,.19,.045,.045,0x6d7061);
   }
   for(let i=0;i<8;i++)b('cloth',-.20+i*.056,.80-(i%3)*.035,-.12,.055,.12,.065,0x474f46,i*.04);
  }else if(species==='rock-snake'){
   // Seven articulated stone rings, flat on the ground when resting.
   headY=.16;
   for(let i=0;i<7;i++){
    const x=.105*Math.sin(i*.8),z=.10+i*.205,r=.18-i*.011;
    for(let k=0;k<8;k++){
     const a=k*Math.PI/4;
     b('rock',x+Math.cos(a)*r,.14+Math.sin(a)*r*.57,z,.11,.11,.19,[0x51585a,0x606661,0x464d50][(i+k)%3],a);
    }
    b('neutral',x,.14,z,.15,.09,.17,0x666b66);
   }
   b('rock',0,.10,-.075,.34,.22,.33,0x5e6663,0,true);
   b('rock',0,.035,-.23,.29,.10,.15,0x7a7e74,0,true);
   for(const x of [-.10,.10])b('neutral',x,.13,-.248,.037,.034,.023,0xb2b7a7,0,true);
   b('rock',0,.012,-.302,.19,.022,.023,0x343c3c,0,true);
  }
  head.position.y=headY;
  const instances:InstancedMesh[]=[],rigs:{mesh:InstancedMesh;rows:Part[];head:boolean}[]=[];
  for(const onHead of [false,true])for(const [i,f] of families.entries()){
   for(const eye of [false,true]){
    const rows=parts.filter(p=>p.head===onHead&&p.family===f&&p.eye===eye);if(!rows.length)continue;
    const mesh=new InstancedMesh(geo,eye?phosphor:materials[i].mat,rows.length),m=new Matrix4(),q=new Quaternion(),c=new Color();
    rows.forEach((p,k)=>{m.compose(new Vector3(...p.p),q.setFromAxisAngle(new Vector3(0,0,1),p.angle),new Vector3(...p.s));mesh.setMatrixAt(k,m);mesh.setColorAt(k,c.setHex(p.color))});
    mesh.computeBoundingSphere();(onHead?head:body).add(mesh);instances.push(mesh);rigs.push({mesh,rows,head:onHead});
   }
  }
  let poseKey='';
  function pose(phase:string,hits:number,travel=0){
   root.visible=phase!=='defeated';
   const key=phase+'/'+hits+'/'+travel;if(key===poseKey)return;poseKey=key;
   body.position.set(0,0,0);body.scale.set(1,1,1);head.position.y=headY;head.rotation.set(0,0,0);body.rotation.set(0,0,0);
   const moving=['chase','retreat','orbit'].includes(phase);
   if(species==='snow-clump'){
    if(phase==='rebuild'){body.scale.set(1.12,.26,1.12);head.position.y=.12;head.rotation.z=.18}
    else if(moving){body.rotation.x=-travel/.25;const c=new Vector3(0,.24,0);body.position.copy(c.clone().sub(c.applyQuaternion(body.quaternion)));head.rotation.z=.08*Math.sin(travel*7)}
   }
   if(species==='skeleton-miner'&&hits===1){head.rotation.z=.17;body.rotation.z=-.07}
   if(species==='zombie-miner'){body.rotation.x=phase==='windup'?-.15:hits===1?.12:.05;head.rotation.z=hits<3?.13:0}
   if(species==='rock-snake'&&['peek','windup','chase'].includes(phase)){head.position.y=.43;head.rotation.x=.24}
   // Drive limbs from accepted displacement and accepted action phase.
   // This does not integrate movement or create any client attack/contact.
   const stride=moving?Math.sin(travel*7)*.34:0;
   const m=new Matrix4(),q=new Quaternion(),rot=new Quaternion(),p0=new Vector3(),pivot=new Vector3(),axis=new Vector3(1,0,0),zaxis=new Vector3(0,0,1);
   for(const rig of rigs){
    if(rig.head)continue;
    for(const [i,p] of rig.rows.entries()){
     p0.set(...p.p);q.setFromAxisAngle(zaxis,p.angle);
     if(species==='skeleton-miner'||species==='zombie-miner'){
      const [x,y]=p.p,sign=Math.sign(x),arm=Math.abs(x)>.22&&(y>.83||species==='skeleton-miner'&&Math.abs(x)>.285),leg=!arm&&y<.71&&Math.abs(x)>.07;
      let angle=0;
      if(arm){pivot.set(x,1.24,0);angle=phase==='windup'?(species==='skeleton-miner'&&x>0?1.35:species==='zombie-miner'?-.50:0):phase==='recover'?.28:-stride*sign*.70}
      else if(leg){pivot.set(x,.75,0);angle=stride*sign}
      if(angle){rot.setFromAxisAngle(axis,angle);p0.sub(pivot).applyQuaternion(rot).add(pivot);q.premultiply(rot)}
     }else if(species==='rock-snake'&&moving){p0.x+=.065*Math.sin(p.p[2]*7-travel*8)}
     m.compose(p0,q,new Vector3(...p.s));rig.mesh.setMatrixAt(i,m);
    }
    rig.mesh.instanceMatrix.needsUpdate=true;rig.mesh.computeBoundingSphere();
   }
  }
  return {group:root,parts:parts.length,pose,dispose(){root.removeFromParent();instances.forEach(m=>m.dispose());root.clear()}};
 }
 return {create,dispose(){geo.dispose();phosphor.dispose();materials.forEach(({map,mat})=>{map.dispose();mat.dispose()})}};
}
