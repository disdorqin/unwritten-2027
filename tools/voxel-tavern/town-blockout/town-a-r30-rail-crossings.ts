import {BufferGeometry} from 'three';
import {buildRailStrip,railSections,type RailSample,type RailSection} from './town-a-r30-rail-strip';
import {orientedSupportBox,type OrientedSupportBox} from './town-a-r30-oriented-support';

export type RailCrossingSpec=Readonly<{id:string;east:number;north:number;halfLength:number}>;
export const mainPedestrianCrossings:readonly RailCrossingSpec[]=[
  {id:'north-tower-road',east:-42.73,north:179.22,halfLength:4.6},
  {id:'south-industrial-road',east:-46.9,north:154.3,halfLength:4.7},
  {id:'instrument-road',east:-50.64,north:142.28,halfLength:4.4},
];
export const freightPedestrianCrossings:readonly RailCrossingSpec[]=[
  {id:'freight-loading-road',east:-55.5,north:147.0,halfLength:4.5},
];
export const narrowPedestrianCrossings:readonly RailCrossingSpec[]=[
  {id:'supply-and-smelter-road',east:-72.31,north:132.35,halfLength:4.3},
  {id:'yard-road',east:-129.96,north:110.65,halfLength:5.0},
];

export type RailCrossing=Readonly<{id:string;east:number;north:number;top:number;span:number;floors:readonly OrientedSupportBox[]}>;
/** Level plank road crossings follow the actual curved rail section. The
 * wood surface is below the rail head and has a visible flangeway, while
 * the existing player floor index bridges the narrow wheel groove. Two
 * physical approach steps on each side avoid a 0.7m invisible climb.
 * Only the surveyed level western crossings are built; a future steep
 * track profile cannot silently acquire an incompatible pedestrian deck. */
export function buildRailCrossings(samples:readonly RailSample[],specs:readonly RailCrossingSpec[],gauge:number,ballastWidth:number,
  emit:(geometry:BufferGeometry)=>void,emitStone:(geometry:BufferGeometry)=>void,floors:OrientedSupportBox[]){
  const sections=railSections(samples),result:RailCrossing[]=[];
  const half=(ballastWidth+.16)/2,flange=.24/2,step=.76;
  for(const spec of specs){
    const center=sections.reduce((a,b)=>Math.hypot(b.east-spec.east,b.north-spec.north)<Math.hypot(a.east-spec.east,a.north-spec.north)?b:a);
    const local=sections.filter(s=>Math.abs(s.distance-center.distance)<=spec.halfLength+.85);
    if(local.length<3||Math.hypot(center.east-spec.east,center.north-spec.north)>.95)continue;
    if(local.some(s=>Math.abs(s.y-center.y)>.06))continue;
    const records:OrientedSupportBox[]=[];
    const surface=(lo:number,hi:number,bottom:number,top:number,render:(g:BufferGeometry)=>void)=>{
      const w=hi-lo;
      if(w<=0)return;
      render(buildRailStrip(local,(lo+hi)/2,w,bottom,top,.84));
    };
    // Three actual wood lanes with two wheel flangeways.
    surface(-half,-gauge/2-flange,-.36,-.045,emit);
    surface(-gauge/2+flange,gauge/2-flange,-.36,-.045,emit);
    surface(gauge/2+flange,half,-.36,-.045,emit);
    for(const side of [-1,1]){
      const near=side*(half+step/2),far=side*(half+step*1.5);
      surface(near-step/2,near+step/2,-.80,-.27,emitStone);
      surface(far-step/2,far+step/2,-.80,-.49,emitStone);
    }
    const register=(a:RailSection,b:RailSection,offset:number,width:number,low:number,high:number)=>{
      const de=b.east-a.east,dn=b.north-a.north,run=Math.hypot(de,dn);
      const me=dn/run,mn=-de/run;
      const e=(a.east+b.east)/2+me*offset,n=(a.north+b.north)/2+mn*offset,y=(a.y+b.y)/2;
      records.push(orientedSupportBox(e,n,Math.atan2(-de,dn),width,run+.055,y+low,y+high));
    };
    for(let i=1;i<local.length;i++){
      const a=local[i-1]!,b=local[i]!;
      register(a,b,0,half*2,-.36,-.045);
      for(const side of [-1,1]){
        register(a,b,side*(half+step/2),step,-.80,-.27);
        register(a,b,side*(half+step*1.5),step,-.80,-.49);
      }
    }
    floors.push(...records);
    result.push({id:spec.id,east:center.east,north:center.north,top:center.y-.045,
      span:local.at(-1)!.distance-local[0]!.distance,floors:records});
  }
  return result;
}
