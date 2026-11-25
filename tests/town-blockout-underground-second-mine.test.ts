import assert from 'node:assert/strict';
import test from 'node:test';
import {createSecondMineScene} from '../tools/voxel-tavern/town-blockout/underground-second-mine.js';
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
      assert.equal(mine.boat.visible,state==='middle');
      assert.equal(mine.canStand(0,137),state==='low');
      assert.equal(mine.water.visible,state!=='low');
    }
  }finally{mine.dispose()}
});
