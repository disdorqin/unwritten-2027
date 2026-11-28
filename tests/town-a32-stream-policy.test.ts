import assert from 'node:assert/strict';
import {test} from 'node:test';
import {a32SummitPrefetch,createA32StageMeter,createA32QuietGate} from '../tools/voxel-tavern/town-blockout/town-a32-stream-policy';
test('rear prefetch stays cold at the plaza and crater, starts at the station or predicted approach',()=>{
 assert.equal(a32SummitPrefetch({east:223,north:180,height:12}),false);
 assert.equal(a32SummitPrefetch({east:-40,north:159,height:10.78}),false);
 assert.equal(a32SummitPrefetch({east:526,north:305,height:26}),true);
 assert.equal(a32SummitPrefetch({east:420,north:220,height:18},{east:0,north:10}),true);
 assert.equal(a32SummitPrefetch({east:420,north:220,height:18},{east:0,north:-10}),false);
});
test('waits for a quiet movement interval and cancels without opening the gate',async()=>{
 let t=0;const g=createA32QuietGate(()=>t);
 g.observe({east:1,north:1,height:1});g.observe({east:2,north:1,height:1});
 assert.equal(g.ready(),false);let frames=0;
 await g.wait(async()=>{t+=50;frames++;if(frames===3)g.observe({east:3,north:1,height:1});},()=>false);
 assert.equal(frames,8);assert.equal(g.ready(),true);
 await assert.rejects(g.wait(async()=>{},()=>true));
});
test('records successful and refused stage elapsed time without suppressing exceptions',async()=>{
 let t=0;const m=createA32StageMeter(()=>t);
 assert.equal(await m.run('terrain',()=>{t+=17;return 4}),4);
 await assert.rejects(m.run('cable',()=>{t+=31;throw Error('refused')}));
 assert.deepEqual(m.records(),[{stage:'terrain',ms:17,at:0},{stage:'cable',ms:31,at:17}]);
});
