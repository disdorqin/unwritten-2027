import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  readOrbitalDualKeyStatus,resolveOrbitalAnchorVisit,
  type OrbitalAnchorHost,
} from '../../src/presence/orbital-anchor-registry';

test('D6 renamed input counts 12 unique recovered WEIYANG SHIP LOG pages, not zodiac stones',()=>{
  const partial=readOrbitalDualKeyStatus([1,2,2,3,0,13,-2,4,Infinity,NaN],false);
  assert.deepEqual(partial,{
    collectedPages:4,fragmentsComplete:false,flyerAssembled:false,
  });
  const logs=[...Array.from({length:12},(_,i)=>i+1),7,12,0,23,1.2];
  const all=readOrbitalDualKeyStatus(logs,true);
  assert.deepEqual(all,{
    collectedPages:12,fragmentsComplete:true,flyerAssembled:true,
  });
  // Log recovered + assembled is a READ-ONLY progress observation, not
  // a server authorization to enter the sky-city realm.
  assert.equal('isGateOpen' in all,false);
  assert.equal('roomReady' in all,false);
});

test('D6 sky-city anchor accepts only real supported PHYSICAL movement, no fake teleport visit',()=>{
  const host:OrbitalAnchorHost={
    starport:{domain:'summit',containsSupportedFootpoint(p){
      return p.east===324&&p.north===657&&p.height===347&&p.yaw===0;
    }},
  };
  const pose={east:324,north:657,height:347,yaw:0};
  const accepted={
    domain:'summit',pose,route:'physical' as const,
  };
  assert.deepEqual(resolveOrbitalAnchorVisit('starport',accepted,[],host),{
    ok:true,visited:['starport'],added:true,
  });
  assert.deepEqual(resolveOrbitalAnchorVisit('starport',accepted,['starport'],host),{
    ok:true,visited:['starport'],added:false,
  });
  assert.deepEqual(resolveOrbitalAnchorVisit('starport',{...accepted,route:'restore'},[],host),{
    ok:false,reason:'not-physical',
  });
  assert.deepEqual(resolveOrbitalAnchorVisit('starport',{
    ...accepted,pose:{...pose,east:325},
  },[],host),{ok:false,reason:'wrong-position'});
  assert.deepEqual(resolveOrbitalAnchorVisit('plaza',accepted,[],host),{ok:false,reason:'missing-anchor'});
});
