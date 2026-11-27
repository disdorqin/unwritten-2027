import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mesh} from 'three';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {buildNightBWestReliefPreview,nightBWestHeightDelta,nightBWestBounds,nightBWestPeak,composeNightBWestHeight,westCableDistance} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
test('west massif preserves ownership, boundary and canonical peak and cable corridor',()=>{
 const base=(e:number,n:number)=>sampleTownD2R30Height(e,n),height=composeNightBWestHeight(base);
 assert.equal(nightBWestBounds.area,1048000);
 assert.equal(height(nightBWestPeak.east,nightBWestPeak.north),560);
 for(let n=480;n<=1790;n+=5){assert.equal(nightBWestHeightDelta(-1100,n,base),0);assert.equal(nightBWestHeightDelta(-300,n,base),0);}
 for(let e=-1100;e<=-300;e+=5){assert.equal(nightBWestHeightDelta(e,480,base),0);assert.equal(nightBWestHeightDelta(e,1790,base),0);}
 assert.equal(nightBWestHeightDelta(-750,600,base,()=>true),0);
 let cut=0,fill=0,protectedCount=0;
 for(let n=482;n<1790;n+=8)for(let e=-1100;e< -300;e+=8){const d=nightBWestHeightDelta(e,n,base);cut=Math.max(cut,-d);fill=Math.max(fill,d);if(westCableDistance(e,n)<=18){assert.equal(d,0);protectedCount++;}}
 assert.ok(cut>10&&cut<30);assert.ok(fill>4&&fill<20);assert.ok(protectedCount>50);
 const model=buildNightBWestReliefPreview(base);
 try{assert.ok(model.stats.triangles>32000&&model.stats.chunks===24);for(const m of model.group.children as Mesh[]){const p=m.geometry.getAttribute('position');for(let i=0;i<p.count;i++){assert.ok(Math.abs(p.getY(i)-height(p.getX(i),-p.getZ(i))!)<.001);}}console.log('west relief',JSON.stringify(model.stats));}finally{model.dispose();}
});
