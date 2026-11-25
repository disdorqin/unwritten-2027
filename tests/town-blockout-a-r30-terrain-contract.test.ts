import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Raycaster,Vector3,type Mesh} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createTerrainSupportContract} from '../tools/voxel-tavern/town-blockout/town-a-r30-terrain-contract';

const grid=createTerrainGrid();
const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
road.group.updateMatrixWorld(true);
const carriers=road.group.children.filter(o=>o.name==='meteor-crater-west-ground') as Mesh[];
const bowl=road.group.getObjectByName('meteor-crater-walk-mesh') as Mesh;
test('A-R01 joins B apron to A lattice without hole, overlapping ground or height discrepancy',()=>{
  assert.equal(carriers.length,9);
  const {inner,outer,apronRadius}=road.terrainBoundary;
  assert.equal(apronRadius,59);
  assert.ok(inner.length>=450&&outer.length===512);
  for(const p of [...inner,...outer]){
    assert.ok(Math.abs(p.height-road.anchor.rimHeight)<.001);
  }
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  for(let angle=1;angle<360;angle+=7){
    const t=angle*Math.PI/180;
    for(const radius of [58.8,59.1,59.7,60.3,61.5,63,64.5,70,80]){
      const e=road.anchor.east+radius*Math.sin(t),n=road.anchor.north+radius*Math.cos(t);
      ray.ray.origin.set(e,100,-n);
      const hits=ray.intersectObjects([...carriers,bowl],false);
      assert.ok(hits.length,JSON.stringify({e,n,radius}));
      assert.ok(!(hits.some(h=>h.object===bowl)&&hits.some(h=>h.object!==bowl)),JSON.stringify({e,n,radius}));
      assert.ok(Math.abs(hits[0]!.point.y-road.heightAt(e,n)!)<.0001);
    }
  }
  // Exact, measured geometry reduction rather than a relaxed triangle budget.
  assert.equal(carriers.reduce((sum,m)=>sum+m.geometry.index!.count/3,0),129524);
});
test('A-R01 samples unchanged H0 at the real E0 seam and publishes bounded ready support',()=>{
  const points=Array.from({length:337},(_,n)=>[0,n] as const);
  const edge=grid.boundarySamples(points);
  for(const p of edge)assert.ok(Math.abs(p.height-road.heightAt(p.east,p.north)!)<1e-5);
  assert.equal(road.terrainReadyAt(-10,336),true);
  assert.equal(road.terrainReadyAt(-100,336.1),false);
  assert.equal(road.terrainReadyAt(-10,336.1),true); // A-R04 real north connector
  assert.equal(grid.terrainReadyAt(-1,1),false);
  const support=createTerrainSupportContract({town:grid.heightAt,townReady:grid.terrainReadyAt,
    west:road.heightAt,westReady:road.terrainReadyAt});
  assert.equal(support.sample({east:-1,north:159})?.surfaceId,'west-ground');
  assert.equal(support.sample({east:-100,north:337}),undefined);
  assert.equal(support.sample({east:-1,north:337})?.surfaceId,'west-ground');
  const datum=support.sample({east:2,north:159});
  assert.ok(datum&&datum.ready&&Math.abs(Math.hypot(...datum.normal)-1)<1e-12);
  assert.throws(()=>grid.boundarySamples([[-1,3]]));
});
test('A-R01 routes a finite real support hint to the existing road layer, never Infinity',()=>{
  const hints:(number|undefined)[]=[];
  const s=createTerrainSupportContract({town:()=>8,townReady:()=>true,west:()=>10,westReady:()=>true,
    ridgeRoad:(_e,_n,h)=>{hints.push(h);return h===undefined?undefined:h+0.1}});
  assert.equal(s.heightAt(300,400,21),21.1);
  assert.equal(s.heightAt(300,400,Infinity),8);
  assert.deepEqual(hints,[21,undefined]);
});
