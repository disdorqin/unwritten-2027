/** Dry deep workings within the existing B-01 envelope.
 * +Z is local depth, not world north. Original water shape and phase
 * authority are untouched. East branch has a separate dry entrance. */
export const firstMineDeepWorks = Object.freeze({
 rooms:[
  {minX:-48,maxX:-4.2,minZ:125,maxZ:137,ceiling:6.3},
  {minX:4.2,maxX:48,minZ:106.8,maxZ:113.4,ceiling:5.6},
  {minX:43,maxX:48,minZ:113.4,maxZ:125,ceiling:5.4},
  {minX:7.4,maxX:48,minZ:125,maxZ:137,ceiling:6.1},
 ] as const,
 fixtures:[
  {id:'collapse-wall',x:-45,z:131,y:-91,width:4.4,depth:10.4,height:3.8,foot:[-40,-91,131] as const},
  {id:'collapse-support',x:-34,z:126.3,y:-91,width:4.8,depth:1.9,height:3.4,foot:[-34,-91,128.4] as const},
  {id:'barracks-bunks-north',x:36,z:126.35,y:-91,width:12,depth:1.9,height:2.4,foot:[36,-91,130] as const},
  {id:'barracks-bunks-south',x:36,z:135.65,y:-91,width:12,depth:1.9,height:2.4,foot:[36,-91,133] as const},
  {id:'barracks-lockers',x:46.5,z:131,y:-91,width:1.8,depth:4.8,height:2.5,foot:[44,-91,131] as const},
 ] as const,
 zombies:[{east:-40,north:131,height:-91},{east:38,north:132,height:-91}] as const,
 snakes:[{east:-5.6,north:136.1,height:-91},{east:16.8,north:135.5,height:-91}] as const,
 westPath:[[0,131],[-40,131]] as const,
 eastDryPath:[[0,109],[45.5,109],[45.5,123.8],[42.6,132.1],[38,132.1]] as const,
});
export function isCanonicalDeepWorks(b:{minX:number;maxX:number;minZ:number;maxZ:number},floor:number,gate:boolean){
 return gate&&floor===-91&&b.minX===-100&&b.maxX===100&&b.minZ===45&&b.maxZ===140;
}
