import type {MainSummitTrailPoint as Point} from './main-summit-trail';
import type {SouthGround} from './town-night-a-summit-landform';
import {proposeSouthRoadGrade} from './town-night-a-summit-road-grade';
/** A-local contour replacement, not the missing C2 cross-sector connection.
 * Surveyed against the D2 canonical 8m triangles at 11d7187c.
 * Original endpoints 1765/2262 and neighbouring tangents are pinned.
 * The <=5.35m local earthwork allowance is explicit (old 5m fails).
 * This is a physical candidate only; it never grants a domain or route permit. */
export function surveyA32SouthRoad(trail:readonly Point[],groundAt:SouthGround){
 const first=1765,last=2262,a=trail[first]!,b=trail[last]!;
 if(!a||!b||Math.hypot(a.east-299.26842021967656,a.north-363.36427426140114,a.height-491.65298884984816)>.001||Math.hypot(b.east+179.96195528884255,b.north-447.83705020750295,b.height-532.4082850600432)>.001)throw Error('A32 south road endpoint survey changed');
 const ns=[a.north,360,354,348,342,340,338,340,346,352,358,364,370,376,378,384,390,414,432,438,440,438,438,434,430,430,426,426,422,422,420,424,424,426,430,434,438,440,444,446,b.north];
 const way=ns.map((north,i)=>({east:a.east+(b.east-a.east)*i/(ns.length-1),north,height:i===0?a.height:i===ns.length-1?b.height:0}));
 const sampled:Point[]=[trail[first-1]!,a];
 for(let i=1;i<way.length;i++){
  const p=way[i-1]!,q=way[i]!,steps=Math.ceil(Math.hypot(q.east-p.east,q.north-p.north));
  for(let j=1;j<=steps;j++)sampled.push({east:p.east+(q.east-p.east)*j/steps,north:p.north+(q.north-p.north)*j/steps,height:i===way.length-1&&j===steps?b.height:0});
 }
 sampled.push(trail[last+1]!);
 const grade=proposeSouthRoadGrade(sampled,1,sampled.length-2,groundAt,5.25);
 if(!grade.ok)throw Error('A32 south road no longer fits: '+grade.deficit.toFixed(3)+'m');
 return {trail:[sampled[0]!,...grade.profile,sampled.at(-1)!],first:1,last:sampled.length-2,cap:5.35,grade,originalFirst:first,originalLast:last};
}
/** Complete the originally missing 1539..2262 interval, using one physical tread. */
export function surveyA32SouthRoadJoint(trail:readonly Point[],groundAt:SouthGround){
 const ext=surveyA32SouthRoad(trail,groundAt),first=1539,last=1765;
 const prefix=proposeSouthRoadGrade(trail,first,last,groundAt,5.65);
 if(!prefix.ok)throw Error('A32 joint road exceeds earthwork budget: '+prefix.deficit.toFixed(3)+'m');
 const profile=[...prefix.profile,...ext.grade.profile.slice(1)];
 return {trail:[trail[first-1]!,...profile,trail[ext.originalLast+1]!],first:1,last:profile.length,cap:5.7,grade:{...prefix,profile,length:prefix.length+ext.grade.length,maxGrade:Math.max(prefix.maxGrade,ext.grade.maxGrade),cut:Math.max(prefix.cut,ext.grade.cut),fill:Math.max(prefix.fill,ext.grade.fill)},originalFirst:first,originalLast:ext.originalLast};
}
