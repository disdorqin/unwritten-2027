import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial} from 'three';
import {instanceWorkshopStateParts} from '../tools/voxel-tavern/town-blockout/town-r30-crater-perf-state-parts';
test('accepted state instances preserve source identity, position, material and stale/unknown fallback',()=>{
 const root=new Group(),g=new BoxGeometry(),off=new MeshStandardMaterial({color:0x333333}),on=new MeshStandardMaterial({color:0xffdd99});
 const leaves=Array.from({length:18},(_,i)=>{const m=new Mesh(g,off);m.position.set(i*.1,1,0);m.name='logical-'+i;root.add(m);return m;});
 const handle=instanceWorkshopStateParts([{leaves,materials:[off,on]}]);
 const instances=root.children.filter(o=>o instanceof InstancedMesh) as InstancedMesh[];
 assert.equal(handle.sourceCount,18);assert.equal(handle.visibleDraws,1);assert.equal(instances[0].count,18);
 assert.equal(root.getObjectByName('logical-3'),leaves[3]);assert.ok(leaves.every(l=>l.layers.mask===0&&l.visible));
 for(let i=0;i<7;i++)leaves[i].material=on;leaves[17].visible=false;handle.sync();
 assert.equal(instances[0].count,10);assert.equal(instances[1].count,7);assert.equal(handle.visibleDraws,2);
 const m=new Matrix4();instances[1].getMatrixAt(6,m);assert.ok(Math.abs(m.elements[12]-.6)<1e-6);
 const version=instances[1].instanceMatrix.version;handle.sync();assert.equal(instances[1].instanceMatrix.version,version);
 leaves[2].material=new MeshStandardMaterial();handle.sync();assert.ok(leaves.every(l=>l.layers.mask===1));assert.equal(handle.visibleDraws,0);
 leaves[2].material=off;handle.sync();assert.equal(instances[1].count,6);
 handle.dispose();assert.equal(root.children.length,18);assert.ok(leaves.every(l=>l.layers.mask===1));
});
