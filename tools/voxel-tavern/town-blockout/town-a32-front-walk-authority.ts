import type {Group} from 'three';
import {readWalkGeometry,type Box} from './landmark-kit';
import {createNightBFrontFloorSupport} from './town-night-b-front-floor-support';
type Ground=(e:number,n:number)=>number|undefined;
/** Actual mounted floor/solid boxes, retaining the viewer's clearance. */
export function createA32FrontWalkAuthority(groups:readonly Group[],ground:Ground){
 const cells=new Map<string,{floors:Box[];solids:Box[];support?:Ground}>(),cellSize=8;
 const relevant=(b:Box)=>b.max[0]!>=270&&b.min[0]!<=580&&-b.min[2]!>=290&&-b.max[2]!<=680;
 function add(b:Box,floor:boolean){
  if(!relevant(b))return;
  for(let e=Math.floor((b.min[0]!-.5)/cellSize);e<=Math.floor((b.max[0]!+.5)/cellSize);e++)
   for(let n=Math.floor((-b.max[2]!-.5)/cellSize);n<=Math.floor((-b.min[2]!+.5)/cellSize);n++){
    const k=e+','+n,c=cells.get(k)??{floors:[],solids:[]};if(!cells.has(k))cells.set(k,c);c.solids.push(b);if(floor)c.floors.push(b);
   }
 }
 for(const group of groups){const w=readWalkGeometry(group);w.floors.forEach(b=>add(b,true));w.colliders.forEach(b=>add(b,false));}
 const cell=(e:number,n:number)=>cells.get(Math.floor(e/cellSize)+','+Math.floor(n/cellSize));
 const fallback=createNightBFrontFloorSupport(ground,[]);
 return {supportAt(e:number,n:number){const c=cell(e,n);if(!c)return fallback(e,n);c.support??=createNightBFrontFloorSupport(ground,c.floors);return c.support(e,n);},
 blocked(e:number,n:number,h:number,r=.27,body=1.8){return (cell(e,n)?.solids??[]).some(b=>h+.025<b.max[1]!&&h+body-.025>b.min[1]!&&Math.hypot(Math.max(0,b.min[0]!-e,e-b.max[0]!),Math.max(0,b.min[2]!+n,-n-b.max[2]!))<r);}};
}
