import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Group, Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildCraterRailExtension } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';

const grid=createTerrainGrid();
const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
function heightsAround(group:Group,east:number,north:number,radius:number,datum:number) {
  const samples:number[]=[];
  group.traverse(node=>{
    if(!(node as Mesh).isMesh)return;
    const vertices=(node as Mesh).geometry.getAttribute('position');
    if(!vertices)return;
    for(let i=0;i<vertices.count;i++){
      const e=vertices.getX(i),n=-vertices.getZ(i);
      if(Math.hypot(e-east,n-north)<radius)samples.push(vertices.getY(i)-datum);
    }
  });
  return samples;
}

test('A-4: 28m smelter hall reads >=15m and the independent 10m furnace remains',()=>{
  const smelter=road.outerWorks.sites.find(s=>s.id==='smelter-plant');
  assert.ok(smelter);
  const z=heightsAround(road.outerWorks.group,smelter.east,smelter.north,16,smelter.height);
  assert.ok(z.length>1500);
  assert.ok(z.filter(v=>v>=15).length>100,'main hall gable is still the low old roof');
  assert.ok(Math.max(...z)>=19&&Math.max(...z)<=24,'chimney and hall size out of reference scale');
  assert.ok(road.outerWorks.sites.some(s=>s.id==='smelter-furnace-plate'),
    'do not discard furnace sign and its approved text');
});

test('A-4: instrument 20m two-storey factory has >=15m ridge and near-double chimney',()=>{
  const site=road.outerWorks.sites.find(s=>s.id==='instrument-plant');
  assert.ok(site);
  const heights=heightsAround(road.outerWorks.group,site.east,site.north,16,site.height);
  assert.ok(heights.filter(v=>v>=15).length>=100,'instrument roof remains below 15m');
  const cap=Math.max(...heights);
  assert.ok(cap>=32&&cap<=36,`chimney ${cap.toFixed(2)}m is not double high roof`);
  assert.ok(road.outerWorks.sites.some(s=>s.id==='instrument-duty-roster'));
});

test('A-4: supply station retains open doorway, actual roof texture layers and warm lights',()=>{
  const site=road.mouthWorks.sites.find(s=>s.id==='supply-station');
  assert.ok(site);
  const group=road.mouthWorks.group;
  const heights=heightsAround(group,site.east,site.north,6.5,site.height);
  assert.ok(heights.some(v=>v>4.2&&v<6.2),'wood-snow supply roof missing');
  assert.ok(road.mouthWorks.actions.some(a=>a.id==='telescope'));
  assert.ok(road.mouthWorks.actions.some(a=>a.id==='map'));
});

test('A-4: original crater-mouth station retains Kengkou timetable and correct branch alignment',()=>{
  const extension=buildCraterRailExtension(grid,road);
  const station=extension.alignment.stations.find(s=>s.id.includes('kengkou'));
  assert.ok(station,'Kengkou station is not registered with original track');
  const board=extension.alignment.boards.find(s=>s.id==='kengkou-timetable-wall');
  assert.ok(board,'Kengkou timetable wall removed');
  const heights=heightsAround(extension.group,station.east,station.north,12,station.railY);
  assert.ok(heights.some(v=>v>2.4&&v<3.5),'new timber-snow gable absent');
  assert.ok(extension.group.children.length>0);
});
