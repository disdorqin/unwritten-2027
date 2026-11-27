/** Local geometry for the extension to the existing support station.
 * Two entrances preserve a retreat path around the old bench. Neither
 * this plan nor its furniture creates a recovery or spawn authority. */
export const r30SupportAnnexRooms=[
 {minX:-6,maxX:-4.2,minZ:99.8,maxZ:102.4,ceiling:3.8},
 {minX:-13,maxX:-6,minZ:99,maxZ:110,ceiling:4.6},
 {minX:-6,maxX:-4.2,minZ:106.6,maxZ:109.2,ceiling:3.8},
] as const;
export const r30SupportAnnexPath=[[0,101.1],[-8.1,101.1],[-8.1,107.9],[0,107.9]] as const;
export const r30SupportAnnexFixtures=[
 {id:'annex-bunks',x:-11.7,z:102.1,width:2.3,depth:3.2,height:2.5},
 {id:'annex-supplies',x:-11.7,z:106.7,width:2.3,depth:3.5,height:2.65},
 {id:'annex-map',x:-8.5,z:99.45,width:3.4,depth:.9,height:2.7},
 {id:'annex-rest-bench',x:-8.6,z:109.55,width:3.2,depth:.8,height:1.3},
] as const;
export function r30SupportAnnexBlocks(x:number,z:number,radius:number,bodyHeight:number,floor:number){
 return r30SupportAnnexFixtures.some(a=>a.height-91>floor+.025&&-91<floor+bodyHeight&&
  x+radius>a.x-a.width/2&&x-radius<a.x+a.width/2&&z+radius>a.z-a.depth/2&&z-radius<a.z+a.depth/2);
}
