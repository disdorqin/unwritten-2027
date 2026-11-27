/** Dry eastern detour from camp to gate. Single source of rail and rock layout. */
export const r30MainlineLocal=Object.freeze([
 [0,49],[0,57],[0,65],
 ...Array.from({length:48},(_,i)=>{const z=66+i;return [32.5*Math.sin(Math.PI*(z-65)/48)**2,z] as const}),
 [0,121],[0,136.5],
].map(([x,z])=>Object.freeze([Math.abs(x)<1e-9?0:x,z] as const)));
export const r30MainlineRooms=Object.freeze(r30MainlineLocal.slice(1).flatMap(([x,z],i)=>{
 const [a,b]=r30MainlineLocal[i];
 if(z<=67||b>=112)return [];
 const half=(b>=76&&z<=86)||(b>=97&&z<=108)?8.2:5.4;
 return [{minX:Math.max(-2,Math.floor((Math.min(a,x)-half)*1000)/1000),maxX:Math.ceil((Math.max(a,x)+half)*1000)/1000,minZ:b,maxZ:z,ceiling:5.8}];
}));
export const r30MainlineFaults=Object.freeze({sleepers:18,gauge:47,'turnout-rust':82});
export const r30MainlineTurnout=99;
