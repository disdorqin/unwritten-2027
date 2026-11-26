import { Color, type Mesh } from 'three';

/** B owns natural-relief colors and strata. A only feathers the outer
 * transition to its exact shared snow tint. No ring tint over the new bowl. */
export function featherSharedCraterApron(mesh:Mesh,rimRadius:number,apronRadius:number){
  const pos=mesh.geometry.getAttribute('position'),colors=mesh.geometry.getAttribute('color');
  if(!pos||!colors||colors.count!==pos.count||!(apronRadius>rimRadius))throw new Error('Invalid B/A color seam');
  const carrier=new Color(0xc1cedc);
  let touched=0;
  for(let i=0;i<pos.count;i++){
    const r=Math.hypot(pos.getX(i),pos.getZ(i));
    if(r<=rimRadius)continue;
    let t=Math.min(1,(r-rimRadius)/(apronRadius-rimRadius));
    // Float32 boundary positions can fall a few ulps inside the nominal
    // radius. Explicitly snap the shared edge, not the interior geology.
    if(apronRadius-r<.0002)t=1;
    t=t*t*(3-2*t);
    colors.setXYZ(i,colors.getX(i)*(1-t)+carrier.r*t,
      colors.getY(i)*(1-t)+carrier.g*t,colors.getZ(i)*(1-t)+carrier.b*t);
    touched++;
  }
  colors.needsUpdate=true;
  return touched;
}
