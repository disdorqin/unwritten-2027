import {
  AmbientLight,Color,DirectionalLight,Group,Mesh,MeshBasicMaterial,MeshLambertMaterial,
  PerspectiveCamera,PlaneGeometry,Scene,Vector3,WebGLRenderer,
} from 'three';
import{createMainSummitBlock,mainSummitLayout}from'./main-summit-block';
import{createMainSummitTrail}from'./main-summit-trail';
import{createMainSummitIcefall}from'./main-summit-icefall';
import{createMainSummitSurveyStations}from'./main-summit-survey-stations';
import{createMainSummitHutFurnishings}from'./main-summit-hut-furnishings';
import{surveyPlateLines}from'./town-survey';

const scene=new Scene();
const block=createMainSummitBlock(mainSummitLayout,347,100);
const trail=createMainSummitTrail(block.heightAt,347);
const ice=createMainSummitIcefall(block.heightAt);
const stations=createMainSummitSurveyStations({
  cloudTerrace:{east:30,north:-30,height:347},
  trailPoints:trail.points,icefallTop:ice.topAnchor,heightAt:block.heightAt,
});
const hut=createMainSummitHutFurnishings();
scene.add(block.coarse,ice.group,stations.group,hut.group);
const ambient=new AmbientLight('#c3d1df',1.22);
const sun=new DirectionalLight('#fceac6',1.8);
sun.position.set(410,1080,-580);
scene.add(ambient,sun);
const renderer=new WebGLRenderer({antialias:true});
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);
const camera=new PerspectiveCamera(59,1,.05,1500);
const labels=['M4','M5','M6','M7']as const;
type Id=typeof labels[number];
let current:Id='M4',night=false,frames=0;
const bases=Object.fromEntries(stations.stations.map(item=>[item.id,item])) as
  Record<Id,{id:Id;east:number;north:number;height:number}>;
const pads:Mesh[]=[];
for(const station of stations.stations){
  const pad=new Mesh(new PlaneGeometry(5.2,5.2),
    new MeshLambertMaterial({color:'#747778'}));
  pad.rotation.x=-Math.PI/2;
  pad.position.set(station.east,station.height-.025,-station.north);
  pad.name='inspection-only-ground-reference-'+station.id;
  scene.add(pad);pads.push(pad);
}
const detail=document.querySelector<HTMLOutputElement>('#status')!;
function dayMode(active:boolean){
  night=!active;
  scene.background=new Color(active?'#a8c2d5':'#1f2c41');
  ambient.intensity=active?1.22:.42;
  sun.intensity=active?1.8:.15;
}
function setCamera(){
  const site=bases[current];
  if(current==='M7'){
    camera.position.set(site.east+0.25,site.height+1.68,-site.north+1.68);
    camera.lookAt(site.east,site.height+.11,-site.north+.49);
  }else{
    // These are *human eye-height* near-board audit cameras; neither
    // the camera nor the model follows a real accepted presence avatar.
    camera.position.set(site.east+.06,site.height+1.68,-site.north+1.45);
    camera.lookAt(site.east,site.height+1.30,-site.north+.16);
  }
}
function draw(){
  frames++;
  setCamera();
  renderer.render(scene,camera);
  detail.value=current+' · '+surveyPlateLines(current).join(' / ')+
    ' · '+(night?'雪夜':'白昼')+' · '+renderer.info.render.calls+' draws / '+
    renderer.info.render.triangles+' tris';
  requestAnimationFrame(draw);
}
addEventListener('keydown',event=>{
  const key=Number(event.key);
  if(Number.isInteger(key)&&key>=1&&key<=4)current=labels[key-1]!;
  if(event.key.toLowerCase()==='n')dayMode(false);
  if(event.key.toLowerCase()==='d')dayMode(true);
});
addEventListener('resize',resize);
function resize(){
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
}
function face(id:Id){
  if(id==='M7')return hut.group.getObjectByName('survey-engraved-plate-m7')as Mesh|undefined;
  return stations.group.getObjectByName('survey-engraved-plate-'+id.toLowerCase())as Mesh|undefined;
}
Object.defineProperty(window,'__d4SurveyReview',{
  value:Object.freeze({state:()=>{
    const mesh=face(current);
    const mat=mesh?.material as MeshBasicMaterial|undefined;
    return{
      id:current,night,frames,
      foot:{east:bases[current].east,north:bases[current].north,height:bases[current].height},
      eye:camera.position.toArray(),
      approvedText:surveyPlateLines(current),
      actualText:mesh?.userData.inscription,
      hasRealTexture:Boolean(mat?.map&&mat.map.isTexture),
      textureName:mat?.map?.name,
      markerCount:stations.group.children.length,
      m7Circle:Boolean(hut.group.getObjectByName('summit-stone-circle')),
      m7Marker:Boolean(hut.group.getObjectByName('survey-station-m7-marker')),
      renderedDraws:renderer.info.render.calls,
    };
  }})
});
addEventListener('pagehide',()=>{
  block.dispose();ice.dispose();stations.dispose();hut.dispose();
  for(const mesh of pads){mesh.removeFromParent();mesh.geometry.dispose();
    (mesh.material as MeshLambertMaterial).dispose();}
  renderer.dispose();
},{once:true});
dayMode(true);resize();requestAnimationFrame(draw);
