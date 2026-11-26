/** B-R03: survey the actual player-eye line to an exposed mineral tip.
 * This is a placement constraint, not a camera teleport, navigable path,
 * or replacement for the player's actual first-person visual review. */
type EN={east:number;north:number};
export type BR30RelicView=Readonly<{foot:EN&{height:number};target:EN&{height:number};yaw:number;pitch:number;distance:number;clearance:number}>;
export function surveyBR30RelicView(
  heightAt:(east:number,north:number)=>number|undefined,
  trail:readonly EN[],target:EN&{height:number},
):BR30RelicView|undefined{
  let best:BR30RelicView|undefined;
  for(const q of trail){
    const de=target.east-q.east,dn=target.north-q.north,d=Math.hypot(de,dn);
    if(d<3||d>12)continue;
    const h=heightAt(q.east,q.north);if(h===undefined||!Number.isFinite(h))continue;
    const eye=h+1.65,dh=target.height-eye,pitch=Math.atan2(dh,d);
    if(Math.abs(pitch)>.65)continue;
    let clearance=Infinity;
    const count=Math.ceil(d/.22);
    for(let i=1;i<count;i++){
      const t=i/count,ground=heightAt(q.east+de*t,q.north+dn*t);
      if(ground===undefined||!Number.isFinite(ground)){clearance=-Infinity;break;}
      clearance=Math.min(clearance,eye+dh*t-ground);
      if(clearance<.15)break;
    }
    if(clearance<.15)continue;
    const v={foot:{...q,height:h},target,yaw:Math.atan2(de,dn),pitch,distance:d,clearance};
    if(!best||d<best.distance)best=v;
  }
  return best;
}
