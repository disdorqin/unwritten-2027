import {AmbientLight,DirectionalLight,PerspectiveCamera,Scene,WebGLRenderTarget,Vector4,type Object3D,type Mesh,type WebGLRenderer} from 'three';
export type A32WarmupStats={meshes:number;vertices:number;batches:number;maxBatchMs:number;maxBatchVertices:number;maxBatchBytes:number;oversizeMeshes:number};
/** Upload actual geometry/instance buffers before exposing the candidate.
 * No substitute copies, changed resolution, discarded models or fake draws.
 * Each turn renders a bounded number of detached actual objects to a tiny
 * private target. A single oversized mesh / shader compile is indivisible. */
export async function warmA32SummitMeshes(renderer:WebGLRenderer,root:Object3D,yieldFrame:()=>Promise<void>,cancelled:()=>boolean):Promise<A32WarmupStats>{
 const meshes:Mesh[]=[];root.traverse(o=>{if((o as Mesh).isMesh)meshes.push(o as Mesh);});
 const target=new WebGLRenderTarget(1,1),scene=new Scene(),camera=new PerspectiveCamera(60,1,.1,10000);
 camera.position.set(0,800,1200);camera.lookAt(0,350,0);
 scene.add(new AmbientLight('#d6e3f2',1.25),new DirectionalLight('#fff4df',1.7));
 const stats:A32WarmupStats={meshes:0,vertices:0,batches:0,maxBatchMs:0,maxBatchVertices:0,maxBatchBytes:0,oversizeMeshes:0};
 try{
  for(let i=0;i<meshes.length;){
   await yieldFrame();if(cancelled())throw Error('summit warmup cancelled');
   if(renderer.getContext().isContextLost())throw Error('WebGL context lost during summit warmup');
   const previousTarget=renderer.getRenderTarget(),viewport=renderer.getViewport(new Vector4()),scissor=renderer.getScissor(new Vector4()),scissorTest=renderer.getScissorTest();
   const start=performance.now();let vertices=0,count=0,bytes=0;
   try{
    renderer.setRenderTarget(target);renderer.setScissorTest(false);
    while(i<meshes.length){
     const mesh=meshes[i]!,v=mesh.geometry.getAttribute('position')?.count??0;
     const instance=mesh as Mesh&{instanceMatrix?:{array:ArrayBufferView};instanceColor?:{array:ArrayBufferView}};
     const b=Object.values(mesh.geometry.attributes).reduce((s,a)=>s+a.array.byteLength,mesh.geometry.index?.array.byteLength??0)+(instance.instanceMatrix?.array.byteLength??0)+(instance.instanceColor?.array.byteLength??0);
     if(count&&(count>=4||vertices+v>60000||bytes+b>2*1024*1024||performance.now()-start>=3))break;
     if(b>2*1024*1024||v>60000)stats.oversizeMeshes++;
     const parent=mesh.parent;if(!parent){i++;continue;}
     const index=parent.children.indexOf(mesh),visible=mesh.visible,frustum=mesh.frustumCulled;
     try{scene.add(mesh);mesh.visible=true;mesh.frustumCulled=false;renderer.render(scene,camera);}
     finally{parent.add(mesh);const j=parent.children.indexOf(mesh);parent.children.splice(j,1);parent.children.splice(index,0,mesh);mesh.visible=visible;mesh.frustumCulled=frustum;}
     i++;count++;vertices+=v;bytes+=b;stats.meshes++;stats.vertices+=v;
    }
   }finally{
    renderer.setRenderTarget(previousTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
   }
   stats.batches++;stats.maxBatchMs=Math.max(stats.maxBatchMs,performance.now()-start);stats.maxBatchVertices=Math.max(stats.maxBatchVertices,vertices);stats.maxBatchBytes=Math.max(stats.maxBatchBytes,bytes);
  }
  return stats;
 }finally{target.dispose();}
}
