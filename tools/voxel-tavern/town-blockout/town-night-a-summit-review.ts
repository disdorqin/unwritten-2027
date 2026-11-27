import {Scene,Color,PerspectiveCamera,WebGLRenderer,HemisphereLight,DirectionalLight,Fog} from 'three';
import {buildSouthReviewWorld} from './town-night-a-summit-r1-review-world';
const world=buildSouthReviewWorld(),scene=new Scene();scene.add(world.group);
const camera=new PerspectiveCamera(58,innerWidth/innerHeight,.1,3600);
const renderer=new WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const sky=new HemisphereLight('#dce8ff','#647079',2.1),sun=new DirectionalLight('#fff0d5',2.4);sun.position.set(-200,800,180);scene.add(sky,sun);
let index=0,night=false,frames=0,draws=0,triangles=0;
function view(i:number){
 index=i;
 const views=[[-490,50,585,-240,420,350],[0,-24,349,0,0,350],[18,33,353,0,2,350],[-360,270,world.ground(-360,270)!+42,-320,340,world.ground(-320,340)!]];
 const [e,n,h,te,tn,th]=views[i]!;camera.position.set(e!,h!,-n!);camera.lookAt(te!,th!,-tn!);
}
function light(){
 const color=night?'#182942':'#b5c6d6';scene.background=new Color(color);scene.fog=new Fog(color,night?400:700,night?1800:3000);sky.intensity=night?.8:2.1;sun.intensity=night?.23:2.4;sun.color.set(night?'#9bb6e9':'#fff0d5');world.entry.setNight(night);
}
view(0);light();
addEventListener('keydown',e=>{if(/^[1-4]$/.test(e.key))view(Number(e.key)-1);else if(e.key.toLowerCase()==='n'){night=!night;light();}});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
Object.assign(window,{__southReview:{state:()=>({index,night,frames,draws,triangles,...world.stats,renderTriangles:triangles})}});
function render(){renderer.render(scene,camera);draws=renderer.info.render.calls;triangles=renderer.info.render.triangles;frames++;document.querySelector('#status')!.textContent=draws+' draws / '+triangles+' tris';requestAnimationFrame(render);}
render();
