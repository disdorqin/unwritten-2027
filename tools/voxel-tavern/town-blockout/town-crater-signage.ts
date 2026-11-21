import {
  BoxGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NearestFilter, PlaneGeometry, SRGBColorSpace, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CraterOuterSite } from './town-crater-outer-works';
import type { CraterMouthSite } from './town-crater-mouth-works';

export type CraterSignEra = 'town' | 'sealed' | 'decay' | 'factory' | 'paper' | 'station';
export type CraterSign = Readonly<{
  id: string;
  title: string;
  lines: readonly string[];
  era: CraterSignEra;
  east: number;
  north: number;
  foot: number;
  centerHeight: number;
  yaw: number;
  width: number;
  height: number;
  freestanding: boolean;
  interactionRadius: number;
}>;
export type CraterStationAnchor = Readonly<{
  east:number; north:number; height:number;
  /** Facing the public sidewalk at the real station exterior wall. */
  outwardYaw:number;
}>;

/** Exact canon. Do not change spacing, characters, or the unfinished last line. */
export const craterSignCopy = Object.freeze({
  wall: ['坑区年久失修，山路危险——','乡亲们送到这里，就请回吧。','夜里风大，莫要久留。','未写镇公所'],
  fence: ['封存重地 · 非工勿入','入内者须持工牌，于集结地登记。'],
  collapse: ['此处塌方，危险。','绕行正门。'],
  stationName: ['坑口站'],
  stationBoard: ['晨一班　午一班　暮一班　夜一班','货运矿料，随正班附挂。','夜车空驶，亦准点。乘车请至山口站换乘。'],
  smelterName: ['冶炼工坊'],
  smelterDuty: ['腊月廿三','一班　白望山　到','二班　石　沉　到','三班　炉火看住，莫等我——'],
  instrumentName: ['仪器工坊'],
  instrumentNotice: ['各表送修，先登记，后领取。','急件敲窗，莫敲门。'],
} as const);

type Road = Readonly<{
  anchor:{east:number;north:number};
  heightAt:(east:number,north:number)=>number|undefined;
}>;
type SiteGroups = Readonly<{
  mouth:readonly CraterMouthSite[];
  outer:readonly CraterOuterSite[];
  station?:CraterStationAnchor;
}>;
const angle=(degrees:number)=>degrees*Math.PI/180;
const faceTowardBearing=(bearing:number)=>Math.PI-angle(bearing);
function local(site:{east:number;north:number}, bearing:number, dx:number, dz:number) {
  const radians=angle(bearing);
  return {
    east:site.east+dx*Math.cos(radians)+dz*Math.sin(radians),
    north:site.north-dx*Math.sin(radians)+dz*Math.cos(radians),
  };
}

function drawSignAtlas(signs:readonly CraterSign[]) {
  if(typeof document==='undefined') return;
  const cell=512,cols=4;
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=cell*cols;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  for(let i=0;i<signs.length;i++) {
    const sign=signs[i]!;
    const x=(i%cols)*cell,y=Math.floor(i/cols)*cell;
    const era=sign.era;
    const paper=era==='town'?'#e2d5b0':era==='sealed'?'#5a4940':
      era==='decay'?'#a18b68':era==='factory'?'#716256':
      era==='station'?'#524b40':'#ddca9d';
    const ink=era==='sealed'?'#e1d3b6':era==='factory'||era==='station'?'#e9e1ce':'#302920';
    ctx.fillStyle=paper;ctx.fillRect(x+10,y+10,492,492);
    ctx.strokeStyle=era==='sealed'?'#965638':'#75563d';
    ctx.lineWidth=12;ctx.strokeRect(x+20,y+20,472,472);
    // Procedural deterioration is texture, never a replacement for approved text.
    for(let j=0;j<86;j++){
      const noise=((j*73+17)%461),noiseY=(j*137+31)%461;
      ctx.fillStyle=era==='sealed'||era==='factory'?'rgba(58,20,12,.14)':'rgba(47,31,19,.095)';
      ctx.fillRect(x+25+noise,y+25+noiseY,j%4===0?11:3,j%6===0?6:2);
    }
    ctx.fillStyle=ink;
    ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=sign.lines;
    const gap=Math.min(106,405/Math.max(1,lines.length));
    for(const [row,line] of lines.entries()) {
      let font=line.length>22?32:line.length>15?39:50;
      const family=era==='station'||(era==='factory'&&row>0)
        ? '"Noto Sans SC","Microsoft YaHei",sans-serif'
        : '"Noto Serif SC","SimSun",serif';
      do {
        ctx.font=`${row===0?'bold ':''}${font}px ${family}`;
        if(ctx.measureText(line).width<=442||font<=19)break;
        font-=1;
      }while(true);
      const baseline=y+256+(row-(lines.length-1)/2)*gap;
      ctx.fillText(line,x+256,baseline,442);
      // Preserve the half-written last shift; no added signature, no continuation.
    }
  }
  const texture=new CanvasTexture(canvas);
  texture.colorSpace=SRGBColorSpace;
  texture.magFilter=texture.minFilter=NearestFilter;
  return texture;
}

/**
 * Renders only approved existing worksite signage. The two station boards are
 * staged until a station-wall anchor is supplied by the future mainline-3
 * constructor; never floating in the reserved rail corridor.
 */
export function mountCraterSignage(road:Road, sites:SiteGroups) {
  const group=new Group();
  group.name='za36-canonical-crater-signage';
  const panels:CraterSign[]=[];
  const lookup=(scope:'mouth'|'outer',id:string)=>
    sites[scope].find(site=>site.id===id);
  function add(id:string,title:string,lines:readonly string[],era:CraterSignEra,
    east:number,north:number,centerOffset:number,yaw:number,
    width:number,height:number,freestanding=false,ground?:number) {
    const foot=ground??road.heightAt(east,north);
    if(foot===undefined||!Number.isFinite(foot))return;
    panels.push({
      id,title,lines,era,east,north,foot,centerHeight:foot+centerOffset,
      yaw,width,height,freestanding,interactionRadius:freestanding?1.5:1.7,
    });
  }
  const wall=lookup('outer','wall-gate');
  if(wall) add('wall-notice','围墙正门告示',craterSignCopy.wall,'town',
    wall.east-1.02,wall.north+3.35,3.05,-Math.PI/2,2.2,1.9,false,
    road.heightAt(wall.east-1.02,wall.north+3.35));
  const mainGate=lookup('mouth','fence-main-gate');
  if(mainGate) {
    const b=166.3;
    const e=road.anchor.east+90*Math.sin(angle(b));
    const n=road.anchor.north+90*Math.cos(angle(b));
    add('fence-warning','铁栅栏正门警示',craterSignCopy.fence,'sealed',
      e,n,2.7,faceTowardBearing(b),2.4,1.42);
  }
  for(const [i,b]of [21,286].entries()) {
    const radius=101.8;
    const east=road.anchor.east+radius*Math.sin(angle(b));
    const north=road.anchor.north+radius*Math.cos(angle(b));
    add(`collapse-warning-${i+1}`,`塌口${i+1}警示`,craterSignCopy.collapse,
      'decay',east,north,1.6,faceTowardBearing(b),1.65,1.05,true);
  }
  const smelter=lookup('outer','smelter-plant');
  if(smelter){
    const face=387,frYaw=faceTowardBearing(face);
    const door=local(smelter,face,-4,5.92);
    add('smelter-name','冶炼工坊门牌',craterSignCopy.smelterName,'sealed',
      door.east,door.north,4.45,frYaw,2.5,.9);
    // Inner-side shift board, not an external UI list or forged continuation.
    const inner=local(smelter,face,-4.0,4.95);
    add('smelter-duty','冶炼工坊值班表',craterSignCopy.smelterDuty,'factory',
      inner.east,inner.north,2.45,frYaw+Math.PI,2.75,1.85);
  }
  const instrument=lookup('outer','instrument-plant');
  if(instrument){
    const face=307,yaw=faceTowardBearing(face);
    const plaque=local(instrument,face,-3.1,5.26);
    add('instrument-name','仪器工坊门牌',craterSignCopy.instrumentName,'sealed',
      plaque.east,plaque.north,3.55,yaw,2.5,.9);
    const notice=local(instrument,face,3.2,5.30);
    add('instrument-notice','仪器工坊修表通知',craterSignCopy.instrumentNotice,'paper',
      notice.east,notice.north,2.25,yaw,2.4,1.25);
  }
  if(sites.station) {
    const s=sites.station;
    add('crater-station-name','坑口站名牌',craterSignCopy.stationName,'station',
      s.east,s.north,s.height+3.2-s.height,s.outwardYaw,2.1,.75,false,s.height);
    add('crater-station-schedule','坑口站时刻牌',craterSignCopy.stationBoard,'station',
      s.east+1.6,s.north,s.height+1.8-s.height,s.outwardYaw,2.9,1.8,false,s.height);
  }
  // 4x4 atlas: one merged face material rather than one CanvasTexture/draw per board.
  const texture=drawSignAtlas(panels);
  const plateGeometries:PlaneGeometry[]=[];
  const frameGeometries=new Map<CraterSignEra,BoxGeometry[]>();
  const eras:CraterSignEra[]=['town','sealed','decay','factory','paper','station'];
  const colors:Record<CraterSignEra,number>={
    town:0x966f47,sealed:0x493d35,decay:0x70523d,factory:0x594a3c,paper:0x876649,station:0x58483a,
  };
  function backing(sign:CraterSign,atEast:number,atHeight:number,atNorth:number,
    width:number,height:number,depth:number) {
    const g=new BoxGeometry(width,height,depth);
    g.rotateY(sign.yaw);
    g.translate(atEast,atHeight,-atNorth);
    const arr=frameGeometries.get(sign.era)??[];
    arr.push(g);frameGeometries.set(sign.era,arr);
  }
  for(const [i,sign] of panels.entries()){
    const g=new PlaneGeometry(sign.width,sign.height);
    const uv=g.getAttribute('uv');
    const col=i%4,row=Math.floor(i/4);
    for(let v=0;v<uv.count;v++)uv.setXY(v,(col+uv.getX(v))/4,(3-row+uv.getY(v))/4);
    uv.needsUpdate=true;
    g.rotateY(sign.yaw);
    const normal=new Vector3(Math.sin(sign.yaw),0,Math.cos(sign.yaw));
    g.translate(sign.east+normal.x*.083,sign.centerHeight,-sign.north+normal.z*.083);
    plateGeometries.push(g);
    backing(sign,sign.east,sign.centerHeight,sign.north,sign.width+.19,sign.height+.19,.16);
    if(sign.freestanding)for(const side of [-1,1]){
      const offset=(sign.width/2-.18)*side;
      // right vector for a local signboard: (cos yaw,0,-sin yaw)
      const pe=sign.east+Math.cos(sign.yaw)*offset;
      const pn=sign.north+Math.sin(sign.yaw)*offset;
      backing(sign,pe,sign.foot+.85,pn,.11,1.7,.13);
    }
  }
  const plate=mergeGeometries(plateGeometries);
  if(plate){
    plate.name='crater-signage-merged-faces';
    const material=new MeshBasicMaterial({color:0xffffff,...(texture?{map:texture}:{}),side:DoubleSide});
    const mesh=new Mesh(plate,material);
    mesh.name='crater-signage-merged-faces';
    group.add(mesh);
  }
  for(const era of eras){
    const components=frameGeometries.get(era);
    if(!components?.length)continue;
    const geo=mergeGeometries(components);
    if(!geo)continue;
    const mesh=new Mesh(geo,new MeshStandardMaterial({color:colors[era],roughness:1,metalness:era==='sealed'?.28:0}));
    mesh.name=`crater-signage-frame-${era}`;
    group.add(mesh);
  }
  for(const g of [...plateGeometries,...[...frameGeometries.values()].flat()])g.dispose();
  const pending=sites.station?[]:['crater-station-name','crater-station-schedule'];
  const groupSnapshot=panels.map(({id,title,lines,era,east,north,foot,centerHeight})=>({
    id,title,lines:[...lines],era,east,north,foot,centerHeight,
  }));
  group.userData.signs=groupSnapshot;
  return {
    group,panels,pending,
    actionAt(east:number,north:number,feet:number){
      let best:CraterSign|undefined;
      let distance=Infinity;
      for(const sign of panels){
        const d=Math.hypot(east-sign.east,north-sign.north);
        if(d>sign.interactionRadius||d>=distance||Math.abs(feet-sign.foot)>1.7)continue;
        best=sign;distance=d;
      }
      return best;
    },
    dispose(){
      group.traverse(node=>{
        if((node as Mesh).isMesh){
          const mesh=node as Mesh;
          mesh.geometry.dispose();
          (mesh.material as MeshStandardMaterial).dispose();
        }
      });
      texture?.dispose();
      group.removeFromParent();
    },
  };
}
