import assert from 'node:assert/strict';
import test from 'node:test';
import { type BufferGeometry, type Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { type CraterDistantPaletteAudit } from '../tools/voxel-tavern/town-blockout/town-za34-crater-distance-palette';

const grid=createTerrainGrid();
const mount=(opts?: {za34DistantPaletteCandidate?:boolean})=>
  mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),opts);
const baseline=mount({za34DistantPaletteCandidate:false});
const enhanced=mount();
const locate=(group:typeof baseline.group)=>{
  const surface=group.getObjectByName('meteor-crater-walk-mesh') as Mesh | undefined;
  assert.ok(surface?.isMesh,'B-01 crater original mesh absent');
  return surface.geometry as BufferGeometry;
};

test('ZA34 eleventh round distant crater: explicit rollback preserves old B-01 colors and geometry',()=>{
  const untouched=mount({za34DistantPaletteCandidate:false});
  const before=locate(baseline.group),after=locate(untouched.group);
  assert.equal(before.index?.count,after.index?.count);
  assert.equal(before.getAttribute('position').count,after.getAttribute('position').count);
  assert.equal(baseline.group.userData.za34DistantPaletteAudit,undefined);
  const b=before.getAttribute('color'),c=after.getAttribute('color');
  for(let i=0;i<b.count;i+=103)for(let j=0;j<3;j++)
    assert.equal(b.getComponent(i,j),c.getComponent(i,j));
  for(const [e,n] of [[-120,185],[-170,185],[-120,244],[-77,215]]){
    assert.equal(baseline.heightAt(e,n),untouched.heightAt(e,n));
  }
});

test('ZA34 distant crater: at least five stratified color families exist on real bowl vertices',()=>{
  const report=enhanced.group.userData.za34DistantPaletteAudit as CraterDistantPaletteAudit | undefined;
  assert.ok(report,'the opt-in real mesh palette should report its audit');
  const geo=locate(enhanced.group);
  assert.equal(report.vertices,geo.getAttribute('position').count);
  assert.equal(report.indices,geo.index?.count);
  for(const [band,count] of Object.entries(report.materialBands)){
    assert.ok(count>=200,`not enough readable ${band} strata: ${count}`);
  }
  assert.ok(report.maxLuminance-report.minLuminance>.14,
    `crater tonal range ${report.maxLuminance-report.minLuminance} too flat`);
});

test('ZA34 distant crater: outer lip brighter than cinder floor, with real radial relief, not a black ellipse',()=>{
  const geo=locate(enhanced.group);
  const pos=geo.getAttribute('position');
  const col=geo.getAttribute('color');
  const totals={rim:[0,0],floor:[0,0],middle:[0,0]} as Record<string,number[]>;
  let high=0,low=0;
  for(let i=0;i<pos.count;i++){
    const radial=Math.hypot(pos.getX(i),pos.getZ(i));
    const lum=.2126*col.getX(i)+.7152*col.getY(i)+.0722*col.getZ(i);
    const kind=radial>56&&radial<59?'rim':radial<17?'floor':radial>32&&radial<37?'middle':undefined;
    if(kind){totals[kind]![0]+=lum;totals[kind]![1]++;}
    high=Math.max(high,pos.getY(i));
    low=Math.min(low,pos.getY(i));
  }
  const avg=(k:string)=>totals[k]![0]/totals[k]![1];
  for(const [kind,part] of Object.entries(totals))assert.ok(part[1]>=100,`sample ${kind} insufficient`);
  assert.ok(avg('rim')>avg('floor')*1.9,
    `dark-disc palette: rim ${avg('rim').toFixed(3)}, floor ${avg('floor').toFixed(3)}`);
  assert.ok(Math.abs(avg('middle')-avg('floor'))>.017,
    'no interior terrace contrast when viewed from the rim');
  assert.ok(high-low>33,`B-01 relief accidentally flattened: ${high-low}`);
});

test('ZA34 distant crater: same mesh tris/draws and same walking surface and physical crater-height authority',()=>{
  const a=locate(baseline.group),b=locate(enhanced.group);
  assert.equal(a.getAttribute('position').count,b.getAttribute('position').count);
  assert.equal(a.index?.count,b.index?.count);
  const indexA=a.index!,indexB=b.index!;
  for(let i=0;i<indexA.count;i+=79)assert.equal(indexA.getX(i),indexB.getX(i));
  const p=a.getAttribute('position'),q=b.getAttribute('position');
  for(let i=0;i<p.count;i+=47){
    assert.equal(p.getX(i),q.getX(i));
    assert.equal(p.getY(i),q.getY(i));
    assert.equal(p.getZ(i),q.getZ(i));
  }
  for(let n=130;n<=240;n+=10)for(let e=-175;e<=-65;e+=10)
    assert.equal(baseline.heightAt(e,n),enhanced.heightAt(e,n),
      `visual option changed collision at E${e}/N${n}`);
  let aDraws=0,bDraws=0;
  baseline.group.traverse(o=>{if((o as Mesh).isMesh)aDraws++;});
  enhanced.group.traverse(o=>{if((o as Mesh).isMesh)bDraws++;});
  assert.equal(aDraws,bDraws,'a distant palette cannot increase draw calls');
});

test('ZA34 distant palette is enabled by default, explicitly switchable without any mesh duplication',()=>{
  const combined=mount({za34DistantPaletteCandidate:true});
  const report=combined.group.userData.za34DistantPaletteAudit as CraterDistantPaletteAudit;
  assert.ok(report.vertices>1000);
  const surface=locate(combined.group);
  assert.equal(surface.index?.count,locate(enhanced.group).index?.count);
  // A far-palette change must never mutate the authoritative physical B-01 crater.
  assert.equal(combined.heightAt(-120,185),baseline.heightAt(-120,185));
});
