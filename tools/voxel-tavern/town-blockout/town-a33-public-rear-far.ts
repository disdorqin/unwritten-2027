import {BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';
import {mainSummitBounds} from './main-summit-block';
import {buildTownD2R30ChunkGeometry} from './town-d2-r30-massif';
import {createTownD2R30FarLod,townD2R30FarLodContract} from './town-d2-r30-far-lod';
import {sampleTownD2R30Height,townD2R30GridAxis,townD2R30Spec} from './town-d2-r30-domain';
/** A's public presentation adapter. D2 owns both source height and the
 * northern far layer. Retain the exact north vertices, add the southern
 * canonical band down to the town border, and weld the common row.
 * No faux apron, closed-volume face, collision or change to the D2 field. */
export function createA33PublicRearFar(townNorth:number){
 const {west,east,north}=mainSummitBounds,spacing=townD2R30FarLodContract.spacing;
 const join=townD2R30FarLodContract.south,south=townNorth-townD2R30Spec.worldAnchor.north;
 if(!Number.isFinite(south)||south<mainSummitBounds.south||south>=join)throw Error('Invalid A33 far boundary');
 const far=createTownD2R30FarLod();
 const lower=buildTownD2R30ChunkGeometry({key:'A33-public-south',row:0,column:0,west,east,south,north:join,centreEast:0,centreNorth:(south+join)/2},spacing,347);
 try{
  const cols=townD2R30GridAxis(west,east,spacing).length,lowerRows=townD2R30GridAxis(south,join,spacing).length,upperRows=townD2R30GridAxis(join,north,spacing).length;
  const totalRows=lowerRows+upperRows-1,lowerCount=cols*lowerRows,upperCount=cols*upperRows;
  const lp=lower.getAttribute('position'),lc=lower.getAttribute('color'),up=far.mesh.geometry.getAttribute('position'),uc=far.mesh.geometry.getAttribute('color');
  if(lp.count!==lowerCount||far.stats().topVertices!==upperCount)throw Error('A33 far row contract mismatch');
  const positions=new Float32Array(totalRows*cols*3),colors=new Float32Array(positions.length),indices:number[]=[];
  const haze=new Color('#9bacad'),c=new Color();
  for(let i=0;i<lowerCount;i++){
   const e=lp.getX(i),h=lp.getY(i),z=lp.getZ(i);
   positions.set([e,h,z],i*3);
   const t=Math.max(0,Math.min(1,(h-townD2R30Spec.baseHeight)/(townD2R30Spec.summitHeight-townD2R30Spec.baseHeight)));
   c.setRGB(lc.getX(i),lc.getY(i),lc.getZ(i)).lerp(haze,townD2R30FarLodContract.maxHaze*(1-t*t*(3-2*t)));
   colors.set([c.r,c.g,c.b],i*3);
  }
  // D2's row at N600 is authoritative and exact, including haze; use it
  // instead of a second coincident edge. Shared vertex normals are rebuilt.
  for(let i=0;i<upperCount;i++){
   const target=lowerCount-cols+i;
   if(i<cols&&Math.hypot(positions[target*3]!-up.getX(i),positions[target*3+1]!-up.getY(i),positions[target*3+2]!-up.getZ(i))>.001)throw Error('A33 far seam mismatched');
   positions.set([up.getX(i),up.getY(i),up.getZ(i)],target*3);
   colors.set([uc.getX(i),uc.getY(i),uc.getZ(i)],target*3);
  }
  let maxDrift=0;
  for(let row=0;row<totalRows;row++)for(let col=0;col<cols;col++){
   const i=row*cols+col,e=positions[i*3]!,n=-positions[i*3+2]!,h=positions[i*3+1]!,canonical=sampleTownD2R30Height(e,n,347);
   if(canonical===undefined||!Number.isFinite(h))throw Error('A33 far vertex outside the canonical domain');
   maxDrift=Math.max(maxDrift,Math.abs(h-canonical));
   if(row<totalRows-1&&col<cols-1)indices.push(i,i+1,i+cols,i+1,i+cols+1,i+cols);
  }
  if(maxDrift>.001)throw Error('A33 far surface drifted from D2');
  const geometry=new BufferGeometry();geometry.name='a33-public-canonical-top';geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new MeshLambertMaterial({vertexColors:true,fog:true}),mesh=new Mesh(geometry,material),group=new Group();
  mesh.name='a33-public-canonical-far';group.name='a33-public-canonical-far-root';group.add(mesh);
  const stats={vertices:positions.length/3,triangles:indices.length/3,maxDrift,localSouth:south,worldSouth:townNorth,joinedAt:join,cols,rows:totalRows};
  group.userData={owner:'A33-3-public-canonical-far',revision:1,bounds:{west,east,south,north},static:true,visualOnly:true,includesWorldCollision:false,stats};
  mesh.userData={...group.userData,chunkId:'summit/A/public-far'};
  let disposed=false;
  return {group,mesh,stats,setNight(night:boolean){material.color.setRGB(night?.82:1,night?.86:1,night?.95:1);},dispose(){if(disposed)return;disposed=true;group.removeFromParent();geometry.dispose();material.dispose();group.clear();}};
 }finally{lower.dispose();far.dispose();}
}
