import {AmbientLight,Color,DirectionalLight,Fog,PerspectiveCamera,Vector3,WebGLRenderer} from 'three';
import {createZa22CloudRoute,createZa22NorthRidgeLine,za22StationApproach,cloudTerminal} from './town-za22-cloud-route';
import {middleStationSurfaceAt} from './north-ridge-middle-station';
const epoch=Date.UTC(2026,0,1);
let now=epoch;
const route=createZa22CloudRoute({now:()=>now,enterOrExit(){},view(){}});
route.action(za22StationApproach)?.run();route.update(za22StationApproach);
const line=createZa22NorthRidgeLine(26);
now+=8000+line.lowerMetres*200+100;route.update(za22StationApproach);
const scene=route.scene;
const camera=new PerspectiveCamera(65,1,.08,1600);
const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);
const ambient=scene.children.find(o=>o instanceof AmbientLight) as AmbientLight;
const sun=scene.children.find(o=>o instanceof DirectionalLight) as DirectionalLight;
const stations=[
 {name:'中山站候车区',east:440,north:516.8,height:140,yaw:0},
 {name:'中山站时刻牌',east:442.7,north:522.10,height:140,yaw:Math.PI/2},
 {name:'星港坪装配场',east:324,north:654.5,height:347,yaw:0},
 {name:'星港坪工具台',east:318.3,north:656.8,height:347,yaw:0},
 {name:'星港坪围观区',east:342,north:654.2,height:347,yaw:0},
] as const;
let selected=0,night=false,yaw=0,foot:{east:number;north:number;height:number;yaw:number;name:string}={...stations[0]!},frames=0,walked=0;
const keys=new Set<string>();let last=performance.now();
function choose(i:number){selected=i;foot={...stations[i]!};yaw=foot.yaw;}
function lighting(){scene.background=new Color(night?'#20314b':'#aebfd2');scene.fog=new Fog(night?'#20314b':'#aebfd2',170,1400);ambient.intensity=night?.42:1.25;sun.intensity=night?.15:1.7;route.setNight(night)}
addEventListener('keydown',e=>{if(/^Digit[1-5]$/.test(e.code))choose(Number(e.code.slice(-1))-1);else if(e.code==='KeyN'&&!e.repeat){night=!night;lighting()}else keys.add(e.code)});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
addEventListener('resize',resize);resize();choose(0);lighting();
function render(t:number){const dt=Math.min(.05,(t-last)/1000);last=t;frames++;
 if(keys.has('ArrowLeft'))yaw-=dt*1.8;if(keys.has('ArrowRight'))yaw+=dt*1.8;
 const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 const dx=(Math.sin(yaw)*forward+Math.cos(yaw)*side)*dt*2.5,dn=(Math.cos(yaw)*forward-Math.sin(yaw)*side)*dt*2.5;
 const e=foot.east+dx,n=foot.north+dn;
 const h=selected<2?middleStationSurfaceAt(e,n):route.surfaceAt(e,n,.27);
 if(h!==undefined&&Math.abs(h-foot.height)<.4&&!route.blocked(e,n,h,.27,1.8)){foot={...foot,east:e,north:n,height:h};walked+=Math.hypot(dx,dn)}
 camera.position.set(foot.east,foot.height+1.65,-foot.north);
 camera.lookAt(new Vector3(foot.east+Math.sin(yaw),foot.height+1.65,-foot.north-Math.cos(yaw)));
 renderer.render(scene,camera);
 document.querySelector('#hud')!.textContent=stations[selected]!.name+' · '+(night?'夜':'昼')+' · '+foot.east.toFixed(2)+' / '+foot.north.toFixed(2)+' · '+renderer.info.render.calls+' draws';
 requestAnimationFrame(render)
}
Object.defineProperty(window,'__stationReview',{value:{state:()=>({frames,selected,night,foot,yaw,walked,draws:renderer.info.render.calls,tris:renderer.info.render.triangles,reviewOnly:true})}});
requestAnimationFrame(render);
