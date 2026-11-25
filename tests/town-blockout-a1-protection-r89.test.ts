import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain';
import { terrainBuildProtection, terrainReliefOffset, craterApproachReliefOffset,
  b1TerrainReliefOffset, b2TerrainReliefOffset } from '../tools/voxel-tavern/town-blockout/terrain-undulations';
import { marketStallLayouts, marketStallLocalPoint } from '../tools/voxel-tavern/town-blockout/market-stall-layout';
import { icePalaceSite } from '../tools/voxel-tavern/town-blockout/ice-palace-site';

const original=createTerrainGrid({ relief:false });
const active=createTerrainGrid();
const market=layout.plots.find(p=>p.id==='market-stalls')!;

test('R89/A-1 regression 1: north market stall 14 counter never inherits 36m relief apron',()=>{
  const stall=marketStallLayouts[14]!;
  assert.equal(stall.id,'market-stall-14');
  const [x,z]=marketStallLocalPoint(stall,0,2.6);
  const east=market.origin[0]+x,north=market.origin[1]-z;
  assert.ok(Math.abs(east-140.4)<1e-9&&Math.abs(north-122.8)<1e-9);
  assert.equal(terrainBuildProtection(east,north),0);
  assert.equal(terrainReliefOffset(east,north),0);
  assert.equal(active.groundHeightAt(east,north),original.groundHeightAt(east,north));
  assert.ok(Math.abs(active.groundHeightAt(east,north)-stall.counterGround)<.000001);
});

test('R89/A-1 regression 2: both existing north-row counter feet share exact zero relief',()=>{
  for(const stall of marketStallLayouts.filter(s=>s.row==='north')){
    const [x,z]=marketStallLocalPoint(stall,0,2.6);
    const east=market.origin[0]+x,north=market.origin[1]-z;
    for(const de of [-1,0,1])for(const dn of [-1,0,1]){
      assert.equal(terrainBuildProtection(east+de,north+dn),0,
        `${stall.id} lost its exact-height footprint buffer`);
      assert.equal(terrainReliefOffset(east+de,north+dn),0);
      assert.equal(active.groundHeightAt(east+de,north+dn),
        original.groundHeightAt(east+de,north+dn));
    }
  }
});

test('R89/A-1 regression 3: all 735 original ice-palace forecourt cells preserve strict 12m datum',()=>{
  const [cx,cn,h]=icePalaceSite.terrain.origin;
  const [w,d]=icePalaceSite.terrain.footprint;
  assert.equal(h,12);
  let total=0;
  for(let east=cx-w/2;east<=cx+w/2;east++)
    for(let north=cn-d/2;north<=53;north++){
      total++;
      assert.equal(terrainBuildProtection(east,north),0,`unprotected E${east}/N${north}`);
      assert.equal(terrainReliefOffset(east,north),0,`relief at E${east}/N${north}`);
      assert.equal(active.groundHeightAt(east,north),12,`front slab E${east}/N${north}`);
      assert.equal(original.groundHeightAt(east,north),12);
    }
  assert.equal(total,735);
});

test('R89/A-1 regression 4: entire canonical 48×52m ice site keeps original dry baseline',()=>{
  const [cx,cn]=icePalaceSite.terrain.origin;
  const [w,d]=icePalaceSite.terrain.footprint;
  for(let east=cx-w/2;east<=cx+w/2;east++)
    for(let north=cn-d/2;north<=cn+d/2;north++){
      assert.equal(active.groundHeightAt(east,north),original.groundHeightAt(east,north));
      assert.equal(terrainBuildProtection(east,north),0);
    }
});

test('R89/A-1 regression 5: the surveyed wildland relief is still present outside exact-height infrastructure',()=>{
  const sights:[[number,number],(e:number,n:number)=>number][]=[
    [[138,175],craterApproachReliefOffset],
    [[560,330],b1TerrainReliefOffset],
    [[610,25],b2TerrainReliefOffset],
  ];
  let nonzero=0;
  for(const [[e,n],fn]of sights){
    const modeled=fn(e,n);
    assert.ok(Math.abs(modeled)<6);
    if(Math.abs(modeled)>.05)nonzero++;
    const actual=active.groundHeightAt(e,n)-original.groundHeightAt(e,n);
    assert.ok(Math.abs(actual-terrainReliefOffset(e,n))<.0001);
  }
  assert.ok(nonzero>=1,'protection must not flatten all relief areas');
});
