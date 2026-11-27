import {BufferAttribute,BufferGeometry,Camera,Color,Frustum,InstancedMesh,Material,Matrix4,Mesh,MeshLambertMaterial,Object3D,Sphere} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const approved=new Set(['town-fill-north','town-fill-east','town-fill-b1','town-fill-b3','town-fill-b3x','town-fill-b6','town-fill-pinewood']);
type Leaf={mesh:Mesh;geometry:BufferGeometry;material:MeshLambertMaterial;color:Color;mask:number;world:Matrix4;sphere:Sphere;attrs:Record<string,unknown>;versions:number[];index:BufferAttribute;iv:number;tris:number};
type Job={root:Object3D;world:Matrix4;leaves:Leaf[]};
type Batch=Job&{proxy:Mesh};
const reference=new MeshLambertMaterial(),ignored=new Set(['uuid','name','userData','version','color','_listeners']),keys=Object.keys(reference).filter(k=>!ignored.has(k)),keySet=new Set(keys);
function plain(m:MeshLambertMaterial){
 const a=m as unknown as Record<string,unknown>,b=reference as unknown as Record<string,unknown>;
 return Object.getPrototypeOf(m)===MeshLambertMaterial.prototype&&m.onBeforeCompile===Material.prototype.onBeforeCompile&&m.customProgramCacheKey===Material.prototype.customProgramCacheKey&&Object.keys(m).every(k=>ignored.has(k)||keySet.has(k))&&keys.every(k=>{const x=a[k],y=b[k];return x===y||!!x&&!!y&&typeof x==='object'&&typeof (x as {equals?:unknown}).equals==='function'&&(x as {equals:(v:unknown)=>boolean}).equals(y);});
}
const identity=new Matrix4();
function eligible(o:Object3D):o is Mesh<BufferGeometry,MeshLambertMaterial>{
 if(!(o instanceof Mesh)||o instanceof InstancedMesh||o.children.length||o.castShadow||o.receiveShadow||o.renderOrder!==0||!o.frustumCulled||!o.visible||!o.matrix.equals(identity)||o.onBeforeRender!==Object3D.prototype.onBeforeRender||o.onAfterRender!==Object3D.prototype.onAfterRender)return false;
 const g=o.geometry,p=g.getAttribute('position'),m=o.material;
 return m instanceof MeshLambertMaterial&&p instanceof BufferAttribute&&g.index instanceof BufferAttribute&&g.index.count>=3&&g.index.count<=24000&&!g.groups.length&&!g.getAttribute('color')&&g.drawRange.start===0&&g.drawRange.count>=g.index.count&&!Object.keys(g.morphAttributes).length&&Object.values(g.attributes).every(a=>a instanceof BufferAttribute)&&plain(m);
}
function visible(o:Object3D){let p:Object3D|null=o;while(p&&p.visible&&p.renderOrder===0)p=p.parent;return !p;}
export function createCraterPaletteBatches(){
 const jobs:Job[]=[],batches:Batch[]=[],active:Batch[]=[];const material=new MeshLambertMaterial({vertexColors:true}),vp=new Matrix4(),frustum=new Frustum();
 let stats={savedDraws:0,batches:0};
 function restore(){for(const b of active){for(const l of b.leaves)l.mesh.layers.mask=l.mask;b.proxy.layers.mask=0;b.proxy.visible=false;}active.length=0;}
 function dispose(){restore();jobs.length=0;for(const b of batches){b.proxy.removeFromParent();b.proxy.geometry.dispose();}batches.length=0;material.dispose();}
 function register(roots:readonly Object3D[]){
  dispose();const selected=new Set<Object3D>();for(const r of roots){if(approved.has(r.name))selected.add(r);for(const c of r.children)if(approved.has(c.name))selected.add(c);}
  for(const root of selected){root.updateWorldMatrix(true,true);const bins=new Map<string,Leaf[]>();
   for(const m of root.children){if(!eligible(m)||!m.layers.mask||!visible(m))continue;
    const g=m.geometry,i=g.index!;g.computeBoundingSphere();if(!g.boundingSphere)continue;
    const key=[m.layers.mask,Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([n,a])=>n+':'+a.itemSize+':'+a.normalized+':'+a.array.constructor.name).join('|')].join('/');
    const list=bins.get(key)??[];list.push({mesh:m,geometry:g,material:m.material,color:m.material.color.clone(),mask:m.layers.mask,world:m.matrixWorld.clone(),sphere:g.boundingSphere.clone().applyMatrix4(m.matrixWorld),attrs:{...g.attributes},versions:Object.values(g.attributes).map(a=>(a as BufferAttribute).version),index:i,iv:i.version,tris:i.count/3});bins.set(key,list);
   }
   for(const list of bins.values()){let part:Leaf[]=[],tris=0;const flush=()=>{if(part.length>=2)jobs.push({root,world:root.matrixWorld.clone(),leaves:part});part=[];tris=0;};for(const l of list){if(tris+l.tris>12000)flush();part.push(l);tris+=l.tris;}flush();}
  }
 }
 function valid(l:Leaf,root:Object3D){const m=l.mesh,g=l.geometry;return m.parent===root&&eligible(m)&&m.geometry===g&&m.material===l.material&&m.material.color.equals(l.color)&&m.layers.mask===l.mask&&m.matrixWorld.equals(l.world)&&g.index===l.index&&l.index.version===l.iv&&Object.keys(g.attributes).length===Object.keys(l.attrs).length&&Object.entries(l.attrs).every(([n,a])=>g.attributes[n]===a)&&Object.values(g.attributes).every((a,i)=>(a as BufferAttribute).version===l.versions[i]);}
 function warmStep(){const j=jobs.shift();if(!j||!j.root.matrixWorld.equals(j.world)||!j.leaves.every(l=>valid(l,j.root)))return;const parts=j.leaves.map(l=>{const g=l.geometry.clone(),n=g.getAttribute('position').count,colors=new Float32Array(n*3);for(let i=0;i<n;i++)l.color.toArray(colors,i*3);g.setAttribute('color',new BufferAttribute(colors,3));return g;});const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(!g)return;g.computeBoundingSphere();const proxy=new Mesh(g,material);proxy.name='p4-palette-merged';proxy.visible=false;proxy.layers.mask=0;proxy.matrixAutoUpdate=false;proxy.raycast=()=>{};j.root.add(proxy);proxy.updateWorldMatrix(true,false);batches.push({...j,proxy});}
 function begin(camera:Camera){restore();stats={savedDraws:0,batches:0};frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(const b of batches){if(!b.root.matrixWorld.equals(b.world)||!visible(b.root)||!(camera.layers.mask&b.leaves[0].mask)||!b.leaves.every(l=>frustum.intersectsSphere(l.sphere)&&valid(l,b.root)))continue;for(const l of b.leaves)l.mesh.layers.mask=0;b.proxy.layers.mask=b.leaves[0].mask;b.proxy.visible=true;active.push(b);stats.savedDraws+=b.leaves.length-1;stats.batches++;}return stats;
 }
 return {register,warmStep,begin,restore,dispose,get pending(){return jobs.length;},get count(){return batches.length;},get stats(){return stats;}};
}
