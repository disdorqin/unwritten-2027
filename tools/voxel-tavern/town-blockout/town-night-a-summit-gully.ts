import {BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';
import {southGullyNorth,type SouthGround,type SouthProtection} from './town-night-a-summit-landform';
type Point={e:number;n:number};
const width=(e:number)=>8+2.8*Math.sin(e*.034)+1.5*Math.sin(e*.071);
const distance=(p:Point)=>Math.abs(p.n-southGullyNorth(p.e))-width(p.e);
/** Clip 2m triangles (subdivisions of the canonical 8m triangles) against
 * the meandering banks. Every new vertex is evaluated on the real terrain;
 * no artificial flat water plane, jagged full-cell teeth or support layer. */
export function mountSouthGully(heightAt:SouthGround,protectedAt:SouthProtection){
 const group=new Group();group.name='night-a-south-frozen-gully';
 const mat=new MeshLambertMaterial({vertexColors:true});
 const bins=new Map<number,{p:number[];c:number[]}>();
 const ice=new Color('#7897aa'),shale=new Color('#576970'),snow=new Color('#bbcbd1'),tint=new Color();
 let triangles=0;
 function clip(poly:Point[],sign:number){
  const result:Point[]=[];
  const f=(p:Point)=>sign*(p.n-southGullyNorth(p.e))-width(p.e)-3.0;
  for(let i=0;i<poly.length;i++){
   const a=poly[i]!,b=poly[(i+1)%poly.length]!,fa=f(a),fb=f(b);
   if(fa<=0)result.push(a);
   if((fa<=0)!==(fb<=0)){const t=fa/(fa-fb);result.push({e:a.e+(b.e-a.e)*t,n:a.n+(b.n-a.n)*t});}
  }
  return result;
 }
 // N starts at -10 + 24*8, E at -1100 + 60*8.
 for(let e=-620;e<124;e+=2){
  const mid=southGullyNorth(e),n0=Math.max(182,-10+Math.floor((mid-18+10)/2)*2),n1=Math.min(446,mid+18);
  for(let n=n0;n<n1;n+=2){
   const a={e,n},b={e:e+2,n},c={e,n:n+2},d={e:e+2,n:n+2};
   for(const face of [[a,b,c],[b,d,c]]){
    if(face.some(p=>protectedAt(p.e,p.n)))continue;
    const poly=clip(clip(face,1),-1);
    if(poly.length<3)continue;
    const k=Math.floor(e/128),bin=bins.get(k)??{p:[],c:[]};bins.set(k,bin);
    for(let i=1;i<poly.length-1;i++){
     const vertices=[poly[0]!,poly[i]!,poly[i+1]!];
     const hs=vertices.map(p=>heightAt(p.e,p.n));
     if(hs.some(h=>h===undefined||!Number.isFinite(h))||vertices.some(p=>protectedAt(p.e,p.n)))continue;
     for(const [j,p] of vertices.entries()){
      const bank=Math.max(0,Math.min(1,(distance(p)+3)/6));
      tint.copy(ice).lerp(shale,.35+.18*Math.sin(p.e*.19+p.n*.37)).lerp(snow,bank*.88);
      bin.p.push(p.e,hs[j]!+.022,-p.n);bin.c.push(tint.r,tint.g,tint.b);
     }
     triangles++;
    }
   }
  }
 }
 for(const [k,{p,c}] of bins){if(!p.length)continue;
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(p,3));geo.setAttribute('color',new Float32BufferAttribute(c,3));geo.computeVertexNormals();geo.computeBoundingSphere();
  const m=new Mesh(geo,mat);m.name='south-gully-bed:'+k;group.add(m);
 }
 let disposed=false;
 return {group,triangles,dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});mat.dispose();group.clear();}};
}
