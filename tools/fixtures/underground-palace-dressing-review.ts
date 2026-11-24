import {
  AmbientLight, Color, FogExp2, Group, PerspectiveCamera,
  PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createUndergroundPalaceShell } from './underground-palace-d-shell-snapshot';
import {
  mountUndergroundPalaceDressing,
  undergroundPalaceDressing,
} from '../voxel-tavern/town-blockout/underground-palace-dressing';

// Offline U-11 artwork review overlays C dressing on a pinned D shell
// geometry snapshot. The snapshot is NOT live D collision authority,
// nor an authorized underground domain or production player arrival.
const scene=new Scene();
scene.background=new Color(0x212735);
scene.fog=new FogExp2(0x212735,.016);
scene.add(new AmbientLight(0x919ba9,.42));
const camera=new PerspectiveCamera(70,innerWidth/innerHeight,.06,220);
const lamp=new PointLight(0xffe0b2,10,28,2);
camera.add(lamp);lamp.position.set(0,0,-.35);
scene.add(camera);
const renderer=new WebGLRenderer({antialias:false,powerPreference:'low-power'});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(1);
document.body.append(renderer.domElement);

const parent=new Group();
scene.add(parent);
const reviewedDShell=createUndergroundPalaceShell();
scene.add(reviewedDShell.group);
const mounted=mountUndergroundPalaceDressing(parent,false);
// Exactly three QA-only stand-ins are sampled from the host-approved sockets.
// Their visibility proves nothing about U-13's actual production light budget.
const qaSockets=[0,2,4] as const;
for(const [index,socketIndex] of qaSockets.entries()){
  const p=undergroundPalaceDressing.lightSockets[socketIndex]!;
  const visualLight=new PointLight(index%2?0x7dc4f0:0xffb873,11,25,2);
  visualLight.position.set(p.east,p.height,-p.north);
  scene.add(visualLight);
}
// Chapter 1: sealed door and outer court only; no vault camera or interior mount.
const viewpoints={
  stairs: {eye:[-.5,1.4,1.1],target:[-2,-.1,-10.5]},
  colonnade:{eye:[1,-.65,-22.5],target:[0,1.5,-45]},
  gallery:{eye:[12,-.7,-52.8],target:[13,1,-65]},
  throne:{eye:[6,-.6,-71],target:[0,1,-83]},
  arena:{eye:[0,-.65,-106],target:[0,2,-125]},
  gate:{eye:[-1.2,-.73,-116],target:[0,2,-125.8]},
  retreat:{eye:[0,-.73,-102],target:[0,-.73,-113]},
} as const;
type View=keyof typeof viewpoints;
let current:View='stairs';
function setView(next:View){
  if(!Object.hasOwn(viewpoints,next))return false;
  current=next;
  camera.position.set(...viewpoints[next].eye);
  camera.lookAt(...viewpoints[next].target);
  return true;
}
setView(current);
let frames=0,active=true;
function paint(){
  if(!active)return;
  renderer.render(scene,camera);
  frames++;
  requestAnimationFrame(paint);
}
requestAnimationFrame(paint);
function onResize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}
const keysDown=new Set<string>();let walked=0,rejected=0,trustedW=0;
function step(seconds:number){if(!keysDown.has('w'))return false;const d=new Vector3();camera.getWorldDirection(d);d.y=0;d.normalize();for(let i=0;i<Math.ceil(seconds*30);i++){const p=camera.position.clone().addScaledVector(d,.1);if(!reviewedDShell.canStand(p.x,-p.z)){rejected++;return false;}const y=reviewedDShell.floorAt(p.x,-p.z);if(y===undefined)return false;camera.position.set(p.x,y+1.67,p.z);walked+=.1}return true;}
function onKey(event:KeyboardEvent){
  if(event.key.toLowerCase()==='w'){keysDown.add('w');if(event.isTrusted)trustedW++;event.preventDefault();}
  const keys=Object.keys(viewpoints) as View[];
  const index='123456'.indexOf(event.key);
  if(index>=0)setView(keys[index]!);
}
window.addEventListener('keyup',event=>keysDown.delete(event.key.toLowerCase()));
window.addEventListener('resize',onResize);
window.addEventListener('keydown',onKey);
Object.assign(window,{
  palaceDressingReview:{
    setView,step,
    inspect(){
      return {view:current,frames,walked,rejected,trustedW,vaultMounted:mounted.isVaultPresent,
        materials:mounted.meshes.length,allPieces:undergroundPalaceDressing.pieces.length,
        visualPieces:mounted.visualPieceCount,
        zoneCounts:undergroundPalaceDressing.zoneCounts,
        drawing:renderer.info.render.calls,
        triangles:renderer.info.render.triangles,
        eye:camera.position.toArray(),
        officialWorldMounted:false,
        reviewedDShellSnapshot:true,
        simulatedFixtureLights:qaSockets.length};
    },
    dispose(){
      if(!active)return; active=false;
      window.removeEventListener('resize',onResize);
      window.removeEventListener('keydown',onKey);
      mounted.dispose();
      reviewedDShell.dispose();
      renderer.dispose();renderer.domElement.remove();
    },
  },
});
