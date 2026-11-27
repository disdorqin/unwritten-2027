import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Raycaster,Vector3} from 'three';
import {buildRailStrip,railSections,surveyRailGrade,repairBoundedRailGrade} from '../tools/voxel-tavern/town-blockout/town-a-r30-rail-strip';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
import {supportFootprintOverlaps,type OrientedSupportBox} from '../tools/voxel-tavern/town-blockout/town-a-r30-oriented-support';

test('rail strip shares exact curve sections and has only two terminal caps',()=>{
  const s=railSections([{east:0,north:0,y:1,ground:0},{east:0,north:3,y:1.2,ground:0},{east:2,north:6,y:1.4,ground:0}]);
  const geo=buildRailStrip(s,.83,.15,-.17,.01);
  const p=geo.getAttribute('position'),edges=new Map<string,number>();
  assert.equal(p.count/3,8*(s.length-1)+4);
  const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].join(',');
  for(let i=0;i<p.count;i+=3)for(const [u,v] of [[0,1],[1,2],[2,0]]){
    const a=key(i+u),b=key(i+v),k=[a,b].sort().join('|');
    assert.notEqual(a,b);
    edges.set(k,(edges.get(k)??0)+1);
  }
  assert.ok([...edges.values()].every(n=>n===2),'watertight shared strip');
  geo.dispose();
});
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points);

test('narrow gauge is a single separate line outside the B apron and clear of real industrial blockers',()=>{
  const boxes=road.group.userData.colliders as OrientedSupportBox[];
  const s=rail.narrowSamples;
  const sections=railSections(s);
  for(const q of sections)for(const side of [-1,1]){
    assert.ok(Math.hypot(q.east+side*q.me-road.anchor.east,q.north+side*q.mn-road.anchor.north)>59.5);
  }
  for(let i=1;i<s.length;i++){
    const a=s[i-1]!,b=s[i]!,run=Math.hypot(b.east-a.east,b.north-a.north),steps=Math.ceil(run/.20);
    for(let j=0;j<=steps;j++){
      const t=j/steps,e=a.east+t*(b.east-a.east),n=a.north+t*(b.north-a.north),h=a.y+t*(b.y-a.y);
      assert.ok(!boxes.some(q=>h+.30>q.min[1]&&h-.63<q.max[1]&&supportFootprintOverlaps(e,n,q,1.02)),JSON.stringify({e,n,h}));
      for(const q of [...rail.samples,...rail.sidingSamples])
        assert.ok(Math.hypot(q.east-e,q.north-n)>4,'separate from both standard-gauge carriers');
    }
  }
});
test('the freight turnout meets a real mainline sample and clears the new route',()=>{
  const first=rail.sidingSamples[0]!;
  assert.ok(rail.samples.some(p=>Math.hypot(p.east-first.east,p.north-first.north,p.y-first.y)<.001));
  assert.ok(rail.sidingMinRadius>=22,`radius ${rail.sidingMinRadius}`);
  const boxes=road.group.userData.colliders as OrientedSupportBox[];
  const s=rail.sidingSamples;
  for(let i=1;i<s.length;i++){
    const a=s[i-1]!,b=s[i]!;
    if(b.north<184)continue;
    for(let j=0;j<=10;j++){
      const t=j/10,e=a.east+t*(b.east-a.east),n=a.north+t*(b.north-a.north),h=a.y+t*(b.y-a.y);
      assert.ok(!boxes.some(q=>h+.30>q.min[1]&&h-.63<q.max[1]&&supportFootprintOverlaps(e,n,q,1.45)),JSON.stringify({e,n,h}));
    }
  }
});
test('grade survey measures violations and computes a genuinely feasible fill-only lower bound',()=>{
  const s=rail.samples,report=surveyRailGrade(s);
  assert.ok(report.violations.length>0,'current D terrain is not grade-certified');
  assert.ok(report.maximumFill>10);
  for(let i=1;i<s.length;i++){
    const a=s[i-1]!,b=s[i]!;
    assert.ok(report.minimum[i]!>=b.ground+.62-1e-9);
    assert.ok(Math.abs(report.minimum[i]!-report.minimum[i-1]!)<=.12*Math.hypot(b.east-a.east,b.north-a.north)+1e-8);
  }
});
test('bounded valley repair is fail-closed when a fixed endpoint cannot meet the grade',()=>{
 const samples=[{east:0,north:0,y:0,ground:-1},{east:1,north:0,y:2,ground:1},{east:2,north:0,y:0,ground:-1}];
 const report=repairBoundedRailGrade(samples,0,2);
 assert.equal(report.blocked,'fixed-endpoint');
 assert.deepEqual(report.profile,samples);
 assert.deepEqual(report.changed,[]);
 const low=[{east:0,north:0,y:2,ground:1},{east:10,north:0,y:0,ground:-10},{east:20,north:0,y:2,ground:1}];
 assert.equal(repairBoundedRailGrade(low,0,2).blocked,'fill-envelope');
});
test('the production low-valley bridge repairs the local grade without moving station anchors',()=>{
 const report=rail.valleyRepair!;
 assert.equal(report.blocked,undefined);
 assert.ok(report.maxGradeBefore>.4);
 assert.ok(report.maxGradeAfter<=.12000001);
 assert.ok(report.maxFill<4.2);
 assert.ok(report.changed.length>=15);
 assert.ok(rail.valleyBridgeSpans.length>=17);
 assert.ok(rail.valleyBridgeSpans.reduce((n,p)=>n+p.length,0)>28);
 assert.equal(rail.valleyBridgeSpans.reduce((n,p)=>n+p.bearings,0),7);
 for(const span of rail.valleyBridgeSpans){
   assert.ok(Math.abs(span.endY-span.startY)/span.length<=.12000001);
   assert.equal(span.startY,rail.samples[span.index]!.y);
   assert.equal(span.endY,rail.samples[span.index+1]!.y);
 }
 assert.ok(!rail.verticalSurvey.violations.some(v=>v.index>=report.first&&v.index<report.last));
 // The changed section is well away from the existing station platforms,
 // old junction and west pedestrian crossings.
 for(const i of report.changed)assert.ok(rail.samples[i]!.east>210&&rail.samples[i]!.east<250);
 assert.equal(rail.alignment.stations[0]!.railY,8.505400476746466);
 assert.equal(rail.alignment.stations[1]!.railY,11.397305603027343);
});
test('second physical valley bridge removes the eastern 13 overgrade spans within existing bounds',()=>{
 const r=rail.eastValleyRepair!;
 assert.equal(r.blocked,undefined);assert.ok(r.maxGradeBefore>.20);
 assert.ok(r.maxGradeAfter<.12);assert.ok(r.maxFill<4.2);assert.equal(r.changed.length,20);
 assert.equal(rail.eastValleyBridgeSpans.length,21);
 assert.equal(rail.eastValleyBridgeSpans.reduce((n,s)=>n+s.bearings,0),8);
 assert.ok(rail.eastValleyBridgeSpans.reduce((n,s)=>n+s.length,0)>35);
 assert.ok(!rail.verticalSurvey.violations.some(v=>v.index>=r.first&&v.index<r.last));
 for(const s of rail.eastValleyBridgeSpans){
   assert.equal(s.startY,rail.samples[s.index]!.y);assert.equal(s.endY,rail.samples[s.index+1]!.y);
   assert.ok(Math.abs(s.endY-s.startY)/s.length<=.12);
 }
 const cap=rail.eastValleyEnvelope!;
 assert.equal(cap.blocked,undefined);
 assert.ok(cap.changed.length>0);
 assert.ok(cap.maxClearance<=2.6&&cap.minClearance>=1.1&&cap.maxGrade<=.12);
 for(let i=cap.first;i<=cap.last;i++)assert.equal(rail.samples[i]!.y,cap.profile[i]!.y);
 const ramp=rail.northRampEnvelope!;
 assert.equal(ramp.blocked,undefined);assert.ok(ramp.maxGrade<=.12&&ramp.minClearance>=.5);
 assert.ok(!rail.verticalSurvey.violations.some(v=>v.index>=ramp.first&&v.index<ramp.last));
 assert.equal(rail.verticalSurvey.violations.length,46);
 assert.equal(rail.verticalSurvey.violations.filter(v=>v.index>=rail.closedHead!.index).length,32);
});
test('actual loop junction blocks false branch service on disconnected and overlapping tracks',()=>{
 const audit=rail.junctionAudit!;
 assert.ok(audit.start.horizontal>10);
 assert.ok(audit.start.vertical>3);
 assert.equal(audit.connectionMatches,false);
 assert.ok(audit.overlapRuns.length>=2);
 assert.ok(audit.overlapRuns.some(r=>r.minHorizontal<.3));
 assert.equal(rail.serviceGeometryReady,false);
});
test('blocked ring throat is physically absent and downstream branch has a real buffer',()=>{
 const head=rail.closedHead!;
 assert.ok(head.removedLength>59&&head.removedLength<61);
 assert.ok(rail.group.userData.colliders.includes(head.box));
 assert.ok(rail.junctionAudit!.overlapRuns.at(-1)!.to<head.removedLength-6);
 rail.group.updateMatrixWorld(true);
 const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
 function hits(i:number){
  const p=rail.samples[i]!;ray.ray.origin.set(p.east,p.y+4,-p.north);
  return ray.intersectObject(rail.group,true).filter(h=>Math.abs(h.point.y-p.y)<2);
 }
 for(const i of [5,13,25,32])assert.equal(hits(i).length,0);
 assert.ok(hits(head.index).some(h=>h.point.y>head.y+.7));
 assert.ok(hits(head.index+5).length>0);
 assert.equal(rail.serviceGeometryReady,false);
});
test('inclined masonry bearings are grounded at the lowest surveyed corner and have structural stringers',()=>{
  assert.ok(rail.railBearings.length>0);
  assert.ok(rail.stringerSegments>0);
  assert.ok(rail.railBearings.some(p=>Math.abs(p.slope)>.03));
  for(const p of rail.railBearings){
    assert.ok(p.low<=p.cornerMinimum-.09);
    assert.ok(p.high>p.low);
  }
});
test('all seven public railway crossings have stepped physical support at rail height',()=>{
  assert.equal(rail.crossings.length,7);
  for(const c of rail.crossings){
    assert.ok(c.span>7);
    const ground=road.heightAt(c.east,c.north)!;
    assert.ok(Math.abs(c.top-ground-.675)<.02);
    const heights=[...new Set(c.floors.map(f=>Math.round((f.max[1]-ground)*1000)))].sort((a,b)=>a-b);
    assert.deepEqual(heights,[230,450,675]);
    assert.ok(c.floors.every(f=>f.max[1]>f.min[1]&&f.footprint));
  }
});
