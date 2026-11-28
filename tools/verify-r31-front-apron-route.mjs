import {Scene} from 'three';
import {createTerrainGrid,worldBounds} from './voxel-tavern/town-blockout/terrain.ts';
import {mountWestCraterRoad} from './voxel-tavern/town-blockout/town-za22-crater-road.ts';
import {createTownRailway} from './voxel-tavern/town-blockout/town-railway.ts';
import {buildCraterRailExtension} from './voxel-tavern/town-blockout/town-crater-rail-extension.ts';
import {mountProductionRidge} from './voxel-tavern/town-blockout/town-d-r30-production-ridge.ts';
const grid=createTerrainGrid(),town=new Scene(),rail=createTownRailway(grid,()=>0),west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),branch=buildCraterRailExtension(grid,west,rail.route.points);
const ridge=mountProductionRidge(town,grid,{loop:rail.route.points,branch:branch.samples,rearConnectorCandidate:true});
try{
 const b={west:10,east:630,south:300,north:790},W=b.east-b.west+1,H=b.north-b.south+1;
 const idx=(e,n)=>(n-b.south)*W+e-b.west,point=k=>[b.west+k%W,b.south+Math.floor(k/W)];
 const valid=(e,n)=>{const h=grid.heightAt(e,n);return !ridge.blocked(e,n,h,.32)&&Number.isFinite(h)?h:undefined;};
 const cache=new Map(),sample=(e,n)=>{const k=idx(e,n);if(!cache.has(k))cache.set(k,valid(e,n));return cache.get(k);};
 const start=[440,512],goal=[324,655],s=idx(...start),g=idx(...goal);
 const q=[s],prev=new Int32Array(W*H).fill(-2);prev[s]=-1;
 let count=0;
 for(let i=0;i<q.length&&prev[g]===-2;i++){
  const k=q[i],[e,n]=point(k),h=sample(e,n);if(h===undefined)continue;
  for(const [de,dn] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2],[3,1],[3,-1],[-3,1],[-3,-1],[1,3],[1,-3],[-1,3],[-1,-3],[3,2],[3,-2],[-3,2],[-3,-2],[2,3],[2,-3],[-2,3],[-2,-3],[4,1],[4,-1],[-4,1],[-4,-1],[1,4],[1,-4],[-1,4],[-1,-4],[4,3],[4,-3],[-4,3],[-4,-3],[3,4],[3,-4],[-3,4],[-3,-4]]){
   const E=e+de,N=n+dn;if(E<b.west||E>b.east||N<b.south||N>b.north)continue;
   const j=idx(E,N);if(prev[j]!==-2)continue;
   const end=sample(E,N);if(end===undefined||Math.abs(end-h)>.70*Math.hypot(de,dn))continue;
   let good=true,last=h;
   const steps=Math.ceil(Math.hypot(de,dn)*5);for(let u=1;u<=steps;u++){const t=u/steps,y=valid(e+de*t,n+dn*t);if(y===undefined||Math.abs(y-last)>.70*Math.hypot(de,dn)/steps+.001){good=false;break;}last=y;}
   if(!good)continue;
   prev[j]=k;q.push(j);
  }
 }
 console.log(JSON.stringify({start:[...start,valid(...start)],goal:[...goal,valid(...goal)],visited:q.length,highest:q.reduce((max,k)=>Math.max(max,grid.heightAt(...point(k))),-Infinity),reachable:prev[g]!==-2}));
 if(prev[g]!==-2){let path=[];for(let k=g;k>=0;k=prev[k])path.push(point(k));path.reverse();const corners=path.filter((p,i)=>i===0||i===path.length-1||p[0]-path[i-1][0]!==path[i+1][0]-p[0]||p[1]-path[i-1][1]!==path[i+1][1]-p[1]);console.log(JSON.stringify({nodes:path.length,corners}));}
}finally{ridge.dispose();}
