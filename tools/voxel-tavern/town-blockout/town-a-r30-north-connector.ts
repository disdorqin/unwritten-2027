import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';

/** A-R04: fill only the missing west-side railway corridor, not the entire
 * empty west world. Share the carrier's actual 1 m diagonal and height data.
 * No second collision height or overlapping tiles. */
export const westNorthConnectorBounds={west:-64,east:0,south:336,north:544} as const;
export function mountWestNorthConnector(northLimit:number,heightAt:(e:number,n:number)=>number){
  const {west,east,south,north}=westNorthConnectorBounds;
  const top=Math.min(north,northLimit);
  const group=new Group();
  group.name='meteor-crater-west-north-connector';
  const material=new MeshLambertMaterial({color:0xc1cedc});
  const width=east-west+1;
  for(let n0=south;n0<top;n0+=64){
    const n1=Math.min(top,n0+64);
    const vertices:number[]=[],indices:number[]=[];
    for(let n=n0;n<=n1;n++)for(let e=west;e<=east;e++){
      vertices.push(e,heightAt(e,n),-n);
      if(e===east||n===n1)continue;
      const a=(n-n0)*width+e-west,b=a+1,c=a+width,d=c+1;
      indices.push(a,b,c,b,d,c);
    }
    const geo=new BufferGeometry();
    geo.setAttribute('position',new Float32BufferAttribute(vertices,3));
    geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
    const tile=new Mesh(geo,material);
    tile.name='west-north-support-'+n0;
    group.add(tile);
  }
  const readyAt=(e:number,n:number)=>top>south&&e>=west&&e<=east&&n>=south&&n<=top;
  return {group,readyAt,bounds:{west,east,south,north:top}};
}
