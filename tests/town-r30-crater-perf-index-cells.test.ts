import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,MeshStandardMaterial,PerspectiveCamera,PlaneGeometry,Scene} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createCraterIndexCells} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-index-cells';
test('industrial index cells reuse exact triangles, one draw, fail open on mutation',()=>{
 const scene=new Scene(),root=new Group(),outer=new Group();outer.name='crater-outer-works';scene.add(root);root.add(outer);
 const left=new PlaneGeometry(12,12,40,40).translate(-100,0,-20),right=new PlaneGeometry(12,12,40,40).translate(100,0,-20);
 const g=mergeGeometries([left,right])!,mat=new MeshStandardMaterial(),m=new Mesh(g,mat);m.name='crater-outer-test-all';outer.add(m);scene.updateMatrixWorld(true);
 const sys=createCraterIndexCells(root,24);sys.register();assert.equal(sys.pending,1);sys.warmStep(10,Infinity);assert.equal(sys.count,0);while(sys.pending)sys.warmStep(512,Infinity);assert.equal(sys.count,1);
 const proxy=m.children[0] as Mesh;assert.equal(proxy.geometry.getAttribute('position'),g.getAttribute('position'));assert.equal(proxy.material,mat);
 const camera=new PerspectiveCamera(60,1,.1,500);camera.position.set(-100,0,0);camera.lookAt(-100,0,-20);camera.updateMatrixWorld(true);
 for(let i=0;i<12;i++){assert.equal(sys.begin(camera).sources,0);sys.restore();}sys.warmSelection();assert.equal(sys.begin(camera).savedTriangles,3200);
 assert.equal(m.layers.mask,0);assert.equal(proxy.visible,true);assert.equal(proxy.geometry.drawRange.count,left.index!.count);
 const triples=(a:ArrayLike<number>)=>Array.from({length:a.length/3},(_,i)=>[a[i*3],a[i*3+1],a[i*3+2]].join(',')).sort();assert.deepEqual(triples(proxy.geometry.index!.array.slice(0,left.index!.count)),triples(left.index!.array));
 sys.restore();assert.equal(m.layers.mask,1);assert.equal(proxy.visible,false);
 camera.position.x=100;camera.lookAt(100,0,-20);camera.updateMatrixWorld(true);assert.equal(sys.begin(camera).sources,0);
 g.index!.needsUpdate=true;assert.equal(sys.begin(camera).sources,0);sys.dispose();assert.equal(m.children.length,0);assert.equal(g.index!.count,19200);
});
