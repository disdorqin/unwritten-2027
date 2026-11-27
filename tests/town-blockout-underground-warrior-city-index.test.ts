import test from 'node:test';
import assert from 'node:assert/strict';
import {createWarriorCityCandidate} from '../tools/voxel-tavern/town-blockout/underground-warrior-city-candidate.js';
import {createWarriorCityShell,warriorCityShellPieces} from '../tools/voxel-tavern/town-blockout/underground-warrior-city-shell.js';
import {c2R30DeepMouths} from '../tools/voxel-tavern/town-blockout/town-c2-r30-deep-mouths.js';
import {createStaticFootIndex} from '../tools/voxel-tavern/town-blockout/town-c-static-foot-index.js';
test('city retains every physical instance and indexed clearance equals exhaustive boxes',()=>{
 const city=createWarriorCityCandidate(),shell=city.shell;
 try{
  assert.equal(city.instancedPieces,17298);assert.equal(shell.count,7620);
  const boxes=[...city.colliders,...shell.solids.map(p=>({min:[p.e-p.w/2,p.y-p.h/2,-p.n-p.d/2],max:[p.e+p.w/2,p.y+p.h/2,-p.n+p.d/2]}))];
  const index=createStaticFootIndex(boxes);
  let worst=0;
  for(let i=0;i<3500;i++){
   const e=.3+(i*17.177%179.4),n=-29.7+(i*23.311%59.4),y=i%7===0?7.12:0,r=.27;
   const brute=boxes.some(b=>b.max[1]>y+.025&&b.min[1]<y+1.8&&Math.hypot(Math.max(0,b.min[0]-e,e-b.max[0]),Math.max(0,b.min[2]+n,-n-b.max[2]))<r);
   assert.equal(index.blocks(e,n,y,r),brute,'point '+i);
   assert.equal(city.canStand(e,n,y,r),!brute,'city '+i);
   worst=Math.max(worst,index.candidates(e,n,r).size);
  }
  assert.ok(worst<boxes.length*.12,'index did not narrow broad phase');
  for(let e=1;e<179;e+=.25)assert.ok(city.canStand(e,0));
 }finally{city.dispose()}
});
test('real E0/E180 walls certify only contract mouths and preserve exact collision clearance',()=>{
 const shell=createWarriorCityShell();
 try{
  const mouths=[c2R30DeepMouths['minus140-to-minus165'].to,c2R30DeepMouths['minus165-to-minus190'].from];
  for(const mouth of mouths){
   assert.equal(shell.acceptsMouth(mouth),true);
   const wall=warriorCityShellPieces.filter(p=>p.solid&&p.id.startsWith('end-wall/'+mouth.at+'/'));
   const jambs=wall.filter(p=>p.id.includes('/jamb/')),head=wall.find(p=>p.id.endsWith('/lintel'))!;
   assert.equal(jambs.length,2);assert.ok(head);
   const left=jambs.find(p=>p.n<0)!,right=jambs.find(p=>p.n>0)!;
   assert.ok(Math.abs(left.n-left.d/2+30)<1e-9);
   assert.ok(Math.abs(left.n+left.d/2+1.7)<1e-9);
   assert.ok(Math.abs(right.n-right.d/2-1.7)<1e-9);
   assert.ok(Math.abs(right.n+right.d/2-30)<1e-9);
   assert.ok(Math.abs(right.n-right.d/2-(left.n+left.d/2)-3.4)<1e-9);
   assert.ok(Math.abs(head.y-head.h/2-3.24)<1e-9);
   assert.ok(head.y+head.h/2>=19);
   assert.equal(shell.canStand(mouth.at,0,0,.27),true);
   assert.equal(shell.canStand(mouth.at,1.69,0,.27),false);
   assert.equal(shell.canStand(mouth.at,-1.69,0,.27),false);
   const passage=shell.passageLocal(mouth.at,0,.27,1.8)!;
   assert.equal(passage.floor,0);
   assert.ok(Math.abs(passage.clearance-(head.y-head.h/2))<1e-9);
   assert.ok(passage.clearance>=3.24);
   assert.equal(shell.passageLocal(mouth.at,2),undefined);
   const caveE=mouth.at===0?1:179;
   for(const side of [-1,1]){
    assert.ok(warriorCityShellPieces.some(p=>p.id.startsWith('cave-wall/'+side+'/'+caveE+'/')));
    assert.ok(warriorCityShellPieces.some(p=>p.id.startsWith('roof/'+side+'/'+caveE+'/')));
   }
  }
  for(const mouth of [c2R30DeepMouths['minus140-to-minus165'].from,c2R30DeepMouths['minus165-to-minus190'].to,
   {...mouths[0],at:1},{...mouths[0],centre:.1},{...mouths[0],width:3.41},{...mouths[0],height:3.25},
   {...mouths[1],axis:'north'},{...mouths[1],layer:'minus190'},null,undefined])
   assert.equal(shell.acceptsMouth(mouth),false);
  for(const e of [8,175])assert.ok(warriorCityShellPieces.some(p=>p.solid&&p.id.startsWith('gate/'+e+'/')));
  const street=shell.passageLocal(90,0)!;
  const roofBottom=Math.min(...warriorCityShellPieces.filter(p=>p.solid&&p.id.startsWith('roof/')).map(p=>p.y-p.h/2));
  assert.equal(street.floor,0);
  assert.ok(Math.abs(street.clearance-roofBottom)<1e-9);
  assert.notEqual(street.clearance,19);
 }finally{shell.dispose()}
});
