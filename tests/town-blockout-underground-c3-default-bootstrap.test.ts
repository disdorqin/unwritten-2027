import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {Group} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain.js';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';

test('C3 minified default viewer never synchronizes camp before the player foot is initialized',()=>{
  const viewer=readFileSync(new URL('../tools/voxel-tavern/town-blockout/viewer.ts',import.meta.url),'utf8');
  const start=viewer.indexOf('function ensureWestCraterRoad()');
  const end=viewer.indexOf('function dreamRopeHeldNow()',start);
  assert.ok(start>=0&&end>start,'must inspect the real C3 default mount function');
  const initial=viewer.slice(start,end);
  assert.doesNotMatch(initial,/undergroundDomain\.mounted\.sync\(\)/,
    'early camp sync reintroduces minified ReferenceError: TDZ x renamed Rt');
  assert.match(viewer.slice(end),/undergroundDomain\.mounted\.sync\(\)/,
    'camp still needs runtime frame sync after player variables are ready');
});

// C3: reproduce the production viewer.ts startup ordering, where
// ensureWestCraterRoad() may run before the lexical x/n/ground player
// movement bindings exist. The exact TDZ ReferenceError is not a runtime
// underground action failure and must not kill the town startup.
// All unrelated exceptions must still propagate to the diagnostic output.
test('C3 default crater bootstrap defers only the expected player-foot TDZ error',()=>{
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const parent=new Group();
  let reads=0,ready=false;
  let foot:{east:number;north:number;height:number}|undefined;
  const bridge={
    now:()=>10_000,
    readWorldFoot:()=>{
      reads++;
      if(!ready)throw new ReferenceError("Cannot access 'x' before initialization");
      return foot;
    },
    sit:()=>true,stand:()=>true,
    onSeatedChange:()=>undefined,
    isAimingAt:()=>false,
    showPickupNotice:()=>undefined,
    onRested:()=>undefined,
  };
  const host=mountUndergroundDomainHost({parent,road,campBridge:bridge});
  assert.equal(host.kind,'ready','actual B-01 / mine registration must remain ready');
  if(host.kind!=='ready')return;
  assert.doesNotThrow(()=>host.mounted.sync(),
    'early camp polling must not crash the default main-world startup');
  assert.ok(reads>0,'the suite must exercise the boot-time callback, not merely import the module');
  ready=true;
  foot={...host.campFireWorld};
  assert.doesNotThrow(()=>host.mounted.sync(),
    'after viewer initialization real accepted feet must still be readable');
  assert.ok(reads>1);
  host.mounted.dispose();
});

test('C3 bootstrap never conceals a real camp bridge exception unrelated to TDZ',()=>{
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const host=mountUndergroundDomainHost({
    parent:new Group(),road,
    campBridge:{
      now:()=>12_000,
      readWorldFoot:()=>{throw new Error('C3 camp runtime test sentinel');},
      sit:()=>true,stand:()=>true,onSeatedChange:()=>undefined,
      isAimingAt:()=>false,showPickupNotice:()=>undefined,onRested:()=>undefined,
    },
  });
  assert.equal(host.kind,'ready');
  if(host.kind!=='ready')return;
  assert.throws(()=>host.mounted.sync(),/C3 camp runtime test sentinel/);
  host.mounted.dispose();
});
