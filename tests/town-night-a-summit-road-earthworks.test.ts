import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,Raycaster,Vector3,DoubleSide} from 'three';
import {buildSouthReviewWorld} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-r1-review-world';
import {proposeSouthRoadGrade} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-road-grade';
import {mountSouthEarthworks} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-road-earthworks';
import {buildMainSummitTrailCut} from '../tools/voxel-tavern/town-blockout/main-summit-trail-cut';
test('833m road candidate uses the real canonical cut and supported continuous tread',()=>{
 const w=buildSouthReviewWorld(),old=w.trail.points,r=proposeSouthRoadGrade(old,1,834,w.collision.surfaceAt);
 assert.ok(r.ok);if(!r.ok)throw Error('grade failed');
 const points=[...old.slice(0,1),...r.profile,...old.slice(835)];
 const road=mountSouthEarthworks(points,1,834,w.collision.surfaceAt);
 const mat=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
 // All 8m source cells touched by the road plus one cell margin. Use
 // actual D2 lattice origin -1100/-10 and exact triangle diagonal.
 const tiles=new Set<string>();
 for(const p of r.profile)for(let dx=-1;dx<=1;dx++)for(let dn=-1;dn<=1;dn++)tiles.add((Math.floor((p.east+1100)/8)+dx)+','+(Math.floor((p.north+10)/8)+dn));
 const pos:number[]=[],idx:number[]=[],map=new Map<string,number>();
 const vertex=(x:number,z:number)=>{const key=x+','+z;let i=map.get(key);if(i===undefined){const e=-1100+x*8,n=-10+z*8;i=pos.length/3;map.set(key,i);pos.push(e,w.collision.surfaceAt(e,n)!,-n);}return i;};
 for(const k of tiles){const [x,z]=k.split(',').map(Number) as [number,number];const a=vertex(x,z),b=vertex(x+1,z),c=vertex(x,z+1),d=vertex(x+1,z+1);idx.push(a,b,c,b,d,c);}
 const source=new BufferGeometry();source.setAttribute('position',new Float32BufferAttribute(pos,3));source.setIndex(idx);source.computeVertexNormals();
 const result=buildMainSummitTrailCut(source,road.cutTread);
 const ground=new Mesh(result.geometry,mat);ground.updateMatrixWorld(true);road.group.updateMatrixWorld(true);
 let samples=0,maxError=0,maxOcclusion=0;
 try{
  assert.ok(result.refinedTriangles>0&&result.loweredVertices>0);
  for(let i=2;i<834;i+=3){
   const a=points[i]!,b=points[i+1]!,dx=b.east-a.east,dn=b.north-a.north,l=Math.hypot(dx,dn);
   for(const t of [-1.15,0,1.15]){
    const e=(a.east+b.east)/2-dn/l*t,n=(a.north+b.north)/2+dx/l*t;
    const h=road.supportAt(e,n);assert.notEqual(h,undefined,JSON.stringify({i,t}));
    ray.ray.origin.set(e,900,-n);
    const cut=ray.intersectObject(ground,false)[0];assert.ok(cut);
    maxOcclusion=Math.max(maxOcclusion,cut.point.y-h!);
    assert.ok(cut.point.y<h!+.001,JSON.stringify({i,t,terrain:cut.point.y,tread:h}));
    const tread=ray.intersectObjects(road.group.children.filter(m=>m.name.endsWith(':tread')),false)[0];assert.ok(tread);
    maxError=Math.max(maxError,Math.abs(tread.point.y-h!));
    assert.ok(Math.abs(tread.point.y-h!)<.001);
    assert.equal(road.blocked(e,n,h!),false);samples++;
   }
  }
  assert.ok(road.stats.length>832&&road.stats.maxGrade<.12&&road.stats.railMetres>300);
  assert.ok(road.stats.railPosts>75);
  let protectedEdges=0;
  for(let i=2;i<834;i++){
   const a=points[i-1]!,b=points[i]!,prev=points[i-2]!,next=points[i+1]!;
   for(const sign of [-1,1]){
    const edge=(p:typeof a,lo:typeof a,hi:typeof a,t:number)=>{const dx=hi.east-lo.east,dn=hi.north-lo.north,l=Math.hypot(dx,dn);return {east:p.east-dn/l*t*sign,north:p.north+dx/l*t*sign,height:p.height+.055};};
    const l=edge(a,prev,b,1.5),r=edge(b,a,next,1.5);
    if(Math.max(l.height-w.collision.surfaceAt(l.east,l.north)!,r.height-w.collision.surfaceAt(r.east,r.north)!)<=.9)continue;
    const u=edge(a,prev,b,1.72),v=edge(b,a,next,1.72);
    assert.ok(road.blocked((u.east+v.east)/2,(u.north+v.north)/2,(u.height+v.height)/2));protectedEdges++;
   }
  }
  assert.ok(protectedEdges>300);
  // Dense player-foot sweep along the actual 833m tread, including
  // inside corners where a non-adjacent rail may cross the walking band.
  let walkingSamples=0;
  for(let i=2;i<=834;i++){
   const a=points[i-1]!,b=points[i]!,prev=points[i-2]!,next=points[i+1]!;
   const at=(p:typeof a,lo:typeof a,hi:typeof a,t:number)=>{const dx=hi.east-lo.east,dn=hi.north-lo.north,l=Math.hypot(dx,dn);return {e:p.east-dn/l*t,n:p.north+dx/l*t};};
   for(const f of [.125,.375,.625,.875])for(const t of [-1,-.5,0,.5,1]){
    const u=at(a,prev,b,t),v=at(b,a,next,t);
    const e=u.e+(v.e-u.e)*f,n=u.n+(v.n-u.n)*f,h=road.supportAt(e,n);
    assert.notEqual(h,undefined,JSON.stringify({i,f,t}));
    assert.equal(road.blocked(e,n,h!),false,JSON.stringify({i,f,t,e,n,h}));walkingSamples++;
   }
  }
  assert.equal(walkingSamples,16660);
  console.log(JSON.stringify({road:road.stats,sourceTriangles:idx.length/3,refined:result.refinedTriangles,lowered:result.loweredVertices,samples,maxError,maxOcclusion}));
 }finally{source.dispose();result.geometry.dispose();mat.dispose();road.dispose();w.dispose();}
});
