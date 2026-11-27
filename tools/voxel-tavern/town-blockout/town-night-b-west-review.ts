import {AmbientLight,Color,DirectionalLight,Fog,Group,Mesh,MeshLambertMaterial,PerspectiveCamera,Scene,WebGLRenderer,Vector3} from 'three';
import {createMainSummitBlock,mainSummitLayout} from './main-summit-block';
import {createMainSummitTrail} from './main-summit-trail';
import {sampleTownD2R30Height,townD2R30ChunkList} from './town-d2-r30-domain';
import {createTownD2R30Collision} from './town-d2-r30-collision';
import {buildTownD2R30ChunkGeometry} from './town-d2-r30-massif';
import {composeNightBWestHeight,tintNightBWestSurface} from './town-night-b-summit-west-relief';
import {createNightBWestSector} from './town-night-b-summit-west-sector';
import {cutNightBWestTerrain} from './town-night-b-summit-west-cut';
import {createTownD2R30Ropeway} from './town-d2-r30-ropeway';
import {createTownD2R30CableTowers} from './town-d2-r30-cable-towers';
import {mountMainSummitCableWorkshop} from './main-summit-cable-workshop';
const height=composeNightBWestHeight(sampleTownD2R30Height);
const collision=createTownD2R30Collision({heightAt:height});
const block=createMainSummitBlock(mainSummitLayout,347,100),trail=createMainSummitTrail(block.heightAt,347);block.dispose();
const west=createNightBWestSector(collision.surfaceAt,trail.points);
const scene=new Scene();scene.background=new Color('#b3c9da');scene.fog=new Fog('#b3c9da',950,2700);
const ground=new Group(),material=new MeshLambertMaterial({vertexColors:true});
let cutCount=0,lowered=0;
for(const chunk of townD2R30ChunkList){
 const source=buildTownD2R30ChunkGeometry(chunk,8,347),p=source.getAttribute('position'),rgb=source.getAttribute('color'),tint=new Color();
 for(let i=0;i<p.count;i++){
  const e=p.getX(i),n=-p.getZ(i),h=height(e,n)!;p.setY(i,h);
  const a=height(e+2,n)??h,b=height(e-2,n)??h,c=height(e,n+2)??h,d=height(e,n-2)??h;
  tint.setRGB(rgb.getX(i),rgb.getY(i),rgb.getZ(i));tintNightBWestSurface(e,n,h,Math.hypot(a-b,c-d)/4,tint);rgb.setXYZ(i,tint.r,tint.g,tint.b);
 }
 rgb.needsUpdate=true;
 p.needsUpdate=true;source.computeVertexNormals();source.computeBoundingBox();source.computeBoundingSphere();
 const cut=cutNightBWestTerrain(source,west.cutTread);if(cut.geometry!==source)source.dispose();
 cutCount+=cut.refinedTriangles;lowered+=cut.loweredVertices;ground.add(new Mesh(cut.geometry,material));
}
scene.add(ground,west.group);
const ropeway=createTownD2R30Ropeway({heightAt:collision.surfaceAt,controlPointSupports:false});
const towers=createTownD2R30CableTowers({cable:ropeway.cable,heightAt:collision.surfaceAt});scene.add(ropeway.group,towers.group);
ropeway.update(0);const workshopRoot=new Group();scene.add(workshopRoot);mountMainSummitCableWorkshop(workshopRoot,collision.surfaceAt);
const ambient=new AmbientLight('#d8e7f4',1.25),sun=new DirectionalLight('#ffe0b5',2.05);sun.position.set(-680,950,-400);scene.add(ambient,sun);
const camera=new PerspectiveCamera(63,innerWidth/innerHeight,.15,4800),renderer=new WebGLRenderer({antialias:true});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement);
const p=west.pavilion.site;
const tower=towers.footprints.filter(f=>f.legHalf>=2&&f.east< -300&&f.north>480).sort((a,b)=>Math.hypot(a.east+675,a.north-554)-Math.hypot(b.east+675,b.north-554))[0]!;
const towerMid=(tower.footTop+tower.mastTop)/2;
const towerEye=Array.from({length:12},(_,i)=>{const theta=i*Math.PI/6,e=tower.east+65*Math.cos(theta),n=tower.north+65*Math.sin(theta),h=collision.surfaceAt(e,n)??Infinity;return {e,n,h};}).sort((a,b)=>a.h-b.h)[0]!;
const towerCamera:[number,number,number]=[towerEye.e,Math.max(towerEye.h+28,towerMid+25),-towerEye.n];
type Shot={label:string;eye:[number,number,number];look:[number,number,number]};
const point=(e:number,n:number,dy:number):[number,number,number]=>[e,(collision.surfaceAt(e,n)??350)+dy,-n];
const shots:Shot[]=[
 {label:'西次峰与西沟 · 全区',eye:[-1050,920,-560],look:[-610,470,-970]},
 {label:'西沟林岩雪带',eye:point(-910,780,42),look:point(-815,920,5)},
 {label:'观云亭与连续道路',eye:[p.approach.east+5,p.height+6,-p.approach.north+7],look:[p.east,p.height+1,-p.north]},
 {label:'西部索道格构塔架',eye:towerCamera,look:[tower.east,towerMid,-tower.north]},
 {label:'二线维修机房',eye:[-17.1,348.75,-7],look:[-23,348.3,-8.5]},
];
let selected=0,frame=0;const frameTimes:number[]=[];let last=performance.now();
function select(index:number){selected=Math.max(0,Math.min(shots.length-1,index));const s=shots[selected]!;camera.position.set(...s.eye);camera.lookAt(new Vector3(...s.look));west.updateView(camera.position.x,-camera.position.z,950);frameTimes.length=0;}
select(0);
addEventListener('keydown',e=>{if(/^[1-5]$/.test(e.key))select(Number(e.key)-1)});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
const state=()=>({frame,selected,label:shots[selected]!.label,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,frames:frameTimes.length,frameMs:frameTimes.slice(),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),cutCount,lowered,road:west.road.stats,dressing:west.dressing.stats});
Object.assign(window,{__nightBWestReview:{state}});
const hud=document.querySelector('#hud')!;
function loop(now:number){const dt=now-last;last=now;if(dt>0&&dt<10000){frameTimes.push(dt);if(frameTimes.length>120)frameTimes.shift();}
 renderer.render(scene,camera);frame++;hud.innerHTML='<b>UNWRITTEN 2027 · 西区组合审图（独立）</b><br>'+shots[selected]!.label+' · 1–5 切换<br>'+renderer.info.render.calls+' draws / '+renderer.info.render.triangles.toLocaleString()+' tris';requestAnimationFrame(loop);}
requestAnimationFrame(loop);
