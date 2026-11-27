import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,Mesh,MeshLambertMaterial,PerspectiveCamera,Scene} from 'three';
import {createCraterPaletteBatches} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-palette';
test('merged scenery palette preserves exact triangles, linear colors and original object identity',()=>{
 const scene=new Scene(),land=new Group(),root=new Group();root.name='town-fill-b1';scene.add(land);land.add(root);
 const a=new Mesh(new BoxGeometry().translate(-1,0,-10),new MeshLambertMaterial({color:0x385839})),b=new Mesh(new BoxGeometry().translate(1,0,-10),new MeshLambertMaterial({color:0x998877}));a.geometry.clearGroups();b.geometry.clearGroups();root.add(a,b);scene.updateMatrixWorld(true);
 const p=createCraterPaletteBatches();p.register([land]);assert.equal(p.pending,1);a.material.addEventListener('dispose',()=>{});p.warmStep();assert.equal(p.count,1);
 const proxy=root.children[2] as Mesh,g=proxy.geometry,colors=g.getAttribute('color');assert.equal(g.index!.count,72);assert.deepEqual(Array.from(g.getAttribute('position').array),[...a.geometry.getAttribute('position').array,...b.geometry.getAttribute('position').array]);assert.ok(Math.abs(colors.getX(0)-a.material.color.r)<1e-6);assert.ok(Math.abs(colors.getX(24)-b.material.color.r)<1e-6);
 const camera=new PerspectiveCamera(60,1,.1,500);camera.lookAt(0,0,-10);camera.updateMatrixWorld(true);assert.equal(p.begin(camera).savedDraws,1);assert.equal(a.layers.mask,0);p.restore();assert.equal(a.layers.mask,1);
 b.material.color.setHex(0xff0000);assert.equal(p.begin(camera).savedDraws,0);b.material.color.setHex(0x998877);b.geometry.getAttribute('normal').needsUpdate=true;assert.equal(p.begin(camera).savedDraws,0);p.dispose();assert.equal(root.children.length,2);
});
