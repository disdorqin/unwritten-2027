import {Box3,Group,InstancedMesh,Matrix4,Mesh,Vector3} from 'three';
import {createUndergroundMineCartTrack,undergroundMineCartLocalTrack,isMineCartSnapshot,nextMineCartStep,type MineCartSnapshot,type MineCartPoint as Point,type MineCartPush,type MineCartDirection} from '../../../src/shared/underground-mine-cart-track.js';
import {mountUndergroundMineCartActivity} from './underground-mine-cart-activity.js';
type Track=ReturnType<typeof createUndergroundMineCartTrack>;
type Local=readonly[number,number,number];
type Viewer=Readonly<{playerId:string;domainId:string;foot:Point}>;
export type R30TutorialCartBridge=Readonly<{
 acceptsTrack(track:Track):boolean;
 readSnapshot():MineCartSnapshot|undefined;
 readViewer():Viewer|undefined;
 canSee(playerId:string,foot:Point):boolean;
 dispatch(playerId:string,request:MineCartPush):void;
 onRoll?(point:Readonly<{layer:string;x:number;y:number;z:number}>):void;
}>;
type Support=(p:Point,r:number,h:number)=>boolean;
const domainId='underground/mine',pushReach=.65;
const finite=(p:Point)=>[p.east,p.north,p.height].every(Number.isFinite);
/** The original U7 two-push toy, physically distinct from the U19 haulage
 * line. The same original track data supplies rail alignment and accepted
 * interaction feet. No local push counter or inventory/ride state. */
export function mountR30TutorialCart(options:Readonly<{parent:Group;toWorld(p:Local):Point;supports:Support;bridge?:R30TutorialCartBridge}>){
 const {parent,toWorld,supports,bridge}=options;
 const datum=undergroundMineCartLocalTrack;
 const to=(p:Point)=>toWorld([p.east,p.height,-p.north]);
 const track=createUndergroundMineCartTrack({start:to(datum.start),end:to(datum.end),approachOffset:datum.approachOffset});
 const trackClear=Array.from({length:29},(_,i)=>track.point(i/14)).every(p=>supports(p,.72,1.0));
 const workClear=([0,1,2] as const).every(step=>([-1,1] as const).every(dir=>nextMineCartStep(step,dir)===undefined||supports(track.approach(step,dir),.27,1.8)));
 if(!trackClear||!workClear)return {kind:'blocked' as const,reason:'original-u7-track-or-approach'};
 const accepted=()=>bridge?.acceptsTrack(track)===true;
 let last:MineCartSnapshot|undefined,active=false,disposed=false;
 const activity=mountUndergroundMineCartActivity({parent,track,domainId,pushReach,rollSeconds:.34,
  requestPush:()=>{},onRoll:point=>{if(active)bridge?.onRoll?.(point)}});
 activity.group.name='r30-u7-original-two-push-cart';
 // Calculate actual cart mesh bounds in the rail's horizontal frame
 // once. The rotated world AABB overstates the nose at this yaw and
 // falsely blocks the original U7 push approach.
 activity.group.updateWorldMatrix(true,true);
 const origin=activity.group.getWorldPosition(new Vector3()),inv=new Matrix4().makeRotationY(-track.heading).multiply(new Matrix4().makeTranslation(-origin.x,-origin.y,-origin.z));
 const body=new Box3();
 activity.group.traverse(o=>{
  if(!(o instanceof Mesh))return;
  const b=o instanceof InstancedMesh?(o.computeBoundingBox(),o.boundingBox):(o.geometry.computeBoundingBox(),o.geometry.boundingBox);
  if(b)body.union(b.clone().applyMatrix4(new Matrix4().multiplyMatrices(inv,o.matrixWorld)));
 });
 const c=Math.cos(track.heading),s=Math.sin(track.heading);
 function current(){
  const s=accepted()?bridge?.readSnapshot():undefined;
  if(!s||!isMineCartSnapshot(s)||last&&(s.revision<last.revision||(s.revision===last.revision&&s.step!==last.step)))return;
  return s;
 }
 function sync(){
  if(disposed)return;
  const s=current();
  active=!!s;
  if(!s){activity.group.visible=false;return}
  last={...s};activity.sync(s,domainId);
 }
 function update(dt:number){if(active&&!disposed)activity.update(dt)}
 function prompt(direction?:MineCartDirection){
  if(!active||disposed)return;
  const s=current(),v=bridge?.readViewer();
  if(!s||!last||s.revision!==last.revision||s.step!==last.step||!v||v.domainId!==domainId||!v.playerId.trim()||!finite(v.foot))return;
  const possible=([-1,1] as const).filter(d=>direction===undefined||direction===d).filter(d=>nextMineCartStep(s.step,d)!==undefined).map(d=>({direction:d,foot:track.approach(s.step,d)}));
  return possible.filter(p=>Math.hypot(v.foot.east-p.foot.east,v.foot.north-p.foot.north,v.foot.height-p.foot.height)<=pushReach&&bridge?.canSee(v.playerId,p.foot))
   .map(p=>({id:'u7/push/'+p.direction,revision:s.revision,label:'推空矿车',...p,playerId:v.playerId}))[0];
 }
 function press(expectedId:string){
  const p=prompt();if(!p||p.id!==expectedId)return false;
  bridge?.dispatch(p.playerId,{direction:p.direction,revision:p.revision});return true;
 }
 function blocks(e:number,n:number,y:number,r:number,h:number){
  if(!active||disposed||!activity.group.visible)return false;
  const pos=activity.group.position,dx=e-pos.x,dn=n+pos.z,side=dx*c+dn*s,z=dx*s-dn*c;
  // Reserve the continuous swept body between rendered and target poses.
  // Both lie on the same straight surveyed rail.
  let offsetZ=0,offsetY=0;
  if(last){const p=track.point(last.step);offsetZ=(p.east-pos.x)*s-(p.north+pos.z)*c;offsetY=p.height-pos.y}
  return pos.y+body.max.y+Math.max(0,offsetY)>y+.025&&pos.y+body.min.y+Math.min(0,offsetY)<y+h&&
   Math.hypot(Math.max(0,body.min.x-side,side-body.max.x),Math.max(0,body.min.z+Math.min(0,offsetZ)-z,z-body.max.z-Math.max(0,offsetZ)))<r;
 }
 sync();
 return {kind:'ready' as const,track,group:activity.group,accepted,sync,update,prompt,press,blocks,
  acceptedSnapshot:()=>active&&last?{...last}:undefined,
  dispose(){disposed=true;active=false;activity.dispose()}};
}
