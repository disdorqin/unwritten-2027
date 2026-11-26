type EN=Readonly<{east:number;north:number}>;
type Point=EN&Readonly<{height:number}>;
type Box=Readonly<{min:readonly number[];max:readonly number[]}>;
type Route=Readonly<{id:string;points:readonly Point[]}>;
type Road=Readonly<{heightAt(east:number,north:number):number|undefined}>;
export const bR30InscriptionApproachPlan=[
 [-55.44285714285714,165.05714285714285],[-53.63075545125356,172.25],
 [-54.13075545125356,173.75],[-64.63075545125356,183.25],
] as const;
const gap=(p:EN,b:Box)=>Math.hypot(Math.max(b.min[0]-p.east,p.east-b.max[0],0),Math.max(b.min[2]+p.north,-p.north-b.max[2],0));
function project(p:EN,a:EN,b:EN){
 const x=b.east-a.east,z=b.north-a.north,t=Math.max(0,Math.min(1,((p.east-a.east)*x+(p.north-a.north)*z)/(x*x+z*z||1)));
 return {t,distance:Math.hypot(p.east-a.east-t*x,p.north-a.north-t*z)};
}
/** A's real transfer dock anchor, B's original inscription foot.
 * A geometric candidate only, never a new support surface. */
export function surveyBR30InscriptionApproach(road:Road,foot:Point,route:Route,tracks:readonly (readonly EN[])[],solids:readonly Box[]){
 if(route.id!=='transfer-dock'||tracks.length!==3||tracks.some(t=>t.length<2))throw Error('Missing actual transfer dock or three tracks');
 const points=bR30InscriptionApproachPlan.map(([east,north])=>{
  const height=road.heightAt(east,north);if(height===undefined||!Number.isFinite(height))throw Error('Missing inscription approach support');
  return {east,north,height};
 });
 const start=points[0],end=points.at(-1)!;
 if(Math.hypot(end.east-foot.east,end.north-foot.north)>.015||Math.abs(end.height-foot.height)>.02)throw Error('Inscription foot moved');
 if(!route.points.slice(1).some((b,i)=>{const a=route.points[i],q=project(start,a,b);return q.distance<.02&&Math.abs(a.height+(b.height-a.height)*q.t-start.height)<.1;}))throw Error('Transfer dock anchor moved');
 const segments=tracks.flatMap(t=>t.slice(1).map((b,i)=>[t[i],b] as const));
 let bodyGap=Infinity,trackGap=Infinity,maxGrade=0,length=0,samples=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],d=Math.hypot(b.east-a.east,b.north-a.north),N=Math.max(1,Math.ceil(d/.08));length+=d;
  let prev=a.height;
  for(let j=0;j<=N;j++){
   const t=j/N,p={east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t},h=road.heightAt(p.east,p.north);
   if(h===undefined||!Number.isFinite(h))throw Error('Missing inscription route support');
   if(j)maxGrade=Math.max(maxGrade,Math.abs(h-prev)/(d/N));prev=h;samples++;
   for(const box of solids)if(box.min[1]<h+1.8&&box.max[1]>h+.025)bodyGap=Math.min(bodyGap,gap(p,box));
   for(const [x,z] of segments)trackGap=Math.min(trackGap,project(p,x,z).distance);
  }
 }
 if(bodyGap<.40||trackGap<1.30||maxGrade>.15)throw Error('Obstructed inscription approach '+bodyGap+'/'+trackGap+'/'+maxGrade);
 return {points,length,samples,bodyGap,trackGap,maxGrade,routeId:route.id};
}
