import type {MeshStandardMaterial} from 'three';
import {orientedSupportBox,type OrientedSupportBox} from './town-a-r30-oriented-support';
type Frame={yaw:number;at(x:number,z:number):{east:number;north:number}};
type Put=(mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number)=>void;
export type IndustryPoint=Readonly<{east:number;north:number;height:number}>;
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
  function shell(mat:MeshStandardMaterial,w:number,d:number,base:number,top:number,doorX:number,doorW:number,doorH:number){
    const t=.24,left=doorX-doorW/2,right=doorX+doorW/2;
    piece(mat,(-w/2+left)/2,d/2-t/2,left+w/2,t,base,top);
    piece(mat,(right+w/2)/2,d/2-t/2,w/2-right,t,base,top);
    piece(mat,doorX,d/2-t/2,doorW,t,base+doorH,top);
    piece(mat,0,-d/2+t/2,w,t,base,top);
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
