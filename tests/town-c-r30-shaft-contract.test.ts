import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {surveyZa31CraterWinch} from '../tools/voxel-tavern/town-blockout/town-za31-crater-winch.js';
import {resolveR30ShaftContract} from '../tools/voxel-tavern/town-blockout/town-c-r30-shaft-contract.js';
import {secondMineConnections,secondMineWorldFrame} from '../src/shared/underground-second-mine-presence-domain.js';

test('C-R01 actual host supplies the shaft protection, entry/return and existing second mine transform',()=>{
 const road=mountWestCraterRoad(260,()=>10.7773),parent=new Group();
 const host=mountUndergroundDomainHost({parent,road});
 assert.equal(host.kind,'ready');if(host.kind!=='ready')assert.fail();
 try{
  const c=host.shaftContract;
  assert.equal(c.kind,'ready');if(c.kind!=='ready')assert.fail();
  assert.equal(c.surface.protection.length,6);
  assert.equal(c.surface.shaft.height,-24.2227);
  assert.equal(c.surface.depthLine,-73);
  assert.deepEqual(c.firstMine.entry,host.registration.connection.firstFallLanding);
  assert.deepEqual(c.firstMine.returnToSurface,host.registration.connection.shaftFoot);
  for(const p of c.surface.protection)assert.ok(c.surface.protectedAt(p.centre.east,p.centre.north));
  const approach=c.surface.approach;
  for(let i=1;i<approach.length;i++){
   const a=approach[i-1],b=approach[i],steps=Math.ceil(Math.hypot(a.east-b.east,a.north-b.north)*4);
   for(let k=0;k<=steps;k++){
    const e=a.east+(b.east-a.east)*k/steps,n=a.north+(b.north-a.north)*k/steps;
    assert.ok(c.surface.protectedAt(e,n));
    assert.ok(road.heightAt(e,n)!==undefined);
   }
  }
  assert.ok(!c.surface.protectedAt(50,50));assert.ok(c.surface.protectedAt(NaN,0));
  assert.equal(c.deep.kind,'registered');if(c.deep.kind!=='registered')assert.fail();
  assert.deepEqual(c.deep.frame,secondMineWorldFrame);
  assert.equal(c.deep.connections,secondMineConnections);
  const options={registration:host.registration,winch:surveyZa31CraterWinch(road)!,mineYaw:road.anchor.yaw,
    toWorld:host.mounted.toWorld,supportsMineFoot:()=>true,supportAt:road.heightAt};
  const shifted=resolveR30ShaftContract({...options,mineYaw:road.anchor.yaw+.1});
  assert.equal(shifted.kind,'ready');if(shifted.kind==='ready')assert.equal(shifted.deep.kind,'blocked');
  assert.equal(resolveR30ShaftContract({...options,supportAt:()=>undefined}).kind,'unsupported-surface');
 }finally{host.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
