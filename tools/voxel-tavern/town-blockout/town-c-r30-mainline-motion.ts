import {Box3,Vector3} from 'three';
import type {mountUndergroundMainlineScene} from './underground-mainline-scene.js';
import type {UndergroundMainlinePoint as Point} from '../../../src/shared/underground-mainline-track.js';
type Scene=Extract<ReturnType<typeof mountUndergroundMainlineScene>,{kind:'ready'}>;
type Support=(p:Point,radius:number,height:number)=>boolean;
/** This is a projection of the already accepted U19 snapshot. The public
 * movement owner consumes the returned rider pose and explicit leave foot.
 * No input, local seat ownership or automatic exit is implemented here. */
export function createR30MainlineMotion(scene:Scene,supports:Support){
 let bounds:Box3|undefined;
 function sync(){
  if(!scene.acceptedSnapshot()){bounds=undefined;return}
  scene.cart.updateWorldMatrix(true,true);
  bounds=new Box3().setFromObject(scene.cart);
  if(bounds.isEmpty())bounds=undefined;
 }
 function blocked(e:number,n:number,y:number,r:number,h:number){
  const b=bounds;if(!b)return false;
  return b.max.y>y+.025&&b.min.y<y+h&&Math.hypot(
   Math.max(0,b.min.x-e,e-b.max.x),Math.max(0,b.min.z+n,-n-b.max.z))<r;
 }
 function validFoot(p:Point){
  return supports(p,.27,1.8)&&!scene.blocks(p.east,p.north,p.height,.27,1.8)&&!blocked(p.east,p.north,p.height,.27,1.8);
 }
 function sideFoot(){
  const snap=scene.acceptedSnapshot();
  if(!snap||snap.speed!==0||!['stopped','derailed'].includes(snap.mode))return;
  const pose=scene.route.sample(snap.chainage),p=pose.position,c=Math.cos(pose.heading),s=Math.sin(pose.heading);
  const candidate=(side:number,along:number)=>({east:p.east+c*side-s*along,north:p.north+s*side+c*along,height:p.height});
  // Side steps stay within the original action reach; use the actual box
  // and swept clear floor, never a guessed nearest ground or teleport.
  for(const along of [0,.35,-.35])for(const side of [1.22,-1.22,1.48,-1.48]){
   const q=candidate(side,along);
   if(!validFoot(q))continue;
   let clear=true;
   for(let a=.62;a<=Math.abs(side);a+=.08){
    const p0=candidate(Math.sign(side)*a,along*a/Math.abs(side));
    if(!supports(p0,.27,1.8)||scene.blocks(p0.east,p0.north,p0.height,.27,1.8)){clear=false;break}
   }
   if(clear)return {domainId:scene.route.domainId,...q};
  }
 }
 const world=(v:Vector3):Point=>({east:v.x,north:-v.z,height:v.y});
 sync();
 return {sync,blocked,
  /** R30 public viewer uses the authority's rider ID, not a local "mounted" flag. */
  riderPose(playerId:string){
   const snap=scene.acceptedSnapshot();
   if(!snap||!playerId||snap.riderId!==playerId||!scene.cart.visible)return;
   scene.cart.updateWorldMatrix(true,false);
   const foot=world(scene.cart.localToWorld(new Vector3(0,.36,0)));
   const eye=world(scene.cart.localToWorld(new Vector3(0,1.54,0)));
   const heading=scene.route.sample(snap.chainage).heading;
   return {domainId:scene.route.domainId,revision:snap.revision,mode:snap.mode,foot,eye,heading,
    canLeave:snap.speed===0&&(snap.mode==='stopped'||snap.mode==='derailed')};
  },
  boardingFoot(){const s=scene.acceptedSnapshot();return s&&!s.riderId&&s.mode==='stopped'?sideFoot():undefined},
  /** Ask before committing leave; apply only after the same accepted leave
   * receipt, never as a crash response. */
  leaveFoot(playerId:string){const s=scene.acceptedSnapshot();return s?.riderId===playerId?sideFoot():undefined},
  dispose(){bounds=undefined},
 };
}
