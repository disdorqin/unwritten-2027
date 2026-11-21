import {
  AmbientLight, Color, DirectionalLight, Fog, Group, Mesh, MeshLambertMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createMainSummitWindGround } from './main-summit-wind-ground';

const owner = new Group();
const site = { east: 0, north: 0, height: 0 } as const;
let station = createMainSummitWindGround(site);
owner.add(station.group);
const scene = new Scene();
scene.background = new Color('#a9c4d0');
scene.fog = new Fog('#a9c4d0', 65, 250);
scene.add(owner);
const sun = new DirectionalLight('#fff1dc', 2.65);
sun.position.set(-17, 23, 4);
scene.add(sun);
const ambient = new AmbientLight('#c7d7e5', 1.65);
scene.add(ambient);
const snowSurface = new Mesh(new PlaneGeometry(62, 52), new MeshLambertMaterial({ color:'#7d8b91' }));
snowSurface.rotation.x = -Math.PI / 2;
snowSurface.position.set(0, -.36, 0);
snowSurface.name = 'review-floor-only-not-part-of-built-model';
scene.add(snowSurface);
const camera = new PerspectiveCamera(58, 1, .1, 350);
const renderer = new WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);
const info = document.querySelector<HTMLOutputElement>('#info')!;
const reply = document.querySelector<HTMLOutputElement>('#reply')!;
const ref = document.querySelector<HTMLImageElement>('#ref')!;
ref.src = new URL('../../../docs/参考图/mountain/ref-m64-wind-sock-point.webp',import.meta.url).href;
const viewpoint = {
  overview: new Vector3(11,10.6,23),
  close: new Vector3(1.8,5.5,10.5),
  side: new Vector3(-16,7,9),
};
let point = 'overview' as keyof typeof viewpoint;
let night = false;
let officialReviewFixture = false;
let frame = 0, loggedError = '';
let last = performance.now();
let time = 1_018_000;
const changes: string[] = [];
let lastInteraction: unknown;
let disposed = false;
const fixture = {
  weather: 'wind' as const, startedAt: 1_000_000, nextChangeAt: 4_000_000,
  windEast: .6, windNorth: .8, windStrength: .78,
};
function setNight(enabled: boolean) {
  night = enabled;
  scene.background = new Color(night?'#182a42':'#a9c4d0');
  scene.fog = new Fog(night?'#1e3048':'#a9c4d0', 65, 250);
  ambient.intensity = night ? .62 : 1.65;
  sun.intensity = night ? .25 : 2.65;
  changes.push(night?'night':'day');
}
function fixtureWeather(enabled: boolean) {
  // Demonstration of a valid state/clock, NEVER a real authority connection.
  officialReviewFixture = enabled;
  if(enabled){
    time = 1_018_000;
    if(!station.setOfficialWind(fixture,time)) throw Error('Invalid audited ZB20 fixture');
  } else {
    // There is no client-side fabricated zero-strength weather packet.
    // Remount a genuinely calm device rather than telling a fake forecast.
    station.dispose();
    station = createMainSummitWindGround(site);
    owner.add(station.group);
  }
  changes.push(enabled?'fixture-on':'fixture-off');
}
function handleInteraction(kind:'view'|'listen'|'touch') {
  lastInteraction = station.interact({kind,player:site,authorized:true});
  reply.value = lastInteraction.accepted ? lastInteraction.message : '操作未授权。';
  changes.push(kind);
}
function resize() {
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
function animate(now:number) {
  if(disposed) return;
  const dt=Math.min(.08,(now-last)/1000);
  last=now;
  frame++;
  if (officialReviewFixture) time += Math.round(dt * 1000);
  station.update(officialReviewFixture ? time/1000 : now/1000);
  camera.position.copy(viewpoint[point]);
  camera.lookAt(new Vector3(0,2.05,0));
  renderer.render(scene,camera);
  const report = station.report;
  info.value = '场地 18×12 m · 体素 ' + station.pieceCount +
    ' · 新增预算 ≤'+station.drawBudget+' draws · 画面 ' +
    renderer.info.render.calls+' draws / '+renderer.info.render.triangles+' tris' +
    ' · '+(night?'夜':'昼')+' · 风:'+(
      officialReviewFixture?'权威结构测试样例（非实时）':'未授权、静风')+
    ' · 阵风相位 '+report.visibleGustFactor.toFixed(3);
  requestAnimationFrame(animate);
}
window.addEventListener('keydown', event=>{
  if(event.code==='Digit1') setNight(false);
  if(event.code==='Digit2') setNight(true);
  if(event.code==='Digit3') fixtureWeather(true);
  if(event.code==='Digit4') fixtureWeather(false);
  if(event.code==='Digit5') point='close';
  if(event.code==='Digit6') point='overview';
  if(event.code==='Digit7') point='side';
  if(event.code==='KeyV') handleInteraction('view');
  if(event.code==='KeyL') handleInteraction('listen');
  if(event.code==='KeyE') handleInteraction('touch');
});
addEventListener('resize',resize);
addEventListener('pagehide',()=>{
  disposed=true;
  station.dispose();
  snowSurface.geometry.dispose();
  snowSurface.material.dispose();
  renderer.dispose();
},{once:true});
Object.defineProperty(window,'__windReview',{value:Object.freeze({
  state:()=>({frame,night,point,officialReviewFixture,report:station.report,
    ownerChildren:owner.children.length,signTexture:station.hasTextTexture,
    pieceCount:station.pieceCount,drawBudget:station.drawBudget,
    renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    lights:station.lights.length,compassTouches:station.compassTouches,
    lastInteraction,referenceLoaded:ref.complete&&ref.naturalWidth>0,
    referenceSrc:ref.src,changes:[...changes],loggedError}),
})});
resize();setNight(false);requestAnimationFrame(animate);
