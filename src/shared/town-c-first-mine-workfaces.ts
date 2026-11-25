/** Static workface geometry within the existing first-mine expansion.
 * +Z is depth along the registered mine's local axis, not world north.
 * No mining reward, ore, encounter or light authority lives here. */
export type MineWorkface=Readonly<{id:string;x:number;z:number;y:number;foot:readonly [number,number,number];width:number;depth:number;height:number}>;
export function createFirstMineWorkfaces(bounds:{minX:number;maxX:number;minZ:number;maxZ:number},floor:number):readonly MineWorkface[]{
 // Match the existing expansion's cross-passage specification, not an independent domain.
 if(Math.abs(bounds.minX+100)>1e-7||Math.abs(bounds.maxX-100)>1e-7||!Number.isFinite(floor))return [];
 const depth=bounds.maxZ-bounds.minZ;if(depth<65)return [];
 const w=bounds.minZ+depth*.28,e=bounds.minZ+depth*.46;
 const stations=[[-22,w],[-54,w],[-86,w-1.8],[29,e],[82,e-1.8]] as const;
 return stations.map(([x,start],i)=>Object.freeze({id:'workface-'+(i+1),x,z:start+1.02,y:floor,width:2.65,depth:1.60,height:1.58,
   foot:[x,floor,start+2.7] as const}));
}
/** Candidate second safe point, not a server-authorized healing or spawn mask.
 * Furniture stays along the west wall; the central mainline remains clear. */
export function createFirstMineSupportStation(bounds:{minX:number;maxX:number;minZ:number;maxZ:number},floor:number):MineWorkface|undefined {
 if(Math.abs(bounds.minX+100)>1e-7||Math.abs(bounds.maxX-100)>1e-7||bounds.maxZ-bounds.minZ<90)return;
 const z=bounds.minZ+(bounds.maxZ-bounds.minZ)*.6263157894736842;
 return {id:'support-station',x:-3.25,z,y:floor,width:1.6,depth:3.6,height:2.25,foot:[-1.85,floor,z]};
}
/** First mine candidate habitats (local +Z forward). The two patches are on
 * the existing branch floors. The remaining four shallow nests need a redesign. */
export const firstMineMiddleSnowSites=[{x:-25,z:79.5,y:-91},{x:29,z:95.5,y:-91}] as const;
export const firstMineWaterlineSite={x:5.6,z:135.5,y:-91.12} as const;
export function workfaceBlocks(areas:readonly MineWorkface[],x:number,z:number,radius:number,bodyHeight:number,floor:number){
 return areas.some(a=>a.y+a.height>floor+.025&&a.y<floor+bodyHeight&&
   x+radius>a.x-a.width/2&&x-radius<a.x+a.width/2&&z+radius>a.z-a.depth/2&&z-radius<a.z+a.depth/2);
}
