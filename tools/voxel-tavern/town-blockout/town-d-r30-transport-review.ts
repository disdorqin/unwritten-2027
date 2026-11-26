import {AmbientLight,Color,DirectionalLight,Fog,PerspectiveCamera,Scene,Vector3,WebGLRenderer,Mesh,InstancedMesh,Material,Texture} from 'three';
import {createTerrainGrid} from './terrain';
import {buildFrontRidgeR30Field,mountFrontRidgeR30} from './town-d-r30-front-ridge';
import {mountRidgeForest,ridgeForestRouteClearance} from './town-d-r30-forest';
import {buildSwitchbackCenterline,buildEntryApproach} from './front-ridge-switchback-road';
import {mountNorthRidgeMiddleStation} from './north-ridge-middle-station';
import {mountRidgeCableFacilities} from './town-d-r30-cable-facilities';
import {buildRailwayStation} from './landmark-station';
const grid=createTerrainGrid();
// Explicit fixture preserves the entire original railway plot at Y26.
// It is not the full production mask that A owns.
const field=buildFrontRidgeR30Field(grid.groundHeightAt,(e,n)=>{
 const t=Math.min(1,Math.hypot(Math.max(0,Math.abs(e-526)-29),Math.max(0,Math.abs(n-329)-17))/15);
 return t*t*(3-2*t);
});
const scene=new Scene(),terrain=mountFrontRidgeR30(field);scene.add(terrain.group);
const old=buildSwitchbackCenterline(),entry=buildEntryApproach(old.find(p=>p.east===270&&p.north===460)!.height);
const forest=mountRidgeForest(field,ridgeForestRouteClearance([old,entry]));scene.add(forest.group);
const mid=mountNorthRidgeMiddleStation(scene),facilities=mountRidgeCableFacilities(scene,field);
const railway=buildRailwayStation();railway.position.set(526,26,-329);scene.add(railway);
const ambient=new AmbientLight('#d9e5ec',1.35),sun=new DirectionalLight('#fff0d4',2.25);
sun.position.set(200,450,-120);scene.add(ambient,sun);
const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(1);document.querySelector('#scene')!.append(renderer.domElement);
const camera=new PerspectiveCamera(65,1,.10,1500),target=new Vector3();
const views=[
 {name:'原铁路站外景',e:526,n:305,yaw:0,pitch:.16},
 {name:'中山站等待区',e:440,n:514,yaw:0,pitch:.09},
 {name:'云海台缆车站',e:336,n:631,yaw:0,pitch:.12},
 {name:'上段缆塔',e:357,n:609,yaw:0,pitch:.26},
 {name:'东坡交通全景',e:550,n:365,yaw:-.55,pitch:.35},
] as const;
let index=0,e=views[0].e as number,n=views[0].n as number,h=field.heightAt(e,n)!,yaw=0,pitch=.16,night=false,walked=0,frames=0,last=performance.now();
const keys=new Set<string>();
function choose(i:number){index=i;const v=views[i]!;e=v.e;n=v.n;h=field.heightAt(e,n)!;yaw=v.yaw;pitch=v.pitch}
function light(){const c=new Color(night?'#20334a':'#b6c9d7');scene.background=c;scene.fog=new Fog(c,650,1300);ambient.intensity=night?.6:1.35;sun.intensity=night?.32:2.25;mid.setNight(night);facilities.setNight(night)}
addEventListener('keydown',ev=>{if(/^Digit[1-5]$/.test(ev.code))choose(Number(ev.code.slice(-1))-1);else if(ev.code==='KeyN'&&!ev.repeat){night=!night;light()}else keys.add(ev.code)});
addEventListener('keyup',ev=>keys.delete(ev.code));addEventListener('blur',()=>keys.clear());
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
addEventListener('resize',resize);resize();light();choose(0);
let cars=facilities.update(0),reviewTime=0;
renderer.setAnimationLoop(now=>{
 const dt=Math.min(.05,(now-last)/1000);last=now;frames++;reviewTime+=dt*1000;
 yaw+=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*dt*1.65;
 const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),s=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 const scale=dt*3.8/Math.max(1,Math.hypot(f,s)),de=(Math.sin(yaw)*f+Math.cos(yaw)*s)*scale,dn=(Math.cos(yaw)*f-Math.sin(yaw)*s)*scale;
 const y=field.heightAt(e+de,n+dn),distance=Math.hypot(de,dn);
 // Base model is visual-only in this fixture. Keep review walking outside
 // the frozen railway footprint rather than pretend its colliders are mounted.
 const baseProtected=Math.abs(e+de-526)<29.5&&Math.abs(n+dn-329)<17.5;
 if(y!==undefined&&distance>0&&!baseProtected&&Math.abs(y-h)<=distance*.60+.02&&!forest.blocked(e+de,n+dn,y)&&!mid.blocked(e+de,n+dn,y,.27)&&!facilities.blocked(e+de,n+dn,y)){e+=de;n+=dn;h=y;walked+=distance}
 cars=facilities.update(reviewTime);
 camera.position.set(e,h+1.65,-n);target.set(e+Math.sin(yaw)*Math.cos(pitch),h+1.65+Math.sin(pitch),-n-Math.cos(yaw)*Math.cos(pitch));camera.lookAt(target);
 terrain.updateView(e,n);forest.updateView(e,n);renderer.render(scene,camera);
 document.querySelector('#status')!.textContent=views[index]!.name+' · E'+e.toFixed(1)+' N'+n.toFixed(1)+' Y'+h.toFixed(1)+' · '+renderer.info.render.calls+' draws';
});
Object.defineProperty(window,'__ridgeR30',{value:{state:()=>({reviewOnly:true,index,e,n,h,yaw,pitch,night,walked,frames,draws:renderer.info.render.calls,tris:renderer.info.render.triangles,ground:field.heightAt(e,n),cars,length:facilities.survey.length,minClearance:facilities.survey.minClearance,railwayDatum:field.heightAt(526,329)})}});
addEventListener('pagehide',()=>{
 renderer.setAnimationLoop(null);facilities.dispose();mid.dispose();forest.dispose();terrain.dispose();
 const geos=new Set<import('three').BufferGeometry>(),mats=new Set<Material>(),textures=new Set<Texture>();
 railway.traverse(o=>{if(o instanceof Mesh){if(o instanceof InstancedMesh)o.dispose();geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);if('map'in m&&m.map instanceof Texture)textures.add(m.map)}}});
 geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());railway.removeFromParent();renderer.dispose();
});
