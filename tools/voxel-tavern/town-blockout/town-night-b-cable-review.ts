import {AmbientLight,Color,DirectionalLight,Fog,Group,Mesh,MeshLambertMaterial,PerspectiveCamera,Scene,WebGLRenderer} from 'three';
import {createTownPresence} from './town-presence';
import {createNightBFrontService} from './town-night-b-summit-front-service';
import {createNightBLine2Service,auditNightBSummitCable} from './town-night-b-summit-line2-service';
import {createNightBCableRideHost} from './town-night-b-summit-ride-host';
import {createTerrainGrid} from './terrain';
import {buildFrontRidgeR30Field,mountFrontRidgeR30} from './town-d-r30-front-ridge';
import {mountRidgeCableFacilities,externalCableDockSupport} from './town-d-r30-cable-facilities';
import {auditNightBFrontOpenFacilities} from './town-night-b-summit-front-sweep';
import {createTownD2R30Collision} from './town-d2-r30-collision';
import {sampleTownD2R30Height,townD2R30ChunkList} from './town-d2-r30-domain';
import {buildTownD2R30ChunkGeometry} from './town-d2-r30-massif';
import {createTownD2R30Ropeway} from './town-d2-r30-ropeway';
import {createTownD2R30CableTowers} from './town-d2-r30-cable-towers';
import {mountMainSummitCableWorkshop,mainSummitR30CableWorkshopAnchor} from './main-summit-cable-workshop';
const params=new URLSearchParams(location.search),line=params.get('line')==='2'?2:1;
const scene=new Scene(),sky=new Color('#aec6dc');scene.background=sky;scene.fog=new Fog(sky,400,1800);
const camera=new PerspectiveCamera(64,innerWidth/innerHeight,.12,3600);
const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement);
const sun=new DirectionalLight('#fff0d3',2);sun.position.set(-300,700,400);scene.add(sun,new AmbientLight('#dbe7fa',1.3));
const presence=createTownPresence(scene,camera,()=>{}),origin={east:300,north:676};
const dispatch={openedAt:()=>presence.getCableLineOpenedAt(line),dawnEpoch:()=>presence.getTownWeatherDawnEpoch()};
const common={state:()=>presence.getCableLineState(line),now:presence.cableServerNow,dispatch,daylight:()=>presence.getTownNightWindow()?.phase==='day'};
let host:ReturnType<typeof createNightBCableRideHost>,feet:{east:number;north:number;height:number},legMs:number,cycleMs:number;
let visualPos=()=>({east:0,north:0,height:0});
if(line===1){
 const grid=createTerrainGrid(),field=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1),model=mountFrontRidgeR30(field);scene.add(model.group);
 const facilities=mountRidgeCableFacilities(scene,field,true,false,true);
 const audit=auditNightBFrontOpenFacilities(field,facilities,()=>false);
 const dockClear=(_s:string,p:typeof feet)=>Math.abs((externalCableDockSupport(p.east,p.north)??field.heightAt(p.east,p.north)??Infinity)-p.height)<.05&&!facilities.blocked(p.east,p.north,p.height);
 const service=createNightBFrontService({...common,survey:facilities.survey,audit,dockClear});
 host=createNightBCableRideHost({front:service,frontFacilities:facilities,upperOrigin:origin,domain:()=> 'town',acceptLanding:(_l,p,s)=>dockClear(s,p)});
 const start=service.cabinsAt(0)[0]!.feet;feet={...start,north:start.north-2.1};legMs=service.clock.oneWayMs;cycleMs=service.clock.cycleMs;
 visualPos=()=>{const p=facilities.group.getObjectByName('d-r30-cable-cabin--1')!.position;return {east:p.x,north:-p.z,height:p.y}};
}else{
 const g=createTownD2R30Collision(),root=new Group();root.position.set(origin.east,0,-origin.north);scene.add(root);
 const material=new MeshLambertMaterial({vertexColors:true});
 for(const chunk of townD2R30ChunkList)root.add(new Mesh(buildTownD2R30ChunkGeometry(chunk,8,347),material));
 const ropeway=createTownD2R30Ropeway({heightAt:g.surfaceAt,controlPointSupports:false}),towers=createTownD2R30CableTowers({heightAt:g.surfaceAt,cable:ropeway.cable});
 root.add(ropeway.group,towers.group);const workshop=mountMainSummitCableWorkshop(root,g.surfaceAt,mainSummitR30CableWorkshopAnchor);
 const audit=auditNightBSummitCable(ropeway,g.surfaceAt,p=>{for(const x of [-1.22,0,1.22])for(const z of [-1.52,0,1.52]){
  const e=p.feet.east+x*Math.cos(p.heading)+z*Math.sin(p.heading),n=p.feet.north-x*Math.sin(p.heading)+z*Math.cos(p.heading);
  for(const dh of [0,.68])if(ropeway.blocked(e,n,p.feet.height+dh,.025)||towers.blocked(e,n,p.feet.height+dh,.025)||workshop.blocked(e,n,p.feet.height,.025,2.48))return true;
 }return false;});
 const dockClear=(_s:string,p:typeof feet)=>Math.abs((ropeway.supportAt(p.east,p.north)??Infinity)-p.height)<.05&&!ropeway.blocked(p.east,p.north,p.height);
 const service=createNightBLine2Service({...common,ropeway,audit,dockClear});
 host=createNightBCableRideHost({upper:service,upperRopeway:ropeway,upperOrigin:origin,domain:()=> 'summit',acceptLanding:(_l,p,s)=>dockClear(s,{...p,east:p.east-origin.east,north:p.north-origin.north})});
 const start=ropeway.cable.ropes[0].dock('cloud-deck').approach;feet={...start,east:start.east+origin.east,north:start.north+origin.north};legMs=ropeway.cable.legMs;cycleMs=ropeway.cable.cycleMs;
 visualPos=()=>{const p=ropeway.group.getObjectByName('summit-line2-cabin-0')!.position;return {east:p.x+origin.east,north:-p.z+origin.north,height:p.y-2.4}};
 presence.setSummitDomain(true,scene);
}
let actions=0,lastAction='',frame=0,last=performance.now();
addEventListener('keydown',e=>{if(e.code!=='KeyE'||e.repeat||document.activeElement instanceof HTMLInputElement)return;actions++;
 if(host.riding()){const landing=host.exit();if(landing){feet=landing;lastAction='exit'}else lastAction='blocked-exit';}
 else lastAction=host.board(feet,line,0)?'board':'blocked-board';
});
const status=document.querySelector('#ride-status')!;
function state(){const ride=host.pose();return {line,legMs,cycleMs,actions,lastAction,frame,ride,feet,visual:visualPos(),bound:line===1?host.frontBound:host.upperBound,clock:presence.cableServerNow(),epoch:dispatch.openedAt(),dawn:dispatch.dawnEpoch(),self:presence.selfId(),people:presence.nearbyPlayerPoses(),draws:renderer.info.render.calls,tris:renderer.info.render.triangles};}
Object.assign(window,{__nightBCableReview:{state}});
function loop(t:number){
 const dt=Math.min(.25,Math.max(0,(t-last)/1000));last=t;host.updateVisuals();
 const ride=host.pose(),p=ride?.feet??feet;
 if(ride)presence.sampleCableRide(ride,0);else{presence.setActivityPose(0);presence.sample(true,p.east,p.north,p.height,0);}
 presence.update(dt);camera.position.set(p.east+4,p.height+3,-p.north+5);camera.lookAt(p.east,p.height+1,-p.north);
 scene.fog!.near=ride?.whiteout?1:400;scene.fog!.far=ride?.whiteout?12:1800;
 renderer.render(scene,camera);frame++;status.textContent='线'+line+' · '+(ride?'乘坐 '+(ride.station??'运行'):'站台')+' · '+lastAction;requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
