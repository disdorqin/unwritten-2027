import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Raycaster,Vector3,type Mesh,type MeshStandardMaterial} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
const grid=createTerrainGrid();
const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const site=road.outerWorks.sites.find(s=>s.id==='smelter-plant')!;
const f=387*Math.PI/180;
test('B90 smelter: real roof vertices follow both long-axis slopes, not disconnected slabs',()=>{
  let left=0,right=0;
  road.outerWorks.group.traverse(o=>{
    const m=o as Mesh;
    if(!m.isMesh||Array.isArray(m.material)||(m.material as MeshStandardMaterial).name!=='crater-outer-slate')return;
    const p=m.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){
      const de=p.getX(i)-site.east,dn=-p.getZ(i)-site.north;
      const x=de*Math.cos(f)-dn*Math.sin(f),z=de*Math.sin(f)+dn*Math.cos(f),h=p.getY(i)-site.height;
      if(Math.abs(x)>15||Math.abs(z)>7||h<12.2||h>19.4)continue;
      const expected=12.9+5.55*(1-Math.abs(z)/6.35);
      assert.ok(Math.abs(h-expected)<.43,JSON.stringify({x,z,h,expected}));
      if(z<-.1)left++;if(z>.1)right++;
    }
  });
  assert.ok(left>1000&&right>1000,JSON.stringify({left,right}));
});
test('B90 smelter: outside-bowl approach clears registered structural boxes, nine facade rays unobstructed',()=>{
  const route=[[-68,142],[-98,127],[-110,124],[-126,123],[-152,124]];
  for(let j=1;j<route.length;j++){
    const a=route[j-1],b=route[j],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*4);
    for(let i=0;i<=steps;i++){
      const e=a[0]+(b[0]-a[0])*i/steps,n=a[1]+(b[1]-a[1])*i/steps,y=road.heightAt(e,n);
      assert.ok(y!==undefined);
      assert.ok(Math.hypot(e-road.anchor.east,n-road.anchor.north)>61.5);
      assert.ok(!road.outerWorks.colliders.concat(road.mouthWorks.colliders).some(box=>e+.65>box.min[0]&&e-.65<box.max[0]&&-n+.65>box.min[2]&&-n-.65<box.max[2]&&y+1.8>box.min[1]&&y+.1<box.max[1]),JSON.stringify({e,n}));
    }
  }
  road.group.updateMatrixWorld(true);
  const o=new Vector3(-152,road.heightAt(-152,124)!+1.65,-124);
  for(const x of [-9,0,9])for(const h of [4,9,15]){
    const target=new Vector3(site.east+Math.cos(f)*x+Math.sin(f)*5.8,site.height+h,-(site.north-Math.sin(f)*x+Math.cos(f)*5.8));
    const d=target.clone().sub(o),l=d.length();
    const hit=new Raycaster(o,d.normalize(),0,l-.4).intersectObject(road.group,true)[0];
    assert.ok(!hit,JSON.stringify({x,h,hit:hit?.distance}));
  }
});
