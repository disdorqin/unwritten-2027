import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mesh, MeshStandardMaterial, DataTexture } from 'three';
import { buildCraterMouthWorks } from '../tools/voxel-tavern/town-blockout/town-crater-mouth-works';

const anchor={east:-120,north:185,rimHeight:12,yaw:1.364};
const mouth=buildCraterMouthWorks({anchor,heightAt:()=>12});
const site=mouth.sites.find(s=>s.id==='supply-station')!;
const facing=330*Math.PI/180;
const roofY=3.55;
type P={x:number;z:number;y:number};
function localParts(name:string):{points:P[];map:DataTexture}{
  let map:DataTexture|undefined; const points:P[]=[];
  mouth.group.traverse(obj=>{
    const mesh=obj as Mesh;
    if(!mesh.isMesh||Array.isArray(mesh.material))return;
    const material=mesh.material as MeshStandardMaterial;
    if(material.name!==name)return;
    map=material.map as DataTexture;
    const attr=mesh.geometry.getAttribute('position');
    for(let i=0;i<attr.count;i++){
      const de=attr.getX(i)-site.east,dn=-attr.getZ(i)-site.north;
      points.push({x:de*Math.cos(facing)-dn*Math.sin(facing),
        z:de*Math.sin(facing)+dn*Math.cos(facing),y:attr.getY(i)-site.height});
    }
  });
  assert.ok(map&&points.length>0,name);
  return {points,map};
}
test('B89 supply cabin: joined timber front panels actually align with the left and right collision envelopes',()=>{
  const {points}=localParts('supply-cabin-joined-timber');
  for(const s of [-1,1]){
    const vertices=points.filter(p=>Math.abs(p.x-s*2.55)<1.18&&Math.abs(p.z-2.8)<.13&&p.y<3.6);
    assert.ok(vertices.length>=18,'missing aligned front segment '+s);
    assert.ok(vertices.some(p=>p.y<.90)&&vertices.some(p=>p.y>3.45));
  }
  assert.ok(!points.some(p=>Math.abs(p.x)<1.3&&p.z>2.65&&p.z<3&&p.y<2.65),'door must remain open');
});
test('B89 supply cabin: both gabled roof planes, tiles and ridge are coherent on a common slope',()=>{
  const {points}=localParts('supply-cabin-continuous-shingles');
  assert.ok(points.length>=900,'full tiled roof, not a token panel');
  const halfRun=4.13,rise=1.52;
  for(const p of points){
    assert.ok(Math.abs(p.x)<4.32&&p.z>-3.25&&p.z<.32,'roof part drifts from its footprint');
    const surface=roofY+rise*(1-Math.abs(p.x)/halfRun);
    assert.ok(p.y-surface>-.09&&p.y-surface<.36,'disconnected floating shingles');
  }
  for(const s of [-1,1]){
    for(let row=0;row<6;row++){
      const x=s*halfRun*(1-(row+.5)/6);
      assert.ok(points.some(p=>Math.abs(p.x-x)<.52&&p.y>roofY),'missing slope row');
    }
  }
});
test('B89 supply cabin: 32x32 warm wood strips and staggered shingles replace isolated square flecks',()=>{
  for(const name of ['supply-cabin-joined-timber','supply-cabin-continuous-shingles']){
    const {map}=localParts(name);
    const data=map.image as {width:number;height:number;data:Uint8Array};
    assert.equal(data.width,32);assert.equal(data.height,32);
    const colors=new Set<number>();
    for(let i=0;i<data.data.length;i+=4)colors.add(data.data[i]*65536+data.data[i+1]*256+data.data[i+2]);
    assert.equal(colors.size,3);
    for(let x=0;x<32;x++){
      const i=4*x;
      assert.deepEqual(Array.from(data.data.slice(i,i+3)),Array.from(data.data.slice(0,3)),'row seam is continuous');
    }
  }
});
