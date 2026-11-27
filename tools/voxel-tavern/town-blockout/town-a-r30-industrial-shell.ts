import type {MeshStandardMaterial} from 'three';
import {orientedSupportBox,type OrientedSupportBox} from './town-a-r30-oriented-support';
type Frame={yaw:number;at(x:number,z:number):{east:number;north:number}};
type Put=(mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number)=>void;
export type IndustryPoint=Readonly<{east:number;north:number;height:number}>;
export type IndustryWindow=Readonly<{side:1|-1;x:number;width:number;low:number;high:number}>;
type WindowSet=Readonly<{openings:readonly IndustryWindow[];frame:MeshStandardMaterial;glass:MeshStandardMaterial}>;
export function industrialBuilder(fr:Frame,g:number,put:Put,colliders:OrientedSupportBox[],floors:OrientedSupportBox[]){
  const point=(x:number,z:number,y:number):IndustryPoint=>({...fr.at(x,z),height:g+y});
  function piece(mat:MeshStandardMaterial,x:number,z:number,w:number,d:number,low:number,high:number,standable=false){
    put(mat,x,g+(low+high)/2,z,w,high-low,d);
    const p=fr.at(x,z);
    (standable?floors:colliders).push(orientedSupportBox(p.east,p.north,fr.yaw,w,d,g+low,g+high));
  }
  function slab(mat:MeshStandardMaterial,x:number,z:number,w:number,d:number,top:number,thickness=.16){
    piece(mat,x,z,w,d,top-thickness,top,true);
  }
  /** Panels, never a full solid block. The opening is explicitly left out
   * of both the rendered wall and the exact collision footprint. */
  function shell(mat:MeshStandardMaterial,w:number,d:number,base:number,top:number,doorX:number,doorW:number,doorH:number,windows?:WindowSet){
    const t=.24;
    // Each facade is a wall with real apertures, not a box behind a picture.
    // Split at opening jambs, then emit only the solid vertical intervals.
    for(const side of [1,-1] as const){
      const z=side*(d/2-t/2);
      const openings=[...(windows?.openings??[]).filter(o=>o.side===side)];
      if(side===1&&doorW>0)openings.push({side,x:doorX,width:doorW,low:base,high:base+doorH});
      const cuts=[...new Set([-w/2,w/2,...openings.flatMap(o=>[o.x-o.width/2,o.x+o.width/2])])].sort((a,b)=>a-b);
      if(cuts[0]!==-w/2||cuts.at(-1)!==w/2||openings.some(o=>o.low<base||o.high>top||o.low>=o.high||o.width<=0))throw new RangeError('Invalid facade aperture');
      for(let i=1;i<cuts.length;i++){
        const a=cuts[i-1]!,b=cuts[i]!,x=(a+b)/2;
        let y=base;
        const gaps=openings.filter(o=>Math.abs(x-o.x)<o.width/2).sort((a,b)=>a.low-b.low);
        for(const o of gaps){if(o.low>y)piece(mat,x,z,b-a,t,y,o.low);y=Math.max(y,o.high);}
        if(top>y)piece(mat,x,z,b-a,t,y,top);
      }
      for(const o of windows?.openings??[]){
        if(o.side!==side)continue;
        const mid=(o.low+o.high)/2,h=o.high-o.low;
        // Frosted glazing is closed and collision-bearing, while the
        // surround and mullions are real timber elements on both sides.
        piece(windows!.glass,o.x,z,o.width,.07,o.low,o.high);
        for(const s of [-1,1]){
          put(windows!.frame,o.x+s*(o.width/2-.06),g+mid,z,.12,h+.16,.32);
          put(windows!.frame,o.x,g+(s<0?o.low:o.high),z,o.width+.20,.14,.32);
        }
        put(windows!.frame,o.x,g+mid,z,.09,h,.30);
        put(windows!.frame,o.x,g+mid,z,o.width,.09,.30);
      }
    }
    for(const side of [-1,1])piece(mat,side*(w/2-t/2),0,t,d-2*t,base,top);
  }
  /** Straight run along local z (or x). Tread depth > player diameter
   * avoids two risers entering the footprint simultaneously. */
  function stairs(mat:MeshStandardMaterial,x:number,z:number,axis:'x'|'z',direction:1|-1,count:number,run:number,w:number,low:number,high:number){
    const points=[point(x,z,low)];
    for(let i=0;i<count;i++){
      const s=direction*(i+.5)*run,top=low+(high-low)*(i+1)/count;
      const xx=x+(axis==='x'?s:0),zz=z+(axis==='z'?s:0);
      slab(mat,xx,zz,axis==='x'?run+.008:w,axis==='z'?run+.008:w,top,.16);
      points.push(point(xx,zz,top));
    }
    return points;
  }
  return {point,piece,slab,shell,stairs};
}
