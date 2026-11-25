import {
  AmbientLight,Color,DirectionalLight,Fog,Mesh,MeshLambertMaterial,
  PerspectiveCamera,PlaneGeometry,PointLight,Scene,Vector3,WebGLRenderer,
} from 'three';
import {buildFrontRidgeProxy,FRONT_RIDGE_PROXY} from './town-front-ridge-proxy';
import {frontRidgePixelSpec} from './town-front-ridge-surface';

// D11: *actual production proxy mesh*, not a reenacted illustration.
// A neutral ground plane is for scale in this isolated shader inspection.
// The town heightfield and official player controls are not simulated here.
const scene=new Scene();
const ambient=new AmbientLight('#a8b8c2',1.45);
const sun=new DirectionalLight('#fff0d6',2.1);
sun.position.set(295,480,-500);
scene.add(ambient,sun);
const proxy=buildFrontRidgeProxy();
scene.add(proxy);
const proxyMesh=proxy.children[0]as Mesh;
const material=proxyMesh.material as MeshLambertMaterial;
const ground=new Mesh(new PlaneGeometry(760,330),new MeshLambertMaterial({color:'#73796d'}));
ground.name='review-only-town-ground-not-an-authoritative-terrain';
ground.rotation.x=-Math.PI/2;
ground.position.set(320,7.49,-662);
scene.add(ground);
const testLight=new PointLight('#e08a3c',1.05,22,2);
testLight.position.set(320,13,-686);
testLight.visible=false;
scene.add(testLight);
const renderer=new WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);
const camera=new PerspectiveCamera(67,1,.1,2800);
const viewPoints={
  toe:{name:'山脚近景',eye:new Vector3(320,10.15,-684.7),look:new Vector3(320,35,-701)},
  flank:{name:'斜坡裸岩侧视',eye:new Vector3(200,14.2,-687),look:new Vector3(208,66,-722)},
  far:{name:'山脊全景',eye:new Vector3(320,32,-540),look:new Vector3(320,250,-751)},
  edge:{name:'西侧边缘收口',eye:new Vector3(38,13.7,-684),look:new Vector3(68,71,-747)},
  pixel:{name:'像素纹理贴脸',eye:new Vector3(320,23.2,-695.5),look:new Vector3(320,25,-701.2)},
}as const;
let view:keyof typeof viewPoints='toe';
let night=false,frame=0,dispose=false;
const messages:string[]=[];
const label=document.querySelector<HTMLOutputElement>('#info')!;
const status=document.querySelector<HTMLOutputElement>('#reply')!;
const reference=document.querySelector<HTMLImageElement>('#reference-image')!;
reference.src=new URL('../../../docs/参考图/mountain/ref-m15-snow-rock-banding.webp',import.meta.url).href;
function setNight(enabled:boolean) {
  night=enabled;
  const sky=enabled?'#263346':'#9fb8c6';
  scene.background=new Color(sky);
  scene.fog=new Fog(sky,155,1400);
  ambient.intensity=enabled ? .26 : 1.45;
  sun.intensity=enabled ? .20 : 2.1;
  testLight.visible=enabled;
  messages.push(enabled?'night':'day');
}
function setView(next:keyof typeof viewPoints) {
  view=next;
  status.value='当前视点：'+viewPoints[view].name+' · 相机在前山实测城侧位置，观察视觉壳';
  messages.push(next);
}
function resize(){
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
}
function draw() {
  if(dispose)return;
  frame++;
  const pose=viewPoints[view];
  camera.position.copy(pose.eye);
  camera.lookAt(pose.look);
  renderer.render(scene,camera);
  label.value='前山独立视觉壳 · 三角面 '+(proxyMesh.geometry.getAttribute('position').count/3)+
    ' · 像素 32×32，'+frontRidgePixelSpec.pixelsPerMetre+'px/m Nearest'+
    ' · 实测 WebGL '+renderer.info.render.calls+' draws/'+renderer.info.render.triangles+' tris'+
    ' · '+(night?'夜':'昼')+' · 山脚 N'+FRONT_RIDGE_PROXY.toeNorth;
  requestAnimationFrame(draw);
}
window.addEventListener('keydown',event=>{
  if(event.code==='Digit1')setView('toe');
  if(event.code==='Digit2')setView('flank');
  if(event.code==='Digit3')setView('far');
  if(event.code==='Digit4')setView('edge');
  if(event.code==='Digit5')setView('pixel');
  if(event.code==='KeyN')setNight(true);
  if(event.code==='KeyD')setNight(false);
});
window.addEventListener('resize',resize);
window.addEventListener('pagehide',()=>{
  dispose=true;
  scene.remove(proxy);
  proxyMesh.geometry.dispose();
  material.map?.dispose();
  material.dispose();
  ground.geometry.dispose();
  ground.material.dispose();
  renderer.dispose();
},{once:true});
Object.defineProperty(window,'__ridgeReview',{
  value:Object.freeze({state:()=>({
    view,night,frame,model:proxy.name,mesh:proxyMesh.name,
    sourceTriangles:proxyMesh.geometry.getAttribute('position').count/3,
    uvCount:proxyMesh.geometry.getAttribute('uv').count,
    pixelsPerMetre:frontRidgePixelSpec.pixelsPerMetre,
    pixelMap:material.map?.name,nearest:material.map?.magFilter===1003,
    drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    referenceLoaded:reference.complete&&reference.naturalWidth>0,
    referenceSrc:reference.src,nightLight:testLight.visible,
    cameraHeight:camera.position.y, cameraNorth:-camera.position.z,
    copy:messages.slice(),
  })}),
});
resize();setNight(false);requestAnimationFrame(draw);
