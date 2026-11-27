import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial,PerspectiveCamera,Scene,Vector3} from 'three';
import {createCraterStaticMeshBatches} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-static-batches';
test('static mesh consolidation retains transformed geometry and fails open on scene changes',()=>{
 const scene=new Scene(),root=new Group(),g=new BoxGeometry(),mat=new MeshStandardMaterial();scene.add(root);
 const leaves=Array.from({length:5},(_,i)=>{const m=new Mesh(g,mat);m.position.set(1+i*.7,1,-8);m.rotation.y=i*.12;root.add(m);return m;});
 scene.updateMatrixWorld(true);const system=createCraterStaticMeshBatches(20);system.register([root]);assert.equal(system.pending,1);assert.equal(root.children.length,5);
 system.warmStep();assert.equal(system.count,1);const proxy=root.children[5] as Mesh;assert.equal(proxy.geometry.index!.count,g.index!.count*5);assert.equal(proxy.material,mat);
 const a=g.getAttribute('position'),b=proxy.geometry.getAttribute('position');
 for(let i=0;i<leaves.length;i++)for(let j=0;j<a.count;j++){const expected=new Vector3().fromBufferAttribute(a,j).applyMatrix4(leaves[i].matrix);assert.ok(expected.distanceTo(new Vector3().fromBufferAttribute(b,i*a.count+j))<1e-5);}
 const camera=new PerspectiveCamera(80,1,.1,100);camera.position.set(2,1,0);camera.lookAt(2,1,-8);camera.updateMatrixWorld(true);
 assert.equal(system.begin(camera).savedDraws,4);assert.ok(leaves.every(l=>l.layers.mask===0));assert.equal(proxy.visible,true);
 system.restore();assert.ok(leaves.every(l=>l.layers.mask===1));assert.equal(proxy.layers.mask,0);
 leaves[2].visible=false;assert.equal(system.begin(camera).batches,0);leaves[2].visible=true;
 leaves[3].position.x+=.2;scene.updateMatrixWorld(true);assert.equal(system.begin(camera).batches,0);leaves[3].position.x-=.2;scene.updateMatrixWorld(true);
 leaves[1].layers.mask=0;assert.equal(system.begin(camera).batches,0);assert.equal(leaves[1].layers.mask,0);leaves[1].layers.mask=1;
 system.dispose();assert.equal(root.children.length,5);
});
