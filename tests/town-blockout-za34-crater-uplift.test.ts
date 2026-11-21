import assert from 'node:assert/strict';
import test from 'node:test';
import { meteorCraterRimRadius } from '../tools/voxel-tavern/town-blockout/meteor-crater';
import { craterImpactRing, craterWestBelt, craterIndustrialProtection,
  craterWestBoundaryEnvelope, craterWestUpliftCandidate }
  from '../tools/voxel-tavern/town-blockout/town-za34-crater-uplift';

const anchor={east:-120,north:185};
const polar=(radius:number,degree:number)=>{
  const angle=degree*Math.PI/180;
  return {east:anchor.east+radius*Math.sin(angle),
    north:anchor.north+radius*Math.cos(angle)};
};
const at=(r:number,d:number)=>{
  const p=polar(r,d);
  return craterWestUpliftCandidate(p.east,p.north,anchor);
};
const ringAt=(r:number,d:number)=>{
  const p=polar(r,d);
  return craterImpactRing(p.east,p.north,anchor);
};

test('ZA34 crater uplift R1 candidate: true 55–110m impact ring rises and falls asymmetrically',()=>{
  assert.equal(meteorCraterRimRadius,55);
  for(let deg=0;deg<360;deg+=15){
    const p=polar(54.99,deg);
    assert.equal(craterImpactRing(p.east,p.north,anchor),0);
    const q=polar(110,deg);
    assert.equal(craterImpactRing(q.east,q.north,anchor),0);
  }
  const up=polar(82,335);
  assert.ok(craterImpactRing(up.east,up.north,anchor)>=3.5);
  const rise=ringAt(62,335);
  const fall=ringAt(103,335);
  assert.ok(rise>0&&fall>0);
  assert.ok(Math.abs(ringAt(55.1,335))<.001);
});

test('ZA34 crater uplift R1 candidate: industrial works and main-town seam stay flat',()=>{
  for(let degree=100;degree<=230;degree+=10){
    const p=polar(82,degree);
    assert.equal(craterIndustrialProtection(p.east,p.north,anchor),0,
      `industrial bearing ${degree} displaced`);
    assert.equal(craterWestUpliftCandidate(p.east,p.north,anchor),0);
  }
  for(let n=0;n<=540;n+=5){
    assert.equal(craterWestBoundaryEnvelope(0,n),0);
    assert.equal(craterWestUpliftCandidate(0,n,anchor),0);
    assert.equal(craterWestUpliftCandidate(-24,n,anchor),0);
    assert.equal(craterWestUpliftCandidate(-240,n,anchor),0);
  }
  for(let e=-240;e<=0;e+=3){
    assert.equal(craterWestUpliftCandidate(e,0,anchor),0);
    assert.equal(craterWestUpliftCandidate(e,540,anchor),0);
  }
});

test('ZA34 crater uplift R1 candidate: west wildland has measurable non-flat ring and far-belt',()=>{
  let peak=0,positive=0,nonFlat=0,beltNonFlat=0;
  for(let n=0;n<=380;n+=2)for(let e=-240;e<=0;e+=2){
    const h=craterWestUpliftCandidate(e,n,anchor);
    assert.ok(Number.isFinite(h));
    peak=Math.max(peak,h);
    if(h>.2)positive++;
    if(Math.abs(h)>.2)nonFlat++;
    const r=Math.hypot(e-anchor.east,n-anchor.north);
    if(r>116&&r<170&&Math.abs(h)>.2)beltNonFlat++;
  }
  assert.ok(peak>3.5&&peak<5.5,`impact uplift peak ${peak.toFixed(2)}m`);
  assert.ok(positive>700&&nonFlat>1400&&beltNonFlat>150,
    `no proper west slope: positive=${positive}, nonFlat=${nonFlat}, belt=${beltNonFlat}`);
});

test('ZA34 crater uplift R1 candidate: no new cliff in a 1-m sample (strict <=18 degrees)',()=>{
  let steepest=0,location='';
  for(let n=40;n<=360;n+=2)for(let e=-238;e<=-26;e+=2){
    const h=craterWestUpliftCandidate(e,n,anchor);
    const slope=Math.hypot(
      craterWestUpliftCandidate(e+1,n,anchor)-h,
      craterWestUpliftCandidate(e,n+1,anchor)-h);
    if(slope>steepest){steepest=slope;location=`E${e}/N${n}`;}
  }
  assert.ok(steepest<=Math.tan(18*Math.PI/180),
    `steepest added slope ${(Math.atan(steepest)*180/Math.PI).toFixed(2)}° at ${location}`);
  // The far belt is still a physical height function, not repeated loose snow meshes.
  const b=polar(135,315);
  assert.ok(Number.isFinite(craterWestBelt(b.east,b.north,anchor)));
  assert.ok(Math.abs(at(82,335))>2);
});
