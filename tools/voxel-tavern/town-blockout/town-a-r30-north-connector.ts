import {BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';

/** A-R04: fill only the missing west-side railway corridor, not the entire
 * empty west world. Share the carrier's actual 1 m diagonal and height data.
 * No second collision height or overlapping tiles. */
export const westNorthConnectorBounds={west:-64,east:0,south:336,north:544} as const;
// Walking shoulder stays east of the actual branch alignment until it
// returns to town ground before the track curves through E0.
export const northFootwayPoints=[[-12,320],[-12,450],[-9,470],[-4,485],[0,490]] as const;
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t)};
export function northFootwayWeight(east:number,north:number){
  if(east>=0||north<310||north>494)return 0;
  let d=Infinity;
  for(let i=1;i<northFootwayPoints.length;i++){
    const a=northFootwayPoints[i-1]!,b=northFootwayPoints[i]!;
    const de=b[0]-a[0],dn=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((east-a[0])*de+(north-a[1])*dn)/(de*de+dn*dn)));
    d=Math.min(d,Math.hypot(east-a[0]-de*t,north-a[1]-dn*t));
  }
  return (1-smooth((d-.95)/1.6))*smooth((north-310)/10)*smooth(-east/3);
}
export const northFootwayPosts=[345,369,393,417,441].map(north=>({east:-14.65,north}));
export function mountWestNorthConnector(northLimit:number,heightAt:(e:number,n:number)=>number){
  const {west,east,south,north}=westNorthConnectorBounds;
  const top=Math.min(north,northLimit);
  const group=new Group();
  group.name='meteor-crater-west-north-connector';
  const material=new MeshLambertMaterial({color:0xffffff,vertexColors:true});
  const snow=new Color(0xc1cedc),packed=new Color(0xa0a5aa),tint=new Color();
  const width=east-west+1;
  for(let n0=south;n0<top;n0+=64){
    const n1=Math.min(top,n0+64);
    const vertices:number[]=[],indices:number[]=[],colors:number[]=[];
    for(let n=n0;n<=n1;n++)for(let e:number=west;e<=east;e++){
      vertices.push(e,heightAt(e,n),-n);
      tint.copy(snow).lerp(packed,northFootwayWeight(e,n)*(.76+.04*Math.cos(n*.63+e*.72)));
      colors.push(tint.r,tint.g,tint.b);
      if(e===east||n===n1)continue;
      const a=(n-n0)*width+e-west,b=a+1,c=a+width,d=c+1;
      indices.push(a,b,c,b,d,c);
    }
    const geo=new BufferGeometry();
    geo.setAttribute('position',new Float32BufferAttribute(vertices,3));
    geo.setAttribute('color',new Float32BufferAttribute(colors,3));
    geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
    const tile=new Mesh(geo,material);
    tile.name='west-north-support-'+n0;
    group.add(tile);
  }
  const readyAt=(e:number,n:number)=>top>south&&e>=west&&e<=east&&n>=south&&n<=top;
  return {group,readyAt,bounds:{west,east,south,north:top}};
}
