import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditRidgeRoadCrossings} from '../tools/voxel-tavern/town-blockout/town-d-r30-road-survey';
const line=(p:number[][])=>p.map(([east,north],i)=>({east:east!,north:north!,height:10,cum:i*10}));
test('survey rejects repeated or crossing nonadjacent sections',()=>{
 assert.equal(auditRidgeRoadCrossings(line([[0,0],[10,0],[10,10],[20,10]])).length,0);
 assert.ok(auditRidgeRoadCrossings(line([[0,0],[10,10],[0,10],[10,0]])).length>0);
 assert.ok(auditRidgeRoadCrossings(line([[0,0],[10,0],[10,5],[10,0],[20,0]])).length>0);
});
