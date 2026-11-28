import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial,Color} from 'three';
import type {SouthGround} from './town-night-a-summit-landform';
/** Existing grounded approach, diverted around the actual tree base.
 * This is a local walking path, not the main 12% engineered summit road. */
export const westMountainFootway=[[-90,265],[-91.5,270],[-91.5,288],[-90,310],[-90,335],[-90,350]] as const;
/** Grounded path dressing only: existing carrier remains sole support. */
export function mountWestMountainFootway(heightAt:SouthGround,points:readonly (readonly [number,number])[]=westMountainFootway,name='night-a-west-mountain-footway'){
 if(points.length<2)throw Error('Missing surveyed footway');
 const group=new Group();group.name=name;
 group.userData={owner:'A33-1-grounded-footway',revision:2,static:true,bounds:{west:Math.min(...points.map(p=>p[0]))-1,east:Math.max(...points.map(p=>p[0]))+1,south:Math.min(...points.map(p=>p[1]))-1,north:Math.max(...points.map(p=>p[1]))+1}};
 const mat=new MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const p:number[]=[],c:number[]=[],stone=new Color('#a7adb0'),snow=new Color('#b7c4ca'),tint=new Color();
 let count=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!,dx=b[0]-a[0],dn=b[1]-a[1],len=Math.hypot(dx,dn),steps=Math.ceil(len/.25);
  function v(j:number,t:number){
   const e=a[0]+dx*j/steps-dn/len*t,n=a[1]+dn*j/steps+dx/len*t,h=heightAt(e,n);
   if(h===undefined||!Number.isFinite(h))throw Error('Missing west footway support');return {e,n,h};
  }
  for(let j=0;j<steps;j++)for(let k=-3;k<3;k++){
   const a=v(j,k*.25),b=v(j,(k+1)*.25),d=v(j+1,k*.25),e=v(j+1,(k+1)*.25);
   for(const q of [b,a,d,b,d,e]){
    p.push(q.e,q.h+.016,-q.n);tint.copy(stone).lerp(snow,.25+.15*Math.sin(q.e*.4+q.n*1.7)+.15*Math.abs(k)/3);c.push(tint.r,tint.g,tint.b);
   }count+=2;
  }
 }
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(c,3));g.computeVertexNormals();g.computeBoundingSphere();
 const mesh=new Mesh(g,mat);mesh.name=name+':grounded-tread';group.add(mesh);
 return {group,triangles:count,dispose(){group.removeFromParent();g.dispose();mat.dispose();group.clear();}};
}
