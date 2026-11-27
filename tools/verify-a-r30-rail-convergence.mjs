import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createTerrainGrid,worldBounds,isWater,waterHeight} from './voxel-tavern/town-blockout/terrain.ts';
import {mountWestCraterRoad} from './voxel-tavern/town-blockout/town-za22-crater-road.ts';
import {buildTownRailRoute} from './voxel-tavern/town-blockout/town-railway.ts';
import {buildCraterRailExtension} from './voxel-tavern/town-blockout/town-crater-rail-extension.ts';
import {surveyRailGrade,capRepairedRailProfile} from './voxel-tavern/town-blockout/town-a-r30-rail-strip.ts';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points);
const limit=.12,minClearance=.5,oldMaximum=2.6;
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const active=rail.verticalSurvey.violations.filter(v=>v.index>=rail.closedHead.index);
const intervals=[[rail.valleyRepair.first,rail.valleyRepair.last],[rail.northRampEnvelope.last,rail.eastValleyRepair.first],[rail.closedHead.index,rail.samples.length-1]];
const infeasible=intervals.map(([first,last])=>{
 const s=rail.samples.slice(first,last+1),q=surveyRailGrade(s,limit,minClearance);
 // This is a necessary lower bound even WITHOUT fixing either station or
 // turnout endpoint. A witness is enough to rule out the old upper limit.
 const i=q.minimum.reduce((best,y,j)=>y-s[j].ground>q.minimum[best]-s[best].ground?j:best,0);
 const cap=capRepairedRailProfile(rail.samples,first,last,oldMaximum,minClearance,limit);
 return {first,last,minimumPossibleMaximumClearance:q.maximumFill,oldMaximum,excess:q.maximumFill-oldMaximum,feasibleUnderOldMaximum:q.maximumFill<=oldMaximum,witness:{index:first+i,east:s[i].east,north:s[i].north,ground:s[i].ground,requiredY:q.minimum[i]},capBlocked:cap.blocked,remainingOverslope:q.violations.length};
});
const cap=rail.eastValleyEnvelope,ramp=rail.northRampEnvelope;
assert.ok(cap&&!cap.blocked&&cap.maxClearance<=oldMaximum&&cap.minClearance>=1.1&&cap.maxGrade<=limit);
assert.ok(ramp&&!ramp.blocked&&ramp.maxGrade<=limit);
assert.ok(infeasible.every(x=>!x.feasibleUnderOldMaximum));
assert.equal(rail.serviceGeometryReady,false);
// The west low valley is a real river crossing. The lower flange
// elevation is the same -1.02 used by the existing bridge mesh strips.
let wetSamples=0,minimumFlangeFreeboard=Infinity,minimumLegacyCapFreeboard=Infinity,witness;
for(const span of rail.valleyBridgeSpans){
 const a=rail.samples[span.index],b=rail.samples[span.index+1],count=Math.max(1,Math.ceil(span.length/.08));
 for(let i=0;i<=count;i++){
  const t=i/count,east=a.east+(b.east-a.east)*t,north=a.north+(b.north-a.north)*t,y=a.y+(b.y-a.y)*t;
  if(!isWater(east,north))continue;
  wetSamples++;const freeboard=y-1.02-waterHeight;
  if(freeboard<minimumFlangeFreeboard){minimumFlangeFreeboard=freeboard;witness={east,north,y,bed:grid.groundHeightAt(east,north)};}
  const bed=a.ground+(b.ground-a.ground)*t;
  minimumLegacyCapFreeboard=Math.min(minimumLegacyCapFreeboard,bed+oldMaximum-1.02-waterHeight);
 }
}
assert.ok(wetSamples>0&&minimumFlangeFreeboard>0&&minimumLegacyCapFreeboard<0);
const riverCrossing={wetSamples,waterHeight,minimumFlangeFreeboard,minimumLegacyCapFreeboard,witness,scope:'sampled centerline lower girder strip only; not hydrodynamics or structural certification'};
const report={source,riverCrossing,scope:'actual A line profile; necessary mathematical lower bound, no new ground or service approval',limit,minClearance,oldMaximum,fullViolations:rail.verticalSurvey.violations.length,removedViolations:rail.verticalSurvey.violations.length-active.length,activeViolations:active.length,closedHead:rail.closedHead,east:{changed:cap.changed.length,minClearance:cap.minClearance,maxClearance:cap.maxClearance,maxGrade:cap.maxGrade},north:{changed:ramp.changed.length,minClearance:ramp.minClearance,maxClearance:ramp.maxClearance,maxGrade:ramp.maxGrade},infeasible,serviceGeometryReady:rail.serviceGeometryReady,decision:'Either approve structural bridge/earthworks where needed or approve surveyed rerouting; unchanged terrain, grade, and clearance cannot all hold.'};
if(process.argv[2]){const p=resolve(process.argv[2]);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
