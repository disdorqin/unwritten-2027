/** Proposed shallow loop within the original B-01 envelope. Local +Z depth.
 * The four snow nests retain the 30m camp clearance and measured route gaps.
 * No spawn/ore authority. */
export const firstMineShallowWorks=Object.freeze({
 rooms:[
  {minX:-97,maxX:-4.2,minZ:49,maxZ:55,ceiling:5.3},
  {minX:-97,maxX:-91,minZ:55,maxZ:56.5,ceiling:5.3},
  {minX:-97,maxX:-33,minZ:56.5,maxZ:62,ceiling:5.4},
  {minX:-39,maxX:-33,minZ:62,maxZ:63.5,ceiling:5.4},
  {minX:-97,maxX:-33,minZ:63.5,maxZ:68.5,ceiling:5.5},
  {minX:-71,maxX:-65,minZ:68.5,maxZ:71.6,ceiling:5.5},
 ] as const,
 nests:[
  {east:-35,north:52,height:-91},
  {east:-85,north:52,height:-91},
  {east:-58,north:59,height:-91},
  {east:-68,north:66,height:-91},
 ] as const,
 path:[[0,52],[-35,52],[-85,52],[-94,52],[-94,59],[-58,59],[-36,59],[-36,66],[-68,66],[-68,76.2],[-25,76.2],[-25,79.5]] as const,
 fixtures:[
  {id:'shallow-bay-1',x:-35,z:49.75,y:-91,width:5,depth:1.4,height:3.8,foot:[-35,-91,52] as const},
  {id:'shallow-bay-2',x:-85,z:49.75,y:-91,width:5,depth:1.4,height:3.8,foot:[-85,-91,52] as const},
  {id:'shallow-bay-3',x:-58,z:57.25,y:-91,width:5,depth:1.4,height:3.8,foot:[-58,-91,59] as const},
  {id:'shallow-bay-4',x:-68,z:64.25,y:-91,width:5,depth:1.4,height:3.8,foot:[-68,-91,66] as const},
 ] as const,
});
