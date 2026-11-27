import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {createR30MineCreatureFactory} from '../tools/voxel-tavern/town-blockout/town-c-r30-mine-creature-model.js';
import {mountR30CreatureFragments} from '../tools/voxel-tavern/town-blockout/town-c-r30-creature-fragments.js';
test('accepted phases and travel update articulated model, no persistent debris or collectible',()=>{
 const factory=createR30MineCreatureFactory(),parent=new Group();
 try{
  const snow=factory.create('snow-clump'),sk=factory.create('skeleton-miner'),z=factory.create('zombie-miner'),snake=factory.create('rock-snake');
  for(const m of [snow,sk,z,snake])parent.add(m.group);
  const matrices=(g:Group)=>{const values:number[]=[];g.traverse(o=>{if(o instanceof InstancedMesh){const m=new Matrix4();for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);values.push(...m.elements)}}});return values};
  snow.pose('chase',1,.4);assert.notEqual(snow.group.children[0].rotation.x,0);
  snow.pose('rebuild',1,.4);assert.equal(snow.group.children[0].scale.y,.26);
  for(const [m,hits] of [[sk,2],[z,3]] as const){m.pose('rest',hits);const old=matrices(m.group);m.pose('chase',hits,.3);assert.notDeepEqual(matrices(m.group),old);m.pose('windup',hits,.3);assert.notDeepEqual(matrices(m.group),old)}
  snake.pose('rest',1);const old=matrices(snake.group);snake.pose('chase',1,.2);assert.notDeepEqual(matrices(snake.group),old);assert.equal(snake.group.children[1].position.y,.43);
  let time=0;const fx=mountR30CreatureFragments(parent,()=>time);
  fx.burst('snow','snow-clump',new Vector3());fx.sync();assert.equal(fx.mesh.count,8);time=900;fx.sync();assert.equal(fx.mesh.count,0);
  fx.dispose();for(const m of [snow,sk,z,snake])m.dispose();
  assert.equal(parent.children.length,0);
 }finally{factory.dispose()}
});
