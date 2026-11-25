import {Color,DirectionalLight,Fog,HemisphereLight,PerspectiveCamera,Scene,Vector3,WebGLRenderer} from 'three';
import {createTerrainGrid,worldBounds} from './terrain';
import {mountWestCraterRoad} from './town-za22-crater-road';
import {buildCraterRailExtension} from './town-crater-rail-extension';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater';
import {installBR30Workface} from './town-b-r30-crater-workface';
import {installCraterWorkshopWorld} from './town-b-r30-crater-workstations';

const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const rail=buildCraterRailExtension(grid,road);
const face=installBR30Workface(road),machines=installCraterWorkshopWorld(road,rail);
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
const approach=fixture.mainTrailPoint(.99);
add('bottom','矿道末段向井口',world(approach.east,approach.north),{east:a.east,north:a.north,height:a.rimHeight-33.9});
for(const p of face.sites){
  const n=p.north-2.65,e=p.east,h=road.heightAt(e,n);
  if(h!==undefined)add(p.id,p.id,{east:e,north:n,height:h},{east:p.east,north:p.north,height:p.height+.8});
}
for(const p of machines.sites)add(p.id,p.label,p.foot,p.target);
const select=document.querySelector<HTMLSelectElement>('#views')!,phase=document.querySelector<HTMLButtonElement>('#phase')!,hud=document.querySelector<HTMLElement>('#position')!;
for(const v of views)select.add(new Option(v.label,v.id));
let east=0,north=0,feet=0,yaw=0,pitch=0,night=false,frame=0,drag=false,last=performance.now();
const keys=new Set<string>(),look=new Vector3();
function light(){const col=new Color(night?0x18263c:0xa8bfd1);scene.background=col;scene.fog=new Fog(col,65,290);
  sky.intensity=night?.78:1.75;sun.intensity=night?.24:2.1;sky.color.set(night?0x9cb7e2:0xc6d9f6);
  road.craterActions.setNight(night);phase.textContent=night?'雪夜':'白昼';}
function choose(){
  const v=views.find(v=>v.id===select.value)!;
  ({east,north,height:feet}=v.foot);
  const e=v.target.east-east,n=v.target.north-north;
  yaw=Math.atan2(e,n);pitch=Math.atan2(v.target.height-feet-1.65,Math.hypot(e,n));
}
function blocked(e:number,n:number,h:number){
  return (road.group.userData.colliders as {min:number[],max:number[]}[]).some(b=>{
    if(h+1.8<=b.min[1]||h>=b.max[1])return false;
    return Math.hypot(Math.max(b.min[0]-e,e-b.max[0],0),Math.max(b.min[2]+n,-n-b.max[2],0))<.27;
  });
}
function step(e:number,n:number){const h=road.heightAt(e,n);if(h===undefined||Math.abs(h-feet)>.43||blocked(e,n,h))return;east=e;north=n;feet=h;}
function tick(now:number){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  if(f||side){const v=3.2*dt/Math.hypot(f,side);step(east+(Math.sin(yaw)*f+Math.cos(yaw)*side)*v,north+(Math.cos(yaw)*f-Math.sin(yaw)*side)*v);}
  camera.position.set(east,feet+1.65,-north);look.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).add(camera.position);
  camera.lookAt(look);renderer.render(scene,camera);frame++;
  hud.textContent='E '+east.toFixed(2)+' / N '+north.toFixed(2)+' / H '+feet.toFixed(2);
  requestAnimationFrame(tick);
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);addEventListener('keydown',e=>keys.add(e.code));addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
renderer.domElement.addEventListener('pointerdown',e=>{drag=true;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointerup',()=>drag=false);
renderer.domElement.addEventListener('pointermove',e=>{if(drag){yaw+=e.movementX*.003;pitch=Math.max(-1.3,Math.min(1.3,pitch-e.movementY*.003));}});
select.addEventListener('change',choose);phase.addEventListener('click',()=>{night=!night;light();});
resize();choose();light();
Object.defineProperty(window,'__bR30Review',{value:()=>({frame,night,east,north,feet,yaw,pitch,view:select.value,views,draws:renderer.info.render.calls,tris:renderer.info.render.triangles,aim:machines.aimControl({east,north,height:feet},yaw,pitch,1.65)?.station??null})});
requestAnimationFrame(tick);
