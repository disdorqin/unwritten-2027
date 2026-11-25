import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sampleNorthRidge350} from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';

/**
 * D-5: the existing 2026-11-21 east-wing line is a SURVEY PROPOSAL.
 * This audit checks whether a physical 3.5m bench can be cut/filled into
 * the actual P1 ridge. It does not create parallel town collision truth.
 *
 * The sample hairpins follow the prior recorded 5+9 structure; altitude
 * interpolation obeys <=12%, but bridge-scale fill is disqualifying.
 */
type SurveyKnot = Readonly<{east:number;north:number}>;
const lower:[SurveyKnot,...SurveyKnot[]]=[
  {east:526,north:329},{east:377,north:355},{east:575,north:386},
  {east:377,north:419},{east:575,north:451},{east:377,north:483},{east:440,north:520},
];
const upper:[SurveyKnot,...SurveyKnot[]]=[
  {east:440,north:520},{east:329,north:532},{east:531,north:545},
  {east:329,north:557},{east:531,north:570},{east:329,north:583},
  {east:531,north:596},{east:329,north:608},{east:531,north:622},
  {east:329,north:633},{east:336,north:640},
];
const foothill:[SurveyKnot,...SurveyKnot[]]=[{east:290,north:300},{east:526,north:329}];
export const d5UnapprovedZigzagFixtures={foothill,lower,upper}as const;

function cumulative(path:readonly SurveyKnot[]){
  const lengths=[0];
  for(let i=1;i<path.length;i++){
    const {east,north}=path[i]!;
    const previous=path[i-1]!;
    lengths.push(lengths.at(-1)!+Math.hypot(east-previous.east,north-previous.north));
  }
  return lengths;
}
function audit(path:readonly SurveyKnot[],startY:number,endY:number){
  const lengths=cumulative(path);
  const metres=lengths.at(-1)!;
  const climb=endY-startY;
  const knots=path.map((p,i)=>({
    ...p,metres:lengths[i]!,
    proposedY:startY+climb*lengths[i]!/metres,
    realY:sampleNorthRidge350(p.east,p.north),
  }));
  let worstFill=0,worstCut=0;
  for(let i=1;i<knots.length;i++){
    const from=knots[i-1]!,to=knots[i]!;
    const stride=Math.hypot(to.east-from.east,to.north-from.north);
    for(let d=0;d<=Math.ceil(stride/.5);d++){
      const f=d/Math.ceil(stride/.5);
      const e=from.east+(to.east-from.east)*f;
      const n=from.north+(to.north-from.north)*f;
      const y=from.proposedY+(to.proposedY-from.proposedY)*f;
      const difference=y-sampleNorthRidge350(e,n);
      worstFill=Math.max(worstFill,difference);
      worstCut=Math.max(worstCut,-difference);
    }
  }
  return{metres,grade:Math.abs(climb)/metres,worstFill,worstCut,knots};
}

test('D5: original 5+9 east-wing zigzag proposal meets the length/grade paper envelope only',()=>{
  const a=audit(foothill,23.2,18);
  const b=audit(lower,18,140);
  const c=audit(upper,140,347);
  const total=a.metres+b.metres+c.metres;
  assert.ok(total>=2750);
  assert.ok(total>=2981&&total<3050,`west/east zigzag total is ${total}`);
  assert.ok(b.grade<=.12&&c.grade<=.12);
  assert.equal(lower.length-2,5);
  assert.equal(upper.length-2,9);
  // The paper grade constraint does not certify drivable 3.5m terrain.
});

test('D5: actual terrain has bridge-height fill and deep-cut holes; no production mounting',t=>{
  const b=audit(lower,18,140);
  const c=audit(upper,140,347);
  const worstFill=Math.max(b.worstFill,c.worstFill);
  const worstCut=Math.max(b.worstCut,c.worstCut);
  // Numeric measurements come from the canonical sampleNorthRidge350,
  // not from a second copied terrain formula.
  assert.ok(worstFill>200,'unacceptable 240m free-air projection must remain blocked');
  assert.ok(worstCut>40,'several hairpins are buried inside the mountain');
  assert.ok(c.knots.some(p=>p.north===622&&p.east===531&&p.proposedY-p.realY>220));
  t.diagnostic(JSON.stringify({
    proposedApproxMetres:237.775+ b.metres+c.metres,
    lower:{grade:b.grade,maxFill:b.worstFill,maxCut:b.worstCut},
    upper:{grade:c.grade,maxFill:c.worstFill,maxCut:c.worstCut},
    productionApproval:false,unresolved:'Need terrain-conforming P1 surveyed alignment',
  }));
});
