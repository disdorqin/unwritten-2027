import {Mesh,MeshBasicMaterial,type Object3D} from 'three';
type Status='offline'|'dormant'|'repair'|'parked'|'running';
type Survey={length:number;lowerMetres:number};
const names={'ridge-cable-board-S-12':'base','middle-station-direction-board':'middle','ridge-cable-board-S-19':'summit'} as const;
type Station=typeof names[keyof typeof names];
export function nightBFrontBoardText(station:Station,status:Status,survey:Survey){
 const title=station==='base'?'山下站':station==='middle'?'中山站':'云海台站';
 const duration=(m:number)=>Math.ceil(m/5);
 if(status==='offline')return {title:title+' · 暂停登乘',lines:['等待服务器时钟同步','乘客保持安全位置','请勿跨越护栏']};
 if(status==='dormant')return {title:title+' · 缆车未启',lines:['线路正在检修','事故震醒后仅空车运行一站','步行巡查三处故障']};
 if(status==='repair')return {title:title+' · 检修试车',lines:['三处故障全部修通后开放','首降及调位不载客','请沿正式步道巡线']};
 if(status==='parked')return {title:title+' · 暂停发车',lines:['等候下一个白昼完整班次','夜间停运 · 末班抵站后停车','到站乘客可安全下车']};
 return {title:title+' · 正常运行',lines:[station==='middle'?`下段约${duration(survey.lowerMetres)}秒 · 上段约${duration(survey.length-survey.lowerMetres)}秒`:`全程约${duration(survey.length)+20}秒（含停车）`,'白昼按时运行 · 夜间停运','停站后按 E 登乘或下车']};
}
/** Repaint only the existing three station canvases, once per status change.
 * No duplicate signs, new geometries or per-frame texture allocations. */
export function createNightBFrontBoardPresenter(root:Object3D,survey:Survey){
 const cache=new WeakMap<Object3D,Status>();
 return (status:Status)=>{
  root.traverse(o=>{
   const station=names[o.name as keyof typeof names];if(!station||cache.get(o)===status||!(o instanceof Mesh)||!(o.material instanceof MeshBasicMaterial))return;
   const map=o.material.map,canvas=map?.image as HTMLCanvasElement|undefined,ctx=canvas?.getContext?.('2d');if(!map||!canvas||!ctx)return;
   const copy=nightBFrontBoardText(station,status,survey),w=canvas.width,h=canvas.height;
   ctx.fillStyle='#483b2c';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#bfa879';ctx.lineWidth=14;ctx.strokeRect(10,10,w-20,h-20);
   ctx.fillStyle='#f2e8d0';ctx.textAlign='center';ctx.font='bold 72px Microsoft YaHei,sans-serif';ctx.fillText(copy.title,w/2,h*.23,w-70);
   ctx.font='46px Microsoft YaHei,sans-serif';copy.lines.forEach((line,i)=>ctx.fillText(line,w/2,h*(.43+i*.19),w-70));
   o.userData.text=copy;map.needsUpdate=true;cache.set(o,status);
  });
 };
}
