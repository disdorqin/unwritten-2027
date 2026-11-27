import test from 'node:test';
import assert from 'node:assert/strict';
import {CylinderGeometry,DoubleSide,Group,InstancedMesh,Matrix4,MeshLambertMaterial,PerspectiveCamera,Quaternion,Vector3} from 'three';
import {createCraterCylinderCaps,extendCylinderCapEnvelope} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-cylinder-caps';
import {createCraterInstanceBatches} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-instance-batches';
test('directional cylinder cap bound excludes only back-facing cap triangles for every instance',()=>{
 const g=new CylinderGeometry(.3,.6,1,5),mat=new MeshLambertMaterial(),m=new InstancedMesh(g,mat,200),sys=createCraterCylinderCaps(),env=sys.envelope(g,new Vector3(0,5,0));assert.ok(env);
 const t=new Matrix4(),q=new Quaternion(),axis=new Vector3(0,0,1);
 for(let k=0;k<m.count;k++){q.setFromAxisAngle(axis,(k%5-2)*.015);t.compose(new Vector3((k%10)*.2,5,Math.floor(k/10)*.1),q,new Vector3(.7,1.5,.8));m.setMatrixAt(k,t);extendCylinderCapEnvelope(env,t);}
 m.updateMatrixWorld(true);const cam=new PerspectiveCamera(70,1,.1,100);cam.position.set(0,-10,0);cam.updateMatrixWorld(true);assert.equal(sys.apply(cam,m,env),1000);
 const cap=g.groups.find(x=>x.materialIndex===1)!;const original=Array.from(g.index!.array),retained=Array.from(m.geometry.index!.array);assert.deepEqual(retained,original.filter((_,i)=>i<cap.start||i>=cap.start+cap.count));
 const a=new Vector3(),b=new Vector3(),c=new Vector3(),n=new Vector3(),eye=new Vector3();for(let j=cap.start;j<cap.start+cap.count;j+=3){a.fromBufferAttribute(g.getAttribute('position'),g.index!.getX(j));b.fromBufferAttribute(g.getAttribute('position'),g.index!.getX(j+1)).sub(a);c.fromBufferAttribute(g.getAttribute('position'),g.index!.getX(j+2)).sub(a);n.crossVectors(b,c);for(let k=0;k<m.count;k++){m.getMatrixAt(k,t);eye.copy(cam.position).applyMatrix4(t.invert()).sub(a);assert.ok(n.dot(eye)<0);}}
 sys.restore();assert.equal(m.geometry,g);cam.position.set(0,5,0);cam.updateMatrixWorld(true);assert.equal(sys.apply(cam,m,env),2000);sys.restore();mat.side=DoubleSide;cam.position.y=-10;cam.updateMatrixWorld(true);assert.equal(sys.apply(cam,m,env),0);mat.side=0;g.index!.needsUpdate=true;assert.equal(sys.apply(cam,m,env),0);sys.dispose();assert.ok(g.getAttribute('position'));
});
test('static forest merged proxy cap pruning preserves authored instance state',()=>{
 const root=new Group(),g=new CylinderGeometry(.3,.6,1,5),mat=new MeshLambertMaterial(),t=new Matrix4();
 const meshes=[0,1].map(k=>{const m=new InstancedMesh(g,mat,200);m.name='Forest trunks and branches ['+k+',0]';for(let i=0;i<m.count;i++)m.setMatrixAt(i,t.makeTranslation(k*2+i*.001,5,-10));root.add(m);return m;});
 root.updateMatrixWorld(true);const sys=createCraterInstanceBatches(192,true);sys.register([root]);while(sys.pending)sys.warmStep(1,Infinity);
 const cam=new PerspectiveCamera(100,1,.1,100);cam.position.set(1,0,0);cam.lookAt(1,5,-10);cam.updateMatrixWorld(true);const stats=sys.begin(cam);assert.equal(stats.savedDraws,1);assert.equal(stats.capSaved,2000);assert.ok(meshes.every(m=>m.geometry===g));sys.restore();assert.ok(meshes.every(m=>m.layers.mask===1));assert.equal(sys.begin(cam,true,false).capSaved,0);sys.dispose();
});
