import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {composeNightBWestHeight} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
import {createTownD2R30Collision} from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';
import {createNightBWestSector} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-sector';
import {createTownD2R30Ropeway} from '../tools/voxel-tavern/town-blockout/town-d2-r30-ropeway';
import {createTownD2R30CableTowers} from '../tools/voxel-tavern/town-blockout/town-d2-r30-cable-towers';
import {mountMainSummitCableWorkshop,mainSummitR30CableWorkshopAnchor} from '../tools/voxel-tavern/town-blockout/main-summit-cable-workshop';
import {auditNightBSummitCable,type SummitSweepProbe} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-line2-service';
test('R30 western compound keeps real machinery out of both rope sweeps and provides station walking access',t=>{
 const g=createTownD2R30Collision({heightAt:composeNightBWestHeight(sampleTownD2R30Height)}),b=createMainSummitBlock(mainSummitLayout,347,100),trail=createMainSummitTrail(b.heightAt,347);
 const w=createNightBWestSector(g.surfaceAt,trail.points),r=createTownD2R30Ropeway({heightAt:g.surfaceAt,controlPointSupports:false}),tower=createTownD2R30CableTowers({heightAt:g.surfaceAt,cable:r.cable});
 const m=mountMainSummitCableWorkshop(new Group(),g.surfaceAt,mainSummitR30CableWorkshopAnchor),old=mountMainSummitCableWorkshop(new Group(),g.surfaceAt);
 t.after(()=>{for(const x of [b,g,w,r,tower,m,old])x.dispose()});
 const hits:Record<string,number>={};
 const body=(p:SummitSweepProbe)=>{
  let found=false;for(let i=0;i<=6;i++)for(let j=0;j<=8;j++){
   const x=(i/3-1)*p.halfWidth,z=(j/4-1)*p.halfLength,e=p.feet.east+x*Math.cos(p.heading)+z*Math.sin(p.heading),n=p.feet.north-x*Math.sin(p.heading)+z*Math.cos(p.heading);
   for(const [key,hit] of [['rope',r.blocked(e,n,p.feet.height,.025,p.bodyTop)],['tower',tower.blocked(e,n,p.feet.height,.025,p.bodyTop)],['west',w.blocked(e,n,p.feet.height,.025,2.48)],['workshop',m.blocked(e,n,p.feet.height,.025,2.48)]] as const)if(hit){hits[key]=(hits[key]??0)+1;found=true;}
  }return found;
 };
 const a=auditNightBSummitCable(r,g.surfaceAt,body);assert.equal(a.groundHits,0);assert.equal(a.obstacleHits,0,JSON.stringify({a,hits}));assert.ok(a.candidateEnvelopeClear);
 // The old anchor is a known real obstruction, not an arbitrary art change.
 const previous=auditNightBSummitCable(r,g.surfaceAt,p=>{if(p.terminalDistance>30)return false;for(let i=0;i<=6;i++)for(let j=0;j<=8;j++){const x=(i/3-1)*p.halfWidth,z=(j/4-1)*p.halfLength;if(old.blocked(p.feet.east+x*Math.cos(p.heading)+z*Math.sin(p.heading),p.feet.north-x*Math.sin(p.heading)+z*Math.cos(p.heading),p.feet.height,.025,2.48))return true;}return false;});
 assert.ok(previous.obstacleHits>0);
 // Grid of actual supported feet, continuous 0.25m four-neighbour moves.
 // No station teleport: use the same workshop, station and terrain colliders.
 const step=.25,ix=(v:number)=>Math.round(v/step),key=(e:number,n:number)=>e+','+n;
 function foot(e:number,n:number){const h=m.surfaceAt(e,n)??r.supportAt(e,n)??g.surfaceAt(e,n);if(h===undefined||Math.abs(h-347)>.15||m.blocked(e,n,h,.27,1.8)||r.blocked(e,n,h,.27)||tower.blocked(e,n,h,.27))return;return h;}
 const start=[ix(m.anchor.east),ix(m.anchor.north)] as const,queue=[start],seen=new Set([key(...start)]);
 assert.ok(foot(start[0]*step,start[1]*step)!>346);
 for(let i=0;i<queue.length;i++){const [e,n]=queue[i]!;for(const [de,dn] of [[1,0],[-1,0],[0,1],[0,-1]] as const){const u=e+de,v=n+dn,k=key(u,v);if(seen.has(k)||u*step< -32||u*step>8||v*step< -4||v*step>32)continue;if(foot(u*step,v*step)===undefined||foot((u+e)*step/2,(v+n)*step/2)===undefined)continue;seen.add(k);queue.push([u,v]);}}
 for(const rope of r.cable.ropes){const p=rope.dock('cloud-deck').approach;assert.ok(seen.has(key(ix(p.east),ix(p.north))),JSON.stringify(p));}
 for(const p of Object.values(m.repairAnchors))assert.ok(seen.has(key(ix(p.east),ix(p.north))),JSON.stringify(p));
 console.log(JSON.stringify({oldObstacleHits:previous.obstacleHits,new:a,walkNodes:seen.size,anchor:m.anchor}));
});
