import {Color,Float32BufferAttribute,Mesh} from 'three';
import type {buildSouthReviewWorld} from './town-night-a-summit-r1-review-world';
import {proposeSouthRoadGrade} from './town-night-a-summit-road-grade';
import {mountSouthEarthworks} from './town-night-a-summit-road-earthworks';
import {buildMainSummitTrailCut} from './main-summit-trail-cut';
/** Independent actual cut review; no production duplicate terrain or
 * alternative domain. The source and cut are the exact same 8m triangles. */
export function mountSouthEarthworkReview(w:ReturnType<typeof buildSouthReviewWorld>){
 const p=w.trail.points,r=proposeSouthRoadGrade(p,1,834,w.collision.surfaceAt);
 if(!r.ok)throw Error('Uncertified grade');
 const points=[...p.slice(0,1),...r.profile,...p.slice(835)];
 const road=mountSouthEarthworks(points,1,834,w.collision.surfaceAt);
 const terrain=w.group.getObjectByName('night-a-review-canonical-terrain')!;
 const ice=new Color('#cbd9df'),grass=new Color('#849080'),stone=new Color('#747d83'),tint=new Color();
 let cutChunks=0,refined=0,lowered=0;
 for(const child of terrain.children){
  if(!(child instanceof Mesh))continue;
  const g=child.geometry;g.computeBoundingBox();const b=g.boundingBox!;
  if(!r.profile.some(p=>p.east>=b.min.x-4&&p.east<=b.max.x+4&&-p.north>=b.min.z-4&&-p.north<=b.max.z+4))continue;
  const cut=buildMainSummitTrailCut(g,road.cutTread);
  if(!cut.refinedTriangles){cut.geometry.dispose();continue;}
  const pos=cut.geometry.getAttribute('position'),colors:number[]=[];
  for(let i=0;i<pos.count;i++){
   const e=pos.getX(i),n=-pos.getZ(i),h=pos.getY(i);
   const base=w.collision.surfaceAt(e,n)??h;
   const slope=Math.hypot((w.collision.surfaceAt(Math.min(e+8,1100),n)??base)-base,(w.collision.surfaceAt(e,Math.min(n+8,1790))??base)-base)/8;
   tint.copy(grass).lerp(ice,Math.min(.95,.33+Math.max(0,h-240)/480)).lerp(stone,Math.min(.8,Math.max(0,slope-.22)*1.2));
   if(base-h>.15)tint.lerp(stone,.55);
   tint.multiplyScalar(.96+.04*Math.cos(e*.045+n*.028));colors.push(tint.r,tint.g,tint.b);
  }
  cut.geometry.setAttribute('color',new Float32BufferAttribute(colors,3));child.geometry=cut.geometry;g.dispose();
  cutChunks++;refined+=cut.refinedTriangles;lowered+=cut.loweredVertices;
 }
 w.road.group.visible=false;w.group.add(road.group);
 return {road,points,stats:{...road.stats,cutChunks,refined,lowered},cameraAt(i:number){
  const a=points[i]!,b=points[i+16]!,h=road.supportAt(a.east,a.north)!;
  return [a.east,a.north,h+1.8,b.east,b.north,b.height+1.45] as const;
 },dispose:road.dispose};
}
