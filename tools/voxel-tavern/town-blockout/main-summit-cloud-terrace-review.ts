import {
  AmbientLight,Color,DirectionalLight,Fog,Group,Mesh,MeshLambertMaterial,
  PerspectiveCamera,PlaneGeometry,Scene,Vector3,WebGLRenderer,
} from 'three';
import {mountCloudTerraceArt} from './main-summit-cloud-terrace-art';
import {cloudStoneRingAnchor} from './main-summit-cloud-terrace-ring';
import {terraceFurnishingLayout} from './main-summit-cloud-terrace-furnishings';
const scene=new Scene();
scene.background=new Color('#acc4d0');
scene.fog=new Fog('#acc4d0',110,420);
const ambient=new AmbientLight('#e0e4de',1.45);
scene.add(ambient);
const sunlight=new DirectionalLight('#fff2d3',2.8);
sunlight.position.set(-14,45,32);
scene.add(sunlight);
const owner=new Group();scene.add(owner);
const art=mountCloudTerraceArt(owner);
const reviewFloor=new Mesh(new PlaneGeometry(110,62),
  new MeshLambertMaterial({color:'#79817e'}));
reviewFloor.name='review-only-backdrop-not-productive-world';
reviewFloor.rotation.x=-Math.PI/2;
reviewFloor.position.set(10,346.77,13);
scene.add(reviewFloor);
const renderer=new WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);
const camera=new PerspectiveCamera(61,1,.1,450);
const views={
  overview:{at:new Vector3(12,358,42),look:new Vector3(2,349,15)},
  ring:{at:new Vector3(-6.1,351.2,28),look:new Vector3(-8,350.8,15)},
  bench:{at:new Vector3(19,351.9,29),look:new Vector3(17.3,348.8,15.1)},
  overhead:{at:new Vector3(0,378,24),look:new Vector3(8,347,15)},
}as const;
let currentView:keyof typeof views='overview';
const image=document.querySelector<HTMLImageElement>('#refImg')!;
// Static build-known URLs: Vite must be able to transform the assets from
// the repository, instead of treating dynamic concatenation as a route.
const referenceUrls={
  day:new URL('../../../docs/参考图/mountain/ref-m03-cloudsea-platform.webp',import.meta.url).href,
  night:new URL('../../../docs/参考图/mountain/ref-m36-cloudsea-platform-night.webp',import.meta.url).href,
  ring:new URL('../../../docs/参考图/mountain/ref-m34-starport-ring.webp',import.meta.url).href,
}as const;
const info=document.querySelector<HTMLOutputElement>('#info')!;
const reply=document.querySelector<HTMLOutputElement>('#reply')!;
let night=false,frame=0,subject:'ring'|'supplies'='ring',
  lastTouch:ReturnType<ReturnType<typeof mountCloudTerraceArt>['inspect']>|undefined,disposed=false;
const keys:string[]=[];
function reference(){
  image.src=currentView==='ring' ? referenceUrls.ring :
    night ? referenceUrls.night : referenceUrls.day;
}
function setNight(next:boolean){
  night=next;
  art.setNight(next);
  scene.background=new Color(next?'#172944':'#acc4d0');
  scene.fog=new Fog(next?'#243951':'#acc4d0',110,420);
  ambient.intensity=next ? .55 : 1.45;
  sunlight.intensity=next ? .22 : 2.8;
  reference();
}
function setView(next:keyof typeof views){
  currentView=next;reference();
}
function handle(verb:'view'|'listen'|'touch'){
  const player=subject==='ring'?cloudStoneRingAnchor:terraceFurnishingLayout.supply;
  lastTouch=art.inspect(subject,verb,player,true);
  reply.value=lastTouch.accepted?lastTouch.message:'请靠近再操作。';
  keys.push(verb);
}
function size(){
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
}
function frameDraw(){
  if(disposed)return;
  frame++;
  const pose=views[currentView];
  camera.position.copy(pose.at);
  camera.lookAt(pose.look);
  renderer.render(scene,camera);
  const stats=art.stats();
  info.value='真实体素 '+stats.pieces+
    ' · 模型 draws ≤'+stats.draws+
    ' · WebGL '+renderer.info.render.calls+' draws / '+renderer.info.render.triangles+
    ' tris · '+(night?'夜':'昼')+
    ' · 圆环缺口 '+stats.ringMissing+' 片 · 状态：未激活任何传送门';
  requestAnimationFrame(frameDraw);
}
addEventListener('keydown',event=>{
  if(event.code==='Digit1')setNight(false);
  if(event.code==='Digit2')setNight(true);
  if(event.code==='Digit3'){setView('ring');subject='ring';}
  if(event.code==='Digit4'){setView('bench');subject='supplies';}
  if(event.code==='Digit5')setView('overhead');
  if(event.code==='Digit6')setView('overview');
  if(event.code==='Digit7')subject=subject==='ring'?'supplies':'ring';
  if(event.code==='KeyV')handle('view');
  if(event.code==='KeyL')handle('listen');
  if(event.code==='KeyE')handle('touch');
  keys.push(event.code);
});
addEventListener('resize',size);
addEventListener('pagehide',()=>{
  disposed=true;art.dispose();reviewFloor.geometry.dispose();
  reviewFloor.material.dispose();renderer.dispose();
},{once:true});
Object.defineProperty(window,'__terraceReview',{value:Object.freeze({
  state:()=>({
    frame,night,currentView,subject,stats:art.stats(),
    renderCalls:renderer.info.render.calls,
    triangles:renderer.info.render.triangles,
    referenceLoaded:image.complete&&image.naturalWidth>0,
    referenceSrc:image.src,
    chineseSign:art.furnishings.hasTextTexture,
    lastTouch,keys:[...keys],
    groupChildren:owner.children.length,
    ringTouches:art.ring.touches,supplyInspections:art.furnishings.inspections,
  }),
})});
size();setNight(false);requestAnimationFrame(frameDraw);
