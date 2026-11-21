import {
  AmbientLight, Color, DirectionalLight, FogExp2, PerspectiveCamera, PointLight,
  Scene, WebGLRenderer,
} from 'three';
import { createMeteorCrater, meteorCraterFixturePlan } from
  '../voxel-tavern/town-blockout/meteor-crater.js';
import { mountMeteorCraterSurface } from
  '../voxel-tavern/town-blockout/meteor-crater-surface.js';

// C3 first-person/composition review of the REAL B-01 mounted surface, not a
// detached pile of visual blocks. The local anchor is for offline art ONLY.
// The production placement and mine/shaft action authority are untouched.
const crater=createMeteorCrater(meteorCraterFixturePlan);
const scene=new Scene();
scene.background=new Color(0x283746);
scene.fog=new FogExp2(0x283746,.005);
scene.add(new AmbientLight(0xb9c5cb,1.2));
const sun=new DirectionalLight(0xf4e3cf,2.5);
sun.position.set(-28,55,26);
scene.add(sun);
const camera=new PerspectiveCamera(68,innerWidth/innerHeight,.09,250);
const reviewHeadlamp=new PointLight(0xe7d9c7,3.6,17,2);
camera.add(reviewHeadlamp);
scene.add(camera);
const renderer=new WebGLRenderer({antialias:false,powerPreference:'low-power'});
renderer.setPixelRatio(1);
renderer.setSize(innerWidth,innerHeight);
document.body.append(renderer.domElement);

const mounted=mountMeteorCraterSurface({east:0,north:0,rimHeight:0,yaw:0});
scene.add(mounted.group);
function foot(t:number){
  const p=crater.mainTrailPoint(t);
  return [p.east,p.heightOffset+1.67,-p.north] as const;
}
const views={
  rim:{eye:foot(.07),target:[0,-11,0]},
  upper:{eye:foot(.27),target:foot(.43)},
  middle:{eye:foot(.55),target:foot(.72)},
  floor:{eye:[15,-33.33,7],target:[5,-34,0]},
  well:{eye:[5,-33.33,4.2],target:[0,-34,0]},
  overview:{eye:[72,45,61],target:[0,-24,0]},
} as const;
type View=keyof typeof views;
let current:View='rim',frames=0,alive=true;
function setView(next:View){
  if(!Object.hasOwn(views,next))return false;
  current=next;
  camera.position.set(...views[next].eye);
  camera.lookAt(...views[next].target);
  return true;
}
setView('rim');
function draw(){
  if(!alive)return;
  renderer.render(scene,camera);frames++;
  requestAnimationFrame(draw);
}
draw();
const onKey=(event:KeyboardEvent)=>{
  const index='123456'.indexOf(event.key);
  if(index>=0)setView((Object.keys(views) as View[])[index]!);
};
const onResize=()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
};
window.addEventListener('keydown',onKey);
window.addEventListener('resize',onResize);
Object.assign(window,{
  craterInteriorReview:{
    setView,
    inspect(){
      const counts=mounted.interiorDressing.stats;
      return {
        current,frames,counts,
        materials:mounted.interiorDressing.meshes.length,
        draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,
        eye:camera.position.toArray(),
        worldIsLive:false,
        sealedCover:mounted.group.children.some(x=>x.name==='meteor-crater-sealed-well'),
        surfaceHeightAtWell:mounted.heightAt(0,0),
      };
    },
    dispose(){
      alive=false;
      window.removeEventListener('keydown',onKey);
      window.removeEventListener('resize',onResize);
      mounted.interiorDressing.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  },
});
