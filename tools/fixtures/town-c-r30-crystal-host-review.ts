import {AmbientLight,Color,FogExp2,Group,PerspectiveCamera,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {mountWestCraterRoad} from '../voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../voxel-tavern/town-blockout/underground-domain-host.js';
import {crystalCavernTrailEast,crystalCavernTrailHeight,crystalCavernToWorld} from '../voxel-tavern/town-blockout/underground-crystal-cavern.js';
import {r30CrystalDomain,crystalSideTrailNorth} from '../voxel-tavern/town-blockout/town-c-r30-crystal-support.js';
import {createUndergroundMineGate} from '../../src/presence/underground-mine-gate.js';
const scene=new Scene();scene.background=new Color(0x17232a);scene.fog=new FogExp2(0x17232a,.017);
const root=new Group();scene.add(root,new AmbientLight(0xa2cbdc,.65));
const road=mountWestCraterRoad(260,()=>10.7773);
let gate:ReturnType<typeof createUndergroundMineGate>|undefined,now=0,reviewStoneAtOrigin=true;
let foot:{playerId:string;domainId:string;east:number;north:number;height:number}|undefined;
const hostResult=mountUndergroundDomainHost({parent:root,road,readAcceptedDomainFoot:()=>foot,
 crystalBridge:{acceptsFrame:()=>true,readGateStage:()=>gate?.state(),readLightBudget:()=>3,
  // Review-only presentation receipt. Not a production star-stone authority.
  monkeySeat:{acceptsSite:()=>true,read:()=>({atOrigin:reviewStoneAtOrigin,resonant:true}),readPlayerId:()=> 'review',isAimingAt:()=>true,dispatch:()=>{}}}});
if(hostResult.kind!=='ready')throw Error(hostResult.reason);
const h=hostResult;
const ch=h.crystalHost!,c=ch.contract!;
h.mounted.sync();if(!ch.mounted)throw Error('crystal mount failed');
gate=createUndergroundMineGate({winch:c.winch,crystalSwitch:c.returnSwitch,readAcceptedFoot:()=>foot,
 passage:{mine:c.mine,crystal:c.crystal,isAtThreshold:c.isAtThreshold,supportsLanding:c.supportsLanding},
 encounter:{isSectionCleared:()=>true},now:()=>now,revealMs:1000});
foot={...c.winch,playerId:'review'};if(gate.openFromMine('review')!=='ajar')throw Error('gate failed');
now=1001;h.mounted.sync();foot={...c.mine,playerId:'review'};
const receipt=gate.resolveTraversal('review');if(!receipt)throw Error('gate receipt missing');
foot={...receipt.landing,playerId:'review'};h.mounted.sync();
const camera=new PerspectiveCamera(70,innerWidth/innerHeight,.05,120);
const torch=new PointLight(0xc0f4ee,40,22,2);camera.add(torch);scene.add(camera);
const renderer=new WebGLRenderer({antialias:false,powerPreference:'low-power'});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const views:Record<string,{n:number;e?:number;lookN:number;lookE?:number;lookH?:number}>={
 entry:{n:-9.6,lookN:17},vestibule:{n:-6.2,lookN:9,lookH:1.6},grove:{n:4.8,lookN:12.5,lookH:.65},returnlever:{n:-7.8,lookN:-7.8,lookE:1.45,lookH:1.08},forest:{n:22,lookN:42,lookE:-8,lookH:4},
 overlook:{n:55,lookN:73,lookE:26,lookH:5},quay:{e:24.5,n:76,lookN:87,lookE:50,lookH:1.7},
 far:{n:91,lookN:105,lookE:22,lookH:5},
 'monkey-seat':{e:2.05,n:9.25,lookE:3.15,lookN:9.25,lookH:.46},
 'monkey-empty':{e:2.05,n:9.25,lookE:3.15,lookN:9.25,lookH:.46},
 'west-join':{e:8.8,n:56,lookE:-17,lookN:56,lookH:1.4},
 'west-approach':{e:-11,n:56,lookE:-25,lookN:crystalSideTrailNorth(-25),lookH:1.4},
 'west-bend':{e:-29.4,n:crystalSideTrailNorth(-29.4)!,lookE:-40,lookN:crystalSideTrailNorth(-40),lookH:1.4},
 'west-end':{e:-49.9,n:crystalSideTrailNorth(-49.9)!,lookE:-53.4,lookN:56,lookH:1.6},
 'quay-edge':{e:32.6,n:76,lookE:36,lookN:76,lookH:.7},
 'rear-stop':{e:8.7,n:97.5,lookE:8.7,lookN:108,lookH:2},
};
let frames=0,walked=0,rejected=0,trustedW=0,view='entry',stamp=performance.now();
const keys=new Set<string>(),direction=new Vector3();
const world=(e:number,n:number,height=crystalCavernTrailHeight(n))=>crystalCavernToWorld(c.frame,[e,height,n]);
const v=(p:{east:number;north:number;height:number})=>new Vector3(p.east,p.height,-p.north);
function setView(name:string){
 const q=views[name];if(!q)return false;
 reviewStoneAtOrigin=name!=='monkey-empty';
 const e=q.e??crystalCavernTrailEast(q.n),p=world(e,q.n),pass=ch.passageAt(r30CrystalDomain,p.east,p.north);
 if(!pass)return false;
 foot={...p,height:pass.floor,domainId:r30CrystalDomain,playerId:'review'};
 camera.position.copy(v(foot)).add(new Vector3(0,1.67,0));
 camera.lookAt(v(world(q.lookE??crystalCavernTrailEast(q.lookN),q.lookN,crystalCavernTrailHeight(q.lookN)+(q.lookH??1.4))));
 view=name;return true;
}
function step(seconds:number){
 if(!keys.has('w')||seconds<=0||seconds>2)return false;
 camera.getWorldDirection(direction);direction.y=0;direction.normalize();
 const distance=seconds*2.7,count=Math.ceil(distance/.05);
 for(let i=0;i<count;i++){
  const next=camera.position.clone().addScaledVector(direction,distance/count),p=ch.passageAt(r30CrystalDomain,next.x,-next.z);
  if(!p){rejected++;return false}
  foot={playerId:'review',domainId:r30CrystalDomain,east:next.x,north:-next.z,height:p.floor};
  camera.position.set(next.x,p.floor+1.67,next.z);walked+=distance/count;
 }
 return true;
}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w'){keys.add('w');if(e.isTrusted)trustedW++;e.preventDefault()}});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
if(!setView('entry'))throw Error('entry blocked');
function frame(){h.mounted.sync();renderer.render(scene,camera);frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);
Object.assign(window,{campR30:{setView,step,reset:()=>{frames=0;stamp=performance.now()},inspect:()=>({view,frames,walked,rejected,trustedW,calls:renderer.info.render.calls,tris:renderer.info.render.triangles,fps:frames*1000/Math.max(1,performance.now()-stamp),crystalPieces:ch.mounted?.architecture.cuboids,gate:ch.stage()})}});
