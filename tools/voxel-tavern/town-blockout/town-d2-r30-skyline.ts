import {BufferGeometry,Float32BufferAttribute,Color} from 'three';
import {mainSummitBounds} from './main-summit-block';
import {buildTownD2R30ChunkGeometry} from './town-d2-r30-massif';

/** Distant town view uses the real D2 sampler and palette. The outer
 * tapered foot is render-only, outside the town, not a second height authority. */
export function buildR30TownSkyline(){
 const {west,east,north}=mainSummitBounds,south=600;
 const top=buildTownD2R30ChunkGeometry({key:'town-skyline',row:0,column:0,west,east,south,north,centreEast:0,centreNorth:(south+north)/2},32,347);
 const positions=Array.from(top.getAttribute('position').array),colors=Array.from(top.getAttribute('color').array),indices=Array.from(top.getIndex()!.array);
 const topCount=positions.length/3;
 const edges=new Map<string,[number,number]>();
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]!,b=indices[i+1]!,c=indices[i+2]!;
  for(const [u,v] of [[a,b],[b,c],[c,a]] as const){
   const key=Math.min(u,v)+':'+Math.max(u,v);
   if(!edges.delete(key))edges.set(key,[u,v]);
  }
 }
 const feet=new Map<number,number>(),stone=new Color('#404b55');
 function foot(i:number){
  const found=feet.get(i);if(found!==undefined)return found;
  const e=positions[i*3]!,n=-positions[i*3+2]!,mid=(south+north)/2;
  const id=positions.length/3;
  positions.push(e*1.22,-100,-(n+140*(n-mid)/(north-mid)));
  colors.push(stone.r,stone.g,stone.b);feet.set(i,id);return id;
 }
 for(const [a,b] of edges.values()){const f=foot(a),g=foot(b);indices.push(a,f,b,b,f,g)}
 const result=new BufferGeometry();
 result.name='town-d2-r30-same-source-skyline';
 result.setAttribute('position',new Float32BufferAttribute(positions,3));
 result.setAttribute('color',new Float32BufferAttribute(colors,3));
 result.setIndex(indices);result.computeVertexNormals();result.computeBoundingSphere();
 result.userData.r30TopVertexCount=topCount;
 top.dispose();return result;
}
