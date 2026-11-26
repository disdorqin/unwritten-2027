import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {undergroundZodiacSites} from '../../../src/shared/underground-zodiac-sites.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Point=Readonly<{east:number;north:number;height:number}>;
type Local=readonly[number,number,number];
type Site=Readonly<{id:'star-stone:horse';domainId:'underground/mine';base:Point;stand:Point;aim:Point;legacyBase:Point;legacyStand:Point}>;
type Foot=Point&Readonly<{domainId:string}>;
export type R30HorseSeatBridge=Readonly<{
 acceptsSite(site:Site):boolean;
 read():Readonly<{playerId:string;atOrigin:boolean;offeringAccepted:boolean}>|undefined;
 isAimingAt(point:Point):boolean;
 dispatch(playerId:string,id:Site['id']):void;
}>;
const legacy=undergroundZodiacSites.horse;
// The shared horizontal legacy point is near the camp entry. The newer
// scene card specifies a seat beside the memorial. Keep it as a proposal
// until the common star-stone registration accepts the exact new site.
export const horseSeatLocal=Object.freeze({base:[4.25,-91,43.65] as Local,stand:[3.40,-91,43.25] as Local});
type Part={x:number;y:number;z:number;w:number;h:number;d:number;color:number};
export function mountR30HorseSeat(parent:Group,opts:Readonly<{
 toWorld(local:Local):Point;
 supports(x:number,z:number,r:number,h:number):boolean;
 readFoot():Foot|undefined;
 bridge?:R30HorseSeatBridge;
}>){
 const [x,y,z]=horseSeatLocal.base,[sx,sy,sz]=horseSeatLocal.stand;
 if(!opts.supports(x,z,.34,.85)||!opts.supports(sx,sz,.27,1.8))return {kind:'blocked' as const,reason:'memorial-shoulder-unsupported'};
 const site:Site={id:'star-stone:horse',domainId:'underground/mine',base:opts.toWorld(horseSeatLocal.base),stand:opts.toWorld(horseSeatLocal.stand),aim:opts.toWorld([x-.10,y+.47,z]),legacyBase:opts.toWorld([legacy.base.east,legacy.base.height,-legacy.base.north]),legacyStand:opts.toWorld([legacy.stand.east,legacy.stand.height,-legacy.stand.north])};
 const group=new Group();group.name='r30-horse-memorial-seat';parent.add(group);
 const seat:Part[]=[],plate:Part[]=[];
 const put=(list:Part[],dx:number,dy:number,dz:number,w:number,h:number,d:number,color:number)=>list.push({x:x+dx,y:y+dy,z:z+dz,w,h,d,color});
 put(seat,0,.085,0,.56,.17,.55,0x5c5145);
 put(seat,0,.205,0,.47,.09,.46,0x7b6c55);
 for(const s of [-1,1]){
  put(seat,s*.19,.29,0,.085,.08,.39,0x655a4b);
  put(seat,0,.29,s*.195,.32,.08,.07,0x655a4b);
 }
 // West-facing stone plaque, no lettering. The low relief is a horse
 // profile, not a replacement for the global stone actor.
 put(plate,0,.45,0,.16,.28,.34,0x837057);
 put(plate,0,.605,0,.145,.045,.26,0xa28d6d);
 put(plate,-.086,.45,0,.018,.236,.272,0x5a5147);
 const mask=['...11...','..1111..','..11111.','.111111.','1111111.','111111..','...111..','..1111..'];
 for(let row=0;row<mask.length;row++)for(let col=0;col<8;col++)if(mask[row][col]==='1')
  put(plate,-.102,.552-row*.027,(col-3.5)*.027,.014,.025,.025,row<2?0x9c8969:0xb9a583);
 const geo=new BoxGeometry(),map=makeCampGrain('rock'),mat=new MeshLambertMaterial({map}),meshes:InstancedMesh[]=[];
 for(const [name,list] of [['seat',seat],['stone',plate]] as const){
  const mesh=new InstancedMesh(geo,mat,list.length),matrix=new Matrix4(),q=new Quaternion(),color=new Color();
  list.forEach((p,i)=>{matrix.compose(new Vector3(p.x,p.y,p.z),q,new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color.setHex(p.color))});
  mesh.name='r30-horse-memorial/'+name;mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);
 }
 const stone=meshes[1];stone.visible=false;
 let disposed=false;
 function receipt(){
  const s=!disposed&&opts.bridge?.acceptsSite(site)===true?opts.bridge.read():undefined;
  return s&&typeof s.playerId==='string'&&s.playerId.trim()&&typeof s.atOrigin==='boolean'&&typeof s.offeringAccepted==='boolean'?s:undefined;
 }
 function sync(){stone.visible=receipt()?.atOrigin===true}
 function blocks(ex:number,nz:number,fy:number,r:number,h:number){
  return seat.some(p=>p.y+p.h/2>fy+.025&&p.y-p.h/2<fy+h&&Math.hypot(Math.max(0,Math.abs(ex-p.x)-p.w/2),Math.max(0,Math.abs(nz-p.z)-p.d/2))<r);
 }
 function prompt(){
  const s=receipt(),f=opts.readFoot();
  if(!s?.atOrigin||!s.offeringAccepted||!f||f.domainId!==site.domainId||![f.east,f.north,f.height].every(Number.isFinite)||
    Math.hypot(f.east-site.stand.east,f.north-site.stand.north)>.35||Math.abs(f.height-site.stand.height)>.08||
    !opts.bridge?.isAimingAt(site.aim))return;
  return {id:site.id,playerId:s.playerId,label:'献灯后取马石'};
 }
 function press(expectedId:string){const p=prompt();if(!p||p.id!==expectedId)return false;opts.bridge!.dispatch(p.playerId,p.id);return true}
 return {kind:'ready' as const,group,site,parts:[...seat,...plate],stone,blocks,sync,prompt,press,
  dispose(){if(disposed)return;disposed=true;group.removeFromParent();meshes.forEach(m=>m.dispose());geo.dispose();map.dispose();mat.dispose();group.clear()}};
}
