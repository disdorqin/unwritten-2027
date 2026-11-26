import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Raycaster,Vector3,CatmullRomCurve3,type Mesh} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {craterBranchControlLine,buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {northFootwayPoints,northFootwayPosts,northFootwayWeight} from '../tools/voxel-tavern/town-blockout/town-a-r30-north-connector';
import {supportFootprintOverlaps,type OrientedSupportBox} from '../tools/voxel-tavern/town-blockout/town-a-r30-oriented-support';

test('A-R04 north railway support is a real bounded surface across the former N336 gap',()=>{
  const terrain=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>terrain.groundHeightAt(0,n));
  road.group.updateMatrixWorld(true);
  const group=road.group.getObjectByName('meteor-crater-west-north-connector');
  assert.ok(group);
  const tiles=group.children as Mesh[];
  assert.equal(tiles.length,4);
  assert.equal(tiles.reduce((s,m)=>s+m.geometry.index!.count/3,0),26624);
  const curve=new CatmullRomCurve3(craterBranchControlLine.map(([e,n])=>new Vector3(e,0,-n)),false,'centripetal');
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  let points=0;
  for(const p of curve.getSpacedPoints(1500)){
    const e=p.x,n=-p.z;
    if(e>=-1.5||n<338)continue;
    for(const dx of [-1.4,0,1.4]){
      assert.ok(road.terrainReadyAt(e+dx,n));
      ray.ray.origin.set(e+dx,100,-n);
      const hit=ray.intersectObjects(tiles,false)[0];
      assert.ok(hit,JSON.stringify({e,n,dx}));
      assert.ok(Math.abs(hit.point.y-road.heightAt(e+dx,n)!)<.0001);
      points++;
    }
  }
  assert.ok(points>600);
  assert.equal(road.terrainReadyAt(-65,400),false);
  assert.equal(road.terrainReadyAt(-20,545),false);
  for(let n=336;n<=544;n++)assert.ok(Math.abs(road.heightAt(0,n)!-terrain.groundHeightAt(0,n))<.0001);
  // Shared N336 row must match both height and RGB, including the new path.
  const edgeColors=(ms:Mesh[])=>{
    const result=new Map<number,number[]>();
    for(const mesh of ms){
      const p=mesh.geometry.getAttribute('position'),c=mesh.geometry.getAttribute('color');
      for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)+336)<1e-5&&p.getX(i)>=-64&&p.getX(i)<=0)
        result.set(p.getX(i),[c.getX(i),c.getY(i),c.getZ(i)]);
    }
    return result;
  };
  const south=edgeColors(road.group.children.filter(x=>x.name==='meteor-crater-west-ground') as Mesh[]);
  const north=edgeColors(tiles);
  assert.equal(north.size,65);
  for(const [e,c]of north)assert.deepEqual(c,south.get(e),String(e));
  assert.ok(northFootwayWeight(-12,380)>.99);
  assert.equal(northFootwayWeight(0,490),0);
  const rail=buildCraterRailExtension(terrain,road);
  const boxes=[...road.group.userData.colliders,...rail.group.userData.colliders,...rail.group.userData.floors] as OrientedSupportBox[];
  for(let j=1;j<northFootwayPoints.length;j++){
    const a=northFootwayPoints[j-1]!,b=northFootwayPoints[j]!;
    const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25);
    for(let k=0;k<=count;k++){
      const t=k/count,e=a[0]+(b[0]-a[0])*t,n=a[1]+(b[1]-a[1])*t,y=road.heightAt(e,n)!;
      assert.ok(road.terrainReadyAt(e,n));
      assert.ok(!boxes.some(q=>q.max[1]>y+.43&&q.min[1]<y+1.775&&supportFootprintOverlaps(e,n,q,.6)),JSON.stringify({e,n,y}));
      assert.ok(rail.samples.every(p=>Math.hypot(p.east-e,p.north-n)>3.2),JSON.stringify({e,n}));
    }
  }
  for(const p of northFootwayPosts){
    const y=road.heightAt(p.east,p.north)!;
    assert.ok(boxes.some(b=>b.min[1]<=y&&b.max[1]>y&&supportFootprintOverlaps(p.east,p.north,b,.01)));
  }
});
