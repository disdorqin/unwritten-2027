import assert from 'node:assert/strict';
import test from 'node:test';
import {Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,PointLight,SRGBColorSpace,
  type BufferGeometry,type Material,type Texture} from 'three';
import {cloudStoneRingAnchor} from '../tools/voxel-tavern/town-blockout/main-summit-cloud-terrace-ring';
import {terraceFurnishingLayout} from '../tools/voxel-tavern/town-blockout/main-summit-cloud-terrace-furnishings';
import {sampleNorthRidge350} from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import {za22CloudSurfaceAt,za22CloudRunway,cloudTerminal} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';
import {mountMainSummitAssembly,summitAssemblyAnchor} from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {mountMainSummitTerraceEdge} from '../tools/voxel-tavern/town-blockout/main-summit-terrace-edge';
async function sample(context:{after(f:()=>void):void}){
  const {mountCloudTerraceArt}=await import('../tools/voxel-tavern/town-blockout/main-summit-cloud-terrace-art');
  const root=new Group(),art=mountCloudTerraceArt(root);
  context.after(art.dispose);
  return {root,art};
}
test('R1/2: actual m03+m34 monumental ring has masonry, broken crest, a readable inner cyan line',async context=>{
  const {art}=await sample(context);
  assert.ok(art.ring.count>450,'must build actual individual stone facets');
  assert.ok(art.ring.segmentCount>100,'arc has three layers of stone depth');
  assert.ok(art.ring.missingSlices>=1,'the m34 silhouette includes a weathered crest break');
  assert.ok(art.ring.draws<=8,'large ring should use material-family instancing');
  assert.ok(art.group.getObjectByName('cloud-terrace-static-lambert-boxes')instanceof InstancedMesh);
  assert.ok(art.ring.group.getObjectByName('cloud-stone-ring-runes')instanceof InstancedMesh);
  assert.equal(art.group.parent?.type,'Group');
  assert.ok(art.stats().pieces>600);
  assert.ok(art.stats().meshCount<=6,'the assembled terrace retains at most six meshes');
});
test('static cloud terrace art uses four meshes without losing box instances or shared-resource disposal',async context=>{
  const {root,art}=await sample(context);
  const meshes:Mesh[]=[];
  art.group.traverse(object=>{if(object instanceof Mesh)meshes.push(object);});
  assert.equal(meshes.length,4,'one Lambert batch, runes, lantern cores and the inscription remain');
  assert.equal(art.stats().draws,4);
  assert.ok(meshes.every(mesh=>mesh instanceof InstancedMesh||mesh.name==='cloud-terrace-printed-chinese-inscription'));
  const boxes=art.group.getObjectByName('cloud-terrace-static-lambert-boxes');
  const runes=art.ring.group.getObjectByName('cloud-stone-ring-runes');
  const light=art.furnishings.group.getObjectByName('cloud-terrace-dressing-light');
  assert.ok(boxes instanceof InstancedMesh);
  assert.ok(runes instanceof InstancedMesh);
  assert.ok(light instanceof InstancedMesh);
  assert.equal(boxes.count+runes.count+light.count,art.stats().pieces+1,
    'every original box plus the story board survives consolidation');
  const boardMatrix=new Matrix4();
  boxes.getMatrixAt(boxes.count-1,boardMatrix);
  assert.ok(Math.abs(boardMatrix.elements[12]!+5.3)<1e-4);
  assert.ok(Math.abs(boardMatrix.elements[13]!-348.62)<1e-4);
  assert.ok(Math.abs(boardMatrix.elements[14]!-18.06)<1e-4);

  const resources=new Set<BufferGeometry|Material|Texture>();
  for(const mesh of meshes){
    resources.add(mesh.geometry);
    if(Array.isArray(mesh.material))mesh.material.forEach(material=>resources.add(material));
    else{
      resources.add(mesh.material);
      const map=(mesh.material as {map?:Texture}).map;
      if(map)resources.add(map);
    }
  }
  let releases=0;
  for(const resource of resources)resource.addEventListener('dispose',()=>{releases++;});
  art.dispose();
  art.dispose();
  assert.equal(root.children.length,0);
  assert.equal(art.group.parent,null);
  assert.equal(releases,resources.size,'every retained shared geometry/material/texture is released exactly once');
});
test('R3: ring stands on real ZA22 snow slab WEST of the runway, with no dead zone',async context=>{
  const {art}=await sample(context);
  const anchor=cloudStoneRingAnchor;
  const worldE=summitAssemblyAnchor.east+anchor.east;
  const worldN=summitAssemblyAnchor.north+anchor.north;
  assert.equal(worldE,292);
  assert.equal(worldN,661);
  assert.equal(sampleNorthRidge350(worldE,worldN),347);
  assert.equal(za22CloudSurfaceAt(worldE,worldN),347);
  assert.ok(worldE+3.8<za22CloudRunway.start,'ring must remain to the west of E310.5 runway');
  assert.ok(worldN>cloudTerminal.north+15,'separate from transfer bell');
  assert.equal(art.blocked(anchor.east,anchor.north,347,.27,1.8),false,
    'no unwalkable invisible cube across the whole ring opening');
  assert.equal(art.blocked(anchor.east-3,anchor.north,347,.27,1.8),true,
    'one stone foot is physically solid');
  for(const east of [0,8,14,20,27,34]){
    assert.equal(art.blocked(east,-13.1,347,.27,1.8),false,
      `the accepted N-13.1 travel line remains clear at E${east}`);
  }
  // Aircraft may sweep the ENTIRE 2.2m half-width, not just player radius.
  for(let east=10.5;east<=51.5;east+=.5){
    assert.equal(art.blocked(east,-14,347,2.2,1.8),false,
      `stone art must not intrude into the aircraft wing sweep at E${east}`);
  }
  assert.equal(art.blocked(24,-19,347,.27,1.8),false,
    'starport rack and in-person assembly pad still belong to the original owner');
});
test('R4/R5: actual benches, retained supplies, rail lantern cores and three point lights exist',async context=>{
  const {art}=await sample(context);
  assert.deepEqual(terraceFurnishingLayout.benches.map(p=>p.east),[-3.0,1.8,5.7]);
  assert.equal(art.furnishings.lanterns.length,3);
  assert.ok(art.furnishings.lanterns.every(p=>p instanceof PointLight));
  assert.ok(art.furnishings.count>100,'small rocks and lamps must be real geometry');
  assert.ok(art.furnishings.draws<=10,'do not explode the cloud scene draw budget');
  assert.equal(art.group.getObjectByName('cloud-terrace-static-lambert-boxes')instanceof InstancedMesh,true);
  assert.equal(art.blocked(-3,-20.1,347,.27,1.8),true);
  assert.equal(art.blocked(-4,-18.5,347,.27,1.8),true);
  art.setNight(true);
  assert.equal(art.stats().night,true);
  assert.ok(art.furnishings.lanterns.every(p=>p.intensity===1));
  art.setNight(false);
  assert.ok(art.furnishings.lanterns.every(p=>p.intensity<.3));
});
test('R6: three touch verbs are range-bound and authorized, no portal or inventory is created',async context=>{
  const {art}=await sample(context);
  const ring=cloudStoneRingAnchor;
  assert.equal(art.inspect('ring','touch',ring,false).accepted,false);
  assert.equal(art.inspect('ring','view',{...ring,east:30},true).accepted,false);
  assert.equal(art.inspect('ring','listen',ring,true).accepted,true);
  assert.equal(art.inspect('ring','touch',ring,true).accepted,true);
  assert.equal(art.ring.touches,1);
  const supplies=terraceFurnishingLayout.supply;
  assert.equal(art.inspect('supplies','view',supplies,true).accepted,true);
  assert.equal(art.inspect('supplies','listen',supplies,true).accepted,true);
  assert.equal(art.inspect('supplies','touch',supplies,true).accepted,true);
  assert.equal(art.furnishings.inspections,3);
});
test('R7: D4 assembly coexists with original glacier, snow-wing, P8 cloud, cable and world collision',async context=>{
  const {mountMainSummitExtras}=await import('../tools/voxel-tavern/town-blockout/main-summit-extras');
  const owner=new Group(),assembly=mountMainSummitAssembly(owner,0),extras=mountMainSummitExtras(assembly);
  context.after(()=>{extras.dispose();assembly.dispose();});
  assert.ok(extras.cloudTerraceArt.group.parent===assembly.group);
  assert.ok(assembly.mountedParts().includes('P-8'));
  assert.ok(extras.glideRings.length>=3);
  assert.ok(extras.windGround.group.parent===assembly.group);
  const trail=createMainSummitTrail(assembly.block.heightAt,assembly.arrivalHeight);
  const mid=trail.points[Math.floor(trail.points.length*.55)]!;
  const ice=extras.icefall.topAnchor;
  assert.deepEqual(
    [extras.shelterMid.east,extras.shelterMid.north,extras.shelterMid.base],
    [mid.east+6,mid.north+5,assembly.block.heightAt(mid.east+6,mid.north+5)??mid.height],
    'the mid-trail shelter keeps its heightAt-surveyed coordinate');
  assert.deepEqual(
    [extras.shelterIce.east,extras.shelterIce.north,extras.shelterIce.base],
    [ice.east+7,ice.north+5,assembly.block.heightAt(ice.east+7,ice.north+5)??ice.height],
    'the icefall shelter keeps its heightAt-surveyed coordinate');
  let shelterMeshes=0;
  for(const shelter of [extras.shelterMid,extras.shelterIce]){
    let count=0;
    shelter.group.traverse(object=>{if(object instanceof Mesh)count++;});
    assert.equal(count,3,'each static shelter uses one Lambert batch, rope and ember');
    shelterMeshes+=count;
  }
  assert.equal(shelterMeshes,6,'the two shelters retain six mesh draws in total');
  for(const east of [0,8,14,20,27,34]){
    assert.equal(extras.blocked(east,-13.1,347,.27,1.75),false,
      `new stage cannot seal the cloud walking corridor E${east}`);
  }
  assert.equal(extras.blocked(-8,-15,347,.27,1.75),false);
});

test('terrace edge batches preserve 21 parapets, 14 clouds and dock sign with at most four draws',context=>{
  const owner=new Group(),assembly=mountMainSummitAssembly(owner,0);
  context.after(()=>assembly.dispose());
  const edge=mountMainSummitTerraceEdge(assembly);
  owner.add(edge.group);
  context.after(()=>edge.dispose());
  assert.equal(edge.parapetCount,21);
  assert.equal(edge.puffCount,14);
  const meshes:Mesh[]=[];
  edge.group.traverse(object=>{if(object instanceof Mesh)meshes.push(object);});
  assert.ok(meshes.length<=4,'only three material batches plus the optional Canvas face may draw');
  assert.ok(meshes.every(mesh=>mesh instanceof InstancedMesh||mesh.name==='terrace-edge-sign-face'));
  assert.equal(meshes.reduce((sum,mesh)=>sum+(mesh instanceof InstancedMesh?mesh.count:1),0),36);

  const parapets=edge.group.getObjectByName('terrace-edge-parapet');
  const clouds=edge.group.getObjectByName('terrace-edge-cloud');
  const frame=edge.group.getObjectByName('terrace-edge-sign-frame');
  assert.ok(parapets instanceof InstancedMesh);
  assert.ok(clouds instanceof InstancedMesh);
  assert.ok(frame instanceof InstancedMesh);
  assert.equal(parapets.count,21);
  assert.equal(clouds.count,14);
  assert.equal(frame.count,1);
  const box=(east:number,base:number,north:number,w:number,h:number,d:number)=>{
    const matrix=new Matrix4().makeScale(w,h,d);
    matrix.setPosition(east,base+h/2,-north);
    return matrix;
  };
  const assertMatrix=(actual:Matrix4,expected:Matrix4)=>actual.elements.forEach((value,index)=>
    assert.ok(Math.abs(value-expected.elements[index]!)<1e-4));
  let index=0;
  const actual=new Matrix4();
  for(let x=-30;x<=30;x+=2.4){
    if(Math.abs(x+1.2)<5.5)continue;
    parapets.getMatrixAt(index++,actual);
    assertMatrix(actual,box(x+1.2,assembly.arrivalHeight,-.6,2.4,.9,.5));
  }
  for(let i=0;i<edge.puffCount;i++){
    const t=i/(edge.puffCount-1);
    const east=-34+68*t+((i*37)%5-2);
    const north=-4-((i*53)%10);
    const w=3+((i*29)%3);
    const h=1+((i*17)%2)*.5;
    const base=assembly.arrivalHeight-3+((i*11)%4);
    clouds.getMatrixAt(i,actual);
    assertMatrix(actual,box(east,base,north,w,h,2.5));
  }
  const approach=assembly.cable.ropes[0]!.dock('cloud-deck').approach;
  assert.deepEqual(edge.sign,{east:approach.east,north:approach.north-1.5,height:assembly.arrivalHeight});
  frame.getMatrixAt(0,actual);
  assertMatrix(actual,box(approach.east,assembly.arrivalHeight,approach.north-1.5,.12,1.1,.9));
  assert.equal((parapets.geometry as {parameters:{width:number}}).parameters.width,1);
  assert.equal((parapets.material as {color:{getHexString():string}}).color.getHexString(),'6d7276');
  assert.equal((clouds.material as {color:{getHexString():string}}).color.getHexString(),'eef3f6');
  assert.equal((frame.material as {color:{getHexString():string}}).color.getHexString(),'5d4630');

  const resources=new Set<BufferGeometry|Material|Texture>();
  for(const mesh of meshes){
    resources.add(mesh.geometry);
    if(!Array.isArray(mesh.material)){
      resources.add(mesh.material);
      const map=(mesh.material as {map?:Texture}).map;
      if(map)resources.add(map);
    }
  }
  let releases=0;
  for(const resource of resources)resource.addEventListener('dispose',()=>{releases++;});
  edge.dispose();
  edge.dispose();
  assert.equal(edge.group.children.length,0);
  assert.equal(edge.group.parent,null);
  assert.equal(releases,resources.size,'every shared geometry/material is released exactly once');
});

test('terrace dock sign keeps its Canvas wording and world transform in the four-draw batch',context=>{
  const calls:{text:string;east:number;baseline:number}[]=[];
  const canvas={width:0,height:0,getContext(){return {
    fillStyle:'',textAlign:'',font:'',
    fillRect(){},fillText(text:string,east:number,baseline:number){calls.push({text,east,baseline});},
  };}};
  const owner=new Group(),assembly=mountMainSummitAssembly(owner,0);
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas}});
  let edge!:ReturnType<typeof mountMainSummitTerraceEdge>;
  try{
    edge=mountMainSummitTerraceEdge(assembly);
    owner.add(edge.group);
    context.after(()=>{edge.dispose();assembly.dispose();});
  }finally{
    if(previous)Object.defineProperty(globalThis,'document',previous);
    else Reflect.deleteProperty(globalThis,'document');
  }
  assert.deepEqual(calls,[
    {text:'云海台',east:256,baseline:104},
    {text:'缆车二线',east:256,baseline:188},
  ]);
  const meshes:Mesh[]=[];
  edge.group.traverse(object=>{if(object instanceof Mesh)meshes.push(object);});
  assert.equal(meshes.length,4);
  const face=edge.group.getObjectByName('terrace-edge-sign-face');
  assert.ok(face instanceof Mesh);
  assert.ok(!(face instanceof InstancedMesh),'the text remains a readable Canvas plane');
  assert.equal(face.position.x,edge.sign.east);
  assert.equal(face.position.y,assembly.arrivalHeight+.62);
  assert.equal(face.position.z,-edge.sign.north+.07);
  assert.equal(face.rotation.y,Math.PI);
  const material=face.material as MeshBasicMaterial;
  assert.equal(material.map!.colorSpace,SRGBColorSpace);
  const resources=new Set<BufferGeometry|Material|Texture>();
  for(const mesh of meshes){
    resources.add(mesh.geometry);
    if(!Array.isArray(mesh.material)){
      resources.add(mesh.material);
      const map=(mesh.material as {map?:Texture}).map;
      if(map)resources.add(map);
    }
  }
  let releases=0;
  for(const resource of resources)resource.addEventListener('dispose',()=>{releases++;});
  edge.dispose();
  edge.dispose();
  assert.equal(releases,resources.size,'the Canvas texture is released with the shared batch resources');
});
