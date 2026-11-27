import assert from 'node:assert/strict';
import test from 'node:test';
import {bR30InscriptionApproachPlan,surveyBR30InscriptionApproach} from '../tools/voxel-tavern/town-blockout/town-b-r30-inscription-approach';

const point=(east:number,north:number,height=0)=>({east,north,height});
const start=point(...bR30InscriptionApproachPlan[0]);
const end=bR30InscriptionApproachPlan.at(-1)!;
const foot=point(end[0],end[1]);
const route={id:'transfer-dock',points:[start,point(start.east+1,start.north)]};
const tracks=[0,1,2].map(i=>[point(100+i*3,0),point(100+i*3,200)]);
const solids=[{min:[50,-1,-100],max:[51,2,-99]}];
const road={heightAt:()=>0};
test('B inscription approach rejects incomplete or nonfinite host surveys',()=>{
  const check=()=>surveyBR30InscriptionApproach(road,foot,route,tracks,solids);
  assert.ok(check().samples>0);
  assert.throws(()=>surveyBR30InscriptionApproach(road,{...foot,east:NaN},route,tracks,solids));
  assert.throws(()=>surveyBR30InscriptionApproach(road,foot,{...route,points:[{...start,height:NaN},route.points[1]]},tracks,solids));
  assert.throws(()=>surveyBR30InscriptionApproach(road,foot,route,tracks,[]));
  assert.throws(()=>surveyBR30InscriptionApproach(road,foot,route,[[point(NaN,0),point(100,200)],tracks[1],tracks[2]],solids));
  assert.throws(()=>surveyBR30InscriptionApproach(road,foot,route,tracks,[{min:[51,-1,-100],max:[50,2,-99]}]));
});
