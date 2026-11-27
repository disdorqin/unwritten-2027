/** Mine-local coordinates, +Z deeper, Y world elevation. Only these two
 * authored thin-wall targets may consume the existing mining authority. */
export const r30ThinWallRooms=[
 {minX:4.2,maxX:8,minZ:58,maxZ:61.2,ceiling:3.5},
 {minX:8,maxX:20,minZ:54.5,maxZ:65.5,ceiling:5.1},
 {minX:-52,maxX:-48,minZ:68.5,maxZ:71.6,ceiling:3.5},
] as const;
export const r30ThinWalls=[
 {id:'mine1/thin-wall/crystal-pocket',axis:'x',x:6.1,z:59.6,width:3.2,height:3.5,thickness:.32,strikes:4,kind:'thin-wall'},
 {id:'mine1/thin-wall/return-shortcut',axis:'z',x:-50,z:70.05,width:4,height:3.5,thickness:.32,strikes:4,kind:'thin-wall'},
] as const;
export type R30ThinWallId=typeof r30ThinWalls[number]['id'];
export function r30ThinWallBlocked(x:number,z:number,radius:number,open:ReadonlySet<string>){
 for(const wall of r30ThinWalls){
  if(open.has(wall.id))continue;
  const d=wall.axis==='x'?Math.abs(x-wall.x):Math.abs(z-wall.z);
  const side=wall.axis==='x'?Math.abs(z-wall.z):Math.abs(x-wall.x);
  if(d<=wall.thickness/2+.08+radius&&side<=wall.width/2+radius)return true;
 }
 return false;
}
