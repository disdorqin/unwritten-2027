import assert from 'node:assert/strict';
import test from 'node:test';
import {Raycaster,Vector3} from 'three';
import {buildBR30HistoricWalkway} from '../tools/voxel-tavern/town-blockout/town-b-r30-east-historic-walkway';
test('historical walkway has real first-section plank/ramp support and isolated broken fragments',()=>{
 const plan=[{east:0,north:0,yaw:0},{east:0,north:3.8,yaw:0},{east:.25,north:7,yaw:.16}] as const;
 const model=buildBR30HistoricWalkway((e,n)=>.035*n+.025*e,plan);
 assert.equal(model.productionReady,false);assert.equal(model.group.parent,null);
 assert.ok(model.pieces>70&&model.group.children.length===5);
 assert.equal(model.support.length,42);
 model.group.updateMatrixWorld(true);
 const ray=new Raycaster(),v=new Vector3();
 let error=0;
 for(const tri of model.support){
  const p=tri.reduce((s,q)=>({east:s.east+q.east/3,north:s.north+q.north/3,height:s.height+q.height/3}),{east:0,north:0,height:0});
  ray.set(v.set(p.east,p.height+.04,-p.north),new Vector3(0,-1,0));ray.far=.10;
  const hit=ray.intersectObject(model.group,true)[0];
  assert.ok(hit,'exported support must land on rendered timber');
  error=Math.max(error,Math.abs(hit.point.y-p.height));
 }
 assert.ok(error<.015, 'support deviation '+error);
 assert.ok(model.support.every(t=>t.every(p=>p.north<=1.026)));
 assert.throws(()=>buildBR30HistoricWalkway(()=>0,[plan[0],{...plan[1],north:1.8},plan[2]]),/break/);
 assert.throws(()=>buildBR30HistoricWalkway(()=>undefined,plan),/ground/);
 model.dispose();model.dispose();
});
