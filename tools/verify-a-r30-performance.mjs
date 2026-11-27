import {createTerrainGrid,worldBounds} from './voxel-tavern/town-blockout/terrain.ts';
import {mountWestCraterRoad} from './voxel-tavern/town-blockout/town-za22-crater-road.ts';
import {buildTownRailRoute} from './voxel-tavern/town-blockout/town-railway.ts';
import {buildCraterRailExtension} from './voxel-tavern/town-blockout/town-crater-rail-extension.ts';
import {Frustum,Matrix4,PerspectiveCamera,Vector3} from 'three';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points);
const groups={outer:road.outerWorks.group,mouth:road.mouthWorks.group,rail:rail.group};
const views=[['gate',-28,12.5,159,-80,12,159],['yard',-132,13,100,-150,13,120],['north',-90,13,265,-122,20,245],['shankou',296,12,520,240,12,510],['town',223,14,180,270,18,290],['station',526,28,305,470,32,372]];
const camera=new PerspectiveCamera(58,16/9,.1,1200),frustum=new Frustum(),m=new Matrix4();
function measure(group){
 group.updateMatrixWorld(true);let triangles=0,vertices=0,bytes=0,draws=0;
 const meshes=[];group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,p=g.attributes.position;if(!p)return;
  const instances=o.isInstancedMesh?o.count:1,t=(g.index?.count??p.count)/3*instances;
  triangles+=t;vertices+=p.count;bytes+=Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength??0);
  draws++;meshes.push({o,t});
 });
 const perView=Object.fromEntries(views.map(([id,e,h,n,te,th,tn])=>{
  camera.position.set(e,h,-n);camera.lookAt(new Vector3(te,th,-tn));camera.updateMatrixWorld();frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const visible=meshes.filter(({o})=>!o.frustumCulled||frustum.intersectsObject(o));
  return [id,{draws:visible.length,triangles:visible.reduce((s,x)=>s+x.t,0)}];
 }));
 return {triangles,vertices,bytes,draws,perView};
}
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'same production builders, camera frustum only; not GPU FPS',groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,measure(v)])),colliders:road.group.userData.colliders.length+rail.group.userData.colliders.length,floors:road.group.userData.floors.length+rail.group.userData.floors.length};
console.log(JSON.stringify(report));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
