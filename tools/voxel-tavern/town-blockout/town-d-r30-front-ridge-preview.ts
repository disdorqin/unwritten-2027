import {AmbientLight,Color,DirectionalLight,Fog,PerspectiveCamera,Scene,Vector3,WebGLRenderer} from 'three';
import {createTerrainGrid} from './terrain';
import {buildFrontRidgeR30Field,mountFrontRidgeR30} from './town-d-r30-front-ridge';
import {mountRidgeForest,ridgeForestRouteClearance} from './town-d-r30-forest';
import {buildSwitchbackCenterline,buildEntryApproach} from './front-ridge-switchback-road';
import {mountNorthRidgeMiddleStation} from './north-ridge-middle-station';
import {solveLowerRidgeRoad,tryConstrainedLowerRoadbed} from './town-d-r30-roadbed';
import {mountRidgeRoadFurniture} from './town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from './town-d-r30-retaining-banks';
import {buildMiddleEastRoadbed} from './town-d-r30-upper-roadbed';
const grid=createTerrainGrid();
// Explicit review-only ownership fixture. A must supply the production
// protected footprint/river/track mask before installing this field.
const natural=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1);
const params=new URLSearchParams(location.search),middleMode=params.has('middle'),roadMode=params.has('road')||middleMode;
const lowerRoute=roadMode&&!middleMode?solveLowerRidgeRoad(natural,()=>true).route:[];
const lower=lowerRoute.length?tryConstrainedLowerRoadbed(natural,lowerRoute,()=>true):undefined;
const middle=middleMode?buildMiddleEastRoadbed(natural,()=>true):undefined;
const graded=middle??lower;
if(graded&&!graded.ok)throw new Error('Road candidate failed raster slope gate');
const route=middle?.route??lowerRoute;
const field=graded&&'field' in graded?graded.field:natural;
const roadAt=middle&&'roadAt'in middle?middle.roadAt:lower?.draft.roadAt;
const model=mountFrontRidgeR30(field,roadAt),scene=new Scene();scene.add(model.group);
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
const views=middleMode?[{name:'中山站北出口实体道路往返',e:440,n:520,yaw:0,pitch:.02}]:roadMode?[.04,.24,.42,.65,.90].map((f,i)=>{
 const k=Math.min(route.length-2,Math.max(1,route.findIndex(p=>p.cum>=f*route.at(-1)!.cum)));
 const a=route[k]!,b=route[k+1]!;
 return {name:'下段实体路基 '+(i+1),e:a.east,n:a.north,yaw:Math.atan2(b.east-a.east,b.north-a.north),pitch:-.08};
}):originalViews;
let index=0,e=320,n=285,h=field.heightAt(e,n)!,yaw=0,pitch=.22,night=false,walked=0,frames=0,last=performance.now(),fps=0;
const keys=new Set<string>();
const guide=middleMode?[{east:440,north:520},...route]:[];
let cursor=1,direction=1,arrived=false,guideFailure='';
function choose(i:number){index=i;const v=views[i]!;e=v.e;n=v.n;h=field.heightAt(e,n)!;yaw=v.yaw;pitch=v.pitch}
function light(){const c=new Color(night?'#20334a':'#b6c9d7');scene.background=c;scene.fog=new Fog(c,650,1300);ambient.intensity=night?.6:1.35;sun.intensity=night?.32:2.25;station.setNight(night);furniture?.setNight(night)}
addEventListener('keydown',ev=>{if(!middleMode&&/^Digit[1-5]$/.test(ev.code))choose(Number(ev.code.slice(-1))-1);else if(middleMode&&ev.code==='KeyR'&&arrived&&!ev.repeat){direction=-direction;cursor=direction===1?1:guide.length-2;arrived=false;}else if(ev.code==='KeyN'&&!ev.repeat){night=!night;light()}else keys.add(ev.code)});
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
 function move(x:number,z:number){
  const y=field.heightAt(x,z),distance=Math.hypot(x-e,z-n),me=(x+e)/2,mn=(z+n)/2,my=field.heightAt(me,mn);
  const clear=(px:number,pn:number,py:number)=>!forest.blocked(px,pn,py)&&!station.blocked(px,pn,py,.27)&&!furniture?.blocked(px,pn,py)&&!banks?.blocked(px,pn,py);
  if(y!==undefined&&my!==undefined&&distance>0&&Math.abs(y-h)<=distance*.60+.02&&clear(x,z,y)&&clear(me,mn,my)){e=x;n=z;h=y;walked+=distance;return true}
  return false;
 }
 if(middleMode){
  if(keys.has('KeyW')&&!arrived&&!guideFailure){
   let budget=dt*4.5;
   while(budget>1e-6&&cursor>=0&&cursor<guide.length){
    const p=guide[cursor]!,dx=p.east-e,dz=p.north-n,d=Math.hypot(dx,dz);
    if(d<1e-6){cursor+=direction;continue}
    const step=Math.min(budget,d);yaw=Math.atan2(dx,dz);
    if(!move(e+dx*step/d,n+dz*step/d)){guideFailure='blocked at '+e+','+n;break}
    budget-=step;if(step>=d-1e-6)cursor+=direction;
   }
   if(cursor<0||cursor>=guide.length)arrived=true;
  }
 }else if(f||s)move(e+de,n+dn);
 camera.position.set(e,h+1.65,-n);target.set(e+Math.sin(yaw)*Math.cos(pitch),h+1.65+Math.sin(pitch),-n-Math.cos(yaw)*Math.cos(pitch));camera.lookAt(target);forest.updateView(e,n);model.updateView(e,n);banks?.updateView(e,n);renderer.render(scene,camera);
 document.querySelector('#status')!.textContent=views[index]!.name+' · E'+e.toFixed(1)+' N'+n.toFixed(1)+' Y'+h.toFixed(1)+' · '+fps+' FPS · '+renderer.info.render.calls+' draws';
});
Object.defineProperty(window,'__ridgeR30',{value:{state:()=>({reviewOnly:true,index,e,n,h,yaw,pitch,night,walked,frames,fps,draws:renderer.info.render.calls,tris:renderer.info.render.triangles,ground:field.heightAt(e,n),forestCount:forest.placements.length,forestLOD:forest.detailCounts(),terrainLOD:model.detailCounts(),roadMode,middleMode,direction,arrived,guideFailure,routeLength:route.at(-1)?.cum??0,roadAudit:graded&&'audit'in graded?graded.audit:undefined,retainingBanks:banks?{walls:banks.walls.length,highest:banks.highest,bricks:banks.brickCount,visibleInstances:banks.visibleInstances()}:undefined,roadFurniture:furniture?{posts:furniture.postCount,rails:furniture.railCount,lanterns:furniture.lanternCount}:undefined})}});
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);station.dispose();furniture?.dispose();banks?.dispose();forest.dispose();model.dispose();renderer.dispose()});
