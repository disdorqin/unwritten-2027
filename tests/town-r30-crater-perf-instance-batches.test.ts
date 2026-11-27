import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshStandardMaterial,PerspectiveCamera,Scene,Vector3} from 'three';
import {createCraterInstanceBatches} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-instance-batches';
test('coalesces exact shared static batches, restores layers and rejects changed sources',()=>{
 const scene=new Scene(),root=new Group(),g=new BoxGeometry(),mat=new MeshStandardMaterial(),matrix=new Matrix4(),c=new Color();
 scene.add(root);const sources=Array.from({length:5},(_,i)=>{const p=new Group();p.position.set(i*2,0,-10);p.rotation.y=i*.12;root.add(p);const m=new InstancedMesh(g,mat,3);for(let j=0;j<3;j++){m.setMatrixAt(j,matrix.makeTranslation(j*.3,0,0));m.setColorAt(j,c.setRGB(i/5,j/3,.7));}p.add(m);return m;});
 scene.updateMatrixWorld(true);const system=createCraterInstanceBatches(96);system.register([root]);assert.equal(system.pending,1);system.warmStep(1,Infinity);assert.equal(system.count,1);
 const proxy=root.children.find(o=>o.name==='p4-coalesced-instances') as InstancedMesh;assert.ok(proxy);assert.equal(proxy.count,15);assert.equal(proxy.geometry,g);assert.equal(proxy.material,mat);
 const expected=new Matrix4(),actual=new Matrix4(),expectedColor=new Color(),actualColor=new Color();
 sources.forEach((m,i)=>{for(let j=0;j<3;j++){m.getMatrixAt(j,expected);expected.premultiply(m.matrixWorld);proxy.getMatrixAt(i*3+j,actual);actual.premultiply(proxy.matrixWorld);assert.ok(expected.elements.every((v,k)=>Math.abs(v-actual.elements[k])<1e-6));m.getColorAt(j,expectedColor);proxy.getColorAt(i*3+j,actualColor);assert.ok(expectedColor.equals(actualColor));}});
 const camera=new PerspectiveCamera(100,1,.1,100);camera.position.set(4,1,0);camera.lookAt(new Vector3(4,0,-10));camera.updateMatrixWorld(true);
 assert.equal(system.begin(camera).savedDraws,4);assert.ok(sources.every(m=>m.layers.mask===0));assert.equal(proxy.visible,true);system.restore();assert.ok(sources.every(m=>m.layers.mask===1));assert.equal(proxy.visible,false);
 sources[0].layers.mask=0;assert.equal(system.begin(camera).savedDraws,0);sources[0].layers.mask=1;
 sources[1].instanceMatrix.needsUpdate=true;assert.equal(system.begin(camera).savedDraws,0);
 system.dispose();assert.equal(root.children.length,5);
});
