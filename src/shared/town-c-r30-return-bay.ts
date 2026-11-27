/** Proposed independent return shaft on the west side of the dry approach.
 * Coordinates are mine-local, Y follows the real gallery grade. The roof
 * remains closed until B/A certify a distinct surface exit and transport. */
export const r30ReturnBay=Object.freeze({
 minX:-6.8,maxX:-2,minZ:14.2,maxZ:17.4,
 dock:{x:-4.7,z:15.8},call:{x:-3.0,z:16.12},lever:{x:-3.0,z:16.95},
 futureAperture:{minX:-5.8,maxX:-3.6,minZ:14.7,maxZ:16.9},
});
export const r30ReturnBayFixtures=[
 {x:-3.0,z:16.95,width:.65,depth:.8,height:1.65},
 {x:-4.7,z:14.48,width:2.46,depth:.35,height:2.7},
 {x:-4.7,z:17.10,width:2.46,depth:.35,height:2.7},
 {x:-6.02,z:15.8,width:.34,depth:2.48,height:1.36},
] as const;
export const r30ReturnBayFloor=(z:number)=>-90-(z-12)*.05;
export function r30ReturnBayBlocks(x:number,z:number,r:number,h:number,floor:number){
 return r30ReturnBayFixtures.some(f=>{
  const y=r30ReturnBayFloor(f.z);
  return y+f.height>floor+.025&&y-.07<floor+h&&
   x+r>f.x-f.width/2&&x-r<f.x+f.width/2&&z+r>f.z-f.depth/2&&z-r<f.z+f.depth/2;
 });
}
