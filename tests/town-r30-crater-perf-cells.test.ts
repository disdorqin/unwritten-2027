import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,PerspectiveCamera,PlaneGeometry,Scene,Vector3} from 'three';
import {createCraterInstanceCells} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-instances';
import {createCraterGroundCells} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-ground';
import {instanceWorkshopParts} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-workshop';
test('instance cells preserve every transform and tint; mutations fall back to original',()=>{
 const scene=new Scene(),root=new Group();scene.add(root);
 const m=new InstancedMesh(new BoxGeometry(1,1,1,4,4,4),new MeshStandardMaterial(),32),matrix=new Matrix4(),c=new Color();
 for(let i=0;i<32;i++){m.setMatrixAt(i,matrix.makeTranslation(i<16?-100+i*.1:100+i*.1,0,-10));m.setColorAt(i,c.setRGB(i/32,.5,.7));}
 m.instanceMatrix.needsUpdate=true;m.instanceColor!.needsUpdate=true;m.computeBoundingSphere();root.add(m);
 const sys=createCraterInstanceCells(24,8);sys.enqueue([root]);assert.equal(sys.sourceCount,0);assert.equal(sys.pendingSources,1);sys.warmStep(8,Infinity);assert.equal(sys.sourceCount,0);assert.equal(m.children.length,0);while(sys.pendingSources)sys.warmStep(8,Infinity);
 assert.equal(sys.sourceCount,1);assert.equal(m.children.length,2);
 const keys=(batch:InstancedMesh)=>Array.from({length:batch.count},(_,i)=>{batch.getMatrixAt(i,matrix);batch.getColorAt(i,c);return JSON.stringify([...matrix.elements,...c.toArray()]);});
 assert.deepEqual(m.children.flatMap(o=>keys(o as InstancedMesh)).sort(),keys(m).sort());
 scene.updateMatrixWorld(true);const cam=new PerspectiveCamera(45,1,.1,500);cam.position.set(-100,0,0);cam.lookAt(-100,0,-10);cam.updateMatrixWorld(true);
 const stats=sys.begin(cam);assert.equal(stats.savedInstances,16);assert.equal(stats.submitted,1);assert.equal(m.layers.mask,0);
 sys.restore();assert.equal(m.layers.mask,1);assert.ok(m.children.every(o=>!o.visible&&o.layers.mask===0));
 m.setMatrixAt(0,matrix.makeTranslation(0,0,-10));m.instanceMatrix.needsUpdate=true;
 assert.equal(sys.begin(cam).sources,0);assert.equal(m.layers.mask,1);
 sys.replaceRoots([]);assert.equal(sys.sourceCount,0);assert.equal(m.children.length,0);sys.dispose();
});
test('ground cell index multiset equals the authoritative triangles, no attribute replacement',()=>{
 const scene=new Scene(),g=new PlaneGeometry(112,112,56,56);g.rotateX(-Math.PI/2);
 const m=new Mesh(g,new MeshStandardMaterial());scene.add(m);const cells=createCraterGroundCells(m,28)!;assert.ok(cells);
 const indices=Array.from(g.index!.array);const tuples=(a:number[])=>Array.from({length:a.length/3},(_,i)=>a.slice(i*3,i*3+3).join(',')).sort();
 const partition=m.children.flatMap(o=>{const child=o as Mesh;assert.equal(child.geometry.getAttribute('position'),g.getAttribute('position'));assert.equal(child.material,m.material);return Array.from(child.geometry.index!.array);});
 assert.deepEqual(tuples(partition),tuples(indices));
 scene.updateMatrixWorld(true);const cam=new PerspectiveCamera(35,1,.1,300);cam.position.set(-40,6,-40);cam.lookAt(-40,0,-40);cam.updateMatrixWorld(true);
 assert.ok(cells.begin(cam)>indices.length/3*.65);assert.equal(m.layers.mask,0);cells.restore();assert.equal(m.layers.mask,1);assert.equal(m.geometry,g);assert.deepEqual(Array.from(g.index!.array),indices);
 cells.dispose();assert.equal(m.children.length,0);
});
test('local mechanism instancing retains exact pivots and protected leaf identity',()=>{
 const root=new Group(),pivot=new Group(),g=new BoxGeometry(),mat=new MeshStandardMaterial();root.add(pivot);pivot.position.y=2;
 const leaves=Array.from({length:5},(_,i)=>{const m=new Mesh(g,mat);m.position.x=i;pivot.add(m);return m;});
 const handle=leaves[4];const stats=instanceWorkshopParts(root,new Set([handle]),new Set([mat]));
 assert.equal(stats.before,4);assert.equal(stats.after,1);assert.equal(handle.parent,pivot);
 pivot.rotation.z=.4;root.updateMatrixWorld(true);const batch=pivot.children.find(o=>o instanceof InstancedMesh) as InstancedMesh;assert.ok(batch);
 const t=new Matrix4();batch.getMatrixAt(3,t);const expected=new Vector3(3,0,0).applyMatrix4(pivot.matrixWorld);
 assert.ok(new Vector3().setFromMatrixPosition(t.premultiply(batch.matrixWorld)).distanceTo(expected)<1e-6);
 stats.dispose();
});
