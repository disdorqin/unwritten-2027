import {AmbientLight,Color,DirectionalLight,Fog,PerspectiveCamera,Scene,Vector3,WebGLRenderer} from 'three';
import {createTerrainGrid} from './terrain';
import {buildFrontRidgeR30Field,mountFrontRidgeR30} from './town-d-r30-front-ridge';
import {mountRidgeForest,ridgeForestRouteClearance} from './town-d-r30-forest';
import {buildSwitchbackCenterline,buildEntryApproach} from './front-ridge-switchback-road';
import {mountNorthRidgeMiddleStation} from './north-ridge-middle-station';
import {solveLowerRidgeRoad,tryConstrainedLowerRoadbed} from './town-d-r30-roadbed';
import {mountRidgeRoadFurniture} from './town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from './town-d-r30-retaining-banks';
const grid=createTerrainGrid();
// Explicit review-only ownership fixture. A must supply the production
// protected footprint/river/track mask before installing this field.
const natural=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1);
const roadMode=new URLSearchParams(location.search).has('road');
const route=roadMode?solveLowerRidgeRoad(natural,()=>true).route:[];
const graded=roadMode?tryConstrainedLowerRoadbed(natural,route,()=>true):undefined;
if(graded&&!graded.ok)throw new Error('Road candidate failed raster slope gate');
const field=graded&&'field' in graded?graded.field:natural;
const model=mountFrontRidgeR30(field,graded?.draft.roadAt),scene=new Scene();scene.add(model.group);
const furniture=roadMode?mountRidgeRoadFurniture(field,route,()=>true):undefined;if(furniture)scene.add(furniture.group);
const banks=roadMode?mountRidgeRetainingBanks(field,route,()=>true):undefined;if(banks)scene.add(banks.group);
// Review-only conservative old corridor exclusion, not a final route.
const oldLine=buildSwitchbackCenterline(),entry=buildEntryApproach(oldLine.find(p=>p.east===270&&p.north===460)!.height);
const forest=mountRidgeForest(field,ridgeForestRouteClearance([oldLine,entry,route]));scene.add(forest.group);
const station=mountNorthRidgeMiddleStation(scene);
const ambient=new AmbientLight('#d9e5ec',1.35),sun=new DirectionalLight('#fff0d4',2.25);
sun.position.set(200,450,-120);scene.add(ambient,sun);
const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);
const camera=new PerspectiveCamera(66,1,.12,1500);
const originalViews=[
 {name:'山脚',e:320,n:285,yaw:0,pitch:.22},
 {name:'西侧林谷',e:30,n:350,yaw:.56,pitch:.35},
 {name:'中山台',e:440,n:514,yaw:0,pitch:.08},
 {name:'云海台南坡',e:336,n:600,yaw:Math.PI,pitch:-.65},
 {name:'东北山背',e:610,n:775,yaw:-1.98,pitch:.48},
] as const;
const views=roadMode?[.04,.24,.42,.65,.90].map((f,i)=>{
 const k=Math.min(route.length-2,Math.max(1,route.findIndex(p=>p.cum>=f*route.at(-1)!.cum)));
 const a=route[k]!,b=route[k+1]!;
 return {name:'下段实体路基 '+(i+1),e:a.east,n:a.north,yaw:Math.atan2(b.east-a.east,b.north-a.north),pitch:-.08};
}):originalViews;
let index=0,e=320,n=285,h=field.heightAt(e,n)!,yaw=0,pitch=.22,night=false,walked=0,frames=0,last=performance.now(),fps=0;
const keys=new Set<string>();
function choose(i:number){index=i;const v=views[i]!;e=v.e;n=v.n;h=field.heightAt(e,n)!;yaw=v.yaw;pitch=v.pitch}
function light(){const c=new Color(night?'#20334a':'#b6c9d7');scene.background=c;scene.fog=new Fog(c,650,1300);ambient.intensity=night?.6:1.35;sun.intensity=night?.32:2.25;station.setNight(night);furniture?.setNight(night)}
addEventListener('keydown',ev=>{if(/^Digit[1-5]$/.test(ev.code))choose(Number(ev.code.slice(-1))-1);else if(ev.code==='KeyN'&&!ev.repeat){night=!night;light()}else keys.add(ev.code)});
addEventListener('keyup',ev=>keys.delete(ev.code));addEventListener('blur',()=>keys.clear());
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
addEventListener('resize',resize);resize();light();choose(0);
const target=new Vector3();
renderer.setAnimationLoop(now=>{
 const raw=(now-last)/1000,dt=Math.min(.05,raw);last=now;fps=raw>0?Math.round(1/raw):0;frames++;
 yaw+=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*dt*1.65;
 pitch=Math.max(-1.1,Math.min(1.1,pitch+(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt));
 const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),s=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 const scale=dt*4.5/Math.max(1,Math.hypot(f,s)),de=(Math.sin(yaw)*f+Math.cos(yaw)*s)*scale,dn=(Math.cos(yaw)*f-Math.sin(yaw)*s)*scale;
 const y=field.heightAt(e+de,n+dn),distance=Math.hypot(de,dn);
 if(y!==undefined&&distance>0&&Math.abs(y-h)<=distance*.60+.02&&!forest.blocked(e+de,n+dn,y)&&!station.blocked(e+de,n+dn,y,.27)&&!furniture?.blocked(e+de,n+dn,y)&&!banks?.blocked(e+de,n+dn,y)){e+=de;n+=dn;h=y;walked+=distance}
 camera.position.set(e,h+1.65,-n);target.set(e+Math.sin(yaw)*Math.cos(pitch),h+1.65+Math.sin(pitch),-n-Math.cos(yaw)*Math.cos(pitch));camera.lookAt(target);forest.updateView(e,n);model.updateView(e,n);banks?.updateView(e,n);renderer.render(scene,camera);
 document.querySelector('#status')!.textContent=views[index]!.name+' · E'+e.toFixed(1)+' N'+n.toFixed(1)+' Y'+h.toFixed(1)+' · '+fps+' FPS · '+renderer.info.render.calls+' draws';
});
Object.defineProperty(window,'__ridgeR30',{value:{state:()=>({reviewOnly:true,index,e,n,h,yaw,pitch,night,walked,frames,fps,draws:renderer.info.render.calls,tris:renderer.info.render.triangles,ground:field.heightAt(e,n),forestCount:forest.placements.length,forestLOD:forest.detailCounts(),terrainLOD:model.detailCounts(),roadMode,roadAudit:graded&&'audit'in graded?graded.audit:undefined,retainingBanks:banks?{walls:banks.walls.length,highest:banks.highest,bricks:banks.brickCount,visibleInstances:banks.visibleInstances()}:undefined,roadFurniture:furniture?{posts:furniture.postCount,rails:furniture.railCount,lanterns:furniture.lanternCount}:undefined})}});
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);station.dispose();furniture?.dispose();banks?.dispose();forest.dispose();model.dispose();renderer.dispose()});
