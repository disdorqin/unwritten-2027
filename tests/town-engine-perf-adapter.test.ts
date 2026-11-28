import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Mesh,MeshBasicMaterial,Group} from 'three';
import {describeThreeObject} from '../tools/voxel-tavern/town-blockout/engine-perf/adapters/three-object-descriptor';
import {ChunkRegistry,PerformancePlanner,planChunk,drawableTier,type PerfTier} from '../tools/voxel-tavern/town-blockout/engine-perf/index';
test('arbitrary newly added model can register through the generic Three adapter',()=>{
 const root=new Group(),g=new BoxGeometry(2,4,6),mat=new MeshBasicMaterial(),mesh=new Mesh(g,mat);
 root.position.set(30,0,-90);root.rotation.y=Math.PI/2;root.add(mesh);
 const d=describeThreeObject(root,{owner:'future-extension',id:'new-model',revision:'1',staticGeometry:true,coverageRequired:false});
 const r=new ChunkRegistry();r.register(d);
 assert.ok(Math.abs(d.west-27)<1e-8);assert.ok(Math.abs(d.east-33)<1e-8);
 assert.ok(Math.abs(d.south-89)<1e-8);assert.ok(Math.abs(d.north-91)<1e-8);
 assert.equal(planChunk(d,{east:30,north:90}).tier,'near');
 const engine=new PerformancePlanner();engine.register(d);
 assert.equal(engine.plan({east:30,north:90,frameMs:16,nowMs:1})[0]!.tier,'near');
 assert.equal(engine.remove(d.owner,d.id),true);assert.deepEqual(engine.plan({east:30,north:90,frameMs:16,nowMs:2}),[]);
 assert.equal(root.children[0],mesh);assert.equal(mesh.geometry,g);assert.equal(mesh.visible,true);
 g.dispose();mat.dispose();
});
test('required ground coverage survives distance unload; replacement stays fail-open',()=>{
 const c={owner:'future-terrain',id:'tile',revision:'1',west:0,east:64,south:0,north:64,staticGeometry:true,coverageRequired:true};
 assert.equal(planChunk(c,{east:100000,north:0}).tier,'far');
 assert.equal(planChunk({...c,coverageRequired:false},{east:100000,north:0}).tier,'unloaded');
 assert.equal(drawableTier('far','near',new Set<PerfTier>(['far'])),'far');
});
