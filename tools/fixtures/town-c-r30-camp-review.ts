import {AmbientLight,Color,FogExp2,Group,PerspectiveCamera,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {mountWestCraterRoad} from '../voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../voxel-tavern/town-blockout/underground-domain-host.js';
const scene=new Scene();scene.background=new Color(0x1c232a);scene.fog=new FogExp2(0x1c232a,.035);
const root=new Group();scene.add(root,new AmbientLight(0xb4c4de,.55));
const road=mountWestCraterRoad(260,()=>10.7773);
import {createUndergroundWaterState} from '../../src/presence/underground-water-state.js';
import {r30InterlayerLiftSite as interlayerSite,type R30InterlayerRide} from '../voxel-tavern/town-blockout/town-c-r30-interlayer-lift.js';
const water=createUndergroundWaterState({dawnEpoch:0,now:()=>0});
let domain=interlayerSite.upper.domainId;
import type {UndergroundMiningTargetView} from '../../src/shared/underground-mining.js';
let reviewTargets:readonly UndergroundMiningTargetView[]=[];
import type {U19MineCartSnapshot} from '../../src/presence/underground-mainline-cart.js';
let mainlineReview:U19MineCartSnapshot|undefined,mainlineRevision=0;
const host=mountUndergroundDomainHost({parent:root,road,waterBridge:{readWaterSnapshot:()=>water.tonight()},
 readAcceptedMiningTargets:()=>reviewTargets,
 mainlineBridge:{acceptsRoute:()=>!!mainlineReview,readSnapshot:()=>mainlineReview,readLightBudget:()=>2,readViewer:()=>undefined,canSee:()=>false,dispatch:()=>{}},
 readAcceptedDomainFoot:()=>({domainId:domain,...(domain===interlayerSite.lower.domainId?interlayerSite.lower.foot:interlayerSite.upper.foot)})});
if(host.kind!=='ready')throw Error(host.reason);
const camp=host.mounted.camp!;
const camera=new PerspectiveCamera(70,innerWidth/innerHeight,.05,65);
const torch=new PointLight(0xffd1a0,35,16,2);camera.add(torch);scene.add(camera);
const render=new WebGLRenderer({antialias:false,powerPreference:'low-power'});render.setSize(innerWidth,innerHeight);document.body.append(render.domElement);
const vec=(local:readonly [number,number,number])=>{const p=host.mounted.toWorld(local)!;return new Vector3(p.east,p.height,-p.north)};
const eyes:Record<string,{eye:readonly [number,number,number];look:readonly [number,number,number]}>={
 entry:{eye:[0,-91,35.29],look:[0,-90.4,40]},
 hearth:{eye:[2.5,-91,40],look:[2.5,-90.42,38.7]},
 dorm:{eye:camp.rooms[3].approach,look:[6.4,-90.1,40.7]},
 canteen:{eye:[0,-91,42.45],look:[-1.4,-90.15,42.45]},
 memorial:{eye:[2.6,-91,43.76],look:[2.6,-89.65,44.6]},
 exit:{eye:[0,-91,43],look:[0,-90.1,35.4]},
 wreck:{eye:[0,-91.2,2],look:[2.31,-90.05,1.48]},
 gallery:{eye:[0,-90.25,17],look:[0,-89.8,28]},
 collapse:{eye:[0,-90.91,30.2],look:[0,-90.25,33]},
 mainshaft:{eye:[0,-91,69],look:[0,-89.1,86]},
 oldsupports:{eye:[0,-91,101],look:[0,-88.7,119]},
 deeptrack:{eye:[0,-91,121],look:[0,-89.7,138]},
 bayentry:{eye:[-5,-91,76],look:[-16,-90.2,74]},
 baycart:{eye:[-11.2,-91,76],look:[-10.1,-90.5,73.45]},
 baywreck:{eye:[-16.1,-91,76],look:[-16.1,-90.6,73.45]},
 baydesk:{eye:[-16.1,-91,77],look:[-16.2,-89.85,80.1]},
 pocketclosed:{eye:[4.7,-91,59.6],look:[6.1,-89.8,59.6]},
 pocketopen:{eye:[9.1,-91,59.6],look:[18.2,-89.6,59.6]},
 shortcutclosed:{eye:[-50,-91,67.7],look:[-50,-89.8,70.05]},
 shortcutopen:{eye:[-50,-91,69],look:[-50,-90,76]},
 annexentry:{eye:[-3.5,-91,101.1],look:[-8.2,-90,101.1]},
 annexbunk:{eye:[-8.1,-91,102.1],look:[-11.7,-89.7,102.1]},
 annexmap:{eye:[-8.5,-91,102.1],look:[-8.5,-89.3,99.53]},
 annexsupply:{eye:[-8.1,-91,106.7],look:[-11.7,-89.7,106.7]},
 annexreturn:{eye:[-8.1,-91,107.9],look:[0,-90,107.9]},
 returnapproach:{eye:[0,-90.19,15.8],look:[-4.7,-89.05,15.8]},
 returnstand:{eye:[-2.8,-90.19,15.8],look:[-4.7,-89.05,15.8]},
 returnbell:{eye:[-3,-90.206,16.12],look:[-3,-88.95,16.95]},
};
let frames=0,walked=0,rejected=0,trustedW=0,view='entry',stamp=performance.now();
const keys=new Set<string>(),direction=new Vector3();
function setView(name:string){
 if(name.startsWith('rail-')){
  const m=host.mainline;if(m?.kind!=='ready')return false;
  const role=name.slice(5),route=m.route,work=route.work;
  const marks:Record<string,number>={camp:0,sleepers:work.sleepers.chainage,gauge:work.gauge.chainage,curve:60,'turnout-rust':work['turnout-rust'].chainage,turnout:work.turnout.chainage,gate:route.length};
  const at=marks[role];if(at===undefined)return false;
  const rolling=role==='curve',chainage=at;
  mainlineReview={revision:++mainlineRevision,lastAtMs:mainlineRevision*1000,mode:rolling?'rolling':'stopped',chainage,
   speed:rolling?1.4:0,brakeHeld:rolling,turnout:role==='turnout'?'gate':'unset',cargo:{oreId:'',pieces:0},faults:{sleepers:3,gauge:3,'turnout-rust':4},...(rolling?{riderId:'review'}:{})};
  host.mounted.sync();
  const p=route.sample(at),f=p.position,shift=(side:number,along:number)=>({east:f.east+Math.cos(p.heading)*side-Math.sin(p.heading)*along,north:f.north+Math.sin(p.heading)*side+Math.cos(p.heading)*along,height:f.height});
  const eye=[shift(1.25,-2.2),shift(-1.25,-2.2),shift(0,at===0?2.6:-2.6)].find(q=>host.passageAt(q.east,q.north));
  if(!eye)return false;
  camera.position.set(eye.east,eye.height+1.67,-eye.north);camera.lookAt(f.east,f.height+.7,-f.north);torch.intensity=35;view=name;return true;
 }
 mainlineReview=undefined;
 const wallOpen=name==='pocketopen'||name==='shortcutopen';
 reviewTargets=host.thinWalls.sites.map(s=>({...s,surface:'rock' as const,hits:wallOpen?s.strikes:2,open:wallOpen}));
 host.mounted.sync();
 const ride=host.mounted.shaftRide;
 const lift=host.interlayerLift;
 if(name.startsWith('deep-')){
  ride?.hide();if(!lift)return false;
  domain=name==='deep-lower'?interlayerSite.lower.domainId:interlayerSite.upper.domainId;
  host.mounted.sync();
  if(name==='deep-bore'){
   const receipt:R30InterlayerRide={id:1,linkId:'mine1-mine2-lift',riderId:'review-fixture',fromDomain:interlayerSite.upper.domainId,toDomain:interlayerSite.lower.domainId,departedAt:0,travelMs:25000};
   const cue=lift.present(receipt,12500,true);if(!cue)return false;
   camera.position.set(cue.eye.east,cue.eye.height,-cue.eye.north);
   camera.lookAt(camera.position.clone().add(new Vector3(.2,-.5,-1)));
   torch.intensity=15;
  }else{
   lift.present(undefined,0,false);
   const lower=domain===interlayerSite.lower.domainId,a=lower?interlayerSite.approach.lower:interlayerSite.approach.upper,p=lower?interlayerSite.lower.foot:interlayerSite.upper.foot;
   if(!(lower?host.deepHost.passageAt(domain,a.east,a.north):host.passageAt(a.east,a.north)))return false;
   camera.position.set(a.east,a.height+1.67,-a.north);camera.lookAt(p.east,p.height+1.2,-p.north);torch.intensity=35;
  }
  view=name;return true;
 }
 lift?.present(undefined,0,false);domain=interlayerSite.upper.domainId;host.mounted.sync();
 if(name.startsWith('lift-')){
  if(!ride)return false;
  const at=name==='lift-upper'?4000:name==='lift-mid'?12500:20500;
  const cue=ride.sample({id:1,first:true,departedAt:0,travelMs:25000,direction:'down'},at);
  if(!cue)return false;
  camera.position.set(cue.eye.east,cue.eye.height,-cue.eye.north);
  camera.lookAt(camera.position.clone().add(new Vector3(.2,-.55,-1)));
  torch.intensity=5;view=name;return true;
 }
 ride?.hide();torch.intensity=35;
 const v=eyes[name];if(!v)return false;const p=vec(v.eye);
 if(!host.passageAt(p.x,-p.z))return false;
 camera.position.copy(p).add(new Vector3(0,1.67,0));camera.lookAt(vec(v.look));view=name;return true;
}
function step(seconds:number){
 if(!keys.has('w')||seconds<=0||seconds>2)return false;
 camera.getWorldDirection(direction);direction.y=0;direction.normalize();
 const distance=seconds*2.7,count=Math.ceil(distance/.05);
 for(let i=0;i<count;i++){
  const next=camera.position.clone().addScaledVector(direction,distance/count),p=host.passageAt(next.x,-next.z);
  if(!p){rejected++;return false}
  camera.position.set(next.x,p.floor+1.67,next.z);walked+=distance/count;
 }return true;
}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w'){keys.add('w');if(e.isTrusted)trustedW++;e.preventDefault()}});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
if(!setView('entry'))throw Error('camp entry blocked');
function frame(){host.mounted.sync();render.render(scene,camera);frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);
Object.assign(window,{campR30:{setView,step,reset:()=>{frames=0;stamp=performance.now()},inspect:()=>({view,frames,walked,rejected,trustedW,calls:render.info.render.calls,tris:render.info.render.triangles,fps:frames*1000/Math.max(1,performance.now()-stamp),roofParts:camp.r30Roof.parts.length,props:camp.props.length,interlayerParts:host.interlayerLift?.parts,galleryParts:host.mounted.galleryArt?.parts.length,workbayParts:host.mounted.workbay?.parts,annexParts:host.mounted.supportAnnex?.parts.length,returnBayParts:host.returnBay.parts.length,mainlineLength:host.mainline?.kind==='ready'?host.mainline.route.length:0,mainlineParts:host.mainline?.kind==='ready'?host.mainline.scene.r30Dressing?.parts:0,retiredCarts:host.mounted.workbay?.cartCount,deepStatus:host.deepHost.status()})}});
