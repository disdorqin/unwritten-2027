import test from 'node:test';
import assert from 'node:assert/strict';
import {
  craterInteriorTerraceMaxRadius,
  craterInteriorDressingPieces,
  craterInteriorDressingStats,
} from '../tools/voxel-tavern/town-blockout/meteor-crater-interior-dressing.js';
import { meteorCraterFixturePlan } from '../tools/voxel-tavern/town-blockout/meteor-crater.js';

test('C-1 preflight corrects all 741 original R1 pieces intruding into B-01 rim seam',t=>{
  assert.equal(craterInteriorTerraceMaxRadius,meteorCraterFixturePlan.terraces[0].outerRadius);
  assert.equal(craterInteriorTerraceMaxRadius,50);
  const terraces=craterInteriorDressingPieces.filter(x=>x.zone==='terraces');
  const floor=craterInteriorDressingPieces.filter(x=>x.zone==='floor');
  const well=craterInteriorDressingPieces.filter(x=>x.zone==='sealed-well');
  assert.equal(craterInteriorDressingStats.terraces,terraces.length);
  assert.equal(craterInteriorDressingStats.floor,floor.length);
  assert.equal(craterInteriorDressingStats.sealedWell,well.length);
  assert.equal(floor.length,2673,'batch98 relocation clears 172 visual shards at the six current worklight feet');
  assert.equal(well.length,348,'C1 clipping never removes sealed-well trim');
  assert.ok(terraces.length>2500 && terraces.length<3826);
  for(const part of terraces){
    const radius=Math.hypot(part.center[0],part.center[2]);
    const extent=.5*Math.hypot(part.size[0],part.size[2]);
    assert.ok(radius+extent<=50+1e-9,part.id+' crosses B01 rim into A/C seam');
  }
  t.diagnostic(JSON.stringify({
    originalRevision:'44a6088f',originalTotalPieces:7019,
    originalTerrace:3826,originalRimCrossingPieceCentres:741,
    nowTotal:craterInteriorDressingStats.count,
    c2FloorR1ShardsClearedAtLampPlinths:2845-floor.length,
    nowTerrace:terraces.length,
    nowRimIntrusions:0,
    officialMuseFourArtBeltMapPresent:false,
    fourBeltArtAcceptance:'BLOCKED, do not change boundaries'
  },null,2));
});
