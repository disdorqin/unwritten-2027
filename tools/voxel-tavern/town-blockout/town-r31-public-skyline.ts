import { Color } from 'three';
import { mainSummitBounds } from './main-summit-block';
import { buildTownD2R30ChunkGeometry } from './town-d2-r30-massif';
import { townD2R30Spec } from './town-d2-r30-domain';

const {west,east,south,north}=mainSummitBounds;
const spacing=townD2R30Spec.farSpacing;
const toe=-6;
const interiorSouth=600;
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};

/** Town-facing landscape LOD, not a collision owner.
 * The old closed volume cut the entire southern terrain at local N600 and
 * exposed its vertical cap at Y130. Preserve the complete canonical grid,
 * including its actual peaks, but join the exterior to ground level on a
 * broad sloping apron. The existing town/front-ridge owns every walkable
 * triangle through its northern boundary; keep the far mesh below it.
 * Only the outer visual apron differs from the rear playable raster.
 */
export function buildR31PublicSkyline(townNorth:number){
 const joinSouth=townNorth-townD2R30Spec.worldAnchor.north+spacing;
 if(!Number.isFinite(townNorth)||joinSouth>=interiorSouth)throw Error('Invalid town skyline overlap');
 const g=buildTownD2R30ChunkGeometry({key:'public-horizon',row:0,column:0,west,east,south,north,centreEast:0,centreNorth:(south+north)/2},spacing,347);
 const p=g.getAttribute('position'),c=g.getAttribute('color');
 const low=new Color('#b4c2c8'),color=new Color();
 for(let i=0;i<p.count;i++){
  const e=p.getX(i),n=-p.getZ(i),h=p.getY(i);
  const a=smooth((n-joinSouth)/(interiorSouth-joinSouth));
  const b=smooth(Math.min(e-west,east-e)/240);
  const d=smooth((north-n)/240);
  const weight=a*b*d;
  p.setY(i,toe+(h-toe)*weight);
  color.setRGB(c.getX(i),c.getY(i),c.getZ(i));
  color.lerp(low,(1-weight)*.7);
  c.setXYZ(i,color.r,color.g,color.b);
 }
 p.needsUpdate=true;c.needsUpdate=true;
 g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
 g.name='town-r31-public-grounded-horizon';
 g.userData={visualOnly:true,includesWorldCollision:false,joinSouth,interiorSouth,spacing,toe};
 return g;
}
