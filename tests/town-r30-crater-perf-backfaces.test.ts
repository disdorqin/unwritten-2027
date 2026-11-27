import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,BoxGeometry,DoubleSide,Group,InstancedMesh,Matrix4,MeshStandardMaterial,PerspectiveCamera,Vector3} from 'three';
import {axisAlignedInstance,createCraterBoxBackfaces} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-backfaces';
import {createCraterInstanceCells} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-instances';
test('exact box face pruning retains all front-facing triangles and restores source',()=>{
 const g=new BoxGeometry(),mat=new MeshStandardMaterial(),m=new InstancedMesh(g,mat,100),t=new Matrix4();
 for(let i=0;i<100;i++)m.setMatrixAt(i,t.makeTranslation(i*.01,0,0));
 m.updateMatrixWorld(true);m.computeBoundingBox();const cam=new PerspectiveCamera(60,1,.1,100);cam.position.set(10,10,10);cam.lookAt(0,0,0);cam.updateMatrixWorld(true);
 const sys=createCraterBoxBackfaces();sys.begin(cam);assert.equal(sys.apply(cam,m,m.boundingBox!,true),600);assert.equal(m.geometry.index!.count,18);
 const p=g.getAttribute('position'),a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3(),eye=new Vector3();
 const retained=new Set(Array.from(m.geometry.index!.array));for(let i=0;i<g.index!.count;i+=3){const ids=[g.index!.getX(i),g.index!.getX(i+1),g.index!.getX(i+2)];if(ids.every(k=>retained.has(k)))continue;a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]).sub(a);c.fromBufferAttribute(p,ids[2]).sub(a);normal.crossVectors(b,c);for(let k=0;k<100;k++){m.getMatrixAt(k,t);eye.copy(cam.position).applyMatrix4(t.invert()).sub(a);assert.ok(normal.dot(eye)<0);}}
 sys.restore();assert.equal(m.geometry,g);mat.side=DoubleSide;sys.begin(cam);assert.equal(sys.apply(cam,m,m.boundingBox!,true),0);sys.dispose();assert.ok(g.getAttribute('position'));assert.equal(axisAlignedInstance(new Matrix4().makeRotationY(.1)),false);
});
test('cell integration reduces original aligned sources only during the pass',()=>{
 const root=new Group(),g=new BoxGeometry(),m=new InstancedMesh(g,new MeshStandardMaterial(),100);for(let i=0;i<100;i++)m.setMatrixAt(i,new Matrix4().makeTranslation(i*.01,0,-10));root.add(m);root.updateMatrixWorld(true);
 const sys=createCraterInstanceCells(32);sys.register([root]);const cam=new PerspectiveCamera(80,1,.1,100);cam.position.set(2,2,0);cam.lookAt(0,0,-10);cam.updateMatrixWorld(true);sys.begin(cam);assert.equal(sys.applyBackfaces(cam),600);assert.equal(m.geometry.index!.count,18);sys.restore();assert.equal(m.geometry,g);sys.dispose();
});
