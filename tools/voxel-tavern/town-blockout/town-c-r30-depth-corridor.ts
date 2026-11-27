import {BufferGeometry,BufferAttribute,DoubleSide,Group,Mesh,MeshLambertMaterial,MeshBasicMaterial,BoxGeometry,InstancedMesh,Matrix4,Color,Vector3,Quaternion,RepeatWrapping} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {r30LinkPoint,r30LinkPassage,r30LinkRibs,r30RibProfile,r30LinkLanternStations,r30GuideLantern,type R30DepthLink} from './town-c-r30-deep-layer-contract.js';
/** Continuous enclosed sloping tunnel from the C-owned receiving-foot
 * contract. Mount only after the host has validated both endpoint shells.
 * No automatic teleport, new movement rule, or water clock. */
export function mountR30DepthCorridor(parent:Group,link:R30DepthLink,acceptsEndpoints:()=>boolean){
 if(!acceptsEndpoints())return {kind:'unregistered-endpoints'} as const;
 const group=new Group();group.name='r30-depth-corridor/'+link.id;
 const coords:number[]=[0,link.landingRun];
 for(let t=link.landingRun+2;t<link.length-link.landingRun;t+=2)coords.push(t);
 coords.push(link.length-link.landingRun,link.length);
 const arrays={floor:[] as number[],rock:[] as number[]},uvs={floor:[] as number[],rock:[] as number[]},colors={floor:[] as number[],rock:[] as number[]};
 const shade=new Color();
 // Continuous horizontal mineral strata. The joins vary along the passage
 // but share the same station vertices, keeping the rock skin watertight.
 const strata=(t:number,s:number)=>[-.25,.40+.10*Math.sin(t*.17+s),1.25+.15*Math.sin(t*.11+s*2),2.35+.14*Math.cos(t*.14+s),link.clearance];
 const palette=[0x55545a,0x62615e,0x484b51,0x575a60];
 const half=link.width/2;
 function p(t:number,l:number,y=0){const w=r30LinkPoint(link,t,l)!;return [w.east-link.start.east,w.height-link.start.height+y,-w.north+link.start.north] as const;}
 function quad(key:keyof typeof arrays,a:readonly number[],b:readonly number[],c:readonly number[],d:readonly number[],u0:number,u1:number,v0:number,v1:number,tint=0x777777){
  arrays[key].push(...a,...b,...c,...a,...c,...d);
  uvs[key].push(u0,v0,u0,v1,u1,v1,u0,v0,u1,v1,u1,v0);
  shade.setHex(tint);for(let k=0;k<6;k++)colors[key].push(shade.r,shade.g,shade.b);
 }
 for(let i=1;i<coords.length;i++){
  const a=coords[i-1],b=coords[i];
  quad('floor',p(a,-half),p(b,-half),p(b,half),p(a,half),0,link.width/2,a/2,b/2,0x8b8986);
  for(const s of [-1,1]){
   const sa=strata(a,s),sb=strata(b,s);
   for(let k=0;k<4;k++){
    const v=[p(a,s*half,sa[k]),p(b,s*half,sb[k]),p(b,s*half,sb[k+1]),p(a,s*half,sa[k+1])] as const;
    if(s===-1)quad('rock',...v,sa[k]/2,sa[k+1]/2,a/2,b/2,palette[k]);
    else quad('rock',v[3],v[2],v[1],v[0],sa[k+1]/2,sa[k]/2,a/2,b/2,palette[k]);
   }
  }
  quad('rock',p(a,half,link.clearance),p(b,half,link.clearance),p(b,-half,link.clearance),p(a,-half,link.clearance),0,link.width/2,a/2,b/2,0x55575c);
  quad('rock',p(a,half,-.25),p(b,half,-.25),p(b,-half,-.25),p(a,-half,-.25),0,link.width/2,a/2,b/2,0x484a4c);
 }
 const resources:(()=>void)[]=[];
 for(const key of ['floor','rock'] as const){
  const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(Float32Array.from(arrays[key]),3));g.setAttribute('uv',new BufferAttribute(Float32Array.from(uvs[key]),2));g.computeVertexNormals();
  const map=makeCampGrain('rock');map.wrapS=map.wrapT=RepeatWrapping;
  g.setAttribute('color',new BufferAttribute(Float32Array.from(colors[key]),3));
  const m=new MeshLambertMaterial({map,vertexColors:true,side:DoubleSide});
  const mesh=new Mesh(g,m);mesh.name='depth-link-'+key;group.add(mesh);
  resources.push(()=>{g.dispose();m.dispose();map.dispose()});
 }
 // Load-bearing timber legs, stone plinths and iron straps share the
 // exact conservative footprint in r30LinkPassage. No floating ribs.
 const braces:{pos:readonly [number,number,number];size:readonly [number,number,number];color:number;family:'wood'|'iron'|'rock'}[]=[];
 const e=(link.end.east-link.start.east)/link.length,n=(link.end.north-link.start.north)/link.length;
 const add=(family:'wood'|'iron'|'rock',t:number,l:number,y:number,w:number,h:number,d:number,color:number)=>braces.push({pos:p(t,l,y),size:[w,h,d],color,family});
 for(const t of r30LinkRibs(link)){
  const h=link.clearance;
  // Embed the flat beam above the sloping roof slightly so its underside
  // never extends below the shared conservative headroom.
  add('wood',t,0,h-.10,link.width,.20,.36,0x70543e);
  for(const s of [-1,1]){
   const l=s*(half-.045);
   add('rock',t,l,.105,.19,.30,.44,0x66615a);
   add('wood',t,l,(h-.24)/2,.15,h-.24,.32,0x70543e);
   for(const y of [.37,1.55,h-.39])add('iron',t,l,y,.19,.105,.40,0x80563d);
   add('iron',t,l,h-.13,.19,.24,.44,0x80563d);
  }
 }
 const box=new BoxGeometry();
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(-n,e)+Math.PI/2);
 const mx=new Matrix4(),color=new Color();
 for(const family of ['wood','iron','rock'] as const){
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map}),parts=braces.filter(b=>b.family===family);
  const batch=new InstancedMesh(box,mat,parts.length);batch.name='depth-link-ribs/'+family;
  parts.forEach((b,i)=>{mx.compose(new Vector3(...b.pos),q,new Vector3(...b.size));batch.setMatrixAt(i,mx);batch.setColorAt(i,color.setHex(b.color))});
  batch.computeBoundingSphere();group.add(batch);resources.push(()=>{batch.dispose();map.dispose();mat.dispose()});
 }
 // Alternating caged signal lanterns attach to the inside of a timber
 // post above standing headroom; the tall-body query shares the envelope.
 // No extra PointLight:
 // the single player light budget remains owned by the existing host.
 const lanternRows:{pos:readonly [number,number,number];size:readonly [number,number,number];color:number;glow:boolean}[]=[];
 const marks:number[]=[];
 const stations=r30LinkLanternStations(link);
 const amber=link.to==='minus165'?0xf9b967:0x87d5dd;
 for(const {along:t,side} of stations){
  const l=side*(half-r30GuideLantern.inset);
  const lamp=(lat:number,y:number,w:number,h:number,d:number,col:number,glow=false,dt=0)=>lanternRows.push({pos:p(t+dt,lat,y),size:[w,h,d],color:col,glow});
  lamp(l,2.30,.19,.07,.30,0x715843);
  lamp(l,2.64,.19,.09,.30,0x715843);
  lamp(l,2.47,.17,.27,.23,amber,true);
  for(const dt of [-.125,.125])lamp(l,2.47,.19,.27,.034,0x4c4035,false,dt);
  lamp(l,2.78,.14,.19,.09,0x806245);
  lamp(side*(half-.13),2.87,.26,.075,.12,0x806245);
  // Paired inlaid chevrons on the actual graded surface. This identifies
  // the connector, not a one-way rule or a new walk surface.
  for(const sign of [-1,1]){
   const base=t+sign*.62,tip=base+sign*.29;
   const strip=(a:number,b:number)=>marks.push(...p(base,a,.004),...p(tip,0,.004),...p(base,b,.004));
   strip(-.43,-.25);strip(.25,.43);
  }
 }
 for(const glow of [false,true]){
  const items=lanternRows.filter(v=>v.glow===glow);
  const map=glow?undefined:makeCampGrain('iron');
  const mat=glow?new MeshBasicMaterial():new MeshLambertMaterial({map});
  const batch=new InstancedMesh(box,mat,items.length);batch.name=glow?'depth-link-lantern-glass':'depth-link-lantern-cages';
  items.forEach((b,i)=>{mx.compose(new Vector3(...b.pos),q,new Vector3(...b.size));batch.setMatrixAt(i,mx);batch.setColorAt(i,color.setHex(b.color))});
  batch.computeBoundingSphere();group.add(batch);resources.push(()=>{batch.dispose();mat.dispose();map?.dispose()});
 }
 const inlay=new BufferGeometry();inlay.setAttribute('position',new BufferAttribute(Float32Array.from(marks),3));inlay.computeVertexNormals();
 const ink=new MeshBasicMaterial({color:link.to==='minus165'?0xa88b58:0x63959d,side:DoubleSide});
 const wayfinding=new Mesh(inlay,ink);wayfinding.name='depth-link-inlaid-wayfinding';group.add(wayfinding);
 resources.push(()=>{inlay.dispose();ink.dispose()});
 group.position.set(link.start.east,link.start.height,-link.start.north);
 parent.add(group);let disposed=false;
 return {kind:'ready',group,link,passageAt:(east:number,north:number,radius=.27,height=1.8)=>disposed?undefined:r30LinkPassage(link,east,north,radius,height),
  ribCount:r30LinkRibs(link).length,parts:braces.length,lanternCount:stations.length,wayfindingCount:stations.length*2,
  dispose(){if(disposed)return;disposed=true;group.removeFromParent();resources.forEach(f=>f());box.dispose();group.clear();}} as const;
}
