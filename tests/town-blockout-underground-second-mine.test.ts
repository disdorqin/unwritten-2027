import assert from 'node:assert/strict';
import test from 'node:test';
import {createSecondMineScene,type LiftApertureRect,type SecondMineLiftAperturePort} from '../tools/voxel-tavern/town-blockout/underground-second-mine.js';
import {c2PumpHouseFixtureSceneSite} from '../tools/voxel-tavern/town-blockout/town-c2-r30-pump-house-adapter.js';
import type {PumpHouseSnapshot} from '../src/presence/underground-pump-house.js';
import {c2R30DeepMouths} from '../tools/voxel-tavern/town-blockout/town-c2-r30-deep-mouths.js';
// Explicit local fixture only; this does not assert that C's production adapter is integrated.
const liftSite={lower:{minE:-1.1,maxE:1.1,minN:.9,maxN:3.1},height:0,ceiling:5} as const;
function splitFixture(rect:LiftApertureRect,hole:LiftApertureRect):LiftApertureRect[]{
  return [
    {minE:rect.minE,maxE:hole.minE,minN:rect.minN,maxN:rect.maxN},
    {minE:hole.maxE,maxE:rect.maxE,minN:rect.minN,maxN:rect.maxN},
    {minE:hole.minE,maxE:hole.maxE,minN:rect.minN,maxN:hole.minN},
    {minE:hole.minE,maxE:hole.maxE,minN:hole.maxN,maxN:rect.maxN}
  ];
}
const rectArea=(r:LiftApertureRect)=>(r.maxE-r.minE)*(r.maxN-r.minN);
test('all three water states preserve continuous dry entry-to-exit route; ferry only at middle water',()=>{
  const mine=createSecondMineScene();
  try{
    for(const state of ['high','middle','low'] as const){
      mine.setRiverState(state);
      const points=[mine.anchors.entry,...mine.anchors.bypass,mine.anchors.exit];
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],count=Math.ceil(Math.hypot(b.east-a.east,b.north-a.north)/.18);
        for(let j=0;j<=count;j++){const t=j/count,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t;
          assert.ok(mine.canStand(e,n),state+' blocked '+e.toFixed(2)+','+n.toFixed(2));}
      }
      assert.equal(mine.ferry?.stats().available,state==='middle');
      assert.equal(mine.boat.visible,true);
      assert.equal(mine.canStand(0,137),state==='low');
      assert.equal(mine.water.visible,state!=='low');
      assert.equal(mine.waterworks?.stats.waterPresentationState,state);
    }
  }finally{mine.dispose()}
});
test('missing lift port preserves the single closed entry roof and standing route',()=>{
  const mine=createSecondMineScene();
  try{
    assert.ok(mine.r30Enclosure,'R30 enclosure is the default production structure');
    assert.equal(mine.group.getObjectByName('town-c2-r30-enclosure')?.parent,mine.group);
    assert.ok(mine.waterworks);
    assert.ok(mine.ferry);
    assert.equal(mine.group.getObjectByName('town-c2-r30-waterworks-trace')?.parent,mine.group);
    assert.equal(mine.group.getObjectByName('town-c2-r30-ferry')?.parent,mine.group);
    assert.equal(mine.liftPlate,null);
    assert.equal(mine.liftRoofPieces.length,1);
    assert.equal(rectArea(mine.liftRoofPieces[0]),288);
    assert.equal(mine.liftOpen,false);
    assert.equal(mine.canStand(0,2,.27),true);
    assert.equal(mine.syncLiftAperture(),false);
    assert.equal(mine.canStand(0,2,.27),true);
  }finally{mine.dispose()}
});
test('fixture split closes the 2.2m aperture with four roof pieces plus a visible metal plate',()=>{
  let open=false,splitCalls=0,readFails=false;
  const mine=createSecondMineScene({liftAperture:{site:liftSite,split(rect,hole){splitCalls++;return splitFixture(rect,hole);},readOpen(){if(readFails)throw new Error('fixture state failure');return open;}}});
  try{
    assert.equal(splitCalls,1);
    assert.equal(mine.liftRoofPieces.length,4);
    assert.ok(mine.r30Enclosure);
    const roofHits=mine.r30Enclosure.boxes.filter(p=>p.role==='ceiling'&&p.n+p.d/2>liftSite.lower.minN&&p.n-p.d/2<liftSite.lower.maxN&&p.x+p.w/2>liftSite.lower.minE&&p.x-p.w/2<liftSite.lower.maxE);
    assert.equal(roofHits.length,0,'R30 roof must contain the real lift opening');
    assert.ok(mine.liftPlate);
    const plate=mine.liftPlate,roofArea=mine.liftRoofPieces.reduce((sum,r)=>sum+rectArea(r),0),plateArea=plate.scale.x*plate.scale.z;
    assert.ok(Math.abs(roofArea-(288-4.84))<1e-9);
    assert.ok(Math.abs(roofArea+plateArea-288)<1e-9);
    assert.equal(plate.name,'second-mine-lift-closure');
    assert.equal(plate.visible,true);
    assert.equal(plate.position.x,0);assert.equal(plate.position.z,-2);
    assert.equal(mine.canStand(0,2,.27),true);
    assert.equal(mine.passageLocal(0,2)!.clearance,5,'closed lift plate must report real roof headroom');
    const pieces=mine.pieces;
    for(let i=0;i<3;i++)assert.equal(mine.syncLiftAperture(),false);
    assert.equal(splitCalls,1);assert.equal(mine.pieces,pieces);assert.equal(plate.visible,true);
    readFails=true;assert.equal(mine.syncLiftAperture(),false);assert.equal(plate.visible,true);assert.equal(mine.canStand(0,2,.27),true);
  }finally{mine.dispose()}
});
test('open fixture hides the plate and rejects only the aperture footprint with player radius',()=>{
  let open=true,splitCalls=0;
  const mine=createSecondMineScene({liftAperture:{site:liftSite,split(rect,hole){splitCalls++;return splitFixture(rect,hole);},readOpen(){return open;}}});
  try{
    assert.equal(mine.liftOpen,true);assert.ok(mine.liftPlate);assert.equal(mine.liftPlate.visible,false);
    assert.equal(mine.canStand(0,2,.27),false);
    assert.equal(mine.canStand(-1.2,2,.27),false);
    assert.equal(mine.canStand(3,2,.27),true);
    assert.equal(mine.canStand(0,10,.27),true);
    assert.equal(mine.canStand(0,30,.27),true);
    assert.equal(mine.syncLiftAperture(),true);assert.equal(splitCalls,1);
    open=false;assert.equal(mine.syncLiftAperture(),false);assert.equal(mine.liftPlate.visible,true);assert.equal(mine.canStand(0,2,.27),true);
  }finally{mine.dispose()}
});
test('invalid fixture splits and out-of-entry holes fail closed without throwing',()=>{
  const cases:[string,SecondMineLiftAperturePort][]=[
    ['missing split',{site:liftSite,readOpen:()=>true} as unknown as SecondMineLiftAperturePort],
    ['NaN split',{site:liftSite,split:()=>[{minE:NaN,maxE:1,minN:0,maxN:1}],readOpen:()=>true}],
    ['throwing split',{site:liftSite,split:()=>{throw new Error('fixture split failure');},readOpen:()=>true}],
    ['partial hole',{site:{...liftSite,lower:{...liftSite.lower,minN:-.1}},split:splitFixture,readOpen:()=>true}]
  ];
  for(const [name,port] of cases){
    const mine=createSecondMineScene({liftAperture:port});
    try{
      assert.equal(mine.liftRoofPieces.length,1,name);
      assert.equal(rectArea(mine.liftRoofPieces[0]),288,name);
      assert.equal(mine.liftPlate,null,name);
      assert.equal(mine.syncLiftAperture(),false,name);
      assert.equal(mine.liftOpen,false,name);
      assert.equal(mine.canStand(0,2,.27),true,name);
    }finally{mine.dispose()}
  }
});
test('R30 waterworks and ferry can be disabled without changing the legacy scene contract',()=>{
 const mine=createSecondMineScene({r30Waterworks:false,r30Ferry:false});
 try{
    assert.equal(mine.waterworks,undefined);
    assert.equal(mine.ferry,undefined);
    assert.equal(mine.boat.visible,true);
    mine.setRiverState('high');assert.equal(mine.boat.visible,false);
    mine.setRiverState('low');assert.equal(mine.boat.visible,false);
  }finally{mine.dispose()}
});
test('certified pump house joins mine collision while missing authorization stays closed',()=>{
 const snapshot:PumpHouseSnapshot={revision:1,lastAtMs:100,water:.2,pumpedMs:0,stage:'running',repairHits:0,repairedJams:0,journalReaders:[]};
 let accepted=true;
 const mine=createSecondMineScene({pumpHouse:{readAcceptedWater:()=>accepted?{nightOrdinal:1,phase:'level',baseLevel:'mid',pumpOffset:0,level:'mid'}:undefined,
   host:{supportsSite:site=>site.domainId===c2PumpHouseFixtureSceneSite.domainId,
     supportsActionFoot:()=>true,readPumpSnapshot:()=>snapshot,readPassageOpen:()=>false,readFerryRunning:()=>false,
     readLightBudget:()=>1,readViewer:()=>undefined,canSee:()=>true,dispatch:()=>{}}}});
 try{
    assert.ok(mine.pumpHouse);
    assert.equal(mine.pumpHouse.stats().mountKind,'ready');
    assert.ok(mine.pumpHouse.colliders.length>0);
    const pumpSolid=mine.pumpHouse.colliders[0];
    assert.equal(mine.canStand((pumpSolid.min[0]+pumpSolid.max[0])/2,-(pumpSolid.min[2]+pumpSolid.max[2])/2),false);
    assert.ok(mine.group.getObjectByName('u17-old-mine-pump-house'));
    assert.equal(mine.pumpHouse.stats().runtimeAuthorized,true);
    assert.equal(mine.pumpHouse.stats().passageOpen,false);
    accepted=false;mine.setRiverState('middle');
    assert.equal(mine.pumpHouse.stats().runtimeAuthorized,false);
    assert.equal(mine.pumpHouse.stats().waterConfigured,false);
  }finally{mine.dispose()}
});
test('legacy r30Enclosure=false retains the original base shell and exact N198 mouth',()=>{
  const mine=createSecondMineScene({r30Enclosure:false});
  try{
    assert.equal(mine.r30Enclosure,undefined);
    assert.equal(mine.group.getObjectByName('town-c2-r30-enclosure'),undefined);
    assert.ok(mine.solids.some(s=>s.n===198&&s.w>3));
  }finally{mine.dispose()}
});
test('N198 exit has the exact C-R04 mouth, real body-height collision and no domain extension',()=>{
  const mine=createSecondMineScene();
  try{
    assert.ok(mine.r30Enclosure);
    assert.ok(mine.solids.every(s=>[s.x,s.n,s.y,s.w,s.d,s.h].every(Number.isFinite)));
    const lintelCourses=mine.r30Enclosure.boxes.filter(p=>p.id.startsWith('exit-mouth-lintel/')&&Math.abs(p.x-.72)<1e-9);
    assert.ok(lintelCourses.length>0);
    assert.ok(Math.abs(Math.min(...lintelCourses.map(p=>p.y-p.h/2))-3.24)<1e-9);
    assert.ok(Math.max(...lintelCourses.map(p=>p.y+p.h/2))>=5-1e-9);
    assert.equal(mine.canStand(0,197.5),true);
    assert.equal(mine.canStand(2,197.5),false);assert.equal(mine.canStand(-2,197.5),false);
    assert.equal(mine.canStand(0,197.5,.27,3.3),false,'lintel must block only a body that reaches it');
    const passage=mine.passageLocal(0,197.5);assert.ok(passage);assert.equal(passage.floor,0);assert.ok(passage.clearance>=1.7);
    assert.equal(mine.passageLocal(0,198.2),undefined,'the mouth does not enlarge secondMineFloor');
    const mouth=c2R30DeepMouths['minus140-to-minus165'].from;
    assert.equal(mine.acceptsMouth(mouth),true);assert.equal(mine.acceptsMouth({...mouth}),true);
    assert.equal(mine.acceptsMouth({...mouth,width:3.6}),false);assert.equal(mine.acceptsMouth({...mouth,height:3.2}),false);
    assert.equal(mine.acceptsMouth({...mouth,layer:'minus165'}),false);assert.equal(mine.acceptsMouth({...mouth,axis:'east'}),false);
    assert.equal(mine.acceptsMouth(c2R30DeepMouths['minus165-to-minus190'].from),false);
    assert.equal(mine.acceptsMouth({...mouth,at:197.5}),false);assert.equal(mine.acceptsMouth(undefined),false);
  }finally{mine.dispose()}
  assert.equal(mine.acceptsMouth(c2R30DeepMouths['minus140-to-minus165'].from),false,'disposed scenes fail closed');
});
