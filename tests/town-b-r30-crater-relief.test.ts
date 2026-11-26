import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Mesh,Raycaster,Vector3} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createMeteorCrater,meteorCraterFixturePlan} from '../tools/voxel-tavern/town-blockout/meteor-crater';
import {bR30CraterBed,bR30VisibleLipRadius,bR30HaulCrossSection} from '../tools/voxel-tavern/town-blockout/town-b-r30-crater-relief';
import {createCraterBrokenCircleHeightField,craterBrokenCircleFeatures} from '../tools/voxel-tavern/town-blockout/town-c2-crater-broken-circle';
import {townC2CraterCentralMoundProtectedSites} from '../tools/voxel-tavern/town-blockout/town-c2-crater-central-mound';
import {bR30MoundTrailWear} from '../tools/voxel-tavern/town-blockout/town-b-r30-mound-route';

test('R30 asymmetric bed has no exterior seam shift or deeper hidden floor',()=>{
  const heights:number[]=[],lips:number[]=[];
  for(let i=0;i<120;i++){
    const a=i*Math.PI/60;
    lips.push(bR30VisibleLipRadius(a));
    assert.ok(Math.abs(bR30CraterBed(20*Math.sin(a),20*Math.cos(a))!+35)<1e-10);
    assert.ok(Math.abs(bR30CraterBed(55*Math.sin(a),55*Math.cos(a))!)<1e-7);
    for(let r=21;r<55;r++){
      const h=bR30CraterBed(r*Math.sin(a),r*Math.cos(a))!;
      assert.ok(h>=-35&&h<=0&&Number.isFinite(h));
      if(r===40)heights.push(h);
    }
  }
  assert.ok(Math.max(...lips)<=55 && Math.max(...lips)-Math.min(...lips)>3);
  assert.ok(Math.max(...heights)-Math.min(...heights)>5);
  assert.equal(bR30CraterBed(56,0),undefined);
});

test('R30 production west mount uses one final surface and retains the real route and shaft datum',t=>{
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw);
  const mesh=road.group.getObjectByName('meteor-crater-walk-mesh') as Mesh;
  assert.equal(mesh.userData.bR30UnifiedRelief,true);
  const wear=mesh.geometry.getAttribute('aCraterMoundWear'),vertices=mesh.geometry.getAttribute('position');
  assert.equal(wear.count,vertices.count);
  let marked=0;
  for(let i=0;i<wear.count;i++){
    const v=wear.getX(i);assert.ok(Number.isFinite(v)&&v>=0&&v<=1);
    if(v>.1){marked++;assert.ok(vertices.getY(i)>-35,'wear stays on raised slope');}
  }
  assert.ok(marked>20&&marked<wear.count*.05,'local footpath, not broad recoloring');
  assert.equal(bR30MoundTrailWear({east:-120,north:196},7.5,0),1);
  assert.equal(bR30MoundTrailWear({east:-120,north:185},0,0),0);
  assert.equal(bR30MoundTrailWear({east:-120,north:196},7.5,1),0);
  assert.equal(road.centralMound.meshes.length,0);
  assert.equal(road.brokenCircle.group.children.length,0);
  const fixture=createMeteorCrater(meteorCraterFixturePlan);
  const world=(e:number,n:number)=>({east:a.east+e*c+n*s,north:a.north+n*c-e*s});
  let maxGrade=0,error=0;
  for(const offset of [0,-.27,.27]){
    let prev:{east:number;north:number;height:number}|undefined;
    for(let i=0;i<=1500;i++){
      const p=fixture.mainTrailPoint(i/1500);
      const scale=1+offset/Math.hypot(p.east,p.north);
      const q=world(p.east*scale,p.north*scale);
      const h=road.heightAt(q.east,q.north);
      assert.notEqual(h,undefined);
      error=Math.max(error,Math.abs(h!-a.rimHeight-p.heightOffset));
      if(prev)maxGrade=Math.max(maxGrade,Math.abs(h!-prev.height)/Math.hypot(q.east-prev.east,q.north-prev.north));
      prev={...q,height:h!};
    }
  }
  assert.ok(maxGrade<.1,'the old surveyed road must remain <=10% grade');
  assert.ok(error<.003,'actual foot surface must preserve the surveyed tread');
  for(const [name,p] of Object.entries(townC2CraterCentralMoundProtectedSites)){
    assert.ok(Math.abs(road.heightAt(p.east,p.north)!-(a.rimHeight-35))<.01,name);
  }
  assert.ok(Math.abs(road.heightAt(-120,196)!-(a.rimHeight-35+7.5))<.05);
  // C review: protect the entire 3.3m lamp-room footprint plus .4m
  // player clearance, not merely the fixture centre. Sample final triangles.
  const lamp=townC2CraterCentralMoundProtectedSites.lampRoom;
  let lampError=0,lampCount=0;
  for(let e=-3.7;e<=3.7;e+=.05)for(let n=-3.7;n<=3.7;n+=.05){
    if(Math.hypot(e,n)>3.7)continue;
    lampError=Math.max(lampError,Math.abs(road.heightAt(lamp.east+e,lamp.north+n)!-(a.rimHeight-35)));lampCount++;
  }
  assert.ok(lampError<.01,'complete C lamp-room clearance');
  // The first 1.3m at the haul outlet is a transition, not an asserted
  // flat pad. Measure the entire C 2.5m-width route separately from B01.
  const approach=road.winch!.survey.descentApproach;
  let edgeGrade=0,edgeRise=0,centreGrade=0,routeCount=0;
  for(let k=1;k<approach.length;k++){
    const p=approach[k-1],q=approach[k],de=q.east-p.east,dn=q.north-p.north,len=Math.hypot(de,dn);
    for(let j=-25;j<=25;j++){
      const off=j*.05;let previous:number|undefined;
      for(let d=0;d<=len;d+=.05){
        const h=road.heightAt(p.east+(de*d-dn*off)/len,p.north+(dn*d+de*off)/len)!;
        assert.ok(Number.isFinite(h));routeCount++;
        edgeRise=Math.max(edgeRise,Math.abs(h-(a.rimHeight-35)));
        if(previous!==undefined){const grade=Math.abs(h-previous)/.05;edgeGrade=Math.max(edgeGrade,grade);if(j===0)centreGrade=Math.max(centreGrade,grade);}
        previous=h;
      }
    }
  }
  // Guard against a new step at the outlet. 15% is a regression ceiling,
  // not a new approved road grade; report actual edge and centre grades.
  assert.ok(edgeRise<.12&&edgeGrade<.15&&centreGrade<.1);
  t.diagnostic(JSON.stringify({lampCount,lampError,routeCount,edgeRise,edgeGrade,centreGrade}));
  road.group.updateMatrixWorld(true);
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  let rayError=0;
  for(let i=0;i<48;i++){
    const r=21+i%12*2.4,q=world(r*Math.sin(i*.83),r*Math.cos(i*.83));
    ray.ray.origin.set(q.east,a.rimHeight+5,-q.north);
    const hit=ray.intersectObject(mesh)[0];
    assert.ok(hit);
    rayError=Math.max(rayError,Math.abs(hit.point.y-road.heightAt(q.east,q.north)!));
  }
  assert.ok(rayError<1e-5,'walk support must be the rendered post-cut triangles');
  t.diagnostic('mesh '+mesh.geometry.index!.count/3+' triangles; route grade '+maxGrade+'; ray error '+rayError);
});
test('R30 three fans/five gullies are continuous features, not a new collision layer on the road',()=>{
  const field=createCraterBrokenCircleHeightField({east:-120,north:185,rimHeight:10.7773,yaw:1.36},{continuous:true});
  assert.equal(craterBrokenCircleFeatures.filter(f=>f.kind==='collapse').length,3);
  assert.equal(craterBrokenCircleFeatures.filter(f=>f.kind==='gully').length,5);
  const fixture=createMeteorCrater(meteorCraterFixturePlan);
  for(let i=1;i<100;i++){
    const p=fixture.mainTrailPoint(i/100);
    assert.equal(field.localHeightOffsetAt(p.east,p.north),0);
    assert.ok(bR30HaulCrossSection(p.east,p.north).distance<1e-9);
  }
  let positive=0,negative=0;
  for(let n=-54;n<=54;n+=.5)for(let e=-54;e<=54;e+=.5){
    const v=field.localHeightOffsetAt(e,n);
    if(v>.1)positive++;
    if(v<-.1)negative++;
  }
  assert.ok(positive>50 && negative>50);
});
