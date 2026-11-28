import {Matrix4,Quaternion,Vector3} from 'three';
type Height=(east:number,north:number)=>number|undefined;
export type LatticeFoot={footBottom:number;footTop:number;footHalf:number;legHalf:number;latticeTop:number};
/** Survey the whole foot, not just its centre. Broad tower bases are
 * retained only if the upper floor still clears both cabins. */
export function surveyNightBLatticeFoot(east:number,north:number,ground:number,ropeHeight:number,heightAt:Height):LatticeFoot|undefined{
 const height=ropeHeight-ground,latticeTop=ropeHeight-3.65;
 let legHalf=height>18?Math.min(6,Math.max(1.2,height*.05)):0;
 for(let attempt=0;attempt<7;attempt++){
  const footHalf=legHalf>0?legHalf+.7:1.2,steps=Math.ceil(footHalf*2);
  let low=Infinity,high=-Infinity,missing=false;
  for(let i=0;i<=steps;i++)for(let j=0;j<=steps;j++){
   const h=heightAt(east-footHalf+i*2*footHalf/steps,north-footHalf+j*2*footHalf/steps);
   if(h===undefined||!Number.isFinite(h))missing=true;else{low=Math.min(low,h);high=Math.max(high,h);}
  }
  const footBottom=low-.4,footTop=high+.25;
  if(!missing&&footTop<ropeHeight-1.35&&height>1){
   if(legHalf===0||latticeTop-footTop>=7)return {footBottom,footTop,footHalf,legHalf,latticeTop};
  }
  if(legHalf===0)break;
  legHalf=legHalf<=1.2?0:Math.max(1.2,legHalf*.68);
 }
}
export function buildNightBLatticeMembers(towers:readonly (LatticeFoot&{east:number;north:number})[]){
 const matrices:Matrix4[]=[],up=new Vector3(0,1,0);
 function member(a:Vector3,b:Vector3,width:number){
  const dir=b.clone().sub(a),length=dir.length();if(length<.001)return;
  matrices.push(new Matrix4().compose(a.clone().lerp(b,.5),new Quaternion().setFromUnitVectors(up,dir.normalize()),new Vector3(width/.18,length,width/.18)));
 }
 for(const t of towers){
  if(t.legHalf<=0)continue;
  const levels=Math.max(2,Math.ceil((t.latticeTop-t.footTop)/10));
  const corners=(i:number)=>{const f=i/levels,w=t.legHalf*(1-f)+.47*f,y=t.footTop+(t.latticeTop-t.footTop)*f;
   return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>new Vector3(t.east+x!*w,y,-t.north+z!*w));};
  const ring=Array.from({length:levels+1},(_,i)=>corners(i));
  for(let i=0;i<=levels;i++)for(let k=0;k<4;k++){
   const a=ring[i]!,l=(k+1)%4;member(a[k]!,a[l]!,.22);
   if(i===levels)continue;
   const b=ring[i+1]!;member(a[k]!,b[k]!,.30+.20*(1-i/levels));
   member(a[k]!,b[l]!,.19);member(a[l]!,b[k]!,.19);
  }
 }
 return matrices;
}
export function nightBLatticeBlocked(t:LatticeFoot&{east:number;north:number},e:number,n:number,h:number,r:number,body=1.8){
 const dx=Math.abs(e-t.east),dn=Math.abs(n-t.north),box=(w:number)=>Math.hypot(Math.max(0,dx-w),Math.max(0,dn-w))<r;
 if(h+body>t.footBottom&&h<t.footTop+.09&&box(t.footHalf+.04))return true;
 if(t.legHalf>0&&h+body>t.footTop&&h<t.latticeTop){
  const f=Math.max(0,Math.min(1,(h-t.footTop)/(t.latticeTop-t.footTop)));
  return box(t.legHalf*(1-f)+.47*f+.30);
 }
 return false;
}
