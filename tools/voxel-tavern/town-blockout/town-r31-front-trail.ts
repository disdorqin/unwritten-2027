import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,InstancedMesh,LineBasicMaterial,LineSegments,Matrix4,MeshLambertMaterial} from 'three';
import {certifyHikingSteps,type HikingFoot,type HikingPoint,type HikingSurface} from './town-a32-summit-hiking';

/** Offline surveyed natural-ground foot route (NOT the planned 12% road).
 * 140m middle station to 347m cloud apron. Many short traverses avoid
 * climbing the steep fall line. A runtime certificate against the final
 * mounted terrain and all actual obstacles is mandatory before displaying it.
 */
export const r31FrontTrailWaypoints:readonly HikingPoint[]=Object.freeze([
 [440,512],[438,513],[426,522],[423,526],[419,529],[415,528],[413,529],[410,533],[409,534],[405,537],[409,536],[405,539],[409,538],[411,537],[408,541],[406,544],[409,543],[406,547],[409,546],[408,550],[412,549],[416,550],[417,553],[420,557],[424,560],[422,563],[421,567],[423,570],[420,574],[416,577],[420,578],[416,580],[420,581],[416,582],[413,581],[409,578],[406,574],[402,571],[396,563],[394,560],[395,563],[394,561],[396,567],[392,561],[393,564],[391,561],[392,564],[391,562],[394,571],[392,568],[393,571],[391,568],[392,571],[390,568],[391,571],[389,568],[390,571],[388,568],[389,571],[387,568],[384,564],[380,561],[382,564],[376,560],[378,563],[375,561],[377,564],[374,562],[376,565],[373,563],[375,566],[369,562],[381,578],[378,576],[381,580],[378,578],[381,582],[378,580],[376,579],[382,587],[383,590],[385,598],[382,594],[384,602],[385,605],[387,613],[386,617],[384,620],[381,616],[378,625],[375,621],[372,625],[368,626],[336,650],[328,652],[324,655],
].map(([east,north])=>Object.freeze({east:east!,north:north!})));
export function* certifyR31FrontTrail(host:HikingSurface){
 return yield* certifyHikingSteps(host,r31FrontTrailWaypoints,.80);
}
/** Visual-only trail studs: every turn and at most 1.5m between studs.
 * The thin ground trace uses the same .25m sampling as the certificate.
 * No extra walkable surface or collider is introduced.
 */
export function mountR31FrontTrailGuides(host:HikingSurface,path:readonly HikingFoot[]){
 const group=new Group();group.name='r31-front-trail-guide';
 const geometry=new BoxGeometry(.16,.30,.16);
 const material=new MeshLambertMaterial({color:'#f6c653',emissive:'#735120',emissiveIntensity:.65});
 const lineMaterial=new LineBasicMaterial({color:'#eebd52',depthWrite:false});
 const bins=new Map<string,{studs:HikingFoot[];lines:number[]}>();
 let markers=0,skipped=0,traceMetres=0;
 const bucket=(e:number,n:number)=>{const key=Math.floor(e/64)+','+Math.floor(n/64);let b=bins.get(key);if(!b){b={studs:[],lines:[]};bins.set(key,b);}return b;};
 const point=(e:number,n:number):HikingFoot|undefined=>{
  const h=host.supportAt(e,n,.27);
  if(h===undefined||!Number.isFinite(h)||host.blocked(e,n,h,.27,1.8))return;
  return {east:e,north:n,height:h};
 };
 const add=(p:HikingFoot|undefined)=>{if(!p){skipped++;return;}bucket(p.east,p.north).studs.push(p);markers++;};
 if(path.length)add(point(path[0]!.east,path[0]!.north));
 for(let i=1;i<path.length;i++){
  const a=path[i-1]!,b=path[i]!,d=Math.hypot(b.east-a.east,b.north-a.north);
  if(d<=1e-8)continue;
  const n=Math.ceil(d/1.5);
  for(let j=1;j<=n;j++)add(point(a.east+(b.east-a.east)*j/n,a.north+(b.north-a.north)*j/n));
  const samples=Math.ceil(d/.25);let prev=point(a.east,a.north);
  for(let j=1;j<=samples;j++){
   const p=point(a.east+(b.east-a.east)*j/samples,a.north+(b.north-a.north)*j/samples);
   if(prev&&p&&Math.abs(p.height-prev.height)<=.8*d/samples+1e-6){
    bucket(prev.east,prev.north).lines.push(prev.east,prev.height+.075,-prev.north,p.east,p.height+.075,-p.north);traceMetres+=d/samples;
   }
   prev=p;
  }
 }
 const lineGeometries:BufferGeometry[]=[];const matrix=new Matrix4();
 for(const [key,b] of bins){
  if(b.studs.length){
   const mesh=new InstancedMesh(geometry,material,b.studs.length);mesh.name='front-trail-studs:'+key;
   b.studs.forEach((p,i)=>{mesh.setMatrixAt(i,matrix.makeTranslation(p.east,p.height+.145,-p.north));});
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
  }
  if(b.lines.length){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(b.lines,3));g.computeBoundingSphere();lineGeometries.push(g);const line=new LineSegments(g,lineMaterial);line.name='front-trail-trace:'+key;group.add(line);}
 }
 group.userData={visualOnly:true,includesWorldCollision:false,markers,skipped,traceMetres};
 let disposed=false;
 return {group,markers,skipped,traceMetres,dispose(){if(disposed)return;disposed=true;group.removeFromParent();geometry.dispose();material.dispose();lineMaterial.dispose();lineGeometries.forEach(g=>g.dispose());group.clear();}};
}
