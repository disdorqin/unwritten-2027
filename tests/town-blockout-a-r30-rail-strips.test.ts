import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildRailStrip,railSections,surveyRailGrade} from '../tools/voxel-tavern/town-blockout/town-a-r30-rail-strip';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
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
const rail=buildCraterRailExtension(grid,road);

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
test('all six public railway crossings have stepped physical support at rail height',()=>{
  assert.equal(rail.crossings.length,6);
  for(const c of rail.crossings){
    assert.ok(c.span>7);
    const ground=road.heightAt(c.east,c.north)!;
    assert.ok(Math.abs(c.top-ground-.675)<.02);
    const heights=[...new Set(c.floors.map(f=>Math.round((f.max[1]-ground)*1000)))].sort((a,b)=>a-b);
    assert.deepEqual(heights,[230,450,675]);
    assert.ok(c.floors.every(f=>f.max[1]>f.min[1]&&f.footprint));
  }
});
