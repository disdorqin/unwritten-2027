/** Proposed geometric safe pocket, measured in U10 local ENY.
 * The region connects all three design-mandated sites. It is a geometry
 * candidate only; no server healing, aggression, loot, or action grant. */
export const warriorSafetyPocket=Object.freeze({
 rectangles:[
  {id:'cold-flame',x0:92,x1:104,n0:-15,n1:-4},
  {id:'statue-approach',x0:96,x1:100,n0:-4,n1:-1.8},
  {id:'street',x0:96,x1:144,n0:-1.8,n1:1.8},
  {id:'tavern-approach',x0:123,x1:127,n0:1.8,n1:14.4},
  {id:'tavern',x0:119.55,x1:130.45,n0:14.4,n1:24.55},
  {id:'forge-approach',x0:140,x1:144,n0:1.8,n1:4.5},
  {id:'forge',x0:136.8,x1:147.2,n0:4.5,n1:14.9},
 ] as const,
 paths:[
  [[96.9,-6.7],[96.9,0],[142,0],[142,4.9]],
  [[125,0],[125,22.15]],
 ] as const,
 lampFeet:[112,120,132,139].flatMap(e=>[-3.4,3.4].map(n=>({east:e,north:n}))),
 squareGuard:{east:119.5,north:-20},
 status:'candidate-unregistered' as const,
});
export function distanceToWarriorSafetyPocket(e:number,n:number){
 if(!Number.isFinite(e)||!Number.isFinite(n))return Infinity;
 return Math.min(...warriorSafetyPocket.rectangles.map(r=>Math.hypot(Math.max(0,r.x0-e,e-r.x1),Math.max(0,r.n0-n,n-r.n1))));
}
export function inWarriorSafetyPocket(e:number,n:number){return distanceToWarriorSafetyPocket(e,n)===0}
