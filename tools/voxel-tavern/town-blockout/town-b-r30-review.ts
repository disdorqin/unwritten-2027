import {Color,DirectionalLight,Fog,HemisphereLight,PerspectiveCamera,Scene,Vector3,WebGLRenderer} from 'three';
import {createTerrainGrid,worldBounds} from './terrain';
import {mountWestCraterRoad} from './town-za22-crater-road';
import {buildCraterRailExtension} from './town-crater-rail-extension';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater';
import {attachBR30PhysicalKit} from './town-b-r30-physical-kit';
import {buildBR30ReturnHeadframe} from './town-b-r30-return-headframe';
import {installBR30MoundPlanting} from './town-b-r30-mound-planting';
import {installBR30MoundWorkFlag,createBR30MoundControls} from './town-b-r30-mound-work-flag';
import {createMound} from './town-crater-points-play';
import {createBR30WorkshopReviewFixture} from './town-b-r30-workshop-review-fixture';
import {stripBR30LegacyTerraceMesh} from './town-b-r30-retire-legacy-terraces';
import {settleBR30StorySupports} from './town-b-r30-settle-story-supports';

const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
// Preview only: A must consume retireBR30LegacyTerracePlates before
// production reservation/collision consumers. The retired plates had no boxes.
const retiredPlates=stripBR30LegacyTerraceMesh(road.group);
const settledSupports=settleBR30StorySupports(road.group,road.heightAt);
const rail=buildCraterRailExtension(grid,road);
const {face,machines,markers}=attachBR30PhysicalKit(road,rail);
const mound=installBR30MoundPlanting(road);
const workFlag=installBR30MoundWorkFlag(road);
// Only the independent review consumes the sealed return prefab; no
// production terrain cut or new lift authority is introduced.
const returnHeadframe=buildBR30ReturnHeadframe(road);
road.group.add(returnHeadframe.group);
const scene=new Scene();scene.add(road.group,rail.group);
const sky=new HemisphereLight(0xc6d9f6,0x776650,1.75),sun=new DirectionalLight(0xffe7c7,2.1);
sun.position.set(-30,75,45);scene.add(sky,sun);
const camera=new PerspectiveCamera(69,1,.05,400);
const renderer=new WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));document.body.prepend(renderer.domElement);
type Point={east:number;north:number;height:number};
type View={id:string;label:string;foot:Point;target:Point};
const views:View[]=[];
const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw),fixture=createMeteorCrater(meteorCraterFixturePlan);
function world(e:number,n:number):Point{const east=a.east+e*c+n*s,north=a.north+n*c-e*s;return {east,north,height:road.heightAt(east,north)!};}
function add(id:string,label:string,foot:Point,target:Point){
  if([foot.east,foot.north,foot.height,target.east,target.north,target.height].every(Number.isFinite))views.push({id,label,foot,target});
}
const rim=fixture.mainTrailPoint(.018);
add('rim','坑沿向内',world(rim.east,rim.north),{east:a.east,north:a.north,height:a.rimHeight-19});
const seen=new Set<string>();
for(const {cluster,view} of road.midgroundS5.crystalViews){
  if(seen.has(cluster))continue;seen.add(cluster);
  add(cluster,'晶簇 '+cluster,view.foot,view.target);
}
const trestleView=road.midgroundS5.trestleView;
if(trestleView)add('broken-trestle','断栈道遗址',trestleView.foot,trestleView.target);
const approach=fixture.mainTrailPoint(.99);
add('bottom','矿道末段向井口',world(approach.east,approach.north),{east:a.east,north:a.north,height:a.rimHeight-33.9});
for(const site of markers.sites){
  for(const [i,foot] of site.viewFeet.entries())add(site.id+'-'+i,'矿道导向 '+site.id+(i?' 返程':' 下行'),foot,{...site.post,height:site.post.height+1.45});
}
const summit=mound.route.at(-1)!;
add('mound-foot','中央丘 · 矿道出口',mound.route[0],{...summit,height:summit.height+1.6});
add('mound-east','中央丘 · 东侧坡',mound.route[5],{...summit,height:summit.height+1.3});
const crownTree=mound.sites.find(s=>s.ring==='summit')!;
add('mound-crown','中央丘 · 焦松与风旗',summit,{...crownTree,height:crownTree.height+1.7});
add('mound-work-flag','中央丘 · 旧工旗',workFlag.foot,workFlag.target());
const rt=returnHeadframe.survey;
add('return-headframe','封闭返程井架候选',rt.approach,{...rt.axis,height:rt.axis.height+1.5});
const back={east:rt.approach.east+(rt.bend.east-rt.approach.east)*.35,north:rt.approach.north+(rt.bend.north-rt.approach.north)*.35};
add('return-headframe-approach','返程地表接近段', {...back,height:road.heightAt(back.east,back.north)!},{...rt.axis,height:rt.axis.height+1.6});
for(const p of face.sites){
  const n=p.north-2.65,e=p.east,h=road.heightAt(e,n);
  if(h!==undefined)add(p.id,p.id,{east:e,north:n,height:h},{east:p.east,north:p.north,height:p.height+.8});
}
for(const p of machines.sites)add(p.id,p.label,p.foot,p.target);
for(const t of machines.targets)if(t.index!==undefined){
 const site=machines.sites.find(s=>s.id===t.station)!;
 add(t.station+'-'+t.index,site.label+' '+(t.index+1),site.foot,t.point);
}
const select=document.querySelector<HTMLSelectElement>('#views')!,phase=document.querySelector<HTMLButtonElement>('#phase')!,hud=document.querySelector<HTMLElement>('#position')!;
for(const v of views)select.add(new Option(v.label,v.id));
let east=0,north=0,feet=0,yaw=0,pitch=0,night=false,frame=0,drag=false,last=performance.now();
const keys=new Set<string>(),look=new Vector3();
const fixtureMode=new URLSearchParams(location.search).has('workshop');
const sample=document.querySelector<HTMLSelectElement>('#fixture-ore')!;
const fixturePanel=document.querySelector<HTMLElement>('#fixture-panel')!,fixtureStatus=document.querySelector<HTMLElement>('#fixture-status')!;
fixturePanel.hidden=!fixtureMode;
const workshop=fixtureMode?createBR30WorkshopReviewFixture(machines,()=>({east,north,height:feet,heading:yaw,pitch,eyeHeight:1.65})):undefined;
sample.addEventListener('change',()=>workshop?.setHeld(sample.value));
// Review fixture only. Deliberately isolated from actual profile/atlas
// storage. A's production dispatcher must use its existing authority.
const moundMode=new URLSearchParams(location.search).has('mound');
const moundPanel=document.querySelector<HTMLElement>('#mound-fixture')!,moundStatus=document.querySelector<HTMLElement>('#mound-status')!;
moundPanel.hidden=!moundMode;
const fixtureKey='b-r30-mound-review-only-v1';
let saved={flagStraight:false,overlookKnown:false};
if(moundMode){try{const x=JSON.parse(localStorage.getItem(fixtureKey)??'null');if(x&&typeof x.flagStraight==='boolean'&&typeof x.overlookKnown==='boolean')saved=x;}catch{}}
const moundRule=createMound(saved.flagStraight);let known=saved.overlookKnown;
const persistMound=()=>{if(moundMode)localStorage.setItem(fixtureKey,JSON.stringify({flagStraight:moundRule.flagStraight,overlookKnown:known}));};
const moundControls=moundMode?createBR30MoundControls(workFlag,{
 pose:()=>({east,north,height:feet,heading:yaw,pitch,eyeHeight:1.65}),
 facts:()=>({flagStraight:moundRule.flagStraight,overlookKnown:known}),
 async request(intent){
  if(intent.kind==='reach-overlook'){const r=moundRule.reachSummit();known=known||r.atlasFirstTime;persistMound();return {accepted:true};}
  const r=moundRule.straightenFlag();if(r.persist)persistMound();return {accepted:r.changed};
 }
}):undefined;
function light(){const col=new Color(night?0x18263c:0xa8bfd1);scene.background=col;scene.fog=new Fog(col,65,290);
  sky.intensity=night?.78:1.75;sun.intensity=night?.24:2.1;sky.color.set(night?0x9cb7e2:0xc6d9f6);
  road.craterActions.setNight(night);phase.textContent=night?'雪夜':'白昼';}
function choose(){
  const v=views.find(v=>v.id===select.value)!;
  ({east,north,height:feet}=v.foot);
  const target=v.id==='mound-work-flag'?workFlag.target():machines.targets.find(t=>(t.index===undefined?t.station:t.station+'-'+t.index)===v.id)?.point??v.target;
  const e=target.east-east,n=target.north-north;
  yaw=Math.atan2(e,n);pitch=Math.atan2(target.height-feet-1.65,Math.hypot(e,n));
}
function blocked(e:number,n:number,h:number){
  return ([...road.group.userData.colliders,...returnHeadframe.worldBoxes] as {min:number[],max:number[]}[]).some(b=>{
    if(h+1.8<=b.min[1]||h>=b.max[1])return false;
    return Math.hypot(Math.max(b.min[0]-e,e-b.max[0],0),Math.max(b.min[2]+n,-n-b.max[2],0))<.27;
  });
}
function step(e:number,n:number){const h=road.heightAt(e,n);if(h===undefined||Math.abs(h-feet)>.43||blocked(e,n,h))return;east=e;north=n;feet=h;}
function tick(now:number){
  const elapsed=Math.max(0,now-last),dt=Math.min(.05,elapsed/1000);last=now;
  if(workshop){
   workshop.tick(Math.min(250,elapsed));
   const w=workshop.state();sample.value=w.held;
   fixtureStatus.textContent=w.last+'；'+(w.aim??'未瞄准')+'；受理 '+w.accepted+' / 拒绝 '+w.rejected;
  }
  const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  if(f||side){const v=3.2*dt/Math.hypot(f,side);step(east+(Math.sin(yaw)*f+Math.cos(yaw)*side)*v,north+(Math.cos(yaw)*f-Math.sin(yaw)*side)*v);}
  if(moundControls){
   if(moundControls.action('reach-overlook'))void moundControls.interact('reach-overlook');
   moundStatus.textContent=(known?'样例图鉴：坑底最高处已登记':'样例图鉴：尚未登顶')+'；'+(moundRule.flagStraight?'工旗已扶正':moundControls.action('straighten-flag')?'E 扶正旧工旗':'瞄准旧工旗');
  }
  camera.position.set(east,feet+1.65,-north);look.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).add(camera.position);
  camera.lookAt(look);renderer.render(scene,camera);frame++;
  hud.textContent='E '+east.toFixed(2)+' / N '+north.toFixed(2)+' / H '+feet.toFixed(2);
  requestAnimationFrame(tick);
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);addEventListener('keydown',e=>{
 keys.add(e.code);
 if(!e.repeat&&e.code==='KeyE'&&moundControls?.action('straighten-flag')){e.preventDefault();void moundControls.interact('straighten-flag');}
 else if(workshop&&!e.repeat&&(e.code==='KeyE'||e.code==='KeyQ')){e.preventDefault();void workshop.press(e.code==='KeyQ'?-1:1);}
});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
renderer.domElement.addEventListener('pointerdown',e=>{drag=true;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointerup',()=>drag=false);
renderer.domElement.addEventListener('pointermove',e=>{if(drag){yaw+=e.movementX*.003;pitch=Math.max(-1.3,Math.min(1.3,pitch-e.movementY*.003));}});
select.addEventListener('change',choose);phase.addEventListener('click',()=>{night=!night;light();});
resize();choose();light();
Object.defineProperty(window,'__bR30Review',{value:()=>({frame,night,east,north,feet,yaw,pitch,view:select.value,views,retiredPlates,settledSupports:settledSupports.length,draws:renderer.info.render.calls,tris:renderer.info.render.triangles,aim:machines.aimControl({east,north,height:feet},yaw,pitch,1.65)?.station??null,workshop:workshop?.state(),moundRoute:mound.route,moundAudit:mound.audit,workFlag:{at:workFlag.at,foot:workFlag.foot,target:workFlag.target(),straight:workFlag.straight,parts:workFlag.parts,fixture:moundMode?{known,flagStraight:moundRule.flagStraight,aim:!!moundControls?.action('straighten-flag')}:undefined}})});
requestAnimationFrame(tick);
