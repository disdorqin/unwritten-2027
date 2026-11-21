import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import {
  inspectZa36TrailGrade, surveyZa36MountainSeam, za36MountainGradeSpec,
  type Za36TrailNode,
} from '../tools/voxel-tavern/town-blockout/town-za36-mountain-grade';

test('ZA-36 mountain A: reproduce the real 202m terrain discontinuity and 2827m lower bound',()=>{
  const terrain=createTerrainGrid();
  assert.equal(worldBounds.depth,540);
  const real=surveyZa36MountainSeam((east,north)=>terrain.heightAt(east,north),sampleNorthRidge350);
  assert.ok(Math.abs(real.start.height-7.68166256)<.005);
  assert.ok(Math.abs(real.seamVerticalGap-201.91077391)<.02,
    'sample at N539.5, not the unwalkable N540 cut');
  assert.equal(real.target.height,347);
  assert.ok(real.minHorizontalMetres>2827&&real.minHorizontalMetres<2829);
  assert.ok(real.nominal2750MetreAverageGrade>.12,
    'the nominal 2750m minimum alone cannot meet 12% with this full rise');
});

test('ZA-36 mountain A: short direct cut is NOT permitted even when the view looks connected',()=>{
  const terrain=createTerrainGrid();
  const d=surveyZa36MountainSeam((e,n)=>terrain.heightAt(e,n),sampleNorthRidge350);
  const straight=inspectZa36TrailGrade([
    {...d.start,clearWidth:3},
    {...d.target,clearWidth:3},
  ]);
  assert.equal(straight.geometryPass,false);
  assert.ok(straight.maxAbsGrade>3);
  assert.ok(straight.faults.some(f=>f.kind==='grade'));
  assert.ok(straight.faults.some(f=>f.kind==='length'));
  assert.equal(straight.terrainVerified,false);
  assert.equal(straight.liveTraversalVerified,false);
});

test('ZA-36 mountain A: the proposed 2.75km minimum is insufficient; grade and width are separate gates',()=>{
  const terrain=createTerrainGrid();
  const d=surveyZa36MountainSeam((e,n)=>terrain.heightAt(e,n),sampleNorthRidge350);
  // This deliberately artificial 14-sweep POLYLINE tests only the numeric
  // checker. No terrain mesh is written and no walkability is claimed.
  const path:Za36TrailNode[] = [{...d.start,clearWidth:2.8}];
  for(let i=1;i<=14;i++){
    path.push({
      east:i%2===1?95:530,
      north:539.5+(i/15)*100.5,
      height:d.start.height+(d.fullRise*i/15),
      clearWidth:2.8,
    });
  }
  path.push({...d.target,clearWidth:2.8});
  const good=inspectZa36TrailGrade(path);
  assert.ok(good.horizontalMetres>za36MountainGradeSpec.minRoadMetres);
  assert.equal(good.geometryPass,true,JSON.stringify(good.faults));
  assert.ok(good.maxAbsGrade<.12);
  assert.equal(good.minClearWidth,2.8);
  assert.equal(good.terrainVerified,false,'geometry-only points do not become a traversable world');
  assert.equal(good.liveTraversalVerified,false);
  const narrowed=inspectZa36TrailGrade(path.map((node,i)=>i===5?{...node,clearWidth:2.49}:node));
  assert.equal(narrowed.geometryPass,false);
  assert.ok(narrowed.faults.some(f=>f.kind==='clear-width'));
  const abrupt=path.map((node,i)=>i===5?{...node,height:node.height+100}:node);
  const sudden=inspectZa36TrailGrade(abrupt);
  assert.equal(sudden.geometryPass,false);
  assert.ok(sudden.faults.some(f=>f.kind==='grade'));
});
