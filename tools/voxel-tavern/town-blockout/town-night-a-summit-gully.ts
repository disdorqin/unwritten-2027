import {BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';
import {southGullyNorth,type SouthGround,type SouthProtection} from './town-night-a-summit-landform';
/** Frozen streambed material on the real 8m canonical triangles. It is
 * not a flat water plane, bridge, or additional collision surface.
 * Keep existing road/cable reservations bare and do not re-route them. */
export function mountSouthGully(heightAt:SouthGround,protectedAt:SouthProtection){
 const group=new Group();group.name='night-a-south-frozen-gully';
 const mat=new MeshLambertMaterial({vertexColors:true});
 const bins=new Map<number,{p:number[];c:number[]}>();
 const ice=new Color('#829fae'),shale=new Color('#657379'),snow=new Color('#c8d7dc'),tint=new Color();
 let triangles=0;
 for(let e=-620;e<124;e+=8)for(let n=182;n<446;n+=8){
  const corners=[[e,n],[e+8,n],[e,n+8],[e+8,n+8]] as const;
  if(corners.some(([x,z])=>protectedAt(x,z)))continue;
  const hs=corners.map(([x,z])=>heightAt(x,z));if(hs.some(h=>h===undefined||!Number.isFinite(h)))continue;
  for(const face of [[0,1,2],[1,3,2]]){
   const cx=face.reduce((s,k)=>s+corners[k]![0],0)/3,cn=face.reduce((s,k)=>s+corners[k]![1],0)/3;
   const d=Math.abs(cn-southGullyNorth(cx)),w=7+3*Math.sin(cx*.034);
   if(d>w+9||Math.max(...hs.map(h=>h!))-Math.min(...hs.map(h=>h!))>12)continue;
   const k=Math.floor(cx/128),bin=bins.get(k)??{p:[],c:[]};bins.set(k,bin);
   for(const i of face){
    const [x,z]=corners[i]!,h=hs[i]!,edge=Math.abs(z-southGullyNorth(x));
    tint.copy(ice).lerp(shale,Math.min(1,Math.abs(Math.sin(x*.19+z*.37))*.42)).lerp(snow,Math.max(0,Math.min(.92,(edge-w+2)/10)));
    bin.p.push(x,h+.018,-z);bin.c.push(tint.r,tint.g,tint.b);
   }
   triangles++;
  }
 }
 for(const [k,{p,c}] of bins){
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(p,3));geo.setAttribute('color',new Float32BufferAttribute(c,3));geo.computeVertexNormals();geo.computeBoundingSphere();
  const m=new Mesh(geo,mat);m.name='south-gully-bed:'+k;group.add(m);
 }
 let disposed=false;
 return {group,triangles,dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});mat.dispose();group.clear();}};
}
