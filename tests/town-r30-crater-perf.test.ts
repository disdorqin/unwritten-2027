import assert from 'node:assert/strict';
import test from 'node:test';
import {BoxGeometry,DynamicDrawUsage,Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,MeshStandardMaterial,PerspectiveCamera,PointLight,Scene,Sphere,Vector3,type WebGLRenderer} from 'three';
import {mountZa31CraterLampRoom} from '../tools/voxel-tavern/town-blockout/town-za31-crater-lamp-room';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {batchCraterLampRoom,installCraterRenderPerf} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf';
import {certifyCraterWallRing,sphereBehindCraterWall,createCraterExteriorOcclusion,applyCraterUndergroundRenderGate} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-occlusion';

function geometry(root:Group){
 root.updateMatrixWorld(true);let draws=0,tris=0;const positions:string[]=[];
 const p=new Vector3();
 root.traverse(o=>{if(!(o instanceof Mesh))return;draws++;const g=o.geometry,a=g.getAttribute('position'),n=g.index?.count??a.count;tris+=n/3;
  for(let i=0;i<n;i++){p.fromBufferAttribute(a,g.index?g.index.getX(i):i).applyMatrix4(o.matrixWorld);positions.push(p.toArray().map(x=>x.toFixed(3)).join(','));}});
 return {draws,tris,positions:positions.sort()};
}
test('actual lamp-room static batching retains world triangles, sign and light',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const room=mountZa31CraterLampRoom(road)!;assert.ok(room);
 const sign=new Mesh(new BoxGeometry(.1,.1,.1),new MeshBasicMaterial());room.group.add(sign);
 const lights:PointLight[]=[];room.group.traverse(o=>{if(o instanceof PointLight)lights.push(o);});
 const before=geometry(room.group),boxes=structuredClone(room.boxes),result=batchCraterLampRoom(room.group);
 const after=geometry(room.group);
 assert.ok(result.before>90&&result.after<15);
 assert.ok(after.draws<before.draws*.25);
 assert.equal(after.tris,before.tris);
 // Float32 merged coordinates may round differently at exactly half a
 // millimetre: compare sorted quantized coordinates by geometric tolerance.
 const points=(a:string[])=>a.map(s=>s.split(',').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
 const x=points(before.positions),y=points(after.positions);
 assert.equal(x.length,y.length);
 // Compare a multiset using rounded bins with nearest adjacent bin fallback.
 const bins=new Map<string,number>();const key=(v:number[])=>v.map(n=>Math.round(n*1000)).join(',');
 for(const v of x)bins.set(key(v),(bins.get(key(v))??0)+1);
 for(const v of y){let found=false;
  for(const de of [0,-1,1])for(const dh of [0,-1,1])for(const dn of [0,-1,1]){if(found)continue;const k=[Math.round(v[0]*1000)+de,Math.round(v[1]*1000)+dh,Math.round(v[2]*1000)+dn].join(',');if((bins.get(k)??0)>0){bins.set(k,bins.get(k)!-1);found=true;}}
  assert.ok(found,'No matching authored vertex');
 }
 assert.ok([...bins.values()].every(n=>n===0));assert.deepEqual(room.boxes,boxes);
 assert.equal(sign.parent,room.group);assert.equal(lights.length,1);assert.equal(lights[0].parent,room.group);
 room.setNightOrdinal(1);assert.ok(room.signLines().length>0);
});
test('pre-render scope excludes only zero-contribution finite lights and restores authored state',()=>{
 const scene=new Scene(),root=new Group(),camera=new PerspectiveCamera(60,1,.1,100);
 camera.position.set(0,0,0);camera.lookAt(0,0,-10);camera.updateMatrixWorld(true);
 const lamp=(x:number,z:number,d:number,intensity=1)=>{const l=new PointLight(0xffffff,intensity,d);l.position.set(x,0,z);root.add(l);return l;};
 const close=lamp(0,-4,5),outside=lamp(40,-4,2),dark=lamp(0,-4,5,0),unbounded=lamp(40,-4,0),shadow=lamp(50,-4,2);shadow.castShadow=true;
 let lod=0,previous=0;const original=()=>{previous++};scene.onBeforeRender=original;
 const hook=installCraterRenderPerf(root,()=>lod++);scene.add(root);const exterior=new PointLight(0xffffff,4,5);exterior.position.set(60,0,-4);scene.add(exterior);const nearExterior=new PointLight(0xffffff,4,7);nearExterior.position.set(0,0,-6);scene.add(nearExterior);hook.refreshSceneLights();scene.updateMatrixWorld(true);
 const renderer={} as WebGLRenderer,call=(f:unknown)=>(f as (...a:unknown[])=>void).call(scene,renderer,scene,camera,null);
 call(scene.onBeforeRender);
 assert.equal(previous,1);assert.equal(lod,1);assert.equal(close.layers.mask,1);assert.equal(outside.layers.mask,0);assert.equal(dark.layers.mask,0);assert.equal(unbounded.layers.mask,1);assert.equal(shadow.layers.mask,1);assert.ok(outside.visible);assert.equal(exterior.layers.mask,0);assert.equal(nearExterior.layers.mask,1);
 call(scene.onAfterRender);assert.equal(outside.layers.mask,1);assert.equal(dark.layers.mask,1);assert.equal(dark.intensity,0);assert.equal(exterior.layers.mask,1);assert.equal(exterior.intensity,4);
 hook.dispose();assert.equal(scene.onBeforeRender,original);
});
test('closed wall certificate from actual cut terrain excludes hidden exterior only and restores layers',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const mesh=road.group.getObjectByName('meteor-crater-walk-mesh') as Mesh;
 const {east,north}=road.anchor,ring=certifyCraterWallRing(mesh,east,north);
 assert.ok(ring);assert.ok(ring.minHeight>5);
 const eye=new Vector3(east+6,road.heightAt(east+6,north)!+1.65,-north);
 const hidden=new Mesh(new BoxGeometry(2,2,2),new MeshStandardMaterial());hidden.position.set(east+200,0,-north);
 const tall=new Mesh(new BoxGeometry(2,2,2),new MeshStandardMaterial());tall.position.set(east+200,100,-north);
 const near=new Mesh(new BoxGeometry(2,2,2),new MeshStandardMaterial());near.position.set(east+12,0,-north);
 const exterior=new Group();exterior.add(hidden,tall,near);
 const camera=new PerspectiveCamera();camera.position.copy(eye);camera.updateMatrixWorld(true);exterior.updateMatrixWorld(true);
 assert.equal(sphereBehindCraterWall(ring,eye,new Sphere(hidden.position,2)),true);
 assert.equal(sphereBehindCraterWall(ring,eye,new Sphere(tall.position,2)),false);
 const o=createCraterExteriorOcclusion(mesh,road.anchor,road.heightAt);
 o.refresh([exterior]);assert.ok(o.prepare());assert.equal(o.begin(camera),1);
 assert.equal(hidden.layers.mask,0);assert.equal(tall.layers.mask,1);assert.equal(near.layers.mask,1);assert.ok(hidden.visible);
 o.restore();assert.equal(hidden.layers.mask,1);
 camera.position.y=ring.minHeight+1;camera.updateMatrixWorld(true);assert.equal(o.begin(camera),0);
 const geometry=mesh.geometry.clone();geometry.setIndex([]);const broken=new Mesh(geometry,mesh.material);assert.equal(certifyCraterWallRing(broken,east,north),undefined);
});
test('small static instance sources cull only when every instance is wall-hidden, invalidate cache and revoke roots',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const ground=road.group.getObjectByName('meteor-crater-walk-mesh') as Mesh;
 const {east,north}=road.anchor,scene=new Scene(),root=new Group(),other=new Group();scene.add(root,other);
 const g=new BoxGeometry(1,1,1),mat=new MeshStandardMaterial(),m=new InstancedMesh(g,mat,3),dynamic=new InstancedMesh(g,mat,3),matrix=new Matrix4();
 for(let i=0;i<3;i++){matrix.makeTranslation(east+190+i,0,-north);m.setMatrixAt(i,matrix);dynamic.setMatrixAt(i,matrix);}
 m.instanceMatrix.needsUpdate=true;dynamic.instanceMatrix.setUsage(DynamicDrawUsage);root.add(m,dynamic);scene.updateMatrixWorld(true);
 const camera=new PerspectiveCamera();camera.position.set(east+6,road.heightAt(east+6,north)!+1.65,-north);camera.updateMatrixWorld(true);
 const o=createCraterExteriorOcclusion(ground,road.anchor,road.heightAt);o.refresh([root]);assert.ok(o.prepare());
 assert.equal(o.begin(camera,false),0);assert.equal(m.layers.mask,1);
 assert.equal(o.begin(camera,true,0),0);assert.equal(m.layers.mask,1,'Unwarmed bound must fail open');
 assert.equal(o.pendingBounds,1);assert.equal(o.warmBounds(1,Infinity),1);assert.equal(o.pendingBounds,0);
 assert.equal(o.begin(camera,true,0),1);assert.equal(o.smallInstanceCulled,1);assert.equal(m.layers.mask,0);assert.equal(dynamic.layers.mask,1);o.restore();assert.equal(m.layers.mask,1);
 m.setMatrixAt(2,matrix.makeTranslation(east+12,0,-north));m.instanceMatrix.needsUpdate=true;assert.equal(o.begin(camera),0);
 m.count=2;assert.equal(o.begin(camera),1);o.restore();other.add(m);scene.updateMatrixWorld(true);assert.equal(o.begin(camera),0);assert.equal(m.layers.mask,1);
});
test('underground gate preserves unknown, opened and transition states',()=>{
 const u=new Group();
 const state={known:true,inMine:false,transition:false,coverOpen:false};
 assert.equal(applyCraterUndergroundRenderGate(u,state),false);
 for(const s of [{...state,known:false},{...state,inMine:true},{...state,transition:true},{...state,coverOpen:true}])assert.equal(applyCraterUndergroundRenderGate(u,s),true);
});
