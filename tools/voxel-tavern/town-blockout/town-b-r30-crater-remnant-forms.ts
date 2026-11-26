import {BoxGeometry,BufferAttribute,BufferGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Shared faceted minerals: broad root, asymmetric prism shoulder, fractured
 * termination. Unit bounds permit surveyed footprint/grounding at the host. */
export function buildBR30CrystalForm(){
  const p:number[]=[],idx:number[]=[];
  const ring=(y:number,r:number,twist:number,dx:number,dz:number)=>{
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3+twist;
      p.push(dx+Math.cos(a)*r,y,dz+Math.sin(a)*r);
    }
  };
  ring(-.5,.36,0,0,0);
  ring(-.32,.48,.06,.015,-.025);
  ring(.19,.42,.11,.055,.02);
  p.push(.12,.5,-.035, 0,-.5,0);
  for(let i=0;i<6;i++){
    const j=(i+1)%6;
    for(let k=0;k<2;k++){
      const a=k*6+i,b=k*6+j,c=(k+1)*6+i,d=(k+1)*6+j;
      idx.push(a,c,b,b,c,d);
    }
    idx.push(12+i,18,12+j,19,i,j);
  }
  const g=new BufferGeometry();
  g.setAttribute('position',new BufferAttribute(new Float32Array(p),3));
  g.setIndex(idx);
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();
  flat.computeBoundingSphere();return flat;
}

/** A severed timber support: old sleeper with a short broken upright and
 * diagonal brace, laid on the surveyed ground. */
export function buildBR30TimberFragment(){
  const pieces:BufferGeometry[]=[];
  function box(w:number,h:number,d:number,x:number,y:number,z:number,rot=0){
    const g=new BoxGeometry(w,h,d);g.rotateZ(rot);g.translate(x,y,z);pieces.push(g);
  }
  box(.94,.17,.49,0,-.33,0);
  box(.19,.67,.33,-.25,.06,0,-.08);
  box(.49,.12,.24,.025,-.08,0,.63);
  box(.23,.08,.25,-.25,.37,0,.24);
  const g=mergeGeometries(pieces);pieces.forEach(p=>p.dispose());
  if(!g)throw Error('Cannot join old timber fragment');
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}

/** Bent rail web with two flanges, broken once at the upper end.
 * A real recognizable section, not a rust-colored cone. */
export function buildBR30RailFragment(){
  const parts:BufferGeometry[]=[];
  function beam(x:number,y:number,z:number,w:number,h:number,d:number,angle=0){
    const box=new BoxGeometry(w,h,d);
    if(angle)box.rotateZ(angle);
    box.translate(x,y,z);parts.push(box);
  }
  beam(0,-.13,0,.24,.7,.27);
  beam(0,-.13,-.19,.75,.7,.11);
  beam(0,-.13,.19,.62,.7,.11);
  beam(.13,.31,0,.24,.31,.27,-.42);
  beam(.13,.31,-.19,.70,.31,.11,-.42);
  beam(.13,.31,.19,.62,.31,.11,-.42);
  const joined=mergeGeometries(parts);parts.forEach(p=>p.dispose());
  if(!joined)throw Error('Cannot join bent rail section');
  joined.computeBoundingBox();joined.computeBoundingSphere();
  return joined;
}
