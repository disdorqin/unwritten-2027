import {BoxGeometry,CanvasTexture,Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,
  MeshLambertMaterial,PlaneGeometry,SRGBColorSpace,type Object3D} from 'three';
import {northRidgeCableAnchors,northRidgeMidStation} from './north-ridge-350-terrain';

const [east,north]=northRidgeCableAnchors[1];
export const middleStationFoot=Object.freeze({east,north,height:northRidgeMidStation.height});
const station=middleStationFoot;
export const middleStationWaitingPoints=Object.freeze({
  up:{east:station.east+4.2,north:station.north-2.4,height:station.height},
  down:{east:station.east-4.2,north:station.north-2.4,height:station.height},
});
const palette={stone:'#777b78',timber:'#725139',iron:'#4c606b',brass:'#b59669',
  snow:'#c6d7dc',glass:'#789d9d',sign:'#443426',light:'#e4b675'} as const;
type Finish=keyof typeof palette;
type Box={e:number;n:number;y:number;w:number;d:number;h:number};

export function middleStationSurfaceAt(e:number,n:number,radius=.27){
  // The original cable anchor is also the surveyed T5 centreline.
  // No new height field: only the flat, actual 12x8m raised platform.
  if(Math.abs(e-station.east)<=6-radius&&Math.abs(n-station.north)<=4-radius)return station.height;
}
export function mountNorthRidgeMiddleStation(parent:Object3D){
  const group=new Group();group.name='north-ridge-middle-station';parent.add(group);
  const geom=new BoxGeometry();
  const parts=new Map<Finish,Matrix4[]>();
  const solids:Box[]=[];
  const materials=new Map<Finish,MeshLambertMaterial>();
  function add(f:Finish,e:number,n:number,y:number,w:number,d:number,h:number,solid=false){
    const matrix=new Matrix4().makeScale(w,h,d);
    matrix.setPosition(station.east+e,station.height+y,-station.north-n);
    const batch=parts.get(f)??[];batch.push(matrix);parts.set(f,batch);
    if(solid)solids.push({e:station.east+e,n:station.north+n,y:station.height+y,w,d,h});
  }
  // Same dark iron, wood and brass family as the existing cable terminal.
  // Keep both cable lanes and the T5 centreline unobstructed.
  add('stone',0,0,-.22,12,8,.44);
  for(let e=-5.5;e<=5.6;e+=.8)for(let n=-3.4;n<=3.5;n+=1.7)
    add('timber',e,n,.016,.77,1.65,.032);
  for(const s of [-1,1]){
    // Sheltered waiting bays on outer wings; not across cabin sweep.
    for(const n of [-3.35,3.35])for(const e of [s*3.6,s*5.5]){
      add('stone',e,n,.20,.58,.58,.40,true);
      add('iron',e,n,1.75,.19,.19,3.1,true);
      add('brass',e,n,3.18,.34,.34,.18);
    }
    add('timber',s*4.55,0,3.30,2.75,7.65,.24);
    for(let r=0;r<3;r++)add('snow',s*4.55,0,3.48+r*.12,2.76-r*.65,7.74-r*.1,.15);
    add('iron',s*5.64,0,3.16,.16,7.7,.18);
    for(let n=-2.9;n<=2.9;n+=.55)add('timber',s*5.34,n,.48,.38,.53,.13,true);
    add('stone',s*5.34,0,.24,.32,6,.38,true);
    for(const n of [-3.05,3.05]){
      add('brass',s*5.4,n,2.38,.35,.35,.45);
      add('light',s*5.4,n,2.34,.21,.22,.23);
    }
    // Mark direction pads by visible brass strips; centre walkway clear.
    for(let n=-2.4;n<=2.4;n+=1.2)add('brass',s*3.1,n,.04,.12,.75,.045);
  }
  for(const [f,matrices]of parts){
    const material=new MeshLambertMaterial({color:palette[f]});materials.set(f,material);
    const mesh=new InstancedMesh(geom,material,matrices.length);
    mesh.name='middle-station-'+f;matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
  }
  let board:Mesh<PlaneGeometry,MeshBasicMaterial>|undefined;
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;
    const ctx=canvas.getContext('2d');
    if(ctx){
      ctx.fillStyle='#443426';ctx.fillRect(0,0,768,256);ctx.strokeStyle='#bd9b69';ctx.lineWidth=12;ctx.strokeRect(8,8,752,240);
      ctx.fillStyle='#efe5cf';ctx.textAlign='center';ctx.font='bold 75px Microsoft YaHei,sans-serif';ctx.fillText('中山站',384,103);
      ctx.font='42px Microsoft YaHei,sans-serif';ctx.fillText('下山 ←    上山 →',384,193);
      const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
      board=new Mesh(new PlaneGeometry(2.6,.87),new MeshBasicMaterial({map:texture,side:2}));
      board.name='middle-station-direction-board';board.position.set(station.east+4.55,station.height+2.70,-station.north+3.35);group.add(board);
    }
  }
  return {group,surfaceAt:middleStationSurfaceAt,waiting:middleStationWaitingPoints,
    blocked(e:number,n:number,feet:number,radius:number,bodyHeight=1.8){
      return solids.some(s=>feet+bodyHeight>s.y-s.h/2&&feet<s.y+s.h/2&&
        Math.hypot(Math.max(0,Math.abs(e-s.e)-s.w/2),Math.max(0,Math.abs(n-s.n)-s.d/2))<radius);
    },
    setNight(night:boolean){const light=materials.get('light');if(light){light.emissive.set(night?'#e4b675':'#000000');light.emissiveIntensity=night?.55:0}},
    dispose(){group.removeFromParent();geom.dispose();materials.forEach(m=>m.dispose());board?.material.map?.dispose();board?.material.dispose();board?.geometry.dispose();}
  };
}
