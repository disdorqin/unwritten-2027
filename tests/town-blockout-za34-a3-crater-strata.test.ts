import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NearestFilter, type Group } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { createZa36StrataTexture } from '../tools/voxel-tavern/town-blockout/town-za36-crater-ejecta';

type StrataImage = {data:Uint8Array;width:number;height:number};
const hex=(image:StrataImage,x:number,y:number)=>{
  const off=4*(y*image.width+x);
  return (image.data[off]!<<16)|(image.data[off+1]!<<8)|image.data[off+2]!;
};
const colors=new Set([0x8a8378,0x5d4630,0xa98a56,0x5d564c,0x8a4a34]);
const rust=0x8a4a34,oldNightBlue=0x2c3648;
function audit(image:StrataImage,label:string) {
  assert.equal(image.width,32,label+' did not replace 16px speckled texture');
  assert.equal(image.height,32);
  const histogram=new Map<number,number>();
  let isolated=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const rgb=hex(image,x,y);
    assert.ok(colors.has(rgb),`${label}: unapproved pigment ${rgb.toString(16)}`);
    assert.notEqual(rgb,oldNightBlue,label+' has the old blue night-rock pigment');
    histogram.set(rgb,(histogram.get(rgb)??0)+1);
    const near=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]
      .filter(([a,b])=>a!>=0&&a!<image.width&&b!>=0&&b!<image.height);
    if(near.every(([a,b])=>hex(image,a!,b!)!==rgb))isolated++;
  }
  assert.equal(isolated,0,label+' has a solitary 1px color speck');
  assert.ok(histogram.size>=2,label+' has no readable rock layering');
  assert.ok((histogram.get(rust)??0)<=.02*image.width*image.height,
    label+' uses excessive rust red');
  let bandRows=0;
  for(let y=0;y<image.height;y++){
    let transitions=0;
    for(let x=1;x<image.width;x++)transitions+=Number(hex(image,x-1,y)!==hex(image,x,y));
    if(transitions<=5)bandRows++;
  }
  assert.ok(bandRows>=26,`${label}: strata are still high-frequency checker noise`);
}
function materialMaps(group:Group) {
  const maps:StrataImage[]=[];
  group.traverse(node=>{
    if(!(node as {isMesh?:boolean}).isMesh)return;
    const material=(node as unknown as {material?:{map?:{image?:unknown}}}).material;
    const image=material?.map?.image as StrataImage|undefined;
    if(image?.width===32&&image?.data instanceof Uint8Array)maps.push(image);
  });
  return maps;
}

test('A-3 material algorithm: 32px coherent strata, zero blue and single-pixel noise, low rust coverage',()=>{
  for(const [seed,withRust]of [[3,false],[7,true],[11,false],[17,true],[23,true]] as const) {
    const map=createZa36StrataTexture(0x8a8378,0x5d4630,0xa98a56,seed,withRust?rust:undefined);
    assert.equal(map.magFilter,NearestFilter);
    assert.equal(map.minFilter,NearestFilter);
    assert.equal(map.generateMipmaps,false);
    audit(map.image as StrataImage,`standalone-seed-${seed}`);
  }
});

test('A-3 actually mounted ZA-36 ejecta, midground and mouth wreck ring share stratified palette',()=>{
  const grid=createTerrainGrid();
  const crater=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const subgroups=[
    ['ejecta',crater.ejecta.group,2],
    ['midground',crater.midground.group,2],
    ['wreckage ring',crater.mouthWorks.group,1],
  ] as const;
  for(const [label,group,min]of subgroups){
    const maps=materialMaps(group);
    assert.ok(maps.length>=min,`${label} did not mount new strata material maps`);
    for(const [i,map]of maps.entries())audit(map,`${label}-material-${i}`);
  }
  const original=crater.group.getObjectByName('meteor-crater-walk-mesh');
  assert.ok(original,'A-3 cannot remove B-01 authoritative walk mesh');
});
