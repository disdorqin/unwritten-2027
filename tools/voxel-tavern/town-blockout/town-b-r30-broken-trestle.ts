import {BoxGeometry,BufferGeometry,Group,Mesh,MeshStandardMaterial,Vector3,Quaternion} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Box} from './landmark-kit';

type EN={east:number;north:number};
type Ground=(east:number,north:number)=>number|undefined;
/** K-B: one recognizable abandoned haul trestle, broken into an inclined
 * fragment and a standing end. No bridge or climbable deck is invented. */
export function buildBR30BrokenTrestle(east:number,north:number,heightAt:Ground,
  trail:readonly EN[],avoid:readonly EN[],reserved:readonly (EN&{radius:number})[],
  wood:MeshStandardMaterial,iron:MeshStandardMaterial){
  // The outermost collision corner is 1.62m from the surveyed origin.
  const radius=1.65;
  if(trail.some(p=>Math.hypot(p.east-east,p.north-north)<radius+3.1)||
    avoid.some(p=>Math.hypot(p.east-east,p.north-north)<radius+.75)||
    reserved.some(p=>Math.hypot(p.east-east,p.north-north)<radius+p.radius+.15))return;
  const samples=[-1.45,-.8,0,.65,1.45].flatMap(x=>[-.7,0,.7].map(z=>heightAt(east+x,north-z)));
  if(samples.some(h=>h===undefined||!Number.isFinite(h)))return;
  const heights=samples as number[];
  if(Math.max(...heights)-Math.min(...heights)>1.8)return;
  const h=heightAt(east,north)!;
  const group=new Group();group.name='b-r30-broken-haul-trestle';group.position.set(east,h,-north);
  const ground=(x:number,z:number)=>heightAt(east+x,north-z)!-h;
  const deck=(x:number)=>Math.max(...[-.6,0,.6].map(z=>ground(x,z)))+.30+.38*(x+1.4)/2.8;
  const batches=new Map<MeshStandardMaterial,BufferGeometry[]>();
  const up=new Vector3(0,1,0);
  function part(mat:MeshStandardMaterial,g:BufferGeometry){
    const batch=batches.get(mat)??[];batch.push(g);batches.set(mat,batch);
  }
  function box(mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,hh:number,d:number,rz=0){
    const g=new BoxGeometry(w,hh,d);g.rotateZ(rz);g.translate(x,y,z);part(mat,g);
  }
  function beam(mat:MeshStandardMaterial,a:Vector3,b:Vector3,w:number,d:number){
    const direction=b.clone().sub(a),len=direction.length();
    if(len<.025)return;
    const g=new BoxGeometry(w,len,d);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(up,direction.normalize()));
    const mid=a.clone().add(b).multiplyScalar(.5);g.translate(mid.x,mid.y,mid.z);part(mat,g);
  }
  // Two interrupted longitudinal sleepers. The gap is physical, not
  // disguised by an invisible bridge plane.
  for(const z of [-.44,.44]){
    beam(wood,new Vector3(-1.34,deck(-1.34)-.09,z),new Vector3(-.45,deck(-.45)-.09,z),.16,.17);
    beam(wood,new Vector3(.22,deck(.22)-.09,z),new Vector3(1.34,deck(1.34)-.09,z),.18,.18);
  }
  for(const [x,width,twist] of [[-1.28,1.32,-.08],[-1.01,1.16,.06],[-.74,.91,-.18],[.27,1.28,.04],[.54,1.32,0],[.81,1.32,0],[1.08,1.32,.03],[1.31,1.06,-.04]] as const){
    box(wood,x,deck(x),0,.23,.11,width,twist);
    for(const z of [-.44,.44])if(Math.abs(z)<width*.5)box(iron,x,deck(x)+.065,z,.045,.025,.045);
  }
  // The standing fragment rests on four measured, embedded posts and
  // crossed bracing; the collapsed fragment ends on its own rubble.
  for(const x of [.35,1.13])for(const z of [-.49,.49]){
    const base=ground(x,z)-.065,top=deck(x)-.10;
    beam(wood,new Vector3(x,base,z),new Vector3(x,top,z),.17,.18);
    box(iron,x,top-.025,z,.22,.075,.23);
  }
  for(const z of [-.49,.49])beam(wood,new Vector3(.35,ground(.35,z)+.06,z),new Vector3(1.13,deck(1.13)-.14,z),.10,.13);
  for(const x of [-1.18,-.65])for(const z of [-.44,.44]){
    const g=ground(x,z);box(wood,x,(g+deck(x)-.10)*.5,z,.20,Math.max(.12,deck(x)-.10-g+.08),.22);
  }
  // A short snapped guardrail, its lower end resting on the measured slope.
  const z=.60;
  beam(wood,new Vector3(.9,deck(.9)+.04,z),new Vector3(.9,deck(.9)+.52,z),.11,.12);
  beam(wood,new Vector3(.15,deck(.15)+.09,z),new Vector3(.9,deck(.9)+.52,z),.10,.12);
  for(const [mat,parts] of batches){
    const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());
    if(!g)throw Error('Cannot merge trestle');
    g.computeBoundingSphere();group.add(new Mesh(g,mat));
  }
  const colliders:Box[]=[];
  // Compact occupied upper assembly: below-player-height deck and bracing.
  // Never box the missing middle or the walkable low rubble fragment.
  const lo=Math.min(...[.22,.65,1.4].flatMap(x=>[-.65,.65].map(z=>ground(x,z))));
  const hi=Math.max(...[.22,.65,1.4].map(deck))+.11;
  colliders.push({min:[east+.12,h+lo,-north-.70],max:[east+1.46,h+hi,-north+.70]});
  colliders.push({min:[east+.84,h+deck(.9),-north+.54],max:[east+.96,h+deck(.9)+.58,-north+.66]});
  return {group,colliders,site:{east,north,height:h},footprint:radius,
    target:{east:east+.90,north:north-.60,height:h+deck(.9)+.48}};
}
