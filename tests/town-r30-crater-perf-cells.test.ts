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
test('stable visible cells compact to one draw without extra buffers per frame',()=>{
 const root=new Group(),scene=new Scene();scene.add(root);const g=new BoxGeometry(1,1,1,5,5,5),m=new InstancedMesh(g,new MeshStandardMaterial(),60),t=new Matrix4(),color=new Color();
 for(let i=0;i<60;i++){m.setMatrixAt(i,t.makeTranslation([2,34,202][Math.floor(i/20)]+(i%20)*.1,0,-20));m.setColorAt(i,color.setRGB(i/60,.5,.6));}m.instanceMatrix.needsUpdate=true;m.instanceColor!.needsUpdate=true;root.add(m);scene.updateMatrixWorld(true);
 const sys=createCraterInstanceCells(32,0);sys.register([root]);assert.equal(m.children.length,3);
 const cam=new PerspectiveCamera(65,1,.1,500);cam.position.set(18,0,20);cam.lookAt(18,0,-20);cam.updateMatrixWorld(true);
 for(let i=0;i<12;i++){assert.equal(sys.begin(cam).sources,0);sys.restore();}
 assert.ok(sys.warmCompacts(10,Infinity)>0);assert.equal(m.children.length,3);sys.warmCompacts(100,Infinity);assert.equal(m.children.length,4);
 const stats=sys.begin(cam);assert.equal(stats.compactSources,1);assert.equal(stats.submitted,1);assert.equal(stats.savedInstances,20);assert.equal(stats.extraDraws,0);
 const proxy=m.children.find(o=>o.name==='p2-instance-cell-compact') as InstancedMesh;assert.equal(proxy.count,40);assert.equal(proxy.visible,true);
 const expected=new Matrix4(),actual=new Matrix4(),a=new Color(),b=new Color();for(let i=0;i<40;i++){m.getMatrixAt(i,expected);proxy.getMatrixAt(i,actual);assert.ok(expected.equals(actual));m.getColorAt(i,a);proxy.getColorAt(i,b);assert.ok(a.equals(b));}
 sys.restore();assert.equal(m.layers.mask,1);assert.equal(proxy.visible,false);assert.equal(sys.begin(cam,undefined,true,false).compactSources,0);sys.restore();
 m.instanceMatrix.needsUpdate=true;assert.equal(sys.begin(cam).sources,0);sys.replaceRoots([]);assert.equal(m.children.length,0);
});
test('one-cell source retains no GPU proxy and culls only with a valid wall ring',()=>{
 const root=new Group(),scene=new Scene();scene.add(root);const m=new InstancedMesh(new BoxGeometry(),new MeshStandardMaterial(),32),t=new Matrix4();
 for(let i=0;i<32;i++)m.setMatrixAt(i,t.makeTranslation(100+i*.1,0,-2));m.instanceMatrix.needsUpdate=true;root.add(m);scene.updateMatrixWorld(true);
 const sys=createCraterInstanceCells(32,8);sys.register([root]);assert.equal(sys.sourceCount,1);assert.equal(m.children.length,0);
 const cam=new PerspectiveCamera(60,1,.1,500);cam.position.set(0,-10,0);cam.lookAt(100,0,-2);cam.updateMatrixWorld(true);
 const ring={east:0,north:0,radius:52,inradius:51.9,minHeight:5,segments:64};
 assert.equal(sys.begin(cam).sources,0);assert.equal(sys.begin(cam,ring,false).sources,0);assert.equal(sys.begin(cam,ring).savedInstances,32);assert.equal(m.layers.mask,0);sys.restore();assert.equal(m.layers.mask,1);
 m.setMatrixAt(0,t.makeTranslation(0,0,0));m.instanceMatrix.needsUpdate=true;assert.equal(sys.begin(cam,ring).sources,0);sys.dispose();
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
