import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,Color} from 'three';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {buildNightBWestReliefPreview,nightBWestHeightDelta,nightBWestBounds,nightBWestPeak,composeNightBWestHeight,westCableDistance,tintNightBWestSurface,nightBWestReserveWeight} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
test('west massif preserves ownership, boundary and canonical peak and cable corridor',()=>{
 const base=(e:number,n:number)=>sampleTownD2R30Height(e,n),height=composeNightBWestHeight(base);
 assert.equal(nightBWestBounds.area,1048000);
 const color=new Color('#bba188');
 for(const [e,n] of [[-1100,900],[-300,900],[-800,480],[-800,1790],[-200,900]] as const)assert.ok(tintNightBWestSurface(e,n,450,.3,color.clone()).equals(color));
 const a=tintNightBWestSurface(-800,900,450,.3,color.clone()),b=tintNightBWestSurface(-800,900,451,.3,color.clone());
 assert.ok(!a.equals(color));assert.ok(Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b)<.02);
 assert.equal(height(nightBWestPeak.east,nightBWestPeak.north),560);
 for(let n=480;n<=1790;n+=5){assert.equal(nightBWestHeightDelta(-1100,n,base),0);assert.equal(nightBWestHeightDelta(-300,n,base),0);}
 for(let e=-1100;e<=-300;e+=5){assert.equal(nightBWestHeightDelta(e,480,base),0);assert.equal(nightBWestHeightDelta(e,1790,base),0);}
 assert.equal(nightBWestHeightDelta(-750,600,base,()=>true),0);
 const reserve=(e:number,n:number,r:number)=>Math.hypot(e+800,n-900)<=r+6;
 let previous=0;
 for(let d=0;d<=60;d+=.1){
  const w=nightBWestReserveWeight(-800+d,900,reserve);
  assert.ok(w>=previous-1e-8&&w-previous<.006);previous=w;
  if(d<=18)assert.equal(w,0);
  if(d>50)assert.equal(w,1);
 }
 assert.ok(Math.abs(nightBWestReserveWeight(-766,900,reserve)-.5)<.001);
 let samples=0;const once=composeNightBWestHeight((e,n)=>{samples++;return base(e,n)},reserve);
 assert.equal(once(-800,900),base(-800,900));assert.equal(samples,1);
 let cut=0,fill=0,protectedCount=0;
 for(let n=482;n<1790;n+=8)for(let e=-1100;e< -300;e+=8){const d=nightBWestHeightDelta(e,n,base);cut=Math.max(cut,-d);fill=Math.max(fill,d);if(westCableDistance(e,n)<=18){assert.equal(d,0);protectedCount++;}}
 assert.ok(cut>10&&cut<30);assert.ok(fill>4&&fill<20);assert.ok(protectedCount>50);
 const model=buildNightBWestReliefPreview(base);
 try{assert.ok(model.stats.triangles>32000&&model.stats.chunks===24);for(const m of model.group.children as Mesh[]){const p=m.geometry.getAttribute('position');for(let i=0;i<p.count;i++){assert.ok(Math.abs(p.getY(i)-height(p.getX(i),-p.getZ(i))!)<.001);}}console.log('west relief',JSON.stringify(model.stats));}finally{model.dispose();}
});
