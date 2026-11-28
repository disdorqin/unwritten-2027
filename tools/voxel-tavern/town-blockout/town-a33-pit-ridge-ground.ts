type EN=Readonly<{east:number;north:number}>;
/** Retain the exact 1m ground triangles around the pit/ridge and track
 * approaches. No parallel height authority or overlap with ridge-owned cells. */
export function createA33ExactGroundCoverage(tracks:readonly (readonly EN[])[]){
 const points=tracks.flat();
 return (west:number,south:number,east:number,north:number)=>{
  if(west<64&&north>256&&south<800)return true;
  return points.some(p=>p.east>=west-12&&p.east<=east+12&&p.north>=south-12&&p.north<=north+12);
 };
}
