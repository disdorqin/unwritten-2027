import test from 'node:test';
import assert from 'node:assert/strict';
import {
  craterInteriorDressingPieces, craterInteriorDressingStats,
} from '../tools/voxel-tavern/town-blockout/meteor-crater-interior-dressing.js';

// C-0: Audit the shipped 44a6088f R1 scene, BEFORE anyone calls it C-1
// band work. A passing audit does not certify the four Muse C3 belt boundaries.
test('C-0 records C3 R1 spatial ownership and its unassigned four-band defect', t=>{
  assert.equal(craterInteriorDressingStats.count,7019);
  const groups = new Map<string,number>();
  const leaked:{id:string,radius:number}[]=[];
  let rimMin=Infinity,rimMax=0;
  let preciseDuplicate=0;
  const seen=new Set<string>();
  for(const part of craterInteriorDressingPieces){
    groups.set(part.zone,(groups.get(part.zone)??0)+1);
    const radius=Math.hypot(part.center[0],part.center[2]);
    if(part.zone==='terraces'){
      rimMin=Math.min(radius,rimMin);rimMax=Math.max(radius,rimMax);
      if(radius>=50) leaked.push({id:part.id,radius});
    }
    const point=part.zone+':'+part.center.map(n=>n.toFixed(5)).join(':');
    if(seen.has(point)) preciseDuplicate++;
    seen.add(point);
    assert.equal('band' in part,false,'original R1 does not have Muse four-band metadata');
  }
  assert.deepEqual([...groups.entries()],[['terraces',3826],['floor',2845],['sealed-well',348]]);
  assert.ok(leaked.length>0,
    'original R1 r24..53.68 reaches the reserved r50..55 rim apron; needs explicit C-1 correction');
  assert.ok(rimMax>50 && rimMin>=20);
  t.diagnostic(JSON.stringify({
    reviewedCommit:'44a6088f',groups:Object.fromEntries(groups),
    rimBandRadiusM:[50,55],r1TerraceRadiusM:[rimMin,rimMax],
    r1PiecesInRimBand:leaked.length,
    firstRimSpillIds:leaked.slice(0,3),preciselyRepeatedCentres:preciseDuplicate,
    verifiedExactMuseFourBandCoordinates:false,
    conclusion:'R1 uses concentric point deposits, not four continuous assigned C3 belts',
  },null,2));
});
